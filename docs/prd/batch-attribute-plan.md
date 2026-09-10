# Batch Attribute — prototype implementation plan

**Source PRD:** [[PRD] INV - Batch Attribute](https://jurnal.atlassian.net/wiki/x/1wIj8Qs) — v1.0, 5 Sep 2026, owner Fitriani Meizvira, status *FOR DISCUSSION*
**Branch:** `feat/batch-attribute`
**Scope of this plan:** the Mekari ERP prototype (this repo), ERP brand, web UI.

---

## 1. Decisions taken

| # | Decision | Why |
|---|----------|-----|
| D1 | **Story 10 (Supplier in Purchase transactions) is deferred to phase 2.** | The ERP Purchase delivery form (`NewPurchaseDeliveryPage.vue`) has no batch drawer today. Building one is its own project. Only WMS Receiving has a batch drawer (`ManageBatchDrawer` `kind="receiving"`). |
| D2 | **The UI label is "Vendor", not "Supplier"**; the stable key stays `supplier`. | `rule/copy-vendor-not-supplier` + CLAUDE.md terminology. The PRD's semantic point still holds: the value is the *origin* vendor, not necessarily the billed one. **Flag to PM:** the PRD copy ("Supplier Batch Attribute…") needs the same rename. |
| D3 | **No API, billing or Jurnal-brand work in the prototype.** | The prototype has no API layer and runs as the ERP brand, where Batch Attribute is built in. API stories are listed in §3 for completeness only. |

---

## 2. What exists today (findings)

- **Batch tracking comes from the category, not the product.** `isBatchTracked(category)` (`app/data/warehouseDetails.ts:497`) is true only for `Green Beans` / `Roasted Beans`. The product form's **Track stock by** (`NewProductPage.vue:50`) is **not persisted**: `buildPayload()` drops it. So a new product set to "Batch" in a non-batch category shows as Quantity on its detail page. **This must be fixed first** (Phase 0).
- **Batches are derived, not stored.** `getProductBatches(sku)` (`app/data/productDetails.ts:258`) makes 2–4 deterministic batches from on-hand. Their only attribute is `expiryDate`. The one persisted overlay is `batch-barcode-overlay-v1`, which sets the pattern for new batch state.
- **No batch creation anywhere on the product.** The **Stock by batches** tab (`ProductDetailsPage.vue:583`) is read-only: number, expiry, description, qty.
- **Batch detail "Edit" is inert.** `BatchDetailsPage.vue:174` has an Edit menu item with no handler. Batch info shows Number / Expiration date / Description.
- **Activity log already exists** on both detail pages (`ActivityLogModal`, opened from the `.detail-updated` link per `rule/activity-log-trigger`). That's where PRD audit-log stories 3a and 6a surface.
- **Inventory nav** (`ErpSidebar.vue:485`) → Products, Categories, Variant options, Units, Price rules. **Other lists › Export & import** is only a sitemap leaf (`erpSitemap.ts:425`); there is no page yet.
- **Import patterns:** a spreadsheet import with a downloadable template is a **stepped page** (`rule/import-modal`), e.g. `ImportWarehousesPage.vue`. Plain file drop uses `ImportSpreadsheetModal`.
- **Vendors master:** `app/data/vendors.ts` (`vendors`, `vendorById`).

---

## 3. PRD story coverage

| Story | Title | Prototype treatment |
|------|-------|---------------------|
| 1 | Feature entitlement | **Not built.** ERP brand = always on. The costing = AVG / SCM gate is noted, not simulated. |
| 2 | Attribute catalog (5 fixed attributes, stable API keys) | **Build** — data catalog (Phase 0) |
| 3 | Grade List (seed A/B/C, create, update, soft-delete, 1–10 active) | **Build** — Inventory › Grades (Phase 1) |
| 3a | Grade List audit log | **Build** — Activity log on the Grades page (Phase 1) |
| 4 | Grade value in import / API | **Import rules build** (Phase 4); API not built |
| 5 | Attribute selection at product creation (web / import / API) | **Web build** (Phase 2). Import: **not built**, because the prototype has no Product import surface; the template spec is kept in §6. API not built. |
| 6 | Attribute update in product edit + confirmation warning | **Build** (Phase 2) |
| 6a | Product ↔ attribute audit log | **Build** — entries in the product's Activity log (Phase 2) |
| 7 | Batch-update behaviour after an attribute change | **Build** — Batch edit form (Phase 3) |
| 8 | Batch creation (web) — master data only, qty 0 | **Build** (Phase 3); API not built |
| 9 | Update Batch via import | **Build** — stepped import page with a scenario FAB (Phase 4) |
| 10 | Vendor attribute in Purchase transactions | **Deferred** (D1) — Phase 5 |

---

## 4. Build phases

### Phase 0 — data foundation (no UI)

**New `app/data/batchAttributes.ts`**
- `BATCH_ATTRIBUTE_CATALOG`: `{ key, label, valueType }` for `expiry_date` (date **or month**), `manufacturing_date` (date), `best_before_date` (date), `supplier` (vendor ID, label **Vendor**), `grade` (grade ID).
- Product attribute config store: `sku → { key, required }[]`, persisted (`loadSnapshot`/`saveSnapshot`, key `batch-attr-config-v1`).
  - `getBatchAttributeConfig(sku)` falls back to `[{ key: 'expiry_date', required: false }]` when nothing is set (PRD fallback rules 5 and 6).
  - `setBatchAttributeConfig(sku, next)` enforces 1–3 items and no duplicates. An empty set falls back to Expiry.
- Seed a few products with richer sets so the demo isn't all-Expiry. For example, a Green Beans SKU gets `supplier` (required) + `grade` + `expiry_date`.

**New `app/data/grades.ts`**
- `GradeList { id, name }` is a single seeded list. `Grade { id, listId, name, rank, description, status: 'active' | 'inactive', deleted }` is seeded with A/1, B/2, C/3.
  - The list is a separate entity and batches store the **grade ID**, per the PRD's "next phase needs no migration" note.
- Helpers:
  - `activeGrades()`
  - `nextRank()`: max rank over all grades, including inactive, + 1
  - `canDeactivate(id)`: at least one active grade must remain
  - `isGradeUsed(id)`: any batch references it
  - `createGrade`, `updateGrade` (rank is immutable), `softDeleteGrade` (blocked when used)
- Activity entries are recorded per action, **including failed ones** (3a).

**Batch store: extend `app/data/productDetails.ts`**
- Add `attributes: Partial<Record<AttrKey, string>>` to `ProductBatchSummary` / `BatchDetail`. Seeded batches map their existing `expiryDate` → `attributes.expiry_date`.
- New persisted overlay `batch-overlay-v1`, keyed `${sku}::${batchNo}`. It holds user-created batches (qty 0) and attribute/description edits. `getProductBatches` merges seed + overlay.
  - A created batch must show even when the product has 0 on-hand; today that early-returns `[]` at `productDetails.ts:261`.
- `createBatch(sku, { batchNo, description, attributes })`: batch number is unique **per product**.
- `updateBatch(sku, batchNo, patch)`: on save, attributes that are no longer in the product's config are **purged** (story 7).

**Fix Track stock by persistence**
- Add an optional `trackStockBy` to the custom `Product`, and save it from `NewProductPage.buildPayload()`.
- `getProductDetail` / `isBatchTracked` checks prefer the product's own value and fall back to the category rule for seed products.
- Also covers `StockInOutFormPage.vue:76`, which duplicates `BATCH_CATS`: route it through the same helper.

**Tests** (`tests/batch-attribute.spec.ts`):
- config 1–3 / duplicate / fallback rules
- grade rank auto-increment, the min-1-active and max-10-active limits, and delete-blocked-when-used
- batch number unique per product, not globally
- attributes purged on update after a config change

### Phase 1 — Grade List (story 3, 3a)

- **Nav:** add **Grades** to the Inventory panel after *Units* (`ErpSidebar.vue:489`), and add it to `erpSitemap.ts`. The PRD marks placement as *needs design crosscheck*, so confirm with design.
- **Page `GradesPage.vue`** (route `/grades`): `ErpTablePage` (`rule/table-use-erptablepage`; invoke skill `erp-table-page`).
  - Columns: Rank · Name (link-span) · Description · Status (`ErpStatusBadge` Active/Inactive) · actions kebab (Edit · Activate/Deactivate · Delete).
  - Default sort is rank ascending. This is a deliberate exception to `rule/table-default-newest-first`, because rank *is* the order. Record the exception in the file.
  - Title-bar primary: `[add] New grade` (`rule/copy-add-noun-only`). Clicking it at 10 active grades shows an inline alert/modal explaining the limit; don't disable the button (`rule/btn-no-disabled-validation`).
- **Create / edit modal** (`MpModal` md, `rule/modal-use-mpmodal`):
  - Name: required, max 50, unique in the list including inactive, with a char counter (`rule/input-char-counter`).
  - Rank: prefilled with `nextRank()` and **read-only**, with a caption saying rank can't be changed later (PRD *needs design emphasis*).
  - Description: optional, max 256.
  - Status isn't shown on create; new grades are always Active.
  - Errors show inline on Save (`rule/form-errors-inline`). Buttons: "Save" / "Save changes" (`rule/form-edit-save-changes`).
- **Status change** (*needs design emphasis*): a confirm modal for deactivate ("Inactive grades can't be picked on new batches"). Deactivating the last active grade is blocked with an inline explanation in the modal.
- **Delete:** unused → confirm → soft-delete. **Used** → blocked modal: "This grade is used by N batches. Deactivate it instead?" with a primary **Deactivate** button (PRD *needs design emphasis*).
- **Activity log:** a `.detail-updated`-style "Last updated by … on …" link under the table opens `ActivityLogModal` with grade create/update/delete entries, including failed actions.

### Phase 2 — Attribute set on the product (story 5 web, 6, 6a)

**`NewProductPage.vue`**
- When **Track stock by = Batch**, render a **Batch attributes** sub-block under the tracking fields. It's a small form-table (`docs/patterns/FormTable.md`, `rule/table-form-*`):
  - Columns: Attribute (`MpAutocomplete` or `ErpFilterSelect` per `rule/select-erpfilterselect`; options already chosen in other rows are excluded) · **Required** checkbox (`rule/checkbox-gap-12`) · remove icon with tooltip (`rule/remove-icon-tooltip`).
  - Default: one row, Expiry date, not required.
  - `[add] Attribute` link-button, hidden at 3 rows. Removing the last row is prevented: the row stays, with an inline caption saying at least 1 is needed.
- Switching Track stock by away from Batch hides the block. Keep the state so switching back restores it.
- **Edit mode:** prefill from `getBatchAttributeConfig`. When the set or any required flag changed, **Save changes** first opens a confirm modal (`rule/modal-alert-top-align`):
  - EN: "Existing batches will need to be manually updated to have the new attribute information."
  - ID: "Batch yang sudah terbuat perlu diubah manual sesuai dengan pilihan atribut yang baru."
  - Include the count of existing batches when it's above 0.
- **Activity log:** on save, append a product activity entry with the selected attributes and required flags (6a).
- **Product detail (`ProductDetailsPage.vue`):** add a read-only **Batch attributes** content-list row in the inventory section, e.g. "Expiry date (required), Vendor, Grade" (`rule/detail-contentlist`).

### Phase 3 — Batch create / edit / view (story 7, 8)

**Stock by batches tab (`ProductDetailsPage.vue:583`)**
- Columns follow the product's attribute set:
  - Number · *[one column per selected attribute, in config order]* · Description · On hand · Reserved · Available · Unit · kebab.
  - Vendor shows the vendor name. Grade shows "A (Rank 1)". Expiry keeps its near-expiry warning.
- Add **`[add] New batch`** in the tab's filter-bar right side. It's the single primary on that surface (`rule/btn-one-primary`), and "Print all barcode" stays secondary.
- A newly created batch appears with qty 0.
- Empty state: when the product has no batches, show a "No batches" empty state with the New batch action (`rule/table-empty-state`, `rule/empty-state-structure`). Today this tab only renders when on-hand > 0.

**New `BatchFormModal.vue`** (create + edit; `MpModal` md)
- Batch number: required, unique within the product.
- Description: optional.
- One field per product attribute, in config order. Required ones get `is-required`; optional ones may be empty.
  - `expiry_date`: `MpDatePicker` `DD/MM/YYYY`. The PRD also allows a **month** value (MM/YYYY); open question Q2.
  - `manufacturing_date` / `best_before_date`: `MpDatePicker` (`rule/date-picker-variants`).
  - `supplier` → label **Vendor**: vendor autocomplete showing vendor names (`rule/select-quick-add` is not needed; creating vendors is out of scope).
  - `grade`: autocomplete over **active** grades, shown as "A · Rank 1".
- No qty / price / warehouse / location fields (story 8: master data only). A one-line caption notes stock comes in via stock adjustment.
- **Edit mode (story 7):**
  - Only attributes in the *current* config are shown. Values for removed attributes are hidden and purged on save.
  - Newly required attributes are required; required→optional ones can be cleared.
  - Batch number is read-only in edit. This is an assumption to confirm with the PM (Q4).
- Success toast on save only (`rule/toast-success-only`, `rule/btn-save-toast`).

**`BatchDetailsPage.vue`**
- Wire the inert **Edit** menu item to `BatchFormModal` in edit mode.
- **Batch info** shows each configured attribute as a content-list row; an empty optional attribute shows "—".
- Append batch create/edit entries to its Activity log.

### Phase 4 — Update Batch import (story 4 import rules, 9)

- **Entry:** Stock by batches tab → secondary **Import** dropdown ▸ *Update batches from spreadsheet* (`rule/btn-dropdown-mppopover`).
  - Also add **Export** there: the batch list via the shared `ExportModal` (`rule/export-modal`). The PRD's "Batch Export to know list of Batch" is how users get a starting file.
- **Page `ImportBatchUpdatePage.vue`** (route `/product-list/import-batches`): a stepped import page modelled on `ImportWarehousesPage.vue`.
  - Steps: download template → upload (`ErpDropzone`) → result.
  - The template has *all* attribute columns, whichever product the import started from.
  - One file can span several products.
- **Validation** is simulated with a `ScenarioFab` (success / partial / all-failed).
  - The partial and failed results show an error table with the PRD's exact messages:
    - Product name not found
    - Product is not tracked by batch
    - Batch number not found
    - Duplicated Product and Batch combination
    - This product does not use attribute xxx
    - Attribute xxx must be filled
    - Format must be in DD/MM/YYYY (or MM/YYYY)
    - Grade name not found
    - Grade is not active
  - The error table has a download-error-file action.
  - Semantics to spell out in the template help panel: `null` clears a value, and a blank cell leaves it unchanged.
  - **Grade matching:** match Code first, then Name, case-insensitive. Reject when ambiguous or inactive. Import never creates a grade.
- Runs as a background process: after submit, push an entry into the header activity popover (`uploadCenter.ts`) and return to the product. Success → toast.
- **Not built:** the "Product Batch" filter on Other lists › Export & import, because that page doesn't exist in the prototype. Track as a follow-up.

### Phase 5 — deferred: Vendor attribute in Purchase transactions (story 10)

Prerequisite: a batch drawer on `NewPurchaseDeliveryPage.vue` (and the purchase-invoice create flow when one exists). Then:
- A new batch created there has Vendor prefilled from the transaction vendor. The field stays editable and follows vendor changes while the form is unsaved.
- Picking an existing batch whose vendor differs gives one **confirm** (not a block) listing every mismatching batch. The batch's vendor is never overwritten.
- An existing batch with an empty vendor gets silently filled from the transaction.
- Changing the vendor on an already-created purchase shows a warning.

Separate branch, after Phases 0–4 land.

---

## 5. Copy (`app/data/translations.ts`)

All new strings go through `t()`. Indonesian follows uxw-mekari (run the `uxw-mekari-erp-core` + `uxw-mekari-erp-terms` skills on the final set).

| EN | ID (PRD-provided or proposed) |
|----|----------------------------|
| Batch attributes | Atribut batch |
| Expiry date / Manufacturing date / Best before date | Tanggal kedaluwarsa / Tanggal produksi / Tanggal baik digunakan sebelum |
| Vendor | Vendor |
| Grade / Grades | Grade |
| New grade / New batch | Grade / Batch *(noun-only per `rule/copy-add-noun-only`)* |
| Existing batches will need to be manually updated to have the new attribute information. | Batch yang sudah terbuat perlu diubah manual sesuai dengan pilihan atribut yang baru. |
| This batch is recorded with vendor [A], while this transaction is from [B]. The vendor of the batch will not be changed. *(Phase 5)* | Batch ini tercatat dengan vendor [A], sedangkan transaksi ini berasal dari [B]. Vendor pada batch tidak akan diubah. |
| *Import errors (Phase 4)* | *Use the PRD's ID strings, with "Supplier" → "Vendor"* |

---

## 6. Spec kept for later (not built in the prototype)

- **Product import template (story 5):** 6 columns — `Batch Attribute 1–3`, `Is Required 1–3`.
  - Allowed values: `expiry_date|manufacturing_date|best_before_date|supplier|grade` (case-insensitive) and `yes/ya/no/tidak`.
  - Slots may be filled out of order.
  - Errors: "Attribute name does not exist", "Attribute name is duplicated", "Batch Attribute only applies to Batch-tracked Product".
  - All slots empty on a batch-tracked row → Expiry, not required.
  - Product *update* import ignores attribute columns.
- **API:**
  - `batch_attributes` on Create/Update Product. It **replaces** the set rather than merging. Omitting it leaves the set unchanged. `[]` falls back to Expiry. Invalid input → 422.
  - Create Batch endpoint: `attributes` keyed by API key, grade sent as its **Code**. 422 on a missing required or unselected key; 409 on a duplicate batch number.
  - GET Batch returns attributes (grade code/name/rank) + qty on hand.
  - GET Grade List endpoint.
- **Entitlement:** a Jurnal add-on requiring `advanced_inventory_tracking`, SCM = TRUE and AVG costing. FIFO is out of scope.

---

## 7. Reachable states to design (`docs/design/reachable-states.md`)

| Surface | States |
|---------|--------|
| Grades page | populated · only-seed (A/B/C) · at 10 active (New grade → limit notice) · last active grade (deactivate blocked) · delete-used (offer deactivate) · first-load skeleton (`rule/index-first-load-skeleton`) |
| Product form | not batch-tracked (block hidden) · 1 row default · 3 rows (add hidden) · duplicate prevented · edit with changes → confirm modal · edit without changes → no modal |
| Stock by batches tab | no batches (empty + New batch) · created batch at qty 0 · attribute columns for 1 vs 3 attributes · search no-match |
| Batch form | create · edit after an attribute was added-as-required (must fill) · after an attribute was removed (hidden, purged) · duplicate batch number error · no active grades *(unreachable: min 1 active is enforced)* |
| Update import | success · partial (error table + download) · all failed · wrong file type / too large |

---

## 8. Open questions for PM / design

1. **Grade "Code" vs "Name".** Story 4 (import/API) matches on a *Grade Value Code* and says only the Code is stable. Story 3's create form defines only Name / Rank / Description, with no Code. Is Code a separate immutable field, or is Name the code? The plan assumes **a separate immutable Code** isn't needed for the web prototype and matches import on Name. Confirm.
2. **Expiry date "date / month".** Is this a per-product setting (day vs month precision), or per value? The import accepts both `DD/MM/YYYY` and `MM/YYYY`. The plan uses a day picker in the form and accepts both in import.
3. **Grade menu placement:** Inventory › Grades (ERP). The PRD marks it *needs design crosscheck*.
4. **Can a batch number be edited after creation?** The PRD is silent; the plan assumes **no**.
5. **"Unassigned Batch".** The PRD exempts it from required attributes, but the prototype has no unassigned-batch concept. OK to skip?
6. The PRD copy uses **"Supplier"**; the repo standard is **"Vendor"** (D2). Please rename in the PRD.

---

## 9. Verification (each phase)

- `npm test` (new `tests/batch-attribute.spec.ts` + existing suite).
- `npm run pixel:fix:check`, and resolve Pixel Police notes by `rule/*` ID.
- Walk the reachable states in §7 on dev (4321).
- `npm run build && npm run preview -- --port 4322`, then demo from 4322 (CLAUDE.md two-port workflow).
