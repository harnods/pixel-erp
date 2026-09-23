# Stock Request & WO Material Reservation — as built

What the prototype on `feat/material-reserve` actually does, written so it can be
diffed against **[PRD] Work Order Material Reservation, Stock Request & Project
Stock** (Confluence page `51309839076`, space `PD`, Draft v0.4, 23 Aug 2026).

Requirement IDs below (S-x, C-x, D-x, W-x) are the PRD's own.

Sources this was built from:
- the PRD above (UC-00, UC-01–UC-04, UC-11)
- the interactive prototype *Mekari ERP Work Order Prototype* (`StockRequests.jsx`,
  `StockRequestDetail.jsx`)
- Figma *Warehouse — Stock Request* (index states) and *Production Material
  Requisition & Reservation* (production settings)

---

## 1. Surfaces

| Surface | Route | Notes |
| --- | --- | --- |
| Stock requests index | `/stock-requests` | Page-level tabs **Requested** (default) / **All** |
| Stock request detail | `/stock-requests/:requestId` | Exactly one detail page |
| Production settings | `/production-settings` | Settings › Production |
| WO detail (reservation) | `/work-orders/:id` | Reservation action + readiness + Reserved qty |

---

## 2. Data model

A stock request is **1:1 with the transaction that raised it**; a transaction has
many components. Work orders are the only transaction type that raises one today.

```
StockRequest
  id, number            SR-2026-0001 — the request's OWN identity
  workOrderId/Number    the transaction that raised it (a reference, not the identity)
  requestDate, requestor
  kind?                 'additional' | 'adjustment'   (W-7 tags)
  rejected?
  lines[]

StockRequestLine
  productId, product, sku, unit
  qty                   what the transaction needs  (= the WO's "Needed qty")
  reserved, consumed
  requiredDate
  destinationWarehouse / destinationWarehouseId
  destAvailable         allocatable stock at that warehouse
```

Derived, never stored: request status, per-line readiness, overdue, remaining,
to-transfer. Statuses: `requested` · `partially reserved` · `reserved` ·
`issued / picked` · `rejected`.

---

## 3. Deliberate divergences from the PRD

These are where the build and the PRD disagree. **Each needs a PRD decision.**

### D1 — "Requested" tab means *not fully reserved*
W-4 says the tab shows "rows not fully covered". Implemented as **not fully
RESERVED**, deliberately ignoring available stock: free stock in the warehouse does
not settle a request, somebody still has to reserve it. Counting availability made
every new request vanish from the default tab whenever the warehouse happened to
hold enough. *Suggest the PRD state this explicitly.*

### D2 — Grouping is "By product" / "By transaction"
W-1 says "By SKU / product" and "By work order". Built as **By product** / **By
transaction**, because a request is raised by whatever transaction needs material
and the work order is merely today's only source. Each row still names its own type
("Work order WO-2026-0001"), so the view survives new transaction types unchanged.

### D3 — A request has its own number
The PRD never gives stock requests an identity, so the detail page originally
titled itself with the work order. Requests now carry **SR-2026-xxxx** and the
transaction is a field. *PRD should define the numbering.*

### D4 — Destination warehouse is per LINE
C-4 implies one warehouse per request. Components of one request can be needed at
different warehouses, so the warehouse sits on the **line**; the detail page groups
by it and each group carries its own **Create warehouse transfer** — the unit a
transfer document is actually raised in.

### D5 — One detail page only
A W-8 "component demand" page (one component across all open WOs) was built and
then **removed**: the product grouping is an aggregate across requests, not a
record, so it has no detail of its own. Its rows expand to the transactions
underneath instead. *W-8 needs re-scoping or dropping.*

### D6 — UC-00 conflict: the reservation toggle ⚠️
PRD v0.4 **removed** "Komponen produk harus direservasi" and made reservation
always-on. The **Figma still shows that toggle**, so it was built as drawn and
wired for real: switching it off stops requests being raised, hides readiness, the
Reserved qty column and the Reservation action, and lifts the start gate.
**Either the PRD or the Figma is stale — this is the single most important
decision to resolve.**

### D7 — Start gate is keyed to the wrong setting ⚠️
D-8 ties the gate to "Allow partial production". The Figma has a separate **"Dapat
mulai perintah kerja dengan stok terbatas"** (can start WO with limited stock),
which is a more precise name for the gate, so the build uses that one.

**Known gap — the intended rules are NOT yet implemented.** They are:
- start with partial reserve when **at least one** component is partially or fully
  reserved, if the **partial consume** toggle is on;
- start with partial reserve when **all** components are partially or fully
  reserved, if the **partial completion** toggle is on.

The build currently has a single toggle: full reservation required unless
"can start with limited stock" is on. The PRD should specify both rules and name
both toggles.

---

## 4. Built to the PRD

- **C-3 / C-4** — saving a WO raises the request; under One-step, lines the
  destination warehouse covers in full auto-reserve, and the toast says which case
  applied. Idempotent.
- **S-1 / S-2** — One-step / Two-step method; under Two-step every reservation
  entry point on WO surfaces is *hidden* (not disabled) and an info badge points to
  Stock requests.
- **D-4 / D-5** — one **Reservation** action opening Reserve; the modal shows
  Needed / Available / To reserve + readiness pill (Ready · Partial stock · Out of
  stock), tickboxes and select-all, applying to the selection only.
- **D-6** — Unreserve only while Not started; full qty per component; mandatory
  disposition (return to warehouse / production defect); optional reason; info note
  that Supervisor→Manager approval is designed but skipped.
- **W-2 / W-3 / W-5 / W-6 / W-7** — SKU columns, the three statuses, status +
  request-date filters, the backdate-recalculation flag, and the Additional stock /
  Adjustment tags with the overdue reminder.

---

## 5. Not implemented

| Area | Status |
| --- | --- |
| **Project MTO** (layered project-stock check, R1/R2/R3 resolution, project column + filter) | Not built — PRD marks these TBD |
| **Activity log** for reserve / unreserve (UC-02, UC-03 say every reservation is logged) | Actions work and toast, but write no log entry |
| **W-8 component demand page** | Built then removed — see D5 |
| Start-gate rules for partial consume / partial completion | See D7 |

---

## 6. Where the code lives

Branch `feat/material-reserve` on `harnods/pixel-erp`.

```
app/data/stockRequests.ts              model, derivations, reserve/unreserve
app/data/productionSettings.ts         UC-00 settings
app/components/pages/StockRequestsPage.vue         index
app/components/pages/StockRequestDetailsPage.vue   detail
app/components/pages/ProductionSettingsPage.vue    settings
app/components/patterns/ReserveMaterialsModal.vue      D-5
app/components/patterns/UnreserveMaterialsModal.vue    D-6
app/components/patterns/StockRequestFiltersDrawer.vue  all-filters
app/components/pages/WorkOrderDetailsPage.vue      reservation on the WO (modified)
app/components/pages/CreateWorkOrderPage.vue       C-3 / C-4 on save (modified)
```
