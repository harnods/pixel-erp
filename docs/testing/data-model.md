# Data model — the mini-DB

A reactive, in-memory mock-DB under [`app/data/`](../../app/data). Every "table"
is a module; [`app/data/index.ts`](../../app/data/index.ts) is the **single
import surface** (`import { … } from '~/data'`) re-exporting the whole graph.
State persists to `localStorage` (via `persist.ts`) and is resettable.

> This doc is the reference the coherence specs enforce. See
> [scenarios.md](scenarios.md) for the behaviour tests.

---

## Entities & ID schemes

| Domain | Key entities | ID / number scheme |
|---|---|---|
| **Master** | `customers`, `catalog`/`products`, `couriers`, `users`, `warehouses` | Customer `C001…` (`CUST-001`); courier `crt-001…`; warehouse `wh-001…wh-008` |
| **Inbound** | `receipts` (PO), `receivingTasks`, `putAwayTasks` | Receiving `#10090…`; a `ReceivingTask.receiptId` is **singular** (one task ↔ one PO) |
| **Outbound** | `outgoing` (dispatch), `pickingTasks`, `packingTasks`, `deliveryTasks` | Picking `salesOrderIds[]` is **plural** (one task can bundle several orders) |
| **Sales (accounting)** | `salesOrders`, `salesOrderDetails`, quotes/invoices/deliveries | `Sales Order #10090 … #10189` (`10090 + i`) |
| **Warehouses/stock** | `warehouseDetails` (stock engine), `storageLocations`, `storageLevels` | SKU numeric codes; bins per warehouse tree |
| **Adjustments** | `stockAdjustments` (ERP), `wmsStockAdjustments` (In/Out + cycle count) | — |
| **Transfers** | `warehouseTransfers` | draft → approved |
| **Manufacturing** | `billOfMaterials`, `workOrders`, `workOrderLinks`, `productionRequests` | BOM `#N`; WO number + `parentNumber` |

---

## Status lifecycles

| Object | Statuses |
|---|---|
| **Receipt (PO)** | Pending → Open → In progress → (Partial reception) → Completed · Canceled |
| **Receiving task** | open → in progress → pending put-away / completed · canceled |
| **Put-away task** | open → in progress → completed · canceled |
| **Outbound order** | Pending → Open → In progress → (Partially picked / Partially shipped) → Completed · Canceled |
| **Picking / Packing task** | open → in progress → (partially picked) → completed · canceled |
| **Delivery / shipment** | ready to ship → out for delivery → shipped · canceled |
| **Warehouse transfer** | draft → approved (terminal) · canceled |
| **WMS adjustment** | Stock In/Out = completed on create; cycle count: not_started → in_progress → finished → approved |

**Status derivation** is computed, not stored: `recomputeReceiptStatus`
(receivingTasks.ts) and `syncOutboundOrderStatuses` (outboundSync.ts) roll task
states up to the parent, with a *most-advanced-task-wins* tie-break.

---

## Stock / reservation model (the core invariant)

```
available = onHand − reserved        ← holds everywhere, at every stage
```

- **Inbound**: on-hand rises only when put-away genuinely finishes
  (`stockCommitted`), or — for put-away-disabled warehouses — when receiving
  commits directly. Receiving short with no put-away = *In progress*, not
  *Partial reception*.
- **Outbound**: stock is **reserved** at order allocation; on-hand is
  **deducted only at shipment completion**. Cancel does not auto-release the
  reservation — it is released manually (D6).

---

## Cross-module FK graph

```
customers ──id──┬── salesOrders.customer.id
                └── outgoing.customerId

salesOrders ──id──▶ outgoing.salesOrderId   (ERP dispatch 1:1; salesNo + customer inherited)
              (marketplace/manual dispatch has NO salesOrderId)

couriers ──name──┬── DELIVERY_COURIERS (deliveryTasks.ts)
                 └── deliveryTasks.courier

receipts ◀─receiptId─ receivingTasks ──▶ putAwayTasks ──▶ warehouseDetails (on-hand/batch/serial)
outgoing ◀─salesOrderIds─ pickingTasks ──▶ packingTasks ──▶ deliveryTasks ──▶ shipment

billOfMaterials ◀─bomId─ workOrders ──parentNumber──▶ workOrders (self)
BOM.rawMaterials/finishedGoodId/otherOutputs ──▶ catalog
salesOrders ──▶ productionRequests (spawned per line)
```

---

## Coherence fixes (recent, and what locks them)

The mini-DB was made coherent across modules. Each item is pinned by a spec:

| # | Fix | Enforced by |
|---|---|---|
| 1 | **Customer master unified** — `customers.ts` is the single source (25 coffee-industry accounts + `getCustomer`/`customerName`). `salesOrders.ts` and `outgoing.ts` both reference by id; no more 3 conflicting lists with colliding ids. `OutgoingOrder` gained a `customerId` FK. | `customer-master-coherence.spec.ts` |
| 2 | **salesNo → real FK** — `OutgoingOrder.salesOrderId` links ERP-sourced dispatches 1:1 to real `salesOrders` (10090–10189); `salesNo` + customer are inherited from the linked order. Marketplace/manual dispatches carry no FK. | `salesno-fk-coherence.spec.ts` |
| 3 | **Courier master wired** — `DELIVERY_COURIERS` is now derived from the `couriers.ts` master (was a hardcoded 5-string list); every seed delivery uses only master couriers. | `courier-master-coherence.spec.ts` |
| 4 | **wh-008 (Gudang Palembang)** — intentionally location-less ("general stock, no bins") — a **supported** feature (see the "no storage locations" banners in the transfer form). `hasStorageLocations:false`, empty bin tree, yet holds real stock. | `warehouse-location-less.spec.ts` |
| 5 | **`app/data/index.ts` barrel** — exports the full data graph from one surface. | `data-barrel.spec.ts` |
| 6 | **Integrity guards added** — cross-module `can…`/`…Safe` predicates + in-place approve/apply guards that refuse instead of orphaning refs or driving stock negative. | See [integrity-guards.md](integrity-guards.md) + the `guard-*.spec.ts` set |

---

## Coherence invariants the suite enforces

| Invariant | Spec |
|---|---|
| Every sales-order & outbound `customerId` resolves to the master; display names match | `customer-master-coherence` |
| Every ERP dispatch's `salesOrderId` resolves; `salesNo`/customer inherited; FK unique | `salesno-fk-coherence` |
| `DELIVERY_COURIERS` equals master names; no delivery uses an off-master courier | `courier-master-coherence` |
| Every BOM material/finished/output `productId` is a real catalog id; BOM ids unique | `bom-data-integrity` |
| Every work-order `bomId` resolves; denormalized `bomName` matches; `parentNumber` exists | `work-order-coherence` |
| No stock item has negative `available`; `available === onHand − reserved`; batch sums match item totals & cover demand; no active order over-demands available | `data-integrity` |
| The barrel re-exports a representative table from every domain | `data-barrel` |

---

## Known remaining limitation (documented, self-consistent only)

`workOrderLinks.ts` uses demo sales-order numbers in the **200xx** range
(e.g. `Sales Order #20018`) which **do not join** to the real `salesOrders`
catalog (**10090–10189**). `work-order-links.spec.ts` only asserts each row is
*internally* well-formed (`fulfilledQty ∈ [0, qtyToProduce]`, status matches the
fulfilled ratio, number is well-formed) — it is self-consistent but not wired to
the real sales-order graph. This is intentional and tracked here.
