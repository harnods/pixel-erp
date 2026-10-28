<script setup lang="ts">
/**
 * Bill of materials index — "All filters" drawer. A custom Teleport overlay (MpDrawer
 * has no structural CSS in this Pixel3 build — see LocationPriorityDrawer.vue for the
 * same pattern). Edits a local draft; only commits to the parent's filter refs on Apply,
 * so Cancel/close-outside discards in-progress edits.
 */
import { MpIcon, MpInput, MpAutocomplete, MpToggle, MpFormControl, MpFormLabel, MpButton } from '@mekari/pixel3'

export interface BomFiltersValue {
  keyword: string
  category: string
  costingReference: string
  finishedGoodId: string
  showArchived: boolean
}

const props = defineProps<{
  isOpen: boolean
  modelValue: BomFiltersValue
  categoryOptions: { id: string; name: string }[]
  costingOptions: { id: string; name: string }[]
  finishedGoodOptions: { id: string; name: string }[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: BomFiltersValue): void
}>()

const draft = reactive<BomFiltersValue>({ ...props.modelValue })
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, props.modelValue) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', { ...draft }); close() }
function clearAll() {
  draft.keyword = ''
  draft.category = ''
  draft.costingReference = ''
  draft.finishedGoodId = ''
  draft.showArchived = false
}
</script>

<template>
  <ErpDrawer :is-open="isOpen" title="All filters" @close="close">
    <template #body>
      <MpFormControl id="bf-filters-keyword-fc">
        <MpFormLabel>Keyword</MpFormLabel>
        <MpInput id="bf-filters-keyword" v-model="draft.keyword" placeholder="Search..." is-full-width />
      </MpFormControl>

      <MpFormControl id="bf-filters-category-fc">
        <MpFormLabel>Category</MpFormLabel>
        <MpAutocomplete
          id="bf-filters-category" v-model="draft.category" :data="categoryOptions"
          label-prop="name" value-prop="id" placeholder="Select category"
          is-searchable is-clearable use-portal is-full-width
        />
      </MpFormControl>

      <MpFormControl id="bf-filters-costing-fc">
        <MpFormLabel>Costing reference</MpFormLabel>
        <MpAutocomplete
          id="bf-filters-costing" v-model="draft.costingReference" :data="costingOptions"
          label-prop="name" value-prop="id" placeholder="Select costing reference"
          is-searchable is-clearable use-portal is-full-width
        />
      </MpFormControl>

      <MpFormControl id="bf-filters-fg-fc">
        <MpFormLabel>Finished goods</MpFormLabel>
        <MpAutocomplete
          id="bf-filters-fg" v-model="draft.finishedGoodId" :data="finishedGoodOptions"
          label-prop="name" value-prop="id" placeholder="Select finished goods"
          is-searchable is-clearable use-portal is-full-width
        />
      </MpFormControl>

      <div class="bf-filters-toggle-row">
        <span class="bf-filters-toggle-label">Show archived BOM</span>
        <MpToggle v-model:is-checked="draft.showArchived" aria-label="Show archived BOM" />
      </div>
    </template>

    <template #footer>
      <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="clearAll">Reset filter</MpButton>
      <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="apply">Apply</MpButton>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.bf-filters-toggle-row {
  display: flex; align-items: center; justify-content: space-between;
}
.bf-filters-toggle-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

</style>
