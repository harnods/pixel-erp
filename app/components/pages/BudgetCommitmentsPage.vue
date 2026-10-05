<script setup lang="ts">
/**
 * Accounting › Budgeting › Commitments (PRD FG-7, Release 1).
 * Money held by approved requests and open purchase orders, POs idle 90 days or
 * more, and bills with no PO that went over budget. Close a PO line or a whole
 * PO to free what is left; Reopen re-runs the check. Year-end carry-forward and
 * the idle sweep are Release 2.
 */
import {
  MpTabs, MpTabList, MpTab, MpButton, MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import BudgetPOCloseModal from '~/components/patterns/BudgetPOCloseModal.vue'
import { formatIDRWhole } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'
import {
  budget, commitmentSummary, commitmentLines, heldRequests, overrunBills, overrunShort, poById, isIdlePO,
  poOpenTotal, poIdleDays, canActOnCommitment, reopenPOLineAs, markFullyOrderedAs, lineById, lineTitle,
  type CommitmentLineRow,
} from '~/data/budgetStore'
import { shortDate, BUDGET_AS_OF } from '~/data/budgetUiPurchaseOrders'

defineProps<{ orderId?: string }>()

const { t } = useLocale()
const router = useRouter()
const fmt = formatIDRWhole

type TabKey = 'pos' | 'requests' | 'overrun' | 'idle'
const TABS: TabKey[] = ['pos', 'requests', 'overrun', 'idle']
const tabIndex = ref(0)
const tab = computed<TabKey>(() => TABS[tabIndex.value] ?? 'pos')
function goTab(k: TabKey) { tabIndex.value = TABS.indexOf(k) }

const summary = computed(() => commitmentSummary())

// Inline messages per row (reopen gap, refusals): never a toast for a refusal.
const rowMsg = reactive<Record<string, string>>({})

// ── Rows per tab ──────────────────────────────────────────────────────────────
type Row = Record<string, unknown> & { key: string }

const poRows = computed<Row[]>(() => commitmentLines().map((r) => ({
  ...r, number: r.poNumber, party: r.vendor, line: r.description, sub: r.lineTitle, date: r.lastActivity,
  statusLabel: r.closed ? 'Closed' : 'Open',
})))

const requestRows = computed<Row[]>(() => heldRequests().map((r) => ({
  ...r, party: r.requester, line: r.description, sub: r.lineTitle,
})))

const overrunRows = computed<Row[]>(() => overrunBills().map((b) => {
  const lineId = b.overBudget?.lineId ?? b.lines[0]?.lineId ?? null
  const bl = lineById(lineId)
  return {
    key: b.id, number: b.number, party: b.vendor, date: b.date,
    line: b.lines[0]?.description ?? '', sub: bl ? lineTitle(bl) : t('No budget line'),
    amount: b.lines.reduce((s, l) => s + l.amount, 0), short: overrunShort(b),
  }
}))

const idleRows = computed<Row[]>(() => budget.pos.filter(isIdlePO).map((po) => ({
  key: po.id, poId: po.id, number: po.number, party: po.vendor, date: po.lastActivity,
  line: po.lines.map((l) => l.description).join(', '),
  sub: [...new Set(po.lines.map((l) => { const bl = lineById(l.lineId); return bl ? lineTitle(bl) : '' }))].join(', '),
  idleDays: poIdleDays(po), open: poOpenTotal(po),
})))

const rowsByTab = computed<Record<TabKey, Row[]>>(() => ({ pos: poRows.value, requests: requestRows.value, overrun: overrunRows.value, idle: idleRows.value }))
const openPOLineCount = computed(() => poRows.value.filter((r) => !r.closed).length)

const COLUMNS: Record<TabKey, TableColumn[]> = {
  pos: [
    { key: 'number', label: 'PO number', kind: 'number', sortable: true, sortType: 'text' },
    { key: 'party', label: 'Vendor', kind: 'name', sortable: true, sortType: 'text' },
    { key: 'line', label: 'Line', kind: 'address' },
    { key: 'amount', label: 'Amount', kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
    { key: 'invoiced', label: 'Invoiced', kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
    { key: 'open', label: 'Open', kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
    { key: 'date', label: 'Last activity', kind: 'date', sortType: 'date' },
    { key: 'statusLabel', label: 'Status', kind: 'status', sortType: 'text' },
  ],
  requests: [
    { key: 'number', label: 'Request', kind: 'number', sortable: true, sortType: 'text' },
    { key: 'party', label: 'Requester', kind: 'name', sortable: true, sortType: 'text' },
    { key: 'line', label: 'Line', kind: 'address' },
    { key: 'date', label: 'Date', kind: 'date', sortType: 'date' },
    { key: 'held', label: 'Held', kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  ],
  overrun: [
    { key: 'number', label: 'Purchase invoice', kind: 'number', sortable: true, sortType: 'text' },
    { key: 'party', label: 'Vendor', kind: 'name', sortable: true, sortType: 'text' },
    { key: 'line', label: 'Line', kind: 'address' },
    { key: 'date', label: 'Date', kind: 'date', sortType: 'date' },
    { key: 'amount', label: 'Amount', kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
    { key: 'short', label: 'Over budget by', kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  ],
  idle: [
    { key: 'number', label: 'PO number', kind: 'number', sortable: true, sortType: 'text' },
    { key: 'party', label: 'Vendor', kind: 'name', sortable: true, sortType: 'text' },
    { key: 'line', label: 'Lines', kind: 'address' },
    { key: 'date', label: 'Last activity', kind: 'date', sortType: 'date' },
    { key: 'idleDays', label: 'Idle for', kind: 'default', align: 'right', sortable: true, sortType: 'number' },
    { key: 'open', label: 'Open', kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  ],
}
const columns = computed(() => COLUMNS[tab.value])
const rows = computed(() => rowsByTab.value[tab.value])

const {
  search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState(rows, {
  filterFn: (row: Row, s) => !s || [row.number, row.party, row.line, row.sub].some((v) => String(v ?? '').toLowerCase().includes(s)),
  defaultSort: { key: 'number', dir: 'asc' },
})
watch(tab, () => { search.value = ''; setPage(1) })
const hasActiveFilter = computed(() => !!search.value)
function clearFilters() { search.value = '' }

// ── Actions ───────────────────────────────────────────────────────────────────
const closeTarget = ref<{ mode: 'line' | 'po'; poId: string; lineIndex: number } | null>(null)
function openCloseLine(r: Row) { delete rowMsg[r.key]; closeTarget.value = { mode: 'line', poId: String(r.poId), lineIndex: Number(r.lineIndex) } }
function openClosePO(poId: string) { closeTarget.value = { mode: 'po', poId, lineIndex: 0 } }
function onClosed(p: { freed: number; label: string }) {
  toast.notify({ variant: 'success', title: `${p.label} ${t('closed')}. ${fmt(p.freed)} ${t('freed to the budget line')}`, rootProps: { class: 'toast-enterprise' } })
}

function onReopen(row: Row) {
  const r = row as unknown as CommitmentLineRow & { key: string }
  const res = reopenPOLineAs(r.poId, r.lineIndex)
  if (!res.ok) {
    rowMsg[r.key] = res.gap > 0 ? `${t('Not enough budget to reopen. Short')} ${fmt(res.gap)}` : (res.reason ?? '')
    return
  }
  delete rowMsg[r.key]
  toast.notify({ variant: 'success', title: `${r.poNumber} ${t('line')} ${r.lineIndex + 1} ${t('reopened')}. ${fmt(res.amount)} ${t('committed again')}`, rootProps: { class: 'toast-enterprise' } })
}

function onFullyOrdered(r: Row) {
  const res = markFullyOrderedAs(String(r.prId))
  if (!res.ok) { rowMsg[r.key] = res.reason ?? ''; return }
  toast.notify({ variant: 'success', title: `${r.number} ${t('marked fully ordered')}. ${fmt(res.freed)} ${t('freed to the budget line')}`, rootProps: { class: 'toast-enterprise' } })
}

function canClose(poId: unknown) { void budget.viewAs; return canActOnCommitment('close', poById(String(poId))).ok }
const canReopen = computed(() => { void budget.viewAs; return canActOnCommitment('reopen').ok })
const canFullyOrder = computed(() => { void budget.viewAs; return canActOnCommitment('fully-ordered').ok })
const hasRowActions = computed(() => tab.value !== 'overrun')

function openPurchaseRequest(r: Row) { if (r.purchaseRequestId) router.push(`/purchase-requests/${r.purchaseRequestId}`) }
function releaseTwo() { infoToast(t('Not in this prototype')) }
</script>

<template>
  <div class="bc-page" :data-tour="tab === 'idle' ? 'commitments-idle' : 'commitments-po-table'">
    <ErpTablePage
      :columns="columns"
      :rows="(paginated as Record<string, unknown>[])"
      :total="total"
      :current-page="currentPage"
      :per-page="perPage"
      :sort-key="sortKey"
      :sort-dir="sortDir"
      :has-checkbox="tab === 'idle'"
      bulk-label="purchase order"
      :search="search"
      :has-active-filter="hasActiveFilter"
      :filter-empty-label="tab === 'requests' ? 'request' : tab === 'overrun' ? 'purchase invoice' : 'purchase order'"
      @page-change="setPage"
      @per-page-change="setPerPage"
      @sort="toggleSort"
      @sort-change="setSort"
      @clear-filters="clearFilters"
    >
      <!-- ── Stats + tabs ── -->
      <template #stats>
        <div class="bc-stats-wrap">
          <div class="stats-section">
            <div class="stat-card stat-card--bordered">
              <div class="stat-title">{{ t('Open requests held') }}</div>
              <div class="stat-period">{{ t('Reserved') }} · {{ t('as of') }} {{ BUDGET_AS_OF }}</div>
              <div class="stat-amount">{{ fmt(summary.requestsHeld) }}</div>
              <a class="stat-link" @click="goTab('requests')">{{ summary.requestCount }} {{ t(summary.requestCount === 1 ? 'request' : 'requests') }}</a>
            </div>
            <div class="stat-card stat-card--bordered">
              <div class="stat-title">{{ t('Open PO commitment') }}</div>
              <div class="stat-period">{{ t('Committed') }} · {{ t('as of') }} {{ BUDGET_AS_OF }}</div>
              <div class="stat-amount">{{ fmt(summary.poOpen) }}</div>
              <a class="stat-link" @click="goTab('pos')">{{ summary.poCount }} {{ t(summary.poCount === 1 ? 'purchase order' : 'purchase orders') }}</a>
            </div>
            <div class="stat-card stat-card--bordered">
              <div class="stat-title">{{ t('Idle 90 days or more') }}</div>
              <div class="stat-period">{{ t('Committed, no receipt or invoice') }}</div>
              <div class="stat-amount" :class="{ 'stat-amount--warning': summary.idleOpen > 0 }">{{ fmt(summary.idleOpen) }}</div>
              <a class="stat-link" @click="goTab('idle')">{{ summary.idleCount }} {{ t(summary.idleCount === 1 ? 'purchase order' : 'purchase orders') }}</a>
            </div>
            <div class="stat-card">
              <div class="stat-title">{{ t('Over budget, no PO') }}</div>
              <div class="stat-period">{{ t('Actual over available') }} · 2026</div>
              <div class="stat-amount" :class="{ 'stat-amount--danger': summary.overrunShort > 0 }">{{ fmt(summary.overrunShort) }}</div>
              <a class="stat-link" @click="goTab('overrun')">{{ summary.overrunCount }} {{ t(summary.overrunCount === 1 ? 'purchase invoice' : 'purchase invoices') }}</a>
            </div>
          </div>

          <MpTabs id="commitments-tabs" v-model="tabIndex" is-manual variant-color="green" class="bc-tabs">
            <MpTabList>
              <MpTab id="commitments-tab-pos">{{ t('Open purchase orders') }} ({{ openPOLineCount }})</MpTab>
              <MpTab id="commitments-tab-requests">{{ t('Open requests') }} ({{ requestRows.length }})</MpTab>
              <MpTab id="commitments-tab-overrun">{{ t('Over budget, no PO') }} ({{ overrunRows.length }})</MpTab>
              <MpTab id="commitments-tab-idle">{{ t('Idle') }} ({{ idleRows.length }})</MpTab>
            </MpTabList>
          </MpTabs>
        </div>
      </template>

      <!-- ── Filter bar ── -->
      <template #filters>
        <div class="filter-left">
          <MpButton v-if="tab === 'idle'" id="commitments-idle-sweep" variant="secondary" is-rounded @click="releaseTwo">{{ t('Idle commitment sweep') }}</MpButton>
          <MpButton v-else id="commitments-carry-forward" variant="secondary" is-rounded @click="releaseTwo">{{ t('Year-end carry-forward') }}</MpButton>
        </div>
        <div class="filter-right">
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
            <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
              <MpIcon name="close" size="sm" />
            </button>
          </div>
        </div>
      </template>

      <!-- ── Bulk (Idle tab): closing idle items in bulk is the Release 2 sweep ── -->
      <template #bulk-actions>
        <MpButton size="sm" variant="secondary" is-rounded @click="releaseTwo">{{ t('Close selected') }}</MpButton>
      </template>

      <!-- ── Cells ── -->
      <template #cell-number="{ row }">
        <span v-if="tab === 'requests' && (row as Row).purchaseRequestId" class="cell-link cell-text" @click.stop="openPurchaseRequest(row as Row)">{{ (row as Row).number }}</span>
        <span v-else class="cell-text">{{ (row as Row).number }}</span>
      </template>

      <template #cell-line="{ row }">
        <div class="bc-line">
          <span class="bc-line__main">{{ tab === 'pos' ? `${Number((row as Row).lineIndex) + 1}. ` : '' }}{{ (row as Row).line }}</span>
          <span class="bc-line__sub">{{ (row as Row).sub }}</span>
        </div>
      </template>

      <template #cell-amount="{ value }">{{ fmt(value as number) }}</template>
      <template #cell-invoiced="{ value }">{{ fmt(value as number) }}</template>
      <template #cell-held="{ row, value }">
        <div class="bc-amt">
          <span>{{ fmt(value as number) }}</span>
          <span v-if="rowMsg[(row as Row).key]" class="bc-inline-error">{{ rowMsg[(row as Row).key] }}</span>
        </div>
      </template>
      <template #cell-short="{ value }"><span class="bc-danger">{{ fmt(value as number) }}</span></template>
      <template #cell-open="{ row, value }">
        <div class="bc-amt">
          <span>{{ fmt(value as number) }}</span>
          <span v-if="rowMsg[(row as Row).key]" class="bc-inline-error">{{ rowMsg[(row as Row).key] }}</span>
        </div>
      </template>
      <template #cell-idleDays="{ value }">{{ value }} {{ t('days') }}</template>

      <template #cell-date="{ row, value }">
        <div class="bc-date">
          <span>{{ shortDate(value as string) }}</span>
          <ErpStatusBadge v-if="tab === 'pos' && (row as Row).idle && !(row as Row).closed" status="idle" :label="`${t('Idle')} ${(row as Row).idleDays} ${t('days')}`" type="warning" />
        </div>
      </template>

      <template #cell-statusLabel="{ row }">
        <div class="bc-status">
          <ErpStatusBadge :status="(row as Row).closed ? 'closed' : 'open'" :label="(row as Row).closed ? t('Closed') : t('Open')" :type="(row as Row).closed ? 'announcement' : 'information'" />
          <span v-if="(row as Row).closeReason" class="bc-line__sub">{{ t(String((row as Row).closeReason)) }}</span>
        </div>
      </template>

      <!-- ── Row actions ── -->
      <template v-if="hasRowActions" #actions="{ row }">
        <MpPopover
          v-if="tab === 'pos' && ((!(row as Row).closed && canClose((row as Row).poId)) || ((row as Row).closed && canReopen))"
          :id="`commit-row-${(row as Row).key}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end"
        >
          <MpPopoverTrigger>
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded data-tour="po-close-line" />
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <template v-if="!(row as Row).closed">
                <MpPopoverListItem @click="openCloseLine(row as Row)">{{ t('Close line') }}</MpPopoverListItem>
                <MpPopoverListItem @click="openClosePO(String((row as Row).poId))">{{ t('Close PO') }}</MpPopoverListItem>
              </template>
              <MpPopoverListItem v-else @click="onReopen(row as Row)">{{ t('Reopen') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
        <MpPopover
          v-else-if="tab === 'requests' && canFullyOrder"
          :id="`commit-req-${(row as Row).key}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end"
        >
          <MpPopoverTrigger>
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem @click="onFullyOrdered(row as Row)">{{ t('Mark fully ordered') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
        <MpPopover
          v-else-if="tab === 'idle' && canClose((row as Row).poId)"
          :id="`commit-idle-${(row as Row).key}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end"
        >
          <MpPopoverTrigger>
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem @click="openClosePO(String((row as Row).poId))">{{ t('Close PO') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>
    </ErpTablePage>

    <BudgetPOCloseModal v-if="closeTarget" :target="closeTarget" @update:target="closeTarget = $event" @closed="onClosed" />
  </div>
</template>

<style scoped>
.bc-page { display: flex; flex-direction: column; }
.bc-stats-wrap { display: flex; flex-direction: column; gap: var(--mp-spacing-8); }
.bc-tabs { width: 100%; }
.bc-tabs :deep(.mp-tab--isSelected_true),
.bc-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.bc-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }

.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-period { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-amount--danger { color: var(--mp-text-danger); }
.stat-amount--warning { color: var(--mp-colors-text-warning); }
.stat-link { display: inline-flex; font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-link, #165082); line-height: var(--mp-line-heights-md); text-decoration: none; cursor: pointer; }
.stat-link:hover { text-decoration: underline; }

.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: var(--filter-search-w, 248px);
  padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); min-width: 0; }
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn { display: inline-flex; border: none; background: transparent; padding: 0; cursor: pointer; color: var(--mp-text-subtle); }

.bc-line { display: flex; flex-direction: column; min-width: 0; }
.bc-line__main { color: var(--mp-text-default); }
.bc-line__sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }
.bc-amt { display: flex; flex-direction: column; align-items: flex-end; }
.bc-inline-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); white-space: normal; text-align: right; }
.bc-danger { color: var(--mp-text-danger); }
.bc-date { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-1); }
.bc-status { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-1); }
</style>
