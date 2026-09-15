# Batch Attribute — prototype implementation plan

**Source PRD:** [[PRD] INV - Batch Attribute](https://jurnal.atlassian.net/wiki/x/1wIj8Qs) — v1.0, 5 Sep 2026, owner Fitriani Meizvira, status *FOR DISCUSSION*
**Branch:** `feat/batch-attribute`
**Scope of this plan:** the Mekari ERP prototype (this repo), ERP brand, web UI.

---

## 1. Decisions taken

| # | Decision | Why |
|---|----------|-----|
| D1 | ~~Story 10 (Supplier in Purchase transactions) is deferred to phase 2.~~ **Lifted 14 Sep 2026:** story 10 is built in Phase 5, on the Purchase delivery form with a new batch drawer. The original reason is kept below. | The ERP Purchase delivery form (`NewPurchaseDeliveryPage.vue`) has no batch drawer today. Building one is its own project. Only WMS Receiving has a batch drawer (`ManageBatchDrawer` `kind="receiving"`). |
| D2 | **The UI label is "Vendor", not "Supplier"**; the stable key stays `supplier`. | `rule/copy-vendor-not-supplier` + CLAUDE.md terminology. The PRD's semantic point still holds: the value is the *origin* vendor, not necessarily the billed one. **Flag to PM:** the PRD copy ("Supplier Batch Attribute…") needs the same rename. |
| D3 | **No API, billing or Jurnal-brand work in the prototype.** | The prototype has no API layer and runs as the ERP brand, where Batch Attribute is built in. API stories are listed in §3 for completeness only. |

### PM answers (10 Sep 2026) — these override the PRD text where they differ

| # | Question | Answer | Effect on the plan |
|---|----------|--------|--------------------|
| A1 | Grade "Code" vs "Name" | **Name only.** There is no separate Code. | Grade = Name · Rank · Description · Status. Import and API resolve grades **by Name**, case-insensitive. The PRD's "Code first, then Name" and "ambiguous Code/Name match" rules no longer apply. Because Name is renameable, batches still store the **grade ID**, never the text. |
| A2 | Expiry date: date or month precision | **Per value.** Each batch picks its own precision. | The Expiry field in the batch form has a **Date / Month** switch. The stored value is `YYYY-MM-DD` or `YYYY-MM`, so precision comes from the value itself. |
| A3 | Grade menu placement | **Inventory submenu** | Inventory panel › **Grades** (Phase 1), confirmed. |
| A4 | Can a batch number be edited? | **Yes, but it can't duplicate.** *Narrowed by A9: only while the batch is unused.* | Batch number is editable in the edit form and stays unique within the product. The batch store needs a stable internal ID so a rename doesn't orphan barcode or attribute data. |
| A5 | Unassigned batch | **Still available to choose, but no attributes are ever assigned to it.** | Every batch-tracked product gets a system **Unassigned** batch. It shows "—" for every attribute, never renders attribute fields, and required-attribute rules skip it. |

### PM answers, round 2 (10 Sep 2026)

| # | Question | Answer | Effect on the plan |
|---|----------|--------|--------------------|
| A6 | Rename "Supplier" → "Vendor" in the PRD | **PM will update the PRD later.** | No change: the UI already says Vendor (D2). |
| A7 | Error copy for an import row that targets the Unassigned batch | **To be confirmed later.** | Keep the rejection and the proposed copy (Phase 4), marked *pending PM*. |
| A8 | Does a renamed grade show its new name on older batches? | **Yes, show the new name.** | Already the behaviour: batches store the grade ID and display its current name. No snapshot of the old name. |
| A9 | Can a batch be renamed once it's used on transactions? | **Lock it for now; the PM will decide later.** | The batch number is editable **only while the batch has no stock movements**. Once used, it's read-only in the edit form, with a caption explaining why. This narrows A4. |

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
| 9 | Update Batch via import | **Built** — stepped import page with real row validation; the scenario FAB only adds demo outcomes (Phase 4) |
| 10 | Vendor attribute in Purchase transactions | **Built** on the Purchase delivery form (Phase 5, D1 lifted). WMS receiving and the purchase invoice flow are not covered. |

---

## 4. Build phases

### Phase 0 — data foundation (no UI)

**New `app/data/batchAttributes.ts`**
- `BATCH_ATTRIBUTE_CATALOG`: `{ key, label, valueType }` for `expiry_date` (date **or month**, per value — A2), `manufacturing_date` (date), `best_before_date` (date), `supplier` (vendor ID, label **Vendor**), `grade` (grade ID).
- Expiry helpers:
  - `expiryPrecision(v)`: returns `'day' | 'month'`, based on `YYYY-MM-DD` vs `YYYY-MM`.
  - `formatExpiry(v)`: "28 Feb 2027" or "Feb 2027" (`docs/patterns/date-format.md`).
  - `expiryEffectiveDate(v)`: a month value counts as its **last day**. The existing near-expiry warning (`isExpiryWarning`) compares against that.
- Product attribute config store: `sku → { key, required }[]`, persisted (`loadSnapshot`/`saveSnapshot`, key `batch-attr-config-v1`).
  - `getBatchAttributeConfig(sku)` falls back to `[{ key: 'expiry_date', required: false }]` when nothing is set (PRD fallback rules 5 and 6).
  - `setBatchAttributeConfig(sku, next)` enforces 1–3 items and no duplicates. An empty set falls back to Expiry.
- Seed a few products with richer sets so the demo isn't all-Expiry. For example, a Green Beans SKU gets `supplier` (required) + `grade` + `expiry_date`.

**New `app/data/grades.ts`**
- `GradeList { id, name }` is a single seeded list. `Grade { id, listId, name, rank, description, status: 'active' | 'inactive', deleted }` is seeded with A/1, B/2, C/3.
  - There is **no Code field** (A1).
  - The list is a separate entity and batches store the **grade ID**, per the PRD's "next phase needs no migration" note. The ID matters even more now that Name is the only identifier and can be renamed.
  - `gradeByName(name)`: case-insensitive, searches the whole list including inactive grades, so callers can tell "not found" apart from "inactive".
- Helpers:
  - `activeGrades()`
  - `nextRank()`: max rank over all grades, including inactive, + 1
  - `canDeactivate(id)`: at least one active grade must remain
  - `isGradeUsed(id)`: any batch references it
  - `createGrade`, `updateGrade` (rank is immutable), `softDeleteGrade` (blocked when used)
- Activity entries are recorded per action, **including failed ones** (3a).

**Batch store: extend `app/data/productDetails.ts`**
- Add `attributes: Partial<Record<AttrKey, string>>` to `ProductBatchSummary` / `BatchDetail`. Seeded batches map their existing `expiryDate` → `attributes.expiry_date`.
- **Stable batch ID (A4).** Add `id` to `ProductBatchSummary` / `BatchDetail`.
  - Seeded batches get a deterministic ID of `${sku}::seed-${i}`; created batches get a generated one.
  - The new persisted overlay `batch-overlay-v1` is keyed by **ID**, not batch number. It holds user-created batches (qty 0), attribute/description edits, and batch-number renames. `getProductBatches` merges seed + overlay.
  - A created batch must show even when the product has 0 on-hand; today that early-returns `[]` at `productDetails.ts:261`.
  - The existing `batch-barcode-overlay-v1` is keyed by `sku::batchNo`. Re-key it on rename, or migrate it to ID keys, so the barcode follows the batch.
  - The URL route `/product-list/:sku/batches/:batchNo` stays batch-number based, which is readable and matches today. After a rename, the detail page `router.replace`s to the new number. Warehouse-lot batch numbers from `warehouseDetails.ts` are seed data and aren't renamed.
- **Unassigned batch (A5).** Every batch-tracked product has one system batch, `isUnassigned: true`, batch number "Unassigned", with **no attributes, ever**.
  - It's listed with the product's batches and stays selectable wherever a batch is chosen.
  - `updateBatch` refuses attribute writes to it, and required-attribute validation skips it.
  - It can't be renamed and has no Edit action.
  - Seeded as qty 0 unless stock is already unassigned.
- `createBatch(sku, { batchNo, description, attributes })`: batch number is unique **per product**, case-insensitive. "Unassigned" is reserved.
- `updateBatch(sku, id, patch)`:
  - The batch number may change but must stay unique within the product, excluding the batch itself (A4).
  - It may change **only when `batchHasMovements(sku, id)` is false** (A9). A number change on a used batch is refused.
  - `batchHasMovements` is true when the batch has any ledger entry (`getBatchTransactions`) or non-zero on-hand/reserved. In practice, every seeded batch with stock is locked, and a freshly created qty-0 batch is renameable until its first stock adjustment.
  - On save, attributes that are no longer in the product's config are **purged** (story 7).

**Fix Track stock by persistence**
- Add an optional `trackStockBy` to the custom `Product`, and save it from `NewProductPage.buildPayload()`.
- `getProductDetail` / `isBatchTracked` checks prefer the product's own value and fall back to the category rule for seed products.
- *Built as `productTrackStockBy(sku)` / `isProductBatchTracked(sku)` in `productDetails.ts`.* The category-only `BATCH_CATS` / `SERIAL_CATS` copy is duplicated in ~15 WMS pages (`StockInOutFormPage`, `ReceiveItemsPage`, `PickItemsPage`, …). Those flows read warehouse lots, not the product's batch list, so they're **left as-is** here and tracked as a separate cleanup.

**Tests** (`tests/batch-attribute.spec.ts`):
- config 1–3 / duplicate / fallback rules
- grade rank auto-increment, the min-1-active and max-10-active limits, and delete-blocked-when-used
- batch number unique per product, not globally
- rename keeps uniqueness and moves the barcode
- rename is refused once the batch has movements (A9)
- "Unassigned" is reserved and rejects attribute writes
- attributes purged on update after a config change
- expiry month value counts as end of month for the near-expiry warning

### Phase 1 — Grade List (story 3, 3a)

- **Nav:** add **Grades** to the Inventory panel after *Units* (`ErpSidebar.vue:489`), and add it to `erpSitemap.ts`. Placement confirmed by the PM (A3).
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
- The **Unassigned** row (A5) is listed last, with "—" in every attribute column and a kebab without Edit.
- Empty state: when the product has no batches, show a "No batches" empty state with the New batch action (`rule/table-empty-state`, `rule/empty-state-structure`). Today this tab only renders when on-hand > 0.

**New `BatchFormModal.vue`** (create + edit; `MpModal` md)
- Batch number: required, unique within the product (case-insensitive), and "Unassigned" is reserved.
  - **In edit mode it's editable only while the batch is unused** (A4 + A9), with the same uniqueness check excluding the batch itself.
  - Once the batch has stock movements, the field is read-only with a secondary caption: "Batch number can't be changed after the batch is used in a transaction." / "Nomor batch tidak dapat diubah setelah batch digunakan dalam transaksi." Run the copy through uxw-mekari.
- Description: optional.
- One field per product attribute, in config order. Required ones get `is-required`; optional ones may be empty.
  - `expiry_date` (A2): a pill segmented control **Date | Month** (`rule/segmented-control-pill`) above one `MpDatePicker`.
    - Date → `type="date"`, `format="DD/MM/YYYY"`. Month → `type="month"`, `format="MM/YYYY"`. `value-type="format"` in both, per `rule/date-picker-variants`.
    - Switching precision clears the value rather than guessing a day.
    - In edit, the segment starts from the stored value's precision.
  - `manufacturing_date` / `best_before_date`: `MpDatePicker` (`rule/date-picker-variants`).
  - `supplier` → label **Vendor**: vendor autocomplete showing vendor names (`rule/select-quick-add` is not needed; creating vendors is out of scope).
  - `grade`: autocomplete over **active** grades, shown as "A · Rank 1".
- No qty / price / warehouse / location fields (story 8: master data only). A one-line caption notes stock comes in via stock adjustment.
- **Edit mode (story 7):**
  - Only attributes in the *current* config are shown. Values for removed attributes are hidden and purged on save.
  - Newly required attributes are required; required→optional ones can be cleared.
  - Renaming an unused batch keeps its barcode and attributes (stable ID). Used batches can't be renamed (A9).
- Success toast on save only (`rule/toast-success-only`, `rule/btn-save-toast`).

**`BatchDetailsPage.vue`**
- Wire the inert **Edit** menu item to `BatchFormModal` in edit mode. Hide Edit for the Unassigned batch.
- **Batch info** shows each configured attribute as a content-list row; an empty optional attribute shows "—". Expiry shows at its own precision ("Feb 2027" vs "28 Feb 2027"). The Unassigned batch shows no attribute rows.
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
    - This product does not use Attribute xxx
    - Attribute xxx must be filled
    - Format must be in DD/MM/YYYY (or MM/YYYY)
    - Grade Name not found
    - Grade is not active
  - The error table has a download-error-file action.
  - Semantics to spell out in the template help panel: `null` clears a value, and a blank cell leaves it unchanged.
  - **Grade matching (A1):** by **Name** only, case-insensitive. Unknown → "Grade Name not found". Inactive → "Grade is not active". Import never creates a grade.
  - **Expiry (A2):** each row may be `DD/MM/YYYY` *or* `MM/YYYY`, and that row's value keeps that precision.
  - **Unassigned batch (A5):** a row naming it with any attribute filled is rejected. Proposed copy: "Unassigned batch can't have attributes" / "Batch Unassigned tidak dapat memiliki atribut". The copy is **pending PM confirmation (A7)**. Description-only rows are also rejected, since it's a system batch.
  - The template matches batches **by batch number**, so it can't rename them. Renames are web-only.
- Runs as a background process: after submit, push an entry into the header activity popover (`uploadCenter.ts`) and return to the product. Success → toast.
- **Not built:** the "Product Batch" filter on Other lists › Export & import, because that page doesn't exist in the prototype. Track as a follow-up.

**As built (Phase 4):**
- Validation is **real**, not simulated: `app/data/batchUpdateImport.ts` reads each row and applies only the valid ones through `updateBatch`, so activity is logged per batch (`tests/batch-update-import.spec.ts`).
  - The page reads CSV / XLS / XLSX with `xlsx`. The template download is a real XLSX, prefilled with the product's batches in the import's own formats.
  - Dates accept `DD/MM/YYYY`, `DD-MMM-YYYY`, and (expiry only) `MM/YYYY`.
  - Rows are also rejected for an empty product name or batch number, and for an unknown vendor ("Vendor name not found", pending PRD copy under A6).
- The `ScenarioFab` keeps demo outcomes (succeeded / some rows failed / all rows failed). They come from running the real validator on sample rows, and nothing is written.
- **Deviations:**
  - **No activity-popover entry.** `uploadCenter.ts` only models OCR review files, so the import runs on the page instead (spinner in the dropzone).
    - All valid → toast "Batches updated" and back to the product's batches tab.
    - Any invalid → a result view on the page: summary, failed-row table, Download error file, Import again.
  - The failed-row list is a small hand-rolled table, not `ErpTablePage`. It is an unpaginated result list, not an index.
  - Export writes the same columns as the template, so an export can be edited and imported back.

### Phase 5 — Vendor attribute in Purchase transactions (story 10)

Prerequisite: a batch drawer on `NewPurchaseDeliveryPage.vue` (and the purchase-invoice create flow when one exists). Then:
- A new batch created there has Vendor prefilled from the transaction vendor. The field stays editable and follows vendor changes while the form is unsaved.
- Picking an existing batch whose vendor differs gives one **confirm** (not a block) listing every mismatching batch. The batch's vendor is never overwritten.
- An existing batch with an empty vendor gets silently filled from the transaction.
- Changing the vendor on an already-created purchase shows a warning.

Originally planned as a separate branch after Phases 0–4; built on `feat/batch-attribute` instead.

**As built (Phase 5, 14 Sep 2026):** user chose the Purchase delivery form (not WMS receiving) and batches on delivery details. Built on `feat/batch-attribute`.
- **Form:** `NewPurchaseDeliveryPage.vue` gets a **Batch** column. A batch-tracked line shows **Manage batch** (`rule/drawer-open-via-manage`), which opens `DeliveryBatchDrawer.vue` (`rule/drawer-custom-shell`).
  - In the drawer: pick existing batches or add new ones (batch number + the product's attributes) and split the line qty. Batch qty must add up to the line qty.
- **Rules** live in `app/data/purchaseDeliveryBatches.ts` (`tests/purchase-delivery-batches.spec.ts`):
  - A new batch's Vendor follows the delivery vendor unless the user changed it.
  - Existing batches from another vendor → one `ConfirmModal` on Save listing them; their vendor is never overwritten.
  - Existing batches with no vendor are filled on Save.
  - New batches are created only when the delivery is saved, via `createBatch` (a no-write `validateNewBatch` checks them earlier).
- **Vendor change:** changing the vendor while batches are set shows a confirm. There's no edit flow for saved deliveries in the prototype, so this is the only "change vendor" point.
- **Saved data:** `PurchaseDelivery.lines` keeps the entered lines with their batches. Delivery details shows each line's batches, linking to the batch page.
- **Not built:**
  - Stock qty doesn't move into batches (a delivery is "in transit"; no inventory transaction is modelled).
  - The expiry Date/Month switch isn't in the drawer (day precision only there).
  - Purchase invoice create flow doesn't exist.
  - WMS receiving is unchanged.

---

## 5. Copy (`app/data/translations.ts`)

All new strings go through `t()`. Indonesian follows uxw-mekari (run the `uxw-mekari-erp-core` + `uxw-mekari-erp-terms` skills on the final set).

**Copy review done (15 Sep 2026, uxw-mekari-erp-terms).**
- **Filled missing ID strings:**
  - Download template, Products, Qty
  - Three upload errors: file format not supported, file size exceeds 10 MB, you must upload the completed template file
- **Patterns applied:**
  - Required field → "Anda harus memasukkan …".
  - Import file errors use the library's structure / empty / too-many-rows copy.
  - Success toasts follow "[Object] [past participle]" / "[Object] berhasil …" ("Grades exported", "Batches exported", "Batch berhasil diperbarui").
  - Qty is never translated ("Qty diterima").
  - Confirm-modal primary mirrors the title verb ("Use batches").
  - Search-no-result empty state uses `"{typed}" not found`.
  - Caption-style notes drop the trailing period.
- **Kept on purpose:**
  - Noun-only create labels ("Batch", "Grade") — repo rule `rule/copy-add-noun-only` overrides the library's "{object} baru".
  - "Download the template" / "Upload your file" step titles — they match the existing import pages.
  - PRD-provided copy (import errors, vendor-mismatch sentence, attribute-change warning).

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
  - Create Batch endpoint: `attributes` keyed by API key, grade sent as its **Name** (A1; the PRD said Code). 422 on a missing required or unselected key; 409 on a duplicate batch number.
  - GET Batch returns attributes (grade ID/name/rank) + qty on hand.
  - **Flag for the API owner:** with Name as the only identifier, an integrator holding an old grade name breaks after a rename. Recommend they sync the grade ID from GET Grade List.
  - GET Grade List endpoint.
- **Entitlement:** a Jurnal add-on requiring `advanced_inventory_tracking`, SCM = TRUE and AVG costing. FIFO is out of scope.

---

## 7. Reachable states to design (`docs/design/reachable-states.md`)

| Surface | States |
|---------|--------|
| Grades page | populated · only-seed (A/B/C) · at 10 active (New grade → limit notice) · last active grade (deactivate blocked) · delete-used (offer deactivate) · first-load skeleton (`rule/index-first-load-skeleton`) |
| Product form | not batch-tracked (block hidden) · 1 row default · 3 rows (add hidden) · duplicate prevented · edit with changes → confirm modal · edit without changes → no modal |
| Stock by batches tab | only the Unassigned batch · created batch at qty 0 · Unassigned row ("—" attributes, no Edit) · attribute columns for 1 vs 3 attributes · day- vs month-precision expiry side by side · month expiry near end of month (warning) · search no-match |
| Batch form | create · expiry Date ↔ Month switch · edit after an attribute was added-as-required (must fill) · after an attribute was removed (hidden, purged) · rename an unused batch · rename to a duplicate (inline error) · edit a used batch (number read-only + caption) · "Unassigned" typed as a number (inline error) · no active grades *(unreachable: min 1 active is enforced)* |
| Update import | success · partial (error table + download, incl. an Unassigned row and a mixed DD/MM/YYYY + MM/YYYY file) · all failed · wrong file type / too large |

---

## 8. Open questions for PM / design

Both rounds are answered (§1, A1–A9). Nothing blocks the build. These items are **pending a later PM decision**, and the plan runs on the interim behaviour until then:

| Item | Interim behaviour in the prototype | Waiting on |
|------|------------------------------------|------------|
| PRD still says "Supplier" (A6) | UI says **Vendor** | PM updating the PRD |
| Import error copy for Unassigned batch rows (A7) | Row rejected, with the proposed EN/ID copy in Phase 4 | PM confirming the wording |
| Renaming a batch that's already used (A9) | **Locked:** the number is read-only once the batch has movements | PM's final call. Unlocking it later is a one-line change to the `batchHasMovements` guard, because the stable batch ID already supports renames. |

---

## 9. Verification (each phase)

- `npm test` (new `tests/batch-attribute.spec.ts` + existing suite).
- `npm run pixel:fix:check`, and resolve Pixel Police notes by `rule/*` ID.
- Walk the reachable states in §7 on dev (4321).
- `npm run build && npm run preview -- --port 4322`, then demo from 4322 (CLAUDE.md two-port workflow).
