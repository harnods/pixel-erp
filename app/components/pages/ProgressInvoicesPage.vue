<!-- prod-parity: jurnal-frontend-app/src/pages/sales/list/list.vue + list.js (type_select proforma_type = "Progress invoice", order_proforma_type = "Proforma invoice"; ERP wording map in pages/sales/index.vue) -->
<script setup lang="ts">
import {
  MpButton, MpIcon, MpTooltip, MpButtonGroup,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast, successToast } from '~/utils/toasts'
import {
  progressDocsOf, totalsOf, deleteProgressDocs, markProgressDocPaid, masterLabel,
  type ProgressDoc, type ProgressDocKind,
} from '~/data/progressInvoices'

const { t } = useLocale()
const route = useRoute()
const router = useRouter()
const toggleAirene = inject<() => void>('toggleAirene')

// Sidebar Sales › Progress invoice → /progress-invoice ; Sales › Proforma invoice → /proforma-invoice.
const kind = computed<ProgressDocKind>(() => (route.path.startsWith('/proforma') ? 'proforma' : 'progress'))
const entity = computed(() => (kind.value === 'progress' ? t('Progress invoice') : t('Proforma invoice')))
const base = computed(() => (kind.value === 'progress' ? '/progress-invoices' : '/proforma-invoices'))

interface Row {
  id: string
  date: string
  number: string
  customerName: string
  dueDate: string
  status: string
  balanceDue: number
  total: number
  tags: string[]
  master: string
  doc: ProgressDoc
}

const rows = computed<Row[]>(() => progressDocsOf(kind.value).map((d) => {
  const tt = totalsOf(d)
  return {
    id: d.id, date: d.date, number: d.number, customerName: d.customer.name, dueDate: d.dueDate,
    status: d.status, balanceDue: tt.balance, total: tt.total, tags: d.tags,
    master: masterLabel(d.kind, d.masterNumber), doc: d,
  }
}))

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, setSort, toggleSort,
} = useTableState<Row>(rows, {
  perPage: 25,
  filterFn: (r, s, status) => {
    const q = s.toLowerCase()
    const matchesSearch = !q || r.number.toLowerCase().includes(q) || r.customerName.toLowerCase().includes(q) || r.master.toLowerCase().includes(q)
    return matchesSearch && (!status || r.status === status)
  },
  defaultSort: { key: 'date', dir: 'desc' },
})
watch(kind, () => { search.value = ''; statusFilter.value = '' })

// Prod status options for both types: All · Open · Paid (no "All" entry here — clearing resets).
const statusOptions = computed(() => [
  { label: t('Open'), value: 'open' },
  { label: t('Paid'), value: 'paid' },
])

const hasActiveFilter = computed(() => !!search.value || !!statusFilter.value)
function clearFilters() { search.value = ''; statusFilter.value = '' }

const columns = computed<TableColumn[]>(() => [
  { key: 'date', label: t('Date'), kind: 'date', sortable: true, sortType: 'date' },
  { key: 'number', label: t('Number'), kind: 'number', sortable: true, sortType: 'text' },
  { key: 'customerName', label: t('Customer'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'dueDate', label: t('Due date'), kind: 'date', sortable: true, sortType: 'date' },
  { key: 'status', label: t('Status'), kind: 'status', sortType: 'text' },
  { key: 'balanceDue', label: t('Balance due'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'total', label: t('Total'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'tags', label: t('Tags'), kind: 'tags' },
])

const asRow = (r: unknown) => r as Row

function goDetail(id: string) { router.push(`${base.value}/${id}`) }
function goCreate() { router.push(`${base.value}/new`) }
function goMaster(r: Row) {
  router.push(r.doc.kind === 'progress' ? `/sales-invoices/${r.doc.masterId}` : `/sales-orders/${r.doc.masterId}`)
}
function receivePayment(r: Row) {
  markProgressDocPaid(r.id)
  successToast(t('Successfully processed'))
}

const deleteIds = ref<string[]>([])
const deleteOpen = computed({ get: () => deleteIds.value.length > 0, set: (v: boolean) => { if (!v) deleteIds.value = [] } })
function runDelete() {
  const ids = deleteIds.value
  const doc = rows.value.find((r) => r.id === ids[0])
  deleteProgressDocs(ids)
  successToast(ids.length === 1 && doc ? `${entity.value} ${doc.number} ${t('deleted')}` : `${ids.length} ${t('transactions deleted')}`)
  deleteIds.value = []
}

const emptyIllustration = '/illustrations/empty-folder.png'
function notInPrototype() { infoToast(t('Not in this prototype')) }
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
    has-checkbox
    :bulk-label="entity.toLowerCase()"
    :filter-empty-label="entity.toLowerCase()"
    :context-label="(row) => `${entity} #${row.number}`"
    :search="search"
    :has-active-filter="hasActiveFilter"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @clear-filters="clearFilters"
  >
    <!-- ── Bulk actions ── -->
    <template #bulk-actions>
      <MpPopover id="pgi-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
        <MpPopoverTrigger>
          <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="notInPrototype">{{ t('Print PDF') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <ErpFilterSelect id="pgi-status" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions" />
      </div>
      <div class="filter-right">
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip :label="t('Ask Airene')" placement="bottom">
            <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
          </MpTooltip>
          <MpTooltip :label="t('Export')" placement="bottom">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="notInPrototype" />
          </MpTooltip>
        </MpButtonGroup>
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <MpIcon name="close" size="sm" />
          </button>
        </div>
      </div>
    </template>

    <template #cell-date="{ row }">{{ formatDate(asRow(row).date) }}</template>
    <template #cell-number="{ row }">
      <span class="pgi-number">
        <span class="cell-link cell-text" @click.stop="goDetail(asRow(row).id)">{{ entity }} #{{ asRow(row).number }}</span>
        <span class="pgi-master cell-text" @click.stop="goMaster(asRow(row))">{{ asRow(row).master }}</span>
      </span>
    </template>
    <template #cell-customerName="{ row }"><span class="cell-link cell-text" @click.stop>{{ asRow(row).customerName }}</span></template>
    <template #cell-dueDate="{ row }">{{ formatDate(asRow(row).dueDate) }}</template>
    <template #cell-status="{ row }"><ErpStatusBadge :status="asRow(row).status" /></template>
    <template #cell-balanceDue="{ row }">{{ formatIDR(asRow(row).balanceDue) }}</template>
    <template #cell-total="{ row }">{{ formatIDR(asRow(row).total) }}</template>
    <template #cell-tags="{ row }"><ErpTagList :tags="asRow(row).tags" /></template>

    <!-- ── Row actions ── -->
    <template #actions="{ row }">
      <MpPopover :id="`pgi-row-${asRow(row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="goDetail(asRow(row).id)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem v-if="asRow(row).status === 'open'" @click="receivePayment(asRow(row))">{{ t('Receive payment') }}</MpPopoverListItem>
            <MpPopoverListItem @click="notInPrototype">{{ t('Print') }}</MpPopoverListItem>
            <MpPopoverListItem class="pgi-danger" @click="deleteIds = [asRow(row).id]">{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No') }} {{ entity.toLowerCase() }} {{ t('yet') }}</p>
        <p class="empty-full-desc">{{ entity }} {{ t('list will appear here.') }}</p>
        <MpButton variant="secondary" left-icon="add" is-rounded @click="goCreate">{{ t('New') }} {{ entity.toLowerCase() }}</MpButton>
      </div>
    </template>
  </ErpTablePage>

  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="`${t('Delete')} ${entity.toLowerCase()}?`"
    :description="`${t('The deleted')} ${entity.toLowerCase()} ${t('is unable to be restored.')}`"
    :confirm-label="t('Delete')"
    is-danger
    @confirm="runDelete"
  />
</template>

<style scoped>
/* Filter bar + cells — copied from BillsIndexPage.vue / CurrentAssetsPage.vue */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
.filter-btn-group :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.pgi-number { display: flex; flex-direction: column; min-width: 0; }
.pgi-master { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); cursor: pointer; }
.pgi-master:hover { color: var(--mp-text-link); }
.pgi-danger { color: var(--mp-text-danger); }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
</style>
