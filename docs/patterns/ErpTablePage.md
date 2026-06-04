# ErpTablePage — Design Spec

Component path: `app/components/patterns/ErpTablePage.vue`

> **Why custom?** `MpTable` Enterprise does not match the ERP Figma design. This is a custom `<table>` implementation using Pixel design tokens. Request to Pixel team: update MpTable Enterprise to match this spec.

---

## Header

| Property | Value | Token |
|----------|-------|-------|
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
|----------|-------|-------|
| Min-height | 40px | `var(--mp-sizes-10)` |
| Font size | 14px | `var(--mp-font-sizes-md)` |
| Font weight | 400 (regular) | `var(--mp-font-weights-regular)` |
| Text color | default | `var(--mp-text-default)` |
| Padding (left-aligned) | `6px 16px 6px 8px` | `var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2)` |
| Padding (right-aligned) | `6px 8px 6px 16px` | `var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4)` |
| Border bottom | 1px solid | `var(--mp-border-default)` |
| Hover background | neutral hovered | `var(--mp-background-neutral-hovered)` |

> **⚠️ Important — these must not change:**
> - A **single-line row is exactly 40px** (`height: var(--mp-sizes-10)`).
> - **Vertical padding is 6px** (`var(--mp-spacing-1\.5)`) on **every** column —
>   including the icon-button columns (actions / checkbox). Not 10px.
> - Vertical alignment: **single-line → middle, multi-line → top** (see below).

## Cell content rules

- **Vertical alignment is conditional.** Single-line rows are **centred**
  (`vertical-align: middle`). When a cell in a row wraps to multiple lines (tags, a
  status sub-label, …), that **whole row switches to top-aligned** so the single-line
  cells line up with the first line of the tall cell. `ErpTablePage` measures row
  heights and toggles `.erp-tr--align-top` automatically.
- **Tags: max 2 lines + "More".** Render the tags column with **`ErpTagList`**
  ([ErpTagList.vue](../../app/components/patterns/ErpTagList.vue)) — it clamps chips to
  two lines and shows a **`More`** text-link (bottom-right) when tags overflow. Use it
  for the tags column in every table.

```vue
<template #cell-tags="{ value }">
  <ErpTagList :tags="(value as string[])" />
</template>
```

---

## ⚠️ Known gap — no sort indicator

`sortable` columns are clickable and emit `sort(key)`, and `useTableState`
performs the sort. **But no sort-arrow indicator is rendered**: the
`.sort-arrows` / `.sort-active` CSS exists in `ErpTablePage.vue` but the `<th>`
template renders only the label. So the active sort column and direction have
**no visual cue** today. Don't assume an arrow appears when wiring sorting — fixing
this is a component change, out of scope for the docs.

---

## Sticky Right Column (Actions) & horizontal overflow

```css
position: sticky;
right: 0;
box-shadow: inset 2px 0 var(--mp-border-default);  /* separator — overflow only */
background: inherit;
```

Handled automatically by `ErpTablePage` when the `#actions` slot is used. Behaviour:

- The actions column is `position: sticky; right: 0` always, but the **separator
  border (`box-shadow`) only shows when the table is wider than the stage** — i.e.
  when there's horizontal scroll. Detected via JS (`ResizeObserver` + window resize)
  which toggles `.is-overflowing` on the wrapper. No overflow → no border.
- When overflowing, a **persistent horizontal scrollbar** is shown at the bottom of
  the table (styled `::-webkit-scrollbar` + `scrollbar-width: thin`), so users
  without a trackpad can always drag to scroll left/right (instead of an auto-hiding
  overlay bar).

---

## Standard Columns

| Column | Width | Align | Notes |
|--------|-------|-------|-------|
| Checkbox | — | — | Rendered **inside the first column's cell** (select-all in the header, per-row in the body) via `has-checkbox`. Not a separate column. |
| Date | 120px | left | `DD/MM/YYYY` |
| Document number | 200px | left | link style |
| Attachment | 40px | center | `noHeader: true`, `MpIcon name="attachment"` |
| Customer / Vendor | 240px | left | |
| Due date | 108px | left | `DD/MM/YYYY` |
| Status | 160px | left | `ErpStatusBadge` + optional sub-label |
| Balance due | 160px | right | IDR format |
| Total | 160px | right | IDR format |
| Tags | 160px | left | `MpBadge for="additionalInformation"` |
| Actions | 44px | center | `MpButton variant="tertiary" left-icon="more-vertical"`, sticky right |

---

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `columns` | `TableColumn[]` | required | Column definitions |
| `rows` | `Record<string, unknown>[]` | required | Current page data (already paginated) |
| `total` | `number` | required | Total record count |
| `currentPage` | `number` | required | Active page (1-based) |
| `perPage` | `number` | `25` | Rows per page |
| `sortKey` | `string` | `''` | Active sort column key |
| `sortDir` | `'asc' \| 'desc'` | `'asc'` | Sort direction |
| `hasCheckbox` | `boolean` | `false` | Show row-selection checkboxes — merged into the first column's cell (select-all in header), not a separate column |
| `hasAiChat` | `boolean` | `false` | Show Airene AI chat icon on row hover (sticky outermost-right column) |
| `loading` | `boolean` | `false` | Show 3 solid, static (no-gradient, no-animation) `MpSkeleton` placeholder rows — see First-load skeleton |
| `hasActiveFilter` | `boolean` | `false` | When the table is empty AND a search/filter is active → show the inline "No results found" empty state (vs the full illustrated one) |
| `contextLabel` | `(row) => string` | `undefined` | Returns a context chip label for the AI chat input, per row |

## TableColumn Interface

```ts
interface TableColumn {
  key: string
  label: string
  width?: string
  align?: 'left' | 'center' | 'right'
  sortable?: boolean
  isFixed?: boolean   // sticky right (for a data column; actions are always sticky)
  noHeader?: boolean  // render empty <th> — use for icon-only columns (e.g. attachment)
}
```

## Slots

| Slot | Scope | Description |
|------|-------|-------------|
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
|-------|---------|-------------|
| `pageChange` | `number` | New page number |
| `perPageChange` | `number` | New rows-per-page value |
| `sort` | `string` | Column key to sort by |
| `clearFilters` | — | Inline empty-state "Clear all filters" link clicked — the page resets its search/filters |

---

## Skeleton (loading state)

Shows **3 placeholder rows** in two cases:

1. **First load** — pass **`:loading="true"`**; the table shows **only** 3 skeleton
   rows (no data, no actions column, no pagination). Flip to `false` when ready.
2. **Pagination change** — `ErpTablePage` does this **automatically** (~500ms) on any
   page / rows-per-page change. The **existing rows stay visible** and the **3 skeleton
   rows are appended below them** (the incoming page) — it does **not** reset to a
   blank skeleton. Pagination + actions stay visible. No page code needed → **every
   module gets this**.

Details:
- Renders **3** `MpSkeleton` rows (one bar per column).
- **Solid, no animation** — shimmer gradient + motion removed (`duration="0s"` +
  `background-image: none` + `animation: none`, filled `var(--mp-border-default)`).
- Data rows and the empty state are suppressed while the skeleton shows.
- The sticky **actions** / **AI** columns are hidden during the skeleton (no sticky
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

---

## Row hover actions — View details / Open preview

Some cells reveal an inline action button anchored to the right of the cell **on
row hover** (`.cell-with-action` + `.row-hover-btn`). Two standard actions:

| Action | Column | What it does |
|---|---|---|
| **View details** | the transaction / document **number** column | go to the record's detail page |
| **Open preview** | **Customer / Vendor** column — *always* | open a quick preview (drawer/popover) without leaving the list |

**Rules (apply to every ERP table):**
- A column whose record has a **detail page** shows **View details** on hover — in
  practice the document/transaction **number** column.
- **Customer and Vendor columns always** get **Open preview**.
- For **any other column** it's **conditional** — when building a table, **ask which
  columns should have View details vs Open preview** (or none). Don't assume.

This is a **page-level cell-slot pattern**, not built into `ErpTablePage` (the
icon/label/handler differ per column). Copy the markup + CSS from a reference page
([SalesOrdersPage.vue](../../app/components/pages/SalesOrdersPage.vue) /
[SalesInvoicesPage.vue](../../app/components/pages/SalesInvoicesPage.vue)).

```vue
<template #cell-number="{ value }">
  <div class="cell-with-action">
    <span class="cell-text">{{ value }}</span>
    <button class="row-hover-btn" @click.stop>
      <svg …/><span class="row-hover-btn__label">VIEW DETAILS</span>
    </button>
  </div>
</template>
```
```css
.cell-with-action { position: relative; display: flex; align-items: center; width: 100%; min-width: 0; }
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.row-hover-btn { position: absolute; right: 0; top: 50%; transform: translateY(-50%); display: none;
  align-items: center; gap: var(--mp-spacing-1\.5); padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-sm); }
.row-hover-btn__label { font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-secondary); }
:global(.erp-tr:hover .row-hover-btn) { display: flex; }   /* reveal on row hover */
```

---

## Empty state — two variants

Follows Mekari's [empty state inside an index view](https://docs.mekari.design/skills/mekari-taste/references/index-view.html#empty-state-inside-an-index-view).

| Variant | When | What | How |
|---|---|---|---|
| **Full** (illustrated) | List has **never** had data | Illustration + title + helper text + **CTA** (create first record) | Provide via the **`#empty`** slot (per module) |
| **Inline** (minimal) | Search/filter eliminated all results | **No illustration** — "No results found" + "Try adjusting your filters." + **"Clear all filters"** link | **Built in.** Pass **`:has-active-filter="true"`** when a filter/search is active; the link emits **`clearFilters`** |

**Full empty-state copy — fixed format (use everywhere):**

| Part | Format | Example |
|---|---|---|
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

---

## Row actions menu (kebab)

Every table's **actions column** is a kebab `⋮` that opens an **`MpPopover`**
dropdown (via the `#actions` slot — one popover per row).

- **`View details` is always the first item.** Other items differ per module —
  **ask the user which actions to include when generating an index page.**
- **`Share via …` actions** (Share via WhatsApp / email / Copy link) sit at the
  bottom, **separated from the rest by a divider** (a 1px element between two
  `MpPopoverList` groups).
- Popover: **min-width 160px**, `width: max-content` (hugs the longest label);
  **labels never wrap** (`white-space: nowrap`).
- Use `use-portal` (escape the table's scroll container), `:is-keep-alive="false"`
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

---

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
    <MpSelect id="filter">...</MpSelect>
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

---

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

---

## Related

- [ErpFilterBar.md](ErpFilterBar.md) — `#filters` slot layout + real index-page pattern
- [ErpPagination.md](ErpPagination.md) — built-in pagination bar
- [ErpStatusBadge.md](ErpStatusBadge.md) — status cell rendering
- [page-recipes.md](page-recipes.md) — full index-page recipe
- [docs/README.md](../README.md) — docs home
