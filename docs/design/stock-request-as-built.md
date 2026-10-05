# Stock Request & WO Material Reservation — as built

What the prototype on `feat/material-reserve` actually does, written so it can be
diffed against **[PRD] Work Order - Material Reservation**, Draft v0.5 on
Confluence (page `51289981861`, space `PD`, status *Need feedback*, last edited
29 Sep 2026). Requirement IDs below (S-x, C-x, D-x, W-x, R-x) are the PRD's own.

**Last reconciled 2 Oct 2026.** Where the build and the PRD disagreed, the build
moved — see §3. The PRD's own "Known implementation gaps" list is now stale in
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
`erp.productionSettings` migrates instead: a saved `componentsMustBeReserved:
false` from the build that carried that toggle maps to **Two-step**, so no tenant
starts auto-allocating stock on upgrade (L-12).

---

## 3. Divergences from the PRD

**None of substance.** The three divergences this document used to carry (D0,
D-S4, D1) were resolved on 2 Oct 2026 **in the PRD's favour** — the code changed,
the PRD stands. They are recorded here only so the history is readable.

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
| **C-4 Subcon clause** | OPEN-18 says a Subcon work order raises a request only when its supply method is Resupply. **Not applicable here:** this build has no subcontracting — work orders carry no supply method and no Subcon type — so there is nothing to gate |
| **OPEN-15** | Numbering is `SR-YYYY-NNNN` with the year taken from the app's current date and the counter continuing from the highest number issued in that year (reset yearly, not gapless). Matches the recommendation; still awaiting PM + EM sign-off |

---

## 4. Built to the PRD

- **S-1…S-4** — method One-step / Two-step; under Two-step every reservation entry
  point on WO surfaces is *hidden* and an info note points to Stock requests.
  Partial consume / partial completion are one `partialMode` union, so they cannot
  both be on. S-4 "start with limited stock" is its own setting and governs the
  start gate only.
- **C-3 / C-4** — saving a WO raises exactly one request; under One-step a line
  auto-reserves only when the destination covers it in FULL, and the toast says
  which case applied: reserved, or sent to the stockist. Idempotent. Reservation
  cannot be switched off, so every work order raises a request.
- **The WO's Needed qty follows the request.** After an Adjust the work order needs
  more (worked example: "the WO now needs 24 + 8 = 32 MDF"), so while a request
  exists the WO's Needed qty is its live line total — cost, the completion check
  and the Reserved / Consumed denominators follow. Rejected lines are left out
  because the warehouse declined them; they are flagged on the WO instead (W-7).
- **UC-04 / D-8** — the PRD's four-row table, in `startGate()`:

  | S-4 | Partial mode | Start permitted when |
  | --- | --- | --- |
  | off | any | every component fully reserved |
  | on | partial consume | at least one component reserved > 0 |
  | on | partial completion | every component reserved > 0 |
  | on | neither | every component fully reserved (S-4 has no effect) |

  It counts reservation, never availability: free stock does not open the gate.
  The only free pass is a work order with no request at all.
- **UC-06 (Adjust half)** — Adjust puts an increase on a new Adjustment-tagged line
  carrying only the delta with its own request date, reduces Adjustment-first on a
  decrease, and makes the adjusting user that line's requestor. The form requires a
  reason and a per-line request date of today or later.
- **UC-06 (Edit half)** — `EditWorkOrderMaterialsModal`, reachable from the Edit
  action on a not-started work order. Updates the existing line IN PLACE, makes
  the editor its requestor, refuses to remove a component (min 1), and blocks a
  cut below the reserved qty inline with "unreserve first" rather than releasing
  — before start, unreserve is a deliberate action the user can take, which is
  exactly why Adjust releases and Edit refuses to. An increase goes back through
  auto-reserve under One-step. The warehouse is notified of any qty change.
  Scope: MATERIAL demand only, which is what UC-06 governs — see §5.
- **D-7 Request additional stock** — `RequestAdditionalStockModal`, on the WO
  Actions menu (not the Reservation menu: asking for material is demand, not
  reservation, so it stays available under Two-step). Qty, its own request date
  and a mandatory reason; lines append to the work order's existing request
  tagged `additional`, and the stockist can decline them (W-7).
- **UC-03 / D-6** — Unreserve from the Reservation menu only while Not started;
  after start it is reachable only inside Adjust. Full remaining qty per selected
  component, never partial (R-8). Mandatory disposition, optional reason.
- **UC-09** — Delete allowed Not started or Completed, refused In progress with the
  message naming Cancel. Cancel takes a mandatory reason; both release reservations
  and leave the request as Canceled. The confirmation names qty released and qty
  restored (R-6).
- **UC-15** — one `releaseReservation` transition behind all three triggers:
  completion with leftover (automatic, unapproved), cancel/delete, manual
  unreserve. Partial completion leaves the remaining reserve reserved.
- **Tabs** — **Awaiting** (W-4: not fully reserved, on a request that is neither
  rejected nor canceled) and **Rejected / canceled** (the two terminal statuses of
  W-3). Because the terminal states are a tab, they are no longer offered in the
  Status filter — a filter that could only ever empty the Awaiting tab.
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

tests/wo-start-gate.spec.ts                UC-04's four rows
tests/reservation-release.spec.ts          UC-15 triggers, R-8, dispositions
tests/stock-request-lifecycle.spec.ts      W-3, UC-06, the PRD's worked example
tests/stock-request-dashboard.spec.ts      W-2/W-4/W-7 rollup and tab rules
```
