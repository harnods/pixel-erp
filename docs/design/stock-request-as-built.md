# Stock Request & WO Material Reservation — as built

What the prototype on `feat/material-reserve` actually does, written so it can be
diffed against **[PRD] Work Order: Material Reservation** on Confluence (page
`51289981861`, space `PD`, status *Need feedback*). Requirement IDs below
(S-x, C-x, D-x, W-x, R-x) are the PRD's own.

**Last reconciled 4 Nov 2026, against Draft v0.6 — see §8.** Where v0.6 and the
sections below disagree, §8 wins; the older sections are kept as history.

**Reconciled 14 Oct 2026**, against the PRD revision of **12 Oct** (page now
titled *[PRD] Work Order: Material Reservation*). That revision changed UC-00,
C-1, UC-03 and UC-06 and deleted L-12; the build followed — see §3, "Resolved
14 Oct". Earlier reconciliations (2 Oct) are kept below for history. The PRD's own "Known implementation gaps" list is now stale in
two respects: reserve and unreserve DO write activity-log entries, and the UC-04
start-gate rules ARE built.
**Last reconciled 15 Oct 2026, against page version 13 (edited 13 Oct 2026).**
The page still labels itself Draft v0.5 and its Document History still ends at
25 Sep, but the body has been edited five times since — see §7 for what moved and
what it means for this build. Where the build and the PRD disagreed earlier, the
build moved — see §3.

v0.5 is the authority. It supersedes both PRD v0.4 and the Confluence draft
*[PRD] INV — Stock Request Dashboard*, and it names this branch as its reference
implementation.

Sources this was built from:
- PRD v0.5 (UC-00, UC-01–UC-06, UC-09, UC-11), read at page version 7
- Figma *Warehouse — Stock Request* and *Production Material Requisition &
  Reservation* — **stale, see §3**

---

## 1. Surfaces

| Surface | Route / component | Notes |
| --- | --- | --- |
| Stock requests index | `/stock-requests` | Tabs **Awaiting** (default) / **Closed**; views **By transaction** (default) / By product, as a segmented control |
| Stock request detail | `/stock-requests/:requestId` | Exactly one detail page, grouped by destination warehouse |
| Production settings | `/production-settings` | Settings › Production |
| WO detail | `/work-orders/:id` | Reservation menu, readiness badge, Reserved/Consumed columns |
| Adjust work order | `AdjustWorkOrderModal.vue` | UC-06, In progress only |
| Edit work order materials | `EditWorkOrderMaterialsModal.vue` | UC-06, Not started only |
| Request additional stock | `RequestAdditionalStockModal.vue` | D-7, from the WO Actions menu |
| Cancel/close work order | `WoTransactionModal.vue` (approval branch) | UC-09; approval-aware; releases the reservation via `cancelWorkOrder()` |
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

### Merged 15 Oct — feature/work-order-approval

The approval branch was built without stock requests, and both branches had built
their own Adjust and Cancel. Product owner's calls on merging them:

| Area | Result |
| --- | --- |
| **Adjust** | Both kept as separate actions: approval's **Adjust work order** (planned output qty, approval-aware) and material-reserve's UC-06 Adjust, renamed **Adjust materials**. Both hide while an approval request is pending |
| **Cancel** | Approval's **Cancel/close work order** is the only cancel. It now releases the stock-request reservation and logs it (UC-11 trigger b) through `cancelWorkOrder()` in `woApproval.ts` — on the page when not gated, and at final approval when it is. The R-6 "qty released / restored" confirmation and `CancelWorkOrderModal` are retired |
| **Start** | The reservation gate (UC-04) runs FIRST; only a work order that may start goes to the approval transaction |
| **Completion** | An approved completion also returns leftover reservation to available stock (R-3), same as a direct one |
| **Delete** | UC-09: Not started or Completed; refused In progress; Canceled shows Print only |
| **Reservation timing** | Both kept: One-step still auto-reserves stock-request lines at creation (C-3); the WO's own batch/serial picks wait in approval's `reservationPlan` until start. Worth reconciling in the two PRDs |

Translation duplicates from the approval branch (`Planned qty`, `Request no.`,
`Work order canceled`, and three identical ones) were dropped so the existing
values stay; the three that differed are a copy decision still open.

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
- **UC-11** — one `releaseReservation` transition behind all three triggers:
  completion with leftover (automatic, unapproved), cancel/delete, manual
  unreserve. Partial completion leaves the remaining reserve reserved.
- **Tabs** — **Awaiting** (W-4: not fully reserved, on a request that is neither
  rejected nor canceled) and **Closed** (the terminal states of W-3).
  The terminal tab hides the All-filters drawer and clears anything already set
  through it: the tab IS a status filter, and the drawer only adds status and
  keyword on top of it.
- **Filter bar** — Product (multi-select) · Destination warehouse · Request date ·
  All filters. The drawer repeats all three next to its own Keywords and Status,
  bound to the same state, so the two surfaces cannot disagree; its badge counts
  every filter. When the bar runs out of width the LEFT group wraps — when the
  right group wrapped, the icon tools detached above the search and read as a
  bug. The two axes a stockist works along are what they are sourcing and
  where it is wanted. There is no Status pill: Awaiting and Closed already are the
  status split, so one could only narrow a tab to part of itself. Multi-select is
  `ErpFilterSelect`'s own `multiple` mode, not a second component.

  Membership is derived status alone. `rejected` outranks the fulfilled states in
  `STATUS_RANK`, so a request whose own demand is settled and whose extra line the
  stockist declined derives `rejected` by itself; one whose demand is still open
  derives the lower status and stays in Awaiting, where the work is.
- **Columns** — both views lead with identity, then Status · Destination
  warehouse, then the qty block in one order: Available · Required · Reserved ·
  Remaining · Unit. By transaction sums each figure across the request's lines;
  its Unit is blank when the lines disagree, since no one unit is true then.
  Neither view carries Request type.
- **View parity** — the two views are one data set seen two ways; picking one
  changes what a row IS, never which requests are in scope. Settled lines are
  excluded from the product rollup so they cannot inflate Awaiting, which is
  wrong on Closed — a tab made OF settled requests — so `skuDemandGroups` takes
  an `includeSettled` flag that the page sets there. Held by a test.
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
app/components/patterns/StockRequestFiltersDrawer.vue  all-filters
app/components/pages/WorkOrderDetailsPage.vue      reservation, gate, adjust, cancel
app/components/pages/CreateWorkOrderPage.vue       C-3 / C-4 on save
app/data/notifications.ts                         in-app notifications (L-11)

tests/wo-start-gate.spec.ts                UC-04 by partial mode, toggle off
tests/reservation-release.spec.ts          UC-11 triggers, R-8, no disposition
tests/wo-reservation-toggle-and-c1.spec.ts UC-00 toggle, C-1 plan window
tests/wo-start-gate.spec.ts                UC-04's four rows
tests/reservation-release.spec.ts          UC-11 triggers, R-8, dispositions
tests/stock-request-lifecycle.spec.ts      W-3, UC-06, the PRD's worked example
tests/stock-request-dashboard.spec.ts      W-2/W-4/W-7 rollup and tab rules
```

---

## 7. Reconciliation with page version 13 (13 Oct 2026)

The PRD was edited five times between 9 and 13 Oct, after this branch was built.
The version table was not updated, so the page still presents itself as v0.5 of
25 Sep. This section records the delta so the next reader does not have to diff
it again.

### 7.1 Confirmed — the build already matches

| Area | Confirmation in v13 |
| --- | --- |
| UC-04 start gate | The four-row table is unchanged, word for word |
| All-or-nothing auto-reserve (C-3) | OPEN-12 resolved in its favour: "All-or-nothing per line retained and validated in the prototype" |
| `Partially reserved` line status | Confirmed by the worked example — an Edit raising qty above a fully reserved line yields it |
| Adjust below reserved | Confirmed: unreserve happens inside the Adjust modal, full remaining qty, and the updated line is re-sent to the request |
| Edit below reserved | Confirmed: "Qty cannot go below the already-reserved amount" on the Not-started path |
| SR numbering | OPEN-15's recommendation (SR-YYYY-NNNN, per tenant, reset yearly) is what this branch issues |
| Adjustment delta lines | Kept by UC-06's notes, the worked example (L5 is tagged `Adjustment`) and the user stories |

### 7.2 Renumbering — applied to this branch

Release moved from **UC-15 to UC-11**, and v13 has no UC section for the stock
requests dashboard at all (the old UC-11). Every citation in the code, the tests
and this document was remapped on 15 Oct: old UC-15 → UC-11, and old UC-11 → a
plain reference to the dashboard and its W-ids, which no longer hang off a UC.

### 7.3 The dashboard spec has been deleted

v13 no longer contains the **W-1 … W-10 requirement table**. Scope still promises
"a Stock Requests dashboard aggregated by product or by transaction", and W-2,
W-3, W-6, W-7, W-9 and W-10 are still cited from other sections — but nothing in
the page defines them any more.

Until the PM restores it, **§1–§5 of this document are the only written spec for
the largest surface on this branch.** Treat it accordingly: it is the artefact to
paste back into Confluence, not a secondary record.

### 7.4 Four contradictions — not built, awaiting a ruling

> **Superseded on this branch (merged 26 Oct).** §7.4 was written against the
> branch as it stood on 15 Oct. The 12 Oct alignment, merged in on 26 Oct, has
> since ruled on S-4 (removed — the gate follows the partial mode), the
> reservation toggle (restored) and UC-06 Edit (auto-unreserve). See "Resolved
> 14 Oct" in §3. The "Branch today" column below is kept as the record of the
> question, not the current state.

In each case v13 contradicts itself, and this branch matches the older half. No
code was changed for any of them.

| # | v13 says | …but v13 also says | Branch today |
| --- | --- | --- | --- |
| S-4 | The start gate should use the existing partial consume / completion setting, not a new toggle | UC-04 still keys the gate off "unless S-4 is on" as its own condition | Separate `allowStartWithLimitedStock` toggle, gate per UC-04 |
| Reservation on/off | UC-00: "There is a toggle to disable / enable the reservation of work order" | User story 1: "There is no setting to disable reservation itself" | `reservationEnabled()` is hardcoded true (L-12) |
| D-4 menu | UC-02: the Reservation button "opens the Reserve action only" | The user story: "it offers Reserve and Unreserve only" | Reserve + Unreserve, Unreserve gated to Not started |
| UC-06 | The table now reads "unreserve remaining reserved qty / existing line updated in place" for every qty change, both phases — which would delete Adjustment delta lines | Its own notes, worked example and user stories all keep delta lines | Delta lines kept |

A fifth, smaller item: S-1 gained the qualifier that Production may reserve from
the WO page *"if the product(s) have availability quantity"*. The branch does not
gate the entry point on availability; if that is intended it becomes an inline
message, never a disabled button (`rule/btn-no-disabled`).

### 7.5 OPEN-30 — answered

> *Are UC-05 to UC-09 outside the scope of branch `feat/material-reserve`, or in
> scope but not yet built?*

The PRD notes this is "a fact from the team, not a design choice" and asks for it
to be stated explicitly. As built on this branch:

| UC | State on `feat/material-reserve` |
| --- | --- |
| UC-05 — Material issue / consumption | **Built, minus the ledger.** A Consume / return records section on WO detail lists numbered records with product, date, qty, memo and recorder, filterable by type, with "New record" to add one and batch/serial links on tracked materials (`materialConsumeReturn.ts`). Consumption draws the reservation down and is written back to the request line. No journal is posted — the prototype posts none anywhere |
| UC-06 — WO Edit & Adjust | **Built.** Both modals, Adjustment delta lines, requestor reassignment, the below-reserved rule on each path, and warehouse notification |
| UC-07 — Output / partial completion | **Built, minus the ledger.** `partially produced` and `partially completed` statuses, Main output and Other outputs tables with cost allocation, and a Complete work order flow that auto-consumes the remaining qty before closing. No COGM journal |
| UC-08 — Material return | **Built, minus the ledger.** Return is the second record type in the same Consume / return section, seeded and creatable. No Dr Inventory Cr WIP posting |
| UC-09 — WO Cancel & Delete | **Cancel built** — reason, automatic release, stock-adjustment deletion, request left `Canceled`. **Delete not built** |

So all five are present as UI and state; what none of them do is post to a
ledger, because this prototype has no journal layer at all. The only outright
absence is WO **Delete**. None of the five was descoped by anyone.

---

## 8. Reconciled with Draft v0.6 (4 Nov 2026)

v0.6 (Document History: "reservation made optional … a cancelled WO can be
deleted") names this branch as its reference implementation. Every v0.6 change,
and how the build now does it:

| v0.6 | Build (4 Nov) | Where |
| --- | --- | --- |
| **S-0** — reservation optional, **default off**, forward only | `componentsMustBeReserved` defaults to `false`. Each work order captures `{ on, method }` at creation (`WorkOrder.reservation`) and every surface reads it through `woReservation()`, never the live setting. Seeded work orders predate the capture and read as *on, One-step*. Settings shows a forward-only note | `productionSettings.ts`, `CreateWorkOrderPage.vue`, `ProductionSettingsPage.vue` |
| **C-3** — One-step reserves **up to the qty available** | `settleLines` takes `reservableQty` per line: Reserved / Partially reserved / Requested. The create toast names all three cases | `stockRequests.ts` |
| **UC-06** — Edit **and** Adjust update the line in place | `applyDemandChanges` is one rule for both phases: any qty change on a reserved component releases its full remaining reservation (R-4, R-8), updates the line in place with the form's date and the user as requestor, then re-reserves through the method. A new product adds a line (`newLine`). No Adjustment lines | `stockRequests.ts`, `AdjustWorkOrderModal.vue` |
| **L-12** — no stockist rejection | Removed: `rejected`, line `tag`s, `rejectRequestLine`, the Reject / Reject added lines / Reject request actions, the rejected notice on WO detail, the `rejected` line status. Snapshot key bumped to `stockRequests.v5` | `stockRequests.ts`, `StockRequestDetailsPage.vue`, `StockRequestsPage.vue` |
| (implied) — no *Request additional stock* | Removed (PM ruling, 4 Nov): P-2 makes Adjust the route to more material | `WorkOrderDetailsPage.vue` |
| **UC-04** — reservation off → "the start gate checks stock on hand only" | Same partial-mode table, counting on hand at each component's warehouse (`onHandAt`) — PM ruling, 4 Nov | `startGate` |
| **P-1 … P-5** — consume limit and forms | Each line consumes / returns at its **own destination warehouse** (PM ruling) — the record-level picker is gone. Consume: On hand · Needed · Reserved · Consumed; the limit min(remaining reserved, on hand) — on hand with S-0 off — is not a column, but qty above it is refused with an inline error naming it. Return: Needed · Reserved · Consumed · Max returnable, plus "Returned qty goes to available stock". A tracked line's batch / serial pre-fill is capped at the limit | `NewMaterialRecordPage.vue` |
| **UC-08** — a return goes to available, not back to the reservation | Superseded 2026-11-06 (QA feedback): a Return now lowers the request line's Consumed to the work order's net and adds the qty to Available (`applyReturn`), so the two pages agree. Reserved is untouched — the return still does not go back to this work order's reservation | `materialConsumeReturn.ts`, `stockRequests.ts` |
| **R-3** — reserved is 0 after completion | Already built (`releaseOnCompletion`). WO detail's Reserved qty column now shows what is **still** reserved (reserved − consumed), so it reads 0 after completion | `WorkOrderDetailsPage.vue` |
| **UC-09** — Cancel and Delete reverse reservation **and** consumption; a cancelled WO can be deleted | `cancelWorkOrder` / `deleteWorkOrder` share `reverseWorkOrderStock`: release + delete the consume/return records (the stock adjustments) + zero the request's consumed. Cancel is offered only once started; Delete on Not started, Completed and Cancelled (moves nothing). Delete removes the record; the request is flagged `workOrderDeleted` and reads Canceled. The Cancel modal and the Delete confirm name the released and restored qty (R-6) | `woApproval.ts`, `WoTransactionModal.vue`, `WorkOrderDetailsPage.vue` |

### 8.0 Settings page after the `main` sync (4 Nov)

`main` replaced Production settings with the prod-parity `SettingsProductionPage`
(General / Readiness / Integration, edited and saved per section). It is now the
only Production settings page: it reads and writes the one `productionSettings`
store, and carries a fourth section, **Component request & reservation** (S-0
toggle, S-1 method, forward-only and Two-step notes), plus the start-rule note
under Readiness. Its "partial production" is our partial *completion*. The
branch's old `ProductionSettingsPage.vue` is deleted.

### 8.1 PM rulings (4 Nov)

1. *Request additional stock* is removed; Adjust is the only way to ask for more.
2. Consumption draws from each line's own destination warehouse.
3. With reservation off, the start gate applies the partial-mode table to on hand.
4. Partial consume / partial completion stay as the two Figma toggles (the PRD's
   three-way selection is offered, not required).

### 8.2 v0.6 text still contradicting itself — resolved as before, PRD to fix

- **Where Unreserve lives.** UC-02 says the button opens "the Reserve action only"
  and Unreserve is handled from Stock requests; UC-03 and R-7 put it in the WO
  Reservation menu while Not started. Built: **in the menu** (ruling of 14 Oct).
- **Disposition.** UC-03 dropped it, but Key Concepts, US-4, QA-3 and the Audit
  Log bullet still mention return-to-warehouse vs production-defect. Built:
  **no disposition**.
- **Edit below reserved.** The UC-06 notes still say "Qty cannot go below the
  already-reserved amount"; the UC-06 table auto-unreserves. Built: **auto-unreserve**.
- **Known implementation gaps** (Technical Documentation) is stale: reserve and
  unreserve DO log, and the UC-04 gate IS built.

### 8.3 Out of the prototype

- R-9 email notification to another WO's owner — no mail layer.
- Deleting a Completed WO's output posting and journal entries — no ledger.
- OPEN-34 (P-1 on backflush) is still open: *Complete work order* auto-consumes
  the remaining qty without the P-1 cap.
- UC-08 says Return is available only with partial consume on; the form does not
  gate it yet.

## 8. QA feedback round — 2026-11-06

| Feedback | Change | Where |
|---|---|---|
| Transfer / PR should only carry items that still need stock | Shortfall lines skip completed and canceled requests (both the per-request and the per-product path) | `shortfallLinesForRequest`, `shortfallLinesForProduct` |
| Qty to transfer must show regardless of batch / serial / storage location | Batch and storage-location rows show the qty they were raised with, muted until picks confirm it | `WarehouseTransferFormPage.vue` (`effectiveQty`) |
| Available qty follows the chosen origin | Available reads "—" until an origin is chosen; changing the origin drops batch / serial / bin picks from the old one | `WarehouseTransferFormPage.vue` |
| Transfer / PR number on the stock request audit log | Saving a transfer or PR raised from a stock request writes "Warehouse transfer created" / "Purchase request created" with its number to the request (and work order) log | `logRequestDocument` |
| A WO Return isn't reflected on the request | See UC-08 above; consuming beyond the reservation also counts on the request now | `applyReturn`, `applyConsumption` |
| A completed WO should update the request status | Request status Completed and every line Fulfilled once the work order completes | `stockRequestStatus`, `requestLineStatus` |
