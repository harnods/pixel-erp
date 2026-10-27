<!-- Source PRD: https://jurnal.atlassian.net/wiki/spaces/PD/pages/51347456437/ERP+PRD+Percentage-Based+Sales+Delivery
     Confluence page ID: 51347456437 · Space: PD · PRD status: DRAFT / Validation
     Plan written: 2026-10-27 against branch project-accounting-v2 @ 0557346c
     This is an implementation plan for the prototype, not a mirror of the PRD. -->

# Percentage-Based Sales Delivery — implementation plan

Lets a user record a partial delivery as a **percentage of the ordered quantity**
instead of converting it to a count by hand. Percentage is never the posting
basis: it multiplies the sales order line's ordered quantity and writes the
result into the existing quantity field, to six decimals.

```
derived_quantity = sales_order_line.ordered_quantity × (input_value ÷ 100)
```

## Where the prototype stands today

Nothing from the PRD is built. More importantly, **the prerequisite is missing**:

| Today | Needed |
| --- | --- |
| `NewSalesDeliveryPage.vue` columns: Product · Description · Qty ordered · Qty delivered · Unit | a per-line mode control, derived qty, line value, delivered-so-far |
| **Qty ordered renders a literal `-`** — the comment says "from the source sales order (none here)" | the real ordered quantity, per line |
| `Create sales delivery` on `SalesOrdersPage.vue:425` and `SalesOrderDetailsPage.vue:549` pushes to `/sales-deliveries/new` with **no order id** | the order id carried through, lines prefilled |
| `SalesDelivery` (`types.ts:275`) has no `items`, no order reference | lines, an order link, and the delivered-to-date roll-up |
| `salesDeliveryDetails.ts` **synthesises** line items from the delivery total | real lines that trace to an order |

So OD-004 (progress so far) and OD-005 (over-delivery error) are not "UI work on
top of existing data" — the data they read does not exist yet.

## Wave 0 — the order → delivery link (not in the PRD, blocks everything)

The PRD assumes Jurnal's production data model, where a delivery already knows
its sales order. This prototype has no such link, so Wave 0 comes first.

1. **`app/data/types.ts`** — extend `SalesDelivery`:
   - `orderId: string | null` and `items: SDDeliveryLine[]`
   - `SDDeliveryLine = { orderLineIndex, product, sku, description, unit, qty, inputMode, inputValue }`
     where `qty` is the posting basis to 6 dp, `inputMode: 'qty' | 'percent'`,
     `inputValue` the number the user typed (TS-001 lives in these last two).
   - add `'partial'` to `FulfillmentStatus` (currently `in transit | direct | delivered`).
2. **`app/data/salesOrders.ts`** — a `deliveredByLine(orderId)` selector summing
   posted delivery lines per order line; this is the single source for R-02, R-05
   and R-06.
3. **`app/data/salesDeliveries.ts`** — seed a handful of contract-style orders with
   real multi-tranche delivery histories (one at 33% on a 1-lot service line and a
   16-unit product line, mirroring the PRD's worked example; one `Mixed` after a
   return; one at 100%). Keep the existing ~100 generated records as-is.
4. **Both `Create sales delivery` entry points** — pass `?order=<id>`;
   `NewSalesDeliveryPage` prefills every order line and makes Qty ordered real.

Without 1–4, nothing below can be demonstrated.

## Build waves

The PRD's own ordering, adjusted for this prototype. OD-001 is a hard gate.

| Wave | Features | Notes |
| --- | --- | --- |
| 0 | order link + line model | above; blocks all |
| 1 | **OD-001** Percent/Quantity toggle | hard gate |
| 2 | **OD-002** live preview · **OD-003** basis lock · **OD-004** progress so far · **TS-001** audit trail | parallel |
| 3 | **OD-005** over-delivery error · **OD-006** Fill Remaining · **OD-010** edit rules | OD-005/006 need OD-004; OD-010 needs OD-003 + OD-005 |
| — | TS-002 import · TS-003 API · TS-004 decimals downstream | see *Out of scope* |

### Per feature

**OD-001 — per-line input mode** (`NewSalesDeliveryPage.vue`)
`MpSegmentedControl` with Quantity / Percent, per line, Quantity preselected on a
line with no prior delivery. Not a hand-rolled chip pair — `rule/segmented-control-pill`,
and `erp.css` already supplies the ERP pill override (#E2E8F0 / #165082). A new
`Mode` column goes between Qty ordered and Qty delivered; when Percent is active
the Qty delivered cell becomes a percent input with a `%` right addon
(`MpInputRightAddon has-background`, as on the New project form).

**OD-002 — live preview** (S)
Under the percent input, show the derived quantity and the line value as the user
types: `6,400000 unit · Rp160.000.000`. Decimal comma, `formatIdr` for the money
(`rule/format-idr`). Not a tooltip — it must be readable while typing.

**OD-003 — input basis lock** (R-08 → R-10, R-16)
First delivery on a line sets `input_basis`; Percent locks, Quantity does not.
When locked, the Quantity segment is **visibly disabled with a hint naming the
delivery that set the lock** — the PRD is explicit that it is disabled, not hidden.
*This is a deliberate deviation from `rule/btn-no-disabled-validation`*: that rule
governs action buttons and unmet validation, not a mode control whose alternative
is permanently unavailable. Record the deviation in the PR.
Lock release is permissioned + reason-required; reuse the `RejectRequestModal`
shape (required reason, inline error, explicit close) for the release dialog.

**OD-004 — progress so far** (R-05, E-01)
Each line shows delivered-to-date in **both** percent and quantity beside the
increment being typed. Where lines differ, the document header shows `Mixed` —
per-line figures stay visible (E-01 mitigation), never collapsed behind one number.

**OD-005 — over-delivery error** (R-06, R-07, E-02)
Checked on **save**, not on keystroke. The whole document is rejected; the error
names the line and the quantity still available, and **the user's entries are
preserved**. Inline above the footer — `rule/form-errors-inline`. The Save button
stays enabled and clickable (`rule/btn-no-disabled-validation`,
CLAUDE.md › Form & modal actions).

**OD-006 — Fill Remaining** (R-14, E-03)
One action filling every line with its exact remaining quantity, bypassing percent
entry so it can never breach R-06. Place it beside the line-table heading as a
tertiary pill, the same slot as `New expense` on the project Costs tab. Text-only —
`rule/btn-icon-add-only` reserves the `+` icon for create actions.

**OD-010 — edit follows the same rules** (R-17 → R-19)
The edit form reads the locked basis and re-runs the limit check on save. A
delivery in a closed period is not editable and **the option is not offered**.
No warning about later deliveries built on the one being edited — accepted
limitation (E-09), worth a line in the PR so it is not read as an oversight.

**TS-001 — audit trail** (S)
`inputMode` + `inputValue` are stored per line in Wave 0, so this is display work:
`SalesDeliveryDetailsPage.vue` shows, per line, the mode used, the figure typed,
the derived quantity and the new cumulative percentage. Store enough to let the
deferred reconciliation view read from it later.

## Out of scope for the prototype

| PRD item | Why |
| --- | --- |
| TS-002 Delivery import with percent | the prototype has no import pipeline; the Import menu is chrome. Build only if the demo needs it. |
| TS-003 Delivery API with percent | no backend. |
| TS-004 Decimal quantity downstream | **the PRD's highest-risk item** and mostly a backend concern. In the prototype, verify that 6,4 survives display and arithmetic in the invoice, return and stock views without silent rounding — that is the part this repo can actually show. |

Also out of scope per the PRD itself: percentage on proforma / invoice / return /
sales order, amount input, retention, billing plans, a correction document, the
reconciliation view and the residual list.

## Decide before building

1. **Q2 — serial-tracked items.** 6,4 serials cannot be assigned. PRD recommends
   disabling Percent on serial-tracked lines in V1. Needs Engineering's answer;
   in the prototype, seed no serial-tracked contract lines until it is settled.
2. **TQ-01 — tax point.** Unresolved whether a percentage delivery is *penyerahan*
   for PPN. Until the tax team rules, a percentage delivery must behave **exactly
   as a quantity delivery does today** for faktur. Build nothing on an assumption.
3. **E-04 — truncation direction** at the sixth decimal. Pick one and write it down.
4. **Q3 — batch-tracked countable items.** Unresolved.

The PRD is **DRAFT**, status Validation, with no user interviews run and Figma TBD.
Everything here is a prototype of a specification that may still move.

## States to design (`docs/design/reachable-states.md`)

- Order fully delivered → every line 100%, delivery action disabled, empty state
  with illustration + title + caption + secondary CTA (`rule/empty-state-structure`).
- Line locked to Percent → disabled Quantity segment + hint.
- Over-limit on save → inline error naming the line, entries preserved.
- `Mixed` header after a return.
- Closed period → edit not offered.
- Service line at 1 lot → 33% shows `0,330000 lot` (E-06).

## Verification

Follow the two-port workflow: edit on 4321, demo on 4322, rebuild and restart the
preview before handing over. Add specs alongside `tests/` covering the
calculation (the PRD's 40/33/27 → 16,000000 total), R-06 rejection, the lock
transitions (R-08 → R-10, R-16) and Fill Remaining landing exactly on the balance.
