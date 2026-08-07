# Scenario catalog

Every scenario the Vitest suite covers, grouped by module. **Type** legend:
**H** = happy path · **E** = edge case / guard · **R** = regression /
invariant lock. Files live in [`tests/`](../../tests); names below are the
`.spec.ts` basename.

> Coverage at a glance: **133 spec files, 673 tests**. Cross-cutting concerns
> (drawers, scanning, unsaved-changes guard, PDFs) are shared by inbound &
> outbound and get their own sections near the end.

---

## 1. Inbound — Receipts (PO)

| Scenario | Type | Spec |
|---|---|---|
| Receipt status lifecycle Pending → Open → In progress (task create/start) | H | `receipt-status-flow` |
| Multi-task tie-break (most-advanced task wins); canceling last active task reverts down; ended task does not revert | E | `receipt-status-flow` |
| Cancel guarded to non-terminal statuses (pending/partial cancelable; completed/canceled not; `closeReceipt` locks it) | E | `receipt-cancel-guard` |
| Fully-received PO stays *In progress* (cancelable) until put-away finishes; flips *Completed* only on `endPutAway` | R | `inbound-cancel-cascade-putaway` |
| Partial reception requires real on-hand (put-away enabled) — short receive = *In progress* until a put-away completes | E | `receipt-partial-reception-requires-onhand` |
| Create receipt: saved line items exactly match what View details shows | H | `create-receipt-line-items-match-details` |
| Details page: Delete lives in Actions dropdown, not a footer button | R | `receipt-details-delete-in-actions` |
| Details page: PR table shows "Expected qty", not "Purchase qty" | R | `receipt-details-pr-table-expected-qty` |

## 2. Inbound — Receiving

| Scenario | Type | Spec |
|---|---|---|
| `targetQty` (Expected qty) clamping: default = Purchase qty, keep below, clamp above, floor negatives; seed invariants | H/R | `receiving-target-qty` |
| Second task defaults/caps Expected qty to the **outstanding remainder**, not full Purchase qty | E | `receiving-second-task-expected-qty` |
| An OPEN task only partially claiming a SKU still offers the remainder to a new task | E | `receiving-open-task-partial-coverage` |
| Create-PR page shows Outstanding/Received columns while an earlier task is still open | H | `create-purchase-receiving-outstanding-column` |
| Index qty column shows Expected qty (sum targetQty), not Purchase qty | R | `receiving-index-expected-qty-column` |
| Bulk action bar Cancel button labeled "Cancel receiving task" | R | `receiving-index-bulk-cancel-label` |
| Details header: "SKU qty" + Expected qty stat; Outstanding = Expected − Received, floored at 0 | R | `receiving-task-details-header-stats` |
| Details View batch/serial action column (open shows none; in-progress/completed open read-only drawer; canceled still shows button) | H/E | `receiving-task-details-view-batch-serial-action` |
| Draft batch/serial detail survives "Continue receiving" resume; seed sums match aggregate receivedQty | R | `receiving-draft-batch-serial-resume` |
| Receive-items: Expected qty (targetQty) is the hard cap — scanning/typing past it is rejected, never counted (no confirm step) | E | `receive-items-expected-qty-cap` |
| Cancel replaces delete (open/in-progress cancelable; pending-put-away/completed not; frees SKUs back to uncovered) | E | `receiving-task-cancel` |
| Full two-pass partial receiving + put-away cycle keeps on-hand/batch/serial/location accurate | H | `receiving-putaway-flow` |

## 3. Inbound — Put-away

| Scenario | Type | Spec |
|---|---|---|
| Create put-away merges the same SKU across selected receiving tasks into one summed row | H | `create-put-away-sku-merge-across-receiving-tasks` |
| Create put-away View batch/serial action opens read-only drawer with recorded batch/serials | H | `create-put-away-view-batch-serial` |
| Same SKU bundled from 2+ receiving tasks = ONE merged row on data layer, execution & details pages (no dup Vue keys) | R | `put-away-multi-receiving-task-merge` |
| Batch/serial Storage location shows the real assigned bin(s), not a placeholder; nothing assigned → "—" | R | `put-away-batch-serial-location-summary` |
| Details View batch/serial action column across open/in-progress/completed/canceled | H/E | `put-away-details-view-batch-serial-action` |
| In-progress never-drafted task shows REAL stored qty, never a fake percentage | R | `put-away-real-stored-not-fake-pct` |
| Partial draft: qty ceiling stays at received, stored progress preserved on reopen | E | `put-away-draft-partial-qty-preserved` |
| Save-as-draft must not drop untouched SKUs (batch-tracked & plain) | R | `put-away-draft-save-preserves-untouched-skus`, `…-plain-sku` |
| Cancel replaces old Edit/Delete stubs (open/in-progress cancelable; completed not) | E | `putaway-cancel` |
| Put-away cancel reverts receiving to "pending put-away" but keeps the canceled put-away in linked transactions; a fresh one relinks | E | `putaway-cancel-reverts-receiving` |
| Canceled-PO acknowledge banner/modal on the put-away details page | E | `put-away-cancel-ack-ui` |

## 4. Inbound — PO cancel cascade

The heaviest edge-case cluster. A receiving task belongs to exactly one PO, so
a PO cancel invalidates 100% of its tasks.

| Scenario | Type | Spec |
|---|---|---|
| Open task → canceled outright; terminal | E | `inbound-cancel-cascade` |
| In-progress task → flagged `needsCancelAck` (not auto-canceled); real receivedQty preserved; ack cancels it | E | `inbound-cancel-cascade` |
| Ended tasks & unrelated POs never touched; guard rails (NOT_FOUND / CANNOT_CANCEL) | E | `inbound-cancel-cascade` |
| Cascade into unfinished **put-away** (open → auto-cancel; in-progress → flag; Start/Continue stays blocked; ack keeps receiving completed) | E | `inbound-cancel-cascade-putaway` |
| Stock reversal on ack when `stockCommitted` — plain/batch/serial reversal + recorded stock adjustment; batch-sum invariant intact | R | `inbound-cancel-cascade-stock` |
| Put-away-disabled gap: `completeReceivingWithoutPutAway` commits on-hand directly and is reversible | E | `inbound-cancel-cascade-stock` |
| Acknowledge modal UI on ReceivingTaskDetailsPage & direct-URL guard on ReceiveItemsPage; ack never re-enables Start | E | `inbound-cancel-cascade-ui` |
| Scenario matrix T1 (single order/put-away), T2 (multi receiving, one put-away), T3 (multi order, shared put-away) — all statuses | E/R | `inbound-cancel-scenarios` |
| Canceled receipt keeps receiving history visible in linked transactions (auto-canceled OPEN, real receivedQty, or none) | R | `canceled-receipt-linked-transactions` |

## 5. Inbound — Edit & multi-order

| Scenario | Type | Spec |
|---|---|---|
| Edit a PENDING PO: increase/decrease/add/remove SKU, header fields; materializes seed-style receipt on first edit | H | `inbound-edit-order` |
| Activity log records real before→after diff (qty, add/remove, header); no-op logs nothing | R | `inbound-edit-order` |
| Lock vs receiving state: SKU with receivedQty on in-progress/completed task can't be reduced/removed; open task doesn't lock | E | `inbound-edit-order` |
| Not editable once completed/cancelled; NOT_FOUND for bogus id; a qty reduction DOES now touch the Open task(s) claiming it (and freezes them) | E | `inbound-edit-order` |
| Multi-order + partial bundled into one put-away (plain & batch): merged qty = received sum, statuses diverge, on-hand posts only received | E | `inbound-multi-order-partial` |
| Allocation across Open receiving tasks: direct-reduce trigger, drain-smallest-first default (read-only, no override), removable cap (open vs locked), auto-cancel vs keep, unassigned-first | E/R | `inbound-edit-order-allocation` |
| Needs Re-arrangement freeze: touched Open task freezes, untouched/cancelled tasks don't; single-task direct reduction also freezes; self-serve acknowledge resets + stamps audit; freeze doesn't touch items | E/R | `receiving-needs-rearrangement` |

---

## 6. Outbound — Order status & end-to-end flow

| Scenario | Type | Spec |
|---|---|---|
| Order status Pending → Open → In progress (picking or direct-packing); multi-task tie-break; cancel-last reverts down | H/E | `outgoing-status-flow` |
| Per-stage qty tracking (Order/Qty-to-pick/Picked/Packed); plain SKU reserved at creation (anti-oversell); short-pick preserved exactly | H/R | `outbound-flow` |
| Full E2E happy path (regular + marketplace): pick→pack→deliver→ship, on-hand posted only at completion | H | `outbound-e2e-scenarios` |
| E2E partial picking / partial packing→shipping / repeat-cycle to completion (shippedQty never double-counts) | E | `outbound-e2e-scenarios` |
| E2E shared picking of multiple orders; marketplace+regular mix; one shipment over multiple orders; two-courier split; whole-flow invariants | H/E | `outbound-e2e-scenarios` |
| Multi-order / multi-picking / partial → shipment (shared pick, split order, partial pack, different-SKU orders) | E | `outbound-multi-order-partial` |
| Partially-shipped order → new picking cycle → Create packing reappears → reaches completed with non-leaking numbers | R | `partial-shipment-repeat-cycle` |

## 7. Outbound — Picking

| Scenario | Type | Spec |
|---|---|---|
| Create-picking Combined / By-orders toggle (By-orders read-only, edits cascade) | H | `create-picking-view-toggle` |
| Picking-task-details Combined / By-orders toggle (per-order breakdown headers) | H | `picking-task-details-view-toggle` |
| Same SKU merges into one row across 2 orders; single-order unaffected; merged PDF | R | `picking-multi-order-sku-merge` |
| Manage batch/serial on a merged 2-order row preserves the group total on reopen | R | `picking-merged-manage-batch-serial` |
| `pickedByKey` always agrees with serialPicks/batchPicks; plans reflect full reservation | R | `picking-tasks-picked-qty-matches-picks` |
| `pickedKeysForOrder`: a SKU on an OPEN picking task isn't pickable again; canceled/short-pick remainder still is | E | `picking-sku-double-commit` |
| Storage location splits per bin once a group spans 2+ bins; fresh task reads Picked qty 0, not the reservation | R | `pick-items-storage-location-split`, `picking-details-storage-location-split` |
| Pick-items Combined / By-orders toggle; View batch in By-orders shares live draft | H | `pick-items-view-toggle` |
| Active-bin scan model (reverse of put-away): batch/plain scan needs an active bin first | E | `pick-items-active-bin-scan` |
| Page-level scan guards: batch can't over-pick physical qty; serial no double-pick across shared orders; foreign-reserved serial rejected | E | `pick-items-scan-batch-guard`, `pick-items-scan-serial-guards` |
| Scanning a tracked SKU auto-opens Manage batch/serial drawer; scan threshold gates manual qty | E | `pick-items-scan-opens-tracked-drawer`, `pick-items-scan-threshold` |
| Continue picking gated by cancelled-order acknowledgment (modal, no navigation) | E | `picking-continue-ack-gate` |
| Picking-list PDF (plain/batch/serial one-row; empty; canceled ribbon) | H | `picking-list-pdf` |
| `disablePickingForWarehouse` never cancels existing picking tasks | R | `disable-picking-warehouse` |
| `registerNewBatch` overlay merge (idempotent) + `endPicking` with a never-seen batchNo reserves & releases correctly | E | `new-batch-registration` |

## 8. Outbound — Packing

| Scenario | Type | Spec |
|---|---|---|
| Create-packing: a not-fully-picked (marketplace) list stays visible badged "Not packable" w/ reason; cancelled co-order never blocks the live one | E | `create-packing-blocked-picking-list` |
| Create-packing Storage location column splits per bin; plain SKU shows real bin | R | `create-packing-storage-location-split` |
| Packing-details Storage location reflects real picked bin(s), split per bin | R | `packing-details-storage-location-split` |
| Pack-items scan: plain SKU increments capped at picked qty; tracked SKU opens read-only View drawer | H | `pack-items-scan` |
| Match-order SN/batch verification: picked verifies, not-picked/duplicate/over rejected; Finish blocked until fully verified; in-drawer verify | E | `pack-items-scan-verify` |
| Packing-list PDF (plain/batch/serial flattened; empty; courier/tracking; canceled ribbon) | H | `packing-list-pdf` |

## 9. Outbound — Shipment & delivery

| Scenario | Type | Spec |
|---|---|---|
| Create shipment: courier required (flags cell, blocks Save), tracking no. optional | E | `create-shipment-courier-required` |
| Complete shipment blocked while a canceled delivery is unacknowledged | E | `complete-shipment-blocked-by-canceled` |
| Bulk handover splits a mixed-courier batch into one shipment per courier; single-courier stays one | E | `handover-courier-split` |
| Shipment PDF (with rows / no rows) | H | `shipment-pdf` |

## 10. Outbound — Cancel cascade & release-reserved

| Scenario | Type | Spec |
|---|---|---|
| Scenario matrix T1 (single chain), T3 (shared picking), T4 (shared shipment); partial-pick; reservation kept & released (D6) | E/R | `outbound-cancel-scenarios` |
| Cancelled order must not block packing (shared picking / two pickings / pre-start auto-drop) | E | `outbound-cancel-packing-block` |
| Shared picking, cancel one order, per status (G1–G7): auto-drop vs needs-ack, other order stays packable, idempotency, shared shipment | E | `outbound-cancel-multi-partial` |
| Release reserved D6: no auto-release, manual release returns un-shipped qty only, idempotent, re-allocatable; partial-shipped-then-cancel refuses; batch-level; posting guard once shipped | E/R | `outbound-cancel-release-reserved` |
| Pick/pack edge cases: marketplace short-pick not packable, release returns picked stock, shared-task link visibility, cancel-while-packing, sole-order always canceled, per-order tracking, ship-open vs ship-completed | E | `outbound-cancel-pick-pack-edge-cases` |

## 11. Outbound — Edit & allocation (D7)

| Scenario | Type | Spec |
|---|---|---|
| Edit a PENDING order: increase reserves / decrease releases / add / remove; over-Available rejected (NO_ALLOCATABLE_STOCK) | H/E | `outbound-edit-order` |
| Edit vs picking state: started task locks reduce/remove but allows increase; open task doesn't lock; activity log; not editable once shipped/cancelled | E | `outbound-edit-order` |
| Allocation across tasks: direct-reduce trigger, drain-smallest-first default, user override (+ rejects), removable cap (pending vs started), auto-cancel vs keep, atomic multi-SKU combined edits, unassigned-first | E/R | `outbound-edit-order-allocation` |
| Needs Re-arrangement freeze (AC#8): touched Open task freezes, untouched/cancelled tasks don't; single-task direct reduction also freezes; WH Manager clear (AC#9) resets + stamps audit; freeze doesn't touch lines/reservation (AC#10) | E/R | `picking-needs-rearrangement` |

---

## 12. Batch / Serial drawers & scanning (shared: inbound + outbound)

| Scenario | Type | Spec |
|---|---|---|
| ManageBatchDrawer: Qty-to-pick column (picking + executionMode + plannedBatches); put-away "Put away qty" header + storage-location validation; scan-threshold gates manual qty | H/E | `manage-batch-drawer` |
| ManageBatchDrawer picking never registers a brand-new batch; count mode still can; overscan caps at qty-to-pick; requires active bin | E | `manage-batch-drawer-picking-no-new-batch`, `…-picking-overscan-cap`, `manage-drawer-picking-active-bin` |
| ManageBatchDrawer put-away: cross-SKU scan rejected; active-bin scan model + Reset count (bin assignment clears, batch list survives, inherited bin restored) | E | `manage-batch-drawer-put-away-cross-sku-scan`, `…-put-away-scan-reset` |
| ManageBatchDrawer/SerialDrawer receiving scan/paste/Save capped by targetCount (Expected qty); maxCount (Purchase qty) is reference-only | E | `drawer-receiving-expected-cap` |
| ManageSerialDrawer: row status by executionMode; scan bar per-mode behaviour; Reset re-seeds; bulk-paste threshold | H/E | `manage-serial-drawer` |
| ManageSerialDrawer picking: hides available units until scanned; hides foreign-reserved serials (dedicated empty state) | E | `manage-serial-drawer-picking-hide-available`, `…-hide-foreign-reserved` |
| ManageSerialDrawer put-away: active-bin scan model; (-) remove & Reset count keep rows visible; unassigned row doesn't block Save | E | `manage-serial-drawer-put-away-active-bin`, `…-put-away-reset` |
| ViewBatchDrawer: Qty-to-pick vs Picked-qty columns; delivery stats (Order/Picked/Packed/shipped); put-away Received-qty-before-location, one row per bin | H/R | `view-batch-drawer` |
| ViewSerialDrawer: Reserved/Picked status per row; released-serial regression; delivery/packing/put-away label variants | H/R | `view-serial-drawer` |
| Scanning a tracked SKU on receive/put-away/pack opens the drawer, not "not found"/silent increment | E | `receive-items-scan-opens-tracked-drawer`, `scan-sku-opens-tracked-drawer` |
| `resolveScan` / `sameCode` / `includesCode`: case-insensitive, whitespace-tolerant against real stock; unknown → null | E | `resolve-scan-case-insensitive` |

## 13. Warehouses, storage & stock

| Scenario | Type | Spec |
|---|---|---|
| wh-008 intentionally location-less: `hasStorageLocations:false`, empty tree, yet holds real stock; contrast wh-001 has a tree | R | `warehouse-location-less` |
| `scanRequiredForQty` threshold logic (below/at inclusive/above, toggle off, custom threshold) | H | `warehouse-config-scan-threshold` |
| Seed stock invariants: no negative available; available = onHand − reserved; batch totals cover demand; no order over-demands | R | `data-integrity` |
| Bulk create-task hint when the selection spans warehouses (outbound picking / picking→packing / receiving→put-away) | E | `bulk-create-task-warehouse-guard` |

## 14. Transfers

| Scenario | Type | Spec |
|---|---|---|
| Approval MOVES stock (origin −qty, destination +qty) | H | `warehouse-transfer-effect` |
| Cancel replaces delete: only a draft is cancelable, every other status terminal; nonexistent id no-op | E | `warehouse-transfer-cancel`, `warehouse-transfer-effect` |
| Approval guard: INSUFFICIENT_STOCK / NOT_DRAFT / SAME_WAREHOUSE / WAREHOUSE_ARCHIVED refused | E | `guard-transfer-approve` |

## 15. Adjustments & cycle count

| Scenario | Type | Spec |
|---|---|---|
| ERP adjustment: draft cancelable, completed (approved) not | E | `stock-adjustment-cancel` |
| WMS Stock In/Out completed on create (never cancelable); cycle count cancelable until finished | E | `stock-adjustment-cancel` |
| WMS Stock In/Out applies its delta to on-hand immediately | H | `stock-adjustment-effect` |
| WMS cycle count: stock changes only at approval (absolute set), not at finish | R | `stock-adjustment-effect` |
| Count variance math: difference = counted − prevOnHand; top-recommended names coherent with recommendationCount | H/R | `cycle-count-math` |

## 16. Manufacturing (BOM / work orders / production requests)

| Scenario | Type | Spec |
|---|---|---|
| `bomCostSummary` rolls up every cost group; excludes otherOutputs/waste from production cost; empty → 0 | H | `bom-cost-summary` |
| `addBillOfMaterials`/`updateBillOfMaterials`: append with generated id/number; in-place mutate; throw on unknown id | H/E | `bom-cost-summary` |
| BOM ↔ catalog coherence: no orphan product refs; unique ids/well-formed numbers | R | `bom-data-integrity` |
| Work order ↔ BOM coherence: bomId resolves, bomName matches, parentNumber exists; `addWorkOrder` appends | R | `work-order-coherence` |
| workOrderLinks per-row invariants (fulfilledQty range, status ratio, well-formed number) — *demo 200xx, not joined to real SOs* | R | `work-order-links` |
| Production requests: remaining clamped ≥ 0; spawn from a real sales order; reject (partial/over/merge/unknown) | H/E | `production-request-logic` |

## 17. Sales (accounting)

| Scenario | Type | Spec |
|---|---|---|
| `computeTotals` internally consistent; seed order total agrees; balanceDue follows status rules; details reuse index items/totals | H/R | `sales-order-totals` |
| Sales order & outbound customer FK resolve to master; names match; `getCustomer`/`customerName`; unique ids | R | `customer-master-coherence` |
| ERP dispatch salesOrderId FK resolves, salesNo/customer inherited, FK unique; marketplace/manual has no FK | R | `salesno-fk-coherence` |

## 18. Master-data coherence & barrel

| Scenario | Type | Spec |
|---|---|---|
| `DELIVERY_COURIERS` = master names in order; seed deliveries use only master couriers | R | `courier-master-coherence` |
| `~/data` barrel re-exports a representative table from every domain | R | `data-barrel` |

---

## 19. Cross-cutting — Unsaved-changes guard

Every execution/form page mounts the guard; committing (Finish/Save/Save-draft)
disables it before navigating. Each spec also proves a genuinely dirty page
still blocks (guard not always-off).

| Page | Spec |
|---|---|
| Composable itself (beforeunload, resolve, disableGuard, registry) | `use-unsaved-changes-guard` |
| Pick items | `pick-items-unsaved-changes-guard` |
| Pack items | `pack-items-unsaved-changes-guard` |
| Put-away items | `put-away-items-unsaved-changes-guard` |
| Receive items | `receive-items-unsaved-changes-guard` |
| Stock counting | `stock-counting-unsaved-changes-guard` |
| Stock In/Out form | `stock-inout-form-unsaved-changes-guard` |
| Warehouse transfer form | `warehouse-transfer-form-unsaved-changes-guard` |

## 20. Cross-cutting — PDF generation

Each asserts no-throw for plain/batch/serial data, empty tasks, and the canceled
ribbon.

| Output | Spec |
|---|---|
| Picking list | `picking-list-pdf` |
| Packing list | `packing-list-pdf` |
| Receiving slip | `receiving-slip-pdf` |
| Put-away slip | `put-away-slip-pdf` |
| Shipment | `shipment-pdf` |

## 21. Cross-cutting — Integrity guards

The `guard-*` set has its own catalog → [integrity-guards.md](integrity-guards.md).
