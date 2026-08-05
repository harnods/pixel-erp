# Integrity guards

Cross-module guards keep the mini-DB coherent: no dispatch pointing at a deleted
courier, no stock stranded in a deleted bin or archived warehouse, no BOM edited
out from under a work order mid-production, no transfer/adjustment driving stock
negative.

Each guard exposes a pair:

- **`can…()`** — a boolean predicate for enabling / soft-validating in the UI.
- **`…Safe()`** — a mutator that **refuses with a reason** (`GuardResult =
  { ok:true } | { ok:false; reason }`) instead of orphaning data.

Most live in [`app/data/integrityGuards.ts`](../../app/data/integrityGuards.ts),
which sits *above* the tables to avoid circular imports (mirroring
`inboundSync`/`outboundSync`). The stock guards are in-place in their own module.

> Reason codes are strings prefixed with a machine token (e.g.
> `COURIER_IN_USE: …`) plus a human tail.

---

## Delete / archive / edit guards

| Guard | Prevents | Refuses with | Spec |
|---|---|---|---|
| **`canDeleteCourier` / `deleteCourierSafe`** | Deleting a courier still on an in-flight delivery (not shipped/canceled) — would orphan the dispatch's courier ref | `NOT_FOUND`, `COURIER_IN_USE` | `guard-courier-delete` |
| **`canDeleteLocation` / `deleteLocationSafe`** | Deleting a storage location whose SKU slice still holds on-hand stock — would strand the stock | `LOCATION_HAS_STOCK` | `guard-location-delete` |
| **`canArchiveWarehouse` / `archiveWarehousesSafe`** | Archiving a warehouse that still holds stock or has open work (open receiving/picking tasks, draft transfers); the default warehouse can never be archived; an already-archived one isn't archivable | `WAREHOUSE_NOT_EMPTY` | `guard-warehouse-archive` |
| **`canEditBom` / `updateBillOfMaterialsSafe`** | Editing a BOM referenced by an active (non-completed/canceled) work order — would change the recipe mid-production | `NOT_FOUND`, `BOM_IN_USE` | `guard-bom-edit` |

Supporting readers (also exported): `deliveriesUsingCourier`,
`stockInLocation`, `warehouseOnHand`, `openTasksForWarehouse`,
`activeWorkOrdersForBom`.

---

## In-place stock / transfer guards

These refuse operations that would leave stock negative or over-committed.

| Guard | Where | Prevents | Refuses with | Spec |
|---|---|---|---|---|
| **`canApproveTransfer` / `approveTransfer`** | `warehouseTransfers.ts` | Approving a transfer that moves more than origin available, isn't a draft, is same-warehouse, or touches an archived warehouse. A valid approve moves stock. | `INSUFFICIENT_STOCK`, `NOT_DRAFT`, `SAME_WAREHOUSE`, `WAREHOUSE_ARCHIVED` | `guard-transfer-approve` |
| **`canApplyWmsInOut` / `addWmsAdjustmentSafe`** | `wmsStockAdjustments.ts` | A Stock In/Out out-line removing more than available (over-decrement). Positive in-lines always allowed; cycle-count adjustments pass the in/out check (don't mutate here). | out-of-stock refusal (stock untouched) | `guard-wms-inout-negative` |
| **`stockOutViolation`** (+ `availableForSku` / `onHandForSku`) | `warehouseDetails.ts` | Any out-line that exceeds on-hand, or exceeds available (eats into reserved). Returns null when positive-only or within available. | violation object naming the line | `guard-negative-stock` |

---

## Coverage summary

| Spec | Tests cover |
|---|---|
| `guard-courier-delete` | in-flight blocks delete · no shipment allows delete · unknown id NOT_FOUND |
| `guard-location-delete` | stocked location blocked · empty (no slice / zero on-hand) allowed |
| `guard-warehouse-archive` | stocked blocked · default never · already-archived not archivable |
| `guard-bom-edit` | active-WO BOM blocked · idle BOM editable · unknown id NOT_FOUND |
| `guard-transfer-approve` | over-available refused (no move) · valid approves & moves · not re-approvable · same-warehouse · archived-warehouse |
| `guard-wms-inout-negative` | over-available out-line refused (stock untouched) · valid out lowers on-hand · positive in raises · cycle-count passes check |
| `guard-negative-stock` | positive-only → null · within-available → null · exceeds on-hand flagged · exceeds available (into reserved) flagged |
