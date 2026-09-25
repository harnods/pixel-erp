<script setup lang="ts">
/**
 * CRM (Qontak) — Customers list (/crm/customers). Full-bleed page: own title bar
 * then a saved-views tab bar (All customers + user views + [+]), a shared stats +
 * filter bar, and either the table (ErpTablePage) or the board (CrmBoardView)
 * depending on the active view's type. Table format mirrors Venom's Customers
 * (minus Location), plus a Segments (tags) column.
 */
import { ref, computed, reactive, inject, onMounted } from 'vue'
import {
  MpButton, MpButtonGroup, MpIcon, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import CrmBoardView from './CrmBoardView.vue'
import CrmCustomerViewDrawer, { type ViewDraft } from '~/components/patterns/CrmCustomerViewDrawer.vue'
import { useTableState } from '~/composables/useTableState'
import { formatIDR } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'
import {
  crmCustomers, deleteCrmCustomer, lifecycleOf, LIFECYCLE_STAGES, CRM_OWNERS, allSegmentTags,
  crmCustomerViews, addCrmView, updateCrmView, deleteCrmView, emptyViewFilters,
  setCustomerLifecycle, setCustomerOwner, moveCustomerSegment,
  type CrmCustomer, type LifecycleStage, type CrmSavedView, type CrmGroupBy, type CrmViewType,
} from '~/data/crm'
import CrmCustomersFiltersDrawer, { emptyCustomersFilters, type CustomersFiltersValue } from '~/components/patterns/CrmCustomersFiltersDrawer.vue'

const router = useRouter()
function soon(what: string) { infoToast(`${what} — coming soon`) }
function goDetail(id: string, tab?: 'deals') { router.push(`/crm/customers/${id}${tab ? '?tab=' + tab : ''}`) }

// First-load skeleton (ERP guideline: 3 solid rows, ~1.2s).
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

// ── Rows: customers + derived lifecycle + Billed (= lifetime value) ──
type Row = CrmCustomer & { lifecycleStage: LifecycleStage; billed: number }
const allRows = computed<Row[]>(() =>
  crmCustomers.map((c) => ({ ...c, lifecycleStage: lifecycleOf(c), billed: c.lifetimeValue })),
)

// ── Saved views (tabs) ──
const ALL_VIEW: CrmSavedView = { id: 'all', name: 'All companies', type: 'table', groupBy: 'lifecycle', filters: emptyViewFilters() }
const activeViewId = ref('all')
const activeView = computed<CrmSavedView>(() => crmCustomerViews.find((v) => v.id === activeViewId.value) ?? ALL_VIEW)
function selectView(id: string) { activeViewId.value = id }

const ownerOptions = [...CRM_OWNERS]
const segmentOptions = computed(() => allSegmentTags())

// Rows after the active view's saved filters (before search) — feeds both table + board.
const viewFiltered = computed<Row[]>(() => {
  const f = activeView.value.filters
  return allRows.value.filter((r) =>
    (!f.lifecycle.length || f.lifecycle.includes(r.lifecycleStage)) &&
    (!f.owners.length || f.owners.includes(r.owner)) &&
    (!f.segments.length || r.segments.some((s) => f.segments.includes(s))))
})
function searchMatch(row: Row, s: string) {
  return !s || [row.company, row.contact, row.owner, row.email, row.segments.join(' ')].join(' ').toLowerCase().includes(s)
}

// ── Transient toolbar filters, ANDed on top of the saved-view filters ──
// Lifecycle quick-select (single), the "All filters" drawer (multi), and the
// stat-card quick filters. All feed both the table and the board.
const lifecycleFilter = ref('')                                       // toolbar ErpFilterSelect
const custFilters = ref<CustomersFiltersValue>(emptyCustomersFilters()) // "All filters" drawer
const statQuick = ref<'' | 'pipeline' | 'deals' | 'owing'>('')        // stat-card quick filters

// Stringify a row's value for a given column key (keyword search by column).
function colText(r: Row, key: string): string {
  switch (key) {
    case 'company': return r.company
    case 'lifecycleStage': return r.lifecycleStage
    case 'segments': return r.segments.join(' ')
    case 'owner': return r.owner
    case 'contact': return r.contact
    case 'openDeals': return String(r.openDeals)
    case 'inFlight': return String(r.inFlight)
    case 'outstanding': return String(r.outstanding)
    case 'billed': return String(r.billed)
    default: return ''
  }
}

const toolbarFiltered = computed<Row[]>(() => viewFiltered.value.filter((r) => {
  const cf = custFilters.value
  // Lifecycle (multi, any-of)
  if (cf.lifecycle.length && !cf.lifecycle.includes(r.lifecycleStage)) return false
  // Contact owner — is any of / is none of
  if (cf.owners.length) {
    const has = cf.owners.includes(r.owner)
    if (cf.ownerComparator === 'isAnyOf' && !has) return false
    if (cf.ownerComparator === 'isNoneOf' && has) return false
  }
  // Segment — is any of / is none of
  if (cf.segments.length) {
    const has = r.segments.some((s) => cf.segments.includes(s))
    if (cf.segmentComparator === 'isAnyOf' && !has) return false
    if (cf.segmentComparator === 'isNoneOf' && has) return false
  }
  // Keyword — scoped to a column, or all columns
  if (cf.keyword.trim()) {
    const kw = cf.keyword.trim().toLowerCase()
    const hay = cf.keywordColumn === 'all'
      ? [r.company, r.contact, r.owner, r.email, r.lifecycleStage, r.segments.join(' ')].join(' ')
      : colText(r, cf.keywordColumn)
    if (!hay.toLowerCase().includes(kw)) return false
  }
  // Toolbar quick filters
  if (lifecycleFilter.value && r.lifecycleStage !== lifecycleFilter.value) return false
  if (statQuick.value === 'pipeline' && !(r.lifecycleStage === 'Lead' || r.lifecycleStage === 'Opportunity')) return false
  if (statQuick.value === 'deals' && !(r.openDeals > 0)) return false
  if (statQuick.value === 'owing' && !(r.outstanding > 0)) return false
  return true
}))

// ── Columns (Venom format, minus Location, plus Segments) ──
const columns: TableColumn[] = [
  { key: 'company',        label: 'Company',         kind: 'name',   sortable: true, sortType: 'text'   },
  { key: 'lifecycleStage', label: 'Lifecycle',       kind: 'status', sortable: true, sortType: 'text'   },
  { key: 'segments',       label: 'Segments',        kind: 'tags'                                       },
  { key: 'owner',          label: 'Contact owner',   kind: 'name',   sortable: true, sortType: 'text'   },
  { key: 'contact',        label: 'Primary contact', kind: 'name',   sortable: true, sortType: 'text'   },
  { key: 'openDeals',      label: 'Deals',           align: 'right', sortable: true, sortType: 'number' },
  { key: 'inFlight',       label: 'In flight',       kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'outstanding',    label: 'Outstanding',     kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'billed',         label: 'Billed',          kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'lastUpdated',    label: 'Last updated',    kind: 'date'                                        },
]

// ── Table state (search + sort + pagination over the view-filtered rows) ──
const {
  search, currentPage, perPage, sortKey, sortDir, total, paginated,
  setPage, setPerPage, toggleSort, setSort,
} = useTableState<Row>(toolbarFiltered, {
  perPage: 25,
  filterFn: (row, s) => searchMatch(row, s),
})

// Board rows respect the search box + the toolbar Lifecycle select too.
const boardRows = computed<Row[]>(() => {
  const s = search.value.trim().toLowerCase()
  return toolbarFiltered.value.filter((r) => searchMatch(r, s))
})

// "All filters" drawer badge counts the transient drawer filters.
const activeFilterCount = computed(() => {
  const f = custFilters.value
  return f.lifecycle.length + f.owners.length + f.segments.length + (f.keyword.trim() ? 1 : 0)
})
const hasActiveFilter = computed(() => !!search.value || activeFilterCount.value > 0 || !!lifecycleFilter.value || !!statQuick.value)
function clearFilters() { search.value = ''; lifecycleFilter.value = ''; statQuick.value = ''; custFilters.value = emptyCustomersFilters() }

// ── "All filters" drawer (transient filters, applied to the current table) ──
const filtersOpen = ref(false)
function openFilters() { filtersOpen.value = true }
function onApplyFilters(f: CustomersFiltersValue) { custFilters.value = f; filtersOpen.value = false }

// ── Stat-card quick filters ──
function setStatQuick(q: '' | 'pipeline' | 'deals' | 'owing') { statQuick.value = statQuick.value === q ? '' : q }

// ── View drawer (create / edit) ──
const drawerOpen = ref(false)
const drawerMode = ref<'create' | 'edit'>('create')
const drawerDraft = ref<ViewDraft>({ name: '', type: 'table', groupBy: 'lifecycle', filters: emptyViewFilters() })
function openCreate(type: CrmViewType) {
  drawerMode.value = 'create'
  drawerDraft.value = { name: '', type, groupBy: 'lifecycle', filters: emptyViewFilters() }
  drawerOpen.value = true
}
function onSaveView(draft: ViewDraft) {
  if (drawerMode.value === 'create') {
    const v = addCrmView(draft)
    activeViewId.value = v.id
    toast.notify({ variant: 'success', title: `View “${v.name}” saved` })
  } else {
    updateCrmView(activeView.value.id, draft)
    toast.notify({ variant: 'success', title: 'View updated' })
  }
}
function onDeleteView() {
  const v = activeView.value
  if (v.id === 'all') return
  deleteCrmView(v.id)
  activeViewId.value = 'all'
  drawerOpen.value = false
  toast.notify({ variant: 'success', title: `View “${v.name}” deleted` })
}
function setGroupBy(g: CrmGroupBy) { if (activeView.value.id !== 'all') updateCrmView(activeView.value.id, { groupBy: g }) }

// Board drag & drop — move a customer to the dropped column, coherently per grouping.
function onCardMove({ id, from, to }: { id: string; from: string; to: string }) {
  const g = activeView.value.groupBy
  const c = crmCustomers.find((x) => x.id === id)
  if (g === 'lifecycle') setCustomerLifecycle(id, to as LifecycleStage)
  else if (g === 'owner') setCustomerOwner(id, to)
  else moveCustomerSegment(id, from, to)
  if (c) toast.notify({ variant: 'success', title: `${c.company} moved to “${to}”` })
}

// ── Filter-bar right group: Airene · column settings · export (ERP convention) ──
const toggleAirene = inject<() => void>('toggleAirene')

const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(columns.map((c) => [c.key, true])))
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter((c) => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// Export the currently-visible customers (view filters + search) to CSV.
function exportCsv() {
  const s = search.value.trim().toLowerCase()
  const rows = viewFiltered.value.filter((r) => searchMatch(r, s))
  const headers = ['Company', 'Lifecycle', 'Segments', 'Owner', 'Primary contact', 'Email', 'Deals', 'In flight', 'Outstanding', 'Billed']
  const esc = (v: unknown) => { const t = String(v ?? ''); return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t }
  const lines = [headers.join(',')]
  for (const r of rows) lines.push([r.company, r.lifecycleStage, r.segments.join('; '), r.owner, r.contact, r.email, r.openDeals, r.inFlight, r.outstanding, r.billed].map(esc).join(','))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'companies.csv'; a.click()
  URL.revokeObjectURL(a.href)
  toast.notify({ variant: 'success', title: `Exported ${rows.length} compan${rows.length === 1 ? 'y' : 'ies'}` })
}

// ── Stats — follow the active view (saved filters + search), so the numbers
// always describe exactly what's on screen (Venom-style cards). `statBase` is the
// same set the table/board renders. ──
// Stats describe the saved view + search (NOT the transient toolbar/stat filters),
// so the numbers stay stable while you click a stat to filter the table.
const statBase = computed<Row[]>(() => {
  const s = search.value.trim().toLowerCase()
  return viewFiltered.value.filter((r) => searchMatch(r, s))
})
const activeCustomers = computed(() => statBase.value.filter((r) => r.lifecycleStage === 'Customer'))
const pipeline = computed(() => statBase.value.filter((r) => r.lifecycleStage === 'Opportunity' || r.lifecycleStage === 'Lead'))
const inFlightTotal = computed(() => statBase.value.reduce((s, c) => s + c.inFlight, 0))
const liveDeals = computed(() => statBase.value.reduce((s, c) => s + c.openDeals, 0))
const outstandingTotal = computed(() => statBase.value.reduce((s, c) => s + c.outstanding, 0))
const owingCustomers = computed(() => statBase.value.filter((c) => c.outstanding > 0))

// ── Lifecycle badge colours ──
function lifecycleBadge(lc: LifecycleStage) {
  if (lc === 'Customer') return { status: 'active', label: 'Customer' }
  if (lc === 'Opportunity') return { status: 'prospect', type: 'information' as const, label: 'Opportunity' }
  if (lc === 'Lead') return { status: 'prospect', type: 'announcement' as const, label: 'Lead' }
  return { status: 'churned', type: 'announcement' as const, label: 'Former customer' }
}

// ── Delete customer ──
const delOpen = ref(false)
const delTarget = ref<Row | null>(null)
function openDelete(row: Row) { delTarget.value = row; delOpen.value = true }
function confirmDelete() {
  if (!delTarget.value) return
  deleteCrmCustomer(delTarget.value.id)
  toast.notify({ variant: 'success', title: `${delTarget.value.company} deleted` })
  delTarget.value = null
}
</script>

<template>
  <div class="crm">
    <header class="crm-titlebar">
      <div class="crm-titlebar__left">
        <h1 class="crm-title">Companies</h1>
      </div>
      <div class="crm-titlebar__right">
        <MpButtonGroup>
          <MpButton variant="secondary" is-rounded @click="soon('Import companies')">Import</MpButton>
          <MpButton variant="primary" is-rounded left-icon="add" @click="router.push('/crm/customers/new')">New company</MpButton>
        </MpButtonGroup>
      </div>
    </header>

    <!-- ── View tabs (saved views) ── -->
    <nav class="cc-viewtabs">
      <MpButton class="page-tab" :class="{ 'page-tab--active': activeViewId === 'all' }" type="button" variant="ghost" @click="selectView('all')">All companies</MpButton>
      <MpButton
        v-for="v in crmCustomerViews" :key="v.id"
        class="page-tab" :class="{ 'page-tab--active': activeViewId === v.id }" type="button" variant="ghost"
        :left-icon="v.type === 'board' ? 'table-view-column' : 'table-view-list'"
        @click="selectView(v.id)"
      >{{ v.name }}</MpButton>
      <MpPopover id="cc-add-view" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
        <MpPopoverTrigger>
          <MpButton class="filter-icon-btn" type="button" variant="ghost" aria-label="Add view" left-icon="add" />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
          <MpPopoverList>
            <MpPopoverListItem @click="openCreate('table')"><span class="cc-add-opt"><MpIcon name="table-view-list" size="sm" /> Table view</span></MpPopoverListItem>
            <MpPopoverListItem @click="openCreate('board')"><span class="cc-add-opt"><MpIcon name="table-view-column" size="sm" /> Board view</span></MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </nav>

    <div class="cc-stage">
      <!-- ── Stats (shared across table + board) ── -->
      <div class="cc-stats">
        <div class="stats-section">
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">Active companies</div>
            <div class="stat-period">Currently engaged</div>
            <div class="stat-amount">{{ activeCustomers.length }}</div>
            <a class="stat-link" @click="clearFilters">{{ statBase.length }} in total</a>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">In the pipeline</div>
            <div class="stat-period">Leads and opportunities</div>
            <div class="stat-amount">{{ pipeline.length }}</div>
            <a class="stat-link" :class="{ 'stat-link--active': statQuick === 'pipeline' }" @click="setStatQuick('pipeline')">Not yet won</a>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">Contract value in flight</div>
            <div class="stat-period">Open deals</div>
            <div class="stat-amount">{{ formatIDR(inFlightTotal) }}</div>
            <a class="stat-link" :class="{ 'stat-link--active': statQuick === 'deals' }" @click="setStatQuick('deals')">{{ liveDeals }} {{ liveDeals !== 1 ? 'deals' : 'deal' }}</a>
          </div>
          <div class="stat-card">
            <div class="stat-title">Outstanding</div>
            <div class="stat-period">Invoiced, not yet paid</div>
            <div class="stat-amount">{{ formatIDR(outstandingTotal) }}</div>
            <a class="stat-link" :class="{ 'stat-link--active': statQuick === 'owing' }" @click="setStatQuick('owing')">{{ owingCustomers.length }} {{ owingCustomers.length !== 1 ? 'companies owe you' : 'company owes you' }}</a>
          </div>
        </div>
      </div>

      <!-- ── Filter bar (shared) ── -->
      <div class="cc-filterbar">
        <div class="filter-left">
          <ErpFilterSelect
            id="cus-lifecycle-filter"
            :model-value="lifecycleFilter"
            placeholder="Lifecycle"
            :options="[...LIFECYCLE_STAGES]"
            @update:model-value="(v: string) => (lifecycleFilter = v)"
          />

          <MpButton class="btn-enterprise btn-enterprise--secondary filter-all-btn" type="button" left-icon="filter" @click="openFilters">
            All filters{{ activeFilterCount ? ` (${activeFilterCount})` : '' }}
          </MpButton>
        </div>

        <div class="filter-right">
          <div class="filter-btn-group">
            <MpTooltip id="cus-airene" label="Ask Airene" placement="bottom" use-portal>
              <MpButton class="filter-icon-btn filter-icon-btn--airene" type="button" variant="ghost" aria-label="Ask Airene" left-icon="airene-brand" @click="toggleAirene?.()" />
            </MpTooltip>
            <ColumnSettingsMenu v-if="activeView.type === 'table'" id="cus-columns" :items="columnItems" :visibility="columnVisibility" />
            <MpTooltip id="cus-export" label="Export" placement="bottom" use-portal>
              <MpButton class="filter-icon-btn" type="button" variant="ghost" aria-label="Export" left-icon="download" @click="exportCsv" />
            </MpTooltip>
          </div>
          <div class="filter-search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>
            <input v-model="search" class="filter-search-input" type="text" placeholder="Search companies…" />
            <MpButton v-if="search" class="search-clear-btn" type="button" variant="ghost" aria-label="Clear search" left-icon="close" @click="search = ''" />
          </div>
        </div>
      </div>

      <!-- ── Board view ── -->
      <CrmBoardView
        v-if="activeView.type === 'board'"
        :rows="boardRows"
        :group-by="activeView.groupBy"
        @update:group-by="setGroupBy"
        @open="goDetail"
        @move="onCardMove"
      />

      <!-- ── Table view ── -->
      <ErpTablePage
        v-else
        :columns="visibleColumns"
        :rows="(paginated as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        :loading="loading"
        :search="search"
        :has-active-filter="hasActiveFilter"
        filter-empty-label="company"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @hide-column="hideColumn"
        @clear-filters="clearFilters"
      >
        <template #cell-company="{ row }">
          <a class="cell-link cell-text cc-name-main" @click.stop="goDetail((row as Row).id)">{{ (row as Row).company }}</a>
        </template>

        <template #cell-lifecycleStage="{ row }">
          <ErpStatusBadge v-bind="lifecycleBadge((row as Row).lifecycleStage)" />
        </template>

        <template #cell-segments="{ row }">
          <ErpTagList v-if="(row as Row).segments.length" :tags="(row as Row).segments" />
          <span v-else class="cc-muted">—</span>
        </template>

        <template #cell-owner="{ value }">{{ value || '—' }}</template>

        <template #cell-openDeals="{ row, value }">
          <a v-if="value" class="cell-link" @click.stop="goDetail((row as Row).id, 'deals')">{{ value }} {{ value === 1 ? 'record' : 'records' }}</a>
          <span v-else class="cc-muted">—</span>
        </template>

        <template #cell-contact="{ row }">
          <span class="cell-text">{{ (row as Row).contact }}</span>
          <span v-if="(row as Row).email" class="cc-sub cell-text">{{ (row as Row).email }}</span>
        </template>

        <template #cell-inFlight="{ value }">
          <span v-if="value">{{ formatIDR(value as number) }}</span><span v-else class="cc-muted">—</span>
        </template>
        <template #cell-outstanding="{ value }">
          <span v-if="value" class="cc-owed">{{ formatIDR(value as number) }}</span><span v-else class="cc-muted">—</span>
        </template>
        <template #cell-billed="{ value }">
          <span v-if="value">{{ formatIDR(value as number) }}</span><span v-else class="cc-muted">—</span>
        </template>
        <template #cell-lastUpdated="{ row }">
          <LastUpdatedCell v-bind="lastUpdatedFor((row as Row).id)" />
        </template>

        <template #actions="{ row }">
          <MpPopover :id="`cus-actions-${(row as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton class="row-kebab" type="button" variant="ghost" aria-label="More actions"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg></MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="goDetail((row as Row).id)">View details</MpPopoverListItem>
                <MpPopoverListItem @click="soon('Edit customer')">Edit</MpPopoverListItem>
                <MpPopoverListItem @click="openDelete(row as Row)">Delete</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>

        <template #empty>
          <div class="cc-empty">
            <img :src="'/illustrations/empty-folder.png'" alt="" class="cc-empty-illustration" width="288" height="240" />
            <p class="cc-empty-title">No customers</p>
            <p class="cc-empty-desc">Customers will appear here.</p>
          </div>
        </template>
      </ErpTablePage>
    </div>

    <ConfirmModal v-model:is-open="delOpen" title="Delete customer" :description="`“${delTarget?.company}” will be permanently deleted.`" confirm-label="Delete" @confirm="confirmDelete" />

    <CrmCustomerViewDrawer
      id="cc-view-drawer"
      v-model:is-open="drawerOpen"
      :mode="drawerMode"
      :model-value="drawerDraft"
      :owner-options="ownerOptions"
      :segment-options="segmentOptions"
      @save="onSaveView"
      @delete="onDeleteView"
    />

    <CrmCustomersFiltersDrawer
      id="cc-filters-drawer"
      :is-open="filtersOpen"
      :model-value="custFilters"
      :owner-options="ownerOptions"
      :segment-options="segmentOptions"
      :columns="columns.map((c) => ({ key: c.key, label: c.label }))"
      @update:is-open="filtersOpen = $event"
      @apply="onApplyFilters"
    />
  </div>
</template>

<style scoped>
.crm { display: flex; flex-direction: column; height: 100%; min-height: 0; }
/* No top padding on the scrollport: it would sit between the clip edge and the
   sticky .cc-filterbar's containing block, leaving a gap rows show through when
   the bar is pinned. The 20px lives on .cc-stats (the first child) instead. */
.cc-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); padding: 0 var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); }

/* ── View tabs ── */
.cc-viewtabs { flex-shrink: 0; display: flex; align-items: center; gap: var(--mp-spacing-5); padding: 0 var(--mp-spacing-6); background: var(--mp-background-neutral-subtle); }
.page-tab {
  position: relative; display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  background: none; border: none; cursor: pointer; padding: var(--mp-spacing-3) 0;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); white-space: nowrap; transition: color 100ms;
}
.page-tab:not(.page-tab--active):hover { color: var(--mp-text-default); }
.page-tab--active { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); }
.page-tab--active::after { content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 2px; background: var(--mp-text-selected); border-radius: var(--mp-radii-sm, 2px) var(--mp-radii-sm, 2px) 0 0; }
.cc-add-opt { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }

/* Shared toolbar spacing (mirrors ErpTablePage internal .erp-stats-bar / .erp-filter-bar) */
/* 20px of the old 40px gap moved onto .cc-filterbar's padding-top, so the
   pinned bar carries an opaque strip above it. Rest-state spacing unchanged. */
.cc-stats { padding-top: var(--mp-spacing-5); margin-bottom: var(--mp-spacing-5); }
/* The filter bar pins to the top of the scrolling stage. Left unpinned it scrolls
   under the stage's clip edge and the search pill gets sliced mid-scroll (its top
   border disappears while the rest is still visible); pinning also keeps search +
   filters reachable on a long list instead of forcing a scroll back to the top.
   Opaque stage background + z-index 3 so rows pass underneath, not through. */
.cc-filterbar { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding-top: var(--mp-spacing-5); padding-bottom: var(--mp-spacing-5); /* the gap below is padding, not margin, so the pinned bar's opaque strip travels with it and rows never show through it */ background: var(--mp-background-stage, #fff); }
@media (max-width: 640px) {
  .cc-filterbar { flex-wrap: wrap; }
  .cc-filterbar > :last-child { flex: 1 1 100%; }
}

/* Lifecycle filter is <ErpFilterSelect> (MpPopover menu, clearable) — no select CSS. */

/* All filters — base pill look comes from .btn-enterprise--secondary (erp.css);
   only asymmetric icon padding + semibold weight differ (matches Sales invoices). */
.filter-all-btn { padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3); font-weight: var(--mp-font-weights-semi-bold); }

/* Name cell + subtext */
.cc-name-main { color: var(--mp-text-default); font-weight: var(--mp-font-weights-medium, 500); }
.cc-sub { display: block; margin-top: 1px; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cc-muted { color: var(--mp-text-subtle, #97a0af); }
.cc-owed { color: var(--mp-text-warning, #b54708); }
.row-kebab { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-subtle, #6e7a7c); }
.row-kebab:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); color: var(--mp-text-default); }

/* ── Stats (Bills pattern) ── */
.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch; }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-period { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-link { display: inline-flex; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); line-height: var(--mp-line-heights-md); cursor: pointer; padding: 0 var(--mp-spacing-0\.5); }
.stat-link:hover { text-decoration: underline; }
.stat-link--active { font-weight: var(--mp-font-weights-semi-bold); text-decoration: underline; }

/* ── Filter bar (Bills pattern) ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn { display: flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); padding: var(--mp-spacing-2); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default); }
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.filter-icon-btn--airene { color: var(--mp-airene-default, #7c3aed); }
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
/* focus ring comes from the global .filter-search:focus-within override in erp.css */
.filter-search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.filter-search-input::placeholder { color: var(--mp-text-placeholder, #97a0af); }
.search-clear-btn { display: inline-flex; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); padding: 0; }
.search-clear-btn:hover { color: var(--mp-icon-default, #536062); }

/* ── Empty state ── */
.cc-empty { display: flex; flex-direction: column; align-items: center; }
.cc-empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.cc-empty-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cc-empty-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
