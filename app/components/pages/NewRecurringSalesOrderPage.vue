<script setup lang="ts">
/**
 * "New recurring sales order" form — Sales ▸ Sales orders ▸ Recurring orders ▸ New
 * Based on NewRecurringSalesInvoicePage.vue, adapted for sales orders (no tax column).
 */
import {
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  MpButton, MpButtonGroup, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpTextarea,
  MpInputGroup, MpInputLeftAddon,
  MpDatePicker, MpInputTag, MpCheckbox, MpUpload, MpUploadList,
  MpAutocomplete, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpIcon, MpTextlink, toast, css,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import type { DataInterface } from '@mekari/pixel3'
import {
  customers, products, recurringSalesOrders,
  PAYMENT_TERMS, WAREHOUSES, UNIT_OPTIONS,
} from '~/data'
import type { RecurringSalesOrder } from '~/data/salesOrders'
import NumberFormatSettingsModal, { type NumberFormatConfig } from '~/components/patterns/NumberFormatSettingsModal.vue'
import ErpDimensionTagUpsell from '~/components/patterns/ErpDimensionTagUpsell.vue'
import ErpLineDimensionsCell from '~/components/patterns/ErpLineDimensionsCell.vue'
import ErpBulkDimensionsPopover from '~/components/patterns/ErpBulkDimensionsPopover.vue'
import ErpDimensionsInfoPopover from '~/components/patterns/ErpDimensionsInfoPopover.vue'
import { applicableDimensions } from '~/data/dimensions'
import ProductCell from '~/components/patterns/ProductCell.vue'

const router = useRouter()
const { t } = useLocale()
const { dimensionsActivated } = useDimensionsActivation()
const showDimensionsColumn = computed(() => dimensionsActivated.value && applicableDimensions('sales').length > 0)

const WITHHOLDING_ACCOUNTS = [
  { id: '2-20120', name: '2-20120 Withholding Tax Payable' },
  { id: '1-10003', name: '1-10003 Bank BCA' },
  { id: '1-10004', name: '1-10004 VISA 8265' },
]
const DEPOSIT_ACCOUNTS = [
  { id: '1-10003', name: '1-10003 Bank BCA' },
  { id: '1-10001', name: '1-10001 Cash on hand' },
]

function todayISO() { return new Date().toISOString().slice(0, 10) }
function isoToDMY(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function dmyToIso(dmy: string) {
  if (!dmy) return todayISO()
  const [d, m, y] = dmy.split('/')
  return `${y}-${m}-${d}`
}
function toTagData(values: string[]): DataInterface[] {
  return values.map((v, i) => ({ text: v, id: `${i}-${v}`, value: v, isInvalid: false, isReadOnly: false }))
}

// ── Header fields ─────────────────────────────────────────────────────────────
const customerId      = ref('')
const customerError   = ref(false)
const customerOptions = customers.map(c => ({ id: c.id, name: c.name }))

const emailTags      = ref<DataInterface[]>([])
const billingAddress = ref('')
const shipTo         = ref('')
const txDate         = ref(isoToDMY(todayISO()))
const dueDate        = ref('')
const shipDate       = ref('')
const shipVia        = ref('')
const paymentTerms   = ref('')
const trackingNo     = ref('')
const referenceNo    = ref('')
const warehouse      = ref('')
const tagsList       = ref<DataInterface[]>([])

// ── Recurring schedule fields ─────────────────────────────────────────────────
const repeatInterval  = ref(1)
const repeatUnit      = ref('month')
const repeatUnitOptions = [
  { label: t('Day'), value: 'day' },
  { label: t('Week'), value: 'week' },
  { label: t('Month'), value: 'month' },
  { label: t('Year'), value: 'year' },
]
const endRepeat       = ref('never')
const endRepeatOptions = [
  { label: t('Repeat forever'), value: 'never' },
  { label: t('End after'), value: 'after' },
  { label: t('End on'), value: 'on' },
]
const endAfterCount   = ref(12)
const endOnDate       = ref('')
const startDate       = ref(isoToDMY(todayISO()))
const sendAutoEmail   = ref(false)

const nextTransactionDate = computed(() => {
  if (!startDate.value) return ''
  const iso = dmyToIso(startDate.value)
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const unit = repeatUnit.value
  const n = repeatInterval.value || 1
  if (unit === 'day') d.setDate(d.getDate() + n)
  else if (unit === 'week') d.setDate(d.getDate() + n * 7)
  else if (unit === 'month') d.setMonth(d.getMonth() + n)
  else if (unit === 'year') d.setFullYear(d.getFullYear() + n)
  return isoToDMY(d.toISOString().slice(0, 10))
})

// ── Transaction no. settings ──────────────────────────────────────────────────
const noSettingsOpen = ref(false)
const nextTxNo = computed(() => `Recurring Order #${nextRecurringNumber()}`)
const txNoFormats = [{ label: t('Auto'), value: 'auto' }]
function onNoFormatSave(_config: NumberFormatConfig) { noSettingsOpen.value = false }

const requiresShipping = ref(true)
const shipToDifferent  = ref(true)
const priceIncludesTax = ref(false)

function onEmailChange(data: DataInterface[]) { emailTags.value = data }
function onTagsChange(data: DataInterface[])  { tagsList.value = data }

function onCustomerChange(id: unknown) {
  customerError.value = false
  const c = customers.find(x => x.id === id)
  if (c?.email && !emailTags.value.length) emailTags.value = toTagData([c.email])
}

// ── Line items ────────────────────────────────────────────────────────────────
interface LineItem {
  _key: number
  product: string
  sku: string
  description: string
  qty: number
  unit: string
  unitPrice: number
  discountPct: number
  productError: boolean
  qtyError: boolean
  dimensions: Record<string, string>
  dimensionErrors: Record<string, boolean>
}
let _seq = 0
const items = ref<LineItem[]>([])

function onBulkDimensions(patch: Record<string, string>) {
  items.value.forEach((item) => {
    item.dimensions = { ...item.dimensions, ...patch }
    for (const dimId of Object.keys(patch)) { if (patch[dimId]) item.dimensionErrors[dimId] = false }
  })
}
function onItemDimensionsUpdate(item: LineItem, v: Record<string, string>) {
  item.dimensions = v
  for (const dimId of Object.keys(v)) { if (v[dimId]) item.dimensionErrors[dimId] = false }
}

function removeItem(key: number) { items.value = items.value.filter(it => it._key !== key) }
function lineAmount(item: LineItem) {
  return Math.round(item.qty * item.unitPrice * (1 - item.discountPct / 100))
}

function productMatches(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return products
  return products.filter(p => p.name.toLowerCase().includes(q))
}

const NEW_ROW_KEY = -1
const openProductRow = ref<number | null>(null)

function selectProduct(item: LineItem, p: typeof products[number]) {
  item.product = p.name
  item.sku = p.code
  item.unit = p.unit
  item.unitPrice = p.price
  item.productError = false
  openProductRow.value = null
}

const newRowSearch = ref('')
function onProductAdd(_search?: string) { void _search }
function selectNewProduct(p: typeof products[number]) {
  items.value.push({
    _key: ++_seq,
    product: p.name,
    sku: p.code,
    description: '',
    qty: 1,
    unit: p.unit,
    unitPrice: p.price,
    discountPct: 0,
    productError: false,
    qtyError: false,
    dimensions: {},
    dimensionErrors: {},
  })
  newRowSearch.value = ''
  openProductRow.value = null
}

const dragSrcIndex  = ref<number | null>(null)
const dragOverIndex = ref<number | null>(null)
function onDragStart(ev: DragEvent, idx: number) {
  dragSrcIndex.value = idx
  if (ev.dataTransfer) { ev.dataTransfer.effectAllowed = 'move'; ev.dataTransfer.setData('text/plain', String(idx)) }
}
function onDragOver(ev: DragEvent, idx: number) {
  ev.preventDefault()
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = 'move'
  dragOverIndex.value = idx
}
function onDrop(ev: DragEvent, toIdx: number) {
  ev.preventDefault()
  const fromIdx = dragSrcIndex.value
  if (fromIdx === null || fromIdx === toIdx) { dragSrcIndex.value = null; dragOverIndex.value = null; return }
  const arr = [...items.value]
  const [moved] = arr.splice(fromIdx, 1)
  arr.splice(toIdx, 0, moved!)
  items.value = arr
  dragSrcIndex.value = null
  dragOverIndex.value = null
}
function onDragEnd() { dragSrcIndex.value = null; dragOverIndex.value = null }

const unitOptions = computed(() => Array.from(new Set([...UNIT_OPTIONS, ...items.value.map(i => i.unit)])))

const hasLineItemErrors = computed(() => items.value.some(it => it.productError || it.qtyError || Object.values(it.dimensionErrors).some(Boolean)))
const noItemsError = ref(false)

// ── Totals ────────────────────────────────────────────────────────────────────
const subtotal      = computed(() => items.value.reduce((s, it) => s + it.qty * it.unitPrice, 0))
const discountTotal = computed(() => items.value.reduce((s, it) => s + Math.round(it.qty * it.unitPrice * it.discountPct / 100), 0))

const globalDiscountType  = ref<'%' | 'Rp'>('%')
const globalDiscountValue = ref(0)
const globalDiscountAmount = computed(() =>
  globalDiscountType.value === '%'
    ? Math.round((subtotal.value - discountTotal.value) * (globalDiscountValue.value / 100))
    : globalDiscountValue.value,
)

const taxBase     = computed(() => subtotal.value - discountTotal.value - globalDiscountAmount.value)
const taxAmount   = computed(() => Math.round(taxBase.value * 0.11))
const shippingFee = ref(0)
const total       = computed(() => taxBase.value + taxAmount.value + shippingFee.value)

// ── Less: Withholding tax ─────────────────────────────────────────────────────
interface WithholdingRow {
  id: number
  name: string
  amount: string
  unit: 'Rp' | '%'
  accountId: string
  nameError: boolean
  amountError: boolean
  accountError: boolean
}
let whSeq = 0
function makeWithholdingRow(): WithholdingRow {
  whSeq += 1
  return {
    id: whSeq, name: whSeq === 1 ? t('Withholding tax') : '', amount: '', unit: '%', accountId: '',
    nameError: false, amountError: false, accountError: false,
  }
}
const lessWithholding = ref(false)
const withholdingRows = ref<WithholdingRow[]>([makeWithholdingRow()])
function addWithholdingRow() { withholdingRows.value.push(makeWithholdingRow()) }
function removeWithholdingRow(id: number) {
  if (withholdingRows.value.length === 1) return
  withholdingRows.value = withholdingRows.value.filter(r => r.id !== id)
}
const withholdingTotal = computed(() =>
  lessWithholding.value
    ? withholdingRows.value.reduce((s, r) => {
        const amt = Number(r.amount) || 0
        return s + (r.unit === '%' ? Math.round((amt / 100) * total.value) : amt)
      }, 0)
    : 0,
)

// ── Less: Deposit ─────────────────────────────────────────────────────────────
const lessDeposit         = ref(false)
const depositAccountId    = ref('')
const depositAccountError = ref(false)
const depositAmount       = ref('')
const depositAmountError  = ref(false)
const depositPaid = computed(() => lessDeposit.value ? (Number(depositAmount.value) || 0) : 0)

const balanceDue = computed(() => total.value - withholdingTotal.value - depositPaid.value)

const fmt = formatIDR
function fmtPlain(n: number) {
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}

// ── Notes + attachments ───────────────────────────────────────────────────────
const message = ref('')
const memo    = ref('')
const attachments = ref<{ name: string; sizeKB: number }[]>([])
function iconForFile(name: string): 'pdf' | 'excel-document' | 'word-document' | 'doc' {
  if (name.endsWith('.pdf')) return 'pdf'
  if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'excel-document'
  if (name.endsWith('.doc') || name.endsWith('.docx')) return 'word-document'
  return 'doc'
}
function onFilesChange(e: Event) {
  const files = (e.target as HTMLInputElement | null)?.files
  if (!files) return
  for (const f of Array.from(files)) {
    attachments.value.push({ name: f.name, sizeKB: Math.round(f.size / 1024 * 10) / 10 })
  }
}
function removeAttachment(idx: number) { attachments.value.splice(idx, 1) }

// ── Frequency label ───────────────────────────────────────────────────────────
const UNIT_LABEL_MAP: Record<string, string> = { day: 'Daily', week: 'Weekly', month: 'Monthly', year: 'Yearly' }
function frequencyLabel(): string {
  if (repeatInterval.value === 1) return UNIT_LABEL_MAP[repeatUnit.value] || 'Monthly'
  const unitLabel = repeatUnitOptions.find(o => o.value === repeatUnit.value)?.label || repeatUnit.value
  return `Every ${repeatInterval.value} ${unitLabel.toLowerCase()}s`
}

// ── Save ──────────────────────────────────────────────────────────────────────
function validate(): boolean {
  let ok = true
  if (!customerId.value) { customerError.value = true; ok = false }
  noItemsError.value = !items.value.length
  if (!items.value.length) ok = false

  items.value.forEach(it => {
    if (!it.product) { it.productError = true; ok = false }
    if (!(it.qty > 0)) { it.qtyError = true; ok = false }
    if (showDimensionsColumn.value) {
      applicableDimensions('sales').forEach((dim) => {
        if (dim.mandatory && !it.dimensions[dim.id]) { it.dimensionErrors[dim.id] = true; ok = false }
      })
    }
  })

  if (lessWithholding.value) {
    withholdingRows.value.forEach(row => {
      if (!row.name) { row.nameError = true; ok = false }
      if (!(Number(row.amount) > 0)) { row.amountError = true; ok = false }
      if (!row.accountId) { row.accountError = true; ok = false }
    })
  }
  if (lessDeposit.value) {
    if (!depositAccountId.value) { depositAccountError.value = true; ok = false }
    if (!(Number(depositAmount.value) > 0)) { depositAmountError.value = true; ok = false }
  }
  return ok
}

function nextRecurringNumber(): number {
  return recurringSalesOrders.reduce((max, r) => {
    const num = parseInt(r.id.replace(/\D/g, ''), 10)
    return Number.isNaN(num) ? max : Math.max(max, num)
  }, 0) + 1
}
function nextRecurringId(): string {
  const n = nextRecurringNumber()
  return `RSO${String(n).padStart(3, '0')}`
}

function onCancel() {
  router.push('/sales-orders?tab=Recurring+orders')
}

function onSave() {
  if (!validate()) return

  const customer = customers.find(c => c.id === customerId.value)!
  const sd = startDate.value ? dmyToIso(startDate.value) : todayISO()
  const nd = nextTransactionDate.value ? dmyToIso(nextTransactionDate.value) : sd

  const lineItemsData = items.value.map(it => ({
    product: it.product, sku: it.sku, description: it.description,
    qty: it.qty, unit: it.unit, unitPrice: it.unitPrice,
    discountPct: it.discountPct, amount: Math.round(it.qty * it.unitPrice * (1 - it.discountPct / 100)),
  }))

  const recurring: RecurringSalesOrder = {
    id: nextRecurringId(),
    templateName: `${customer.name} - ${frequencyLabel()}`,
    customer: { id: customer.id, name: customer.name },
    frequency: frequencyLabel(),
    amount: total.value,
    nextDate: nd,
    status: 'active',
    createdCount: 0,
    schedule: {
      repeatInterval: repeatInterval.value,
      repeatUnit: repeatUnit.value as 'day' | 'week' | 'month' | 'year',
      endRepeat: endRepeat.value as 'never' | 'after' | 'on',
      endAfterCount: endAfterCount.value,
      endOnDate: endRepeat.value === 'on' && endOnDate.value ? dmyToIso(endOnDate.value) : undefined,
      startDate: sd,
      sendAutoEmail: sendAutoEmail.value,
    },
    email: emailTags.value.map(e => e.text),
    billingAddress: billingAddress.value,
    shipTo: shipTo.value,
    paymentTerms: paymentTerms.value,
    warehouse: warehouse.value,
    referenceNo: referenceNo.value,
    tags: tagsList.value.map(t => t.text),
    lineItems: lineItemsData,
    message: message.value,
    memo: memo.value,
    totals: {
      subtotal: subtotal.value,
      discountPerLine: discountTotal.value,
      globalDiscount: globalDiscountAmount.value,
      taxLabel: 'PPN 11%',
      taxAmount: taxAmount.value,
      shippingFee: shippingFee.value,
      total: total.value,
    },
    lastUpdatedBy: 'Current User',
    lastUpdatedAt: todayISO(),
  }
  recurringSalesOrders.push(recurring)
  toast.notify({ variant: 'success', title: t('Recurring sales order created'), rootProps: { class: 'toast-enterprise' } })
  router.push('/sales-orders?tab=Recurring+orders')
}
</script>

<template>
  <div class="si-form-page">

    <!-- ── Fixed header bar ── -->
    <header class="si-form-bar">
      <div class="si-form-bar-left">
        <MpTextlink id="rso-crumb" as="a" class="si-crumb" @click.prevent="onCancel">
          {{ t('Recurring orders') }}
        </MpTextlink>
        <h1 class="si-form-h1">{{ t('New recurring sales order') }}</h1>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="si-form-stage">

      <!-- ── Header section 1: Customer + Email + Balance due ── -->
      <section class="si-header1 si-dashed-divider">
        <MpFormControl id="f-customer" class="si-field" is-required :is-invalid="customerError">
          <MpFormLabel>{{ t('Customer') }}</MpFormLabel>
          <MpAutocomplete
            id="f-customer-inp" v-model="customerId" :data="customerOptions"
            label-prop="name" value-prop="id" is-searchable use-portal is-full-width
            :placeholder="t('Select customer')" :is-invalid="customerError"
            @update:model-value="onCustomerChange"
          />
          <MpFormErrorMessage>{{ t('You must select customer') }}</MpFormErrorMessage>
        </MpFormControl>

        <MpFormControl id="f-email" class="si-field">
          <MpFormLabel>{{ t('Email') }}</MpFormLabel>
          <MpInputTag id="f-email-inp" :data="emailTags" :placeholder="t('+Add email')" @change="onEmailChange" />
        </MpFormControl>

        <div class="si-header1-total">
          <h3 class="si-header1-total-value">{{ t('Balance due') }} {{ fmt(balanceDue) }}</h3>
        </div>
      </section>

      <!-- ── Recurring schedule section ── -->
      <section class="rsi-schedule-section si-dashed-divider" data-devchange="rsi-schedule-fields">
        <div class="rsi-schedule-grid">
          <!-- Repeats every -->
          <MpFormControl id="f-repeat" class="si-field rsi-repeat-field">
            <MpFormLabel>{{ t('Repeats every') }}</MpFormLabel>
            <div class="rsi-repeat-row">
              <MpInput
                id="f-repeat-interval" v-model.number="repeatInterval"
                type="number" :min="1" class="rsi-repeat-num"
              />
              <MpAutocomplete
                id="f-repeat-unit" v-model="repeatUnit"
                :data="repeatUnitOptions" label-prop="label" value-prop="value"
                use-portal is-full-width class="rsi-repeat-unit"
              />
            </div>
            <span class="si-field-caption">{{ t('Next transaction date') }}: {{ nextTransactionDate || '—' }}</span>
          </MpFormControl>

          <!-- End repeat -->
          <MpFormControl id="f-end-repeat" class="si-field rsi-end-field">
            <MpFormLabel>{{ t('End repeat') }}</MpFormLabel>
            <MpAutocomplete
              id="f-end-repeat-inp" v-model="endRepeat"
              :data="endRepeatOptions" label-prop="label" value-prop="value"
              use-portal is-full-width
            />
            <div v-if="endRepeat === 'after'" class="rsi-end-sub">
              <MpInput
                id="f-end-after-count" v-model.number="endAfterCount"
                type="number" :min="1" class="rsi-end-count"
              />
              <span class="rsi-radio-label">{{ t('occurrences') }}</span>
            </div>
            <div v-if="endRepeat === 'on'" class="rsi-end-sub">
              <MpDatePicker
                id="f-end-on-date" v-model="endOnDate"
                class="rsi-end-date" format="DD/MM/YYYY" value-type="format" use-portal
              />
            </div>
          </MpFormControl>

          <!-- Start date -->
          <MpFormControl id="f-start-date" class="si-field">
            <MpFormLabel>{{ t('Start date') }}</MpFormLabel>
            <MpDatePicker
              id="f-start-date-inp" v-model="startDate"
              class="si-datepicker" format="DD/MM/YYYY" value-type="format" use-portal
            />
          </MpFormControl>

          <!-- Send automatic email -->
          <div class="rsi-auto-email">
            <MpCheckbox id="f-send-auto-email" v-model:is-checked="sendAutoEmail">
              {{ t('Send automatic email') }}
            </MpCheckbox>
          </div>
        </div>
      </section>

      <!-- ── Header section 2 — fixed-width fields that wrap, never stretch ── -->
      <section class="si-header2">
        <!-- Col 1: addresses + shipping toggles -->
        <div class="si-header2-col si-header2-col--wide">
          <MpFormControl id="f-billing" class="si-field">
            <MpFormLabel>{{ t('Billing address') }}</MpFormLabel>
            <MpTextarea id="f-billing-inp" v-model="billingAddress" is-full-width />
          </MpFormControl>

          <div class="si-checkbox-stack">
            <MpCheckbox id="f-requires-shipping" v-model:is-checked="requiresShipping">{{ t('Requires shipping') }}</MpCheckbox>
            <MpCheckbox id="f-ship-diff" v-model:is-checked="shipToDifferent">{{ t('Ship to different address') }}</MpCheckbox>
          </div>

          <MpFormControl v-if="shipToDifferent" id="f-ship-to" class="si-field">
            <MpFormLabel>{{ t('Ship to') }}</MpFormLabel>
            <MpTextarea id="f-ship-to-inp" v-model="shipTo" is-full-width />
          </MpFormControl>
        </div>

        <!-- Col 2: dates + terms -->
        <div class="si-header2-col">
          <MpFormControl id="f-tx-date" class="si-field">
            <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
            <MpDatePicker id="f-tx-date-inp" v-model="txDate" class="si-datepicker" format="DD/MM/YYYY" value-type="format" use-portal />
          </MpFormControl>

          <MpFormControl id="f-due-date" class="si-field">
            <MpFormLabel>{{ t('Due date') }}</MpFormLabel>
            <MpDatePicker id="f-due-date-inp" v-model="dueDate" class="si-datepicker" format="DD/MM/YYYY" value-type="format" use-portal />
          </MpFormControl>

          <MpFormControl id="f-payment" class="si-field">
            <MpFormLabel>{{ t('Payment terms') }}</MpFormLabel>
            <MpAutocomplete id="f-payment-inp" v-model="paymentTerms" :data="PAYMENT_TERMS" use-portal is-clearable is-full-width />
          </MpFormControl>
        </div>

        <!-- Col 3: shipping -->
        <div v-if="requiresShipping" class="si-header2-col">
          <MpFormControl id="f-ship-date" class="si-field">
            <MpFormLabel>{{ t('Ship date') }}</MpFormLabel>
            <MpDatePicker id="f-ship-date-inp" v-model="shipDate" class="si-datepicker" format="DD/MM/YYYY" value-type="format" use-portal />
          </MpFormControl>

          <MpFormControl id="f-ship-via" class="si-field">
            <MpFormLabel>{{ t('Ship via') }}</MpFormLabel>
            <MpInput id="f-ship-via-inp" v-model="shipVia" is-full-width />
          </MpFormControl>

          <MpFormControl id="f-tracking" class="si-field">
            <MpFormLabel>{{ t('Tracking no.') }}</MpFormLabel>
            <MpInput id="f-tracking-inp" v-model="trackingNo" is-full-width />
          </MpFormControl>
        </div>

        <!-- Col 4: references -->
        <div class="si-header2-col">
          <MpFormControl id="f-tx-no" class="si-field">
            <MpFormLabel>
              <span class="si-label-row">
                {{ t('Transaction no.') }}
                <MpButton class="si-label-icon" :aria-label="t('Transaction number settings')" @click="noSettingsOpen = true">
                  <MpIcon name="settings" size="sm" />
                </MpButton>
              </span>
            </MpFormLabel>
            <MpInput id="f-tx-no-inp" :placeholder="t('Auto')" is-disabled is-full-width />
          </MpFormControl>

          <MpFormControl id="f-ref" class="si-field">
            <MpFormLabel>{{ t('Reference no.') }}</MpFormLabel>
            <MpInput id="f-ref-inp" v-model="referenceNo" is-full-width />
          </MpFormControl>

          <MpFormControl id="f-warehouse" class="si-field">
            <MpFormLabel>{{ t('Warehouse') }}</MpFormLabel>
            <MpAutocomplete id="f-warehouse-inp" v-model="warehouse" :data="WAREHOUSES" use-portal is-clearable is-full-width />
          </MpFormControl>
        </div>

        <!-- Col 5: tags -->
        <div class="si-header2-col">
          <MpFormControl id="f-tags" class="si-field">
            <MpFormLabel>{{ t('Tag') }}</MpFormLabel>
            <MpInputTag id="f-tags-inp" :data="tagsList" :placeholder="t('Select tags')" @change="onTagsChange" />
            <ErpDimensionTagUpsell id="rso-dim-upsell" />
          </MpFormControl>
        </div>
      </section>

      <!-- ── Line items ── -->
      <section class="si-items-section">
        <div class="si-items-header-row">
          <MpCheckbox id="f-price-incl-tax" v-model:is-checked="priceIncludesTax">{{ t('Price includes tax') }}</MpCheckbox>
        </div>

        <MpBanner v-if="hasLineItemErrors || noItemsError" id="rso-lineitems-error-banner" variant="danger" align-items="center" class="si-items-error-banner">
          <MpBannerIcon id="rso-lineitems-error-banner-icon" />
          <MpBannerTitle>{{ noItemsError && !hasLineItemErrors ? t('Add at least one product') : t('Failed to save') }}</MpBannerTitle>
          <MpBannerDescription>{{ noItemsError && !hasLineItemErrors ? t('A sales order needs at least one line item before you can save.') : t('The transaction contains incomplete or invalid data. Review the highlighted fields.') }}</MpBannerDescription>
        </MpBanner>

        <div class="si-items-scroll">
          <table class="si-items-table">
            <colgroup>
              <col class="si-col-drag" />
              <col class="si-col-product" />
              <col class="si-col-desc" />
              <col class="si-col-qty" />
              <col class="si-col-unit" />
              <col class="si-col-price" />
              <col class="si-col-discount" />
              <col v-if="showDimensionsColumn" class="si-col-dimensions" />
              <col class="si-col-amount" />
              <col class="si-col-del" />
            </colgroup>
            <thead>
              <tr>
                <th class="si-th si-th--drag" />
                <th class="si-th">{{ t('Product') }}</th>
                <th class="si-th">{{ t('Description') }}</th>
                <th class="si-th">{{ t('Qty') }}</th>
                <th class="si-th">{{ t('Unit') }}</th>
                <th class="si-th">{{ t('Unit price') }}</th>
                <th class="si-th">{{ t('Discount') }}</th>
                <th v-if="showDimensionsColumn" class="si-th si-th--dimensions">
                  <span class="si-th-dim-label">
                    {{ t('Dimensions') }}
                    <ErpDimensionsInfoPopover id="rso-dim-info" />
                  </span>
                  <ErpBulkDimensionsPopover id="rso-dim-bulk" transaction-type="sales" @apply="onBulkDimensions" />
                </th>
                <th class="si-th">{{ t('Amount') }}</th>
                <th class="si-th si-th--del" />
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(item, idx) in items" :key="item._key" class="si-tr"
                :class="{ 'si-tr--dragging': dragSrcIndex === idx, 'si-tr--dragover': dragOverIndex === idx && dragSrcIndex !== idx }"
                draggable="true"
                @dragstart="onDragStart($event, idx)" @dragover="onDragOver($event, idx)"
                @drop="onDrop($event, idx)" @dragend="onDragEnd"
              >
                <td class="si-td si-td--drag si-td--border"><div class="si-cell-center"><MpIcon name="drag" size="sm" /></div></td>

                <td class="si-td si-td--input si-td--border" :class="{ 'si-td--error': item.productError }">
                  <MpTooltip
                    v-if="item.productError" :id="`rso-product-tt-${item._key}`"
                    :label="t('You must select product')" placement="top" use-portal
                    class="si-error-tooltip-wrap"
                  >
                    <MpInput
                      :id="`f-product-${item._key}`" v-model="item.product" is-full-width
                      :is-invalid="item.productError" @focus="openProductRow = item._key"
                    />
                  </MpTooltip>
                  <MpPopover
                    v-else
                    is-manual :is-open="openProductRow === item._key" is-close-on-select
                    use-portal :is-keep-alive="false" placement="bottom-start" is-adaptive-width
                    @close="openProductRow = null"
                  >
                    <MpPopoverTrigger>
                      <MpInput :id="`f-product-${item._key}`" v-model="item.product" is-full-width @focus="openProductRow = item._key" />
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '220px', maxHeight: '240px', overflowY: 'auto' })" @blur="openProductRow = null">
                      <MpPopoverList>
                        <MpPopoverListItem v-for="p in productMatches(item.product)" :key="p.id" @click="selectProduct(item, p)">
                          <ProductCell :name="p.name" :desc="p.code" />
                        </MpPopoverListItem>
                        <MpPopoverListItem class="si-quickadd" @click="onProductAdd(item.product)">
                          {{ item.product ? `${t('Add')} "${item.product}" ${t('as a new product')}` : t('Add new product') }}
                        </MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </td>

                <td class="si-td si-td--input si-td--border">
                  <MpInput v-model="item.description" is-full-width />
                </td>

                <td class="si-td si-td--input si-td--border" :class="{ 'si-td--error': item.qtyError }">
                  <MpTooltip
                    v-if="item.qtyError" :id="`rso-qty-tt-${item._key}`"
                    :label="t('Qty must be more than 0')" placement="top" use-portal
                    class="si-error-tooltip-wrap"
                  >
                    <MpInput type="number" :model-value="item.qty" is-full-width
                      :is-invalid="item.qtyError"
                      @update:model-value="(v) => { item.qty = Number(v); item.qtyError = false }" />
                  </MpTooltip>
                  <MpInput v-else type="number" :model-value="item.qty" is-full-width
                    @update:model-value="(v) => { item.qty = Number(v); item.qtyError = false }" />
                </td>

                <td class="si-td si-td--input si-td--border">
                  <MpAutocomplete v-model="item.unit" :data="unitOptions" use-portal is-full-width />
                </td>

                <td class="si-td si-td--input si-td--border si-td--affix">
                  <div class="si-affix-cell">
                    <span class="si-affix">Rp</span>
                    <MpInput type="number" :model-value="item.unitPrice" is-full-width class="si-affix-input"
                      @update:model-value="(v) => item.unitPrice = Number(v)" />
                  </div>
                </td>

                <td class="si-td si-td--input si-td--border si-td--affix">
                  <div class="si-affix-cell">
                    <MpInput type="number" :model-value="item.discountPct" is-full-width class="si-affix-input"
                      @update:model-value="(v) => item.discountPct = Number(v)" />
                    <span class="si-affix">%</span>
                  </div>
                </td>

                <td v-if="showDimensionsColumn" class="si-td si-td--border si-td--dimensions">
                  <ErpLineDimensionsCell
                    :model-value="item.dimensions" transaction-type="sales" :id="`rso-dim-${item._key}`"
                    :errors="item.dimensionErrors"
                    @update:model-value="(v) => onItemDimensionsUpdate(item, v)"
                  />
                </td>

                <td class="si-td si-td--border si-td--affix si-td--calc">
                  <div class="si-affix-cell">
                    <span class="si-affix">Rp</span>
                    <span class="si-affix-value">{{ fmtPlain(lineAmount(item)) }}</span>
                  </div>
                </td>

                <td class="si-td si-td--del">
                  <div class="si-cell-center">
                    <MpButton class="si-del-btn" :aria-label="`${t('Remove')} ${item.product}`" @click="removeItem(item._key)">
                      <MpIcon name="minus-circular" size="sm" />
                    </MpButton>
                  </div>
                </td>
              </tr>

              <!-- Trailing "Select product" row -->
              <tr class="si-tr">
                <td class="si-td si-td--drag si-td--border"><div class="si-cell-center"><MpIcon name="drag" size="sm" /></div></td>
                <td class="si-td si-td--input si-td--border">
                  <MpPopover
                    is-manual :is-open="openProductRow === NEW_ROW_KEY" is-close-on-select
                    use-portal :is-keep-alive="false" placement="bottom-start" is-adaptive-width
                    @close="openProductRow = null"
                  >
                    <MpPopoverTrigger>
                      <MpInput
                        id="f-product-new" v-model="newRowSearch" class="si-select--product"
                        :placeholder="t('Select product')" is-full-width
                        @focus="openProductRow = NEW_ROW_KEY"
                      />
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '220px', maxHeight: '240px', overflowY: 'auto' })" @blur="openProductRow = null">
                      <MpPopoverList>
                        <MpPopoverListItem v-for="p in productMatches(newRowSearch)" :key="p.id" @click="selectNewProduct(p)">
                          <ProductCell :name="p.name" :desc="p.code" />
                        </MpPopoverListItem>
                        <MpPopoverListItem class="si-quickadd" @click="onProductAdd(newRowSearch)">
                          {{ newRowSearch ? `${t('Add')} "${newRowSearch}" ${t('as a new product')}` : t('Add new product') }}
                        </MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </td>
                <td class="si-td si-td--border" /><td class="si-td si-td--border" /><td class="si-td si-td--border" />
                <td class="si-td si-td--border" /><td class="si-td si-td--border" /><td class="si-td si-td--border" />
                <td class="si-td si-td--border" /><td class="si-td si-td--del" />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ── Notes + Attachment + Totals ── -->
      <section class="si-bottom-section">
        <div class="si-notes-col">
          <MpFormControl id="f-message" class="si-note-field">
            <div class="si-lbl-row"><MpFormLabel>{{ t('Message') }}</MpFormLabel><span class="si-counter">{{ message.length }}/250</span></div>
            <MpTextarea id="f-message-inp" v-model="message" :maxlength="250" is-full-width />
            <span class="si-field-caption">{{ t('Visible to customer') }}</span>
          </MpFormControl>

          <MpFormControl id="f-memo" class="si-note-field">
            <div class="si-lbl-row"><MpFormLabel>{{ t('Memo') }}</MpFormLabel><span class="si-counter">{{ memo.length }}/250</span></div>
            <MpTextarea id="f-memo-inp" v-model="memo" :maxlength="250" is-full-width />
            <span class="si-field-caption">{{ t('Only visible to you and your team') }}</span>
          </MpFormControl>

          <div class="si-attachment-section">
            <span class="si-attachment-label">{{ t('Attachment') }}</span>
            <MpUpload
              id="f-attachment" :button-text="t('Choose file')" :placeholder="t('or drag and drop here')"
              is-multiple is-full-width @change="onFilesChange"
            />
            <p class="si-field-caption">{{ t('Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP format, with a maximum size of 10 MB per file and 5 files per transaction') }}</p>
            <div v-if="attachments.length" class="si-attachment-list">
              <MpUploadList
                v-for="(a, idx) in attachments" :key="a.name + idx"
                :title="a.name" :subtitle="`${a.sizeKB} KB`" :icon-name="iconForFile(a.name)"
                status="success" is-show-remove-button @remove="removeAttachment(idx)"
              />
            </div>
          </div>
        </div>

        <div class="si-totals-col">
          <div class="si-totals-row si-totals-row--h3">
            <span>{{ t('Subtotal') }}</span>
            <span>{{ fmt(subtotal) }}</span>
          </div>

          <div class="si-discount-block">
            <MpButton class="si-discount-swap" :aria-label="t('Switch discount mode')">
              <MpIcon name="sort-default" size="sm" />
            </MpButton>
            <div class="si-discount-rows">
              <div class="si-totals-row">
                <span>{{ t('Discount per line') }}</span>
                <span class="si-deduction">({{ fmt(discountTotal) }})</span>
              </div>
              <div class="si-totals-row">
                <span class="si-inline-field-label">
                  <span>{{ t('Global discount') }}</span>
                  <MpInputGroup id="f-global-discount-group" class="si-unit-field">
                    <MpInputLeftAddon has-background class="si-unit-addon">
                      <MpPopover id="f-global-discount-unit" is-close-on-select placement="bottom-start" use-portal :is-keep-alive="false">
                        <MpPopoverTrigger>
                          <MpButton class="si-unit-trigger">
                            <span>{{ globalDiscountType }}</span>
                            <MpIcon name="chevrons-down" size="sm" />
                          </MpButton>
                        </MpPopoverTrigger>
                        <MpPopoverContent :class="css({ minWidth: '64px', width: 'max-content' })">
                          <MpPopoverList>
                            <MpPopoverListItem :is-active="globalDiscountType === 'Rp'" @click="globalDiscountType = 'Rp'">Rp</MpPopoverListItem>
                            <MpPopoverListItem :is-active="globalDiscountType === '%'" @click="globalDiscountType = '%'">%</MpPopoverListItem>
                          </MpPopoverList>
                        </MpPopoverContent>
                      </MpPopover>
                    </MpInputLeftAddon>
                    <MpInput type="number" :model-value="globalDiscountValue" is-full-width
                      @update:model-value="(v) => globalDiscountValue = Number(v)" />
                  </MpInputGroup>
                </span>
                <span class="si-deduction">({{ fmt(globalDiscountAmount) }})</span>
              </div>
            </div>
          </div>

          <div class="si-totals-row">
            <span>PPN 11%</span>
            <span>{{ fmt(taxAmount) }}</span>
          </div>
          <div class="si-totals-row">
            <span>{{ t('Shipping fee') }}</span>
            <MpInputGroup id="f-shipping-fee-group" class="si-unit-field">
              <MpInputLeftAddon has-background>Rp</MpInputLeftAddon>
              <MpInput type="number" :model-value="shippingFee" is-full-width
                @update:model-value="(v) => shippingFee = Number(v)" />
            </MpInputGroup>
          </div>

          <div class="si-total-rule" />
          <div class="si-totals-row si-totals-row--h3">
            <span>{{ t('Total') }}</span>
            <span>{{ fmt(total) }}</span>
          </div>

          <!-- Less: Withholding tax -->
          <div class="si-less-check">
            <MpCheckbox id="f-less-wht" v-model:is-checked="lessWithholding">{{ t('Less: Withholding tax') }}</MpCheckbox>
          </div>
          <div v-if="lessWithholding" class="si-less-rows">
            <div v-for="wh in withholdingRows" :key="wh.id" class="si-wh-row">
              <div class="si-wh-toprow">
                <MpFormControl :id="`f-wh-name-${wh.id}`" is-required :is-invalid="wh.nameError">
                  <div class="si-lbl-row"><MpFormLabel>{{ t('Name') }}</MpFormLabel><span class="si-counter">{{ wh.name.length }}/60</span></div>
                  <MpInput
                    :id="`f-wh-name-inp-${wh.id}`" v-model="wh.name" :maxlength="60" is-full-width
                    :is-invalid="wh.nameError" @update:model-value="wh.nameError = false"
                  />
                  <MpFormErrorMessage>{{ t('You must fill in name') }}</MpFormErrorMessage>
                </MpFormControl>

                <MpFormControl :id="`f-wh-amount-${wh.id}`" is-required :is-invalid="wh.amountError">
                  <MpFormLabel>{{ t('Amount') }}</MpFormLabel>
                  <MpInputGroup :id="`f-wh-amount-group-${wh.id}`">
                    <MpInputLeftAddon has-background class="si-unit-addon">
                      <MpPopover :id="`f-wh-unit-${wh.id}`" is-close-on-select placement="bottom-start" use-portal :is-keep-alive="false">
                        <MpPopoverTrigger>
                          <MpButton class="si-unit-trigger">
                            <span>{{ wh.unit }}</span>
                            <MpIcon name="chevrons-down" size="sm" />
                          </MpButton>
                        </MpPopoverTrigger>
                        <MpPopoverContent :class="css({ minWidth: '64px', width: 'max-content' })">
                          <MpPopoverList>
                            <MpPopoverListItem :is-active="wh.unit === 'Rp'" @click="wh.unit = 'Rp'">Rp</MpPopoverListItem>
                            <MpPopoverListItem :is-active="wh.unit === '%'" @click="wh.unit = '%'">%</MpPopoverListItem>
                          </MpPopoverList>
                        </MpPopoverContent>
                      </MpPopover>
                    </MpInputLeftAddon>
                    <MpInput
                      :id="`f-wh-amount-inp-${wh.id}`" v-model="wh.amount" type="number" is-full-width
                      :is-invalid="wh.amountError" @update:model-value="wh.amountError = false"
                    />
                  </MpInputGroup>
                  <MpFormErrorMessage>{{ t('You must fill in amount') }}</MpFormErrorMessage>
                </MpFormControl>
              </div>

              <MpFormControl :id="`f-wh-account-${wh.id}`" is-required :is-invalid="wh.accountError">
                <MpFormLabel>{{ t('Account') }}</MpFormLabel>
                <MpAutocomplete
                  :id="`f-wh-account-ac-${wh.id}`" v-model="wh.accountId" :data="WITHHOLDING_ACCOUNTS"
                  label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                  :is-invalid="wh.accountError" @update:model-value="wh.accountError = false"
                />
                <MpFormErrorMessage>{{ t('You must select account') }}</MpFormErrorMessage>
              </MpFormControl>

              <div v-if="withholdingRows.length > 1" class="si-wh-remove">
                <MpButton variant="textLink" @click="removeWithholdingRow(wh.id)">{{ t('Remove') }}</MpButton>
              </div>
            </div>

            <div class="si-wh-add">
              <MpButton variant="secondary" left-icon="add" is-rounded @click="addWithholdingRow">{{ t('Add withholding') }}</MpButton>
            </div>
          </div>

          <!-- Less: Deposit -->
          <div class="si-less-check">
            <MpCheckbox id="f-less-deposit" v-model:is-checked="lessDeposit">{{ t('Less: Deposit') }}</MpCheckbox>
          </div>
          <div v-if="lessDeposit" class="si-less-rows">
            <div class="si-wh-toprow">
              <MpFormControl id="f-deposit-account" is-required :is-invalid="depositAccountError">
                <MpFormLabel>{{ t('Account') }}</MpFormLabel>
                <MpAutocomplete
                  id="f-deposit-account-ac" v-model="depositAccountId" :data="DEPOSIT_ACCOUNTS"
                  label-prop="name" value-prop="id" is-searchable use-portal is-full-width
                  :is-invalid="depositAccountError" @update:model-value="depositAccountError = false"
                />
                <MpFormErrorMessage>{{ t('You must select account') }}</MpFormErrorMessage>
              </MpFormControl>

              <MpFormControl id="f-deposit-amount" is-required :is-invalid="depositAmountError">
                <MpFormLabel>{{ t('Amount paid') }}</MpFormLabel>
                <MpInputGroup id="f-deposit-amount-group">
                  <MpInputLeftAddon has-background>Rp</MpInputLeftAddon>
                  <MpInput
                    id="f-deposit-amount-inp" v-model="depositAmount" type="number" is-full-width
                    :is-invalid="depositAmountError" @update:model-value="depositAmountError = false"
                  />
                </MpInputGroup>
                <MpFormErrorMessage>{{ t('You must fill in amount') }}</MpFormErrorMessage>
              </MpFormControl>
            </div>
          </div>

          <div class="si-total-rule" />
          <div class="si-totals-row si-totals-row--h3">
            <span>{{ t('Balance due') }}</span>
            <span>{{ fmt(balanceDue) }}</span>
          </div>
        </div>
      </section>

      <!-- ── Footer ── -->
      <MpButtonGroup class="erp-action-footer si-form-footer">
        <MpButton variant="ghost" is-rounded @click="onCancel">{{ t('Cancel') }}</MpButton>

        <MpPopover id="rso-form-menu" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
          <MpPopoverTrigger>
            <MpButton variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('More') }}</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem @click="onSave">{{ t('Save & close') }}</MpPopoverListItem>
              <MpPopoverListItem @click="onSave">{{ t('Save as draft') }}</MpPopoverListItem>
              <MpPopoverListItem>{{ t('Preview') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <MpButton variant="primary" is-rounded @click="onSave">
          {{ t('Save') }}
        </MpButton>
      </MpButtonGroup>

    </div><!-- /si-form-stage -->

    <NumberFormatSettingsModal
      v-model:open="noSettingsOpen"
      :title="t('Transaction no. settings')"
      :caption="t('Transaction numbers are auto-generated by the system.')"
      :next-number="nextTxNo"
      :existing-formats="txNoFormats"
      @save="onNoFormatSave"
    />
  </div>
</template>

<style scoped>
.si-form-page {
  --si-field-wide: 318px;
  --si-field: 228px;
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* ── Header bar ── */
.si-form-bar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  padding: 0 var(--mp-spacing-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.si-form-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.si-crumb {
  align-self: flex-start;
  background: none; border: none; padding: 0;
  cursor: pointer;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-link);
  line-height: var(--mp-line-heights-sm, 16px);
}
.si-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.si-form-h1 {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
  white-space: nowrap;
}

/* ── Scrollable stage ── */
.si-form-stage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--mp-background-stage, #ffffff);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-6);
}

.si-dashed-divider {
  padding-bottom: var(--mp-spacing-5);
  border-bottom: 1px dashed var(--mp-border-default, #e3e7e9);
}

/* ── Header section 1 ── */
.si-header1 { display: flex; align-items: flex-start; gap: 16px 24px; }
.si-header1 > .si-field { flex: 0 0 var(--si-field-wide); }
.si-header1-total { margin-left: auto; align-self: flex-end; padding-bottom: var(--mp-spacing-2); }
.si-header1-total-value {
  margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  white-space: nowrap;
}

/* ── Recurring schedule section ── */
.rsi-schedule-section { padding-top: var(--mp-spacing-2); }
.rsi-schedule-grid {
  display: flex;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: var(--mp-spacing-4) var(--mp-spacing-6);
}
.rsi-repeat-field { flex: 0 0 var(--si-field-wide); }
.rsi-repeat-row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
}
.rsi-repeat-num { width: 72px; flex-shrink: 0; }
.rsi-repeat-unit { flex: 1; min-width: 0; }

.rsi-end-field { flex: 0 0 var(--si-field); }
.rsi-end-sub {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-2);
}
.rsi-radio-label {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
}
.rsi-end-count { width: 72px; flex-shrink: 0; }
.rsi-end-date { width: 100%; flex-shrink: 0; }
.rsi-end-date :deep(.mp-datepicker__root) { width: 100%; }

.rsi-auto-email {
  display: flex;
  align-items: center;
  padding-top: 24px;
}

/* ── Header section 2 ── */
.si-header2 { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 16px 24px; }
.si-header2-col {
  flex: 0 0 var(--si-field-wide);
  min-width: 0;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
}
.si-header2-col--wide { flex: 0 0 var(--si-field-wide); min-width: 0; }

.si-field { min-width: 0; }
.si-field :deep(.input-tag__root) { width: 100%; }
.si-datepicker { width: 100%; }
.si-datepicker :deep(.mp-datepicker__root) { width: 100%; }

.si-checkbox-stack { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }

.si-label-row { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.si-label-icon {
  display: inline-flex !important; align-items: center; justify-content: center;
  padding: 0 !important; border: none !important; background: none !important; min-width: 0 !important;
  cursor: pointer; color: var(--mp-text-secondary);
}

/* ── Line items ── */
.si-items-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.si-items-header-row { display: flex; justify-content: flex-end; }
.si-items-error-banner { margin-bottom: var(--mp-spacing-2); }
.si-items-scroll { overflow-x: auto; }

.si-items-table {
  width: 100%; min-width: 1340px;
  table-layout: fixed; border-collapse: collapse; border-spacing: 0;
}
.si-col-drag     { width: 44px; }
.si-col-product  { width: 280px; }
.si-col-desc     { width: auto; }
.si-col-qty      { width: 64px; }
.si-col-unit     { width: 104px; }
.si-col-price    { width: 164px; }
.si-col-discount { width: 88px; }
.si-col-dimensions { width: 220px; }
.si-col-amount   { width: 164px; }
.si-col-del      { width: 52px; }

.si-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: var(--mp-letter-spacings-normal);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  white-space: nowrap;
}
.si-th--drag, .si-th--del { padding: 0; }
.si-th--dimensions { display: table-cell; }
.si-th--dimensions > .si-th-dim-label { display: inline-flex; align-items: center; }
.si-th-dim-label { gap: var(--mp-spacing-1); }

.si-td {
  height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  vertical-align: top;
}
.si-td--border { border-right: 1px solid var(--mp-border-default, #e3e7e9); }
.si-tr--dragging { opacity: 0.4; }
.si-tr--dragging .si-td--drag { cursor: grabbing; }
.si-tr--dragover > .si-td { border-top: 2px solid var(--mp-border-focused, #2563eb); }
.si-td--drag { padding: 0; text-align: center; color: var(--mp-text-placeholder); cursor: grab; }
.si-td--del  { padding: 0; text-align: center; }
.si-td--dimensions { padding: 0; }
.si-cell-center { display: flex; align-items: center; justify-content: center; height: var(--mp-sizes-10, 40px); }
.si-td--input { padding: 0; }
.si-td--input :deep([class*='input']),
.si-td--input :deep([class*='select']) { border-radius: 0; border-color: transparent; }
.si-td--input :deep(.mp-input__root),
.si-td--input :deep(.mp-select__root) { height: var(--mp-sizes-10, 40px); background: transparent; }
.si-td--input :deep(.mp-input__control),
.si-td--input :deep(.mp-select__control) {
  height: var(--mp-sizes-10, 40px);
  min-width: 0; width: 100%;
  border: none; border-radius: 0;
  box-shadow: var(--mp-shadows-none, none); /* pixel-police-allow-shadow: removing the default shadow */
}
.si-td--input { position: relative; }
.si-td--input:focus-within::after {
  content: ''; position: absolute; inset: 0; z-index: 2; pointer-events: none;
  box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); /* pixel-police-allow-shadow: focus ring over collapsed borders */
}
.si-select--product :deep(.mp-input__control)::placeholder { color: var(--mp-text-placeholder); }
.si-quickadd :deep(*), .si-quickadd { color: var(--mp-colors-text-link, #165082); }

.si-td--error { background: var(--mp-background-danger-subtle, #fef2f2); box-shadow: inset 0 -1px 0 0 var(--mp-border-danger, #dc2626); }
.si-td--error :deep([class*='input']) { background: transparent; }
.si-error-tooltip-wrap { display: block; width: 100%; }
.si-error-tooltip-wrap :deep([class*='tooltip__trigger']) { display: block; width: 100%; }

.si-td--affix { padding: 0; position: relative; }
.si-td--calc, .si-td--calc .si-affix, .si-td--calc .si-affix-value { background: var(--mp-background-neutral-strong, #f1f3f5); }
.si-affix-cell { display: flex; align-items: stretch; position: absolute; inset: 0; min-height: var(--mp-sizes-10, 40px); }
.si-affix {
  flex-shrink: 0; display: flex; align-items: flex-start; justify-content: center;
  padding: var(--mp-sizes-2\.5, 10px) var(--mp-spacing-2) 0 var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.si-affix-input { flex: 1 1 0; min-width: 0; }
.si-affix-cell :deep(.mp-input__root) { flex: 1 1 0; min-width: 0; width: auto; }
.si-affix-value { flex: 1; min-width: 0; display: flex; align-items: flex-start; justify-content: flex-end; padding: var(--mp-sizes-2\.5, 10px) var(--mp-spacing-2) 0 var(--mp-spacing-2); white-space: nowrap; }

.si-del-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-sm) !important;
  cursor: pointer; color: var(--mp-text-secondary); flex-shrink: 0;
}
.si-del-btn:hover { background: var(--mp-background-neutral, #ffffff) !important; color: var(--mp-text-danger, #dc2626); }

/* ── Notes + Attachment + Totals ── */
.si-bottom-section { display: flex; align-items: flex-start; gap: var(--mp-spacing-6); }
.si-notes-col { display: flex; flex-direction: column; gap: 20px; width: 432px; flex-shrink: 0; }
.si-note-field { display: flex; flex-direction: column; }
.si-field-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1, 4px); }
.si-lbl-row { display: flex; align-items: baseline; justify-content: space-between; }
.si-counter { font-size: var(--mp-font-sizes-sm, 0.75rem); color: var(--mp-text-secondary); }

.si-attachment-section { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); width: var(--si-field-wide); }
.si-attachment-label {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md, 20px);
}
.si-attachment-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-1); }

.si-totals-col { margin-left: auto; width: 428px; flex-shrink: 0; display: flex; flex-direction: column; }
.si-totals-row {
  display: flex; justify-content: space-between; align-items: center;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.si-totals-row--h3 { font-weight: var(--mp-font-weights-semi-bold); font-size: var(--mp-font-sizes-lg); }
.si-deduction { color: var(--mp-text-secondary); white-space: nowrap; }

.si-total-rule {
  height: var(--mp-border-width-sm, 1px); margin: var(--mp-spacing-2) 0;
  background: repeating-linear-gradient(
    to right,
    var(--mp-border-default) 0,
    var(--mp-border-default) 4px,
    transparent 4px,
    transparent 8px
  );
}

.si-discount-block { position: relative; }
.si-discount-rows { display: flex; flex-direction: column; }
.si-discount-swap {
  position: absolute; left: -28px; top: var(--mp-spacing-2);
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-6, 24px) !important; height: var(--mp-sizes-6, 24px) !important; min-width: 0 !important;
  padding: 0 !important; border: none !important; background: none !important; cursor: pointer;
  color: var(--mp-text-subtle); border-radius: var(--mp-radii-sm);
}
.si-discount-swap:hover { background: var(--mp-background-neutral-hovered, #eef0f3); color: var(--mp-text-default); }
.si-inline-field-label { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.si-unit-field { width: 180px; flex-shrink: 0; }
.si-unit-addon :deep(.mp-input-addon__root) {
  padding: 0;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-radius: var(--mp-radii-md);
}
.si-unit-trigger {
  display: flex !important; align-items: center; gap: 4px;
  padding: var(--mp-spacing-1\.5, 6px) !important;
  min-width: 0 !important;
  background: none !important;
  border: none !important;
  cursor: pointer;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  border-radius: var(--mp-radii-md) !important;
}
.si-unit-trigger:hover { background: var(--mp-background-neutral-hovered, #eef0f3) !important; }
.si-unit-trigger :deep(svg) { width: 16px; height: 16px; flex-shrink: 0; }

/* ── Less: Withholding / Deposit ── */
.si-less-check { padding: var(--mp-spacing-2) 0; }
.si-less-rows { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding-bottom: var(--mp-spacing-2); }
.si-wh-row { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.si-wh-toprow { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-3); }
.si-wh-remove, .si-wh-add { display: flex; justify-content: flex-end; }

/* ── Footer ── */
.si-form-footer {
  display: flex; align-items: center; justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding-top: var(--mp-spacing-4);
}
.si-form-footer .btn-enterprise--primary :deep(.mp-icon),
.si-form-footer .btn-enterprise--primary :deep(svg) {
  --mp-icon-color: var(--mp-text-inverse, #fff);
  color: var(--mp-text-inverse, #fff);
}
</style>
