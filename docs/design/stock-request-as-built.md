# Stock Request & WO Material Reservation — as built

What the prototype on `feat/material-reserve` actually does, written so it can be
diffed against **[PRD] Work Order Material Reservation & Stock Request**, Draft
**v0.5** (Google Doc, 25 Sep 2026). Requirement IDs below (S-x, C-x, D-x, W-x, R-x)
are the PRD's own.

v0.5 is the authority. It supersedes both PRD v0.4 and the Confluence draft
*[PRD] INV — Stock Request Dashboard*, and it names this branch as its reference
implementation.

Sources this was built from:
- PRD v0.5 (UC-00, UC-01–UC-06, UC-09, UC-11, UC-15)
- Figma *Warehouse — Stock Request* and *Production Material Requisition &
  Reservation* — **stale in one respect, see §3**

---

## 1. Surfaces

| Surface | Route / component | Notes |
| --- | --- | --- |
| Stock requests index | `/stock-requests` | Tabs **Requested** (default) / **All**; views By product / By transaction |
| Stock request detail | `/stock-requests/:requestId` | Exactly one detail page, grouped by destination warehouse |
| Production settings | `/production-settings` | Settings › Production |
| WO detail | `/work-orders/:id` | Reservation menu, readiness badge, Reserved/Consumed columns |
| Adjust work order | `AdjustWorkOrderModal.vue` | UC-06, In progress only |
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
`erp.productionSettings` migrates instead: reservation-off maps to **Two-step**, so
no tenant starts auto-allocating stock on upgrade (L-12).

---

## 3. Divergences from the PRD

**Only one open item remains.** v0.5 adopted the rest of what this build had
already diverged into (request numbering, per-line destination warehouse, the
single detail page, By product / By transaction, the separate limited-stock
setting), so those are no longer divergences.

### D1 — The Requested tab filters on WORK ORDER status ⚠️ *open*
W-4 says the Requested tab shows rows **not fully reserved**. This build keeps the
tab filtering on the raising work order's status (`isRequestedTab` →
`ACTIVE_WO_STATUSES`), carried over from the Confluence INV draft and kept on an
explicit product decision when v0.5 landed.

The two disagree in a visible way: under W-4 a fully reserved request leaves the
Requested tab; here it stays until its work order leaves an active status.
**Needs a PRD decision.** `needsAction()` already implements W-4's rule exactly and
is used for the open-count badge, so switching is a one-line change.

### Resolved by v0.5
- **The Figma's "Komponen produk harus direservasi" toggle is NOT built.** v0.5
  makes reservation always on (L-12) and declares the Figma stale. Previously built
  as drawn; now removed. The Figma still needs updating.
- **Start gate** — v0.5's UC-04 table is implemented as written (see §4). The
  earlier build relaxed the gate from two independent toggles; v0.5 makes S-4 the
  master relaxer and the partial mode choose how.
- **Canceled requests stay listed.** The INV draft dropped a cancelled work order's
  request off the dashboard; v0.5 W-3 keeps it, as **Canceled**. A request that
  disappears reads as one that was never raised.

---

## 4. Built to the PRD

- **S-1…S-4** — method One-step / Two-step; under Two-step every reservation entry
  point on WO surfaces is *hidden* and an info note points to Stock requests.
  Partial consume / partial completion are one `partialMode` union, so they cannot
  both be on. S-4 governs the start gate only.
- **C-3 / C-4** — saving a WO raises exactly one request; under One-step, lines the
  destination covers in full auto-reserve (per-line all-or-nothing) and the toast
  says which case applied. Idempotent.
- **UC-04 / D-8** — the full truth table: S-4 off → every component fully reserved;
  S-4 on + partial consume → at least one reserved > 0; S-4 on + partial completion
  → every component reserved > 0; S-4 on + neither → full reservation. Counts
  reservation, never availability.
- **UC-06 (Adjust half)** — Adjust puts an increase on a new Adjustment-tagged line
  carrying only the delta with its own request date, reduces Adjustment-first on a
  decrease, and makes the adjusting user that line's requestor. The form requires a
  reason and a per-line request date of today or later. **The Edit half is not
  reachable — see §5.**
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
- **W-1…W-10** — both views; product rows are one per SKU **per destination
  warehouse** so availability is never summed across warehouses; W-2's column set
  behind a column menu; derived statuses incl. Rejected and Canceled; overdue;
  backdate flag; line tags and per-line rejection; SR-YYYY-NNNN numbering;
  warehouse grouping with a transfer per destination.
- **Audit log** — reserve, unreserve, all three release triggers, adjust and cancel
  write entries against both the work order and its request.

---

## 5. Not implemented

| Area | Status |
| --- | --- |
| **Project MTO** (project stock, hard peg, batch costing) | Out of scope — separate PRD, ships later as an overlay |
| **UC-06 WO Edit (Not started)** | Data layer built and used by Adjust (`applyDemandChanges(…, 'edit')`, `blockedByReservation`), but **unreachable**: this prototype has no work-order edit screen at all — `CreateWorkOrderPage` serves `/work-orders/new` only, and the `Edit` action on WO detail has never been wired. Reaching it means building an edit page, which is a larger piece of work than the reservation scope. So "update the line in place, editor becomes requestor, block below reserved with an inline unreserve-first error" is specified and coded but cannot be exercised |
| **UC-05 / UC-07 / UC-08 / UC-10** end-to-end verification | The consumption hook draws reservation down and a return reverses it, but the full pick/issue and goods-receipt paths are unverified against v0.5 (**OPEN-30**) |
| Notifications (in-app + email) on qty change and rejection | Not built — prototype has no notification surface |
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
app/components/patterns/AdjustWorkOrderModal.vue       UC-06
app/components/patterns/CancelWorkOrderModal.vue       UC-09 / R-6
app/components/patterns/StockRequestFiltersDrawer.vue  all-filters
app/components/pages/WorkOrderDetailsPage.vue      reservation, gate, adjust, cancel
app/components/pages/CreateWorkOrderPage.vue       C-3 / C-4 on save
```
