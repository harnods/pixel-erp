# Page Recipes

Standard page templates for ERP OS. Always use these before building anything custom.

---

## `/create-index-page`

**Trigger**: `/create-index-page`, "bikin index page", "create index page", "index page"

**Structure**:
```
ErpFilterBar  (full-width, flex row, filter controls via default slot)
ErpTablePage  (full-width, columns + rows props, cell slots for custom rendering)
```

**Required composable**: `useTableState(rows, { filterFn })` — handles search, filter, sort, pagination.

**Minimal scaffold**:
```vue
<script setup lang="ts">
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import { MpInputGroup, MpInputLeftAddon, MpInput, MpButton, MpIcon } from '@mekari/pixel3'

const columns: TableColumn[] = [
  { key: 'name',   label: 'Name',   width: '240px', sortable: true },
  { key: 'status', label: 'Status', width: '160px'                 },
]

const rawRows = computed(() => data.map(item => ({ ...item })))

const { search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, toggleSort } =
  useTableState(rawRows, {
    filterFn: (row, s) => row.name.toLowerCase().includes(s),
  })
</script>

<template>
  <ErpTablePage
    :columns="columns" :rows="paginated" :total="total"
    :current-page="currentPage" :per-page="perPage"
    :sort-key="sortKey" :sort-dir="sortDir"
    has-checkbox
    @page-change="setPage" @per-page-change="setPerPage" @sort="toggleSort"
  >
    <template #filters>
      <!-- see ErpFilterBar.md for customisation options -->
    </template>
    <template #actions>
      <MpButton variant="tertiary" size="sm" left-icon="more-vertical" aria-label="More actions" />
    </template>
  </ErpTablePage>
</template>
```

**Filter bar customisation** — see `docs/patterns/ErpFilterBar.md`.

---

## `/create-form-page`

**Trigger**: `/create-form-page`, "bikin form page", "create form page", "form page"

**Structure**:
```
Page title  (set via useNavigation on mount)
Stage       (white content area, flex column)
  └─ Form section (max 6 columns / 558px wide)
       └─ Action group (Submit + Cancel)
```

**Required composable**: `useNavigation()` — sets page title in the header bar.

**Rules**:
- Form fields must not exceed `max-width: 558px` (6-column Pixel grid)
- Always end with an Action Group (`MpButton variant="primary"` + `MpButton variant="tertiary"`)
- Use `MpFormControl` to wrap each field

**Minimal scaffold**:
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

---

## `/create-detail-page`

**Trigger**: `/create-detail-page`, "bikin detail page", "create detail page", "detail page"

**Structure**:
```
Page title  (set via useNavigation on mount)
Stage       (white content area)
  └─ Detail sections (label / value pairs, grouped by topic)
       └─ Optional action buttons (Edit, Delete, Back)
```

**Minimal scaffold**:
```vue
<script setup lang="ts">
import { MpFlex, MpText, MpButton } from '@mekari/pixel3'

const { navigate } = useNavigation()
onMounted(() => navigate('Entity', 'Entity detail'))
</script>

<template>
  <MpFlex direction="column" gap="6" padding="6">
    <!-- Action row -->
    <MpFlex gap="3" justifyContent="flex-end">
      <MpButton variant="secondary" left-icon="edit">Edit</MpButton>
    </MpFlex>

    <!-- Detail section -->
    <MpFlex direction="column" gap="4">
      <MpText size="h3">General information</MpText>
      <MpFlex gap="4" wrap="wrap">
        <MpFlex direction="column" gap="1" style="min-width: 200px">
          <MpText size="body-small" color="text.secondary">Label</MpText>
          <MpText>Value</MpText>
        </MpFlex>
      </MpFlex>
    </MpFlex>
  </MpFlex>
</template>
```
