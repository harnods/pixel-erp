<script setup lang="ts">
/**
 * General Ledger report — "All filters" drawer (Figma 4345-174595).
 * Narrows the ledger by account keyword and transaction type, and can drop
 * accounts with no postings in the period. Same overlay shell as the other
 * report drawers (MpDrawer has no structural CSS in this Pixel3 build); edits a
 * local draft and commits only on Apply.
 */
import { MpButton, MpCheckbox, MpFormControl, MpFormLabel } from '@mekari/pixel3'
import type { GlFilters } from '~/data/generalLedgerReport'

const props = defineProps<{
  isOpen: boolean
  modelValue: GlFilters
  typeOptions: string[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: GlFilters): void
}>()

const { t } = useLocale()

const accountKeyword = ref(props.modelValue.accountKeyword)
const types = ref<string[]>([...props.modelValue.types])
const hideEmpty = ref(props.modelValue.hideEmpty)

watch(() => props.isOpen, (open) => {
  if (open) {
    accountKeyword.value = props.modelValue.accountKeyword
    types.value = [...props.modelValue.types]
    hideEmpty.value = props.modelValue.hideEmpty
  }
})

function toggleType(v: string) {
  types.value = types.value.includes(v) ? types.value.filter((x) => x !== v) : [...types.value, v]
}
function close() { emit('update:isOpen', false) }
function apply() {
  emit('apply', { accountKeyword: accountKeyword.value.trim(), types: [...types.value], hideEmpty: hideEmpty.value })
  close()
}
function clearAll() { accountKeyword.value = ''; types.value = []; hideEmpty.value = false }
</script>

<template>
  <ErpDrawer :is-open="isOpen" :title="t('All filters')" @close="close">
    <template #body>
      <MpFormControl id="glf-account-fc">
        <MpFormLabel>{{ t('Account') }}</MpFormLabel>
        <input
          v-model="accountKeyword"
          class="glf-input"
          type="text"
          :placeholder="t('Search account code or name...')"
          @keydown.enter.prevent="apply"
        />
      </MpFormControl>

      <MpFormControl id="glf-type-fc">
        <MpFormLabel>{{ t('Transaction type') }}</MpFormLabel>
        <p class="glf-hint">{{ t('Leave all unchecked to show every type.') }}</p>
        <div class="glf-checkbox-list">
          <label v-for="opt in typeOptions" :key="opt" class="glf-checkbox-item">
            <MpCheckbox :id="`glf-type-${opt.replace(/\s+/g, '-')}`" :is-checked="types.includes(opt)" @change="toggleType(opt)">
              {{ opt }}
            </MpCheckbox>
          </label>
        </div>
      </MpFormControl>

      <MpFormControl id="glf-empty-fc">
        <MpFormLabel>{{ t('Accounts') }}</MpFormLabel>
        <div class="glf-checkbox-list">
          <label class="glf-checkbox-item">
            <MpCheckbox id="glf-hide-empty" :is-checked="hideEmpty" @change="hideEmpty = !hideEmpty">
              {{ t('Hide accounts with no postings') }}
            </MpCheckbox>
          </label>
        </div>
      </MpFormControl>
    </template>

    <template #footer>
      <MpButton class="glf-reset" variant="ghost" type="button" @click="clearAll">{{ t('Reset') }}</MpButton>
      <div class="glf-foot-actions">
        <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="close">{{ t('Cancel') }}</MpButton>
        <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="apply">{{ t('Apply') }}</MpButton>
      </div>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.glf-input { width: 100%; height: 36px; padding: 0 var(--mp-spacing-3); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16)); border-radius: var(--mp-radii-md, 6px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; }
.glf-input:focus { border-color: var(--mp-border-brand, #4b61dc); box-shadow: 0 0 0 1px var(--mp-border-brand, #4b61dc); }
.glf-input::placeholder { color: var(--mp-text-placeholder); }
.glf-hint { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.glf-checkbox-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.glf-checkbox-item { display: flex; align-items: flex-start; }

.glf-foot-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.glf-reset { border: none; background: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }
.glf-reset:hover { text-decoration: underline; }
</style>
