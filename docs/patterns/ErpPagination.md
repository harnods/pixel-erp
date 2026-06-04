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
