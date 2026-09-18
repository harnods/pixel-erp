<script setup lang="ts">
/**
 * "New deal" form — CRM ▸ Deals ▸ New deal.
 *
 * COPIED EXACTLY from NewSalesOrderPage.vue (same layout, sections, line-item
 * table, totals, notes/attachments, footer and scoped CSS) — then wired to
 * create/update a CRM Deal instead of a Sales Order. "Copy exactly, modify
 * later": the visual form stays identical to the sales-order form.
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
  PAYMENT_TERMS, TAX_OPTIONS,
} from '~/data'
// Warehouses come from the single warehouse DB (warehouses.ts) — same source the
// stock lookup uses, so no name→id bridging.
import { warehouses } from '~/data/warehouses'
import {
  crmCustomers, createDeal, updateDeal, getDeal,
  addDealAttachment, crmContactPeople, getContactPerson, companiesOfContact,
  defaultDealStage, CRM_OWNERS, dealModuleSetup,
  type DealInput, type DealLineItem, type CrmCompany, type CrmContactPerson,
} from '~/data/crm'
import CrmQuickContactModal from '~/components/patterns/CrmQuickContactModal.vue'
// Products come from the shared product DB (catalog.ts) — CRM cannot create products.
import { CATALOG, type CatalogItem } from '~/data/catalog'
import { availableForSku, totalAvailableForSku } from '~/data/warehouseDetails'
import NumberFormatSettingsModal, { type NumberFormatConfig } from '~/components/patterns/NumberFormatSettingsModal.vue'

// Standalone page: orderId = 'new' (create) or an existing deal id (edit via
// /crm/deals/:id/edit).
const props = defineProps<{ orderId: string }>()
const isEdit = computed(() => props.orderId !== 'new')

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
// Default Close date from the Deals module Setup (base = today / record creation).
function isoOf(dt: Date) { return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}` }
function defaultCloseDateISO(): string {
  const s = dealModuleSetup
  const [y, m, d] = todayISO().split('-').map(Number) as [number, number, number]
  if (s.closeMode === 'period') {
    const off = s.closePeriod === 'next-month' ? 2 : 1
    return isoOf(new Date(y, (m - 1) + off, 0)) // day 0 → last day of the target month
  }
  const base = new Date(y, m - 1, d)
  if (s.closeUnit === 'weeks') base.setDate(base.getDate() + s.closeAmount * 7)
  else if (s.closeUnit === 'months') base.setMonth(base.getMonth() + s.closeAmount)
  else base.setDate(base.getDate() + s.closeAmount)
  return isoOf(base)
}
function toTagData(values: string[]): DataInterface[] {
  return values.map((v, i) => ({ text: v, id: `${i}-${v}`, value: v, isInvalid: false, isReadOnly: false }))
}

// ── Header fields — CONTACT first; the company is derived from the contact's
// associations (a contact may have 0, 1, or several companies). ──
const contactId       = ref('')
const contactError    = ref(false)
const chosenCompanyId = ref('')   // only used when the contact has >1 company
const contactOptions  = computed(() => crmContactPeople.filter(c => !c.archived).map(c => ({ id: c.id, name: c.name })))
const selectedContact = computed(() => getContactPerson(contactId.value))
const contactCompanies = computed(() => contactId.value ? companiesOfContact(contactId.value) : [])
const companyOptions  = computed(() => contactCompanies.value.map(c => ({ id: c.id, name: c.name })))
// The single company a deal is against: the only one, or the picked one when many.
const effectiveCompany = computed<CrmCompany | undefined>(() => {
  const cs = contactCompanies.value
  if (cs.length === 1) return cs[0]
  if (cs.length > 1) return cs.find(c => c.id === chosenCompanyId.value)
  return undefined
})

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
const warehouse      = ref('')  // no auto-fill — user picks a warehouse (or leaves it to see all-warehouse stock)
const tagsList       = ref<DataInterface[]>([])

// ── Transaction no. settings (auto-numbering) — shared global component ────────
const noSettingsOpen = ref(false)
const nextTxNo = computed(() => t('Auto'))
const txNoFormats = [{ label: t('Auto'), value: 'auto' }]
function onNoFormatSave(_config: NumberFormatConfig) { noSettingsOpen.value = false }

// Both default on so the form opens in the state the design documents.
const requiresShipping = ref(false)
const shipToDifferent  = ref(true)
const priceIncludesTax = ref(false)

function onEmailChange(data: DataInterface[]) { emailTags.value = data }
function onTagsChange(data: DataInterface[])  { tagsList.value = data }

// Quick-add contact from the picker (the "+ New contact" / "Add '<x>' …" action).
const quickContactOpen = ref(false)
const quickContactName = ref('')
// MpAutocomplete emits (suggestions, currentSearch) positionally — the typed text is the 2nd arg.
function openAddContact(_suggestions: unknown, currentSearch?: string) { quickContactName.value = (currentSearch || '').trim(); quickContactOpen.value = true }
function onContactCreated(c: CrmContactPerson) {
  contactId.value = c.id
  onContactChange(c.id)
  quickContactOpen.value = false
}

// Picking a contact seeds the email chips and defaults the company pick (when the
// contact belongs to several companies).
function onContactChange(id: unknown) {
  contactError.value = false
  const c = getContactPerson(String(id ?? ''))
  const cs = c ? companiesOfContact(c.id) : []
  chosenCompanyId.value = cs.length > 1 ? (cs[0]?.id ?? '') : ''
  if (c?.email && !emailTags.value.length) emailTags.value = toTagData([c.email])
}

// Auto-fill addresses from the contact's (effective) company: billing always;
// shipping (Ship to) only when shipping is required AND shipping differs.
const suppressAddressFill = ref(false)
function fillAddressesFromCompany() {
  if (suppressAddressFill.value) return
  const co = effectiveCompany.value
  if (!co) return
  if (co.billingAddress) billingAddress.value = co.billingAddress
  const ship = co.shippingAddress || ''
  if (requiresShipping.value && ship && ship !== co.billingAddress) {
    shipToDifferent.value = true
    shipTo.value = ship
  }
}
watch([contactId, chosenCompanyId, requiresShipping], () => fillAddressesFromCompany())

// ── Line items ────────────────────────────────────────────────────────────────
interface LineItem {
  _key: number
  productId: string
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

// Match on product name OR SKU against the shared product DB (catalog.ts).
function productMatches(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return CATALOG
  return CATALOG.filter(p => p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q))
}
// An ERP product can carry multiple categories; show only the first.
function firstCategory(category: string): string { return category.split(',')[0]!.trim() }
// Dropdown caption line: "SKU, First category".
function productMeta(p: CatalogItem): string { return `${p.sku}, ${firstCategory(p.category)}` }

// Warehouse options + id lookup both read the warehouse DB, so stock resolves
// against the exact warehouse the user picked (no bridging).
const WAREHOUSE_OPTIONS = warehouses.filter((w) => w.status === 'active').map((w) => w.name)
const warehouseId = computed(() => warehouses.find((w) => w.name === warehouse.value)?.id ?? '')
// Selected warehouse → that warehouse's stock; no warehouse → total across all.
function availableStock(p: CatalogItem): number {
  return warehouseId.value ? availableForSku(warehouseId.value, p.sku) : totalAvailableForSku(p.sku)
}

const NEW_ROW_KEY = -1
const openProductRow = ref<number | null>(null)

// Popover product list is lazy-loaded 5 at a time (don't render the whole catalog).
const PRODUCT_PAGE = 5
const productLimit = ref(PRODUCT_PAGE)
watch(openProductRow, () => { productLimit.value = PRODUCT_PAGE })   // reset each time a picker opens
function visibleProducts(query: string): CatalogItem[] { return productMatches(query).slice(0, productLimit.value) }
function onProductScroll(e: Event) {
  const el = e.target as HTMLElement
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) productLimit.value += PRODUCT_PAGE
}

function selectProduct(item: LineItem, p: CatalogItem) {
  item.productId = p.id
  item.product = p.name
  item.sku = p.sku
  item.unit = p.unit
  item.unitPrice = p.price
  item.productError = false
  openProductRow.value = null
}

const newRowSearch = ref('')
function selectNewProduct(p: CatalogItem) {
  items.value.push({
    _key: ++_seq,
    productId: p.id,
    product: p.name,
    sku: p.sku,
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

const taxOptions  = computed(() => Array.from(new Set([...TAX_OPTIONS, ...items.value.map(i => i.taxLabel)])))

// Banner above the table whenever any line cell is flagged — same convention as
// NewExpensePage's line-items error banner.
const hasLineItemErrors = computed(() => items.value.some(it => it.productError || it.qtyError))
const noItemsError = ref(false)   // set on save attempt with zero line items (inline, not a toast)

// ── Totals ────────────────────────────────────────────────────────────────────
const subtotal      = computed(() => items.value.reduce((s, it) => s + it.qty * it.unitPrice, 0))
const discountTotal = computed(() => items.value.reduce((s, it) => s + Math.round(it.qty * it.unitPrice * it.discountPct / 100), 0))

const TAX_RATE = 0.11
const globalDiscountType  = ref<'%' | 'Rp'>('%')
const globalDiscountValue = ref(0)
// Whether the global discount comes off the base BEFORE tax or off the grand
// total AFTER tax — toggled by the swap button in the discount gutter.
const discountBeforeTax = ref(true)

const shippingFee = ref(0)

const lineNet = computed(() => subtotal.value - discountTotal.value)          // after per-line discounts
const globalDiscountAmount = computed(() => globalDiscountType.value === '%'
  ? Math.round(lineNet.value * (globalDiscountValue.value / 100))
  : globalDiscountValue.value)
const taxableBase = computed(() => discountBeforeTax.value ? lineNet.value - globalDiscountAmount.value : lineNet.value)
const taxAmount = computed(() => priceIncludesTax.value
  ? Math.round(taxableBase.value - taxableBase.value / (1 + TAX_RATE))   // tax portion already inside prices
  : Math.round(taxableBase.value * TAX_RATE))
const total = computed(() => {
  const afterTax = priceIncludesTax.value ? taxableBase.value : taxableBase.value + taxAmount.value
  const afterGlobal = discountBeforeTax.value ? afterTax : afterTax - globalDiscountAmount.value
  return afterGlobal + shippingFee.value
})

// The header figure is the deal total.
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
  if (!contactId.value) { contactError.value = true; ok = false }
  // Products are optional on a deal — only validate rows the user actually added.
  noItemsError.value = false
  items.value.forEach(it => {
    if (!it.product) { it.productError = true; ok = false }
    if (!(it.qty > 0)) { it.qtyError = true; ok = false }
  })
  return ok
}

function onCancel() {
  router.push(isEdit.value ? `/crm/deals/${props.orderId}` : '/crm')
}

// On edit, prefill the form from the existing deal (best-effort).
onMounted(() => {
  if (!isEdit.value) {
    // Create mode — apply the Deals module Setup default close date.
    if (dealModuleSetup.applyCloseDate) dueDate.value = isoToDMY(defaultCloseDateISO())
    return
  }
  const d = getDeal(props.orderId)
  if (!d) return
  suppressAddressFill.value = true
  nextTick(() => { suppressAddressFill.value = false })
  // Restore the contact from the deal's picName; prefer one associated with the
  // deal's company, else any contact with that name.
  const named = crmContactPeople.filter(c => !c.archived && c.name === d.picName)
  const match = named.find(c => companiesOfContact(c.id).some(co => co.name === d.company)) ?? named[0]
  contactId.value = match?.id ?? ''
  // If that contact has several companies, pre-select the deal's company.
  if (match && companiesOfContact(match.id).length > 1) {
    chosenCompanyId.value = companiesOfContact(match.id).find(co => co.name === d.company)?.id ?? ''
  }
  if (match?.email) emailTags.value = toTagData([match.email])
  dueDate.value = isoToDMY(d.expectedCloseDate)
  message.value = d.description ?? ''
  memo.value = d.notes ?? ''
  referenceNo.value = d.referenceNumber ?? ''
  shippingFee.value = d.shippingFee ?? 0
  items.value = (d.products ?? []).map(p => ({
    _key: ++_seq,
    productId: p.productId,
    product: p.productName,
    sku: p.sku ?? '',
    description: p.description ?? '',
    qty: p.quantity,
    unit: p.unit,
    unitPrice: p.originalPrice,
    discountPct: p.discountType === 'percentage' ? p.discount : 0,
    taxLabel: 'PPN 11%',
    productError: false,
    qtyError: false,
  }))
})

function onSave() {
  // Validation errors surface INLINE (per-field + the banner below), never as a toast.
  if (!validate()) return
  // Deal is against the contact; the company (if any) comes from the contact.
  const contact = selectedContact.value
  const company = effectiveCompany.value
  const companyName = company?.name ?? ''
  // Best-effort link to the legacy customer master by company name (may be empty
  // for a contact-only deal).
  const customerId = company ? (crmCustomers.find(c => c.company === companyName)?.id ?? '') : ''
  const products: DealLineItem[] = items.value.map(it => ({
    productId: it.productId,
    productName: it.product,
    sku: it.sku || undefined,
    description: it.description || undefined,
    unit: it.unit,
    quantity: it.qty,
    originalPrice: it.unitPrice,
    discountType: it.discountPct > 0 ? 'percentage' : 'none',
    discount: it.discountPct,
  }))
  const input: DealInput = {
    name: companyName || contact?.name || 'New deal',
    customerId,
    company: companyName,
    stage: defaultDealStage(),
    owner: CRM_OWNERS[0] ?? 'You',
    value: total.value,
    currency: dealModuleSetup.baseCurrency || 'IDR',
    exchangeRate: 1,
    expectedCloseDate: dmyToIso(dueDate.value || txDate.value),
    products,
    shippingFee: shippingFee.value,
    description: message.value || undefined,
    notes: memo.value || undefined,
    referenceNumber: referenceNo.value || undefined,
  }
  // Attach the selected contact's snapshot to the deal.
  if (contact) { input.picName = contact.name; input.email = contact.email || undefined; if (contact.phone) input.phones = [contact.phone] }
  const nowISO = new Date().toISOString()
  if (isEdit.value) {
    updateDeal(props.orderId, input)
    for (const a of attachments.value) {
      addDealAttachment(props.orderId, { name: a.name, sizeKB: a.sizeKB, uploadedBy: 'You', uploadedAt: nowISO })
    }
    toast.notify({ variant: 'success', title: t('Deal updated'), rootProps: { class: 'toast-enterprise' } })
    router.push(`/crm/deals/${props.orderId}`)
  } else {
    const d = createDeal(input)
    for (const a of attachments.value) {
      addDealAttachment(d.id, { name: a.name, sizeKB: a.sizeKB, uploadedBy: 'You', uploadedAt: nowISO })
    }
    toast.notify({ variant: 'success', title: t('Deal created'), rootProps: { class: 'toast-enterprise' } })
    router.push(`/crm/deals/${d.id}`)
  }
}
</script>

<template>
  <div class="si-form-page">

    <!-- ── Fixed header bar ── -->
    <header class="si-form-bar">
      <div class="si-form-bar-left">
        <MpTextlink id="si-crumb" as="a" class="si-crumb" @click.prevent="router.push('/crm')">{{ t('Deals') }}</MpTextlink>
        <h1 class="si-form-h1">{{ isEdit ? t('Edit deal') : t('New deal') }}</h1>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="si-form-stage">

      <!-- ── Header section 1: Contact (primary) + its Company + Deal value ── -->
      <section class="si-header1 si-dashed-divider">
        <MpFormControl id="f-contact" class="si-field" is-required :is-invalid="contactError">
          <MpFormLabel>{{ t('Contact') }}</MpFormLabel>
          <MpAutocomplete
            id="f-contact-inp" v-model="contactId" :data="contactOptions"
            label-prop="name" value-prop="id" is-searchable use-portal is-full-width
            :placeholder="t('Select contact')" :is-invalid="contactError"
            is-show-button-action
            @update:model-value="onContactChange"
            @button-action="openAddContact"
          >
            <template #buttonAction="suggestions, currentSearch">
              {{ currentSearch ? `${t('Add')} "${currentSearch}" ${t('as new contact')}` : `+ ${t('New contact')}` }}
            </template>
          </MpAutocomplete>
          <MpFormErrorMessage>{{ t('You must select a contact') }}</MpFormErrorMessage>
        </MpFormControl>

        <!-- Company — derived from the contact. One → read-only; several → pick one;
             none → hidden (a contact may have no associated company). -->
        <MpFormControl v-if="contactId && contactCompanies.length" id="f-company" class="si-field">
          <MpFormLabel>{{ t('Company') }}</MpFormLabel>
          <MpAutocomplete
            v-if="contactCompanies.length > 1"
            id="f-company-inp" v-model="chosenCompanyId" :data="companyOptions"
            label-prop="name" value-prop="id" is-searchable use-portal is-full-width
            :placeholder="t('Select company')"
          />
          <div v-else class="si-company-readonly">{{ effectiveCompany?.name }}</div>
        </MpFormControl>

        <div class="si-header1-total">
          <h3 class="si-header1-total-value">{{ t('Deal value') }} {{ fmt(orderTotal) }}</h3>
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
            <MpCheckbox v-if="requiresShipping" id="f-ship-diff" v-model:is-checked="shipToDifferent">{{ t('Ship to different address') }}</MpCheckbox>
          </div>

          <MpFormControl v-if="requiresShipping && shipToDifferent" id="f-ship-to" class="si-field">
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
            <MpFormLabel>{{ t('Close date') }}</MpFormLabel>
            <MpDatePicker id="f-due-date-inp" v-model="dueDate" class="si-datepicker" format="DD/MM/YYYY" value-type="format" use-portal />
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
            <MpAutocomplete id="f-warehouse-inp" v-model="warehouse" :data="WAREHOUSE_OPTIONS" :placeholder="t('Select warehouse')" use-portal is-clearable is-full-width />
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
                <th class="si-th" data-devchange="deal-unit-readonly">{{ t('Unit') }}</th>
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
                <td class="si-td si-td--drag si-td--border"><MpIcon name="drag" size="sm" /></td>

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
                    <MpPopoverContent :class="css({ minWidth: '220px', maxHeight: '240px', overflowY: 'auto' })" @blur="openProductRow = null" @scroll="onProductScroll">
                      <MpPopoverList>
                        <MpPopoverListItem v-for="p in visibleProducts(item.product)" :key="p.id" @click="selectProduct(item, p)">
                          <div class="si-prod-opt">
                            <img v-if="p.img" class="si-prod-thumb" :src="p.img" :alt="p.name" loading="lazy" width="40" height="40" >
                            <div class="si-prod-text">
                              <span class="si-prod-name">{{ p.name }}</span>
                              <span class="si-prod-meta">{{ productMeta(p) }}</span>
                              <span class="si-prod-stock" :class="{ 'si-prod-stock--out': availableStock(p) <= 0 }">{{ availableStock(p) }} {{ p.unit }} {{ warehouseId ? t('available') : t('in all warehouses') }}</span>
                            </div>
                          </div>
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

                <!-- Unit is fixed by the product (not selectable) — read-only, filled like the Amount cell. -->
                <td class="si-td si-td--border si-td--affix si-td--calc">
                  <div class="si-affix-cell"><span class="si-unit-ro">{{ item.unit }}</span></div>
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
                  <MpButton class="si-del-btn" :aria-label="`${t('Remove')} ${item.product}`" @click="removeItem(item._key)">
                    <MpIcon name="minus-circular" size="sm" />
                  </MpButton>
                </td>
              </tr>

              <!-- Trailing "Select product" row — picking here appends a new line -->
              <tr class="si-tr">
                <td class="si-td si-td--drag si-td--border"><MpIcon name="drag" size="sm" /></td>
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
                    <MpPopoverContent :class="css({ minWidth: '220px', maxHeight: '240px', overflowY: 'auto' })" @blur="openProductRow = null" @scroll="onProductScroll">
                      <MpPopoverList>
                        <MpPopoverListItem v-for="p in visibleProducts(newRowSearch)" :key="p.id" @click="selectNewProduct(p)">
                          <div class="si-prod-opt">
                            <img v-if="p.img" class="si-prod-thumb" :src="p.img" :alt="p.name" loading="lazy" width="40" height="40" >
                            <div class="si-prod-text">
                              <span class="si-prod-name">{{ p.name }}</span>
                              <span class="si-prod-meta">{{ productMeta(p) }}</span>
                              <span class="si-prod-stock" :class="{ 'si-prod-stock--out': availableStock(p) <= 0 }">{{ availableStock(p) }} {{ p.unit }} {{ warehouseId ? t('available') : t('in all warehouses') }}</span>
                            </div>
                          </div>
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

          <!-- Discount applied AFTER tax → PPN sits ABOVE the discount block. -->
          <div v-if="!discountBeforeTax" class="si-totals-row">
            <span>PPN 11%{{ priceIncludesTax ? ` (${t('included')})` : '' }}</span>
            <span>{{ fmt(taxAmount) }}</span>
          </div>

          <!-- Discount block — the swap affordance sits in the gutter, as designed -->
          <div class="si-discount-block">
            <MpTooltip
              id="si-discount-swap-tt"
              :label="discountBeforeTax ? t('Discount applied before tax') : t('Discount applied after tax')"
              placement="top" use-portal
            >
              <MpButton
                class="si-discount-swap"
                :aria-label="`${t('Switch discount mode')} — ${discountBeforeTax ? t('Discount applied before tax') : t('Discount applied after tax')}`"
                @click="discountBeforeTax = !discountBeforeTax"
              >
                <MpIcon name="sort-default" size="sm" />
              </MpButton>
            </MpTooltip>
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

          <!-- Discount applied BEFORE tax → PPN sits BELOW the discount block. -->
          <div v-if="discountBeforeTax" class="si-totals-row">
            <span>PPN 11%{{ priceIncludesTax ? ` (${t('included')})` : '' }}</span>
            <span>{{ fmt(taxAmount) }}</span>
          </div>

          <!-- Shipping fee — only when the deal requires shipping. -->
          <div v-if="requiresShipping" class="si-totals-row">
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

      <!-- ── Footer ── ghost Cancel · primary Save ── -->
      <MpButtonGroup class="erp-action-footer si-form-footer">
        <MpButton variant="ghost" is-rounded @click="onCancel">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="onSave">{{ isEdit ? t('Save changes') : t('Save') }}</MpButton>
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

    <!-- Quick-add contact from the Contact picker. -->
    <CrmQuickContactModal
      :open="quickContactOpen"
      :initial-name="quickContactName"
      @close="quickContactOpen = false"
      @created="onContactCreated"
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
/* Read-only company value shown beside the contact when it has a single company. */
.si-company-readonly { min-height: var(--mp-sizes-9\.5, 38px); display: flex; align-items: center; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); }
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
/* Product option: photo + a text block (name, then "SKU, Category", then the
   available stock for the selected warehouse — each on its own line). */
.si-prod-opt { display: flex; align-items: center; gap: var(--mp-spacing-3); width: 100%; }
.si-prod-thumb { width: 40px; height: 40px; flex-shrink: 0; border-radius: var(--mp-radii-md, 8px); object-fit: cover; }
.si-prod-text { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); min-width: 0; }
.si-prod-name { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-default); }
.si-prod-meta { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.si-prod-stock { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.si-prod-stock--out { color: var(--mp-text-danger, #a8352d); }
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
  vertical-align: middle;
}
.si-td--border { border-right: 1px solid var(--mp-border-default, #e3e7e9); }
.si-unit-ro { flex: 1; display: flex; align-items: center; padding: 0 var(--mp-spacing-2); color: var(--mp-text-secondary, #64748b); }
.si-tr--dragging { opacity: 0.4; }
.si-tr--dragging .si-td--drag { cursor: grabbing; }
.si-tr--dragover > .si-td { border-top: 2px solid var(--mp-border-focused, #2563eb); }
.si-td--drag { padding: 0; text-align: center; color: var(--mp-text-placeholder); cursor: grab; }
.si-td--del  { padding: 0; text-align: center; }
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

/* Line-item validation — cell tint + inset red underline + tooltip, the same
   convention as NewExpensePage's .ex-td--error. */
.si-td--error { background: var(--mp-background-danger-subtle, #fef2f2); box-shadow: inset 0 -1px 0 0 var(--mp-border-danger, #dc2626); }
.si-td--error :deep([class*='input']) { background: transparent; }
.si-error-tooltip-wrap { display: block; width: 100%; }
.si-error-tooltip-wrap :deep([class*='tooltip__trigger']) { display: block; width: 100%; }

/* Prefix/suffix cells (Unit price, Discount, Amount) — a plain span box, never
   MpInputLeftAddon, so it fills the cell edge-to-edge like .ex-amount-prefix. */
.si-td--affix { padding: 0; }
/* calculated (non-editable) Amount cell = disabled gray (rule/table-bg-white exception) */
.si-td--calc, .si-td--calc .si-affix, .si-td--calc .si-affix-value { background: var(--mp-background-neutral-strong, #f1f3f5); }
.si-affix-cell { display: flex; align-items: stretch; height: 100%; min-height: var(--mp-sizes-10, 40px); }
.si-affix {
  flex-shrink: 0; display: flex; align-items: center; justify-content: center;
  padding: 0 var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
/* The input must actually shrink, or `is-full-width`'s width:100% takes the
   whole cell and shoves the prefix/suffix box outside it (that's what dropped
   the Discount "%"). Target the rendered root, not just the class on MpInput. */
.si-affix-input { flex: 1 1 0; min-width: 0; }
.si-affix-cell :deep(.mp-input__root) { flex: 1 1 0; min-width: 0; width: auto; }
.si-affix-value { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: flex-end; padding: 0 var(--mp-spacing-2); white-space: nowrap; }

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
.si-discount-mode-caption { margin: 0; padding: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-xs); color: var(--mp-text-secondary); }
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
  /* Pushed to the very bottom of the scroll stage — sits at the page bottom when the
     form is short, flows after the content when it's long. */
  margin-top: auto;
  display: flex; align-items: center; justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding-top: var(--mp-spacing-6);
}
/* Chevron on a filled button follows the label colour, not the default icon grey */
.si-form-footer .btn-enterprise--primary :deep(.mp-icon),
.si-form-footer .btn-enterprise--primary :deep(svg) {
  --mp-icon-color: var(--mp-text-inverse, #fff);
  color: var(--mp-text-inverse, #fff);
}
</style>
