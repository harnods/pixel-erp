# ErpPagination

**File**: `app/components/patterns/ErpPagination.vue`
**Purpose**: Pagination bar — rows-per-page selector, range info, page info, prev/next controls.

> **Note**: `ErpPagination` is already built into [ErpTablePage.md](ErpTablePage.md).
> You only need it standalone for non-table paginated lists.

---

## Design Spec

| Property | Value | Token |
|---|---|---|
| Layout | `flex`, `justify-content: space-between` | — |
| Padding | `8px` (all sides) | `var(--mp-spacing-2)` |
| Border top | `1px solid` | `var(--mp-border-default)` |
| Font size | 14px | `var(--mp-font-sizes-md)` |
| Line height | 20px | `var(--mp-line-heights-md)` |
| Text color | secondary | `var(--mp-text-secondary)` |

---

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `total` | `number` | `0` | Total record count |
| `currentPage` | `number` | `1` | Active page (1-based) |
| `perPage` | `number` | `25` | Rows per page |

## Emits

| Event | Payload | When |
|---|---|---|
| `pageChange` | `number` | User clicks prev/next |
| `perPageChange` | `number` | User changes rows-per-page |

---

## Behaviour

- **Rows-per-page options**: `[10, 25, 50, 100]`.
- **Left group**: "Rows per page" `<select>` + `Showing {rangeStart}-{rangeEnd} of {total}`.
- **Right group**: `Page {currentPage} of {totalPages}` + prev/next icon buttons.
- **Computed values**:
  - `totalPages = max(1, ceil(total / perPage))`
  - `rangeStart = total === 0 ? 0 : (currentPage - 1) * perPage + 1`
  - `rangeEnd = min(currentPage * perPage, total)`
- **Disabled states**: prev disabled when `currentPage <= 1`; next disabled when
  `currentPage >= totalPages`.

> The component only emits `pageChange` / `perPageChange` — it does **not** clamp
> the page itself. When wired through `useTableState`, `setPage` clamps to
> `[1, totalPages]`.

---

## Typical Use (standalone)

```vue
<ErpPagination
  :total="total"
  :current-page="currentPage"
  :per-page="perPage"
  @page-change="setPage"
  @per-page-change="setPerPage"
/>
```

For index pages, use [ErpTablePage.md](ErpTablePage.md) instead — it wires
pagination automatically.

---

## Progressive pagination (infinite scroll)

A **second pagination model**, used for **embedded / read-only tables** — e.g. the
**line-items table on a detail page** ([details-page-format.md](details-page-format.md)),
related-records tabs, etc. Instead of page numbers, rows are revealed in batches as the
user scrolls.

- **Show 10 by default** (`PAGE_SIZE = 10`).
- **The table scrolls internally.** When there are more than ~10 rows the table gets a
  **fixed `max-height` with its own `overflow-y: auto`**, so 50–100+ rows **don't make
  the page grow** — the user scrolls inside the table. The **header is sticky** (`thead th
  { position: sticky; top: 0 }`) so columns stay visible.
- **In this scrolling state the table is a contained panel** with a **1px
  `var(--mp-border-bold)` outer border** + `var(--mp-radii-md)` corners (the `Showing N
  of N` footer sits inside it, divided by a top border). When the list fits in the
  default page (≤ ~10 rows, no scroll), there is **no border**.
  > Note: `overflow: hidden` on a flex child zeroes its min-height — give the panel
  > `flex-shrink: 0` so the flex-column stage doesn't collapse it.
  > **The outer border is for VERTICAL internal scroll only.** A table that merely
  > overflows **horizontally** (many/wide columns) uses a plain `overflow-x: auto`
  > scroll container with **no outer border / radius** — same as `ErpTablePage`. Don't
  > add the bordered panel just because the table scrolls sideways.
- **Auto lazy-load (no button).** Scrolling near the bottom **auto-loads the next 10** —
  an **`IntersectionObserver`** watches a sentinel at the end of the loaded rows (`root` =
  the table scroll container, `rootMargin` bottom ~120px). No `Load more` button.
- **Loading state**: while the next batch loads, a **spinner (`MpSpinner`) +
  `Loading items…`** row appears at the bottom of the scroll. Then it appends 10.
- A row **below the table** reads **`Showing {shown} of {total} {items}`** (e.g.
  `Showing 10 of 124 products`); when **`shown === total`** loading stops.
- The count row has a **bottom border** (`1px solid var(--mp-border-default)`), **8px
  left/right padding** (`var(--mp-spacing-2)`, aligning the count with the first column),
  **12px top/bottom** (`var(--mp-spacing-3)`), text `var(--mp-text-secondary)`.

Implemented on the Sales Order detail page (`SalesOrderDetailsPage.vue`): `shownCount`
starts at 10; an IntersectionObserver on a bottom sentinel calls `loadMoreItems()`. The
mock data varies item counts per order (1 → many); **SO001 has 50 items** so the
scroll-to-load is exercised end-to-end.

Distinguish from the standard bar above: **page numbers + prev/next + rows-per-page**
is for **index pages**; **progressive load-more** is for **embedded detail tables**.
