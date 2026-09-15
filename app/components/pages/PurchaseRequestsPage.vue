<script setup lang="ts">
import {
  MpButton, MpButtonGroup, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, toast, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ScenarioFab from '~/components/patterns/ScenarioFab.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import CopyLinkDrawer from '~/components/patterns/CopyLinkDrawer.vue'
import ShareViaEmailModal from '~/components/patterns/ShareViaEmailModal.vue'
import { formatDate } from '~/utils/date'
import PurchaseRequestFiltersDrawer, { emptyPurchaseRequestFilters, type PurchaseRequestFiltersValue } from '~/components/patterns/PurchaseRequestFiltersDrawer.vue'
import { purchaseRequests, updatePurchaseRequest } from '~/data'
import type { PurchaseRequest } from '~/data'

const toggleAirene = inject<() => void>('toggleAirene')
const { t } = useLocale()
const route = useRoute()
const router = useRouter()

// The "Awaiting approval" tab is driven by ?tab= (same as StockAdjustmentsPage).
const isAwaiting = computed(() => route.query.tab === 'Awaiting approval')

function viewDetails(id: string) { router.push(`/purchase-requests/${id}`) }

// ─── Column definitions (DATE + NUMBER mirror the Expenses index) ──────────────
const columns: TableColumn[] = [
  { key: 'date',             label: t('Date'),             kind: 'date',                                   sortType: 'date'   },
  { key: 'number',           label: t('Number'),           kind: 'number', sortable: true,                 sortType: 'number' },
  { key: 'attachment',       label: '',                    width: '52px',  noHeader: true, align: 'center' },
  { key: 'procurementStaff', label: t('Procurement staff'), kind: 'name', sortable: true,                sortType: 'text'   },
  { key: 'requiredDate',     label: t('Required date'),    kind: 'date',                                   sortType: 'date'   },
  { key: 'status',           label: t('Status'),           kind: 'status',                                 sortType: 'text'   },
  { key: 'totalProducts',    label: t('Total products'),                                   sortable: true,  sortType: 'number' },
  { key: 'urgency',          label: t('Urgency level'),                    sortable: true,                 sortType: 'text'   },
  { key: 'tags',             label: t('Tags'),             kind: 'tags'                                    },
]

// Prototype preview toggle (ScenarioFab, bottom-right): data vs empty-state view
const previewMode = ref<'data' | 'empty'>('data')

// ─── Rows — newest request first (transactional log), awaiting subset on that tab ──
const rows = computed<PurchaseRequest[]>(() => {
  if (previewMode.value === 'empty') return []
  const list = [...purchaseRequests].sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number)
  return isAwaiting.value ? list.filter(pr => pr.awaitingApproval) : list
})

type Row = PurchaseRequest

// ─── "All filters" drawer — a second, independent filter layer, ANDed with the
// toolbar's own Status select + search (same pattern as SalesOrdersPage). ──────
const filtersOpen = ref(false)
const appliedFilters = reactive<PurchaseRequestFiltersValue>(emptyPurchaseRequestFilters())

const keywordColumns = [
  { key: 'number',           label: t('Number')            },
  { key: 'procurementStaff', label: t('Procurement staff') },
  { key: 'tags',             label: t('Tags')              },
]
const tagOptions = computed(() => [...new Set(purchaseRequests.flatMap(pr => pr.tags ?? []))].sort())

function applyDrawerFilters(v: PurchaseRequestFiltersValue) { Object.assign(appliedFilters, v) }

function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
// AdvancedDateRangePicker emits a [start, end] Date pair (or null = not applied).
function matchesDateRange(iso: string, range: Date[] | null): boolean {
  if (!range) return true
  const time = dayStart(new Date(iso)).getTime()
  return time >= dayStart(range[0]!).getTime() && time <= dayStart(range[1]!).getTime()
}

// ─── Table state ──────────────────────────────────────────────────────────────
const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<PurchaseRequest>(rows, {
  perPage: 25,
  filterFn: (row, s, status) => {
    const matchesSearch = String(row.number).includes(s) || row.procurementStaff.toLowerCase().includes(s)
    const matchesStatus = !status || row.status === status

    // ── Drawer filters (independent of the toolbar's Status select / search) ──
    const f = appliedFilters
    const kw = f.keyword.toLowerCase().trim()
    const rowTags = row.tags ?? []
    const matchesKeyword = !kw || (
      f.keywordColumn === 'all'
        ? String(row.number).includes(kw) || row.procurementStaff.toLowerCase().includes(kw) || rowTags.some(tg => tg.toLowerCase().includes(kw))
        : f.keywordColumn === 'number' ? String(row.number).includes(kw)
        : f.keywordColumn === 'procurementStaff' ? row.procurementStaff.toLowerCase().includes(kw)
        : rowTags.some(tg => tg.toLowerCase().includes(kw))
    )
    const matchesRequestDate = matchesDateRange(row.date, f.requestDate)
    const matchesRequiredDate = matchesDateRange(row.requiredDate, f.requiredDate)
    const matchesDrawerStatus = f.status.length === 0 || f.status.includes(row.status)
    const matchesUrgency = f.urgency.length === 0 || f.urgency.includes(row.urgency)
    const matchesTags = f.tags.length === 0
      || (f.tagsComparator === 'isAnyOf' ? f.tags.some(tg => rowTags.includes(tg))
        : f.tagsComparator === 'isAllOf' ? f.tags.every(tg => rowTags.includes(tg))
        : f.tags.every(tg => !rowTags.includes(tg)))

    return matchesSearch && matchesStatus
      && matchesKeyword && matchesRequestDate && matchesRequiredDate && matchesDrawerStatus
      && matchesUrgency && matchesTags
  },
})

watch(appliedFilters, () => setPage(1))
// Reset to page 1 when switching between the All / Awaiting approval tabs.
watch(isAwaiting, () => setPage(1))

const activeFilterCount = computed(() => {
  const f = appliedFilters
  let n = 0
  if (f.keyword) n++
  if (f.requestDate) n++
  if (f.requiredDate) n++
  if (f.status.length > 0) n++
  if (f.urgency.length > 0) n++
  if (f.tags.length > 0) n++
  return n
})
const isDrawerFilterActive = computed(() => activeFilterCount.value > 0)

// ─── Filter options ───────────────────────────────────────────────────────────
// Quick-filter options — NO "All status" entry; clearing (x) resets to show-all.
const statusOptions = [
  { label: t('Open'),                value: 'open'                },
  { label: t('Partially processed'), value: 'partially processed' },
  { label: t('Closed'),              value: 'closed'              },
  { label: t('Voided'),              value: 'voided'              },
]

const urgencyOptions = [
  { label: t('High'),   value: 'high'   },
  { label: t('Medium'), value: 'medium' },
  { label: t('Low'),    value: 'low'    },
]

// ─── Urgency pip (Pixel priority icon + label) ─────────────────────────────────
const URGENCY_META: Record<string, { label: string; icon: string; color: string }> = {
  low:    { label: t('Low'),    icon: 'priority-low',    color: 'var(--mp-text-link, #165082)'    },
  medium: { label: t('Medium'), icon: 'priority-medium', color: 'var(--mp-icon-warning, #e46910)' },
  high:   { label: t('High'),   icon: 'priority-high',   color: 'var(--mp-icon-danger, #e2483d)'  },
}

// ─── First-load skeleton (pagination skeleton is handled by ErpTablePage) ─────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

const emptyIllustration = '/illustrations/empty-folder.png'

function clearFilters() {
  search.value = ''
  statusFilter.value = ''
  Object.assign(appliedFilters, emptyPurchaseRequestFilters())
}

// ─── Row actions ───────────────────────────────────────────────────────────────
// Create purchase order → opens the PO form pre-loaded with this request's items
// (grouped in the accordion table). Wired at the router level in [...slug].vue.
const createPurchaseOrderFromRequests = inject<(ids: string[]) => void>('createPurchaseOrderFromRequests')
function createPurchaseOrder(pr: PurchaseRequest) {
  createPurchaseOrderFromRequests?.([pr.id])
}
function markCompleted(id: string) {
  updatePurchaseRequest(id, { status: 'closed', awaitingApproval: false })
  toast.notify({ variant: 'success', title: t('Purchase request marked as completed') })
}
function duplicate(pr: PurchaseRequest) {
  toast.notify({ variant: 'success', title: `${t('Purchase request duplicated')} #${pr.number}` })
}

// Column show/hide (first column always on; Last updated appended, hidden by default)
const allCols: TableColumn[] = [...columns, { key: 'lastUpdated', label: t('Last updated'), kind: 'date' }]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allCols.map(c => [c.key, c.key !== 'lastUpdated'])))
const columnItems = allCols
  .filter(c => c.label && !c.noHeader)
  .map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => allCols.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// ─── Bulk actions (selection bar) ──────────────────────────────────────────────
function bulkSelectedRequests(selectedRows: Set<number>): Row[] {
  return [...selectedRows].map(i => paginated.value[i] as Row).filter(Boolean)
}

// ─── Export / Copy link / Share via email (shared patterns) ────────────────────
const exportOpen = ref(false)
const copyOpen = ref(false)
const copyItems = ref<{ title: string; subtitle?: string; url: string }[]>([])
const shareOpen = ref(false)
const shareTitle = ref('')
const shareSubject = ref('')
const shareAttachment = ref('')
function recordLink(id: string) { return `https://mkrierp.id/${id}` }
function openExport() { exportOpen.value = true }
function openCopyLinks(rs: Row[]) {
  copyItems.value = rs.map(r => ({ title: `${t('Purchase Request')} #${r.number}`, subtitle: r.procurementStaff, url: recordLink(r.id) }))
  copyOpen.value = true
}
function openShare(r: Row) {
  shareTitle.value = `${t('Purchase Request')} #${r.number}`
  shareSubject.value = `${t('Purchase Request')} #${r.number}`
  shareAttachment.value = `PR-${r.number}.pdf`
  shareOpen.value = true
}
function openShareBulk(selectedRows: Set<number>) {
  const rs = bulkSelectedRequests(selectedRows)
  if (rs.length) openShare(rs[0]!)
}
const exportColumns = computed(() => [
  ...columns
    .filter(c => c.label && !c.noHeader)
    .map(c => ({ key: c.key, label: c.label, ...(c.key === 'number' ? { required: true } : {}) })),
  { key: 'warehouse', label: t('Warehouse') },
  { key: 'referenceNo', label: t('Reference no.') },
  { key: 'message', label: t('Message') },
  { key: 'memo', label: t('Memo') },
])
</script>

<template>
  <ErpTablePage
    :columns="visibleColumns"
    :rows="(paginated as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :loading="loading"
    :has-active-filter="!!search || !!statusFilter || isDrawerFilterActive"
    :search="search"
    has-checkbox
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >

    <!-- ── Bulk actions ── -->
    <template #bulk-actions="{ selectedRows }">
      <!-- Bulk bar = single secondary-sm "Actions" dropdown (never primary); no Delete (rule/bulk-actions-no-delete) -->
      <MpPopover id="pr-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
        <MpPopoverTrigger>
          <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem>{{ t('Print PDF') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openShareBulk(selectedRows as Set<number>)">{{ t('Share via email') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openCopyLinks(bulkSelectedRequests(selectedRows as Set<number>).slice(0, 5))">{{ t('Copy link') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <!-- Left: Status select + All filters -->
      <div class="filter-left">
        <ErpFilterSelect id="pr-status" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions" />

        <MpButton variant="secondary" left-icon="filter" is-rounded class="filter-all-btn" :class="{ 'filter-all-btn--active': isDrawerFilterActive }" @click="filtersOpen = true">{{ t('All filters') }}{{ activeFilterCount > 0 ? ` (${activeFilterCount})` : '' }}</MpButton>
      </div>

      <!-- Right: icon buttons + search -->
      <div class="filter-right">
        <!-- Icon tools = ghost icon MpButtons in one MpButtonGroup + tooltips (rule/filter-bar-icon-group) -->
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip :label="t('Ask Airene')" placement="bottom">
            <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
          </MpTooltip>
          <ColumnSettingsMenu id="pr-tt-columns" :items="columnItems" :visibility="columnVisibility" />
          <MpTooltip :label="t('Export')" placement="bottom">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="openExport" />
          </MpTooltip>
        </MpButtonGroup>

        <!-- Pill search (sanctioned ErpFilterBar pill; icons are MpIcon) -->
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input
            v-model="search"
            class="filter-search-input"
            type="text"
            :placeholder="t('Search...')"
          />
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <MpIcon name="close" size="sm" />
          </button>
        </div>
      </div>
    </template>

    <!-- ── Cell: Date ── -->
    <template #cell-date="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Number — "View details" on row hover ── -->
    <template #cell-number="{ row, value }">
      <span class="cell-link cell-text cell-number" :title="`${t('Purchase Request')} #${value}`" @click.stop="viewDetails((row as PurchaseRequest).id)">{{ t('Purchase Request') }} #{{ value }}</span>
    </template>

    <!-- ── Cell: Attachment icon (narrow column, no header) ── -->
    <template #cell-attachment="{ value, row }">
      <div v-if="value" class="attachment-icons-cell">
        <MpTooltip :id="`pr-attachment-tt-${(row as PurchaseRequest).id}`" :label="t('Attachment')" placement="bottom" use-portal>
          <span class="attachment-icon-indicator"><MpIcon name="attachment" size="sm" /></span>
        </MpTooltip>
      </div>
    </template>

    <!-- ── Cell: Procurement staff ── -->
    <template #cell-procurementStaff="{ value }">
      <span class="cell-text">{{ value }}</span>
    </template>

    <!-- ── Cell: Required date ── -->
    <template #cell-requiredDate="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Status ── -->
    <template #cell-status="{ value }">
      <ErpStatusBadge :status="value as string" />
    </template>

    <!-- ── Cell: Total products ── -->
    <template #cell-totalProducts="{ value }">
      {{ value }}
    </template>

    <!-- ── Cell: Urgency level (Pixel priority icon + label) ── -->
    <template #cell-urgency="{ value }">
      <span class="urgency">
        <MpIcon :name="URGENCY_META[value as string]?.icon" size="sm" class="urgency__ic" :style="{ color: URGENCY_META[value as string]?.color }" />
        <span class="urgency__label">{{ URGENCY_META[value as string]?.label }}</span>
      </span>
    </template>

    <!-- ── Cell: Tags — clamped to 2 lines, "More" link on overflow ── -->
    <template #cell-tags="{ value }">
      <ErpTagList :tags="(value as string[])" />
    </template>

    <!-- ── Full empty state (no purchase requests yet) ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No purchase requests') }}</p>
        <p class="empty-full-desc">{{ t('Purchase requests will appear here.') }}</p>
        <MpButton variant="secondary" left-icon="add" is-rounded @click="navigateTo('/purchase-requests/new')">{{ t('New purchase request') }}</MpButton>
      </div>
    </template>

    <!-- ── Actions — kebab → MpPopover dropdown (View details always first) ── -->
    <template #actions="{ row }">
      <MpPopover :id="`pr-actions-${(row as PurchaseRequest).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails((row as PurchaseRequest).id)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="createPurchaseOrder(row as PurchaseRequest)">{{ t('Create purchase order') }}</MpPopoverListItem>
            <MpPopoverListItem @click="markCompleted((row as PurchaseRequest).id)">{{ t('Mark as completed') }}</MpPopoverListItem>
            <MpPopoverListItem @click="duplicate(row as PurchaseRequest)">{{ t('Duplicate') }}</MpPopoverListItem>
          </MpPopoverList>
          <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
          <MpPopoverList>
            <MpPopoverListItem @click="openShare(row as PurchaseRequest)">{{ t('Share via email') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openCopyLinks([row as PurchaseRequest])">{{ t('Copy link') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #cell-lastUpdated="{ row }">
      <LastUpdatedCell v-bind="lastUpdatedFor((row as Record<string, unknown>).id as string)" />
    </template>
  </ErpTablePage>

  <PurchaseRequestFiltersDrawer
    id="pr-allfilters"
    :is-open="filtersOpen"
    :model-value="appliedFilters"
    :columns="keywordColumns"
    :status-options="statusOptions"
    :urgency-options="urgencyOptions"
    :tag-options="tagOptions"
    @update:is-open="filtersOpen = $event"
    @apply="applyDrawerFilters"
  />

  <!-- ── Export / Copy link / Share via email (shared patterns) ── -->
  <ExportModal :open="exportOpen" :title="t('Export purchase requests')" entity-label="purchase requests" :columns="exportColumns" :custom-fields="[t('Sample custom field 1'), t('Sample custom field 2')]" :total="total" @close="exportOpen = false" @export="exportOpen = false" />
  <CopyLinkDrawer :open="copyOpen" :items="copyItems" @close="copyOpen = false" @download-csv="copyOpen = false" />
  <ShareViaEmailModal :open="shareOpen" :title="shareTitle" :subject="shareSubject" :attachment-name="shareAttachment" :attachment-size-k-b="128" sender-email="rizal.candra@centralperk.co.id" @close="shareOpen = false" @send="shareOpen = false" />

  <!-- ── Prototype scenario FAB (bottom-right): toggle data vs empty-state view ── -->
  <ScenarioFab v-model="previewMode" />
</template>

<style scoped>
/* ── Cell helpers ───────────────────────────────────────────────────────── */
.cell-number { color: var(--mp-text-default); }
.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; max-width: 100%; }

/* Attachment icon indicator — plain icon, no button chrome. */
.attachment-icons-cell { display: flex; align-items: center; justify-content: center; }
.attachment-icon-indicator { display: inline-flex; align-items: center; justify-content: center; color: var(--mp-text-subtle); }

/* Urgency pip */
.urgency { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.urgency__ic { flex-shrink: 0; }
.urgency__label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.row-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  border: none; background: transparent; cursor: pointer;
  border-radius: var(--mp-radii-sm); color: var(--mp-text-subtle);
}
.row-kebab:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

/* ── Full empty state ───────────────────────────────────────────────────── */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: auto; height: 240px; object-fit: contain; margin-bottom: 0; }
.empty-full-title {
  margin: 0 0 var(--mp-spacing-0\.5);
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-full-desc {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.empty-cta {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer;
}
.empty-cta:hover { background: var(--mp-background-neutral-hovered); }

/* ── Filter bar ─────────────────────────────────────────────────────────── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.filter-all-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary);
  cursor: pointer; white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-all-btn--active {
  background: var(--mp-background-neutral-subtle);
  border-color: var(--mp-colors-border-bold, #8c9596);
  color: var(--mp-text-default);
}

.filter-btn-group { display: flex; align-items: center; }
/* icon tools sit 8px apart (MpButtonGroup default) — rule/btn-group-gap-8 */
.filter-btn-group :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }
.filter-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); padding: var(--mp-spacing-2);
  border: none; background: transparent; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-default);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-icon-btn--airene { color: var(--mp-airene-default); }

.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default); min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
</style>
