<script setup lang="ts">
/**
 * Cycle counts / stock adjustments index — "All filters" drawer. Same custom Teleport
 * overlay pattern as BillOfMaterialsFiltersDrawer.vue (MpDrawer has no structural CSS
 * in this Pixel3 build). Edits a local draft; only commits to the parent's filter refs
 * on Apply, so Cancel/close-outside discards in-progress edits.
 */
import { MpInput, MpCheckbox, MpFormControl, MpFormLabel, MpButton } from '@mekari/pixel3'

export interface StockAdjustmentsFiltersValue {
  keyword: string
  warehouseIds: string[]
  assignees: string[]
  statuses: string[]
}

const props = withDefaults(defineProps<{
  isOpen: boolean
  modelValue: StockAdjustmentsFiltersValue
  warehouseOptions: { id: string; name: string }[]
  assigneeOptions: { id: string; name: string }[]
  statusOptions: { id: string; name: string }[]
  // Awaiting approval tabs only ever show "Counted" rows — no point offering the filter.
  showStatus?: boolean
}>(), {
  showStatus: true,
})
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: StockAdjustmentsFiltersValue): void
}>()

const draft = reactive<StockAdjustmentsFiltersValue>({ ...props.modelValue })
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, props.modelValue) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', { ...draft }); close() }
function clearAll() {
  draft.keyword = ''
  draft.warehouseIds = []
  draft.assignees = []
  draft.statuses = []
}
function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter(v => v !== id) : [...list, id]
}
function toggleDraftWarehouse(id: string) { draft.warehouseIds = toggle(draft.warehouseIds, id) }
function toggleDraftAssignee(id: string) { draft.assignees = toggle(draft.assignees, id) }
function toggleDraftStatus(id: string) { draft.statuses = toggle(draft.statuses, id) }
</script>

<template>
  <ErpDrawer :is-open="isOpen" title="All filters" @close="close">
    <template #body>
      <MpFormControl id="sa-filters-keyword-fc">
        <MpFormLabel>Keywords</MpFormLabel>
        <MpInput id="sa-filters-keyword" v-model="draft.keyword" placeholder="Search..." is-full-width />
      </MpFormControl>

      <MpFormControl id="sa-filters-warehouse-fc">
        <MpFormLabel>Warehouse</MpFormLabel>
        <div class="sa-filters-checkbox-list">
          <label v-for="opt in warehouseOptions" :key="opt.id" class="sa-filters-checkbox-item">
            <MpCheckbox
              :id="`sa-filters-wh-${opt.id}`"
              :is-checked="draft.warehouseIds.includes(opt.id)"
              @change="toggleDraftWarehouse(opt.id)"
            >
              {{ opt.name }}
            </MpCheckbox>
          </label>
        </div>
      </MpFormControl>

      <MpFormControl id="sa-filters-assignee-fc">
        <MpFormLabel>Assignee</MpFormLabel>
        <div class="sa-filters-checkbox-list">
          <label v-for="opt in assigneeOptions" :key="opt.id" class="sa-filters-checkbox-item">
            <MpCheckbox
              :id="`sa-filters-assignee-${opt.id}`"
              :is-checked="draft.assignees.includes(opt.id)"
              @change="toggleDraftAssignee(opt.id)"
            >
              {{ opt.name }}
            </MpCheckbox>
          </label>
        </div>
      </MpFormControl>

      <MpFormControl v-if="showStatus" id="sa-filters-status-fc">
        <MpFormLabel>Status</MpFormLabel>
        <div class="sa-filters-checkbox-list">
          <label v-for="opt in statusOptions" :key="opt.id" class="sa-filters-checkbox-item">
            <MpCheckbox
              :id="`sa-filters-status-${opt.id}`"
              :is-checked="draft.statuses.includes(opt.id)"
              @change="toggleDraftStatus(opt.id)"
            >
              {{ opt.name }}
            </MpCheckbox>
          </label>
        </div>
      </MpFormControl>
    </template>

    <template #footer>
      <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="clearAll">Reset filter</MpButton>
      <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="apply">Apply</MpButton>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.sa-filters-checkbox-list {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  max-height: 200px; overflow-y: auto;
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
}
.sa-filters-checkbox-item { display: flex; align-items: center; }
</style>
