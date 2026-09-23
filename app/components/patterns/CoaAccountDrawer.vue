<script setup lang="ts">
/**
 * Add / edit one chart-of-accounts entry, used by the WMS cutover's Step 1
 * review (Data migration → Set up opening balance → Chart of accounts).
 *
 * Drawer, not modal: the user is checking this account against the list behind
 * it, so the page context has to stay visible (docs/patterns/Drawer.md). Shell
 * is the custom Teleport panel copied from BillsFiltersDrawer — MpDrawer has no
 * structural CSS in this Pixel3 build (rule/drawer-custom-shell). Close is the
 * × only; no overlay-click or Esc, so half-typed input is never lost.
 */
import { ref, computed, watch } from 'vue'
import { MpIcon, MpButton, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { COA_CATEGORIES, accountCategory, type CoaAccount, type AccountType } from '~/data/wmsCutover'

const props = defineProps<{
  isOpen: boolean
  /** null = add a new account; an account = edit it. */
  account: CoaAccount | null
}>()

const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'save', payload: { originalCode: string | null; account: CoaAccount }): void
}>()

const { t } = useLocale()

const isEdit = computed(() => props.account !== null)

// Draft fields — a local copy so Cancel leaves the real account untouched.
const code = ref('')
const name = ref('')
const category = ref<string>('Asset')
const type = ref<string>('other')
const showErrors = ref(false)
/** Server-side style rejection (duplicate code) handed back by the parent. */
const saveError = ref('')

// The routing slot a product mapping can pick this account for. 'other' means
// the account exists in the chart but no product routes to it.
const typeOptions = [
  { value: 'inventory', label: t('Inventory') },
  { value: 'revenue', label: t('Revenue') },
  { value: 'cogs', label: t('Cost of goods sold') },
  { value: 'other', label: t('Not used for product routing') },
]

watch(
  () => [props.isOpen, props.account] as const,
  ([open]) => {
    if (!open) return
    showErrors.value = false
    saveError.value = ''
    const a = props.account
    code.value = a?.code ?? ''
    name.value = a?.name ?? ''
    type.value = a?.type ?? 'other'
    category.value = a ? accountCategory(a.code) : 'Asset'
  },
  { immediate: true },
)

// Category follows the code's first digit — that IS the chart's convention, so
// keep it in sync as the user types rather than letting the two disagree.
watch(code, (v) => {
  if (v.trim()) category.value = accountCategory(v)
})

const codeError = computed(() => {
  if (!code.value.trim()) return t('You must fill in account code')
  if (!/^[0-9]/.test(code.value.trim())) return t('Account code must start with a number from 1 to 9')
  return ''
})
const nameError = computed(() => (name.value.trim() ? '' : t('You must fill in account name')))
const hasError = computed(() => !!codeError.value || !!nameError.value)

function close() {
  emit('update:isOpen', false)
}

function save() {
  showErrors.value = true
  saveError.value = ''
  if (hasError.value) return
  emit('save', {
    originalCode: props.account?.code ?? null,
    account: { code: code.value.trim(), name: name.value.trim(), type: type.value as AccountType },
  })
}

/** Parent calls this when the save was rejected (duplicate code). */
function rejectSave(message: string) {
  saveError.value = message
}
defineExpose({ rejectSave })
</script>

<template>
  <Teleport to="body">
    <Transition name="cad">
      <div v-if="isOpen" class="cad-overlay">
        <div class="cad-panel" role="dialog" :aria-label="isEdit ? t('Edit account') : t('Add account')">
          <header class="cad-header">
            <span class="cad-title">{{ isEdit ? t('Edit account') : t('Add account') }}</span>
            <MpButton class="cad-close" is-rounded :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>

          <div class="cad-body">
            <MpFormControl id="cad-code" is-required :is-invalid="showErrors && !!codeError">
              <MpFormLabel>{{ t('Account code') }}</MpFormLabel>
              <MpInput
                id="cad-code-input"
                v-model="code"
                :placeholder="t('Example: 1-10200')"
                autocomplete="off"
              />
              <MpFormErrorMessage>{{ codeError }}</MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="cad-name" is-required :is-invalid="showErrors && !!nameError">
              <MpFormLabel>{{ t('Account name') }}</MpFormLabel>
              <MpInput
                id="cad-name-input"
                v-model="name"
                :placeholder="t('Example: Inventory – Raw Material')"
                autocomplete="off"
              />
              <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
            </MpFormControl>

            <div class="cad-field">
              <span class="cad-field-label">{{ t('Account category') }}</span>
              <ErpFilterSelect
                id="cad-category"
                :model-value="category"
                :placeholder="t('Select category')"
                :options="COA_CATEGORIES"
                :is-clearable="false"
                width="100%"
                @update:model-value="(v: string) => (category = v)"
              />
              <span class="cad-field-hint">{{ t('Set automatically from the account code.') }}</span>
            </div>

            <div class="cad-field">
              <span class="cad-field-label">{{ t('Product routing') }}</span>
              <ErpFilterSelect
                id="cad-type"
                :model-value="type"
                :placeholder="t('Select routing')"
                :options="typeOptions"
                :is-clearable="false"
                width="100%"
                @update:model-value="(v: string) => (type = v)"
              />
              <span class="cad-field-hint">
                {{ t('Which dropdown this account appears in when you map WMS products in the next step.') }}
              </span>
            </div>

            <p v-if="saveError" class="cad-save-error">{{ saveError }}</p>
          </div>

          <footer class="cad-footer">
            <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="close">
              {{ t('Cancel') }}
            </button>
            <button type="button" class="btn-enterprise btn-enterprise--primary" @click="save">
              {{ isEdit ? t('Save changes') : t('Add account') }}
            </button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cad-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex;
  justify-content: flex-end;
}

.cad-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex;
  flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 12px);
  overflow: hidden;
}

.cad-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}

.cad-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.cad-close {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px) !important;
  height: var(--mp-sizes-9, 36px) !important;
  min-width: 0 !important;
  border: none !important;
  background: none !important;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  color: var(--mp-icon-default);
}
.cad-close:hover { background: var(--mp-background-neutral-hovered); }

/* 20px row gap — the standard form field spacing (Form.md). */
.cad-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
  padding: var(--mp-spacing-4);
}

.cad-field {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}

.cad-field-label {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.cad-field-hint {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
}

.cad-save-error {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-danger, #d1345b);
}

.cad-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}

.cad-enter-active,
.cad-leave-active { transition: background-color 250ms ease; }
.cad-enter-from,
.cad-leave-to { background-color: transparent; }
.cad-enter-active .cad-panel { transition: transform 350ms ease-out; }
.cad-leave-active .cad-panel { transition: transform 250ms ease-in; }
.cad-enter-from .cad-panel,
.cad-leave-to .cad-panel { transform: translateX(calc(100% + 12px)); }
</style>
