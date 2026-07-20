<script setup lang="ts">
/**
 * Work orders index — "All filters" drawer. A custom Teleport overlay (MpDrawer
 * has no structural CSS in this Pixel3 build — see BillOfMaterialsFiltersDrawer.vue
 * for the same pattern). Edits a local draft; only commits to the parent's filter
 * refs on Apply, so Cancel/close-outside discards in-progress edits.
 */
import { MpIcon, MpInput, MpAutocomplete, MpDatePicker, MpFormControl, MpFormLabel } from '@mekari/pixel3'

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
  <Transition name="wf-filters">
    <div v-if="isOpen" class="wf-filters-overlay" @click.self="close">
      <div class="wf-filters-panel" role="dialog" aria-label="All filters">
        <header class="wf-filters-header">
          <span class="wf-filters-title">All filters</span>
          <button class="wf-filters-close" type="button" aria-label="Close" @click="close">
            <MpIcon name="close" size="md" />
          </button>
        </header>

        <div class="wf-filters-body">
          <MpFormControl id="wf-filters-keyword-fc">
            <MpFormLabel>Keyword</MpFormLabel>
            <MpInput id="wf-filters-keyword" v-model="draft.keyword" placeholder="Search number, name" is-full-width />
          </MpFormControl>

          <MpFormControl id="wf-filters-type-fc">
            <MpFormLabel>Work order type</MpFormLabel>
            <MpAutocomplete
              id="wf-filters-type" v-model="draft.type" :data="typeOptions"
              label-prop="name" value-prop="id" placeholder="All types"
              is-searchable is-clearable use-portal is-full-width
            />
          </MpFormControl>

          <MpFormControl id="wf-filters-status-fc">
            <MpFormLabel>Work order status</MpFormLabel>
            <MpAutocomplete
              id="wf-filters-status" v-model="draft.status" :data="statusOptions"
              label-prop="name" value-prop="id" placeholder="All statuses"
              is-searchable is-clearable use-portal is-full-width
            />
          </MpFormControl>

          <MpFormControl id="wf-filters-start-fc">
            <MpFormLabel>Start date</MpFormLabel>
            <MpDatePicker
              id="wf-filters-start" v-model="draft.startDate"
              format="DD/MM/YYYY" value-type="format" placeholder="DD/MM/YYYY"
              is-clearable use-portal is-full-width
            />
          </MpFormControl>

          <MpFormControl id="wf-filters-end-fc">
            <MpFormLabel>End date</MpFormLabel>
            <MpDatePicker
              id="wf-filters-end" v-model="draft.endDate"
              format="DD/MM/YYYY" value-type="format" placeholder="DD/MM/YYYY"
              is-clearable use-portal is-full-width
            />
          </MpFormControl>
        </div>

        <footer class="wf-filters-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="clearAll">Clear all</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">Apply filters</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.wf-filters-enter-active { transition: background-color 250ms ease; }
.wf-filters-leave-active { transition: background-color 250ms ease; }
.wf-filters-enter-from, .wf-filters-leave-to { background-color: transparent; }
.wf-filters-enter-active .wf-filters-panel { transition: transform 350ms ease-out; }
.wf-filters-leave-active .wf-filters-panel { transition: transform 250ms ease-in; }
.wf-filters-enter-from .wf-filters-panel,
.wf-filters-leave-to .wf-filters-panel { transform: translateX(calc(100% + 12px)); }

.wf-filters-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.wf-filters-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}
.wf-filters-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.wf-filters-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.wf-filters-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.wf-filters-close:hover { background: var(--mp-background-neutral-hovered); }

.wf-filters-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
}

.wf-filters-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
</style>
