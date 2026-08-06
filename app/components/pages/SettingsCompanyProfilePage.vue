<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import {
  MpToggle, MpIcon, MpInput, MpSelect, MpRadio, MpBadge, toast,
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody,
  MpModalFooter, MpModalOverlay,
} from '@mekari/pixel3'
import centralPerkLogo from '~/assets/images/central-perk-logo.svg?url'
import shortcutIcon from '~/assets/images/shortcut-icon.svg?url'

const { t } = useLocale()

// Which section is currently being edited (only one at a time). Company info is
// synced from the Mekari account, so it is never editable.
type EditSection = null | 'tax' | 'payment' | 'advanced'
const editing = ref<EditSection>(null)

// ─── Display (saved) state ────────────────────────────────────────────────────
const tax = reactive({
  companyType: 'non-pkp' as 'non-pkp' | 'pkp',
  npwp: '00098765432102222',
  nitku: '000022',
  signeeNpwp: '00098765432100000',
  signee: 'R****l C****ra',
  picNpwp: '00098765432100000',
  pic: 'B**u F*****n',
})
const payment = reactive({
  bankName: 'Bank BCA',
  branch: 'BCA KCU Sudirman',
  branchAddress: 'Chase Plaza, DKI Jakarta',
  accountNo: '78806350373',
  accountName: 'PT Central Perk Indonesia',
  swift: '',
})
const advanced = reactive({
  transactionApproval: true,
  multipleWithholdingTax: true,
  companyPerformanceSummary: true,
  taxInclusive: true,
  transactionLog: true,
  multiCurrency: true,
  baseCurrency: 'idr',
  amountDisplay: 'full-decimals',
})

const AMOUNT_DISPLAY_OPTIONS = [
  { value: 'full-decimals', label: t('Full number (with decimals)') },
  { value: 'full', label: t('Full number') },
  { value: 'abbreviated', label: t('Abbreviated (e.g. Rp2 jt)') },
]
const CURRENCY_OPTIONS = [{ value: 'idr', label: t('Indonesian Rupiah (Rp)') }]
const amountDisplayLabel = computed(
  () => AMOUNT_DISPLAY_OPTIONS.find((o) => o.value === advanced.amountDisplay)?.label ?? '—',
)

// ─── Edit drafts + errors ──────────────────────────────────────────────────────
const draftTax = reactive({ ...tax })
const draftPayment = reactive({ ...payment })
const draftAdvanced = reactive({ ...advanced })
const errTax = reactive<Record<string, string>>({})
const errPayment = reactive<Record<string, string>>({})

function startEdit(section: Exclude<EditSection, null>) {
  if (section === 'tax') Object.assign(draftTax, tax)
  if (section === 'payment') Object.assign(draftPayment, payment)
  if (section === 'advanced') Object.assign(draftAdvanced, advanced)
  clearErrors()
  editing.value = section
}
function cancelEdit() {
  editing.value = null
  clearErrors()
}
// Company info is synced from the Mekari account — editing it happens on that
// external domain, so the button opens the account console in a new tab.
function openCompanyInfoSource() {
  window.open('https://account.mekari.com', '_blank', 'noopener')
}
function clearErrors() {
  for (const k of Object.keys(errTax)) delete errTax[k]
  for (const k of Object.keys(errPayment)) delete errPayment[k]
}
/** Clear a single field's error as the user types (called from @input). */
function clearTaxErr(field: string) { if (errTax[field]) delete errTax[field] }
function clearPayErr(field: string) { if (errPayment[field]) delete errPayment[field] }

// UXW copy library — inline error messages.
const req = (label: string) => `${t('You must fill in')} ${label}`

// ─── Tax form ───────────────────────────────────────────────────────────────
function validateTax(): boolean {
  clearErrors()
  if (!draftTax.npwp.trim()) errTax.npwp = req('NPWP')
  return Object.keys(errTax).length === 0
}
function saveTax() {
  if (!validateTax()) return
  Object.assign(tax, draftTax)
  editing.value = null
  toast.notify({ variant: 'success', title: t('Company profile changes saved'), maxWidth: 'max-content' })
}
function validateField(name: string) {
  toast.notify({ variant: 'success', title: `${name} ${t('validated')}`, maxWidth: 'max-content' })
}

// ─── Payment form ─────────────────────────────────────────────────────────────
function validatePayment(): boolean {
  clearErrors()
  if (!draftPayment.bankName.trim()) errPayment.bankName = req(t('bank name'))
  if (!draftPayment.accountNo.trim()) errPayment.accountNo = req(t('account number'))
  if (!draftPayment.accountName.trim()) errPayment.accountName = req(t('account name'))
  return Object.keys(errPayment).length === 0
}
function savePayment() {
  if (!validatePayment()) return
  Object.assign(payment, draftPayment)
  editing.value = null
  toast.notify({ variant: 'success', title: t('Company profile changes saved'), maxWidth: 'max-content' })
}

// ─── Advanced form + multi-currency modal ──────────────────────────────────────
const mcModalOpen = ref(false)
const mcBaseCurrency = ref('idr')
function onMultiCurrencyToggle(v: boolean) {
  // Turning it ON requires confirming the activation terms first.
  if (v && !advanced.multiCurrency) {
    draftAdvanced.multiCurrency = false // stays off until Activate confirms
    mcBaseCurrency.value = draftAdvanced.baseCurrency
    mcModalOpen.value = true
  } else {
    draftAdvanced.multiCurrency = v
  }
}
function activateMultiCurrency() {
  draftAdvanced.multiCurrency = true
  draftAdvanced.baseCurrency = mcBaseCurrency.value
  mcModalOpen.value = false
  toast.notify({ variant: 'success', title: t('Multi-currency activation scheduled'), maxWidth: 'max-content' })
}
function cancelMultiCurrency() {
  draftAdvanced.multiCurrency = false
  mcModalOpen.value = false
}
function setAdvancedToggle(key: string, v: boolean) {
  ;(draftAdvanced as Record<string, unknown>)[key] = v
}
function saveAdvanced() {
  Object.assign(advanced, draftAdvanced)
  editing.value = null
  toast.notify({ variant: 'success', title: t('Company profile changes saved'), maxWidth: 'max-content' })
}

const ADVANCED_TOGGLES = [
  { key: 'transactionApproval', title: t('Transaction approval'), desc: t('Transactions require approval before they are processed.') },
  { key: 'multipleWithholdingTax', title: t('Multiple withholding tax'), desc: t('Multiple withholding tax lines can be added per transaction.') },
  { key: 'companyPerformanceSummary', title: t('Company performance summary'), desc: t('A weekly performance summary will be sent to your email.') },
  { key: 'taxInclusive', title: t('Tax inclusive'), desc: t('Include tax (PPN) in transaction prices by default.') },
  { key: 'transactionLog', title: t('Transaction log'), desc: t('A detailed audit trail is recorded for user activities.') },
  { key: 'multiCurrency', title: t('Multi-currency'), desc: t('Transactions can be made in foreign currencies.') },
] as const
</script>

<template>
  <div class="cp-page">

    <!-- ── Company info (synced — edit disabled) ───────────────────────────── -->
    <section class="cp-section">
      <div class="cp-section-header">
        <div class="cp-section-meta">
          <h2 class="cp-section-title">{{ t('Company info') }}</h2>
          <p class="cp-section-desc">{{ t('Synced from your Mekari account and used for invoices.') }}</p>
        </div>
        <button
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-after"
          :title="t('Edit in your Mekari account (opens in a new tab)')"
          @click="openCompanyInfoSource"
        >
          {{ t('Edit') }}
          <img :src="shortcutIcon" class="cp-shortcut-icon" alt="" />
        </button>
      </div>

      <div class="cp-grid">
        <div class="cp-field">
          <span class="cp-label">{{ t('Company name') }}</span>
          <span class="cp-value">PT Central Perk Indonesia</span>
        </div>
        <div class="cp-field">
          <span class="cp-label">{{ t('Company address') }}</span>
          <span class="cp-value">
            MidPlaza 2 Lantai 4<br>
            Jl. Jenderal Sudirman No.Kav. 10-11, Kec. Tanah Abang,<br>
            Jakarta Pusat, DKI Jakarta 10220
          </span>
        </div>
        <div class="cp-field">
          <span class="cp-label">{{ t('Email') }}</span>
          <span class="cp-value">rizal.candra@centralperk.co.id</span>
        </div>
        <div class="cp-field">
          <span class="cp-label">{{ t('Phone') }}</span>
          <span class="cp-value">+628129209988</span>
        </div>
        <div class="cp-field">
          <span class="cp-label">{{ t('Account owner') }}</span>
          <span class="cp-value">
            Rizal Candra<br>
            <span class="cp-value-subtle">rizal.candra@centralperk.co.id</span>
          </span>
        </div>
        <div class="cp-field">
          <span class="cp-label">{{ t('Company ID') }}</span>
          <span class="cp-value">676424</span>
        </div>
      </div>

      <div class="cp-field cp-field--logo">
        <span class="cp-label">{{ t('Company logo') }}</span>
        <img :src="centralPerkLogo" alt="Central Perk" class="cp-logo-img" />
      </div>

      <div class="cp-grid cp-grid--spaced">
        <div class="cp-field">
          <span class="cp-label">{{ t('Shipping address') }}</span>
          <span class="cp-value">
            MidPlaza 2 Lantai 4<br>
            Jl. Jenderal Sudirman No.Kav. 10-11, Kec. Tanah Abang,<br>
            Jakarta Pusat, DKI Jakarta 10220
          </span>
        </div>
        <div class="cp-field">
          <span class="cp-label">{{ t('Fax') }}</span>
          <span class="cp-value">+62215559999</span>
        </div>
        <div class="cp-field">
          <span class="cp-label">{{ t('Website') }}</span>
          <a href="https://centralperk.co.id" class="cp-link" target="_blank" rel="noopener">https://centralperk.co.id</a>
        </div>
      </div>
    </section>

    <div class="cp-divider" />

    <!-- ── Tax info ─────────────────────────────────────────────────────────── -->
    <section class="cp-section">
      <div class="cp-section-header">
        <div class="cp-section-meta">
          <h2 class="cp-section-title">{{ editing === 'tax' ? t('Edit tax info') : t('Tax info') }}</h2>
          <p class="cp-section-desc">{{ t('This information appears on invoices and tax documents.') }}</p>
        </div>
        <button
          v-if="editing !== 'tax'"
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before"
          @click="startEdit('tax')"
        >
          <MpIcon name="edit" size="sm" />
          {{ t('Edit') }}
        </button>
      </div>

      <!-- Read mode -->
      <template v-if="editing !== 'tax'">
        <div class="cp-subhead">
          <span class="cp-subhead-title">{{ t('Tax identity') }}</span>
          <MpBadge for="tableStatus" type="completed" size="sm">{{ t('Validated') }}</MpBadge>
        </div>
        <p class="cp-subhead-desc">{{ t('NPWP details') }}</p>
        <div class="cp-grid">
          <div class="cp-field">
            <span class="cp-label">NPWP <MpBadge for="tableStatus" type="announcement" size="sm">{{ t('Not validated') }}</MpBadge></span>
            <span class="cp-value">{{ tax.npwp }}</span>
          </div>
          <div class="cp-field">
            <span class="cp-label">NITKU</span>
            <span class="cp-value">{{ tax.nitku || '—' }}</span>
          </div>
        </div>
        <div class="cp-subhead cp-subhead--spaced">
          <span class="cp-subhead-title">{{ t('Coretax info') }}</span>
        </div>
        <p class="cp-subhead-desc">{{ t('Enter Coretax information to validate your e-faktur.') }}</p>
        <div class="cp-grid">
          <div class="cp-field">
            <span class="cp-label">{{ t('NPWP signee') }} <MpBadge for="tableStatus" type="completed" size="sm">{{ t('Validated') }}</MpBadge></span>
            <span class="cp-value">{{ tax.signeeNpwp }}<br><span class="cp-value-subtle">{{ tax.signee }}</span></span>
          </div>
          <div class="cp-field">
            <span class="cp-label">{{ t('NPWP PIC') }} <MpBadge for="tableStatus" type="completed" size="sm">{{ t('Validated') }}</MpBadge></span>
            <span class="cp-value">{{ tax.picNpwp }}<br><span class="cp-value-subtle">{{ tax.pic }}</span></span>
          </div>
        </div>
      </template>

      <!-- Edit mode -->
      <template v-else>
        <div class="cp-form">
          <div class="cp-field-group">
            <span class="cp-form-label">{{ t('Company type') }}</span>
            <label class="cp-radio">
              <MpRadio id="cp-type-nonpkp" name="cp-company-type" value="non-pkp" :is-checked="draftTax.companyType === 'non-pkp'" @change="draftTax.companyType = 'non-pkp'" />
              <span class="cp-radio-text">
                <span class="cp-radio-title">{{ t('Non-PKP (Not VAT-registered)') }}</span>
                <span class="cp-radio-desc">{{ t('Your business has not registered for VAT.') }}</span>
              </span>
            </label>
            <label class="cp-radio">
              <MpRadio id="cp-type-pkp" name="cp-company-type" value="pkp" :is-checked="draftTax.companyType === 'pkp'" @change="draftTax.companyType = 'pkp'" />
              <span class="cp-radio-text">
                <span class="cp-radio-title">{{ t('PKP (VAT-registered)') }}</span>
                <span class="cp-radio-desc">{{ t('Your business collects and reports VAT.') }}</span>
              </span>
            </label>
          </div>

          <div class="cp-subhead cp-subhead--spaced">
            <span class="cp-subhead-title">{{ t('Tax identity') }}</span>
            <MpBadge for="tableStatus" type="completed" size="sm">{{ t('Validated') }}</MpBadge>
          </div>
          <p class="cp-subhead-desc">{{ t('Enter your NPWP and business location number (NITKU) to validate e-invoicing.') }}</p>
          <div class="cp-validate-row">
            <MpFormControl id="cp-npwp" :is-invalid="!!errTax.npwp" class="cp-vf">
              <div class="cp-label-row">
                <MpFormLabel>NPWP</MpFormLabel>
                <span class="cp-counter">{{ draftTax.npwp.length }}/16</span>
              </div>
              <MpInput id="cp-npwp-input" v-model="draftTax.npwp" is-full-width @update:model-value="clearTaxErr('npwp')" />
              <MpFormErrorMessage>{{ errTax.npwp }}</MpFormErrorMessage>
            </MpFormControl>
            <MpFormControl id="cp-nitku" class="cp-vf">
              <div class="cp-label-row">
                <MpFormLabel>NITKU</MpFormLabel>
                <span class="cp-counter">{{ draftTax.nitku.length }}/6</span>
              </div>
              <MpInput id="cp-nitku-input" v-model="draftTax.nitku" is-full-width />
            </MpFormControl>
            <button type="button" class="btn-enterprise btn-enterprise--secondary cp-validate-btn" @click="validateField('NPWP')">{{ t('Validate') }}</button>
          </div>

          <div class="cp-subhead cp-subhead--spaced">
            <span class="cp-subhead-title">{{ t('Coretax info') }}</span>
            <MpBadge for="tableStatus" type="completed" size="sm">{{ t('Validated') }}</MpBadge>
          </div>
          <p class="cp-subhead-desc">{{ t('Authorized person details for tax filing, pulled from your tax identity.') }}</p>
          <div class="cp-validate-row">
            <MpFormControl id="cp-signee-npwp" class="cp-vf">
              <MpFormLabel>{{ t('NPWP signee') }}</MpFormLabel>
              <MpInput id="cp-signee-npwp-input" v-model="draftTax.signeeNpwp" is-full-width />
            </MpFormControl>
            <MpFormControl id="cp-signee" class="cp-vf">
              <MpFormLabel>{{ t('Signee') }}</MpFormLabel>
              <MpInput id="cp-signee-input" v-model="draftTax.signee" is-full-width />
            </MpFormControl>
            <button type="button" class="btn-enterprise btn-enterprise--secondary cp-validate-btn" @click="validateField('Signee')">{{ t('Validate') }}</button>
          </div>
          <div class="cp-validate-row">
            <MpFormControl id="cp-pic-npwp" class="cp-vf">
              <MpFormLabel>{{ t('NPWP PIC') }}</MpFormLabel>
              <MpInput id="cp-pic-npwp-input" v-model="draftTax.picNpwp" is-full-width />
            </MpFormControl>
            <MpFormControl id="cp-pic" class="cp-vf">
              <MpFormLabel>{{ t('PIC') }}</MpFormLabel>
              <MpInput id="cp-pic-input" v-model="draftTax.pic" is-full-width />
            </MpFormControl>
            <button type="button" class="btn-enterprise btn-enterprise--secondary cp-validate-btn" @click="validateField('PIC')">{{ t('Validate') }}</button>
          </div>

          <div class="cp-action-bar">
            <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="cancelEdit">{{ t('Cancel') }}</button>
            <button type="button" class="btn-enterprise btn-enterprise--primary" @click="saveTax">{{ t('Save changes') }}</button>
          </div>
        </div>
      </template>
    </section>

    <div class="cp-divider" />

    <!-- ── Payment info ─────────────────────────────────────────────────────── -->
    <section class="cp-section">
      <div class="cp-section-header">
        <div class="cp-section-meta">
          <h2 class="cp-section-title">{{ editing === 'payment' ? t('Edit payment info') : t('Payment info') }}</h2>
          <p class="cp-section-desc">{{ t('Bank details appear on sales invoices.') }}</p>
        </div>
        <button
          v-if="editing !== 'payment'"
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before"
          @click="startEdit('payment')"
        >
          <MpIcon name="edit" size="sm" />
          {{ t('Edit') }}
        </button>
      </div>

      <!-- Read mode -->
      <div v-if="editing !== 'payment'" class="cp-grid">
        <div class="cp-field"><span class="cp-label">{{ t('Bank name') }}</span><span class="cp-value">{{ payment.bankName || '—' }}</span></div>
        <div class="cp-field"><span class="cp-label">{{ t('Branch') }}</span><span class="cp-value">{{ payment.branch || '—' }}</span></div>
        <div class="cp-field"><span class="cp-label">{{ t('Branch address') }}</span><span class="cp-value">{{ payment.branchAddress || '—' }}</span></div>
        <div class="cp-field"><span class="cp-label">{{ t('Account no.') }}</span><span class="cp-value">{{ payment.accountNo || '—' }}</span></div>
        <div class="cp-field"><span class="cp-label">{{ t('Account name') }}</span><span class="cp-value">{{ payment.accountName || '—' }}</span></div>
        <div class="cp-field"><span class="cp-label">{{ t('SWIFT code') }}</span><span class="cp-value">{{ payment.swift || '—' }}</span></div>
      </div>

      <!-- Edit mode -->
      <div v-else class="cp-form">
        <MpFormControl id="cp-bank-name" :is-invalid="!!errPayment.bankName">
          <MpFormLabel>{{ t('Bank name') }}</MpFormLabel>
          <MpInput id="cp-bank-name-input" v-model="draftPayment.bankName" is-full-width @update:model-value="clearPayErr('bankName')" />
          <MpFormErrorMessage>{{ errPayment.bankName }}</MpFormErrorMessage>
        </MpFormControl>
        <div class="cp-form-grid">
          <MpFormControl id="cp-branch">
            <MpFormLabel>{{ t('Branch') }}</MpFormLabel>
            <MpInput id="cp-branch-input" v-model="draftPayment.branch" is-full-width />
          </MpFormControl>
          <MpFormControl id="cp-branch-addr">
            <MpFormLabel>{{ t('Branch address') }}</MpFormLabel>
            <MpInput id="cp-branch-addr-input" v-model="draftPayment.branchAddress" is-full-width />
          </MpFormControl>
          <MpFormControl id="cp-account-no" :is-invalid="!!errPayment.accountNo">
            <MpFormLabel>{{ t('Account no.') }}</MpFormLabel>
            <MpInput id="cp-account-no-input" v-model="draftPayment.accountNo" is-full-width @update:model-value="clearPayErr('accountNo')" />
            <MpFormErrorMessage>{{ errPayment.accountNo }}</MpFormErrorMessage>
          </MpFormControl>
          <MpFormControl id="cp-account-name" :is-invalid="!!errPayment.accountName">
            <MpFormLabel>{{ t('Account name') }}</MpFormLabel>
            <MpInput id="cp-account-name-input" v-model="draftPayment.accountName" is-full-width @update:model-value="clearPayErr('accountName')" />
            <MpFormErrorMessage>{{ errPayment.accountName }}</MpFormErrorMessage>
          </MpFormControl>
        </div>
        <div class="cp-form-grid">
          <MpFormControl id="cp-swift">
            <MpFormLabel>{{ t('SWIFT code') }}</MpFormLabel>
            <MpInput id="cp-swift-input" v-model="draftPayment.swift" is-full-width />
          </MpFormControl>
        </div>
        <div class="cp-action-bar">
          <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="cancelEdit">{{ t('Cancel') }}</button>
          <button type="button" class="btn-enterprise btn-enterprise--primary" @click="savePayment">{{ t('Save changes') }}</button>
        </div>
      </div>
    </section>

    <div class="cp-divider" />

    <!-- ── Advanced settings ────────────────────────────────────────────────── -->
    <section class="cp-section">
      <div class="cp-section-header">
        <div class="cp-section-meta">
          <h2 class="cp-section-title">{{ editing === 'advanced' ? t('Edit advanced settings') : t('Advanced settings') }}</h2>
          <p class="cp-section-desc">{{ t('System-wide settings for transactions, approvals, and currencies.') }}</p>
        </div>
        <button
          v-if="editing !== 'advanced'"
          class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before"
          @click="startEdit('advanced')"
        >
          <MpIcon name="edit" size="sm" />
          {{ t('Edit') }}
        </button>
      </div>

      <div class="cp-toggles">
        <div v-for="toggle in ADVANCED_TOGGLES" :key="toggle.key" class="cp-toggle-row">
          <div class="cp-toggle-info">
            <span class="cp-toggle-title">{{ toggle.title }}</span>
            <span class="cp-toggle-desc">{{ toggle.desc }}</span>
          </div>
          <MpToggle
            v-if="editing !== 'advanced'"
            :is-checked="advanced[toggle.key] as boolean"
            :is-disabled="true"
            :aria-label="toggle.title"
          />
          <MpToggle
            v-else-if="toggle.key === 'multiCurrency'"
            :is-checked="draftAdvanced.multiCurrency"
            :aria-label="toggle.title"
            @update:is-checked="onMultiCurrencyToggle"
          />
          <MpToggle
            v-else
            :is-checked="draftAdvanced[toggle.key] as boolean"
            :aria-label="toggle.title"
            @update:is-checked="(v: boolean) => setAdvancedToggle(toggle.key, v)"
          />
        </div>
      </div>

      <!-- Read mode: currency info as text -->
      <div v-if="editing !== 'advanced'" class="cp-currency-info">
        <span class="cp-value">{{ t('Base currency:') }} {{ t('Indonesian Rupiah (Rp)') }}</span>
        <span class="cp-value">{{ t('Amount display:') }} {{ amountDisplayLabel }}, {{ t('e.g. Rp2.000.000,00') }}</span>
      </div>

      <!-- Edit mode: currency selects + action bar -->
      <div v-else class="cp-form cp-form--currency">
        <MpFormControl id="cp-base-currency" class="cp-form-field--half">
          <MpFormLabel>{{ t('Base currency') }}</MpFormLabel>
          <MpSelect id="cp-base-currency-select" :model-value="draftAdvanced.baseCurrency" :is-disabled="true">
            <option v-for="c in CURRENCY_OPTIONS" :key="c.value" :value="c.value">{{ c.label }}</option>
          </MpSelect>
          <span class="cp-help">{{ t('Base currency cannot be changed after it is used in transactions') }}</span>
        </MpFormControl>
        <MpFormControl id="cp-amount-display" class="cp-form-field--half">
          <MpFormLabel>{{ t('Amount display') }}</MpFormLabel>
          <MpSelect id="cp-amount-display-select" :model-value="draftAdvanced.amountDisplay" @change="(_e: Event, v: string) => (draftAdvanced.amountDisplay = v)">
            <option v-for="o in AMOUNT_DISPLAY_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
          </MpSelect>
          <span class="cp-help">{{ t('e.g. Rp2.000.000,00') }}</span>
        </MpFormControl>
        <div class="cp-action-bar">
          <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="cancelEdit">{{ t('Cancel') }}</button>
          <button type="button" class="btn-enterprise btn-enterprise--primary" @click="saveAdvanced">{{ t('Save changes') }}</button>
        </div>
      </div>
    </section>

    <!-- ── Activate Multi-currency modal ────────────────────────────────────── -->
    <MpModal id="cp-multicurrency-modal" :is-open="mcModalOpen" is-centered :is-keep-alive="false" @close="cancelMultiCurrency">
      <MpModalContent>
        <MpModalHeader>
          {{ t('Activate Multi-currency?') }}
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <MpFormControl id="cp-mc-base-currency" is-required class="cp-mc-currency">
            <MpFormLabel>{{ t('Base currency') }}</MpFormLabel>
            <MpSelect id="cp-mc-base-currency-select" :model-value="mcBaseCurrency" @change="(_e: Event, v: string) => (mcBaseCurrency = v)">
              <option v-for="c in CURRENCY_OPTIONS" :key="c.value" :value="c.value">{{ c.label }}</option>
            </MpSelect>
          </MpFormControl>
          <h3 class="cp-mc-terms-title">{{ t('Activation terms') }}</h3>
          <ol class="cp-mc-terms">
            <li>{{ t('Activation will begin at') }} <strong>{{ t('00:00 WIB the following day') }}</strong>. {{ t('You cannot create transactions during the activation process.') }}</li>
            <li>{{ t('The base currency cannot be changed after activation.') }}</li>
            <li>{{ t('This feature is not compatible with Jurnal Consolidation yet.') }}</li>
            <li>
              {{ t('This feature cannot be deactivated if you have:') }}
              <ul class="cp-mc-sublist">
                <li>{{ t('Added another currency.') }}</li>
                <li>{{ t('Added an account (COA) with another currency.') }}</li>
                <li>{{ t('Created transactions after activation, including those using only the base currency.') }}</li>
              </ul>
            </li>
          </ol>
        </MpModalBody>
        <MpModalFooter>
          <div class="cp-action-bar cp-action-bar--modal">
            <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="cancelMultiCurrency">{{ t('Cancel') }}</button>
            <button type="button" class="btn-enterprise btn-enterprise--primary" @click="activateMultiCurrency">{{ t('Activate') }}</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

  </div>
</template>

<style scoped>
/* ─── Page root — 12-column grid (same format as settings/warehouse) ───────── */
.cp-page {
  /* No inner scroll — the surrounding .stage owns the scroll (page/browser). */
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
}

/* ─── Section (12-col; content lives in the first 6 columns) ───────────────── */
.cp-section {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-content: start;
  padding: var(--mp-spacing-6) 0;
}
.cp-section:first-child { padding-top: 0; }

.cp-section-header {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  align-items: start;
  margin-bottom: var(--mp-spacing-4);
}
.cp-section-meta { grid-column: 1 / 7; display: flex; flex-direction: column; }
/* Edit button sits in the 7th grid column, left-aligned (like settings/warehouse) */
.cp-section-header > button { grid-column: 7 / -1; justify-self: start; }

/* Section content — every block below the header lives in the left 6 columns */
.cp-section > :not(.cp-section-header) { grid-column: 1 / 7; }

.cp-section-title {
  margin: 0 0 var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.cp-section-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-subtle);
}

.cp-divider { grid-column: 1 / -1; height: 1px; background: var(--mp-border-default); }

/* ─── Sub-headings (Tax identity / Coretax info) ───────────────────────────── */
.cp-subhead { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cp-subhead--spaced { margin-top: var(--mp-spacing-6); }
.cp-subhead-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.cp-subhead-desc {
  /* No gap from the sub-heading above; 12px down to the fields below. */
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
}


/* ─── Read-mode info grid ───────────────────────────────────────────────────── */
.cp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--mp-spacing-5) var(--mp-spacing-8);
}
.cp-grid--spaced { margin-top: var(--mp-spacing-5); }

.cp-field { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-1); }
.cp-field--logo { margin-top: var(--mp-spacing-5); }

.cp-label {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
}
.cp-value {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
}
.cp-value-subtle { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }

.cp-link { font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); text-decoration: none; }
.cp-link:hover { text-decoration: underline; }

/* ─── Company logo ──────────────────────────────────────────────────────────── */
.cp-logo-img { display: block; height: var(--mp-sizes-6); width: auto; margin-top: var(--mp-spacing-1); }

/* Shortcut arrow (↗) on the Company info Edit button — same asset as the sidebar */
.cp-shortcut-icon { width: var(--mp-sizes-4); height: var(--mp-sizes-4); }

/* ─── Forms ─────────────────────────────────────────────────────────────────── */
.cp-form { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.cp-form--currency { gap: var(--mp-spacing-5); }

.cp-form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--mp-spacing-4) var(--mp-spacing-8);
}
/* MpFormControl width constraint for half-width fields */
.cp-form-field--half { max-width: 336px; }

/* Group label (Company type) + NPWP/NITKU counter row */
.cp-form-label { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cp-label-row { display: flex; align-items: baseline; justify-content: space-between; }
.cp-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.cp-help { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }

.cp-field-group { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.cp-radio { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); cursor: pointer; }
.cp-radio-text { display: flex; flex-direction: column; }
.cp-radio-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cp-radio-desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }

/* NPWP + NITKU + Validate on one row */
.cp-validate-row { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); }
.cp-validate-row .cp-vf { flex: 1; max-width: 240px; }
.cp-validate-btn { flex-shrink: 0; margin-top: var(--mp-spacing-6); }

/* ─── Advanced settings toggles ─────────────────────────────────────────────── */
.cp-toggles { display: flex; flex-direction: column; }
.cp-toggle-row {
  display: grid;
  grid-template-columns: 4fr 2fr;   /* info = 4 grid, toggle = 2 grid */
  align-items: center;
  gap: var(--mp-spacing-6);          /* 24px between the two columns */
  padding: var(--mp-spacing-3) 0;
}
.cp-toggle-row > :last-child { justify-self: start; }
.cp-toggle-info { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.cp-toggle-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cp-toggle-desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }

.cp-currency-info { display: flex; flex-direction: column; gap: var(--mp-spacing-1); margin-top: var(--mp-spacing-4); }
.cp-currency-info .cp-value { color: var(--mp-text-default); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-normal); }

/* ─── Action bar (Cancel / Save changes) ────────────────────────────────────── */
.cp-action-bar {
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  margin-top: var(--mp-spacing-4);
}
.cp-action-bar--modal { margin-top: 0; }

/* ─── Multi-currency modal ──────────────────────────────────────────────────── */
.cp-mc-currency { max-width: 320px; margin-bottom: var(--mp-spacing-5); }
.cp-mc-terms-title {
  margin: 0 0 var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.cp-mc-terms {
  margin: 0;
  padding-left: var(--mp-spacing-5);
  list-style-type: decimal;   /* 1. 2. 3. 4. */
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-default);
}
.cp-mc-terms > li { margin-bottom: var(--mp-spacing-2); }
.cp-mc-terms > li:last-child { margin-bottom: 0; }
.cp-mc-sublist {
  margin: var(--mp-spacing-1) 0 0;
  padding-left: var(--mp-spacing-5);
  list-style-type: disc;      /* • dot bullets */
  color: var(--mp-text-subtle);
}
.cp-mc-sublist > li { margin-bottom: var(--mp-spacing-1); }
.cp-mc-sublist > li:last-child { margin-bottom: 0; }
</style>
