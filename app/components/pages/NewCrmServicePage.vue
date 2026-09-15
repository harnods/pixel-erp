<script setup lang="ts">
/**
 * NewCrmServicePage — create + edit form for a Service deal record
 * (/crm/services/new and /crm/services/:id/edit). One page handles both modes.
 * Mirrors the ERP form shell: crumb + title → header fields → service line-items
 * (value auto-computes from the lines) → description/memo → footer (Cancel + Save).
 * Save persists to the serviceDeals store and routes to the record detail.
 */
import { ref, computed, onMounted } from 'vue'
import {
  MpButton, MpButtonGroup, MpInput, MpTextarea, MpDatePicker, MpIcon,
  MpFormControl, MpFormLabel, MpFormErrorMessage,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { formatMoney } from '~/utils/currency'
import { successToast } from '~/utils/toasts'
import {
  getServiceDeal, addServiceDeal, updateServiceDeal, serviceStages,
  crmCustomers, CRM_OWNERS, SERVICE_TYPES, SERVICE_PAYMENT_TERMS,
  type ServiceDeal, type ServiceType, type DealLineItem,
} from '~/data/crm'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const { t } = useLocale()

const isEdit = computed(() => props.orderId !== 'new')

// ── Form model ──
const name = ref('')
const company = ref('')
const contact = ref('')
const stage = ref(serviceStages()[0]?.name ?? 'Inquiry')
const owner = ref<string>(CRM_OWNERS[0])
const serviceType = ref<ServiceType>('Consultation')
const referenceNo = ref('')
const transactionDate = ref(new Date().toISOString().slice(0, 10))
const dueDate = ref('')
const paymentTerms = ref<string>('Net 30')
const description = ref('')
const memo = ref('')

interface LineItem { productName: string; description: string; quantity: number; unit: string; originalPrice: number }
const items = ref<LineItem[]>([])
function addItem() { items.value.push({ productName: '', description: '', quantity: 1, unit: 'Unit', originalPrice: 0 }) }
function removeItem(i: number) { items.value.splice(i, 1) }
function lineAmount(li: LineItem): number { return Math.round((li.quantity || 0) * (li.originalPrice || 0)) }
const orderTotal = computed(() => items.value.reduce((n, li) => n + lineAmount(li), 0))
const fmt = (n: number) => formatMoney(n, 'IDR')

// ── Options ──
const customerOptions = computed(() => crmCustomers.map((c) => ({ value: c.company, label: c.company })))
const contactOptions = computed(() => {
  const set = new Set(crmCustomers.filter((c) => !company.value || c.company === company.value).map((c) => c.contact).filter(Boolean))
  return [...set].map((n) => ({ value: n, label: n }))
})
const stageOptions = computed(() => serviceStages().map((s) => ({ value: s.name, label: s.name })))
const ownerOptions = CRM_OWNERS.map((o) => ({ value: o, label: o }))
const serviceTypeOptions = SERVICE_TYPES.map((s) => ({ value: s, label: t(s) }))
const paymentTermsOptions = [...SERVICE_PAYMENT_TERMS].map((p) => ({ value: p, label: t(p) }))
const UNIT_OPTIONS = ['Unit', 'Day', 'Session', 'Package', 'Machine', 'Hour'].map((u) => ({ value: u, label: u }))

function onCustomerChange(v: string) {
  company.value = v
  const c = crmCustomers.find((x) => x.company === v)
  if (c && !contact.value) contact.value = c.contact
}

// ── Load (edit) ──
onMounted(() => {
  if (!isEdit.value) return
  const d = getServiceDeal(props.orderId)
  if (!d) return
  name.value = d.name; company.value = d.company; contact.value = d.contact
  stage.value = d.stage; owner.value = d.owner; serviceType.value = d.serviceType
  referenceNo.value = d.referenceNo; transactionDate.value = d.transactionDate; dueDate.value = d.dueDate
  paymentTerms.value = d.paymentTerms; description.value = d.description ?? ''; memo.value = d.memo ?? ''
  items.value = (d.products ?? []).map((p) => ({ productName: p.productName, description: p.description ?? '', quantity: p.quantity, unit: p.unit, originalPrice: p.originalPrice }))
})

// ── Validation (inline, never disable the button) ──
const nameError = ref('')
const customerError = ref('')
function validate(): boolean {
  nameError.value = name.value.trim() ? '' : t('Enter a service name.')
  customerError.value = company.value ? '' : t('Select a customer.')
  return !nameError.value && !customerError.value
}

function toLineItems(): DealLineItem[] {
  return items.value
    .filter((li) => li.productName.trim())
    .map((li) => ({ productId: `svc-${li.productName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`, productName: li.productName.trim(), description: li.description.trim() || undefined, unit: li.unit, quantity: li.quantity, originalPrice: li.originalPrice, discountType: 'none', discount: 0 }))
}

function onSave() {
  if (!validate()) return
  const products = toLineItems()
  const payload = {
    name: name.value.trim(), company: company.value, contact: contact.value,
    stage: stage.value, owner: owner.value, value: orderTotal.value, currency: 'IDR' as const,
    serviceType: serviceType.value, referenceNo: referenceNo.value.trim(),
    transactionDate: transactionDate.value, dueDate: dueDate.value, paymentTerms: paymentTerms.value,
    products, description: description.value.trim() || undefined, memo: memo.value.trim() || undefined,
  }
  if (isEdit.value) {
    updateServiceDeal(props.orderId, payload as Partial<ServiceDeal>)
    successToast(t('Service deal updated'))
    router.push(`/crm/services/${props.orderId}`)
  } else {
    const rec = addServiceDeal(payload)
    successToast(t('Service deal created'))
    router.push(`/crm/services/${rec.id}`)
  }
}
function onCancel() { router.push(isEdit.value ? `/crm/services/${props.orderId}` : '/crm/services') }
</script>

<template>
  <div class="crm">
    <header class="svcf-bar">
      <a class="svcf-crumb" @click="onCancel">{{ t('Service deals') }}</a>
      <h1 class="svcf-h1">{{ isEdit ? t('Edit service deal') : t('New service deal') }}</h1>
    </header>

    <div class="svcf-stage">
      <!-- Header fields -->
      <section class="svcf-header">
        <div class="svcf-col svcf-col--wide">
          <MpFormControl id="svcf-name-ctl" is-required :is-invalid="!!nameError">
            <MpFormLabel>{{ t('Service name') }}</MpFormLabel>
            <MpInput id="svcf-name" v-model="name" is-full-width :placeholder="t('e.g. Barista training program')" @update:model-value="nameError = ''" />
            <MpFormErrorMessage v-if="nameError">{{ nameError }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="svcf-customer-ctl" is-required :is-invalid="!!customerError">
            <MpFormLabel>{{ t('Customer') }}</MpFormLabel>
            <ErpFilterSelect id="svcf-customer" class="svcf-select" :model-value="company" :placeholder="t('Select a customer')" :options="customerOptions" :is-clearable="false" @update:model-value="onCustomerChange" />
            <MpFormErrorMessage v-if="customerError">{{ customerError }}</MpFormErrorMessage>
          </MpFormControl>

          <div class="svcf-field">
            <span class="svcf-label">{{ t('Primary contact') }}</span>
            <ErpFilterSelect id="svcf-contact" class="svcf-select" :model-value="contact" :placeholder="t('Select a contact')" :options="contactOptions" @update:model-value="(v: string) => (contact = v)" />
          </div>
        </div>

        <div class="svcf-col">
          <div class="svcf-field">
            <span class="svcf-label">{{ t('Service type') }}</span>
            <ErpFilterSelect id="svcf-type" class="svcf-select" :model-value="serviceType" :options="serviceTypeOptions" :is-clearable="false" @update:model-value="(v: string) => (serviceType = v as ServiceType)" />
          </div>
          <div class="svcf-field">
            <span class="svcf-label">{{ t('Stage') }}</span>
            <ErpFilterSelect id="svcf-stage" class="svcf-select" :model-value="stage" :options="stageOptions" :is-clearable="false" @update:model-value="(v: string) => (stage = v)" />
          </div>
          <div class="svcf-field">
            <span class="svcf-label">{{ t('Owner') }}</span>
            <ErpFilterSelect id="svcf-owner" class="svcf-select" :model-value="owner" :options="ownerOptions" :is-clearable="false" @update:model-value="(v: string) => (owner = v)" />
          </div>
        </div>

        <div class="svcf-col">
          <div class="svcf-field">
            <span class="svcf-label">{{ t('Transaction date') }}</span>
            <MpDatePicker id="svcf-txdate" v-model="transactionDate" format="YYYY-MM-DD" value-type="format" use-portal />
          </div>
          <div class="svcf-field">
            <span class="svcf-label">{{ t('Due date') }}</span>
            <MpDatePicker id="svcf-duedate" v-model="dueDate" format="YYYY-MM-DD" value-type="format" use-portal />
          </div>
          <div class="svcf-field">
            <span class="svcf-label">{{ t('Payment terms') }}</span>
            <ErpFilterSelect id="svcf-terms" class="svcf-select" :model-value="paymentTerms" :options="paymentTermsOptions" :is-clearable="false" @update:model-value="(v: string) => (paymentTerms = v)" />
          </div>
        </div>

        <div class="svcf-col">
          <div class="svcf-field">
            <span class="svcf-label">{{ t('Reference no.') }}</span>
            <MpInput id="svcf-ref" v-model="referenceNo" is-full-width :placeholder="t('e.g. quote or PO number')" />
          </div>
          <div class="svcf-total">
            <span class="svcf-total-label">{{ t('Value') }}</span>
            <span class="svcf-total-amount">{{ fmt(orderTotal) }}</span>
            <span class="svcf-total-hint">{{ t('Auto-calculated from the service items below.') }}</span>
          </div>
        </div>
      </section>

      <!-- Service items -->
      <section class="svcf-items">
        <h3 class="svcf-section-title">{{ t('Service items') }}</h3>
        <table class="svcf-table">
          <colgroup><col class="svcf-c-name" /><col class="svcf-c-desc" /><col class="svcf-c-qty" /><col class="svcf-c-unit" /><col class="svcf-c-price" /><col class="svcf-c-amt" /><col class="svcf-c-del" /></colgroup>
          <thead>
            <tr>
              <th class="svcf-th">{{ t('Service item') }}</th>
              <th class="svcf-th">{{ t('Description') }}</th>
              <th class="svcf-th svcf-th--num">{{ t('Qty') }}</th>
              <th class="svcf-th">{{ t('Unit') }}</th>
              <th class="svcf-th svcf-th--num">{{ t('Unit price') }}</th>
              <th class="svcf-th svcf-th--num">{{ t('Amount') }}</th>
              <th class="svcf-th" />
            </tr>
          </thead>
          <tbody>
            <tr v-for="(li, i) in items" :key="i" class="svcf-row">
              <td class="svcf-td"><MpInput :id="`svcf-item-${i}`" v-model="li.productName" is-full-width :placeholder="t('e.g. Consulting day')" /></td>
              <td class="svcf-td"><MpInput :id="`svcf-desc-${i}`" v-model="li.description" is-full-width :placeholder="t('Optional')" /></td>
              <td class="svcf-td"><MpInput :id="`svcf-qty-${i}`" v-model.number="li.quantity" type="number" is-full-width /></td>
              <td class="svcf-td"><ErpFilterSelect :id="`svcf-unit-${i}`" class="svcf-select" :model-value="li.unit" :options="UNIT_OPTIONS" :is-clearable="false" @update:model-value="(v: string) => (li.unit = v)" /></td>
              <td class="svcf-td"><MpInput :id="`svcf-price-${i}`" v-model.number="li.originalPrice" type="number" is-full-width /></td>
              <td class="svcf-td svcf-td--num">{{ fmt(lineAmount(li)) }}</td>
              <td class="svcf-td svcf-td--del"><MpButton class="svcf-del" variant="ghost" is-rounded :aria-label="t('Remove item')" @click="removeItem(i)"><MpIcon name="minus-circular" size="sm" /></MpButton></td>
            </tr>
            <tr v-if="!items.length">
              <td class="svcf-td svcf-empty" colspan="7">{{ t('No service items yet. Add one below.') }}</td>
            </tr>
          </tbody>
        </table>
        <div class="svcf-additem">
          <MpButton variant="secondary" is-rounded left-icon="add" @click="addItem">{{ t('Add item') }}</MpButton>
          <div class="svcf-subtotal">
            <span class="svcf-subtotal-label">{{ t('Total') }}</span>
            <span class="svcf-subtotal-amount">{{ fmt(orderTotal) }}</span>
          </div>
        </div>
      </section>

      <!-- Description + memo -->
      <section class="svcf-notes">
        <div class="svcf-field">
          <span class="svcf-label">{{ t('Description') }}</span>
          <MpTextarea id="svcf-description" v-model="description" is-full-width :rows="3" :placeholder="t('Describe the service scope')" />
        </div>
        <div class="svcf-field">
          <span class="svcf-label">{{ t('Memo') }}</span>
          <MpTextarea id="svcf-memo" v-model="memo" is-full-width :rows="2" :maxlength="250" :placeholder="t('Internal note (optional)')" />
        </div>
      </section>

      <!-- Footer -->
      <MpButtonGroup class="erp-action-footer svcf-footer">
        <MpButton variant="ghost" is-rounded @click="onCancel">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="onSave">{{ isEdit ? t('Save changes') : t('Save') }}</MpButton>
      </MpButtonGroup>
    </div>
  </div>
</template>

<style scoped>
.svcf-bar { display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: var(--mp-spacing-5) var(--mp-spacing-6) var(--mp-spacing-4); }
.svcf-crumb { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-link, #165082); cursor: pointer; }
.svcf-crumb:hover { text-decoration: underline; }
.svcf-h1 { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-colors-text-default, #080d0e); }

.svcf-stage { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-6); background: var(--mp-background-stage, #fff); padding: 0 var(--mp-spacing-6) var(--mp-spacing-8); }

.svcf-header { display: grid; grid-template-columns: minmax(0, 1.3fr) repeat(3, minmax(0, 1fr)); gap: var(--mp-spacing-6); padding-top: var(--mp-spacing-4); border-bottom: 1px dashed var(--mp-colors-border-default, #e3e7e9); padding-bottom: var(--mp-spacing-6); }
.svcf-col { display: flex; flex-direction: column; gap: var(--mp-spacing-4); min-width: 0; }
.svcf-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.svcf-label { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-secondary, #6b7678); }
.svcf-select { width: 100%; }
.svcf-select :deep(.efs), .svcf-select :deep(.efs-trigger) { width: 100%; }

.svcf-total { display: flex; flex-direction: column; gap: 2px; margin-top: auto; }
.svcf-total-label { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #6b7678); }
.svcf-total-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-colors-text-default, #080d0e); }
.svcf-total-hint { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #6b7678); }

.svcf-section-title { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-default, #080d0e); }
.svcf-table { width: 100%; border-collapse: collapse; }
.svcf-th { text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-secondary, #6b7678); border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); }
.svcf-th--num { text-align: right; }
.svcf-td { padding: var(--mp-spacing-2) var(--mp-spacing-2); vertical-align: middle; border-bottom: 1px solid var(--mp-colors-border-subtle, #f0f2f2); }
.svcf-td--num { text-align: right; font-variant-numeric: tabular-nums; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-default, #080d0e); }
.svcf-td--del { text-align: center; }
.svcf-empty { text-align: center; color: var(--mp-colors-text-secondary, #6b7678); font-size: var(--mp-font-sizes-md, 14px); padding: var(--mp-spacing-5) 0; }
.svcf-c-qty { width: 88px; } .svcf-c-unit { width: 128px; } .svcf-c-price { width: 150px; } .svcf-c-amt { width: 150px; } .svcf-c-del { width: 48px; } .svcf-c-desc { width: 22%; }
.svcf-del { color: var(--mp-colors-text-secondary, #6b7678); }

.svcf-additem { display: flex; align-items: center; justify-content: space-between; padding-top: var(--mp-spacing-4); }
.svcf-subtotal { display: flex; align-items: baseline; gap: var(--mp-spacing-6); }
.svcf-subtotal-label { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #6b7678); }
.svcf-subtotal-amount { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-colors-text-default, #080d0e); font-variant-numeric: tabular-nums; }

.svcf-notes { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--mp-spacing-6); }

.svcf-footer { position: sticky; bottom: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4) 0; background: var(--mp-background-stage, #fff); border-top: 1px solid var(--mp-colors-border-default, #e3e7e9); }
</style>
