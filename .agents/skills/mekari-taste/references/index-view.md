# Index view

> Validate Pixel components via `get-component` before writing code. MCP owns prop/slot/event names; this file owns which values to use and Mekari-specific conventions.

A page listing many records of the same type. Anchored example: Subscription quota table in Qontak, Transaction list in Expense, Employee list in Talenta.

## Anatomy

```
Page header: H1 + primary CTA (top-right) -> validate that this exists; if not, check `./mekari-screen.md`
Page content: Tab bar (if the entity has multiple views) -> validate that this exists; if not, check `./mekari-screen.md`
┌──────────────────────────────────────────────┐
│ Summary card (optional)                      │
│   Key meta · Value          Key meta · Value │
└──────────────────────────────────────────────┘
┌──────────────────────────────────────────────┐
│ Filter Bar: [filters]               [search] |
├──────────────────────────────────────────────┤
│ Table                                        │
│ ┌────────────────────────────────────────┐   │
│ │ Col1   Col2   Col3   Col4   Col5       │   │
│ ├────────────────────────────────────────┤   │
│ │ row data ...                           │   │
│ │ row data ...                           │   │
│ └────────────────────────────────────────┘   │
│ Pagination                                   │
└──────────────────────────────────────────────┘
```

## Summary Card (optional)

Sits above the table when the list has aggregate context worth surfacing at a glance — total balance, package name, period date range, or per-type counts.

### Summary strip variant (per-type count row)

Used when the list has multiple source/type categories and the user benefits from seeing counts per type at a glance (e.g. AI Resources: "2 Links · 3 Files · 1 Content").

- Strip height: fixed `96px`. Flex row.
- Cells separated by `1px` vertical dividers, `56px` tall, vertically centered (`my: 5`).
- Each cell: type label (`Label small/Semibold`), then icon (`size="md" color="icon.default"`) + count (`H2/Semibold`) + unit (`Label/Regular text.secondary`).
- All icons use `color="icon.default"` — no status-colored icons in summary strips.

### Key-value summary card variant

Used when aggregate info is a single record (e.g. subscription details, period).

- Layout: horizontal flex, evenly distributed columns or fixed-width key-value pairs.
- Card padding `pxl-space-xl` 24.
- Each cell: top `Label small/Regular (color: `text.secondary`)`, bottom `Heading/H2` or `Label/Semibold`.
- Gap between cells: `pxl-space-3xl` 40 horizontal.

Use either summary variant only when the aggregate info changes the user's reading of the table below. Skip for plain lists where every record is independent.

## Data Table

**Table block check:**

> Before writing table code, call `get-block("general-data-table")`.
> It bundles `Table.vue` + `FilterBar.vue` + `Pagination.vue` in one block — covers the core of the index-view pattern.
> Apply the rules below to customize column spacing, sticky actions, selectable rows, and empty states.

### Filter Bar

A single row, full-width inside the card or above it.

- Left cluster: filters (`Filter` button or chip group), separator, search input.
- Right cluster: view options ("Columns", "Density", "Export") as outline buttons or icon buttons.
- `MpSelect` filters → always `size="md"`. Use `placeholder` prop for the "all" state (e.g. `placeholder="All channels"`); do **not** add an "All channels" `<option>` as the first item. Init the bound ref to `''`.
- `MpInputGroup` / `MpInput` search → always `size="md"`.
- `MpButton` in toolbar (sort, view switcher, "All filters") → always `size="md"`.
- "All filters" button → `variant="textLink"` not `ghost`.
- View switcher button (icon + chevron, no label) → `variant="secondary" size="md"`, use slot content with `<MpIcon>` directly (not `left-icon`/`right-icon` props) so icon `color="icon.default"` can be set explicitly.

See `./filter.md` and `./bulk-select.md` for what may appear in this toolbar.

### Table

- White background.
- Border: optional — if the table is inside a card already, no inner border. If the table sits directly on stage with no wrapping card, give it `border.default` 1px + `pxl-radii-md` 6.
- No shadow.

#### Header row

- Sortable column: chevron `▾` after label, `icon.default`. Active sort: chevron in `icon.brand`.
- Info-icon (ⓘ) for columns that need a tooltip — e.g. "Initial ⓘ", "Remaining additional ⓘ". Hover reveals definition. Use this whenever a column header is jargon.
- **Do NOT use `is-fixed` on `MpTableHead`** — it causes double border artifacts that require workarounds. Use plain `<MpTableHead>`.

#### Body row

- Height: dynamic, minimum 56px.
- Bottom border only: `border.default` 1px. No top border (the header has its bottom border). Last row has no bottom border.
- No zebra stripes. No outer table border.
- Click: navigate to detail view. Whole row is the click target, not just the first column.

#### Cell content rules

- **Text values**: `Label/Regular` 14, `text.default`.
- **Numeric values**: right-aligned. Always. Currency, counts, percentages, durations.
- **Multi-line cells**: primary value `Label/Regular`, secondary `Label small/Regular (color: `text.secondary`)` below it (e.g. "WhatsApp balance" + "Used by all WhatsApp business account").
- **Status cells**: use badge, left-aligned.
- **Date cells**: format `12 Jul 2026` (no comma, abbreviated month). For "last X days ago" relative time, only use if recency is the column's purpose; otherwise prefer absolute dates.
- **Currency cells**: `Rp1.000.000` format, right-aligned. If a column mixes currencies, append unit: `Rp1.000` / `USD9.80`.
- **Empty cell value**: em dash `—` in `text.secondary`, right-aligned if numeric column, left-aligned otherwise.
- **Action cell** (the last column with row-level actions): Right-aligned (`textAlign: right`), no header label.

> Always one button, never multiple sibling buttons. Use `MpButton variant="secondary" right-icon="chevrons-down"` + `MpPopover` dropdown. Do not set `size="sm"` — use default (md).
> **Do not interpret the PRD's list of actions (e.g. "Approve and Reject") literally as separate buttons.** The PRD describes what the actions are, not how they should be rendered — pattern reference owns the rendering decision.

#### Selectable tables (checkbox + first column)

When rows are selectable, **never add a standalone checkbox column**. Merge the checkbox into the first data column using `MpFlex alignItems="center" gap="3"` in both the header cell and each data cell. Include `MpCheckbox`, then optional `MpAvatar`, then `MpText`.

- `MpAvatar` when present: pass only the **first word** of the name as `:name` so it renders a single initial at `size="sm"`.
- Gap between checkbox, avatar, and label: `gap="2"` (8px).

#### Column widths

- First column (identifier): widest, no max width unless reasonable. Truncate with ellipsis only if name length exceeds 240px, with a tooltip on hover.
- Numeric columns: fit-to-content, with at least `pxl-space-md` 16 padding on both sides.
- Action column: fixed ~120px, no shrink.

#### Sticky Actions column

When the table overflows horizontally, the Actions column must stay fixed at the right edge. Apply `position: sticky; right: 0; z-index: 2` to the Actions header and data cells. For the left separator: use a `::before` pseudo-element with `background-color: var(--pixel-color-border-default)` — **never `border-left` or `box-shadow`** (`MpTable` uses `border-collapse: collapse`, which makes those unreliable). Add an `--at-end` modifier class that sets `opacity: 0` on the pseudo-element when the table is scrolled fully right. Toggle the class based on a scroll listener:

Note: `MpTableContainer` is a Vue component — access its DOM node via `.value.$el`, not `.value` directly. Attach the scroll listener on `onMounted`, remove it on `onUnmounted`.

### Pagination

Below the table, always inside the shared wrapper above.

**Visibility rule:** Show pagination whenever total rows > 10. If total rows ≤ 10, hide the entire pagination row — the table is short enough to read without it. Never show an empty or disabled pagination bar.

It returns the production-ready Vue component. Call it and adapt the slot/prop API to connect your `rowsPerPage`, `currentPage`, and `total` refs.

**State** — use number refs (`ref(10)`, `ref(1)`), not string refs. Reset `currentPage` to `1` when filters or search change. Guard: reset `currentPage` to `totalPages` when data change makes it exceed the new total.

For infinite scroll: only use when sort order is reverse-chronological feed (notifications, activity log). Default to numeric pagination.

## Empty State (must have)

> Call `get-block("general-display-empty-state")` for code example.

Three distinct variants — choose based on why the table is empty:

### 1. Blank slate (no data ever)

Replace the **entire table area** (including the header row) with a full illustrated empty state. See `empty-state.md` for anatomy. Hide pagination.

### 2. Search not found

The user typed a query and got zero results. **Table header stays visible** — the not-found block is a sibling element rendered below `MpTableContainer`, not inside the table body.

- Layout: `direction="column" alignItems="center" flexGrow="1" pt="6"` — top-aligned from the table header, NOT `justifyContent="center"` (which floats it in the middle).
- Illustration: use the shared `/not-found.png` asset (260×260px, `objectFit: contain`).
- Title: `"[query]" not found` — quote the literal search term.
- Helper: "Recheck the keywords you have typed and try searching again."

### 3. Filter not found

The user applied a filter (pipeline, status, etc.) and got zero results. Same layout as search not found, same illustration.

- Title: "[Object] not found"
- Helper: "Recheck the filter you have applied and try filtering again."

### `showTable` computed pattern

The key to keeping the header visible for variants 2 and 3:

`emptyStateKind` computed: returns `'search-not-found'` when search has text + no rows, `'filter-not-found'` when active filter + no rows, `null` otherwise.

`showTable` computed: `true` when loading, has rows, OR `emptyStateKind !== null` — this keeps the table header visible during not-found states.

Template structure:

`MpTableContainer v-if="showTable"` — visible even when not-found (keeps header). `MpTableBody` branches on `isLoading` for skeleton vs data rows. Blank-slate block: `v-else` on `showTable` — replaces entire table including header. Not-found blocks: `v-if="emptyStateKind === 'search-not-found'"` and `v-else-if="emptyStateKind === 'filter-not-found'"` as **siblings after** `MpTableContainer`, never nested inside it.

## Loading state (must have)

> Call `get-component("skeleton")`

- Initial load: skeleton rows (5–8 placeholder rows with gray bars matching cell widths).
- Re-load after filter/sort: keep existing rows visible, apply a subtle overlay or shimmer; don't blank the table.

## Edge Cases

- **Very long single-row content** (a description column with 300 chars) — truncate to 1 line with ellipsis + tooltip on hover, OR move the column out of the table into the detail view.
- **No-permission rows** — hide entirely or show with redacted values? Default: filter them out server-side.
- **Bulk actions** — does this list need bulk select? See `bulk-select.md`.
- **Saved views / pinned filters** — does the user need to save a filter combination? Often missed in PRDs.
- **Default sort** — what sorts the first time the user lands? Newest first is the usual default; confirm with PM.
- **Sticky header on scroll** — do NOT use `MpTableHead is-fixed` (causes double border). Use plain `<MpTableHead>` and handle scroll at the container level if needed.
- **Export** — CSV, XLSX, or PDF? What's the row limit before it goes to async email delivery?
- **Real-time updates** — does this list refresh while the user is on it (Qontak inbox, Expense notifications)?

## Common Mistakes

- **Outer border on the table.** The table is borderless on the outside. The page's content area provides the boundary.
- **Zebra striping.** Rows alternate only via the 1px bottom border. No alternating background colors.
- **Center-aligned numeric columns.** Always right-align numbers — amounts, counts, percentages.
- **Colored row backgrounds for status.** Status goes inside a pill in the cell, not as a row background tint.

## Output Contract

When you ship an index view:

- Column list with: name, data type, sortable y/n, alignment, default sort y/n.
- Pagination decision (numeric vs infinite) with reasoning.
- Filter inventory (see `filter.md`).
- Empty state copy and CTA.
- Bulk action inventory if applicable.
- Loading and re-loading behavior specified.
