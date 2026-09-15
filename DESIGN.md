# Mekari ERP — Design Rules (long-form)

Long-form rationale and component rules for this project. The **canonical registry**
of accepted decisions — each as a stable `rule/<id>` with Do/Don't + Why + Source,
and the authority hierarchy for resolving conflicts — is
[`docs/design/RULES.md`](docs/design/RULES.md). Start there (or invoke the
`pixel-erp-design` skill, which routes you to the right rules per surface); this file
is the detail behind those IDs.

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

## Typography

- **Never use italic.** No `font-style: italic` / `<i>` / `<em>` styling anywhere in
  the ERP — not for notes, captions, hints, disclaimers, or emphasis. To de-emphasize
  text use a smaller size (`--mp-font-sizes-sm`) and/or a secondary color
  (`--mp-text-secondary`); to emphasize, use weight (`--mp-font-weights-semi-bold`).
- Use only the Pixel type scale (`--mp-font-sizes-*`) and weights (`--mp-font-weights-*`).

---

## Layout

### Stage
- Stage is the **white** content area (`var(--mp-background-stage)`) below the page
  title bar, with **`var(--mp-spacing-6)` (24px) padding on all sides** — required
  on every page, no exceptions.
- **Who supplies that padding depends on the page type — do NOT double it:**
  - **Sidebar / `pageRegistry` pages** (index & simple pages) render *inside* the
    shared `.stage` wrapper in `[...slug].vue`, which already provides the white
    surface + 24px padding + column gap. **Your page root must NOT add its own
    padding or background** — just lay out your sections. (Adding `padding: 24px`
    on the root double-pads to 48px — a common mistake.)
  - **Detail / form pages** (matched via `detailMatch`) own their *entire* layout,
    including their own 72px title bar and their own scroll container — **these**
    apply the 24px stage padding themselves.
- If unsure, check whether your page is in `pageRegistry` (→ don't pad) or
  `detailMatch` (→ pad).

### Surfaces & cards
- **Cards, boxes, panels, and any inline surface are separated by a `1px` border
  (`var(--mp-border-default)` / `var(--mp-border-subtle)`) — NEVER a drop-shadow.**
  We do not use `box-shadow` / `var(--mp-shadows-*)` for elevation on content
  surfaces. A dropshadowed card is wrong even if the source design has one.
- Drop-shadows are reserved for genuinely **floating overlays** (menu, popover,
  dropdown, modal, drawer) that sit above the page. `box-shadow: inset …` (focus
  rings, cell borders) is not a drop-shadow and is fine.
- Radius via `var(--mp-radii-*)`; surface fill `var(--mp-background-neutral)`.

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
| `MpButton` | Action buttons |
| `MpCheckbox` | Row selection |
| `MpIcon` | Icons |

> **`MpTable` is not used.** The Enterprise variant does not match the ERP Figma design. Use `ErpTablePage` instead.

> **`MpSelect` is banned repo-wide, no exceptions** (`rule/select-erpfilterselect`
> in `docs/design/RULES.md`) — it renders a native OS `<select>`, which clips in
> scroll containers and is off-system. Every dropdown/filter uses `ErpFilterSelect`
> (an `MpPopover` menu, clearable).

### Buttons

**Source of truth: [`docs/design/RULES.md`](docs/design/RULES.md) (`rule/btn-*`).**
New buttons use Pixel **`<MpButton>`** per the storybook — its secondary variant is
globally overridden in `erp.css` to the Enterprise look (black label + dark border).
**`.btn-enterprise` is legacy** — do not add new ones; existing usages migrate when a
file is next touched. [docs/patterns/Button.md](docs/patterns/Button.md) documents the
legacy class and shared visual rules.

Core rules:

- **Secondary = black/default text + bold border** on neutral fill.
- **Cancel / dismiss is always ghost** — never secondary.
- **Edit forms use "Save changes"; create forms use "Save".**
- **No disabled action buttons for validation.** Keep them clickable; validate on
  click and show an inline error or toast. Loading/duplicate-submit protection can
  disable while the action is already running.
- Only **one** primary action per screen.

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

`ErpTablePage` is the **single source of truth** for table specs: header, row
metrics, sticky columns, standard columns, skeleton, row-hover actions, row action
menus, and empty states.

See **[docs/patterns/ErpTablePage.md](docs/patterns/ErpTablePage.md)**. Do not
duplicate table dimensions or spacing rules in page-level docs.

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
    <ErpFilterSelect id="filter">...</ErpFilterSelect>
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
- [ ] Stage padding `var(--mp-spacing-6)` (24px) — supplied by `.stage` for
      `pageRegistry` pages (do NOT re-pad the root); by the page itself for detail/form pages
- [ ] Cards/boxes use a `1px` border, **never** a drop-shadow (`box-shadow`) —
      shadows are only for floating overlays
- [ ] Section/status tabs go **below the title bar, outside the stage** via
      `pageTabs` in `[...slug].vue` — NOT `MpTabs` in the page; active tab =
      `.page-tab--active` (`--mp-text-selected` + 2px bar). See [docs/patterns/tabs.md](docs/patterns/tabs.md)
- [ ] Enterprise theme is set in `app.vue` — do not repeat it in pages
- [ ] `pageRegistry` key must exactly match the sidebar menu label
- [ ] Mock data lives in `app/data/` — do not hardcode in components
