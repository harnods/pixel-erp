# ERP design rules — canonical registry

This is the **single source of truth** for accepted design decisions in `erp-app`.
It exists because code shows *what* shipped, not *why* one pattern became the
standard — that reasoning is captured here so every agent (and human) resolves the
same way.

## How to read a rule

Every rule has:

- **`rule/<id>`** — a stable identifier. Cite it in PRs, commits, and reviews
  (e.g. "fixed per `rule/btn-cancel-ghost`"). Never renumber; deprecate instead.
- **Do / Don't** — one *observable* statement. If you can't verify it by looking
  at the rendered UI or the diff, it doesn't belong here (put judgment nuance in
  the linked pattern doc, not here).
- **Why** — the user/consistency reason. A rule without a reason gets ignored.
- **Source** — the pattern doc that carries the full recipe + edge cases.
- **Lint** — `pixel-police` if `.claude/scripts/pixel-police.sh` flags it
  mechanically; `review` if it needs human/agent judgment.

> Observable, not aspirational. ❌ "Buttons should be clear."
> ✅ "Any button labelled *Cancel* uses the ghost variant." — `rule/btn-cancel-ghost`

---

## Authority hierarchy (how to resolve conflicts)

When inputs disagree — a mockup vs a rule, a screenshot vs the standard — resolve
in this order, highest wins:

1. **Explicit user goal in this task** ("make this one full-width").
2. **A rule in this file** (`rule/*`) — beats any mockup detail. A Figma export
   showing a native `<select>` does **not** override `rule/select-erpfilterselect`.
3. **A pattern doc** in `docs/patterns/*`.
4. **An adjacent shipped page** that already follows the rules.
5. **General taste / your training prior** — lowest. Never let this override 2–4.

If a mockup conflicts with a rule, follow the rule and say so. If you believe the
rule is wrong, propose changing *this file* — do not silently deviate in one page.

---

## Rejected reflexes — reject these on sight

These are the off-standard defaults your training prior produces most often. When
you catch yourself about to write one, stop and apply the linked rule. Naming them
is the point: they *feel* normal, which is exactly why they slip through.

| Reflex (what you'll instinctively reach for) | Reject → use | Rule |
| --- | --- | --- |
| Native `<select>` or `MpSelect` for a dropdown | `ErpFilterSelect` | `rule/select-erpfilterselect` |
| `MpDrawer` for a side panel | Teleport shell (copy `BillsFiltersDrawer`) | `rule/drawer-custom-shell` |
| `disabled` a button until the form is valid | keep clickable + inline error | `rule/btn-no-disabled-validation` |
| Toast for a validation/error message | inline error near the field | `rule/form-errors-inline` |
| Gray text on a secondary button | black/default text + bold border | `rule/btn-secondary-black` |
| Secondary variant for a Cancel button | ghost | `rule/btn-cancel-ghost` |
| `box-shadow` to lift a card | 1px border | `rule/surface-border-no-shadow` |
| Italic for a note/caption/hint | smaller size + secondary color | `rule/type-no-italic` |
| Hardcoded `px` / hex color | `var(--mp-*)` tokens | `rule/token-no-hardcoded-*` |
| Pixel `width` on a name/date/amount column | semantic `kind` | `rule/table-column-kind` |
| `MpTextlink` for a clickable row name | `<span>` styled as link | `rule/table-name-link-span` |
| Hand-rolled `<table>` / toggle chips | `ErpTablePage` / `MpInputTag` | `rule/table-use-erptablepage`, `rule/select-multi-mpinputtag` |
| `size="md"` on a button | omit size (md is default) | `rule/btn-no-size-md` |
| `size="sm"` on primary/danger/ghost | drop it (sm = secondary, bulk-bar only) | `rule/btn-sm-secondary-only` |
| An icon on a danger button | text-only danger | `rule/btn-danger-no-icon` |
| `left-icon` on a sm button | right-icon dropdown only | `rule/btn-sm-dropdown-only` |
| `is-full-width` on a button | button hugs content | `rule/btn-no-full-width` |
| Shipping only the populated success case | design every reachable state | `reachable-states.md` |

---

## Buttons — source: `docs/patterns/Button.md`

- **`rule/btn-mpbutton-standard`** — *Do:* build **new** buttons with Pixel
  **`<MpButton>`** per the Pixel storybook (its secondary is globally overridden to
  the Enterprise look — see `rule/btn-secondary-black`). *Don't:* add **new**
  `.btn-enterprise` buttons — that class is **legacy**. Existing `.btn-enterprise`
  usages are tolerated and migrated when the file is next touched (do not mass-flag).
  **Why:** one button implementation, driven by the design system. **This rule
  overrides any older wording in `DESIGN.md` / `Button.md`.** **Lint:** review.

- **`rule/btn-cancel-ghost`** — *Do:* every button labelled Cancel / Close /
  Dismiss / Back / Keep editing uses the **ghost** variant. *Don't:* use secondary
  for Cancel. **Why:** dismiss is not an action; ghost keeps one visual action per
  screen. **Lint:** pixel-police (heuristic).
- **`rule/btn-secondary-black`** — *Do:* secondary button = **default (near-black)
  label** (`--mp-colors-text-default`) + **dark neutral border** (`--mp-colors-border-bold`).
  **Standard = Pixel `<MpButton variant="secondary" is-rounded>`** — its secondary is
  **globally overridden** in `erp.css` (`.mp-button--variant_secondary`) to these
  colors, so plain MpButton is correct; you do **not** need `.btn-enterprise--secondary`
  for the visual. *Don't:* leave Pixel's default (brand-blue label). **Why:** ERP
  secondary is a real action, must read as clickable, not muted. Primary / ghost /
  danger MpButton variants are already correct — no override. **Lint:** review.
- **`rule/btn-ghost-regular`** — *Do:* ghost buttons use **regular** weight.
  **Why:** ghost is the lowest-emphasis action. **Lint:** review.
- **`rule/btn-one-primary`** — *Do:* exactly one primary action per screen/modal.
  **Why:** two primaries = no primary. **Lint:** review.
- **`rule/btn-always-pill`** — *Do:* every ERP button is pill-rounded
  (`is-rounded` / `radii-full`). **Why:** house shape. **Lint:** pixel-police
  (heuristic).
- **`rule/btn-no-size-md`** — *Do:* omit `size` — **`md` is the default**. *Don't:*
  ever write `size="md"` (redundant). **Lint:** pixel-police.
- **`rule/btn-sm-secondary-only`** — *Do:* `size="sm"` is allowed **only** on
  `variant="secondary"`, and **only** in a **table-header bulk-action bar** — nowhere
  else. *Don't:* `size="sm"` on primary/danger/ghost/textLink, or a small button
  outside a bulk bar. **Why:** one control height everywhere except that one dense
  context. **Lint:** pixel-police.
- **`rule/btn-danger-no-icon`** — *Do:* keep danger buttons **text-only**. *Don't:*
  put `left-icon` or `right-icon` on `variant="danger"`. **Lint:** pixel-police.
- **`rule/btn-sm-dropdown-only`** — *Do:* a `size="sm"` button may carry **only a
  right-icon dropdown chevron**. *Don't:* give a small button a `left-icon`. **Lint:**
  pixel-police.
- **`rule/btn-no-full-width`** — *Do:* buttons hug their content. *Don't:* use the
  `is-full-width` prop. Full-width is a **responsive-only** behavior — see
  `rule/btn-responsive-footer` — never a manual prop. **Lint:** pixel-police.
- **`rule/btn-responsive-footer`** — *Do:* build form/modal footer actions as an
  **`<MpButtonGroup class="erp-action-footer">`**. It is **always right-aligned** on
  desktop and, on **mobile (≤640px)**, becomes **full-width, stacked, primary on top**.
  Variants: **2-button** (ghost Cancel + primary Save) or **3-button** (ghost Back +
  ghost Cancel + primary Save). Keep DOM order with the primary **last** (the CSS
  reverses to put it on top on mobile). Modal footers (`MpModalFooter`) also get the
  responsive behavior automatically. *Don't:* hand-roll per-page footer CSS or use
  `is-full-width`. **Why:** one footer pattern; thumb-friendly on mobile. **Lint:**
  review.
- **`rule/btn-group-gap-8`** — *Do:* buttons in an `MpButtonGroup` sit **8px apart**
  (the default `spacing="2"`) — including the action footer. *Don't:* override the gap
  to another value. **Why:** one consistent button spacing. **Lint:** review.
- **`rule/page-title-actions-group`** — *Do:* page-title-bar actions live **top-right**
  (title left, actions right — `space-between`). A **single** action may stand alone;
  **two or more** are wrapped in an `MpButtonGroup` (8px gap) ordered **secondary then
  primary** (e.g. `Import` then `+ New <entity>`). Keep **one primary**. *Don't:* put
  bulk ops (**Export, Column settings**) here — those live in the filter bar's icon
  group (`rule/filter-bar-icon-group`); and don't place multiple loose buttons.
  **Why:** consistent title-bar cluster. **Source:** `docs/patterns/page-title-bar.md`.
  **Lint:** review.
- **`rule/btn-icon-tooltip`** — *Do:* an **icon-only** button carries both an
  **`aria-label`** and an **`MpTooltip`** naming the action. *Don't:* ship a bare
  icon button with no accessible name / hint. **Why:** icon-only actions are
  unlabelled without it. **Lint:** review.
- **`rule/filter-bar-icon-group`** — *Do:* the filter bar's tool icons — **AI
  (Airene) → `airene-brand`, Column settings → `table-view-column`, Export →
  `download`** — are **GHOST icon-only `MpButton`s inside one `MpButtonGroup`**
  (transparent, 36×36 — the `.filter-icon-btn` style), each wrapped in an `MpTooltip`
  (see `rule/btn-icon-tooltip`). *Don't:* use secondary/filled buttons, scatter them
  loose, or hand-roll the grouping. **Why:** one consistent tool cluster on every list
  page. Pairs with `rule/filter-bar-search-export`. **Lint:** review.
- **`rule/icon-pixel-library`** — *Do:* every icon is an **`MpIcon`** with a name from
  the **Pixel icon library** — verify the name via the `mekari-pixel` MCP
  (`get-icon-name`) before using it. *Don't:* use a raw `<svg>`, an emoji, an image, or
  a guessed/invalid icon name as a UI icon (an invalid name renders nothing / 404s).
  **Why:** consistent, on-system iconography. **Lint:** review (verify names via MCP).
- **`rule/btn-danger-confirm`** — *Do:* a **danger** button always opens a
  confirmation **`MpModal`** (`size="md"`) before running the destructive action —
  never delete/void/cancel directly on click. Copy follows the **UXW** library
  template exactly: title **"Delete {object}?"** (sentence case), body **"Deleted
  {object} cannot be restored."** (sentence case, period), a danger confirm using
  the **same verb+noun as the action** (**"Delete product"** — never "OK/Confirm/
  Yes"), and a ghost **Cancel**. Source:
  `.agents/skills/pixel-guardian/references/uxw-copy-library.md`. **Why:** destructive
  actions must be reversible-by-intent — one guaranteed confirm step, worded so the
  user knows exactly what happens. **Lint:** pixel-police (flags a danger button with
  `@click` in a file that has no `MpModal`) + review for the copy.
- **`rule/btn-save-toast`** — *Do:* a button whose action is a **save / submit /
  approve / delete** shows a **success `MpToast`** (`successToast()`) when it
  succeeds. Copy follows the **UXW** library: a short past-participle phrase —
  **"[Object] saved"**, **"Changes saved"**, **"[Object] submitted"**, **"[Object]
  deleted"** — sentence case, **no period**. *Don't:* stay silent after a successful
  submit, or use a toast for an error (errors go inline). **Why:** confirm success
  consistently, worded the same everywhere. **Source:**
  `.agents/skills/pixel-guardian/references/uxw-copy-library.md`. **Lint:** review.
- **`rule/btn-dropdown-mppopover`** — *Do:* a button that opens a menu of options
  **must** be a real **`MpPopover`** (`MpPopoverTrigger` → `MpPopoverContent` →
  `MpPopoverList` → `MpPopoverListItem`). A dropdown chevron button (`right-icon`
  chevron) is only ever the *trigger* inside an `MpPopover`. *Don't:* render a
  chevron button that does nothing, or hand-roll a menu. **Why:** every dropdown in
  the ERP behaves the same, on-system, and is keyboard/click-away correct. **Lint:**
  pixel-police (flags a chevron button in a file with no `MpPopover`).
- **`rule/btn-dropdown-min-width`** — *Do:* a dropdown-button / split-button popover
  menu has a **fixed `min-width` of 160px** — put `class="erp-dropdown-menu"` on its
  `MpPopoverContent`. **Why:** consistent menu width across the app. **Lint:** review.
- **`rule/btn-primary-icon-white`** — *Do:* icons inside a primary button are
  always white. **Why:** contrast on brand fill. **Lint:** review.
- **`rule/btn-no-disabled-validation`** — *Do:* keep action buttons **clickable**;
  on invalid click show an **inline** error. *Don't:* disable/grey a button to
  signal "not ready" (loading/duplicate-submit lock is the only allowed disable).
  **Why:** disabled buttons hide *why* and give no feedback. **Lint:** review.

## Forms & modals — source: `docs/patterns/Form.md`, `docs/patterns/Modal.md`

- **`rule/form-actions-always-present`** — *Do:* footer **Cancel + primary** are
  always rendered. *Don't:* hide/disable them based on preconditions. **Why:** see
  `rule/btn-no-disabled-validation`. **Lint:** review.
- **`rule/form-errors-inline`** — *Do:* validation/errors render **inline**
  (`MpFormErrorMessage` / red text near the field). *Don't:* use a toast for an
  error. Toast is for **success/info only**. **Why:** errors must sit where the fix
  is. **Lint:** review.
- **`rule/form-edit-save-changes`** — *Do:* edit-form primary = **"Save changes"**;
  create-form primary = **"Save"**. **Why:** verb matches the operation. **Lint:**
  review.
- **`rule/modal-use-mpmodal`** — *Do:* every modal uses Pixel **`MpModal`** (size
  `md`, ghost Cancel + pill confirm). "MpModal has no CSS" is a **myth** — it works.
  **Why:** one modal system. **Lint:** review.
- **`rule/modal-alert-top-align`** — *Do:* alert/confirm modals align to the **top**
  (`is-centered=false`; use `ConfirmModal.vue`). **Why:** house convention. **Lint:**
  review.
- **`rule/checkbox-multiline-top`** — *Do:* when a checkbox label wraps to >1 line,
  align the box to the **top** (`align-items: flex-start`). **Why:** box tracks the
  first line, not the vertical center of a paragraph. **Lint:** review.

## Selects, filters & inputs — source: `docs/patterns/ErpFilterBar.md`

- **`rule/select-erpfilterselect`** — **Repo-wide, no exceptions: never `MpSelect`.**
  *Do:* every dropdown is an **`MpAutocomplete`** — its options always render in a
  Pixel popover menu (never native). Variants: **select** = omit `is-searchable`
  (not typeable); **searchable** = add `is-searchable` (type-to-filter); always add
  `use-portal` so the menu never clips. A chosen value must show an (×) to reset —
  **but `is-clearable` does NOT render the × in this pulled Pixel build** (verified;
  same atomic-CSS gap as MpSelect), so add a **manual reset ×** overlay (MpIcon
  `close`, shown when there's a value) until Pixel is upgraded. *Don't:* use `MpSelect` (native `<select>` → OS dropdown, uncontrollable,
  clips), a native `<select>`, or a hand-rolled `<div>` fake select. `ErpFilterSelect`
  is the ERP wrapper around `MpAutocomplete`. **Why:** the OS draws (and owns) a native
  `<select>` menu — it can't be styled or made a popover; `MpAutocomplete` draws its
  own in-DOM popover. **Lint:** pixel-police (flags ANY `MpSelect`, and native `<select>`).
- **`rule/select-active-neutral`** — *Do:* select/search active+focus state = **bold
  neutral border** (`#8c9596`) + **slate ring**. *Don't:* green/brand focus ring.
  **Why:** neutral focus is the ERP override of Pixel's default. **Lint:** review.
- **`rule/select-multi-mpinputtag`** — *Do:* multi-select tag input uses
  **`MpInputTag`**. *Don't:* hand-roll toggle chips. **Why:** one tag-input
  behavior. **Lint:** review.
- **`rule/filter-bar-search-export`** — *Do:* the filter bar's right side always
  carries **Search** (rounded pill form) + **Export**. *Don't:* put Export in the
  page title bar. **Why:** fixed affordance location. **Lint:** review.

## Tables — source: `docs/patterns/ErpTablePage.md` (+ skill `erp-table-page`)

- **`rule/table-use-erptablepage`** — *Do:* render every table via **`ErpTablePage`
  + `useTableState`**. *Don't:* hand-roll a `<table>`. **Why:** one table engine.
  **Lint:** review.
- **`rule/table-column-kind`** — *Do:* set each semantic column's **`kind`** (date/
  number/name/status/amount/tags/unit/address). *Don't:* hardcode a pixel `width` on
  a semantic column. **Why:** widths come from `columnWidths.ts` so every table
  stays aligned. **Lint:** review.
- **`rule/table-no-outer-border`** — *Do:* no outer border box; wrapper is
  `overflow-x: auto` only. **Why:** ERP tables are borderless-outer. **Lint:**
  review.
- **`rule/table-cell-padding-align`** — *Do:* cell padding **8px top/bottom**; align
  **middle** — **unless** any column has ≥3 lines, then the **whole table** aligns
  **top**. **Why:** the golden padding/align rule (`docs/table-design.md`). **Lint:**
  review.
- **`rule/table-default-sort-alpha`** — *Do:* named-entity tables default to
  **alphabetical by name**. (Transactional logs may default newest-first.) **Why:**
  predictable scanning. **Lint:** review.
- **`rule/table-sortable-columns`** — *Do:* every column sortable via hover-header
  icon → `MpPopover`; give it a `sortType`. **Why:** uniform sort affordance.
  **Lint:** review.
- **`rule/table-name-link-span`** — *Do:* a clickable name in a cell is a **`<span>`
  styled as a link** (`text.link` + hover underline). *Don't:* use `MpTextlink`.
  **Why:** row link ≠ inline text link. **Lint:** review.
- **`rule/table-accordion-row-click`** — *Do:* an accordion row expands on click
  **anywhere in the row**, not only the chevron. **Why:** larger hit target. **Lint:**
  review.
- **`rule/table-form-cell-no-border`** — *Do:* inputs/selects inside a cell have
  **no own border**; the border comes from the cell; focus shows an **inset** shadow
  on the cell. **Why:** form-in-table reads as a grid, not stacked inputs. **Lint:**
  review.
- **`rule/table-nonform-bg-gray`** — *Do:* if a table has a form column, non-form
  columns get bg `background.neutral.subtle`. **Why:** separates editable from
  read-only. **Lint:** review.
- **`rule/table-form-header-white`** — *Do:* a form-table `thead` has white bg and
  no left/right border on `th`. **Lint:** review.
- **`rule/table-merged-row-borders`** — *Do:* `rowspan`/merged cells get left/right
  borders on all columns, no double border, no outer border on edge columns. **Lint:**
  review.

## Surfaces, cards & spacing — source: `docs/patterns/pixel-enterprise-overrides.md`

- **`rule/surface-border-no-shadow`** — *Do:* cards/boxes use a **1px border**
  (`border.*`). *Don't:* drop-shadow a surface (inset focus ring is fine; a real
  floating overlay may keep one with a `pixel-police-allow-shadow` comment). **Why:**
  Enterprise surfaces are flat. **Lint:** pixel-police.
- **`rule/surface-no-double-pad`** — *Do:* a `pageRegistry` page must not add its own
  outer padding — `.stage` already gives 24px. **Why:** avoids doubled gutters.
  **Lint:** review.

## Drawers — source: `docs/patterns/Drawer.md`

- **`rule/drawer-custom-shell`** — *Do:* build drawers as a **hand-rolled Teleport
  overlay** (copy `BillsFiltersDrawer.vue`). *Don't:* use Pixel `MpDrawer` — it has
  no structural CSS in this build (header/footer detach). **Why:** MpDrawer renders
  broken here. **Lint:** pixel-police.
- **`rule/drawer-header-fill`** — *Do:* the drawer header has a **background fill**;
  the panel has **no box-shadow**. **Lint:** review.
- **`rule/drawer-open-via-manage`** — *Do:* a drawer opens **only** via a **Manage**
  button; a section toggle must not auto-open it. **Lint:** review.

## Detail pages — source: `docs/patterns/details-page-format.md`

- **`rule/detail-contentlist`** — *Do:* key/value pairs on a detail page use
  **`ContentList`**. **Why:** one key/value renderer. **Lint:** review.
- **`rule/detail-breadcrumb-no-gap`** — *Do:* the breadcrumb sits **directly above**
  the title, `gap: 0`. **Lint:** review.

## Empty & feedback — source: `docs/patterns/Toast.md`, `docs/empty-state.md`

- **`rule/empty-state-structure`** — *Do:* an empty state = illustration + title +
  caption + a **secondary-variant** button. **Lint:** review.
- **`rule/skeleton-solid-static`** — *Do:* loading skeletons are **solid and static** —
  **no shimmer gradient, no animation**. Every `<MpSkeleton>` gets **`duration="0s"`**
  and the flattening class (`.erp-skeleton` in `ErpTablePage`, `.cw-skeleton` in Cowork):
  `background-image: none` + `background-color: var(--mp-border-default)` +
  `animation: none`. *Don't:* leave Pixel's default animated shimmer gradient. **Why:**
  the ERP reads as calm/enterprise — motion and gradients are visual noise while loading.
  **Source:** `docs/patterns/ErpTablePage.md` › Skeleton. **Lint:** review.
- **`rule/skeleton-3-rows`** — *Do:* a first-load skeleton shows **exactly 3** placeholder
  rows/bars (in a table, 3 rows × one bar per column), then flips to content — via
  **`ErpTablePage :loading`** (which also appends 3 skeleton rows below existing data on a
  pagination change). *Don't:* show a spinner over blank space, a full page of skeleton
  rows, or a different count. **Why:** 3 rows signal "loading" without faking the result
  size; one consistent loading state everywhere. **Source:** `docs/patterns/ErpTablePage.md`
  › Skeleton, `docs/patterns/index-page-format.md`. **Lint:** review.
- **`rule/toast-use-mptoast`** — *Do:* **every** toast is a Pixel **`MpToast`**, raised
  through `toast.notify()` or the `~/utils/toasts` helpers (`successToast` / `infoToast` /
  `errorToast` / `greetingToast`), with a **single `<MpToastManager />`** mounted once
  (app.vue / the `/pixel` shell). Variants are exactly the three Pixel ships —
  **`success | error | greeting`** — plus the project's **`info`** helper (a `greeting`
  toast with a hand-drawn blue info icon via the `render` slot, since Pixel has no info
  variant). *Don't:* hand-roll a toast/snackbar `<div>`, pull in another toast library, or
  invent a variant. **Why:** one toast system — on-brand, consistent position (top-center)
  and duration (3s). **Lint:** review.
- **`rule/toast-success-only`** — *Do:* use a toast to confirm an action **succeeded**
  (`success`) or surface **neutral status / info** (`info`) — pairs with
  `rule/form-errors-inline`. The **`error`** variant is reserved for **system / async
  failures** the user can't fix at a field (server/network — "Server error, please try
  again"). *Don't:* toast a **form/field validation** error — those are always **inline**
  (`rule/form-errors-inline`). **Why:** confirmations belong in a transient toast; the fix
  for a bad field belongs next to the field. **Lint:** review.

## Theme, type & tokens — source: `DESIGN.md`, `docs/patterns/pixel-enterprise-overrides.md`

- **`rule/theme-enterprise`** — *Do:* always the **Enterprise** theme + token v2.4
  (`setProductTheme('enterprise')`, `setNextTheme(true)` in `app.vue`). *Don't:* use
  non-Enterprise components or manually override tokens. **Why:** one theme. **Lint:**
  review.
- **`rule/type-14-default`** — *Do:* body/default text is **14px regular**; 12px is
  **captions only**. **Lint:** review.
- **`rule/type-no-italic`** — *Do:* de-emphasize with smaller size + secondary color;
  emphasize with weight. *Don't:* use **any** italic — no `font-style: italic`,
  `<i>`, or `<em>`, anywhere (notes, captions, hints, disclaimers). **Why:** italic
  is off-system in this ERP. **Lint:** pixel-police.
- **`rule/format-idr`** — *Do:* format money as IDR per `docs/patterns/currency-format.md`.
  **Lint:** review.
- **`rule/format-date`** — *Do:* table timestamps `23/06/2026, 15:30`; non-table
  `23 Jun 2026, 15:30` (helper `app/utils/date.ts`, see `docs/patterns/date-format.md`).
  **Lint:** review.
- **`rule/badge-status-mapping`** — *Do:* map statuses to badge intents per the
  `MpBadge` table in `DESIGN.md`; use `ErpStatusBadge`. **Why:** consistent status
  color semantics. **Lint:** review.
- **`rule/style-with-css`** — *Do:* style native tags and one-off overrides with the
  Pixel **`css()`** utility. Spacing / radius / font-size **tokens work** (`px: '3'`,
  `rounded: 'full'`, `fontSize: 'md'`). **Build caveat:** this pulled Pixel build leaves
  the short semantic **color** tokens empty (`border.subtle`, `text.secondary`, …), so
  for colors pass the fully-qualified var + hex fallback inside css() — e.g.
  `borderColor: 'var(--mp-colors-border-default, #e3e7e9)'` (using a bare `'border.subtle'`
  renders black). *Don't:* hand-roll a scoped `<style>` with custom classes + hardcoded
  values for Pixel-shaped UI. Layout wrappers may use `MpFlex` / CSS-props. **Why:**
  css() keeps styling on the design system; the var-fallback works around the broken
  aliases. **Source:** docs.mekari.design css() + css-props guides. **Lint:** review.
- **`rule/token-no-hardcoded-color`** — *Do:* colors come from `var(--mp-color-*)` /
  Pixel token keys. *Don't:* hardcode hex/rgb/hsl. **Lint:** pixel-police.
- **`rule/token-no-hardcoded-spacing`** — *Do:* spacing/sizing from
  `var(--mp-spacing-*)` / `var(--mp-size-*)`. *Don't:* hardcode `px`. **Lint:**
  pixel-police.
- **`rule/token-pixel3-only`** — *Do:* import from `@mekari/pixel3` only. **Lint:**
  pixel-police.
- **`rule/token-no-raw-html`** — *Do:* use `Mp*` components (or a sanctioned
  `.btn-enterprise` button); no raw `<button>/<input>/<select>/<textarea>`. **Lint:**
  pixel-police.

## Copy & terminology — source: `docs/patterns/`, `app/data/translations.ts`

- **`rule/copy-vendor-not-supplier`** — *Do:* say **"Vendor"**. *Don't:* Supplier /
  Pemasok. **Lint:** review.
- **`rule/copy-number-not-id`** — *Do:* label identifiers **"… number"**. *Don't:*
  "… ID". **Lint:** review.
- **`rule/copy-add-noun-only`** — *Do:* a create button uses the **Pixel `add`
  icon** (`left-icon="add"`) — never a literal "+" in the text — with the label
  **"New <entity>"** in English (e.g. `[add] New contact`) or the **noun only** in
  Indonesian (`Barang keluar`). Combobox inline-create uses `Tambah <noun>`. *Don't:*
  type a "+" character, or use "baru" on add buttons. **Lint:** review. Relates to
  `rule/icon-pixel-library`.
- **`rule/copy-id-translations`** — *Do:* all strings live in
  `app/data/translations.ts` (English key → Indonesian value) via `t()`. **Lint:**
  review.

---

## Patterns — Filter bar (index pages) — source: `docs/patterns/ErpFilterBar.md`

The filter bar is a fixed composite. It never varies in structure — only in which
filters appear on the left.

- **`rule/filter-bar-anatomy`** — *Do:* lay the bar out as **left group | right
  group**, split with `justify-content: space-between`. **Left** = inline dropdown
  filters + an **"All filters"** button. **Right** = the icon tool group **then**
  search (search is always the rightmost element). *Don't:* reorder these, put search
  on the left, or mix tools into the left group. **Why:** every list page reads the
  same. **Lint:** review.
- **`rule/filter-bar-left-gap`** — *Do:* in the left group, the gap between filters
  and the **All filters** button — and between two filters — is always **16px**
  (`gap: var(--mp-spacing-4)`). **Lint:** review.
- **`rule/filter-bar-search-pill`** — *Do:* the search field is a **rounded pill**,
  the **rightmost** element of the right group, with a leading search icon and a
  clear (×) shown only when it has a value. *Don't:* use a square input or move it.
  **Lint:** review.
- **`rule/filter-bar-all-filters-drawer`** — *Do:* filters that don't fit as inline
  dropdowns live behind an **"All filters"** button (left group) that opens the
  filters **drawer** (`rule/drawer-custom-shell`, opened via this button per
  `rule/drawer-open-via-manage`). *Don't:* overflow the bar with many inline selects.
  **Lint:** review.

Also governing the filter bar: `rule/filter-bar-search-export` (Search + Export
always present), `rule/filter-bar-icon-group` (AI · column settings · export = ghost
icon `MpButtonGroup` + tooltips), `rule/select-erpfilterselect` (filters use
`ErpFilterSelect`, never a native `<select>`).

## Adding a rule

A rule belongs here only when it's a **repeated** decision (came up in review more
than once), it's **observable**, and it has a **reason**. When you find a new
recurring "the agent always gets this wrong" case:

1. Add a `rule/<id>` here with Do/Don't + Why + Source.
2. If it's mechanically grep-able, add a check to `pixel-police.sh` that cites the ID.
3. Link it from the relevant `docs/patterns/*` doc.
