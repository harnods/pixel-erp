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
 * Purchase Price Rule additions: a rule is Sales (customers) or Purchase
 * (vendors). Products are stored by id; the Categories / Contact groups tabs are
 * only shortcuts that add their members (never re-resolved later). Purchase rules
 * carry the vendor's PKP status: checked = PKP (product PPN applies), unchecked =
 * Non-PKP (PPN not applied, PPh untouched). A vendor must keep the same PKP status
 * on every rule — saving is blocked inline while `purchasePkpConflict` finds a
 * clash. Rule changes only affect new transactions.
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
  purchasePkpConflict, vendorPkpStatus,
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
/** Active period — optional here (prototype rules are open-ended); null = always. */
const period = ref<Date[] | null>(
  initial.startDate || initial.endDate
    ? [isoToDate(initial.startDate || initial.endDate)!, isoToDate(initial.endDate || initial.startDate)!]
    : null,
)
const isActive = ref(initial.status === 'active')

const nameError = ref('')
const amountError = ref('')
const pkpError = ref('')
const typeSwitchNote = ref(false)

// ── Options ──────────────────────────────────────────────────────────────────────
const isPurchase = computed(() => transactionType.value === 'purchase')
const transactionTypeOptions = PRICE_RULE_TRANSACTION_TYPES.map(v => ({ value: v, label: t(PRICE_RULE_TRANSACTION_TYPE_LABEL[v]) }))
/** Production order; the two markups sit under a "MARKUP" group heading. */
const ruleTypeOptions = computed(() =>
  PRICE_RULE_TYPES_BY_TRANSACTION[transactionType.value].map(v => ({
    value: v,
    label: t(PRICE_RULE_TYPE_LABEL[v]),
    ...(PRICE_RULE_MARKUP_TYPES.includes(v) ? { group: t('MARKUP') } : {}),
  })),
)
const isMarkup = computed(() => PRICE_RULE_MARKUP_TYPES.includes(ruleType.value))
/** Price amount types are Rp per unit; every other type is a %. */
const isAmountType = computed(() => ruleType.value === 'value' || ruleType.value === 'markup_value')
/** Sales-only tier shapes — production has tier tables; the prototype doesn't model them. */
const isTierType = computed(() => ['tier', 'subtotal_tier', 'end_discount'].includes(ruleType.value))

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
const categoryOptions: PriceRulePickGroup[] = [...new Set(products.map(p => p.category))].sort().map((cat) => {
  const memberIds = products.filter(p => p.category === cat).map(p => p.id)
  return { id: `cat-${cat}`, name: cat, subtitle: `${memberIds.length} ${memberIds.length === 1 ? t('product') : t('products')}`, memberIds }
})

function contactName(id: string) { return contactOptions.value.find(c => c.id === id)?.name ?? id }
const pickedContacts = computed(() => contactIds.value.map(id => ({ id, name: contactName(id) })))
const pickedProducts = computed(() =>
  productIds.value.map((id) => {
    const p = products.find(x => x.id === id)
    return { id, name: p?.name ?? id, code: p?.code ?? '', category: p?.category ?? '' }
  }),
)

// ── Drawers ──────────────────────────────────────────────────────────────────────
const contactDrawerOpen = ref(false)
const productDrawerOpen = ref(false)

function onContactsSave(ids: string[]) {
  const hadNone = contactIds.value.length === 0
  contactIds.value = ids
  pkpError.value = ''
  // Prefill PKP from the vendor's existing rules so the first pick doesn't clash.
  if (isPurchase.value && ids.length) {
    const known = vendorPkpStatus(ids[0]!) ?? ids.map(id => vendorPkpStatus(id)).find(v => v !== null) ?? null
    if (known !== null) pkpChecked.value = known
    else if (hadNone) pkpChecked.value = true
  }
}
function removeContact(id: string) { contactIds.value = contactIds.value.filter(x => x !== id); pkpError.value = '' }
function onProductsSave(ids: string[]) { productIds.value = ids }
function removeProduct(id: string) { productIds.value = productIds.value.filter(x => x !== id) }

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
  return JSON.stringify([name.value, transactionType.value, ruleType.value, amount.value, contactIds.value, productIds.value, pkpChecked.value, period.value?.map(dateToIso) ?? null, isActive.value])
}
const initialSnapshot = snapshot()
const { disableGuard } = useUnsavedChangesGuard({ hasUnsavedChanges: () => !notFound.value && snapshot() !== initialSnapshot })

// ── Navigation + save ──────────────────────────────────────────────────────────
function goBack() { router.push('/price-rules') }

const isSaving = ref(false)
async function handleSave() {
  nameError.value = ''
  amountError.value = ''
  pkpError.value = ''
  let valid = true
  if (!name.value.trim()) { nameError.value = t('You must fill in rule name'); valid = false }
  const n = Number(amount.value)
  if (!amount.value || !Number.isFinite(n) || n <= 0) { amountError.value = t('You must fill in an amount above 0'); valid = false }
  else if (!isAmountType.value && !isMarkup.value && n > 100) { amountError.value = t('Percentage cannot be more than 100'); valid = false }
  const pkp = isPurchase.value && contactIds.value.length > 0 ? pkpChecked.value : null
  if (pkp !== null) {
    const clash = purchasePkpConflict(contactIds.value, pkp, editing.value?.id)
    if (clash) {
      // One template so the ID translation can reorder; replacements after t().
      pkpError.value = t('{vendor} is {status} on “{rule}”. Use the same PKP status on every rule for this vendor')
        .replace('{vendor}', clash.vendorName)
        .replace('{status}', clash.rule.vendorPkp ? t('PKP') : t('Non-PKP'))
        .replace('{rule}', clash.rule.name)
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
            <MpFormControl id="prf-rule-type" class="prf-half" is-required>
              <MpFormLabel>{{ t('Rule type') }}</MpFormLabel>
              <ErpFilterSelect
                id="prf-rule-type-select"
                :model-value="ruleType"
                :placeholder="t('Select rule type')"
                :options="ruleTypeOptions"
                :is-clearable="false"
                width="100%"
                @update:model-value="(v: string) => { if (v) { ruleType = v as PriceRuleType; amountError = '' } }"
              />
              <p v-if="isTierType" class="prf-caption">{{ t('Tier setup isn\'t part of this prototype.') }}</p>
            </MpFormControl>

            <!-- Discount / markup amount -->
            <MpFormControl id="prf-amount" class="prf-half" is-required :is-invalid="!!amountError">
              <MpFormLabel>{{ isMarkup ? t('Markup') : t('Discount') }}</MpFormLabel>
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

          <!-- PKP vendor (purchase only) -->
          <MpFormControl
            v-if="isPurchase" id="prf-pkp" class="prf-pkp"
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
        </section>

        <!-- ═══ Products ═══ -->
        <section id="prf-products" class="prf-section">
          <header class="prf-section-head">
            <h2 class="prf-section-title">{{ t('Products') }}</h2>
            <p class="prf-section-caption">{{ t('Select the products that this rule applies to.') }}</p>
          </header>

          <div v-if="!productIds.length" class="prf-empty">
            <img src="/illustrations/empty-folder.png" alt="" class="prf-empty-img" width="140" height="120" />
            <p class="prf-empty-title">{{ t('No products') }}</p>
            <p class="prf-empty-caption">{{ t('Products will appear here. Leave empty to apply the rule to all products.') }}</p>
            <MpButton id="prf-add-products" class="prf-empty-cta" variant="secondary" is-rounded left-icon="add" @click="productDrawerOpen = true">{{ t('Add products') }}</MpButton>
          </div>
          <div v-else class="prf-picked">
            <div class="prf-picked-head">
              <span class="prf-picked-count">{{ productIds.length }} {{ t('selected') }}</span>
              <MpButton id="prf-add-products" variant="secondary" is-rounded left-icon="add" @click="productDrawerOpen = true">{{ t('Add products') }}</MpButton>
            </div>
            <table class="prf-table">
              <thead><tr><th>{{ t('Product name') }}</th><th>{{ t('Category') }}</th><th class="prf-table-act" /></tr></thead>
              <tbody>
                <tr v-for="p in pickedProducts" :key="p.id">
                  <td>
                    <span class="prf-cell-name">{{ p.name }}</span>
                    <span v-if="p.code" class="prf-cell-sub">{{ p.code }}</span>
                  </td>
                  <td>{{ p.category }}</td>
                  <td class="prf-table-act">
                    <MpTooltip :id="`prf-rm-product-${p.id}`" :label="t('Remove')" placement="top" use-portal>
                      <MpButton class="prf-remove" variant="ghost" type="button" :aria-label="t('Remove')" @click="removeProduct(p.id)"><MpIcon name="minus-circular" size="sm" /></MpButton>
                    </MpTooltip>
                  </td>
                </tr>
              </tbody>
            </table>
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
      :group-tab-label="isPurchase ? undefined : t('Contact groups')"
      :groups="isPurchase ? undefined : customerGroupOptions"
      :groups-empty-title="t('No contact groups')"
      :groups-empty-caption="t('Customer groups with members will appear here.')"
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
.prf-remove { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; min-height: 0; padding: 0; border: none; background: none; border-radius: var(--mp-radii-full, 999px); color: var(--mp-colors-text-secondary, #626b79); }

/* ── PKP vendor ── */
.prf-pkp { margin-top: var(--mp-spacing-5); max-width: 558px; }
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
