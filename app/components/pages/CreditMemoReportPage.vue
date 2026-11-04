<script setup lang="ts">
/**
 * Credit Memo Detail Report — Reports › Sales › Credit Memo.
 * PRD "[PRD] Credit Memo Report" (Accounts Receivable — Credit Memo) + Figma
 * 4531-72195 "Credit / Debit Memo Report" (frames 4531-72196 populated ·
 * 4531-73269 loading skeleton · 4531-75341 idle).
 *
 * A read-only, date-filtered report grouped by customer. Each customer (L1, gray
 * row + total) lists its credit memos (L2: date · number · description · Open /
 * Closed badge · opening balance); each memo lists its in-period entries (L3:
 * applied / refund / reversal documents with the linked invoice beneath, signed
 * movement, running balance), closed by an End balance row. Thin tree guides run
 * under the customer and memo carets; every generate opens the whole tree.
 * Toolbar: As-of date range (presets live inside the picker) + Apply + All filters
 * (keyword · customer · transaction type · status) | Airene · Column settings ·
 * Export ▾ (async Excel / PDF). Saved views + All views drawer, idle → skeleton →
 * ready, and a table-only full-screen mode.
 */
import { ref, computed, reactive, watch, nextTick, onBeforeUnmount } from 'vue'
import { useReportFullscreen } from '~/composables/useReportFullscreen'
import { useAireneBridge } from '~/composables/useAireneBridge'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import {
  MpButton, MpButtonGroup, MpIcon, MpTooltip, MpSkeleton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpBanner, MpBannerIcon, MpBannerTitle, css,
} from '@mekari/pixel3'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import CreditMemoFiltersDrawer, { type CmDrawerValue } from '~/components/patterns/CreditMemoFiltersDrawer.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast, successToast } from '~/utils/toasts'
import {
  creditMemoReport, entryRows, openingBalanceOf, remainingOf, statusOf, cmCustomerNames,
  creditMemoViews, addCmView, updateCmView, deleteCmView, emptyCmReportFilters,
  type CmReportFilters, type CmMutationType, type CmStatus, type CmSavedView, type CmEntryRow,
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

// ── Expand / collapse — tracked as COLLAPSED ids so everything is open by default ─
const collapsedCustomers = ref<Set<string>>(new Set())
const collapsedMemos = ref<Set<string>>(new Set())
const isCustomerOpen = (id: string) => !collapsedCustomers.value.has(id)
const isMemoOpen = (id: string) => !collapsedMemos.value.has(id)
function toggleIn(set: typeof collapsedCustomers, id: string) { const s = new Set(set.value); s.has(id) ? s.delete(id) : s.add(id); set.value = s }
function toggleCustomer(id: string) { toggleIn(collapsedCustomers, id) }
function toggleMemo(id: string) { if (entriesOf(id).length) toggleIn(collapsedMemos, id) }

// ── Report generation state — idle (empty prompt) → loading (skeleton) → ready ─
// The page starts empty; the report is only generated after the user applies a
// period or filters. Skeleton follows the ErpTablePage convention (~1.1s).
const reportState = ref<'idle' | 'loading' | 'ready'>('idle')
let genTimer: ReturnType<typeof setTimeout> | null = null
function generate() {
  reportState.value = 'loading'
  // Every generate opens the whole tree — all customers AND all credit memos (Figma 4531-72196).
  collapsedCustomers.value = new Set()
  collapsedMemos.value = new Set()
  if (genTimer) clearTimeout(genTimer)
  genTimer = setTimeout(() => { reportState.value = 'ready' }, 1100)
}
onBeforeUnmount(() => { if (genTimer) clearTimeout(genTimer) })

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtRangeDay(x: Date) { return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}` }
const rangeCaption = computed(() => { const [s, e] = appliedRange.value; return s && e ? `${fmtRangeDay(s)} - ${fmtRangeDay(e)}` : '' })
const lastUpdated = 'Last updated on 1 Sep 2026, 09:00 (GMT+7)'
// Future end-date is capped at today; show an informational banner.
const futureCapped = computed(() => { const e = appliedRange.value[1]; return !!e && e > new Date() })

// ── Filters (keyword + customer + transaction type + status) ──────────────────
const filters = reactive<CmReportFilters>(emptyCmReportFilters())
const drawerOpen = ref(false)
function onApplyFilters(v: CmDrawerValue) {
  filters.keyword = v.keyword; filters.keywordColumn = v.keywordColumn; filters.customerComparator = v.customerComparator
  filters.customers = [...v.customers]; filters.txnTypes = [...v.txnTypes]; filters.statuses = [...(v.statuses ?? [])]
  generate()
}
const activeFilterCount = computed(() => filters.customers.length + filters.txnTypes.length + (filters.statuses?.length ?? 0) + (filters.keyword ? 1 : 0))
const TXN_LABELS: Record<CmMutationType, string> = { Issued: 'Credit memo issued', Applied: 'Credit memo applied', Refund: 'Credit memo refund', Reversal: 'Credit memo reversal' }
function removeCustomer(name: string) { filters.customers = filters.customers.filter((c) => c !== name) }
function removeTxnType(t: CmMutationType) { filters.txnTypes = filters.txnTypes.filter((x) => x !== t) }
function removeStatus(s: CmStatus) { filters.statuses = (filters.statuses ?? []).filter((x) => x !== s) }
function resetFilters() { filters.keyword = ''; filters.keywordColumn = 'all'; filters.customerComparator = 'isAnyOf'; filters.customers = []; filters.txnTypes = []; filters.statuses = [] }  // preserves date range

// ── Saved views (Default + user views) ────────────────────────────────────────
const activeViewId = ref('default')
function selectView(id: string) {
  activeViewId.value = id
  const v = creditMemoViews.find((x) => x.id === id)
  if (v) {
    const f = { ...emptyCmReportFilters(), ...v.filters }
    filters.keyword = f.keyword; filters.keywordColumn = f.keywordColumn; filters.customerComparator = f.customerComparator
    filters.customers = [...f.customers]; filters.txnTypes = [...f.txnTypes]; filters.statuses = [...(f.statuses ?? [])]
  } else resetFilters()
  // Opening a view applies its saved filters and immediately shows its report.
  generate()
}
// All views drawer — lists Default + saved views; picking one opens it and closes
// the drawer. Close is the × only (rule/modal-drawer-close-explicit-only).
const allViewsOpen = ref(false)
function pickView(id: string) { selectView(id); allViewsOpen.value = false }
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
  const v = addCmView({ name, filters: { keyword: filters.keyword, keywordColumn: filters.keywordColumn, customerComparator: filters.customerComparator, customers: [...filters.customers], txnTypes: [...filters.txnTypes], statuses: [...(filters.statuses ?? [])] } })
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
// Date and Balance are the identity/result columns — locked on in Column settings.
const COLUMNS = [
  { key: 'date', label: 'Date', right: false }, { key: 'number', label: 'Number', right: false }, { key: 'description', label: 'Description', right: false },
  { key: 'status', label: 'Status', right: false }, { key: 'movement', label: 'Movement', right: true }, { key: 'balance', label: 'Balance', right: true },
]
const colVis = reactive<Record<string, boolean>>(Object.fromEntries(COLUMNS.map((c) => [c.key, true])))
const columnItems = COLUMNS.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 || i === COLUMNS.length - 1 }))
const show = (k: string) => colVis[k] !== false
const visibleColumns = computed(() => COLUMNS.filter((c) => show(c.key)))
// The Date column carries two 32px tree-guide tracks in front of it (customer
// caret → memo caret), so it spans 3 table columns. Rows that print only a label
// + the Balance (customer, End balance) span everything up to Balance.
const leadSpan = computed(() => 2 + visibleColumns.value.length - 1)

// ── Rows (report query + date-window gate) ────────────────────────────────────
// Seed activity lives in Aug 2026; the report is empty for periods that don't
// overlap it (a believable "no activity" result for other ranges).
function overlapsSeed() { const [s, e] = appliedRange.value; return !!s && !!e && s <= d(2026, 7, 31) && e >= d(2026, 7, 1) }
const groups = computed(() => (overlapsSeed() ? creditMemoReport(filters) : []))
// In-period entries per memo (applied / refund / reversal — the Issued event is the memo row itself).
const entriesByMemo = computed(() => new Map<string, CmEntryRow[]>(groups.value.flatMap((g) => g.cms.map((cm) => [cm.id, entryRows(cm)] as [string, CmEntryRow[]]))))
function entriesOf(id: string): CmEntryRow[] { return entriesByMemo.value.get(id) ?? [] }

const emptyReason = computed<'none' | 'no-activity' | 'filter'>(() => {
  if (groups.value.length) return 'none'
  return activeFilterCount.value ? 'filter' : 'no-activity'
})

/** Movement: reductions in parentheses (Figma), increases plain. */
function signed(n: number): string { return n < 0 ? `(${formatIDR(Math.abs(n))})` : formatIDR(n) }
/** Deep-link to a source document (credit memo, application, refund, invoice). */
function go(href?: string) { if (href && href !== '#') router.push(href) }

// ── Full screen (also hides the layout header + sidebar for a full-width stage) ─
const fullscreen = ref(false)
const { isReportFullscreen } = useReportFullscreen()
watch(fullscreen, (v) => { isReportFullscreen.value = v })
onBeforeUnmount(() => { isReportFullscreen.value = false })

// ── Airene — open the panel already grounded on THIS report's data ────────────
const aireneBridge = useAireneBridge()
const AIRENE_SUGGESTIONS = [
  'Which customer has the largest open credit memo balance?',
  'What is the total open credit memo balance?',
  'Which credit memos are closed?',
  'Summarise this report in 3 bullets',
]
function buildReportGround(): string {
  if (reportState.value !== 'ready') {
    return 'Credit Memo report (Reports › Sales › Credit Memo), IDR. No report generated yet — the user has not applied a period.'
  }
  const filt: string[] = []
  if (filters.keyword) filt.push(`keyword: "${filters.keyword}"`)
  if (filters.customers.length) filt.push(`customers ${filters.customerComparator === 'isNoneOf' ? 'excluding' : ''}: ${filters.customers.join(', ')}`)
  if (filters.txnTypes.length) filt.push(`transaction types: ${filters.txnTypes.join(', ')}`)
  if (filters.statuses?.length) filt.push(`status: ${filters.statuses.join(', ')}`)
  const lines = groups.value.map((g) => {
    const cms = g.cms.map((cm) => {
      const moves = entriesOf(cm.id).map((r) => `${r.title}${r.linkedNo ? ` (${r.linkedNo})` : ''} ${signed(r.movement)}`).join(', ')
      return `${cm.cmNumber} [${statusOf(cm)}] opening ${formatIDR(openingBalanceOf(cm))}, remaining ${formatIDR(remainingOf(cm))}${moves ? ` — ${moves}` : ''}`
    }).join('; ')
    return `- ${g.name}: end balance ${formatIDR(g.total)} — ${cms}`
  })
  return `Credit Memo report (Reports › Sales › Credit Memo), IDR, read-only. `
    + `Period ${rangeCaption.value}.${filt.length ? ' Filters — ' + filt.join('; ') + '.' : ''}\n`
    + `Customers ranked by open credit memo balance (descending):\n${lines.join('\n')}\n`
    + `Status "Open" = the credit memo still has a balance to apply or refund; "Closed" = fully used (zero balance). `
    + `Movement in parentheses is an application/refund that reduces the balance; End balance = sum of the customer's open balances.`
}
function openAirene() {
  aireneBridge.openWithContext(buildReportGround(), 'Credit Memo report', AIRENE_SUGGESTIONS)
}

// ── Export ▾ — Excel is always async (PRD TS-03); PDF is not built yet ─────────
const exporting = ref(false)
function exportExcel() {
  if (exporting.value) return
  if (reportState.value !== 'ready') { infoToast('Generate the report first.'); return }
  exporting.value = true
  infoToast('Your file is being prepared. You’ll be notified when it’s ready to download.')
  // Simulate the async job → in-app notification → download link.
  window.setTimeout(() => {
    exporting.value = false
    const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const row = (cells: unknown[]) => cells.map(esc).join(',')
    // Mirrors the report: memo row (opening balance) → its entries → customer End balance.
    const lines = [
      `Credit memo report — ${rangeCaption.value}`,
      row(['Customer', 'Credit memo number', 'Date', 'Transaction', 'Linked document', 'Description', 'Status', 'Movement', 'Balance', 'Currency']),
    ]
    for (const g of groups.value) {
      for (const cm of g.cms) {
        lines.push(row([g.name, cm.cmNumber, cm.issueDate, cm.cmNumber, '', cm.description, statusOf(cm), '', openingBalanceOf(cm), 'IDR']))
        for (const r of entriesOf(cm.id)) lines.push(row([g.name, cm.cmNumber, r.date, r.title, r.linkedNo ?? '', '', r.status, r.movement, r.balance, 'IDR']))
      }
      lines.push(row([g.name, '', '', 'End balance', '', '', '', '', g.total, 'IDR']))
    }
    const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'credit-memo-report.csv'; a.click(); URL.revokeObjectURL(a.href)
    successToast('File ready to download')
  }, 1600)
}
function exportPdf() { infoToast('PDF export — coming soon') }
</script>

<template>
  <div class="cmr" :class="{ 'cmr--full': fullscreen }">
    <!-- ── Title bar ── -->
    <header v-if="!fullscreen" class="cmr-titlebar">
      <div class="cmr-titlebar-left">
        <MpButton class="cmr-breadcrumb" variant="link" type="button" @click="router.push('/sales-report')">Sales</MpButton>
        <h1 class="cmr-title" data-devchange="cm-report-figma-v2">Credit Memo <span class="cmr-title-cur">(IDR)</span></h1>
      </div>
    </header>

    <div class="cmr-stage">
      <!-- ── Toolbar: As-of date + Apply + All filters | Airene · Column settings · Export ▾ ── -->
      <div v-if="!fullscreen" class="cmr-toolbar">
        <div class="cmr-controls">
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
          <div class="cmr-controls-right" data-devchange="cm-report-figma-v2">
            <MpButtonGroup class="cmr-tools">
              <MpTooltip id="cmr-airene" label="Ask Airene" placement="bottom" use-portal>
                <MpButton class="cmr-airene-btn" variant="ghost" left-icon="airene-brand" is-rounded type="button" aria-label="Ask Airene" @click="openAirene" />
              </MpTooltip>
              <ColumnSettingsMenu id="cmr-columns" :items="columnItems" :visibility="colVis" tooltip="Column settings" />
            </MpButtonGroup>
            <MpPopover id="cmr-export" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <MpButton variant="secondary" is-rounded right-icon="chevrons-down" type="button">Export</MpButton>
              </MpPopoverTrigger>
              <MpPopoverContent class="erp-dropdown-menu" :class="css({ width: 'max-content' })">
                <MpPopoverList>
                  <MpPopoverListItem @click="exportExcel">Export to Excel</MpPopoverListItem>
                  <MpPopoverListItem @click="exportPdf">Export to PDF</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>
        </div>
        <p v-if="rangeError" class="cmr-range-error">{{ rangeError }}</p>

        <!-- Active-filter badges (keyword · customer · transaction type · status) -->
        <div v-if="activeFilterCount" class="cmr-badges">
          <span v-if="filters.keyword" class="cmr-fbadge cmr-fbadge--dismiss">“{{ filters.keyword }}”<MpButton variant="ghost" type="button" aria-label="Remove" left-icon="close" @click="filters.keyword = ''" /></span>
          <span v-for="c in filters.customers" :key="`c-${c}`" class="cmr-fbadge cmr-fbadge--dismiss">{{ c }}<MpButton variant="ghost" type="button" aria-label="Remove" left-icon="close" @click="removeCustomer(c)" /></span>
          <span v-for="tt in filters.txnTypes" :key="`t-${tt}`" class="cmr-fbadge cmr-fbadge--dismiss">{{ TXN_LABELS[tt] }}<MpButton variant="ghost" type="button" aria-label="Remove" left-icon="close" @click="removeTxnType(tt)" /></span>
          <span v-for="s in filters.statuses" :key="`s-${s}`" class="cmr-fbadge cmr-fbadge--dismiss" data-devchange="cm-report-figma-v2">Status: {{ s }}<MpButton variant="ghost" type="button" aria-label="Remove" left-icon="close" @click="removeStatus(s)" /></span>
          <MpButton class="cmr-reset" variant="link" type="button" @click="resetFilters">Reset Filter</MpButton>
        </div>
      </div>

      <!-- ── View tabs ── -->
      <div v-if="!fullscreen" class="cmr-viewbar">
        <div class="cmr-views">
          <MpButton class="cmr-viewtab" variant="ghost" :class="{ 'is-active': activeViewId === 'default' }" type="button" @click="selectView('default')">Default view</MpButton>

          <template v-for="v in creditMemoViews" :key="v.id">
            <!-- Renaming this view inline -->
            <span v-if="editingViewId === v.id" class="cmr-viewtab cmr-viewtab--editing">
              <input v-model="editViewName" class="cmr-viewtab-input cmr-view-edit" @keydown.enter.prevent="commitEditView" @keydown.esc="cancelEditView" @blur="commitEditView" /> <!-- pixel-police-allow: inline view-name field -->
            </span>
            <!-- Saved view tab + [...] menu (Edit name / Delete) -->
            <span v-else class="cmr-viewtab-wrap">
              <MpButton class="cmr-viewtab" variant="ghost" :class="{ 'is-active': activeViewId === v.id }" type="button" @click="selectView(v.id)">{{ v.name }}</MpButton>
              <MpPopover :id="`cmr-view-${v.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                <MpPopoverTrigger>
                  <MpButton class="cmr-view-kebab" variant="ghost" type="button" aria-label="View options" left-icon="menu-kebab" />
                </MpPopoverTrigger>
                <MpPopoverContent class="erp-dropdown-menu" :class="css({ width: 'max-content' })">
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
            <input ref="newViewInput" v-model="newViewName" class="cmr-viewtab-input" placeholder="View name" @keydown.enter.prevent="commitAddView" @keydown.esc="cancelAddView" @blur="commitAddView" /> <!-- pixel-police-allow: inline view-name field -->
          </span>
          <MpButton v-else class="cmr-addview" variant="ghost" type="button" left-icon="add" @click="startAddView">Add view</MpButton>

          <MpButton class="cmr-allviews" variant="link" type="button" data-devchange="cm-report-figma-v2" @click="allViewsOpen = true">All views</MpButton>
        </div>
        <div class="cmr-viewbar-right">
          <MpTooltip id="cmr-fs-enter" label="Full screen" placement="bottom-end" use-portal>
            <MpButton class="cmr-fs-btn" variant="ghost" type="button" aria-label="Full screen" left-icon="full-screen" @click="fullscreen = true" />
          </MpTooltip>
        </div>
      </div>

      <!-- ── Report ── -->
      <div class="cmr-report">
        <div v-if="fullscreen" class="cmr-fs-topbar">
          <span class="cmr-fs-title">Credit Memo <span class="cmr-title-cur">(IDR)</span></span>
          <MpTooltip id="cmr-fs-exit" label="Exit full screen" placement="bottom-end" use-portal>
            <MpButton class="cmr-fs-btn" variant="ghost" type="button" aria-label="Exit full screen" left-icon="minimize" @click="fullscreen = false" />
          </MpTooltip>
        </div>

        <!-- Idle — no report generated yet (Figma 4531-75341) -->
        <div v-if="reportState === 'idle'" class="cmr-empty cmr-empty--idle" data-devchange="cm-report-figma-v2">
          <img src="/illustrations/report-empty.png" alt="" class="cmr-empty-img cmr-empty-img--report" width="288" height="240" />
          <p class="cmr-empty-title">Report data will appear here</p>
          <p class="cmr-empty-desc">Select date range, then click <span class="cmr-empty-strong">Apply</span> button.</p>
        </div>

        <!-- Loading skeleton (Figma 4531-73269) — header bars, a customer bar, a memo
             bar, then 3 rows with one bar per column. Solid + static per
             rule/skeleton-solid-static. -->
        <div v-else-if="reportState === 'loading'" class="cmr-table-wrap">
          <table class="cmr-table cmr-table--skeleton" aria-busy="true">
            <colgroup>
              <col class="cmr-col-guide" /><col class="cmr-col-guide" /><col class="cmr-col-date" />
              <col v-if="show('number')" class="cmr-col-number" /><col v-if="show('description')" class="cmr-col-desc" />
              <col v-if="show('status')" class="cmr-col-status" /><col v-if="show('movement')" class="cmr-col-movement" /><col class="cmr-col-balance" />
            </colgroup>
            <thead>
              <tr>
                <th v-for="c in visibleColumns" :key="c.key" class="cmr-th" :class="{ 'cmr-th--right': c.right }" :colspan="c.key === 'date' ? 3 : 1">
                  <MpSkeleton class="cmr-skel" height="13px" width="59px" rounded="md" duration="0s" />
                </th>
              </tr>
            </thead>
            <tbody>
              <tr class="cmr-row cmr-row--skel-group">
                <td class="cmr-td cmr-td--group" :colspan="leadSpan + 1"><MpSkeleton class="cmr-skel" height="13px" width="86px" rounded="md" duration="0s" /></td>
              </tr>
              <tr class="cmr-row">
                <td class="cmr-td" colspan="3"><MpSkeleton class="cmr-skel" height="13px" width="97px" rounded="md" duration="0s" /></td>
                <td v-for="c in visibleColumns.slice(1)" :key="c.key" class="cmr-td" />
              </tr>
              <tr v-for="n in 3" :key="n" class="cmr-row">
                <td class="cmr-td" colspan="3"><MpSkeleton class="cmr-skel" height="13px" width="97px" rounded="md" duration="0s" /></td>
                <td v-for="c in visibleColumns.slice(1)" :key="c.key" class="cmr-td" :class="{ 'cmr-td--right': c.right }">
                  <MpSkeleton class="cmr-skel" height="13px" width="104px" rounded="md" duration="0s" />
                </td>
              </tr>
            </tbody>
          </table>
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

          <!-- Ready + data (Figma 4531-72196) -->
          <div v-if="groups.length" class="cmr-table-wrap">
            <table class="cmr-table" data-devchange="cm-report-figma-v2">
              <colgroup>
                <col class="cmr-col-guide" /><col class="cmr-col-guide" /><col class="cmr-col-date" />
                <col v-if="show('number')" class="cmr-col-number" />
                <col v-if="show('description')" class="cmr-col-desc" />
                <col v-if="show('status')" class="cmr-col-status" />
                <col v-if="show('movement')" class="cmr-col-movement" />
                <col class="cmr-col-balance" />
              </colgroup>
              <thead>
                <tr>
                  <th v-for="c in visibleColumns" :key="c.key" class="cmr-th" :class="{ 'cmr-th--right': c.right }" :colspan="c.key === 'date' ? 3 : 1">{{ c.label }}</th>
                </tr>
              </thead>
              <tbody v-for="g in groups" :key="g.id">
                <!-- Customer (L1) -->
                <tr class="cmr-row cmr-row--group" @click="toggleCustomer(g.id)">
                  <td class="cmr-td cmr-td--group" :colspan="leadSpan">
                    <span class="cmr-lead">
                      <MpIcon :name="isCustomerOpen(g.id) ? 'chevrons-down' : 'chevrons-right'" size="20px" />
                      <span class="cmr-customer">{{ g.name }}</span>
                    </span>
                  </td>
                  <td class="cmr-td cmr-td--right cmr-td--group cmr-strong">{{ formatIDR(g.total) }}</td>
                </tr>

                <template v-if="isCustomerOpen(g.id)">
                  <template v-for="cm in g.cms" :key="cm.id">
                    <!-- Credit memo (L2) — click to fold its entries -->
                    <tr class="cmr-row cmr-row--memo" :class="{ 'is-foldable': entriesOf(cm.id).length }" @click="toggleMemo(cm.id)">
                      <td class="cmr-guide" aria-hidden="true" />
                      <td class="cmr-td" colspan="2">
                        <span class="cmr-lead">
                          <MpIcon v-if="entriesOf(cm.id).length" :name="isMemoOpen(cm.id) ? 'chevrons-down' : 'chevrons-right'" size="20px" />
                          <span v-else class="cmr-chev-space" />
                          <span>{{ formatDate(cm.issueDate) }}</span>
                        </span>
                      </td>
                      <td v-if="show('number')" class="cmr-td">
                        <span class="cmr-doc-link" role="link" tabindex="0" data-devchange="cm-report-links" @click.stop="go(`/credit-memos/${cm.id}`)" @keydown.enter.stop="go(`/credit-memos/${cm.id}`)">{{ cm.cmNumber }}</span>
                      </td>
                      <td v-if="show('description')" class="cmr-td">{{ cm.description }}</td>
                      <td v-if="show('status')" class="cmr-td cmr-td--badge"><ErpStatusBadge :status="statusOf(cm)" /></td>
                      <td v-if="show('movement')" class="cmr-td cmr-td--right" />
                      <td class="cmr-td cmr-td--right">{{ formatIDR(openingBalanceOf(cm)) }}</td>
                    </tr>

                    <!-- Entries (L3): applied / refund / reversal → running balance -->
                    <template v-if="isMemoOpen(cm.id)">
                      <tr v-for="r in entriesOf(cm.id)" :key="r.id" class="cmr-row cmr-row--entry">
                        <td class="cmr-guide" aria-hidden="true" />
                        <td class="cmr-guide" aria-hidden="true" />
                        <td class="cmr-td">{{ formatDate(r.date) }}</td>
                        <td v-if="show('number')" class="cmr-td">
                          <span class="cmr-entry-title" :title="r.title">
                            <span v-if="r.titleHref" class="cmr-doc-link" role="link" tabindex="0" @click.stop="go(r.titleHref)" @keydown.enter.stop="go(r.titleHref)">{{ r.title }}</span>
                            <template v-else>{{ r.title }}</template>
                          </span>
                          <span v-if="r.linkedNo" class="cmr-entry-linked" :title="r.linkedNo">
                            <span v-if="r.linkedHref" class="cmr-doc-link" role="link" tabindex="0" @click.stop="go(r.linkedHref)" @keydown.enter.stop="go(r.linkedHref)">{{ r.linkedNo }}</span>
                            <template v-else>{{ r.linkedNo }}</template>
                          </span>
                        </td>
                        <td v-if="show('description')" class="cmr-td" />
                        <td v-if="show('status')" class="cmr-td cmr-td--badge"><ErpStatusBadge :status="r.status" /></td>
                        <td v-if="show('movement')" class="cmr-td cmr-td--right">{{ signed(r.movement) }}</td>
                        <td class="cmr-td cmr-td--right">{{ formatIDR(r.balance) }}</td>
                      </tr>
                    </template>
                  </template>

                  <!-- End balance — flush left, not indented -->
                  <tr class="cmr-row cmr-row--end">
                    <td class="cmr-td cmr-strong" :colspan="leadSpan">End balance</td>
                    <td class="cmr-td cmr-td--right cmr-strong">{{ formatIDR(g.total) }}</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <!-- Ready, but no data — filtered-empty vs no activity (PRD US-CMR-005) -->
          <div v-else class="cmr-empty">
            <img src="/illustrations/empty-folder.png" alt="" class="cmr-empty-img" width="240" height="200" />
            <template v-if="emptyReason === 'filter'">
              <p class="cmr-empty-title">No data matches this filter.</p>
              <p class="cmr-empty-desc">Try changing or resetting the filters.</p>
              <MpButton class="cmr-empty-cta" variant="secondary" is-rounded type="button" @click="resetFilters">Reset Filter</MpButton>
            </template>
            <template v-else>
              <p class="cmr-empty-title">No credit memo in this period.</p>
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
      :model-value="{ keyword: filters.keyword, keywordColumn: filters.keywordColumn, customerComparator: filters.customerComparator, customers: filters.customers, txnTypes: filters.txnTypes, statuses: filters.statuses ?? [] }"
      :customer-options="cmCustomerNames()"
      @apply="onApplyFilters"
    />

    <!-- ── All views drawer — Default + saved views; close via × only ── -->
    <ErpDrawer :is-open="allViewsOpen" title="All views" width="400px" @close="allViewsOpen = false">
      <template #body>
        <div class="cmr-vd-list">
          <MpButton class="cmr-view-item" variant="ghost" :class="{ 'is-active': activeViewId === 'default' }" type="button" @click="pickView('default')">Default view</MpButton>
          <MpButton v-for="v in creditMemoViews" :key="v.id" class="cmr-view-item" variant="ghost" :class="{ 'is-active': activeViewId === v.id }" type="button" @click="pickView(v.id)">{{ v.name }}</MpButton>
          <p v-if="!creditMemoViews.length" class="cmr-vd-hint">Views you save with Add view will appear here.</p>
        </div>
      </template>
    </ErpDrawer>

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
/* "(IDR)" — a 12px regular secondary caption beside the H1 (Figma 4531-72196). */
.cmr-title-cur { font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); font-weight: var(--mp-font-weights-regular); letter-spacing: 0; color: var(--mp-text-secondary); }

/* Stage — 12px top, 20px between toolbar / view tabs / report (Figma). */
.cmr-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); border-top-left-radius: var(--mp-radii-lg, 12px); padding: var(--mp-spacing-3, 12px) var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); }

.cmr-toolbar { display: flex; flex-direction: column; gap: var(--mp-spacing-2, 8px); }
.cmr-controls { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.cmr-controls-left { display: flex; align-items: flex-end; gap: var(--mp-spacing-4, 16px); }
.cmr-controls-right { display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); }
.cmr-datefield { display: flex; flex-direction: column; gap: var(--mp-spacing-1); width: 240px; }
.cmr-date-label { font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }
.cmr-allfilters-count { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; margin-left: 2px; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-brand-bold, #0a6e4e); color: var(--mp-text-inverse, #fff); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); }
.cmr-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }
.cmr-range-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c62828); }

/* Filter badges */
.cmr-badges { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.cmr-fbadge { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 var(--mp-spacing-2) 0 var(--mp-spacing-3); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle, #eceef0); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-default); }
.cmr-fbadge--dismiss button { display: inline-flex; align-items: center; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); padding: 0; }
.cmr-fbadge--dismiss button:hover { color: var(--mp-text-default); }
.cmr-reset { border: none; background: none; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); text-decoration: underline; text-underline-offset: 2px; }

/* View tabs — 24px apart, 12px × 4px tab padding (Figma "Tabs Group"). */
.cmr-viewbar { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cmr-views { display: flex; align-items: center; gap: var(--mp-spacing-6, 24px); }
.cmr-viewtab { position: relative; border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); padding: var(--mp-spacing-3) var(--mp-spacing-1); }
.cmr-viewtab:not(.is-active):hover { color: var(--mp-text-default); }
.cmr-viewtab.is-active { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); }
.cmr-viewtab.is-active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--mp-text-selected); border-radius: 2px 2px 0 0; }
.cmr-addview { display: inline-flex; align-items: center; gap: var(--mp-spacing-2, 8px); border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); padding: var(--mp-spacing-3) var(--mp-spacing-1); }
.cmr-addview:hover { color: var(--mp-text-default); }
.cmr-allviews { border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); padding: var(--mp-spacing-3) var(--mp-spacing-1); text-decoration: underline; text-underline-offset: 2px; }
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
.cmr-fs-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default, #536062); }
.cmr-fs-btn:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }

/* Report */
.cmr-report { display: flex; flex-direction: column; min-width: 0; }
.cmr-fs-topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--mp-spacing-2); }
.cmr-fs-title { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cmr-report-head { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-2, 8px); font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); }
.cmr-report-range { color: var(--mp-text-default); }
.cmr-report-updated { color: var(--mp-text-secondary); }
/* look comes from MpBanner (variant info); only the placement is local */
.cmr-info-banner { margin: 0 0 var(--mp-spacing-2); }

/* Table — two 32px tree-guide tracks sit in front of the Date column. */
.cmr-table-wrap { overflow-x: auto; }
.cmr-table { width: 100%; min-width: 1100px; border-collapse: collapse; table-layout: fixed; }
.cmr-col-guide { width: 32px; }
.cmr-col-date { width: 10%; } .cmr-col-number { width: 22%; } .cmr-col-desc { width: 22%; }
.cmr-col-status { width: 12%; } .cmr-col-movement { width: 14%; } .cmr-col-balance { width: 15%; }

/* Header — 28px, uppercase 12px semibold on the gray surface (rule/table-header-*). */
.cmr-th { height: var(--mp-sizes-7, 28px); padding: 0 var(--mp-spacing-4, 16px) 0 var(--mp-spacing-2, 8px); background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; letter-spacing: 0.3px; color: var(--mp-text-secondary); text-align: left; white-space: nowrap; vertical-align: middle; }
.cmr-th--right { text-align: right; padding: 0 var(--mp-spacing-2, 8px) 0 var(--mp-spacing-4, 16px); }
/* Body cells — 40px baseline, 10px block / 8px start · 16px end padding (Figma "Table row (E)"). */
.cmr-td { height: 40px; padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-4, 16px) var(--mp-spacing-2\.5, 10px) var(--mp-spacing-2, 8px); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cmr-td--right { text-align: right; font-variant-numeric: tabular-nums; padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-2, 8px) var(--mp-spacing-2\.5, 10px) var(--mp-spacing-4, 16px); }
.cmr-td--badge { padding-top: var(--mp-spacing-2, 8px); padding-bottom: var(--mp-spacing-2, 8px); }
.cmr-strong { font-weight: var(--mp-font-weights-semi-bold, 600); }

/* Tree guides — a 1px border-default line under the customer caret (track 1)
   and under the memo caret (track 2). Guide cells carry no row border, so L2 /
   L3 row borders start at the guide (indented), per Figma. */
.cmr-guide { padding: 0; border: none; background-image: linear-gradient(var(--mp-border-default, #e3e7e9), var(--mp-border-default, #e3e7e9)); background-size: 1px 100%; background-repeat: no-repeat; background-position: 17px 0; }

/* Customer (L1) */
.cmr-row--group { cursor: pointer; }
.cmr-td--group { background: var(--mp-background-neutral-subtle, #f4f5f7); }
.cmr-row--group:hover .cmr-td--group { background: var(--mp-background-neutral-hovered, #eef0f3); }
.cmr-customer { font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }
.cmr-lead { display: inline-flex; align-items: center; gap: var(--mp-spacing-3, 12px); vertical-align: middle; }
.cmr-chev-space { display: inline-block; width: 20px; flex-shrink: 0; }

/* Credit memo (L2) — folds its entries; hover stays off the guide track. */
.cmr-row--memo.is-foldable { cursor: pointer; }
.cmr-row--memo.is-foldable:hover .cmr-td { background: var(--mp-background-neutral-subtle, #f8f9f9); }
/* Document numbers read as default text, underline on hover (Figma). */
.cmr-doc-link { color: inherit; cursor: pointer; }
.cmr-doc-link:hover, .cmr-doc-link:focus-visible { text-decoration: underline; text-underline-offset: 2px; outline: none; }

/* Entries (L3) — two-line rows align top (rule/table-cell-padding-align). */
.cmr-row--entry .cmr-td { vertical-align: top; }
.cmr-entry-title { display: block; overflow: hidden; text-overflow: ellipsis; }
.cmr-entry-linked { display: block; overflow: hidden; text-overflow: ellipsis; font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-secondary); }

/* Loading skeleton */
.cmr-row--skel-group .cmr-td { height: var(--mp-sizes-7, 28px); padding-top: 0; padding-bottom: 0; }
.cmr-skel { display: inline-block; vertical-align: middle; background-color: var(--mp-border-default, #e3e7e9) !important; background-image: none !important; animation: none !important; }

/* Empty states */
.cmr-empty { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.cmr-empty--idle { padding: 0 0 var(--mp-spacing-6, 24px); }
.cmr-empty-img { width: 240px; height: 200px; object-fit: contain; }
.cmr-empty-img--report { width: 288px; height: 240px; }
.cmr-empty-title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); line-height: var(--mp-line-heights-lg, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cmr-empty-desc { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-secondary); }
.cmr-empty-strong { font-weight: var(--mp-font-weights-semi-bold, 600); }
.cmr-empty-cta { margin-top: var(--mp-spacing-3); }

/* All views drawer */
.cmr-vd-list { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.cmr-vd-hint { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cmr-view-item { justify-content: flex-start; text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cmr-view-item:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.cmr-view-item.is-active { background: var(--mp-background-brand-subtle, #e8f5f0); color: var(--mp-text-brand, #0a6e4e); font-weight: var(--mp-font-weights-medium, 500); }

/* Full-screen — the white stage fills the whole window edge-to-edge (the layout
   drops its dark side borders via main-container--fullscreen). */
.cmr--full .cmr-stage { border-radius: 0; padding-top: var(--mp-spacing-4); }
</style>
