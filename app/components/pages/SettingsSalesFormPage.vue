<!-- prod-parity: jurnal-doctor/services/quickbook/app/views/company/_sale_setting_inputs.html.haml -->
<script setup lang="ts">
import { infoToast } from '~/utils/toasts'
import { MpToggle, MpTextarea, MpTooltip, MpIcon, toast } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import {
  getSalesFormSettings, saveSalesFormSettings, TERM_OPTIONS, type SalesFormSettings,
} from '~/data/companySettings'

const { t } = useLocale()

const committed = reactive<SalesFormSettings>(getSalesFormSettings())
const draft = reactive<SalesFormSettings>({ ...committed })

const isEditing = ref(false)
const isSaving = ref(false)
const discardOpen = ref(false)
const mappingConfirmOpen = ref(false)

const hasChanges = computed(() => (Object.keys(committed) as (keyof SalesFormSettings)[]).some(k => draft[k] !== committed[k]))
/** Discount account per product is one-way: once saved on, it stays on. */
const mappingLocked = computed(() => committed.accountDiscountMapping)
const turningMappingOn = computed(() => draft.accountDiscountMapping && !committed.accountDiscountMapping)

type ToggleKey = 'shipping' | 'discount' | 'discountLines' | 'deposit' | 'showProfitMargin' | 'disableSellOnNoProduct' | 'pricingRuleLock'
const toggleRows: { key: ToggleKey; title: string; desc?: string; tooltip?: string }[] = [
  { key: 'shipping', title: 'Shipping' },
  { key: 'discount', title: 'Discount' },
  { key: 'discountLines', title: 'Discount per lines' },
]
const toggleRowsAfter: { key: ToggleKey; title: string; desc?: string; tooltip?: string }[] = [
  { key: 'deposit', title: 'Deposit' },
  { key: 'showProfitMargin', title: 'Show profit % on invoice form', tooltip: 'When activated, everyone in your company will be able to see profit margin and buy price when creating sales.' },
  { key: 'disableSellOnNoProduct', title: 'Disable sell on not enough quantity', desc: '*If you are using add-ons, we recommended to NOT activate this' },
  { key: 'pricingRuleLock', title: 'Sale prices using price rules', desc: '*the price will be locked and only can use the price rule' },
]

function startEdit() { Object.assign(draft, committed); isEditing.value = true }
function requestCancel() { if (hasChanges.value) discardOpen.value = true; else exitEdit() }
function exitEdit() { Object.assign(draft, committed); isEditing.value = false; discardOpen.value = false }
function requestSave() {
  if (turningMappingOn.value) mappingConfirmOpen.value = true
  else void saveEdit()
}
async function saveEdit() {
  mappingConfirmOpen.value = false
  isSaving.value = true
  await new Promise(r => setTimeout(r, 500))
  Object.assign(committed, draft)
  saveSalesFormSettings({ ...committed })
  isSaving.value = false
  isEditing.value = false
  toast.notify({ variant: 'success', title: t('Sales settings changes saved'), maxWidth: 'max-content' })
}
const notInPrototype = () => infoToast(t('Not in this prototype'))
</script>

<template>
  <div class="ws-page">
    <section class="ws-section">
      <div class="ws-section-header">
        <div class="ws-section-meta">
          <h2 class="ws-section-title">{{ t('Sales') }}</h2>
        </div>
        <button v-if="!isEditing" class="btn-enterprise btn-enterprise--secondary" @click="startEdit">{{ t('Edit') }}</button>
      </div>

      <div class="ws-toggle-list">
        <div class="ws-toggle-row ws-toggle-row--rule">
          <div class="ws-toggle-info">
            <span class="ws-toggle-title">{{ t('Preferred invoice term') }}</span>
          </div>
          <ErpFilterSelect
            v-if="isEditing"
            id="ss-invoice-term"
            v-model="draft.preferredInvoiceTerm"
            :placeholder="t('Select term')"
            :options="TERM_OPTIONS"
            :is-clearable="false"
            width="100%"
          />
          <span v-else class="ws-rule-value">{{ committed.preferredInvoiceTerm }}</span>
        </div>

        <div v-for="row in toggleRows" :key="row.key" class="ws-toggle-row">
          <div class="ws-toggle-info">
            <span class="ws-toggle-title">{{ t(row.title) }}</span>
          </div>
          <MpToggle :id="`ss-${row.key}`" v-model:is-checked="draft[row.key]" :is-disabled="!isEditing" :aria-label="t(row.title)" />
        </div>

        <div class="ws-toggle-row">
          <div class="ws-toggle-info">
            <span class="ws-toggle-title">
              {{ t('Discount account per product') }}
              <span class="ss-new">{{ t('New') }}</span>
            </span>
            <span class="ws-toggle-desc">
              {{ t('To map sales discount account in product detail page.') }}
              <span class="cell-link" @click="notInPrototype">{{ t('Learn more') }}</span>
            </span>
          </div>
          <MpToggle
            id="ss-account-discount-mapping"
            v-model:is-checked="draft.accountDiscountMapping"
            :is-disabled="!isEditing || mappingLocked"
            :aria-label="t('Discount account per product')"
          />
        </div>

        <div v-for="row in toggleRowsAfter" :key="row.key" class="ws-toggle-row">
          <div class="ws-toggle-info">
            <span class="ws-toggle-title">
              {{ t(row.title) }}
              <MpTooltip v-if="row.tooltip" :label="t(row.tooltip)" placement="top">
                <span class="ss-help"><MpIcon name="help" size="sm" color="icon.secondary" /></span>
              </MpTooltip>
            </span>
            <span v-if="row.desc" class="ws-toggle-desc ws-toggle-desc--note">{{ t(row.desc) }}</span>
          </div>
          <MpToggle :id="`ss-${row.key}`" v-model:is-checked="draft[row.key]" :is-disabled="!isEditing" :aria-label="t(row.title)" />
        </div>

        <h3 class="ws-subsection-title ws-subsection-title--spaced">{{ t('Messages') }}</h3>

        <div class="ss-field">
          <span class="ws-toggle-title">{{ t('Default sales message') }}</span>
          <MpTextarea v-if="isEditing" id="ss-invoice-message" v-model="draft.defaultInvoiceMessage" is-full-width />
          <span v-else class="ss-message">{{ committed.defaultInvoiceMessage || '—' }}</span>
        </div>

        <div class="ss-field">
          <span class="ws-toggle-title">{{ t('Default delivery slip message') }}</span>
          <MpTextarea v-if="isEditing" id="ss-delivery-message" v-model="draft.defaultDeliverySlipMessage" is-full-width />
          <span v-else class="ss-message">{{ committed.defaultDeliverySlipMessage || '—' }}</span>
        </div>
      </div>

      <div v-if="isEditing" class="ws-action-bar">
        <button class="btn-enterprise btn-enterprise--ghost" :disabled="isSaving" @click="requestCancel">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="requestSave">
          {{ isSaving ? t('Saving…') : t('Save changes') }}
        </button>
      </div>
    </section>

    <ConfirmModal
      v-model:is-open="discardOpen"
      :title="t('Discard unsaved changes?')"
      :description="t('Your changes will not be saved.')"
      :confirm-label="t('Discard')"
      :cancel-label="t('Keep editing')"
      @confirm="exitEdit"
    />
    <ConfirmModal
      v-model:is-open="mappingConfirmOpen"
      :title="t('Discount account per product terms')"
      :description="t(`After saving settings changes, sales discount account per product feature can't be deactivated. By ticking sales discount account per product, the product page will be changed with the new look.`)"
      :confirm-label="t('Proceed')"
      :is-danger="false"
      @confirm="saveEdit"
    />
  </div>
</template>

<style scoped>
.ws-page {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
  gap: var(--mp-spacing-6);
}
.ws-section {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
}
.ws-section-header {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-items: start;
  margin-bottom: var(--mp-spacing-3);
}
.ws-section-meta { grid-column: 1 / 7; display: flex; flex-direction: column; }
.ws-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ws-section-header > button { grid-column: 7 / -1; justify-self: start; }
.ws-toggle-list { grid-column: 1 / 7; display: flex; flex-direction: column; }
.ws-subsection-title {
  margin: 0;
  padding: var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ws-subsection-title--spaced { margin-top: var(--mp-spacing-3); }
.ws-rule-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ws-toggle-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-2) 0;
}
.ws-toggle-row--rule {
  display: grid;
  grid-template-columns: 1fr 1fr;
  column-gap: var(--mp-spacing-6);
  align-items: center;
}
.ws-toggle-info { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.ws-toggle-title {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ws-toggle-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ws-toggle-desc--note { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.ws-action-bar {
  grid-column: 1 / 7;
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-4);
}
.ws-action-bar button:disabled { opacity: 0.5; cursor: not-allowed; }

.ss-new {
  padding: 0 var(--mp-spacing-2);
  border-radius: var(--mp-radii-full);
  background: var(--mp-colors-background-danger);
  color: var(--mp-text-danger);
  font-size: var(--mp-font-sizes-xs);
  font-weight: var(--mp-font-weights-semi-bold);
}
.ss-help { display: inline-flex; cursor: help; }
.ss-field {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) 0;
}
.ss-message {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  white-space: pre-line;
}
</style>
