<script setup lang="ts">
/**
 * CRM (Qontak) — Deals. Landing page for the CRM Deals module (/crm). Full-bleed:
 * own title bar → five fixed metric cards → filter bar (saved-view selector,
 * stage filter, search, view switch, Import/Export) → either the LIST (default,
 * PRD first-time default) or the Stage KANBAN.
 *
 * Everything reads the ONE `deals` dataset (app/data/crm.ts) so metrics, list and
 * board always agree. New deal opens the quick-create drawer (full detail form is a
 * page at /crm/deals/new); Edit navigates to /crm/deals/:id/edit. Import/Export reuse the
 * shared modals; stage moves go through moveDealStage (Won terminal, Lost reason,
 * reopen) so the kanban and the table enforce the same PRD rules; bulk owner/stage
 * update the selection. Per rule/bulk-actions-no-delete + the PRD "no permanent
 * delete in V1", the only lifecycle action is Archive / Restore.
 */
import { ref, computed, inject, onMounted } from 'vue'
import {
  MpButton, MpButtonGroup, MpIcon, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpIconSegmented from '~/components/patterns/ErpIconSegmented.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ImportSpreadsheetModal from '~/components/patterns/ImportSpreadsheetModal.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import CrmDealQuickCreateDrawer from '~/components/patterns/CrmDealQuickCreateDrawer.vue'
import CrmDealPreviewDrawer from '~/components/CrmDealPreviewDrawer.vue'
import CrmDealStageModal from '~/components/patterns/CrmDealStageModal.vue'
import CrmDealOwnerModal from '~/components/patterns/CrmDealOwnerModal.vue'
import { useTableState } from '~/composables/useTableState'
import { formatMoney } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast, successToast } from '~/utils/toasts'
import {
  deals, dealMetrics, DEAL_STAGES, ONGOING_STAGES, moveDealStage,
  archiveDeal, restoreDeal, deleteDeal, bulkChangeOwner, bulkChangeStage, convertDeal,
  dealConversionTarget, dealExpectedValue, isDealOpen, getDeal, dealDraftSeed,
  type Deal, type DealStage, type DealDraftSeed,
} from '~/data/crm'

const router = useRouter()
function asDeal(row: unknown): Deal { return row as Deal }
function goDetail(id: string) { router.push(`/crm/deals/${id}`) }
function goOrder(id: string) { router.push(`/crm/orders/${id}`) }
function goCustomer(id: string) { router.push(`/crm/customers/${id}`) }

const TODAY = '2026-09-07'
/** Display number — "Deal #{5-digit}" (mirrors Purchase Invoice #{n}). */
function dealNo(id: string): string {
  const n = parseInt(id.replace(/\D/g, ''), 10)
  return `Deal #${Number.isNaN(n) ? id : String(n).padStart(5, '0')}`
}
/** Deterministic HH:MM for the "Last updated" timestamp (mock — the store keeps
 *  dates only, so derive a stable time from the id). */
function updatedTime(id: string): string {
  const n = parseInt(id.replace(/\D/g, ''), 10) || 0
  const hh = 8 + (n % 9)
  const mm = (n * 7) % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
/** Days a deal has been open (aging), from creation to today. */
function agingDays(d: Deal): number {
  const [y, m, dd] = d.createdAt.split('-').map(Number)
  const [ty, tm, td] = TODAY.split('-').map(Number)
  return Math.max(0, Math.round((Date.UTC(ty!, tm! - 1, td!) - Date.UTC(y!, m! - 1, dd!)) / 86_400_000))
}
function agingTone(n: number): '' | 'warn' | 'danger' { return n > 30 ? 'danger' : n > 14 ? 'warn' : '' }

/** Owner avatar — initials on a deterministic pastel background, with the initials
 *  in a darker shade of the same hue. */
function ownerInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}
function ownerAvatarStyle(name: string): { background: string; color: string } {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  const hue = h % 360
  return { background: `hsl(${hue} 62% 86%)`, color: `hsl(${hue} 55% 30%)` }
}

// Demo "current user" for the My-records saved view.
const ME = 'Fajar Nugroho'

const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

const m = dealMetrics
const convTargetShort = computed(() => (dealConversionTarget.value === 'Sales Quote' ? 'Sales Quotes' : 'Sales Orders'))

// ── Saved views (PRD system views) ──
const SAVED_VIEWS = ['All records', 'My records', 'Recently created', 'Recently modified', 'Won', 'Lost', 'Archived'] as const
type SavedView = typeof SAVED_VIEWS[number]
const savedView = ref<SavedView>('All records')

// ── View toggle (list default per PRD) ──
const view = ref<'table' | 'board'>('table')
const viewOptions = [
  { value: 'table', icon: 'table-view-list', label: 'List view' },
  { value: 'board', icon: 'table-view-column', label: 'Board view' },
]

// ── Metric click-through filter ──
type MetricFilter = '' | 'ongoing' | 'closing' | 'overdue' | 'converted'
const metricFilter = ref<MetricFilter>('')
function applyMetric(f: MetricFilter) { metricFilter.value = metricFilter.value === f ? '' : f; view.value = 'table' }
function matchesMetric(d: Deal): boolean {
  switch (metricFilter.value) {
    case 'ongoing':  return isDealOpen(d)
    case 'closing':  return isDealOpen(d) && d.expectedCloseDate.startsWith('2026-09')
    case 'overdue':  return isDealOpen(d) && d.expectedCloseDate < '2026-09-07'
    case 'converted': return d.conversion === 'converted'
    default: return true
  }
}
function matchesView(d: Deal): boolean {
  if (savedView.value === 'Archived') return !!d.archived
  if (d.archived) return false
  switch (savedView.value) {
    case 'My records': return d.owner === ME
    case 'Won':        return d.stage === 'Won'
    case 'Lost':       return d.stage === 'Lost'
    default:           return true
  }
}
const viewSortKey = computed<keyof Deal>(() => (savedView.value === 'Recently modified' ? 'lastActivity' : 'createdAt'))

// ── Table state (search + Stage filter + saved view + metric + sort + pagination) ──
const source = computed<Deal[]>(() => deals.filter((d) => matchesView(d) && matchesMetric(d)))
const {
  search, statusFilter, currentPage, perPage, sortKey, sortDir, total, paginated,
  setPage, setPerPage, toggleSort, setSort,
} = useTableState<Deal>(source, {
  perPage: 25,
  defaultSort: { key: 'createdAt', dir: 'desc' },
  filterFn: (row, s, status) => {
    const matchesStage = !status || row.stage === status
    const matchesSearch = !s || [row.name, row.id, row.company, row.owner, row.referenceNumber].join(' ').toLowerCase().includes(s)
    return matchesStage && matchesSearch
  },
})

const hasActiveFilter = computed(() => !!statusFilter.value || !!metricFilter.value || savedView.value !== 'All records')
function clearFilters() { search.value = ''; statusFilter.value = ''; metricFilter.value = ''; savedView.value = 'All records' }

// ── Board columns (respect saved view + stage filter + search + metric) ──
interface BoardColumn { stage: DealStage; cards: Deal[]; total: number }
const boardColumns = computed<BoardColumn[]>(() => {
  const s = search.value.trim().toLowerCase()
  return DEAL_STAGES.map((stage) => {
    const cards = deals.filter((d) =>
      d.stage === stage && matchesView(d) && matchesMetric(d) &&
      (!statusFilter.value || d.stage === statusFilter.value) &&
      (!s || [d.name, d.id, d.company, d.owner].join(' ').toLowerCase().includes(s)))
    return { stage, cards, total: cards.reduce((n, d) => n + dealExpectedValue(d), 0) }
  })
})

// ── Board drag & drop (enforces PRD Stage rules) ──
const draggingId = ref<string | null>(null)
const dragOverStage = ref<string | null>(null)
function onDragStart(d: Deal) { if (d.stage === 'Won') return; draggingId.value = d.id }
function onDragEnd() { draggingId.value = null; dragOverStage.value = null }
function onDrop(stage: DealStage) {
  const id = draggingId.value
  onDragEnd()
  if (id) requestStageMove(id, stage)
}

// Stage-move orchestration (shared by drag + keyboard Move + row menu).
const pendingMove = ref<{ id: string; stage: DealStage } | null>(null)
const stageModalOpen = ref(false)
const stageModalPreset = ref<DealStage | null>(null)
const stageModalCount = ref(1)
const stageModalIds = ref<string[]>([])
const stageModalAllowed = ref<DealStage[] | undefined>(undefined)
const wonConfirmOpen = ref(false)
const reopenConfirmOpen = ref(false)

function requestStageMove(id: string, stage: DealStage) {
  const d = getDeal(id)
  if (!d || d.stage === stage) return
  if (d.stage === 'Won') { infoToast('Won is terminal — this deal cannot change stage.'); return }
  pendingMove.value = { id, stage }
  if (stage === 'Lost') { openStageModalForLost([id]) }
  else if (stage === 'Won') { wonConfirmOpen.value = true }
  else if (d.stage === 'Lost') { reopenConfirmOpen.value = true }
  else { commitMove(id, stage) }
}
function commitMove(id: string, stage: DealStage, lostReason?: string) {
  const r = moveDealStage(id, stage, { lostReason })
  if (r.ok) successToast(`Deal moved to ${stage}`)
  else infoToast(r.error ?? 'Could not change stage')
  pendingMove.value = null
}
function confirmWon() { const p = pendingMove.value; if (p) commitMove(p.id, 'Won'); wonConfirmOpen.value = false }
function confirmReopen() { const p = pendingMove.value; if (p) commitMove(p.id, p.stage); reopenConfirmOpen.value = false }

// Open the stage modal preset to Lost (captures the required reason) for 1..N deals.
function openStageModalForLost(ids: string[]) {
  stageModalIds.value = ids; stageModalCount.value = ids.length
  stageModalPreset.value = 'Lost'; stageModalAllowed.value = undefined; stageModalOpen.value = true
}
// Row menu "Change stage" — free picker for a single deal.
function openStageModal(d: Deal) {
  stageModalIds.value = [d.id]; stageModalCount.value = 1; stageModalPreset.value = null
  stageModalAllowed.value = d.stage === 'Lost' ? [...ONGOING_STAGES] : undefined
  stageModalOpen.value = true
}
function onStageModalConfirm(payload: { stage: DealStage; lostReason?: string }) {
  const ids = stageModalIds.value
  if (ids.length === 1) {
    commitMove(ids[0]!, payload.stage, payload.lostReason)
  } else {
    const res = bulkChangeStage(ids, payload.stage, { lostReason: payload.lostReason })
    reportBulk(res, `stage → ${payload.stage}`)
  }
  stageModalOpen.value = false
}

// Keyboard: Enter opens the quick preview; "m" opens the stage-move modal.
function onCardKey(e: KeyboardEvent, d: Deal) {
  if (e.key === 'Enter') { openPreview(d); return }
  if (e.key.toLowerCase() === 'm') { e.preventDefault(); openStageModal(d) }
}

// ── Quick preview drawer (kanban card → preview → View details) ──
const previewOpen = ref(false)
const previewDeal = ref<Deal | null>(null)
function openPreview(d: Deal) { previewDeal.value = d; previewOpen.value = true }
/** Preview "Move to…" — change stage directly (no modal). Won is terminal; a
 *  → Lost move carries a default reason (editable later on the detail page). */
function onPreviewMove(d: Deal, stage: DealStage) {
  previewOpen.value = false
  const r = moveDealStage(d.id, stage, stage === 'Lost' ? { lostReason: 'Marked as lost' } : {})
  if (r.ok) successToast(`Deal moved to ${stage}`)
  else infoToast(r.error ?? 'Could not change stage')
}

// ── Bulk actions ──
const ownerModalOpen = ref(false)
const bulkIds = ref<string[]>([])
function selectedIds(selected: Set<number>): string[] {
  return [...selected].map((i) => paginated.value[i]?.id).filter(Boolean) as string[]
}
function openBulkOwner(selected: Set<number>) { bulkIds.value = selectedIds(selected); ownerModalOpen.value = true }
function openBulkStage(selected: Set<number>) {
  bulkIds.value = selectedIds(selected)
  stageModalIds.value = bulkIds.value; stageModalCount.value = bulkIds.value.length
  stageModalPreset.value = null; stageModalAllowed.value = undefined; stageModalOpen.value = true
}
function onBulkOwner(owner: string) {
  const res = bulkChangeOwner(bulkIds.value, owner)
  reportBulk(res, `owner → ${owner}`)
  ownerModalOpen.value = false
}
function reportBulk(res: { ok: boolean }[], what: string) {
  const ok = res.filter((r) => r.ok).length
  const failed = res.length - ok
  if (failed === 0) successToast(`${ok} ${ok === 1 ? 'deal' : 'deals'} updated (${what})`)
  else infoToast(`${ok} updated, ${failed} skipped (${what})`)
}

// ── Create (quick drawer) / Edit (full-detail page) ──
const quickOpen = ref(false)
function openCreate() { quickOpen.value = true }
function onQuickSaved(d: Deal) { quickOpen.value = false; successToast('Deal created'); goDetail(d.id) }
function onQuickOpenFull(seed: DealDraftSeed) { dealDraftSeed.value = seed; quickOpen.value = false; router.push('/crm/deals/new') }
// The detailed form is a PAGE (PRD) — Edit navigates there.
function openEdit(d: Deal) { router.push(`/crm/deals/${d.id}/edit`) }

// ── Archive / Restore / Delete + Convert (row menu) ──
function onArchive(d: Deal) { archiveDeal(d.id); successToast('Deal archived') }
function onRestore(d: Deal) { restoreDeal(d.id); successToast('Deal restored') }
const deleteConfirmOpen = ref(false)
const deleteTarget = ref<Deal | null>(null)
function askDelete(d: Deal) { deleteTarget.value = d; deleteConfirmOpen.value = true }
function confirmDelete() {
  if (deleteTarget.value) { deleteDeal(deleteTarget.value.id); successToast('Deal deleted') }
  deleteConfirmOpen.value = false; deleteTarget.value = null
}
function onConvert(d: Deal) {
  const r = convertDeal(d.id)
  if (r.ok) successToast(`${r.target} ${r.salesOrderId} created`)
  else infoToast(r.error ?? 'Conversion could not start')
}

// ── Import / Export ──
const importOpen = ref(false)
function onImportUpload(files: File[]) {
  importOpen.value = false
  successToast(`${files.length} file${files.length === 1 ? '' : 's'} queued for import`)
}
const exportOpen = ref(false)
const exportColumns = [
  { key: 'name', label: 'Deal name' }, { key: 'stage', label: 'Stage' }, { key: 'company', label: 'Customer' },
  { key: 'owner', label: 'Deal owner' }, { key: 'value', label: 'Expected deal value' }, { key: 'currency', label: 'Currency' },
  { key: 'expectedCloseDate', label: 'Due date' }, { key: 'conversion', label: 'Conversion status' },
  { key: 'salesOrderId', label: 'Linked ERP transaction' }, { key: 'lastActivity', label: 'Last updated' },
]
function onExport() { exportOpen.value = false; successToast('Export ready — check your downloads') }

// ── Badges ──
function stageBadge(stage: DealStage): { type: 'completed' | 'announcement' | 'information' | 'warning' | 'critical'; label: string } {
  switch (stage) {
    case 'Won':         return { type: 'completed',   label: 'Won' }
    case 'Lost':        return { type: 'announcement', label: 'Lost' }
    case 'Negotiation': return { type: 'warning',     label: 'Negotiation' }
    case 'Proposal':    return { type: 'warning',     label: 'Proposal' }
    case '1st Meeting': return { type: 'information',  label: '1st Meeting' }
    default:            return { type: 'information',  label: 'Open Lead' }
  }
}
// ── Columns — the 6 defaults, plus optional PRD columns hidden by default and
// toggleable from Column settings. ──
const baseColumns: TableColumn[] = [
  { key: 'id',      label: 'Number',    kind: 'default', sortable: true, sortType: 'text'   },
  { key: 'name',    label: 'Deal name', kind: 'name',    sortable: true, sortType: 'text'   },
  { key: 'company', label: 'Customer',  kind: 'name',    sortable: true, sortType: 'text'   },
  { key: 'stage',   label: 'Stage',     kind: 'status',  sortable: true, sortType: 'text'   },
  { key: 'owner',   label: 'Deal owner', kind: 'name',   sortable: true, sortType: 'text'   },
  { key: 'value',   label: 'Value',     kind: 'amount',  align: 'right', sortable: true, sortType: 'number' },
]
const optionalColumns: TableColumn[] = [
  { key: 'expectedCloseDate', label: 'Due date',     kind: 'date',    sortable: true, sortType: 'text' },
  { key: 'lastActivity',      label: 'Last updated', kind: 'default', sortable: true, sortType: 'text' },
]
const allCols: TableColumn[] = [...baseColumns, ...optionalColumns]
const columnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(allCols.map((c) => [c.key, baseColumns.some((b) => b.key === c.key)])),
)
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const columns = computed<TableColumn[]>(() => allCols.filter((c) => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

const toggleAirene = inject<() => void>('toggleAirene')
</script>

<template>
  <div class="crm">
    <!-- ── Title bar ── -->
    <header class="crm-titlebar">
      <div class="crm-titlebar__left">
        <h1 class="crm-title">Deals</h1>
      </div>
      <div class="crm-titlebar__right">
        <MpButtonGroup>
          <MpButton variant="secondary" is-rounded @click="importOpen = true">Import</MpButton>
          <MpButton variant="primary" is-rounded left-icon="add" @click="openCreate">New deal</MpButton>
        </MpButtonGroup>
      </div>
    </header>

    <div class="cc-stage">
      <!-- ── Fixed metrics (PRD: 5 cards, click-through) ── -->
      <div class="cc-stats">
        <div class="stats-section">
          <button type="button" class="stat-card stat-card--bordered" :class="{ 'stat-card--active': metricFilter === 'ongoing' }" @click="applyMetric('ongoing')">
            <div class="stat-title">Total ongoing deals</div>
            <div class="stat-amount">{{ m.totalOngoing }}</div>
            <div class="stat-sub">In the pipeline</div>
          </button>
          <button type="button" class="stat-card stat-card--bordered" :class="{ 'stat-card--active': metricFilter === 'ongoing' }" @click="applyMetric('ongoing')">
            <div class="stat-title">Total deal value</div>
            <div class="stat-amount">{{ formatMoney(m.totalOngoingValue, 'IDR') }}</div>
            <div class="stat-sub">Ongoing, base currency</div>
          </button>
          <button type="button" class="stat-card stat-card--bordered" :class="{ 'stat-card--active': metricFilter === 'closing' }" @click="applyMetric('closing')">
            <div class="stat-title">Closing this month</div>
            <div class="stat-amount">{{ m.closingThisMonthCount }}</div>
            <div class="stat-sub">{{ formatMoney(m.closingThisMonthValue, 'IDR') }}</div>
          </button>
          <button type="button" class="stat-card stat-card--bordered" :class="{ 'stat-card--active': metricFilter === 'overdue' }" @click="applyMetric('overdue')">
            <div class="stat-title">Overdue</div>
            <div class="stat-amount" :class="{ 'stat-amount--danger': m.overdueCount > 0 }">{{ m.overdueCount }}</div>
            <div class="stat-sub">Past due date</div>
          </button>
          <button type="button" class="stat-card" :class="{ 'stat-card--active': metricFilter === 'converted' }" @click="applyMetric('converted')">
            <div class="stat-title">{{ convTargetShort }} created</div>
            <div class="stat-amount">{{ m.txnCreatedPast30Count }}</div>
            <div class="stat-sub">Past 30 days</div>
          </button>
        </div>
      </div>

      <!-- ── Filter bar ── -->
      <div class="cc-filterbar">
        <div class="filter-left">
          <ErpFilterSelect
            id="deal-saved-view"
            :model-value="savedView"
            placeholder="View"
            :options="[...SAVED_VIEWS]"
            :is-clearable="false"
            @update:model-value="(v: string) => (savedView = v as SavedView)"
          />
          <ErpFilterSelect
            id="deal-stage-filter"
            :model-value="statusFilter"
            placeholder="Stage"
            :options="[...DEAL_STAGES]"
            @update:model-value="(v: string) => (statusFilter = v)"
          />
        </div>

        <div class="filter-right">
          <ErpIconSegmented id="deal-view-switch" v-model="view" :options="viewOptions" />
          <MpButtonGroup class="filter-btn-group">
            <MpTooltip label="Ask Airene" placement="bottom">
              <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" aria-label="Ask Airene" is-rounded @click="toggleAirene?.()" />
            </MpTooltip>
            <ColumnSettingsMenu v-if="view === 'table'" id="deal-columns" :items="columnItems" :visibility="columnVisibility" />
            <MpTooltip label="Export" placement="bottom">
              <MpButton variant="ghost" left-icon="download" aria-label="Export" is-rounded @click="exportOpen = true" />
            </MpTooltip>
          </MpButtonGroup>
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" placeholder="Search deals…" />
            <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''"><MpIcon name="close" size="sm" /></button>
          </div>
        </div>
      </div>

      <!-- ── Board view ── -->
      <div v-if="view === 'board'" class="kanban">
        <div class="kanban__board">
          <section
            v-for="col in boardColumns"
            :key="col.stage"
            class="kcol"
            :class="{ 'kcol--over': dragOverStage === col.stage }"
            @dragover.prevent="dragOverStage = col.stage"
            @dragleave="dragOverStage === col.stage && (dragOverStage = null)"
            @drop="onDrop(col.stage)"
          >
            <header class="kcol__head">
              <span class="kcol__name">{{ col.stage }}</span>
              <span class="kcol__count">{{ col.cards.length }}</span>
            </header>
            <div class="kcol__cards">
              <article
                v-for="d in col.cards"
                :key="d.id"
                class="deal"
                :class="{ 'deal--dragging': draggingId === d.id, 'deal--locked': d.stage === 'Won' }"
                role="button" tabindex="0" :draggable="d.stage !== 'Won'"
                :aria-label="`${d.name}. Press M to move stage, Enter to preview.`"
                @dragstart="onDragStart(d)"
                @dragend="onDragEnd"
                @click="openPreview(d)"
                @keydown="onCardKey($event, d)"
              >
                <div class="deal__head">
                  <p class="deal__company">{{ d.company }}</p>
                  <p class="deal__name">{{ d.name }}</p>
                </div>
                <div class="deal__value">{{ formatMoney(dealExpectedValue(d), d.currency) }}</div>
                <div class="deal__foot">
                  <span class="deal__owner">
                    <span class="deal__avatar" :style="ownerAvatarStyle(d.owner)">{{ ownerInitials(d.owner) }}</span>
                    {{ d.owner }}
                  </span>
                  <span v-if="isDealOpen(d)" class="deal__aging" :class="`deal__aging--${agingTone(agingDays(d))}`" :title="`Open for ${agingDays(d)} days`">{{ agingDays(d) }}d</span>
                </div>
              </article>
              <p v-if="!col.cards.length" class="kcol__empty">No deals</p>
            </div>
            <footer class="kcol__foot">
              <span class="kcol__total-k">Total:</span>
              <span class="kcol__total-v">{{ formatMoney(col.total, 'IDR') }}</span>
            </footer>
          </section>
        </div>
      </div>

      <!-- ── List view ── -->
      <ErpTablePage
        v-else
        :columns="columns"
        :rows="(paginated as unknown as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        :loading="loading"
        :search="search"
        :has-active-filter="hasActiveFilter"
        filter-empty-label="deal"
        has-checkbox
        bulk-label="deal"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @clear-filters="clearFilters"
        @hide-column="hideColumn"
      >
        <template #cell-id="{ row }">
          <span class="cell-link cell-text cc-num" @click.stop="goDetail(asDeal(row).id)">{{ dealNo(asDeal(row).id) }}</span>
        </template>

        <template #cell-name="{ row }">
          <span class="cell-link cell-text" @click.stop="goDetail(asDeal(row).id)">{{ asDeal(row).name }}</span>
          <span v-if="asDeal(row).archived" class="cc-sub cell-text">Archived</span>
        </template>

        <template #cell-company="{ row }">
          <span class="cell-link cell-text" @click.stop="goCustomer(asDeal(row).customerId)">{{ asDeal(row).company }}</span>
        </template>

        <template #cell-stage="{ row }">
          <ErpStatusBadge :status="asDeal(row).stage" v-bind="stageBadge(asDeal(row).stage)" />
        </template>

        <template #cell-owner="{ value }">{{ value || '—' }}</template>

        <template #cell-value="{ row }">{{ formatMoney(dealExpectedValue(asDeal(row)), asDeal(row).currency) }}</template>

        <template #cell-expectedCloseDate="{ value }">{{ value ? formatDate(value as string) : '—' }}</template>

        <template #cell-lastActivity="{ row }">
          <span class="cell-text">{{ formatDate(asDeal(row).lastActivity) }}, {{ updatedTime(asDeal(row).id) }}</span>
          <span class="cc-sub cell-text">{{ asDeal(row).lastModifiedBy || asDeal(row).createdBy || '—' }}</span>
        </template>

        <template #actions="{ row }">
          <MpPopover :id="`deal-actions-${asDeal(row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="ghost" left-icon="menu-kebab" aria-label="More actions" is-rounded />
            </MpPopoverTrigger>
            <MpPopoverContent class="erp-dropdown-menu">
              <MpPopoverList>
                <MpPopoverListItem @click="goDetail(asDeal(row).id)">View details</MpPopoverListItem>
                <template v-if="!asDeal(row).archived">
                  <MpPopoverListItem @click="openEdit(asDeal(row))">Edit</MpPopoverListItem>
                  <MpPopoverListItem @click="openStageModal(asDeal(row))">Change stage</MpPopoverListItem>
                  <MpPopoverListItem
                    v-if="asDeal(row).conversion === 'none' && asDeal(row).products?.length"
                    @click="onConvert(asDeal(row))"
                  >Create {{ dealConversionTarget }}</MpPopoverListItem>
                </template>
              </MpPopoverList>
              <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
              <MpPopoverList>
                <MpPopoverListItem v-if="asDeal(row).archived" @click="onRestore(asDeal(row))">Restore</MpPopoverListItem>
                <MpPopoverListItem v-else @click="onArchive(asDeal(row))">Archive</MpPopoverListItem>
                <MpPopoverListItem @click="askDelete(asDeal(row))">Delete</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>

        <template #bulk-actions="{ selectedRows }">
          <button type="button" class="erp-bulk-action" @click="openBulkOwner(selectedRows as Set<number>)">Change owner</button>
          <button type="button" class="erp-bulk-action" @click="openBulkStage(selectedRows as Set<number>)">Change stage</button>
        </template>

        <template #empty>
          <div class="cc-empty">
            <img :src="'/illustrations/empty-folder.png'" alt="" class="cc-empty-illustration" width="288" height="240" />
            <p class="cc-empty-title">No deals</p>
            <p class="cc-empty-desc">Create a deal to start tracking an opportunity.</p>
            <MpButton variant="secondary" is-rounded left-icon="add" @click="openCreate">New deal</MpButton>
          </div>
        </template>
      </ErpTablePage>
    </div>

    <!-- ── Quick-create drawer (full detail form is a page → /crm/deals/new) ── -->
    <CrmDealQuickCreateDrawer :open="quickOpen" @cancel="quickOpen = false" @saved="onQuickSaved" @open-full="onQuickOpenFull" />

    <!-- ── Quick preview drawer ── -->
    <CrmDealPreviewDrawer
      :open="previewOpen"
      :deal="previewDeal"
      @close="previewOpen = false"
      @view-details="(id) => { previewOpen = false; goDetail(id) }"
      @edit="(d) => { previewOpen = false; openEdit(d) }"
      @move-stage="onPreviewMove"
      @archive="(d) => { previewOpen = false; onArchive(d) }"
      @delete="(d) => { previewOpen = false; askDelete(d) }"
    />

    <!-- ── Stage / owner modals + confirms ── -->
    <CrmDealStageModal
      :open="stageModalOpen"
      :count="stageModalCount"
      :preset-stage="stageModalPreset"
      :allowed-stages="stageModalAllowed"
      @close="stageModalOpen = false"
      @confirm="onStageModalConfirm"
    />
    <CrmDealOwnerModal :open="ownerModalOpen" :count="bulkIds.length" @close="ownerModalOpen = false" @confirm="onBulkOwner" />
    <ConfirmModal
      v-model:is-open="wonConfirmOpen"
      title="Mark this deal as Won?"
      description="Won is a terminal stage — once set, the deal can’t move to another stage."
      confirm-label="Mark as Won"
      :is-danger="false"
      @confirm="confirmWon"
    />
    <ConfirmModal
      v-model:is-open="reopenConfirmOpen"
      title="Reopen this lost deal?"
      description="The deal returns to an active ongoing stage and rejoins the pipeline."
      confirm-label="Reopen deal"
      :is-danger="false"
      @confirm="confirmReopen"
    />
    <ConfirmModal
      v-model:is-open="deleteConfirmOpen"
      title="Delete this deal?"
      description="This permanently removes the deal and its history. This can’t be undone."
      confirm-label="Delete deal"
      @confirm="confirmDelete"
    />

    <!-- ── Import / Export ── -->
    <ImportSpreadsheetModal :open="importOpen" title="Import deals" @close="importOpen = false" @upload="onImportUpload" />
    <ExportModal
      :open="exportOpen"
      title="Export deals"
      entity-label="deals"
      :columns="exportColumns"
      :total="source.length"
      @close="exportOpen = false"
      @export="onExport"
    />
  </div>
</template>

<style scoped>
.crm { display: flex; flex-direction: column; height: 100%; min-height: 0; }

/* ── Title bar ── */
.crm-titlebar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.crm-titlebar__left { display: flex; align-items: baseline; gap: var(--mp-spacing-3); }
.crm-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; color: var(--mp-text-default, #272b32); }
.crm-subtitle { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #656f80); }
.crm-titlebar__right { display: flex; align-items: center; gap: var(--mp-spacing-2); }

/* ── Stage (scroll area) ── */
/* No top padding on the scrollport: it would sit between the clip edge and the
   sticky .cc-filterbar's containing block, leaving a gap rows show through when
   the bar is pinned. The 20px lives on .cc-stats (the first child) instead.
   flex-direction:column lets the kanban (flex:1) fill the height so its swimlanes
   reach the bottom. */
.cc-stage { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); padding: 0 var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); }

/* ── Stats (Bills / Sales-invoices pattern) ── */
/* 20px of the old 40px gap moved onto .cc-filterbar's padding-top, so the
   pinned bar carries an opaque strip above it. Rest-state spacing unchanged. */
.cc-stats { padding-top: var(--mp-spacing-5); margin-bottom: var(--mp-spacing-5); }
.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: 0 var(--mp-spacing-6) 0 0; align-self: stretch; background: none; border: none; text-align: left; cursor: pointer; border-radius: var(--mp-radii-md); }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-card:hover .stat-title { color: var(--mp-text-link); }
.stat-card--active .stat-title { color: var(--mp-text-link); font-weight: var(--mp-font-weights-semi-bold); }
.stat-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-amount--danger { color: var(--mp-text-danger); }
.stat-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; }

/* ── Filter bar (pinned) ── */
/* The filter bar pins to the top of the scrolling stage. Left unpinned it scrolls
   under the stage's clip edge and the search pill gets sliced mid-scroll (its top
   border disappears while the rest is still visible); pinning also keeps search +
   filters reachable on a long list instead of forcing a scroll back to the top.
   Opaque stage background + z-index 3 so rows pass underneath, not through. */
.cc-filterbar { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding-top: var(--mp-spacing-5); padding-bottom: var(--mp-spacing-5); background: var(--mp-background-stage, #fff); }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
/* Icon tools (Airene · Column settings · Export) form a flush toolbar — no gap.
   `.filter-btn-group` is passed onto the MpButtonGroup root, so it lands on the
   SAME element as `.mp-pixel-button-group` (not a descendant) — the gap override
   must target this element directly, not a `:deep()` child. */
.filter-btn-group { display: flex; align-items: center; gap: 0 !important; }
.filter-btn-group :deep(.mp-pixel-button-group) { gap: 0 !important; }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }
@media (max-width: 640px) {
  .cc-filterbar { flex-wrap: wrap; }
  .cc-filterbar > :last-child { flex: 1 1 100%; }
}

/* Pill search */
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.filter-search-input::placeholder { color: var(--mp-text-placeholder, #97a0af); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); border-radius: var(--mp-radii-full, 999px); }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-icon-default, #536062); }

/* ── Table cell helpers ── */
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cell-link { color: var(--mp-text-link); cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cc-sub { display: block; margin-top: 1px; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cc-num { font-variant-numeric: tabular-nums; color: var(--mp-text-secondary); }
.cc-muted { color: var(--mp-text-subtle, #97a0af); }
.deal-attention { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-warning, #b54708); }

/* Bulk-bar action buttons (sm secondary look — bulk bar only) */
.erp-bulk-action { display: inline-flex; align-items: center; height: 32px; padding: 0 var(--mp-spacing-3); border: 1px solid var(--mp-border-bold, #8c9596); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral, #fff); color: var(--mp-text-default); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; }
.erp-bulk-action:hover { background: var(--mp-background-neutral-hovered); }

/* ── Kanban board (swimlanes fill the stage height) ── */
.kanban { flex: 1; min-height: 0; overflow-x: auto; overflow-y: hidden; padding-bottom: var(--mp-spacing-3); }
.kanban__board { display: flex; gap: var(--mp-spacing-4); align-items: stretch; min-height: 100%; height: 100%; }
.kcol { flex: 0 0 288px; width: 288px; display: flex; flex-direction: column; min-height: 0; background: var(--mp-background-neutral-subtle, #f4f5f7); border: 1px solid var(--mp-border-default); border-radius: 12px; transition: background 0.12s ease, border-color 0.12s ease; }
.kcol--over { background: var(--mp-background-brand-subtle, #e8f5f0); border-color: var(--mp-border-brand, #0a6e4e); }
.kcol__head { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-2); }
.kcol__name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kcol__count { flex-shrink: 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); background: var(--mp-background-neutral, #fff); border-radius: 999px; padding: 1px 8px; }
.kcol__cards { flex: 1 1 auto; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: 0 var(--mp-spacing-2) var(--mp-spacing-2); }
.kcol__empty { margin: 0; padding: var(--mp-spacing-4) 0; text-align: center; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.kcol__foot { display: flex; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-3); }
.kcol__total-k { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.kcol__total-v { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

/* ── Deal card ── */
.deal { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default); border-radius: 8px; cursor: pointer; }
.deal:hover { border-color: var(--mp-border-bold, #8c9596); }
.deal:focus-visible { outline: 2px solid var(--mp-border-brand, #0a6e4e); outline-offset: 1px; }
.deal--locked { cursor: pointer; }
.deal--locked:active { cursor: pointer; }
.deal:not(.deal--locked):active { cursor: grabbing; }
.deal--dragging { opacity: 0.45; }
.deal__head { display: flex; flex-direction: column; gap: 2px; }
.deal__company { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__name { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.deal__foot { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.deal__owner { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__avatar { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 22px; height: 22px; border-radius: var(--mp-radii-full, 999px); font-size: 10px; font-weight: var(--mp-font-weights-semi-bold); line-height: 1; letter-spacing: 0.2px; }
.deal__aging { flex-shrink: 0; font-size: var(--mp-font-sizes-sm); font-variant-numeric: tabular-nums; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle, #f0f1f3); border-radius: var(--mp-radii-full, 999px); padding: 1px var(--mp-spacing-2); }
.deal__aging--warn { color: var(--mp-text-warning, #b54708); background: var(--mp-background-warning-subtle, #fef6e7); }
.deal__aging--danger { color: var(--mp-text-danger, #b42318); background: var(--mp-background-danger-subtle, #fdecec); font-weight: var(--mp-font-weights-semi-bold); }

/* ── Empty state ── */
.cc-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); }
.cc-empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.cc-empty-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cc-empty-desc { margin-top: var(--mp-spacing-0\.5); margin-bottom: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
