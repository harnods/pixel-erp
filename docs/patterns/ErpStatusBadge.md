# ErpStatusBadge

**File**: `app/components/patterns/ErpStatusBadge.vue`  
**Purpose**: Renders a `MpBadge` with the correct type and label for a given status string.

---

## Usage

```vue
<ErpStatusBadge status="paid" />
<ErpStatusBadge status="overdue" />
<ErpStatusBadge status="draft" />
```

The `status` prop is **case-insensitive**. Unknown statuses fall back to `type="information"` with the raw string as label.

---

## Status → Badge Type Mapping

| Badge type | Statuses |
|---|---|
| `completed` (green) | `paid`, `approved`, `active`, `completed`, `verified`, `success` |
| `warning` (yellow) | `open`, `pending`, `draft`, `in review`, `on progress` |
| `critical` (red) | `overdue`, `rejected`, `failed`, `voided`, `expired`, `error` |
| `information` (gray) | `inactive`, `archived`, `cancelled`, `not started` |
| `announcement` (purple) | `new`, `beta`, `vip`, `featured` |

---

## Adding a New Status

Add an entry to `statusConfig` in the component file:

```ts
// in ErpStatusBadge.vue
'refunded': { type: 'information', label: 'Refunded' },
```

---

## Verbal Shorthand

| User says | What to do |
|---|---|
| "add [X] status" | Add entry to `statusConfig` in the component |
| "change [X] to green" | Change its `type` to `completed` |
| "show overdue sub-label" | In the page component, not ErpStatusBadge — add `<span class="status-sub-label">` below `<ErpStatusBadge>` |
