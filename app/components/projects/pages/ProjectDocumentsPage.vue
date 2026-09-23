<script setup lang="ts">
/**
 * Documents — the index of cost documents pegged to a project (PRD §4, §5;
 * Stories 5, 6, 14): purchase requests, purchase orders, expenses and timesheets
 * with the project on every line. Creating one lives on its own page
 * (/project-documents/new); this page is the list.
 *
 * Index-page standard: ErpTablePage + useTableState (rule/table-use-erptablepage),
 * filter bar with ErpFilterSelect + search (rule/filter-bar-anatomy).
 */
import { MpButton, MpIcon } from '@mekari/pixel3'
import PmTitleBar from '../PmTitleBar.vue'
import PmMenu from '../PmMenu.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { peggedDocuments, type PeggedDocument } from '~/data/projectTransactions'
import { getWorkPackage, nodeLabel } from '~/data/projects'
import { accountName } from '~/data/projectBudgets'
import { rp, pct } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'
import { badgeProps } from '~/utils/projectStatus'

const { t } = useLocale()
const router = useRouter()

const DOC_TYPES: { value: PeggedDocument['docType']; label: string }[] = [
  { value: 'PR', label: 'Purchase request' },
  { value: 'PO', label: 'Purchase order' },
  { value: 'Expense', label: 'Expense' },
  { value: 'Timesheet', label: 'Timesheet' },
]
const typeFilter = ref('')
const statusFilter = ref('')
const typeOptions = computed(() => DOC_TYPES.map(d => ({ value: d.value, label: t(d.label) })))
const statusOptions = computed(() => (['posted', 'held', 'ordinary', 'draft', 'rejected'] as PeggedDocument['status'][])
  .map(s => ({ value: s, label: badgeProps('doc', s, t).label })))

const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

// Row = the document flattened so every column sorts on its own value.
interface Row {
  id: string; docNo: string; docType: PeggedDocument['docType']; typeLabel: string; party: string
  date: string; lines: string; amount: number; status: PeggedDocument['status']; projectId?: string; d: PeggedDocument
}
const rows = computed<Row[]>(() => peggedDocuments.map(d => {
  const wpId = d.lines.find(l => l.wpId)?.wpId
  return {
    id: d.id, docNo: d.docNo, docType: d.docType, typeLabel: t(DOC_TYPES.find(x => x.value === d.docType)?.label ?? d.docType),
    party: d.vendor ?? d.createdBy, date: d.date, lines: d.lines.map(l => l.description).join(', '),
    amount: d.lines.reduce((s, l) => s + l.amount, 0),
    status: d.status, projectId: wpId ? getWorkPackage(wpId)?.projectId : undefined, d,
  }
}))

const {
  search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<Row>(rows, {
  perPage: 25,
  defaultSort: { key: 'date', dir: 'desc' },
  filterFn: (r, s) => {
    const matches = !s || r.docNo.toLowerCase().includes(s) || r.party.toLowerCase().includes(s)
      || r.d.lines.some(l => l.description.toLowerCase().includes(s))
    return matches && (!typeFilter.value || r.docType === typeFilter.value) && (!statusFilter.value || r.status === statusFilter.value)
  },
})
watch([typeFilter, statusFilter], () => setPage(1))
const hasActiveFilter = computed(() => !!typeFilter.value || !!statusFilter.value)
function clearFilters() { typeFilter.value = ''; statusFilter.value = ''; search.value = '' }

const columns = computed<TableColumn[]>(() => [
  { key: 'docNo', label: t('Number'), kind: 'number', sortType: 'text' },
  { key: 'typeLabel', label: t('Type'), sortType: 'text' },
  { key: 'date', label: t('Date'), kind: 'date', sortType: 'text' },
  { key: 'lines', label: t('Lines'), kind: 'address', sortType: 'text' },
  { key: 'amount', label: t('Amount'), kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'status', label: t('Status'), kind: 'status', sortType: 'text' },
])
const asRow = (r: unknown) => r as Row
const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <div class="pm-page">
    <PmTitleBar :title="t('Documents')" :breadcrumb="{ label: t('Projects'), to: '/projects' }">
      <template #actions>
        <MpButton id="pd-new" variant="primary" is-rounded left-icon="add" @click="router.push('/project-documents/new')">{{ t('New document') }}</MpButton>
      </template>
    </PmTitleBar>

    <div class="pm-stage">
      <ErpTablePage
        :columns="columns"
        :rows="(paginated as unknown as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        :loading="loading"
        :has-active-search="!!search"
        :has-active-filter="hasActiveFilter"
        :search="search"
        filter-empty-label="document"
        actions-align-top
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @clear-filters="clearFilters"
      >
        <template #filters>
          <div class="filter-left">
            <ErpFilterSelect id="pd-type-filter" v-model="typeFilter" :placeholder="t('Document type')" :options="typeOptions" width="200px" />
            <ErpFilterSelect id="pd-status-filter" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions" width="200px" />
          </div>
          <div class="filter-right">
            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search document, vendor...')" />
            </div>
          </div>
        </template>

        <template #cell-docNo="{ row }">
          <div>
            <span v-if="asRow(row).projectId" class="cell-link" role="link" tabindex="0" @click.stop="router.push(`/projects/${asRow(row).projectId}?tab=cost`)" @keydown.enter="router.push(`/projects/${asRow(row).projectId}?tab=cost`)">{{ asRow(row).docNo }}</span>
            <span v-else class="pm-strong">{{ asRow(row).docNo }}</span>
            <span class="pm-cell-sub">{{ asRow(row).party }}</span>
          </div>
        </template>
        <template #cell-date="{ row }">{{ formatDate(asRow(row).date) }}</template>
        <template #cell-lines="{ row }">
          <div>
            <div v-for="(l, i) in asRow(row).d.lines.slice(0, 2)" :key="i">{{ l.description }}</div>
            <span class="pm-cell-sub">
              {{ t(accountName(asRow(row).d.lines[0]!.account)) }} · {{ asRow(row).d.lines[0]!.wpId ? nodeLabel(asRow(row).d.lines[0]!.wpId!) : t('no project') }}<template v-if="asRow(row).d.lines.length > 2"> · +{{ asRow(row).d.lines.length - 2 }}</template>
            </span>
          </div>
        </template>
        <template #cell-amount="{ row }">
          <div>
            <div>{{ rp(asRow(row).amount) }}</div>
            <span v-if="asRow(row).d.override" class="pm-cell-sub pm-nowrap">{{ t('Over by') }} {{ rp(asRow(row).d.override!.overBy) }} ({{ pct(asRow(row).d.override!.overPct) }})</span>
          </div>
        </template>
        <template #cell-status="{ row }"><ErpStatusBadge v-bind="badgeProps('doc', asRow(row).status, t)" /></template>

        <template #actions="{ row }">
          <PmMenu :id="`pd-row-${asRow(row).id}`" kebab :label="t('More actions')" :items="[
            { label: t('Open project'), action: () => router.push(`/projects/${asRow(row).projectId}?tab=cost`), disabledReason: asRow(row).projectId ? undefined : t('No line on this document names a project') },
            { label: t('Open in Approvals'), action: () => router.push('/project-approvals'), disabledReason: asRow(row).status === 'held' ? undefined : t('Only a held document waits for Finance') },
          ]" />
        </template>

        <template #empty>
          <div class="pm-empty-full">
            <img :src="emptyIllustration" alt="" class="pm-empty-illustration" width="288" height="240" />
            <p class="pm-empty-title">{{ t('No documents') }}</p>
            <p class="pm-empty-desc">{{ t('Documents will appear here.') }}</p>
            <MpButton variant="secondary" is-rounded left-icon="add" class="pm-empty-cta" @click="router.push('/project-documents/new')">{{ t('New document') }}</MpButton>
          </div>
        </template>
      </ErpTablePage>
    </div>
  </div>
</template>
