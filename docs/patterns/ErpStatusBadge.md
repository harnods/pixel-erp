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

> **Pixel `MpBadge` has 5 `type`s and NO purple.** The **gray / neutral** badge is
> **`announcement`** (Pixel's own example uses `announcement` for "Inactive").
> `information` is **blue**, not gray.

| Badge type | Colour | Statuses |
|---|---|---|
| `completed` | green | `paid`, `approved`, `active`, `completed`, `verified`, `success`, `reserved` |
| `warning` | yellow | `open`, `pending`, `draft`, `in review`, `on progress`, `requested` |
| `critical` | red | `overdue`, `rejected`, `failed`, `expired`, `error` |
| `announcement` | **gray** | `closed`, `voided`, `inactive`, `archived`, `cancelled`, `canceled`, `not started`, `issued / picked` |
| `information` | blue | `partially processed`, `partially reserved`, `new`, `beta`, `vip`, `featured` |

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
