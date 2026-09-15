# Batch Traceability Report — prototype implementation plan

**Source PRD:** [[PRD] INV - Batch Traceability Report](https://jurnal.atlassian.net/wiki/x/OQMj8Qs) — v1.0, owner Fitriani Meizvira, status *FOR DISCUSSION*
**Related plan:** [batch-attribute-plan.md](batch-attribute-plan.md) (this report reads the batch attributes built there)
**Branch:** `feat/batch-traceability-report`, stacked on `feat/batch-attribute` — open its PR against `feat/batch-attribute`, then retarget to `main` once that merges.
**Scope:** the Mekari ERP prototype (this repo), ERP brand, web UI.

---

## 1. Screens

| # | Screen | Route | Patterns |
|---|--------|-------|----------|
| 1 | Report — **By batch** | `/inventory-report/batch-traceability` | full-bleed report shell · pill mode switch · filter bar + All filters drawer · `ErpTablePage` · `ExportModal` |
| 2 | Report — **By transaction** | same page, other mode | same shell · selectable transaction table (checkbox in first cell) · second table of batches in the selected transactions |
| 3 | Batch traceability detail | `/inventory-report/batch-traceability/:sku/:batchNo` | detail shell · `ContentList` · stock table + storage-location drawer · journey table (expandable rows) · related-batch tables · Activity log |

Entry: a new **Batch traceability** card on Reports › Inventory (`InventoryReportsIndexPage.vue`).

Decisions:
- **The two searches are a mode, not two filter groups on screen.** A pill segmented control (`rule/segmented-control-pill`) above the filter bar; switching clears filters and selection (PRD story 6).
- **The detail page is a new page**, not an extension of `BatchDetailsPage.vue` (the product's batch master page). Different job: stock position, journey, related batches.
- **UI says Vendor**, not Supplier (Batch Attribute plan D2).

## 2. Build phases

| Phase | Scope | Status |
|-------|-------|--------|
| **0 — Data** | `app/data/batchTraceability.ts` + `tests/batch-traceability.spec.ts` | **Done** (see §3) |
| 1 — Report, by batch | card, route, mode switch, filters + drawer, table, empty/loading states | — |
| 2 — Report, by transaction | transaction filters, selectable table, batches table, selection rules | — |
| 3 — Detail | 4 sections, entry-point highlight, return breadcrumb, related-batch drill-through | — |
| 4 — Export | `ExportModal` at the 3 entry points, applied filter in the file header | — |
| Later (SHOULD HAVE) | attribute change trail in the journey (story 9, via `batchActivityFor`) · visual journey (story 11) | — |

## 3. Phase 0 — as built

**Why a ledger of its own.** `getBatchTransactions` is a generic movement list with no counterparty, warehouses, Work order links or attribute snapshot. `batchTraceability.ts` seeds one movement per transaction that touches a batch, carrying all of them.

**Anchored to the real batches.** Every stocked batch from `getProductBatches` gets a journey whose running balance ends at the batch's on-hand, so the report agrees with Product details. Seeded story per batch (deterministic from the batch id):
- receipt — **Purchase delivery** from the batch's Vendor, or **Work order** output for a roasted batch
- optional **Purchase return**
- **Warehouse transfer** to a second warehouse
- **Sales delivery** from each warehouse
- **Work order** consumption (green beans → roasted beans, via `ROAST_SOURCES`)
- optional **Sales return**, **Stock in/out**, **Stock count**

Receipt quantities are solved backwards so no warehouse goes negative.

**Per-warehouse stock comes from this ledger**, not `getBatchWarehouseStock` — that proportional split doesn't sum back to the batch total (e.g. 1001 Batch #001: warehouses sum to 38, total is 36). Totals agree; only the breakdown differs.

**Attribute snapshots.** Each movement records attribute values. A graded batch's receipt carries a different grade than today (1001 Batch #001/#002), so the "value at the time of this transaction" indicator has real data.

**Work order links.** Roasted batches (1101–1106) are produced from green-bean batches. 1106 consumes two batches of 1007 (separate lines). 1003 and 1004 are never roasted (empty related batches).

**API** (all pure reads; attributes and batch numbers read live, only the seeded history is frozen):

| Function | For |
|----------|-----|
| `searchBatches(filter, access)` | By batch table — All warehouse = 1 line/batch; selected warehouses = 1 line per selected warehouse the batch moved through |
| `searchTransactions(filter)` | By transaction table — newest first, unpaginated |
| `batchesInTransactions(numbers, access)` | second table — 1 line per transaction + batch, snapshot attributes |
| `getBatchTrace` · `batchStockPosition` · `batchJourney` · `relatedBatches` | detail sections |
| `attributeCell` · `isAttributeAvailable` | NA / empty / value cells; greyed-out filters |
| `mutationDirection` · `hasOriginWarehouse` · `hasDestinationWarehouse` · `txModule` · `reconcile` | PRD rules |
| `traceProductOptions` · `traceBatchNumberOptions` · `traceTransactionNumberOptions` | filter options |

`TraceabilityAccess` (`batchAttribute`, `dualUnit`) simulates entitlement; the ERP brand passes `FULL_ACCESS`.

**Not seeded (types exist, sign rule covered by tests):** Purchase invoice, Sales invoice, Reversal — invoice + delivery would double count (open question 7). **Not modelled:** storage locations (Phase 3 drawer), deleted transactions, the Jurnal "Unassigned warehouse".

**Tests** (`tests/batch-traceability.spec.ts`, 31):
- every journey ends at on-hand, oldest first; warehouses never negative and sum to the total; Received − Issued = On hand; mismatch helper
- created qty-0 batch → empty journey/position; unknown batch → nothing
- sign rule per type; origin/destination/counterparty per type
- attribute cells incl. no-add-on access; Expiry never NA
- By batch: All warehouse lines, sort, Product AND Batch number, Vendor/Grade OR, expiry before/after/between incl. month precision, per-warehouse split, secondary unit NA rules
- By transaction: unique + newest first, Customer→sales only, Vendor→purchase only, types OR, origin/destination type limits, date
- batches in transactions: empty with no selection, Work order +/−, same batch in 2 transactions = 2 lines, snapshot attributes
- detail: changed-attribute flag, creating transaction, secondary balances, related batches both ways, same-product twins, none for unroasted

## 4. Open questions for PM

Interim behaviour in brackets.

1. **Total Received / Total Issued formulas** — PRD says "xxx". [Received = in-direction movements, Issued = out-direction; transfers and stock counts in neither.]
2. **First transaction table columns** — "Transaction date" listed twice. [Second slot = Transaction type.]
3. **Default sorts vs `rule/table-default-newest-first`** — batches-in-transactions is Product A–Z and the journey is oldest-first per PRD. [Follow the PRD, record as exceptions.]
4. **By batch, selected warehouses** — "queries where the batch currently holds stock" vs "never transacted → empty". [One line per selected warehouse the batch moved through, on-hand may be 0.] Also: Storage location column or detail-drawer only?
5. **Before any filter is set** — show all on-hand batches, or prompt to filter? [Show all.]
6. **Warehouse switcher on the journey** (PRD TBD). [Not in v1.]
7. **Invoice + delivery double count** — both are "+". [Invoices not seeded.]
8. **Link from the product's batch page** to the traceability detail? [Not yet.]

## 5. Verification (each phase)

- `npm test` (incl. `tests/batch-traceability.spec.ts`).
- UI phases: `npm run pixel:fix:check`; walk reachable states on dev (4321); `npm run build && npm run preview -- --port 4322`.
