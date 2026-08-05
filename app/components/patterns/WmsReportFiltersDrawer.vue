<script setup lang="ts">
/**
 * WMS Inbound accuracy report — "All filters" drawer. Same custom Teleport overlay
 * pattern as StockAdjustmentsFiltersDrawer.vue (MpDrawer has no structural CSS in
 * this Pixel3 build). Edits a local draft; only commits to the parent's filter refs
 * on Apply, so Cancel/close-outside discards in-progress edits.
 */
import { MpIcon, MpCheckbox, MpFormControl, MpFormLabel } from '@mekari/pixel3'

export interface WmsReportFiltersValue {
  skus: string[]
  sources: string[]
  receiveStates: string[]
}

const props = defineProps<{
  isOpen: boolean
  modelValue: WmsReportFiltersValue
  skuOptions: string[]
  sourceOptions: string[]
  receiveStateOptions: { id: string; name: string }[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: WmsReportFiltersValue): void
}>()

const { t } = useLocale()

const draft = reactive<WmsReportFiltersValue>({
  skus: [...props.modelValue.skus],
  sources: [...props.modelValue.sources],
  receiveStates: [...props.modelValue.receiveStates],
})
watch(() => props.isOpen, (open) => {
  if (open) {
    draft.skus = [...props.modelValue.skus]
    draft.sources = [...props.modelValue.sources]
    draft.receiveStates = [...props.modelValue.receiveStates]
  }
})

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', { skus: [...draft.skus], sources: [...draft.sources], receiveStates: [...draft.receiveStates] }); close() }
function clearAll() {
  draft.skus = []
  draft.sources = []
  draft.receiveStates = []
}
function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter(v => v !== id) : [...list, id]
}
function toggleSku(id: string) { draft.skus = toggle(draft.skus, id) }
function toggleSource(id: string) { draft.sources = toggle(draft.sources, id) }
function toggleReceiveState(id: string) { draft.receiveStates = toggle(draft.receiveStates, id) }
</script>

<template>
  <Transition name="wrf-filters">
    <div v-if="isOpen" class="wrf-filters-overlay" @click.self="close">
      <div class="wrf-filters-panel" role="dialog" :aria-label="t('All filters')">
        <header class="wrf-filters-header">
          <span class="wrf-filters-title">{{ t('All filters') }}</span>
          <button class="wrf-filters-close" type="button" :aria-label="t('Close')" @click="close">
            <MpIcon name="close" size="md" />
          </button>
        </header>

        <div class="wrf-filters-body">
          <MpFormControl id="wrf-filters-sku-fc">
            <MpFormLabel>{{ t('SKU / Product') }}</MpFormLabel>
            <div class="wrf-filters-checkbox-list">
              <label v-for="opt in skuOptions" :key="opt" class="wrf-filters-checkbox-item">
                <MpCheckbox
                  :id="`wrf-filters-sku-${opt}`"
                  :is-checked="draft.skus.includes(opt)"
                  @change="toggleSku(opt)"
                >
                  {{ opt }}
                </MpCheckbox>
              </label>
            </div>
          </MpFormControl>

          <MpFormControl id="wrf-filters-source-fc">
            <MpFormLabel>{{ t('Source of Inbound') }}</MpFormLabel>
            <div class="wrf-filters-checkbox-list">
              <label v-for="opt in sourceOptions" :key="opt" class="wrf-filters-checkbox-item">
                <MpCheckbox
                  :id="`wrf-filters-source-${opt}`"
                  :is-checked="draft.sources.includes(opt)"
                  @change="toggleSource(opt)"
                >
                  {{ opt }}
                </MpCheckbox>
              </label>
            </div>
          </MpFormControl>

          <MpFormControl id="wrf-filters-state-fc">
            <MpFormLabel>{{ t('Inbound Receive State') }}</MpFormLabel>
            <div class="wrf-filters-checkbox-list">
              <label v-for="opt in receiveStateOptions" :key="opt.id" class="wrf-filters-checkbox-item">
                <MpCheckbox
                  :id="`wrf-filters-state-${opt.id}`"
                  :is-checked="draft.receiveStates.includes(opt.id)"
                  @change="toggleReceiveState(opt.id)"
                >
                  {{ t(opt.name) }}
                </MpCheckbox>
              </label>
            </div>
          </MpFormControl>
        </div>

        <footer class="wrf-filters-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="clearAll">{{ t('Reset filter') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">{{ t('Apply') }}</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.wrf-filters-enter-active { transition: background-color 250ms ease; }
.wrf-filters-leave-active { transition: background-color 250ms ease; }
.wrf-filters-enter-from, .wrf-filters-leave-to { background-color: transparent; }
.wrf-filters-enter-active .wrf-filters-panel { transition: transform 350ms ease-out; }
.wrf-filters-leave-active .wrf-filters-panel { transition: transform 250ms ease-in; }
.wrf-filters-enter-from .wrf-filters-panel,
.wrf-filters-leave-to .wrf-filters-panel { transform: translateX(calc(100% + 12px)); }

.wrf-filters-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.wrf-filters-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}
.wrf-filters-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.wrf-filters-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.wrf-filters-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.wrf-filters-close:hover { background: var(--mp-background-neutral-hovered); }

.wrf-filters-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
}
.wrf-filters-checkbox-list {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  max-height: 200px; overflow-y: auto;
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
}
.wrf-filters-checkbox-item { display: flex; align-items: center; }

.wrf-filters-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
</style>
