<script setup lang="ts">
/**
 * General Ledger report — "All filters" drawer (Figma 4345-174595).
 * Narrows the ledger by account keyword and transaction type, and can drop
 * accounts with no postings in the period. Same overlay shell as the other
 * report drawers (MpDrawer has no structural CSS in this Pixel3 build); edits a
 * local draft and commits only on Apply.
 */
import { MpIcon, MpCheckbox, MpFormControl, MpFormLabel } from '@mekari/pixel3'
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
  <Transition name="glf">
    <div v-if="isOpen" class="glf-overlay" @click.self="close">
      <div class="glf-panel" role="dialog" :aria-label="t('All filters')">
        <header class="glf-head">
          <span class="glf-title">{{ t('All filters') }}</span>
          <button class="glf-close" type="button" :aria-label="t('Close')" @click="close"><MpIcon name="close" size="md" /></button>
        </header>

        <div class="glf-body">
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
        </div>

        <footer class="glf-foot">
          <button class="glf-reset" type="button" @click="clearAll">{{ t('Reset') }}</button>
          <div class="glf-foot-actions">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">{{ t('Apply') }}</button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.glf-enter-active, .glf-leave-active { transition: background-color 250ms ease; }
.glf-enter-from, .glf-leave-to { background-color: transparent; }
.glf-enter-active .glf-panel { transition: transform 350ms ease-out; }
.glf-leave-active .glf-panel { transition: transform 250ms ease-in; }
.glf-enter-from .glf-panel, .glf-leave-to .glf-panel { transform: translateX(calc(100% + 12px)); }

.glf-overlay { position: fixed; inset: 0; z-index: 1300; background: rgba(8, 13, 14, 0.45); display: flex; justify-content: flex-end; }
.glf-panel { margin: var(--mp-spacing-3); width: min(420px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 24px; overflow: hidden; }
.glf-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.glf-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.glf-close { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.glf-close:hover { background: var(--mp-background-neutral-hovered); }

.glf-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); }
.glf-input { width: 100%; height: 36px; padding: 0 var(--mp-spacing-3); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16)); border-radius: var(--mp-radii-md, 6px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; }
.glf-input:focus { border-color: var(--mp-border-brand, #4b61dc); box-shadow: 0 0 0 1px var(--mp-border-brand, #4b61dc); }
.glf-input::placeholder { color: var(--mp-text-placeholder); }
.glf-hint { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.glf-checkbox-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.glf-checkbox-item { display: flex; align-items: flex-start; }

.glf-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-4); }
.glf-foot-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.glf-reset { border: none; background: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }
.glf-reset:hover { text-decoration: underline; }
</style>
