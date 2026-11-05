**Classification: INTERNAL**

# Batch Attribute — batch drawers (ATINV-9082) + batch export (ATINV-9083)

**Tickets:** ATINV-9082 "Batch Drawer x Batch Attribute", ATINV-9083 "Export Batch". Both are under epic ATINV-8769 "[INV] 26Q4 Batch Attribute".
**Source PRD:** [PRD] INV - Batch Attribute (Confluence page 51290243799), v1.3 (27 Oct 2026). Stories 11, 15–23.
**Branch:** `feat/batch-attribute`. Merge `origin/main` into it first: the branch is 203 commits behind, and its last commit was 21 Sep 2026.
**Builds on:** `docs/prd/batch-attribute-plan.md` on that branch (Phases 0–5 built). Its decisions D1–D3 and PM answers A1–A9 still apply. In particular, the UI says **Vendor** for the `supplier` attribute, and the **Unassigned** batch never carries attributes.

---

## 1. Intent

The Batch Attribute foundation is already in the prototype: the Grades page, each product's attribute set, batch create/edit, the Update batches import, and the Purchase delivery drawer. The PRD has since added two things:

1. **Every batch drawer shows a batch's attributes.** Where the drawer receives stock, it can also create a batch with its attributes. This lets operators tell batches apart by Grade, Vendor or dates, and makes stock coming in carry the right attributes from the start.
2. **Export current batches** in the import template's format. Users can find batches that are missing a required attribute, fill them in, and upload the same file again.

**Audience:** PM, design and engineering review this prototype on the 4322 preview. It has to be clickable end to end, and every save has to persist (CLAUDE.md SOP §3).

## 2. Goals, non-goals and anti-goals

**Goals**
- ATINV-9083: export from two entry points, with the PRD's filters, file layout and re-upload behaviour.
- ATINV-9082: attributes in every **existing** batch drawer, with each drawer receiving or issuing as its flow requires.
- Unedited exported files re-import with no errors.

**Non-goals (scope decided by the user, 27 Oct 2026: "existing drawers only")**
- No new batch drawer for **Sales delivery** or **Sales invoice** (PRD story 16). Logged as a follow-up.
- No **Purchase invoice** receiving flow (story 15). Logged as a follow-up.
- No **Work order finished goods** batch drawer (story 19, finished goods half). WO has no finished goods drawer today. Logged as a follow-up.
- No API, billing or Jurnal-brand work (D3).
- No Sales return or Purchase return drawers (none exist).

**Anti-goals: these would mean failure even if the code works**
- An exported file that fails when uploaded again unchanged.
- A drawer that silently overwrites an existing batch's attribute value. The PRD rule is that a transaction never overwrites a batch's attributes.
- Required-attribute rules blocking an **issuing** flow (transfer, picking, packing, WO materials, put-away). Empty attributes must never block those.
- A one-off table or drawer layout instead of the shared drawer components.

## 3. Constraints

- Follow all four repo skills in `.agents/skills`:
  - `pixel-erp-design`: the entry point. Rules in `docs/design/RULES.md`, states in `docs/design/reachable-states.md`.
  - `erp-table-page`: column kinds for any `ErpTablePage`.
  - `pixel`: Pixel 3 primitives and Enterprise tokens.
  - `pixel-guardian` lenses: for review only.
- Follow the CLAUDE.md SOP:
  - build
  - full test suite, including pixel-police
  - restart the 4322 preview with `.env` loaded
  - add a `data-devchange` attribute and an `app/data/devChanges.ts` entry for every changed UI element
  - verify in a browser
- All copy goes through `t()` in `app/data/translations.ts`, with Indonesian per uxw-mekari. Use the PRD's EN/ID strings where it gives them, with "Supplier" changed to "Vendor".
- Spreadsheets use the existing `xlsx` 0.18.5 library. A spike on 27 Oct 2026 confirmed it **writes cell notes (comments) and a second sheet**. It can't write cell fill colours, and none are needed.
- **Required by the user:** once implementation is done, run a headless browser (`agent-browser` skill) against the 4322 preview and take screenshots of every changed surface.

## 4. ATINV-9083 — Batch export (decided)

### 4.1 Update batches import page (`ImportBatchUpdatePage.vue`), step 1

The user picked **direction A** in the visual companion: filters live in step 1, and there is one download button.

- Step 1 keeps the title "Download the template". Two filters go above the button:
  - **Products**: multi-select of batch-tracked, non-archived products, all selected by default. Built with `ErpFilterSelect` per `rule/select-erpfilterselect`; check whether it supports multi-select and follow the multi-select pattern the filter bar already uses.
  - **"Only batches with an empty required attribute"**: checkbox, unchecked by default.
- Opened from a product (`?sku=`), Products starts with only that product selected. The user can still change it (my call).
- **Download template** writes the filtered current batches. If the filters match no batches, show an inline message under the button and download nothing (`rule/form-errors-inline`, no disabled button).

### 4.2 Product detail › Stock by batches › Export icon

- Replaces today's `ExportModal` and its column picker. The column picker goes because the file has to keep the template's columns to be importable again.
- The new export window is a small `MpModal` titled "Export batches", containing:
  - one checkbox: "Only batches with an empty required attribute"
  - a caption: the file uses the Update batches template, so it can be edited and imported back
  - Cancel and Export buttons
- The export is scoped to this product. It writes the same file as §4.3 and shows the success toast "Batches exported".

### 4.3 The file (shared builder, in `app/data/batchUpdateImport.ts`)

- **Sheet 1, "Batches":** the same columns and order as `BATCH_UPDATE_COLUMNS`.
  - One row per batch (product + batch number) of non-archived products.
  - Batches with 0 on-hand are included. The Unassigned batch and archived batches are left out.
  - Sorted by product name A–Z, then batch number A–Z.
- **Cell values:** in the import's own formats, as `batchUpdateTemplateRows` writes them today.
- **Cell notes:**
  - An attribute the product uses, that is required and empty: the cell stays blank and gets a note, "Required attribute is empty" / "Atribut wajib masih kosong", localised by current language.
  - An attribute the product doesn't use: blank, with no placeholder.
- **Sheet 2, "Attribute Setup":** one row per exported product, listing each selected attribute and whether it's required. The import reads only the first sheet, as it does today.
- **Header row:** row 1 stays the header, as now. The PRD Helper Google Sheet ("ignore rows 1–5") couldn't be read: it needs a Google sign-in. **My call:** keep today's layout. Change it if the PM shares the sheet.
- **Delivery:** the export is generated in the browser right away, with a success toast. There's no fake background job, because the prototype's activity popover can't hold files. This departs from PRD "runs as background process". **My call.**

### 4.4 Re-upload (`validateBatchUpdateRows`)

- **New rule (PRD):** a row whose cells cause **no change** to the batch master is skipped, not failed. This holds even when a required attribute is still empty.
  - A cell counts as no change when it is blank, or when it equals the current value in import format.
  - Today such a row fails with "Attribute xxx must be filled", which is the defect this fixes.
- Rows that do change something keep every existing validation, including the required-attribute check.
- The result page counts skipped rows as unchanged (`BatchUpdateImportResult.unchanged`). They never appear in the error file.

## 5. ATINV-9082 — attributes in the existing batch drawers

### 5.1 The shared foundation

**Batch identity bridge.**
- WMS and warehouse lots (`warehouseDetails.ts`, `Batch #00001`) and product batch records (`productDetails.ts` / `batchStore.ts`, `Batch #001`) use different numbers, and no helper finds a batch by SKU + number.
- **Rule (PRD story 10):** a batch is identified by product + batch number, not by warehouse. A warehouse lot and a product batch record with the same SKU and number **are the same batch**.
- Add `findProductBatch(sku, batchNo)` and `batchAttributesFor(sku, batchNo)`:
  - Return the record's attributes when a product batch record exists.
  - Otherwise return `{ expiry_date }` from the lot, so nothing breaks.
- **My call:** don't renumber the seed lots. That would ripple through about 15 WMS pages and their tests.
- **My call: one master, created on demand.**
  - When a drawer writes attribute values to a lot that has no record, it first creates the record through a new `ensureProductBatch(sku, batchNo, { expiry_date })`, and the values go to that record. There's no second store on the lot overlay.
  - The demo seed creates records the same way for the lots of the demo SKUs whose attribute set is richer than Expiry. The demo then shows Vendor, Grade and dates in WMS drawers, and those batches appear in the export.
  - Mark it clearly as seed data.
  - **Seeded lots get values for every required attribute of their product.** That way, receiving into an existing seeded lot isn't blocked across the demo. One lot per demo SKU is left with an empty required attribute, to show that state.
- **My call: new vs existing in a receiving drawer.**
  - A typed or scanned number that matches a product batch record **anywhere** (any warehouse, or qty 0) is an **existing** batch: read-only, and only its empty attributes can be filled. It is not a duplicate error.
  - "Duplicate batch number" can only come from two *new* rows with the same number in one drawer.

**New batches created in a receiving drawer become product batch records.**
- WMS receiving and stock-in currently call `registerNewBatch` (a warehouse lot only).
- They must also call `createBatch(sku, { batchNo, description, attributes })`. That makes the batch appear on the product's Stock by batches tab, its batch detail page and the export.
- `createBatch` runs only when the transaction is saved or committed (PRD: no save, no batch).

**Attribute columns in `ManageBatchDrawer.vue`.**
- Generalise the `purchase-delivery`-only code (`deliveryConfig`, `deliveryAttrKeys`, attribute cells, `setRowAttr`, `--mbd-attr-count`) to every kind except `count`.
- Columns follow the product's attribute order. Expiry keeps its existing column.
- Vendor shows the vendor name; Grade shows "A · Rank 1", as in the batch form.
- The Select-batch dropdown shows each batch's attribute values under its number (PRD story 15).

**Receiving behaviour** (kinds `in-out`, `receiving`, and `purchase-delivery` as already built):
- A new batch row gets inputs for each attribute, using the same controls as `BatchFormModal`. Required attributes must be filled before Save; show an inline error, per `rule/form-errors-inline`.
- An existing batch shows its values read-only. Any empty attribute can be filled in, and a required one must be filled.
- The Unassigned batch is exempt from all of this.
- Values filled in on an existing batch are written to the batch master when the transaction is saved. They never overwrite a value that's already there.
- **Vendor prefill:** WMS receiving prefills Vendor from the receiving task's source purchase order, when one with a vendor can be found. Otherwise the user picks it. Stock in has no vendor, so there's no prefill.
- **Vendor mismatch (PRD story 20 → story 14):**
  - WMS receiving reuses the Purchase delivery behaviour (`checkDeliveryBatches` / `VENDOR_MISMATCH_COPY`, generalised out of the delivery-only path). Existing batches with a different Vendor get one confirm listing all of them. An empty Vendor is filled silently. A value that's already there is never overwritten.
  - Stock in has no vendor, so there's no warning.

**Issuing behaviour** (kinds `transfer`, `put-away`, `picking`; `PickBatchDrawer`; `ViewBatchDrawer`):
- Attribute columns are read-only, and empty attributes never block saving.

**Record on the line.**
- On save or commit, each batch line stores an `attributes` snapshot. Flows that already persist batch lines do this: receiving, put-away, picking, packing, WO material reservations, material records.
- Details pages and `ViewBatchDrawer` show the snapshot when there is one, and the current master values otherwise.

### 5.2 Per surface

| PRD story | Surface (page → drawer) | Behaviour |
|---|---|---|
| 17 | Stock adjustment "in/out" (`StockInOutFormPage` → Manage `in-out`) | Receiving behaviour. Batch qty is always positive, so this flow is stock-in only: the **issuing half of story 17 can't be reached** and is noted, not built. **Persist** the line's batches (with snapshot) on the saved adjustment so `StockAdjustmentDetailsPage` shows them. Today they're dropped. |
| 17 | Stock adjustment details (`StockAdjustmentDetailsPage` → View `in-out`) | Read-only attribute columns. |
| 18 | Warehouse transfer (`WarehouseTransferFormPage` → Manage `transfer`) | Issuing behaviour: read-only attributes in the rows and in the dropdown options. **My call:** persisting the transfer's batch lines is **out of scope**. There's no transfer details batch view to show them on, and this is logged as a gap. |
| 19 | Work order materials (`CreateWorkOrderPage`, `WorkOrderDetailsPage`, `NewMaterialRecordPage` → `PickBatchDrawer`) | Read-only attribute columns. |
| 20 | WMS receiving (`ReceiveItemsPage` → Manage `receiving`; `ReceivingTaskDetailsPage` → View) | Receiving behaviour + Vendor prefill + `createBatch` on commit. On the handheld screen layout, attribute fields sit below Batch number (PRD "needs design emphasis"). Follow the drawer's existing layout and keep columns if that's all it has. |
| 21 | WMS put-away (`PutAwayItemsPage` → Manage `put-away`; `CreatePutAwayPage`, `PutAwayDetailsPage` → View) | Read-only. The P1 task-list attribute display isn't built. |
| 22 | WMS picking (`PickItemsPage`, `CreatePickingPage` → Manage `picking`; `PickingTaskDetailsPage` → View) | Read-only. When the scanned batch differs from the suggested (planned) batch, both rows show their attribute values so the operator can compare them. Use the existing planned-vs-actual layout; don't add a new comparison panel. |
| 23 | WMS packing (`PackItemsPage`, `CreatePackingPage`, `PackingTaskDetailsPage` → View `packing`) | Read-only. The P1 label/packing-list print isn't built. |
| 15 | Purchase delivery details (`PurchaseDeliveryDetailsPage` → View) | Already passes expiry and description; add the attribute columns. |

### 5.3 Reachable states (walk `docs/design/reachable-states.md`)

- **Product shape:** expiry-only (no extra columns) vs a 3-attribute set.
- **Batch values:** a batch with empty optional attributes ("—"), and a batch with an empty **required** attribute.
  - In a receiving drawer: blocked, with an inline error.
  - In an issuing drawer: shown as "—", not blocked.
- **The Unassigned row:** "—" in every column, never editable.
- **New batch:** two new rows with the same number show an inline error. A number that already exists is picked up as the existing batch (§5.1).
- **Dropdown:** options showing attributes.
- **Picking:** suggested ≠ scanned.
- **Export:**
  - the filter matches nothing (inline message)
  - an export with required-empty notes
  - an unchanged re-upload (0 errors, all rows unchanged)

## 6. Work order and order of delivery

1. Merge `origin/main` into `feat/batch-attribute` and resolve conflicts. Build and run the tests before any feature work.
2. ATINV-9083: the export builder, the step 1 filters, the product export window, and the unchanged-row skip.
3. ATINV-9082 foundation: lookup bridge + lot seed attributes, generalised drawer attribute columns, receiving/issuing behaviour, `createBatch` from receiving drawers, line snapshot.
4. ATINV-9082 surfaces, one table row at a time (§5.2).
5. `devChanges.ts` entries; update `docs/prd/batch-attribute-plan.md` with a Phase 6 (export) and a Phase 7 (drawers), plus the follow-ups.
6. Build, full tests, restart 4322, then headless browser screenshots of every changed surface (user requirement).

## 7. Left to the builder

- Exact component split: a composable versus inline code in `ManageBatchDrawer` for the attribute columns.
- Test file names (follow `<feature-slug>.spec.ts`). Add specs at least for:
  - the export rows, sorting, notes and the Attribute Setup sheet
  - the unchanged-row skip
  - `batchAttributesFor`
  - required-attribute blocking in receiving vs issuing kinds
  - `createBatch` on receiving commit
- How the Vendor prefill finds the PO vendor for a receiving task.

## 8. Follow-ups to log (not built here)

- Sales delivery / Sales invoice batch drawer (story 16)
- Purchase invoice receiving (story 15)
- WO finished goods drawer (story 19)
- Persisting transfer batch lines
- Stock adjustment issuing via batch (story 17, decrease)
- **Received qty doesn't raise product-batch on-hand** (user decision, 27 Oct 2026). A batch received in WMS or by stock in shows with its attributes but qty 0 on Stock by batches and the batch detail page, because those pages read the product seed rather than the warehouse lots. This is a known prototype gap.
- WMS put-away task list attributes and packing label print (P1)
- PRD Helper sheet: confirm the header and info rows
