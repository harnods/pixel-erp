<!-- prod-parity: jurnal-accounting-frontend/src/modules/reconciliation/components/cash-mapping/CashMappingTab.vue -->
<script setup lang="ts">
/**
 * Cash mapping — code unmatched bank statement lines straight into new
 * transactions: pick an Account (+ optional Tax, Memo) per line, or select
 * several and bulk-apply, then "Match & reconcile (n)" creates a spend/receive
 * money per coded line and reconciles it (persisted; lines move to Matched).
 */
import { MpButton, MpIcon, MpInput, toast } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import {
  reconToMatchLines, reconCashMap, MAPPING_COA, companyTaxes,
  type CashAccount, type ReconStatementLine,
} from '~/data'
import { formatMoney } from '~/utils/currency'
import { formatDate } from '~/utils/date'

const props = defineProps<{ account: CashAccount }>()
const { t } = useLocale()

const columns: TableColumn[] = [
  { key: 'date', label: 'Date', kind: 'date', sortType: 'date' },
  { key: 'description', label: 'Description', kind: 'address' },
  { key: 'moneyIn', label: 'Money in', kind: 'amount', align: 'right' },
  { key: 'moneyOut', label: 'Money out', kind: 'amount', align: 'right' },
  { key: 'account', label: 'Account', kind: 'address' },
  { key: 'tax', label: 'Tax' },
  { key: 'memo', label: 'Memo', kind: 'address' },
]

const ACCOUNT_OPTIONS = MAPPING_COA
  .filter(a => !a.code.startsWith(props.account.code))
  .map(a => ({ value: a.code, label: `(${a.code}) ${a.name}` }))
const TAX_OPTIONS = computed(() => companyTaxes.filter(x => x.kind === 'single').map(x => ({ value: x.id, label: `${x.name} (${x.rate}%)` })))
const TYPE_OPTIONS = [{ value: 'in', label: 'Money in' }, { value: 'out', label: 'Money out' }]

const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 400) })

const dateRange = ref<Date[] | null>(null)
const txType = ref('')
const all = computed(() => reconToMatchLines(props.account.id))
const filteredSource = computed(() => {
  const [from, to] = dateRange.value ?? []
  return all.value.filter(l => {
    if (txType.value && l.direction !== txType.value) return false
    if (from && to) {
      const d = new Date(`${l.date}T00:00:00`)
      if (d < from || d > to) return false
    }
    return true
  })
})
const { search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, toggleSort, setSort } =
  useTableState(filteredSource, { filterFn: (l: ReconStatementLine, s) => l.description.toLowerCase().includes(s) })
const hasActiveFilter = computed(() => !!search.value || !!txType.value || !!dateRange.value)
function clearFilters() { search.value = ''; txType.value = ''; dateRange.value = null }

// ── Draft coding (per line, session only until committed) ──
interface Draft { account: string; tax: string; memo: string }
const drafts = reactive<Record<string, Draft>>({})
function draft(id: string): Draft { return (drafts[id] ??= { account: '', tax: '', memo: '' }) }
const codedCount = computed(() => all.value.filter(l => drafts[l.id]?.account).length)

const bulkAccount = ref('')
const bulkTax = ref('')
const bulkError = ref('')
function bulkApply(sel: Set<number>) {
  if (!bulkAccount.value && !bulkTax.value) { bulkError.value = t('Select an account to code this line.'); return }
  bulkError.value = ''
  const rows = [...sel].map(i => (paginated.value as ReconStatementLine[])[i]).filter(Boolean) as ReconStatementLine[]
  rows.forEach(l => {
    const d = draft(l.id)
    if (bulkAccount.value) d.account = bulkAccount.value
    if (bulkTax.value) d.tax = bulkTax.value
  })
}

const commitError = ref('')
function commit() {
  const coded = all.value.filter(l => drafts[l.id]?.account).map(l => ({
    line: l,
    account: ACCOUNT_OPTIONS.find(o => o.value === drafts[l.id]!.account)?.label ?? drafts[l.id]!.account,
    tax: drafts[l.id]!.tax,
    memo: drafts[l.id]!.memo,
  }))
  if (coded.length === 0) { commitError.value = t('Select an account to code this line.'); return }
  commitError.value = ''
  const n = reconCashMap(props.account.id, coded)
  coded.forEach(c => { delete drafts[c.line.id] })
  toast.notify({ variant: 'success', title: `${n} ${t('transaction(s) created and reconciled.')}`, maxWidth: 'max-content' })
}
function cancel() { Object.keys(drafts).forEach(k => { delete drafts[k] }); commitError.value = '' }

function money(n: number) { return formatMoney(n, props.account.currency) }
</script>

<template>
  <div class="cm">
    <p class="cm-intro">{{ t('Use cash mapping to manually record your bank statements into transactions.') }}</p>

    <ErpTablePage
      :columns="columns"
      :rows="(paginated as unknown as Record<string, unknown>[])"
      :total="total"
      :current-page="currentPage"
      :per-page="perPage"
      :sort-key="sortKey"
      :sort-dir="sortDir"
      :search="search"
      :loading="loading"
      :has-active-filter="hasActiveFilter"
      has-checkbox
      bulk-label="transaction"
      filter-empty-label="statement line"
      :sticky-actions="false"
      @page-change="setPage"
      @per-page-change="setPerPage"
      @sort="toggleSort"
      @sort-change="setSort"
      @clear-filters="clearFilters"
    >
      <template #filters>
        <div class="cm-filter-left">
          <AdvancedDateRangePicker id="cm-daterange" :model-value="dateRange" placeholder="All dates" @update:model-value="dateRange = $event" />
          <ErpFilterSelect id="cm-type" v-model="txType" :placeholder="t('Transaction type')" :options="TYPE_OPTIONS" />
        </div>
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input btn-enterprise" type="text" :placeholder="t('Search...')" :aria-label="t('Search...')" />
        </div>
      </template>

      <template #bulk-actions="{ selectedRows }">
        <div class="cm-bulk">
          <ErpFilterSelect id="cm-bulk-account" v-model="bulkAccount" :placeholder="t('Select account')" :options="ACCOUNT_OPTIONS" width="240px" />
          <ErpFilterSelect id="cm-bulk-tax" v-model="bulkTax" :placeholder="t('Select tax')" :options="TAX_OPTIONS" width="176px" />
          <MpButton size="sm" variant="secondary" is-rounded @click="bulkApply(selectedRows as Set<number>)">{{ t('Apply') }}</MpButton>
        </div>
      </template>

      <template #cell-date="{ row }">{{ formatDate((row as unknown as ReconStatementLine).date) }}</template>
      <template #cell-moneyIn="{ row }">
        <span>{{ (row as unknown as ReconStatementLine).direction === 'in' ? money((row as unknown as ReconStatementLine).amount) : '—' }}</span>
      </template>
      <template #cell-moneyOut="{ row }">
        <span>{{ (row as unknown as ReconStatementLine).direction === 'out' ? money((row as unknown as ReconStatementLine).amount) : '—' }}</span>
      </template>
      <template #cell-account="{ row }">
        <ErpFilterSelect
          :id="`cm-acc-${(row as unknown as ReconStatementLine).id}`"
          :model-value="draft((row as unknown as ReconStatementLine).id).account"
          :placeholder="t('Select account')"
          :options="ACCOUNT_OPTIONS"
          width="100%"
          empty-text="No accounts found"
          @update:model-value="(v: string) => { draft((row as unknown as ReconStatementLine).id).account = v; commitError = '' }"
        />
      </template>
      <template #cell-tax="{ row }">
        <ErpFilterSelect
          :id="`cm-tax-${(row as unknown as ReconStatementLine).id}`"
          :model-value="draft((row as unknown as ReconStatementLine).id).tax"
          :placeholder="t('Select tax')"
          :options="TAX_OPTIONS"
          width="100%"
          empty-text="No taxes found"
          @update:model-value="(v: string) => { draft((row as unknown as ReconStatementLine).id).tax = v }"
        />
      </template>
      <template #cell-memo="{ row }">
        <MpInput
          :id="`cm-memo-${(row as unknown as ReconStatementLine).id}`"
          :model-value="draft((row as unknown as ReconStatementLine).id).memo"
          :aria-label="t('Memo')"
          @update:model-value="(v: string | number) => { draft((row as unknown as ReconStatementLine).id).memo = String(v) }"
        />
      </template>

      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-full__illustration" width="288" height="240" />
          <p class="empty-full__title">{{ t('No lines left to code.') }}</p>
        </div>
      </template>
    </ErpTablePage>
    <p v-if="bulkError" class="cm-error" role="alert">{{ bulkError }}</p>

    <footer v-if="all.length" class="cm-footer">
      <p v-if="commitError" class="cm-error" role="alert">{{ commitError }}</p>
      <MpButton variant="ghost" is-rounded @click="cancel">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded @click="commit">{{ t('Match & reconcile') }} ({{ codedCount }})</MpButton>
    </footer>
  </div>
</template>

<style scoped>
.cm { display: flex; flex-direction: column; gap: var(--mp-spacing-3); padding-top: var(--mp-spacing-5); }
.cm-intro { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.cm-filter-left { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.cm-bulk { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cm-footer { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-3); padding-top: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.cm-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.cm-footer .cm-error { margin-right: auto; }
.empty-full { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-10, 40px) 0; }
.empty-full__illustration { width: var(--mp-sizes-72, 288px); height: var(--mp-sizes-60, 240px); object-fit: contain; }
.empty-full__title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
</style>
