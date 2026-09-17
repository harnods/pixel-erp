<script setup lang="ts">
/**
 * Credit Memo Detail Report — Reports › Sales › Credit Memo.
 * PRD "[PRD] Credit Memo Report" (Accounts Receivable — Credit Memo) + Figma
 * 4531-72196.
 *
 * A read-only, date-filtered report grouped by customer (expanded by default).
 * Each customer lists its credit memos with a status badge (Active / Sebagian /
 * Habis) and remaining balance; clicking a CM expands its transaction history
 * inline (Saldo Awal → mutations: Issued/Applied/Refund/Reversal → running
 * balance, with linked transaction numbers), matching the approved Figma. Date
 * presets (Bulan Ini / Bulan Lalu / Kuartal Ini / Tahun Ini) + range validation,
 * a "Tampilkan CM habis" zero-balance toggle, a Customer + Transaction-type
 * filter drawer, saved views, always-async Excel export, and a table-only
 * full-screen mode.
 */
import { ref, computed, reactive, watch, nextTick, onBeforeUnmount } from 'vue'
import { useReportFullscreen } from '~/composables/useReportFullscreen'
import { useAireneBridge } from '~/composables/useAireneBridge'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import {
  MpButton, MpIcon, MpTooltip, MpToggle, MpSkeleton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpBanner, MpBannerIcon, MpBannerTitle, css,
} from '@mekari/pixel3'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import CreditMemoFiltersDrawer, { type CmDrawerValue } from '~/components/patterns/CreditMemoFiltersDrawer.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast, successToast } from '~/utils/toasts'
import {
  creditMemoReport, historyRows, remainingOf, statusOf, cmCustomerNames,
  creditMemoViews, addCmView, updateCmView, deleteCmView, emptyCmReportFilters,
  type CreditMemo, type CmReportFilters, type CmMutationType, type CmStatus, type CmSavedView,
} from '~/data/creditMemoReport'

const router = useRouter()

// ── Date range + presets + validation ────────────────────────────────────────
function d(y: number, m: number, day: number) { return new Date(y, m, day) }
const pendingRange = ref<Date[]>([d(2026, 7, 1), d(2026, 7, 31)])
const appliedRange = ref<Date[]>([d(2026, 7, 1), d(2026, 7, 31)])
const rangeError = ref('')

// Presets (This month / This quarter / Per month / Per year / Custom) live inside
// the AdvancedDateRangePicker via its `period-mode`, so the page has no chips.
function monthsBetween(a: Date, b: Date) { return (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) }
function applyReport() {
  const [s, e] = pendingRange.value
  if (!s || !e) { rangeError.value = 'Start and end dates are required.'; return }
  if (s > e) { rangeError.value = 'Start date cannot be after end date.'; return }
  if (monthsBetween(s, e) > 24) { rangeError.value = 'Date range cannot exceed 24 months.'; return }
  rangeError.value = ''
  appliedRange.value = [...pendingRange.value]
  generate()
}
// Picking a date/preset only updates the pending range — the report is generated
// only when the user clicks Apply.
function onPendingChange(v: Date[]) { pendingRange.value = v; rangeError.value = '' }

// ── Report generation state — idle (empty prompt) → loading (skeleton) → ready ─
// The page starts empty; the report is only generated after the user applies a
// period or filters. Skeleton follows the ErpTablePage convention (~1.1s).
const reportState = ref<'idle' | 'loading' | 'ready'>('idle')
let genTimer: ReturnType<typeof setTimeout> | null = null
function generate() {
  reportState.value = 'loading'
  if (genTimer) clearTimeout(genTimer)
  genTimer = setTimeout(() => { reportState.value = 'ready' }, 1100)
}
onBeforeUnmount(() => { if (genTimer) clearTimeout(genTimer) })

const STATUS_LABELS: Record<CmStatus, string> = { Active: 'Active', Sebagian: 'Partial', Habis: 'Used up' }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtRangeDay(x: Date) { return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}` }
const rangeCaption = computed(() => { const [s, e] = appliedRange.value; return s && e ? `${fmtRangeDay(s)} - ${fmtRangeDay(e)}` : '' })
const lastUpdated = 'Last updated on 1 Sep 2026, 09:00 (GMT+7)'
// Future end-date is capped at today; show an informational banner.
const futureCapped = computed(() => { const e = appliedRange.value[1]; return !!e && e > new Date() })

// ── Filters (customer + transaction type) + zero-balance toggle ───────────────
const filters = reactive<CmReportFilters>(emptyCmReportFilters())
const drawerOpen = ref(false)
function onApplyFilters(v: CmDrawerValue) { filters.keyword = v.keyword; filters.keywordColumn = v.keywordColumn; filters.customerComparator = v.customerComparator; filters.customers = [...v.customers]; filters.txnTypes = [...v.txnTypes]; generate() }
function toggleZero() { filters.showZero = !filters.showZero }
const activeFilterCount = computed(() => filters.customers.length + filters.txnTypes.length + (filters.keyword ? 1 : 0))
const TXN_LABELS: Record<CmMutationType, string> = { Issued: 'Credit memo issued', Applied: 'Credit memo applied', Refund: 'Credit memo refund', Reversal: 'Credit memo reversal' }
function removeCustomer(name: string) { filters.customers = filters.customers.filter((c) => c !== name) }
function removeTxnType(t: CmMutationType) { filters.txnTypes = filters.txnTypes.filter((x) => x !== t) }
function resetFilters() { filters.keyword = ''; filters.keywordColumn = 'all'; filters.customerComparator = 'isAnyOf'; filters.customers = []; filters.txnTypes = [] }  // preserves date range

// ── Saved views (Default + user views) ────────────────────────────────────────
const activeViewId = ref('default')
function selectView(id: string) {
  activeViewId.value = id
  const v = creditMemoViews.find((x) => x.id === id)
  if (v) {
    const f = { ...emptyCmReportFilters(), ...v.filters }
    filters.keyword = f.keyword; filters.keywordColumn = f.keywordColumn; filters.customerComparator = f.customerComparator
    filters.customers = [...f.customers]; filters.txnTypes = [...f.txnTypes]; filters.showZero = f.showZero
  } else { resetFilters(); filters.showZero = false }
  // Opening a view applies its saved filters and immediately shows its report.
  generate()
}
// Add view — the new tab becomes an inline text field you type the name into.
const addingView = ref(false)
const newViewName = ref('')
const newViewInput = ref<HTMLInputElement | null>(null)
function startAddView() { addingView.value = true; newViewName.value = ''; nextTick(() => newViewInput.value?.focus()) }
function commitAddView() {
  if (!addingView.value) return
  const name = newViewName.value.trim()
  addingView.value = false
  if (!name) return
  const v = addCmView({ name, filters: { keyword: filters.keyword, keywordColumn: filters.keywordColumn, customerComparator: filters.customerComparator, customers: [...filters.customers], txnTypes: [...filters.txnTypes], showZero: filters.showZero } })
  activeViewId.value = v.id
  successToast('View saved')
}
function cancelAddView() { addingView.value = false }

// Edit a saved view's name inline (via its [...] menu).
const editingViewId = ref('')
const editViewName = ref('')
function startEditView(v: CmSavedView) {
  editingViewId.value = v.id; editViewName.value = v.name
  nextTick(() => { const el = document.querySelector('.cmr-view-edit') as HTMLInputElement | null; el?.focus(); el?.select() })
}
function commitEditView() {
  if (!editingViewId.value) return
  const name = editViewName.value.trim()
  const id = editingViewId.value
  editingViewId.value = ''
  if (name) { updateCmView(id, { name }); successToast('View renamed') }
}
function cancelEditView() { editingViewId.value = '' }

// Delete a saved view — with a confirmation alert.
const delViewOpen = ref(false)
const delViewTarget = ref<CmSavedView | null>(null)
function askDeleteView(v: CmSavedView) { delViewTarget.value = v; delViewOpen.value = true }
function confirmDeleteView() {
  const v = delViewTarget.value; if (!v) return
  deleteCmView(v.id)
  if (activeViewId.value === v.id) activeViewId.value = 'default'
  delViewTarget.value = null
  successToast('View deleted')
}

// ── Columns ───────────────────────────────────────────────────────────────────
const COLUMNS = [
  { key: 'date', label: 'Date', right: false }, { key: 'number', label: 'Number', right: false }, { key: 'description', label: 'Description', right: false },
  { key: 'status', label: 'Status', right: false }, { key: 'movement', label: 'Movement', right: true }, { key: 'balance', label: 'Balance', right: true },
]
const colVis = reactive<Record<string, boolean>>(Object.fromEntries(COLUMNS.map((c) => [c.key, true])))
const columnItems = COLUMNS.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 || i === COLUMNS.length - 1 }))
const show = (k: string) => colVis[k] !== false
const visibleColumns = computed(() => COLUMNS.filter((c) => show(c.key)))
const visibleLeadSpan = computed(() => COLUMNS.filter((c) => show(c.key)).length - (show('balance') ? 1 : 0))

// ── Rows (report query + date-window gate) ────────────────────────────────────
// Seed activity lives in Dec 2025; the report is empty for periods that don't
// overlap it (a believable "no activity" result for other ranges).
function overlapsSeed() { const [s, e] = appliedRange.value; return !!s && !!e && s <= d(2026, 7, 31) && e >= d(2026, 7, 1) }
const groups = computed(() => (overlapsSeed() ? creditMemoReport(filters) : []))
// Would there be rows if the zero-balance toggle were ON? (drives the empty-state hint)
const groupsWithZero = computed(() => (overlapsSeed() ? creditMemoReport({ ...filters, showZero: true }) : []))

const emptyReason = computed<'none' | 'no-activity' | 'all-zero' | 'filter'>(() => {
  if (groups.value.length) return 'none'
  if (activeFilterCount.value) return 'filter'
  if (!filters.showZero && groupsWithZero.value.length) return 'all-zero'
  return 'no-activity'
})

// ── Expand / collapse — customers open; transaction history collapsed (Case 2) ─
const openCustomers = ref<Set<string>>(new Set(creditMemoReport({ ...emptyCmReportFilters(), showZero: true }).map((c) => c.id)))
const openMemos = ref<Set<string>>(new Set())
const isCustomerOpen = (id: string) => openCustomers.value.has(id)
const isMemoOpen = (id: string) => openMemos.value.has(id)
function toggleCustomer(id: string) { const s = new Set(openCustomers.value); s.has(id) ? s.delete(id) : s.add(id); openCustomers.value = s }
function toggleMemo(id: string) { const s = new Set(openMemos.value); s.has(id) ? s.delete(id) : s.add(id); openMemos.value = s }
const allCollapsed = computed(() => groups.value.length > 0 && groups.value.every((g) => !openCustomers.value.has(g.id)))
function toggleAll() {
  if (allCollapsed.value) openCustomers.value = new Set(groups.value.map((g) => g.id))
  else { openCustomers.value = new Set(); openMemos.value = new Set() }
}

// ── Full screen (also hides the layout header + sidebar for a full-width stage) ─
const fullscreen = ref(false)
const { isReportFullscreen } = useReportFullscreen()
watch(fullscreen, (v) => { isReportFullscreen.value = v })
onBeforeUnmount(() => { isReportFullscreen.value = false })

// ── Airene — open the panel already grounded on THIS report's data ────────────
const aireneBridge = useAireneBridge()
const AIRENE_SUGGESTIONS = [
  'Which customer has the most usable credit memo balance?',
  'What is the total outstanding credit memo balance?',
  'Which credit memos are fully used?',
  'Summarise this report in 3 bullets',
]
function buildReportGround(): string {
  const filt: string[] = []
  if (filters.customers.length) filt.push(`customers: ${filters.customers.join(', ')}`)
  if (filters.txnTypes.length) filt.push(`transaction types: ${filters.txnTypes.join(', ')}`)
  if (filters.showZero) filt.push('including fully-used (zero-balance) CMs')
  const lines = groups.value.map((g) => {
    const cms = g.cms.map((cm) => `${cm.cmNumber} remaining ${formatIDR(remainingOf(cm))} (${statusOf(cm)})`).join('; ')
    return `- ${g.name}: total usable ${formatIDR(g.total)}, ${g.activeCount} active credit memo — ${cms}`
  })
  return `Credit Memo Detail Report (Reports › Sales › Credit Memo), IDR, read-only. `
    + `Period ${rangeCaption.value}.${filt.length ? ' Filters — ' + filt.join('; ') + '.' : ''}\n`
    + `Customers ranked by usable credit memo balance (descending):\n${lines.join('\n')}\n`
    + `"Usable/remaining" is credit memo balance still available; "Habis" = fully used; Movement negatives are applications/refunds.`
}
function openAirene() {
  aireneBridge.openWithContext(buildReportGround(), 'Credit Memo report', AIRENE_SUGGESTIONS)
}

// ── Export (always async — PRD TS-03) ─────────────────────────────────────────
const exporting = ref(false)
function exportExcel() {
  if (exporting.value) return
  exporting.value = true
  infoToast('Your file is being prepared. You’ll be notified when it’s ready to download.')
  // Simulate the async job → in-app notification → download link.
  window.setTimeout(() => {
    exporting.value = false
    const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    // Sheet 1 — Customer Summary
    const lines = ['Customer summary', ['Customer', 'Active credit memo', 'Total Remaining Balance', 'Currency'].join(',')]
    for (const g of groups.value) lines.push([g.name, g.activeCount, g.total, 'IDR'].map(esc).join(','))
    // Sheet 2 — CM Detail
    lines.push('', 'Credit memo detail', ['Customer', 'Credit memo number', 'Date', 'Type', 'Transaction No.', 'Description', 'Movement', 'Balance', 'Currency'].join(','))
    for (const g of groups.value) for (const cm of g.cms) for (const r of historyRows(cm)) {
      lines.push([g.name, cm.cmNumber, r.date, r.type, r.transactionNo ?? '', r.description ?? '', r.movement ?? '', r.balance, 'IDR'].map(esc).join(','))
    }
    const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'credit-memo-report.csv'; a.click(); URL.revokeObjectURL(a.href)
    successToast('File ready to download')
  }, 1600)
}

// ── Status badge (Active / Sebagian / Habis) ──────────────────────────────────
function statusClass(s: CmStatus) { return s === 'Active' ? 'cmr-badge cmr-badge--active' : s === 'Sebagian' ? 'cmr-badge cmr-badge--partial' : 'cmr-badge cmr-badge--used' }
function typeClass(t: CmMutationType) { return t === 'Issued' || t === 'Reversal' ? 'cmr-type cmr-type--pos' : 'cmr-type cmr-type--neg' }
function openTxn(no: string) { infoToast(`Opening ${no}`) }
</script>

<template>
  <div class="cmr" :class="{ 'cmr--full': fullscreen }">
    <!-- ── Title bar ── -->
    <header v-if="!fullscreen" class="cmr-titlebar">
      <div class="cmr-titlebar-left">
        <button class="cmr-breadcrumb" type="button" @click="router.push('/sales-report')">Sales</button>
        <h1 class="cmr-title">Credit Memo <span class="cmr-title-cur">(IDR)</span></h1>
      </div>
    </header>

    <div class="cmr-stage">
      <!-- ── Controls: As-of date + presets + Apply + All filters | AI · columns · Export ── -->
      <div v-if="!fullscreen" class="cmr-controls">
        <div class="cmr-controls-left">
          <div class="cmr-datefield">
            <label class="cmr-date-label">As of date</label>
            <AdvancedDateRangePicker id="cmr-date" :model-value="pendingRange" is-full-width hide-label period-mode placeholder="Select date" @update:model-value="onPendingChange" />
          </div>
          <MpButton variant="primary" is-rounded @click="applyReport">Apply</MpButton>
          <MpButton variant="secondary" is-rounded left-icon="filter" class="cmr-allfilters" @click="drawerOpen = true">
            All filters<span v-if="activeFilterCount" class="cmr-allfilters-count">{{ activeFilterCount }}</span>
          </MpButton>
        </div>
        <div class="cmr-controls-right">
          <MpTooltip id="cmr-refresh" label="Refresh report" placement="bottom" use-portal>
            <button class="cmr-icon-btn" type="button" aria-label="Refresh report" @click="applyReport"><MpIcon name="refresh" size="md" /></button>
          </MpTooltip>
          <MpButton variant="secondary" is-rounded @click="exportExcel">Export to Excel</MpButton>
        </div>
      </div>

      <!-- Zero-balance toggle -->
      <div v-if="!fullscreen" class="cmr-presetbar">
        <label class="cmr-zerotoggle">
          <MpToggle id="cmr-zero" :is-checked="filters.showZero" @change="toggleZero" />
          <span>Show fully-used credit memos</span>
        </label>
      </div>
      <p v-if="!fullscreen && rangeError" class="cmr-range-error">{{ rangeError }}</p>

      <!-- Active-filter badges (customer + transaction type only) -->
      <div v-if="!fullscreen && activeFilterCount" class="cmr-badges">
        <span v-if="filters.keyword" class="cmr-fbadge cmr-fbadge--dismiss">“{{ filters.keyword }}”<button type="button" aria-label="Remove" @click="filters.keyword = ''"><MpIcon name="close" size="sm" /></button></span>
        <span v-for="c in filters.customers" :key="`c-${c}`" class="cmr-fbadge cmr-fbadge--dismiss">{{ c }}<button type="button" aria-label="Remove" @click="removeCustomer(c)"><MpIcon name="close" size="sm" /></button></span>
        <span v-for="tt in filters.txnTypes" :key="`t-${tt}`" class="cmr-fbadge cmr-fbadge--dismiss">{{ TXN_LABELS[tt] }}<button type="button" aria-label="Remove" @click="removeTxnType(tt)"><MpIcon name="close" size="sm" /></button></span>
        <button v-if="activeFilterCount" class="cmr-reset" type="button" @click="resetFilters">Reset Filter</button>
      </div>

      <!-- ── View tabs ── -->
      <div v-if="!fullscreen" class="cmr-viewbar">
        <div class="cmr-views">
          <button class="cmr-viewtab" :class="{ 'is-active': activeViewId === 'default' }" type="button" @click="selectView('default')">Default view</button>

          <template v-for="v in creditMemoViews" :key="v.id">
            <!-- Renaming this view inline -->
            <span v-if="editingViewId === v.id" class="cmr-viewtab cmr-viewtab--editing">
              <input v-model="editViewName" class="cmr-viewtab-input cmr-view-edit" @keydown.enter.prevent="commitEditView" @keydown.esc="cancelEditView" @blur="commitEditView" />
            </span>
            <!-- Saved view tab + [...] menu (Edit name / Delete) -->
            <span v-else class="cmr-viewtab-wrap">
              <button class="cmr-viewtab" :class="{ 'is-active': activeViewId === v.id }" type="button" @click="selectView(v.id)">{{ v.name }}</button>
              <MpPopover :id="`cmr-view-${v.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                <MpPopoverTrigger>
                  <button class="cmr-view-kebab" type="button" aria-label="View options"><MpIcon name="menu-kebab" size="sm" /></button>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
                  <MpPopoverList>
                    <MpPopoverListItem @click="startEditView(v)">Edit view name</MpPopoverListItem>
                    <MpPopoverListItem @click="askDeleteView(v)">Delete</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
            </span>
          </template>

          <!-- Add view — the new tab is an inline name field -->
          <span v-if="addingView" class="cmr-viewtab cmr-viewtab--editing">
            <input ref="newViewInput" v-model="newViewName" class="cmr-viewtab-input" placeholder="View name" @keydown.enter.prevent="commitAddView" @keydown.esc="cancelAddView" @blur="commitAddView" />
          </span>
          <button v-else class="cmr-addview" type="button" @click="startAddView"><MpIcon name="add" size="sm" /> Add view</button>
        </div>
        <div class="cmr-viewbar-right">
          <button v-if="reportState === 'ready' && groups.length" class="cmr-collapse-all" type="button" @click="toggleAll">{{ allCollapsed ? 'Expand all' : 'Collapse all' }}</button>
          <MpTooltip id="cmr-fs-enter" label="Full screen" placement="bottom" use-portal>
            <button class="cmr-fs-btn" type="button" aria-label="Full screen" @click="fullscreen = true"><MpIcon name="full-screen" size="md" /></button>
          </MpTooltip>
        </div>
      </div>

      <!-- ── Report ── -->
      <div class="cmr-report">
        <div v-if="fullscreen" class="cmr-fs-topbar">
          <span class="cmr-fs-title">Credit Memo <span class="cmr-title-cur">(IDR)</span></span>
          <MpTooltip id="cmr-fs-exit" label="Exit full screen" placement="bottom-end" use-portal>
            <button class="cmr-fs-btn" type="button" aria-label="Exit full screen" @click="fullscreen = false"><MpIcon name="minimize" size="md" /></button>
          </MpTooltip>
        </div>

        <!-- Idle — no report generated yet -->
        <div v-if="reportState === 'idle'" class="cmr-empty cmr-empty--idle">
          <img src="/illustrations/report-empty.png" alt="" class="cmr-empty-img" width="240" height="200" />
          <p class="cmr-empty-title">No report generated yet</p>
          <p class="cmr-empty-desc">Choose a period and click Apply to generate the Credit Memo report.</p>
        </div>

        <template v-else>
          <div class="cmr-report-head">
            <span class="cmr-report-range">{{ rangeCaption }}</span>
            <span class="cmr-report-updated">{{ lastUpdated }}</span>
          </div>
          <MpBanner v-if="futureCapped" id="cmr-cap" variant="info" class="cmr-info-banner">
            <MpBannerIcon id="cmr-cap-icon" />
            <MpBannerTitle id="cmr-cap-title">Showing data up to today.</MpBannerTitle>
          </MpBanner>

          <!-- Loading skeleton (3 solid rows, ErpTablePage convention) -->
          <div v-if="reportState === 'loading'" class="cmr-table-wrap">
            <table class="cmr-table">
              <colgroup>
                <col v-if="show('date')" class="cmr-col-date" /><col v-if="show('number')" class="cmr-col-number" /><col v-if="show('description')" class="cmr-col-desc" />
                <col v-if="show('status')" class="cmr-col-status" /><col v-if="show('movement')" class="cmr-col-movement" /><col v-if="show('balance')" class="cmr-col-balance" />
              </colgroup>
              <thead>
                <tr><th v-for="c in visibleColumns" :key="c.key" class="cmr-th" :class="{ 'cmr-th--right': c.right }">{{ c.label }}</th></tr>
              </thead>
              <tbody>
                <tr v-for="n in 3" :key="n" class="cmr-row">
                  <td v-for="c in visibleColumns" :key="c.key" class="cmr-td" :class="{ 'cmr-td--right': c.right }">
                    <MpSkeleton class="cmr-skel" height="14px" rounded="sm" duration="0s" :width="c.right ? '72px' : '120px'" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Ready + data -->
          <div v-else-if="groups.length" class="cmr-table-wrap">
            <table class="cmr-table">
              <colgroup>
                <col v-if="show('date')" class="cmr-col-date" />
                <col v-if="show('number')" class="cmr-col-number" />
                <col v-if="show('description')" class="cmr-col-desc" />
                <col v-if="show('status')" class="cmr-col-status" />
                <col v-if="show('movement')" class="cmr-col-movement" />
                <col v-if="show('balance')" class="cmr-col-balance" />
              </colgroup>
              <thead>
                <tr>
                  <th v-if="show('date')" class="cmr-th">Date</th>
                  <th v-if="show('number')" class="cmr-th">Number</th>
                  <th v-if="show('description')" class="cmr-th">Description</th>
                  <th v-if="show('status')" class="cmr-th">Status</th>
                  <th v-if="show('movement')" class="cmr-th cmr-th--right">Movement</th>
                  <th v-if="show('balance')" class="cmr-th cmr-th--right">Balance</th>
                </tr>
              </thead>
              <tbody v-for="g in groups" :key="g.id">
              <!-- Customer (L1) -->
              <tr class="cmr-row cmr-row--group" @click="toggleCustomer(g.id)">
                <td class="cmr-td cmr-td--group" :colspan="visibleLeadSpan">
                  <span class="cmr-lead cmr-lead--l1">
                    <MpIcon :name="isCustomerOpen(g.id) ? 'caret-down' : 'caret-right'" size="sm" class="cmr-chev" />
                    <span class="cmr-customer">{{ g.name }}</span>
                    <span class="cmr-cmcount">{{ g.activeCount }} active credit memo</span>
                  </span>
                </td>
                <td v-if="show('balance')" class="cmr-td cmr-td--right cmr-td--group cmr-strong">{{ formatIDR(g.total) }}</td>
              </tr>

              <template v-if="isCustomerOpen(g.id)">
                <template v-for="cm in g.cms" :key="cm.id">
                  <!-- Credit Memo (L2) — click to open transaction history -->
                  <tr class="cmr-row cmr-row--memo" @click="toggleMemo(cm.id)">
                    <td v-if="show('date')" class="cmr-td">
                      <span class="cmr-lead cmr-lead--l2">
                        <MpIcon :name="isMemoOpen(cm.id) ? 'caret-down' : 'caret-right'" size="sm" class="cmr-chev" />
                        <span>{{ formatDate(cm.issueDate) }}</span>
                      </span>
                    </td>
                    <td v-if="show('number')" class="cmr-td">{{ cm.cmNumber }}</td>
                    <td v-if="show('description')" class="cmr-td cmr-muted">Original {{ formatIDR(cm.originalAmount) }}</td>
                    <td v-if="show('status')" class="cmr-td"><span :class="statusClass(statusOf(cm))">{{ STATUS_LABELS[statusOf(cm)] }}</span></td>
                    <td v-if="show('movement')" class="cmr-td cmr-td--right" />
                    <td v-if="show('balance')" class="cmr-td cmr-td--right">{{ formatIDR(remainingOf(cm)) }}</td>
                  </tr>

                  <!-- Transaction history (L3): Saldo Awal → mutations -->
                  <template v-if="isMemoOpen(cm.id)">
                    <tr v-for="r in historyRows(cm)" :key="r.id" class="cmr-row cmr-row--txn">
                      <td v-if="show('date')" class="cmr-td cmr-applied-date">{{ r.type === 'Saldo Awal' ? '' : formatDate(r.date) }}</td>
                      <td v-if="show('number')" class="cmr-td cmr-td--l3">
                        <template v-if="r.type === 'Saldo Awal'"><span class="cmr-saldo-awal">Beginning balance</span></template>
                        <template v-else>
                          <span :class="typeClass(r.type as CmMutationType)">{{ r.type }}</span>
                          <a class="cmr-txn-link" @click.stop="openTxn(r.transactionNo!)">{{ r.transactionNo }}</a>
                        </template>
                      </td>
                      <td v-if="show('description')" class="cmr-td cmr-muted">{{ r.description }}</td>
                      <td v-if="show('status')" class="cmr-td" />
                      <td v-if="show('movement')" class="cmr-td cmr-td--right">
                        <span v-if="r.movement === null" />
                        <span v-else-if="r.movement < 0" class="cmr-neg">({{ formatIDR(Math.abs(r.movement)) }})</span>
                        <span v-else>{{ formatIDR(r.movement) }}</span>
                      </td>
                      <td v-if="show('balance')" class="cmr-td cmr-td--right">{{ formatIDR(r.balance) }}</td>
                    </tr>
                  </template>
                </template>

                <!-- End balance -->
                <tr class="cmr-row cmr-row--end">
                  <td class="cmr-td cmr-strong cmr-end-label" :colspan="visibleLeadSpan">End balance</td>
                  <td v-if="show('balance')" class="cmr-td cmr-td--right cmr-strong">{{ formatIDR(g.total) }}</td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>

          <!-- Ready, but no data — 3 variants (PRD US-CMR-005) -->
          <div v-else class="cmr-empty">
            <img src="/illustrations/empty-folder.png" alt="" class="cmr-empty-img" width="240" height="200" />
            <template v-if="emptyReason === 'filter'">
              <p class="cmr-empty-title">No data matches this filter.</p>
              <button class="cmr-empty-cta" type="button" @click="resetFilters">Reset Filter</button>
            </template>
            <template v-else-if="emptyReason === 'all-zero'">
              <p class="cmr-empty-title">All credit memos in this period are fully used.</p>
              <p class="cmr-empty-desc">Turn on "Show fully-used credit memos" to see them.</p>
            </template>
            <template v-else>
              <p class="cmr-empty-title">No active credit memo in this period.</p>
              <p class="cmr-empty-desc">Try adjusting the report date range.</p>
            </template>
          </div>
        </template>
      </div>
    </div>

    <!-- ── All filters drawer ── -->
    <CreditMemoFiltersDrawer
      id="cmr-filters"
      v-model:is-open="drawerOpen"
      :model-value="{ keyword: filters.keyword, keywordColumn: filters.keywordColumn, customerComparator: filters.customerComparator, customers: filters.customers, txnTypes: filters.txnTypes }"
      :customer-options="cmCustomerNames()"
      @apply="onApplyFilters"
    />

    <!-- ── Delete view confirmation ── -->
    <ConfirmModal
      v-model:is-open="delViewOpen"
      title="Delete view"
      :description="`“${delViewTarget?.name}” will be permanently deleted.`"
      confirm-label="Delete"
      cancel-label="Cancel"
      is-danger
      @confirm="confirmDeleteView"
    />
  </div>
</template>

<style scoped>
.cmr { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.cmr-titlebar { flex-shrink: 0; min-height: 72px; background: var(--mp-background-neutral-subtle, #f8f9f9); display: flex; align-items: center; padding: 0 var(--mp-spacing-6); }
.cmr-titlebar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; }
.cmr-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-link); font-family: inherit; }
.cmr-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.cmr-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.cmr-title-cur { font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }

.cmr-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); border-top-left-radius: var(--mp-radii-lg, 12px); padding: var(--mp-spacing-5, 20px) var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); display: flex; flex-direction: column; gap: var(--mp-spacing-3, 12px); }

.cmr-controls { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.cmr-controls-left { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); }
.cmr-controls-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
/* Flush icon-button group — mirrors the table filter bar's .filter-btn-group. */
.cmr-btn-group { display: flex; align-items: center; }
.cmr-datefield { display: flex; flex-direction: column; gap: var(--mp-spacing-1); width: 220px; }
.cmr-date-label { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }
.cmr-allfilters-count { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; margin-left: 2px; border-radius: 999px; background: var(--mp-background-brand-bold, #0a6e4e); color: #fff; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); }
.cmr-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default); }
.cmr-icon-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.cmr-icon-btn--airene { color: var(--mp-airene-default, #7c3aed); }

/* Presets + toggle */
.cmr-presetbar { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.cmr-zerotoggle { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer; }
.cmr-range-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c62828); }

/* Filter badges */
.cmr-badges { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.cmr-fbadge { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 var(--mp-spacing-2) 0 var(--mp-spacing-3); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle, #eceef0); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-default); }
.cmr-fbadge--dismiss button { display: inline-flex; align-items: center; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); padding: 0; }
.cmr-fbadge--dismiss button:hover { color: var(--mp-text-default); }
.cmr-reset { border: none; background: none; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); text-decoration: underline; text-underline-offset: 2px; }

/* View tabs */
.cmr-viewbar { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cmr-views { display: flex; align-items: center; gap: var(--mp-spacing-5); }
.cmr-viewtab { position: relative; border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); padding: var(--mp-spacing-3) 0; }
.cmr-viewtab:not(.is-active):hover { color: var(--mp-text-default); }
.cmr-viewtab.is-active { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); }
.cmr-viewtab.is-active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--mp-text-selected); border-radius: 2px 2px 0 0; }
.cmr-addview { display: inline-flex; align-items: center; gap: 4px; border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) 0; }
.cmr-addview:hover { color: var(--mp-text-link); }
.cmr-allviews { border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); padding: var(--mp-spacing-3) 0; text-decoration: underline; text-underline-offset: 2px; }
/* Saved view tab + its [...] menu */
.cmr-viewtab-wrap { display: inline-flex; align-items: center; gap: 2px; }
.cmr-viewtab-wrap .cmr-viewtab { padding-right: 0; }
/* Kebab reserves its width always (tab never reflows); only its visibility
   toggles — shown on hover, or while its menu is open (focus-within). */
.cmr-view-kebab { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); border-radius: var(--mp-radii-sm, 4px); visibility: hidden; }
.cmr-viewtab-wrap:hover .cmr-view-kebab,
.cmr-viewtab-wrap:focus-within .cmr-view-kebab { visibility: visible; }
.cmr-view-kebab:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); color: var(--mp-text-default); }
/* Inline view-name field (Add view / rename) */
.cmr-viewtab--editing { display: inline-flex; align-items: center; padding: var(--mp-spacing-2) 0; }
.cmr-viewtab-input { width: 140px; height: 28px; padding: 0 8px; border: 1px solid var(--mp-border-brand, #0a6e4e); border-radius: var(--mp-radii-md, 6px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; font-family: inherit; }
.cmr-viewbar-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.cmr-collapse-all { border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.cmr-fs-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default, #536062); }
.cmr-fs-btn:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }

/* Report */
.cmr-report { display: flex; flex-direction: column; }
.cmr-fs-topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--mp-spacing-2); }
.cmr-fs-title { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cmr-report-head { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-2) 0; }
.cmr-report-range { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cmr-report-updated { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
/* look comes from MpBanner (variant info); only the placement is local */
.cmr-info-banner { margin: 0 0 var(--mp-spacing-2); }

.cmr-table-wrap { overflow-x: auto; }
.cmr-table { width: 100%; min-width: 900px; border-collapse: collapse; table-layout: fixed; }
.cmr-col-date { width: 14%; } .cmr-col-number { width: 28%; } .cmr-col-desc { width: 15%; }
.cmr-col-status { width: 11%; } .cmr-col-movement { width: 15%; } .cmr-col-balance { width: 17%; }

.cmr-th { padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral-subtle, #f8f9f9); border-top: 1px solid var(--mp-border-default, #e3e7e9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; letter-spacing: 0.3px; color: var(--mp-text-secondary); text-align: left; white-space: nowrap; }
.cmr-th--right { text-align: right; }
.cmr-td { height: 40px; padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cmr-td--right { text-align: right; font-variant-numeric: tabular-nums; }
.cmr-strong { font-weight: var(--mp-font-weights-semi-bold, 600); }
.cmr-muted { color: var(--mp-text-secondary); }
.cmr-neg { color: var(--mp-text-default); }

.cmr-row--group { cursor: pointer; }
.cmr-td--group { background: var(--mp-background-neutral-subtle, #f4f5f7); }
.cmr-row--group:hover .cmr-td--group { background: var(--mp-background-neutral-hovered, #eef0f3); }
.cmr-customer { font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }
.cmr-cmcount { margin-left: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }
.cmr-row--memo { cursor: pointer; }
.cmr-row--memo:hover .cmr-td { background: var(--mp-background-neutral-subtle, #f8f9f9); }

.cmr-lead { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.cmr-lead--l2 { padding-left: var(--mp-spacing-4, 16px); }
.cmr-chev { color: var(--mp-icon-default, #536062); flex-shrink: 0; }
.cmr-applied-date { padding-left: 52px; }
/* Keep the number cell a normal table-cell (NOT flex) so its bottom border
   stays flush with the other columns; the chip + link sit inline instead. */
.cmr-td--l3 { white-space: nowrap; }
.cmr-saldo-awal { padding-left: 4px; color: var(--mp-text-secondary); }
.cmr-txn-link { color: var(--mp-text-link); cursor: pointer; vertical-align: middle; }
.cmr-txn-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.cmr-row--end .cmr-td { border-top: 1px solid var(--mp-border-default, #e3e7e9); }
/* Align "End balance" with the credit-memo accordion icon in the Date column
   (matches the memo row's lead indent: td padding + lead--l2 padding). */
.cmr-end-label { padding-left: calc(var(--mp-spacing-3, 12px) + var(--mp-spacing-4, 16px)); }

/* Status badges */
.cmr-badge { display: inline-flex; align-items: center; padding: 1px 8px; border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-medium, 500); }
.cmr-badge--active { background: var(--mp-background-success-subtle, #e6f4ea); color: var(--mp-text-success, #12805c); }
.cmr-badge--partial { background: var(--mp-background-warning-subtle, #fdf1dd); color: var(--mp-text-warning, #b54708); }
.cmr-badge--used { background: var(--mp-background-danger-subtle, #fdecec); color: var(--mp-text-danger, #c62828); }
/* Mutation type chip */
.cmr-type { display: inline-flex; align-items: center; padding: 0 6px; margin-right: var(--mp-spacing-2, 8px); border-radius: var(--mp-radii-sm, 4px); font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-medium, 500); vertical-align: middle; }
.cmr-type--pos { background: var(--mp-background-success-subtle, #e6f4ea); color: var(--mp-text-success, #12805c); }
.cmr-type--neg { background: var(--mp-background-neutral-subtle, #eceef0); color: var(--mp-text-secondary); }

/* Empty state */
.cmr-empty { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.cmr-empty--idle { padding: 72px 0 64px; }
.cmr-skel { display: inline-block; background-color: var(--mp-border-default, #e3e7e9) !important; background-image: none !important; animation: none !important; }
.cmr-empty-img { width: 240px; height: 200px; object-fit: contain; }
.cmr-empty-title { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cmr-empty-desc { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.cmr-empty-cta { margin-top: var(--mp-spacing-3); height: 36px; padding: 0 var(--mp-spacing-4); border: 1px solid var(--mp-border-bold, #8c9596); background: var(--mp-background-neutral, #ffffff); border-radius: var(--mp-radii-full, 999px); cursor: pointer; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }

/* Save-view / all-views drawers */
.cmr-vd-enter-active, .cmr-vd-leave-active { transition: background-color 200ms ease; }
.cmr-vd-enter-from, .cmr-vd-leave-to { background-color: transparent; }
.cmr-vd-enter-active .cmr-vd-panel { transition: transform 300ms ease-out; }
.cmr-vd-enter-from .cmr-vd-panel, .cmr-vd-leave-to .cmr-vd-panel { transform: translateX(calc(100% + 12px)); }
.cmr-vd-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.cmr-vd-panel { margin: var(--mp-spacing-3); width: min(400px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden; }
.cmr-vd-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cmr-vd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cmr-vd-close { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.cmr-vd-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.cmr-vd-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cmr-vd-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cmr-vd-input { height: var(--mp-sizes-9\.5, 38px); padding: 0 var(--mp-spacing-3); border: 1px solid var(--mp-colors-border-form, #1d1f2429); border-radius: var(--mp-radii-md, 6px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; }
.cmr-vd-input:focus { border-color: var(--mp-border-brand, #0a6e4e); }
.cmr-vd-hint { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cmr-vd-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.cmr-vd-btn { height: 36px; padding: 0 var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium, 500); cursor: pointer; border: 1px solid transparent; }
.cmr-vd-btn--ghost { background: transparent; color: var(--mp-text-default); }
.cmr-vd-btn--ghost:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.cmr-vd-btn--primary { background: var(--mp-background-brand-bold, #0a6e4e); color: #fff; }
.cmr-view-item { text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); flex: 1; }
.cmr-view-item:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.cmr-view-item.is-active { background: var(--mp-background-brand-subtle, #e8f5f0); color: var(--mp-text-brand, #0a6e4e); font-weight: var(--mp-font-weights-medium, 500); }
.cmr-view-item-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.cmr-view-del { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-subtle, #97a0af); }
.cmr-view-del:hover { background: var(--mp-background-danger-subtle, #fdecec); color: var(--mp-text-danger, #c62828); }

/* Full-screen — the white stage fills the whole window edge-to-edge (the layout
   drops its dark side borders via main-container--fullscreen). */
.cmr--full .cmr-stage { border-radius: 0; padding-top: var(--mp-spacing-4); }
</style>
