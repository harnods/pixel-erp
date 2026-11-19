<script setup lang="ts">
/**
 * Inventory › Price rules › Create / Edit price rule (full page).
 * Routes: /price-rules/new and /price-rules/:id/edit — the catch-all binds the id
 * through the generic `orderId` prop ('new' → create mode).
 *
 * Layout mirrors production Mekari ERP (app.erp.mekari.com/v3/products/price_rules/new):
 * three sections — Rule info · Contacts · Products — each picker opening a
 * two-pane "Select …" drawer (PriceRuleSelectDrawer), sticky Cancel / Save footer.
 *
 * Purchase Price Rule v4 (DECIDED 17 Nov): a rule is Sales (customers) or
 * Purchase (vendors) and the two are IDENTICAL — all 7 rule types, active period,
 * tier tables, contact groups, products/categories. Only Customers vs Vendors
 * differs. Contact groups are a shortcut that adds their members.
 *
 * v5 (DECIDED 19 Nov):
 *   - Product categories are a LIVE scope: picking a category stores the
 *     category name (categoryIds), not its current products, so a product
 *     created later in it is covered. Categories and specific products combine
 *     (a line matches if its product OR its category is listed); both empty =
 *     all products. Same for sales and purchase rules.
 *   - 'Fixed price per product' (fixed_price) is a price list: specific products
 *     only (no categories), each with its own required Rp price in the Products
 *     table (FormTable cells, inline errors); no single amount field.
 *
 * Tier types keep a step table (max 5): 'tier' thresholds are a quantity,
 * 'subtotal_tier' thresholds a document subtotal (Rp). Thresholds must rise
 * step by step; discounts are 0–100%.
 *
 * "Allow changes on transaction" (allowOverride, default on): off → the price
 * and discount this rule sets are read-only on the transaction line.
 *
 * No Outlets section and no PKP here: an outlet's deal is its own named rule,
 * picked in the transaction's Price rule field; PKP lives on the vendor master
 * (Contacts › Vendors). Rule changes only affect new transactions.
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpInput, MpInputGroup, MpInputLeftAddon, MpInputRightAddon,
  MpButton, MpButtonGroup, MpCheckbox, MpToggle, MpIcon, MpTooltip,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import PriceRuleSelectDrawer, { type PriceRulePickGroup, type PriceRulePickOption } from '~/components/patterns/PriceRuleSelectDrawer.vue'
import { vendors } from '~/data/vendors'
import { customers } from '~/data/customers'
import { products } from '~/data/products'
import { contacts } from '~/data/contacts'
import { contactGroups } from '~/data/contactGroups'
import {
  priceRuleById, createPriceRule, updatePriceRule, emptyPriceRuleInput,
  PRICE_RULE_TRANSACTION_TYPES, PRICE_RULE_TRANSACTION_TYPE_LABEL,
  PRICE_RULE_TYPE_LABEL, PRICE_RULE_TYPES_BY_TRANSACTION, PRICE_RULE_MARKUP_TYPES,
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

// ── Date helpers (the range picker speaks Date; the store keeps ISO) ─────────────
function isoToDate(iso: string): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, (m ?? 1) - 1, d ?? 1)
}
function dateToIso(d: Date | null | undefined): string {
  if (!d) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Form state ───────────────────────────────────────────────────────────────────
const initial: PriceRuleInput = editing.value
  ? {
      name: editing.value.name,
      transactionType: editing.value.transactionType,
      ruleType: editing.value.ruleType,
      amount: editing.value.amount,
      productIds: [...editing.value.productIds],
      categoryIds: [...(editing.value.categoryIds ?? [])],
      productPrices: { ...(editing.value.productPrices ?? {}) },
      contactIds: [...editing.value.contactIds],
      tiers: editing.value.tiers.map(x => ({ ...x })),
      allowOverride: editing.value.allowOverride,
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
/** Live category scope (category names, v5). */
const categoryIds = ref<string[]>([...(initial.categoryIds ?? [])])
/** fixed_price: Rp per product id, as typed (string so an empty cell stays empty). */
const productPrices = ref<Record<string, string>>(
  Object.fromEntries(Object.entries(initial.productPrices ?? {}).map(([id, v]) => [id, v ? String(v) : ''])),
)
/** fixed_price: per-cell price errors (product id) + one table-level message. */
const priceCellErrors = ref<Record<string, true>>({})
const priceError = ref('')
/** Categories were dropped because the rule type became fixed_price. */
const categoriesClearedNote = ref(false)
/** Tier steps as typed (strings so an empty cell stays empty). */
interface TierRow { key: number; threshold: string; discount: string }
let tierKey = 0
const tiers = ref<TierRow[]>(initial.tiers.map(x => ({ key: ++tierKey, threshold: String(x.threshold), discount: String(x.discount) })))
/** "Allow changes on transaction" — default on. */
const allowOverride = ref(initial.allowOverride)
/** Active period — optional here (prototype rules are open-ended); null = always. */
const period = ref<Date[] | null>(
  initial.startDate || initial.endDate
    ? [isoToDate(initial.startDate || initial.endDate)!, isoToDate(initial.endDate || initial.startDate)!]
    : null,
)
const isActive = ref(initial.status === 'active')

const nameError = ref('')
const amountError = ref('')
/** Per-cell tier errors (key → field) + one table-level message. */
const tierCellErrors = ref<Record<string, true>>({})
const tierError = ref('')
const typeSwitchNote = ref(false)

// ── Options ──────────────────────────────────────────────────────────────────────
const isPurchase = computed(() => transactionType.value === 'purchase')
const transactionTypeOptions = PRICE_RULE_TRANSACTION_TYPES.map(v => ({ value: v, label: t(PRICE_RULE_TRANSACTION_TYPE_LABEL[v]) }))
/** Production order; the two markups sit under a "MARKUP" group heading. */
/** Purchase reads "Subtotal discount" (the production label says "Sales"). */
function ruleTypeLabel(v: PriceRuleType): string {
  return isPurchase.value && v === 'subtotal_tier' ? t('Subtotal discount') : t(PRICE_RULE_TYPE_LABEL[v])
}
/** v5: 'Fixed price per product' sits after the discount types, not under MARKUP. */
const ruleTypeOrder = computed<PriceRuleType[]>(() => {
  const all = PRICE_RULE_TYPES_BY_TRANSACTION[transactionType.value]
  const markups = all.filter(v => PRICE_RULE_MARKUP_TYPES.includes(v))
  return [...all.filter(v => !PRICE_RULE_MARKUP_TYPES.includes(v)), ...markups]
})
const ruleTypeOptions = computed(() =>
  ruleTypeOrder.value.map(v => ({
    value: v,
    label: ruleTypeLabel(v),
    ...(PRICE_RULE_MARKUP_TYPES.includes(v) ? { group: t('MARKUP') } : {}),
  })),
)
const isMarkup = computed(() => PRICE_RULE_MARKUP_TYPES.includes(ruleType.value))
/** Price amount types (and the last price) are Rp per unit; the rest are %. */
const isAmountType = computed(() => ['value', 'markup_value', 'end_discount'].includes(ruleType.value))
/** Step-table types: no single amount, a tier table instead. */
const isTierType = computed(() => ruleType.value === 'tier' || ruleType.value === 'subtotal_tier')
const isSubtotalTier = computed(() => ruleType.value === 'subtotal_tier')
/** Price list: one Rp price per product, no single amount. */
const isFixedPrice = computed(() => ruleType.value === 'fixed_price')
const TIER_MAX = 5
const amountLabel = computed(() => {
  if (isMarkup.value) return t('Markup')
  if (ruleType.value === 'end_discount') return t('Last price')
  return t('Discount')
})

// ── Tier table ────────────────────────────────────────────────────────────────
function addTier() {
  if (tiers.value.length >= TIER_MAX) return
  tiers.value.push({ key: ++tierKey, threshold: '', discount: '' })
  tierError.value = ''
}
function removeTier(key: number) {
  tiers.value = tiers.value.filter(x => x.key !== key)
  tierCellErrors.value = {}
  tierError.value = ''
}
function clearTierCell(key: number, field: 'threshold' | 'discount') {
  const next = { ...tierCellErrors.value }
  delete next[`${key}-${field}`]
  tierCellErrors.value = next
  if (!Object.keys(next).length) tierError.value = ''
}
/** Inline tier validation: ≥ 1 step, thresholds > 0 and rising, discount 0–100. */
function validateTiers(): boolean {
  const cells: Record<string, true> = {}
  const msgs: string[] = []
  if (!tiers.value.length) { tierCellErrors.value = {}; tierError.value = t('Add at least one tier'); return false }
  let prev = -Infinity
  for (const row of tiers.value) {
    const th = Number(row.threshold)
    if (row.threshold === '' || !Number.isFinite(th) || th <= 0) {
      cells[`${row.key}-threshold`] = true
      msgs.push(isSubtotalTier.value ? t('Enter a minimum subtotal above 0') : t('Enter a minimum quantity above 0'))
    } else if (th <= prev) {
      cells[`${row.key}-threshold`] = true
      msgs.push(t('Each tier\'s minimum must be higher than the tier above it'))
    }
    if (Number.isFinite(th) && row.threshold !== '') prev = Math.max(prev, th)
    const d = Number(row.discount)
    if (row.discount === '' || !Number.isFinite(d) || d < 0 || d > 100) {
      cells[`${row.key}-discount`] = true
      msgs.push(t('Discount must be between 0 and 100'))
    }
  }
  tierCellErrors.value = cells
  tierError.value = msgs[0] ?? ''
  return !msgs.length
}

// Contacts (customers / vendors) and products as drawer options.
const contactOptions = computed<PriceRulePickOption[]>(() =>
  (isPurchase.value ? vendors : customers).map(c => ({ id: c.id, name: c.name })),
)
const productOptions: PriceRulePickOption[] = products.map(p => ({ id: p.id, name: p.name, subtitle: p.code }))

/** Customer contact groups → member customers. The contact master (CT…) and the
 *  customers FK table (C…) only share the display name, so join on it. */
const customerGroupOptions = computed<PriceRulePickGroup[]>(() =>
  contactGroups
    .filter(g => g.type === 'customer')
    .map((g) => {
      const names = new Set(
        contacts
          .filter(c => c.types.includes('customer') && c.groups.includes(g.name))
          .flatMap(c => [c.displayName.trim().toLowerCase(), c.companyName.trim().toLowerCase()]),
      )
      const memberIds = customers.filter(c => names.has(c.name.trim().toLowerCase())).map(c => c.id)
      return { id: g.id, name: g.name, subtitle: `${memberIds.length} ${memberIds.length === 1 ? t('customer') : t('customers')}`, memberIds }
    }),
)
/** Vendor contact groups → member vendors, joined on the display name the same
 *  way (contact master CT… vs vendors FK table V…). Seeded vendor groups have no
 *  members yet, so the tab shows its empty state until a vendor joins one. */
const vendorGroupOptions = computed<PriceRulePickGroup[]>(() =>
  contactGroups
    .filter(g => g.type === 'vendor')
    .map((g) => {
      const names = new Set(
        contacts
          .filter(c => c.types.includes('vendor') && c.groups.includes(g.name))
          .flatMap(c => [c.displayName.trim().toLowerCase(), c.companyName.trim().toLowerCase()]),
      )
      const memberIds = vendors.filter(v => names.has(v.name.trim().toLowerCase())).map(v => v.id)
      return { id: g.id, name: g.name, subtitle: `${memberIds.length} ${memberIds.length === 1 ? t('vendor') : t('vendors')}`, memberIds }
    }),
)
/** Product categories — a LIVE scope (v5): the group id IS the category name
 *  stored in categoryIds; memberIds is only today's count for the subtitle. */
function productsTodayLabel(n: number): string {
  return n === 1 ? t('1 product today') : t('{n} products today').replace('{n}', String(n))
}
const categoryOptions: PriceRulePickGroup[] = [...new Set(products.map(p => p.category))].sort().map((cat) => {
  const memberIds = products.filter(p => p.category === cat).map(p => p.id)
  return { id: cat, name: cat, subtitle: productsTodayLabel(memberIds.length), memberIds }
})

function contactName(id: string) { return contactOptions.value.find(c => c.id === id)?.name ?? id }
const pickedContacts = computed(() => contactIds.value.map(id => ({ id, name: contactName(id) })))
const pickedProducts = computed(() =>
  productIds.value.map((id) => {
    const p = products.find(x => x.id === id)
    return { id, name: p?.name ?? id, code: p?.code ?? '', category: p?.category ?? '' }
  }),
)
const pickedCategories = computed(() =>
  categoryIds.value.map(name => ({ name, count: products.filter(p => p.category === name).length })),
)
const productScopeCount = computed(() => productIds.value.length + categoryIds.value.length)

// ── Drawers ──────────────────────────────────────────────────────────────────────
const contactDrawerOpen = ref(false)
const productDrawerOpen = ref(false)

function onContactsSave(ids: string[]) { contactIds.value = ids }
function removeContact(id: string) { contactIds.value = contactIds.value.filter(x => x !== id) }
function onProductsSave(ids: string[], groupIds: string[] = []) {
  productIds.value = ids
  categoryIds.value = isFixedPrice.value ? [] : groupIds
  if (ids.length || groupIds.length) categoriesClearedNote.value = false
  priceError.value = ''
}
function removeProduct(id: string) {
  productIds.value = productIds.value.filter(x => x !== id)
  clearPriceCell(id)
}
function removeCategory(name: string) { categoryIds.value = categoryIds.value.filter(x => x !== name) }
function clearPriceCell(id: string) {
  const next = { ...priceCellErrors.value }
  delete next[id]
  priceCellErrors.value = next
  if (!Object.keys(next).length) priceError.value = ''
}
/** fixed_price: ≥ 1 product, every listed product priced above 0. */
function validatePrices(): boolean {
  if (!productIds.value.length) { priceCellErrors.value = {}; priceError.value = t('Add at least one product'); return false }
  const cells: Record<string, true> = {}
  for (const id of productIds.value) {
    const v = productPrices.value[id] ?? ''
    const n = Number(v)
    if (v === '' || !Number.isFinite(n) || n <= 0) cells[id] = true
  }
  priceCellErrors.value = cells
  priceError.value = Object.keys(cells).length ? t('Enter a fixed price above 0') : ''
  return !priceError.value
}

function onTransactionTypeChange(v: string) {
  const next = (v || 'sales') as PriceRuleTransactionType
  if (next === transactionType.value) return
  transactionType.value = next
  contactIds.value = []
  productIds.value = []
  categoryIds.value = []
  productPrices.value = {}
  priceCellErrors.value = {}
  priceError.value = ''
  if (!PRICE_RULE_TYPES_BY_TRANSACTION[next].includes(ruleType.value)) ruleType.value = PRICE_RULE_TYPES_BY_TRANSACTION[next][0]!
  typeSwitchNote.value = true
}

function onRuleTypeChange(v: string) {
  if (!v) return
  ruleType.value = v as PriceRuleType
  amountError.value = ''
  tierError.value = ''
  tierCellErrors.value = {}
  priceCellErrors.value = {}
  priceError.value = ''
  // A price list is per product: drop the categories and say so.
  if (isFixedPrice.value && categoryIds.value.length) { categoryIds.value = []; categoriesClearedNote.value = true }
  if (!isFixedPrice.value) categoriesClearedNote.value = false
  // A tier type starts with one empty step so the table is never blank.
  if (isTierType.value && !tiers.value.length) addTier()
}

// ── Copy that changes with the transaction type ──────────────────────────────────
const contactCopy = computed(() => isPurchase.value
  ? {
      section: t('Vendors'),
      caption: t('Select the vendors this pricing applies to.'),
      emptyTitle: t('No vendors'),
      emptyCaption: t('Vendors will appear here. Leave empty to apply the rule to all vendors.'),
      add: t('Add vendors'),
      drawerTitle: t('Select vendors'),
      listTitle: t('Vendors'),
      selectedTitle: t('Selected vendors'),
      drawerEmptyTitle: t('No selected vendors'),
      drawerEmptyCaption: t('Selected vendors will appear here.'),
      column: t('Vendor name'),
    }
  : {
      section: t('Contacts'),
      caption: t('Select the customers or contact groups who will receive this pricing.'),
      emptyTitle: t('No contacts'),
      emptyCaption: t('Contacts will appear here. Leave empty to apply the rule to all customers.'),
      add: t('Add contacts'),
      drawerTitle: t('Select contacts'),
      listTitle: t('Customers'),
      selectedTitle: t('Selected customers'),
      drawerEmptyTitle: t('No selected customers'),
      drawerEmptyCaption: t('Selected customers will appear here.'),
      column: t('Customer name'),
    })

// ── Unsaved changes guard ──────────────────────────────────────────────────────
function snapshot(): string {
  return JSON.stringify([name.value, transactionType.value, ruleType.value, amount.value, contactIds.value, productIds.value, categoryIds.value, productIds.value.map(id => productPrices.value[id] ?? ''), tiers.value.map(x => [x.threshold, x.discount]), allowOverride.value, period.value?.map(dateToIso) ?? null, isActive.value])
}
const initialSnapshot = snapshot()
const { disableGuard } = useUnsavedChangesGuard({ hasUnsavedChanges: () => !notFound.value && snapshot() !== initialSnapshot })

// ── Navigation + save ──────────────────────────────────────────────────────────
function goBack() { router.push('/price-rules') }

const isSaving = ref(false)
async function handleSave() {
  nameError.value = ''
  amountError.value = ''
  let valid = true
  if (!name.value.trim()) { nameError.value = t('You must fill in rule name'); valid = false }
  const n = isTierType.value || isFixedPrice.value ? 0 : Number(amount.value)
  if (isTierType.value) {
    if (!validateTiers()) valid = false
  } else if (isFixedPrice.value) {
    if (!validatePrices()) valid = false
  } else if (!amount.value || !Number.isFinite(n) || n <= 0) { amountError.value = t('You must fill in an amount above 0'); valid = false }
  else if (!isAmountType.value && !isMarkup.value && n > 100) { amountError.value = t('Percentage cannot be more than 100'); valid = false }
  if (!valid) { scrollToFirstError(); return }

  isSaving.value = true
  await new Promise(r => setTimeout(r, 400))
  const input: PriceRuleInput = {
    name: name.value,
    transactionType: transactionType.value,
    ruleType: ruleType.value,
    amount: n,
    productIds: productIds.value,
    categoryIds: isFixedPrice.value ? [] : categoryIds.value,
    productPrices: isFixedPrice.value ? Object.fromEntries(productIds.value.map(id => [id, Number(productPrices.value[id])])) : {},
    contactIds: contactIds.value,
    tiers: isTierType.value ? tiers.value.map(x => ({ threshold: Number(x.threshold), discount: Number(x.discount) })) : [],
    allowOverride: allowOverride.value,
    startDate: dateToIso(period.value?.[0]),
    endDate: dateToIso(period.value?.[1]),
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
    <!-- ── Title bar: breadcrumb over title (production) ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpButton class="detail-breadcrumb" variant="ghost" @click="goBack">{{ t('Price rules') }}</MpButton>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ isEdit ? t('Edit price rule') : t('Create price rule') }}</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">
      <!-- Edit link to a rule that no longer exists (deleted in another tab). -->
      <div v-if="notFound" class="prf-missing">
        <img src="/illustrations/empty-folder.png" alt="" class="prf-empty-img" width="140" height="120" />
        <p class="prf-missing-title">{{ t('Price rule not found') }}</p>
        <p class="prf-missing-desc">{{ t('This price rule may have been deleted.') }}</p>
        <MpButton variant="secondary" is-rounded @click="goBack">{{ t('Back to price rules') }}</MpButton>
      </div>

      <template v-else>
        <!-- ═══ Rule info ═══ -->
        <section class="prf-section">
          <header class="prf-section-head">
            <h2 class="prf-section-title">{{ t('Rule info') }}</h2>
            <p class="prf-section-caption">{{ t('Set up the basic information and configure how this rule changes the product price.') }}</p>
          </header>

          <div class="prf-form">
            <!-- Rule name (rule/input-char-counter) -->
            <MpFormControl id="prf-name" class="prf-full" is-required :is-invalid="!!nameError">
              <div class="prf-label-row">
                <MpFormLabel>{{ t('Rule name') }}</MpFormLabel>
                <span class="prf-counter">{{ name.length }} / {{ NAME_MAX }}</span>
              </div>
              <MpInput id="prf-name-input" v-model="name" :maxlength="NAME_MAX" :is-invalid="!!nameError" @input="nameError = ''" />
              <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
            </MpFormControl>

            <!-- Transaction type (Purchase Price Rule) -->
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

            <!-- Active period — optional in the prototype; empty = always -->
            <MpFormControl id="prf-period" class="prf-half">
              <MpFormLabel>{{ t('Active period') }}</MpFormLabel>
              <div class="prf-period">
                <AdvancedDateRangePicker
                  id="prf-period-picker"
                  :model-value="period"
                  direction="future"
                  is-full-width
                  hide-label
                  :placeholder="t('Always')"
                  @update:model-value="(v: Date[]) => (period = v)"
                />
                <MpTooltip v-if="period" id="prf-period-clear-tip" :label="t('Clear')" placement="top" use-portal class="prf-period-clear">
                  <MpButton class="prf-period-clear-btn" variant="ghost" type="button" :aria-label="t('Clear')" @click="period = null">
                    <MpIcon name="close" size="sm" />
                  </MpButton>
                </MpTooltip>
              </div>
              <p class="prf-caption">{{ t('Leave empty to apply the rule at all times.') }}</p>
            </MpFormControl>

            <!-- Rule type -->
            <MpFormControl id="prf-rule-type" class="prf-half" is-required data-devchange="price-rule-fixed-price">
              <MpFormLabel>{{ t('Rule type') }}</MpFormLabel>
              <ErpFilterSelect
                id="prf-rule-type-select"
                :model-value="ruleType"
                :placeholder="t('Select rule type')"
                :options="ruleTypeOptions"
                :is-clearable="false"
                width="100%"
                @update:model-value="onRuleTypeChange"
              />
              <p v-if="isFixedPrice" class="prf-caption">{{ t('Set the price for each product in the Products section.') }}</p>
            </MpFormControl>

            <!-- Discount / markup amount (single-value types) -->
            <MpFormControl v-if="!isTierType && !isFixedPrice" id="prf-amount" class="prf-half" is-required :is-invalid="!!amountError">
              <MpFormLabel>{{ amountLabel }}</MpFormLabel>
              <MpInputGroup id="prf-amount-group" is-full-width>
                <MpInputLeftAddon v-if="isAmountType" has-background>Rp</MpInputLeftAddon>
                <MpInput
                  id="prf-amount-input" v-model="amount" type="number" is-full-width
                  :is-invalid="!!amountError" @update:model-value="amountError = ''"
                />
                <MpInputRightAddon v-if="!isAmountType" has-background>%</MpInputRightAddon>
              </MpInputGroup>
              <MpFormErrorMessage>{{ amountError }}</MpFormErrorMessage>
            </MpFormControl>

            <!-- Tier table (tier = quantity steps, subtotal_tier = subtotal steps; docs/patterns/FormTable.md) -->
            <div v-if="isTierType" id="prf-tiers" class="prf-full" data-devchange="price-rule-tier-table">
              <div class="prf-tier-head">
                <span class="prf-tier-title">{{ t('Tiers') }}<span class="prf-required">*</span></span>
                <span class="prf-caption">{{ isSubtotalTier ? t('The discount applies when the transaction subtotal reaches the minimum.') : t('The discount applies when the line quantity reaches the minimum.') }}</span>
              </div>
              <table class="prf-tier-table">
                <colgroup><col><col><col class="prf-tier-col-act"></colgroup>
                <thead>
                  <tr>
                    <th class="prf-tier-th">{{ isSubtotalTier ? t('Minimum subtotal') : t('Minimum quantity') }}</th>
                    <th class="prf-tier-th prf-tier-th--num">{{ t('Discount') }}</th>
                    <th class="prf-tier-th" />
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(row, i) in tiers" :key="row.key">
                    <td class="prf-tier-td prf-tier-td--input" :class="{ 'prf-tier-td--error': tierCellErrors[`${row.key}-threshold`] }">
                      <MpInputGroup :id="`prf-tier-${i}-threshold-group`" is-full-width>
                        <MpInputLeftAddon v-if="isSubtotalTier">Rp</MpInputLeftAddon>
                        <MpInput
                          :id="`prf-tier-${i}-threshold`" v-model="row.threshold" type="number" is-full-width
                          :aria-label="isSubtotalTier ? t('Minimum subtotal') : t('Minimum quantity')"
                          @update:model-value="clearTierCell(row.key, 'threshold')"
                        />
                      </MpInputGroup>
                    </td>
                    <td class="prf-tier-td prf-tier-td--input" :class="{ 'prf-tier-td--error': tierCellErrors[`${row.key}-discount`] }">
                      <MpInputGroup :id="`prf-tier-${i}-discount-group`" is-full-width>
                        <MpInput
                          :id="`prf-tier-${i}-discount`" v-model="row.discount" type="number" is-full-width class="prf-tier-num"
                          :aria-label="t('Discount')"
                          @update:model-value="clearTierCell(row.key, 'discount')"
                        />
                        <MpInputRightAddon>%</MpInputRightAddon>
                      </MpInputGroup>
                    </td>
                    <td class="prf-tier-td prf-tier-td--act">
                      <MpTooltip :id="`prf-rm-tier-${i}`" :label="t('Remove')" placement="top" use-portal>
                        <MpButton class="prf-remove" variant="ghost" type="button" :aria-label="t('Remove')" @click="removeTier(row.key)"><MpIcon name="minus-circular" size="sm" /></MpButton>
                      </MpTooltip>
                    </td>
                  </tr>
                </tbody>
              </table>
              <p v-if="tierError" class="prf-tier-error" role="alert">{{ tierError }}</p>
              <div class="prf-tier-foot">
                <MpButton id="prf-add-tier" variant="secondary" is-rounded left-icon="add" :is-disabled="tiers.length >= TIER_MAX" @click="addTier">{{ t('Add tier') }}</MpButton>
                <span class="prf-caption">{{ t('Up to 5 tiers.') }}</span>
              </div>
            </div>

            <!-- Allow changes on transaction (rule/checkbox-multiline-top) -->
            <div class="prf-full prf-checkbox" data-devchange="price-rule-allow-changes">
              <MpCheckbox
                id="prf-allow-override"
                :is-checked="allowOverride" @update:is-checked="(v: boolean) => (allowOverride = v)"
              >
                <span class="prf-check-label">
                  <span class="prf-check-title">{{ t('Allow changes on transaction') }}</span>
                  <span class="prf-check-caption">{{ t('When off, the price and discount this rule sets can\'t be edited on the transaction.') }}</span>
                </span>
              </MpCheckbox>
            </div>

            <!-- Status (rule/form-toggle-inline) -->
            <div class="prf-full prf-toggle-row">
              <MpToggle id="prf-status" :is-checked="isActive" @update:is-checked="(v: boolean) => (isActive = v)" />
              <span class="prf-toggle-label">{{ t('Active') }}</span>
            </div>
            <p class="prf-full prf-caption prf-caption--flush">{{ t('Changes apply to new transactions only. Saved transactions keep their prices.') }}</p>
          </div>
        </section>

        <!-- ═══ Contacts / Vendors ═══ -->
        <section id="prf-contacts" class="prf-section">
          <header class="prf-section-head">
            <h2 class="prf-section-title">{{ contactCopy.section }}</h2>
            <p class="prf-section-caption">{{ contactCopy.caption }}</p>
          </header>

          <div v-if="!contactIds.length" class="prf-empty">
            <img src="/illustrations/empty-folder.png" alt="" class="prf-empty-img" width="140" height="120" />
            <p class="prf-empty-title">{{ contactCopy.emptyTitle }}</p>
            <p class="prf-empty-caption">{{ contactCopy.emptyCaption }}</p>
            <MpButton
              :id="isPurchase ? 'prf-add-vendors' : 'prf-add-contacts'"
              class="prf-empty-cta" variant="secondary" is-rounded left-icon="add"
              @click="contactDrawerOpen = true"
            >{{ contactCopy.add }}</MpButton>
          </div>
          <div v-else class="prf-picked">
            <div class="prf-picked-head">
              <span class="prf-picked-count">{{ contactIds.length }} {{ t('selected') }}</span>
              <MpButton :id="isPurchase ? 'prf-add-vendors' : 'prf-add-contacts'" variant="secondary" is-rounded left-icon="add" @click="contactDrawerOpen = true">{{ contactCopy.add }}</MpButton>
            </div>
            <table class="prf-table">
              <thead><tr><th>{{ contactCopy.column }}</th><th class="prf-table-act" /></tr></thead>
              <tbody>
                <tr v-for="c in pickedContacts" :key="c.id">
                  <td>{{ c.name }}</td>
                  <td class="prf-table-act">
                    <MpTooltip :id="`prf-rm-contact-${c.id}`" :label="t('Remove')" placement="top" use-portal>
                      <MpButton class="prf-remove" variant="ghost" type="button" :aria-label="t('Remove')" @click="removeContact(c.id)"><MpIcon name="minus-circular" size="sm" /></MpButton>
                    </MpTooltip>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

        </section>

        <!-- ═══ Products (v5: products + live categories; fixed_price = price list) ═══ -->
        <section id="prf-products" class="prf-section" data-devchange="price-rule-category-scope">
          <header class="prf-section-head">
            <h2 class="prf-section-title">{{ t('Products') }}</h2>
            <p class="prf-section-caption">
              {{ isFixedPrice
                ? t('Select the products and set a fixed price for each.')
                : t('Select the products or categories this rule applies to. A category also covers products added to it later.') }}
            </p>
            <p v-if="categoriesClearedNote" class="prf-caption">{{ t('Categories were removed because a fixed price is set per product.') }}</p>
          </header>

          <div v-if="!productScopeCount" class="prf-empty">
            <img src="/illustrations/empty-folder.png" alt="" class="prf-empty-img" width="140" height="120" />
            <p class="prf-empty-title">{{ t('No products') }}</p>
            <p class="prf-empty-caption">
              {{ isFixedPrice
                ? t('Products will appear here. Add at least one product and set its price.')
                : t('Products will appear here. Leave empty to apply the rule to all products.') }}
            </p>
            <MpButton id="prf-add-products" class="prf-empty-cta" variant="secondary" is-rounded left-icon="add" @click="productDrawerOpen = true">{{ t('Add products') }}</MpButton>
            <p v-if="priceError" class="prf-tier-error" role="alert" data-invalid>{{ priceError }}</p>
          </div>
          <div v-else class="prf-picked">
            <div class="prf-picked-head">
              <span class="prf-picked-count">{{ productScopeCount }} {{ t('selected') }}</span>
              <MpButton id="prf-add-products" variant="secondary" is-rounded left-icon="add" @click="productDrawerOpen = true">{{ t('Add products') }}</MpButton>
            </div>
            <table id="prf-products-table" class="prf-table">
              <thead>
                <tr>
                  <th>{{ categoryIds.length ? t('Name') : t('Product name') }}</th>
                  <th>{{ t('Category') }}</th>
                  <th v-if="isFixedPrice" class="prf-price-th">{{ t('Fixed price') }}<span class="prf-required">*</span></th>
                  <th class="prf-table-act" />
                </tr>
              </thead>
              <tbody>
                <!-- Category rows: a live scope, not today's products -->
                <tr v-for="c in pickedCategories" :key="`cat-${c.name}`" :data-category="c.name">
                  <td>
                    <span class="prf-cell-name">{{ c.name }}</span>
                    <span class="prf-cell-sub">{{ t('Category') }}</span>
                  </td>
                  <td class="prf-cell-muted">{{ productsTodayLabel(c.count) }}</td>
                  <td class="prf-table-act">
                    <MpTooltip :id="`prf-rm-category-${c.name}`" :label="t('Remove')" placement="top" use-portal>
                      <MpButton class="prf-remove" variant="ghost" type="button" :aria-label="t('Remove')" @click="removeCategory(c.name)"><MpIcon name="minus-circular" size="sm" /></MpButton>
                    </MpTooltip>
                  </td>
                </tr>
                <tr v-for="(p, i) in pickedProducts" :key="p.id">
                  <td>
                    <span class="prf-cell-name">{{ p.name }}</span>
                    <span v-if="p.code" class="prf-cell-sub">{{ p.code }}</span>
                  </td>
                  <td>{{ p.category }}</td>
                  <!-- Fixed price cell (docs/patterns/FormTable.md: borderless input, cell owns ring) -->
                  <td v-if="isFixedPrice" class="prf-tier-td--input prf-price-td" :class="{ 'prf-tier-td--error': priceCellErrors[p.id] }">
                    <MpInputGroup :id="`prf-price-${i}-group`" is-full-width>
                      <MpInputLeftAddon>Rp</MpInputLeftAddon>
                      <MpInput
                        :id="`prf-price-${i}`" v-model="productPrices[p.id]" type="number" is-full-width class="prf-tier-num"
                        :aria-label="`${t('Fixed price')} · ${p.name}`"
                        @update:model-value="clearPriceCell(p.id)"
                      />
                    </MpInputGroup>
                  </td>
                  <td class="prf-table-act">
                    <MpTooltip :id="`prf-rm-product-${p.id}`" :label="t('Remove')" placement="top" use-portal>
                      <MpButton class="prf-remove" variant="ghost" type="button" :aria-label="t('Remove')" @click="removeProduct(p.id)"><MpIcon name="minus-circular" size="sm" /></MpButton>
                    </MpTooltip>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-if="priceError" class="prf-tier-error" role="alert" data-invalid>{{ priceError }}</p>
          </div>
        </section>
      </template>
    </div>

    <!-- ── Sticky footer (rule/btn-responsive-footer) ── -->
    <footer v-if="!notFound" class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpButtonGroup class="erp-action-footer">
        <MpButton variant="ghost" is-rounded @click="goBack">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded :is-disabled="isSaving" @click="handleSave">{{ isSaving ? t('Saving…') : (isEdit ? t('Save changes') : t('Save')) }}</MpButton>
      </MpButtonGroup>
    </footer>

    <!-- ── Pickers ── -->
    <PriceRuleSelectDrawer
      v-if="!notFound"
      id="prf-contacts-drawer"
      v-model:open="contactDrawerOpen"
      :title="contactCopy.drawerTitle"
      :list-title="contactCopy.listTitle"
      :options="contactOptions"
      :model-value="contactIds"
      :selected-title="contactCopy.selectedTitle"
      :empty-title="contactCopy.drawerEmptyTitle"
      :empty-caption="contactCopy.drawerEmptyCaption"
      :group-tab-label="t('Contact groups')"
      :groups="isPurchase ? vendorGroupOptions : customerGroupOptions"
      :groups-empty-title="t('No contact groups')"
      :groups-empty-caption="isPurchase ? t('Vendor groups with members will appear here.') : t('Customer groups with members will appear here.')"
      @save="onContactsSave"
    />
    <PriceRuleSelectDrawer
      v-if="!notFound"
      id="prf-products-drawer"
      v-model:open="productDrawerOpen"
      :title="t('Select products')"
      :list-title="t('Products')"
      :options="productOptions"
      :model-value="productIds"
      :selected-title="t('Selected products')"
      :empty-title="t('No selected products')"
      :empty-caption="t('Selected products will appear here.')"
      :group-tab-label="t('Categories')"
      :groups="categoryOptions"
      :groups-empty-title="t('No categories')"
      :groups-empty-caption="t('Categories will appear here.')"
      group-mode="scope"
      :groups-value="categoryIds"
      :group-kind-label="t('Category')"
      :groups-locked-caption="isFixedPrice ? t('A fixed price is set per product, so pick the products.') : undefined"
      @save="onProductsSave"
    />
  </div>
</template>

<style scoped>
/* ── Page shell (same as WarehouseTransferFormPage) ── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; height: auto; min-height: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; background: none; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-8); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); }
.detail-footer { flex-shrink: 0; display: flex; justify-content: flex-end; padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage, #ffffff); border-top: 1px solid transparent; transition: border-top-color 0.15s; }
.detail-footer--floating { border-top-color: var(--mp-colors-border-default, #e3e7e9); }

/* ── Sections (production: title + caption, then content) ── */
.prf-section + .prf-section { margin-top: var(--mp-spacing-10, 40px); }
.prf-section-head { margin-bottom: var(--mp-spacing-5, 20px); }
.prf-section-title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.prf-section-caption { margin: var(--mp-spacing-0\.5, 2px) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #626b79); }

/* ── Form: 6-column grid, max 558px, stacked (rule/form-field-stacking);
      selects at half width on their own row (rule/form-select-half). ── */
.prf-form { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); row-gap: var(--mp-spacing-5); column-gap: var(--mp-spacing-6); max-width: 558px; }
.prf-full { grid-column: 1 / -1; }
.prf-half { grid-column: 1 / span 3; }
.prf-label-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-2); }
.prf-counter, .prf-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #626b79); }
.prf-caption { margin-top: var(--mp-spacing-1); }
.prf-caption--flush { margin-top: calc(var(--mp-spacing-5) * -1 + var(--mp-spacing-1)); }

/* Active period: manual reset × (the range picker has no clear of its own). */
.prf-period { position: relative; }
.prf-period-clear { position: absolute; top: 50%; right: 36px; transform: translateY(-50%); display: inline-flex; }
.prf-period-clear-btn { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; min-height: 0; padding: 0; border: none; background: none; border-radius: var(--mp-radii-full, 999px); color: var(--mp-icon-default, #536062); }

/* ── Empty states (rule/empty-state-structure) ── */
.prf-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); text-align: center; padding: var(--mp-spacing-4) 0 var(--mp-spacing-6); }
.prf-empty-img { width: 140px; height: 120px; object-fit: contain; margin-bottom: var(--mp-spacing-2); }
.prf-empty-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.prf-empty-caption { margin: 0; max-width: 360px; font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-secondary, #626b79); }
.prf-empty-cta { margin-top: var(--mp-spacing-3); }

/* ── Picked contacts / products: compact table ── */
.prf-picked { max-width: 720px; }
.prf-picked-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-3); }
.prf-picked-count { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-secondary, #626b79); }
.prf-table { width: 100%; border-collapse: collapse; font-size: var(--mp-font-sizes-md); }
.prf-table th { text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-secondary, #626b79); background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); }
.prf-table td { padding: var(--mp-spacing-2) var(--mp-spacing-3); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); vertical-align: middle; }
.prf-table-act { width: 48px; text-align: right; }
.prf-cell-name { display: block; }
.prf-cell-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #626b79); }
.prf-cell-muted { color: var(--mp-colors-text-secondary, #626b79); }
/* Fixed price column: an editable FormTable cell inside the picked-products table. */
.prf-price-th { width: 200px; text-align: right !important; }
.prf-price-td { padding: 0 !important; border-left: 1px solid var(--mp-colors-border-default, #e3e7e9); border-right: 1px solid var(--mp-colors-border-default, #e3e7e9); }
.prf-remove { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; min-height: 0; padding: 0; border: none; background: none; border-radius: var(--mp-radii-full, 999px); color: var(--mp-colors-text-secondary, #626b79); }

/* ── Tier table (docs/patterns/FormTable.md: native table, internal column
      borders, borderless inputs, cell owns focus/error ring via ::after) ── */
.prf-tier-head { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); margin-bottom: var(--mp-spacing-2); }
.prf-tier-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default, #232933); }
.prf-required { margin-left: var(--mp-spacing-0\.5); color: var(--mp-colors-text-danger, #da473f); }
.prf-tier-table { width: 100%; border-collapse: collapse; table-layout: fixed; border-top: 1px solid var(--mp-colors-border-default, #e3e7e9); border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); }
.prf-tier-col-act { width: 48px; }
.prf-tier-th { text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-secondary, #626b79); background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); border-right: 1px solid var(--mp-colors-border-default, #e3e7e9); }
.prf-tier-th--num { text-align: right; }
.prf-tier-td { border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); border-right: 1px solid var(--mp-colors-border-default, #e3e7e9); }
.prf-tier-th:last-child, .prf-tier-td:last-child { border-right: none; }
.prf-tier-td--input { padding: 0; position: relative; background: var(--mp-background-neutral, #ffffff); }
.prf-tier-td--input:focus-within::after { content: ''; position: absolute; inset: 0; border: 1px solid var(--mp-colors-border-bold, #8f97a3); z-index: 2; pointer-events: none; }
.prf-tier-td--input :deep([class*='input']) { border-color: transparent; border-radius: 0; box-shadow: none !important; background: transparent; } /* zeroing Pixel's own input shadow, not adding one — pixel-police-allow-shadow */
.prf-tier-td--input :deep(input) { height: var(--mp-sizes-10, 40px); font-variant-numeric: tabular-nums; }
.prf-tier-num :deep(input), .prf-tier-num { text-align: right; }
.prf-tier-td--error { background: var(--mp-background-danger-subtle, #fceeed); }
.prf-tier-td--error::after { content: ''; position: absolute; inset: 0; border: 1px solid var(--mp-colors-border-danger, #e2483d); z-index: 2; pointer-events: none; }
.prf-tier-td--error:focus-within::after { border-color: var(--mp-colors-border-danger, #e2483d); }
.prf-tier-td--act { text-align: center; padding: 0; }
.prf-tier-error { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-danger, #da473f); }
.prf-tier-foot { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-3); }
.prf-tier-foot .prf-caption { margin-top: 0; }

/* ── Allow changes on transaction ── */
/* rule/checkbox-multiline-top: title + caption → box aligned to the first line. */
.prf-checkbox :deep(.mp-checkbox__root) { align-items: flex-start; }
.prf-checkbox :deep(.mp-checkbox__label), .prf-check-label { white-space: normal; }
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
