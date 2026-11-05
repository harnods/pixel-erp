<script setup lang="ts">
/**
 * New tax — create a tax rate without leaving the page you're on.
 *
 * Mirrors ERP's existing sales-invoice "Add new tax" dialog (same fields, same
 * order): name + rate on one row, the two tax accounts on the next, then the
 * withholding and DPP Nilai Lain switches. Used by the WMS cutover product
 * setup table so a customer whose WMS uses a tax ERP doesn't have yet isn't
 * sent to Settings mid-migration.
 *
 * Modal, not drawer: it's a short interrupting create that blocks the row you
 * were editing (docs/patterns/Modal.md).
 */
import { ref, computed, watch } from 'vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpButton, MpButtonGroup, MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpInput, MpCheckbox,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { coaAccounts, accountLabel, type TaxRate } from '~/data/wmsCutover'

const props = defineProps<{ isOpen: boolean }>()

const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'save', rate: TaxRate): void
}>()

const { t } = useLocale()

const NAME_MAX = 60

const name = ref('')
const rate = ref('0')
const salesAccount = ref('2-20500')
const purchaseAccount = ref('1-10500')
const isWithholding = ref(false)
const isDppNilaiLain = ref(false)
const showErrors = ref(false)
/** Rejection handed back by the parent (duplicate name). */
const saveError = ref('')

const accountOptions = computed(() =>
  coaAccounts.map((a) => ({ value: a.code, label: accountLabel(a) })),
)

watch(
  () => props.isOpen,
  (open) => {
    if (!open) return
    name.value = ''
    rate.value = '0'
    salesAccount.value = '2-20500'
    purchaseAccount.value = '1-10500'
    isWithholding.value = false
    isDppNilaiLain.value = false
    showErrors.value = false
    saveError.value = ''
  },
)

const nameError = computed(() => {
  if (!name.value.trim()) return t('You must fill in tax name')
  if (name.value.length > NAME_MAX) return `${t('Tax name cannot exceed')} ${NAME_MAX} ${t('characters')}`
  return ''
})
const rateError = computed(() => {
  const n = Number(rate.value)
  if (rate.value === '' || Number.isNaN(n)) return t('You must fill in rate')
  if (n < 0 || n > 100) return t('Rate must be between 0 and 100')
  return ''
})
const hasError = computed(() => !!nameError.value || !!rateError.value)

function close() {
  emit('update:isOpen', false)
}

function save() {
  showErrors.value = true
  saveError.value = ''
  if (hasError.value) return
  emit('save', {
    name: name.value.trim(),
    rate: Number(rate.value),
    salesAccount: salesAccount.value,
    purchaseAccount: purchaseAccount.value,
    isWithholding: isWithholding.value,
    isDppNilaiLain: isDppNilaiLain.value,
  })
}

/** Parent calls this when the save was rejected. */
function rejectSave(message: string) {
  saveError.value = message
}
defineExpose({ rejectSave })
</script>

<template>
  <MpModal
    id="new-tax-modal"
    :is-open="isOpen"
    size="md"
    :is-keep-alive="false"
    :is-close-on-esc="false"
    :is-close-on-overlay-click="false"
    @close="close"
  >
    <MpModalContent>
      <MpModalHeader>{{ t('New tax') }}</MpModalHeader>
      <MpModalBody>
        <div class="nt-grid">
          <MpFormControl id="nt-name" is-required :is-invalid="showErrors && !!nameError">
            <MpFormLabel>
              {{ t('Tax name') }}
              <template #icon>
                <span class="nt-counter">{{ name.length }} / {{ NAME_MAX }}</span>
              </template>
            </MpFormLabel>
            <MpInput id="nt-name-input" v-model="name" :placeholder="t('e.g. PPh 23')" autocomplete="off" />
            <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="nt-rate" is-required :is-invalid="showErrors && !!rateError">
            <MpFormLabel>{{ t('Rate') }}</MpFormLabel>
            <div class="nt-rate">
              <MpInput id="nt-rate-input" v-model="rate" type="number" autocomplete="off" />
              <span class="nt-rate-suffix">%</span>
            </div>
            <MpFormErrorMessage>{{ rateError }}</MpFormErrorMessage>
          </MpFormControl>

          <div class="nt-field">
            <span class="nt-field-label">{{ t('Sales tax account') }}</span>
            <ErpFilterSelect
              id="nt-sales-account"
              :model-value="salesAccount"
              :placeholder="t('Select account')"
              :options="accountOptions"
              :is-clearable="false"
              width="100%"
              @update:model-value="(v: string) => (salesAccount = v)"
            />
          </div>

          <div class="nt-field">
            <span class="nt-field-label">{{ t('Purchase tax account') }}</span>
            <ErpFilterSelect
              id="nt-purchase-account"
              :model-value="purchaseAccount"
              :placeholder="t('Select account')"
              :options="accountOptions"
              :is-clearable="false"
              width="100%"
              @update:model-value="(v: string) => (purchaseAccount = v)"
            />
          </div>
        </div>

        <div class="nt-switches">
          <div class="nt-switch">
            <MpCheckbox
              id="nt-withholding"
              :is-checked="isWithholding"
              @change="(v: boolean) => (isWithholding = v)"
            />
            <div class="nt-switch-text">
              <span class="nt-switch-label">{{ t('Withholding tax') }}</span>
              <span class="nt-switch-hint">{{ t('Enable this for taxes that deduct the total payment.') }}</span>
            </div>
          </div>

          <div class="nt-switch">
            <MpCheckbox
              id="nt-dpp"
              :is-checked="isDppNilaiLain"
              @change="(v: boolean) => (isDppNilaiLain = v)"
            />
            <div class="nt-switch-text">
              <span class="nt-switch-label">{{ t('DPP Nilai Lain') }}</span>
              <span class="nt-switch-hint">{{ t('Enable this for taxes subject to PMK-131/2024 regulation.') }}</span>
            </div>
          </div>
        </div>

        <p v-if="saveError" class="nt-save-error">{{ saveError }}</p>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup>
          <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="save">{{ t('Save') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
  </MpModal>
</template>

<style scoped>
/* Name + rate on one row, the two accounts on the next (matches the ERP dialog). */
.nt-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--mp-spacing-4) var(--mp-spacing-5);
}

.nt-counter {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary);
  font-variant-numeric: tabular-nums;
}

.nt-rate {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
}
.nt-rate-suffix {
  flex-shrink: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}

.nt-field {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  min-width: 0;
}
.nt-field-label {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.nt-switches {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-4);
  margin-top: var(--mp-spacing-5);
}
.nt-switch {
  display: flex;
  align-items: flex-start;
  gap: var(--mp-spacing-3);
}
.nt-switch-text {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-0\.5, 2px);
}
.nt-switch-label {
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.nt-switch-hint {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
}

.nt-save-error {
  margin: var(--mp-spacing-4) 0 0;
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-danger, #d1345b);
}
</style>
