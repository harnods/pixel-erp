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
import { ref, reactive, computed, watch, inject, onMounted } from 'vue'
import {
  MpButton, MpButtonGroup, MpIcon, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
  MpTabs, MpTabList, MpTab,
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
import CrmDealsFiltersDrawer, { emptyCrmDealsFilters, type CrmDealsFiltersValue } from '~/components/patterns/CrmDealsFiltersDrawer.vue'
import type { AmountComparator } from '~/components/patterns/AmountComparatorField.vue'
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
  dealConversionTarget, dealExpectedValue, isDealOpen, getDeal, dealDraftSeed, dealNo,
  CRM_OWNERS, crmCustomers, dealStageBadgeType, dealStageLabel, getCrmModule,
  dealPipelineDisplay, dealPipelineViews, dealPipelines,
  type Deal, type DealStage, type DealDraftSeed,
} from '~/data/crm'
import { pinsForModule, metricPinValue, unpinReportMetric } from '~/data/crmReports'

const { t } = useLocale()
const router = useRouter()
// The page title mirrors the Deals module name (renamable in module settings).
const dealsModuleName = computed(() => getCrmModule('deals')?.name || t('Deals'))

// ── Deals-module settings applied to the board (module builder ▸ Pipeline) ──
// Stage labels come from the shared dealStageLabel (renamable in settings, matched
// by stable id) so the board, table + every badge stay one source.
function stageKind(c: DealStage): 'open' | 'won' | 'lost' {
  return c === 'Won' ? 'won' : c === 'Lost' ? 'lost' : 'open'
}
// Card field / display toggles from the module builder's right-hand panel.
const cardFieldOn = (key: string) => activeViewDisplay.value.cardFields.some((f) => f.key === key && f.on)
function asDeal(row: unknown): Deal { return row as Deal }
function goDetail(id: string) { router.push(`/crm/deals/${id}`) }
function goOrder(id: string) { router.push(`/crm/orders/${id}`) }
function goCustomer(id: string) { router.push(`/crm/customers/${id}`) }

const TODAY = '2026-09-07'
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
const convTargetShort = computed(() => (dealConversionTarget.value === 'Sales Quote' ? t('Sales Quotes') : t('Sales Orders')))

// ── Optional report-backed metric pins — an extension area after the 5
// protected fixed cards above (never replaces/reorders them). ──
const pinnedDealMetrics = computed(() => pinsForModule('deals'))

// ── Saved views (PRD system views) ──
const SAVED_VIEWS = ['All records', 'My records', 'Recently created', 'Recently modified', 'Won', 'Lost', 'Archived'] as const
type SavedView = typeof SAVED_VIEWS[number]
const savedView = ref<SavedView>('All records')

// ── Saved pipeline views (configured in the module builder) — one Kanban tab
//    per view; the active view hides its stages from the board. Deals stages map
//    to the pipeline stages by position (both ordered identically). ──
const pipelineViewTabs = computed(() => dealPipelineViews)
const activePipelineViewId = ref('default')
watch(pipelineViewTabs, (tabs) => {
  if (!tabs.some((v) => v.id === activePipelineViewId.value)) activePipelineViewId.value = tabs[0]?.id ?? 'default'
}, { immediate: true })
const activePipelineViewIndex = computed(() => Math.max(0, pipelineViewTabs.value.findIndex((v) => v.id === activePipelineViewId.value)))
// The active view's board display (total/card fields/aging/color) drives the
// board; falls back to the module's shared display for the default/legacy case.
const activeViewDisplay = computed(() => {
  const v = pipelineViewTabs.value.find((x) => x.id === activePipelineViewId.value)
  return v?.display ?? dealPipelineDisplay
})
const hiddenDealStages = computed<Set<DealStage>>(() => {
  const v = pipelineViewTabs.value.find((x) => x.id === activePipelineViewId.value)
  const stages = dealPipelines.find((p) => p.id === 'default')?.stages ?? dealPipelines[0]?.stages ?? []
  const hidden = new Set<DealStage>()
  if (v) stages.forEach((s, i) => { if (v.hiddenStageIds.includes(s.id) && DEAL_STAGES[i]) hidden.add(DEAL_STAGES[i]!) })
  return hidden
})

// ── View toggle (list default per PRD) ──
const view = ref<'table' | 'board'>('table')
const viewOptions = [
  { value: 'table', icon: 'table-view-list', label: t('List view') },
  { value: 'board', icon: 'table-view-column', label: t('Board view') },
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

// ── "All filters" drawer ──
const filtersOpen = ref(false)
const appliedFilters = reactive<CrmDealsFiltersValue>(emptyCrmDealsFilters())
const keywordColumns = [
  { key: 'name',            label: t('Deal name') },
  { key: 'id',              label: t('Deal number') },
  { key: 'company',         label: t('Customer') },
  { key: 'owner',           label: t('Owner') },
  { key: 'referenceNumber', label: t('Reference number') },
]
const ownerOptions = [...CRM_OWNERS]
const customerOptions = computed(() => [...new Set(deals.map((d) => d.company))].sort())
function applyDrawerFilters(v: CrmDealsFiltersValue) { Object.assign(appliedFilters, v) }
// "gt"/"lt" use the single value; "between" uses min/max.
function matchesAmountFilter(amount: number, comparator: AmountComparator, value: string, min: string, max: string): boolean {
  if (comparator === 'gt') return value === '' || amount > Number(value)
  if (comparator === 'lt') return value === '' || amount < Number(value)
  const lo = min === '' ? -Infinity : Number(min)
  const hi = max === '' ? Infinity : Number(max)
  return amount >= lo && amount <= hi
}
function matchesTagComparator(rowValue: string, comparator: string, picked: string[]): boolean {
  if (picked.length === 0) return true
  if (comparator === 'isNoneOf') return !picked.includes(rowValue)
  return picked.includes(rowValue)   // isAnyOf / isAllOf collapse to membership for a single-value field
}
// AdvancedDateRangePicker emits a [start, end] Date pair (or null = not applied).
function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
function matchesDateRange(iso: string, range: Date[] | null): boolean {
  if (!range) return true
  if (!iso) return false
  const t = dayStart(new Date(iso)).getTime()
  return t >= dayStart(range[0]!).getTime() && t <= dayStart(range[1]!).getTime()
}

// ── Table state (search + Stage filter + saved view + metric + drawer + sort) ──
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

    // ── "All filters" drawer (independent of the toolbar search / Stage select) ──
    const f = appliedFilters
    const kw = f.keyword.toLowerCase().trim()
    const colText: Record<string, string> = {
      name: row.name, id: dealNo(row.id), company: row.company, owner: row.owner, referenceNumber: row.referenceNumber ?? '',
    }
    const matchesKeyword = !kw || (
      f.keywordColumn === 'all'
        ? Object.values(colText).join(' ').toLowerCase().includes(kw)
        : (colText[f.keywordColumn] ?? '').toLowerCase().includes(kw)
    )
    const matchesValue = matchesAmountFilter(dealExpectedValue(row), f.valueComparator, f.value, f.valueMin, f.valueMax)
    const matchesOwner = matchesTagComparator(row.owner, f.ownerComparator, f.owners)
    const matchesCustomer = matchesTagComparator(row.company, f.customerComparator, f.customers)
    const matchesCloseDate = matchesDateRange(row.expectedCloseDate, f.closeDate)

    return matchesStage && matchesSearch && matchesKeyword && matchesValue && matchesOwner && matchesCustomer && matchesCloseDate
  },
})
watch(appliedFilters, () => setPage(1))

const drawerFilterCount = computed(() => {
  const f = appliedFilters
  let n = 0
  if (f.keyword) n++
  if (f.value !== '' || f.valueMin !== '' || f.valueMax !== '') n++
  if (f.owners.length > 0) n++
  if (f.customers.length > 0) n++
  if (f.closeDate) n++
  return n
})

const hasActiveFilter = computed(() => !!statusFilter.value || !!metricFilter.value || savedView.value !== 'All records' || drawerFilterCount.value > 0)
function clearFilters() {
  search.value = ''; statusFilter.value = ''; metricFilter.value = ''; savedView.value = 'All records'
  Object.assign(appliedFilters, emptyCrmDealsFilters())
}

// ── Board columns (respect saved view + stage filter + search + metric) ──
interface BoardColumn { stage: DealStage; cards: Deal[]; total: number }
const boardColumns = computed<BoardColumn[]>(() => {
  const s = search.value.trim().toLowerCase()
  return DEAL_STAGES.filter((stage) => !hiddenDealStages.value.has(stage)).map((stage) => {
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
  if (d.stage === 'Won') { infoToast(t('Won is terminal — this deal cannot change stage.')); return }
  pendingMove.value = { id, stage }
  if (stage === 'Lost') { openStageModalForLost([id]) }
  else if (stage === 'Won') { wonConfirmOpen.value = true }
  else if (d.stage === 'Lost') { reopenConfirmOpen.value = true }
  else { commitMove(id, stage) }
}
function commitMove(id: string, stage: DealStage, lostReason?: string) {
  const r = moveDealStage(id, stage, { lostReason })
  if (r.ok) successToast(`${t('Deal moved to')} ${stage}`)
  else infoToast(r.error ?? t('Could not change stage'))
  pendingMove.value = null
}
function confirmWon() { const p = pendingMove.value; if (p) commitMove(p.id, 'Won'); wonConfirmOpen.value = false }
function confirmReopen() { const p = pendingMove.value; if (p) commitMove(p.id, p.stage); reopenConfirmOpen.value = false }

// Open the stage modal preset to Lost (captures the required reason) for 1..N deals
// — kanban drag-to-Lost only. The free picker (row menu / bulk) never uses a modal;
// see the popover-based `stagePicker` below.
function openStageModalForLost(ids: string[]) {
  stageModalIds.value = ids; stageModalCount.value = ids.length
  stageModalPreset.value = 'Lost'; stageModalAllowed.value = undefined; stageModalOpen.value = true
}
function onStageModalConfirm(payload: { stage: DealStage; lostReason?: string }) {
  const ids = stageModalIds.value
  if (ids.length === 1) {
    commitMove(ids[0]!, payload.stage, payload.lostReason)
  } else {
    const res = bulkChangeStage(ids, payload.stage, { lostReason: payload.lostReason })
    reportBulk(res, `${t('stage')} → ${payload.stage}`)
  }
  stageModalOpen.value = false
}

// ── Change stage — popover, never a modal (row menu + bulk Actions) ──
// The popover's own content swaps in place (stage list → Lost-reason mini-form)
// instead of opening a separate dialog; see the #actions / #bulk-actions templates.
const stagePicker = reactive<{
  mode: 'row' | 'bulk' | null; ids: string[]; awaitingLostReason: boolean; lostReason: string; error: string
}>({ mode: null, ids: [], awaitingLostReason: false, lostReason: '', error: '' })
function stageOptionsFor(ids: string[]): DealStage[] {
  if (ids.length === 1 && getDeal(ids[0]!)?.stage === 'Lost') return [...ONGOING_STAGES]
  return [...DEAL_STAGES]
}
function openRowStagePicker(d: Deal) {
  stagePicker.mode = 'row'; stagePicker.ids = [d.id]
  stagePicker.awaitingLostReason = false; stagePicker.lostReason = ''; stagePicker.error = ''
}
function openBulkStagePicker(ids: string[]) {
  stagePicker.mode = 'bulk'; stagePicker.ids = ids
  stagePicker.awaitingLostReason = false; stagePicker.lostReason = ''; stagePicker.error = ''
}
function closeStagePicker() {
  stagePicker.mode = null; stagePicker.ids = []
  stagePicker.awaitingLostReason = false; stagePicker.lostReason = ''; stagePicker.error = ''
}
function cancelLostReason() { stagePicker.awaitingLostReason = false; stagePicker.lostReason = ''; stagePicker.error = '' }
function pickStage(stage: DealStage) {
  if (stage === 'Lost') { stagePicker.awaitingLostReason = true; return }
  commitStagePick(stage)
}
function confirmLostReason() {
  if (!stagePicker.lostReason.trim()) { stagePicker.error = t('A Lost reason is required.'); return }
  commitStagePick('Lost', stagePicker.lostReason.trim())
}
function commitStagePick(stage: DealStage, lostReason?: string) {
  const ids = stagePicker.ids
  if (ids.length === 1) commitMove(ids[0]!, stage, lostReason)
  else { const res = bulkChangeStage(ids, stage, { lostReason }); reportBulk(res, `${t('stage')} → ${stage}`) }
  closeStagePicker()
}

// Keyboard: Enter opens the quick preview; "m" opens the stage-move modal — the
// popover stage picker needs a trigger element to anchor to, which a bare keypress
// doesn't have, so this one shortcut still goes through CrmDealStageModal.
function onCardKey(e: KeyboardEvent, d: Deal) {
  if (e.key === 'Enter') { openPreview(d); return }
  if (e.key.toLowerCase() === 'm') {
    e.preventDefault()
    stageModalIds.value = [d.id]; stageModalCount.value = 1; stageModalPreset.value = null
    stageModalAllowed.value = d.stage === 'Lost' ? [...ONGOING_STAGES] : undefined
    stageModalOpen.value = true
  }
}

// ── Quick preview drawer (kanban card → preview → View details) ──
const previewOpen = ref(false)
const previewDeal = ref<Deal | null>(null)
function openPreview(d: Deal) { previewDeal.value = d; previewOpen.value = true }
/** Preview "Move to…" — change stage directly (no modal). Won is terminal; a
 *  → Lost move carries a default reason (editable later on the detail page). */
function onPreviewMove(d: Deal, stage: DealStage) {
  previewOpen.value = false
  const r = moveDealStage(d.id, stage, stage === 'Lost' ? { lostReason: t('Marked as lost') } : {})
  if (r.ok) successToast(`${t('Deal moved to')} ${stage}`)
  else infoToast(r.error ?? t('Could not change stage'))
}

// ── Bulk actions ──
const ownerModalOpen = ref(false)
const bulkIds = ref<string[]>([])
function selectedIds(selected: Set<number>): string[] {
  return [...selected].map((i) => paginated.value[i]?.id).filter(Boolean) as string[]
}
function openBulkOwner(selected: Set<number>) { bulkIds.value = selectedIds(selected); ownerModalOpen.value = true }
function onBulkOwner(owner: string) {
  const res = bulkChangeOwner(bulkIds.value, owner)
  reportBulk(res, `${t('owner')} → ${owner}`)
  ownerModalOpen.value = false
}
function reportBulk(res: { ok: boolean }[], what: string) {
  const ok = res.filter((r) => r.ok).length
  const failed = res.length - ok
  if (failed === 0) successToast(`${ok} ${ok === 1 ? t('deal') : t('deals')} ${t('updated')} (${what})`)
  else infoToast(`${ok} ${t('updated')}, ${failed} ${t('skipped')} (${what})`)
}

// ── Create (quick drawer) / Edit (full-detail page) ──
const quickOpen = ref(false)
function openCreate() { router.push('/crm/deals/new') }
function onQuickSaved(d: Deal) { quickOpen.value = false; successToast(t('Deal created')); goDetail(d.id) }
function onQuickOpenFull(seed: DealDraftSeed) { dealDraftSeed.value = seed; quickOpen.value = false; router.push('/crm/deals/new') }
// The detailed form is a PAGE (PRD) — Edit navigates there.
function openEdit(d: Deal) { router.push(`/crm/deals/${d.id}/edit`) }

// ── Archive (confirmed) / Restore / Delete + Convert (row menu + bulk) ──
function onRestore(d: Deal) { restoreDeal(d.id); successToast(t('Deal restored')) }
const archiveConfirmOpen = ref(false)
const archiveTargetIds = ref<string[]>([])
let archiveDeselect: (() => void) | null = null
function askArchive(d: Deal) { archiveTargetIds.value = [d.id]; archiveDeselect = null; archiveConfirmOpen.value = true }
function askBulkArchive(ids: string[], deselect?: () => void) {
  if (!ids.length) return
  archiveTargetIds.value = ids; archiveDeselect = deselect ?? null; archiveConfirmOpen.value = true
}
const archiveConfirmTitle = computed(() => archiveTargetIds.value.length > 1 ? `${t('Archive')} ${archiveTargetIds.value.length} ${t('deals')}?` : t('Archive deal?'))
const archiveConfirmDescription = computed(() => archiveTargetIds.value.length > 1
  ? t('The selected deals will be archived. You can restore them later.')
  : t('This deal will be archived. You can restore it later.'))
function confirmArchive() {
  const ids = archiveTargetIds.value
  ids.forEach((id) => archiveDeal(id))
  archiveDeselect?.(); archiveDeselect = null
  successToast(`${ids.length} ${ids.length === 1 ? t('deal') : t('deals')} ${t('archived')}`)
  archiveConfirmOpen.value = false; archiveTargetIds.value = []
}
const deleteConfirmOpen = ref(false)
const deleteTargetIds = ref<string[]>([])
let deleteDeselect: (() => void) | null = null
function askDelete(d: Deal) { deleteTargetIds.value = [d.id]; deleteDeselect = null; deleteConfirmOpen.value = true }
function askBulkDelete(ids: string[], deselect?: () => void) {
  if (!ids.length) return
  deleteTargetIds.value = ids; deleteDeselect = deselect ?? null; deleteConfirmOpen.value = true
}
const deleteConfirmTitle = computed(() => deleteTargetIds.value.length > 1 ? `${t('Delete')} ${deleteTargetIds.value.length} ${t('deals')}?` : t('Delete deal?'))
function confirmDelete() {
  const ids = deleteTargetIds.value
  ids.forEach((id) => deleteDeal(id))
  deleteDeselect?.(); deleteDeselect = null
  successToast(ids.length === 1 ? t('Deal deleted') : `${ids.length} ${t('deals')} ${t('deleted')}`)
  deleteConfirmOpen.value = false; deleteTargetIds.value = []
}
function onConvert(d: Deal) {
  const r = convertDeal(d.id)
  if (r.ok) successToast(`${r.target} ${r.salesOrderId} ${t('created')}`)
  else infoToast(r.error ?? t('Conversion could not start'))
}

// ── Import / Export ──
const importOpen = ref(false)
function onImportUpload(files: File[]) {
  importOpen.value = false
  successToast(`${files.length} ${files.length === 1 ? t('file') : t('files')} ${t('queued for import')}`)
}
const exportOpen = ref(false)
const selectedCount = ref(0)
const exportColumns = [
  { key: 'name', label: t('Deal name') }, { key: 'stage', label: t('Stage') }, { key: 'company', label: t('Customer') },
  { key: 'picName', label: t('Contact person') },
  { key: 'owner', label: t('Owner') }, { key: 'value', label: t('Expected deal value') }, { key: 'currency', label: t('Currency') },
  { key: 'expectedCloseDate', label: t('Close date') }, { key: 'conversion', label: t('Conversion status') },
  { key: 'salesOrderId', label: t('Linked ERP transaction') }, { key: 'lastActivity', label: t('Last updated') },
]
function onExport() { exportOpen.value = false; successToast(t('Export ready — check your downloads')) }

// ── Badges ──
// Colour comes from the shared `dealStageBadgeType` (single source of truth, so the
// pipeline, deal preview, and company Deals tab never drift). Label = the stage name.
function stageBadge(stage: DealStage): { type: 'completed' | 'announcement' | 'information' | 'warning' | 'critical'; label: string } {
  return { type: dealStageBadgeType(stage), label: t(dealStageLabel(stage)) }
}
// ── Columns — the 6 defaults, plus optional PRD columns hidden by default and
// toggleable from Column settings. ──
const baseColumns: TableColumn[] = [
  { key: 'id',            label: t('Number'),         kind: 'default', sortable: true, sortType: 'text'   },
  { key: 'name',          label: t('Deal name'),      kind: 'name',    sortable: true, sortType: 'text'   },
  { key: 'company',       label: t('Customer'),       kind: 'name',    sortable: true, sortType: 'text'   },
  { key: 'contactPerson', label: t('Contact person'), kind: 'name',    sortable: true, sortType: 'text'   },
  { key: 'stage',         label: t('Stage'),          kind: 'status',  sortable: true, sortType: 'text'   },
  { key: 'owner',         label: t('Owner'),          kind: 'name',    sortable: true, sortType: 'text'   },
  { key: 'expectedCloseDate', label: t('Close date'), kind: 'date',    sortable: true, sortType: 'text'   },
  { key: 'value',         label: t('Deal value'),     kind: 'amount',  align: 'right', sortable: true, sortType: 'number' },
]
const optionalColumns: TableColumn[] = [
  { key: 'lastActivity',      label: t('Last updated'), kind: 'default', sortable: true, sortType: 'text' },
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
        <h1 class="crm-title">{{ dealsModuleName }}</h1>
      </div>
      <div class="crm-titlebar__right">
        <MpButtonGroup>
          <MpButton variant="secondary" is-rounded @click="importOpen = true">{{ t('Import') }}</MpButton>
          <MpButton variant="primary" is-rounded left-icon="add" @click="openCreate">{{ t('New deal') }}</MpButton>
        </MpButtonGroup>
      </div>
    </header>

    <div class="cc-stage">
      <!-- ── Fixed metrics (PRD: 5 cards, click-through) ── -->
      <div class="cc-stats">
        <div class="stats-section">
          <button type="button" class="stat-card stat-card--bordered" :class="{ 'stat-card--active': metricFilter === 'ongoing' }" @click="applyMetric('ongoing')">
            <div class="stat-title">{{ t('Total ongoing deals') }}</div>
            <div class="stat-amount">{{ m.totalOngoing }}</div>
            <div class="stat-sub">{{ t('In the pipeline') }}</div>
          </button>
          <button type="button" class="stat-card stat-card--bordered" :class="{ 'stat-card--active': metricFilter === 'ongoing' }" @click="applyMetric('ongoing')">
            <div class="stat-title">{{ t('Total deal value') }}</div>
            <div class="stat-amount">{{ formatMoney(m.totalOngoingValue, 'IDR') }}</div>
            <div class="stat-sub">{{ t('Ongoing, base currency') }}</div>
          </button>
          <button type="button" class="stat-card stat-card--bordered" :class="{ 'stat-card--active': metricFilter === 'closing' }" @click="applyMetric('closing')">
            <div class="stat-title">{{ t('Closing this month') }}</div>
            <div class="stat-amount">{{ m.closingThisMonthCount }}</div>
            <div class="stat-sub">{{ formatMoney(m.closingThisMonthValue, 'IDR') }}</div>
          </button>
          <button type="button" class="stat-card stat-card--bordered" :class="{ 'stat-card--active': metricFilter === 'overdue' }" @click="applyMetric('overdue')">
            <div class="stat-title">{{ t('Overdue') }}</div>
            <div class="stat-amount" :class="{ 'stat-amount--danger': m.overdueCount > 0 }">{{ m.overdueCount }}</div>
            <div class="stat-sub">{{ t('Past due date') }}</div>
          </button>
          <button type="button" class="stat-card" :class="{ 'stat-card--active': metricFilter === 'converted' }" @click="applyMetric('converted')">
            <div class="stat-title">{{ convTargetShort }} {{ t('created') }}</div>
            <div class="stat-amount">{{ m.txnCreatedPast30Count }}</div>
            <div class="stat-sub">{{ t('Past 30 days') }}</div>
          </button>
        </div>
        <!-- ── Optional report-backed pins — a distinct extension area after the
             protected fixed cards above (never replaces/reorders them). ── -->
        <div v-if="pinnedDealMetrics.length" class="cc-pinned-metrics">
          <div v-for="pin in pinnedDealMetrics" :key="pin.id" class="pinned-metric-card">
            <button type="button" class="pinned-metric-body" @click="router.push(`/crm/reports/${pin.reportId}`)">
              <div class="stat-title">{{ pin.label }}</div>
              <div class="stat-amount">{{ metricPinValue(pin) ?? '—' }}</div>
            </button>
            <button type="button" class="pinned-metric-unpin" :aria-label="t('Unpin')" @click="unpinReportMetric(pin.id)">
              <MpIcon name="close" size="sm" />
            </button>
          </div>
        </div>
      </div>

      <!-- ── Filter bar ── -->
      <div class="cc-filterbar">
        <div class="filter-left">
          <ErpFilterSelect
            id="deal-saved-view"
            :model-value="savedView"
            :placeholder="t('View')"
            :options="[...SAVED_VIEWS]"
            :is-clearable="false"
            @update:model-value="(v: string) => (savedView = v as SavedView)"
          />
          <ErpFilterSelect
            id="deal-stage-filter"
            :model-value="statusFilter"
            :placeholder="t('Stage')"
            :options="DEAL_STAGES.map((s) => ({ value: s, label: t(dealStageLabel(s)) }))"
            @update:model-value="(v: string) => (statusFilter = v)"
          />
          <MpButton
            variant="secondary" left-icon="filter" is-rounded
            class="filter-all-btn" :class="{ 'filter-all-btn--active': drawerFilterCount > 0 }"
            @click="filtersOpen = true"
          >{{ t('All filters') }}{{ drawerFilterCount > 0 ? ` (${drawerFilterCount})` : '' }}</MpButton>
        </div>

        <div class="filter-right">
          <ErpIconSegmented id="deal-view-switch" v-model="view" :options="viewOptions" />
          <MpButtonGroup class="filter-btn-group">
            <MpTooltip :label="t('Ask Airene')" placement="bottom">
              <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
            </MpTooltip>
            <ColumnSettingsMenu v-if="view === 'table'" id="deal-columns" :items="columnItems" :visibility="columnVisibility" />
            <MpTooltip :label="t('Export')" placement="bottom">
              <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="exportOpen = true" />
            </MpTooltip>
          </MpButtonGroup>
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search deals…')" />
            <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''"><MpIcon name="close" size="sm" /></button>
          </div>
        </div>
      </div>

      <!-- ── Saved view tabs (board only) — one tab per pipeline view configured
           in the module builder; the active view hides its stages. ── -->
      <MpTabs
        v-if="view === 'board' && pipelineViewTabs.length > 1"
        id="deal-view-tabs" class="deal-view-tabs" variant-color="green" is-manual
        :model-value="activePipelineViewIndex"
        @change="(i: number) => (activePipelineViewId = pipelineViewTabs[i]?.id ?? 'default')"
      >
        <MpTabList>
          <MpTab v-for="v in pipelineViewTabs" :key="v.id">{{ v.name }}</MpTab>
        </MpTabList>
      </MpTabs>

      <!-- ── Board view ── -->
      <div v-if="view === 'board'" class="kanban">
        <div class="kanban__board">
          <section
            v-for="col in boardColumns"
            :key="col.stage"
            class="kcol"
            :class="{ 'kcol--over': dragOverStage === col.stage, [`kcol--${stageKind(col.stage)}`]: activeViewDisplay.colorColumns }"
            @dragover.prevent="dragOverStage = col.stage"
            @dragleave="dragOverStage === col.stage && (dragOverStage = null)"
            @drop="onDrop(col.stage)"
          >
            <header class="kcol__head">
              <span class="kcol__name">{{ t(dealStageLabel(col.stage)) }}</span>
              <span class="kcol__count">{{ col.cards.length }}</span>
            </header>
            <div class="kcol__cards">
              <article
                v-for="d in col.cards"
                :key="d.id"
                class="deal"
                :class="{ 'deal--dragging': draggingId === d.id, 'deal--locked': d.stage === 'Won' }"
                role="button" tabindex="0" :draggable="d.stage !== 'Won'"
                :aria-label="`${d.name}. ${t('Press M to move stage, Enter to preview.')}`"
                @dragstart="onDragStart(d)"
                @dragend="onDragEnd"
                @click="openPreview(d)"
                @keydown="onCardKey($event, d)"
              >
                <div class="deal__head">
                  <p v-if="cardFieldOn('company')" class="deal__company">{{ d.company }}</p>
                  <p v-if="cardFieldOn('dealName')" class="deal__name">{{ d.name }}</p>
                  <p v-if="cardFieldOn('contactPerson') && d.picName" class="deal__sub">{{ d.picName }}</p>
                </div>
                <div v-if="cardFieldOn('dealValue')" class="deal__value">{{ formatMoney(dealExpectedValue(d), d.currency) }}</div>
                <p v-if="cardFieldOn('closeDate') && d.expectedCloseDate" class="deal__sub">{{ d.expectedCloseDate }}</p>
                <p v-if="cardFieldOn('memo') && d.notes" class="deal__sub deal__note">{{ d.notes }}</p>
                <span v-if="cardFieldOn('owner')" class="deal__owner">
                  <span class="deal__avatar" :style="ownerAvatarStyle(d.owner)">{{ ownerInitials(d.owner) }}</span>
                  {{ d.owner }}
                </span>
                <div v-if="dealPipelineDisplay.showAging && isDealOpen(d)" class="deal__foot deal__foot--end" data-devchange="crm-aging-always-bottom-right">
                  <span class="deal__aging" :class="`deal__aging--${agingTone(agingDays(d))}`" :title="`${t('Open for')} ${agingDays(d)} ${t('days')}`">{{ agingDays(d) }}d</span>
                </div>
              </article>
              <p v-if="!col.cards.length" class="kcol__empty">{{ t('No deals') }}</p>
            </div>
            <footer v-if="activeViewDisplay.stageTotal" class="kcol__foot">
              <span class="kcol__total-k">{{ t('Total:') }}</span>
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
        :filter-empty-label="t('deal')"
        has-checkbox
        :bulk-label="t('deal')"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @clear-filters="clearFilters"
        @hide-column="hideColumn"
        @selection-change="(count: number) => (selectedCount = count)"
      >
        <template #cell-id="{ row }">
          <span class="cc-id-cell">
            <span class="cell-link cell-text cc-num" @click.stop="goDetail(asDeal(row).id)">{{ dealNo(asDeal(row).id) }}</span>
            <ErpStatusBadge v-if="asDeal(row).archived" status="archived" badge-for="tableStatus" size="sm" />
          </span>
        </template>

        <template #cell-name="{ row }">
          <span class="cell-link cell-text" @click.stop="goDetail(asDeal(row).id)">{{ asDeal(row).name }}</span>
        </template>

        <template #cell-company="{ row }">
          <span class="cell-link cell-text" @click.stop="goCustomer(asDeal(row).customerId)">{{ asDeal(row).company }}</span>
        </template>

        <template #cell-contactPerson="{ row }">
          <span class="cc-contact-cell">
            <span class="cell-text">{{ asDeal(row).contacts?.[0]?.name || '—' }}</span>
            <span v-if="asDeal(row).contacts?.[0]?.email" class="cc-sub cell-text">{{ asDeal(row).contacts?.[0]?.email }}</span>
          </span>
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
          <MpPopover :id="`deal-actions-${asDeal(row).id}`" use-portal :is-keep-alive="false" placement="bottom-end" @close="closeStagePicker" v-slot="{ onClosePopover }">
            <MpPopoverTrigger>
              <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
            </MpPopoverTrigger>
            <MpPopoverContent class="erp-dropdown-menu">
              <!-- Change stage swaps this SAME popover's content — no modal (rule/dnd… see CLAUDE.md). -->
              <div v-if="stagePicker.mode === 'row' && stagePicker.ids[0] === asDeal(row).id" class="stage-picker">
                <button type="button" class="stage-picker-back" @click="closeStagePicker()"><MpIcon name="chevrons-left" size="sm" />{{ t('Change stage') }}</button>
                <button
                  v-for="s in stageOptionsFor(stagePicker.ids)" :key="s" type="button" class="stage-picker-item"
                  @click="pickStage(s); if (!stagePicker.mode) onClosePopover()"
                >{{ t(dealStageLabel(s)) }}</button>
                <div v-if="stagePicker.awaitingLostReason" class="stage-picker-lost">
                  <span class="stage-picker-lost-label">{{ t('Lost reason') }}</span>
                  <textarea v-model="stagePicker.lostReason" class="stage-picker-textarea" rows="2" @input="stagePicker.error = ''" />
                  <span v-if="stagePicker.error" class="stage-picker-err">{{ stagePicker.error }}</span>
                  <div class="stage-picker-lost-actions">
                    <button type="button" class="btn-enterprise btn-enterprise--ghost btn-enterprise--sm" @click="cancelLostReason()">{{ t('Cancel') }}</button>
                    <button type="button" class="btn-enterprise btn-enterprise--primary btn-enterprise--sm" @click="confirmLostReason(); if (!stagePicker.mode) onClosePopover()">{{ t('Confirm') }}</button>
                  </div>
                </div>
              </div>
              <template v-else>
                <MpPopoverList>
                  <MpPopoverListItem @click="goDetail(asDeal(row).id); onClosePopover()">{{ t('View details') }}</MpPopoverListItem>
                  <template v-if="!asDeal(row).archived">
                    <MpPopoverListItem @click="openEdit(asDeal(row)); onClosePopover()">{{ t('Edit') }}</MpPopoverListItem>
                    <MpPopoverListItem @click="openRowStagePicker(asDeal(row))">{{ t('Change stage') }}</MpPopoverListItem>
                    <MpPopoverListItem
                      v-if="asDeal(row).conversion === 'none' && asDeal(row).products?.length"
                      @click="onConvert(asDeal(row)); onClosePopover()"
                    >{{ t('Create') }} {{ dealConversionTarget }}</MpPopoverListItem>
                  </template>
                </MpPopoverList>
                <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
                <MpPopoverList>
                  <MpPopoverListItem v-if="asDeal(row).archived" @click="onRestore(asDeal(row)); onClosePopover()">{{ t('Restore') }}</MpPopoverListItem>
                  <MpPopoverListItem v-else @click="askArchive(asDeal(row)); onClosePopover()">{{ t('Archive') }}</MpPopoverListItem>
                  <MpPopoverListItem @click="askDelete(asDeal(row)); onClosePopover()">{{ t('Delete') }}</MpPopoverListItem>
                </MpPopoverList>
              </template>
            </MpPopoverContent>
          </MpPopover>
        </template>

        <!-- Bulk "Actions" dropdown — Change stage, Change owner, Archive, Delete
             (mirrors the Contacts pattern). Change stage swaps the popover content
             in place, same as the row kebab — never a separate modal. -->
        <template #bulk-actions="{ selectedRows, deselectAll }">
          <MpPopover id="deal-bulk-actions" use-portal :is-keep-alive="false" placement="bottom-start" @close="closeStagePicker" v-slot="{ onClosePopover }">
            <MpPopoverTrigger>
              <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent class="erp-dropdown-menu">
              <div v-if="stagePicker.mode === 'bulk'" class="stage-picker">
                <button type="button" class="stage-picker-back" @click="closeStagePicker()"><MpIcon name="chevrons-left" size="sm" />{{ t('Change stage') }}</button>
                <button
                  v-for="s in stageOptionsFor(stagePicker.ids)" :key="s" type="button" class="stage-picker-item"
                  @click="pickStage(s); if (!stagePicker.mode) onClosePopover()"
                >{{ t(dealStageLabel(s)) }}</button>
                <div v-if="stagePicker.awaitingLostReason" class="stage-picker-lost">
                  <span class="stage-picker-lost-label">{{ t('Lost reason') }}</span>
                  <textarea v-model="stagePicker.lostReason" class="stage-picker-textarea" rows="2" @input="stagePicker.error = ''" />
                  <span v-if="stagePicker.error" class="stage-picker-err">{{ stagePicker.error }}</span>
                  <div class="stage-picker-lost-actions">
                    <button type="button" class="btn-enterprise btn-enterprise--ghost btn-enterprise--sm" @click="cancelLostReason()">{{ t('Cancel') }}</button>
                    <button type="button" class="btn-enterprise btn-enterprise--primary btn-enterprise--sm" @click="confirmLostReason(); if (!stagePicker.mode) onClosePopover()">{{ t('Confirm') }}</button>
                  </div>
                </div>
              </div>
              <MpPopoverList v-else>
                <MpPopoverListItem @click="openBulkStagePicker(selectedIds(selectedRows as Set<number>))">{{ t('Change stage') }}</MpPopoverListItem>
                <MpPopoverListItem @click="openBulkOwner(selectedRows as Set<number>); onClosePopover()">{{ t('Change owner') }}</MpPopoverListItem>
                <MpPopoverListItem @click="askBulkArchive(selectedIds(selectedRows as Set<number>), deselectAll); onClosePopover()">{{ t('Archive') }}</MpPopoverListItem>
                <MpPopoverListItem @click="askBulkDelete(selectedIds(selectedRows as Set<number>), deselectAll); onClosePopover()">{{ t('Delete') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>

        <template #empty>
          <div class="cc-empty">
            <img :src="'/illustrations/empty-folder.png'" alt="" class="cc-empty-illustration" width="288" height="240" />
            <p class="cc-empty-title">{{ t('No deals') }}</p>
            <p class="cc-empty-desc">{{ t('Create a deal to start tracking an opportunity.') }}</p>
            <MpButton variant="secondary" is-rounded left-icon="add" @click="openCreate">{{ t('New deal') }}</MpButton>
          </div>
        </template>
      </ErpTablePage>
    </div>

    <!-- ── Quick-create drawer (full detail form is a page → /crm/deals/new) ── -->
    <CrmDealQuickCreateDrawer :open="quickOpen" @cancel="quickOpen = false" @saved="onQuickSaved" @open-full="onQuickOpenFull" />

    <!-- ── All filters drawer ── -->
    <CrmDealsFiltersDrawer
      id="deal-filters"
      v-model:is-open="filtersOpen"
      :model-value="appliedFilters"
      :columns="keywordColumns"
      :owner-options="ownerOptions"
      :customer-options="customerOptions"
      @apply="applyDrawerFilters"
    />

    <!-- ── Quick preview drawer ── -->
    <CrmDealPreviewDrawer
      :open="previewOpen"
      :deal="previewDeal"
      @close="previewOpen = false"
      @view-details="(id) => { previewOpen = false; goDetail(id) }"
      @edit="(d) => { previewOpen = false; openEdit(d) }"
      @move-stage="onPreviewMove"
      @archive="(d) => { previewOpen = false; askArchive(d) }"
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
      :title="t('Mark this deal as Won?')"
      :description="t('Won is a terminal stage — once set, the deal can’t move to another stage.')"
      :confirm-label="t('Mark as Won')"
      :is-danger="false"
      @confirm="confirmWon"
    />
    <ConfirmModal
      v-model:is-open="reopenConfirmOpen"
      :title="t('Reopen this lost deal?')"
      :description="t('The deal returns to an active ongoing stage and rejoins the pipeline.')"
      :confirm-label="t('Reopen deal')"
      :is-danger="false"
      @confirm="confirmReopen"
    />
    <ConfirmModal
      v-model:is-open="deleteConfirmOpen"
      :title="deleteConfirmTitle"
      :description="t('Deleted deal cannot be restored.')"
      :confirm-label="t('Delete deal')"
      @confirm="confirmDelete"
    />
    <ConfirmModal
      v-model:is-open="archiveConfirmOpen"
      :title="archiveConfirmTitle"
      :description="archiveConfirmDescription"
      :confirm-label="t('Archive')"
      :is-danger="false"
      @confirm="confirmArchive"
    />

    <!-- ── Import / Export ── -->
    <ImportSpreadsheetModal :open="importOpen" :title="t('Import deals')" @close="importOpen = false" @upload="onImportUpload" />
    <ExportModal
      :open="exportOpen"
      :title="t('Export deals')"
      :entity-label="t('deals')"
      :columns="exportColumns"
      :total="source.length"
      :selected-count="selectedCount"
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
.stat-card--bordered { border-right: 1px solid var(--mp-border-default, #e3e7e9); }
.stat-card:hover .stat-title { color: var(--mp-text-link); }
.stat-card--active .stat-title { color: var(--mp-text-link); font-weight: var(--mp-font-weights-semi-bold); }
.stat-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-amount--danger { color: var(--mp-text-danger); }
.stat-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; }

/* Optional report-backed metric pins — visually distinct extension row below
   the protected fixed cards, never mixed into that row. */
.cc-pinned-metrics { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-4); }
.pinned-metric-card { position: relative; display: flex; align-items: center; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md); }
.pinned-metric-body { display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: var(--mp-spacing-3) var(--mp-spacing-8) var(--mp-spacing-3) var(--mp-spacing-4); background: none; border: none; text-align: left; cursor: pointer; }
.pinned-metric-body:hover .stat-title { color: var(--mp-text-link); }
.pinned-metric-unpin { position: absolute; top: var(--mp-spacing-2); right: var(--mp-spacing-2); display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; border: none; background: none; cursor: pointer; color: var(--mp-text-secondary); border-radius: var(--mp-radii-md); }
.pinned-metric-unpin:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

/* ── Filter bar ── */
/* Scrolls with the list (not pinned) — the bar moves out of view as the user
   scrolls the deals table, per product direction. */
.cc-filterbar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding-top: var(--mp-spacing-5); padding-bottom: var(--mp-spacing-5); background: var(--mp-background-stage, #fff); }
/* "All filters" button (mirrors the ERP Sales Orders index). */
.filter-all-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #ffffff); border: 1px solid var(--mp-border-bold, #8c9596);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary);
  cursor: pointer; white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.filter-all-btn--active {
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-color: var(--mp-colors-border-bold, #8c9596);
  color: var(--mp-text-default);
}
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
/* Icon tools (Airene · Column settings · Export) sit in one MpButtonGroup at the
   group's default 8px gap (rule/filter-bar-icon-group + rule/btn-group-gap-8 — no
   flush/gap:0 override). */
.filter-btn-group { display: flex; align-items: center; }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }
@media (max-width: 640px) {
  .cc-filterbar { flex-wrap: wrap; }
  .cc-filterbar > :last-child { flex: 1 1 100%; }
}

/* Pill search */
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral, #ffffff); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.filter-search-input::placeholder { color: var(--mp-text-placeholder, #97a0af); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); border-radius: var(--mp-radii-full, 999px); }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); color: var(--mp-icon-default, #536062); }

/* ── Table cell helpers ── */
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cell-link { color: var(--mp-text-link); cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cc-sub { display: block; margin-top: 1px; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cc-num { font-variant-numeric: tabular-nums; color: var(--mp-text-secondary); }
.cc-id-cell { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.cc-contact-cell { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.cc-muted { color: var(--mp-text-subtle, #97a0af); }
.deal-attention { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-warning, #b54708); }

/* Change-stage popover sub-view — swaps in place inside the row/bulk Actions
   popover instead of opening a separate modal (rule/dnd... see CLAUDE.md /
   docs/design/RULES.md: Change stage is always a popover, never a modal). */
.stage-picker { display: flex; flex-direction: column; padding: var(--mp-spacing-1) 0; min-width: 200px; }
.stage-picker-back {
  display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: none; background: transparent; cursor: pointer; text-align: left;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary, #536062);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9); margin-bottom: var(--mp-spacing-1);
}
.stage-picker-back:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.stage-picker-item {
  display: block; width: 100%; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: none; background: transparent; cursor: pointer; text-align: left;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.stage-picker-item:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.stage-picker-lost { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); border-top: 1px solid var(--mp-border-default, #e3e7e9); margin-top: var(--mp-spacing-1); }
.stage-picker-lost-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.stage-picker-textarea { width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2); border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16)); border-radius: var(--mp-radii-md, 6px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; resize: vertical; min-height: 56px; font-family: inherit; }
.stage-picker-textarea:focus { border-color: var(--mp-border-bold, #8c9596); box-shadow: 0 0 0 3px var(--mp-background-neutral-hovered, rgba(140, 149, 150, 0.24)); }
.stage-picker-err { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c9372c); }
.stage-picker-lost-actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); }

/* ── Kanban board (swimlanes fill the stage height) ── */
.kanban { flex: 1; min-height: 0; overflow-x: auto; overflow-y: hidden; padding-bottom: var(--mp-spacing-3); }
.kanban__board { display: flex; gap: var(--mp-spacing-4); align-items: stretch; min-height: 100%; height: 100%; }
.kcol { flex: 0 0 288px; width: 288px; display: flex; flex-direction: column; min-height: 0; background: var(--mp-background-neutral-subtle, #f4f5f7); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: 12px; transition: background 0.12s ease, border-color 0.12s ease; }
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
.deal { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: 8px; cursor: pointer; }
.deal:hover { border-color: var(--mp-border-bold, #8c9596); }
.deal:focus-visible { outline: 2px solid var(--mp-border-brand, #0a6e4e); outline-offset: 1px; }
.deal--locked { cursor: pointer; }
.deal--locked:active { cursor: pointer; }
.deal:not(.deal--locked):active { cursor: grabbing; }
.deal--dragging { opacity: 0.45; }
.deal__head { display: flex; flex-direction: column; gap: 2px; }
.deal__company { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__name { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__sub { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__note { white-space: normal; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
/* Color stage columns (module setting) — tint by outcome. */
.kcol--won  { background: var(--mp-colors-background-brand-subtle, #eafaf1); border-color: var(--mp-colors-border-selected, #029861); }
.kcol--lost { background: var(--mp-colors-background-critical-subtle, #fdeceb); border-color: var(--mp-colors-border-danger, #dc2626); }
.kcol--open { background: var(--mp-colors-background-information-subtle, #eaf1fb); border-color: var(--mp-colors-border-information, #2f6fd0); }
.deal__value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.deal__foot { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.deal__foot--end { justify-content: flex-end; }
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
