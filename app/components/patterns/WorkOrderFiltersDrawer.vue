<script setup lang="ts">
/**
 * Work orders index — "All filters" drawer. A custom Teleport overlay (MpDrawer
 * has no structural CSS in this Pixel3 build — see BillOfMaterialsFiltersDrawer.vue
 * for the same pattern). Edits a local draft; only commits to the parent's filter
 * refs on Apply, so Cancel/close-outside discards in-progress edits.
 */
import { MpButton, MpInput, MpAutocomplete, MpDatePicker, MpFormControl, MpFormLabel } from '@mekari/pixel3'

export interface WorkOrderFiltersValue {
  keyword: string
  type: string
  status: string
  startDate: string
  endDate: string
}

const props = defineProps<{
  isOpen: boolean
  modelValue: WorkOrderFiltersValue
  typeOptions: { id: string; name: string }[]
  statusOptions: { id: string; name: string }[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: WorkOrderFiltersValue): void
}>()

const draft = reactive<WorkOrderFiltersValue>({ ...props.modelValue })
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, props.modelValue) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', { ...draft }); close() }
function clearAll() {
  draft.keyword = ''
  draft.type = ''
  draft.status = ''
  draft.startDate = ''
  draft.endDate = ''
}
</script>

<template>
  <ErpDrawer :is-open="isOpen" title="All filters" @close="close">
    <template #body>
      <MpFormControl id="wf-filters-keyword-fc">
        <MpFormLabel>Keyword</MpFormLabel>
        <MpInput id="wf-filters-keyword" v-model="draft.keyword" placeholder="Search..." is-full-width />
      </MpFormControl>

      <MpFormControl id="wf-filters-type-fc">
        <MpFormLabel>Work order type</MpFormLabel>
        <MpAutocomplete
          id="wf-filters-type" v-model="draft.type" :data="typeOptions"
          label-prop="name" value-prop="id" placeholder="Select work order type"
          is-searchable is-clearable use-portal is-full-width
        />
      </MpFormControl>

      <MpFormControl id="wf-filters-status-fc">
        <MpFormLabel>Work order status</MpFormLabel>
        <MpAutocomplete
          id="wf-filters-status" v-model="draft.status" :data="statusOptions"
          label-prop="name" value-prop="id" placeholder="Select work order status"
          is-searchable is-clearable use-portal is-full-width
        />
      </MpFormControl>

      <MpFormControl id="wf-filters-start-fc">
        <MpFormLabel>Start date</MpFormLabel>
        <MpDatePicker
          id="wf-filters-start" v-model="draft.startDate"
          format="DD/MM/YYYY" value-type="format" placeholder="Select start date"
          is-clearable use-portal is-full-width
        />
      </MpFormControl>

      <MpFormControl id="wf-filters-end-fc">
        <MpFormLabel>End date</MpFormLabel>
        <MpDatePicker
          id="wf-filters-end" v-model="draft.endDate"
          format="DD/MM/YYYY" value-type="format" placeholder="Select end date"
          is-clearable use-portal is-full-width
        />
      </MpFormControl>
    </template>

    <template #footer>
      <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="clearAll">Reset filter</MpButton>
      <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="apply">Apply</MpButton>
    </template>
  </ErpDrawer>
</template>

<style scoped>
</style>
