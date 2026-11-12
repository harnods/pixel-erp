<script setup lang="ts">
/**
 * Inventory › Price rules › New / Edit price rule (full page).
 * Routes: /price-rules/new and /price-rules/:id/edit — the catch-all binds the id
 * through the generic `orderId` prop ('new' → create mode).
 *
 * A rule is Sales (customers) or Purchase (vendors). Products are stored by id;
 * "Select by category" is only a shortcut that adds every product of a category
 * (the rule never re-resolves a category later). Purchase rules carry the
 * vendor's PKP status: checked = PKP (product PPN applies), unchecked = Non-PKP
 * (PPN not applied, PPh untouched). A vendor must keep the same PKP status on
 * every rule — saving is blocked inline while `purchasePkpConflict` finds a clash.
 * Rule changes only affect new transactions.
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpInput, MpInputGroup, MpInputLeftAddon, MpInputRightAddon,
  MpInputTag, MpButton, MpCheckbox, MpToggle, MpDatePicker,
  type DataInterface,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { vendors } from '~/data/vendors'
import { customers } from '~/data/customers'
import { products } from '~/data/products'
import {
  priceRuleById, createPriceRule, updatePriceRule, emptyPriceRuleInput,
  purchasePkpConflict, vendorPkpStatus,
  PRICE_RULE_TRANSACTION_TYPES, PRICE_RULE_TRANSACTION_TYPE_LABEL,
  PRICE_RULE_TYPE_LABEL, PRICE_RULE_TYPES_BY_TRANSACTION,
  type PriceRuleInput, type PriceRuleTransactionType, type PriceRuleType,
} from '~/data/priceRules'
import { scrollToFirstError } from '~/utils/form'
import { successToast } from '~/utils/toasts'
import { useUnsavedChangesGuard } from '~/composables/useUnsavedChangesGuard'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const { t } = useLocale()

const NAME_MAX = 60

const isEdit = computed(() => props.orderId !== 'new')
const editing = computed(() => (isEdit.value ? priceRuleById(props.orderId) : undefined))
const notFound = computed(() => isEdit.value && !editing.value)

// ── Date helpers (MpDatePicker works in DD/MM/YYYY; the store keeps ISO) ─────────
function toDisplayDate(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function toISODate(display: string) {
  if (!display) return ''
  const [d, m, y] = display.split('/')
  return `${y}-${m}-${d}`
}

// ── Form state ───────────────────────────────────────────────────────────────────
const initial: PriceRuleInput = editing.value
  ? {
      name: editing.value.name,
      transactionType: editing.value.transactionType,
      ruleType: editing.value.ruleType,
      amount: editing.value.amount,
      productIds: [...editing.value.productIds],
      contactIds: [...editing.value.contactIds],
      vendorPkp: editing.value.vendorPkp,
      startDate: editing.value.startDate,
      endDate: editing.value.endDate,
      status: editing.value.status,
    }
  : emptyPriceRuleInput('sales')

const name = ref(initial.name)
const transactionType = ref<PriceRuleTransactionType>(initial.transactionType)
const ruleType = ref<PriceRuleType>(initial.ruleType)
const amount = ref(initial.amount ? String(initial.amount) : '')
const contactIds = ref<string[]>([...initial.contactIds])
const productIds = ref<string[]>([...initial.productIds])
/** UI state of the PKP checkbox; saved as null when no vendor is picked. */
const pkpChecked = ref(initial.vendorPkp ?? true)
const startDate = ref(toDisplayDate(initial.startDate))
const endDate = ref(toDisplayDate(initial.endDate))
const isActive = ref(initial.status === 'active')

const nameError = ref('')
const amountError = ref('')
const periodError = ref('')
const pkpError = ref('')
const typeSwitchNote = ref(false)

// ── Options ──────────────────────────────────────────────────────────────────────
const isPurchase = computed(() => transactionType.value === 'purchase')
const transactionTypeOptions = PRICE_RULE_TRANSACTION_TYPES.map(v => ({ value: v, label: t(PRICE_RULE_TRANSACTION_TYPE_LABEL[v]) }))
const ruleTypeOptions = computed(() =>
  PRICE_RULE_TYPES_BY_TRANSACTION[transactionType.value].map(v => ({ value: v, label: t(PRICE_RULE_TYPE_LABEL[v]) })),
)
const contactList = computed(() => (isPurchase.value ? vendors : customers).map(c => ({ id: c.id, name: c.name })))
const categoryOptions = [...new Set(products.map(p => p.category))].sort().map(c => ({ value: c, label: c }))

// MpInputTag speaks DataInterface (text/value) — store ids, show names.
function contactName(id: string) { return contactList.value.find(c => c.id === id)?.name ?? id }
function productName(id: string) { return products.find(p => p.id === id)?.name ?? id }
function toData(ids: string[], label: (id: string) => string): DataInterface[] {
  return ids.map(id => ({ id, text: label(id), value: label(id), isInvalid: false, isReadOnly: false }))
}
const contactData = computed(() => toData(contactIds.value, contactName))
const productData = computed(() => toData(productIds.value, productName))
const contactSuggestions = computed(() => contactList.value.map(c => c.name))
const productSuggestions = products.map(p => p.name)

function onContactsChange(d: DataInterface[]) {
  const names = d.map(x => String(x.text ?? x.value))
  const hadNone = contactIds.value.length === 0
  contactIds.value = names
    .map(n => contactList.value.find(c => c.name === n)?.id)
    .filter((id): id is string => !!id)
  pkpError.value = ''
  // Prefill PKP from the vendor's existing rules so the first pick doesn't clash.
  if (isPurchase.value && contactIds.value.length) {
    const known = contactIds.value.map(id => vendorPkpStatus(id)).find(v => v !== null)
    if (known !== undefined && known !== null) pkpChecked.value = known
    else if (hadNone) pkpChecked.value = true
  }
}
function onProductsChange(d: DataInterface[]) {
  const names = d.map(x => String(x.text ?? x.value))
  productIds.value = names
    .map(n => products.find(p => p.name === n)?.id)
    .filter((id): id is string => !!id)
}

// "Select by category" — a one-shot shortcut: adds the category's products, then resets.
const categoryPick = ref('')
/** Remounts the product tag input so it shows ids added from outside it. */
const categoryAdds = ref(0)
function onCategoryPick(cat: string) {
  categoryPick.value = cat
  if (!cat) return
  const ids = products.filter(p => p.category === cat).map(p => p.id)
  productIds.value = [...new Set([...productIds.value, ...ids])]
  categoryAdds.value++
  nextTick(() => { categoryPick.value = '' })
}

function onTransactionTypeChange(v: string) {
  const next = (v || 'sales') as PriceRuleTransactionType
  if (next === transactionType.value) return
  transactionType.value = next
  contactIds.value = []
  productIds.value = []
  pkpError.value = ''
  pkpChecked.value = true
  if (!PRICE_RULE_TYPES_BY_TRANSACTION[next].includes(ruleType.value)) ruleType.value = PRICE_RULE_TYPES_BY_TRANSACTION[next][0]!
  typeSwitchNote.value = true
}

const isPercent = computed(() => ruleType.value === 'percent' || ruleType.value === 'markup_percent')

// ── Unsaved changes guard ──────────────────────────────────────────────────────
function snapshot(): string {
  return JSON.stringify([name.value, transactionType.value, ruleType.value, amount.value, contactIds.value, productIds.value, pkpChecked.value, startDate.value, endDate.value, isActive.value])
}
const initialSnapshot = snapshot()
const { disableGuard } = useUnsavedChangesGuard({ hasUnsavedChanges: () => !notFound.value && snapshot() !== initialSnapshot })

// ── Navigation + save ──────────────────────────────────────────────────────────
function goBack() { router.push('/price-rules') }

const isSaving = ref(false)
async function handleSave() {
  nameError.value = ''
  amountError.value = ''
  periodError.value = ''
  pkpError.value = ''
  let valid = true
  if (!name.value.trim()) { nameError.value = t('You must fill in rule name'); valid = false }
  const n = Number(amount.value)
  if (!amount.value || !Number.isFinite(n) || n <= 0) { amountError.value = t('You must fill in an amount above 0'); valid = false }
  else if (isPercent.value && ruleType.value === 'percent' && n > 100) { amountError.value = t('Percentage cannot be more than 100'); valid = false }
  const startIso = toISODate(startDate.value)
  const endIso = toISODate(endDate.value)
  if (startIso && endIso && endIso < startIso) { periodError.value = t('End date must be on or after start date'); valid = false }
  const pkp = isPurchase.value && contactIds.value.length > 0 ? pkpChecked.value : null
  if (pkp !== null) {
    const clash = purchasePkpConflict(contactIds.value, pkp, editing.value?.id)
    if (clash) {
      pkpError.value = `${clash.vendorName} ${t('is')} ${clash.rule.vendorPkp ? t('PKP') : t('Non-PKP')} ${t('on')} “${clash.rule.name}”. ${t('Use the same PKP status on every rule for this vendor')}`
      valid = false
    }
  }
  if (!valid) { scrollToFirstError(); return }

  isSaving.value = true
  await new Promise(r => setTimeout(r, 400))
  const input: PriceRuleInput = {
    name: name.value,
    transactionType: transactionType.value,
    ruleType: ruleType.value,
    amount: n,
    productIds: productIds.value,
    contactIds: contactIds.value,
    vendorPkp: pkp,
    startDate: startIso,
    endDate: endIso,
    status: isActive.value ? 'active' : 'inactive',
  }
  if (editing.value) updatePriceRule(editing.value.id, input)
  else createPriceRule(input)
  isSaving.value = false
  disableGuard()
  successToast(editing.value ? t('Price rule changes saved') : t('Price rule saved'))
  router.push('/price-rules')
}

// ── Sticky footer divider ────────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() { const el = stageEl.value; if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1 }
let stageObserver: ResizeObserver | null = null
onMounted(() => nextTick(() => {
  checkStageOverflow()
  stageObserver = new ResizeObserver(checkStageOverflow)
  if (stageEl.value) { stageObserver.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true }) }
}))
onUnmounted(() => { stageObserver?.disconnect() })
</script>

<template>
  <div class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpButton class="detail-breadcrumb" variant="ghost" @click="goBack">{{ t('All price rules') }}</MpButton>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ isEdit ? t('Edit price rule') : t('New price rule') }}</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">
      <!-- Edit link to a rule that no longer exists (deleted in another tab). -->
      <div v-if="notFound" class="prf-missing">
        <p class="prf-missing-title">{{ t('Price rule not found') }}</p>
        <p class="prf-missing-desc">{{ t('This price rule may have been deleted.') }}</p>
        <MpButton variant="secondary" is-rounded @click="goBack">{{ t('Back to price rules') }}</MpButton>
      </div>

      <div v-else class="prf-form">
        <!-- Rule name -->
        <MpFormControl id="prf-name" class="prf-full" is-required :is-invalid="!!nameError">
          <div class="prf-label-row">
            <MpFormLabel>{{ t('Rule name') }}</MpFormLabel>
            <span class="prf-counter">{{ name.length }}/{{ NAME_MAX }}</span>
          </div>
          <MpInput v-model="name" :maxlength="NAME_MAX" :is-invalid="!!nameError" @input="nameError = ''" />
          <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
        </MpFormControl>

        <!-- Transaction type -->
        <MpFormControl id="prf-transaction-type" class="prf-half" is-required data-devchange="purchase-price-rule-form">
          <MpFormLabel>{{ t('Transaction type') }}</MpFormLabel>
          <ErpFilterSelect
            id="prf-transaction-type-select"
            :model-value="transactionType"
            :placeholder="t('Select transaction type')"
            :options="transactionTypeOptions"
            :is-clearable="false"
            width="100%"
            @update:model-value="onTransactionTypeChange"
          />
          <p class="prf-caption">
            {{ typeSwitchNote
              ? t('Customers, vendors and products were cleared because the transaction type changed.')
              : t('Sales rules apply to customers. Purchase rules apply to vendors.') }}
          </p>
        </MpFormControl>

        <!-- Customers / vendors -->
        <MpFormControl id="prf-contacts" class="prf-full">
          <MpFormLabel>{{ isPurchase ? t('Vendors') : t('Customers') }}</MpFormLabel>
          <MpInputTag
            :id="isPurchase ? 'prf-vendors-input' : 'prf-customers-input'"
            :key="`contacts-${transactionType}`"
            :data="contactData"
            :suggestions="contactSuggestions"
            is-show-suggestions
            :is-enable-create-new-tag="false"
            is-show-icon-chevron-down
            @change="onContactsChange"
          />
          <p class="prf-caption">
            {{ isPurchase ? t('Leave empty to apply to all vendors.') : t('Leave empty to apply to all customers.') }}
          </p>
        </MpFormControl>

        <!-- PKP vendor (purchase only) -->
        <MpFormControl
          v-if="isPurchase" id="prf-pkp" class="prf-full"
          :is-invalid="!!pkpError" data-devchange="purchase-price-rule-pkp"
        >
          <MpCheckbox
            id="prf-pkp-check"
            class="prf-checkbox"
            :is-checked="contactIds.length > 0 ? pkpChecked : true"
            :is-disabled="contactIds.length === 0"
            @update:is-checked="(v: boolean) => { pkpChecked = v; pkpError = '' }"
          >
            <span class="prf-check-label">
              <span class="prf-check-title">{{ t('PKP vendor') }}</span>
              <span class="prf-check-caption">{{ t('Checked: the product\'s PPN applies. Unchecked: Non-PKP, PPN is not applied and PPh still applies.') }}</span>
              <span v-if="contactIds.length === 0" class="prf-check-caption">{{ t('Select at least one vendor to set PKP status.') }}</span>
            </span>
          </MpCheckbox>
          <MpFormErrorMessage>{{ pkpError }}</MpFormErrorMessage>
        </MpFormControl>

        <!-- Products -->
        <MpFormControl id="prf-products" class="prf-full">
          <MpFormLabel>{{ t('Products') }}</MpFormLabel>
          <MpInputTag
            id="prf-products-input"
            :key="`products-${transactionType}-${categoryAdds}`"
            :data="productData"
            :suggestions="productSuggestions"
            is-show-suggestions
            :is-enable-create-new-tag="false"
            is-show-icon-chevron-down
            @change="onProductsChange"
          />
          <p class="prf-caption">{{ t('Leave empty to apply to all products.') }}</p>
        </MpFormControl>

        <MpFormControl id="prf-category" class="prf-half">
          <MpFormLabel>{{ t('Select by category') }}</MpFormLabel>
          <ErpFilterSelect
            id="prf-category-select"
            :model-value="categoryPick"
            :placeholder="t('Select category')"
            :options="categoryOptions"
            width="100%"
            @update:model-value="onCategoryPick"
          />
          <p class="prf-caption">{{ t('Adds every product in the category. Later changes to the category don\'t update this rule.') }}</p>
        </MpFormControl>

        <!-- Rule type -->
        <MpFormControl id="prf-rule-type" class="prf-half" is-required>
          <MpFormLabel>{{ t('Rule type') }}</MpFormLabel>
          <ErpFilterSelect
            id="prf-rule-type-select"
            :model-value="ruleType"
            :placeholder="t('Select rule type')"
            :options="ruleTypeOptions"
            :is-clearable="false"
            width="100%"
            @update:model-value="(v: string) => { if (v) ruleType = v as PriceRuleType }"
          />
        </MpFormControl>

        <!-- Amount -->
        <MpFormControl id="prf-amount" class="prf-half" is-required :is-invalid="!!amountError">
          <MpFormLabel>{{ isPercent ? t('Percentage') : t('Value per unit') }}</MpFormLabel>
          <MpInputGroup id="prf-amount-group" is-full-width>
            <MpInputLeftAddon v-if="!isPercent" has-background>Rp</MpInputLeftAddon>
            <MpInput
              id="prf-amount-input" v-model="amount" type="number" is-full-width
              :is-invalid="!!amountError" @update:model-value="amountError = ''"
            />
            <MpInputRightAddon v-if="isPercent" has-background>%</MpInputRightAddon>
          </MpInputGroup>
          <MpFormErrorMessage>{{ amountError }}</MpFormErrorMessage>
        </MpFormControl>

        <!-- Period -->
        <MpFormControl id="prf-start" class="prf-half">
          <MpFormLabel>{{ t('Start date') }}</MpFormLabel>
          <MpDatePicker id="prf-start-dp" v-model="startDate" format="DD/MM/YYYY" value-type="format" use-portal @update:model-value="periodError = ''" />
        </MpFormControl>
        <MpFormControl id="prf-end" class="prf-half" :is-invalid="!!periodError">
          <MpFormLabel>{{ t('End date') }}</MpFormLabel>
          <MpDatePicker id="prf-end-dp" v-model="endDate" format="DD/MM/YYYY" value-type="format" use-portal @update:model-value="periodError = ''" />
          <p v-if="!periodError" class="prf-caption">{{ t('Leave both dates empty to apply the rule at all times.') }}</p>
          <MpFormErrorMessage>{{ periodError }}</MpFormErrorMessage>
        </MpFormControl>

        <!-- Status (rule/form-toggle-inline) -->
        <div class="prf-full prf-toggle-row">
          <MpToggle id="prf-status" :is-checked="isActive" @update:is-checked="(v: boolean) => (isActive = v)" />
          <span class="prf-toggle-label">{{ t('Active') }}</span>
        </div>
        <p class="prf-full prf-caption">{{ t('Changes apply to new transactions only. Saved transactions keep their prices.') }}</p>
      </div>
    </div>

    <!-- ── Sticky footer ── -->
    <footer v-if="!notFound" class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpButton variant="ghost" is-rounded @click="goBack">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded :is-disabled="isSaving" @click="handleSave">{{ isSaving ? t('Saving…') : (isEdit ? t('Save changes') : t('Save')) }}</MpButton>
    </footer>
  </div>
</template>

<style scoped>
/* ── Page shell (same as WarehouseTransferFormPage) ── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-8); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); }
.detail-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage, #ffffff); border-top: 1px solid transparent; transition: border-top-color 0.15s; }
.detail-footer--floating { border-top-color: var(--mp-border-default, #e3e7e9); }

/* ── Form: 6-column grid, max 558px, stacked (rule/form-field-stacking);
      selects at half width on their own row (rule/form-select-half). ── */
.prf-form { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); row-gap: var(--mp-spacing-5); column-gap: var(--mp-spacing-6); max-width: 558px; }
.prf-full { grid-column: 1 / -1; }
.prf-half { grid-column: 1 / span 3; }
.prf-label-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-2); }
.prf-counter, .prf-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #626b79); }
.prf-caption { margin-top: var(--mp-spacing-1); }

/* rule/checkbox-multiline-top: title + caption → box aligned to the first line. */
.prf-checkbox :deep(.mp-checkbox__root) { align-items: flex-start; }
.prf-check-label { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.prf-check-title { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default, #232933); }
.prf-check-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #626b79); }

/* rule/form-toggle-inline: toggle left, label right, 12px gap. */
.prf-toggle-row { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.prf-toggle-label { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default, #232933); }

/* ── Not found ── */
.prf-missing { display: flex; flex-direction: column; align-items: center; padding-top: var(--mp-spacing-10); }
.prf-missing-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #232933); }
.prf-missing-desc { margin-top: var(--mp-spacing-0\.5); margin-bottom: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-secondary, #626b79); }
</style>
