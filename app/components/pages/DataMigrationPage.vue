<script setup lang="ts">
/**
 * Settings → Data migration — two-column step-list + form layout.
 *
 * Left column: ordered list of migration modules (Company info, Opening balance,
 * Products, Contacts, Sales, Purchases, Expenses).
 * Right column: the form for the active step.
 *
 * This is a `pageRegistry` page rendered inside the shared `.stage`.
 */
import { ref, reactive, computed } from 'vue'
import {
  MpButton, MpIcon, MpInput, MpTextarea,
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpBanner, MpBannerIcon, MpBannerDescription,
  MpSpinner,
  toast,
} from '@mekari/pixel3'
import centralPerkLogo from '~/assets/images/central-perk-logo.svg?url'
import { DEFAULT_COA } from '~/data/wmsCutover'
import { CATALOG } from '~/data/catalog'
import { customers } from '~/data/customers'
import { vendors } from '~/data/vendors'
import { salesInvoices } from '~/data/salesInvoices'
import { purchaseInvoices } from '~/data/purchaseInvoices'
import { bills } from '~/data/bills'

const { t } = useLocale()

// ─── Step definitions ─────────────────────────────────────────────────────────
interface MigrationStep {
  id: string
  label: string
  icon: string
}

const STEPS: MigrationStep[] = [
  { id: 'company-info', label: 'Company info', icon: 'company' },
  { id: 'opening-balance', label: 'Opening balance', icon: 'wallet' },
  { id: 'products', label: 'Products', icon: 'product' },
  { id: 'contacts', label: 'Contacts', icon: 'contact' },
  { id: 'sales', label: 'Sales', icon: 'sales-invoice' },
  { id: 'purchases', label: 'Purchases', icon: 'purchase-invoice' },
  { id: 'expenses', label: 'Expenses', icon: 'expense' },
]

const activeStepId = ref('company-info')
const activeStep = computed(() => STEPS.find(s => s.id === activeStepId.value)!)

// ─── Company info form state ─────────────────────────────────────────────────
const companySaved = ref(false)

const companyInfo = reactive({
  companyName: 'PT Central Perk Indonesia',
  companyAddress: '',
  email: '',
  phone: '',
  npwp: '',
})

const draft = reactive({
  companyAddress: companyInfo.companyAddress,
  email: companyInfo.email,
  phone: companyInfo.phone,
  npwp: companyInfo.npwp,
})

const errors = reactive<Record<string, string>>({})
const req = (label: string) => `${t('You must fill in')} ${label}`
function clearErr(field: string) { if (errors[field]) delete errors[field] }

// ─── Logo upload ────────────────────────────────────────────────────────────
const logoUrl = ref('')
const logoInputEl = ref<HTMLInputElement | null>(null)

function triggerLogoUpload() {
  logoInputEl.value?.click()
}

function onLogoChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const url = URL.createObjectURL(file)
  logoUrl.value = url
  toast.notify({ variant: 'success', title: t('Company logo updated'), maxWidth: 'max-content' })
}

function removeLogo() {
  logoUrl.value = ''
  if (logoInputEl.value) logoInputEl.value.value = ''
}

// ─── Bank account ───────────────────────────────────────────────────────────
const bank = reactive({
  bankName: '',
  accountNo: '',
  accountName: '',
})

const draftBank = reactive({ ...bank })
const errBank = reactive<Record<string, string>>({})
function clearBankErr(field: string) { if (errBank[field]) delete errBank[field] }

// ─── Opening balance — Chart of Accounts table ─────────────────────────────
const obSearch = ref('')
const obStatus = ref<'idle' | 'running' | 'done'>('idle')

function generateBalances(): Record<string, { debit: number; credit: number }> {
  const map: Record<string, { debit: number; credit: number }> = {}
  for (const row of DEFAULT_COA) {
    const code = parseInt(row.code.split('-')[0])
    if (code === 1) {
      map[row.code] = { debit: Math.round(Math.random() * 50000000 + 1000000), credit: 0 }
    } else if (code === 2 || code === 3) {
      map[row.code] = { debit: 0, credit: Math.round(Math.random() * 30000000 + 500000) }
    } else if (code === 4) {
      map[row.code] = { debit: 0, credit: Math.round(Math.random() * 20000000 + 1000000) }
    } else if (code >= 5) {
      map[row.code] = { debit: Math.round(Math.random() * 10000000 + 100000), credit: 0 }
    } else {
      map[row.code] = { debit: 0, credit: 0 }
    }
  }
  return map
}

const obBalances = ref<Record<string, { debit: number; credit: number }>>({})

function startOpeningBalance() {
  obStatus.value = 'running'
  setTimeout(() => {
    obBalances.value = generateBalances()
    obStatus.value = 'done'
  }, 3000)
}

function formatCurrency(val: number): string {
  if (!val) return '—'
  return val.toLocaleString('id-ID')
}

const coaRows = computed(() => {
  const q = obSearch.value.trim().toLowerCase()
  if (!q) return DEFAULT_COA
  return DEFAULT_COA.filter(r => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))
})

// ─── Products — Import ────────────────────────────────────────────────────────
const prodStatus = ref<'idle' | 'running' | 'done'>('idle')

function startProductImport() {
  prodStatus.value = 'running'
  setTimeout(() => {
    prodStatus.value = 'done'
  }, 3000)
}

// ─── Contacts — Import ───────────────────────────────────────────────────────
const contactStatus = ref<'idle' | 'running' | 'done'>('idle')
const contactCount = computed(() => customers.length + vendors.length)

function startContactImport() {
  contactStatus.value = 'running'
  setTimeout(() => {
    contactStatus.value = 'done'
  }, 3000)
}

// ─── Sales — Import ──────────────────────────────────────────────────────────
const salesStatus = ref<'idle' | 'running' | 'done'>('idle')

function startSalesImport() {
  salesStatus.value = 'running'
  setTimeout(() => {
    salesStatus.value = 'done'
  }, 3000)
}

// ─── Purchases — Import ──────────────────────────────────────────────────────
const purchasesStatus = ref<'idle' | 'running' | 'done'>('idle')

function startPurchasesImport() {
  purchasesStatus.value = 'running'
  setTimeout(() => {
    purchasesStatus.value = 'done'
  }, 3000)
}

// ─── Expenses — Import ───────────────────────────────────────────────────────
const expensesStatus = ref<'idle' | 'running' | 'done'>('idle')

function startExpensesImport() {
  expensesStatus.value = 'running'
  setTimeout(() => {
    expensesStatus.value = 'done'
  }, 3000)
}

// ─── Save ────────────────────────────────────────────────────────────────────
function validate(): boolean {
  for (const k of Object.keys(errors)) delete errors[k]
  for (const k of Object.keys(errBank)) delete errBank[k]

  if (!draft.email.trim()) errors.email = req(t('email'))
  if (!draftBank.bankName.trim()) errBank.bankName = req(t('bank name'))
  if (!draftBank.accountNo.trim()) errBank.accountNo = req(t('account number'))
  if (!draftBank.accountName.trim()) errBank.accountName = req(t('account name'))

  return Object.keys(errors).length === 0 && Object.keys(errBank).length === 0
}

function save() {
  if (!validate()) return
  Object.assign(companyInfo, {
    companyAddress: draft.companyAddress,
    email: draft.email,
    phone: draft.phone,
    npwp: draft.npwp,
  })
  Object.assign(bank, draftBank)
  companySaved.value = true
  toast.notify({ variant: 'success', title: t('Company info saved'), maxWidth: 'max-content' })
}

// ─── Step completion tracking ───────────────────────────────────────────────
const stepDone = computed<Record<string, boolean>>(() => ({
  'company-info': companySaved.value,
  'opening-balance': obStatus.value === 'done',
  'products': prodStatus.value === 'done',
  'contacts': contactStatus.value === 'done',
  'sales': salesStatus.value === 'done',
  'purchases': purchasesStatus.value === 'done',
  'expenses': expensesStatus.value === 'done',
}))
</script>

<template>
  <div class="dm-wrapper" data-devchange="dm-step-layout">
    <div class="dm-layout">
      <!-- ── Left: Step list ──────────────────────────────────────────────── -->
      <nav class="dm-steps" aria-label="Migration steps">
        <button
          v-for="(step, idx) in STEPS"
          :key="step.id"
          class="dm-step"
          :class="{ 'dm-step--active': step.id === activeStepId, 'dm-step--done': stepDone[step.id] }"
          @click="activeStepId = step.id"
        >
          <MpIcon v-if="stepDone[step.id]" name="done" size="sm" color="icon.success" />
          <span v-else class="dm-step-number">{{ idx + 1 }}</span>
          <span class="dm-step-label">{{ t(step.label) }}</span>
        </button>
      </nav>

      <!-- ── Right: Form ────────────────────────────────────────────────── -->
      <div class="dm-form-area" :class="[activeStepId === 'company-info' ? 'dm-form-area--narrow' : 'dm-form-area--fullbleed']">
      <!-- Company info form -->
      <template v-if="activeStepId === 'company-info'">
        <div class="dm-form-top">
          <div class="dm-form-fields">
            <MpFormControl id="dm-company-name">
              <MpFormLabel>{{ t('Company name') }}</MpFormLabel>
              <MpInput id="dm-company-name-input" :model-value="companyInfo.companyName" is-full-width is-disabled />
            </MpFormControl>

            <MpFormControl id="dm-company-address">
              <MpFormLabel>{{ t('Company address') }}</MpFormLabel>
              <MpTextarea id="dm-company-address-input" v-model="draft.companyAddress" is-full-width :rows="3" />
            </MpFormControl>

            <MpFormControl id="dm-email" :is-invalid="!!errors.email">
              <MpFormLabel>{{ t('Email') }}</MpFormLabel>
              <MpInput id="dm-email-input" v-model="draft.email" is-full-width @update:model-value="clearErr('email')" />
              <MpFormErrorMessage>{{ errors.email }}</MpFormErrorMessage>
            </MpFormControl>

            <MpFormControl id="dm-phone">
              <MpFormLabel>{{ t('Phone') }}</MpFormLabel>
              <MpInput id="dm-phone-input" v-model="draft.phone" is-full-width />
            </MpFormControl>

            <MpFormControl id="dm-npwp">
              <MpFormLabel>NPWP</MpFormLabel>
              <MpInput id="dm-npwp-input" v-model="draft.npwp" is-full-width />
            </MpFormControl>
          </div>

          <!-- Logo upload (right side of the form top row) -->
          <div class="dm-logo-upload">
            <span class="dm-logo-label">{{ t('Company logo') }}</span>
            <div class="dm-logo-preview">
              <img v-if="logoUrl" :src="logoUrl" alt="Company logo" class="dm-logo-img" />
              <div v-else class="dm-logo-placeholder">
                <MpIcon name="image" size="32px" color="icon.subtle" />
              </div>
            </div>
            <div class="dm-logo-actions">
              <MpButton variant="secondary" type="button" class="btn-enterprise btn-enterprise--secondary" size="sm" @click="triggerLogoUpload">
                {{ logoUrl ? t('Change') : t('Upload') }}
              </MpButton>
              <MpButton v-if="logoUrl" type="button" class="btn-enterprise btn-enterprise--ghost" size="sm" @click="removeLogo">
                {{ t('Remove') }}
              </MpButton>
            </div>
            <input ref="logoInputEl" type="file" accept="image/png,image/jpeg,image/svg+xml" hidden @change="onLogoChange" /> <!-- pixel-police-allow: hidden file picker, no visible control -->
          </div>
        </div>

        <!-- Bank account info -->
        <div class="dm-divider" />

        <h3 class="dm-subsection-title">{{ t('Bank account info') }}</h3>

        <MpBanner id="dm-bank-info-banner" variant="info">
          <MpBannerIcon id="dm-bank-info-banner-icon" />
          <MpBannerDescription id="dm-bank-info-banner-desc">
            {{ t('You can add more bank accounts in') }} <a href="/company-profile" class="dm-banner-link">{{ t('Settings') }} &rsaquo; {{ t('Company profile') }}</a>. {{ t('Bank account info will appear as payment info on invoices when enabled in the invoice template.') }}
          </MpBannerDescription>
        </MpBanner>

        <div class="dm-bank-fields">
          <MpFormControl id="dm-bank-name" :is-invalid="!!errBank.bankName">
            <MpFormLabel>{{ t('Bank name') }}</MpFormLabel>
            <MpInput id="dm-bank-name-input" v-model="draftBank.bankName" is-full-width @update:model-value="clearBankErr('bankName')" />
            <MpFormErrorMessage>{{ errBank.bankName }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="dm-account-no" :is-invalid="!!errBank.accountNo">
            <MpFormLabel>{{ t('Account no.') }}</MpFormLabel>
            <MpInput id="dm-account-no-input" v-model="draftBank.accountNo" is-full-width @update:model-value="clearBankErr('accountNo')" />
            <MpFormErrorMessage>{{ errBank.accountNo }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="dm-account-name" :is-invalid="!!errBank.accountName">
            <MpFormLabel>{{ t('Account name') }}</MpFormLabel>
            <MpInput id="dm-account-name-input" v-model="draftBank.accountName" is-full-width @update:model-value="clearBankErr('accountName')" />
            <MpFormErrorMessage>{{ errBank.accountName }}</MpFormErrorMessage>
          </MpFormControl>
        </div>

      </template>

      <!-- Opening balance step -->
      <template v-else-if="activeStepId === 'opening-balance'">
        <div class="dm-ob-header">
          <h2 class="dm-section-title">{{ t('Set up opening balance') }}</h2>
          <p class="dm-section-caption">{{ t('Opening balance is used to set balances based on the conversion date, which is the date you start recording in Jurnal.') }}</p>

          <div class="dm-ob-action">
            <MpButton
              v-if="obStatus === 'idle'"
              id="dm-ob-start-btn"
              class="btn-enterprise--primary dm-ob-start-btn"
              @click="startOpeningBalance"
            >
              {{ t('Set up opening balance') }}
            </MpButton>
            <div v-else-if="obStatus === 'running'" class="dm-ob-status dm-ob-status--running">
              <MpSpinner class="dm-ob-spinner" />
              <span>{{ t('Setting up opening balance...') }}</span>
            </div>
            <div v-else class="dm-ob-status dm-ob-status--done">
              <MpIcon name="done" size="sm" color="icon.success" />
              <span>{{ t('Opening balance has been set up') }}</span>
            </div>
          </div>

          <div class="dm-ob-banner-wrap">
            <MpBanner id="dm-ob-info-banner" variant="info">
              <MpBannerIcon id="dm-ob-info-banner-icon" />
              <MpBannerDescription id="dm-ob-info-banner-desc">
                {{ t('You can add new accounts in') }} <a href="/chart-of-accounts" class="dm-banner-link">{{ t('Chart of accounts') }}</a> {{ t('while filling in your opening balances.') }}
              </MpBannerDescription>
            </MpBanner>
          </div>
        </div>

        <div class="dm-ob-filter-bar">
          <div class="dm-ob-filter-left"></div>
          <div class="dm-ob-filter-right">
            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="obSearch" class="filter-search-input" type="text" :placeholder="t('Search...')" />
            </div>
          </div>
        </div>

        <div class="dm-ob-table-wrap">
          <table class="dm-ob-table">
            <colgroup>
              <col>
              <col class="dm-ob-col--amount">
              <col class="dm-ob-col--amount">
            </colgroup>
            <thead>
              <tr>
                <th class="dm-ob-th">{{ t('Account code') }}</th>
                <th class="dm-ob-th dm-ob-th--num">{{ t('Debit') }}</th>
                <th class="dm-ob-th dm-ob-th--num">{{ t('Credit') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in coaRows" :key="row.code">
                <td class="dm-ob-td">
                  <span class="dm-ob-code">{{ row.code }}</span>{{ row.name }}
                </td>
                <td class="dm-ob-td dm-ob-td--num" :class="{ 'dm-ob-td--empty': !obBalances[row.code]?.debit }">
                  {{ formatCurrency(obBalances[row.code]?.debit ?? 0) }}
                </td>
                <td class="dm-ob-td dm-ob-td--num" :class="{ 'dm-ob-td--empty': !obBalances[row.code]?.credit }">
                  {{ formatCurrency(obBalances[row.code]?.credit ?? 0) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>

      <!-- Products step -->
      <template v-else-if="activeStepId === 'products'">
        <div class="dm-ob-header">
          <h2 class="dm-section-title">{{ t('Import products') }}</h2>
          <p class="dm-section-caption">{{ t('Import your product data from a spreadsheet to quickly set up your product catalog in Jurnal.') }}</p>

          <div class="dm-ob-action">
            <MpButton
              v-if="prodStatus === 'idle'"
              id="dm-prod-import-btn"
              class="btn-enterprise--primary dm-ob-start-btn"
              @click="startProductImport"
            >
              {{ t('Import products') }}
            </MpButton>
            <div v-else-if="prodStatus === 'running'" class="dm-ob-status dm-ob-status--running">
              <MpSpinner class="dm-ob-spinner" />
              <span>{{ t('Importing products...') }}</span>
            </div>
            <div v-else class="dm-ob-status dm-ob-status--done">
              <MpIcon name="done" size="sm" color="icon.success" />
              <span>{{ CATALOG.length }} {{ t('products have been imported') }}</span>
              <span class="dm-status-separator">·</span>
              <a href="/product-list?tab=All+products" class="dm-status-link">{{ t('View products') }}</a>
            </div>
          </div>

          <div class="dm-ob-banner-wrap">
            <MpBanner id="dm-prod-info-banner" variant="info">
              <MpBannerIcon id="dm-prod-info-banner-icon" />
              <MpBannerDescription id="dm-prod-info-banner-desc">
                {{ t('You can also') }} <a href="/product-list/new" class="dm-banner-link">{{ t('add a new product') }}</a> {{ t('directly from the product page.') }}
              </MpBannerDescription>
            </MpBanner>
          </div>
        </div>
      </template>

      <!-- Contacts step -->
      <template v-else-if="activeStepId === 'contacts'">
        <div class="dm-ob-header">
          <h2 class="dm-section-title">{{ t('Import contacts') }}</h2>
          <p class="dm-section-caption">{{ t('Import your customer and vendor data to set up your contact list in Jurnal.') }}</p>

          <div class="dm-ob-action">
            <MpButton
              v-if="contactStatus === 'idle'"
              id="dm-contact-import-btn"
              class="btn-enterprise--primary dm-ob-start-btn"
              @click="startContactImport"
            >
              {{ t('Import contacts') }}
            </MpButton>
            <div v-else-if="contactStatus === 'running'" class="dm-ob-status dm-ob-status--running">
              <MpSpinner class="dm-ob-spinner" />
              <span>{{ t('Importing contacts...') }}</span>
            </div>
            <div v-else class="dm-ob-status dm-ob-status--done">
              <MpIcon name="done" size="sm" color="icon.success" />
              <span>{{ contactCount }} {{ t('contacts have been imported') }}</span>
              <span class="dm-status-separator">·</span>
              <a href="/customers" class="dm-status-link">{{ t('View contacts') }}</a>
            </div>
          </div>

          <div class="dm-ob-banner-wrap">
            <MpBanner id="dm-contact-info-banner" variant="info">
              <MpBannerIcon id="dm-contact-info-banner-icon" />
              <MpBannerDescription id="dm-contact-info-banner-desc">
                {{ t('You can also') }} <a href="/customers/new" class="dm-banner-link">{{ t('add a new contact') }}</a> {{ t('directly from the contacts page.') }}
              </MpBannerDescription>
            </MpBanner>
          </div>
        </div>
      </template>

      <!-- Sales step -->
      <template v-else-if="activeStepId === 'sales'">
        <div class="dm-ob-header">
          <h2 class="dm-section-title">{{ t('Import sales') }}</h2>
          <p class="dm-section-caption">{{ t('Import your sales invoice data to set up your sales records in Jurnal.') }}</p>

          <div class="dm-ob-action">
            <MpButton
              v-if="salesStatus === 'idle'"
              id="dm-sales-import-btn"
              class="btn-enterprise--primary dm-ob-start-btn"
              @click="startSalesImport"
            >
              {{ t('Import sales') }}
            </MpButton>
            <div v-else-if="salesStatus === 'running'" class="dm-ob-status dm-ob-status--running">
              <MpSpinner class="dm-ob-spinner" />
              <span>{{ t('Importing sales...') }}</span>
            </div>
            <div v-else class="dm-ob-status dm-ob-status--done">
              <MpIcon name="done" size="sm" color="icon.success" />
              <span>{{ salesInvoices.length }} {{ t('sales invoices have been imported') }}</span>
              <span class="dm-status-separator">·</span>
              <a href="/sales-invoices" class="dm-status-link">{{ t('View sales invoices') }}</a>
            </div>
          </div>

          <div class="dm-ob-banner-wrap">
            <MpBanner id="dm-sales-info-banner" variant="info">
              <MpBannerIcon id="dm-sales-info-banner-icon" />
              <MpBannerDescription id="dm-sales-info-banner-desc">
                {{ t('You can also') }} <a href="/sales-invoices/new" class="dm-banner-link">{{ t('create a new sales invoice') }}</a> {{ t('directly from the sales page.') }}
              </MpBannerDescription>
            </MpBanner>
          </div>
        </div>
      </template>

      <!-- Purchases step -->
      <template v-else-if="activeStepId === 'purchases'">
        <div class="dm-ob-header">
          <h2 class="dm-section-title">{{ t('Import purchases') }}</h2>
          <p class="dm-section-caption">{{ t('Import your purchase invoice data to set up your purchase records in Jurnal.') }}</p>

          <div class="dm-ob-action">
            <MpButton
              v-if="purchasesStatus === 'idle'"
              id="dm-purchases-import-btn"
              class="btn-enterprise--primary dm-ob-start-btn"
              @click="startPurchasesImport"
            >
              {{ t('Import purchases') }}
            </MpButton>
            <div v-else-if="purchasesStatus === 'running'" class="dm-ob-status dm-ob-status--running">
              <MpSpinner class="dm-ob-spinner" />
              <span>{{ t('Importing purchases...') }}</span>
            </div>
            <div v-else class="dm-ob-status dm-ob-status--done">
              <MpIcon name="done" size="sm" color="icon.success" />
              <span>{{ purchaseInvoices.length }} {{ t('purchase invoices have been imported') }}</span>
              <span class="dm-status-separator">·</span>
              <a href="/purchase-invoices" class="dm-status-link">{{ t('View purchase invoices') }}</a>
            </div>
          </div>

          <div class="dm-ob-banner-wrap">
            <MpBanner id="dm-purchases-info-banner" variant="info">
              <MpBannerIcon id="dm-purchases-info-banner-icon" />
              <MpBannerDescription id="dm-purchases-info-banner-desc">
                {{ t('You can also') }} <a href="/purchase-invoices/new" class="dm-banner-link">{{ t('create a new purchase invoice') }}</a> {{ t('directly from the purchases page.') }}
              </MpBannerDescription>
            </MpBanner>
          </div>
        </div>
      </template>

      <!-- Expenses step -->
      <template v-else-if="activeStepId === 'expenses'">
        <div class="dm-ob-header">
          <h2 class="dm-section-title">{{ t('Import expenses') }}</h2>
          <p class="dm-section-caption">{{ t('Import your expense data to set up your expense records in Jurnal.') }}</p>

          <div class="dm-ob-action">
            <MpButton
              v-if="expensesStatus === 'idle'"
              id="dm-expenses-import-btn"
              class="btn-enterprise--primary dm-ob-start-btn"
              @click="startExpensesImport"
            >
              {{ t('Import expenses') }}
            </MpButton>
            <div v-else-if="expensesStatus === 'running'" class="dm-ob-status dm-ob-status--running">
              <MpSpinner class="dm-ob-spinner" />
              <span>{{ t('Importing expenses...') }}</span>
            </div>
            <div v-else class="dm-ob-status dm-ob-status--done">
              <MpIcon name="done" size="sm" color="icon.success" />
              <span>{{ bills.length }} {{ t('expenses have been imported') }}</span>
              <span class="dm-status-separator">·</span>
              <a href="/expenses" class="dm-status-link">{{ t('View expenses') }}</a>
            </div>
          </div>

          <div class="dm-ob-banner-wrap">
            <MpBanner id="dm-expenses-info-banner" variant="info">
              <MpBannerIcon id="dm-expenses-info-banner-icon" />
              <MpBannerDescription id="dm-expenses-info-banner-desc">
                {{ t('You can also') }} <a href="/expenses/new" class="dm-banner-link">{{ t('create a new expense') }}</a> {{ t('directly from the expenses page.') }}
              </MpBannerDescription>
            </MpBanner>
          </div>
        </div>
      </template>

      <!-- Placeholder for other steps -->
      <template v-else>
        <div class="dm-placeholder">
          <MpIcon name="construction" size="48px" color="icon.subtle" />
          <p class="dm-placeholder-text">{{ t(activeStep.label) }}</p>
          <p class="dm-placeholder-desc">{{ t('This step is not available yet.') }}</p>
        </div>
      </template>
      </div>
    </div>

    <!-- Sticky action bar — full-bleed at stage bottom -->
    <div v-if="activeStepId === 'company-info'" class="dm-action-bar">
      <MpButton variant="primary" type="button" class="btn-enterprise btn-enterprise--primary" @click="save">
        {{ t('Save & continue') }}
      </MpButton>
    </div>
  </div>
</template>

<style scoped>
/* ─── Wrapper ──────────────────────────────────────────────────────────────── */
.dm-wrapper {
  display: contents;
}

/* ─── Two-column layout ───────────────────────────────────────────────────── */
.dm-layout {
  display: grid;
  grid-template-columns: 240px 1fr;
  align-items: stretch;
}

/* ─── Step list (left) ────────────────────────────────────────────────────── */
.dm-steps {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  border-right: 1px solid var(--mp-border-default);
  padding-right: var(--mp-spacing-6);
  min-height: 100%;
}

.dm-step {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-3);
  border: none;
  border-radius: var(--mp-radii-md);
  background: transparent;
  cursor: pointer;
  text-align: left;
  transition: background 120ms ease;
}
.dm-step:hover { background: var(--mp-background-neutral-subtle); }
.dm-step--active {
  background: var(--mp-background-neutral-subtle-selected, #e3e7e9);
}
.dm-step--active .dm-step-number {
  background: var(--mp-background-inverse, #080d0e);
  color: var(--mp-text-inverse, #fff);
}

.dm-step-number {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-6, 24px);
  height: var(--mp-sizes-6, 24px);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
}

.dm-step-label {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
}
.dm-step--active .dm-step-label {
  font-weight: var(--mp-font-weights-semi-bold);
}

/* ─── Form area (right) ──────────────────────────────────────────────────── */
.dm-form-area {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
  padding-left: var(--mp-spacing-8);
  padding-bottom: 64px;
  align-self: stretch;
}
.dm-form-area--narrow {
  max-width: 780px;
  align-self: start;
}
.dm-form-area--fullbleed {
  padding-left: var(--mp-spacing-6);
}
.dm-ob-header {
  display: flex;
  flex-direction: column;
}
.dm-section-caption {
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
  margin: 0;
}
.dm-ob-action {
  margin-top: var(--mp-spacing-3);
}
.dm-ob-banner-wrap {
  margin-top: var(--mp-spacing-6);
}
.dm-ob-start-btn { border-radius: var(--mp-radii-full, 999px) !important; }
.dm-ob-status {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
}
.dm-ob-status--running {
  color: var(--mp-text-secondary);
}
.dm-ob-status--done {
  color: var(--mp-feedback-success-text, #15803d);
}
.dm-ob-spinner { width: var(--mp-sizes-4, 16px); height: var(--mp-sizes-4, 16px); }
.dm-ob-spinner :deep(svg) { width: var(--mp-sizes-4, 16px); height: var(--mp-sizes-4, 16px); }
.dm-status-separator {
  color: var(--mp-text-placeholder);
  margin: 0 var(--mp-spacing-1);
}
.dm-status-link {
  color: var(--mp-text-link);
  text-decoration: none;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
}
.dm-status-link:hover { text-decoration: underline; }

.dm-form-top {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: var(--mp-spacing-8);
  align-items: start;
}

.dm-form-fields {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-4);
}

/* ─── Logo upload ────────────────────────────────────────────────────────── */
.dm-logo-upload {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--mp-spacing-2);
}

.dm-logo-label {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.dm-logo-preview {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
}

.dm-logo-img {
  height: var(--mp-sizes-16, 64px);
  width: auto;
  object-fit: contain;
  max-width: 200px;
}

.dm-logo-placeholder {
  width: var(--mp-sizes-24, 100px);
  height: var(--mp-sizes-16, 64px);
  border: 1px dashed var(--mp-border-default);
  border-radius: var(--mp-radii-lg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.dm-logo-actions {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
}

/* ─── Divider + subsection ───────────────────────────────────────────────── */
.dm-divider {
  height: var(--mp-sizes-px, 1px);
  background: var(--mp-border-default);
}

.dm-subsection-title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.dm-banner-link {
  color: var(--mp-text-link);
  text-decoration: underline;
}

.dm-bank-fields {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-4);
  max-width: 480px;
}

/* ─── Action bar — sticky full-bleed footer (ed-footer pattern) ─────────── */
.dm-action-bar {
  position: sticky;
  bottom: calc(-1 * var(--mp-spacing-20, 80px));
  margin: auto calc(-1 * var(--mp-spacing-6)) calc(-1 * var(--mp-spacing-20, 80px));
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-6);
  background: var(--mp-background-stage, #ffffff);
  border-top: 1px solid var(--mp-border-subtle, #e6e8eb);
}

/* ─── Opening balance section title ─────────────────────────────────────── */
.dm-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

/* ─── Filter bar ────────────────────────────────────────────────────────── */
.dm-ob-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.dm-ob-filter-left { flex: 1; }
.dm-ob-filter-right { flex-shrink: 0; }
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral, #ffffff); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.filter-search-input::placeholder { color: var(--mp-text-placeholder, #97a0af); }

/* ─── Opening balance table ─────────────────────────────────────────────── */
.dm-ob-table-wrap {
  overflow: hidden;
}
.dm-ob-table {
  width: 100%;
  border-collapse: collapse;
}
.dm-ob-col--amount { width: 200px; }

.dm-ob-th {
  height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-4);
  text-align: left;
  vertical-align: middle;
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--mp-letter-spacings-wide, 0.4px);
  white-space: nowrap;
}
.dm-ob-th:first-child { padding-left: var(--mp-spacing-4); }
.dm-ob-th--num { text-align: right; }

.dm-ob-td {
  height: var(--mp-sizes-12, 48px);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
  background: var(--mp-background-neutral);
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  vertical-align: middle;
}
.dm-ob-table tbody tr:last-child .dm-ob-td { border-bottom: none; }
.dm-ob-td:first-child { padding-left: var(--mp-spacing-4); }
.dm-ob-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.dm-ob-td--empty { color: var(--mp-text-placeholder); }

.dm-ob-code {
  color: var(--mp-text-secondary);
  margin-right: var(--mp-spacing-2);
  font-variant-numeric: tabular-nums;
}

/* ─── Placeholder for unbuilt steps ──────────────────────────────────────── */
.dm-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-16) 0;
  text-align: center;
}

.dm-placeholder-text {
  margin: 0;
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.dm-placeholder-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
</style>
