<script setup lang="ts">
/**
 * Budget Variance report — "All filters" drawer (Figma 4481-243948).
 * Narrows the P&L rows by account keyword, and can restrict the report to
 * accounts that overran their budget. Same overlay shell as the other report
 * drawers; edits a local draft and commits only on Apply.
 */
import { MpIcon, MpCheckbox, MpFormControl, MpFormLabel } from '@mekari/pixel3'
import type { BvFilters } from '~/data/budgetVarianceReport'

const props = defineProps<{
  isOpen: boolean
  modelValue: BvFilters
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: BvFilters): void
}>()

const { t } = useLocale()

const accountKeyword = ref(props.modelValue.accountKeyword)
const onlyExceeding = ref(props.modelValue.onlyExceeding)
const showZero = ref(props.modelValue.showZero)

watch(() => props.isOpen, (open) => {
  if (open) {
    accountKeyword.value = props.modelValue.accountKeyword
    onlyExceeding.value = props.modelValue.onlyExceeding
    showZero.value = props.modelValue.showZero
  }
})

function close() { emit('update:isOpen', false) }
function apply() {
  emit('apply', { accountKeyword: accountKeyword.value.trim(), onlyExceeding: onlyExceeding.value, showZero: showZero.value })
  close()
}
function clearAll() { accountKeyword.value = ''; onlyExceeding.value = false; showZero.value = true }
</script>

<template>
  <Transition name="bvf">
    <div v-if="isOpen" class="bvf-overlay">
      <div class="bvf-panel" role="dialog" :aria-label="t('All filters')">
        <header class="bvf-head">
          <span class="bvf-title">{{ t('All filters') }}</span>
          <button class="bvf-close" type="button" :aria-label="t('Close')" @click="close"><MpIcon name="close" size="md" /></button>
        </header>

        <div class="bvf-body">
          <MpFormControl id="bvf-account-fc">
            <MpFormLabel>{{ t('Account') }}</MpFormLabel>
            <input
              v-model="accountKeyword"
              class="bvf-input"
              type="text"
              :placeholder="t('Search account code or name...')"
              @keydown.enter.prevent="apply"
            />
          </MpFormControl>

          <MpFormControl id="bvf-accounts-fc">
            <MpFormLabel>{{ t('Accounts') }}</MpFormLabel>
            <div class="bvf-checkbox-list">
              <label class="bvf-checkbox-item">
                <MpCheckbox id="bvf-exceeding" :is-checked="onlyExceeding" @change="onlyExceeding = !onlyExceeding">
                  {{ t('Only show accounts exceeding budget') }}
                </MpCheckbox>
              </label>
              <label class="bvf-checkbox-item">
                <MpCheckbox id="bvf-zero" :is-checked="showZero" @change="showZero = !showZero">
                  {{ t('Show accounts with no budget') }}
                </MpCheckbox>
              </label>
            </div>
          </MpFormControl>
        </div>

        <footer class="bvf-foot">
          <button class="bvf-reset" type="button" @click="clearAll">{{ t('Reset') }}</button>
          <div class="bvf-foot-actions">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">{{ t('Apply') }}</button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.bvf-enter-active, .bvf-leave-active { transition: background-color 250ms ease; }
.bvf-enter-from, .bvf-leave-to { background-color: transparent; }
.bvf-enter-active .bvf-panel { transition: transform 350ms ease-out; }
.bvf-leave-active .bvf-panel { transition: transform 250ms ease-in; }
.bvf-enter-from .bvf-panel, .bvf-leave-to .bvf-panel { transform: translateX(calc(100% + 12px)); }

.bvf-overlay { position: fixed; inset: 0; z-index: 1300; background: rgba(8, 13, 14, 0.45); display: flex; justify-content: flex-end; }
.bvf-panel { margin: var(--mp-spacing-3); width: min(420px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 24px; overflow: hidden; }
.bvf-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.bvf-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bvf-close { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.bvf-close:hover { background: var(--mp-background-neutral-hovered); }

.bvf-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); }
.bvf-input { width: 100%; height: 36px; padding: 0 var(--mp-spacing-3); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16)); border-radius: var(--mp-radii-md, 6px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; }
.bvf-input:focus { border-color: var(--mp-border-brand, #4b61dc); box-shadow: 0 0 0 1px var(--mp-border-brand, #4b61dc); }
.bvf-input::placeholder { color: var(--mp-text-placeholder); }
.bvf-checkbox-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.bvf-checkbox-item { display: flex; align-items: flex-start; }

.bvf-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-4); }
.bvf-foot-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.bvf-reset { border: none; background: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }
.bvf-reset:hover { text-decoration: underline; }
</style>
