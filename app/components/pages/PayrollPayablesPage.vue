<script setup lang="ts">
/**
 * Payroll payables: a tracker. One row per party per period: owed, paid, balance, due date,
 * status. Payments arrive from Pay (Cash management > Spend money) or as bank reconciliation matches (the Simulate menu stands in for the
 * bank statement); this screen records none itself. Flags sit on the rows they concern: the bank
 * paid a salary run a different amount than the posted run, or a manual journal hit a payroll
 * payable account.
 */
import { MpButton, MpIcon, MpSegmentedControl, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import PayrollPayableDetail from '~/components/payroll/PayrollPayableDetail.vue'
import PayrollSimulateBankMenu from '~/components/payroll/PayrollSimulateBankMenu.vue'
import PayrollReadOnlyNote from '~/components/payroll/PayrollReadOnlyNote.vue'
import { payablesTracker, can, rupiah, monthLabel, dateLabel, today, accountLabel, type PayableRow } from '~/data/payrollStore'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { statusType } from '~/data/payrollUiRunCopy'
import { paymentHistory } from '~/data/payrollUiPayables'
import { flagChips, latestSalaryKey, latestPph21Key, PARTY_LABEL } from '~/data/payrollUiPay'

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
const partyOptions = computed(() => [...new Set(all.value.map((r) => r.party))].map((p) => ({ value: p, label: t(PARTY_LABEL[p]) })))

const matchesState = (r: PayableRow, s: string) =>
  s === 'open' ? r.balance > 0 : s === 'overdue' ? r.overdueDays > 0 : true
const filtered = computed(() => all.value.filter((r) =>
  (!monthFilter.value || r.month === monthFilter.value)
  && (!partyFilter.value || r.party === partyFilter.value)
  && (!stateFilter.value || matchesState(r, stateFilter.value))
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
  /* Due date sits under the status badge: a separate 160px date column pushed the table past a 1280 screen. */
  { key: 'status', label: t('Status'), kind: 'default' },
]
const tableRows = computed(() => paginated.value as unknown as Record<string, unknown>[])
const asRow = (r: unknown) => r as PayableRow


// ─── Tour markers: the latest run's salary row, the newest PPh 21 row, the flags ─
const salaryKey = computed(() => latestSalaryKey(paginated.value))
const pph21Key = computed(() => latestPph21Key(paginated.value))
const firstFlaggedKey = computed(() => paginated.value.find((r) => r.flags.length)?.key ?? null)
const root = ref<HTMLElement | null>(null)
/** ErpTablePage owns the <tr>; the marker goes on the row through the cell that carries its key. */
function markRows() {
  const el = root.value
  if (!el) return
  const want: Record<string, string | null> = { 'payroll-salary-row': salaryKey.value, 'payroll-pph21-row': pph21Key.value }
  for (const [name, key] of Object.entries(want)) {
    const tr = key ? Array.from(el.querySelectorAll<HTMLElement>('[data-row-key]')).find((c) => c.dataset.rowKey === key)?.closest('tr') ?? null : null
    el.querySelectorAll(`tr[data-tour="${name}"]`).forEach((x) => { if (x !== tr) x.removeAttribute('data-tour') })
    tr?.setAttribute('data-tour', name)
  }
}
watch([paginated, view], () => nextTick(markRows), { flush: 'post' })
onMounted(() => nextTick(markRows))
onUpdated(markRows)

// ─── Stats ──────────────────────────────────────────────────────────────────
const openRows = computed(() => all.value.filter((r) => r.balance > 0))
const overdueRows = computed(() => all.value.filter((r) => r.overdueDays > 0))
const thisMonth = computed(() => today().slice(0, 7))
const paidThisMonth = computed(() => paymentHistory.value.filter((p) => p.date.startsWith(thisMonth.value)))
const sum = (rows: PayableRow[]) => rows.reduce((s, r) => s + r.balance, 0)
const plural = (n: number, one: string, many: string) => `${n} ${t(n === 1 ? one : many)}`
function drill(state: string) { clearFilters(); stateFilter.value = state; view.value = 'payables' }


// ─── Detail ─────────────────────────────────────────────────────────────────
const detailOpen = ref(false)
const activeKey = ref<string | null>(null)
const active = computed(() => all.value.find((r) => r.key === activeKey.value) ?? null)
function openDetail(r: PayableRow) { activeKey.value = r.key; detailOpen.value = true }
/** Pay: Cash management > New spend money, prefilled with this payable; saving it pays the payable. */
function payNow(r: PayableRow) { navigateTo({ path: '/bank-withdrawals/new', query: { payable: r.key } }) }

// ─── Payments ───────────────────────────────────────────────────────────────
const paymentColumns: TableColumn[] = [
  { key: 'number', label: t('Journal'), kind: 'number' },
  { key: 'dateLabel', label: t('Date'), kind: 'date' },
  { key: 'payable', label: t('Payable'), kind: 'name' },
  /* Bank account is the Source cell's second line: six columns ran 1120px in a 988px stage at 1280. */
  { key: 'statement', label: t('Source'), kind: 'name' },
  { key: 'amount', label: t('Amount'), kind: 'amount', align: 'right' },
]
const payPage = ref(1)
const payPerPage = ref(25)
const paymentRows = computed(() => paymentHistory.value.slice((payPage.value - 1) * payPerPage.value, payPage.value * payPerPage.value) as unknown as Record<string, unknown>[])
type PayHist = (typeof paymentHistory.value)[number]
const asPay = (r: unknown) => r as PayHist
</script>

<template>
  <div ref="root" class="pp">
    <div class="pp-head">
      <MpSegmentedControl id="pp-view" v-model="view" name="pp-view" :data="viewOptions" />
      <PayrollSimulateBankMenu v-if="can('simulate')" />
      <PayrollReadOnlyNote v-else :text="t('View only. Payroll actions are off for this role.')" />
    </div>
    <p class="pp-helper">{{ t('PPh 21 and PPh 26 are income tax withheld from local and foreign staff; BPJS is state health and employment insurance; DPLK is the pension fund.') }}</p>

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
            <div class="stat-title">{{ t('Still owed') }}</div>
            <div class="stat-period">{{ t('As of') }} {{ dateLabel(today()) }}</div>
            <div class="stat-amount">{{ rupiah(sum(openRows)) }}</div>
            <a v-if="openRows.length" class="stat-link" @click="drill('open')">{{ plural(openRows.length, 'payable', 'payables') }}</a>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Overdue') }}</div>
            <div class="stat-period">{{ t('Past the due date') }}</div>
            <div class="stat-amount" :class="{ 'stat-amount--danger': overdueRows.length }">{{ rupiah(sum(overdueRows)) }}</div>
            <a v-if="overdueRows.length" class="stat-link" @click="drill('overdue')">{{ plural(overdueRows.length, 'payable', 'payables') }}</a>
          </div>
          <div class="stat-card">
            <div class="stat-title">{{ t('Paid this month') }}</div>
            <div class="stat-period">{{ t('Spend money or bank reconciliation') }} · {{ monthLabel(thisMonth) }}</div>
            <div class="stat-amount">{{ rupiah(paidThisMonth.reduce((s, p) => s + p.amount, 0)) }}</div>
            <a v-if="paidThisMonth.length" class="stat-link" @click="view = 'payments'">{{ plural(paidThisMonth.length, 'payment', 'payments') }}</a>
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
        <div class="pp-cell" :data-row-key="asRow(row).key">
          <span class="pp-name" @click="openDetail(asRow(row))">{{ asRow(row).label }}</span>
          <span class="pp-sub">{{ accountLabel(asRow(row).account) }}</span>

          <div v-if="asRow(row).flags.length" class="pp-flags" :data-tour="asRow(row).key === firstFlaggedKey ? 'payroll-payables-flags' : undefined">
            <div class="pp-chips">
              <ErpStatusBadge
                v-for="c in flagChips(asRow(row))"
                :key="c.code"
                :status="c.code"
                :label="`${t(c.label)}${c.count > 1 ? ` (${c.count})` : ''}`"
                :type="c.code === 'manual-journal' ? 'warning' : 'critical'"
              />
            </div>
            <span v-for="f in asRow(row).flags" :key="f.code + f.message" class="pp-flag">{{ f.message }}</span>
          </div>

        </div>
      </template>
      <template #cell-owed="{ row }"><span class="pp-fig" @click="openDetail(asRow(row))">{{ rupiah(asRow(row).owed) }}</span></template>
      <template #cell-paid="{ row }"><span class="pp-fig" @click="openDetail(asRow(row))">{{ rupiah(asRow(row).paid) }}</span></template>
      <template #cell-balance="{ row }">
        <div class="pp-cell pp-cell--right">
          <span :class="{ 'pp-danger': asRow(row).overdueDays || asRow(row).balance < 0 }">{{ rupiah(asRow(row).balance) }}</span>
          <span v-if="asRow(row).pendingOwed != null" class="pp-sub">{{ t('After repost') }} {{ rupiah(asRow(row).pendingOwed! - asRow(row).paid) }}</span>
        </div>
      </template>
      <template #cell-status="{ row }">
        <div class="pp-cell">
          <ErpStatusBadge :status="asRow(row).status" :label="t(asRow(row).statusLabel)" :type="statusType(asRow(row).status)" />
          <span class="pp-sub">{{ asRow(row).due ? `${t('Due')} ${asRow(row).dueLabel}` : t('No due date') }}</span>
        </div>
      </template>

      <template #actions="{ row }">
        <MpPopover :id="`pp-row-${asRow(row).key.replace(/\W/g, '')}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Row actions')" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem v-if="asRow(row).balance > 0 && can('simulate')" @click="payNow(asRow(row))">{{ t('Pay') }}</MpPopoverListItem>
              <MpPopoverListItem @click="openDetail(asRow(row))">{{ t('View details') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="asRow(row).runId" @click="navigateTo(`/payroll-runs/${asRow(row).runId}`)">{{ t('Open payroll run') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>

      <template #empty>
        <div class="pp-empty">
          <p class="pp-empty-title">{{ t(hasActiveFilter ? 'No payables match the filters' : 'No payables yet') }}</p>
          <p class="pp-empty-desc">{{ t(hasActiveFilter ? 'Clear the filters to see every payable.' : 'What payroll still owes staff, the tax office, BPJS and DPLK. It fills once you post a payroll journal.') }}</p>
          <MpButton v-if="hasActiveFilter" variant="secondary" is-rounded @click="clearFilters">{{ t('Clear filters') }}</MpButton>
          <MpButton v-else variant="secondary" is-rounded @click="navigateTo('/payroll-inbox')">{{ t('Open payroll inbox') }}</MpButton>
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
      <template #cell-payable="{ row }"><span class="pp-cell">{{ asPay(row).payable }}</span></template>
      <template #cell-statement="{ row }">
        <div class="pp-cell">
          <span>{{ t(asPay(row).statement || 'Not matched') }}</span>
          <span class="pp-sub">{{ asPay(row).bank }}</span>
        </div>
      </template>
      <template #cell-amount="{ row }">{{ rupiah(asPay(row).amount) }}</template>
      <template #empty>
        <div class="pp-empty">
          <p class="pp-empty-title">{{ t('No payments yet') }}</p>
          <p class="pp-empty-desc">{{ t('A payment shows here when you pay a payable, or when bank reconciliation matches a bank line to it.') }}</p>
        </div>
      </template>
    </ErpTablePage>

    <PayrollPayableDetail v-model:is-open="detailOpen" :row="active" />
  </div>
</template>

<style scoped>
.pp { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.pp-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.pp-helper { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

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

.pp-cell { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; white-space: normal; }
.pp-cell--right { align-items: flex-end; text-align: right; }
.pp-name { color: var(--mp-text-link); cursor: pointer; }
.pp-fig { cursor: pointer; }
.pp-fig:hover { text-decoration: underline; }
.pp-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: normal; }
.pp-flags { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.pp-chips { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-1); }
.pp-flag { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: normal; }
.pp-danger { color: var(--mp-text-danger); }
.pp-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-10, 40px) 0; }
.pp-empty-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pp-empty-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
