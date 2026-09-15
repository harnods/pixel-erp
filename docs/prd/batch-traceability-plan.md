# Batch Traceability Report — prototype implementation plan

**Source PRD:** [[PRD] INV - Batch Traceability Report](https://jurnal.atlassian.net/wiki/x/OQMj8Qs) — v1.0, owner Fitriani Meizvira, status *FOR DISCUSSION*
**Related plan:** [batch-attribute-plan.md](batch-attribute-plan.md) (this report reads the batch attributes built there)
**Branch:** `feat/batch-traceability-report`, stacked on `feat/batch-attribute` — open its PR against `feat/batch-attribute`, then retarget to `main` once that merges.
**Scope:** the Mekari ERP prototype (this repo), ERP brand, web UI.
**Decisions:** the recommended interim answers to the PM questions were adopted on 15 Sep 2026 (§4) — they're what the prototype does until the PM confirms or changes them.

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
| 3 — Detail | 4 sections, entry-point highlight, return breadcrumb, related-batch drill-through | **Done** (see §3d) |
| 4 — Export | `ExportModal` at the 3 entry points, applied filter in the file header | **Done** (see §3e) |
| Later (SHOULD HAVE) | attribute change trail in the journey (story 9, via `batchActivityFor`) · visual journey (story 11) | Story 9 **done** (see §3f) · story 11 **done** (see §3g) |

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

## 3d. Phase 3 — as built

**Route:** `/inventory-report/batch-traceability/:sku/:batchNo` (`[...slug].vue`, batch number URI-decoded — "Batch #001" carries a `#`). Batch numbers in both searches now open it: By batch passes `?warehouse=` (that warehouse line is highlighted in Stock position), By transaction passes `?transaction=` (that line is highlighted in the journey). The page opens at the top either way; the entry point never changes content (story 7).

**Page** `BatchTraceabilityDetailPage.vue` — master-data detail shell (72px title bar, breadcrumb above the H1, 32px section gaps):
1. **Batch information** — Product · Product code · Batch number · Description · Created (date + the transaction that created it); a second column captioned *Current values on the batch master* with the five attributes (NA / value; an empty value shows "—" per the detail-page convention). "Last updated by … on …" opens `ActivityLogModal` with the batch's recorded create/edit trail (`rule/activity-log-trigger`).
2. **Stock position** — Total on hand (base + secondary), `Total received − Total issued = N` with a warning + difference when it doesn't match on hand, and a per-warehouse table (On hand in both units · **View locations** → `BatchStorageLocationsDrawer`). 0 on hand → "Not stocked in any warehouse" with a note that the journey still shows where it went.
3. **Batch journey** — every transaction, oldest first (Date header toggles newest first): Date · Type · Number · Warehouse origin · Warehouse destination · Counterparty (customer / vendor) · Mutation · Mutation (secondary unit) · Balance · Balance (secondary unit). Clicking anywhere on a row expands it to the attribute values **recorded on that transaction** (`rule/table-accordion-row-click`); a dot + tooltip "Value at the time of this transaction" marks values that differ from the batch master. Neutral lines (transfer, count) show their own quantity rather than a signed mutation.
4. **Related batch** — *Source batch* (consumed by the Work order that produced this batch) and *Result batch* (produced from it): Product · Batch number (opens that batch) · Work order number · date · Qty consumed / produced. Each group has its own empty line. Drill-through appends the current batch to `?trail=`, and the breadcrumb renders the chain so the user can walk back.

**Return to the report (story 7):** the report's mode, filters, search, sort, page and selected transactions now live in `useBatchTraceabilityReportState` (module-level; the app never keep-alives pages). Both searches read/write it; the *Batch traceability* breadcrumb lands on the report exactly as it was. Switching modes resets both searches (story 6).

**Storage locations:** `batchStorageLocations(sku, batchNo, warehouseId)` spreads the batch's ledger on-hand in that warehouse over the bins the product already occupies there (`getWarehouseDetail` › `bins`), 1 / 60–40 / 50–30–20; parts always sum back. Pinned in `tests/batch-traceability.spec.ts`.

**Scenario FAB:** Default · Without Batch Attribute add-on · Without Dual Unit Inventory · **Reconciliation mismatch** (adds 5 to on hand so the warning can be previewed — the seeded ledger always reconciles).

**Tests:** `tests/batch-traceability-detail.spec.ts` (happy-dom mount: four sections with no Vue runtime errors · reconciliation line · every journey line + expand to recorded values · transaction highlight · related drill-through keeps the trail · not-found) · `tests/batch-traceability-report-state.spec.ts` (state survives a remount; mode switch resets both searches) · storage-location tests in the data spec. The By transaction spec resets the store between tests.

**Deviations (in the page header):**
- The three tables render the ErpTablePage header/row spec directly instead of `ErpTablePage` (`rule/table-use-erptablepage`) — the journey needs a full-width expanded row, and these are short detail sub-tables with no filter bar or paging (same as `BatchDetailsPage`'s tab tables).
- No title-bar Actions menu (details-page-format §C) — nothing to edit or archive on a report detail; Export is Phase 4.
- No Jump-to switcher (`rule/detail-jump-to`) — the breadcrumb returns to the report result the batch came from.
- Transaction numbers stay plain text (open question 9).

**Not built:** Attribute change trail markers inside the journey (story 9, SHOULD HAVE) · Visual journey diagram (story 11) · Warehouse switcher on the journey (open question 6) · per-module privilege on transaction links (depends on question 9).

## 3e. Phase 4 — as built

**Builder** `app/utils/traceabilityExport.ts` (pure, copy passed in): a document is one **header block** — report title · *Exported on* · *Applied filters* (one row per filter, or *No filters applied*) — plus one or more **sections** (a table each).
- **xlsx** (default): one sheet per section, each repeating the header (sheet names ≤ 31 chars, forbidden characters dropped, de-duplicated). Same `xlsx` `aoa_to_sheet` / `writeFile` approach as ProductDetailsPage and CrmReportViewerPage.
- **csv**: no sheets, so the header is written once and the sections stack under their titles; UTF-8 BOM so Excel reads Indonesian names and "−".
- Date filters read as set: "Is before 01/08/2026", "Is between 01/06/2026 - 30/06/2026".

**`ExportModal`** (shared) — three **opt-in** props, so its other 15 callers are unchanged: `formats` (adds a *File format* radio — Excel (.xlsx) / CSV (.csv) — and emits `format`), `hideScope` (hides All / Current page / Selected), `columnsLabel` (renames the column picker). This also brings the modal in line with `rule/export-modal`'s "format + scope options".

**Three export points (story 12):**
| From | Scope | Sections | Header filters |
|------|-------|----------|----------------|
| By batch | All matching / current page | Batches (picked columns, same cell text as the table — NA / blank / value) | Product · Batch number · Warehouse (when not All) · Vendor · Grade · the three dates · search keyword. Greyed-out filters (no add-on) aren't applied, so aren't listed. |
| By transaction | All matching / current page / **selected** (preselected when anything is ticked) | Transactions (picked columns) + **Batches in selected transactions** whenever a selection exists | Transaction type · date · number · customer · vendor · warehouse origin / destination (All warehouse when every one is ticked) · search keyword |
| Batch detail | — (scope hidden) | Picked from *Batch information* (required) · *Stock position* (per warehouse + Total on hand, Total received, Total issued, Difference when mismatched) · *Batch journey* (oldest first, incl. the attribute values recorded on each transaction) · *Related batch* (Relation = Source / Result) | Not a filtered result — the header names the batch it covers (Product, Batch number) |

The detail page's **Export** is a secondary button top-right of its title bar: it has no filter bar, and it's the page's only action (recorded in the page header against `rule/filter-bar-search-export`, which is about list pages).

**Tests:** `tests/traceability-export.spec.ts` (header block, no-filters row, csv stacking + titles + escaping, xlsx sheet names, date filter text) · detail spec: the section builder produces the four picked sections with matching journey rows, stock totals and relation labels, and only the picked ones.

**Not built:** BPOM / halal register format (PRD TBD) · a combined export of both searches (out of scope — the searches can't be combined).

## 3f. Story 9 — attribute change trail, as built

The PRD made this story conditional on Batch Attribute keeping a change log. It does (`batchActivityFor` in `batchStore.ts`: date, user, field, from → to), so the story is built rather than dropped.

**Data** (`batchTraceability.ts`):
- `batchAttributeChanges(sku, batchNo)` — every save that changed the batch's **attributes**, oldest first: recorded edits from the batch activity log (batch form, Update batches import) plus the **seeded regrade** that explains a graded receipt snapshot (1001 Batch #001/#002 arrive with the other grade; the regrade is dated the day after receipt, so the snapshots before and after it agree). Batch number / description edits aren't attribute changes — they stay in the Activity log only.
- `batchJourneyTimeline(sku, batchNo, access)` — the journey with markers placed by date. A marker carries the balance of the line before it and never moves the running balance; same-day markers follow that day's movements.
- **Channel** (Web / Import / API): `updateBatch` takes an optional `channel` (default `web`), recorded on the activity entry; the Update batches import passes `import`. Entries recorded before this read as web. There is no API surface in the prototype, so `api` is typed but never produced.

**Detail page:**
- Marker rows in the Batch journey — full-width, quieter than a movement (no mutation / balance cells): *Attribute change · Grade: B → A* then *Changed by {user} · {date} · {channel}*.
- **Show attribute changes (N)** checkbox above the journey hides them, so the user can read movements only. Hidden when the batch has no changes.
- The **Activity log** now lists the seeded regrade and shows *Channel* on import edits, so it tells the same story as the journey.
- **Export:** when the journey is picked, an *Attribute changes* section follows it (Date · Changed by · Channel · Attribute · From · To, one row per changed attribute).

**Tests:** data spec (regrade sits between receipt and the next movement with matching from/to; markers don't move the balance and don't drop movements; recorded web + import edits with user and from/to; number/description edits excluded) · detail spec (marker line renders between transactions, toggle hides it and keeps every movement, no marker/toggle for an unchanged batch, trail exported with the journey).

**Not built:** the seeded regrade doesn't appear on the product-side Batch details page's Activity log (that page reads only the persisted batch activity).

## 3g. Story 11 — visual journey, as built

The PRD left it open whether this ships in v1 and recommended the table first. The table shipped in Phase 3, so the diagram is added on top as the presentation layer — it introduces no new data.

**Data** — `batchJourneyGraph(sku, batchNo, access)` in `batchTraceability.ts` groups the journey into nodes: every transaction of one **type** moving the batch the same **direction** is one node (count + quantity + its transactions, oldest first). Three sets: **incoming** (in), **internal** (neutral — transfers, stock counts), **outgoing** (out). A Work order node carries the related batches on the other side (sources on the incoming output node, results on the outgoing consumption node), straight from `relatedBatches`.

**Component** `BatchJourneyDiagram.vue`, placed at the top of the Batch journey section, above the change toggle and the table:
- Three columns — **Came from → This batch → Went to** — joined by `arrows-right` icons. The batch sits in the centre as the one bold-bordered card (batch number, product, on hand); transfers and counts sit under it as *Moved within the batch*.
- A node shows type · count · signed quantity; clicking (or Enter) expands it to its transactions (number, date, quantity). Grouping by type keeps a busy batch readable, as the PRD asks.
- Work order nodes list their related batches; each opens that batch's detail page through the same drill-through as Related batch, so the breadcrumb trail is kept.
- HTML/CSS grid, not a canvas/SVG graph library (the repo has none): text stays selectable, translatable and read in journey order by assistive tech. Below 900px the columns stack and the arrows point down.

**Tests:** data spec (every journey line lands in exactly one node, node keys unique; incoming − outgoing = on hand; Work order nodes carry the same batches as `relatedBatches` in both directions; no Work order node for an unroasted batch) · detail spec (three column titles and a node per group, expanding a node lists its transactions, a source batch opens with the trail).

**Not built:** transaction nodes don't link to transaction detail pages (open question 9) · no zoom/pan — grouping by type keeps the diagram bounded instead.

## 4. Decisions — recommended answers adopted (15 Sep 2026)

The PRD left these open. The recommended answer was adopted for each, so the prototype no longer runs on "interim" behaviour — but every one is **pending PM confirmation**, and this table is where a change lands if the PM decides otherwise.

| # | Question | Adopted decision | Where it lives | Change it by… |
|---|----------|------------------|----------------|---------------|
| Q1 | Total Received / Total Issued formulas (PRD "xxx") | **Received** = every in-direction movement (Purchase delivery / invoice, Sales return, Work order output, Stock in, positive Reversal); **Issued** = every out-direction movement. Warehouse transfer and Stock count count in neither. | `reconcile()` in `batchTraceability.ts` | changing `mutationDirection` / `reconcile` |
| Q2 | First transaction table lists "Transaction date" twice | The second slot is **Transaction type**. | `BatchTraceabilityByTransaction.vue` columns | editing `txColumns` |
| Q3 | PRD sorts vs `rule/table-default-newest-first` | **Follow the PRD**: batches-in-transactions is Product A–Z, Batch A–Z; the journey is oldest first (with a newest-first toggle). Recorded as exceptions in each component header. | the two components' headers | the default sort in each table |
| Q4 | By batch with selected warehouses; Storage location column? | **One line per selected warehouse the batch has moved through** (on hand may be 0); warehouses it never touched get no line. **No Storage location column** — locations are in the detail page's *View locations* drawer. | `searchBatches()`, `BatchStorageLocationsDrawer.vue` | the `touched` rule in `searchBatches` |
| Q5 | Before any filter is set | **Show every stocked batch** straight away (no "set a filter first" prompt). | `BatchTraceabilityReportPage.vue` | an empty-query guard in the page |
| Q6 | Warehouse switcher on the journey | **Not in v1** — the running balance is across all warehouses; the Stock position table gives the per-warehouse split. | — | a new control on the journey |
| Q7 | Purchase invoice + delivery both "+" (double count) | **Invoices aren't seeded** as batch movements; the sign rule still covers them if they're added. Recommendation to PM: count stock on the delivery only. | ledger seed in `buildLedger()` | seeding invoice movements |
| Q8 | Link from the product's batch page to the traceability detail | **Yes** — Batch details › Actions › *View traceability* (product batches only; not the Unassigned batch or a warehouse-scoped lot). | `BatchDetailsPage.vue` | removing the menu item |
| Q9 | Transaction number links (PRD) | **Plain text** — the seeded report transactions aren't records in the Sales / Purchase / Inventory modules, and seeding matching records would change those modules' demo data. Links are a follow-up once transactions share one source. | all three report views, the diagram | rendering numbers as `cell-link`s to the module routes |

## 5. Verification (each phase)

- `npm test` (incl. `tests/batch-traceability.spec.ts`).
- UI phases: `npm run pixel:fix:check`; walk reachable states on dev (4321); `npm run build && npm run preview -- --port 4322`.
