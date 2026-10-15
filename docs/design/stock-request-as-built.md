# Stock Request & WO Material Reservation — as built

What the prototype on `feat/material-reserve` actually does, written so it can be
diffed against **[PRD] Work Order - Material Reservation**, Draft v0.5 on
Confluence (page `51289981861`, space `PD`, status *Need feedback*, last edited
29 Sep 2026). Requirement IDs below (S-x, C-x, D-x, W-x, R-x) are the PRD's own.

**Last reconciled 14 Oct 2026**, against the PRD revision of **12 Oct** (page now
titled *[PRD] Work Order: Material Reservation*). That revision changed UC-00,
C-1, UC-03 and UC-06 and deleted L-12; the build followed — see §3, "Resolved
14 Oct". Earlier reconciliations (2 Oct) are kept below for history. The PRD's own "Known implementation gaps" list is now stale in
two respects: reserve and unreserve DO write activity-log entries, and the UC-04
start-gate rules ARE built.

v0.5 is the authority. It supersedes both PRD v0.4 and the Confluence draft
*[PRD] INV — Stock Request Dashboard*, and it names this branch as its reference
implementation.

Sources this was built from:
- PRD v0.5 (UC-00, UC-01–UC-06, UC-09, UC-11, UC-15)
- Figma *Warehouse — Stock Request* and *Production Material Requisition &
  Reservation* — **stale, see §3**

---

## 1. Surfaces

| Surface | Route / component | Notes |
| --- | --- | --- |
| Stock requests index | `/stock-requests` | Tabs **Awaiting** (default) / **Rejected / canceled**; views By product / By transaction, as a segmented control |
| Stock request detail | `/stock-requests/:requestId` | Exactly one detail page, grouped by destination warehouse |
| Production settings | `/production-settings` | Settings › Production |
| WO detail | `/work-orders/:id` | Reservation menu, readiness badge, Reserved/Consumed columns |
| Adjust work order | `AdjustWorkOrderModal.vue` | UC-06, In progress only |
| Edit work order materials | `EditWorkOrderMaterialsModal.vue` | UC-06, Not started only |
| Request additional stock | `RequestAdditionalStockModal.vue` | D-7, from the WO Actions menu |
| Cancel work order | `CancelWorkOrderModal.vue` | UC-09, once started |
| Activity log | `ActivityLogModal.vue` | On both detail pages, from the provenance line |

---

## 2. Data model

`app/data/stockRequests.ts`.

**One request per work order, for its whole life** (C-4). Extra demand appends
LINES; a second request is never raised. A component may therefore hold several
lines on one request — an original plus Adjustment deltas.

Per LINE (v0.5 moved all three off the request):
- `requestor` — who last CHANGED that line's demand (OPEN-17). Reserving does not
  change it.
- `tag` — `additional` | `adjustment` (W-7). Only a tagged line can be rejected.
- `rejected` — the stockist's decision, enforced in the mutator, not just the UI.

Two drain orders, deliberately opposite and deliberately separate functions:
- `drawdownOrder` — **original line first**. Used by consumption and release:
  material issued satisfies what the work order originally committed to before a
  later top-up.
- `reductionOrder` — **Adjustment line first**. Used when demand falls: give up the
  most recent extra before touching committed demand, and keep the rejectable line
  rejectable.

Everything derived, never stored: status, readiness, overdue, remaining,
to-transfer. Request status = the **lowest** among its lines (W-3).

The localStorage snapshot key is **versioned** (`stockRequests.v2`). A pre-v0.5
snapshot cannot be read as a v0.5 request — its lines have no requestor, and its
extra requests would return as duplicates — so it is dropped rather than guessed at.
`erp.productionSettings` migrates instead: `componentsMustBeReserved` is a live
setting again and passes through as saved (a tenant who ran the L-12 build comes
back ON, the default, with the method they had); the removed S-4 field
`allowStartWithLimitedStock` is dropped.

---

## 3. Divergences from the PRD

**None of substance.** The three divergences this document used to carry (D0,
D-S4, D1) were resolved on 2 Oct 2026 **in the PRD's favour** — the code changed,
the PRD stands. They are recorded here only so the history is readable.

### Resolved 14 Oct — the PRD revision of 12 Oct

Diffed word-by-word against the version built on 2 Oct; five changes reach the code.

| PRD change | Build now |
| --- | --- |
| **UC-00** — "There is a toggle to disable / enable the reservation"; **L-12 deleted** | The **"Product components must be reserved"** toggle is back (default on). Off: saving a work order raises no stock request; the WO shows no readiness badge, Reserved qty, Reservation menu, batch/rejection notes, Adjust, Edit materials or Request additional stock (all of those act on the request); the start gate lifts. Requests already raised stay on the dashboard |
| **UC-00 S-4** — "not introduced as a separate toggle"; uses the partial consume / completion setting | **S-4 removed.** `startGate()` follows the partial mode alone (§4). The settings page spells out the start rule for the current mode |
| **UC-01 C-1** — request date "cannot be earlier than the planned start … cannot be later than the planned finish" | New work order: rows default to the **plan start** and follow it when the plan moves; days outside the plan are greyed out in the picker; Save names any row still outside, inline (`~/utils/planWindow`) |
| **UC-03** — disposition removed ("Tickbox per product; Reason optional") | Unreserve asks only for the components and an optional reason; released stock **always returns to available warehouse stock**. The production-defect path is gone from the data layer too. Old log entries that say "Disposition" still render (the key is kept) |
| **UC-06 table** — WO Edit: "System will unreserve remaining reserved qty", then update in place | Edit **auto-unreserves**: any qty change (up or down) on a reserved component releases its full remaining reservation, updates the line in place, and under One-step re-reserves on the same save (all-or-nothing). The modal warns before saving; the "unreserve first" block and `blockedByReservation` are gone. A date-only change releases nothing |

**Where the revision contradicts itself, and what the build follows** (product
owner's call, 12 Oct):

| PRD says | …but also says | Build follows |
| --- | --- | --- |
| UC-02: the WO Reservation button opens **Reserve only**; "Unreserve is handled from the Stock requests area" | UC-03 table: Not-started unreserve via the **Reservation menu on WO detail** | **UC-03** — Unreserve stays in the WO Reservation menu while Not started (and on the stock request detail) |
| UC-06 table: Edit **auto-unreserves** | UC-06 notes: Edit is **blocked** with "unreserve first" | **The table** — auto-unreserve |
| UC-03: Unreserve "is **locked** once the WO has started" (the Adjust row was deleted) | UC-06 notes / R-4: a cut below reserved **unreserves inside the Adjust modal** | **UC-06 / R-4** — Adjust keeps releasing |
| Worked example step 2: after the Edit, MDF is "reserved 20 · Partially reserved" | UC-06 table: the Edit releases MDF's reservation first | **The table** — under One-step with 20 free, MDF 24 re-reserves all-or-nothing and waits as Requested |
| Key Concepts: One step reserves "by available qty" | S-1 / C-3: "only lines fully covered" | **S-1 / C-3** — all-or-nothing (unchanged since 2 Oct) |

**Consequence worth a PRD note:** under One-step, *raising* the qty of a fully
reserved line whose new total the warehouse can't cover in full now drops it to
Requested — the reservation is released and the all-or-nothing re-reserve fails.
That is the literal reading of the new table.

The Figma *Production Material Requisition & Reservation* is **no longer stale on
the toggle** — it draws it, and the build has it again. It still does not draw S-4,
which is now correct.

### Resolved 2 Oct — the build moved to the PRD

| Was | Now |
| --- | --- |
| **D0a** — one-step auto-reserve by available qty (a line reserved what the warehouse had) | **All-or-nothing per line** (C-3, OPEN-12). A line reserves only when the destination covers what is outstanding on it in full; a partly covered line stays Requested for the stockist. The manual Reserve modal still reserves partially, because there a person is choosing to take what is there — UC-02 is explicitly per-line partial |
| **D0b** — a "Product components must be reserved" master toggle, as the Figma draws it | **Removed** (L-12). Reservation is structural; the method is the only choice. A tenant who had it OFF migrates to Two-step, so nothing auto-allocates on upgrade |
| **D-S4** — no "start with limited stock" setting; the partial toggles decided the gate | **S-4 is a setting again**, separate from the partial toggles, and `startGate()` follows the PRD's four-row table (see §4) |
| **D1** — the Requested tab filtered on the raising work order's STATUS | **Filters on "not fully reserved"** (W-4). A row leaves the tab when reserved + consumed reaches required; free stock at the destination does not settle it |

The Figma *Production Material Requisition & Reservation* is **stale**: it still
draws the removed "Komponen produk harus direservasi" toggle, and does not draw
S-4.

### Still open

| # | Item |
| --- | --- |
| **W-6 fixture** | The backdate-negative flag is a hardcoded seed entry (`backdateRecalc`, product `p03` / SA-0231), not a figure derived from a recalculation. The flag's *behaviour* is real — a negative Available renders red with the note — but the negative itself is staged. Deriving it needs a stock-ledger recalculation this prototype does not have |
| **OPEN-15** | Numbering is `SR-YYYY-NNNN` with the year taken from the app's current date and the counter continuing from the highest number issued in that year (reset yearly, not gapless). Matches the recommendation; still awaiting PM + EM sign-off |

---

## 4. Built to the PRD

- **UC-00, S-1…S-3** — the reservation toggle; method One-step / Two-step; under
  Two-step every reservation entry point on WO surfaces is *hidden* and an info
  note points to Stock requests. Partial consume / partial completion are one
  `partialMode` union, so they cannot both be on, and they decide the start gate.
  No separate S-4 setting.
- **C-3 / C-4** — saving a WO raises exactly one request; under One-step a line
  auto-reserves only when the destination covers it in FULL, and the toast says
  which case applied: reserved, or sent to the stockist. Idempotent. No request
  at all while reservation is switched off.
- **C-1** — each raw-material row's request date stays inside the production plan
  window (see §3).
- **The WO's Needed qty follows the request.** After an Adjust the work order needs
  more (worked example: "the WO now needs 24 + 8 = 32 MDF"), so while a request
  exists the WO's Needed qty is its live line total — cost, the completion check
  and the Reserved / Consumed denominators follow. Rejected lines are left out
  because the warehouse declined them; they are flagged on the WO instead (W-7).
- **UC-04 / D-8** — `startGate()`, decided by the partial mode alone:

  | Partial mode | Start permitted when |
  | --- | --- |
  | partial consume | at least one component reserved > 0 |
  | partial completion | every component reserved > 0 |
  | neither | every component fully reserved |

  It counts reservation, never availability: free stock does not open the gate.
  Free passes: reservation switched off, or a work order with no request at all.
- **UC-06 (Adjust half)** — Adjust puts an increase on a new Adjustment-tagged line
  carrying only the delta with its own request date, reduces Adjustment-first on a
  decrease, and makes the adjusting user that line's requestor. The form requires a
  reason and a per-line request date of today or later.
- **UC-06 (Edit half)** — `EditWorkOrderMaterialsModal`, reachable from the Edit
  action on a not-started work order. Updates the existing line IN PLACE, makes
  the editor its requestor, refuses to remove a component (min 1), and — since
  12 Oct — **auto-unreserves**: a qty change on a reserved component releases its
  full remaining reservation, then the line goes back through the method
  (One-step re-reserves all-or-nothing on the same save). The modal warns before
  saving. The warehouse is notified of any qty change.
  Scope: MATERIAL demand only, which is what UC-06 governs — see §5.
- **D-7 Request additional stock** — `RequestAdditionalStockModal`, on the WO
  Actions menu (not the Reservation menu: asking for material is demand, not
  reservation, so it stays available under Two-step). Qty, its own request date
  and a mandatory reason; lines append to the work order's existing request
  tagged `additional`, and the stockist can decline them (W-7).
- **UC-03 / D-6** — Unreserve from the Reservation menu only while Not started;
  after start it is reachable only inside Adjust. Full remaining qty per selected
  component, never partial (R-8). No disposition — released stock returns to the
  warehouse — and an optional reason.
- **UC-09** — Delete allowed Not started or Completed, refused In progress with the
  message naming Cancel. Cancel takes a mandatory reason; both release reservations
  and leave the request as Canceled. The confirmation names qty released and qty
  restored (R-6).
- **UC-15** — one `releaseReservation` transition behind all three triggers:
  completion with leftover (automatic, unapproved), cancel/delete, manual
  unreserve. Partial completion leaves the remaining reserve reserved.
- **Tabs** — **Awaiting** (W-4: not fully reserved, on a request that is neither
  rejected nor canceled) and **Rejected / canceled** (the terminal states of W-3).
  The terminal tab hides the Status filter and the All-filters drawer, and clears
  anything already set through them: the tab IS a status filter, and the drawer
  only adds status and keyword on top of it.

  Membership is derived status alone. `rejected` outranks the fulfilled states in
  `STATUS_RANK`, so a request whose own demand is settled and whose extra line the
  stockist declined derives `rejected` by itself; one whose demand is still open
  derives the lower status and stays in Awaiting, where the work is.
- **W-1…W-10** — both views; product rows are one per SKU **per destination
  warehouse** so availability is never summed across warehouses; W-2's column set
  behind a column menu; derived statuses incl. Rejected and Canceled; overdue;
  backdate flag; line tags and per-line rejection, with rejected lines also flagged
  on the work order (W-7); SR-YYYY-NNNN numbering;
  warehouse grouping with a transfer per destination.
- **Audit log** — written in the DATA LAYER (`stockRequests.ts`), not by the page
  that triggered the action, so the Two-step path logs too: PPIC reserve,
  unreserve and reject on the dashboard and the request detail all write entries,
  as do auto-reserve, all three release triggers, edit, adjust and cancel. Every
  entry names its Source (work order page / stock request / automatic) and every
  release names its Trigger as a field, not as a turn of phrase (R-7). Entries are
  stored in English and translated on read, so the trail does not freeze into
  whichever language the actor had selected.
- **Notifications (L-11, in-app half)** — `pushNotification()` raises an inbox
  entry, persisted so it survives a reload. Used for: a qty change reaching the
  warehouse (UC-06), additional stock requested (D-7), and a release by somebody
  other than the work order's owner (R-9). Email is out of the prototype's reach.

---

## 5. Not implemented

| Area | Status |
| --- | --- |
| **Project MTO** (project stock, hard peg, batch costing) | Out of scope — separate PRD, ships later as an overlay |
| **WO edit beyond materials** | The Edit action opens a MATERIALS modal (UC-06's subject). The rest of the work order form — dates, qty, attachments, routing — is still not editable: `CreateWorkOrderPage` serves `/work-orders/new` only and has no edit mode. Building one is a larger piece of work than the reservation scope |
| **UC-05 / UC-07 / UC-08 / UC-10** end-to-end verification | The consumption hook draws reservation down and a return reverses it, but the full pick/issue and goods-receipt paths are unverified against v0.5 (**OPEN-30**) |
| Email notifications | Not built — the in-app half exists (see §4); email is out of the prototype's reach (L-11) |
| Notification on stockist REJECTION | Not built — rejection is logged and flagged on the work order, but production is not pinged (W-7) |
| RBAC per role (Production / PPIC / Manager production) | Not built — single demo user |
| Mixpanel / Lou tracking (story 19) | Not built |

---

## 6. Where the code lives

Branch `feat/material-reserve` on `harnods/pixel-erp`.

```
app/data/stockRequests.ts              model, derivations, reserve/release, UC-06
app/data/productionSettings.ts         UC-00 settings + legacy migration
app/data/activityLog.ts                append-only audit store
app/components/pages/StockRequestsPage.vue         index
app/components/pages/StockRequestDetailsPage.vue   detail
app/components/pages/ProductionSettingsPage.vue    settings
app/components/patterns/ReserveMaterialsModal.vue      D-5
app/components/patterns/UnreserveMaterialsModal.vue    D-6
app/components/patterns/AdjustWorkOrderModal.vue       UC-06 (In progress)
app/components/patterns/EditWorkOrderMaterialsModal.vue UC-06 (Not started)
app/components/patterns/RequestAdditionalStockModal.vue D-7
app/components/patterns/CancelWorkOrderModal.vue       UC-09 / R-6
app/components/patterns/StockRequestFiltersDrawer.vue  all-filters
app/components/pages/WorkOrderDetailsPage.vue      reservation, gate, adjust, cancel
app/components/pages/CreateWorkOrderPage.vue       C-3 / C-4 on save
app/data/notifications.ts                         in-app notifications (L-11)

tests/wo-start-gate.spec.ts                UC-04 by partial mode, toggle off
tests/reservation-release.spec.ts          UC-15 triggers, R-8, no disposition
tests/wo-reservation-toggle-and-c1.spec.ts UC-00 toggle, C-1 plan window
tests/stock-request-lifecycle.spec.ts      W-3, UC-06, the PRD's worked example
tests/stock-request-dashboard.spec.ts      W-2/W-4/W-7 rollup and tab rules
```
