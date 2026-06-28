# Inbound — Complete Scenario (end-to-end)

**Status: IMPLEMENTED & VERIFIED.** The PO → receiving task → put-away state machine,
per-SKU coverage, PO-status derivation, localStorage persistence, and all linked
detail views are live. See [§12](#12-implementation-status) for the remaining polish list.

This document is the single source of truth for the **Barang masuk (inbound)** flow:
Purchase Order (Receipt) → Receiving Task → Put-away Task. It defines every status,
transition, rule, edge case, and how the mock data is wired so every record
can be traced end-to-end with synchronized data.

> Scope note: the **operator's put-away *start/end*** sub-flow is intentionally
> **out of scope** for this pass (see [§9](#9-out-of-scope-this-pass)). Everything up to
> "put-away task created (Open)" is in scope.

---

## 1. Actors

| Actor | Responsibility |
|---|---|
| **Admin Gudang** | Opens an arrived PO, creates & assigns receiving tasks (can exclude SKUs), creates put-away tasks, cancels an un-started PO, closes a partial reception. |
| **Operator** | Opens an assigned task, Starts receiving, inputs received qty per SKU, saves draft, Ends receiving. |

> **Roles are NOT gated in this prototype** (confirmed): every action is available in
> every scenario (ERP, WMS Standalone, WMS Ops). The table above documents intent only.

---

## 2. Entities & data model (per-SKU graph)

The three entities form **one owned chain**. A SKU line is the unit that makes the
whole thing traceable and lets PO status be *derived* rather than stored.

```
Receipt (PO)
 ├─ id: "rcv-001"                              ← seed IDs
 ├─ number: "RCV-2026-0001"                    ← display receipt number
 ├─ purchaseNo: "Purchase Order #10090"         ← source PO (ERP) or "#PO060" (Desty)
 ├─ warehouseId / warehouseName
 ├─ status: "on the way" | "partial reception" | "completed" | "canceled"
 ├─ skuQty, purchaseQty, receivedQty           ← receivedQty updated by recomputeReceiptStatus()
 ├─ estimatedArrival, receivedDate?, canceledDate?, memo, trackingNos[], vendor?
 └─ lineItems (derived via lineItemsForReceipt())
        └─ [{ sku, productName, unit, purchaseQty }]   ← seeded from CATALOG by receipt hash

ReceivingTask
 ├─ id: "rtask-10090"  (seed) / "rtask-30000+"  (user-created)
 ├─ taskNo: "Receiving #10090"
 ├─ receiptId, purchaseNo                      ← links back to PO
 ├─ warehouseId / warehouseName / assignee
 ├─ status: "open" | "in progress" | "pending put-away" | "completed"
 ├─ createdDate?, startDate?, endDate?         ← real wall-clock; createdDate stamped at creation
 ├─ putAwayTaskId?                             ← set when a put-away consumes this task
 └─ items: [ReceivingItem]                     ← per-SKU source of truth
        └─ { sku, productName, unit, expectedQty, receivedQty }

PutAwayTask
 ├─ id: "pa-0" (seed) / "pa-new-{seq}" (user-created)
 ├─ taskNo: "Put-away #20090"
 ├─ receivingTaskIds: [...]                    ← one or more (bundling allowed)
 ├─ receivingTaskNos: [...]                    ← for display only
 ├─ warehouseId / warehouseName / assignee
 ├─ itemQty                                   ← Σ receivedQty of bundled receiving tasks
 ├─ destination: "A-01-01"                    ← bin / storage location
 └─ status: "open" | "in progress" | "completed"
```

### Key consequences

- A Receipt knows its **full SKU list** (from `lineItemsForReceipt()`); a receiving task
  knows **which subset** it covers and **how much was received** per SKU.
- **PO status is derived** (never stored independently) via `recomputeReceiptStatus()`.
- A receiving task is **Completed** the moment a put-away task references it.
- `receivedQty` on the Receipt is updated by `recomputeReceiptStatus()` (Σ received
  across ended tasks).
- `receivingPOs` is a **derived reactive array** rebuilt from the flat `receivingTasks`
  store — not an independent source.
- All derived scalar fields on a task (`skuScope`, `skuCount`, `purchaseQty`,
  `receivedQty`) are always re-synced by `syncTaskTotals()`.

---

## 3. Status lifecycles

### 3.1 Receipt / PO

**Data model status string** → **UI display label:**

| Data | UI label |
|---|---|
| `"on the way"` | Open |
| `"partial reception"` | Partial reception |
| `"completed"` | Completed |
| `"canceled"` | Canceled |

```
        create (PO raised)
              │
              ▼
          ┌──────────┐   first task END; some SKU qty short   ┌──────────────────┐
          │ on the   │ ──────────────────────────────────────▶ │ partial reception│
          │  way     │                                          └──────────────────┘
          └──────────┘                                                │         │
              │   │                                      later task(s)│         │ Admin
   cancel     │   │ all SKUs received in full (one or                 │ fill    │ closeReceipt()
 (nothing     │   │ more task ENDs; every SKU ≥ purchaseQty)         │ all     │
  received)   │   ▼                                                   │ gaps    │
              │ ┌───────────┐ ◀─────────────────────────────────────────────────┘
              ▼ │ completed │
        ┌──────────┐ └───────────┘
        │ canceled │
        └──────────┘
```

**Derivation algorithm** (runs on every `endReceiving()` call):
```
received[sku] = Σ receivedQty  across all tasks where status ∈ { pending put-away, completed }
if every PO sku: received[sku] >= purchaseQty[sku]  → "completed"
else if at least one task has ended                  → "partial reception"
else                                                 → "on the way"  (stays Open)
```

> **PO status reflects receipt completeness only — independent of put-away.**
> A PO can be `"completed"` while its receiving task is still `"pending put-away"`.

### 3.2 Receiving Task

```
 create        Start receiving        End receiving         put-away created
(Admin)        (Operator)             (Operator)            (Admin)
   │                │                      │                    │
   ▼                ▼                      ▼                    ▼
┌──────┐       ┌─────────────┐      ┌──────────────────┐   ┌───────────┐
│ open │ ────▶ │ in progress │ ───▶ │ pending put-away │ ─▶│ completed │
└──────┘       └─────────────┘      └──────────────────┘   └───────────┘
  createdDate    startDate (now)      endDate (now)          putAwayTaskId set
```

| Status | What it means | Actions available |
|---|---|---|
| `open` | Created & assigned; not started | Admin: Edit, Delete · Operator: Start receiving |
| `in progress` | Receiving started; entering qty | Operator: Input qty, Save draft, End receiving |
| `pending put-away` | Receiving ended; awaiting put-away | Admin: Create put-away |
| `completed` | Put-away task has consumed this task | — |

### 3.3 Put-away Task

| Status | Meaning |
|---|---|
| `open` | Created from ≥1 `pending put-away` receiving task. Source tasks → `completed`. |
| `in progress` | Operator started put-away. *(Functions exist; operator UX not yet built.)* |
| `completed` | Operator ended put-away. *(Deferred.)* |

---

## 4. Creating receiving tasks (Admin)

Triggered from **PO detail → "Create receiving task"** button / kebab.

Rules:
1. A new task is created with status `open`, `createdDate = now()`, assigned to one operator.
2. Admin may **exclude SKUs** — the task covers only the included SKUs.
3. **Coverage rule:** a SKU is *covered* once it belongs to any non-deleted task
   (open or later). Admin may create another task **only while uncovered SKUs remain**.
   When every SKU is covered, "Create receiving task" should be disabled
   (`canCreateReceivingTask()` returns `false`).
4. Creating a task **does not change PO status** — PO stays `"on the way"` (or
   `"partial reception"` if it already was).
5. A `"partial reception"` PO can still receive new tasks for its uncovered SKUs.
6. The create form pre-fills only the **uncovered SKUs** (`uncoveredLineItems(receiptId)`).

---

## 5. Operator receiving flow

1. Operator opens the task, clicks **Start receiving** → status `in progress`,
   `startDate = now()`.
2. Operator inputs **received qty per SKU** in the modal.
3. **Save draft** persists progress (`saveReceivingDraft()`); status stays `in progress`.
4. **End receiving** (`endReceiving()`):
   - Final received qty written per SKU.
   - Status → `pending put-away`, `endDate = now()`.
   - `recomputeReceiptStatus()` re-derives PO status.
5. PO status becomes `"completed"` or `"partial reception"` depending on totals.

> **Timestamp rule:** `startDate`, `endDate`, `createdDate` all use real wall-clock
> (`new Date()`), so they reflect when the action was actually performed. Seed tasks use
> deterministic offsets from TODAY (e.g. `isoAt(-3, 8, 30)`) so demo data has
> plausible-looking timestamps.

---

## 6. Partial reception → continue

- After an END that leaves gaps, PO becomes `"partial reception"`.
- Admin creates additional task(s) for uncovered SKUs.
- Next END may re-derive PO to `"completed"`.
- If remaining SKUs are simply never received, PO **stays `"partial reception"`** — valid
  terminal state.
- Admin can also **close the receipt** via `closeReceipt()` to accept the partial as
  final — this forces status to `"completed"` even with receivedQty < purchaseQty.

---

## 7. Put-away creation (Admin)

- From the PO detail's **Put-away** tab, or from the Put-away index "Create put-away".
- Only receiving tasks with status `"pending put-away"` are eligible.
- A put-away task **may bundle several** `pending put-away` tasks (same warehouse).
- Each referenced receiving task → `completed` (via `linkPutAway()`).
- The put-away task is created with status `open`, carrying
  `itemQty = Σ receivedQty` of all bundled tasks.
- `destination` defaults to `"Unassigned"` until the operator assigns a bin.
- *(Operator start/end — out of scope this pass.)*

---

## 8. Seed data — states demonstrable in the app

The seed generates ~42 active receipts + 7 canceled ones across 10 warehouses.
From those, receiving tasks are seeded to cover all 8 states below.
All linked records share the **same warehouse, SKUs, and quantities**.

| State | PO status | Receiving tasks | Put-away |
|---|---|---|---|
| **A** | `on the way` — arrived, no task | none | — |
| **B** | `on the way` — task created, not started | 1× `open` | — |
| **C** | `on the way` — operator receiving | 1× `in progress` (start ts, partial qty) | — |
| **D** | `completed` — fully received, awaiting put-away | 1× `pending put-away` (full qty) | — |
| **E** | `completed` — received & put away | 1× `completed` | 1× `open` put-away |
| **F** | `partial reception` — short qty | 1× `pending put-away` (qty < expected) | — |
| **G** | `partial reception` — split tasks | task1 `pending put-away` (subset SKUs) + task2 `open` (rest) | — |
| **H** | `canceled` | none | — |

**Seed IDs:**
- Receipts: `rcv-001` … `rcv-042` (active), `rcv-cx-001` … `rcv-cx-007` (canceled)
- Receiving tasks: `rtask-10090` … (sequential; one or two per receipt that has tasks)
- Put-away tasks: `pa-0`, `pa-1`, … (one per active warehouse with a pending task)
- User-created: `rcv-new-{n}`, `rtask-30000+`, `pa-new-{seq}`

**Assignees:** always `picForWarehouse(warehouseId, seed)` — warehouse PIC, deterministic.

---

## 9. Out of scope (this pass)

- Operator **Start / End put-away** (timestamps, per-SKU qty, bin assignment). Functions
  exist (`startPutAway`, `savePutAwayDraft`, `endPutAway`) but the operator UX is not built.
- Roles / permissions enforcement (all actions available in all scenarios).

---

## 10. WMS scenario scoping

| Scenario | Warehouses visible | Operator persona |
|---|---|---|
| ERP | All warehouses | Rizal Candra (admin view) |
| WMS Standalone | All warehouses | Rizal Candra |
| WMS Ops 1 | `wh-001` (Gudang Jakarta Pusat) | Budi Santoso |
| WMS Ops 2 | `wh-006` (Gudang Makassar) + `wh-010` (Gudang Makassar Utara) | Agus Firmansyah |

Header operator name and all task assignees reflect the active scenario's warehouse PIC.

---

## 11. Persistence model

```
localStorage key          type        strategy
erp-db:receipts           snapshot    full array; mutated by recomputeReceiptStatus()
erp-db:receiving          snapshot    full array; mutated by start/end/linkPutAway
erp-db:putaway            snapshot    full array; mutated on create
```

- **Snapshot strategy:** the entire entity array is written on every mutation.
  Seed records are mutated (status changes, qty updates), so append-only persistence
  is insufficient.
- **Load order:** `loadSnapshot(key)` → if `null` (first run), regenerate seed and
  call `initInbound()` which derives PO statuses and writes both snapshots.
- **Reset:** "Reset demo data" in the account menu calls `resetDb()` which clears all
  `erp-db:*` keys, then `window.location.reload()`.

---

## 12. Status badge reference

Uses [ErpStatusBadge](../patterns/ErpStatusBadge.md).

| Entity | Status (data) | UI label | Badge colour |
|---|---|---|---|
| PO | `on the way` | Open | yellow (warning) |
| PO | `partial reception` | Partial reception | blue (information) |
| PO | `completed` | Completed | green |
| PO | `canceled` | Canceled | gray (announcement) |
| Receiving task | `open` | Open | yellow |
| Receiving task | `in progress` | In progress | yellow |
| Receiving task | `pending put-away` | Pending put-away | yellow |
| Receiving task | `completed` | Completed | green |
| Put-away | `open` | Open | yellow |

---

## 13. Key export reference

### `app/data/receipts.ts`
| Export | Description |
|---|---|
| `receipts` | Reactive array of all receipts (snapshot-persisted) |
| `addReceipt(data)` | Create a new receipt (`rcv-new-{n}`), persists, returns it |
| `closeReceipt(id)` | Force `"completed"` on a partial reception |
| `persistReceipts()` | Write snapshot — called by `recomputeReceiptStatus()` |
| `receiptsForStage(stage, warehouseIds?)` | Filter by stage label |
| `receiptCountsByStage(warehouseIds?)` | Live badge counts |

### `app/data/receivingTasks.ts`
| Export | Description |
|---|---|
| `receivingTasks` | Reactive flat array of all tasks |
| `receivingPOs` | Derived reactive grouping by receipt |
| `createReceivingTask(opts)` | Admin creates Open task for chosen SKUs |
| `startReceiving(taskId)` | → In progress + startDate |
| `saveReceivingDraft(taskId, received)` | Persist mid-flight qty, stay In progress |
| `endReceiving(taskId, received?)` | → Pending put-away + endDate; re-derives PO status |
| `linkPutAway(taskId, putAwayTaskId)` | → Completed; called by `addPutAwayTask` |
| `recomputeReceiptStatus(receiptId)` | Re-derive PO status from ended tasks |
| `uncoveredLineItems(receiptId)` | PO SKUs not yet in any task |
| `canCreateReceivingTask(receiptId)` | `true` when uncovered SKUs remain |
| `receivedSummaryForReceipt(receiptId)` | Per-SKU `{ received, assignee }` from ended tasks |
| `receivingTasksForReceipt(receiptId)` | All tasks for a receipt |
| `taskAgingDays(task)` | Days since start (for aging badge) |

### `app/data/putAwayTasks.ts`
| Export | Description |
|---|---|
| `putAwayTasks` | Reactive array of all put-aways |
| `addPutAwayTask(opts)` | Create put-away + mark source tasks Completed |
| `getPutAwayForReceipt(orderId)` | Put-aways scoped to this receipt's own tasks |
| `putAwayTasksFor(warehouseIds?)` | Filter by warehouse |
| `putAwayOpenCount(warehouseIds?)` | Badge count |

### `app/data/receiptLineItems.ts`
| Export | Description |
|---|---|
| `lineItemsForReceipt(receipt)` | SKUs for a receipt — picked deterministically from CATALOG by `receipt.id` hash |
| `BINS` | 20 standard bin locations (A-01-01 … D-04-02) |

### `app/data/persist.ts`
| Export | Description |
|---|---|
| `loadSnapshot<T>(key)` | Read full entity array or null |
| `saveSnapshot<T>(key, arr)` | Write full entity array |
| `loadCreated<T>(key)` | Read append-only user-created records |
| `saveCreated<T>(key, items)` | Write append-only user-created records |
| `resetDb()` | Clear all `erp-db:*` localStorage keys |

---

## 14. Implementation status

### Done & verified end-to-end

- Per-SKU inbound graph: Receipt → ReceivingTask(items[]) → PutAway — same warehouse,
  SKUs, and quantities; fully traceable with working detail-page links.
- PO status derived (`"on the way"` / `"partial reception"` / `"completed"`) from ended
  receiving tasks; `receivedQty` updated on every derivation.
- `receivedSummaryForReceipt()` drives the receipt detail's "Received qty" and
  "Received by" columns — keyed by SKU code, not positional index.
- Create receiving task → `open`, covering only **uncovered SKUs**
  (`uncoveredLineItems()` pre-fills the form).
- Operator: **Start receiving** (→ in progress + real startDate) · per-SKU qty input
  modal · **Save draft** · **End receiving** (qty-mismatch confirm modal) → pending put-away.
- Create put-away (bundles ≥1 pending task) → put-away `open`; source receiving tasks
  → `completed`; PO detail "Put-away" tab count correct.
- `getPutAwayForReceipt()` scoped to the receipt's own receiving task IDs — no
  cross-contamination between receipts of the same warehouse.
- Full snapshot persistence (`erp-db:receipts` / `:receiving` / `:putaway`); "Reset
  demo data" clears all and reloads.
- Real wall-clock timestamps on Start/End receiving and task creation.
- Assignee column in Put-away index.
- `skuScope` shows bare integer (e.g. `"3"`), not "All SKUs".
- `createdDate` on task → "Date" column in PO's Purchase receiving tab (never "--").
- PO status re-reads from live `receipts` array in ReceivingTaskDetailsPage — no
  stale local computed.
- 8 seed states (A–H) present across the receipts; all linked records consistent.
- Canceled receipts: separate `rcv-cx-*` IDs; 7 seed canceled POs.
- `closeReceipt()` — Admin accepts a partial as final (forces `"completed"`).

### Pending polish

- **Autosave** during qty entry (currently manual Save draft only).
- **Disable "Create receiving task"** entry points when `canCreateReceivingTask()` is
  false (function exists; not yet wired to the button/kebab).
- **Block edit/delete** of In-progress+ tasks (admin guardrail — UI only; data model
  ready: delete = remove from store, edit = update fields).

### Out of scope (as agreed)

- Operator put-away Start/End UX. Data functions (`startPutAway`, `endPutAway`) exist
  but the operator-facing page is not built.
