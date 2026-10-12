<script setup lang="ts">
/**
 * Payroll payables (FG-5): a tracker. One row per payable per period: owed, paid, balance,
 * due date, status. Payments arrive as bank reconciliation matches (payrollStore
 * simulateBankPayment); this screen records none itself. Every figure comes from posted
 * journals and bank-matched payments in payrollStore.
 */
import {
  MpButton, MpIcon, MpBadge, MpSegmentedControl, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import PayrollPayableDetail from '~/components/payroll/PayrollPayableDetail.vue'
import { payablesTracker, rupiah, monthLabel, dateLabel, today, accountLabel, type PayableRow } from '~/data/payrollStore'
import { paymentHistory } from '~/data/payrollUiPayables'

const { t } = useLocale()
const route = useRoute()

// ─── View ───────────────────────────────────────────────────────────────────
type View = 'payables' | 'payments'
const view = ref<View>((['payables', 'payments'].includes(String(route.query.tab)) ? route.query.tab : 'payables') as View)
const viewOptions = computed(() => [
  { id: 'pp-v-payables', label: t('Payables'), value: 'payables' },
  { id: 'pp-v-payments', label: t('Payments'), value: 'payments' },
])

// ─── Rows ───────────────────────────────────────────────────────────────────
const all = computed(() => payablesTracker())
const months = computed(() => [...new Set(all.value.map((r) => r.month))].sort().reverse())
const monthFilter = ref(typeof route.query.month === 'string' ? route.query.month : '')
const partyFilter = ref('')
const stateFilter = ref('')
const search = ref('')
const monthOptions = computed(() => months.value.map((m) => ({ value: m, label: monthLabel(m) })))
const partyOptions = computed(() => [...new Set(all.value.map((r) => r.party))].map((p) => ({ value: p, label: p === 'Staff' ? t('Salary') : p })))

const stateOf = (r: PayableRow) => (r.balance < 0 ? 'overpaid' : r.overdueDays ? 'overdue' : r.balance > 0 ? 'open' : 'paid')
const filtered = computed(() => all.value.filter((r) =>
  (!monthFilter.value || r.month === monthFilter.value)
  && (!partyFilter.value || r.party === partyFilter.value)
  && (!stateFilter.value || (stateFilter.value === 'open' ? r.balance > 0 : stateOf(r) === stateFilter.value))
  && (!search.value || r.label.toLowerCase().includes(search.value.toLowerCase().trim()))))
const hasActiveFilter = computed(() => !!(monthFilter.value || partyFilter.value || stateFilter.value || search.value))
function clearFilters() { monthFilter.value = ''; partyFilter.value = ''; stateFilter.value = ''; search.value = '' }

const currentPage = ref(1)
const perPage = ref(25)
watch([monthFilter, partyFilter, stateFilter, search], () => { currentPage.value = 1 })
const paginated = computed(() => filtered.value.slice((currentPage.value - 1) * perPage.value, currentPage.value * perPage.value))

const columns: TableColumn[] = [
  { key: 'label', label: t('Payable'), kind: 'name' },
  { key: 'owed', label: t('Owed'), kind: 'amount', align: 'right' },
  { key: 'paid', label: t('Paid'), kind: 'amount', align: 'right' },
  { key: 'balance', label: t('Balance'), kind: 'amount', align: 'right' },
  { key: 'dueLabel', label: t('Due date'), kind: 'date' },
  { key: 'status', label: t('Status'), kind: 'status' },
]
const tableRows = computed(() => paginated.value as unknown as Record<string, unknown>[])
const asRow = (r: unknown) => r as PayableRow

function badgeType(r: PayableRow) {
  const s = stateOf(r)
  return s === 'overdue' ? 'critical' : s === 'overpaid' || s === 'open' ? 'warning' : r.paidLateDays ? 'information' : 'completed'
}

// ─── Stats ──────────────────────────────────────────────────────────────────
function addDaysIso(d: string, n: number) { return new Date(Date.parse(d + 'T00:00:00Z') + n * 86_400_000).toISOString().slice(0, 10) }
const openRows = computed(() => all.value.filter((r) => r.balance > 0))
const overdueRows = computed(() => all.value.filter((r) => r.overdueDays > 0))
const thisMonth = computed(() => today().slice(0, 7))
const dueSoon = computed(() => openRows.value.filter((r) => r.due && !r.overdueDays && r.due <= addDaysIso(today(), 15)))
const paidThisMonth = computed(() => paymentHistory.value.filter((p) => p.date.startsWith(thisMonth.value)))
const sum = (rows: PayableRow[]) => rows.reduce((s, r) => s + r.balance, 0)
function drill(state: string) { clearFilters(); stateFilter.value = state; view.value = 'payables' }

// ─── Actions ────────────────────────────────────────────────────────────────
const detailOpen = ref(false)
const active = ref<PayableRow | null>(null)
function openDetail(r: PayableRow) { active.value = r; detailOpen.value = true }

// ─── Payments ───────────────────────────────────────────────────────────────
const paymentColumns: TableColumn[] = [
  { key: 'number', label: t('Number'), kind: 'number' },
  { key: 'dateLabel', label: t('Date'), kind: 'date' },
  { key: 'payable', label: t('Payable'), kind: 'name' },
  { key: 'bank', label: t('Paid from'), kind: 'name' },
  { key: 'statement', label: t('Bank statement line'), kind: 'default' },
  { key: 'amount', label: t('Amount'), kind: 'amount', align: 'right' },
]
const payPage = ref(1)
const payPerPage = ref(25)
const paymentRows = computed(() => paymentHistory.value.slice((payPage.value - 1) * payPerPage.value, payPage.value * payPerPage.value) as unknown as Record<string, unknown>[])
type PayHist = (typeof paymentHistory.value)[number]
const asPay = (r: unknown) => r as PayHist
</script>

<template>
  <div class="pp">
    <div class="pp-head">
      <MpSegmentedControl id="pp-view" v-model="view" name="pp-view" :data="viewOptions" />
    </div>

    <!-- ── Payables ── -->
    <ErpTablePage
      v-if="view === 'payables'"
      data-tour="payroll-payables"
      :columns="columns"
      :rows="tableRows"
      :total="filtered.length"
      :current-page="currentPage"
      :per-page="perPage"
      :has-checkbox="false"
      :has-active-filter="hasActiveFilter"
      :search="search"
      filter-empty-label="payable"
      bulk-label="period"
      @page-change="(p: number) => (currentPage = p)"
      @per-page-change="(n: number) => (perPage = n)"
      @clear-filters="clearFilters"
    >
      <template #stats>
        <div class="stats-section">
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Open') }}</div>
            <div class="stat-period">{{ t('Owed less paid') }} · {{ dateLabel(today()) }}</div>
            <div class="stat-amount">{{ rupiah(sum(openRows)) }}</div>
            <a class="stat-link" @click="drill('open')">{{ openRows.length }} {{ t(openRows.length === 1 ? 'payable' : 'payables') }}</a>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Overdue') }}</div>
            <div class="stat-period">{{ t('Open past the due date') }}</div>
            <div class="stat-amount" :class="{ 'stat-amount--danger': overdueRows.length }">{{ rupiah(sum(overdueRows)) }}</div>
            <a class="stat-link" @click="drill('overdue')">{{ overdueRows.length }} {{ t(overdueRows.length === 1 ? 'payable' : 'payables') }}</a>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Due in 15 days') }}</div>
            <div class="stat-period">{{ t('Open, not yet due') }}</div>
            <div class="stat-amount">{{ rupiah(sum(dueSoon)) }}</div>
            <a class="stat-link" @click="drill('open')">{{ dueSoon.length }} {{ t(dueSoon.length === 1 ? 'payable' : 'payables') }}</a>
          </div>
          <div class="stat-card">
            <div class="stat-title">{{ t('Paid') }}</div>
            <div class="stat-period">{{ monthLabel(thisMonth) }}</div>
            <div class="stat-amount">{{ rupiah(paidThisMonth.reduce((s, p) => s + p.amount, 0)) }}</div>
            <a class="stat-link" @click="view = 'payments'">{{ paidThisMonth.length }} {{ t(paidThisMonth.length === 1 ? 'payment' : 'payments') }}</a>
          </div>
        </div>
      </template>

      <template #filters>
        <div class="filter-left">
          <ErpFilterSelect id="pp-month" v-model="monthFilter" :placeholder="t('Period')" :options="monthOptions" />
          <ErpFilterSelect id="pp-party" v-model="partyFilter" :placeholder="t('Party')" :options="partyOptions" />
          <MpButton v-if="hasActiveFilter" variant="ghost" is-rounded @click="clearFilters">{{ t('Clear filters') }}</MpButton>
        </div>
        <div class="filter-right">
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
          </div>
        </div>
      </template>

      <template #cell-label="{ row }">
        <div class="pp-cell">
          <span class="pp-name" @click="openDetail(asRow(row))">{{ asRow(row).label }}</span>
          <span class="pp-sub">{{ accountLabel(asRow(row).account) }}</span>
          <span v-for="f in asRow(row).flags" :key="f.code + f.message" class="pp-warn">{{ f.message }}</span>
        </div>
      </template>
      <template #cell-owed="{ row }"><span class="pp-fig" @click="openDetail(asRow(row))">{{ rupiah(asRow(row).owed) }}</span></template>
      <template #cell-paid="{ row }"><span class="pp-fig" @click="openDetail(asRow(row))">{{ rupiah(asRow(row).paid) }}</span></template>
      <template #cell-balance="{ row }">
        <div class="pp-cell">
          <span :class="{ 'pp-danger': asRow(row).overdueDays }">{{ rupiah(asRow(row).balance) }}</span>
          <span v-if="asRow(row).pendingOwed != null" class="pp-sub">{{ t('After correction') }} {{ rupiah(asRow(row).pendingOwed! - asRow(row).paid) }}</span>
        </div>
      </template>
      <template #cell-status="{ row }">
        <MpBadge for="tableStatus" :type="badgeType(asRow(row))">{{ t(asRow(row).statusLabel) }}</MpBadge>
      </template>

      <template #actions="{ row }">
        <MpPopover :id="`pp-row-${asRow(row).key.replace(/\W/g, '')}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Row actions')" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="openDetail(asRow(row))">{{ t('View lines') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="asRow(row).runId" @click="navigateTo(`/payroll-runs/${asRow(row).runId}`)">{{ t('Open run') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>

      <template #empty>
        <div class="pp-empty">
          <p class="pp-empty-title">{{ t('No payroll payables yet') }}</p>
          <p class="pp-empty-desc">{{ t('Payables show here once a payroll run posts.') }}</p>
        </div>
      </template>
    </ErpTablePage>

    <!-- ── Payments ── -->
    <ErpTablePage
      v-else-if="view === 'payments'"
      :columns="paymentColumns"
      :rows="paymentRows"
      :total="paymentHistory.length"
      :current-page="payPage"
      :per-page="payPerPage"
      filter-empty-label="payment"
      @page-change="(p: number) => (payPage = p)"
      @per-page-change="(n: number) => (payPerPage = n)"
    >
      <template #cell-statement="{ row }">{{ asPay(row).statement || '-' }}</template>
      <template #cell-amount="{ row }">{{ rupiah(asPay(row).amount) }}</template>
      <template #empty>
        <div class="pp-empty"><p class="pp-empty-title">{{ t('No payments yet') }}</p></div>
      </template>
    </ErpTablePage>

    <PayrollPayableDetail v-model:is-open="detailOpen" :row="active" />
  </div>
</template>

<style scoped>
.pp { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.pp-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }

.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch; }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-period { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-amount--danger { color: var(--mp-text-danger); }
.stat-link { display: inline-flex; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); line-height: var(--mp-line-heights-md); cursor: pointer; padding: 0 var(--mp-spacing-0\.5); }

.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  flex: 0 0 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}
.filter-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); min-width: 0; }
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }

.pp-cell { display: flex; flex-direction: column; min-width: 0; }
.pp-name { color: var(--mp-text-link); cursor: pointer; }
.pp-fig { cursor: pointer; }
.pp-fig:hover { text-decoration: underline; }
.pp-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: normal; }
.pp-warn { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-warning); white-space: normal; }
.pp-danger { color: var(--mp-text-danger); }
.pp-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-10, 40px) 0; }
.pp-empty-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pp-empty-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
