<script setup lang="ts">
/**
 * "New sales invoice" form — Sales ▸ Sales invoices ▸ New sales invoice
 * (Figma: Sales - Sales Invoices node 9152-107281).
 *
 * Page shell / header grid / footer follow PurchaseOrderFormPage.vue; the
 * line-items table, its prefix-suffix cells and its error treatment follow
 * NewExpensePage.vue, which is the ERP's reference implementation for all
 * three (see the ERP line-items + transaction-error pattern notes).
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
  customers, products, salesDeliveries,
  PAYMENT_TERMS, WAREHOUSES, UNIT_OPTIONS, TAX_OPTIONS,
} from '~/data'
import type { SalesDelivery } from '~/data/types'
import NumberFormatSettingsModal, { type NumberFormatConfig } from '~/components/patterns/NumberFormatSettingsModal.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'

const router = useRouter()
const { t } = useLocale()

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
const shipDate       = ref('')
const shipVia        = ref('')
const paymentTerms   = ref('')
const trackingNo     = ref('')
const referenceNo    = ref('')
const warehouse      = ref('')
const tagsList       = ref<DataInterface[]>([])

// ── Transaction no. settings (auto-numbering) — shared global component ────────
const noSettingsOpen = ref(false)
const nextTxNo = computed(() => `Sales Delivery #${nextDeliveryNumber()}`)
const txNoFormats = [{ label: t('Auto'), value: 'auto' }]
function onNoFormatSave(_config: NumberFormatConfig) { noSettingsOpen.value = false }

// Both default on so the form opens in the state the design documents.
const requiresShipping = ref(true)
const shipToDifferent  = ref(true)
const priceIncludesTax = ref(false)

function onEmailChange(data: DataInterface[]) { emailTags.value = data }
function onTagsChange(data: DataInterface[])  { tagsList.value = data }

// Picking a customer seeds the email chip list — the only header field the
// customer master actually carries (there's no address on the record).
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
  taxLabel: string
  productError: boolean
  qtyError: boolean
}
let _seq = 0
const items = ref<LineItem[]>([])

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
function onProductAdd(_search?: string) { /* open create-product flow here (rule/select-quick-add) */ void _search }
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
    taxLabel: 'PPN 11%',
    productError: false,
    qtyError: false,
  })
  newRowSearch.value = ''
  openProductRow.value = null
}

// Drag-and-drop row reorder — same pattern as NewExpensePage's line-item table.
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
const taxOptions  = computed(() => Array.from(new Set([...TAX_OPTIONS, ...items.value.map(i => i.taxLabel)])))

// Banner above the table whenever any line cell is flagged — same convention as
// NewExpensePage's line-items error banner.
const hasLineItemErrors = computed(() => items.value.some(it => it.productError || it.qtyError))
const noItemsError = ref(false)   // set on save attempt with zero line items (inline, not a toast)

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

// A sales order is not a payment document — no withholding/deposit at create; the
// header figure is the order total.
const orderTotal = computed(() => total.value)

const fmt = formatIDR
/** Table cells show the bare number — the "Rp" lives in the cell's prefix box. */
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

// ── Save ──────────────────────────────────────────────────────────────────────
function validate(): boolean {
  let ok = true
  if (!customerId.value) { customerError.value = true; ok = false }
  noItemsError.value = !items.value.length
  if (!items.value.length) ok = false

  items.value.forEach(it => {
    if (!it.product) { it.productError = true; ok = false }
    if (!(it.qty > 0)) { it.qtyError = true; ok = false }
  })
  return ok
}

function nextDeliveryNumber(): number {
  return salesDeliveries.reduce((max, d) => Math.max(max, d.number), 20000) + 1
}
function nextDeliveryId(): string {
  const n = salesDeliveries.reduce((max, d) => {
    const num = parseInt(d.id.replace(/\D/g, ''), 10)
    return Number.isNaN(num) ? max : Math.max(max, num)
  }, 0) + 1
  return `SD${String(n).padStart(3, '0')}`
}

function onCancel() { router.push('/sales-deliveries') }

function onSave() {
  // Validation errors surface INLINE (per-field + the banner below), never as a toast.
  if (!validate()) return
  const customer = customers.find(c => c.id === customerId.value)!
  const delivery: SalesDelivery = {
    id: nextDeliveryId(),
    number: nextDeliveryNumber(),
    customer: { id: customer.id, name: customer.name },
    date: dmyToIso(txDate.value),
    fulfillmentStatus: 'in transit',
    billingStatus: 'unbilled',
    total: total.value,
    tags: tagsList.value.map(t2 => String(t2.value)),
  }
  salesDeliveries.push(delivery)
  toast.notify({ variant: 'success', title: t('Sales delivery created'), rootProps: { class: 'toast-enterprise' } })
  router.push(`/sales-deliveries/${delivery.id}`)
}
</script>

<template>
  <div class="si-form-page">

    <!-- ── Fixed header bar ── -->
    <header class="si-form-bar">
      <div class="si-form-bar-left">
        <MpTextlink id="si-crumb" as="a" class="si-crumb" @click.prevent="onCancel">{{ t('Sales deliveries') }}</MpTextlink>
        <h1 class="si-form-h1">{{ t('New sales delivery') }}</h1>
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
          <h3 class="si-header1-total-value">{{ t('Delivery total') }} {{ fmt(orderTotal) }}</h3>
        </div>
      </section>

      <!-- ── Header section 2 — fixed-width fields that wrap, never stretch ── -->
      <section class="si-header2">
        <!-- Col 1 (318px): addresses + shipping toggles -->
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

          <MpFormControl id="f-payment" class="si-field">
            <MpFormLabel>{{ t('Payment terms') }}</MpFormLabel>
            <MpAutocomplete id="f-payment-inp" v-model="paymentTerms" :data="PAYMENT_TERMS" use-portal is-clearable is-full-width />
          </MpFormControl>
        </div>

        <!-- Col 3: shipping — only when "Requires shipping" is on -->
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

        <!-- Col 5: tags — last column, same 24px gap as every other pair -->
        <div class="si-header2-col">
          <MpFormControl id="f-tags" class="si-field">
            <MpFormLabel>{{ t('Tag') }}</MpFormLabel>
            <MpInputTag id="f-tags-inp" :data="tagsList" :placeholder="t('Select tags')" @change="onTagsChange" />
          </MpFormControl>
        </div>
      </section>

      <!-- ── Line items ── -->
      <section class="si-items-section">
        <div class="si-items-header-row">
          <MpCheckbox id="f-price-incl-tax" v-model:is-checked="priceIncludesTax">{{ t('Price includes tax') }}</MpCheckbox>
        </div>

        <MpBanner v-if="hasLineItemErrors || noItemsError" id="si-lineitems-error-banner" variant="danger" align-items="center" class="si-items-error-banner">
          <MpBannerIcon id="si-lineitems-error-banner-icon" />
          <MpBannerTitle>{{ noItemsError && !hasLineItemErrors ? t('Add at least one product') : t('Failed to save') }}</MpBannerTitle>
          <MpBannerDescription>{{ noItemsError && !hasLineItemErrors ? t('A sales invoice needs at least one line item before you can save.') : t('The transaction contains incomplete or invalid data. Review the highlighted fields.') }}</MpBannerDescription>
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
              <col class="si-col-tax" />
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
                <th class="si-th">{{ t('Tax') }}</th>
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
                    v-if="item.productError" :id="`si-product-tt-${item._key}`"
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
                    v-if="item.qtyError" :id="`si-qty-tt-${item._key}`"
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

                <!-- Prefix box is a plain span, not MpInputLeftAddon — see
                     NewExpensePage's .ex-amount-prefix (the ERP reference). -->
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

                <td class="si-td si-td--input si-td--border">
                  <MpAutocomplete v-model="item.taxLabel" :data="taxOptions" use-portal is-full-width />
                </td>

                <!-- Amount is derived (qty × price − discount), so it reads as a
                     value with the same prefix chrome rather than an input. -->
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

              <!-- Trailing "Select product" row — picking here appends a new line -->
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
        <!-- Left stack: Message / Memo / Attachment, a constant 20px apart -->
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

          <!-- Discount block — the swap affordance sits in the gutter, as designed -->
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
        </div>
      </section>

      <!-- ── Footer ── ghost Cancel · secondary "More" dropdown · primary "Save" (rightmost) -->
      <MpButtonGroup class="erp-action-footer si-form-footer">
        <MpButton variant="ghost" is-rounded @click="onCancel">{{ t('Cancel') }}</MpButton>

        <MpPopover id="si-form-menu" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
          <MpPopoverTrigger>
            <MpButton variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('More') }}</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem @click="onSave">{{ t('Save & close') }}</MpPopoverListItem>
              <MpPopoverListItem @click="onSave">{{ t('Save & share via WhatsApp') }}</MpPopoverListItem>
              <MpPopoverListItem @click="onSave">{{ t('Save & share via email') }}</MpPopoverListItem>
              <MpPopoverListItem @click="onSave">{{ t('Save as draft') }}</MpPopoverListItem>
              <MpPopoverListItem>{{ t('Preview') }}</MpPopoverListItem>
              <MpPopoverListItem>{{ t('Print draft PDF') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <MpButton variant="primary" is-rounded @click="onSave">{{ t('Save') }}</MpButton>
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
/* Fixed field widths, straight off the Figma: the address column is 318px and
   every other header field 228px. They never stretch with the container — same
   principle as NewExpensePage's --ex-field-width. */
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

/* ── Header section 2 — every column is a FIXED 318px (= the Customer/Email
   fields in header section 1), so all columns line up in a tidy grid and wrap
   to the next line when they don't fit, instead of shrinking to odd widths. ── */
.si-header2 { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 16px 24px; }
.si-header2-col {
  flex: 0 0 var(--si-field-wide);
  min-width: 0;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
}
.si-header2-col--wide { flex: 0 0 var(--si-field-wide); min-width: 0; }

.si-field { min-width: 0; }
/* MpInputTag and MpDatePicker need explicit full-width hooks */
.si-field :deep(.input-tag__root) { width: 100%; }
.si-datepicker { width: 100%; }
.si-datepicker :deep(.mp-datepicker__root) { width: 100%; }

/* MpCheckbox brings its own 12px control→label gap — the stack only owns the
   gap BETWEEN checkboxes (see the Pixel3 checkbox note). */
.si-checkbox-stack { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }

.si-label-row { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.si-label-icon {
  display: inline-flex !important; align-items: center; justify-content: center;
  padding: 0 !important; border: none !important; background: none !important; min-width: 0 !important;
  cursor: pointer; color: var(--mp-text-secondary);
}

/* ── Line items ─────────────────────────────────────────────────────────────
   Column widths are the Figma's exact values and sum to the 1340px stage width;
   Description is the one flexible column so the table still fills a wider stage. */
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
.si-col-tax      { width: 128px; }
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

/* Rows carry BOTH a bottom border (row separator) and right borders (column
   dividers) — the Figma's Row has border-b and each cell border-r. */
.si-td {
  height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  /* A taller Dimensions cell must not pull the row's other cells to its
     vertical center — everything pins to the top instead. */
  vertical-align: top;
}
.si-td--border { border-right: 1px solid var(--mp-border-default, #e3e7e9); }
.si-tr--dragging { opacity: 0.4; }
.si-tr--dragging .si-td--drag { cursor: grabbing; }
.si-tr--dragover > .si-td { border-top: 2px solid var(--mp-border-focused, #2563eb); }
.si-td--drag { padding: 0; text-align: center; color: var(--mp-text-placeholder); cursor: grab; }
.si-td--del  { padding: 0; text-align: center; }
/* Pins the drag/delete control to the first row's height instead of drifting
   to the vertical center of a Dimensions-stretched row. */
.si-cell-center { display: flex; align-items: center; justify-content: center; height: var(--mp-sizes-10, 40px); }
.si-td--input { padding: 0; }
.si-td--input :deep([class*='input']),
.si-td--input :deep([class*='select']) { border-radius: 0; border-color: transparent; }
.si-td--input :deep(.mp-input__root),
.si-td--input :deep(.mp-select__root) { height: var(--mp-sizes-10, 40px); background: transparent; }
.si-td--input :deep(.mp-input__control),
.si-td--input :deep(.mp-select__control) {
  height: var(--mp-sizes-10, 40px);
  /* MpInput's control carries a hard min-width (88px). In the narrow Qty and
     Discount columns that overflows the cell and paints over the td's right
     border — and pushes the Discount "%" suffix out of view. */
  min-width: 0; width: 100%;
  border: none; border-radius: 0;
  box-shadow: var(--mp-shadows-none, none); /* pixel-police-allow-shadow: removing the default shadow */
}
.si-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); }
.si-select--product :deep(.mp-input__control)::placeholder { color: var(--mp-text-placeholder); }
.si-quickadd :deep(*), .si-quickadd { color: var(--mp-colors-text-link, #165082); }

/* Line-item validation — cell tint + inset red underline + tooltip, the same
   convention as NewExpensePage's .ex-td--error. */
.si-td--error { background: var(--mp-background-danger-subtle, #fef2f2); box-shadow: inset 0 -1px 0 0 var(--mp-border-danger, #dc2626); }
.si-td--error :deep([class*='input']) { background: transparent; }
.si-error-tooltip-wrap { display: block; width: 100%; }
.si-error-tooltip-wrap :deep([class*='tooltip__trigger']) { display: block; width: 100%; }

/* Prefix/suffix cells (Unit price, Discount, Amount) — a plain span box, never
   MpInputLeftAddon, so it fills the cell edge-to-edge like .ex-amount-prefix. */
.si-td--affix { padding: 0; position: relative; }
/* calculated (non-editable) Amount cell = disabled gray (rule/table-bg-white exception) */
.si-td--calc, .si-td--calc .si-affix, .si-td--calc .si-affix-value { background: var(--mp-background-neutral-strong, #f1f3f5); }
/* inset:0 (not height:100%) fills the full — possibly Dimensions-stretched —
   row height. align-items:stretch then lets .si-affix (auto cross-size) grow
   to match, while the input/value keep their own fixed height and simply
   dock to the top (a flex item with a definite cross size doesn't stretch). */
.si-affix-cell { display: flex; align-items: stretch; position: absolute; inset: 0; min-height: var(--mp-sizes-10, 40px); }
.si-affix {
  flex-shrink: 0; display: flex; align-items: flex-start; justify-content: center;
  padding: var(--mp-sizes-2\.5, 10px) var(--mp-spacing-2) 0 var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
/* The input must actually shrink, or `is-full-width`'s width:100% takes the
   whole cell and shoves the prefix/suffix box outside it (that's what dropped
   the Discount "%"). Target the rendered root, not just the class on MpInput. */
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
/* Message / Memo / Attachment sit a constant 20px apart. Literal 20px, not
   --mp-spacing-5: that token resolves to 20.8px here (rem-based). */
.si-notes-col { display: flex; flex-direction: column; gap: 20px; width: 432px; flex-shrink: 0; }
.si-note-field { display: flex; flex-direction: column; }
.si-field-caption { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1, 4px); }
/* char-counter on the label row (rule/input-char-counter) */
.si-lbl-row { display: flex; align-items: baseline; justify-content: space-between; }
.si-counter { font-size: var(--mp-font-sizes-sm, 0.75rem); color: var(--mp-text-secondary); }

/* Attachment: label→field gap is 4px, matching every MpFormLabel above it */
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

/* Standalone (non-table) prefixed fields use MpInputGroup + MpInputLeftAddon,
   with the Rp/% switcher rendered as a popover trigger inside the addon —
   ported verbatim from NewExpensePage's .ex-wh-unit-addon / .ex-wh-unit-trigger. */
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
/* Chevron on a filled button follows the label colour, not the default icon grey */
.si-form-footer .btn-enterprise--primary :deep(.mp-icon),
.si-form-footer .btn-enterprise--primary :deep(svg) {
  --mp-icon-color: var(--mp-text-inverse, #fff);
  color: var(--mp-text-inverse, #fff);
}
</style>
