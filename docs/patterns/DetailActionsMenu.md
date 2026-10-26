# DetailActionsMenu

The shared **"Actions ▾"** dropdown button used on transaction detail page footers.
Each page passes its own set of menu items grouped by dividers.

> Component: [`app/components/patterns/DetailActionsMenu.vue`](../../app/components/patterns/DetailActionsMenu.vue)
> Related: [PrintShareMenu](PrintShareMenu.md) · [details-page-format § Footer action bar](details-page-format.md)

---

## When to use

Any transaction detail page that needs an "Actions" dropdown in the footer action
bar. Replaces hand-rolled `MpPopover` + `MpPopoverList` + `MpPopoverListItem`
per page — use this instead.

---

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | *required* | Unique popover id (e.g. `"so-actions"`) |
| `groups` | `ActionItem[][]` | *required* | Array of item groups — a divider renders between groups |
| `placement` | `string` | `'top-end'` | Popover placement |
| `variant` | `'primary' \| 'secondary'` | `'primary'` | Trigger button variant — use `'secondary'` when another button is the primary action (e.g. split-button "Add payment") |
| `label` | `string` | `'Actions'` | Override the trigger button label |

---

## ActionItem interface

```ts
interface ActionItem {
  label: string
  onClick?: () => void
  show?: boolean        // Hide entirely when false (default true)
  disabled?: boolean    // Render as disabled
  tooltip?: string      // Shown on hover when disabled
  destructive?: boolean // Render in danger color
}
```

---

## Usage

```vue
<script setup lang="ts">
import type { ActionItem } from '~/components/patterns/DetailActionsMenu.vue'

const actionGroups = computed<ActionItem[][]>(() => [
  [
    { label: 'Preview', onClick: openPreview },
    { label: 'Create production request', onClick: handleCreate },
    { label: 'Mark as completed', onClick: markComplete, show: canMarkCompleted.value },
  ],
  [
    { label: 'Edit', onClick: edit },
    { label: 'Set as recurring' },
    { label: 'Duplicate', onClick: duplicate },
    { label: 'Void' },
    { label: 'Delete', onClick: () => deleteOpen.value = true, destructive: true },
  ],
])
</script>

<template>
  <!-- Footer action bar -->
  <PrintShareMenu id="so-print" />
  <DetailActionsMenu id="so-actions" :groups="actionGroups" />
</template>
```

---

## Features

- **Grouped items with dividers**: each inner array is a group; a 1px divider renders between consecutive visible groups.
- **Conditional visibility**: `show: false` hides an item entirely — the group collapses if all items are hidden.
- **Disabled + tooltip**: `disabled: true` renders the item as inert; pair with `tooltip` to explain why.
- **Destructive items**: `destructive: true` renders the item in `var(--mp-colors-text-danger)` (e.g. Delete, Void).
- **Variant override**: `variant="secondary"` for pages where another button is the primary action (e.g. SalesInvoice Open/Overdue split button).

---

## Design rules

- `rule/btn-dropdown-mppopover` — dropdowns use MpPopover, not native select.
- `rule/popover-no-icons` — popover list items are text-only, no icons.
- `rule/btn-dropdown-min-width` — popover content has `min-width: 200px`.
- `rule/btn-one-primary` — only one primary button per footer; use `variant="secondary"` when needed.

---

## Applied to

| Module | Page | Notes |
|---|---|---|
| Sales | SalesOrderDetailsPage | 2 groups: Preview + module actions \| Edit + general actions |
| Sales | SalesQuoteDetailsPage | 1 group: Preview + general actions |
| Sales | SalesDeliveryDetailsPage | 2 groups: Preview + Create SI \| general actions |
| Sales | SalesInvoiceDetailsPage | Paid status only; Open/Overdue uses split button instead |
