# ErpPagination

**File**: `app/components/patterns/ErpPagination.vue`  
**Purpose**: Pagination bar — rows-per-page selector, page info, prev/next controls.

> **Note**: `ErpPagination` is already built into `ErpTablePage`. You only need it standalone for non-table paginated lists.

---

## Design Spec

| Property | Value |
|---|---|
| Padding | `8px 16px` |
| Border top | `1px solid var(--mp-border-default)` → `#e3e7e9` |
| Font size | `13px` |
| Text color | `var(--mp-text-secondary)` → `#3a4749` |

---

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `total` | `number` | — | Total record count |
| `currentPage` | `number` | — | Active page (1-based) |
| `perPage` | `number` | `10` | Rows per page |

## Emits

| Event | Payload | When |
|---|---|---|
| `pageChange` | `number` | User clicks prev/next or page number |
| `perPageChange` | `number` | User changes rows-per-page |

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

For index pages, use `ErpTablePage` instead — it wires pagination automatically.
