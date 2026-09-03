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
| Shipping only the populated success case | design every reachable state | `reachable-states.md` |

---

## Buttons — source: `docs/patterns/Button.md`

- **`rule/btn-cancel-ghost`** — *Do:* every button labelled Cancel / Close /
  Dismiss / Back / Keep editing uses the **ghost** variant. *Don't:* use secondary
  for Cancel. **Why:** dismiss is not an action; ghost keeps one visual action per
  screen. **Lint:** pixel-police (heuristic).
- **`rule/btn-secondary-black`** — *Do:* secondary button = **black/default text**
  (`text.default`) + **bold border** + **semibold**, on a neutral fill. *Don't:*
  use `text.secondary` (gray) for secondary button text. **Why:** ERP secondary is
  a real action, must read as clickable, not muted. **Lint:** review.
- **`rule/btn-ghost-regular`** — *Do:* ghost buttons use **regular** weight.
  **Why:** ghost is the lowest-emphasis action. **Lint:** review.
- **`rule/btn-one-primary`** — *Do:* exactly one primary action per screen/modal.
  **Why:** two primaries = no primary. **Lint:** review.
- **`rule/btn-always-pill`** — *Do:* every ERP button is pill-rounded
  (`is-rounded` / `radii-full`). **Why:** house shape. **Lint:** pixel-police
  (heuristic).
- **`rule/btn-no-sm`** — *Do:* use default button size. *Don't:* `size="sm"`
  unless the task explicitly asks (dense table/bulk bars are the only exception).
  **Why:** consistent control height. **Lint:** review.
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

- **`rule/select-erpfilterselect`** — *Do:* all dropdowns/filters use
  **`ErpFilterSelect`** (an `MpPopover` menu, clearable). *Don't:* use a native
  `<select>` **or** Pixel `MpSelect` — both render the OS dropdown (off-system,
  clips in scroll containers). **Why:** on-system, consistent, clearable. **Lint:**
  pixel-police.
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
- **`rule/toast-success-only`** — *Do:* toast is for **success/info only** (pairs
  with `rule/form-errors-inline`). **Lint:** review.

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
- **`rule/copy-add-noun-only`** — *Do:* `+` / create titles use the **noun only**
  (`+ Barang keluar`); combobox inline-create uses `Tambah <noun>`. *Don't:* "baru"
  on add buttons. **Lint:** review.
- **`rule/copy-id-translations`** — *Do:* all strings live in
  `app/data/translations.ts` (English key → Indonesian value) via `t()`. **Lint:**
  review.

---

## Adding a rule

A rule belongs here only when it's a **repeated** decision (came up in review more
than once), it's **observable**, and it has a **reason**. When you find a new
recurring "the agent always gets this wrong" case:

1. Add a `rule/<id>` here with Do/Don't + Why + Source.
2. If it's mechanically grep-able, add a check to `pixel-police.sh` that cites the ID.
3. Link it from the relevant `docs/patterns/*` doc.
