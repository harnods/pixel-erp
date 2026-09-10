---
name: erp-table-page
description: MANDATORY when building or editing ANY table / index / list page in the erp-app repo (anything rendering tabular rows, an ErpTablePage, or a TableColumn[] definition). Enforces the column-width standard and table patterns. Trigger whenever you add or change table columns, create a new index/list page, or touch a *Page.vue with a table.
---

# ERP table page — non-negotiable rules

You are building or editing a table in `erp-app`. Follow these rules **no matter what**. Do NOT invent column widths, do NOT hand-pick pixel widths on semantic columns, do NOT create a new table layout.

## 1. Column widths come from the STANDARD — never hardcoded

Every semantic column MUST set a `kind` on its `TableColumn`, NOT a pixel `width`.
The `kind` maps to a `[min,max]` range; `ErpTablePage` grows each column toward its
max, a flexible spacer absorbs the remainder, and the sticky `[...]` actions column
stays flush right.

Source of truth (read before choosing kinds):
- Ranges + spec: `docs/patterns/ErpTablePage.md` › "Column width standard"
- Values in code: `app/components/patterns/columnWidths.ts`

| `kind` | min–max | Use for |
| --- | --- | --- |
| `date` | 160–160 (fixed) | any date (created, due, transaction, last updated) |
| `number` | 160–240 | document/transaction number, identifier code |
| `name` | 240–280 | vendor / customer / beneficiary / warehouse / product / person — any entity name |
| `status` | 128–160 | status column rendered with a badge (`ErpStatusBadge`/`MpBadge`) |
| `amount` | 160–240 | any monetary amount (balance, total, price) — `align: 'right'` |
| `tags` | 160–240 | tag chips (`ErpTagList`) |
| `unit` | 128–128 (fixed) | unit of measurement |
| `address` | 200–240 | address or any content that wraps to multiple lines |
| *(omit `kind`)* | 160–240 | `default` — anything not covered above (e.g. quantities/counts) |

Decision procedure per column:
1. Does it match a `kind` above? → set that `kind`, remove any `width`.
2. Non-semantic layout column (icon/attachment/checkbox/expander)? → keep an explicit `width` (e.g. `'40px'`, `noHeader: true`).
3. Otherwise → omit `kind` and `width` entirely (falls back to `default`).

NEVER put a pixel `width` on a date/number/name/status/amount/tags/unit/address column. If you think a semantic column needs a different width, change the range in `columnWidths.ts` (+ the doc) so EVERY table benefits — do not special-case one table.

## 2. Trailing action button-groups

If a row has an action button-group (e.g. Approve + icon buttons) SEPARATE from the
`[...]` kebab, put the group in its own column flagged `isTrailingAction: true` (keep
its explicit `width`). The spacer is then placed before it so the group + `[...]` hug
the right edge together. The `[...]` kebab always lives in the `#actions` slot (sticky).

## 2b. Import dropzones — always use `ErpDropzone`

Any file import/upload dropzone MUST use `app/components/patterns/ErpDropzone.vue`
(never hand-roll a dropzone or a different upload icon). It is the one standard:
- **Idle:** `ErpDropzoneIcon` — a 48px upload glyph in an 80px `#F8F9F9` oval —
  above centred copy: "Drop your file here or **choose**", then
  "Supported formats: …." and "Maximum file size …." (regular).
- **Processing** (`:processing="true"`): the icon becomes a rotating 48px spinner
  in the same oval, with "Processing" below.
- **Done:** selected files list below the dropzone as removable rows (pass `:files`).

Only the standalone upload glyph (e.g. inside a bespoke native drag area) may use
`ErpDropzoneIcon` directly. Product-photo pickers are a separate context.

## 3. Use the shared component + patterns — never hand-roll

- Render tables with `ErpTablePage` (`app/components/patterns/ErpTablePage.vue`).
- Use `useTableState` for search/sort/pagination, `#filters` slot for the filter bar,
  `ErpStatusBadge` for status, `ErpTagList` for tags, `LastUpdatedCell` for last-updated.
- Follow the sibling pattern docs in `docs/patterns/` (index-page-format, table, filter
  bar, pagination, empty-state, date-format). Do NOT introduce new table CSS/behaviour.

## 4. Before finishing

- Re-read your `TableColumn[]` arrays: every semantic column uses `kind`, only
  layout columns keep `width`.
- Rebuild the 4322 preview (`npm run build` then restart) and sanity-check the table
  fills nicely with `[...]` flush right.

If anything here conflicts with a design you were handed, STOP and flag it — the
standard wins unless the user explicitly overrides it for that specific case.
