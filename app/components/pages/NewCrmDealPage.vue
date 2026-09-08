<script setup lang="ts">
/**
 * NewCrmDealPage — the full "detailed" Deal form as its own PAGE (not a drawer /
 * modal), per the PRD: quick-create lives in a drawer; the complete form (products,
 * pricing, contact, currency, notes) opens as a page at /crm/deals/new (create) or
 * /crm/deals/:id/edit (edit).
 *
 * Full-bleed shell mirrors CrmDealDetailPage: `.detail-bar` (breadcrumb + title) +
 * `.detail-stage`. Create prefills from the quick drawer's hand-off (`dealDraftSeed`)
 * when present. Footer actions are always present, never disabled; errors inline.
 */
import { ref, reactive, computed, onMounted } from 'vue'
import {
  MpIcon, MpButton, MpButtonGroup, MpInput, MpTextarea, MpInputTag, MpFormControl, MpFormLabel, MpFormErrorMessage,
  type DataInterface,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { formatMoney } from '~/utils/currency'
import { successToast } from '~/utils/toasts'
import {
  crmCustomers, addCrmCustomer, CRM_OWNERS, CRM_CURRENT_USER, DEAL_STAGES, DEAL_CURRENCIES,
  crmProducts, crmRelatedPeopleOptions, defaultDealStage, dealDraftSeed,
  getDeal, createDeal, updateDeal, dealCalculatedValue, lineSubtotal,
  type DealStage, type DealCurrency, type DealLineItem, type AdjustmentType, type DealInput,
} from '~/data/crm'

// Route: orderId = 'new' (create) or an existing deal id (edit via /crm/deals/:id/edit).
const props = defineProps<{ orderId: string }>()
const router = useRouter()
const isEdit = computed(() => props.orderId !== 'new')
const editing = computed(() => (isEdit.value ? getDeal(props.orderId) : undefined))

interface Draft {
  name: string; customerId: string; stage: DealStage; owner: string
  relatedPeople: string[]; referenceNumber: string; description: string; expectedCloseDate: string
  picName: string; phones: string[]; email: string
  products: DealLineItem[]
  taxType: AdjustmentType; tax: number; orderDiscountType: AdjustmentType; orderDiscount: number
  shippingFee: number; otherExpense: number
  currency: DealCurrency; exchangeRate: number
  value: number; valueOverridden: boolean
  notes: string
}
function blankDraft(): Draft {
  return {
    name: '', customerId: '', stage: defaultDealStage(), owner: CRM_CURRENT_USER, relatedPeople: [],
    referenceNumber: '', description: '', expectedCloseDate: '',
    picName: '', phones: [], email: '',
    products: [],
    taxType: 'percentage', tax: 0, orderDiscountType: 'fixed', orderDiscount: 0, shippingFee: 0, otherExpense: 0,
    currency: 'IDR', exchangeRate: 1, value: 0, valueOverridden: false, notes: '',
  }
}
const f = reactive<Draft>(blankDraft())

onMounted(() => {
  const d = editing.value
  if (isEdit.value && d) {
    Object.assign(f, {
      name: d.name, customerId: d.customerId, stage: d.stage, owner: d.owner,
      relatedPeople: [...(d.relatedPeople ?? [])], referenceNumber: d.referenceNumber ?? '',
      description: d.description ?? '', expectedCloseDate: d.expectedCloseDate ?? '',
      picName: d.picName ?? '', phones: [...(d.phones ?? [])], email: d.email ?? '',
      products: (d.products ?? []).map((p) => ({ ...p })),
      taxType: d.taxType ?? 'percentage', tax: d.tax ?? 0,
      orderDiscountType: d.orderDiscountType ?? 'fixed', orderDiscount: d.orderDiscount ?? 0,
      shippingFee: d.shippingFee ?? 0, otherExpense: d.otherExpense ?? 0,
      currency: d.currency, exchangeRate: d.exchangeRate,
      value: d.value, valueOverridden: d.valueOverridden ?? false, notes: d.notes ?? '',
    })
  } else if (dealDraftSeed.value) {
    // Hand-off from the quick-create drawer.
    const s = dealDraftSeed.value
    if (s.name) f.name = s.name
    if (s.customerId) f.customerId = s.customerId
    if (s.stage) f.stage = s.stage
    if (s.owner) f.owner = s.owner
    dealDraftSeed.value = null
  }
})

// ── Customer select + quick create ──
const customerOptions = computed(() =>
  crmCustomers.map((c) => ({ value: c.id, label: c.company })).sort((a, b) => a.label.localeCompare(b.label)),
)
const selectedCustomer = computed(() => crmCustomers.find((c) => c.id === f.customerId))

const showNewCustomer = ref(false)
const newCustomerName = ref('')
const newCustomerError = ref('')
function createQuickCustomer() {
  const name = newCustomerName.value.trim()
  if (!name) { newCustomerError.value = 'Customer name is required.'; return }
  const c = addCrmCustomer({ company: name, contact: '', email: '', phone: '', city: '', segment: 'Retail', owner: f.owner, lifecycle: 'Lead' })
  selectCustomer(c.id)
  showNewCustomer.value = false
  newCustomerName.value = ''
  newCustomerError.value = ''
}

// Company-PIC prefill (one-time, Deal-only).
const pendingCustomer = ref('')
function hasContactData() { return !!(f.picName || f.email || f.phones.length) }
function prefillFrom(id: string) {
  const c = crmCustomers.find((x) => x.id === id)
  f.picName = c?.contact ?? ''
  f.phones = c?.phone ? [c.phone] : []
  f.email = c?.email ?? ''
}
function selectCustomer(id: string) {
  if (id === f.customerId) return
  if (hasContactData()) { pendingCustomer.value = id; return }
  f.customerId = id
  prefillFrom(id)
}
function replaceContact() { f.customerId = pendingCustomer.value; prefillFrom(pendingCustomer.value); pendingCustomer.value = '' }
function keepContact() { f.customerId = pendingCustomer.value; pendingCustomer.value = '' }

// ── Related people + phones (MpInputTag) ──
function toTagData(arr: string[]): DataInterface[] { return arr.map((s) => ({ id: s, text: s, value: s, isInvalid: false, isReadOnly: false })) }
const relatedData = computed<DataInterface[]>(() => toTagData(f.relatedPeople))
const relatedSuggestions = computed<string[]>(() => crmRelatedPeopleOptions.value)
function onRelatedChange(data: DataInterface[]) { f.relatedPeople = data.map((d) => String(d.value ?? d.text)).slice(0, 10) }
const phoneData = computed<DataInterface[]>(() => toTagData(f.phones))
function onPhoneChange(data: DataInterface[]) { f.phones = data.map((d) => String(d.value ?? d.text)).slice(0, 5) }

// ── Products ──
const productOptions = computed(() => crmProducts.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name })))
const addProductId = ref('')
function addProductLine(id: string) {
  const p = crmProducts.find((x) => x.id === id)
  if (!p) return
  f.products.push({ productId: p.id, productName: p.name, unit: p.unit, quantity: 1, originalPrice: p.price, discountType: 'none', discount: 0 })
  addProductId.value = ''
  syncCalcValue()
}
function removeProductLine(i: number) { f.products.splice(i, 1); syncCalcValue() }
const DISCOUNT_TYPES = [
  { value: 'none', label: 'No discount' }, { value: 'percentage', label: 'Percentage (%)' }, { value: 'fixed', label: 'Fixed amount' },
]
const ADJ_TYPES = [{ value: 'percentage', label: 'Percentage (%)' }, { value: 'fixed', label: 'Fixed amount' }]

// ── Commercial calculation ──
const calculated = computed(() => dealCalculatedValue(f))
function syncCalcValue() { if (!f.valueOverridden) f.value = calculated.value }
function overrideValue(v: unknown) { f.valueOverridden = true; f.value = Math.max(0, Number(v) || 0) }
function resetCalculated() { f.valueOverridden = false; f.value = calculated.value }
const money = (n: number) => formatMoney(n, f.currency)

// ── Currency change (destructive confirm) ──
const pendingCurrency = ref<DealCurrency | ''>('')
function onCurrencyPick(v: string) {
  const cur = v as DealCurrency
  if (cur === f.currency) return
  const hasValues = f.products.length > 0 || !!f.tax || !!f.orderDiscount || !!f.shippingFee || !!f.otherExpense || f.valueOverridden
  if (hasValues) { pendingCurrency.value = cur; return }
  applyCurrency(cur)
}
function applyCurrency(cur: DealCurrency) { f.currency = cur; f.exchangeRate = cur === 'IDR' ? 1 : (f.exchangeRate && f.exchangeRate !== 1 ? f.exchangeRate : 0) }
function confirmCurrency() {
  f.products = []; f.tax = 0; f.orderDiscount = 0; f.shippingFee = 0; f.otherExpense = 0
  f.valueOverridden = false; f.value = 0
  applyCurrency(pendingCurrency.value as DealCurrency)
  pendingCurrency.value = ''
}
function cancelCurrency() { pendingCurrency.value = '' }

// ── Validation + save ──
const errors = ref<Record<string, string>>({})
const formError = ref('')
function validate(): boolean {
  const e: Record<string, string> = {}
  const name = f.name.trim()
  if (!name) e.name = 'Deal name is required.'
  else if (name.length > 100) e.name = 'Deal name must be 100 characters or fewer.'
  if (!f.customerId) e.customer = 'Select a customer.'
  if (!f.owner) e.owner = 'Assign a deal owner.'
  if (f.description.length > 500) e.description = 'Description must be 500 characters or fewer.'
  if (f.notes.length > 2000) e.notes = 'Notes must be 2,000 characters or fewer.'
  if (f.relatedPeople.length > 10) e.related = 'Up to 10 related people.'
  if (f.currency !== 'IDR' && !(f.exchangeRate > 0)) e.rate = 'Enter a positive exchange rate for a foreign currency.'
  for (const [i, li] of f.products.entries()) {
    if (!(li.quantity > 0)) { e.products = `Line ${i + 1}: quantity must be greater than 0.`; break }
    if (li.originalPrice < 0) { e.products = `Line ${i + 1}: price cannot be negative.`; break }
    if (li.discountType === 'percentage' && (li.discount < 0 || li.discount > 100)) { e.products = `Line ${i + 1}: discount % must be 0–100.`; break }
    if (li.discountType === 'fixed' && li.discount > li.originalPrice) { e.products = `Line ${i + 1}: fixed discount can't exceed the price.`; break }
  }
  if (f.products.length > 100) e.products = 'A deal can have at most 100 product lines.'
  errors.value = e
  return Object.keys(e).length === 0
}
function buildInput(): DealInput {
  return {
    name: f.name.trim(), customerId: f.customerId, company: selectedCustomer.value?.company ?? '',
    stage: f.stage, owner: f.owner, value: f.value, valueOverridden: f.valueOverridden,
    referenceNumber: f.referenceNumber.trim() || undefined,
    description: f.description.trim() || undefined,
    relatedPeople: f.relatedPeople.length ? [...f.relatedPeople] : undefined,
    picName: f.picName.trim() || undefined,
    phones: f.phones.length ? [...f.phones] : undefined,
    email: f.email.trim() || undefined,
    products: f.products.length ? f.products.map((p) => ({ ...p })) : undefined,
    taxType: f.tax ? f.taxType : undefined, tax: f.tax || undefined,
    orderDiscountType: f.orderDiscount ? f.orderDiscountType : undefined, orderDiscount: f.orderDiscount || undefined,
    shippingFee: f.shippingFee || undefined, otherExpense: f.otherExpense || undefined,
    currency: f.currency, exchangeRate: f.currency === 'IDR' ? 1 : f.exchangeRate,
    notes: f.notes.trim() || undefined, expectedCloseDate: f.expectedCloseDate,
  }
}
function save() {
  if (!validate()) { formError.value = 'Please fix the highlighted fields before saving.'; return }
  formError.value = ''
  const input = buildInput()
  const saved = isEdit.value && editing.value ? updateDeal(editing.value.id, input) : createDeal(input, CRM_CURRENT_USER)
  if (saved) {
    successToast(isEdit.value ? 'Deal saved' : 'Deal created')
    router.push(`/crm/deals/${saved.id}`)
  }
}
function cancel() {
  if (isEdit.value) router.push(`/crm/deals/${props.orderId}`)
  else router.push('/crm')
}
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" type="button" @click="router.push('/crm')">Deals</button>
        <h1 class="detail-title">{{ isEdit ? 'Edit deal' : 'New deal' }}</h1>
      </div>
      <div class="dd-bar-actions">
        <MpButtonGroup>
          <MpButton variant="secondary" is-rounded @click="cancel">Cancel</MpButton>
          <MpButton variant="primary" is-rounded @click="save">{{ isEdit ? 'Save changes' : 'Save' }}</MpButton>
        </MpButtonGroup>
      </div>
    </header>

    <div class="detail-stage">
      <div class="cdf-form">
        <!-- ── Deal overview ── -->
        <section class="cdf-section">
          <h2 class="cdf-section-title">Deal overview</h2>
          <MpFormControl id="cdf-name-fc" :is-invalid="!!errors.name">
            <MpFormLabel>Deal name</MpFormLabel>
            <MpInput id="cdf-name" v-model="f.name" is-full-width maxlength="120" :is-invalid="!!errors.name" @update:model-value="errors.name = ''" />
            <MpFormErrorMessage v-if="errors.name">{{ errors.name }}</MpFormErrorMessage>
          </MpFormControl>

          <div class="cdf-row">
            <div class="cdf-field">
              <span class="cdf-label">Stage</span>
              <ErpFilterSelect id="cdf-stage" :model-value="f.stage" placeholder="Stage" :options="[...DEAL_STAGES]" :is-clearable="false" width="100%" @update:model-value="(v: string) => (f.stage = v as DealStage)" />
            </div>
            <div class="cdf-field">
              <span class="cdf-label">Deal owner</span>
              <ErpFilterSelect id="cdf-owner" :model-value="f.owner" placeholder="Deal owner" :options="[...CRM_OWNERS]" :is-clearable="false" width="100%" @update:model-value="(v: string) => (f.owner = v)" />
              <span v-if="errors.owner" class="cdf-err">{{ errors.owner }}</span>
            </div>
          </div>

          <div class="cdf-field">
            <div class="cdf-label-row">
              <span class="cdf-label">Customer</span>
              <button type="button" class="cdf-link" @click="showNewCustomer = !showNewCustomer">{{ showNewCustomer ? 'Cancel' : '+ New customer' }}</button>
            </div>
            <ErpFilterSelect id="cdf-customer" :model-value="f.customerId" placeholder="Select a company" :options="customerOptions" :is-clearable="false" width="100%" @update:model-value="selectCustomer" />
            <span v-if="errors.customer" class="cdf-err">{{ errors.customer }}</span>
            <div v-if="showNewCustomer" class="cdf-quickcreate">
              <MpInput id="cdf-newcust" v-model="newCustomerName" is-full-width aria-label="New customer name" @update:model-value="newCustomerError = ''" @keydown.enter="createQuickCustomer" />
              <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="createQuickCustomer">Create</button>
              <span v-if="newCustomerError" class="cdf-err cdf-err--block">{{ newCustomerError }}</span>
            </div>
            <div v-if="pendingCustomer" class="cdf-inline-confirm">
              <span>Replace contact information from this customer’s PIC?</span>
              <div class="cdf-inline-actions">
                <button type="button" class="cdf-link" @click="keepContact">Keep existing</button>
                <button type="button" class="cdf-link cdf-link--strong" @click="replaceContact">Replace</button>
              </div>
            </div>
          </div>

          <div class="cdf-row">
            <div class="cdf-field">
              <span class="cdf-label">Reference number <span class="cdf-opt">Optional</span></span>
              <MpInput id="cdf-ref" v-model="f.referenceNumber" is-full-width maxlength="100" />
            </div>
            <div class="cdf-field">
              <span class="cdf-label">Due date <span class="cdf-opt">Optional</span></span>
              <MpInput id="cdf-due" v-model="f.expectedCloseDate" type="date" is-full-width />
            </div>
          </div>

          <div class="cdf-field">
            <span class="cdf-label">Related people <span class="cdf-opt">Up to 10</span></span>
            <MpInputTag id="cdf-related" :data="relatedData" :suggestions="relatedSuggestions" :is-show-suggestions="true" :is-enable-create-new-tag="false" :is-show-icon-chevron-down="true" @change="onRelatedChange" />
            <span v-if="errors.related" class="cdf-err">{{ errors.related }}</span>
          </div>

          <div class="cdf-field">
            <span class="cdf-label">Description <span class="cdf-opt">Optional</span></span>
            <MpTextarea id="cdf-desc" v-model="f.description" is-full-width :rows="2" maxlength="500" :is-invalid="!!errors.description" @update:model-value="errors.description = ''" />
            <span v-if="errors.description" class="cdf-err">{{ errors.description }}</span>
          </div>
        </section>

        <!-- ── Contact information ── -->
        <section class="cdf-section">
          <h2 class="cdf-section-title">Contact information</h2>
          <p class="cdf-section-help">Prefilled from the customer’s Company PIC. Edits stay on this deal and never change the customer.</p>
          <div class="cdf-field">
            <span class="cdf-label">PIC name <span class="cdf-opt">Optional</span></span>
            <MpInput id="cdf-pic" v-model="f.picName" is-full-width />
          </div>
          <div class="cdf-row">
            <div class="cdf-field">
              <span class="cdf-label">Email <span class="cdf-opt">Optional</span></span>
              <MpInput id="cdf-email" v-model="f.email" type="email" is-full-width />
            </div>
            <div class="cdf-field">
              <span class="cdf-label">Phone numbers <span class="cdf-opt">Up to 5</span></span>
              <MpInputTag id="cdf-phones" :data="phoneData" :suggestions="[]" :is-show-suggestions="false" :is-enable-create-new-tag="true" @change="onPhoneChange" />
            </div>
          </div>
        </section>

        <!-- ── Products and value ── -->
        <section class="cdf-section">
          <h2 class="cdf-section-title">Products and value</h2>
          <div v-if="f.products.length" class="cdf-linetable">
            <div class="cdf-linehead">
              <span>Product</span><span class="cdf-num">Qty</span><span class="cdf-num">Original price</span><span>Discount</span><span class="cdf-num">Subtotal</span><span />
            </div>
            <div v-for="(li, i) in f.products" :key="i" class="cdf-linerow">
              <span class="cdf-linename">{{ li.productName }}<span class="cdf-lineunit">{{ li.unit }}</span></span>
              <MpInput :id="`cdf-qty-${i}`" type="number" :model-value="li.quantity" is-full-width class="cdf-num-input" aria-label="Quantity" @update:model-value="(v) => { li.quantity = Number(v); syncCalcValue() }" />
              <MpInput :id="`cdf-price-${i}`" type="number" :model-value="li.originalPrice" is-full-width class="cdf-num-input" aria-label="Original price" @update:model-value="(v) => { li.originalPrice = Number(v); syncCalcValue() }" />
              <div class="cdf-linediscount">
                <ErpFilterSelect :id="`cdf-disc-${i}`" :model-value="li.discountType" placeholder="Discount" :options="DISCOUNT_TYPES" :is-clearable="false" width="130px" @update:model-value="(v: string) => { li.discountType = v as any; syncCalcValue() }" />
                <MpInput v-if="li.discountType !== 'none'" :id="`cdf-discamt-${i}`" type="number" :model-value="li.discount" is-full-width class="cdf-num-input cdf-num-input--disc" aria-label="Discount amount" @update:model-value="(v) => { li.discount = Number(v); syncCalcValue() }" />
              </div>
              <span class="cdf-num cdf-subtotal">{{ money(lineSubtotal(li)) }}</span>
              <button type="button" class="cdf-line-remove" aria-label="Remove line" @click="removeProductLine(i)"><MpIcon name="delete" size="sm" /></button>
            </div>
          </div>
          <p v-else class="cdf-empty-lines">No products yet. Add a line to build the deal value.</p>

          <div class="cdf-addline">
            <ErpFilterSelect id="cdf-addproduct" :model-value="addProductId" placeholder="+ Add product" :options="productOptions" width="280px" @update:model-value="addProductLine" />
          </div>
          <span v-if="errors.products" class="cdf-err cdf-err--block">{{ errors.products }}</span>

          <div class="cdf-adjgrid">
            <div class="cdf-field">
              <span class="cdf-label">Tax</span>
              <div class="cdf-adjrow">
                <ErpFilterSelect id="cdf-taxtype" :model-value="f.taxType" placeholder="Type" :options="ADJ_TYPES" :is-clearable="false" width="150px" @update:model-value="(v: string) => (f.taxType = v as AdjustmentType)" />
                <MpInput id="cdf-tax" type="number" :model-value="f.tax" is-full-width class="cdf-num-input" aria-label="Tax amount" @update:model-value="(v) => (f.tax = Number(v))" />
              </div>
            </div>
            <div class="cdf-field">
              <span class="cdf-label">Order discount</span>
              <div class="cdf-adjrow">
                <ErpFilterSelect id="cdf-odtype" :model-value="f.orderDiscountType" placeholder="Type" :options="ADJ_TYPES" :is-clearable="false" width="150px" @update:model-value="(v: string) => (f.orderDiscountType = v as AdjustmentType)" />
                <MpInput id="cdf-od" type="number" :model-value="f.orderDiscount" is-full-width class="cdf-num-input" aria-label="Order discount amount" @update:model-value="(v) => (f.orderDiscount = Number(v))" />
              </div>
            </div>
            <div class="cdf-field">
              <span class="cdf-label">Shipping fee</span>
              <MpInput id="cdf-ship" type="number" :model-value="f.shippingFee" is-full-width class="cdf-num-input" @update:model-value="(v) => (f.shippingFee = Number(v))" />
            </div>
            <div class="cdf-field">
              <span class="cdf-label">Other expense</span>
              <MpInput id="cdf-other" type="number" :model-value="f.otherExpense" is-full-width class="cdf-num-input" @update:model-value="(v) => (f.otherExpense = Number(v))" />
            </div>
            <div class="cdf-field">
              <span class="cdf-label">Currency</span>
              <ErpFilterSelect id="cdf-currency" :model-value="f.currency" placeholder="Currency" :options="[...DEAL_CURRENCIES]" :is-clearable="false" width="100%" @update:model-value="onCurrencyPick" />
            </div>
            <div v-if="f.currency !== 'IDR'" class="cdf-field">
              <span class="cdf-label">Exchange rate</span>
              <MpInput id="cdf-rate" type="number" :model-value="f.exchangeRate" is-full-width class="cdf-num-input" :is-invalid="!!errors.rate" @update:model-value="(v) => (f.exchangeRate = Number(v))" />
              <span v-if="errors.rate" class="cdf-err">{{ errors.rate }}</span>
            </div>
          </div>

          <div v-if="pendingCurrency" class="cdf-inline-confirm cdf-inline-confirm--warn">
            <span>Changing currency to <strong>{{ pendingCurrency }}</strong> clears all product lines and commercial values. Continue?</span>
            <div class="cdf-inline-actions">
              <button type="button" class="cdf-link" @click="cancelCurrency">Cancel</button>
              <button type="button" class="cdf-link cdf-link--strong" @click="confirmCurrency">Change currency</button>
            </div>
          </div>

          <div class="cdf-valuebox">
            <div class="cdf-valrow"><span>Calculated value</span><span class="cdf-num">{{ money(calculated) }}</span></div>
            <div class="cdf-valrow cdf-valrow--expected">
              <span>Expected deal value
                <button v-if="f.valueOverridden" type="button" class="cdf-link cdf-reset" @click="resetCalculated">Reset to calculated</button>
              </span>
              <MpInput id="cdf-expected" type="number" :model-value="f.value" class="cdf-num-input cdf-num-input--value" aria-label="Expected deal value" @update:model-value="overrideValue" />
            </div>
          </div>
        </section>

        <!-- ── Notes ── -->
        <section class="cdf-section">
          <h2 class="cdf-section-title">Notes</h2>
          <MpTextarea id="cdf-notes" v-model="f.notes" is-full-width :rows="3" maxlength="2000" :is-invalid="!!errors.notes" />
          <span v-if="errors.notes" class="cdf-err">{{ errors.notes }}</span>
        </section>

        <p v-if="formError" class="cdf-form-error">{{ formError }}</p>

        <div class="cdf-page-actions">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="cancel">Cancel</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="save">{{ isEdit ? 'Save changes' : 'Save' }}</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.dd-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6); }
.cdf-form { max-width: 720px; display: flex; flex-direction: column; gap: var(--mp-spacing-6); }

.cdf-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.cdf-section-title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); padding-bottom: var(--mp-spacing-2); border-bottom: 1px solid var(--mp-border-default); }
.cdf-section-help { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.cdf-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }
.cdf-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.cdf-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cdf-label-row { display: flex; align-items: center; justify-content: space-between; }
.cdf-opt { font-weight: var(--mp-font-weights-regular); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Numeric MpInput cells — right-align the value (Pixel MpInput ships its own
   border/height/focus, so no border overrides here — rule/token-no-raw-html). */
.cdf-num-input :deep(input) { text-align: right; font-variant-numeric: tabular-nums; }
.cdf-num-input--disc { width: 84px; }
.cdf-num-input--value { width: 180px; }

.cdf-err { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c9372c); }
.cdf-err--block { display: block; margin-top: var(--mp-spacing-1); }

.cdf-link { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.cdf-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cdf-link--strong { font-weight: var(--mp-font-weights-semi-bold); }
.cdf-quickcreate { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-2); flex-wrap: wrap; }
.cdf-quickcreate .cdf-input { flex: 1; min-width: 0; }
.cdf-inline-confirm { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral-subtle); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.cdf-inline-confirm--warn { background: var(--mp-background-warning-subtle, #fef6e7); border-color: var(--mp-border-warning, #f5c26b); }
.cdf-inline-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-shrink: 0; }

.cdf-linetable { display: flex; flex-direction: column; border: 1px solid var(--mp-border-bold, #8c9596); border-radius: var(--mp-radii-md); overflow: hidden; }
.cdf-linehead, .cdf-linerow { display: grid; grid-template-columns: 1.6fr 0.7fr 1fr 1.5fr 1fr 28px; gap: var(--mp-spacing-2); align-items: center; padding: var(--mp-spacing-2) var(--mp-spacing-3); }
.cdf-linehead { background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.cdf-linerow { border-bottom: 1px solid var(--mp-border-default); }
.cdf-linerow:last-child { border-bottom: none; }
.cdf-num { text-align: right; font-variant-numeric: tabular-nums; }
.cdf-linename { display: flex; flex-direction: column; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); min-width: 0; }
.cdf-lineunit { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cdf-linediscount { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.cdf-input--disc { width: 72px; height: 36px; }
.cdf-linerow .cdf-input--num { height: 36px; }
.cdf-subtotal { font-weight: var(--mp-font-weights-semi-bold); }
.cdf-line-remove { display: inline-flex; align-items: center; justify-content: center; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); padding: 0; }
.cdf-line-remove:hover { color: var(--mp-text-danger, #c9372c); }
.cdf-empty-lines { margin: 0; padding: var(--mp-spacing-4); text-align: center; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); border: 1px dashed var(--mp-border-default); border-radius: var(--mp-radii-md); }
.cdf-addline { display: flex; }

.cdf-adjgrid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-3) var(--mp-spacing-4); }
.cdf-adjrow { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cdf-adjrow .cdf-input--num { flex: 1; min-width: 0; }

.cdf-valuebox { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-md); }
.cdf-valrow { display: flex; align-items: center; justify-content: space-between; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.cdf-valrow--expected { color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }
.cdf-valrow--expected > span { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.cdf-reset { font-weight: var(--mp-font-weights-regular); }
.cdf-input--value { width: 180px; height: 36px; }

.cdf-form-error { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger, #c9372c); }
.cdf-page-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2); padding-top: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
</style>
