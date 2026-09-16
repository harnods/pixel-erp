<script setup lang="ts">
/**
 * "New purchase request" form — Purchasing ▸ Purchase requests ▸ New purchase request.
 *
 * Page shell / header grid / footer mirror NewSalesOrderPage.vue; the line-items
 * table follows the same ERP line-items pattern but drops all pricing columns —
 * a purchase request is an internal request with no vendor and no money total.
 */
import {
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
  MpButton, MpButtonGroup, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput,
  MpDatePicker, MpAutocomplete, MpTooltip,
  MpIcon, MpTextlink, toast, css,
  // The line-items product picker is an MpPopover menu. Without these imports Vue
  // renders <MpPopover> as an unknown element, so the match list spills inline into
  // the row instead of opening as a dropdown and no product can be selected.
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import {
  products,
  WAREHOUSES, UNIT_OPTIONS,
} from '~/data'
import { addPurchaseRequest } from '~/data/purchaseRequests'
import type { PurchaseRequestLine, UrgencyLevel } from '~/data/types'
import ProductCell from '~/components/patterns/ProductCell.vue'
import { decodeSubconPrefill } from '~/data/subcon'
import { recordSubconDocument } from '~/data/workOrders'

const router = useRouter()
const route = useRoute()
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

// ── Header fields ─────────────────────────────────────────────────────────────
const procurementStaff = ref('')
const staffError       = ref(false)
const requestDate      = ref(isoToDMY(todayISO()))
const requiredDate     = ref('')
const urgency          = ref('Medium')
const warehouse        = ref('')

const URGENCY_OPTIONS = ['Low', 'Medium', 'High']

// ── Line items ────────────────────────────────────────────────────────────────
interface LineItem {
  _key: number
  product: string
  sku: string
  description: string
  qty: number
  unit: string
  unitCost: number
  availableQty: number
  productError: boolean
  qtyError: boolean
}
let _seq = 0
const items = ref<LineItem[]>([])

function removeItem(key: number) { items.value = items.value.filter(it => it._key !== key) }

function productMatches(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return products
  return products.filter(p => p.name.toLowerCase().includes(q))
}

// ── Subcon prefill ────────────────────────────────────────────────────────────
// Opened from "Start work order" on a subcontracting work order, which passes
// everything this form needs as one `?subcon=` param (see data/subcon.ts). Lines
// carry their own name/unit/cost because a subcon fee is a non-track service and
// the apparel components sit outside the stocked catalog — neither resolves
// through a SKU lookup here.
const subconPrefill = decodeSubconPrefill(route.query.subcon)
if (subconPrefill) {
  requiredDate.value = isoToDMY(subconPrefill.requiredDate)
  urgency.value = 'High'
  // This form's WAREHOUSES list is a legacy string array unrelated to the real
  // warehouse store, so the name is set directly rather than matched against it.
  warehouse.value = subconPrefill.receivingWarehouseName
  items.value = subconPrefill.lines.map(l => ({
    _key: ++_seq,
    product: l.name,
    sku: l.sku,
    description: l.nonTrack ? t('Non-track service — cost only, no stock recorded') : '',
    qty: l.qty,
    unit: l.unit,
    unitCost: l.unitCost,
    availableQty: 0,
    productError: false,
    qtyError: false,
  }))
}

const NEW_ROW_KEY = -1
const openProductRow = ref<number | null>(null)

function selectProduct(item: LineItem, p: typeof products[number]) {
  item.product = p.name
  item.sku = p.code
  item.unit = p.unit
  item.unitCost = p.price
  item.availableQty = p.stock
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
    unitCost: p.price,
    availableQty: p.stock,
    productError: false,
    qtyError: false,
  })
  newRowSearch.value = ''
  openProductRow.value = null
}

const unitOptions = computed(() => Array.from(new Set([...UNIT_OPTIONS, ...items.value.map(i => i.unit)])))

// Banner above the table whenever any line cell is flagged.
const hasLineItemErrors = computed(() => items.value.some(it => it.productError || it.qtyError))
const noItemsError = ref(false)

// ── Save ──────────────────────────────────────────────────────────────────────
function validate(): boolean {
  let ok = true
  if (!procurementStaff.value.trim()) { staffError.value = true; ok = false }
  noItemsError.value = !items.value.length
  if (!items.value.length) ok = false

  items.value.forEach(it => {
    if (!it.product) { it.productError = true; ok = false }
    if (!(it.qty > 0)) { it.qtyError = true; ok = false }
  })
  return ok
}


function onCancel() { router.push('/purchase-requests') }

function onSave() {
  // Validation errors surface INLINE (per-field + the banner below), never as a toast.
  if (!validate()) return
  const lines: PurchaseRequestLine[] = items.value.map(it => ({
    product: it.product,
    sku: it.sku,
    description: it.description,
    requestedQty: it.qty,
    availableQty: it.availableQty,
    unit: it.unit,
    unitCost: it.unitCost,
    taxLabel: 'PPN 11%',
  }))
  // addPurchaseRequest() rather than a raw push: it is the store's own creator and
  // it PERSISTS. The raw push did not, so a request created here vanished on the
  // next refresh — and any link to it (see the subcon work order's Documents
  // table) dead-ended on the detail page's index-0 fallback.
  const request = addPurchaseRequest({
    date: dmyToIso(requestDate.value),
    procurementStaff: procurementStaff.value.trim(),
    requiredDate: dmyToIso(requiredDate.value || requestDate.value),
    status: 'open',
    totalProducts: lines.length,
    urgency: urgency.value.toLowerCase() as UrgencyLevel,
    lines,
  })
  const id = request.id
  // Raised from a subcon work order → link it back, so that work order's
  // Documents table can open this request instead of only offering to create one.
  if (subconPrefill?.workOrderId) {
    recordSubconDocument(subconPrefill.workOrderId, {
      kind: subconPrefill.kind,
      id,
      // Same label the PR detail page and index use, so the link reads the same
      // wherever it appears.
      number: `${t('Purchase Request')} #${request.number}`,
      route: '/purchase-requests',
    })
  }
  toast.notify({ variant: 'success', title: t('Purchase request created'), rootProps: { class: 'toast-enterprise' } })
  router.push(`/purchase-requests/${id}`)
}
</script>

<template>
  <div class="si-form-page">

    <!-- ── Fixed header bar ── -->
    <header class="si-form-bar">
      <div class="si-form-bar-left">
        <MpTextlink id="si-crumb" as="a" class="si-crumb" @click.prevent="onCancel">{{ t('Purchase requests') }}</MpTextlink>
        <h1 class="si-form-h1">{{ t('New purchase request') }}</h1>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="si-form-stage">

      <!-- ── Header — fixed-width fields that wrap, never stretch ── -->
      <section class="si-header2 si-dashed-divider">
        <!-- Col 1: procurement staff -->
        <div class="si-header2-col">
          <MpFormControl id="f-staff" class="si-field" is-required :is-invalid="staffError">
            <MpFormLabel>{{ t('Procurement staff') }}</MpFormLabel>
            <MpInput
              id="f-staff-inp" v-model="procurementStaff" is-full-width
              :placeholder="t('Enter procurement staff')" :is-invalid="staffError"
              @update:model-value="staffError = false"
            />
            <MpFormErrorMessage>{{ t('You must enter procurement staff') }}</MpFormErrorMessage>
          </MpFormControl>
        </div>

        <!-- Col 2: dates -->
        <div class="si-header2-col">
          <MpFormControl id="f-request-date" class="si-field">
            <MpFormLabel>{{ t('Request date') }}</MpFormLabel>
            <MpDatePicker id="f-request-date-inp" v-model="requestDate" class="si-datepicker" format="DD/MM/YYYY" value-type="format" use-portal />
          </MpFormControl>

          <MpFormControl id="f-required-date" class="si-field">
            <MpFormLabel>{{ t('Required date') }}</MpFormLabel>
            <MpDatePicker id="f-required-date-inp" v-model="requiredDate" class="si-datepicker" format="DD/MM/YYYY" value-type="format" use-portal />
          </MpFormControl>
        </div>

        <!-- Col 3: urgency + warehouse -->
        <div class="si-header2-col">
          <MpFormControl id="f-urgency" class="si-field">
            <MpFormLabel>{{ t('Urgency') }}</MpFormLabel>
            <MpAutocomplete id="f-urgency-inp" v-model="urgency" :data="URGENCY_OPTIONS" use-portal is-full-width />
          </MpFormControl>

          <MpFormControl id="f-warehouse" class="si-field">
            <MpFormLabel>{{ t('Warehouse') }}</MpFormLabel>
            <MpAutocomplete id="f-warehouse-inp" v-model="warehouse" :data="WAREHOUSES" use-portal is-clearable is-full-width />
          </MpFormControl>
        </div>
      </section>

      <!-- ── Line items ── -->
      <section class="si-items-section">
        <MpBanner v-if="hasLineItemErrors || noItemsError" id="si-lineitems-error-banner" variant="danger" align-items="center" class="si-items-error-banner">
          <MpBannerIcon id="si-lineitems-error-banner-icon" />
          <MpBannerTitle>{{ noItemsError && !hasLineItemErrors ? t('Add at least one product') : t('Failed to save') }}</MpBannerTitle>
          <MpBannerDescription>{{ noItemsError && !hasLineItemErrors ? t('A purchase request needs at least one line item before you can save.') : t('The request contains incomplete or invalid data. Review the highlighted fields.') }}</MpBannerDescription>
        </MpBanner>

        <div class="si-items-scroll">
          <table class="si-items-table">
            <colgroup>
              <col class="si-col-product" />
              <col class="si-col-desc" />
              <col class="si-col-qty" />
              <col class="si-col-unit" />
              <col class="si-col-del" />
            </colgroup>
            <thead>
              <tr>
                <th class="si-th">{{ t('Product') }}</th>
                <th class="si-th">{{ t('Description') }}</th>
                <th class="si-th">{{ t('Qty') }}</th>
                <th class="si-th">{{ t('Unit') }}</th>
                <th class="si-th si-th--del" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in items" :key="item._key" class="si-tr">
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

                <td class="si-td si-td--del">
                  <MpButton class="si-del-btn" :aria-label="`${t('Remove')} ${item.product}`" @click="removeItem(item._key)">
                    <MpIcon name="minus-circular" size="sm" />
                  </MpButton>
                </td>
              </tr>

              <!-- Trailing "Select product" row — picking here appends a new line -->
              <tr class="si-tr">
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
                <td class="si-td si-td--del" />
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ── Footer ── ghost Cancel · primary "Save" (rightmost) -->
      <MpButtonGroup class="erp-action-footer si-form-footer">
        <MpButton variant="ghost" is-rounded @click="onCancel">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="onSave">{{ t('Save') }}</MpButton>
      </MpButtonGroup>

    </div><!-- /si-form-stage -->
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
  background: var(--mp-background-neutral-subtle);
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
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-6);
}

.si-dashed-divider {
  padding-bottom: var(--mp-spacing-5);
  border-bottom: 1px dashed var(--mp-border-default);
}

/* ── Header section — fixed-width columns that wrap, never stretch ── */
.si-header2 { display: flex; align-items: flex-start; flex-wrap: wrap; gap: 16px 24px; }
.si-header2-col {
  flex: 0 0 var(--si-field-wide);
  min-width: 0;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
}

.si-field { min-width: 0; }
.si-datepicker { width: 100%; }
.si-datepicker :deep(.mp-datepicker__root) { width: 100%; }

/* ── Line items ── */
.si-items-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.si-items-error-banner { margin-bottom: var(--mp-spacing-2); }
.si-items-scroll { overflow-x: auto; }

.si-items-table {
  width: 100%; min-width: 720px;
  table-layout: fixed; border-collapse: collapse; border-spacing: 0;
}
.si-col-product  { width: 320px; }
.si-col-desc     { width: auto; }
.si-col-qty      { width: 96px; }
.si-col-unit     { width: 140px; }
.si-col-del      { width: 52px; }

.si-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: var(--mp-letter-spacings-normal);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.si-th--del { padding: 0; }

.si-td {
  height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: middle;
}
.si-td--border { border-right: 1px solid var(--mp-border-default); }
.si-td--del  { padding: 0; text-align: center; }
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
.si-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); }
.si-select--product :deep(.mp-input__control)::placeholder { color: var(--mp-text-placeholder); }
.si-quickadd :deep(*), .si-quickadd { color: var(--mp-colors-text-link, #165082); }

/* Line-item validation — cell tint + inset red underline + tooltip. */
.si-td--error { background: var(--mp-background-danger-subtle, #fef2f2); box-shadow: inset 0 -1px 0 0 var(--mp-border-danger, #dc2626); }
.si-td--error :deep([class*='input']) { background: transparent; }
.si-error-tooltip-wrap { display: block; width: 100%; }
.si-error-tooltip-wrap :deep([class*='tooltip__trigger']) { display: block; width: 100%; }

.si-del-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px) !important; height: var(--mp-sizes-8, 32px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-sm) !important;
  cursor: pointer; color: var(--mp-text-secondary); flex-shrink: 0;
}
.si-del-btn:hover { background: var(--mp-background-neutral) !important; color: var(--mp-text-danger, #dc2626); }

/* ── Footer ── */
.si-form-footer {
  display: flex; align-items: center; justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding-top: var(--mp-spacing-4);
}
</style>
