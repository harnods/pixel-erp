# Form

**Pixel components**: `MpFormControl`, `MpFormLabel`, `MpInput`, `MpTextarea`, `MpSelect`, `MpDatePicker`, `MpCheckbox`, `MpRadio`, `MpToggle`, `MpFormErrorMessage`
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
| Select / dropdown | `MpSelect` | Active/focus state MUST show the **bold neutral border** — see ⚠️ below |
| Select with tags | `MpInputTag` | Verify props/slots |
| Date | `MpDatePicker` in `MpFormControl` | Verify formatting and value contract |
| Checkbox / radio / toggle | `MpCheckbox`, `MpRadio`, `MpToggle` | Preserve accessible labels and state |

---

## Every input has a focus/active state — NO EXCEPTIONS ⚠️

**Any** typeable/selectable control — `MpInput`, `MpTextarea`, `MpSelect`, and
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
- `MpSelect` needs the extra `!important` fix below (Pixel's default is too faint).

## MpSelect active/focus border ⚠️ (recurring mistake)

Every `MpSelect`'s **active/open (focus) state must show a clearly bold neutral
border** (`#8c9596` = Gray/Slate400, plus a 1px ring of the same colour) — the
same treatment as `MpInput`/`MpTextarea` focus. The Pixel `@latest` default
renders only a faint ~16%-alpha hairline that stays thin even when open.

- The global fix lives in `app/assets/css/erp.css` and targets
  `.mp-select__root:focus-within .mp-select__control`, plus the open-popover
  states `[aria-expanded="true"]` / `[data-state="open"]`, with `!important`
  (Pixel ships a layered `!important` that otherwise wins). **Do not** re-solve
  this per component.
- Prefer a **plain `MpSelect`** with real `<option>`s (native focus keeps the
  bold border). If you wrap `MpSelect` inside an `MpPopover` trigger, the popover
  steals focus and the border reverts to the thin default — avoid that for form
  selects.

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
- List headers are **`<h2>`** (20px semibold): left = the noun (`Users` / `Roles`)
  with an `Add all` link; right = `Selected users (n)` / `Selected roles (n)` with
  a `Remove all` link. Right pane shows the illustration empty state until
  something is selected.
- List rows are a **fixed 36px** min-height so revealing the add/remove control on
  hover never shifts the row. Add control = `add` icon (not `add-circular`).

---

## Select

The control is an **`MpSelect`**; its dropdown is an **`MpPopover`** (options via
`MpPopoverList` / `MpPopoverListItem`) — not the browser-native option list. Used
for all selects, including the index-page filter bar's **quick filters**.

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
3. Selecting a value filters the table. The `MpSelect` then shows that value with a
   **clear `(x)`** (`is-clearable`) → clicking it resets the filter to show-all.
4. Default `model-value` is `''` (empty = show all); the `filterFn` treats empty as
   "no filter".

> **Max 2 quick filters per page.** When generating a filter bar, **always ask the
> user: which quick filters (max 2), and what options does each have?**

### Dropdown width rule

Goal: the dropdown is **as wide as the `MpSelect`**, and **hugs its content**
(grows) only when an option is longer than the select.

Pin it on `MpPopoverContent` via Pixel `css()`:

```ts
css({ minWidth: '160px', width: 'max-content', maxWidth: '320px' })
//        ▲ = select width        ▲ hug/grow        ▲ cap very long options
```

- `minWidth` = the select's width → dropdown never narrower than the trigger.
- `width: 'max-content'` → hugs the longest option (grows past the select when needed).
- `maxWidth` → optional cap.

**Trigger width:** the `MpSelect` itself is **fixed width** (e.g. `160px`). When the
selected label is longer than that, **truncate it with `…`** —
`css({ width: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })`.
The dropdown still shows the full option text (it's `max-content`). Don't let the
trigger grow for one long option.

> Note: these `css()` classes land on the **inner `<select>`** (which has no scoped
> `data-v` attribute), so style the select via `css()` — scoped CSS / a plain
> `class=""` won't reliably reach it.

> Pixel's `MpPopover` has an `is-adaptive-width` prop ("min-width same as the
> trigger"). In practice it applies `min-width: 100%`, which equals the trigger
> **only** when the content is positioned directly inside it. When the popover is
> portaled / anchored against a wider container, `100%` resolves to that container
> (the dropdown goes full-width). So **pin `minWidth` to the select width
> explicitly** as above rather than relying on `is-adaptive-width`.

### Gotchas

- **Native dropdown**: `MpSelect` renders a real `<select>`. Add `@mousedown.prevent`
  on it so the browser-native list never opens — the click still bubbles to
  `MpPopoverTrigger` and opens the popover.
- **Label display**: give the `MpSelect` a single `<option v-if="value">` for the
  current value so it shows the label; when empty it falls back to the placeholder.
- **`MpPopoverTrigger` accepts exactly ONE child node** — do **not** put a comment or
  any sibling inside `<MpPopoverTrigger>`, or the trigger **silently fails to render**
  (only the popover content appears, the select disappears). Keep comments *outside* it.
- Using `MpSelect` as the trigger logs a harmless `[MpPopoverTrigger] Only 1 node
  allowed` warning (MpSelect renders a multi-node root). The trigger still works and
  the width/position are correct — it's safe to ignore. (To silence it entirely you'd
  swap `MpSelect` for a single-element select-styled button.)

### Example

Live reference: [SalesOrdersPage.vue](../../app/components/pages/SalesOrdersPage.vue) (filter bar).

```vue
<script setup lang="ts">
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'

const value = ref('')   // '' = show all
const options = [        // real values only — NO "All status" entry
  { label: 'Open',                value: 'open'                },
  { label: 'Partially processed', value: 'partially processed' },
  { label: 'Closed',              value: 'closed'              },
  { label: 'Voided',              value: 'voided'              },
]
const selectedLabel = computed(() => options.find(o => o.value === value.value)?.label ?? '')
</script>

<template>
  <!-- any comment goes OUTSIDE MpPopoverTrigger -->
  <MpPopover id="status-filter" is-close-on-select>
    <MpPopoverTrigger>
      <MpSelect
        id="status-select"
        placeholder="Status"
        :model-value="value"
        is-clearable
        :class="css({ width: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })"
        @mousedown.prevent
        @clear="value = ''"
      >
        <option v-if="value" :value="value">{{ selectedLabel }}</option>
      </MpSelect>
    </MpPopoverTrigger>

    <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', maxWidth: '320px' })">
      <MpPopoverList>
        <MpPopoverListItem
          v-for="opt in options"
          :key="opt.value"
          :is-active="opt.value === value"
          @click="value = opt.value"
        >
          {{ opt.label }}
        </MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</template>
```

> Verify the live `MpSelect` / `MpPopover` props with
> `get-component("MpSelect")` / `get-component("MpPopover")` before finalizing.

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

```vue
<script setup lang="ts">
import { MpFormControl, MpFormLabel, MpInput, MpButton, MpFlex } from '@mekari/pixel3'

const { navigate } = useNavigation()
onMounted(() => navigate('Entity', 'Create entity'))
</script>

<template>
  <MpFlex direction="column" gap="6" padding="6" style="max-width: 558px">
    <MpFormControl id="name" is-required>
      <MpFormLabel>Name</MpFormLabel>
      <MpInput id="name-input" placeholder="Example: John Doe" />
    </MpFormControl>

    <!-- Action group — always last -->
    <MpFlex gap="3">
      <MpButton variant="primary">Save</MpButton>
      <MpButton variant="tertiary">Cancel</MpButton>
    </MpFlex>
  </MpFlex>
</template>
```

> For the full form-page recipe (page title, stage, action group), see
> [page-recipes.md](page-recipes.md) → `/create-form-page`.
