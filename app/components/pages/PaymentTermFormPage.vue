<!-- prod-parity: jurnal-non-core-feature-frontend/src/modules/payment-terms/views/PaymentTermCreateView.vue + components/PaymentTermForm.vue -->
<script setup lang="ts">
import { MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput } from '@mekari/pixel3'
import {
  addPaymentTerm, paymentTermNameTaken, PAYMENT_TERM_NAME_MAX_LENGTH,
} from '~/data/paymentTerms'
import { successToast } from '~/utils/toasts'

const { t } = useLocale()
const router = useRouter()

const name = ref('')
const days = ref('')
const nameError = ref('')
const daysError = ref('')
const isSaving = ref(false)

function goToList() { router.push('/payment-terms') }

// Same rules as prod's PaymentTermForm: 0 is a valid "due on receipt" term, so an
// untouched field and a deliberate 0 are different states.
function validate(): boolean {
  const n = name.value.trim()
  nameError.value = ''
  daysError.value = ''
  if (!n) nameError.value = t('Payment term name is required')
  else if (n.length > PAYMENT_TERM_NAME_MAX_LENGTH) nameError.value = t('Payment term name must be at most 60 characters')
  else if (/[^\x20-\x7E]/.test(n)) nameError.value = t('Payment term name must use ASCII characters only')
  else if (paymentTermNameTaken(n)) nameError.value = t('This payment term name already exists')
  const raw = days.value.trim()
  if (raw === '') daysError.value = t('Due date length is required')
  else if (!/^\d+$/.test(raw)) daysError.value = t('Due date length must be a whole number, 0 or greater')
  else if (Number(raw) > 99999) daysError.value = t('Due date length is too large')
  return !nameError.value && !daysError.value
}

async function save() {
  if (!validate()) return
  isSaving.value = true
  await new Promise(r => setTimeout(r, 400))
  addPaymentTerm(name.value, Number(days.value))
  isSaving.value = false
  successToast(t('Payment term saved'))
  goToList()
}
</script>

<template>
  <div class="ptf-page">
    <div class="ptf-titlebar">
      <div class="ptf-titlebar-left">
        <button class="ptf-breadcrumb" @click="goToList">{{ t('Payment terms') }}</button>
        <h1 class="ptf-title">{{ t('New payment term') }}</h1>
      </div>
    </div>

    <div class="ptf-stage">
      <div class="ptf-form">
        <MpFormControl id="ptf-name" is-required :is-invalid="!!nameError">
          <div class="ptf-label-row">
            <MpFormLabel>{{ t('Payment term name') }}</MpFormLabel>
            <span class="ptf-counter">{{ name.length }}/{{ PAYMENT_TERM_NAME_MAX_LENGTH }}</span>
          </div>
          <MpInput id="ptf-name-input" v-model="name" :maxlength="PAYMENT_TERM_NAME_MAX_LENGTH" is-full-width @update:model-value="nameError = ''" />
          <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
        </MpFormControl>

        <MpFormControl id="ptf-days" is-required :is-invalid="!!daysError">
          <MpFormLabel>{{ t('Due date') }}</MpFormLabel>
          <div class="ptf-days-row">
            <div class="ptf-days">
              <MpInput id="ptf-days-input" v-model="days" type="number" @update:model-value="daysError = ''" />
              <span class="ptf-suffix">{{ t('days') }}</span>
            </div>
            <span class="ptf-text">{{ t('after invoice date') }}</span>
          </div>
          <MpFormErrorMessage>{{ daysError }}</MpFormErrorMessage>
        </MpFormControl>
      </div>
    </div>

    <div class="ptf-footer">
      <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="goToList">{{ t('Cancel') }}</button>
      <button class="btn-enterprise btn-enterprise--primary" type="button" @click="save">{{ isSaving ? t('Saving…') : t('Save') }}</button>
    </div>
  </div>
</template>

<style scoped>
.ptf-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.ptf-titlebar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); background: var(--mp-background-neutral-subtle); display: flex; align-items: center; padding: 0 var(--mp-spacing-6); }
.ptf-titlebar-left { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; }
.ptf-breadcrumb { background: none; border: none; cursor: pointer; padding: 0; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-md); color: var(--mp-text-link); font-family: inherit; white-space: nowrap; }
.ptf-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.ptf-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default); }
.ptf-stage { flex: 1; min-height: 0; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0; overflow-y: auto; padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-8); }
.ptf-form { width: 558px; max-width: 100%; display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); }
.ptf-label-row { display: flex; align-items: center; justify-content: space-between; }
.ptf-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.ptf-days-row { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.ptf-days { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 180px; }
.ptf-suffix, .ptf-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.ptf-suffix { color: var(--mp-text-subtle); }
.ptf-footer { flex-shrink: 0; display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid var(--mp-border-default); }
</style>
