<script setup lang="ts">
/**
 * Inventory › Price rules — index of Sales (customers) and Purchase (vendors)
 * price rules (Purchase Price Rule one-pager; ships in Jurnal and Mekari ERP).
 * Create/edit is the full-page PriceRuleFormPage (/price-rules/new,
 * /price-rules/:id/edit); "New price rule" lives in the [...slug].vue title bar.
 *
 * Deliberate departures from docs/design/RULES.md:
 * - Default sort is newest first, not alphabetical (rule/table-default-sort-alpha):
 *   rule changes only affect new transactions, so the latest rule is what users
 *   look for first.
 * - The row menu has no "View details" (index-page-format): there is no detail
 *   page — the rule name opens the edit form.
 *
 * v4 (DECIDED 17 Nov): no Outlets column and no PKP in the contacts summary —
 * an outlet deal is its own named rule, PKP lives on the vendor master. A rule
 * with "Allow changes on transaction" off shows a quiet "Locked" note.
 *
 * v5 (DECIDED 19 Nov): Products summarises the live category scope plus named
 * products ("1 category · 3 products"); a fixed price rule reads
 * "Price list · 3 products" in the Discount column.
 */
import { computed, onMounted, ref } from 'vue'
import {
  MpButton, MpIcon, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { successToast } from '~/utils/toasts'
import {
  priceRules, deletePriceRule,
  PRICE_RULE_TRANSACTION_TYPES, PRICE_RULE_TRANSACTION_TYPE_LABEL,
  type PriceRule,
} from '~/data/priceRules'

const { t } = useLocale()
const router = useRouter()

// ─── Scenario (demo) ────────────────────────────────────────────────────────────
const scenario = ref('data')

// ─── Columns ────────────────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'name', label: t('Rule name'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'transactionType', label: t('Transaction type'), kind: 'default' },
  { key: 'contacts', label: t('Customers / vendors'), kind: 'default' },
  { key: 'products', label: t('Products'), kind: 'default' },
  { key: 'discount', label: t('Discount'), kind: 'amount' },
  { key: 'period', label: t('Period'), kind: 'default' },
  { key: 'status', label: t('Status'), kind: 'status' },
]

// ─── Display helpers ───────────────────────────────────────────────────────────
function contactsSummary(r: PriceRule): string {
  const n = r.contactIds.length
  if (r.transactionType === 'sales') {
    if (!n) return t('All customers')
    return n === 1 ? t('1 customer') : `${n} ${t('customers')}`
  }
  if (!n) return t('All vendors')
  return n === 1 ? t('1 vendor') : `${n} ${t('vendors')}`
}
function productCount(n: number): string {
  return n === 1 ? t('1 product') : `${n} ${t('products')}`
}
/** Live categories + named products, e.g. "1 category · 3 products". */
function productsSummary(r: PriceRule): string {
  const c = r.categoryIds?.length ?? 0
  const n = r.productIds.length
  if (!c && !n) return t('All products')
  const parts: string[] = []
  if (c) parts.push(c === 1 ? t('1 category') : `${c} ${t('categories')}`)
  if (n) parts.push(productCount(n))
  return parts.join(' · ')
}
/** Tier types show their discount range across steps, e.g. "5–8%". */
function tierRange(r: PriceRule): string {
  if (!r.tiers.length) return '–'
  const ds = r.tiers.map(x => x.discount)
  const lo = Math.min(...ds)
  const hi = Math.max(...ds)
  return lo === hi ? `${lo}%` : `${lo}–${hi}%`
}
function discountLabel(r: PriceRule): string {
  switch (r.ruleType) {
    case 'percent': return `${r.amount}%`
    case 'value': return `${formatIDR(r.amount)} / ${t('unit')}`
    case 'tier':
    case 'subtotal_tier': return tierRange(r)
    case 'end_discount': return `${formatIDR(r.amount)} / ${t('unit')}`
    case 'markup_percent': return `+${r.amount}%`
    case 'markup_value': return `+${formatIDR(r.amount)} / ${t('unit')}`
    case 'fixed_price': return `${t('Price list')} · ${productCount(r.productIds.length)}`
  }
}
function periodLabel(r: PriceRule): string {
  if (!r.startDate && !r.endDate) return t('Always')
  if (r.startDate && r.endDate) return `${formatDate(r.startDate)} – ${formatDate(r.endDate)}`
  if (r.startDate) return `${t('From')} ${formatDate(r.startDate)}`
  return `${t('Until')} ${formatDate(r.endDate)}`
}

interface PriceRuleRow extends Record<string, unknown> {
  id: string
  name: string
  transactionType: string
  contacts: string
  products: string
  discount: string
  period: string
  status: string
  /** "Allow changes on transaction" off → price + discount read-only. */
  locked: boolean
  /** Has a live category scope (v5). */
  hasCategories: boolean
  /** 'Fixed price per product' rule (v5). */
  fixedPrice: boolean
}

// ─── Quick filter: Transaction type ────────────────────────────────────────────
const typeFilter = ref('')
const typeOptions = PRICE_RULE_TRANSACTION_TYPES.map(v => ({ value: v, label: t(PRICE_RULE_TRANSACTION_TYPE_LABEL[v]) }))

const allRows = computed<PriceRuleRow[]>(() => (scenario.value === 'empty' ? [] : priceRules()).map(r => ({
  id: r.id,
  name: r.name,
  transactionType: r.transactionType,
  contacts: contactsSummary(r),
  products: productsSummary(r),
  discount: discountLabel(r),
  period: periodLabel(r),
  status: r.status,
  locked: !r.allowOverride,
  hasCategories: (r.categoryIds?.length ?? 0) > 0,
  fixedPrice: r.ruleType === 'fixed_price',
})))
const rows = computed(() => (typeFilter.value ? allRows.value.filter(r => r.transactionType === typeFilter.value) : allRows.value))

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<PriceRuleRow>(rows, {
  perPage: 25,
  filterFn: (row, s) =>
    !s || row.name.toLowerCase().includes(s) || row.contacts.toLowerCase().includes(s),
})

const hasActiveFilter = computed(() => !!search.value.trim() || !!typeFilter.value)
function clearFilters() {
  search.value = ''
  typeFilter.value = ''
}

// ─── Loading (first paint) ─────────────────────────────────────────────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 600) })

// ─── Navigation ────────────────────────────────────────────────────────────────
function openNew() { router.push('/price-rules/new') }
function openEdit(id: string) { router.push(`/price-rules/${id}/edit`) }

// ─── Delete ────────────────────────────────────────────────────────────────────
const deleteTarget = ref<PriceRuleRow | null>(null)
const deleteOpen = computed({
  get: () => !!deleteTarget.value,
  set: (v: boolean) => { if (!v) deleteTarget.value = null },
})
function confirmDelete() {
  const r = deleteTarget.value
  if (!r) return
  deletePriceRule(r.id)
  deleteTarget.value = null
  successToast(t('Price rule deleted'))
}

const emptyIllustration = '/illustrations/empty-folder.png'
const asRule = (row: unknown) => row as PriceRuleRow
</script>

<template>
  <ErpTablePage
    :columns="columns"
    :rows="(paginated as unknown as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :loading="loading"
    :search="search"
    :has-active-search="!!search.trim()"
    :has-active-filter="hasActiveFilter"
    filter-empty-label="price rule"
    bulk-label="price rule"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @clear-filters="clearFilters"
  >
    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left" data-devchange="purchase-price-rules-index">
        <ErpFilterSelect
          id="prl-type-filter"
          v-model="typeFilter"
          :placeholder="t('Transaction type')"
          :options="typeOptions"
        />
      </div>
      <div class="filter-right">
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')">
          <MpButton
            v-if="search" variant="ghost" class="filter-search-clear"
            left-icon="close" :aria-label="t('Clear search')" @click="search = ''"
          />
        </div>
      </div>
    </template>

    <!-- ── Cells ── -->
    <template #cell-name="{ value, row }">
      <span class="prl-name">
      <span
        class="cell-link prl-name-link" role="button" tabindex="0" :title="String(value)"
        @click.stop="openEdit(asRule(row).id)" @keydown.enter="openEdit(asRule(row).id)"
      >{{ value }}</span>
      <MpTooltip
        v-if="asRule(row).locked" :id="`prl-locked-${asRule(row).id}`"
        :label="t('Price and discount from this rule can\'t be edited on the transaction.')"
        placement="top" use-portal
      >
        <span class="prl-locked" data-devchange="price-rule-allow-changes">{{ t('Locked') }}</span>
      </MpTooltip>
      </span>
    </template>

    <template #cell-transactionType="{ value }">
      {{ t(PRICE_RULE_TRANSACTION_TYPE_LABEL[value as 'sales' | 'purchase']) }}
    </template>

    <template #cell-products="{ value, row }">
      <span :data-devchange="asRule(row).hasCategories ? 'price-rule-category-scope' : undefined">{{ value }}</span>
    </template>

    <template #cell-discount="{ value, row }">
      <span :data-devchange="asRule(row).fixedPrice ? 'price-rule-fixed-price' : undefined">{{ value }}</span>
    </template>

    <template #cell-status="{ value }">
      <ErpStatusBadge :status="String(value)" :label="value === 'active' ? t('Active') : t('Inactive')" />
    </template>

    <!-- ── Row actions (no tooltip on the kebab — rule/table-actions-no-tooltip) ── -->
    <template #actions="{ row }">
      <MpPopover
        :id="`prl-actions-${asRule(row).id}`"
        is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end"
      >
        <MpPopoverTrigger>
          <MpButton variant="ghost" class="row-kebab" left-icon="menu-kebab" :aria-label="t('More actions')" />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="openEdit(asRule(row).id)">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem
              :class="css({ color: 'var(--mp-colors-text-critical, #d93b3b)' })"
              @click="deleteTarget = asRule(row)"
            >{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Empty state (never had data) ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240">
        <p class="empty-full-title">{{ t('No price rules') }}</p>
        <p class="empty-full-desc">{{ t('Price rules will appear here.') }}</p>
        <MpButton variant="secondary" is-rounded left-icon="add" @click="openNew">{{ t('New price rule') }}</MpButton>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Delete ── -->
  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete price rule?')"
    :description="t('Deleted price rule cannot be restored. Transactions already created keep their prices.')"
    :confirm-label="t('Delete price rule')"
    @confirm="confirmDelete"
  />

  <ScenarioFab v-model="scenario" />
</template>

<style scoped>
/* ── Filter bar ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-left: auto; }
.filter-search-input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-colors-text-default, #232933);
}
.filter-search-clear {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-5, 20px) !important; height: var(--mp-sizes-5, 20px) !important;
  min-width: 0 !important; padding: 0 !important;
}

/* rule/table-actions-column: a single 38px button in the 44px column, top-aligned. */
.row-kebab {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9\.5, 38px) !important; height: var(--mp-sizes-9\.5, 38px) !important;
  min-width: 0 !important; padding: 0 !important;
  margin-left: auto;
}

/* Long rule names truncate inside the column (no overlap with Transaction type). */
.prl-name { display: flex; align-items: center; min-width: 0; max-width: 100%; }
.prl-name-link { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.prl-name :deep(.mp-tooltip), .prl-locked { flex-shrink: 0; white-space: nowrap; }
/* Quiet "Locked" note after the rule name (allowOverride off). */
.prl-locked {
  margin-left: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary, #626b79);
}

/* ── Empty state ── */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-colors-text-default, #232933);
}
.empty-full-desc {
  margin-top: var(--mp-spacing-0\.5); margin-bottom: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-secondary, #626b79);
}
</style>
