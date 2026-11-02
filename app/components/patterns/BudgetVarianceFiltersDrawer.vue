<script setup lang="ts">
/**
 * Budget Variance report — "All filters" drawer (Figma 4481-243948).
 * Narrows the P&L rows by account keyword, and can restrict the report to
 * accounts that overran their budget. Same overlay shell as the other report
 * drawers; edits a local draft and commits only on Apply.
 */
import { MpButton, MpCheckbox, MpFormControl, MpFormLabel } from '@mekari/pixel3'
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
  <ErpDrawer :is-open="isOpen" :title="t('All filters')" @close="close">
    <template #body>
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
    </template>

    <template #footer>
      <MpButton class="bvf-reset" variant="ghost" type="button" @click="clearAll">{{ t('Reset') }}</MpButton>
      <div class="bvf-foot-actions">
        <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="close">{{ t('Cancel') }}</MpButton>
        <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="apply">{{ t('Apply') }}</MpButton>
      </div>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.bvf-input { width: 100%; height: 36px; padding: 0 var(--mp-spacing-3); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16)); border-radius: var(--mp-radii-md, 6px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; }
.bvf-input:focus { border-color: var(--mp-border-brand, #4b61dc); box-shadow: 0 0 0 1px var(--mp-border-brand, #4b61dc); }
.bvf-input::placeholder { color: var(--mp-text-placeholder); }
.bvf-checkbox-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.bvf-checkbox-item { display: flex; align-items: flex-start; }

.bvf-foot-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.bvf-reset { border: none; background: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }
.bvf-reset:hover { text-decoration: underline; }
</style>
