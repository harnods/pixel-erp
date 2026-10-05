<!-- prod-parity: jurnal-accounting-frontend/src/modules/reconciliation/components/not-reconciled/NotReconciledTab.vue -->
<script setup lang="ts">
/**
 * Not reconciled — book transactions on this account that no bank statement
 * line has cleared yet. Row kebab: Find transaction (→ pick the bank statement
 * line(s) that settle it) / Delete. Multi-select → Find transaction for a
 * same-direction batch.
 */
import {
  MpButton, MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, toast, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ReconciliationFindMatchModal, { type FindMatchItem } from '~/components/reconciliation/ReconciliationFindMatchModal.vue'
import {
  reconNotReconciled, reconToMatchLines, reconMatch, reconDelete,
  type CashAccount, type ReconTransaction,
} from '~/data'
import { formatMoney } from '~/utils/currency'
import { formatDate } from '~/utils/date'

const props = defineProps<{ account: CashAccount }>()
const { t } = useLocale()

const columns: TableColumn[] = [
  { key: 'date', label: 'Date', kind: 'date', sortType: 'date' },
  { key: 'number', label: 'Number', kind: 'number', sortType: 'text' },
  { key: 'contact', label: 'Contact', kind: 'name', sortType: 'text' },
  { key: 'description', label: 'Description', kind: 'address' },
  { key: 'amount', label: 'Amount', kind: 'amount', align: 'right', sortType: 'number' },
]

const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 400) })

const dateRange = ref<Date[] | null>(null)
const cashFlow = ref('')
const CASH_FLOW = [{ value: 'in', label: 'Money in' }, { value: 'out', label: 'Money out' }]

const all = computed(() => reconNotReconciled(props.account.id))
const filteredSource = computed(() => {
  const [from, to] = dateRange.value ?? []
  return all.value.filter(tx => {
    if (cashFlow.value && tx.direction !== cashFlow.value) return false
    if (from && to) {
      const d = new Date(`${tx.date}T00:00:00`)
      if (d < from || d > to) return false
    }
    return true
  })
})
const {
  search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState(filteredSource, {
  filterFn: (tx: ReconTransaction, s) =>
    `${tx.type} #${tx.number}`.toLowerCase().includes(s) || tx.contact.toLowerCase().includes(s) || tx.description.toLowerCase().includes(s),
})
const hasActiveFilter = computed(() => !!search.value || !!cashFlow.value || !!dateRange.value)
function clearFilters() { search.value = ''; cashFlow.value = ''; dateRange.value = null }

function money(tx: ReconTransaction) { return formatMoney(tx.direction === 'out' ? -tx.amount : tx.amount, props.account.currency) }

// ── Find transaction (anchor = book transaction(s)) ──
const findAnchors = ref<ReconTransaction[]>([])
const bulkError = ref('')
const candidates = computed<FindMatchItem[]>(() => reconToMatchLines(props.account.id).map(l => ({
  id: l.id, date: l.date, description: l.description, amount: l.amount, direction: l.direction,
})))
function openFind(txs: ReconTransaction[]) {
  if (new Set(txs.map(x => x.direction)).size > 1) {
    bulkError.value = t('Select transactions that all move money the same way to find a match')
    return
  }
  bulkError.value = ''
  findAnchors.value = txs
}
function rowsFrom(sel: Set<number>) { return [...sel].map(i => (paginated.value as ReconTransaction[])[i]!).filter(Boolean) }
function onFindConfirm(lineIds: string[]) {
  reconMatch(props.account.id, lineIds, findAnchors.value.map(x => x.id), 'manual')
  findAnchors.value = []
  toast.notify({ variant: 'success', title: t('Transaction reconciled'), maxWidth: 'max-content' })
}

// ── Delete ──
const deleteTarget = ref<ReconTransaction | null>(null)
function confirmDelete() {
  if (!deleteTarget.value) return
  reconDelete([deleteTarget.value.id])
  deleteTarget.value = null
  toast.notify({ variant: 'success', title: t('Transaction deleted'), maxWidth: 'max-content' })
}
</script>

<template>
  <div class="nr">
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
      filter-empty-label="transaction"
      @page-change="setPage"
      @per-page-change="setPerPage"
      @sort="toggleSort"
      @sort-change="setSort"
      @clear-filters="clearFilters"
    >
      <template #filters>
        <div class="nr-filter-left">
          <AdvancedDateRangePicker id="nr-daterange" :model-value="dateRange" placeholder="All dates" @update:model-value="dateRange = $event" />
          <ErpFilterSelect id="nr-cashflow" v-model="cashFlow" :placeholder="t('Cash flow')" :options="CASH_FLOW" />
        </div>
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input
          v-model="search"
          class="filter-search-input"
          type="text"
          :placeholder="t('Search...')" :aria-label="t('Search...')" />
        </div>
      </template>

      <template #bulk-actions="{ selectedRows }">
        <MpButton size="sm" variant="secondary" is-rounded @click="openFind(rowsFrom(selectedRows as Set<number>))">{{ t('Find transaction') }}</MpButton>
      </template>

      <template #cell-date="{ row }">{{ formatDate((row as unknown as ReconTransaction).date) }}</template>
      <template #cell-number="{ row }">
        <span class="cell-link" @click.stop="openFind([row as unknown as ReconTransaction])">{{ (row as unknown as ReconTransaction).type }} #{{ (row as unknown as ReconTransaction).number }}</span>
      </template>
      <template #cell-contact="{ row }"><span>{{ (row as unknown as ReconTransaction).contact || '—' }}</span></template>
      <template #cell-amount="{ row }">
        <span :class="{ 'nr-in': (row as unknown as ReconTransaction).direction === 'in' }">{{ money(row as unknown as ReconTransaction) }}</span>
      </template>

      <template #actions="{ row }">
        <MpPopover :id="`nr-act-${(row as unknown as ReconTransaction).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="ghost" is-rounded class="nr-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="sm" /></MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="openFind([row as unknown as ReconTransaction])">{{ t('Find transaction') }}</MpPopoverListItem>
              <MpPopoverListItem @click="deleteTarget = (row as unknown as ReconTransaction)">{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>

      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-full__illustration" width="288" height="240" />
          <p class="empty-full__title">{{ t('Nothing left to reconcile here.') }}</p>
        </div>
      </template>
    </ErpTablePage>
    <p v-if="bulkError" class="nr-error" role="alert">{{ bulkError }}</p>

    <ReconciliationFindMatchModal
      :open="findAnchors.length > 0"
      :account="account"
      mode="book"
      :anchors="findAnchors.map(x => ({ id: x.id, date: x.date, number: `${x.type} #${x.number}`, contact: x.contact, description: x.description, amount: x.amount, direction: x.direction }))"
      :candidates="candidates"
      @close="findAnchors = []"
      @confirm="onFindConfirm"
    />
    <ConfirmModal
      :is-open="deleteTarget !== null"
      :title="t('Delete transaction?')"
      :description="deleteTarget ? `${deleteTarget.type} #${deleteTarget.number} ${t('will be deleted. This cannot be undone here.')}` : ''"
      :confirm-label="t('Delete')"
      @update:is-open="(v: boolean) => { if (!v) deleteTarget = null }"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.nr { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding-top: var(--mp-spacing-5); }
.nr-filter-left { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.nr-in { color: var(--mp-colors-text-success); }
.nr-kebab { min-width: 0 !important; }
.nr-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.empty-full { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-10, 40px) 0; }
.empty-full__illustration { width: var(--mp-sizes-72, 288px); height: var(--mp-sizes-60, 240px); object-fit: contain; }
.empty-full__title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
</style>
