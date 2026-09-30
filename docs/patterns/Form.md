# Form

**Pixel components**: `MpFormControl`, `MpFormLabel`, `MpInput`, `MpTextarea`, `MpAutocomplete` (via `ErpFilterSelect`), `MpDatePicker`, `MpCheckbox`, `MpRadio`, `MpToggle`, `MpFormErrorMessage`
**Purpose**: Standard layout and field anatomy for create/edit forms in the ERP.

> ⚠️ There is no custom `ErpForm` component. Forms are **composed** from Pixel
> form primitives following the rules below. If a reusable form wrapper is built
> later, document it here and note it for the Pixel team.

---

## Layout rules

| Rule | Value |
|---|---|
| Max form width | `558px` (6-column Pixel grid) — fields must not exceed this |
| Column gap | `6` (`MpFlex gap="6"`) between fields (horizontal, same row) |
| Row gap | **`20px`** (`--mp-spacing-5`) between stacked fields — the standard vertical spacing for every form / filter drawer. |
| Stage padding | `24px` (see `DESIGN.md` → Layout) |
| Action group | Always **last**, **right-aligned** within the form width; primary + ghost `Cancel` (see [Button.md](Button.md)). No border-top divider above it. |
| Page title | Set via `useNavigation()` on mount |

### Field widths (6-column grid)

Within the 558px / 6-column form, **the default is to stack every field vertically**
(20px between rows). Fields are placed **side-by-side only when explicitly requested** —
never auto-paired.

- **Full-width (span 6)**: text inputs, textareas, and multi-select toggle lists.
- **Half-width (span 3)**: **selects / `MpAutocomplete`** and the **`MpUpload`
  attachment field** — a select renders at ~267px on **its own row** (stacked), NOT
  stretched full-width. Do **not** pair two selects on one row unless asked.

### Character counters

- A **name** input has a **60-char counter** (`n/60`); a **description** textarea has a
  **250-char counter** (`n/250`). The counter is right-aligned on the label row (see
  `rule/input-char-counter`).

### Toggle field

- A single toggle is **label + `MpToggle` together** (small gap), not spread
  space-between across the form. The bordered "multi-select toggle list" pattern below
  is a different control (a list of options), not a lone toggle field.

### Multi-select toggle list (Sources / Output / …)

When a field is "pick any of these" (e.g. which sources a task may read, which
outputs it produces), render a **plain list of `MpToggle` rows — NOT a bordered
box**: label on the left, `MpToggle` on the right, rows separated by a
`border-bottom` only (no outer border, radius, or fill). An inline
`+ Add …` action (e.g. `Add connection`) sits as the last row, styled as a text
link. Live reference: [CoworkTaskEditPage.vue](../../app/components/pages/CoworkTaskEditPage.vue).

---

## Field anatomy

Every field that needs a label, help text, or validation is wrapped in
`MpFormControl`:

```vue
<MpFormControl id="email" :is-error="isError" is-required>
  <MpFormLabel>Email</MpFormLabel>
  <MpInput id="email-input" v-model="email" type="email" placeholder="name@company.com" />
  <MpFormErrorMessage>Email is required</MpFormErrorMessage>
</MpFormControl>
```

**Rules**
- Do not skip `MpFormControl` when the field needs validation or error messaging.
- Keep label, help text, and error message explicit and close to the field.
- Verify uncertain props with `get-component("ComponentName")` before using them.

---

## Error message copy

Form error messages must follow the UXW library. When exact UXW copy is not
available in the local repo, use the ERP fallback patterns below and confirm
with UXW before shipping production copy.

Rules:

- keep the message close to the affected field, cell, or table;
- make the message actionable;
- mention the field/object the user must fix;
- use sentence case;
- keep it short;
- do not use technical/internal terms;
- do not use vague copy such as `Invalid`, `Required`, `Error`, or `Something went wrong`;
- do not use toast for visible field-level errors.

Fallback copy patterns:

| Case | Pattern | Example |
|---|---|---|
| Required select | `You must select {field}` | `You must select warehouse` |
| Required text/input | `You must fill in {field}` | `You must fill in warehouse name` |
| Required at least one item | `You must select at least one {object}` | `You must select at least one receiving task` |
| Required table row/item | `You must add at least one {object}` | `You must add at least one product` |
| Required quantity before action | `Enter {quantity} first` | `Enter counted qty first` |
| Cross-field rule | `{Field A} and {field B} must be different` | `Origin and destination warehouse must be different` |
| Limit exceeded | `{Object} cannot exceed {limit}` | `Transfer qty cannot exceed available stock` |
| Batch/serial completion | `Enter all {items} for "{object}" ({actual}/{expected} entered)` | `Enter all serial numbers for "USB Cable" (2/5 entered)` |

Punctuation follows UXW. Do not copy toast punctuation rules automatically into
form errors; inline form errors are often short field messages.

Use the right surface:

- field-level error → `MpFormErrorMessage`;
- form-table cell error → cell state + tooltip/inline caption;
- aggregate table/form error → inline text near the table/form section;
- blocking explanation → modal.

---

## Field type → Pixel component

| UI need | Component | Notes |
|---|---|---|
| Text input | `MpInput` in `MpFormControl` | Add label, help text, error state explicitly |
| Multi-line text | `MpTextarea` in `MpFormControl` | Keep validation close to the field |
| Select / dropdown | `ErpFilterSelect` (wraps `MpAutocomplete`) | **Never `MpSelect`/native `<select>`** (`rule/select-erpfilterselect`). Resting height + border match `MpInput` (`rule/select-field-metrics`); focus = **bold neutral border** — see ⚠️ below |
| Select with tags | `MpInputTag` | Verify props/slots |
| Date | `MpDatePicker` in `MpFormControl` | Verify formatting and value contract |
| Checkbox / radio / toggle | `MpCheckbox`, `MpRadio`, `MpToggle` | Preserve accessible labels and state |

---

## Every input has a focus/active state — NO EXCEPTIONS ⚠️

**Any** typeable/selectable control — `MpInput`, `MpTextarea`, `ErpFilterSelect`/`MpAutocomplete`, and
every **custom-styled field** (search boxes, filter-bar search, the two-pane
drawer search, combobox triggers) — MUST show a visible focus/active state. The
canonical treatment across the ERP is the **bold neutral border**: `#8c9596`
(Gray/Slate400) border + a 1px ring of the same colour, applied on
`:focus-within`. A field with no focus state (a flat border that never changes
on focus) is a bug — match the surrounding module.

- For custom search boxes the shared rule lives in `app/assets/css/erp.css` —
  one selector list drives every module's search focus ring:
  `.filter-search`, `.pr-filter-search`, `.rcvgd-search-wrap`, `.cw-search`,
  `.sad-search` all get `…:focus-within { border-color:#8c9596; box-shadow:0 0 0
  1px #8c9596 }`. When you add a new custom search/input wrapper, **add its class
  to that list** rather than re-styling focus per component.
- Pixel inputs (`MpInput`/`MpTextarea`) already ship this; don't override.
- `ErpFilterSelect` / `MpAutocomplete` already carry the neutral focus **and** the
  MpInput-matching resting border/height (`rule/select-active-neutral`,
  `rule/select-field-metrics`); don't re-style focus per component.

## Select active/focus border ⚠️ (recurring mistake)

Every select's **active/open (focus) state shows a clearly bold neutral border**
(`#8c9596` = Gray/Slate400 + a 1px ring of the same colour) — the same treatment
as `MpInput`/`MpTextarea` focus (`rule/select-active-neutral`,
`rule/form-focus-border-bold`). Its **resting** height (38px) + border
(`--mp-colors-border-form`) also match `MpInput` (`rule/select-field-metrics`).
`ErpFilterSelect` / `MpAutocomplete` ship all of this — do **not** re-solve it per
component, and never fall back to a native `MpSelect` to "get native focus".

## Checkbox / radio label gap & alignment ⚠️ (recurring mistake)

`MpCheckbox` / `MpRadio` **already render their own 12px control-to-label gap**
internally (an empty `mp-checkbox__label` / `mp-radio__label` slot sits after the
control). When you place the label text in a sibling `<span>`, the wrapper's own
`gap` **stacks on top** → a double 24px gap.

- **Wrapper `gap: 0`.** Never add `gap` (or `spacing-2`) between the control and an
  external label — the built-in 12px is the whole gap. (Same rule already noted in
  `ColumnSettingsMenu.vue` and `EditClassificationModal.vue`.)
- **Anything revealed *below* a checkbox/radio** (a dependent field, a sub-list,
  an "Add …" button) must line up **with the label text, not the control** —
  indent it by `calc(var(--mp-sizes-5) + var(--mp-spacing-3))` (control width 20px
  + the 12px gap = 32px). Applies to a sub-account's Parent-account field, the
  Selected-users / Selected-roles list, etc.

## "Selected items" list (users / roles / …)

A committed selection under a radio is a **plain list, not a bordered table/box**:
each row = name (with a secondary subtitle line beneath it, e.g. the user's roles)
+ a remove control (`minus-circular`) at the right, rows separated by a
`border-bottom` only (no outer border, no radius). The remove icon shows a
`Remove` tooltip on hover.

## Two-pane "Select …" drawer (`SelectAccessDrawer`)

- Both panes carry a search box; **20px gap** from the search box to the list
  header below it.
- List headers are **`<h3>`** (20px semibold) — the drawer title is the `<h2>`, so
  the two column headers sit one level below it: left = the noun (`Users` / `Roles`)
  with an `Add all` link; right = `Selected users (n)` / `Selected roles (n)` with
  a `Remove all` link. Right pane shows the illustration empty state until
  something is selected.
- List rows are a **fixed 36px** min-height so revealing the add/remove control on
  hover never shifts the row. Add control = `add` icon (not `add-circular`).

---

## Select

The control is **`ErpFilterSelect`** (the ERP wrapper around `MpAutocomplete`): a
form-pill trigger + a Pixel `MpPopover` option list (`use-portal`, so the menu
never clips) — never the browser-native option list. **Never `MpSelect` or a
native `<select>`** (`rule/select-erpfilterselect` — pixel-police fails the build
on either). Its resting height + border match `MpInput` (`rule/select-field-metrics`).
Used for all selects, including the index-page filter bar's **quick filters**.
Full detail: [pixel-enterprise-overrides.md › Dropdowns](pixel-enterprise-overrides.md)
and [ErpFilterBar.md](ErpFilterBar.md).

### Active / selected option = BG FILL (not green text)

The currently-selected option in ANY `MpPopover` dropdown must render with the
**native `MpPopoverListItem :is-active` style: a `--mp-background-neutral-subtle`
background fill** (`rgb(248,249,249)`), default text colour, normal weight. Do
**not** hand-roll custom option buttons that only turn the text green — that is
wrong. Always use `<MpPopoverList><MpPopoverListItem :is-active="…">` so the fill
comes for free. If a control can't use `MpPopoverListItem` (e.g. the
[AdvancedDateRangePicker](AdvancedDateRangePicker.md) preset sidebar), replicate
exactly: `background: var(--mp-background-neutral-subtle)` + default text.

### ⚠️ Quick-filter rules (filter bar) — get these right

A quick filter defaults to **show-all**, but show-all is **not** an option:

1. **Placeholder = the filter name** (`Status`, `Category`) — **NOT** "All status" /
   "All category". Shown while nothing is selected (which means: show all).
2. **Dropdown options are the real values only** (`Open`, `Closed`, …). There is
   **no "All status" / "All category" entry** in the list.
3. Selecting a value filters the table. `ErpFilterSelect` then shows that value with a
   **clear `(×)`** on hover → clicking it resets the filter to show-all.
4. Default `model-value` is `''` (empty = show all); the `filterFn` treats empty as
   "no filter".

> **Max 2 quick filters per page.** When generating a filter bar, **always ask the
> user: which quick filters (max 2), and what options does each have?**

### Dropdown width & truncation

`ErpFilterSelect` handles this: pass `width` for the trigger (e.g. `176px`); the
menu uses `use-portal` + `is-adaptive-width` so it never clips and stays at least
as wide as the trigger. A long selected label truncates with `…` in the trigger
while the menu shows full option text. You do **not** hand-roll `MpPopover` +
`css({ minWidth… })` per select — that machinery lived here for the old, banned
`MpSelect` pattern.

### Example

Live reference: any index filter bar (e.g. [SalesOrdersPage.vue](../../app/components/pages/SalesOrdersPage.vue)).

```vue
<script setup lang="ts">
import { ref } from 'vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'

const value = ref('')   // '' = show all
const options = [        // real values only — NO "All status" entry
  { label: 'Open',   value: 'open'   },
  { label: 'Closed', value: 'closed' },
]
</script>

<template>
  <ErpFilterSelect
    id="status-filter"
    placeholder="Status"
    :model-value="value"
    :options="options"
    @update:model-value="v => (value = v)"
  />
</template>
```

> `ErpFilterSelect` is the sanctioned wrapper; for a type-to-filter (searchable)
> variant use `MpAutocomplete` with `is-searchable`. Verify props via
> `get-component("MpAutocomplete")` / `get-component("MpPopover")` before finalizing.

---

## Line-items table in a form

Some forms embed an **editable line-items table** — e.g. the **Create purchase
receiving** page (`CreatePurchaseReceivingPage.vue`), where the user narrows the SKU
scope, edits storage locations, and removes rows.

Input/select cell specs live in [FormTable.md](FormTable.md). Do not duplicate
editable table-cell dimensions, focus states, or select trigger rules here.

This table follows the **progressive-loading** model, identical to detail-page line
items — see [ErpPagination.md → Progressive pagination](ErpPagination.md#progressive-pagination-infinite-scroll).

- **Show 10 by default** (`PAGE_SIZE = 10`); the next 10 auto-load on scroll via an
  `IntersectionObserver`; a `Showing N of N` row sits below.
- **Outside border is conditional, not always-on.** Wrap the table in the bordered,
  internally-scrolling panel **only when it needs progressive loading** — i.e. when there
  are **more than 10 rows**. A short list (**≤ 10 rows**) renders **borderless** and grows
  naturally with no internal scroll.

  ```vue
  <script setup lang="ts">
  const PAGE_SIZE = 10
  // visibleItems = the filtered list before the page slice
  const isProgressive = computed(() => visibleItems.value.length > PAGE_SIZE)
  </script>

  <template>
    <!-- bind the modifier class — never hard-code it on -->
    <section class="pr-items-section" :class="{ 'pr-items-section--bordered': isProgressive }">
      …
    </section>
  </template>
  ```

  ```css
  .pr-items-section--bordered {
    border: 1px solid var(--mp-border-bold);
    border-radius: var(--mp-radii-lg);
    overflow: hidden;               /* give the panel flex-shrink: 0 in a flex column */
  }
  /* count row divider only inside the bordered panel */
  .pr-items-section--bordered .pr-items-count { border-top: 1px solid var(--mp-border-default); }
  ```

---

## Full form-page example

A create/edit form is wired via **`detailMatch`** in `app/pages/[...slug].vue`
(it has a dynamic `:id` route, or is a full-bleed `/new` route) — so **the page
owns its own layout and applies the 24px stage padding itself**; it is NOT a
`pageRegistry` page and must not rely on a shared `.stage` wrapper padding it.
See [page-title-bar.md](page-title-bar.md) for the title bar this page renders
above the form.

```vue
<script setup lang="ts">
import { MpFormControl, MpFormLabel, MpInput, MpButton, MpFlex } from '@mekari/pixel3'
</script>

<template>
  <div class="detail-page">
    <!-- Title bar: same 72px spec as page-title-bar.md, rendered by this page
         since detailMatch pages own their full layout (not the shell). -->
    <header class="page-title-bar">…title + breadcrumb…</header>

    <!-- Stage: THIS page supplies the 24px padding (var(--mp-spacing-6)) -->
    <div class="stage" style="padding: var(--mp-spacing-6)">
      <MpFlex direction="column" gap="6" style="max-width: 558px">
        <MpFormControl id="name" is-required>
          <MpFormLabel>Name</MpFormLabel>
          <MpInput id="name-input" placeholder="Example: John Doe" />
        </MpFormControl>

        <!-- Action group — always last -->
        <MpFlex gap="3">
          <MpButton variant="primary">Save</MpButton>
          <MpButton variant="ghost">Cancel</MpButton>
        </MpFlex>
      </MpFlex>
    </div>
  </div>
</template>
```

For the routing/trigger-phrase table (`/create-form-page` etc.), see
[page-recipes.md](page-recipes.md).
