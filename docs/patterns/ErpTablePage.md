# ErpTablePage — Design Spec

Component path: `app/components/patterns/ErpTablePage.vue`

> **Why custom?** `MpTable` Enterprise does not match the ERP Figma design. This is a custom `<table>` implementation using Pixel design tokens. Request to Pixel team: update MpTable Enterprise to match this spec.

***

## Header

| Property | Value | Token |
| -------- | ----- | ----- |
| Background | neutral subtle gray | `var(--mp-background-neutral-subtle)` |
| Height | 28px | `var(--mp-sizes-7)` |
| Font size | 12px | `var(--mp-font-sizes-sm)` |
| Font weight | 600 (semibold) | `var(--mp-font-weights-semi-bold)` |
| Text transform | uppercase | — |
| Padding (left-aligned) | `4px 16px 4px 8px` | `var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2)` |
| Padding (right-aligned) | `4px 8px 4px 16px` | `var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4)` |
| Border bottom | 1px solid | `var(--mp-border-default)` |
| Position | sticky top: 0 | — |

## Row

| Property | Value | Token |
| -------- | ----- | ----- |
| Min-height / baseline | 40px | `var(--mp-sizes-10)` |
| Font size | 14px | `var(--mp-font-sizes-md)` |
| Font weight | 400 (regular) | `var(--mp-font-weights-regular)` |
| Text color | default | `var(--mp-text-default)` |
| Padding (left-aligned) | `10px 16px 10px 8px` | `var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2)` |
| Padding (right-aligned) | `10px 8px 10px 16px` | `var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4)` |
| Border bottom | 1px solid | `var(--mp-border-default)` |
| Hover background | neutral hovered | `var(--mp-background-neutral-hovered)` |

> **⚠️ Important — these must not change:**
>
> * The row **minimum / baseline height is 40px** (`var(--mp-sizes-10)`). A
>   single-line row renders at this 40px baseline; taller content can grow the row.
> * Default body-cell vertical padding is **10px top/bottom**
>   (`var(--mp-spacing-2\.5)`).
> * Icon action cells are the exception: they use **reduced top/bottom padding** so a
>   **38px** icon button (the ERP-standard icon-button size — see the Actions column
>   below) fits inside the 40px baseline row.
> * Vertical alignment: **single-line → middle, taller row → top** (see below).

## Cell content rules

* **Default vertical padding is 10px** (`var(--mp-spacing-2.5)`) — both text-only
    and multi-line rows. Action/icon cells may use reduced top/bottom padding to fit a
    **38px** icon button (the ERP-standard icon-button size) in the 40px baseline.
* **Vertical alignment is conditional.** Single-line rows: `vertical-align: middle`,
    40px baseline. When a row grows beyond 40px because it contains a **description**,
    **caption**, **tags**, an **avatar/photo**, or other taller content, the whole row
    switches to **`vertical-align: top`** so single-line cells line up with the first
    line/top edge of the tall cell. `ErpTablePage` measures row heights against a 44px
    absolute threshold and toggles `.erp-tr--align-top` automatically.
* **Tags: max 2 lines + "More".** Render the tags column with **`ErpTagList`**
    ([ErpTagList.vue](../../app/components/patterns/ErpTagList.vue)) — it clamps chips to
    two lines and shows a **`More`** text-link (bottom-right) when tags overflow. Use it
    for the tags column in every table.

```vue
<template #cell-tags="{ value }">
  <ErpTagList :tags="(value as string[])" />
</template>
```

## Split-row / merged-cell tables

When any row or column is visually split into sub-rows, the table needs vertical
column separators so users can still track which sub-row belongs to which column.
This applies to both techniques used in the codebase:

- true merged cells with `rowspan` / `colspan`;
- one cell that contains stacked sub-rows inside it, such as qty + action link,
  per-location stock breakdown, or batch/location splits.

Rule:

- add a right border to every header and body cell in that table;
- do **not** add a left border to the first column;
- remove the right border from the last column;
- keep the existing row bottom borders;
- top-align cells that span multiple sub-rows or sit beside a split cell.

```css
.erp-table--split .erp-th,
.erp-table--split .erp-td {
  border-right: 1px solid var(--mp-border-default);
}

.erp-table--split .erp-th:last-child,
.erp-table--split .erp-td:last-child {
  border-right: none;
}
```

Reference implementations:

- `CreatePickingPage.vue` uses `pk-items--split` when the qty-to-pick cell can
  split into tracked-item actions.
- `StockCountingPage.vue` uses `sc-loc-scroll--split` when serial rows split the
  counted-qty cell into input + serial-number action.
- `PutAwayItemsPage.vue` and `ManageBatchDrawer.vue` use `rowspan` for merged
  product/batch metadata across storage-location split rows.
- `WarehouseDetailsPage.vue` / `StockTables.vue` add column borders when product
  stock is split by location or expanded batch rows.

***

## ⚠️ Known gap — no sort indicator

`sortable` columns are clickable and emit `sort(key)`, and `useTableState`
performs the sort. **But no sort-arrow indicator is rendered**: the
`.sort-arrows` / `.sort-active` CSS exists in `ErpTablePage.vue` but the `<th>`
template renders only the label. So the active sort column and direction have
**no visual cue** today. Don't assume an arrow appears when wiring sorting — fixing
this is a component change, out of scope for the docs.

***

## Sticky Right Column (Actions) & horizontal overflow

```css
position: sticky;
right: 0;
box-shadow: inset 1px 0 0 0 var(--mp-border-bold); /* separator — overflow only */
background: inherit;
```

Handled automatically by `ErpTablePage` when the `#actions` slot is used. Behaviour:

* The actions column is `position: sticky; right: 0` by default, but the **separator
    border (`box-shadow`) only shows when the table is wider than the table wrapper /
    stage** — i.e. when horizontal scroll is possible.
* Overflow is detected by comparing the wrapper's `scrollWidth` and `clientWidth`.
    `ResizeObserver` watches both the wrapper and the table, and window resize also
    rechecks. Overflow toggles `.is-overflowing` on `.erp-table-wrapper`.
    No overflow → no sticky separator.
* When overflowing, a **persistent horizontal scrollbar** is shown at the bottom of
    the table (styled `::-webkit-scrollbar` + `scrollbar-width: thin`), so users
    without a trackpad can always drag to scroll left/right (instead of an auto-hiding
    overlay bar).
* The table uses `table-layout: auto` with per-column min/max widths (see the width
    standard above). When the columns' min-widths exceed the container the table
    grows past 100% and the wrapper scrolls, giving the horizontal overflow needed
    for sticky behaviour; otherwise columns grow to their max and the flexible
    spacer column soaks up the rest.
* If `hasAiChat` is enabled, the AI column is the outermost sticky-right column
    (`right: 0`, width 28px). The actions/fixed column shifts left by 28px.
* If the action slot contains more than one kebab/icon button, set `actionsWidth`
    so the sticky column is wide enough for the full action group.
* Page-level exceptions can add scroll-position behaviour. Example:
    `WarehouseDetailsPage.vue` intentionally un-sticks the actions column at the
    far-right scroll end via `wh-scroll-end`; this is not the default table behaviour.

***

## Column width standard — SOURCE OF TRUTH

> **This is the single source of truth for ERP table column widths.** Every table
> in the repo must use it so a "date" column is the same width everywhere, a "name"
> column the same, and so on. The same values live in code at
> [`columnWidths.ts`](../../app/components/patterns/columnWidths.ts) — keep the two
> in sync.
>
> **How to apply:** set the column's `kind` (NOT a hand-picked pixel `width`):
> ```ts
> const columns: TableColumn[] = [
>   { key: 'date',   label: 'Date',   kind: 'date',   sortType: 'date' },
>   { key: 'number', label: 'Number', kind: 'number', sortType: 'text' },
>   { key: 'vendor', label: 'Vendor', kind: 'name',   sortType: 'text' },
>   { key: 'amount', label: 'Total',  kind: 'amount', align: 'right', sortType: 'number' },
> ]
> ```

Each `kind` defines a **[min, max]** width range. The column grows to use available
width up to its **max** and never shrinks below its **min**; the table's flexible
spacer column absorbs any width beyond the maxes so the caps hold and the sticky
actions `[...]` column stays flush right. Fixed types set min = max.

| `kind` | Min width | Max width | Use for |
| ------ | --------- | --------- | ------- |
| `date` | **160px** | **160px** (fixed) | Any date column (created, transaction, etc.) — `DD/MM/YYYY` |
| `number` | **160px** | **240px** | Document / transaction number (often a link) |
| `name` | **240px** | **280px** | Vendor / customer / beneficiary / warehouse / product — any entity name |
| `status` | **128px** | **160px** | Status column rendered with a badge (`ErpStatusBadge`) |
| `amount` | **160px** | **240px** | Any monetary amount (balance due, total, price) — right-aligned, IDR |
| `tags` | **160px** | **240px** | Tag chips (`ErpTagList`) |
| `unit` | **128px** | **128px** (fixed) | Unit of measurement (pcs, kg, …) |
| `address` | **200px** | **240px** | Address, or any content that can wrap to multiple lines |
| `default` (unset) | **160px** | **240px** | Anything not covered above |

**Non-semantic columns** keep an explicit `width` instead of a `kind`:

| Column | Width | Align | Notes |
| ------ | ----- | ----- | ----- |
| Checkbox | — | — | Rendered **inside the first column's cell** via `has-checkbox`. Not a separate column. |
| Attachment / icon | 40px | center | `noHeader: true`, `width: '40px'` |
| Due date | use `kind: 'date'` | left | (a date → follows the `date` standard) |
| Actions `[...]` | 44px (default) | center, top | Sticky right kebab: a 38px icon button + 3px each side, always top-aligned. Override `actionsWidth` only if the slot holds multiple buttons |

> Setting an explicit `width` on a **semantic** column is an escape hatch — avoid
> it. If a column genuinely needs a different width, prefer adding/adjusting a
> `kind` here so every table benefits and stays consistent.

***

## Props

| Prop | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `columns` | `TableColumn[]` | required | Column definitions |
| `rows` | `Record<string, unknown>[]` | required | Current page data (already paginated) |
| `total` | `number` | required | Total record count |
| `currentPage` | `number` | required | Active page (1-based) |
| `perPage` | `number` | `25` | Rows per page |
| `sortKey` | `string` | `''` | Active sort column key |
| `sortDir` | \`'asc' | 'desc'\` | `'asc'` |
| `hasCheckbox` | `boolean` | `false` | Show row-selection checkboxes — merged into the first column's cell (select-all in header), not a separate column |
| `hasAiChat` | `boolean` | `false` | Show Airene AI chat icon on row hover (sticky outermost-right column) |
| `loading` | `boolean` | `false` | Show 3 solid, static (no-gradient, no-animation) `MpSkeleton` placeholder rows — see First-load skeleton |
| `hasActiveFilter` | `boolean` | `false` | When the table is empty AND a search/filter is active → show the inline "No results found" empty state (vs the full illustrated one) |
| `contextLabel` | `(row) => string` | `undefined` | Returns a context chip label for the AI chat input, per row |
| `actionsWidth` | `string` | `undefined` | Optional sticky actions column width override; use when `#actions` renders multiple buttons instead of one 44px kebab |

## TableColumn Interface

```ts
interface TableColumn {
  key: string
  label: string
  kind?: ColumnKind   // SOURCE OF TRUTH for width — see the column-width standard above
  width?: string      // explicit fixed width; escape hatch / layout-only columns only
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
  sortType?: 'text' | 'number' | 'date'
  isFixed?: boolean          // sticky right (for a data column; actions are always sticky)
  isTrailingAction?: boolean // action button-group column that must hug the right edge
                             // next to [...] — the flexible spacer is placed before it
  noHeader?: boolean         // render empty <th> — use for icon-only columns (e.g. attachment)
  noSkeleton?: boolean       // skip the loading skeleton bar — layout-only / action columns
}
```

**Width resolution order** (`colStyle`): explicit `width` → pinned exactly (min =
max = width); otherwise the `kind`'s range (or `default` when `kind` is unset). The
table uses `table-layout: auto` so these min/max ranges are honoured, plus a
flexible spacer column that soaks up leftover width — keeping the caps intact and
the sticky actions `[...]` column flush right. The spacer sits before the first
`isTrailingAction` column when present, else right before the actions slot.

## Slots

| Slot | Scope | Description |
| ---- | ----- | ----------- |
| `#stats` | — | Optional stats/summary bar above the filter bar |
| `#filters` | — | Filter bar content (search, selects, buttons) |
| `#cell-{key}` | `{ row, value }` | Custom cell renderer |
| `#actions` | `{ row }` | Per-row action cell — enables sticky right column |
| `#empty` | — | **Full** empty-state content (no data ever) — illustration + title + helper + CTA. See Empty state below. |

> **Boolean cell values**: the default cell fallback never renders raw booleans —
> use a `#cell-{key}` slot to render boolean columns explicitly.
> 
> **AI chat (`hasAiChat`)**: adds a 28px sticky-right column with an Airene icon
> shown on row hover; clicking opens a popover whose message is sent via the
> injected `sendAireneMessage(text, context)`. `contextLabel(row)` supplies the
> context chip. Sticky `#actions`/`isFixed` columns shift left by 28px when this
> is on.

## Emits

| Event | Payload | Description |
| ----- | ------- | ----------- |
| `pageChange` | `number` | New page number |
| `perPageChange` | `number` | New rows-per-page value |
| `sort` | `string` | Column key to sort by |
| `sortChange` | `(key: string, dir: 'asc' \| 'desc')` | Column header sort-direction option clicked |
| `selectionChange` | `number` | Bulk-select checkbox count changed |
| `hideColumn` | `string` (column `key`) | Column header's own "Hide column" option clicked — see **Column visibility** below |
| `clearFilters` | — | Inline empty-state "Clear all filters" link clicked — the page resets its search/filters |

***

## Column visibility (show/hide columns)

Any column can be user-hideable via the shared **`ColumnSettingsMenu`** (the
filter bar's gear icon, `rule/filter-bar-icon-group`) — used to let a page ship a
column that's hidden by default (e.g. a secondary "Last updated" column) without
permanently removing it from the table.

There are **two entry points**, both driving the same state:

1. **The gear icon** (`ColumnSettingsMenu` in the filter bar's icon group) — a
   checklist of every column; toggling a box shows/hides it. The **first
   (identifying) column is `disabled`** — it can never be hidden.
2. **The column header's own menu** — clicking a header's sort-options caret
   includes a **"Hide column"** item, emitted as `@hide-column` on
   `ErpTablePage`. This is a quick way to hide a column you're looking at
   without opening the gear popover; there's no per-header "show" — a hidden
   column only comes back via the gear checklist.

### Wiring (mirrors `DimensionsIndexPage.vue`'s "Last updated" column)

```ts
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'

const columns: TableColumn[] = [
  { key: 'name',        label: 'Name',         kind: 'name', sortable: true },
  // ...
  { key: 'lastUpdated', label: 'Last updated', kind: 'date' },
]

// Hidden by default — only 'lastUpdated' starts unchecked.
const columnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(columns.map((c) => [c.key, c.key !== 'lastUpdated'])),
)
// items for the gear popover — disable the first (identifying) column.
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
// what actually renders — filter down to the visible set.
const visibleColumns = computed<TableColumn[]>(() => columns.filter((c) => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }
```

```vue
<ErpTablePage
  :columns="visibleColumns"
  ...
  @hide-column="hideColumn"
>
  <template #filters>
    ...
    <div class="filter-btn-group">
      <ColumnSettingsMenu id="my-page-columns" :items="columnItems" :visibility="columnVisibility" />
      <!-- Export, etc. — same rounded-ghost icon group -->
    </div>
  </template>
</ErpTablePage>
```

**Rules:**
- Pass `:columns="visibleColumns"` (the filtered computed), never the raw `columns` array, or a hidden column still renders.
- `columnVisibility` is a plain reactive map mutated in place by `ColumnSettingsMenu` — don't recreate it on every render.
- Wire `@hide-column="hideColumn"` on `ErpTablePage` even if you don't expect users to use the header's hide option — it's part of the standard header menu and silently no-ops without a listener.
- Default a column to hidden by seeding `columnVisibility` with `false` for that key (as above) — don't hide it with a `v-if` on the column def, which would also drop it from the gear checklist.

***

## Skeleton (loading state)

Shows **3 placeholder rows** in two cases:

1. **First load** — pass **`:loading="true"`**; the table shows **only** 3 skeleton
    rows (no data, no actions column, no pagination). Flip to `false` when ready.
2. **Pagination change** — `ErpTablePage` does this **automatically** (\~500ms) on any
    page / rows-per-page change. The **existing rows stay visible** and the **3 skeletonrows are appended below them** (the incoming page) — it does **not** reset to a
    blank skeleton. Pagination + actions stay visible. No page code needed → **everymodule gets this**.

Details:

* Renders **3** `MpSkeleton` rows (one bar per column).
* **Solid, no animation** — shimmer gradient + motion removed (`duration="0s"` +
    `background-image: none` + `animation: none`, filled `var(--mp-border-default)`).
* Data rows and the empty state are suppressed while the skeleton shows.
* The sticky **actions** / **AI** columns are hidden during the skeleton (no sticky
    border). On **first load** pagination is hidden too; during a **pagination change**
    the pagination bar stays visible.

```vue
<script setup lang="ts">
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) }) // swap for real fetch
</script>

<template>
  <ErpTablePage :columns="columns" :rows="paginated" :loading="loading" ... />
</template>
```

***

## Clickable cells — text links (`.cell-link`)

A cell that navigates or opens a record is a **text link**, not a hover chip/button.
The identifier column (transaction / document **number**) links to the record's
detail page; a **Customer / Vendor** cell links to that record too (its detail page
is where the preview / attachment lives).

> **Rule (applies to every ERP table).** Clickable cells use the shared `.cell-link`
> utility (defined once in `app/assets/css/erp.css`) — a plain text link in
> `--mp-text-link` that underlines on hover. **Do not** use a right-anchored
> reveal-on-hover chip/button. The old `.cell-with-action` + `.row-hover-btn`
> pattern is **deprecated** — do not add it to new tables, and migrate any that
> still use it.

**Which cells get a link:**

* The document / transaction **number** column → links to the detail page.
* **Customer and Vendor** columns → link to that record's detail page.
* Any other column is **conditional** — when in doubt, ask; don't assume.

Text links are a **page-level cell-slot pattern** (the handler differs per column).
`.cell-text` is the per-page truncation helper (ellipsis on overflow); combine it
with `.cell-link`. Always `@click.stop` so the cell click doesn't also trigger the
row's own click/expand handler.

```vue
<!-- identifier column → detail page -->
<template #cell-number="{ value, row }">
  <a class="cell-link cell-text" @click.stop="goDetail((row as Row).id)">{{ formatNumber(value as number) }}</a>
</template>

<!-- vendor / customer → detail page (preview lives there) -->
<template #cell-beneficiaryName="{ value, row }">
  <a class="cell-link cell-text" @click.stop="goDetail((row as Row).id)">{{ value }}</a>
</template>
```

```css
/* .cell-link is global (erp.css) — do not redefine per page. Per-page truncation: */
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
```

Reference: [BillsIndexPage.vue](../../app/components/pages/BillsIndexPage.vue).

***

## Accordion / expandable rows

When a table row expands to reveal a detail sub-panel (e.g. Warehouse detail →
**Batches** and **Serial numbers** tabs), the **whole summary row is the toggle**:

* **Clicking anywhere on the row** (any column/cell) expands/collapses the accordion —
    not just the chevron. Put the handler on the `<tr>` (`@click="toggle(id)"`) and give
    the row `cursor: pointer`.
* The **chevron stays as a visual affordance only** — remove its own `@click` so it
    bubbles to the row (avoids a double-toggle). Keep its `aria-label` (Expand/Collapse).
* Any **in-row action** (e.g. `View details` hover button) must use **`@click.stop`** so
    it doesn't also toggle the accordion.

> This applies to **every** table that has a row-level accordion. It does **not** apply
> to inline *show-more* cells (e.g. a "+N more" chips toggle inside one cell) — those
> keep their own button and the row keeps its primary action (e.g. navigate to detail).

***

## Empty state — two variants

Follows Mekari's [empty state inside an index view](https://docs.mekari.design/skills/mekari-taste/references/index-view.html#empty-state-inside-an-index-view).

Every table renders one of these — **never a blank table** (`rule/table-empty-state`).
Both variants use the **same illustration** so the two states read consistently.

| Variant | When | What | How |
| ------- | ---- | ---- | --- |
| **Full** (default) | List has **never** had data (no filter/search active) | Illustration + title + helper text + **secondary CTA** (create first record, gated to the create permission) | Provide via the **`#empty`** slot (per module) |
| **Inline** (filtered) | Search/filter eliminated all results | **Same illustration** + "\"{search}\" not found" / "No {label} match your filters" + **"Clear all filters"** link | **Built in.** Pass **`:has-active-filter="true"`** when a filter/search is active; the link emits **`clearFilters`** |

**Full empty-state copy — fixed format (use everywhere):**

| Part | Format | Example |
| ---- | ------ | ------- |
| Title | `No {entities}` (plural, lowercase; **no "yet"**) | `No sales orders` |
| Description | `{Entities} will appear here.` | `Sales orders will appear here.` |
| CTA | **Secondary** button `+ New {entity}` (not primary) | `+ New sales order` |
| Illustration | the standard empty-state illustration above the title | — |

**Vertical spacing (stacked, centered):** table header → illustration `24px` (the empty
cell's own padding — `.erp-td--empty` = `var(--mp-spacing-6)` top & bottom) → illustration
→ title **`0` (no gap)** → **title → description `2px` (`var(--mp-spacing-0\.5)`)** →
**description → button `12px` (`var(--mp-spacing-3)`)**. Set via per-element margins, **not**
a uniform flex `gap`.

**Illustration** — a runtime public asset. Use a **dynamic** `:src` (e.g.
`:src="'/illustrations/empty-folder.png'"`) — a static `src="/…"` makes Vite try to
resolve it at build time and **fails the whole module** if the file is missing. Drop
the image in `app/public/illustrations/`.

```vue
<!-- page -->
<ErpTablePage
  :has-active-filter="!!search || !!statusFilter"
  @clear-filters="() => { search = ''; statusFilter = '' }"
  …
>
  <template #empty>
    <div class="empty-full">
      <img :src="'/illustrations/empty-folder.png'" alt="" class="empty-illustration" />
      <p class="empty-full-title">No sales orders</p>
      <p class="empty-full-desc">Sales orders will appear here.</p>
      <button class="empty-cta--secondary">+ New sales order</button>  <!-- secondary -->
    </div>
  </template>
</ErpTablePage>
```

***

## Row actions menu (kebab)

Every table's **actions column** is a kebab `⋮` that opens an **`MpPopover`**
dropdown (via the `#actions` slot — one popover per row).

* **`View details` is always the first item.** Other items differ per module —
    **ask the user which actions to include when generating an index page.**
* **`Share via …` actions** (Share via WhatsApp / email / Copy link) sit at the
    bottom, **separated from the rest by a divider** (a 1px element between two
    `MpPopoverList` groups).
* Popover: **min-width 160px**, `width: max-content` (hugs the longest label);
    **labels never wrap** (`white-space: nowrap`).
* Use `use-portal` (escape the table's scroll container), `:is-keep-alive="false"`
    (render only the open menu, not all rows), a **unique `id` per row**, and
    `placement="bottom-end"` (open toward the left so it doesn't overflow the right edge).

Sales Orders items: View details · Create sales delivery · Create sales invoice ·
Mark as completed · Duplicate · *(divider)* · Share via WhatsApp · Share via email · Copy link.

```vue
<template #actions="{ row }">
  <MpPopover :id="`<entity>-actions-${row.id}`" is-close-on-select use-portal
             :is-keep-alive="false" placement="bottom-end">
    <MpPopoverTrigger>
      <button class="row-kebab" aria-label="More actions"><!-- ⋮ --></button>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
      <MpPopoverList>
        <MpPopoverListItem>View details</MpPopoverListItem>
        <!-- module-specific actions … -->
      </MpPopoverList>
      <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
      <MpPopoverList>
        <MpPopoverListItem>Share via WhatsApp</MpPopoverListItem>
        <MpPopoverListItem>Share via email</MpPopoverListItem>
        <MpPopoverListItem>Copy link</MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</template>
```

***

## Usage

```vue
<ErpTablePage
  :columns="columns"
  :rows="paginated"
  :total="total"
  :current-page="currentPage"
  :per-page="perPage"
  :sort-key="sortKey"
  :sort-dir="sortDir"
  has-checkbox
  @page-change="setPage"
  @per-page-change="setPerPage"
  @sort="toggleSort"
>
  <template #filters>
    <MpInputGroup id="search">...</MpInputGroup>
    <ErpFilterSelect id="filter" placeholder="Status" :model-value="statusFilter" :options="statusOptions" @update:model-value="v => (statusFilter = v)" /> <!-- never MpSelect (rule/select-erpfilterselect) -->
    <MpButton variant="primary" style="margin-left: auto">Create</MpButton>
  </template>

  <template #cell-status="{ value }">
    <ErpStatusBadge :status="value" />
  </template>

  <template #actions>
    <MpButton variant="tertiary" size="sm" left-icon="more-vertical" />
  </template>
</ErpTablePage>
```

***

## Formatters

### IDR Currency

```ts
new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 2,
}).format(amount)
// → "Rp9.000.000,00"
```

### Date

```ts
new Intl.DateTimeFormat('id-ID', {
  day: '2-digit', month: '2-digit', year: 'numeric',
}).format(new Date(isoString))
// → "19/03/2026"
```

***

## Related

* [ErpFilterBar.md](ErpFilterBar.md) — `#filters` slot layout + real index-page pattern
* [ErpPagination.md](ErpPagination.md) — built-in pagination bar
* [ErpStatusBadge.md](ErpStatusBadge.md) — status cell rendering
* [page-recipes.md](page-recipes.md) — full index-page recipe
* [docs/README.md](../README.md) — docs home
