<script setup lang="ts">
import { ref, reactive, computed } from 'vue'
import {
  MpToggle, MpIcon, MpInput, MpSelect, MpRadio, MpBadge, MpSpinner, toast,
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody,
  MpModalFooter, MpModalOverlay,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import centralPerkLogo from '~/assets/images/central-perk-logo.svg?url'
import shortcutIcon from '~/assets/images/shortcut-icon.svg?url'

const { t } = useLocale()
const { amountDisplay: amountDisplaySetting, setAmountDisplay } = useCurrencySettings()

// The select's 3 options ↔ the currency setting's 3 modes (1:1).
const displayToSetting: Record<string, 'with-decimals' | 'without-decimals' | 'abbreviated'> = {
  'full-decimals': 'with-decimals',
  full: 'without-decimals',
  abbreviated: 'abbreviated',
}
const settingToDisplay: Record<string, string> = {
  'with-decimals': 'full-decimals',
  'without-decimals': 'full',
  abbreviated: 'abbreviated',
}

// Which section is currently being edited (only one at a time). Company info is
// synced from the Mekari account, so it is never editable.
type EditSection = null | 'tax' | 'payment' | 'advanced'
const editing = ref<EditSection>(null)

// ─── Klikpajak link status — demo toggle ───────────────────────────────────────
// Simulates whether this company's SSO ID is already registered in Klikpajak.
// In production this would be detected from the backend; the FAB at the bottom
// of the page lets us preview both onboarding scenarios in this prototype.
type KlikpajakStatus = 'registered' | 'not_registered'
const klikpajakStatus = ref<KlikpajakStatus>('registered')

function taxDataFor(status: KlikpajakStatus) {
  return status === 'registered'
    ? {
        companyType: 'pkp' as 'non-pkp' | 'pkp',
        npwp: '00098765432102222',
        nitku: '000022',
        npwpValidated: true,
        signeeNpwp: '0009876543210000',
        signee: 'R****l C****ra',
        signeeValidated: true,
        picNpwp: '0009876543210000',
        pic: 'B**u F*****n',
        picValidated: true,
      }
    : {
        companyType: 'non-pkp' as 'non-pkp' | 'pkp',
        npwp: '',
        nitku: '',
        npwpValidated: false,
        signeeNpwp: '',
        signee: '',
        signeeValidated: false,
        picNpwp: '',
        pic: '',
        picValidated: false,
      }
}

// ─── Display (saved) state ────────────────────────────────────────────────────
const tax = reactive(taxDataFor(klikpajakStatus.value))

function setKlikpajakStatus(status: KlikpajakStatus) {
  klikpajakStatus.value = status
  Object.assign(tax, taxDataFor(status))
  cancelEdit()
}
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
  // Reflect the persisted currency setting into the select's initial value.
  amountDisplay: settingToDisplay[amountDisplaySetting.value] ?? 'full-decimals',
})

const AMOUNT_DISPLAY_OPTIONS = [
  { value: 'full-decimals', label: t('Full number (with decimals)'), example: 'Rp2.000.000,00' },
  { value: 'full', label: t('Full number'), example: 'Rp2.000.000' },
  { value: 'abbreviated', label: t('Abbreviated'), example: 'Rp2 jt' },
]
const CURRENCY_OPTIONS = [{ value: 'idr', label: t('Indonesian Rupiah (Rp)') }]
const amountDisplayLabel = computed(
  () => AMOUNT_DISPLAY_OPTIONS.find((o) => o.value === advanced.amountDisplay)?.label ?? '—',
)
// Each option carries only its OWN example — no doubled/hardcoded second example.
const amountDisplayExample = computed(
  () => AMOUNT_DISPLAY_OPTIONS.find((o) => o.value === advanced.amountDisplay)?.example ?? '',
)
const draftAmountDisplayExample = computed(
  () => AMOUNT_DISPLAY_OPTIONS.find((o) => o.value === draftAdvanced.amountDisplay)?.example ?? '',
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
  taxIdentityError.value = ''
}
/** Clear a single field's error as the user types (called from @input). */
function clearTaxErr(field: string) {
  if (errTax[field]) delete errTax[field]
  if (field === 'npwp' || field === 'nitku') taxIdentityError.value = ''
}
function clearPayErr(field: string) { if (errPayment[field]) delete errPayment[field] }

// ─── NPWP/NITKU validation — confirm modal + simulated Klikpajak account creation ──
// The "not registered" scenario has 3 possible outcomes once Klikpajak checks the
// NPWP/NITKU. Real behavior would come from the backend; the demo FAB lets us
// preview all 3 in this prototype.
type NpwpCheckOutcome = 'valid' | 'invalid' | 'already_registered'
const npwpCheckOutcome = ref<NpwpCheckOutcome>('valid')
const taxIdentityError = ref('')
const klikpajakConfirmOpen = ref(false)
const validatingNpwp = ref(false)
function openValidateNpwpConfirm() {
  clearTaxErr('npwp')
  clearTaxErr('nitku')
  if (!draftTax.npwp.trim()) errTax.npwp = req('NPWP')
  if (!draftTax.nitku.trim()) errTax.nitku = req('NITKU')
  if (errTax.npwp || errTax.nitku) return
  klikpajakConfirmOpen.value = true
}
function cancelValidateNpwpConfirm() {
  klikpajakConfirmOpen.value = false
}
async function confirmValidateNpwp() {
  klikpajakConfirmOpen.value = false
  validatingNpwp.value = true
  taxIdentityError.value = ''
  await new Promise((resolve) => setTimeout(resolve, 1200))
  validatingNpwp.value = false

  if (npwpCheckOutcome.value === 'invalid') {
    taxIdentityError.value = t('NPWP dan NITKU tidak ditemukan')
    return
  }
  if (npwpCheckOutcome.value === 'already_registered') {
    taxIdentityError.value = t('NPWP and NITKU are already registered in Klikpajak. Contact Support.')
    return
  }
  draftTax.npwpValidated = true
  toast.notify({ variant: 'success', title: t('NPWP and NITKU validated'), maxWidth: 'max-content' })
}

// ─── Coretax info — per-field (signee / PIC) validation with a passphrase check ──
// Editing a signee/PIC field invalidates it again, so Validate re-enables; unchanged
// (already-validated) fields keep Validate disabled and show a checkmark instead.
type CoretaxField = 'signee' | 'pic'
const coretaxErr = reactive<Record<CoretaxField, string>>({ signee: '', pic: '' })
const coretaxField = ref<CoretaxField>('signee')
const coretaxConfirmOpen = ref(false)
const coretaxPassphrase = ref('')
const coretaxPassphraseError = ref('')
const coretaxPassphraseVisible = ref(false)
function clearCoretaxField(field: CoretaxField) {
  if (field === 'signee') draftTax.signeeValidated = false
  else draftTax.picValidated = false
  coretaxErr[field] = ''
}
// Signee/PIC names aren't typed — they're looked up from a complete (16-digit)
// NPWP, same as a real Coretax/DJP name lookup, and shown masked + disabled.
const CORETAX_NAME_POOL = ['R****l C****ra', 'S****i P****wi', 'A****d N****an', 'D****i K****ta']
function lookupCoretaxName(npwp: string) {
  const sum = npwp.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return CORETAX_NAME_POOL[sum % CORETAX_NAME_POOL.length]
}
function onCoretaxNpwpInput(field: CoretaxField, value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 16)
  const name = digits.length === 16 ? lookupCoretaxName(digits) : ''
  if (field === 'signee') {
    draftTax.signeeNpwp = digits
    draftTax.signee = name
  } else {
    draftTax.picNpwp = digits
    draftTax.pic = name
  }
  clearCoretaxField(field)
}
function openValidateCoretax(field: CoretaxField) {
  const npwpVal = field === 'signee' ? draftTax.signeeNpwp : draftTax.picNpwp
  const nameVal = field === 'signee' ? draftTax.signee : draftTax.pic
  coretaxErr[field] = ''
  if (!npwpVal.trim() || !nameVal.trim()) {
    coretaxErr[field] = req(field === 'signee' ? t('NPWP signee') : t('NPWP PIC'))
    return
  }
  coretaxField.value = field
  coretaxPassphrase.value = ''
  coretaxPassphraseError.value = ''
  coretaxPassphraseVisible.value = false
  coretaxConfirmOpen.value = true
}
function cancelValidateCoretax() {
  coretaxConfirmOpen.value = false
}
function confirmValidateCoretax() {
  if (!coretaxPassphrase.value.trim()) {
    coretaxPassphraseError.value = req(t('Coretax passphrase'))
    return
  }
  if (coretaxField.value === 'signee') draftTax.signeeValidated = true
  else draftTax.picValidated = true
  coretaxConfirmOpen.value = false
  toast.notify({ variant: 'success', title: t('Coretax info validated'), maxWidth: 'max-content' })
}

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
  // Amount display drives money formatting app-wide (formatIDR / formatMoney).
  setAmountDisplay(displayToSetting[draftAdvanced.amountDisplay] ?? 'with-decimals')
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
        <div class="cp-field">
          <span class="cp-label">{{ t('Company type') }}</span>
          <span class="cp-value">{{ tax.companyType === 'pkp' ? t('PKP (VAT-registered)') : t('Non-PKP (Not VAT-registered)') }}</span>
        </div>
        <div class="cp-subhead cp-subhead--spaced">
          <span class="cp-subhead-title">{{ t('Tax identity') }}</span>
          <MpBadge for="tableStatus" :type="tax.npwpValidated ? 'completed' : 'announcement'" size="sm">
            {{ tax.npwpValidated ? t('Validated') : t('Not validated') }}
          </MpBadge>
        </div>
        <p class="cp-subhead-desc">{{ t('NPWP details') }}</p>
        <div class="cp-grid">
          <div class="cp-field">
            <span class="cp-label">NPWP</span>
            <span class="cp-value">{{ tax.npwp || '—' }}</span>
          </div>
          <div class="cp-field">
            <span class="cp-label">NITKU</span>
            <span class="cp-value">{{ tax.nitku || '—' }}</span>
          </div>
        </div>
        <!-- Coretax info only exists once the company is validated & registered in Klikpajak,
             and only for PKP businesses — Non-PKP companies don't issue e-Faktur. -->
        <template v-if="tax.npwpValidated">
          <template v-if="tax.companyType === 'pkp'">
            <div class="cp-subhead cp-subhead--spaced">
              <span class="cp-subhead-title">{{ t('Coretax info') }}</span>
            </div>
            <p class="cp-subhead-desc">{{ t('Enter Coretax information to validate your e-faktur.') }}</p>
            <div class="cp-grid">
              <div class="cp-field">
                <span class="cp-label">{{ t('NPWP signee') }}</span>
                <span class="cp-value">{{ tax.signeeNpwp || '—' }}<br><span class="cp-value-subtle">{{ tax.signee || '—' }}</span></span>
              </div>
              <div class="cp-field">
                <span class="cp-label">{{ t('NPWP PIC') }}</span>
                <span class="cp-value">{{ tax.picNpwp || '—' }}<br><span class="cp-value-subtle">{{ tax.pic || '—' }}</span></span>
              </div>
            </div>
          </template>
          <p v-else class="cp-subhead-desc cp-subhead--spaced">{{ t("Coretax info isn't required for Non-PKP businesses.") }}</p>
        </template>
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
            <MpBadge for="tableStatus" :type="draftTax.npwpValidated ? 'completed' : 'announcement'" size="sm">
              {{ draftTax.npwpValidated ? t('Validated') : t('Not validated') }}
            </MpBadge>
          </div>
          <p class="cp-subhead-desc">{{ t('Enter your NPWP and business location number (NITKU) to validate e-invoicing.') }}</p>
          <div class="cp-validate-row">
            <MpFormControl id="cp-npwp" :is-invalid="!!errTax.npwp" class="cp-vf">
              <div class="cp-label-row">
                <MpFormLabel>NPWP</MpFormLabel>
                <span class="cp-counter">{{ draftTax.npwp.length }}/16</span>
              </div>
              <div class="cp-input-check-wrap">
                <MpInput
                  id="cp-npwp-input" v-model="draftTax.npwp" is-full-width
                  :is-disabled="draftTax.npwpValidated || validatingNpwp"
                  @update:model-value="clearTaxErr('npwp')"
                />
                <span v-if="draftTax.npwpValidated" class="cp-input-check"><MpIcon name="done" variant="fill" size="sm" color="icon.inverse" /></span>
              </div>
              <MpFormErrorMessage>{{ errTax.npwp }}</MpFormErrorMessage>
            </MpFormControl>
            <MpFormControl id="cp-nitku" :is-invalid="!!errTax.nitku" class="cp-vf">
              <div class="cp-label-row">
                <MpFormLabel>NITKU</MpFormLabel>
                <span class="cp-counter">{{ draftTax.nitku.length }}/6</span>
              </div>
              <div class="cp-input-check-wrap">
                <MpInput
                  id="cp-nitku-input" v-model="draftTax.nitku" is-full-width
                  :is-disabled="draftTax.npwpValidated || validatingNpwp"
                  @update:model-value="clearTaxErr('nitku')"
                />
                <span v-if="draftTax.npwpValidated" class="cp-input-check"><MpIcon name="done" variant="fill" size="sm" color="icon.inverse" /></span>
              </div>
              <MpFormErrorMessage>{{ errTax.nitku }}</MpFormErrorMessage>
            </MpFormControl>
            <button
              v-if="!draftTax.npwpValidated"
              type="button" class="btn-enterprise btn-enterprise--secondary cp-validate-btn"
              :disabled="validatingNpwp"
              @click="openValidateNpwpConfirm"
            >
              <template v-if="validatingNpwp"><MpSpinner size="sm" /> {{ t('Validating') }}</template>
              <template v-else>{{ t('Validate') }}</template>
            </button>
          </div>
          <p v-if="taxIdentityError" class="cp-inline-error">{{ taxIdentityError }}</p>

          <!-- Coretax info only exists once the company is validated & registered in Klikpajak,
               and only for PKP businesses — Non-PKP companies don't issue e-Faktur. -->
          <template v-if="draftTax.npwpValidated && draftTax.companyType !== 'pkp'">
            <p class="cp-subhead-desc cp-subhead--spaced">{{ t("Coretax info isn't required for Non-PKP businesses.") }}</p>
          </template>
          <template v-else-if="draftTax.npwpValidated">
            <div class="cp-subhead cp-subhead--spaced">
              <span class="cp-subhead-title">{{ t('Coretax info') }}</span>
            </div>
            <p class="cp-subhead-desc">{{ t('Authorized person details for tax filing, pulled from your tax identity.') }}</p>
            <div class="cp-validate-row">
              <MpFormControl id="cp-signee-npwp" class="cp-vf">
                <div class="cp-label-row">
                  <MpFormLabel>{{ t('NPWP signee') }}</MpFormLabel>
                  <span class="cp-counter">{{ draftTax.signeeNpwp.length }}/16</span>
                </div>
                <div class="cp-input-check-wrap">
                  <MpInput
                    id="cp-signee-npwp-input" :model-value="draftTax.signeeNpwp" is-full-width
                    @update:model-value="(v: string) => onCoretaxNpwpInput('signee', v)"
                  />
                  <span v-if="draftTax.signeeValidated" class="cp-input-check"><MpIcon name="done" variant="fill" size="sm" color="icon.inverse" /></span>
                </div>
              </MpFormControl>
              <MpFormControl id="cp-signee" class="cp-vf">
                <MpFormLabel>{{ t('Signee') }}</MpFormLabel>
                <div class="cp-input-check-wrap">
                  <MpInput id="cp-signee-input" :model-value="draftTax.signee" is-full-width is-disabled />
                  <span v-if="draftTax.signeeValidated" class="cp-input-check"><MpIcon name="done" variant="fill" size="sm" color="icon.inverse" /></span>
                </div>
              </MpFormControl>
              <button
                type="button" class="btn-enterprise btn-enterprise--secondary cp-validate-btn"
                :disabled="draftTax.signeeValidated"
                @click="openValidateCoretax('signee')"
              >{{ t('Validate') }}</button>
            </div>
            <p v-if="coretaxErr.signee" class="cp-inline-error">{{ coretaxErr.signee }}</p>
            <div class="cp-validate-row">
              <MpFormControl id="cp-pic-npwp" class="cp-vf">
                <div class="cp-label-row">
                  <MpFormLabel>{{ t('NPWP PIC') }}</MpFormLabel>
                  <span class="cp-counter">{{ draftTax.picNpwp.length }}/16</span>
                </div>
                <div class="cp-input-check-wrap">
                  <MpInput
                    id="cp-pic-npwp-input" :model-value="draftTax.picNpwp" is-full-width
                    @update:model-value="(v: string) => onCoretaxNpwpInput('pic', v)"
                  />
                  <span v-if="draftTax.picValidated" class="cp-input-check"><MpIcon name="done" variant="fill" size="sm" color="icon.inverse" /></span>
                </div>
              </MpFormControl>
              <MpFormControl id="cp-pic" class="cp-vf">
                <MpFormLabel>{{ t('PIC') }}</MpFormLabel>
                <div class="cp-input-check-wrap">
                  <MpInput id="cp-pic-input" :model-value="draftTax.pic" is-full-width is-disabled />
                  <span v-if="draftTax.picValidated" class="cp-input-check"><MpIcon name="done" variant="fill" size="sm" color="icon.inverse" /></span>
                </div>
              </MpFormControl>
              <button
                type="button" class="btn-enterprise btn-enterprise--secondary cp-validate-btn"
                :disabled="draftTax.picValidated"
                @click="openValidateCoretax('pic')"
              >{{ t('Validate') }}</button>
            </div>
            <p v-if="coretaxErr.pic" class="cp-inline-error">{{ coretaxErr.pic }}</p>
          </template>

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
        <span class="cp-value">{{ t('Amount display:') }} {{ amountDisplayLabel }}, {{ t('e.g.') }} {{ amountDisplayExample }}</span>
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
          <span class="cp-help">{{ t('e.g.') }} {{ draftAmountDisplayExample }}</span>
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

    <!-- ── Validate & create Klikpajak account modal ───────────────────────────── -->
    <MpModal id="cp-validate-klikpajak-modal" :is-open="klikpajakConfirmOpen" is-centered :is-keep-alive="false" @close="cancelValidateNpwpConfirm">
      <MpModalContent>
        <MpModalHeader>
          {{ t('Validate & create Klikpajak account?') }}
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <p>{{ t('Validating NPWP and NITKU will also create a Klikpajak account linked to this company ID.') }}</p>
        </MpModalBody>
        <MpModalFooter>
          <div class="cp-action-bar cp-action-bar--modal">
            <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="cancelValidateNpwpConfirm">{{ t('Cancel') }}</button>
            <button type="button" class="btn-enterprise btn-enterprise--primary" @click="confirmValidateNpwp">{{ t('Validate & create') }}</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Validate coretax info (signee/PIC) modal — requires a Coretax passphrase ── -->
    <MpModal id="cp-validate-coretax-modal" :is-open="coretaxConfirmOpen" is-centered :is-keep-alive="false" @close="cancelValidateCoretax">
      <MpModalContent>
        <MpModalHeader>
          {{ t('Validate coretax info') }}
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          <div class="cp-field cp-mc-currency">
            <span class="cp-label">{{ coretaxField === 'signee' ? t('NPWP Signee') : t('NPWP PIC') }}</span>
            <span class="cp-value">{{ coretaxField === 'signee' ? draftTax.signeeNpwp : draftTax.picNpwp }}</span>
          </div>
          <MpFormControl id="cp-coretax-passphrase" is-required :is-invalid="!!coretaxPassphraseError">
            <MpFormLabel>{{ t('Coretax passphrase') }}</MpFormLabel>
            <div class="cp-input-check-wrap">
              <MpInput
                id="cp-coretax-passphrase-input" v-model="coretaxPassphrase" is-full-width
                :type="coretaxPassphraseVisible ? 'text' : 'password'"
                @update:model-value="coretaxPassphraseError = ''"
              />
              <button
                type="button" class="cp-passphrase-toggle"
                :aria-label="coretaxPassphraseVisible ? t('Hide passphrase') : t('Show passphrase')"
                @click="coretaxPassphraseVisible = !coretaxPassphraseVisible"
              >
                <MpIcon :name="coretaxPassphraseVisible ? 'show' : 'hide'" size="sm" />
              </button>
            </div>
            <MpFormErrorMessage>{{ coretaxPassphraseError }}</MpFormErrorMessage>
          </MpFormControl>
        </MpModalBody>
        <MpModalFooter>
          <div class="cp-action-bar cp-action-bar--modal">
            <button type="button" class="btn-enterprise btn-enterprise--ghost" @click="cancelValidateCoretax">{{ t('Cancel') }}</button>
            <button type="button" class="btn-enterprise btn-enterprise--primary" @click="confirmValidateCoretax">{{ t('Validate') }}</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Demo scenario FAB — switch whether this company's SSO ID is already
         registered in Klikpajak, to preview both Tax info onboarding states ──── -->
    <MpPopover id="cp-demo-fab" is-close-on-select use-portal placement="top-end">
      <MpPopoverTrigger>
        <button class="demo-fab" :aria-label="t('Change scenario state')">
          <MpIcon name="sliders" size="md" color="icon.inverse" />
        </button>
      </MpPopoverTrigger>
      <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content' })">
        <p class="demo-fab-heading">{{ t('Klikpajak account state') }}</p>
        <MpPopoverList>
          <MpPopoverListItem :is-active="klikpajakStatus === 'registered'" @click="setKlikpajakStatus('registered')">
            {{ t('SSO ID registered in Klikpajak') }}
          </MpPopoverListItem>
          <MpPopoverListItem :is-active="klikpajakStatus === 'not_registered'" @click="setKlikpajakStatus('not_registered')">
            {{ t('SSO ID not registered in Klikpajak') }}
          </MpPopoverListItem>
        </MpPopoverList>
        <template v-if="klikpajakStatus === 'not_registered'">
          <p class="demo-fab-heading">{{ t('When validating NPWP/NITKU') }}</p>
          <MpPopoverList>
            <MpPopoverListItem :is-active="npwpCheckOutcome === 'valid'" @click="npwpCheckOutcome = 'valid'">
              {{ t('Valid — create Klikpajak account') }}
            </MpPopoverListItem>
            <MpPopoverListItem :is-active="npwpCheckOutcome === 'invalid'" @click="npwpCheckOutcome = 'invalid'">
              {{ t('Invalid — not found') }}
            </MpPopoverListItem>
            <MpPopoverListItem :is-active="npwpCheckOutcome === 'already_registered'" @click="npwpCheckOutcome = 'already_registered'">
              {{ t('Already registered on another company') }}
            </MpPopoverListItem>
          </MpPopoverList>
        </template>
      </MpPopoverContent>
    </MpPopover>

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
.cp-inline-error { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }

/* Per-field validated checkmark, overlaid on the input's right edge */
.cp-input-check-wrap { position: relative; }
.cp-input-check {
  position: absolute; top: 50%; right: var(--mp-spacing-3); transform: translateY(-50%);
  width: 16px; height: 16px; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-brand-bold, #029861);
  display: inline-flex; align-items: center; justify-content: center;
  pointer-events: none;
}

/* Show/hide toggle inside the Coretax passphrase field */
.cp-passphrase-toggle {
  position: absolute; top: 50%; right: var(--mp-spacing-3); transform: translateY(-50%);
  display: inline-flex; align-items: center; justify-content: center;
  background: none; border: none; padding: 0; cursor: pointer; color: var(--mp-text-subtle);
}

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

/* Validate button — show a disabled look while validating */
.cp-validate-btn:disabled { cursor: not-allowed; opacity: 0.6; display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }

/* Demo scenario FAB */
.demo-fab {
  position: fixed; right: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse, #080d0e); color: #fff;
  cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2);
}
.demo-fab:hover { opacity: 0.9; }
.demo-fab-heading { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
