**Classification: INTERNAL**

# Batch Attribute — batch drawers + batch export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship ATINV-9083 (export current batches in the Update batches template, with filters, required-empty notes and an Attribute Setup sheet) and ATINV-9082 (batch attributes in every existing batch drawer, with receiving vs issuing rules).

**Architecture:**
- **Pure data modules carry the rules:**
  - `batchUpdateImport.ts`: export rows and the unchanged-row skip
  - `productDetails.ts`: batch lookup between warehouse lots and product batch records
  - `batchDrawerAttributes.ts`: drawer attribute rules
- **Vue components only render:**
  - One composable feeds the attribute columns to all three drawers: `ManageBatchDrawer`, `PickBatchDrawer`, `ViewBatchDrawer`.
  - Receiving flows create or complete product batch records on commit.

**Tech Stack:** Nuxt 4 (`srcDir: app/`, `ssr: false`), Vue 3 `<script setup>`, Pixel 3 (`@mekari/pixel3`, Enterprise tokens 2.4), Vitest + `@vue/test-utils`, `xlsx` 0.18.5.

**Spec:** `docs/superpowers/specs/2026-10-27-batch-attribute-drawers-export-design.md`. Read it before any task. Also read `docs/prd/batch-attribute-plan.md` on the branch for decisions D1–D3 and A1–A9.

## Global Constraints

- **Branch and baseline:**
  - Work on `feat/batch-attribute`, after merging `origin/main` (Task 0).
  - Never commit to `main`.
- **Before any `.vue` change**, invoke `pixel-erp-design` and follow its routing (`docs/design/RULES.md`, `docs/design/reachable-states.md`, `docs/patterns/*`). For any table or `TableColumn[]`, also invoke `erp-table-page`. Use the `pixel` skill for component props.
- **Drawers and modals:**
  - Every drawer and modal closes only via its × (`rule/modal-drawer-close-explicit-only`).
  - Footer buttons are never disabled or hidden. Show errors inline below the content (`rule/btn-no-disabled-validation`, `rule/form-errors-inline`).
  - The only toast is a success toast (`rule/toast-success-only`).
- **Selects:** `ErpFilterSelect` / `MpAutocomplete` only. Never a native `<select>` or `MpSelect` (`rule/select-erpfilterselect`).
- **Buttons:** `btn-enterprise--{ghost,primary,secondary}`.
- **Copy:**
  - All copy goes through `t()`, with EN and ID in `app/data/translations.ts` (uxw-mekari).
  - UI says **Vendor**, never Supplier.
  - Fixed strings:
    - "Only batches with an empty required attribute" / "Hanya batch dengan atribut wajib yang masih kosong"
    - "Required attribute is empty" / "Atribut wajib masih kosong"
    - "Attribute Setup" (sheet name)
    - "Batches exported"
    - "No batches match these filters" / "Tidak ada batch yang sesuai dengan filter ini"
- **Unassigned batch:** never carries attributes, is never exported, and is never editable.
- **Empty attributes never block an issuing flow** (transfer, put-away, picking, packing, WO materials).
- **A transaction never overwrites an existing attribute value.** It may only fill an empty one.
- **Every changed UI element** gets `data-devchange="<id>"` and an entry in `app/data/devChanges.ts` (newest first, `date: '2026-10-27'` or the actual ship date).
- **Every task ends green:**
  - `npm run test -- --run`
  - `npm run build`
  - Any pixel-police failure is fixed in code, not in the test.

## Review Focus

1. **An exported file uploaded again unedited**, for a product with a required attribute still empty, must give 0 failed rows. Pinned in Task 2.
2. **A typed or scanned batch number in a receiving drawer that already exists as a product record** (qty 0, or another warehouse) must be treated as the existing batch, not as "batch number taken". Pinned in Task 5.
3. **A lot with no product record** (5-digit WMS numbering) must render its expiry plus "—" for the other attributes, and not crash. Pinned in Task 4.
4. **Two new rows with the same number in one drawer** must show an inline error. A number that differs only in case counts as the same. Pinned in Task 5.
5. **An export where the filters match no batches** must download nothing and show the inline message. Pinned in Task 1.

---

### Task 0: Branch setup and baseline

**Files:**
- Modify: `.gitignore` (add `.superpowers/`)
- Add: the spec and this plan (copied from the working tree)

- [ ] **Step 1:** `git stash -u` is NOT needed. Untracked files carry over. Run `git checkout feat/batch-attribute && git pull --ff-only origin feat/batch-attribute`.
- [ ] **Step 2:** `git merge origin/main`. Resolve conflicts:
  - In batch-related files (`ManageBatchDrawer.vue`, `productDetails.ts`, `translations.ts`, `devChanges.ts`), keep both sides' intent.
  - In any other file, take main.
- [ ] **Step 3:** Run `npm ci && npm run build && npm run test -- --run`. Expected: build succeeds. Record any failing specs as pre-existing in the commit body.
- [ ] **Step 4:** Remove the scratch worktree: `git worktree remove <scratchpad>/ba-wt`.
- [ ] **Step 5:** Commit:
  ```bash
  git add .gitignore docs/superpowers/specs/2026-10-27-batch-attribute-drawers-export-design.md docs/superpowers/plans/2026-10-27-batch-attribute-drawers-export.md
  git commit -m "chore(batch-attribute): merge main; add drawers + export spec and plan (ATINV-9082, ATINV-9083)"
  ```

---

## ATINV-9083 — Batch export

### Task 1: Export rows, notes and Attribute Setup sheet (data + xlsx writer)

**Files:**
- Modify: `app/data/batchUpdateImport.ts`. Add the export builder. Rebuild `batchUpdateTemplateRows` on top of it, or delete it once nothing uses it.
- Create: `app/utils/batchExportXlsx.ts`
- Test: `tests/batch-export.spec.ts`

**Interfaces — produces:**
```ts
// batchUpdateImport.ts
export interface BatchExportOptions { skus: readonly string[]; onlyRequiredEmpty: boolean }
export interface BatchExportRow { cells: BatchUpdateCells; requiredEmpty: BatchAttributeKey[] }
export interface AttributeSetupRow { productName: string; attributes: { key: BatchAttributeKey; required: boolean }[] }
export interface BatchExport { rows: BatchExportRow[]; setup: AttributeSetupRow[] }
export function buildBatchExport(opts: BatchExportOptions): BatchExport
export function exportableProductSkus(): string[]   // batch-tracked, non-archived products, sorted by name
// app/utils/batchExportXlsx.ts
export async function writeBatchExportXlsx(data: BatchExport, filename: string, t: (s: string) => string): Promise<void>
```

**Rules for `buildBatchExport`:**
- Skip the Unassigned batch, archived batches, and products that aren't batch-tracked.
- Sort by product name, then batch number. Use `localeCompare` with `{ sensitivity: 'base', numeric: true }`.
- `requiredEmpty` lists the keys that are in the product's config, `required`, and empty on the batch.
- With `onlyRequiredEmpty`, keep only rows where `requiredEmpty.length > 0`.
- `setup` has one entry per product that has at least one exported row.

- [ ] **Step 1: Write the failing tests** in `tests/batch-export.spec.ts`. Use the `load()` re-import pattern from `tests/batch-update-import.spec.ts`.
  - `it('exports every non-Unassigned batch of the chosen products, sorted by product then batch')`
    - `rows.map(r => r.cells.productName + '|' + r.cells.batchNumber)` equals the sorted list.
    - No row has `batchNumber === 'Unassigned'`.
  - `it('includes qty-0 batches')`
    - `createBatch('1001', { batchNo: 'ZZ-NEW', attributes: { supplier: 'V001' } })`, then the export contains `ZZ-NEW`.
  - `it('flags an empty required attribute')`
    - Set the 1001 config so `grade` is required (`setBatchAttributeConfig`).
    - A 1001 batch without a grade has `requiredEmpty` containing `'grade'`, and `cells.grade === ''`.
  - `it('onlyRequiredEmpty keeps only flagged rows')`
    - Every row has `requiredEmpty.length > 0`.
    - The count is smaller than the unfiltered export.
  - `it('returns no rows when nothing matches')`
    - `buildBatchExport({ skus: [], onlyRequiredEmpty: false }).rows` is `[]`.
  - `it('lists each exported product in Attribute Setup with its required flags')`
    - The 1001 entry equals `[{key:'supplier',required:true},{key:'grade',required:false},{key:'expiry_date',required:false}]`, using the seed config.
  - `it('skips archived batches')`
    - After `setBatchArchived`, the batch is absent.
- [ ] **Step 2:** Run `npx vitest run tests/batch-export.spec.ts`. Expected: FAIL (`buildBatchExport` is not exported).
- [ ] **Step 3: Implement** `buildBatchExport` and `exportableProductSkus`.
  - Cells reuse the existing cell formatting from `batchUpdateTemplateRows`: `isoToCell`, vendor name, grade name.
- [ ] **Step 4: Implement** `writeBatchExportXlsx`.
  - Sheet 1 is named `'Batches'`, with `BATCH_UPDATE_COLUMNS` headers via `t()` and `!cols` widths as in `ImportBatchUpdatePage.writeSheet`.
  - For each `requiredEmpty` key, set the cell to `{ t: 's', v: '' }` with `c = [{ a: 'Mekari ERP', t: t('Required attribute is empty') }]` and `c.hidden = true`.
  - Sheet 2 is named `t('Attribute Setup')`, with columns `Product name | Attribute | Required` and one row per product attribute, Required = `Yes`/`No` via `t()`.
  - Write with `XLSX.writeFile`.
  - Add a test: `it('writes the note and the second sheet')`. Call `XLSX.write(book, { type: 'buffer' })` through an exported `buildBatchExportBook(data, t)` helper, read it back with `XLSX.read`, and assert `SheetNames` equals `['Batches', 'Attribute Setup']` and that the flagged cell's `.c[0].t` equals `'Required attribute is empty'`. Make `writeBatchExportXlsx` a thin wrapper around `buildBatchExportBook`.
- [ ] **Step 5:** Run `npx vitest run tests/batch-export.spec.ts tests/batch-update-import.spec.ts`. Expected: PASS.
- [ ] **Step 6:** Add the translations (EN/ID) for the fixed strings in Global Constraints. Commit:
  ```bash
  git commit -am "feat(inventory): batch export rows, required-empty notes, Attribute Setup sheet (ATINV-9083)"
  ```

### Task 2: An unchanged row on re-upload is skipped, not failed

**Files:**
- Modify: `app/data/batchUpdateImport.ts` (`validateBatchUpdateRows`, `CheckedRow`, `applyBatchUpdateImport`)
- Test: `tests/batch-update-import.spec.ts`

**Interfaces — produces:** `CheckedRow` gains `unchanged?: true`. `applyBatchUpdateImport` counts those rows in `unchanged`, and they're never in `failed`.

**Rule:**
- After product and batch resolve, compute a row's effective changes. A cell is no change when:
  - it's blank, or
  - it equals the batch's current value in import format (the same formatter as the export cells; compare case-insensitively for vendor and grade names).
- If there are zero changes, mark the row `unchanged` before the required-attribute check, and keep any product or batch lookup errors.
- Description follows the same rule.

- [ ] **Step 1: Write the failing tests:**
  - `it('skips an unedited exported row even when a required attribute is empty')`
    - Make `grade` required on 1001.
    - Feed `buildBatchExport({ skus: ['1001'], onlyRequiredEmpty: false }).rows.map(r => ({ rowNumber: n++, ...r.cells }))` to `applyBatchUpdateImport`.
    - Expect `failed` to equal `[]` and `unchanged` to equal `rows.length`.
  - `it('still fails a changed row that leaves a required attribute empty')`
    - Edit only the description of a flagged row.
    - The errors contain `'Attribute Grade must be filled'`.
  - `it('treats a cell equal to the current value as unchanged')`
    - The vendor cell is the current vendor name in a different case, and the result is unchanged.
- [ ] **Step 2:** Run `npx vitest run tests/batch-update-import.spec.ts`. Expected: the 3 new tests FAIL.
- [ ] **Step 3: Implement** the rule in `validateBatchUpdateRows`.
- [ ] **Step 4:** Run `npx vitest run tests/batch-update-import.spec.ts tests/batch-export.spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit:
  ```bash
  git commit -am "fix(inventory): unchanged rows in a re-uploaded batch export are skipped, not failed (ATINV-9083)"
  ```

### Task 3: Update batches page — step 1 filters (direction A)

**Files:**
- Modify: `app/components/pages/ImportBatchUpdatePage.vue` (step 1 block, `downloadTemplate`, `templateSkus`)
- Modify: `app/data/translations.ts`, `app/data/devChanges.ts`
- Test: `tests/import-batch-update-export-filters.spec.ts` (mount test)

**Interfaces — consumes:** `buildBatchExport`, `exportableProductSkus` and `writeBatchExportXlsx` (Task 1).

**UI (decided in the visual companion, option A):**
- Step 1 keeps the title "Download the template" and the button "Download template" (secondary).
- Between the description and the button:
  - **Products**: a multi-select `ErpFilterSelect`, labelled "Products". Check `docs/patterns/ErpFilterBar.md` for the multi-select mode. If `ErpFilterSelect` has no multi mode, stop and ask the user which component to use (CLAUDE.md SOP §3).
    - Options come from `exportableProductSkus()`, shown by name.
    - Default: all, or only `?sku` when present.
    - Clearing it means all.
  - **Checkbox:** `MpCheckbox` "Only batches with an empty required attribute" (`rule/checkbox-gap-12`).
- The step description changes to: "The template lists your current batches, ready to edit. Filter it to the batches you want to update."
- **Click:**
  - If `buildBatchExport(...).rows.length === 0`, show the inline `<p class="ibu-error">` "No batches match these filters" under the button. Download nothing.
  - Otherwise call `writeBatchExportXlsx(data, 'update-batches-template.xlsx', t)` and show the success toast "Batches exported".
- Tag the filter block `data-devchange="batch-export-filters"`.

- [ ] **Step 1: Write the failing mount test.** Follow the mount setup in an existing page spec, e.g. `tests/batch-attribute.spec.ts`, or any spec that mounts a page with `useLocale`.
  - `it('shows Products and the required-empty checkbox in step 1')`
  - `it('shows the no-match message and does not download when the filters match nothing')`. Spy on `writeBatchExportXlsx` with `vi.mock('~/utils/batchExportXlsx')`. Expect it not to have been called, and the text "No batches match these filters" to be present.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement** the UI, the copy and the devChanges entry `{ id: 'batch-export-filters', title: 'Export batches from the Update batches page', description: 'Step 1 filters by product and by batches missing a required attribute; the file can be edited and imported back.', date: '2026-10-27', files: ['app/components/pages/ImportBatchUpdatePage.vue'] }`.
- [ ] **Step 4:** Run `npm run test -- --run && npm run build`. Expected: PASS and the build succeeds.
- [ ] **Step 5:** Commit:
  ```bash
  git commit -am "feat(inventory): Update batches step 1 exports current batches with product + required-empty filters (ATINV-9083)"
  ```

### Task 3b: Product detail — Export batches modal

**Files:**
- Create: `app/components/patterns/BatchExportModal.vue`
- Modify: `app/components/pages/ProductDetailsPage.vue`. Replace the `ExportModal` usage and `exportBatches` (around the lines where `batchExportOpen` and `batchExportColumns` are defined), and drop the `scope-note` copy.
- Modify: `translations.ts`, `devChanges.ts`
- Test: `tests/batch-export-modal.spec.ts`

**Interfaces:** `BatchExportModal` props are `{ open: boolean; sku: string }`. It emits `close`. It calls `buildBatchExport({ skus: [sku], onlyRequiredEmpty })` and `writeBatchExportXlsx`, then closes and shows the "Batches exported" toast.

**UI:**
- `MpModal` sm/md, titled "Export batches" (`docs/patterns/Modal.md`).
- Body:
  - A caption: "The file uses the Update batches template, so you can edit it and import it back."
  - The checkbox from Task 3.
  - The inline no-match error from Task 3.
- Footer: ghost Cancel, primary Export.
- Tag `data-devchange="batch-export-modal"`.

- [ ] **Step 1: Write the failing test:**
  - `it('exports only this product')`: the mocked `writeBatchExportXlsx` receives rows whose `productName` are all the product's name.
  - `it('shows the no-match error when the checkbox filters everything out')`: a product with no required attributes and the checkbox ticked.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement** the modal, wire it into `ProductDetailsPage`, and add the devChanges entry.
- [ ] **Step 4:** Run `npm run test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 5:** Commit:
  ```bash
  git commit -am "feat(inventory): product Export batches uses the import template with a required-empty filter (ATINV-9083)"
  ```

---

## ATINV-9082 — attributes in batch drawers

### Task 4: Batch identity bridge + seeded lot records

**Files:**
- Modify: `app/data/productDetails.ts` (new exports next to `getProductBatchById`)
- Modify: `app/data/batchStore.ts` (seed records for lots)
- Test: `tests/batch-identity-bridge.spec.ts`

**Interfaces — produces:**
```ts
export function findProductBatch(sku: string, batchNo: string): ProductBatchSummary | undefined  // case-insensitive, excludes Unassigned
export function batchAttributesFor(sku: string, batchNo: string, lotExpiry?: string): BatchAttributeValues
// record's attributes if found, else { expiry_date: lotExpiry } (omitted when empty)
export function ensureProductBatch(sku: string, batchNo: string, seed: { expiry_date?: string; description?: string }): ProductBatchSummary
// returns the existing record or creates one WITHOUT the required-attribute check (a lot that physically exists);
// still rejects 'Unassigned' and non-batch-tracked SKUs (throws — callers only pass tracked SKUs)
export function fillEmptyBatchAttributes(sku: string, id: string, values: BatchAttributeValues, by?: string): ProductBatchSummary
// writes only keys that are empty on the batch AND in the product's config; never overwrites; logs activity like updateBatch
```

**Seed lot records:**
- In `batchStore.ts`, alongside `SEED_RECORDS`, derive created records for the warehouse lots of SKUs `1001`, `1002` and `1101` (the SKUs in `SEED_CONFIGS`) from `getWarehouseDetail(...)`. Use a lazy initialiser to avoid a circular import, and keep it deterministic.
- Fill every **required** attribute of the product:
  - `supplier`: rotate `V001`, `V002`, `V003`
  - `grade`: rotate the seed grade IDs
  - dates: from the lot expiry
- Leave the **first lot of each SKU** with its required non-expiry attributes empty, to demo that state.
- **ASSUMPTION:** cycle-1 lots exist for these SKUs. If one doesn't, choose the nearest batch-tracked SKU that has lots, and add a matching `SEED_CONFIGS` entry.
- Bump `RECORDS_KEY` to `'batch-records-v2'` so existing snapshots reseed.

- [ ] **Step 1: Write the failing tests:**
  - `it('finds a product batch by number, case-insensitively')`
  - `it('falls back to lot expiry for an unknown lot')`: `batchAttributesFor('1001', 'Batch #99999', '2027-01-31')` equals `{ expiry_date: '2027-01-31' }`.
  - `it('ensureProductBatch creates once and returns the same record after')`: the IDs are equal, and it appears in `getProductBatches`.
  - `it('ensureProductBatch skips required checks')`: 1001 requires supplier, and the call succeeds without one.
  - `it('fillEmptyBatchAttributes never overwrites')`: a batch with `supplier: 'V003'` filled with `{ supplier: 'V001', grade: 'grade-a' }` ends with supplier `'V003'` and grade `'grade-a'`.
  - `it('seeds lot records with required values except the first lot per SKU')`
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npx vitest run tests/batch-identity-bridge.spec.ts tests/batch-attribute.spec.ts tests/batch-export.spec.ts`. Expected: PASS. Update any count assertions in older specs that changed because of the new seed records, and say why in the commit.
- [ ] **Step 5:** Commit:
  ```bash
  git commit -am "feat(inventory): one batch master for warehouse lots and product batches; seeded lot attributes (ATINV-9082)"
  ```

### Task 5: Drawer attribute rules (pure)

**Files:**
- Create: `app/data/batchDrawerAttributes.ts`
- Modify: `app/data/purchaseDeliveryBatches.ts`. Move the vendor-mismatch logic into the new module and re-export it, so the delivery code keeps working.
- Test: `tests/batch-drawer-attributes.spec.ts`

**Interfaces — produces:**
```ts
export type DrawerMode = 'receiving' | 'issuing'
export function drawerModeFor(kind: 'count'|'in-out'|'transfer'|'receiving'|'put-away'|'picking'|'purchase-delivery'): DrawerMode | null
// in-out, receiving, purchase-delivery → 'receiving'; transfer, put-away, picking → 'issuing'; count → null
export interface DrawerBatchInput { batchNo: string; attributes: BatchAttributeValues }
export interface DrawerBatchCheck {
  rows: { batchNo: string; existing: ProductBatchSummary | undefined; isUnassigned: boolean }[]
  errors: { index: number; code: 'required' | 'duplicate-new' | 'batch-no'; key?: BatchAttributeKey }[]
}
export function checkDrawerBatches(sku: string, mode: DrawerMode, input: readonly DrawerBatchInput[]): DrawerBatchCheck
export function vendorMismatches(sku: string, vendorId: string, input: readonly DrawerBatchInput[]): { batchNo: string; batchVendorId: string }[]
```

**Rules:**
- `existing = findProductBatch(sku, batchNo)`.
- `'issuing'` mode never returns `required` errors.
- In `'receiving'` mode, a row whose product's required key is empty, both on the existing batch and in the input, gets a `required` error. The Unassigned batch is skipped.
- Two input rows with no `existing` and the same number (case-insensitive) both get `duplicate-new`.
- An invalid new number (reserved "Unassigned", or blank) gets `batch-no`, using `validateBatchNo` codes via `validateNewBatch`.
- `vendorMismatches` covers rows whose existing batch has a non-empty supplier different from `vendorId`.

- [ ] **Step 1: Write the failing tests:** one per rule above, plus:
  - `it('treats a number that exists only as a product record as existing, not duplicate')`: `createBatch('1001', { batchNo: 'R-1', attributes: { supplier: 'V001' } })`, then checking `[{ batchNo: 'r-1', attributes: {} }]` in receiving mode gives no errors, and `rows[0].existing.id` equals that record.
  - `it('flags two new rows with the same number in different case')`
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement.** Keep `checkDeliveryBatches` passing: either rebase it on `checkDrawerBatches` plus its qty-sum check, or leave it alone and only share `vendorMismatches`.
- [ ] **Step 4:** Run `npx vitest run tests/batch-drawer-attributes.spec.ts tests/purchase-delivery-batches.spec.ts`. Expected: PASS.
- [ ] **Step 5:** Commit:
  ```bash
  git commit -am "feat(inventory): receiving vs issuing batch attribute rules for drawers (ATINV-9082)"
  ```

### Task 6: Shared attribute columns composable + ManageBatchDrawer for every kind

**Files:**
- Create: `app/composables/useBatchAttributeColumns.ts`
- Modify: `app/components/patterns/ManageBatchDrawer.vue`. Generalise `deliveryConfig`, `deliveryAttrKeys`, `attrLabel`/`attrText`, the attribute `<col>`/`<th>`/cells, `setRowAttr`, `--mbd-attr-count` and `trailingColspan` from `isDelivery` to `drawerModeFor(kind) !== null`. Also change `addWarehouseBatch`, `handleDrawerScan`, `availableBatches`, `handleSave` and the emit.
- Test: `tests/manage-batch-drawer-attributes.spec.ts` (mount)

**Interfaces:**
```ts
// composable
export function useBatchAttributeColumns(sku: Ref<string>): {
  keys: ComputedRef<BatchAttributeKey[]>            // product config order, WITHOUT expiry_date (it has its own column)
  label: (k: BatchAttributeKey) => string           // t(), 'Vendor' for supplier
  text: (k: BatchAttributeKey, v: BatchAttributeValues) => string  // vendor name; grade "A · Rank 1"; dates DD MMM YYYY; '—' when empty
  options: (k: BatchAttributeKey) => { value: string; label: string }[]  // vendors / ACTIVE grades
}
```
- `CommittedBatch`: change the comment on `batchId?` / `attributes?` from "Purchase delivery only" to "every kind except count". Rows built from warehouse lots and scans set `attributes = batchAttributesFor(sku, batchNo, expiryDate)` and `batchId = findProductBatch(...)?.id`.

**Behaviour:**
- **Receiving mode:**
  - A new row gets inputs per key, using the same controls as the delivery path today.
  - An existing row shows text. An existing row's **empty** key shows an input instead (except on Unassigned).
  - Save runs `checkDrawerBatches`. Show errors inline under the table, in the same place as `checkDeliveryRows`. Required copy: "Attribute {label} must be filled" / "Atribut {label} harus diisi".
- **Issuing mode:** text only, and Save never fails on attributes.
- **Select-batch dropdown:** each option shows a second line, `keys.map(k => text(k, attrs)).join(' · ')`. Omit the line when there are no keys.
- **Purchase delivery:** behaviour unchanged (its tests must stay green).
- Tag the attribute header group `data-devchange="batch-drawer-attributes"`.

- [ ] **Step 1: Write the failing mount tests.** Mount with `sku: '1001'`, a warehouse that has 1001 lots, and `open: true`.
  - `it('shows Vendor and Grade columns for kind in-out')`
  - `it('shows read-only attribute text for kind transfer')`: no `MpAutocomplete` in the attribute cells.
  - `it('blocks save in receiving mode when a new row has no required Vendor')`: an error text containing "must be filled", and no `update:modelValue` emitted.
  - `it('lets an issuing drawer save a batch with an empty required attribute')`
  - `it('shows attribute values under each option in the batch dropdown')`
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement** the composable and the drawer changes. Invoke `pixel-erp-design` (drawer and table-form rows) before editing.
- [ ] **Step 4:** Run `npm run test -- --run`. All `manage-batch-drawer*`, `drawer-receiving-*`, `purchase-delivery-*` and `new-batch-registration` specs pass. Run `npm run build`.
- [ ] **Step 5:** Add the devChanges entry and commit:
  ```bash
  git commit -am "feat(inventory): batch attributes in every Manage batch drawer, receiving vs issuing (ATINV-9082)"
  ```

### Task 7: Receiving commits write the batch master (WMS receiving + stock in)

**Files:**
- Modify: `app/data/receivingTasks.ts`:
  - `ReceivingBatchLine` gains `attributes?: BatchAttributeValues`
  - `commitReceivingStock` (around the `registerNewBatch` call)
  - add a vendor lookup for the task's PO
- Modify: `app/components/pages/ReceiveItemsPage.vue`. Pass `:vendor-id` to the drawer, keep `attributes` in `batchLinesBySku`, and add the mismatch confirm.
- Modify: `app/data/stockAdjustments.ts`. `AdjustmentInput.lines[]` / `StockAdjustment.lines[]` gain `batches?: { batchNo: string; qty: number; attributes: BatchAttributeValues }[]`. `addAdjustment` stores them.
- Modify: `app/components/pages/StockInOutFormPage.vue`. Pass `locRow.batchLines` (with attributes) into `addAdjustment`/`addWmsAdjustmentSafe`.
- Modify: `app/components/pages/StockAdjustmentDetailsPage.vue`. Feed the stored `batches` to `ViewBatchDrawer` when present.
- Test: `tests/receiving-batch-attributes.spec.ts`, `tests/stock-in-batch-attributes.spec.ts`

**Interfaces — produces:**
```ts
export function receivingTaskVendorId(taskId: string): string | undefined   // receivingTasks.ts; from the owning PO/receipt, undefined if none
export function commitDrawerBatches(sku: string, lines: readonly { batchNo: string; expiryDate?: string; description?: string; attributes?: BatchAttributeValues }[], by?: string): void
// productDetails.ts: per line → ensureProductBatch then fillEmptyBatchAttributes (never overwrite)
```
- `ManageBatchDrawer` gets a new optional prop, `vendorId?: string`. In receiving mode, a new row prefills `supplier` from it, generalising `addNewBatch`'s delivery prefill.

**Behaviour:**
- `commitReceivingStock` calls `commitDrawerBatches(it.sku, it.batchLines)` next to `registerNewBatch`.
- `addAdjustment` calls `commitDrawerBatches` for each line that has `batches`.
- Neither path calls `createBatch` with strict validation.
- The vendor-mismatch confirm in `ReceiveItemsPage` reuses `ConfirmModal` and `VENDOR_MISMATCH_COPY`.

- [ ] **Step 1: Write the failing tests:**
  - `it('a received new batch becomes a product batch with its attributes')`: run the receiving flow through the data API (`endReceiving` or whatever completes and commits a task in `receivingTasks.ts`), then `findProductBatch(sku, no)?.attributes.supplier === 'V001'`.
  - `it('receiving into an existing batch only fills empty attributes')`
  - `it('a stock-in adjustment stores its batch lines and creates the batches')`: `addAdjustment({... lines: [{ sku: '1001', qty: 5, batches: [{ batchNo: 'SI-1', qty: 5, attributes: { supplier: 'V002' } }] }] })`, then `getAdjustment(id).lines[0].batches[0].attributes.supplier === 'V002'` and `findProductBatch('1001', 'SI-1')` is defined.
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npm run test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 5:** Add devChanges entries `receiving-batch-attributes` and `stock-in-batch-attributes` (tag the drawer trigger cells). Commit:
  ```bash
  git commit -am "feat(wms,inventory): receiving and stock-in save batch attributes to the batch master (ATINV-9082)"
  ```

### Task 8: Read-only attributes in ViewBatchDrawer and PickBatchDrawer + page wiring

**Files:**
- Modify: `app/components/patterns/ViewBatchDrawer.vue`. `PickedBatchRow` gains `attributes?: BatchAttributeValues`, and `sku` becomes a prop if it isn't already. Add attribute columns via `useBatchAttributeColumns` after Expiry, in every mode. The value is the row snapshot when present, else `batchAttributesFor(sku, batchNo, expiryDate)`.
- Modify: `app/components/patterns/PickBatchDrawer.vue`. Add the same columns. Rows take `batchAttributesFor`.
- Modify the callers so the `sku` prop and snapshots flow through:
  - `CreateWorkOrderPage.vue`, `WorkOrderDetailsPage.vue`, `NewMaterialRecordPage.vue`
  - `PutAwayItemsPage.vue`, `CreatePutAwayPage.vue`, `PutAwayDetailsPage.vue`
  - `PickItemsPage.vue`, `CreatePickingPage.vue`, `PickingTaskDetailsPage.vue`
  - `PackItemsPage.vue`, `CreatePackingPage.vue`, `PackingTaskDetailsPage.vue`
  - `ReceivingTaskDetailsPage.vue`, `PurchaseDeliveryDetailsPage.vue`, `DeliveryTaskDetailsPage.vue`
- Modify the line types that persist batch picks, so `attributes` is kept on save (snapshot). Put-away, picking and packing draft/commit types live in `app/data/putAwayTasks.ts`, `pickingTasks.ts` and `packingTasks.ts` (find the exact types by grepping `batchLines`/`batchPicks`).
- Test: `tests/view-batch-drawer-attributes.spec.ts`

- [ ] **Step 1: Write the failing mount tests:**
  - `it('ViewBatchDrawer shows Vendor and Grade for a 1001 batch')`
  - `it('prefers the line snapshot over the current master value')`: pass `attributes: { supplier: 'V002' }` while the master says V003, and the cell shows V002's name.
  - `it('shows — for a lot with no record')`
  - `it('PickBatchDrawer shows attribute columns read-only')`
- [ ] **Step 2:** Run them. Expected: FAIL.
- [ ] **Step 3: Implement** the components and wire each caller. Invoke `erp-table-page` if any caller column definition is a `TableColumn[]`.
- [ ] **Step 4:** Run `npm run test -- --run` (the `view-batch-drawer`, `pick-items-*`, `*-view-batch-serial*` specs stay green) and `npm run build`.
- [ ] **Step 5:** Add the devChanges entry `view-batch-drawer-attributes`. Commit:
  ```bash
  git commit -am "feat(wms,manufacturing): batch attributes in view and pick drawers; snapshot kept on saved lines (ATINV-9082)"
  ```

### Task 9: Picking — suggested vs scanned batch shows both batches' attributes

**Files:**
- Modify: `app/components/patterns/ManageBatchDrawer.vue` (picking `executionMode` with `plannedBatches`)
- Test: add to `tests/manage-batch-drawer-attributes.spec.ts`

**Behaviour:**
- In picking execution, the planned (suggested) row shows its attribute text in the same columns as picked rows. A picked row whose number differs from every planned row shows its own attributes. Both are visible at once in the existing planned-vs-actual layout.
- Don't add a new comparison panel.

- [ ] **Step 1: Failing test** `it('shows attributes for both the suggested and the scanned batch when they differ')`: mount picking with `plannedBatches: [A]` and a modelValue picked `B`, then both A's and B's vendor names are rendered.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4:** Run `npm run test -- --run`. Expected: PASS.
- [ ] **Step 5:** Commit:
  ```bash
  git commit -am "feat(wms): picking compares suggested vs scanned batch attributes (ATINV-9082)"
  ```

---

### Task 10: Docs, copy review, coachmarks

**Files:**
- Modify: `docs/prd/batch-attribute-plan.md`:
  - Add **Phase 6 — Batch export (ATINV-9083)** and **Phase 7 — Batch drawers (ATINV-9082)** "As built" sections.
  - Extend the §3 coverage table with stories 11 (export), 15–23.
  - Move the spec §8 follow-ups into §8.
- Modify: `app/data/translations.ts`. Run every new string through uxw-mekari (`pixel-erp-design` copy mode).
- Modify: `app/data/devChanges.ts`. Confirm one entry per `data-devchange` id added in Tasks 3–9.

- [ ] **Step 1:** Run `grep -rn 'data-devchange="batch-' app/components`. Every id has a `DEV_CHANGES` entry.
- [ ] **Step 2:** Run `npm run test -- --run && npm run build`. Expected: PASS.
- [ ] **Step 3:** Commit:
  ```bash
  git commit -am "docs(batch-attribute): phases 6-7 as built, follow-ups, copy review (ATINV-9082, ATINV-9083)"
  ```

### Task 11: Preview + headless browser screenshots (user requirement)

- [ ] **Step 1:** Run `lsof -ti:4322 | xargs kill -9; set -a; . ./.env; set +a; PORT=4322 node .output/server/index.mjs` (run in the background).
- [ ] **Step 2:** Invoke the `agent-browser` skill (headless). Take screenshots into `docs/superpowers/evidence/2026-10-27-batch-attribute/`. **Never** type credentials into a screenshot; mask any personal data. Find each route in `app/pages/[...slug].vue`.
  1. Update batches page (`/product-list/import-batches`): filters, and the no-match message
  2. Product 1001 › Stock by batches › Export batches modal
  3. Stock in/out form → Manage batch (in-out): attribute columns, and the required error
  4. Stock adjustment details → batches with attributes
  5. Warehouse transfer form → batch drawer (read-only attributes, dropdown option lines)
  6. Work order create → raw materials batch drawer
  7. WMS receive items → receiving drawer with Vendor prefill, and the mismatch confirm
  8. WMS put-away items, pick items (suggested vs scanned), pack items → drawers
  9. Purchase delivery details → View batch
  10. Product 1001 › Stock by batches after a WMS receipt: the new batch with its attributes (qty 0 is the known gap)
- [ ] **Step 3:** Open the exported xlsx with `node -e` (`XLSX.readFile`) and print `SheetNames` and one note, as evidence of the file layout.
- [ ] **Step 4:** Report the screenshot paths and any surface that failed. Don't claim success without them (superpowers:verification-before-completion).
