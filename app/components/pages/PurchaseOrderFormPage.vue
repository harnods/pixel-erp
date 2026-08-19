<script setup lang="ts">
import {
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  MpButton, MpFormControl, MpFormLabel, MpInput, MpTextarea,
  MpInputGroup, MpInputLeftAddon, MpInputRightAddon,
  MpSelect, MpDatePicker, MpInputTag, MpCheckbox, MpUpload, MpUploadList,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpIcon,
  css,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import type { DataInterface } from '@mekari/pixel3'
import { getPurchaseOrderDetail, purchaseOrders, PAYMENT_TERMS, WAREHOUSES, UNIT_OPTIONS, TAX_OPTIONS, products } from '~/data'
import type { POLineItem, POAttachment } from '~/data/purchaseOrderDetails'
import type { PurchaseOrder } from '~/data/types'

const props = defineProps<{
  duplicateOrderId?: string | null
  rejectionBanner?: { user: string; date: string; reason?: string } | null
}>()

const closePurchaseOrderForm = inject<() => void>('closePurchaseOrderForm')
const openPurchaseOrder = inject<(id: string) => void>('openPurchaseOrder')

const source = computed(() => props.duplicateOrderId ? getPurchaseOrderDetail(props.duplicateOrderId) : null)

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

const vendor       = ref(source.value?.vendor.name ?? '')
const emailTags    = ref<DataInterface[]>(toTagData(source.value?.email ?? []))
const txDate       = ref(isoToDMY(source.value?.date ?? todayISO()))
const dueDate      = ref(isoToDMY(source.value?.dueDate ?? ''))
const shipDate     = ref(isoToDMY(source.value?.shipDate ?? ''))
const shipVia      = ref(source.value?.shipVia ?? '')
const paymentTerms = ref(source.value?.paymentTerms ?? '')
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

const fmt = formatIDR

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
  const newId = createDuplicateOrder()
  closePurchaseOrderForm?.()
  if (newId) openPurchaseOrder?.(newId)
}

function onSaveAndNew() { closePurchaseOrderForm?.() }

function onSendToFulfillment() {
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
        <MpButton class="po-crumb" @click="onCancel">Purchase orders</MpButton>
        <h1 class="po-form-h1">New purchase order</h1>
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
          <MpFormControl id="f-vendor" class="po-field po-col-span-3">
            <MpFormLabel>Vendor <span class="po-required">*</span></MpFormLabel>
            <MpInput id="f-vendor-inp" v-model="vendor" is-full-width />
          </MpFormControl>

          <MpFormControl id="f-email" class="po-field po-col-span-3">
            <MpFormLabel>Email</MpFormLabel>
            <MpInputTag id="f-email-inp" :data="emailTags" placeholder="+ Add email" @change="onEmailChange" />
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
              <MpFormLabel>Transaction no.</MpFormLabel>
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

          <table class="po-items-table">
            <thead>
              <tr>
                <th class="po-th po-th--drag" />
                <th class="po-th po-th--product">PRODUCT</th>
                <th class="po-th">DESCRIPTION</th>
                <th class="po-th po-th--num">QTY</th>
                <th class="po-th">UNIT</th>
                <th class="po-th po-th--num">UNIT COST</th>
                <th class="po-th po-th--num">DISCOUNT</th>
                <th class="po-th">TAX</th>
                <th class="po-th po-th--num">AMOUNT</th>
                <th class="po-th po-th--remove" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in items" :key="item._key" class="po-item-row">
                <td class="po-td po-td--drag">
                  <MpButton variant="ghost" size="md" left-icon="drag" aria-label="Drag to reorder" />
                </td>
                <td class="po-td po-td--product">
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
                      <MpInput
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
                </td>
                <td class="po-td">
                  <MpInput v-model="item.description" is-full-width />
                </td>
                <td class="po-td po-td--num">
                  <MpInput type="number" :model-value="item.qty" is-full-width
                    @update:model-value="(v) => item.qty = Number(v)" />
                </td>
                <td class="po-td po-td--unit">
                  <MpSelect v-model="item.unit" is-full-width>
                    <option v-for="opt in unitOptions" :key="opt" :value="opt">{{ opt }}</option>
                  </MpSelect>
                </td>
                <td class="po-td po-td--num">
                  <MpInputGroup :id="`f-unitcost-group-${item._key}`">
                    <MpInputLeftAddon>Rp</MpInputLeftAddon>
                    <MpInput type="number" :model-value="item.unitPrice"
                      @update:model-value="(v) => item.unitPrice = Number(v)" />
                  </MpInputGroup>
                </td>
                <td class="po-td po-td--num">
                  <MpInputGroup :id="`f-discount-group-${item._key}`">
                    <MpInput type="number" :model-value="item.discountPct"
                      @update:model-value="(v) => item.discountPct = Number(v)" />
                    <MpInputRightAddon>%</MpInputRightAddon>
                  </MpInputGroup>
                </td>
                <td class="po-td po-td--tax">
                  <MpSelect v-model="item.taxLabel" is-full-width>
                    <option v-for="opt in taxOptions" :key="opt" :value="opt">{{ opt }}</option>
                  </MpSelect>
                </td>
                <td class="po-td po-td--num po-td--amount">{{ fmt(lineAmount(item)) }}</td>
                <td class="po-td po-td--remove">
                  <MpButton
                    variant="ghost" size="sm" left-icon="minus-circular"
                    :aria-label="`Remove ${item.product}`"
                    @click="removeItem(item._key)"
                  />
                </td>
              </tr>
              <tr class="po-item-row po-item-row--empty">
                <td class="po-td po-td--drag">
                  <MpButton variant="ghost" size="md" left-icon="drag" aria-label="Drag to reorder" is-disabled />
                </td>
                <td class="po-td po-td--product">
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
                      <MpInput
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
                </td>
                <td class="po-td" />
                <td class="po-td po-td--num" />
                <td class="po-td po-td--unit" />
                <td class="po-td po-td--num" />
                <td class="po-td po-td--num" />
                <td class="po-td po-td--tax" />
                <td class="po-td po-td--num" />
                <td class="po-td po-td--remove" />
              </tr>
            </tbody>
          </table>
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
            <div class="po-totals-row">
              <span>Discount per line</span>
              <span class="po-deduction">({{ fmt(discountTotal) }})</span>
            </div>
            <div class="po-totals-row">
              <span class="po-global-discount-label">
                <span>Global discount</span>
                <MpInputGroup id="f-global-discount-group" class="po-global-discount">
                  <MpInputLeftAddon>
                    <MpSelect class="po-prefix-toggle" v-model="globalDiscountType">
                      <option value="%">%</option>
                      <option value="Rp">Rp</option>
                    </MpSelect>
                  </MpInputLeftAddon>
                  <MpInput type="number" :model-value="globalDiscountValue"
                    @update:model-value="(v) => globalDiscountValue = Number(v)" />
                </MpInputGroup>
              </span>
              <span class="po-deduction">({{ fmt(globalDiscountAmount) }})</span>
            </div>
            <div class="po-totals-row">
              <span>PPN 11%</span>
              <span>{{ fmt(taxAmount) }}</span>
            </div>
            <div class="po-totals-row">
              <span>Shipping fee</span>
              <MpInputGroup id="f-shipping-fee-group" class="po-shipping-fee">
                <MpInputLeftAddon>Rp</MpInputLeftAddon>
                <MpInput type="number" :model-value="shippingFee"
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

          <MpPopover id="po-save-close-menu" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
            <MpPopoverTrigger>
              <button class="btn-enterprise btn-enterprise--secondary">
                Save &amp; close
                <MpIcon name="chevrons-down" size="sm" />
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="onSave">Save &amp; close</MpPopoverListItem>
                <MpPopoverListItem @click="onSaveAndNew">Save &amp; new</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>

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
  width: auto !important; height: auto !important; min-width: 0 !important;
  background: none !important; border: none !important; padding: 0 !important;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-link);
  cursor: pointer;
  text-align: left;
}
.po-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.po-form-h1 {
  margin: 0;
  font-size: var(--mp-font-sizes-xl);
  font-weight: var(--mp-font-weights-bold);
  color: var(--mp-text-default);
  line-height: 1.2;
}

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

/* ── Header section 1 ── */
.po-header1 {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--mp-spacing-4) var(--mp-spacing-5);
  align-items: end;
}
.po-header1-total {
  grid-column: 10 / span 3;
  justify-self: end;
  align-self: end;
}
.po-header1-total-value {
  margin: 0;
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
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

.po-items-table { width: 100%; border-collapse: collapse; font-size: var(--mp-font-sizes-md); }

/* Header row — same treatment as .erp-th (ErpTablePage.vue) but white background */
.po-th {
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  text-align: left;
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  text-transform: uppercase;
  letter-spacing: var(--mp-letter-spacings-normal);
  border-bottom: 1px solid var(--mp-border-default);
  background: var(--mp-background-neutral, #fff);
  white-space: nowrap;
}
.po-th--drag   { width: 40px; padding: 0; }
.po-th--num    { text-align: right; }
.po-th--product { min-width: 200px; }
.po-th--remove  { width: 40px; border-right: none; }
.po-th { border-right: 1px solid var(--mp-border-default); }

/* Rows — vertical column dividers only, no horizontal row separators */
.po-td {
  height: var(--mp-sizes-13, 52px);
  box-sizing: border-box;
  padding: var(--mp-spacing-4) var(--mp-spacing-2) 0;
  vertical-align: top;
  color: var(--mp-text-default);
  border-right: 1px solid var(--mp-border-default);
}
.po-td--remove { border-right: none; }
.po-td--drag   { color: var(--mp-text-secondary); cursor: grab; width: 40px; padding: 0; text-align: center; }
.po-td--num    { text-align: right; }
.po-td--amount { font-weight: var(--mp-font-weights-regular); font-size: var(--mp-font-sizes-md); padding-top: var(--mp-spacing-4); }
.po-td--remove { text-align: center; width: 40px; }
.po-td--product { min-width: 200px; position: relative; }
.po-td--unit, .po-td--tax { min-width: 104px; }

/* Borderless MpInput/MpSelect chrome inside table cells, filled to row min-height */
.po-td { padding-top: 0; padding-bottom: 0; }
.po-td :deep(.mp-input__root),
.po-td :deep(.mp-select__root),
.po-td :deep(.mp-input-group__root) {
  height: var(--mp-sizes-13, 52px);
  border: none;
  border-radius: 0;
  background: transparent;
}
.po-td :deep(.mp-input__control),
.po-td :deep(.mp-select__control),
.po-td :deep(.mp-input-addon__root) {
  border: none;
  border-radius: 0;
  box-shadow: var(--mp-shadows-none, none); /* pixel-police-allow-shadow: removing the default shadow */
}
.po-td--amount { padding-top: 0; display: flex; align-items: center; justify-content: flex-end; }
.po-td--drag :deep(.mp-button) { height: 52px; }
.po-td--remove :deep(.mp-button__root) { height: 52px; }

/* Prefix/suffix (Rp / %) containers get a neutral-subtle background */
.po-td :deep(.mp-input-addon__root) {
  background: var(--mp-background-neutral-subtle);
}

.po-select--product :deep(.mp-input__control)::placeholder { color: var(--mp-text-placeholder); }


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
.po-totals-row--total { padding-top: var(--mp-spacing-3); }
.po-deduction { color: var(--mp-text-secondary); }

.po-global-discount-label {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}
.po-global-discount, .po-shipping-fee { max-width: 180px; }
.po-global-discount :deep(.mp-input-addon__root),
.po-shipping-fee :deep(.mp-input-addon__root) {
  background: var(--mp-background-neutral-subtle);
}
.po-prefix-toggle {
  width: auto !important;
  min-width: 0 !important;
}
.po-prefix-toggle :deep(.mp-select__control) {
  border: none !important;
  box-shadow: var(--mp-shadows-none, none) !important; /* pixel-police-allow-shadow: removing the default shadow */
  background: transparent !important;
  padding-left: 0 !important;
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  cursor: pointer;
}

/* ── Attachment — same column as Message/Memo, narrower (3/12) ── */
.po-attachment-section {
  grid-column: 1 / span 3;
  grid-row: 3;
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
}
.po-section-heading {
  margin: 0 0 var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.po-attachment-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }

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
  color: var(--mp-text-inverse, #ffffff);
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
  width: var(--mp-sizes-9\.5, 38px);
  height: var(--mp-sizes-9\.5, 38px);
}
</style>
