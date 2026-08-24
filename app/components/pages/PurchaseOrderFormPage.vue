<script setup lang="ts">
import {
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  MpButton, MpTextlink, MpFormControl, MpFormLabel, MpInput, MpTextarea,
  MpInputGroup, MpInputLeftAddon,
  MpSelect, MpDatePicker, MpInputTag, MpCheckbox, MpUpload, MpUploadList,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpIcon,
  css,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import type { DataInterface } from '@mekari/pixel3'
import { MpAutocomplete } from '@mekari/pixel3'
import { getPurchaseOrderDetail, purchaseOrders, PAYMENT_TERMS, WAREHOUSES, UNIT_OPTIONS, TAX_OPTIONS, products, getPurchaseRequest } from '~/data'
import type { POAttachment } from '~/data/purchaseOrderDetails'
import type { PurchaseOrder, PurchaseRequestLine } from '~/data/types'
import AddPurchaseRequestDrawer from '~/components/patterns/AddPurchaseRequestDrawer.vue'

const props = defineProps<{
  duplicateOrderId?: string | null
  rejectionBanner?: { user: string; date: string; reason?: string } | null
  purchaseRequestIds?: string[] | null
}>()

const closePurchaseOrderForm = inject<() => void>('closePurchaseOrderForm')
const openPurchaseOrder = inject<(id: string) => void>('openPurchaseOrder')
const router = useRouter()

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

// ── Line-item model ──────────────────────────────────────────────────────────
// A PO is built either from purchase requests (accordion groups, with requested /
// available / qty-to-order columns) or blank (flat product rows). Both use the
// same editable-cell pattern as NewExpensePage's form table (ex-* cells).
interface POLine {
  _key: number
  product: string; sku: string; description: string
  requestedQty?: number; availableQty?: number     // only for request-sourced lines
  qty: number                                       // qty to order
  unit: string; unitCost: number; discountPct: number; taxLabel: string
}
interface POGroup { prId: string; prNumber: number; collapsed: boolean; lines: POLine[] }

let _seq = 0
function lineFromPR(l: PurchaseRequestLine): POLine {
  return {
    _key: ++_seq, product: l.product, sku: l.sku, description: l.description,
    requestedQty: l.requestedQty, availableQty: l.availableQty,
    qty: l.requestedQty, unit: l.unit, unitCost: l.unitCost, discountPct: 0, taxLabel: l.taxLabel,
  }
}
function groupFromPR(id: string): POGroup | null {
  const pr = getPurchaseRequest(id)
  if (!pr) return null
  return { prId: pr.id, prNumber: pr.number, collapsed: false, lines: pr.lines.map(lineFromPR) }
}

// From-PR mode → accordion groups. Blank/duplicate mode → flat product rows.
const groups = ref<POGroup[]>((props.purchaseRequestIds ?? []).map(groupFromPR).filter((g): g is POGroup => !!g))
const fromPr = computed(() => groups.value.length > 0)

const blankItems = ref<POLine[]>((source.value?.lineItems ?? []).map(it => ({
  _key: ++_seq, product: it.product, sku: it.sku, description: it.description,
  qty: it.qty, unit: it.unit, unitCost: it.unitPrice, discountPct: it.discountPct, taxLabel: it.taxLabel,
})))

// Every editable line across the current mode (drives totals).
const allLines = computed<POLine[]>(() => fromPr.value ? groups.value.flatMap(g => g.lines) : blankItems.value)

function lineAmount(line: POLine) {
  return Math.round(line.qty * line.unitCost * (1 - line.discountPct / 100))
}

function toggleGroup(g: POGroup) { g.collapsed = !g.collapsed }
function removeGroup(prId: string) { groups.value = groups.value.filter(g => g.prId !== prId) }
function removeGroupLine(g: POGroup, key: number) { g.lines = g.lines.filter(l => l._key !== key) }
function removeBlankItem(key: number) { blankItems.value = blankItems.value.filter(l => l._key !== key) }

// Product select (fills sku / unit / unit cost from the master).
function onProductSelect(line: POLine) {
  const p = products.find(pp => pp.name === line.product)
  if (p) { line.sku = p.code; line.unit = p.unit; if (!line.unitCost) line.unitCost = p.price }
}

// Blank mode: a trailing empty row that materialises a new line on product select.
const newProduct = ref('')
function onNewProduct() {
  const p = products.find(pp => pp.name === newProduct.value)
  if (!p) return
  blankItems.value.push({
    _key: ++_seq, product: p.name, sku: p.code, description: '',
    qty: 1, unit: p.unit, unitCost: p.price, discountPct: 0, taxLabel: 'PPN 11%',
  })
  newProduct.value = ''
}

// ── Add-purchase-request modal ──
const addPrOpen = ref(false)
function onAddPurchaseRequests(ids: string[]) {
  // Keep existing groups; append any newly-selected requests (dedup by id).
  const existing = new Set(groups.value.map(g => g.prId))
  for (const id of ids) {
    if (existing.has(id)) continue
    const g = groupFromPR(id)
    if (g) groups.value.push(g)
  }
  // Also drop groups the user deselected in the modal.
  const keep = new Set(ids)
  groups.value = groups.value.filter(g => keep.has(g.prId))
}
const selectedPrIds = computed(() => groups.value.map(g => g.prId))

const unitOptions = computed(() => Array.from(new Set([...UNIT_OPTIONS, ...allLines.value.map(i => i.unit)])))
const taxOptions   = computed(() => Array.from(new Set([...TAX_OPTIONS, ...allLines.value.map(i => i.taxLabel)])))
// MpAutocomplete needs {name} objects (label-prop/value-prop = "name").
const unitData = computed(() => unitOptions.value.map(u => ({ name: u })))
const taxData  = computed(() => taxOptions.value.map(x => ({ name: x })))

const subtotal      = computed(() => allLines.value.reduce((s, it) => s + it.qty * it.unitCost, 0))
const discountTotal = computed(() => allLines.value.reduce((s, it) => s + Math.round(it.qty * it.unitCost * it.discountPct / 100), 0))

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
// Breadcrumb → back to the originating index (Purchase requests when built from
// requests, else the Purchase orders list).
function goBack() {
  if (fromPr.value) router.push('/purchase-requests')
  else onCancel()
}

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
    itemCount: allLines.value.length,
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

    <!-- ── Title bar — canonical detail/form breadcrumb (mirrors NewExpensePage) ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <MpTextlink id="po-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="goBack">{{ fromPr ? 'Purchase request' : 'Purchase orders' }}</MpTextlink>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">New purchase order</h1>
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
              <MpFormLabel>
                <span class="po-label-row">
                  Transaction no.
                  <MpButton class="po-label-icon" aria-label="Transaction number settings">
                    <MpIcon name="settings" size="sm" />
                  </MpButton>
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

          <!-- ══ From purchase requests → accordion form-table (ex-* cell pattern).
               Product / requested / available / unit / amount are locked (from the
               request); only description, qty-to-order, unit cost, discount and tax
               are editable. A whole request is removed via the group header ⊖ —
               individual request lines can't be removed. ══ -->
          <div v-if="fromPr" class="pit-scroll">
            <table class="pit-table pit-table--pr">
              <colgroup>
                <col class="pit-col-product" />
                <col class="pit-col-desc" />
                <col class="pit-col-num" />
                <col class="pit-col-num" />
                <col class="pit-col-num" />
                <col class="pit-col-unit" />
                <col class="pit-col-cost" />
                <col class="pit-col-num" />
                <col class="pit-col-tax" />
                <col class="pit-col-amount" />
              </colgroup>
              <thead>
                <tr>
                  <th class="pit-th">PRODUCT</th>
                  <th class="pit-th">DESCRIPTION</th>
                  <th class="pit-th pit-th--num">REQUESTED QTY</th>
                  <th class="pit-th pit-th--num">AVAILABLE QTY</th>
                  <th class="pit-th pit-th--num">QTY TO ORDER</th>
                  <th class="pit-th">UNIT</th>
                  <th class="pit-th pit-th--num">UNIT COST</th>
                  <th class="pit-th pit-th--num">DISCOUNT</th>
                  <th class="pit-th">TAX</th>
                  <th class="pit-th pit-th--num">AMOUNT</th>
                </tr>
              </thead>
              <tbody v-for="g in groups" :key="g.prId" class="pit-group-body">
                <!-- Group header (accordion toggle + remove) -->
                <tr class="pit-group-row">
                  <td class="pit-group-cell" colspan="10">
                    <div class="pit-group-inner">
                      <button type="button" class="pit-group-toggle" @click="toggleGroup(g)">
                        <MpIcon name="caret-down" size="sm" class="pit-group-caret" :class="{ 'pit-group-caret--collapsed': g.collapsed }" />
                        Purchase Request #{{ g.prNumber }}
                      </button>
                      <MpButton class="pit-group-remove" :aria-label="`Remove Purchase Request #${g.prNumber}`" @click="removeGroup(g.prId)">
                        <MpIcon name="minus-circular" size="sm" />
                      </MpButton>
                    </div>
                  </td>
                </tr>
                <!-- Lines -->
                <template v-if="!g.collapsed">
                  <tr v-for="line in g.lines" :key="line._key" class="pit-tr">
                    <td class="pit-td pit-td--ro pit-td--clip pit-td--border" :title="line.product">{{ line.product }}</td>
                    <td class="pit-td pit-td--input pit-td--border">
                      <MpInput :id="`po-desc-${line._key}`" v-model="line.description" is-full-width />
                    </td>
                    <td class="pit-td pit-td--num pit-td--ro pit-td--border">{{ line.requestedQty }}</td>
                    <td class="pit-td pit-td--num pit-td--ro pit-td--border">{{ line.availableQty }}</td>
                    <td class="pit-td pit-td--input pit-td--num pit-td--border">
                      <MpInput :id="`po-qty-${line._key}`" type="number" :model-value="line.qty" is-full-width class="pit-num-input" @update:model-value="(v) => line.qty = Number(v)" />
                    </td>
                    <td class="pit-td pit-td--ro pit-td--clip pit-td--border">{{ line.unit }}</td>
                    <td class="pit-td pit-td--input pit-td--num pit-td--border">
                      <div class="pit-affix-cell">
                        <span class="pit-affix pit-affix--prefix">Rp</span>
                        <MpInput :id="`po-cost-${line._key}`" type="number" :model-value="line.unitCost" is-full-width class="pit-num-input" @update:model-value="(v) => line.unitCost = Number(v)" />
                      </div>
                    </td>
                    <td class="pit-td pit-td--input pit-td--num pit-td--border">
                      <div class="pit-affix-cell">
                        <MpInput :id="`po-disc-${line._key}`" type="number" :model-value="line.discountPct" is-full-width class="pit-num-input" @update:model-value="(v) => line.discountPct = Number(v)" />
                        <span class="pit-affix pit-affix--suffix">%</span>
                      </div>
                    </td>
                    <td class="pit-td pit-td--input pit-td--border">
                      <MpAutocomplete :id="`po-tax-${line._key}`" v-model="line.taxLabel" :data="taxData" label-prop="name" value-prop="name" is-searchable use-portal is-full-width />
                    </td>
                    <td class="pit-td pit-td--num pit-td--ro">{{ fmt(lineAmount(line)) }}</td>
                  </tr>
                </template>
              </tbody>
              <tbody>
                <tr class="pit-add-row">
                  <td colspan="10">
                    <button type="button" class="pit-add-btn" @click="addPrOpen = true">
                      <MpIcon name="add" size="sm" />
                      Add purchase request
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- ══ Blank / duplicate → flat product form-table (ex-* cell pattern) ══ -->
          <div v-else class="pit-scroll">
            <table class="pit-table pit-table--flat">
              <colgroup>
                <col class="pit-col-product" />
                <col class="pit-col-desc" />
                <col class="pit-col-num" />
                <col class="pit-col-unit" />
                <col class="pit-col-cost" />
                <col class="pit-col-num" />
                <col class="pit-col-tax" />
                <col class="pit-col-amount" />
                <col class="pit-col-del" />
              </colgroup>
              <thead>
                <tr>
                  <th class="pit-th">PRODUCT</th>
                  <th class="pit-th">DESCRIPTION</th>
                  <th class="pit-th pit-th--num">QTY</th>
                  <th class="pit-th">UNIT</th>
                  <th class="pit-th pit-th--num">UNIT COST</th>
                  <th class="pit-th pit-th--num">DISCOUNT</th>
                  <th class="pit-th">TAX</th>
                  <th class="pit-th pit-th--num">AMOUNT</th>
                  <th class="pit-th pit-th--del" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="line in blankItems" :key="line._key" class="pit-tr">
                  <td class="pit-td pit-td--input pit-td--border">
                    <MpAutocomplete :id="`po-bprod-${line._key}`" v-model="line.product" :data="products" label-prop="name" value-prop="name" is-searchable use-portal is-full-width placeholder="Select product" @update:model-value="onProductSelect(line)" />
                  </td>
                  <td class="pit-td pit-td--input pit-td--border">
                    <MpInput :id="`po-bdesc-${line._key}`" v-model="line.description" is-full-width />
                  </td>
                  <td class="pit-td pit-td--input pit-td--num pit-td--border">
                    <MpInput :id="`po-bqty-${line._key}`" type="number" :model-value="line.qty" is-full-width class="pit-num-input" @update:model-value="(v) => line.qty = Number(v)" />
                  </td>
                  <td class="pit-td pit-td--input pit-td--border">
                    <MpAutocomplete :id="`po-bunit-${line._key}`" v-model="line.unit" :data="unitData" label-prop="name" value-prop="name" is-searchable use-portal is-full-width />
                  </td>
                  <td class="pit-td pit-td--input pit-td--num pit-td--border">
                    <div class="pit-affix-cell">
                      <span class="pit-affix pit-affix--prefix">Rp</span>
                      <MpInput :id="`po-bcost-${line._key}`" type="number" :model-value="line.unitCost" is-full-width class="pit-num-input" @update:model-value="(v) => line.unitCost = Number(v)" />
                    </div>
                  </td>
                  <td class="pit-td pit-td--input pit-td--num pit-td--border">
                    <div class="pit-affix-cell">
                      <MpInput :id="`po-bdisc-${line._key}`" type="number" :model-value="line.discountPct" is-full-width class="pit-num-input" @update:model-value="(v) => line.discountPct = Number(v)" />
                      <span class="pit-affix pit-affix--suffix">%</span>
                    </div>
                  </td>
                  <td class="pit-td pit-td--input pit-td--border">
                    <MpAutocomplete :id="`po-btax-${line._key}`" v-model="line.taxLabel" :data="taxData" label-prop="name" value-prop="name" is-searchable use-portal is-full-width />
                  </td>
                  <td class="pit-td pit-td--num pit-td--ro pit-td--border">{{ fmt(lineAmount(line)) }}</td>
                  <td class="pit-td pit-td--del">
                    <MpButton class="pit-del-btn" :aria-label="`Remove ${line.product}`" @click="removeBlankItem(line._key)">
                      <MpIcon name="minus-circular" size="sm" />
                    </MpButton>
                  </td>
                </tr>
                <!-- Trailing empty row — picking a product appends a new line -->
                <tr class="pit-tr">
                  <td class="pit-td pit-td--input pit-td--border">
                    <MpAutocomplete id="po-bprod-new" v-model="newProduct" :data="products" label-prop="name" value-prop="name" is-searchable use-portal is-full-width placeholder="Select product" @update:model-value="onNewProduct" />
                  </td>
                  <td class="pit-td pit-td--border" />
                  <td class="pit-td pit-td--num pit-td--border" />
                  <td class="pit-td pit-td--border" />
                  <td class="pit-td pit-td--num pit-td--border" />
                  <td class="pit-td pit-td--num pit-td--border" />
                  <td class="pit-td pit-td--border" />
                  <td class="pit-td pit-td--num pit-td--border" />
                  <td class="pit-td pit-td--del" />
                </tr>
              </tbody>
              <tbody>
                <tr class="pit-add-row">
                  <td colspan="9">
                    <button type="button" class="pit-add-btn" @click="addPrOpen = true">
                      <MpIcon name="add" size="sm" />
                      Add purchase request
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- ── Notes + Attachment + Totals (identical component set to NewSalesInvoicePage) ── -->
        <section class="si-bottom-section">
          <!-- Left stack: Message / Memo / Attachment, a constant 20px apart -->
          <div class="si-notes-col">
            <MpFormControl id="f-message" class="si-note-field">
              <MpFormLabel>Message</MpFormLabel>
              <MpTextarea id="f-message-inp" v-model="message" is-full-width />
              <span class="si-field-caption">Visible to vendor</span>
            </MpFormControl>

            <MpFormControl id="f-memo" class="si-note-field">
              <MpFormLabel>Memo</MpFormLabel>
              <MpTextarea id="f-memo-inp" v-model="memo" is-full-width />
              <span class="si-field-caption">Only visible to you and your team</span>
            </MpFormControl>

            <div class="si-attachment-section">
              <span class="si-attachment-label">Attachment</span>
              <MpUpload
                id="f-attachment" button-text="Choose file" placeholder="or drag and drop here"
                is-multiple is-full-width @change="onFilesChange"
              />
              <p class="si-field-caption">Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP format, with a maximum size of 10 MB per file and 5 files per transaction</p>
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
              <span>Subtotal</span>
              <span>{{ fmt(subtotal) }}</span>
            </div>

            <!-- Discount block — the swap affordance sits in the gutter, as designed -->
            <div class="si-discount-block">
              <MpButton class="si-discount-swap" aria-label="Switch discount mode">
                <MpIcon name="sort-default" size="sm" />
              </MpButton>
              <div class="si-discount-rows">
                <div class="si-totals-row">
                  <span>Discount per line</span>
                  <span class="si-deduction">({{ fmt(discountTotal) }})</span>
                </div>
                <div class="si-totals-row">
                  <span class="si-inline-field-label">
                    <span>Global discount</span>
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
              <span>Shipping fee</span>
              <MpInputGroup id="f-shipping-fee-group" class="si-unit-field">
                <MpInputLeftAddon has-background>Rp</MpInputLeftAddon>
                <MpInput type="number" :model-value="shippingFee" is-full-width
                  @update:model-value="(v) => shippingFee = Number(v)" />
              </MpInputGroup>
            </div>

            <div class="si-total-rule" />
            <div class="si-totals-row si-totals-row--h3">
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
              </MpPopoverList>
              <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
              <MpPopoverList>
                <MpPopoverListItem :class="css({ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--mp-spacing-2)' })">
                  Purchase settings
                  <MpIcon name="settings" size="sm" />
                </MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </footer>

      </div><!-- /po-form-stage -->
    </div><!-- /po-form-stage-wrapper -->

    <!-- ── Add purchase request (dual-pane drawer) ── -->
    <AddPurchaseRequestDrawer
      :is-open="addPrOpen"
      :selected-ids="selectedPrIds"
      @update:is-open="addPrOpen = $event"
      @save="onAddPurchaseRequests"
    />

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

/* ── Title bar — canonical detail/form breadcrumb (verbatim from NewExpensePage) ── */
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
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
/* Transaction-no. label gear (auto-numbering settings) — mirrors NewSalesInvoicePage. */
.po-label-row { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.po-label-icon {
  display: inline-flex !important; align-items: center; justify-content: center;
  padding: 0 !important; border: none !important; background: none !important; min-width: 0 !important;
  cursor: pointer; color: var(--mp-text-secondary);
}
.po-field--checkbox {
  display: flex;
  align-items: center;
}
.po-required { color: var(--mp-text-danger); }

/* MpInputTag needs an explicit full-width hook */
.po-field :deep(.input-tag__root) { width: 100%; }

/* ── Line items — form table mirroring NewExpensePage's ex-* cell pattern ── */
.po-items-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.po-items-header-row { display: flex; justify-content: flex-end; }

.pit-scroll { overflow-x: auto; border-bottom: 1px solid var(--mp-border-default); }
.pit-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; font-size: var(--mp-font-sizes-md); }
/* Sum of fixed column widths — the table stays this wide and pit-scroll scrolls,
   so no column (esp. DESCRIPTION) collapses on a narrow viewport. */
.pit-table--pr { min-width: 1452px; }
.pit-table--flat { min-width: 1272px; }

/* Columns */
.pit-col-product { width: 220px; }
.pit-col-desc { width: 260px; }
.pit-col-num { width: 112px; }
.pit-col-unit { width: 104px; }
.pit-col-cost { width: 150px; }
.pit-col-tax { width: 120px; }
.pit-col-amount { width: 150px; }
.pit-col-del { width: 44px; }

/* Header — subtle-gray, uppercase (matches ErpTablePage .erp-th) */
.pit-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: var(--mp-letter-spacings-normal);
  color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.pit-th--num { text-align: right; }
.pit-th--del { padding: 0; }

/* Body cells — 40px baseline; editable cells own the focus ring (child borderless) */
.pit-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-sizes-2\.5, 10px) var(--mp-spacing-4) var(--mp-sizes-2\.5, 10px) var(--mp-spacing-2);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: middle;
}
.pit-td--border { border-right: 1px solid var(--mp-border-default); }
.pit-td--num { text-align: right; font-variant-numeric: tabular-nums; }
/* Read-only / calculated / locked cells (product, unit, requested, available, amount) */
.pit-td--ro { background: var(--mp-background-neutral-subtle); }
.pit-td--clip { max-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Editable cell */
.pit-td--input { padding: 0; vertical-align: middle; }
.pit-td--input :deep([class*='input']),
.pit-td--input :deep([class*='autocomplete']) {
  border-radius: 0; border-color: transparent; background: transparent;
  box-shadow: var(--mp-shadows-none, none) !important; /* pixel-police-allow-shadow: strip inner control chrome so the cell owns the ring */
}
.pit-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); }
.pit-num-input :deep(input) { text-align: right; }

/* Affix cell (Rp prefix / % suffix) fills the 40px cell height */
.pit-affix-cell { display: flex; align-items: stretch; height: var(--mp-sizes-10, 40px); }
.pit-affix {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  padding: 0 var(--mp-spacing-2); background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.pit-affix-cell .pit-num-input { flex: 1; min-width: 0; }

/* Delete button */
.pit-td--del { padding: 0; text-align: center; vertical-align: middle; }
.pit-del-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-sm) !important;
  cursor: pointer; color: var(--mp-text-secondary);
}
.pit-del-btn:hover { background: var(--mp-background-neutral) !important; color: var(--mp-text-danger); }

/* Accordion group header row */
.pit-group-cell {
  padding: 0 var(--mp-spacing-2) 0 0;
  border-bottom: 1px solid var(--mp-border-default);
  background: var(--mp-background-neutral, #fff);
}
.pit-group-inner { display: flex; align-items: center; }
.pit-group-toggle {
  flex: 1; display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-2);
  border: none; background: transparent; cursor: pointer; text-align: left;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.pit-group-caret { transition: transform 150ms ease; }
.pit-group-caret--collapsed { transform: rotate(-90deg); }
.pit-group-remove {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-sm) !important;
  cursor: pointer; color: var(--mp-text-secondary); flex-shrink: 0;
}
.pit-group-remove:hover { background: var(--mp-background-neutral-hovered) !important; color: var(--mp-text-danger); }

/* Add purchase request row */
.pit-add-row td { padding: var(--mp-spacing-2) 0; }
.pit-add-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  border: none; background: transparent; cursor: pointer; padding: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default);
}
.pit-add-btn:hover { background: var(--mp-background-neutral-hovered); border-radius: var(--mp-radii-sm); }


/* ── Notes + Attachment + Totals — identical to NewSalesInvoicePage (si-*) ── */
.si-bottom-section { display: flex; align-items: flex-start; gap: var(--mp-spacing-6); }
/* Message / Memo / Attachment sit a constant 20px apart (literal, not the rem token). */
.si-notes-col { display: flex; flex-direction: column; gap: 20px; width: 432px; flex-shrink: 0; }
.si-note-field { display: flex; flex-direction: column; }
.si-field-caption { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1, 4px); }

.si-attachment-section { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); width: 100%; }
.si-attachment-label {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); line-height: var(--mp-line-heights-md, 20px);
}
.si-attachment-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-1); }

.si-totals-col { margin-left: auto; width: 428px; flex-shrink: 0; display: flex; flex-direction: column; }
.si-totals-row {
  display: flex; justify-content: space-between; align-items: center;
  gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.si-totals-row--h3 { font-weight: var(--mp-font-weights-semi-bold); font-size: var(--mp-font-sizes-lg); }
.si-deduction { color: var(--mp-text-secondary); white-space: nowrap; }

.si-total-rule {
  height: var(--mp-border-width-sm, 1px); margin: var(--mp-spacing-2) 0;
  background: repeating-linear-gradient(
    to right,
    var(--mp-border-default) 0, var(--mp-border-default) 4px,
    transparent 4px, transparent 8px
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
.si-discount-swap:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }
.si-inline-field-label { display: flex; align-items: center; gap: var(--mp-spacing-3); }

/* Standalone prefixed fields: MpInputGroup + MpInputLeftAddon, Rp/% switcher as a
   popover trigger inside the addon (verbatim from NewSalesInvoicePage). */
.si-unit-field { width: 180px; flex-shrink: 0; }
.si-unit-addon :deep(.mp-input-addon__root) {
  padding: 0; background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-md);
}
.si-unit-trigger {
  display: flex !important; align-items: center; gap: 4px;
  padding: var(--mp-spacing-1\.5, 6px) !important; min-width: 0 !important;
  background: none !important; border: none !important; cursor: pointer;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); border-radius: var(--mp-radii-md) !important;
}
.si-unit-trigger:hover { background: var(--mp-background-neutral-hovered) !important; }
.si-unit-trigger :deep(svg) { width: 16px; height: 16px; flex-shrink: 0; }

/* ── Footer — scrolls with content, not sticky ── */
.po-form-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding-top: var(--mp-spacing-4);
}
/* Save & share dropdown chevron inherits the primary button's white text */
.po-form-footer .btn-enterprise--primary :deep(svg) { color: var(--mp-text-inverse, #fff); }

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
