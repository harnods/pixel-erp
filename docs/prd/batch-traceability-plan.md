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
| 1 — Report, by batch | card, route, mode switch, filters + drawer, table, empty/loading states | **Done** (see §3b) |
| 2 — Report, by transaction | transaction filters, selectable table, batches table, selection rules | **Done** (see §3c) |
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

## 3b. Phase 1 — as built

**Entry:** Reports › Inventory gets a **Batch traceability** card → `/inventory-report/batch-traceability` (`[...slug].vue` detailMatch, exact 2-segment match so Phase 3's detail route can't collide).

**Page** `BatchTraceabilityReportPage.vue` — full-bleed title bar (Reports breadcrumb) + stage, same shell as the Dual Unit report.
- **Mode switch:** pill `MpSegmentedControl` *By batch | By transaction*; switching resets every filter (story 6). *By transaction* shows a "Coming soon" state until Phase 2.
- **Filter bar** (`ErpTablePage` `#filters`): Product · Batch number · Warehouse (`MultiSelectDropdown`; Warehouse has an "All warehouse" select-all — none or all ticked = All warehouse) · **All filters (N)** | Column settings · Export · search pill (product name, SKU, batch number).
- **All filters drawer** `BatchTraceabilityFiltersDrawer.vue` (custom Teleport shell): Vendor, Grade (multi-select), Expiry / Manufacturing / Best before (`DateConditionField`). Draft → Apply; Reset filter / Cancel / Apply footer.
- **`DateConditionField.vue`** (new pattern): comparator *Is between / Is before / Is after* + the sanctioned pickers — `AdvancedDateRangePicker` for between, `MpDatePicker` for one date. Switching comparator clears the value.
- **Table:** Product (`ProductCell`, SKU caption) · Batch number (link) · Expiry · Manufacturing · Best before · Vendor · Grade · Warehouse · On hand · On hand (secondary unit). Semantic `kind`s only; every column sortable; attribute cells render NA / blank / value; NA in secondary text colour.
- **States:** first-load skeleton · populated · filtered/search-empty (ErpTablePage built-in, Clear all filters resets bar + drawer + search) · no-data empty ("No batches" + View products).
- **Scenario FAB:** Default · Empty state · *Without Batch Attribute add-on* (Vendor/Grade/Mfg/Best before cells NA, those drawer fields greyed with a caption, their filters ignored and not counted) · *Without Dual Unit Inventory* (secondary unit NA).
- **Export:** `ExportModal` → CSV of the filtered rows (or current page) with the chosen columns. The applied-filter file header is Phase 4.

**Deviations (recorded in the page header):**
- No row `[…]` actions column and no row hover — a report line has nothing to act on; the batch number is the link (`rule/table-actions-column`, `rule/table-no-hover-no-actions`).
- Default order = Product A–Z, Batch A–Z per PRD (data-layer order until a column is sorted).
- Greyed, non-selectable attribute filters for a missing add-on — an entitlement, not validation (`rule/btn-no-disabled-validation` doesn't apply).
- Until Phase 3, the batch number opens the product's existing Batch details page.

**Lint notes left as-is:** the search `<input>` is the sanctioned `rule/filter-bar-search-pill` markup; `DateConditionField`'s comparator trigger is a select field (same metrics as `MultiSelectDropdown`), not a pill button.

**Verified on dev (4321):** layout at 1440px, vendor filter via drawer → "All filters (1)" and a single matching row, no-add-on scenario (NA cells, greyed drawer fields, filter ignored), mode switch → Coming soon. New files pass `pixel:fix:check`; pixel-police spec failures are the 5 pre-existing CRM/toast ones.

## 3c. Phase 2 — as built

**`BatchTraceabilityByTransaction.vue`** — mounted by the report page only while *By transaction* is active, so switching modes unmounts it and its filters + selection start clean (story 6).
- **Filter bar:** Transaction type (multi-select, OR) · Transaction date (`DateConditionField`: between / before / after) · **All filters (N)** | Export · search pill (transaction number).
- **All filters drawer** `BatchTransactionFiltersDrawer.vue`: Transaction number · Customer · Vendor · Warehouse origin · Warehouse destination (both with "All warehouse" select-all). Each carries a caption naming the types it applies to (Customer → sales only, Vendor → purchase only, origin/destination → the types that have one), so the PRD rule doesn't read as rows silently vanishing.
- **Transactions table:** Transaction date (checkbox as its label) · Transaction number · Transaction type · Warehouse origin · Warehouse destination. Newest first.
- **Selection (story 5):** kept by the view as a set of transaction numbers, not by `ErpTablePage` (whose selection is row positions on the current page and clears on every row change). Checkbox in the first cell, select-all in that column's `#header-date` slot (`rule/table-checkbox-first-cell`). Select-all picks every transaction matching the filters + search, not just the page; paging and sorting keep the selection; any filter or search change clears it. The second table's header shows "N transactions selected · Clear selection".
- **Batches in selected transactions:** Transaction date · Transaction number · Product · Batch number (link) · the five attributes **as recorded on the transaction** · Mutation · Mutation (secondary unit). Signed per the sign rule (+ in, − out, bare qty neutral). Product A–Z, Batch A–Z. Sortable by header click (no sort menu, so no un-undoable "Hide column" on a table without a filter bar). Empty: "No transaction selected / Select a transaction to see its batches."
- **Export:** transactions CSV via `ExportModal`. The batches sheet and filter header are Phase 4.

**`useTraceabilityCells.ts`** (new composable): NA / blank / value attribute text, attribute sort values, quantity and signed-mutation text — shared by both searches so a cell reads identically in each. The Phase 1 page now uses it too. Pinned by `tests/batch-traceability-cells.spec.ts`.

**Selection rules are pinned by a component test** (`tests/batch-traceability-by-transaction.spec.ts`, happy-dom mount): first page of all matching transactions · nothing selected on load (batches table on its hint) · select-all picks every matching transaction, not just the page · selection survives paging · a filter change resets it · a Work order shows its output as + and raw materials as −.

**Deviations (in the component header):** no row actions / hover on either table; batches table keeps the PRD order (its date column is `transactionDate` so `useTableState` doesn't re-sort newest-first); empty states without a CTA (nothing to create — the selection hint is the next action); **transaction numbers are plain text** — the seeded report transactions aren't records in the Sales/Purchase/Inventory modules, so a link would open "not found" (see open question 9).

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
9. **Transaction number links** — the PRD links each number to its transaction detail page. The prototype's seeded report transactions aren't records in the Sales / Purchase / Inventory modules. [Plain text; confirm whether the demo should seed matching records or keep links out.]

## 5. Verification (each phase)

- `npm test` (incl. `tests/batch-traceability.spec.ts`).
- UI phases: `npm run pixel:fix:check`; walk reachable states on dev (4321); `npm run build && npm run preview -- --port 4322`.
