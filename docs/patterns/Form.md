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
| Column gap | `6` (`MpFlex gap="6"`) between fields |
| Stage padding | `24px` (see `DESIGN.md` → Layout) |
| Action group | Always **last**, primary + tertiary buttons |
| Page title | Set via `useNavigation()` on mount |

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

## Field type → Pixel component

| UI need | Component | Notes |
|---|---|---|
| Text input | `MpInput` in `MpFormControl` | Add label, help text, error state explicitly |
| Multi-line text | `MpTextarea` in `MpFormControl` | Keep validation close to the field |
| Select / dropdown | `MpSelect` + `MpPopover` | See **Select** below — dropdown is a popover, not the native list |
| Select with tags | `MpInputTag` | Verify props/slots |
| Date | `MpDatePicker` in `MpFormControl` | Verify formatting and value contract |
| Checkbox / radio / toggle | `MpCheckbox`, `MpRadio`, `MpToggle` | Preserve accessible labels and state |

---

## Select

The control is an **`MpSelect`**; its dropdown is an **`MpPopover`** (options via
`MpPopoverList` / `MpPopoverListItem`) — not the browser-native option list. Used
for all selects, including the index-page filter bar's **quick filters**.

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
