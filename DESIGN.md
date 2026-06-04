# Mekari ERP — Design Rules

Single source of truth for design decisions and component rules in this project.
All developers must follow these rules before writing code.

---

## Theme

Always use the **Enterprise** theme from Pixel 3.

```ts
// app/app.vue — already set, do not change
import { usePixelTheme } from '@mekari/pixel3'
const { setNextTheme, setProductTheme } = usePixelTheme()
setNextTheme(true)            // Token v2.4
setProductTheme('enterprise') // Enterprise theme
```

Do not use non-Enterprise components or manually override tokens.

---

## Layout

### Stage
- Stage is the white content area below the page title bar.
- **Padding: `var(--mp-spacing-6)` (24px) on all sides — required on every page, no exceptions.**

```vue
<template>
  <div class="page-content">
    <!-- content -->
  </div>
</template>

<style scoped>
.page-content { padding: var(--mp-spacing-6); } /* 24px */
</style>
```

### Page Title Bar
- **Always `72px`**, background `var(--mp-background-neutral-subtle)`, padding `0 24px`.
- Full spec (dimensions, index / detail / form variants, title-bar status badge rule,
  build checklist) lives in **[docs/patterns/page-title-bar.md](docs/patterns/page-title-bar.md)** —
  refer to it when generating any page.

---

## Pixel Enterprise Components

Use these directly from `@mekari/pixel3`:

| Component | Usage |
|-----------|-------|
| `MpBadge` | Status and tag badges |
| `MpInput`, `MpInputGroup`, `MpInputLeftAddon` | Search input |
| `MpSelect` | Dropdown filter |
| `MpButton` | Action buttons |
| `MpCheckbox` | Row selection |
| `MpIcon` | Icons |

> **`MpTable` is not used.** The Enterprise variant does not match the ERP Figma design. Use `ErpTablePage` instead.

### MpBadge — status mapping

`for="tableStatus"` inside table cells:

> Pixel `MpBadge` has **no purple**. The **gray / neutral** badge is `announcement`
> (not `information`, which is **blue**).

| Status | `type` | Colour |
|--------|--------|--------|
| Paid, Approved, Active, Completed | `completed` | green |
| Open, Pending, Draft, In Review | `warning` | yellow |
| Overdue, Rejected, Failed | `critical` | red |
| **Closed, Voided**, Inactive, Archived, Cancelled | `announcement` | **gray** |
| Partially processed, New, VIP | `information` | blue |

`for="additionalInformation"` for tag badges (VIP, B2B, Retail, etc.).

Use `ErpStatusBadge` — it wraps `MpBadge` with the mapping built in.

---

## Custom Components

Built in-house because they do not exist in Pixel Enterprise yet.
Note for Pixel team: add these to the Enterprise library.

> Full component & page docs: see [docs/README.md](docs/README.md).

### `ErpTablePage`
`app/components/patterns/ErpTablePage.vue`

### `ErpPagination`
`app/components/patterns/ErpPagination.vue`

### `ErpFilterBar`
`app/components/patterns/ErpFilterBar.vue`

### `ErpStatusBadge`
`app/components/patterns/ErpStatusBadge.vue`

---

## Table Component Design

### Header

| Property | Value | Token |
|----------|-------|-------|
| Background | neutral subtle | `var(--mp-background-neutral-subtle)` |
| Height | 28px | `var(--mp-sizes-7)` |
| Font size | 12px | `var(--mp-font-sizes-sm)` |
| Font weight | 600 (semibold) | `var(--mp-font-weights-semi-bold)` |
| Text transform | uppercase | — |
| Padding (left-aligned) | `4px 16px 4px 8px` | `var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2)` |
| Padding (right-aligned) | `4px 8px 4px 16px` | `var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4)` |
| Border bottom | 1px solid | `var(--mp-border-default)` |
| Position | sticky top: 0 | — |

### Row

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

### Sticky right column (actions)

```css
position: sticky;
right: 0;
box-shadow: inset 2px 0 var(--mp-border-default);
background: inherit;
```

Handled automatically by `ErpTablePage` when the `#actions` slot is used.

### Standard columns

| Column | Width | Align | Notes |
|--------|-------|-------|-------|
| Checkbox | — | — | Inside the **first column's cell** (select-all in header) via `has-checkbox` — not a separate column |
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

### Number format (IDR)
```ts
new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  minimumFractionDigits: 2,
}).format(amount)
// → "Rp9.000.000,00"
```

### Date format
```ts
new Intl.DateTimeFormat('id-ID', {
  day: '2-digit', month: '2-digit', year: 'numeric',
}).format(new Date(isoString))
// → "19/03/2026"
```

### Usage

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

## Pre-coding Checklist

- [ ] `ErpTablePage` for every index page — do not build a custom table
- [ ] `ErpStatusBadge` for status cells — do not use raw `MpBadge` with manual mapping
- [ ] Stage padding `var(--mp-spacing-6)` (24px) on all sides — no exceptions
- [ ] Enterprise theme is set in `app.vue` — do not repeat it in pages
- [ ] `pageRegistry` key must exactly match the sidebar menu label
- [ ] Mock data lives in `app/data/` — do not hardcode in components
