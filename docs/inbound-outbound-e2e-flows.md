# Inbound & Outbound — End-to-End Flow Reference (as-built)

This document describes the **actual implemented** inbound and outbound fulfillment
flows in this ERP+WMS prototype: every stage, status, process, guard, and edge
case, grounded in the code and the test suite. It is the source-of-truth reference
for how the app behaves today.

> Regression status when this doc was written: full suite **585 tests passing**
> (111 files) + production build green. Test files are cited per case so each
> behavior is traceable and re-verifiable.

---

## 0. Architecture at a glance

- **State**: reactive in-memory stores in `app/data/*.ts`, persisted to
  localStorage snapshots (`app/data/persist.ts` → `loadSnapshot`/`saveSnapshot`).
  Resettable; mock data is deterministic.
- **Cross-store orchestration** (cancel/edit cascades): `inboundSync.ts` /
  `outboundSync.ts` (kept separate to avoid circular imports).
- **Router**: single catch-all `app/pages/[...slug].vue`. Index tabs render via
  `tabComponents`; detail/action pages via `detailMatch`.
- **Status is always re-derived** from the real underlying tasks (never trusted
  from a stored/seed value) — see `recomputeReceiptStatus` (inbound) and
  `syncOutboundOrderStatuses` (outbound).

### Tab structure

| Page | Tabs (internal keys) | Display label differences |
|---|---|---|
| **Inbound delivery** | Receipts · Receiving · Put-away | — |
| **Outbound delivery** | Requests · Picking · Packing · `Ready to ship` · `Shipments` | `Ready to ship` → **"Shipping"**, `Shipments` → **"Shipping document"** |

- Tab labels are display-only (`TAB_LABELS`, `[...slug].vue`); the internal key
  stays the URL query and component-registry id, so deep links keep working.
- **Tab gating** (single-warehouse/Ops users only): Inbound "Put-away" hidden when
  `putAwayEnabled` is false; Outbound "Picking" hidden when `pickingEnabled` is
  false. Multi-warehouse (ERP/Standalone) views always show all tabs.
- **Badge counts**: only non-terminal work is badged (Completed/Canceled never
  counted).

### Batch / serial tracking heuristic (consistent across all stages)

A SKU is **batch-tracked** if it has batches in stock (or category ∈ *Green Beans,
Roasted Beans*); **serial-tracked** if it has serials (or category ∈ *Espresso
Machine, Grinder, Equipment*). Ref: `PackItemsPage.vue` tracking helpers.

### Scan threshold (receiving & picking)

`warehouseConfig.ts`: when `scanThreshold` is on (default) and a line qty ≤
`scanThresholdValue` (default 50), **manual qty entry is disabled** — the operator
must scan each unit. Above the threshold, qty may be typed.

---

# PART 1 — INBOUND (Purchasing → Receiving → Put-away)

## 1.1 Statuses

**Receipt / PO** — `ReceiptStatus`: `pending → open → in progress →
partial reception → completed → canceled` (`receipts.ts`).

| Status | Meaning | Primary action |
|---|---|---|
| **Pending** | No receiving task yet | Create receiving task |
| **Open** | Task(s) created, none started | Start receiving |
| **In progress** | ≥1 task started, **or** all lines received but put-away not truly finished | Continue/End receiving → create put-away |
| **Partial reception** | ≥1 task ended short **and** stock genuinely committed on the short line | **Close** (accept-as-final) or create another receiving task |
| **Completed** | Full qty received **and** (put-away disabled **or** put-away finished) | — |
| **Canceled** | Voided | — |

**Receiving task** — `"open" | "in progress" | "pending put-away" | "completed" | "canceled"`.
**Put-away task** — `"open" | "in progress" | "completed" | "canceled"`.

### Status derivation (`recomputeReceiptStatus`, receivingTasks.ts)
Re-derived from tasks, never the seed:
- All ended tasks cover all lines → **completed** if every ended task
  `stockCommitted`, else **in progress** ("received, waiting on real put-away").
- Some ended task `stockCommitted` but not full → **partial reception**.
- No ended tasks → **in progress** (a task started) / **open** (a task exists) /
  **pending** (none).

> **Edge case — partial reception requires on-hand**: receiving short with **no
> put-away yet** stays **In progress**, *not* Partial reception. It only flips to
> Partial reception once a put-away completes (stock truly on-hand). Driven by the
> `stockCommitted` flag, which is true only via completed put-away
> (`endPutAway`→`markStockCommitted`) or `commitReceivingStock` (put-away disabled).
> Test: `receipt-partial-reception-requires-onhand.spec.ts`, `receipt-status-flow.spec.ts`.

## 1.2 Stock / reservation timing (inbound)

Inbound **reserves nothing**. Receiving only tracks expected vs received qty.
On-hand increases **only** when goods are physically put away:
- put-away **enabled** → `endPutAway` (registers new batches / receives serials /
  `applyStockInOut`).
- put-away **disabled** → `endReceiving` → `commitReceivingStock`.

## 1.3 Process — step by step

1. **PO / receipt intake** — `addReceipt` (manual, id `rcv-new-*`) or seed PO.
   Status **Pending**.
2. **Create receiving task** — `createReceivingTask`. `targetQty` ("Expected qty"
   for this task) defaults to / is capped at outstanding = Purchase qty − claimed.
   Bumps PO → **Open**.
   - `expectedQty` = Purchase qty = hard ceiling (receivedQty may exceed
     `targetQty` but never `expectedQty`).
   - Coverage: a SKU stays creatable while cumulative claim < Purchase qty
     (open/in-progress tasks claim `targetQty`; ended tasks claim real
     `receivedQty`). Test: `receiving-open-task-partial-coverage.spec.ts`.
3. **Start receiving** — `startReceiving` → task In progress, PO In progress.
4. **Receive items** (`ReceiveItemsPage.vue`, scan flow `handleScan`):
   - Batch-number scan → increments that batch line's counted qty.
   - SKU scan not found → "Barcode not found" toast. SKU casing is canonical
     (case-insensitive; `resolve-scan-case-insensitive.spec.ts`).
   - Batch-tracked SKU → opens Manage batch drawer; serial-tracked → Manage serial
     drawer (`receive-items-scan-opens-tracked-drawer.spec.ts`).
   - Plain SKU: reject if already at Purchase qty ("purchase qty already fully
     received").
   - **Exceed-target confirm**: scanning past `targetQty` (Expected qty) but still
     within Purchase qty opens a confirm modal; the unit is **not** counted until
     confirmed. Test: `receive-items-exceed-target-confirm.spec.ts`.
   - Below scan threshold → qty input disabled, must scan
     (`receive-items-scan-threshold.spec.ts`).
   - Draft: `saveReceivingDraft` persists received + batch/serial detail; resume
     preserves it (`receiving-draft-batch-serial-resume.spec.ts`).
5. **End receiving** — `endReceiving`. Blocks if nothing received (must receive ≥1
   or cancel). → **pending put-away**, or straight to **completed** +
   `commitReceivingStock` if put-away disabled.
6. **Put-away** (`PutAwayItemsPage.vue`):
   - `addPutAwayTask` — new task Open; each source receiving task → completed via
     `linkPutAway`. **Multi-receiving merge**: a SKU shared across bundled tasks is
     ONE merged row, qty summed (`put-away-multi-receiving-task-merge.spec.ts`,
     `create-put-away-sku-merge-across-receiving-tasks.spec.ts`).
   - `startPutAway` → In progress. `savePutAwayDraft` preserves untouched SKUs and
     partial qty (`put-away-draft-partial-qty-preserved.spec.ts`,
     `put-away-draft-save-preserves-untouched-skus.spec.ts`).
   - `endPutAway` → Completed; **commits real stock** per tracking mode (registers
     unknown batches, receives serials, or `applyStockInOut`); batch destination may
     split across multiple bins. Flips linked PO pending-put-away → **Completed**.

## 1.4 Edit order — `editInboundReceipt` (inboundSync.ts)

- **Atomic** — validates all lines first, no partial apply.
- **Per-SKU lock**: new qty must be ≥ `lockedReceivingQtyForSku` (already physically
  received); dropping below → whole edit rejected `SKU_LOCKED`.
- Existing receiving tasks are **never** touched (their `expectedQty` is a frozen
  snapshot); only the PO's own line items change.
- Logs Added/Removed/qty-diff + header-field changes; a no-op save logs nothing.
- Result reasons: `NOT_FOUND | NOT_EDITABLE | SKU_LOCKED`.
- Edge cases (`inbound-edit-order.spec.ts`): an OPEN (not-started) task does **not**
  lock; in-progress/completed task locks at received qty; completed/cancelled PO
  not editable; seed line items materialize on first edit.

## 1.5 Cancel guards & cascade

**Guards**: `canCancelReceipt` = not completed/canceled; `canCloseReceipt` = only
Partial reception (accept-as-final; user-facing Cancel is hidden for partial
reception — Close supersedes it); `canEditReceipt` = not completed/canceled.
Tests: `receipt-cancel-guard.spec.ts`.

**Cancel cascade** — `cancelInboundReceipt` (a receiving task belongs to exactly one
PO). Per receiving task:

| Task state | Action on PO cancel |
|---|---|
| **Open** | Cancel outright |
| **In progress** | Flag for acknowledge (blocks Continue receiving; ack cancels task; if `stockCommitted`, reverse stock first) |
| **Pending put-away** (no put-away task) | Marked **Completed** (received work is permanent — never Canceled) |
| **Completed + live put-away** | Put-away flagged; receiving stays Completed |
| **Completed, no live put-away** | Ack (if stockCommitted, reverse) else force-cancel |

Put-away on PO cancel: shared with a live order → drop only this order's lines +
flag (other inbounds unaffected); not shared + open → cancel; not shared +
in-progress → ack. Full truth table: `inbound-cancel-scenarios.spec.ts`
(T1.x single-task, T2.x two-task, T3.x shared-put-away), plus
`inbound-cancel-cascade*.spec.ts`, `inbound-multi-order-partial.spec.ts`.

**Put-away cancel** (standalone): `canCancelPutAway` = open/in progress; manual
cancel reverts the receiving task to "pending put-away" but keeps the canceled
put-away in linked transactions; a fresh put-away can then be created
(`putaway-cancel-reverts-receiving.spec.ts`).

---

# PART 2 — OUTBOUND (Sales Order → Picking → Packing → Shipment → Delivery)

## 2.1 Statuses

**Outgoing order** — `OutgoingStatus`: `pending → open → in progress →
partially shipped → completed → canceled` (`outgoing.ts`). Note: `"in progress"`
displays as **"In process"**.

| Status | Meaning | Primary action |
|---|---|---|
| **Pending** | No task | Create picking (or direct packing) |
| **Open** | Task(s) created, none started | Start picking |
| **In progress** | ≥1 task started | Continue picking → pack → handover |
| **Partially shipped** | Some shipped short of order qty | Create 2nd picking list for the remainder |
| **Completed** | Fully shipped | — |
| **Canceled** | Voided | Release reserved stock (manual) |

**Picking task** — `"open" | "in progress" | "partially picked" | "completed" | "canceled"`.
**Packing task** — `"open" | "in progress" | "completed" | "canceled"`.
**Delivery task** — `"ready to ship" | "out for delivery" | "shipped" | "canceled"`.
**Shipment doc** — `"open" | "completed"`.

### Status derivation (`syncOutboundOrderStatuses`, outboundSync.ts)
- shippedTotal > 0 → **completed** (≥ orderQty) or **partially shipped**.
- Any delivery, or packing in progress/completed, or picking started → **in progress**.
- Picks/packs exist, none started → **open**. None → **pending**.
- Canceled stays canceled (shippedQty zeroed). Once an order has an ended task it
  never falls back. Test: `outgoing-status-flow.spec.ts`.

## 2.2 Stock / reservation timing (outbound) — the core model

- **Reserve at allocation**: any order in `pending | open | in progress |
  partially shipped` gets stock **reserved** (`reserveOrder` → `reserveStock`).
  Reservation lowers Available but **not** on-hand. Never double-reserves
  (subtracts already-reserved and already-shipped per SKU).
- **Deduct at dispatch (shipment completion)**: on-hand is deducted **only** at
  `completeShipment` (`applyStockInOut(-qty)` + `consumeReservation`). Handover
  ("out for delivery") does **not** deduct on-hand — the parcel is still cancellable.
- **Invariant** asserted throughout the tests: `available = onHand − reserved`
  (`outbound-e2e-scenarios.spec.ts`, `outbound-cancel-release-reserved.spec.ts`).

## 2.3 Process — step by step

1. **Order intake** — `addOutgoing` (Manual/Marketplace/POS/etc.). Status **Pending**.
2. **Create picking list** — `CreatePickingPage`, `addPickingTask`. One task can
   bundle ≥1 order from the **same warehouse**. Reservation plan frozen as
   `plannedBatchPicks`/`plannedSerialPicks`. → order **Open**.
3. **Start picking** → In progress.
4. **Pick items** (`PickItemsPage.vue`, `resolveScan` maps Batch/Serial/SKU→SKU):
   - **Guards**:
     - A serial reserved for **another** order is rejected ("already reserved for
       another order"); the order's own reserved serials remain pickable
       (`pick-items-scan-serial-guards.spec.ts`,
       `manage-serial-drawer-hide-foreign-reserved.spec.ts`).
     - **Batch overscan cap**: can't pick more than physically available + own
       reserved units of that batch (`pick-items-scan-batch-guard.spec.ts`,
       `manage-batch-drawer-picking-overscan-cap.spec.ts`).
     - **Serial dedupe** across shared orders on one pick (same physical unit can't
       be counted twice).
   - Below scan threshold → must scan (`pick-items-scan-threshold.spec.ts`).
   - Scanning a tracked SKU opens its Manage drawer; active-bin scan supported.
   - **Reserved-batch retention (fix)**: at Save/Finish, `buildAssignments` keeps
     **every reserved batch** — a batch reserved for the order but not re-counted
     keeps its reserved qty (mirrors how serial picks always retain reserved
     serials). Prevents a reserved-but-untouched batch from silently vanishing from
     the packing drawer downstream.
5. **End picking** — `endPicking`. Fully picked → **completed**; short → **partially
   picked** (allowed for any order; the marketplace full rule is enforced at
   **packing**, not here). Re-pins each (order, SKU) reservation to what was actually
   picked. Short finish → confirm modal ("Finish picking with a short pick?"). There
   is **no free-text short-pick reason** captured — a short pick simply yields
   "partially picked".
   - **Packing eligibility** (`packableOrderIds`): marketplace ⇒ order fully picked
     across tasks; non-marketplace ⇒ any picked qty > 0; cancelled orders excluded.
     A not-fully-picked marketplace list is badged "Not packable" and must not vanish
     (`create-packing-blocked-picking-list.spec.ts`).
6. **Packing / Match order** (`PackItemsPage.vue`): one task = one order.
   - **Scan verification (match order)** — batch/serial-tracked lines are
     **scan-only**; every scan is validated against what was picked:
     - serial must be one **picked for this order** (else "serial not picked");
       can't scan the same serial twice.
     - batch must be a **picked batch**, capped at the qty picked from it (over-scan
       rejected).
     - scanning a bare SKU on a tracked line opens the read-only View drawer.
     - **Finish is blocked** until every tracked line is fully verified ("Scan every
       serial/batch number to verify it matches the pick before finishing").
     - a resumed draft pre-seeds verification for already-packed units (no rescan).
     - In-drawer scanning works too (ViewBatch/ViewSerial drawers show a
       Verified badge / "Verified x/y").
     - Tests: `pack-items-scan-verify.spec.ts`, `pack-items-scan.spec.ts`.
   - **Marketplace full-pack rule**: a marketplace order can only finish when every
     line is packed in full (short rows flagged); non-marketplace may short-pack.
   - `commit` → `endPacking`, then hands straight to delivery
     (`addDeliveryTaskFromPackingTasks`, status **ready to ship**) — there is **no
     separate "Create shipment" step from the packing screen**; marketplace orders
     arrive with courier/tracking already fixed.
7. **Create shipment** — `HandoverToCourierPage` (bulk from selected deliveries) or
   `NewShipmentPage` (scan packing nos.):
   - **Courier is REQUIRED; tracking no. is OPTIONAL.** Save is blocked until every
     delivery has a courier; rows missing one are flagged + an error toast shows.
     Marketplace deliveries pass (courier pre-set). Test:
     `create-shipment-courier-required.spec.ts`.
   - **Courier picker is sourced from master data** (`couriers.ts`, searchable) — no
     free-text custom courier.
   - **Assignee auto-defaults** to the signed-in user when they're a member of that
     warehouse team (editable; picker is the full warehouse team). Empty when the
     signed-in user isn't a member (e.g. back-office in ERP mode).
   - **Split by courier**: `handoverToCourierBulk` groups the selected deliveries by
     courier and mints **one shipment doc per distinct courier** — a mixed-courier
     batch becomes several shipments. Each delivery → **out for delivery**,
     shipment doc **open**, on-hand **not** deducted yet. Test:
     `handover-courier-split.spec.ts`.
8. **Delivery / completion**:
   - **out for delivery** = with the courier, shipment doc open, still cancellable,
     on-hand not deducted.
   - `completeShipment` (`ShipmentDetailsPage`, on proof of delivery) → deliveries
     **shipped**, shipment doc **completed**; **on-hand deducted + reservation
     consumed**; records receivedDate/receivedBy/note/`proofFile`. Applies to all
     deliveries under that shipment no. together.
   - **Shipped index** (`ShippedIndexPage`, "Shipping document" tab) lists one row
     per shipment doc and has a **Courier column + Courier filter**.

## 2.4 Edit order — `editOutboundOrder` (outboundSync.ts)

Juggles reservations (unlike inbound). Atomic (no partial apply).
- Increases need allocatable stock (`NO_ALLOCATABLE_STOCK`).
- Reductions across pending picking tasks go through an allocation step
  (`proposeSkuReduction` / AllocateReductionModal): reductions must sum exactly
  (`INVALID_ALLOCATION`) and not exceed removable (`REDUCTION_EXCEEDS_REMOVABLE`);
  reduce unassigned first, then pending tasks.
- **Started** tasks (in progress / partially picked / completed) lock their qty
  (`lockedOutboundQtyForSku`) → `SKU_LOCKED`.
- Tests: `outbound-edit-order.spec.ts`, `outbound-edit-order-allocation.spec.ts`.

## 2.5 Cancel guards, cascade & release-reserved

**Guards**: `canCancelOutboundOrder` = not canceled **and** shippedQty === 0 (a
completed/partially-shipped order is posting-locked).

**Cancel cascade** — `cancelOutboundOrder` (order marked canceled first). Reasons:
`NOT_FOUND | OUTBOUND_ALREADY_SHIPPED | OUTBOUND_CANNOT_CANCEL_COMPLETED`.

| Stage | On order cancel |
|---|---|
| **Picking** | Shared with another live order → never cancelled (completed stays; open → drop this order's lines silently; in-progress/partially-picked → flag for ack). Sole order not completed → force-cancel. Sole + completed → stays (reserved returns via manual release). |
| **Packing** | Completed stays; else force-cancel |
| **Delivery** | Cancel while ready-to-ship / out-for-delivery; shipped is posting-blocked |

Continue picking on a flagged task opens an ack modal (no navigation) until
acknowledged (`picking-continue-ack-gate.spec.ts`). Full matrix:
`outbound-cancel-scenarios.spec.ts` (+ `-packing-block`, `-multi-partial`,
`-pick-pack-edge-cases`, `picking-packing-cancel.spec.ts`).

**Release reserved (after cancel)** — cancel does **not** auto-release reservation;
reserved stays out of Available until a manual release:
- `canReleaseReservedForOrder` = canceled + not yet released + shippedQty 0 + still
  holds reservation.
- `releaseReservedForCancelledOrder` returns un-shipped reserved qty to Available;
  **on-hand never moves**; idempotent; batch-level granularity. A
  partially-shipped-then-cancelled order refuses release (no over-return).
  Tests: `outbound-cancel-release-reserved.spec.ts`.

**Delivery / shipment cancel**: `canCancelDeliveryTask` = ready-to-ship or
out-for-delivery (parcel can still come back); a completed-shipment "shipped"
delivery is terminal. An out-for-delivery delivery cancelled from a **shared**
shipment stays attached (prompts an acknowledge that detaches it) while the other
deliveries in that shipment are unaffected.

---

# PART 3 — EDGE CASES & GUARDS (quick index)

### Inbound
- Received short + no put-away → **In progress**, not Partial reception (`stockCommitted`).
- Exceed "Expected qty" (targetQty) but within Purchase qty → confirm modal; not counted until confirmed.
- Never receive past Purchase qty (`expectedQty` ceiling).
- Second receiving task caps to the real remainder, not full Purchase qty again.
- Edit locks a SKU at already-received qty; open (not-started) task doesn't lock.
- PO cancel: pending-put-away receiving → Completed (not Canceled); shared put-away → only this order's lines dropped.
- Put-away multi-task SKU merge; draft preserves untouched SKUs & partial qty.

### Outbound
- `available = onHand − reserved` invariant everywhere.
- Reserve at allocation; deduct on-hand only at shipment completion.
- Serial reserved-for-another-order rejected; own reserved pickable; foreign reserved never shown as a row.
- Batch overscan cap; serial dedupe across shared orders.
- **Reserved batch retained** at Finish even if not re-counted (fix) — mirrors serials.
- Packing scan verification: SN/batch must match the pick; Finish blocked until fully verified.
- Marketplace order must pack in full; non-marketplace may short-pack.
- Courier required at shipment creation; tracking optional; courier only from master data.
- Mixed-courier handover splits into one shipment doc per courier.
- Cancel doesn't auto-release reservation; manual release returns un-shipped qty only; partially-shipped-then-cancelled refuses release.
- Partial ship then ship remainder — shippedQty never double-counts (`partial-shipment-repeat-cycle.spec.ts`, `outbound-e2e-scenarios.spec.ts`).
- Assignee prefills only when the signed-in user is a warehouse-team member.

### Cross-cutting
- Unsaved-changes guard on every execution page; execution commits disable it before navigating.
- Scan is case-insensitive; below the warehouse scan threshold, qty entry is disabled (scan-only).
- PDF outputs for picking / packing / receiving / put-away slip / shipment.

---

# PART 4 — Canonical files

- **Inbound**: `receipts.ts`, `receivingTasks.ts`, `putAwayTasks.ts`,
  `inboundSync.ts`, `warehouseConfig.ts`; pages `ReceiveItemsPage.vue`,
  `PutAwayItemsPage.vue`, receipt/receiving/put-away index & detail pages.
- **Outbound**: `outgoing.ts`, `outboundSync.ts`, `pickingTasks.ts`,
  `packingTasks.ts`, `deliveryTasks.ts`, `couriers.ts`; pages `PickItemsPage.vue`,
  `PackItemsPage.vue`, `HandoverToCourierPage.vue`, `NewShipmentPage.vue`,
  `ShippedIndexPage.vue`, `ShipmentDetailsPage.vue`, `ViewBatchDrawer.vue`,
  `ViewSerialDrawer.vue`.
- **Router**: `app/pages/[...slug].vue`.

---

_Generated as an as-built reference from the code and test suite. Each cited
`*.spec.ts` re-verifies the behavior; run `npm test` to check the whole set._
