<script setup lang="ts">
/**
 * Multidimensional report — "All filters" drawer (Figma 4836-56598).
 * Custom Teleport-style overlay, same shell as WmsReportFiltersDrawer (MpDrawer
 * has no structural CSS in this Pixel3 build). Scopes the report to a subset of
 * the chosen dimension's values, narrows the account rows by keyword, and toggles
 * zero-balance accounts. Edits a local draft; commits only on Apply, so Cancel /
 * click-outside discards.
 */
import { MpIcon, MpCheckbox, MpFormControl, MpFormLabel } from '@mekari/pixel3'
import type { MdFilters } from '~/data/multidimensionalReport'

const props = defineProps<{
  isOpen: boolean
  modelValue: MdFilters
  /** Name of the dimension being sliced by — labels the value checkbox group. */
  dimensionName: string
  /** Every value of that dimension; empty selection = all of them. */
  valueOptions: string[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: MdFilters): void
}>()

const { t } = useLocale()

const values = ref<string[]>([...props.modelValue.values])
const accountKeyword = ref(props.modelValue.accountKeyword)
const showZero = ref(props.modelValue.showZero)

watch(() => props.isOpen, (open) => {
  if (open) {
    values.value = [...props.modelValue.values]
    accountKeyword.value = props.modelValue.accountKeyword
    showZero.value = props.modelValue.showZero
  }
})

function toggleValue(v: string) {
  values.value = values.value.includes(v) ? values.value.filter((x) => x !== v) : [...values.value, v]
}
function close() { emit('update:isOpen', false) }
function apply() {
  emit('apply', {
    values: [...values.value],
    accountKeyword: accountKeyword.value.trim(),
    showZero: showZero.value,
  })
  close()
}
function clearAll() { values.value = []; accountKeyword.value = ''; showZero.value = true }
</script>

<template>
  <Transition name="mdf-filters">
    <div v-if="isOpen" class="mdf-filters-overlay" @click.self="close">
      <div class="mdf-filters-panel" role="dialog" :aria-label="t('All filters')">
        <header class="mdf-filters-header">
          <span class="mdf-filters-title">{{ t('All filters') }}</span>
          <button class="mdf-filters-close" type="button" :aria-label="t('Close')" @click="close">
            <MpIcon name="close" size="md" />
          </button>
        </header>

        <div class="mdf-filters-body">
          <MpFormControl id="mdf-filters-account-fc">
            <MpFormLabel>{{ t('Account') }}</MpFormLabel>
            <input
              v-model="accountKeyword"
              class="mdf-keyword-input"
              type="text"
              :placeholder="t('Search account code or name...')"
              @keydown.enter.prevent="apply"
            />
          </MpFormControl>

          <MpFormControl id="mdf-filters-values-fc">
            <MpFormLabel>{{ dimensionName || t('Dimension value') }}</MpFormLabel>
            <p class="mdf-filters-hint">{{ t('Leave all unchecked to show every value.') }}</p>
            <div class="mdf-filters-checkbox-list">
              <label v-for="opt in valueOptions" :key="opt" class="mdf-filters-checkbox-item">
                <MpCheckbox
                  :id="`mdf-filters-value-${opt.replace(/\s+/g, '-')}`"
                  :is-checked="values.includes(opt)"
                  @change="toggleValue(opt)"
                >
                  {{ opt }}
                </MpCheckbox>
              </label>
            </div>
          </MpFormControl>

          <MpFormControl id="mdf-filters-zero-fc">
            <MpFormLabel>{{ t('Accounts') }}</MpFormLabel>
            <div class="mdf-filters-checkbox-list">
              <label class="mdf-filters-checkbox-item">
                <MpCheckbox id="mdf-filters-zero" :is-checked="showZero" @change="showZero = !showZero">
                  {{ t('Show accounts with no activity') }}
                </MpCheckbox>
              </label>
            </div>
          </MpFormControl>
        </div>

        <footer class="mdf-filters-footer">
          <button class="mdf-filters-reset" type="button" @click="clearAll">{{ t('Reset') }}</button>
          <div class="mdf-filters-footer-actions">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">{{ t('Apply') }}</button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.mdf-filters-enter-active { transition: background-color 250ms ease; }
.mdf-filters-leave-active { transition: background-color 250ms ease; }
.mdf-filters-enter-from, .mdf-filters-leave-to { background-color: transparent; }
.mdf-filters-enter-active .mdf-filters-panel { transition: transform 350ms ease-out; }
.mdf-filters-leave-active .mdf-filters-panel { transition: transform 250ms ease-in; }
.mdf-filters-enter-from .mdf-filters-panel,
.mdf-filters-leave-to .mdf-filters-panel { transform: translateX(calc(100% + 12px)); }

.mdf-filters-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.mdf-filters-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}
.mdf-filters-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.mdf-filters-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.mdf-filters-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.mdf-filters-close:hover { background: var(--mp-background-neutral-hovered); }

.mdf-filters-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
}
.mdf-keyword-input {
  width: 100%; height: 36px; padding: 0 var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-md, 6px);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none;
}
.mdf-keyword-input:focus { border-color: var(--mp-border-brand, #4b61dc); box-shadow: 0 0 0 1px var(--mp-border-brand, #4b61dc); }
.mdf-keyword-input::placeholder { color: var(--mp-text-placeholder); }

.mdf-filters-hint { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.mdf-filters-checkbox-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.mdf-filters-checkbox-item { display: flex; align-items: flex-start; }

/* Action group — no top border (per Figma). */
.mdf-filters-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-4);
}
.mdf-filters-footer-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.mdf-filters-reset {
  border: none; background: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary);
}
.mdf-filters-reset:hover { text-decoration: underline; }
</style>
