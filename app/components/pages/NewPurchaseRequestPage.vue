<!-- prod-parity-aligned: jurnal-transaction-frontend/src/modules/purchase-requests/views/PurchaseRequestCreateView.vue + PurchaseRequestEditView.vue + components/form/* -->
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
  MpButton, MpButtonGroup, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpTextarea,
  MpDatePicker, MpAutocomplete, MpTooltip, MpInputTag, MpUpload, MpUploadList,
  MpIcon, MpTextlink, toast, css,
} from '@mekari/pixel3'
import type { DataInterface } from '@mekari/pixel3'
import {
  products, purchaseRequests,
  WAREHOUSES, UNIT_OPTIONS,
  addPurchaseRequest, updatePurchaseRequest, getPurchaseRequest,
} from '~/data'
import type { PurchaseRequestLine, UrgencyLevel } from '~/data/types'
import ProductCell from '~/components/patterns/ProductCell.vue'

// /purchase-requests/new → create; /purchase-requests/:id/edit → edit (prod PurchaseRequestEditView).
const props = defineProps<{ orderId?: string }>()
const editSource = props.orderId && props.orderId !== 'new' ? getPurchaseRequest(props.orderId) ?? null : null
const isEdit = !!editSource

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

// ── Header fields ─────────────────────────────────────────────────────────────
const procurementStaff = ref(editSource?.procurementStaff ?? '')
const staffError       = ref(false)
const requestDate      = ref(isoToDMY(editSource?.date ?? todayISO()))
const dateError        = ref(false)
const budgetYear       = ref(String(new Date().getFullYear()))
const requestor        = ref('')
const requiredDate     = ref(isoToDMY(editSource?.requiredDate ?? ''))
const urgency          = ref(editSource ? editSource.urgency.charAt(0).toUpperCase() + editSource.urgency.slice(1) : 'Medium')
const urgencyError     = ref(false)
const warehouse        = ref('')
const tagsList         = ref<DataInterface[]>((editSource?.tags ?? []).map((v, i) => ({ text: v, id: `${i}-${v}`, value: v, isInvalid: false, isReadOnly: false })))
function onTagsChange(data: DataInterface[]) { tagsList.value = data }
const message = ref('')
const memo    = ref('')
const attachments = ref<{ name: string; sizeKB: number }[]>([])
function onFilesChange(e: Event) {
  const files = (e.target as HTMLInputElement | null)?.files
  if (!files) return
  for (const f of Array.from(files)) attachments.value.push({ name: f.name, sizeKB: Math.round(f.size / 1024 * 10) / 10 })
}
function removeAttachment(idx: number) { attachments.value.splice(idx, 1) }

const URGENCY_OPTIONS = ['Low', 'Medium', 'High']
const BUDGET_YEARS = ['2025', '2026', '2027']

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
const items = ref<LineItem[]>((editSource?.lines ?? []).map(l => ({
  _key: ++_seq, product: l.product, sku: l.sku, description: l.description, qty: l.requestedQty,
  unit: l.unit, unitCost: l.unitCost, availableQty: l.availableQty, productError: false, qtyError: false,
})))

function removeItem(key: number) { items.value = items.value.filter(it => it._key !== key) }

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
  if (!requestDate.value) { dateError.value = true; ok = false }
  if (!urgency.value) { urgencyError.value = true; ok = false }
  noItemsError.value = !items.value.length
  if (!items.value.length) ok = false

  items.value.forEach(it => {
    if (!it.product) { it.productError = true; ok = false }
    if (!(it.qty > 0)) { it.qtyError = true; ok = false }
  })
  return ok
}

function nextRequestNumber(): number {
  return purchaseRequests.reduce((max, r) => Math.max(max, r.number), 90009) + 1
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
  const header = {
    date: dmyToIso(requestDate.value),
    procurementStaff: procurementStaff.value.trim(),
    requiredDate: dmyToIso(requiredDate.value || requestDate.value),
    totalProducts: lines.length,
    urgency: urgency.value.toLowerCase() as UrgencyLevel,
    tags: tagsList.value.map(tg => String(tg.value)),
    lines,
  }
  if (editSource) {
    updatePurchaseRequest(editSource.id, header)
    toast.notify({ variant: 'success', title: t('Purchase request saved'), rootProps: { class: 'toast-enterprise' } })
    router.push(`/purchase-requests/${editSource.id}`)
    return
  }
  const created = addPurchaseRequest({ ...header, number: nextRequestNumber(), status: 'open' })
  toast.notify({ variant: 'success', title: t('Purchase request saved'), rootProps: { class: 'toast-enterprise' } })
  router.push(`/purchase-requests/${created.id}`)
}
</script>

<template>
  <div class="si-form-page">

    <!-- ── Fixed header bar ── -->
    <header class="si-form-bar">
      <div class="si-form-bar-left">
        <MpTextlink id="si-crumb" as="a" class="si-crumb" @click.prevent="onCancel">{{ t('Purchase requests') }}</MpTextlink>
        <h1 class="si-form-h1">{{ isEdit ? t('Edit purchase request') : t('New purchase request') }}</h1>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="si-form-stage">

      <!-- ── Header row 1 (prod): Procurement staff | Transaction date | Related budget year | Transaction no. | Tags ── -->
      <section class="si-header2 si-dashed-divider">
        <div class="si-header2-col">
          <MpFormControl id="f-staff" class="si-field" is-required :is-invalid="staffError">
            <MpFormLabel>{{ t('Procurement staff') }}</MpFormLabel>
            <MpInput
              id="f-staff-inp" v-model="procurementStaff" is-full-width
              :placeholder="t('Select procurement staff')" :is-invalid="staffError"
              @update:model-value="staffError = false"
            />
            <MpFormErrorMessage>{{ t('Procurement staff is required') }}</MpFormErrorMessage>
          </MpFormControl>
        </div>

        <div class="si-header2-col">
          <MpFormControl id="f-request-date" class="si-field" is-required :is-invalid="dateError">
            <MpFormLabel>{{ t('Transaction date') }}</MpFormLabel>
            <MpDatePicker id="f-request-date-inp" v-model="requestDate" class="si-datepicker" format="DD/MM/YYYY" value-type="format" use-portal placeholder="DD/MM/YYYY" @update:model-value="dateError = false" />
            <MpFormErrorMessage>{{ t('Transaction date is required') }}</MpFormErrorMessage>
          </MpFormControl>
        </div>

        <div class="si-header2-col">
          <MpFormControl id="f-budget-year" class="si-field">
            <MpFormLabel>{{ t('Related budget year') }}</MpFormLabel>
            <MpAutocomplete id="f-budget-year-inp" v-model="budgetYear" :data="BUDGET_YEARS" use-portal is-full-width />
          </MpFormControl>
        </div>

        <div class="si-header2-col">
          <MpFormControl id="f-tx-no" class="si-field">
            <MpFormLabel>{{ t('Transaction no.') }}</MpFormLabel>
            <MpInput id="f-tx-no-inp" :placeholder="isEdit && editSource ? String(editSource.number) : t('Auto')" is-disabled is-full-width />
          </MpFormControl>
        </div>

        <div class="si-header2-col">
          <MpFormControl id="f-tags" class="si-field">
            <MpFormLabel>{{ t('Tags') }}</MpFormLabel>
            <MpInputTag id="f-tags-inp" :data="tagsList" :placeholder="t('Select tags')" @change="onTagsChange" />
          </MpFormControl>
        </div>
      </section>

      <!-- ── Header row 2 (prod): Requestor | Required date | Urgency level; Warehouse is local-only (kept) ── -->
      <section class="si-header2 si-dashed-divider">
        <div class="si-header2-col">
          <MpFormControl id="f-requestor" class="si-field">
            <MpFormLabel>{{ t('Requestor') }}</MpFormLabel>
            <MpInput id="f-requestor-inp" v-model="requestor" :placeholder="t('Requestor')" is-full-width />
          </MpFormControl>
        </div>

        <div class="si-header2-col">
          <MpFormControl id="f-required-date" class="si-field">
            <MpFormLabel>{{ t('Required date') }}</MpFormLabel>
            <MpDatePicker id="f-required-date-inp" v-model="requiredDate" class="si-datepicker" format="DD/MM/YYYY" value-type="format" use-portal :placeholder="t('Select required date')" />
          </MpFormControl>
        </div>

        <div class="si-header2-col">
          <MpFormControl id="f-urgency" class="si-field" is-required :is-invalid="urgencyError">
            <MpFormLabel>{{ t('Urgency level') }}</MpFormLabel>
            <MpAutocomplete id="f-urgency-inp" v-model="urgency" :data="URGENCY_OPTIONS" use-portal is-full-width :placeholder="t('Urgency level')" @update:model-value="urgencyError = false" />
            <MpFormErrorMessage>{{ t('Urgency level is required') }}</MpFormErrorMessage>
          </MpFormControl>
        </div>

        <div class="si-header2-col">
          <MpFormControl id="f-warehouse" class="si-field">
            <MpFormLabel>{{ t('Warehouse') }}</MpFormLabel>
            <MpAutocomplete id="f-warehouse-inp" v-model="warehouse" :data="WAREHOUSES" use-portal is-clearable is-full-width :placeholder="t('Select warehouse')" />
          </MpFormControl>
        </div>
      </section>

      <!-- ── Line items ── -->
      <section class="si-items-section">
        <MpBanner v-if="hasLineItemErrors || noItemsError" id="si-lineitems-error-banner" variant="danger" align-items="center" class="si-items-error-banner">
          <MpBannerIcon id="si-lineitems-error-banner-icon" />
          <MpBannerTitle>{{ t('Failed to save') }}</MpBannerTitle>
          <MpBannerDescription>{{ noItemsError && !hasLineItemErrors ? t('At least one product is required') : t('The transaction contains incomplete or invalid data. Review the highlighted fields.') }}</MpBannerDescription>
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
                <th class="si-th">{{ t('Requested qty') }}</th>
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
                    :label="t('Requested quantity must be greater than 0')" placement="top" use-portal
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

      <!-- ── Message / Memo / Attachment (prod TransactionBottomLeft) ── -->
      <section class="si-bottom-section">
        <div class="si-notes-col">
          <MpFormControl id="f-message" class="si-note-field">
            <MpFormLabel>{{ t('Message') }}</MpFormLabel>
            <MpTextarea id="f-message-inp" v-model="message" is-full-width />
            <span class="si-field-caption">{{ t('This will be shared with your vendor') }}</span>
          </MpFormControl>

          <MpFormControl id="f-memo" class="si-note-field">
            <MpFormLabel>{{ t('Memo') }}</MpFormLabel>
            <MpTextarea id="f-memo-inp" v-model="memo" is-full-width />
            <span class="si-field-caption">{{ t('Only visible to you and your team') }}</span>
          </MpFormControl>

          <div class="si-attachment-section">
            <span class="si-attachment-label">{{ t('Attachment') }}</span>
            <MpUpload id="f-attachment" :button-text="t('Choose file')" :placeholder="t('or drag and drop here')" is-multiple is-full-width @change="onFilesChange" />
            <p class="si-field-caption">{{ t('Files must be in XLS, DOC, PDF, JPG, PNG, or ZIP with a maximum of 10 MB and 5 files per transaction') }}</p>
            <div v-if="attachments.length" class="si-attachment-list">
              <MpUploadList
                v-for="(a, idx) in attachments" :key="a.name + idx"
                :title="a.name" :subtitle="`${a.sizeKB} KB`" icon-name="doc"
                status="success" is-show-remove-button @remove="removeAttachment(idx)"
              />
            </div>
          </div>
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
/* Bottom notes (same metrics as NewPurchaseQuotePage) */
.si-bottom-section { display: flex; align-items: flex-start; gap: var(--mp-spacing-6); }
.si-notes-col { display: flex; flex-direction: column; gap: var(--mp-spacing-5); width: 432px; flex-shrink: 0; }
.si-note-field { display: flex; flex-direction: column; }
.si-field-caption { font-size: var(--mp-font-sizes-xs); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.si-attachment-section { display: flex; flex-direction: column; gap: var(--mp-spacing-1); width: var(--si-field-wide); }
.si-attachment-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.si-attachment-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-1); }
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
