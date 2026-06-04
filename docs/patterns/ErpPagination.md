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

## Progressive pagination (load-more)

A **second pagination model**, used for **embedded / read-only tables** — e.g. the
**line-items table on a detail page** ([details-page-format.md](details-page-format.md)),
related-records tabs, etc. Instead of page numbers, rows are revealed in batches.

- A row **below the table** reads **`Showing {shown} of {total} {items}`** (e.g.
  `Showing 10 of 124 products`).
- It loads the **next 10 rows** on a **manual trigger** (a `Load more` text-link next to
  the count). Two states:
  1. **Idle**: `Showing {shown} of {total} {items}` + **`Load more`**.
  2. **Loading**: while the next batch loads, the row shows a **spinner (`MpSpinner`) +
     `Loading items…`** (replacing the count + link). Then it appends 10 and returns to idle.
- When **`shown === total`** (everything loaded) there is **no trigger** — just the
  count (e.g. `Showing 2 of 2 products`).
- The progressive-pagination row has a **bottom border** (`1px solid
  var(--mp-border-default)`) closing the table region, and **8px left/right padding**
  (`var(--mp-spacing-2)`, aligning the count with the table's first column) with **12px
  top/bottom** (`var(--mp-spacing-3)`). Text uses **`var(--mp-text-secondary)`**.
- **Batch size = 10.** Tables can hold **100+ rows**, so the default is to show the
  first batch and let the user load more on demand (not render everything at once).

Implemented on the Sales Order detail page (`SalesOrderDetailsPage.vue`): the line-items
table shows `shownCount` rows (default 10), and a **`Load more`** text-link appends
`PAGE_SIZE` (10) more. The mock data varies item counts per order (1 → many); **SO001
has 50 items** so the load-more is exercised end-to-end.

Distinguish from the standard bar above: **page numbers + prev/next + rows-per-page**
is for **index pages**; **progressive load-more** is for **embedded detail tables**.
