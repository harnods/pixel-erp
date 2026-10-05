<!-- prod-parity: jurnal-frontend-app/src/pages/sales/ProFormaInvoices/NewAndEdit.vue (+ components/NewEdit/*) and pages/sales/pro_forma_orders/new_and_edit.vue (+ BillingMethodSelector, GlobalPercentInput, NewEdit/Table) -->
<script setup lang="ts">
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpTextarea, MpDatePicker, MpCheckbox, MpInputTag,
  MpButton, MpButtonGroup, MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, type DataInterface,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { formatIDR } from '~/utils/currency'
import { successToast } from '~/utils/toasts'
import { getCustomer } from '~/data/customers'
import {
  masterOf, masterOptions, siblingsOf, billedElsewhere, nextProgressNumber, createProgressDoc, totalsOf,
  type ProgressMethod, type ProgressLine,
} from '~/data/progressInvoices'

defineProps<{ orderId: string }>()
const { t } = useLocale()
const route = useRoute()
const router = useRouter()

const kind = computed(() => (route.path.startsWith('/proforma') ? 'proforma' : 'progress'))
const entity = computed(() => (kind.value === 'progress' ? t('Progress invoice') : t('Proforma invoice')))
const listPath = computed(() => (kind.value === 'progress' ? '/progress-invoice' : '/proforma-invoice'))
const base = computed(() => (kind.value === 'progress' ? '/progress-invoices' : '/proforma-invoices'))
// Prod: "Create progress invoice" (ProFormaInvoices Header) / "Create Proforma Invoice #n" (pro_forma_orders).
const title = computed(() => `${t('Create')} ${entity.value.toLowerCase()}`)

function todayIso() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
function isoToDisplay(iso: string) { const [y, m, d] = iso.split('-'); return `${d}/${m}/${y}` }
function displayToIso(s: string) { const [d, m, y] = (s || '').split('/'); return y && m && d ? `${y}-${m}-${d}` : '' }
function addDaysIso(iso: string, n: number) { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
function toNum(s: string): number | null { const c = String(s ?? '').replace(/[^\d.-]/g, ''); return c === '' || c === '-' ? null : Number(c) }

const masterId = ref(String(route.query.master ?? ''))
const master = computed(() => (masterId.value ? masterOf(kind.value, masterId.value) : null))
const options = computed(() => masterOptions(kind.value))
const siblings = computed(() => (master.value ? siblingsOf(kind.value, master.value.id) : []))
const elsewhere = computed(() => (master.value ? billedElsewhere(kind.value, master.value.id) : []))
const lockedMethod = computed<ProgressMethod | null>(() => siblings.value[0]?.method ?? null)

const form = reactive({
  emails: [] as DataInterface[],
  billingAddress: '',
  date: isoToDisplay(todayIso()),
  dueDate: isoToDisplay(addDaysIso(todayIso(), 30)),
  term: 'Net 30',
  customerRefNo: '',
  message: '',
  memo: '',
  method: 'percentage' as ProgressMethod,
})
// One input per master line: % (percentage) or Rp amount (fixed amount).
const inputs = ref<string[]>([])
const globalOn = ref(false)
const globalValue = ref('')
const errors = reactive<Record<string, string>>({})
const lineErrors = ref<string[]>([])
const showRangeBanner = ref(false)

watch(master, (m) => {
  Object.keys(errors).forEach((k) => delete errors[k])
  lineErrors.value = []
  showRangeBanner.value = false
  if (!m) { inputs.value = []; return }
  const c = getCustomer(m.customer.id)
  form.emails = c?.email ? [{ id: c.email, text: c.email, value: c.email, isInvalid: false, isReadOnly: false }] : []
  form.billingAddress = c?.city ? `${m.customer.name}, ${c.city}` : ''
  form.method = lockedMethod.value ?? 'percentage'
  inputs.value = m.lines.map(() => '')
}, { immediate: true })

const termOptions = ['Net 30', 'Net 14', 'Net 45', 'Cash on delivery'].map((v) => ({ value: v, label: v }))
const methodOptions = computed(() => [
  { value: 'percentage', label: t('Percentage') },
  { value: 'fixed_amount', label: t('Fixed amount') },
])
const methodDescription = computed(() => (form.method === 'percentage'
  ? t('Invoice based on percentage of total amount per product line.')
  : t('Invoice based on a specific amount per line item.')))

function remainingOf(i: number) {
  const m = master.value
  if (!m) return 0
  return Math.max(0, m.lines[i]!.masterAmount - (elsewhere.value[i] ?? 0))
}
function billedOf(i: number): number {
  const m = master.value
  if (!m) return 0
  const v = toNum(inputs.value[i] ?? '') ?? 0
  if (form.method === 'percentage') return Math.round((m.lines[i]!.masterAmount * v) / 100)
  return Math.round(v)
}

const draftLines = computed<ProgressLine[]>(() => (master.value?.lines ?? []).map((l, i) => ({
  ...l,
  billedPct: form.method === 'percentage' ? (toNum(inputs.value[i] ?? '') ?? 0) : null,
  billed: billedOf(i),
})))
const totals = computed(() => totalsOf({ lines: draftLines.value, status: 'open' }))

function onMethod(v: string) {
  if (!v || lockedMethod.value) return
  form.method = v as ProgressMethod
  inputs.value = inputs.value.map(() => '')
  globalValue.value = ''
  lineErrors.value = []
}
function onInput(i: number, v: string) {
  inputs.value[i] = v
  if (lineErrors.value[i]) lineErrors.value[i] = ''
}
function applyGlobal() {
  const v = toNum(globalValue.value)
  errors.global = ''
  if (v === null) { errors.global = form.method === 'percentage' ? t('Enter a valid percentage.') : t('Enter a valid amount.'); return }
  if (v < 0) { errors.global = form.method === 'percentage' ? t('Percentage cannot be negative.') : t('Amount cannot be negative.'); return }
  if (form.method === 'percentage' && v > 100) { errors.global = t('Percentage cannot exceed 100%.'); return }
  inputs.value = inputs.value.map(() => String(v))
  lineErrors.value = []
}

const warning = computed(() => {
  if (!master.value) return ''
  const blanks = inputs.value.some((v) => v.trim() === '')
  const allZero = inputs.value.every((v) => (toNum(v) ?? 0) === 0)
  if (allZero) return form.method === 'percentage' ? t('All lines are at 0%. The total down payment is 0.') : t('All lines are at 0. The total down payment is 0.')
  if (blanks) return form.method === 'percentage' ? t('One or more lines have no % entered. They will be saved as 0%.') : t('One or more lines have no amount entered. They will be saved as 0.')
  return ''
})

function validate(): boolean {
  Object.keys(errors).forEach((k) => delete errors[k])
  showRangeBanner.value = false
  if (!master.value) {
    errors.master = kind.value === 'progress' ? t('You must select master invoice') : t('You must select master order')
    return false
  }
  if (!displayToIso(form.date)) errors.date = t('You must fill in transaction date')
  const errs = master.value.lines.map((l, i) => {
    const raw = inputs.value[i] ?? ''
    if (raw.trim() === '') return ''
    const v = toNum(raw)
    if (form.method === 'percentage') {
      if (v === null || Number.isNaN(v)) return t('Enter a valid percentage.')
      if (v < 0) return t('Percentage cannot be negative.')
      if (v > 100) return t('Percentage cannot exceed 100%.')
    } else {
      if (v === null || Number.isNaN(v)) return t('Enter a valid amount.')
      if (v < 0) return t('Amount cannot be negative.')
      if (l.unitPrice === 0) return t('Unit price is 0 — the amount cannot be calculated.')
    }
    if (billedOf(i) > remainingOf(i)) return t('Amount exceeds billable balance due')
    return ''
  })
  lineErrors.value = errs
  if (errs.some(Boolean)) showRangeBanner.value = true
  return Object.keys(errors).length === 0 && !showRangeBanner.value
}

function save() {
  if (!validate() || !master.value) return
  const m = master.value
  const doc = createProgressDoc({
    kind: kind.value,
    number: nextProgressNumber(kind.value, m.id, m.number),
    masterId: m.id,
    masterNumber: m.number,
    customer: { ...m.customer },
    email: form.emails.map((e) => String(e.value ?? e.text)).filter(Boolean),
    billingAddress: form.billingAddress.trim(),
    date: displayToIso(form.date),
    dueDate: displayToIso(form.dueDate) || displayToIso(form.date),
    term: form.term,
    customerRefNo: form.customerRefNo.trim(),
    method: form.method,
    lines: draftLines.value,
    message: form.message.trim(),
    memo: form.memo.trim(),
    status: 'open',
    tags: [],
  })
  successToast(t('Successfully processed'))
  router.push(`${base.value}/${doc.id}`)
}
function cancel() { router.push(listPath.value) }
</script>

<template>
  <div class="pgf-page">
    <header class="pgf-bar">
      <div class="pgf-bar-left">
        <button class="pgf-crumb" @click="cancel">{{ entity }}</button>
        <h1 class="pgf-h1">{{ title }}</h1>
      </div>
    </header>

    <div class="pgf-stage">
      <!-- ── Header 1: Customer · Email · Balance due ── -->
      <section class="pgf-header1 pgf-dashed">
        <MpFormControl id="pgf-customer" class="pgf-field" is-disabled>
          <MpFormLabel>{{ t('Customer') }}</MpFormLabel>
          <MpInput id="pgf-customer-inp" :model-value="master?.customer.name ?? ''" is-disabled is-full-width />
        </MpFormControl>
        <MpFormControl id="pgf-email" class="pgf-field">
          <MpFormLabel>{{ t('Email') }}</MpFormLabel>
          <MpInputTag id="pgf-email-inp" :data="form.emails" @change="(d: DataInterface[]) => (form.emails = d)" />
        </MpFormControl>
        <div class="pgf-header1-total">
          <h3 class="pgf-header1-total-value">{{ t('Balance due') }} {{ formatIDR(totals.balance) }}</h3>
        </div>
      </section>

      <!-- ── Header 2 ── -->
      <section class="pgf-header2">
        <div class="pgf-col">
          <MpFormControl id="pgf-billing" class="pgf-field">
            <MpFormLabel>{{ t('Billing address') }}</MpFormLabel>
            <MpTextarea id="pgf-billing-inp" v-model="form.billingAddress" is-full-width />
          </MpFormControl>
        </div>
        <div class="pgf-col">
          <MpFormControl id="pgf-date" class="pgf-field" is-required :is-invalid="!!errors.date">
            <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
            <MpDatePicker id="pgf-date-dp" v-model="form.date" class="pgf-datepicker" format="DD/MM/YYYY" value-type="format" use-portal @update:model-value="errors.date = ''" />
            <MpFormErrorMessage>{{ errors.date }}</MpFormErrorMessage>
          </MpFormControl>
          <MpFormControl id="pgf-due" class="pgf-field">
            <MpFormLabel>{{ t('Due date') }}</MpFormLabel>
            <MpDatePicker id="pgf-due-dp" v-model="form.dueDate" class="pgf-datepicker" format="DD/MM/YYYY" value-type="format" use-portal />
          </MpFormControl>
          <MpFormControl id="pgf-term" class="pgf-field">
            <MpFormLabel>{{ t('Term') }}</MpFormLabel>
            <ErpFilterSelect id="pgf-term-select" :model-value="form.term" :placeholder="t('Term')" :options="termOptions" width="100%" variant="field" @update:model-value="(v: string) => (form.term = v)" />
          </MpFormControl>
        </div>
        <div class="pgf-col">
          <MpFormControl id="pgf-no" class="pgf-field">
            <MpFormLabel>{{ t('Transaction no.') }}</MpFormLabel>
            <MpInput id="pgf-no-inp" :model-value="master ? nextProgressNumber(kind, master.id, master.number) : ''" is-disabled is-full-width />
          </MpFormControl>
          <MpFormControl id="pgf-ref" class="pgf-field">
            <MpFormLabel>{{ t('Customer reference no.') }}</MpFormLabel>
            <MpInput id="pgf-ref-inp" v-model="form.customerRefNo" is-full-width />
          </MpFormControl>
        </div>
        <div class="pgf-col">
          <MpFormControl id="pgf-master" class="pgf-field" is-required :is-invalid="!!errors.master">
            <MpFormLabel>{{ kind === 'progress' ? t('Master invoice') : t('Master Order') }}</MpFormLabel>
            <ErpFilterSelect
              id="pgf-master-select" :model-value="masterId"
              :placeholder="kind === 'progress' ? t('Select sales invoice') : t('Select sales order')"
              :options="options" width="100%" variant="field"
              @update:model-value="(v: string) => { masterId = v; errors.master = '' }"
            />
            <MpFormErrorMessage>{{ errors.master }}</MpFormErrorMessage>
          </MpFormControl>
        </div>
      </section>

      <!-- ── Invoicing method + Set all at once + Price includes tax ── -->
      <section class="pgf-items">
        <div class="pgf-items-tools">
          <div class="pgf-tools-left">
            <MpFormControl id="pgf-method" class="pgf-method" :is-disabled="!!lockedMethod">
              <MpFormLabel>{{ t('Invoicing method') }}</MpFormLabel>
              <ErpFilterSelect id="pgf-method-select" :model-value="form.method" :placeholder="t('Invoicing method')" :options="methodOptions" :is-clearable="false" :is-disabled="!!lockedMethod" width="100%" variant="field" @update:model-value="onMethod" />
              <span class="pgf-hint">{{ lockedMethod && kind === 'proforma' ? t('The invoicing method is fixed by another proforma invoice on this sales order.') : methodDescription }}</span>
            </MpFormControl>
            <div class="pgf-global">
              <MpCheckbox id="pgf-global-toggle" :is-checked="globalOn" @change="globalOn = !globalOn">{{ t('Set all at once') }}</MpCheckbox>
              <div class="pgf-global-row">
                <MpFormControl id="pgf-global-value" class="pgf-global-field" :is-disabled="!globalOn" :is-invalid="!!errors.global">
                  <div class="pgf-affix">
                    <span v-if="form.method === 'fixed_amount'" class="pgf-affix-text">Rp</span>
                    <MpInput id="pgf-global-inp" v-model="globalValue" inputmode="decimal" :is-disabled="!globalOn" is-full-width />
                    <span v-if="form.method === 'percentage'" class="pgf-affix-text">%</span>
                  </div>
                  <MpFormErrorMessage>{{ errors.global }}</MpFormErrorMessage>
                </MpFormControl>
                <MpButton id="pgf-global-apply" variant="secondary" is-rounded :is-disabled="!globalOn" @click="applyGlobal">{{ t('Apply') }}</MpButton>
              </div>
            </div>
          </div>
          <MpCheckbox id="pgf-tax-incl" :is-checked="false" is-disabled>{{ t('Price includes tax') }}</MpCheckbox>
        </div>

        <MpBanner v-if="showRangeBanner" id="pgf-range-banner" variant="danger" align-items="center">
          <MpBannerIcon id="pgf-range-banner-icon" />
          <MpBannerTitle>{{ t('Failed to save') }}</MpBannerTitle>
          <MpBannerDescription>{{ form.method === 'percentage' ? t('One or more lines have an invalid down payment percentage. Fix the highlighted lines, then save again.') : t('One or more lines have an invalid down payment amount. Fix the highlighted lines, then save again.') }}</MpBannerDescription>
        </MpBanner>
        <MpBanner v-else-if="warning" id="pgf-warn-banner" variant="warning" align-items="center">
          <MpBannerIcon id="pgf-warn-banner-icon" />
          <MpBannerDescription>{{ warning }}</MpBannerDescription>
        </MpBanner>

        <div class="pgf-items-scroll">
          <table class="pgf-table">
            <thead>
              <tr>
                <th class="pgf-th">{{ t('Product') }}</th>
                <th class="pgf-th">{{ t('Description') }}</th>
                <th class="pgf-th pgf-th--billed">{{ t('Amount billed') }}</th>
                <th class="pgf-th pgf-th--num">{{ t('Qty') }}</th>
                <th class="pgf-th">{{ t('Units') }}</th>
                <th class="pgf-th pgf-th--num">{{ t('Unit price') }}</th>
                <th class="pgf-th pgf-th--num">{{ t('Discount') }}</th>
                <th class="pgf-th">{{ t('Tax') }}</th>
                <th class="pgf-th pgf-th--num">{{ t('Amount') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-if="!master">
                <td class="pgf-td pgf-empty" colspan="9">{{ kind === 'progress' ? t('Select a master invoice to load its products.') : t('Select a master order to load its products.') }}</td>
              </tr>
              <tr v-for="(l, i) in master?.lines ?? []" :key="i">
                <td class="pgf-td">
                  <span class="pgf-product"><span>{{ l.product }}</span><span class="pgf-sub">{{ t('SKU') }}: {{ l.sku }}</span></span>
                </td>
                <td class="pgf-td pgf-muted">{{ l.description }}</td>
                <td class="pgf-td pgf-td--billed">
                  <MpFormControl :id="`pgf-line-${i}`" :is-invalid="!!lineErrors[i]">
                    <div class="pgf-affix">
                      <span v-if="form.method === 'fixed_amount'" class="pgf-affix-text">Rp</span>
                      <MpInput :id="`pgf-line-${i}-inp`" :model-value="inputs[i]" inputmode="decimal" is-full-width @update:model-value="(v: string) => onInput(i, v)" />
                      <span v-if="form.method === 'percentage'" class="pgf-affix-text">%</span>
                    </div>
                    <MpFormErrorMessage>{{ lineErrors[i] }}</MpFormErrorMessage>
                  </MpFormControl>
                  <span class="pgf-sub">{{ t('From') }} {{ formatIDR(l.masterAmount) }}</span>
                  <span class="pgf-sub">{{ t('Billable balance due:') }} {{ formatIDR(remainingOf(i)) }}</span>
                </td>
                <td class="pgf-td pgf-td--num">{{ l.qty }}</td>
                <td class="pgf-td">{{ l.unit }}</td>
                <td class="pgf-td pgf-td--num">{{ formatIDR(l.unitPrice) }}</td>
                <td class="pgf-td pgf-td--num">{{ l.discountPct }}%</td>
                <td class="pgf-td">{{ l.taxLabel }}</td>
                <td class="pgf-td pgf-td--num">{{ formatIDR(draftLines[i]?.billed ?? 0) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ── Message / memo + totals ── -->
      <section class="pgf-bottom">
        <div class="pgf-notes">
          <MpFormControl id="pgf-message" class="pgf-field">
            <MpFormLabel>{{ t('Message') }}</MpFormLabel>
            <MpTextarea id="pgf-message-inp" v-model="form.message" is-full-width />
          </MpFormControl>
          <MpFormControl id="pgf-memo" class="pgf-field">
            <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
            <MpTextarea id="pgf-memo-inp" v-model="form.memo" is-full-width />
          </MpFormControl>
        </div>
        <div class="pgf-totals">
          <div class="pgf-totals-row pgf-totals-row--h3"><span>{{ t('Subtotal') }}</span><span>{{ formatIDR(totals.subtotal) }}</span></div>
          <div class="pgf-totals-row"><span>{{ totals.taxLabel }}</span><span>{{ formatIDR(totals.taxAmount) }}</span></div>
          <div class="pgf-rule" />
          <div class="pgf-totals-row pgf-totals-row--h3"><span>{{ t('Total') }}</span><span>{{ formatIDR(totals.total) }}</span></div>
          <div class="pgf-rule" />
          <div class="pgf-totals-row pgf-totals-row--h3"><span>{{ t('Balance due') }}</span><span>{{ formatIDR(totals.balance) }}</span></div>
        </div>
      </section>

      <MpButtonGroup class="erp-action-footer pgf-footer">
        <MpButton variant="ghost" is-rounded @click="cancel">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="save">{{ t('Create') }}</MpButton>
      </MpButtonGroup>
    </div>
  </div>
</template>

<style scoped>
/* Shell + header grid copied from NewSalesInvoicePage.vue (si-form-*). */
.pgf-page { --pgf-field: 318px; height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.pgf-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.pgf-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.pgf-crumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-md);
}
.pgf-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.pgf-h1 { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; color: var(--mp-text-default); white-space: nowrap; }
.pgf-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-6);
}
.pgf-dashed { padding-bottom: var(--mp-spacing-5); border-bottom: 1px dashed var(--mp-border-default); }
.pgf-header1 { display: flex; align-items: flex-start; gap: 16px 24px; }
.pgf-header1 > .pgf-field { flex: 0 0 var(--pgf-field); }
.pgf-header1-total { margin-left: auto; align-self: flex-end; padding-bottom: var(--mp-spacing-2); }
.pgf-header1-total-value { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); white-space: nowrap; }
.pgf-header2 { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 16px 24px; }
.pgf-col { flex: 0 0 var(--pgf-field); min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.pgf-field { min-width: 0; }
.pgf-field :deep(.input-tag__root) { width: 100%; }
.pgf-datepicker, .pgf-datepicker :deep(.mp-datepicker__root) { width: 100%; }

.pgf-items { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.pgf-items-tools { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-6); }
.pgf-tools-left { display: flex; align-items: flex-start; gap: var(--mp-spacing-6); }
.pgf-method { width: 240px; }
.pgf-hint { display: block; margin-top: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pgf-global { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding-top: var(--mp-spacing-1); }
.pgf-global-row { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); }
.pgf-global-field { width: 160px; }
.pgf-affix { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pgf-affix-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); white-space: nowrap; }

.pgf-items-scroll { overflow-x: auto; }
.pgf-table { width: 100%; min-width: 1200px; border-collapse: collapse; }
.pgf-th {
  height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase;
  color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pgf-th--num { text-align: right; }
.pgf-th--billed { width: 220px; }
.pgf-td {
  padding: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.pgf-td--num { text-align: right; white-space: nowrap; }
.pgf-td--billed { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.pgf-product { display: flex; flex-direction: column; }
.pgf-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pgf-muted { color: var(--mp-text-secondary); }
.pgf-empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-6) var(--mp-spacing-2); }

.pgf-bottom { display: grid; grid-template-columns: 1fr 380px; gap: var(--mp-spacing-6); align-items: start; }
.pgf-notes { display: flex; flex-direction: column; gap: var(--mp-spacing-4); max-width: var(--pgf-field); }
.pgf-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.pgf-totals-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pgf-totals-row--h3 { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pgf-rule { height: 1px; border-top: 1px dashed var(--mp-border-default); }
.pgf-footer { align-self: flex-end; }
.pgf-footer :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }
</style>
