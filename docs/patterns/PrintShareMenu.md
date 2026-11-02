# PrintShareMenu

The shared **"Print & share ▾"** secondary dropdown button used on every transaction
detail page footer.

> Component: [`app/components/patterns/PrintShareMenu.vue`](../../app/components/patterns/PrintShareMenu.vue)
> Related: [DetailActionsMenu](DetailActionsMenu.md) · [details-page-format § Footer action bar](details-page-format.md)

---

## When to use

Any transaction detail page that needs a "Print & share" dropdown in the footer
action bar. Replaces hand-rolled `MpPopover` per page — use this instead.

---

## Props

| Prop | Type | Default | Description |
|---|---|---|---|
| `id` | `string` | *required* | Unique popover id (e.g. `"so-print"`) |
| `placement` | `string` | `'top-end'` | Popover placement |

---

## Events

| Event | Description |
|---|---|
| `print-pdf` | Print PDF clicked |
| `print-dot-matrix` | Print dot matrix clicked |
| `whatsapp` | Share via WhatsApp clicked |
| `email` | Share via email clicked |
| `copy-link` | Copy link clicked |

---

## Usage

```vue
<template>
  <!-- Footer action bar -->
  <PrintShareMenu id="so-print" @print-pdf="handlePrintPdf" />
  <DetailActionsMenu id="so-actions" :groups="actionGroups" />
</template>
```

---

## Standard items

Fixed across all detail pages (two groups separated by a divider):

1. **Print**: Print PDF · Print dot matrix
2. **Share**: Share via WhatsApp · Share via email · Copy link

---

## Design rules

- Always rendered as `variant="secondary"` (the "Actions" button is the primary).
- `rule/btn-dropdown-mppopover` — uses MpPopover, not native select.
- `rule/popover-no-icons` — text-only items, no icons.
