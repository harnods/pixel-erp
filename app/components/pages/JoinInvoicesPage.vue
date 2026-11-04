<!-- prod-parity: jurnal-frontend-app/src/pages/sales/list/list.js (type=join_type) · purchases/merged_invoices -->
<script setup lang="ts">
/**
 * Sales › Join invoice and Purchases › Join purchase invoices — the list of join
 * invoices. In prod this is the invoice list filtered to `?type=join_type`
 * (columns Date · Number · Customer/Vendor · Due date · Status · Balance due ·
 * Total; status options Open / Overdue / Paid). Kind comes from the route.
 */
import {
  MpButton, MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { formatDate } from '~/utils/date'
import { formatIDR } from '~/utils/currency'
import { successToast } from '~/utils/toasts'
import {
  joinInvoicesOf, joinNumber, joinStatus, joinTotal, joinRemaining, deleteJoinInvoice,
  type JoinKind, type JoinStatus,
} from '~/data/joinInvoices'

const { t } = useLocale()
const router = useRouter()
const route = useRoute()

const kind = computed<JoinKind>(() => (route.path.startsWith('/join-purchase') ? 'purchase' : 'sales'))
const base = computed(() => (kind.value === 'sales' ? '/join-invoices' : '/join-purchase-invoices'))

interface Row {
  id: string; number: string; contactName: string; transactionDate: string; dueDate: string
  status: JoinStatus; balance: number; total: number; invoiceCount: number
}

const statusFilter = ref('')
const statusOptions = [
  { value: 'open', label: t('Open') },
  { value: 'overdue', label: t('Overdue') },
  { value: 'paid', label: t('Paid') },
]

const rows = computed<Row[]>(() => joinInvoicesOf(kind.value)
  .map((j) => ({
    id: j.id, number: joinNumber(j), contactName: j.contactName, transactionDate: j.transactionDate, dueDate: j.dueDate,
    status: joinStatus(j), balance: joinRemaining(j), total: joinTotal(j), invoiceCount: j.lines.length,
  }))
  .filter((r) => !statusFilter.value || r.status === statusFilter.value))

const { search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, setSort } = useTableState<Row>(rows, {
  perPage: 25,
  filterFn: (row, s) => !s || row.number.toLowerCase().includes(s) || row.contactName.toLowerCase().includes(s),
  defaultSort: { key: 'transactionDate', dir: 'desc' },
})

const columns = computed<TableColumn[]>(() => [
  { key: 'transactionDate', label: t('Date'), kind: 'date', sortable: true, sortType: 'date' },
  { key: 'number', label: t('Number'), kind: 'number', sortable: true, sortType: 'text' },
  { key: 'contactName', label: kind.value === 'sales' ? t('Customer') : t('Vendor'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'dueDate', label: t('Due date'), kind: 'date', sortable: true, sortType: 'date' },
  { key: 'status', label: t('Status'), kind: 'status' },
  { key: 'balance', label: t('Balance due'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'total', label: t('Total'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
])

const hasActiveFilter = computed(() => !!search.value || !!statusFilter.value)
function clearFilters() { search.value = ''; statusFilter.value = '' }

function openDetail(r: Row) { router.push(`${base.value}/${r.id}`) }
function openEdit(r: Row) { router.push(`${base.value}/${r.id}/edit`) }

const deleteOpen = ref(false)
const toDelete = ref<Row | null>(null)
function askDelete(r: Row) { toDelete.value = r; deleteOpen.value = true }
function confirmDelete() {
  if (!toDelete.value) return
  deleteJoinInvoice(toDelete.value.id)
  successToast(kind.value === 'sales' ? t('Join invoice successfully deleted.') : t('Join invoice deleted'))
  toDelete.value = null
}
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
    :has-active-filter="hasActiveFilter"
    bulk-label="join invoice"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort-change="setSort"
    @clear-filters="clearFilters"
  >
    <template #filters>
      <div class="filter-left">
        <ErpFilterSelect id="ji-status" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions" />
      </div>
      <div class="filter-right">
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search')" :aria-label="t('Search')" />
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <MpIcon name="close" size="sm" />
          </button>
        </div>
      </div>
    </template>

    <template #cell-transactionDate="{ value }">{{ formatDate(value as string) }}</template>
    <template #cell-number="{ row }">
      <span class="cell-link cell-text" @click.stop="openDetail(row as unknown as Row)">{{ (row as unknown as Row).number }}</span>
    </template>
    <template #cell-contactName="{ value }"><span class="cell-text">{{ value }}</span></template>
    <template #cell-dueDate="{ value }">{{ formatDate(value as string) }}</template>
    <template #cell-status="{ value }"><ErpStatusBadge :status="value as string" /></template>
    <template #cell-balance="{ value }">{{ formatIDR(value as number) }}</template>
    <template #cell-total="{ value }">{{ formatIDR(value as number) }}</template>

    <template #actions="{ row }">
      <MpPopover :id="`ji-actions-${(row as unknown as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="openDetail(row as unknown as Row)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openEdit(row as unknown as Row)">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem @click="askDelete(row as unknown as Row)">{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No join invoices yet') }}</p>
        <p class="empty-full-desc">{{ kind === 'sales' ? t('Join 2 or more invoices of the same customer into one bill.') : t('Join 2 or more invoices of the same vendor into one bill.') }}</p>
      </div>
    </template>
  </ErpTablePage>

  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete joining the invoice?')"
    :description="t('The deleted invoice will be unable to be restored.')"
    :confirm-label="t('Delete')"
    @confirm="confirmDelete"
  />
</template>

<style scoped>
.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: var(--filter-search-w, 248px);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent; min-width: 0;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default);
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn { display: inline-flex; border: none; background: none; padding: 0; cursor: pointer; color: var(--mp-text-subtle); }

.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: var(--mp-spacing-0\.5) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
