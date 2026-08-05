<script setup lang="ts">
/**
 * WMS Inbound accuracy report — "All filters" drawer (Figma node 4545-45929).
 * Custom Teleport-style overlay (MpDrawer has no structural CSS in this Pixel3
 * build). SKU + Source are MpInputTag tag-fields (searchable suggestions, no
 * create-new); Completion state is a borderless checkbox group. Edits a local
 * draft; commits to the parent only on Apply, so Cancel/close-outside discards.
 */
import { MpIcon, MpCheckbox, MpFormControl, MpFormLabel, MpInputTag, type DataInterface } from '@mekari/pixel3'

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

// SKU + Source selections live as DataInterface[] (MpInputTag's shape); the
// completion-state checkboxes stay a plain string[].
function toData(arr: string[]): DataInterface[] {
  return arr.map((s) => ({ id: s, text: s, value: s, isInvalid: false, isReadOnly: false }))
}
const skuData = ref<DataInterface[]>(toData(props.modelValue.skus))
const sourceData = ref<DataInterface[]>(toData(props.modelValue.sources))
const receiveStates = ref<string[]>([...props.modelValue.receiveStates])

watch(() => props.isOpen, (open) => {
  if (open) {
    skuData.value = toData(props.modelValue.skus)
    sourceData.value = toData(props.modelValue.sources)
    receiveStates.value = [...props.modelValue.receiveStates]
  }
})

function onSkuChange(data: DataInterface[]) { skuData.value = data }
function onSourceChange(data: DataInterface[]) { sourceData.value = data }
function toggleReceiveState(id: string) {
  receiveStates.value = receiveStates.value.includes(id)
    ? receiveStates.value.filter((v) => v !== id)
    : [...receiveStates.value, id]
}

function close() { emit('update:isOpen', false) }
function apply() {
  emit('apply', {
    skus: skuData.value.map((d) => String(d.value ?? d.text)),
    sources: sourceData.value.map((d) => String(d.value ?? d.text)),
    receiveStates: [...receiveStates.value],
  })
  close()
}
function clearAll() { skuData.value = []; sourceData.value = []; receiveStates.value = [] }
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
            <MpFormLabel>{{ t('SKU') }}</MpFormLabel>
            <MpInputTag
              id="wrf-filters-sku"
              :data="skuData"
              :suggestions="skuOptions"
              :is-show-suggestions="true"
              :is-enable-create-new-tag="false"
              :is-show-icon-chevron-down="true"
              :placeholder="t('Search SKU...')"
              @change="onSkuChange"
            />
          </MpFormControl>

          <MpFormControl id="wrf-filters-source-fc">
            <MpFormLabel>{{ t('Source') }}</MpFormLabel>
            <MpInputTag
              id="wrf-filters-source"
              :data="sourceData"
              :suggestions="sourceOptions"
              :is-show-suggestions="true"
              :is-enable-create-new-tag="false"
              :is-show-icon-chevron-down="true"
              :placeholder="t('Search source...')"
              @change="onSourceChange"
            />
          </MpFormControl>

          <MpFormControl id="wrf-filters-state-fc">
            <MpFormLabel>{{ t('Completion state') }}</MpFormLabel>
            <div class="wrf-filters-checkbox-list">
              <label v-for="opt in receiveStateOptions" :key="opt.id" class="wrf-filters-checkbox-item">
                <MpCheckbox
                  :id="`wrf-filters-state-${opt.id}`"
                  :is-checked="receiveStates.includes(opt.id)"
                  @change="toggleReceiveState(opt.id)"
                >
                  {{ t(opt.name) }}
                </MpCheckbox>
              </label>
            </div>
          </MpFormControl>
        </div>

        <footer class="wrf-filters-footer">
          <button class="wrf-filters-reset" type="button" @click="clearAll">{{ t('Reset') }}</button>
          <div class="wrf-filters-footer-actions">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">{{ t('Apply') }}</button>
          </div>
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
/* Completion state — plain checkbox group, no border box. */
.wrf-filters-checkbox-list {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
}
.wrf-filters-checkbox-item { display: flex; align-items: flex-start; }

/* Action group — no top border (per Figma). */
.wrf-filters-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-4);
}
.wrf-filters-footer-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.wrf-filters-reset {
  border: none; background: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary);
}
.wrf-filters-reset:hover { text-decoration: underline; }
</style>
