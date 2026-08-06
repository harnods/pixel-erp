<script setup lang="ts">
import {
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  MpButton, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpTextarea,
  MpInputGroup, MpInputLeftAddon,
  MpSelect, MpDatePicker, MpInputTag, MpCheckbox, MpUpload, MpUploadList,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTooltip,
  MpIcon,
  css,
} from '@mekari/pixel3'
import type { DataInterface } from '@mekari/pixel3'
import { getPurchaseOrderDetail, purchaseOrders, PAYMENT_TERMS, WAREHOUSES, UNIT_OPTIONS, TAX_OPTIONS, products } from '~/data'
import type { POLineItem, POAttachment } from '~/data/purchaseOrderDetails'
import type { PurchaseOrder } from '~/data/types'

const props = defineProps<{
  duplicateOrderId?: string | null
  rejectionBanner?: { user: string; date: string; reason?: string } | null
}>()

const router = useRouter()
function goTo(path: string) { router.push(path) }

const closePurchaseOrderForm = inject<() => void>('closePurchaseOrderForm')
const openPurchaseOrder = inject<(id: string) => void>('openPurchaseOrder')

const source = computed(() => props.duplicateOrderId ? getPurchaseOrderDetail(props.duplicateOrderId) : null)

function todayISO() { return new Date().toISOString().slice(0, 10) }
/** Default due date follows the Net 30 term shown in the design. */
function inThirtyDaysISO() {
  const d = new Date()
  d.setDate(d.getDate() + 30)
  return d.toISOString().slice(0, 10)
}
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

const vendor       = ref(source.value?.vendor.name ?? '')
const emailTags    = ref<DataInterface[]>(toTagData(source.value?.email ?? []))
const txDate       = ref(isoToDMY(source.value?.date ?? todayISO()))
const dueDate      = ref(isoToDMY(source.value?.dueDate ?? inThirtyDaysISO()))
const shipDate     = ref(isoToDMY(source.value?.shipDate ?? ''))
const shipVia      = ref(source.value?.shipVia ?? '')
const paymentTerms = ref(source.value?.paymentTerms ?? 'Net 30')
const referenceNo  = ref(source.value?.referenceNo ?? '')
const warehouse    = ref(source.value?.warehouse ?? '')
const trackingNo   = ref(source.value?.trackingNo ?? '')
const shipTo       = ref(source.value?.shipTo ?? '')
const message      = ref(source.value?.message ?? '')
const memo         = ref(source.value?.memo ?? '')
const tagsList     = ref<DataInterface[]>(toTagData(source.value?.tags ?? []))

const requiresShipping = ref(!!source.value?.shipVia)
const priceIncludesTax = ref(false)

function onEmailChange(data: DataInterface[]) { emailTags.value = data }
function onTagsChange(data: DataInterface[])  { tagsList.value = data }

type EditableItem = POLineItem & { _key: number }
let _seq = 0
const items = ref<EditableItem[]>((source.value?.lineItems ?? []).map(it => ({ ...it, _key: ++_seq })))

function removeItem(key: number) { items.value = items.value.filter(it => it._key !== key) }

function lineAmount(item: EditableItem) {
  return Math.round(item.qty * item.unitPrice * (1 - item.discountPct / 100))
}

function productMatches(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return products
  return products.filter(p => p.name.toLowerCase().includes(q))
}

const NEW_ROW_KEY = -1
const openProductRow = ref<number | null>(null)

function selectProduct(item: EditableItem, p: typeof products[number]) {
  item.product = p.name
  item.sku = p.code
  item.unit = p.unit
  item.unitPrice = p.price
  openProductRow.value = null
}

const newRowSearch = ref('')
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
    amount: p.price,
  })
  newRowSearch.value = ''
  openProductRow.value = null
}

const unitOptions = computed(() => Array.from(new Set([...UNIT_OPTIONS, ...items.value.map(i => i.unit)])))
const taxOptions   = computed(() => Array.from(new Set([...TAX_OPTIONS, ...items.value.map(i => i.taxLabel)])))

const subtotal      = computed(() => items.value.reduce((s, it) => s + it.qty * it.unitPrice, 0))
const discountTotal = computed(() => items.value.reduce((s, it) => s + Math.round(it.qty * it.unitPrice * it.discountPct / 100), 0))

const globalDiscountType  = ref<'%' | 'Rp'>('%')
const globalDiscountValue = ref(0)
const globalDiscountAmount = computed(() => {
  if (globalDiscountType.value === '%') {
    return Math.round((subtotal.value - discountTotal.value) * (globalDiscountValue.value / 100))
  }
  return globalDiscountValue.value
})

const taxAmount   = computed(() => Math.round((subtotal.value - discountTotal.value - globalDiscountAmount.value) * 0.11))
const shippingFee = ref(source.value?.totals.shippingFee ?? 0)
const grandTotal  = computed(() => subtotal.value - discountTotal.value - globalDiscountAmount.value + taxAmount.value + shippingFee.value)

function fmtPlain(n: number) {
  return new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)
}
function fmt(n: number) {
  return 'Rp' + fmtPlain(n)
}

const attachments = ref<POAttachment[]>((source.value?.attachments ?? []).map(a => ({ ...a })))
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

/** Next sequential number/id, matching the prefix + zero-padding of an existing order. */
function nextSuffix(values: string[]): number {
  return values.reduce((max, v) => {
    const n = parseInt(v.match(/(\d+)$/)?.[1] ?? '0', 10)
    return Math.max(max, n)
  }, 0) + 1
}
function nextPoNumber(sample: string): string {
  const prefix = sample.replace(/\d+$/, '')
  const width  = sample.match(/(\d+)$/)?.[1]?.length ?? 4
  return `${prefix}${String(nextSuffix(purchaseOrders.map(o => o.number))).padStart(width, '0')}`
}
function nextPoId(): string {
  return `po-${String(nextSuffix(purchaseOrders.map(o => o.id))).padStart(3, '0')}`
}

/* ── Validation ──────────────────────────────────────────────────────────────
   Errors stay hidden until the first save attempt, then track the live value so
   they clear as soon as the field is filled in. */
const showErrors = ref(false)

const vendorError = computed(() =>
  showErrors.value && !vendor.value.trim() ? 'You must fill in vendor' : '')

function productError(item: EditableItem) {
  return showErrors.value && !item.product.trim() ? 'You must select product' : ''
}
function qtyError(item: EditableItem) {
  return showErrors.value && !(item.qty > 0) ? 'You must fill in qty' : ''
}
const noItemsError = computed(() =>
  showErrors.value && !items.value.length ? 'You must select product' : '')

/** Distinct messages, deduped for the summary banner above the table. */
const lineItemErrors = computed(() => {
  const msgs = new Set<string>()
  if (noItemsError.value) msgs.add(noItemsError.value)
  for (const it of items.value) {
    if (productError(it)) msgs.add(productError(it))
    if (qtyError(it)) msgs.add(qtyError(it))
  }
  return [...msgs]
})

const isValid = computed(() => !vendorError.value && !lineItemErrors.value.length)

/** Returns false (and reveals the errors) when the form can't be saved yet. */
function validate(): boolean {
  showErrors.value = true
  return isValid.value
}

function onCancel() { closePurchaseOrderForm?.() }

/**
 * Duplicating → actually create the new order (status resets to "awaiting
 * approval") and jump straight to its detail page. A plain "new PO" is left
 * as a no-op close for now (this prototype doesn't persist fresh drafts).
 */
function createDuplicateOrder(overrides?: Partial<PurchaseOrder>): string | null {
  if (!props.duplicateOrderId || !source.value) return null
  const newId: string = nextPoId()
  const newOrder: PurchaseOrder = {
    id: newId,
    number: nextPoNumber(source.value.number),
    vendor: { id: source.value.vendor.id, name: vendor.value },
    date: dmyToIso(txDate.value),
    dueDate: dmyToIso(dueDate.value),
    total: grandTotal.value,
    balance: grandTotal.value,
    status: 'draft',
    itemCount: items.value.length,
    hasAttachment: attachments.value.length > 0,
    tags: tagsList.value.map(t => String(t.value)),
    duplicatedFromId: props.duplicateOrderId,
    ...overrides,
  }
  purchaseOrders.push(newOrder)
  return newId
}

function onSave() {
  if (!validate()) return
  const newId = createDuplicateOrder()
  closePurchaseOrderForm?.()
  if (newId) openPurchaseOrder?.(newId)
}

function onSendToFulfillment() {
  if (!validate()) return
  const newId = createDuplicateOrder({ sentToFulfillment: true })
  closePurchaseOrderForm?.()
  if (newId) openPurchaseOrder?.(newId)
}
</script>

<template>
  <div class="po-form-page">

    <!-- ── Fixed header bar (mirrors detail-bar) ── -->
    <header class="po-form-bar">
      <div class="po-form-bar-left">
        <button class="po-crumb" @click="onCancel">Purchase orders</button>
        <div class="po-form-titlerow">
          <h1 class="po-form-h1">New purchase order</h1>
          <MpPopover id="po-form-title-menu" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <button class="po-form-title-caret" aria-label="Switch transaction type">
                <MpIcon name="chevrons-down" size="sm" />
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem is-active>New purchase order</MpPopoverListItem>
                <MpPopoverListItem @click="goTo('/purchase-invoices')">New purchase invoice</MpPopoverListItem>
                <MpPopoverListItem @click="goTo('/bills')">New bill</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
    </header>

    <!-- ── Stage wrapper (mirrors detail-stage-wrapper) ── -->
    <div
      class="po-form-stage-wrapper"
      :style="{ background: rejectionBanner ? 'var(--mp-colors-background-warning)' : 'var(--mp-background-stage)' }"
    >

      <!-- Warning banner (mirrors rejection-banner in detail) -->
      <MpBanner v-if="rejectionBanner" variant="warning" class="po-form-rejection-banner">
        <MpBannerIcon />
        <MpBannerTitle>Transaction rejected by {{ rejectionBanner.user }} on {{ rejectionBanner.date }}. Make sure you have made correction before saving this transaction.</MpBannerTitle>
        <MpBannerDescription v-if="rejectionBanner.reason">{{ rejectionBanner.reason }}</MpBannerDescription>
      </MpBanner>

      <!-- ── Scrollable stage (mirrors detail-stage) ── -->
      <div class="po-form-stage">

        <!-- ── Header section 1: Vendor + Email + Total ── -->
        <section class="po-header1 po-dashed-divider">
          <MpFormControl id="f-vendor" class="po-field po-col-span-3" :is-invalid="!!vendorError">
            <MpFormLabel>Vendor <span class="po-required">*</span></MpFormLabel>
            <MpInput id="f-vendor-inp" v-model="vendor" is-full-width :is-invalid="!!vendorError" />
            <MpFormErrorMessage v-if="vendorError">{{ vendorError }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="f-email" class="po-field po-col-span-3">
            <MpFormLabel>Email</MpFormLabel>
            <MpInputTag id="f-email-inp" :data="emailTags" @change="onEmailChange" />
          </MpFormControl>

          <div class="po-header1-total">
            <h3 class="po-header1-total-value">Total {{ fmt(grandTotal) }}</h3>
          </div>
        </section>

        <!-- ── Header section 2: dynamic 3→4 columns ── -->
        <section class="po-header2">
          <div class="po-header2-col po-col-span-3">
            <MpFormControl id="f-tx-date" class="po-field">
              <MpFormLabel>Transaction date</MpFormLabel>
              <MpDatePicker id="f-tx-date-inp" v-model="txDate" format="DD/MM/YYYY" value-type="format" :use-portal="false" />
            </MpFormControl>

            <MpFormControl id="f-due-date" class="po-field">
              <MpFormLabel>Due date</MpFormLabel>
              <MpDatePicker id="f-due-date-inp" v-model="dueDate" format="DD/MM/YYYY" value-type="format" :use-portal="false" />
            </MpFormControl>

            <MpFormControl id="f-payment" class="po-field">
              <MpFormLabel>Payment terms</MpFormLabel>
              <MpSelect id="f-payment-inp" v-model="paymentTerms" placeholder="Select payment terms" is-full-width>
                <option v-for="opt in PAYMENT_TERMS" :key="opt" :value="opt">{{ opt }}</option>
              </MpSelect>
            </MpFormControl>

            <div class="po-field po-field--checkbox">
              <MpCheckbox v-model:is-checked="requiresShipping">Requires shipping</MpCheckbox>
            </div>
          </div>

          <!-- Shipping column — inserted directly after column 1 when checked -->
          <div v-if="requiresShipping" class="po-header2-col po-col-span-3">
            <MpFormControl id="f-ship-date" class="po-field">
              <MpFormLabel>Estimated delivery date</MpFormLabel>
              <MpDatePicker id="f-ship-date-inp" v-model="shipDate" format="DD/MM/YYYY" value-type="format" :use-portal="false" />
            </MpFormControl>

            <MpFormControl id="f-ship-via" class="po-field">
              <MpFormLabel>Ship via</MpFormLabel>
              <MpInput id="f-ship-via-inp" v-model="shipVia" is-full-width />
            </MpFormControl>

            <MpFormControl id="f-tracking" class="po-field">
              <MpFormLabel>Tracking no.</MpFormLabel>
              <MpInput id="f-tracking-inp" v-model="trackingNo" is-full-width />
            </MpFormControl>

            <MpFormControl id="f-ship-to" class="po-field">
              <MpFormLabel>Ship to</MpFormLabel>
              <MpTextarea id="f-ship-to-inp" v-model="shipTo" is-full-width />
            </MpFormControl>
          </div>

          <div class="po-header2-col po-col-span-3">
            <MpFormControl id="f-tx-no" class="po-field">
              <MpFormLabel>
                <span class="po-label-with-icon">
                  Transaction no.
                  <button type="button" class="po-label-gear" aria-label="Transaction number settings">
                    <MpIcon name="settings" size="sm" />
                  </button>
                </span>
              </MpFormLabel>
              <MpInput id="f-tx-no-inp" placeholder="Auto" is-disabled is-full-width />
            </MpFormControl>

            <MpFormControl id="f-ref" class="po-field">
              <MpFormLabel>Reference no.</MpFormLabel>
              <MpInput id="f-ref-inp" v-model="referenceNo" is-full-width />
            </MpFormControl>
          </div>

          <div class="po-header2-col po-col-span-3">
            <MpFormControl id="f-warehouse" class="po-field">
              <MpFormLabel>Warehouse</MpFormLabel>
              <MpSelect id="f-warehouse-inp" v-model="warehouse" placeholder="Select warehouse" is-full-width>
                <option v-for="opt in WAREHOUSES" :key="opt" :value="opt">{{ opt }}</option>
              </MpSelect>
            </MpFormControl>

            <MpFormControl id="f-tags" class="po-field">
              <MpFormLabel>Tags</MpFormLabel>
              <MpInputTag id="f-tags-inp" :data="tagsList" placeholder="Select tags" @change="onTagsChange" />
            </MpFormControl>
          </div>
        </section>

        <!-- ── Line items ── -->
        <section class="po-items-section">
          <div class="po-items-header-row">
            <MpCheckbox v-model:is-checked="priceIncludesTax">Price includes tax</MpCheckbox>
          </div>

          <MpBanner v-if="lineItemErrors.length" id="po-lineitems-error-banner" variant="danger" align-items="center" class="po-items-error-banner">
            <MpBannerIcon id="po-lineitems-error-banner-icon" />
            <MpBannerTitle>Failed to save</MpBannerTitle>
            <MpBannerDescription>The transaction contains incomplete or invalid data. Review the highlighted fields.</MpBannerDescription>
          </MpBanner>

          <div class="po-table-section">
            <div class="po-table-scroll">
              <table class="po-table po-lineitems-table">
                <colgroup>
                  <col class="po-col-drag" />
                  <col class="po-col-product" />
                  <col class="po-col-desc" />
                  <col class="po-col-qty" />
                  <col class="po-col-unit" />
                  <col class="po-col-cost" />
                  <col class="po-col-discount" />
                  <col class="po-col-tax" />
                  <col class="po-col-amount" />
                  <col class="po-col-del" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="po-th po-th--drag" />
                    <th class="po-th">Product</th>
                    <th class="po-th">Description</th>
                    <th class="po-th">Qty</th>
                    <th class="po-th">Unit</th>
                    <th class="po-th">Unit cost</th>
                    <th class="po-th">Discount</th>
                    <th class="po-th">Tax</th>
                    <th class="po-th">Amount</th>
                    <th class="po-th po-th--del" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in items" :key="item._key" class="po-tr">
                    <td class="po-td po-td--drag po-td--border"><MpIcon name="drag" size="sm" /></td>
                    <td class="po-td po-td--input po-td--border po-td--product" :class="{ 'po-td--error': !!productError(item) }">
                      <MpPopover
                        is-manual
                        :is-open="openProductRow === item._key"
                        is-close-on-select
                        use-portal
                        :is-keep-alive="false"
                        placement="bottom-start"
                        is-adaptive-width
                        @close="openProductRow = null"
                      >
                        <MpPopoverTrigger>
                          <MpTooltip
                            v-if="productError(item)" :id="`f-product-tt-${item._key}`"
                            :label="productError(item)" placement="top" use-portal class="po-td-tooltip"
                          >
                            <MpInput
                              :id="`f-product-${item._key}`"
                              v-model="item.product"
                              is-full-width
                              :is-invalid="!!productError(item)"
                              @focus="openProductRow = item._key"
                            />
                          </MpTooltip>
                          <MpInput
                            v-else
                            :id="`f-product-${item._key}`"
                            v-model="item.product"
                            is-full-width
                            @focus="openProductRow = item._key"
                          />
                        </MpPopoverTrigger>
                        <MpPopoverContent :class="css({ minWidth: '220px', maxHeight: '240px', overflowY: 'auto' })" @blur="openProductRow = null">
                          <MpPopoverList>
                            <MpPopoverListItem
                              v-for="p in productMatches(item.product)"
                              :key="p.id"
                              @click="selectProduct(item, p)"
                            >
                              {{ p.name }}
                            </MpPopoverListItem>
                            <MpPopoverListItem v-if="!productMatches(item.product).length" is-disabled>No results</MpPopoverListItem>
                          </MpPopoverList>
                        </MpPopoverContent>
                      </MpPopover>
                      <MpIcon name="chevrons-down" size="sm" class="po-product-caret" />
                    </td>
                    <td class="po-td po-td--input po-td--border">
                      <MpInput :id="`f-desc-${item._key}`" v-model="item.description" is-full-width />
                    </td>
                    <td class="po-td po-td--input po-td--border" :class="{ 'po-td--error': !!qtyError(item) }">
                      <MpTooltip
                        v-if="qtyError(item)" :id="`f-qty-tt-${item._key}`"
                        :label="qtyError(item)" placement="top" use-portal class="po-td-tooltip"
                      >
                        <MpInput
                          :id="`f-qty-${item._key}`" type="number" :model-value="item.qty" is-full-width
                          :is-invalid="!!qtyError(item)"
                          @update:model-value="(v) => item.qty = Number(v)"
                        />
                      </MpTooltip>
                      <MpInput
                        v-else
                        :id="`f-qty-${item._key}`" type="number" :model-value="item.qty" is-full-width
                        @update:model-value="(v) => item.qty = Number(v)"
                      />
                    </td>
                    <td class="po-td po-td--input po-td--border">
                      <MpSelect :id="`f-unit-${item._key}`" v-model="item.unit" is-full-width>
                        <option v-for="opt in unitOptions" :key="opt" :value="opt">{{ opt }}</option>
                      </MpSelect>
                    </td>
                    <td class="po-td po-td--input po-td--border po-td--affix">
                      <div class="po-affix-cell">
                        <span class="po-affix">Rp</span>
                        <MpInput
                          :id="`f-unitcost-${item._key}`" type="number" :model-value="item.unitPrice" is-full-width class="po-affix-input"
                          @update:model-value="(v) => item.unitPrice = Number(v)"
                        />
                      </div>
                    </td>
                    <td class="po-td po-td--input po-td--border po-td--affix">
                      <div class="po-affix-cell">
                        <MpInput
                          :id="`f-discount-${item._key}`" type="number" :model-value="item.discountPct" is-full-width class="po-affix-input"
                          @update:model-value="(v) => item.discountPct = Number(v)"
                        />
                        <span class="po-affix">%</span>
                      </div>
                    </td>
                    <td class="po-td po-td--input po-td--border">
                      <MpSelect :id="`f-tax-${item._key}`" v-model="item.taxLabel" is-full-width>
                        <option v-for="opt in taxOptions" :key="opt" :value="opt">{{ opt }}</option>
                      </MpSelect>
                    </td>
                    <td class="po-td po-td--border po-td--affix po-td--amount">
                      <div class="po-affix-cell">
                        <span class="po-affix">Rp</span>
                        <span class="po-affix-value">{{ fmtPlain(lineAmount(item)) }}</span>
                      </div>
                    </td>
                    <td class="po-td po-td--del">
                      <MpButton class="po-del-btn" :aria-label="`Remove ${item.product}`" @click="removeItem(item._key)">
                        <MpIcon name="minus-circular" size="sm" />
                      </MpButton>
                    </td>
                  </tr>

                  <!-- Placeholder row — only the drag + product cells render until a
                       product is picked, matching the Expense line-items table. -->
                  <tr class="po-tr">
                    <td class="po-td po-td--drag po-td--border"><MpIcon name="drag" size="sm" /></td>
                    <td class="po-td po-td--input po-td--border po-td--product" :class="{ 'po-td--error': !!noItemsError }">
                      <MpPopover
                        is-manual
                        :is-open="openProductRow === NEW_ROW_KEY"
                        is-close-on-select
                        use-portal
                        :is-keep-alive="false"
                        placement="bottom-start"
                        is-adaptive-width
                        @close="openProductRow = null"
                      >
                        <MpPopoverTrigger>
                          <MpTooltip
                            v-if="noItemsError" id="f-product-new-tt"
                            :label="noItemsError" placement="top" use-portal class="po-td-tooltip"
                          >
                            <MpInput
                              id="f-product-new"
                              v-model="newRowSearch"
                              class="po-select--product"
                              placeholder="Select product"
                              is-full-width
                              :is-invalid="!!noItemsError"
                              @focus="openProductRow = NEW_ROW_KEY"
                            />
                          </MpTooltip>
                          <MpInput
                            v-else
                            id="f-product-new"
                            v-model="newRowSearch"
                            class="po-select--product"
                            placeholder="Select product"
                            is-full-width
                            @focus="openProductRow = NEW_ROW_KEY"
                          />
                        </MpPopoverTrigger>
                        <MpPopoverContent :class="css({ minWidth: '220px', maxHeight: '240px', overflowY: 'auto' })" @blur="openProductRow = null">
                          <MpPopoverList>
                            <MpPopoverListItem
                              v-for="p in productMatches(newRowSearch)"
                              :key="p.id"
                              @click="selectNewProduct(p)"
                            >
                              {{ p.name }}
                            </MpPopoverListItem>
                            <MpPopoverListItem v-if="!productMatches(newRowSearch).length" is-disabled>No results</MpPopoverListItem>
                          </MpPopoverList>
                        </MpPopoverContent>
                      </MpPopover>
                      <MpIcon name="chevrons-down" size="sm" class="po-product-caret" />
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

        </section>

        <!-- ── Notes + Attachment + Totals ── -->
        <section class="po-bottom-section">
          <MpFormControl id="f-message" class="po-note-field po-note-field--message">
            <MpFormLabel>Message</MpFormLabel>
            <MpTextarea id="f-message-inp" v-model="message" is-full-width />
            <span class="po-field-caption">Visible to vendor</span>
          </MpFormControl>

          <MpFormControl id="f-memo" class="po-note-field po-note-field--memo">
            <MpFormLabel>Memo</MpFormLabel>
            <MpTextarea id="f-memo-inp" v-model="memo" is-full-width />
            <span class="po-field-caption">Only visible to you and your team</span>
          </MpFormControl>

          <section class="po-attachment-section">
            <h3 class="po-section-heading">Attachment</h3>
            <MpUpload
              id="f-attachment"
              button-text="Choose file"
              placeholder="or drag and drop here"
              is-multiple
              is-full-width
              @change="onFilesChange"
            />
            <p class="po-field-caption">Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB and 5 files per transaction</p>
            <div v-if="attachments.length" class="po-attachment-list">
              <MpUploadList
                v-for="(a, idx) in attachments"
                :key="a.name + idx"
                :title="a.name"
                :subtitle="`${a.sizeKB} KB`"
                :icon-name="iconForFile(a.name)"
                status="success"
                is-show-remove-button
                @remove="removeAttachment(idx)"
              />
            </div>
          </section>

          <div class="po-totals-col">
            <div class="po-totals-row po-totals-row--h3">
              <span>Subtotal</span>
              <span>{{ fmt(subtotal) }}</span>
            </div>
            <div v-if="discountTotal" class="po-totals-row">
              <span>Discount per line</span>
              <span class="po-deduction">({{ fmt(discountTotal) }})</span>
            </div>
            <div class="po-totals-row">
              <span class="po-global-discount-label">
                <span>Global discount</span>
                <MpInputGroup id="f-global-discount-group" class="po-global-discount">
                  <MpInputLeftAddon has-background class="po-unit-addon">
                    <MpPopover id="po-global-discount-unit" is-close-on-select placement="bottom-start" use-portal :is-keep-alive="false">
                      <MpPopoverTrigger>
                        <MpButton class="po-unit-trigger">
                          <span>{{ globalDiscountType }}</span>
                          <MpIcon name="chevrons-down" size="sm" />
                        </MpButton>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ minWidth: '64px', width: 'max-content' })">
                        <MpPopoverList>
                          <MpPopoverListItem :is-active="globalDiscountType === '%'" @click="globalDiscountType = '%'">%</MpPopoverListItem>
                          <MpPopoverListItem :is-active="globalDiscountType === 'Rp'" @click="globalDiscountType = 'Rp'">Rp</MpPopoverListItem>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>
                  </MpInputLeftAddon>
                  <MpInput id="f-global-discount-input" type="number" :model-value="globalDiscountValue" is-full-width
                    @update:model-value="(v) => globalDiscountValue = Number(v)" />
                </MpInputGroup>
              </span>
              <span class="po-deduction">({{ fmt(globalDiscountAmount) }})</span>
            </div>
            <div v-if="taxAmount" class="po-totals-row">
              <span>PPN 11%</span>
              <span>{{ fmt(taxAmount) }}</span>
            </div>
            <div v-if="requiresShipping" class="po-totals-row">
              <span>Shipping fee</span>
              <MpInputGroup id="f-shipping-fee-group" class="po-shipping-fee">
                <MpInputLeftAddon has-background class="po-unit-addon po-unit-addon--static">Rp</MpInputLeftAddon>
                <MpInput id="f-shipping-fee-input" type="number" :model-value="shippingFee" is-full-width
                  @update:model-value="(v) => shippingFee = Number(v)" />
              </MpInputGroup>
            </div>
            <div class="po-totals-row po-totals-row--h3 po-totals-row--total">
              <span>Total</span>
              <span>{{ fmt(grandTotal) }}</span>
            </div>
          </div>
        </section>

        <!-- ── Footer (scrolls with content, not sticky) ── -->
        <footer class="po-form-footer">
          <button class="btn-enterprise btn-enterprise--ghost" @click="onCancel">Cancel</button>

          <button class="btn-enterprise btn-enterprise--secondary" @click="onSave">Save &amp; close</button>

          <MpPopover id="po-save-share-menu" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
            <MpPopoverTrigger>
              <button class="btn-enterprise btn-enterprise--primary">
                Save &amp; share
                <MpIcon name="chevrons-down" size="sm" />
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="onSave">Save &amp; share via WhatsApp</MpPopoverListItem>
                <MpPopoverListItem @click="onSave">Save &amp; share via email</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>

          <MpPopover id="po-menu" use-portal :is-keep-alive="false" placement="top-end">
            <MpPopoverTrigger>
              <button class="btn-enterprise btn-enterprise--ghost btn-enterprise--icon" aria-label="More actions">
                <MpIcon name="menu-kebab" size="sm" />
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem>Preview</MpPopoverListItem>
                <MpPopoverListItem>Print draft PDF</MpPopoverListItem>
                <MpPopoverListItem @click="onSendToFulfillment">Send to fulfillment</MpPopoverListItem>
              </MpPopoverList>
              <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
              <MpPopoverList>
                <MpPopoverListItem :class="css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--mp-spacing-2)' })">
                  Purchase settings
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" stroke="currentColor" stroke-width="1.5"/>
                    <path d="M19.4 13.5a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V19.5a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H4.5a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H10a1.65 1.65 0 001-1.51V4.5a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V10a1.65 1.65 0 001.51 1h.09a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" stroke="currentColor" stroke-width="1.5"/>
                  </svg>
                </MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </footer>

      </div><!-- /po-form-stage -->
    </div><!-- /po-form-stage-wrapper -->

  </div>
</template>

<style scoped>
/* ── Page shell ── */
.po-form-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* ── Header bar (matches detail-bar exactly) ── */
.po-form-bar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle);
  padding: 0 var(--mp-spacing-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.po-form-bar-left {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
  min-width: 0;
}
.po-crumb {
  background: none; border: none; padding: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-link);
  cursor: pointer;
  text-align: left;
}
.po-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.po-form-titlerow {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
}
.po-form-h1 {
  margin: 0;
  font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-bold);
  color: var(--mp-text-default);
  line-height: 1.2;
}
.po-form-title-caret {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: none;
  border-radius: var(--mp-radii-sm, 4px);
  background: transparent;
  color: var(--mp-text-default);
  cursor: pointer;
}
.po-form-title-caret:hover { background: var(--mp-background-neutral-hovered, #f0f1f3); }

/* Label with a trailing settings affordance (Transaction no.) */
.po-label-with-icon {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
}
.po-label-gear {
  display: inline-flex;
  align-items: center;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--mp-text-secondary);
  cursor: pointer;
}
.po-label-gear:hover { color: var(--mp-text-default); }
.po-label-gear :deep(.mp-icon) { width: 16px; height: 16px; }

/* ── Stage wrapper (matches detail-stage-wrapper) ── */
.po-form-stage-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: 12px 12px 0 0;
}

/* Warning banner (matches detail-rejection-banner) */
.po-form-rejection-banner {
  border-radius: 0 !important;
}

/* ── Scrollable stage (matches detail-stage) ── */
.po-form-stage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--mp-background-stage);
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-6);
}

/* ── Dashed section divider ── */
.po-dashed-divider {
  padding-bottom: var(--mp-spacing-5);
  border-bottom: 1px dashed var(--mp-border-default);
}

/* ── 12-col grid utility — every field ≤ 3 cols, unused cols stay blank ── */
.po-col-span-3 { grid-column: span 3; }

/* ── Header section 1 ──
   align-items:start (not end) so Vendor's error message — which grows its
   MpFormControl taller — never drags Email/Total's top edge down with it;
   every field's top now anchors to the row's top regardless of sibling height. */
.po-header1 {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--mp-spacing-4) var(--mp-spacing-5);
  align-items: start;
}
.po-header1-total {
  grid-column: 10 / span 3;
  justify-self: end;
  align-self: start;
  display: flex;
  align-items: flex-end;
  /* Fixed to a normal (error-free) Label+Input stack's height (measured live:
     ~20px label + 4px gap + 38px md input) so Total keeps sitting at the input's
     baseline instead of the row's top, without depending on Vendor's own height. */
  height: 62px;
}
.po-header1-total-value {
  margin: 0;
  font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-bold);
  color: var(--mp-text-default);
  white-space: nowrap;
}

/* ── Header section 2 — dynamic 3→4 columns, each 3/12, no divider below ── */
.po-header2 {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--mp-spacing-4) var(--mp-spacing-5);
  align-items: start;
}
.po-header2-col {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-4);
}

.po-field { min-width: 0; }
.po-field--checkbox {
  display: flex;
  align-items: center;
}
.po-required { color: var(--mp-text-danger); }

/* MpInputTag needs an explicit full-width hook */
.po-field :deep(.input-tag__root) { width: 100%; }

/* ── Line items ── */
.po-items-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }

.po-items-header-row {
  display: flex;
  justify-content: flex-end;
}

/* Table chrome mirrors the Expense line-items table (NewExpensePage.vue) for
   structure, but row height follows the WMS item-table convention (40px —
   e.g. ReceiveItemsPage's .ri-td) rather than Expense's 52px. */
.po-table-section { overflow-x: auto; border-bottom: 1px solid var(--mp-border-default); }
.po-table-scroll { overflow-x: auto; }
.po-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; border-radius: 0; }
.po-lineitems-table { min-width: 1140px; margin-right: auto; }

.po-col-drag     { width: 44px; }
.po-col-product  { width: 200px; }
.po-col-desc     { width: auto; }
.po-col-qty      { width: 80px; }
.po-col-unit     { width: 110px; }
.po-col-cost     { width: 150px; }
.po-col-discount { width: 110px; }
.po-col-tax      { width: 130px; }
.po-col-amount   { width: 150px; }
.po-col-del      { width: 44px; }

.po-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  font-style: normal; text-transform: uppercase; letter-spacing: var(--mp-letter-spacings-normal);
  color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.po-th--drag, .po-th--del { padding: 0; }

.po-td {
  height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-4) 0 var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: middle;
  /* Table cells don't clip overflow by default — even under table-layout:fixed,
     content wider than its column bleeds into the next cell instead of being
     constrained. Since every cell here is sized to fit exactly, clip defensively
     so a control's own intrinsic min-width can never bleed into its neighbor. */
  overflow: hidden;
}
.po-tr:last-child .po-td { border-bottom: none; }
.po-td--border { border-right: 1px solid var(--mp-border-default); }
.po-td--drag { padding: 0; text-align: center; vertical-align: middle; color: var(--mp-text-placeholder); cursor: grab; }
.po-td--del  { padding: 0; text-align: center; vertical-align: middle; }
.po-td--input { padding: 0; vertical-align: middle; }
.po-td--input :deep([class*='input']), .po-td--input :deep([class*='select']) { border-radius: 0; border-color: transparent; }
/* The inner control's own intrinsic min-width (browser default for a number
   input, or MpSelect's ~88px floor) must yield to the column, not the reverse —
   this is what let the Discount suffix bleed into the Tax column before. */
.po-td--input :deep(.mp-input__root),
.po-td--input :deep(.mp-select__root) { min-width: 0; width: 100%; }
.po-td--input :deep(.mp-input__control),
.po-td--input :deep(.mp-select__control) { min-width: 0; }
/* Matches Expense's .ex-td--input:focus-within exactly. */
.po-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); }

/* Invalid-cell treatment — same construction as Expense's .ex-td--error: a
   subtle danger background plus an inset bottom rule, cell-scoped (not the
   whole row), with a hover tooltip carrying the specific message. */
.po-td--error { background: var(--mp-colors-background-danger, #fceeed); box-shadow: inset 0 -1px 0 0 var(--mp-border-danger, #dc2626); }
.po-td--error :deep(.mp-input__root),
.po-td--error :deep(.mp-select__root),
.po-td--error :deep(.mp-input__control),
.po-td--error :deep(.mp-select__control) { background: transparent; }
/* MpTooltip's trigger wrapper is inline by default; force it to fill the cell
   so the wrapped MpInput still reads as full-width. */
.po-td-tooltip { display: block; width: 100%; }
.po-td-tooltip :deep([class*='tooltip__trigger']) { display: block; width: 100%; }

.po-td--product { position: relative; }
.po-td--product :deep(.mp-input__control) { padding-right: var(--mp-spacing-8, 32px); }

/* In-cell prefix/suffix — a flush neutral-subtle block beside a borderless input
   (or, for Amount, a plain value), centered independent of row height so it
   isn't tied to one fixed cell height like the padding-hack version was. */
.po-td--affix { padding: 0; }
.po-affix-cell { display: flex; align-items: stretch; height: 100%; min-width: 0; }
.po-affix {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  padding: 0 var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); border-radius: 0;
}
.po-affix-input { flex: 1; min-width: 0; }
.po-affix-value {
  flex: 1; min-width: 0;
  display: flex; align-items: center; justify-content: flex-end;
  padding: 0 var(--mp-spacing-4);
  font-variant-numeric: tabular-nums;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

.po-del-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-sm) !important;
  cursor: pointer; color: var(--mp-text-secondary); flex-shrink: 0;
}
.po-del-btn:hover { background: var(--mp-background-neutral) !important; color: var(--mp-text-danger, #dc2626); }

/* Expense's version sets margin-bottom: 20px directly (no flex gap in its
   layout); .po-items-section already contributes 12px via its own gap, so
   this only needs to make up the remaining 8px to match that 20px total. */
.po-items-error-banner { border-radius: var(--mp-radii-md, 8px); margin-bottom: var(--mp-spacing-2, 8px); }

.po-select--product :deep(.mp-input__control)::placeholder { color: var(--mp-text-placeholder); }

/* Product cell reads as a select — caret sits inside the cell, clicks pass through
   to the input underneath so the popover still opens on focus. */
.po-product-caret {
  position: absolute;
  right: var(--mp-spacing-3, 12px);
  top: 50%;
  transform: translateY(-50%);
  color: var(--mp-text-secondary);
  pointer-events: none;
}


/* ── Notes + Attachment + Totals — 12-col grid, auto middle gap ── */
.po-bottom-section {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  column-gap: var(--mp-spacing-5);
  row-gap: var(--mp-spacing-4);
}
.po-note-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.po-note-field--message { grid-column: 1 / span 4; grid-row: 1; }
.po-note-field--memo    { grid-column: 1 / span 4; grid-row: 2; }
.po-field-caption { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-secondary); margin-top: 2px; }

.po-totals-col {
  grid-column: 9 / span 4;
  grid-row: 1 / span 3;
  display: flex;
  flex-direction: column;
}
.po-totals-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
}
.po-totals-row--h3 {
  font-weight: var(--mp-font-weights-semi-bold);
  font-size: var(--mp-font-sizes-lg);
}
.po-totals-row--total {
  margin-top: var(--mp-spacing-2);
  padding-top: var(--mp-spacing-3);
  border-top: 1px dashed var(--mp-border-default);
}
.po-deduction { color: var(--mp-text-secondary); }

.po-global-discount-label {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  white-space: nowrap;
}
.po-global-discount, .po-shipping-fee { max-width: 180px; }

/* Unit prefix — same construction as the Expense withholding amount field. */
.po-unit-addon :deep(.mp-input-addon__root) {
  padding: 0;
  background: var(--mp-background-neutral-subtle);
  border-radius: var(--mp-radii-md);
}
.po-unit-addon--static :deep(.mp-input-addon__root) {
  padding: var(--mp-spacing-1\.5, 6px) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.po-unit-trigger {
  display: flex !important; align-items: center; gap: 4px;
  padding: var(--mp-spacing-1\.5, 6px) !important;
  min-width: 0 !important;
  background: none !important;
  border: none !important;
  cursor: pointer;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.po-unit-trigger:hover { background: var(--mp-background-neutral-hovered) !important; }
.po-unit-trigger :deep(svg) { width: 16px; height: 16px; flex-shrink: 0; }
.po-global-discount :deep(.mp-input__control),
.po-shipping-fee :deep(.mp-input__control) { padding: 2px; }

/* ── Attachment — same column as Message/Memo, narrower (3/12) ── */
.po-attachment-section {
  grid-column: 1 / span 3;
  grid-row: 3;
  /* 4px between the "Attachment" label and the upload field */
  display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px);
}
.po-section-heading {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.po-attachment-section .po-field-caption { margin-top: 0; }
.po-attachment-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-2); }

/* ── Footer — scrolls with content, not sticky ── */
.po-form-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding-top: var(--mp-spacing-4);
}

/* ── Enterprise pill buttons (matches app/pages/index.vue .btn-enterprise) ── */
.btn-enterprise {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--mp-spacing-2, 8px);
  padding: var(--mp-spacing-2, 8px) var(--mp-spacing-4, 16px);
  border-radius: 999px;
  font-size: var(--mp-font-sizes-md, 14px);
  font-weight: var(--mp-font-weights-semi-bold, 600);
  line-height: var(--mp-line-heights-md, 20px);
  cursor: pointer;
  white-space: nowrap;
  border: 1px solid transparent;
}
.btn-enterprise--secondary {
  background: var(--mp-background-neutral, #ffffff);
  border-color: var(--mp-border-bold, #8c9596);
  color: var(--mp-text-secondary, #3a4749);
}
.btn-enterprise--secondary:hover { background: var(--mp-background-neutral-hovered, #f0f1f3); }

.btn-enterprise--primary {
  background: var(--mp-colors-emerald-700, #029861);
  border-color: var(--mp-colors-emerald-700, #029861);
  color: #ffffff;
}
.btn-enterprise--primary:hover {
  background: var(--mp-colors-emerald-800, #186f4a);
  border-color: var(--mp-colors-emerald-800, #186f4a);
}

.btn-enterprise--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--mp-text-secondary, #3a4749);
}
.btn-enterprise--ghost:hover { background: var(--mp-background-neutral-hovered, #f0f1f3); }

.btn-enterprise--icon {
  padding: var(--mp-spacing-2, 8px);
  width: 38px;
  height: 38px;
}
</style>
