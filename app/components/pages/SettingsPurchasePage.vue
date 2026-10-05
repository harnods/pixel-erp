<!-- prod-parity: jurnal-doctor/services/quickbook/app/views/company/_purchase_setting_inputs.html.haml -->
<script setup lang="ts">
import { MpToggle, MpTextarea, toast } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import {
  getPurchaseSettings, savePurchaseSettings, TERM_OPTIONS, type PurchaseSettings,
} from '~/data/companySettings'

const { t } = useLocale()

const committed = reactive<PurchaseSettings>(getPurchaseSettings())
const draft = reactive<PurchaseSettings>({ ...committed })

const isEditing = ref(false)
const isSaving = ref(false)
const discardOpen = ref(false)
const hasChanges = computed(() => (Object.keys(committed) as (keyof PurchaseSettings)[]).some(k => draft[k] !== committed[k]))

type ToggleKey = 'purchaseRequestSupplier' | 'shipping' | 'discount' | 'discountLines' | 'deposit'
const toggleRows: { key: ToggleKey; title: string }[] = [
  { key: 'purchaseRequestSupplier', title: 'Activate supplier in purchase request' },
  { key: 'shipping', title: 'Shipping' },
  { key: 'discount', title: 'Discount' },
  { key: 'discountLines', title: 'Discount per lines' },
  { key: 'deposit', title: 'Deposit' },
]

function startEdit() { Object.assign(draft, committed); isEditing.value = true }
function requestCancel() { if (hasChanges.value) discardOpen.value = true; else exitEdit() }
function exitEdit() { Object.assign(draft, committed); isEditing.value = false; discardOpen.value = false }
async function saveEdit() {
  isSaving.value = true
  await new Promise(r => setTimeout(r, 500))
  Object.assign(committed, draft)
  savePurchaseSettings({ ...committed })
  isSaving.value = false
  isEditing.value = false
  toast.notify({ variant: 'success', title: t('Purchase settings changes saved'), maxWidth: 'max-content' })
}
</script>

<template>
  <div class="ws-page">
    <section class="ws-section">
      <div class="ws-section-header">
        <div class="ws-section-meta">
          <h2 class="ws-section-title">{{ t('Purchase') }}</h2>
        </div>
        <button v-if="!isEditing" class="btn-enterprise btn-enterprise--secondary" @click="startEdit">{{ t('Edit') }}</button>
      </div>

      <div class="ws-toggle-list">
        <div class="ws-toggle-row ws-toggle-row--rule">
          <div class="ws-toggle-info">
            <span class="ws-toggle-title">{{ t('Preferred purchase term') }}</span>
          </div>
          <ErpFilterSelect
            v-if="isEditing"
            id="ps-purchase-term"
            v-model="draft.preferredPurchaseTerm"
            :placeholder="t('Select term')"
            :options="TERM_OPTIONS"
            :is-clearable="false"
            width="100%"
          />
          <span v-else class="ws-rule-value">{{ committed.preferredPurchaseTerm }}</span>
        </div>

        <div v-for="row in toggleRows" :key="row.key" class="ws-toggle-row">
          <div class="ws-toggle-info">
            <span class="ws-toggle-title">{{ t(row.title) }}</span>
          </div>
          <MpToggle :id="`ps-${row.key}`" v-model:is-checked="draft[row.key]" :is-disabled="!isEditing" :aria-label="t(row.title)" />
        </div>

        <h3 class="ws-subsection-title ws-subsection-title--spaced">{{ t('Messages') }}</h3>
        <div class="ss-field">
          <span class="ws-toggle-title">{{ t('Default purchase message') }}</span>
          <MpTextarea v-if="isEditing" id="ps-purchase-message" v-model="draft.defaultPurchaseMessage" is-full-width />
          <span v-else class="ss-message">{{ committed.defaultPurchaseMessage || '—' }}</span>
        </div>
      </div>

      <div v-if="isEditing" class="ws-action-bar">
        <button class="btn-enterprise btn-enterprise--ghost" :disabled="isSaving" @click="requestCancel">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="saveEdit">
          {{ isSaving ? t('Saving…') : t('Update') }}
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
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ws-action-bar {
  grid-column: 1 / 7;
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-4);
}
.ws-action-bar button:disabled { opacity: 0.5; cursor: not-allowed; }
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
