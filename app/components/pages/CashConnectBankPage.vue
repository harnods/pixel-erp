<script setup lang="ts">
/**
 * Connect to bank — the Bank connection setup flow for a cash/bank account
 * (Figma 5254-205316 · 5514-80387 · 5254-205320 · 5514-78039 · 5260-294594 ·
 * 5260-294595 · 5259-268214).
 *
 * A full page that mirrors the CreateCashAccountPage shell (72px title bar with
 * breadcrumb-above-H1, rounded white stage, 564px form column, bottom actions)
 * and drives a 3-step ErpStepper — Request submission · Surat Kuasa signing ·
 * Account activation — through a local stage machine. Waiting screens ("ada
 * tunggu") reuse the app's ref + setTimeout spinner idiom; the destructive
 * Disconnect confirmation reuses the shared ConfirmModal.
 *
 * Nothing new here — every control (MpUpload, MpAutocomplete, ContentList,
 * ErpStepper, ErpStatusBadge, ConfirmModal, btn-enterprise) is an existing
 * pattern lifted from sibling pages.
 */
import { ref, computed, onMounted, type Ref } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpAutocomplete, MpTextarea, MpCheckbox,
  MpUpload, MpUploadList, MpIcon, MpSpinner, toast,
} from '@mekari/pixel3'
import ErpStepper from '~/components/patterns/ErpStepper.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { cashAccounts, type BankConnection } from '~/data'

const props = defineProps<{ orderId?: string }>()
const router = useRouter()
const { t } = useLocale()

const account = computed(() => cashAccounts.find(a => a.id === props.orderId))

// ─── Bank inference (locked "Bank name" field + BCA-only branches) ───────────
const BANK_MAP: { kw: string; name: string; bca?: boolean }[] = [
  { kw: 'bca',      name: 'PT. Bank Central Asia (BCA)', bca: true },
  { kw: 'cimb',     name: 'PT. Bank CIMB Niaga (CIMB)' },
  { kw: 'danamon',  name: 'PT. Bank Danamon Tbk. (Danamon)' },
  { kw: 'mandiri',  name: 'PT. Bank Mandiri (Mandiri)' },
  { kw: 'dbs',      name: 'PT. Bank DBS Indonesia (DBS)' },
  { kw: 'permata',  name: 'PT. Bank Permata (Permata)' },
  { kw: 'bni',      name: 'PT. Bank Negara Indonesia (BNI)' },
  { kw: 'bri',      name: 'PT. Bank Rakyat Indonesia (BRI)' },
]
const bank = computed(() => {
  const name = (account.value?.name ?? '').toLowerCase()
  return BANK_MAP.find(b => name.includes(b.kw)) ?? { kw: '', name: account.value?.name ?? '', bca: false }
})
const isBca = computed(() => !!bank.value.bca)
const connectToAccountLabel = computed(() =>
  account.value ? `${account.value.code} ${account.value.name}` : '',
)
// Company ID of the active tenant — the same value shown in the top-right user
// menu (ErpUserMenu "Company ID: 680128"). Locked/read-only on the form.
const COMPANY_ID = '680128'

// ─── Stage machine ───────────────────────────────────────────────────────────
type Stage = 'form' | 'surat' | 'review' | 'activation' | 'activating' | 'connected'
const stage = ref<Stage>('form')
const busy = ref(false)
const busyLabel = ref('')

onMounted(() => {
  const a = account.value
  if (!a) { router.replace('/cash-management'); return }
  if (a.isConnected) stage.value = 'connected'
  else if (a.bankLinkStage === 'activation') stage.value = 'activation'
  else stage.value = 'form'
})

// ─── Stepper ──────────────────────────────────────────────────────────────────
const STEPS = [
  { key: 'request', label: t('Request submission') },
  { key: 'surat', label: t('Surat Kuasa signing') },
  { key: 'activation', label: t('Account activation') },
]
const stepperCurrent = computed(() => {
  switch (stage.value) {
    case 'form': return 'request'
    case 'surat': return 'surat'
    case 'review': return '' // under review — nothing active, steps 1 & 2 done
    case 'activation':
    case 'activating': return 'activation'
    default: return ''
  }
})
const stepperDone = computed(() => {
  switch (stage.value) {
    case 'form': return []
    case 'surat': return ['request']
    case 'review': return ['request', 'surat']
    case 'activation':
    case 'activating': return ['request', 'surat']
    default: return []
  }
})
function goStep(key: string) {
  if (key === 'request') stage.value = 'form'
  else if (key === 'surat') stage.value = 'surat'
  else if (key === 'activation') stage.value = 'activation'
}

// ─── Step 1 — Request submission ─────────────────────────────────────────────
const bankAccountType = ref('')
const accountName = ref('')
const isNgo = ref(false)
const accountNumber = ref('')
const corporateIdKbb = ref('')
const identityType = ref('ktp')
const identityNumber = ref('')
const nameOnIdentity = ref('')
const memo = ref('')

const identityFile = ref<File | null>(null)
const savingsBookFile = ref<File | null>(null)
const skFile = ref<File | null>(null)
const suratKuasaFile = ref<File | null>(null)
const activationFile = ref<File | null>(null)

const accountTypeOptions = [
  { label: 'Corporate', value: 'corporate' },
  { label: 'Personal', value: 'personal' },
  { label: 'Joint', value: 'joint' },
]
const identityTypeOptions = [
  { label: 'KTP', value: 'ktp' },
  { label: 'Passport', value: 'passport' },
  { label: 'KITAS', value: 'kitas' },
]

const MEMO_MAX = 60
const MAX_BYTES = 10 * 1024 * 1024

// ─── Inline validation errors (this app never surfaces errors via toast) ─────
const nameError = ref('')
const suratError = ref('')
const actErrors = ref<Record<'kbb' | 'apiKey' | 'apiSecret' | 'clientId' | 'clientSecret', string>>(
  { kbb: '', apiKey: '', apiSecret: '', clientId: '', clientSecret: '' },
)
const fileErrors = ref<Partial<Record<FileKey, string>>>({})

// MpUpload's @change emits a native Event (ev.target.files); older call sites
// pass a FileList directly — handle both, and guard the 10 MB cap. Keyed because
// template refs auto-unwrap (can't pass the ref object in from the template).
type FileKey = 'identity' | 'savings' | 'sk' | 'surat' | 'activation'
function handleFile(payload: Event | FileList | null, which: FileKey) {
  const files: FileList | null | undefined =
    payload && 'target' in payload ? (payload.target as HTMLInputElement).files : (payload as FileList | null)
  const file = files?.[0]
  if (!file) return
  if (file.size > MAX_BYTES) {
    fileErrors.value = { ...fileErrors.value, [which]: t('File size exceeds the 10 MB limit') }
    return
  }
  const targets: Record<FileKey, Ref<File | null>> = {
    identity: identityFile, savings: savingsBookFile, sk: skFile, surat: suratKuasaFile, activation: activationFile,
  }
  targets[which].value = file
  fileErrors.value = { ...fileErrors.value, [which]: '' }
  if (which === 'surat') suratError.value = ''
}

// Fake the "ada tunggu" processing beat, then land on the next stage.
function advance(next: Stage, label: string) {
  busyLabel.value = label
  busy.value = true
  window.setTimeout(() => { busy.value = false; stage.value = next }, 1000)
}

function submitRequest() {
  nameError.value = accountName.value.trim() ? '' : t('You must fill in account name')
  if (nameError.value) return
  advance('surat', t('Submitting your request…'))
}

// ─── Step 2 — Surat Kuasa signing ────────────────────────────────────────────
function downloadLoa() {
  toast.notify({ variant: 'success', title: t('Letter of Authorization downloaded'), maxWidth: 'max-content' })
}
function submitSuratKuasa() {
  suratError.value = suratKuasaFile.value ? '' : t('Upload the signed Surat Kuasa to continue')
  if (suratError.value) return
  advance('review', t('Submitting your documents…'))
}

// From "Application under review" — the request is lodged; resume at step 3 later.
function backAfterReview() {
  const a = account.value
  if (a) a.bankLinkStage = 'activation'
  toast.notify({ variant: 'success', title: t('Bank connection request submitted'), maxWidth: 'max-content' })
  router.push(`/cash-management/${props.orderId}`)
}

// ─── Step 3 — Account activation ─────────────────────────────────────────────
const apiKey = ref('')
const apiSecret = ref('')
const clientId = ref('')
const clientSecret = ref('')

function activate() {
  const req = t('This field is required')
  actErrors.value = {
    kbb: corporateIdKbb.value.trim() ? '' : req,
    apiKey: apiKey.value.trim() ? '' : req,
    apiSecret: apiSecret.value.trim() ? '' : req,
    clientId: clientId.value.trim() ? '' : req,
    clientSecret: clientSecret.value.trim() ? '' : req,
  }
  if (Object.values(actErrors.value).some(Boolean)) return
  advance('activating', t('Activating your connection…'))
}

// From "Activation in progress" — finalise the connection so the account reads
// as connected on return.
function backAfterActivation() {
  const a = account.value
  if (a) {
    a.isConnected = true
    a.bankLinkStage = undefined
    a.syncTotal = 500
    a.syncRemaining = 500
    a.connection = {
      bankName: bank.value.name,
      bankAccountType: accountTypeOptions.find(o => o.value === bankAccountType.value)?.label ?? 'Corporate',
      accountName: accountName.value.trim() || (a.connection?.accountName ?? a.name),
      accountNumber: accountNumber.value.trim() || (a.accountNumber ?? ''),
      corporateIdKbb: isBca.value ? (corporateIdKbb.value.trim() || undefined) : undefined,
      connectToAccount: connectToAccountLabel.value,
      companyId: COMPANY_ID,
    }
  }
  toast.notify({ variant: 'success', title: `${a?.name ?? t('Account')} ${t('connected')}`, maxWidth: 'max-content' })
  router.push(`/cash-management/${props.orderId}`)
}

// ─── Connected view — Disconnect ─────────────────────────────────────────────
const connection = computed<BankConnection | undefined>(() => account.value?.connection)
const disconnectOpen = ref(false)
function confirmDisconnect() {
  const a = account.value
  if (a) {
    a.isConnected = false
    a.connection = undefined
    a.bankLinkStage = undefined
    a.syncRemaining = undefined
    a.syncTotal = undefined
  }
  disconnectOpen.value = false
  toast.notify({ variant: 'success', title: t('Bank connection disconnected'), maxWidth: 'max-content' })
  router.push(`/cash-management/${props.orderId}`)
}

function contactSupport() {
  toast.notify({ variant: 'information', title: t('Our support team will reach out shortly'), maxWidth: 'max-content' })
}
function goBack() { router.push(`/cash-management/${props.orderId}`) }
</script>

<template>
  <div class="cnb-page">

    <!-- ── Title bar ── -->
    <div class="cnb-titlebar">
      <div class="cnb-titlebar-left">
        <div class="cnb-breadcrumb-row">
          <button class="cnb-breadcrumb" @click="router.push('/cash-management')">{{ t('Cash management') }}</button>
          <span class="cnb-breadcrumb-sep">/</span>
          <button class="cnb-breadcrumb" @click="goBack">{{ account?.code }} {{ account?.name }}</button>
        </div>
        <div class="cnb-title-row">
          <h1 class="cnb-title">{{ stage === 'connected' ? t('Bank connection') : t('Connect to bank') }}</h1>
          <ErpStatusBadge v-if="stage === 'connected'" status="active" :label="t('Connected')" badge-for="additionalInformation" size="md" />
        </div>
      </div>
      <!-- Support is the single top-right action across the whole flow; steps 2 & 3
           no longer repeat it in their footers. -->
      <div class="cnb-titlebar-right">
        <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" @click="contactSupport">
          <MpIcon name="headphone" size="sm" />{{ t('Contact our support team') }}
        </button>
        <button v-if="stage === 'connected'" class="btn-enterprise btn-enterprise--danger" @click="disconnectOpen = true">{{ t('Disconnect Bank connection') }}</button>
      </div>
    </div>

    <!-- ── Stage ── -->
    <div class="cnb-stage">

      <!-- Stepper (hidden on the connected management view) -->
      <ErpStepper
        v-if="stage !== 'connected'"
        class="cnb-stepper"
        :steps="STEPS"
        :current="stepperCurrent"
        :done="stepperDone"
        @select="goStep"
      />

      <!-- Waiting / processing beat between steps -->
      <div v-if="busy" class="cnb-busy">
        <MpSpinner size="md" />
        <p class="cnb-busy-label">{{ busyLabel }}</p>
      </div>

      <template v-else>

        <!-- ═══ Step 1 — Request submission ═══ -->
        <div v-if="stage === 'form'" class="cnb-step1">
          <div class="cnb-form-col">

            <!-- Bank account details -->
            <section class="cnb-section">
              <h2 class="cnb-section-title">{{ t('Bank account details') }}</h2>
              <p class="cnb-section-caption">{{ t('Enter the bank account details to connect to Mekari ERP.') }}</p>

              <div class="cnb-fields">
                <div class="cnb-row">
                  <MpFormControl id="cnb-bank" class="cnb-col" is-required>
                    <MpFormLabel>{{ t('Bank name') }}</MpFormLabel>
                    <MpInput id="cnb-bank-input" :model-value="bank.name" :is-disabled="true" />
                  </MpFormControl>
                  <MpFormControl id="cnb-type" class="cnb-col" is-required>
                    <MpFormLabel>{{ t('Bank account type') }}</MpFormLabel>
                    <MpAutocomplete
                      id="cnb-type-ac" v-model="bankAccountType" :data="accountTypeOptions"
                      label-prop="label" value-prop="value" :placeholder="t('Select bank account type')"
                      use-portal is-full-width
                    />
                  </MpFormControl>
                </div>

                <MpFormControl id="cnb-accname" is-required :is-invalid="!!nameError">
                  <MpFormLabel>{{ t('Account name') }}</MpFormLabel>
                  <MpInput id="cnb-accname-input" v-model="accountName" @update:model-value="nameError = ''" />
                  <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
                </MpFormControl>
                <!-- Non-BCA only: NGO / LMS / Yayasan flag -->
                <label v-if="!isBca" class="cnb-check">
                  <MpCheckbox id="cnb-ngo" :is-checked="isNgo" @change="isNgo = !isNgo" />
                  <span>{{ t('Is an NGO / LMS / Yayasan') }}</span>
                </label>

                <div class="cnb-row">
                  <MpFormControl id="cnb-accno" class="cnb-col" is-required>
                    <MpFormLabel>{{ t('Account number') }}</MpFormLabel>
                    <MpInput id="cnb-accno-input" v-model="accountNumber" />
                  </MpFormControl>
                  <!-- BCA only: Corporate ID KBB -->
                  <MpFormControl v-if="isBca" id="cnb-kbb" class="cnb-col" is-required>
                    <MpFormLabel>{{ t('Corporate ID KBB') }}</MpFormLabel>
                    <MpInput id="cnb-kbb-input" v-model="corporateIdKbb" />
                  </MpFormControl>
                  <div v-else class="cnb-col" />
                </div>

                <div class="cnb-row">
                  <MpFormControl id="cnb-connect" class="cnb-col" is-required>
                    <MpFormLabel>{{ t('Connect to account') }}</MpFormLabel>
                    <MpInput id="cnb-connect-input" :model-value="connectToAccountLabel" :is-disabled="true" />
                  </MpFormControl>
                  <MpFormControl id="cnb-company" class="cnb-col" is-required>
                    <MpFormLabel>{{ t('Company ID') }}</MpFormLabel>
                    <MpInput id="cnb-company-input" :model-value="COMPANY_ID" :is-disabled="true" />
                  </MpFormControl>
                </div>
              </div>
            </section>

            <!-- Non-BCA only: Verification documents -->
            <section v-if="!isBca" class="cnb-section">
              <h2 class="cnb-section-title">{{ t('Verification documents') }}</h2>
              <p class="cnb-section-caption">{{ t('Required documents to validate your Bank connection request.') }}</p>

              <div class="cnb-fields">
                <div class="cnb-upload-field">
                  <label class="cnb-upload-label">{{ t('Savings account book') }}<span class="cnb-req">*</span></label>
                  <MpUpload id="cnb-savings" accept=".xls,.xlsx,.csv,.pdf" is-full-width :placeholder="t('or drag and drop here')" :button-text="t('Choose file')" @change="(e) => handleFile(e, 'savings')" />
                  <p class="cnb-upload-hint">{{ t('Files must be in XLS, CSV, or PDF with a maximum of 10 MB per file') }}</p>
                  <p v-if="fileErrors.savings" class="cnb-upload-error">{{ fileErrors.savings }}</p>
                  <MpUploadList v-if="savingsBookFile" id="cnb-savings-file" :title="savingsBookFile.name" status="success" :subtitle="t('Ready to submit')" icon-name="excel-document" :is-show-download-button="false" @remove="savingsBookFile = null" />
                </div>
                <div class="cnb-upload-field">
                  <label class="cnb-upload-label">{{ t('SK Pengesahan Kemenkumham') }}<span class="cnb-req">*</span></label>
                  <MpUpload id="cnb-sk" accept=".pdf,.jpg,.jpeg" is-full-width :placeholder="t('or drag and drop here')" :button-text="t('Choose file')" @change="(e) => handleFile(e, 'sk')" />
                  <p class="cnb-upload-hint">{{ t('File must be in PDF or JPG with a maximum of 10 MB') }}</p>
                  <p v-if="fileErrors.sk" class="cnb-upload-error">{{ fileErrors.sk }}</p>
                  <MpUploadList v-if="skFile" id="cnb-sk-file" :title="skFile.name" status="success" :subtitle="t('Ready to submit')" icon-name="attachment" :is-show-download-button="false" @remove="skFile = null" />
                </div>
              </div>
            </section>

            <!-- Identity info -->
            <section class="cnb-section">
              <h2 class="cnb-section-title">{{ t('Identity info') }}</h2>
              <p class="cnb-section-caption">{{ t("Provide your company's President Director or equivalent details to confirm identity.") }}</p>

              <div class="cnb-fields">
                <div class="cnb-upload-field">
                  <label class="cnb-upload-label">{{ t('Identity file') }}<span class="cnb-req">*</span></label>
                  <MpUpload id="cnb-identity" accept=".pdf,.jpg,.jpeg" is-full-width :placeholder="t('or drag and drop here')" :button-text="t('Choose file')" @change="(e) => handleFile(e, 'identity')" />
                  <p class="cnb-upload-hint">{{ t('File must be in PDF or JPG with a maximum of 10 MB') }}</p>
                  <p v-if="fileErrors.identity" class="cnb-upload-error">{{ fileErrors.identity }}</p>
                  <MpUploadList v-if="identityFile" id="cnb-identity-file" :title="identityFile.name" status="success" :subtitle="t('Ready to submit')" icon-name="attachment" :is-show-download-button="false" @remove="identityFile = null" />
                </div>

                <MpFormControl id="cnb-idtype">
                  <MpFormLabel>{{ t('Identity type') }}</MpFormLabel>
                  <div class="cnb-idtype-row">
                    <MpAutocomplete id="cnb-idtype-ac" v-model="identityType" :data="identityTypeOptions" label-prop="label" value-prop="value" use-portal class="cnb-idtype-select" />
                    <MpInput id="cnb-idnum-input" v-model="identityNumber" class="cnb-idtype-input" />
                  </div>
                </MpFormControl>

                <MpFormControl id="cnb-idname" is-required>
                  <MpFormLabel>{{ t('Name on identity') }}</MpFormLabel>
                  <MpInput id="cnb-idname-input" v-model="nameOnIdentity" />
                </MpFormControl>
              </div>
            </section>

            <!-- Other info -->
            <section class="cnb-section">
              <h2 class="cnb-section-title">{{ t('Other info') }}</h2>
              <div class="cnb-section-spacer" />
              <div class="cnb-fields">
                <MpFormControl id="cnb-memo">
                  <div class="cnb-label-row">
                    <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
                    <span class="cnb-counter">{{ memo.length }} / {{ MEMO_MAX }}</span>
                  </div>
                  <MpTextarea id="cnb-memo-input" v-model="memo" is-full-width :rows="3" :maxlength="MEMO_MAX" />
                </MpFormControl>
              </div>
            </section>

            <!-- Actions -->
            <div class="cnb-action-group">
              <div class="cnb-action-right">
                <button class="btn-enterprise btn-enterprise--ghost" @click="goBack">{{ t('Cancel') }}</button>
                <button class="btn-enterprise btn-enterprise--primary" @click="submitRequest">{{ t('Continue') }}</button>
              </div>
            </div>
          </div>

          <!-- BCA only: Bank connection charges aside -->
          <aside v-if="isBca" class="cnb-charges">
            <div class="cnb-charges-head">
              <MpIcon name="wallet" size="sm" />
              <h3 class="cnb-charges-title">{{ t('Bank connection charges for Bank BCA') }}</h3>
            </div>
            <p class="cnb-charges-desc">{{ t('Bank connection uses automatic debit to sync your bank statements into Mekari ERP, up to 180 times per month.') }}</p>
            <div class="cnb-charges-rows">
              <div class="cnb-charges-row">
                <span class="cnb-charges-label">{{ t('Price') }}</span>
                <span class="cnb-charges-value">
                  <span>Rp50.000,00 {{ t('per month') }}</span>
                  <span class="cnb-charges-sub">+Rp100 {{ t('per additional sync') }}</span>
                </span>
              </div>
              <div class="cnb-charges-row">
                <span class="cnb-charges-label">{{ t('Sync quota') }}</span>
                <span class="cnb-charges-value">{{ t('Max. 180 times per month') }}</span>
              </div>
            </div>
          </aside>
        </div>

        <!-- ═══ Step 2 — Surat Kuasa signing ═══ -->
        <div v-else-if="stage === 'surat'" class="cnb-form-col cnb-form-col--wide">
          <p class="cnb-lead">{{ t('Bank connection applications require a signed Surat Kuasa, which will be processed by our team and sent to your bank for validation.') }}</p>

          <div class="cnb-substep">
            <span class="cnb-substep-num">1</span>
            <div class="cnb-substep-body">
              <h3 class="cnb-substep-title">{{ t('Print & complete Surat Kuasa') }}</h3>
              <p class="cnb-substep-caption">{{ t('Letter of Authorization (Surat Kuasa) will be checked by the bank.') }}</p>
              <button class="btn-enterprise btn-enterprise--secondary cnb-substep-btn" @click="downloadLoa">{{ t('Download Letter of Authorization') }}</button>
            </div>
          </div>

          <div class="cnb-substep">
            <span class="cnb-substep-num">2</span>
            <div class="cnb-substep-body">
              <h3 class="cnb-substep-title">{{ t('Upload signed Surat Kuasa') }}</h3>
              <p class="cnb-substep-caption">{{ t('Make sure you sign the form in pen, as digital signatures are not accepted.') }}</p>
              <button class="cnb-link" @click="contactSupport">{{ t('View example') }}</button>
              <div class="cnb-upload-field">
                <MpUpload id="cnb-surat" accept=".pdf,.jpg,.jpeg" is-full-width :placeholder="t('or drag and drop here')" :button-text="t('Choose file')" @change="(e) => handleFile(e, 'surat')" />
                <p class="cnb-upload-hint">{{ t('Supported formats: PDF, JPG. Maximum file size 10 MB.') }}</p>
                <p v-if="suratError || fileErrors.surat" class="cnb-upload-error">{{ suratError || fileErrors.surat }}</p>
                <MpUploadList v-if="suratKuasaFile" id="cnb-surat-file" :title="suratKuasaFile.name" status="success" :subtitle="t('Ready to submit')" icon-name="attachment" :is-show-download-button="false" @remove="suratKuasaFile = null" />
              </div>
            </div>
          </div>

          <div class="cnb-action-group cnb-action-group--split">
            <button class="btn-enterprise btn-enterprise--ghost" @click="goBack">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" @click="submitSuratKuasa">{{ t('Submit') }}</button>
          </div>
        </div>

        <!-- ═══ Application under review ═══ -->
        <div v-else-if="stage === 'review'" class="cnb-wait">
          <MpIcon name="time" size="xl" class="cnb-wait-icon" />
          <div class="cnb-wait-body">
            <h2 class="cnb-wait-title">{{ t('Application under review') }}</h2>
            <p class="cnb-wait-text">{{ t('We will send your activation credentials to your registered email within 2 business days. Follow the instructions in the email to complete the process, then return here to activate.') }}</p>
            <button class="btn-enterprise btn-enterprise--secondary cnb-wait-btn" @click="backAfterReview">{{ t('Back to account') }}</button>
          </div>
        </div>

        <!-- ═══ Step 3 — Account activation ═══ -->
        <div v-else-if="stage === 'activation'" class="cnb-form-col cnb-form-col--wide">
          <div class="cnb-substep">
            <span class="cnb-substep-num">1</span>
            <div class="cnb-substep-body">
              <h3 class="cnb-substep-title">{{ t('Download your activation file') }}</h3>
              <ol class="cnb-ol">
                <li>{{ t('Open your Bank connection activation email and download the attached file.') }}</li>
                <li>{{ t('Open your file and enter the password listed in the email.') }}</li>
                <li>{{ t('Come back here and upload the file to fill in the form automatically.') }}</li>
              </ol>
              <button class="cnb-link" @click="contactSupport">{{ t('Watch tutorial') }}</button>
            </div>
          </div>

          <div class="cnb-substep">
            <span class="cnb-substep-num">2</span>
            <div class="cnb-substep-body">
              <h3 class="cnb-substep-title">{{ t('Fill in activation form') }}</h3>
              <div class="cnb-upload-field">
                <label class="cnb-upload-label">{{ t('Activation file') }}</label>
                <MpUpload id="cnb-activation" accept=".txt,.json,.pdf" is-full-width :placeholder="t('or drag and drop here')" :button-text="t('Choose file')" @change="(e) => handleFile(e, 'activation')" />
                <p class="cnb-upload-hint">{{ t('Fields will be filled automatically. Review before activating.') }}</p>
                <p v-if="fileErrors.activation" class="cnb-upload-error">{{ fileErrors.activation }}</p>
                <MpUploadList v-if="activationFile" id="cnb-activation-file" :title="activationFile.name" status="success" :subtitle="t('Ready')" icon-name="attachment" :is-show-download-button="false" @remove="activationFile = null" />
              </div>

              <div class="cnb-activation-fields">
                <MpFormControl id="cnb-act-kbb" is-required :is-invalid="!!actErrors.kbb">
                  <MpFormLabel>{{ t('Corporate ID KBB') }}</MpFormLabel>
                  <MpInput id="cnb-act-kbb-input" v-model="corporateIdKbb" @update:model-value="actErrors.kbb = ''" />
                  <MpFormErrorMessage>{{ actErrors.kbb }}</MpFormErrorMessage>
                </MpFormControl>
                <MpFormControl id="cnb-act-apikey" is-required :is-invalid="!!actErrors.apiKey">
                  <MpFormLabel>{{ t('API Key') }}</MpFormLabel>
                  <MpInput id="cnb-act-apikey-input" v-model="apiKey" @update:model-value="actErrors.apiKey = ''" />
                  <MpFormErrorMessage>{{ actErrors.apiKey }}</MpFormErrorMessage>
                </MpFormControl>
                <MpFormControl id="cnb-act-apisecret" is-required :is-invalid="!!actErrors.apiSecret">
                  <MpFormLabel>{{ t('API secret') }}</MpFormLabel>
                  <MpInput id="cnb-act-apisecret-input" v-model="apiSecret" @update:model-value="actErrors.apiSecret = ''" />
                  <MpFormErrorMessage>{{ actErrors.apiSecret }}</MpFormErrorMessage>
                </MpFormControl>
                <MpFormControl id="cnb-act-clientid" is-required :is-invalid="!!actErrors.clientId">
                  <MpFormLabel>{{ t('Client ID') }}</MpFormLabel>
                  <MpInput id="cnb-act-clientid-input" v-model="clientId" @update:model-value="actErrors.clientId = ''" />
                  <MpFormErrorMessage>{{ actErrors.clientId }}</MpFormErrorMessage>
                </MpFormControl>
                <MpFormControl id="cnb-act-clientsecret" is-required :is-invalid="!!actErrors.clientSecret">
                  <MpFormLabel>{{ t('Client secret') }}</MpFormLabel>
                  <MpInput id="cnb-act-clientsecret-input" v-model="clientSecret" @update:model-value="actErrors.clientSecret = ''" />
                  <MpFormErrorMessage>{{ actErrors.clientSecret }}</MpFormErrorMessage>
                </MpFormControl>
              </div>
            </div>
          </div>

          <div class="cnb-action-group cnb-action-group--split">
            <button class="btn-enterprise btn-enterprise--ghost" @click="goBack">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" @click="activate">{{ t('Activate') }}</button>
          </div>
        </div>

        <!-- ═══ Activation in progress ═══ -->
        <div v-else-if="stage === 'activating'" class="cnb-wait">
          <MpIcon name="time" size="xl" class="cnb-wait-icon" />
          <div class="cnb-wait-body">
            <h2 class="cnb-wait-title">{{ t('Activation in progress') }}</h2>
            <p class="cnb-wait-text">{{ t('Activation may take up to 30 working days. We will send a confirmation email to your registered address once it is complete.') }}</p>
            <button class="btn-enterprise btn-enterprise--secondary cnb-wait-btn" @click="backAfterActivation">{{ t('Back to account') }}</button>
          </div>
        </div>

        <!-- ═══ Connected — Bank connection ═══ -->
        <!-- Master-data detail info list (label-left / value-right), mirrors the
             "Warehouse info" pattern (WarehouseDetailsPage .wh-info-list). -->
        <div v-else-if="stage === 'connected'" class="cnb-info">
          <h2 class="cnb-info-title">{{ t('Bank connection info') }}</h2>
          <dl class="cnb-info-list">
            <div class="cnb-info-row"><dt class="cnb-info-label">{{ t('Bank name') }}</dt><dd class="cnb-info-value">{{ connection?.bankName || '—' }}</dd></div>
            <div class="cnb-info-row"><dt class="cnb-info-label">{{ t('Bank account type') }}</dt><dd class="cnb-info-value">{{ connection?.bankAccountType || '—' }}</dd></div>
            <div class="cnb-info-row"><dt class="cnb-info-label">{{ t('Account name') }}</dt><dd class="cnb-info-value">{{ connection?.accountName || '—' }}</dd></div>
            <div class="cnb-info-row"><dt class="cnb-info-label">{{ t('Account number') }}</dt><dd class="cnb-info-value">{{ connection?.accountNumber || '—' }}</dd></div>
            <div v-if="connection?.corporateIdKbb" class="cnb-info-row"><dt class="cnb-info-label">{{ t('Corporate ID KBB') }}</dt><dd class="cnb-info-value">{{ connection?.corporateIdKbb }}</dd></div>
            <div class="cnb-info-row"><dt class="cnb-info-label">{{ t('Connect to account') }}</dt><dd class="cnb-info-value">{{ connection?.connectToAccount || '—' }}</dd></div>
            <div class="cnb-info-row"><dt class="cnb-info-label">{{ t('Company ID') }}</dt><dd class="cnb-info-value">{{ connection?.companyId || '—' }}</dd></div>
          </dl>
        </div>

      </template>
    </div>

    <!-- Disconnect confirmation -->
    <ConfirmModal
      v-model:is-open="disconnectOpen"
      :title="t('Disconnect Bank connection?')"
      :description="t('Bank statements will stop syncing automatically. You can reconnect later, but you will need to complete the setup again.')"
      :confirm-label="t('Disconnect')"
      :cancel-label="t('Cancel')"
      is-danger
      @confirm="confirmDisconnect"
    />
  </div>
</template>

<style scoped>
/* Shell mirrors CreateCashAccountPage (72px bar, breadcrumb above H1, rounded stage). */
.cnb-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }

.cnb-titlebar {
  flex-shrink: 0; min-height: 72px; background: var(--mp-background-neutral-subtle);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); padding: 0 var(--mp-spacing-6);
}
.cnb-titlebar-left { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; }
.cnb-breadcrumb-row { display: flex; align-items: center; gap: var(--mp-spacing-1, 4px); }
.cnb-breadcrumb {
  background: none; border: none; cursor: pointer; padding: 0; font-size: 12px;
  font-weight: var(--mp-font-weights-regular); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-link); font-family: inherit; white-space: nowrap;
}
.cnb-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.cnb-breadcrumb-sep { font-size: 12px; line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); }
.cnb-title-row { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cnb-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
}
.cnb-titlebar-right { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-shrink: 0; }

.cnb-stage {
  flex: 1; background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0;
  overflow-x: hidden; overflow-y: auto; padding: var(--mp-spacing-6) var(--mp-spacing-6) 80px;
}
.cnb-stepper { margin-bottom: var(--mp-spacing-6); }

/* Busy / waiting spinner beat */
.cnb-busy { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); padding: 80px 0; }
.cnb-busy-label { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* Step 1 — form column + optional charges aside */
.cnb-step1 { display: flex; align-items: flex-start; gap: var(--mp-spacing-8); }
/* 32px between sections; fields inside a section sit 20px apart (.cnb-fields). */
.cnb-form-col { width: 564px; max-width: 100%; display: flex; flex-direction: column; gap: 32px; }
.cnb-form-col--wide { width: 720px; }

.cnb-section { display: flex; flex-direction: column; }
.cnb-section-title { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default); }
.cnb-section-caption { margin: var(--mp-spacing-1) 0 var(--mp-spacing-3); font-size: 12px; line-height: 16px; color: var(--mp-text-secondary); }
.cnb-section-spacer { height: 12px; }
.cnb-fields { display: flex; flex-direction: column; gap: 20px; }

.cnb-row { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.cnb-col { flex: 1; min-width: 0; }

.cnb-label-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-1); width: 100%; }
.cnb-counter { flex-shrink: 0; font-size: 12px; line-height: 16px; color: var(--mp-text-secondary); text-align: right; }
.cnb-req { color: var(--mp-text-critical, var(--mp-text-danger)); margin-left: 2px; }

/* gap:0 — MpCheckbox renders its own 12px control-to-label gap internally. */
.cnb-check { display: inline-flex; align-items: center; gap: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); width: fit-content; }

.cnb-idtype-row { display: flex; gap: var(--mp-spacing-3); align-items: flex-start; }
.cnb-idtype-select { width: 120px; flex-shrink: 0; }
.cnb-idtype-input { flex: 1; min-width: 0; }

/* Uploads */
.cnb-upload-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cnb-upload-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cnb-upload-hint { margin: 0; font-size: 12px; line-height: 16px; color: var(--mp-text-secondary); }
.cnb-upload-error { margin: 0; font-size: var(--mp-font-sizes-sm); line-height: 16px; color: var(--mp-text-critical, var(--mp-text-danger)); }

/* Charges aside (BCA) */
.cnb-charges {
  width: 372px; max-width: 100%; flex-shrink: 0; margin-top: 44px;
  background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-lg, 8px);
  padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: var(--mp-spacing-3);
}
.cnb-charges-head { display: flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-default); }
.cnb-charges-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); }
.cnb-charges-desc { margin: 0; font-size: var(--mp-font-sizes-sm); line-height: 18px; color: var(--mp-text-secondary); }
.cnb-charges-rows { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.cnb-charges-row { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); }
.cnb-charges-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cnb-charges-value { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: right; }
.cnb-charges-sub { font-size: 12px; color: var(--mp-text-secondary); }

/* Steps 2 & 3 — numbered sub-steps */
.cnb-lead { margin: 0; font-size: var(--mp-font-sizes-md); line-height: 20px; color: var(--mp-text-secondary); max-width: 520px; }
.cnb-substep { display: flex; gap: var(--mp-spacing-3); align-items: flex-start; }
.cnb-substep-num {
  flex-shrink: 0; width: 24px; height: 24px; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary);
  display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: var(--mp-font-weights-semi-bold);
}
.cnb-substep-body { display: flex; flex-direction: column; gap: var(--mp-spacing-2); min-width: 0; flex: 1; }
.cnb-substep-title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cnb-substep-caption { margin: 0; font-size: var(--mp-font-sizes-sm); line-height: 18px; color: var(--mp-text-secondary); }
.cnb-substep-btn { width: fit-content; margin-top: var(--mp-spacing-1); }
.cnb-ol { margin: 0; padding-left: var(--mp-spacing-5); display: flex; flex-direction: column; gap: 2px; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cnb-link { background: none; border: none; padding: 0; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer; width: fit-content; }
.cnb-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cnb-activation-fields { display: flex; flex-direction: column; gap: var(--mp-spacing-4); margin-top: var(--mp-spacing-2); }

/* Waiting screens */
.cnb-wait { display: flex; align-items: flex-start; gap: var(--mp-spacing-5); padding-top: var(--mp-spacing-4); }
.cnb-wait-icon { flex-shrink: 0; width: 48px; height: 48px; color: var(--mp-icon-warning, #d9a800); }
.cnb-wait-icon :deep(svg) { width: 48px; height: 48px; }
.cnb-wait-body { display: flex; flex-direction: column; gap: var(--mp-spacing-3); max-width: 480px; }
.cnb-wait-title { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cnb-wait-text { margin: 0; font-size: var(--mp-font-sizes-md); line-height: 20px; color: var(--mp-text-secondary); }
/* Hug, don't fill the flex column. */
.cnb-wait-btn { align-self: flex-start; width: fit-content; }

/* Connected — master-data detail info list (label-left / value-right). 20px
   between the header and the list. */
.cnb-info { width: 720px; max-width: 100%; display: flex; flex-direction: column; }
.cnb-info-title { margin: 0 0 20px; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default); }
.cnb-info-list { margin: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.cnb-info-row { display: flex; align-items: flex-start; gap: var(--mp-spacing-4); }
.cnb-info-label { flex-shrink: 0; width: 160px; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); }
.cnb-info-value { margin: 0; flex: 1; max-width: 640px; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); }

/* Actions */
.cnb-action-group { display: flex; align-items: center; padding: var(--mp-spacing-4) 0; }
.cnb-action-group--split { justify-content: space-between; }
.cnb-action-right { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-left: auto; }
</style>
