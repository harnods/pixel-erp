# ErpFilterBar

**File**: `app/components/patterns/ErpFilterBar.vue`  
**Purpose**: Layout container for filter controls on index pages.

> ⚠️ `MpFilterBar` does not exist in Pixel Enterprise yet. This is a custom pattern.

---

## Design Spec

| Property | Value |
|---|---|
| Display | `flex`, `align-items: center`, `flex-wrap: wrap` |
| Gap between items | `8px` |
| Padding | `12px 16px` |
| Border bottom | `1px solid var(--mp-border-default)` → `#e3e7e9` |

---

## Usage

`ErpFilterBar` is a **dumb layout container** — it only provides spacing and the border. All filter controls are passed via the default slot.

```vue
<ErpFilterBar>
  <!-- put MpInputGroup, MpSelect, MpButton here -->
</ErpFilterBar>
```

> In practice, `ErpFilterBar` is used via `ErpTablePage`'s `#filters` slot — you rarely need to use it standalone.

---

## Verbal Shorthand

When the user describes what should be in the filter bar, map their words to slot content. **Do not create a new component.**

| User says | What to put in the slot |
|---|---|
| "search only" | `MpInputGroup` + `MpInputLeftAddon` (search icon) + `MpInput` |
| "add status filter" | + `MpSelect` with status options after search |
| "add date filter" | + `MpDatePicker` after search |
| "add create button" | + `MpButton variant="primary" left-icon="add-circular" style="margin-left:auto"` |
| "hide the create button" | Remove the `MpButton` from slot |
| "search and create only" | `MpInputGroup` + `MpButton` with `margin-left:auto`, no selects |

---

## Standard Search Pattern

```vue
<template #filters>
  <MpInputGroup id="search" size="md">
    <MpInputLeftAddon id="search-addon">
      <MpIcon name="search" size="sm" />
    </MpInputLeftAddon>
    <MpInput
      id="search-input"
      v-model="search"
      placeholder="Example: name or number"
      is-clearable
      style="min-width: 240px; max-width: 320px"
    />
  </MpInputGroup>
</template>
```

## With Status Filter + Create Button

```vue
<template #filters>
  <MpInputGroup id="search" size="md">
    <MpInputLeftAddon id="search-addon">
      <MpIcon name="search" size="sm" />
    </MpInputLeftAddon>
    <MpInput id="search-input" v-model="search" placeholder="Example: ..." is-clearable
      style="min-width: 240px; max-width: 320px" />
  </MpInputGroup>

  <MpSelect id="status-filter" v-model="statusFilter" size="md">
    <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
      {{ opt.label }}
    </option>
  </MpSelect>

  <MpButton variant="primary" left-icon="add-circular" style="margin-left: auto">
    Create item
  </MpButton>
</template>
```
