# Form Table — Editable Table Cells

Single source of truth for **editable tables inside forms and drawers**: line
items, SKU scopes, stock counts, transfer quantities, storage-location splits,
batch/serial selection, and other table rows that contain inputs or select-like
controls.

Use this doc for the **form-table cell pattern**. Use
[ErpTablePage.md](ErpTablePage.md) for index/read-only table specs.

Live references:
[CreateReceiptPage.vue](../../app/components/pages/CreateReceiptPage.vue),
[WarehouseTransferFormPage.vue](../../app/components/pages/WarehouseTransferFormPage.vue),
[StockInOutFormPage.vue](../../app/components/pages/StockInOutFormPage.vue),
[ManageBatchDrawer.vue](../../app/components/patterns/ManageBatchDrawer.vue).

---

## When to use

Use a form table when the user edits repeated structured rows:

| Case | Example |
|---|---|
| Product row with editable fields | product selector, description, qty |
| Quantity allocation | qty per storage location / bin |
| Batch or serial management | counted qty, selected batch, destination bin |
| Operational execution rows | picked qty, packed qty, stock in/out qty |

Do **not** use `ErpTablePage` for editable form cells. Its row, slot, skeleton,
pagination, and hover-action behavior are built for index/read tables.

---

## Table Shell

| Part | Rule |
|---|---|
| Table | Native `<table>`, `border-collapse: collapse`; `table-layout: fixed` when column widths must not shift, `auto` only when content-driven widths are intentional |
| Header | Follow the table header spec from [ErpTablePage.md](ErpTablePage.md#header), unless the form-table variant explicitly needs a white header |
| Read-only cells | 10px top/bottom padding, gray/subtle background when the cell is calculated or locked |
| Editable cells | White background, `padding: 0`; the child control owns its inner horizontal padding |
| Cell borders | `1px solid var(--mp-border-default)` between rows and columns; use right borders for column separators, with no left border on the first column and no right border on the last column |
| Row baseline | Controls inside editable cells use a 40px baseline (`var(--mp-sizes-10)`) |
| Numeric cells | Right aligned, tabular numbers |

---

## Column Borders

Form tables use internal column dividers only:

- every column cell/header gets a right border;
- the first column does **not** get a left border;
- the last column removes its right border;
- use an outer wrapper border only for bordered progressive panels or modal/drawer
  sub-tables that intentionally need a framed container.

```css
.form-th,
.form-td {
  border-right: 1px solid var(--mp-border-default);
}

.form-th:last-child,
.form-td:last-child {
  border-right: none;
}
```

Do not add `border-left` to the first column. With collapsed borders, right-side
dividers keep the grid clean without double-width separators.

---

## Cell Types

| Cell type | Background | Padding | Alignment | Notes |
|---|---|---|---|---|
| Read-only text | `neutral-subtle` when calculated/locked | `10px 16px 10px 8px` | middle or top by row content | SKU, unit, available qty, totals |
| Read-only numeric | `neutral-subtle` when calculated/locked | `10px 8px 10px 16px` | right | `font-variant-numeric: tabular-nums` |
| Editable input | white | `0` on `<td>` | middle/top by row content | input fills full cell |
| Editable select/search | white | `0` on `<td>` | middle/top by row content | custom trigger + `MpPopover` |
| Action/delete | usually subtle/white by context | `0` or compact | center | button fills or centers in 40px baseline |

---

## Editable Input Cell

The table cell owns the border and focus state. The input inside is visually
borderless.

```css
.form-td--input {
  padding: 0;
  background: var(--mp-background-neutral);
  position: relative;
}

.form-td--input:focus-within::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid var(--mp-border-bold);
  z-index: 2;
  pointer-events: none;
}

.form-cell-input {
  width: 100%;
  height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-2);
  border: none;
  background: transparent;
  color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-md);
  outline: none;
}
```

Rules:

- Use `height: var(--mp-sizes-10, 40px)` for single-line inputs.
- Use `padding: 0 var(--mp-spacing-2)` by default; `var(--mp-spacing-3)` is allowed
  when the table uses a roomier form-table layout.
- Numeric inputs are right-aligned and use tabular numbers.
- Strip inner Pixel control borders/radius/shadows when using `MpInput` inside a
  cell, so the cell focus ring is the only visible border.

```css
.form-td--input :deep([class*='input']) {
  border-color: transparent;
  border-radius: 0;
  box-shadow: none !important;
}
```

---

## Select / Search Cell

Inside form tables, select-like cells use a **custom single-root trigger** plus
`MpPopover`. This avoids nested input borders and avoids `MpPopoverTrigger`
multi-root issues.

```vue
<td class="form-td form-td--select">
  <MpPopover id="location-picker" placement="bottom-start" use-portal is-close-on-select>
    <MpPopoverTrigger>
      <div class="form-select-trigger">
        <input
          class="form-select-input"
          type="text"
          autocomplete="off"
          :value="isActive ? search : selectedLabel"
          placeholder="Select storage location"
          @focus="openPicker"
          @input="search = ($event.target as HTMLInputElement).value"
        />
        <MpIcon name="chevrons-down" size="sm" class="form-select-chevron" />
      </div>
    </MpPopoverTrigger>

    <MpPopoverContent :class="css({ width: '320px', maxHeight: '260px', overflowY: 'auto', padding: '0' })">
      <MpPopoverList>
        <MpPopoverListItem
          v-for="option in filteredOptions"
          :key="option.id"
          :is-active="option.id === selectedId"
          @click="selectOption(option.id)"
        >
          {{ option.label }}
        </MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</td>
```

```css
.form-td--select {
  padding: 0;
  background: var(--mp-background-neutral);
  position: relative;
}

.form-td--select:focus-within::after {
  content: '';
  position: absolute;
  inset: 0;
  border: 1px solid var(--mp-border-bold);
  z-index: 2;
  pointer-events: none;
}

.form-select-trigger {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  width: 100%;
  min-height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-3);
  background: transparent;
  border: none;
  cursor: text;
}

.form-select-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  padding: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Rules:

- `MpPopoverTrigger` must have exactly one child. Do not put comments or siblings
  inside it.
- Use `use-portal` for the popover so the dropdown is not clipped by the table
  scroll container.
- Keep the trigger at least 40px tall.
- Dropdown width should match the decision surface: 320px for location/batch lists,
  360px for product search lists with thumbnails/descriptions.
- Use `MpPopoverListItem` with `:is-active` for the selected option.

---

## Product Selector Cell

Product selectors may use either `MpAutocomplete` or a custom `MpPopover` trigger.
The cell rules remain the same:

- editable cell background = white;
- cell padding = 0;
- product trigger min-height = 40px;
- thumbnail = 40px square when shown inside the trigger;
- product name is 14px default text;
- SKU/description is secondary text and can make the row taller;
- if the row grows taller, align the whole row to top.

---

## Error State

Apply validation state to the table cell, not only to the child input/select.
This keeps the full column grid visible and avoids a small floating red input
inside an otherwise normal cell.

Use cell-level error for validation that belongs to a specific cell, such as:

- product is required;
- quantity is empty, below minimum, or exceeds the allowed stock;
- counted/picked/packed quantity violates the row rule.

Use a form/table-level error message for aggregate validation, such as missing
batch/serial details across multiple rows, or origin/destination form rules.

```css
.form-td--error {
  background: var(--mp-background-danger-subtle, #FCEEED);
  border-bottom-color: var(--mp-border-danger, #E2483D);
}

.form-td--error:focus-within {
  box-shadow: inset 0 0 0 1px var(--mp-border-danger, #E2483D);
}

.form-td--error input,
.form-td--error :deep([class*='input']),
.form-td--error :deep([class*='autocomplete']) {
  background: transparent;
}
```

For compact cells, explain the error with `MpTooltip` on the cell control. The
tooltip wrapper must fill the cell width so the trigger preserves the input
height and focus area.

```css
.form-error-tooltip {
  display: block;
  width: 100%;
}
```

Use an inline caption only when there is enough vertical room and it does not
break the row rhythm.

---

## Progressive Form Tables

Large form tables follow the same progressive-loading container rule as embedded
detail tables:

- show 10 rows by default;
- auto-load the next 10 on scroll;
- add the bordered internal-scroll panel only when there are more than 10 rows;
- keep short tables borderless and naturally sized.

See [ErpPagination.md → Progressive pagination](ErpPagination.md#progressive-pagination-infinite-scroll).

---

## Build Checklist

- [ ] Native `<table>` with fixed/intentional column widths.
- [ ] Read-only/calculated cells are visually distinct from editable cells.
- [ ] Editable `<td>` has `padding: 0` and owns the focus ring.
- [ ] Input/select trigger fills the cell width and uses a 40px baseline.
- [ ] Numeric inputs are right-aligned with tabular numbers.
- [ ] Select/search cells use one `MpPopoverTrigger` child and `use-portal`.
- [ ] Error state is applied to the cell, not only the child input.
- [ ] Large tables use the progressive-loading container only when row count exceeds 10.
