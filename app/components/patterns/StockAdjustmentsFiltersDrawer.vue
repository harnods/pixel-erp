<script setup lang="ts">
/**
 * Cycle counts / stock adjustments index — "All filters" drawer. Same custom Teleport
 * overlay pattern as BillOfMaterialsFiltersDrawer.vue (MpDrawer has no structural CSS
 * in this Pixel3 build). Edits a local draft; only commits to the parent's filter refs
 * on Apply, so Cancel/close-outside discards in-progress edits.
 */
import { MpIcon, MpInput, MpCheckbox, MpFormControl, MpFormLabel } from '@mekari/pixel3'

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
  <Transition name="sa-filters">
    <div v-if="isOpen" class="sa-filters-overlay" @click.self="close">
      <div class="sa-filters-panel" role="dialog" aria-label="All filters">
        <header class="sa-filters-header">
          <span class="sa-filters-title">All filters</span>
          <button class="sa-filters-close" type="button" aria-label="Close" @click="close">
            <MpIcon name="close" size="md" />
          </button>
        </header>

        <div class="sa-filters-body">
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
        </div>

        <footer class="sa-filters-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="clearAll">Reset filter</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">Apply</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sa-filters-enter-active { transition: background-color 250ms ease; }
.sa-filters-leave-active { transition: background-color 250ms ease; }
.sa-filters-enter-from, .sa-filters-leave-to { background-color: transparent; }
.sa-filters-enter-active .sa-filters-panel { transition: transform 350ms ease-out; }
.sa-filters-leave-active .sa-filters-panel { transition: transform 250ms ease-in; }
.sa-filters-enter-from .sa-filters-panel,
.sa-filters-leave-to .sa-filters-panel { transform: translateX(calc(100% + 12px)); }

.sa-filters-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.sa-filters-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}
.sa-filters-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.sa-filters-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.sa-filters-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.sa-filters-close:hover { background: var(--mp-background-neutral-hovered); }

.sa-filters-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
}
.sa-filters-checkbox-list {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  max-height: 200px; overflow-y: auto;
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
}
.sa-filters-checkbox-item { display: flex; align-items: center; }

.sa-filters-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
</style>
