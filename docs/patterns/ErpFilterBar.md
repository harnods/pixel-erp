# ErpFilterBar

**File**: `app/components/patterns/ErpFilterBar.vue`  
**Purpose**: Layout container for filter controls on index pages.

> ⚠️ `MpFilterBar` does not exist in Pixel Enterprise yet. This is a custom pattern.

---

## ⚠️ Two different "filter bars"

There are **two** filter-bar containers in this codebase. Know which you're using:

| | Standalone `ErpFilterBar.vue` | `ErpTablePage`'s internal `.erp-filter-bar` |
|---|---|---|
| When | Non-table pages, or used manually | **What index pages actually use** (via the `#filters` slot) |
| Display | `flex`, `align-items: center`, `flex-wrap: wrap` | `flex`, `align-items: center`, `justify-content: space-between` |
| Gap | `8px` (`var(--mp-spacing-2)`) | `12px` (`var(--mp-spacing-3)`) |
| Padding | `12px 16px` (`var(--mp-spacing-3) var(--mp-spacing-4)`) | `0` |
| Margin bottom | — | `var(--mp-spacing-5)` |
| Border bottom | `1px solid var(--mp-border-default)` | **none** |

For an index page (e.g. Sales Orders) you pass content into
`ErpTablePage`'s `#filters` slot — its internal wrapper handles layout. You do
**not** wrap that content in `ErpFilterBar`. The standalone component below is for
the rare non-table case.

---

## Design Spec (standalone `ErpFilterBar.vue`)

| Property | Value | Token |
|---|---|---|
| Display | `flex`, `align-items: center`, `flex-wrap: wrap` | — |
| Gap between items | `8px` | `var(--mp-spacing-2)` |
| Padding | `12px 16px` | `var(--mp-spacing-3) var(--mp-spacing-4)` |
| Border bottom | `1px solid var(--mp-border-default)` | — |

---

## Usage

`ErpFilterBar` is a **dumb layout container** — it only provides spacing and the border. All filter controls are passed via the default slot.

```vue
<ErpFilterBar>
  <!-- put MpInputGroup, MpSelect, MpButton here -->
</ErpFilterBar>
```

> In practice index pages use `ErpTablePage`'s `#filters` slot (the internal
> wrapper above), not this standalone component. See **Real index-page pattern**
> below for the markup actually used in `PurchaseInvoicesPage.vue`.

---

## Real index-page pattern

This is what `PurchaseInvoicesPage.vue` actually renders inside the `#filters`
slot — hand-rolled controls, **not** Pixel `MpInputGroup`. Mirror this for new
index pages (e.g. Sales Orders):

```vue
<template #filters>
  <!-- Left: status select + "All filters" pill -->
  <div class="filter-left">
    <div class="filter-select-wrap">
      <select class="filter-select" v-model="statusFilter">
        <option value="">Status</option>
        <option v-for="opt in statusOptions.slice(1)" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
      <!-- chevron svg -->
    </div>
    <button class="filter-all-btn"><!-- icon -->All filters</button>
  </div>

  <!-- Right: icon button group + pill search -->
  <div class="filter-right">
    <div class="filter-btn-group">
      <button class="filter-icon-btn filter-icon-btn--airene" @click="toggleAirene?.()"><!-- Airene --></button>
      <button class="filter-icon-btn"><!-- column settings --></button>
      <button class="filter-icon-btn"><!-- export --></button>
    </div>
    <div class="filter-search">
      <!-- search svg -->
      <input v-model="search" class="filter-search-input" placeholder="Search..." />
    </div>
  </div>
</template>
```

The `.filter-*` classes (`.filter-left`, `.filter-right`, `.filter-select-wrap`,
`.filter-all-btn`, `.filter-icon-btn`, `.filter-search`, …) are defined in the
page's own scoped `<style>` — copy them from `PurchaseInvoicesPage.vue`. The
left/right split works because the table's internal `.erp-filter-bar` uses
`justify-content: space-between`.

---

## Verbal Shorthand

> ⚠️ **Aspirational** — the Pixel `MpInputGroup`/`MpSelect`/`MpButton` mappings
> below are the intended Pixel-native pattern, but current pages hand-roll the
> controls shown in **Real index-page pattern** above. Prefer matching existing
> pages for consistency until the Pixel controls are adopted project-wide.

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

---

## Related

- [ErpTablePage.md](ErpTablePage.md) — the `#filters` slot lives here
- [page-recipes.md](page-recipes.md) — full index-page recipe
- [docs/README.md](../README.md) — docs home
