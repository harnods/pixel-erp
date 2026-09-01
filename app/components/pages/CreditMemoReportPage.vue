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
import { ref, computed, reactive, watch, onBeforeUnmount } from 'vue'
import { useReportFullscreen } from '~/composables/useReportFullscreen'
import { useAireneBridge } from '~/composables/useAireneBridge'
import {
  MpIcon, MpTooltip, MpToggle, MpSkeleton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import CreditMemoFiltersDrawer, { type CmDrawerValue } from '~/components/patterns/CreditMemoFiltersDrawer.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import {
  creditMemoReport, historyRows, remainingOf, statusOf, cmCustomerNames,
  creditMemoViews, addCmView, updateCmView, deleteCmView, emptyCmReportFilters,
  type CreditMemo, type CmReportFilters, type CmMutationType, type CmStatus,
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
function onApplyFilters(v: CmDrawerValue) { filters.customers = [...v.customers]; filters.txnTypes = [...v.txnTypes]; generate() }
function toggleZero() { filters.showZero = !filters.showZero }
const activeFilterCount = computed(() => filters.customers.length + filters.txnTypes.length)
const TXN_LABELS: Record<CmMutationType, string> = { Issued: 'CM Issued', Applied: 'CM Applied', Refund: 'CM Refund', Reversal: 'CM Reversal' }
function removeCustomer(name: string) { filters.customers = filters.customers.filter((c) => c !== name) }
function removeTxnType(t: CmMutationType) { filters.txnTypes = filters.txnTypes.filter((x) => x !== t) }
function resetFilters() { filters.customers = []; filters.txnTypes = [] }  // preserves date range

// ── Saved views (Default + user views) ────────────────────────────────────────
const activeViewId = ref('default')
function selectView(id: string) {
  activeViewId.value = id
  const v = creditMemoViews.find((x) => x.id === id)
  if (v) { filters.customers = [...v.filters.customers]; filters.txnTypes = [...v.filters.txnTypes]; filters.showZero = v.filters.showZero }
  else { resetFilters(); filters.showZero = false }
}
const viewDrawerOpen = ref(false)
const viewName = ref('')
function openAddView() { viewName.value = ''; viewDrawerOpen.value = true }
function saveView() {
  const name = viewName.value.trim(); if (!name) return
  const v = addCmView({ name, filters: { customers: [...filters.customers], txnTypes: [...filters.txnTypes], showZero: filters.showZero } })
  activeViewId.value = v.id; viewDrawerOpen.value = false
  toast.notify({ variant: 'success', title: 'View saved' })
}
const allViewsOpen = ref(false)

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
const openCustomers = ref<Set<string>>(new Set(creditMemoReport({ customers: [], txnTypes: [], showZero: true }).map((c) => c.id)))
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
  'Which customer has the most usable CM credit?',
  'What is the total outstanding CM balance?',
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
    return `- ${g.name}: total usable ${formatIDR(g.total)}, ${g.activeCount} active CM — ${cms}`
  })
  return `Credit Memo Detail Report (Reports › Sales › Credit Memo), IDR, read-only. `
    + `Period ${rangeCaption.value}.${filt.length ? ' Filters — ' + filt.join('; ') + '.' : ''}\n`
    + `Customers ranked by usable CM credit (descending):\n${lines.join('\n')}\n`
    + `"Usable/remaining" is CM credit still available; "Habis" = fully used; Movement negatives are applications/refunds.`
}
function openAirene() {
  aireneBridge.openWithContext(buildReportGround(), 'Credit Memo report', AIRENE_SUGGESTIONS)
}

// ── Export (always async — PRD TS-03) ─────────────────────────────────────────
const exporting = ref(false)
function exportExcel() {
  if (exporting.value) return
  exporting.value = true
  toast.notify({ variant: 'information', title: 'Your file is being prepared. You’ll be notified when it’s ready to download.' })
  // Simulate the async job → in-app notification → download link.
  window.setTimeout(() => {
    exporting.value = false
    const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    // Sheet 1 — Customer Summary
    const lines = ['Customer Summary', ['Customer', 'Active CM', 'Total Remaining Balance', 'Currency'].join(',')]
    for (const g of groups.value) lines.push([g.name, g.activeCount, g.total, 'IDR'].map(esc).join(','))
    // Sheet 2 — CM Detail
    lines.push('', 'CM Detail', ['Customer', 'CM Number', 'Date', 'Type', 'Transaction No.', 'Description', 'Movement', 'Balance', 'Currency'].join(','))
    for (const g of groups.value) for (const cm of g.cms) for (const r of historyRows(cm)) {
      lines.push([g.name, cm.cmNumber, r.date, r.type, r.transactionNo ?? '', r.description ?? '', r.movement ?? '', r.balance, 'IDR'].map(esc).join(','))
    }
    const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'credit-memo-report.csv'; a.click(); URL.revokeObjectURL(a.href)
    toast.notify({ variant: 'success', title: 'File ready to download', description: 'Saved to Export history for 7 days.' })
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
          <button class="cmr-apply" type="button" @click="applyReport">Apply</button>
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before cmr-allfilters" type="button" @click="drawerOpen = true">
            <MpIcon name="filter" size="sm" /> All filters
            <span v-if="activeFilterCount" class="cmr-allfilters-count">{{ activeFilterCount }}</span>
          </button>
        </div>
        <div class="cmr-controls-right">
          <MpTooltip id="cmr-ai" label="Ask Airene" placement="bottom" use-portal>
            <button class="cmr-icon-btn cmr-icon-btn--airene" type="button" aria-label="Ask Airene" @click="openAirene"><MpIcon name="airene-brand" size="md" /></button>
          </MpTooltip>
          <ColumnSettingsMenu id="cmr-cols" :items="columnItems" :visibility="colVis" />
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" :disabled="exporting" @click="exportExcel">
            <MpIcon name="download" size="sm" /> Export to Excel
          </button>
        </div>
      </div>

      <!-- Zero-balance toggle -->
      <div v-if="!fullscreen" class="cmr-presetbar">
        <label class="cmr-zerotoggle">
          <MpToggle id="cmr-zero" :is-checked="filters.showZero" @change="toggleZero" />
          <span>Show fully-used CMs</span>
        </label>
      </div>
      <p v-if="!fullscreen && rangeError" class="cmr-range-error">{{ rangeError }}</p>

      <!-- Active-filter badges (customer + transaction type only) -->
      <div v-if="!fullscreen && activeFilterCount" class="cmr-badges">
        <span v-for="c in filters.customers" :key="`c-${c}`" class="cmr-fbadge cmr-fbadge--dismiss">{{ c }}<button type="button" aria-label="Remove" @click="removeCustomer(c)"><MpIcon name="close" size="sm" /></button></span>
        <span v-for="tt in filters.txnTypes" :key="`t-${tt}`" class="cmr-fbadge cmr-fbadge--dismiss">{{ TXN_LABELS[tt] }}<button type="button" aria-label="Remove" @click="removeTxnType(tt)"><MpIcon name="close" size="sm" /></button></span>
        <button v-if="activeFilterCount" class="cmr-reset" type="button" @click="resetFilters">Reset Filter</button>
      </div>

      <!-- ── View tabs ── -->
      <div v-if="!fullscreen" class="cmr-viewbar">
        <div class="cmr-views">
          <button class="cmr-viewtab" :class="{ 'is-active': activeViewId === 'default' }" type="button" @click="selectView('default')">Default view</button>
          <button v-for="v in creditMemoViews" :key="v.id" class="cmr-viewtab" :class="{ 'is-active': activeViewId === v.id }" type="button" @click="selectView(v.id)">{{ v.name }}</button>
          <button class="cmr-addview" type="button" @click="openAddView"><MpIcon name="add" size="sm" /> Add view</button>
          <button class="cmr-allviews" type="button" @click="allViewsOpen = true">All views</button>
        </div>
        <div class="cmr-viewbar-right">
          <button v-if="reportState === 'ready' && groups.length" class="cmr-collapse-all" type="button" @click="toggleAll">{{ allCollapsed ? 'Expand all' : 'Collapse all' }}</button>
          <button class="cmr-fs-btn" type="button" aria-label="Full screen" @click="fullscreen = true"><MpIcon name="full-screen" size="md" /></button>
        </div>
      </div>

      <!-- ── Report ── -->
      <div class="cmr-report">
        <div v-if="fullscreen" class="cmr-fs-topbar">
          <button class="cmr-fs-btn" type="button" aria-label="Exit full screen" @click="fullscreen = false"><MpIcon name="minimize" size="md" /></button>
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
          <p v-if="futureCapped" class="cmr-info-banner"><MpIcon name="info" size="sm" /> Showing data up to today.</p>

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
                    <span class="cmr-cmcount">{{ g.activeCount }} active CM</span>
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
                  <td class="cmr-td cmr-strong" :colspan="visibleLeadSpan">End balance</td>
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
              <p class="cmr-empty-desc">Turn on "Show fully-used CMs" to see them.</p>
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
      :model-value="{ customers: filters.customers, txnTypes: filters.txnTypes }"
      :customer-options="cmCustomerNames()"
      @apply="onApplyFilters"
    />

    <!-- ── Save view drawer ── -->
    <Teleport to="body">
      <Transition name="cmr-vd">
        <div v-if="viewDrawerOpen" class="cmr-vd-overlay" @click.self="viewDrawerOpen = false">
          <div class="cmr-vd-panel" role="dialog" aria-label="Save view">
            <header class="cmr-vd-head"><span class="cmr-vd-title">Save view</span><button class="cmr-vd-close" type="button" aria-label="Close" @click="viewDrawerOpen = false"><MpIcon name="close" size="md" /></button></header>
            <div class="cmr-vd-body">
              <label class="cmr-vd-label">View name</label>
              <input v-model="viewName" class="cmr-vd-input" type="text" placeholder="e.g. Big customers with active CM" @keydown.enter.prevent="saveView" />
              <p class="cmr-vd-hint">Saves the current filters as a view. It stays available next time.</p>
            </div>
            <footer class="cmr-vd-foot"><button class="cmr-vd-btn cmr-vd-btn--ghost" type="button" @click="viewDrawerOpen = false">Cancel</button><button class="cmr-vd-btn cmr-vd-btn--primary" type="button" @click="saveView">Save view</button></footer>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── All views ── -->
    <Teleport to="body">
      <Transition name="cmr-vd">
        <div v-if="allViewsOpen" class="cmr-vd-overlay" @click.self="allViewsOpen = false">
          <div class="cmr-vd-panel" role="dialog" aria-label="All views">
            <header class="cmr-vd-head"><span class="cmr-vd-title">All views</span><button class="cmr-vd-close" type="button" aria-label="Close" @click="allViewsOpen = false"><MpIcon name="close" size="md" /></button></header>
            <div class="cmr-vd-body">
              <button class="cmr-view-item" :class="{ 'is-active': activeViewId === 'default' }" type="button" @click="selectView('default'); allViewsOpen = false">Default view</button>
              <div v-for="v in creditMemoViews" :key="v.id" class="cmr-view-item-row">
                <button class="cmr-view-item" :class="{ 'is-active': activeViewId === v.id }" type="button" @click="selectView(v.id); allViewsOpen = false">{{ v.name }}</button>
                <button class="cmr-view-del" type="button" aria-label="Delete view" @click="deleteCmView(v.id); activeViewId = 'default'"><MpIcon name="delete" size="sm" /></button>
              </div>
              <p v-if="!creditMemoViews.length" class="cmr-vd-hint">No saved views yet. Filter, then Add view to save one.</p>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.cmr { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.cmr-titlebar { flex-shrink: 0; min-height: 72px; background: var(--mp-background-neutral-subtle); display: flex; align-items: center; padding: 0 var(--mp-spacing-6); }
.cmr-titlebar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; }
.cmr-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-link); font-family: inherit; }
.cmr-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.cmr-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.cmr-title-cur { font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }

.cmr-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); border-top-left-radius: var(--mp-radii-lg, 12px); padding: var(--mp-spacing-5, 20px) var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); display: flex; flex-direction: column; gap: var(--mp-spacing-3, 12px); }

.cmr-controls { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.cmr-controls-left { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); }
.cmr-controls-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cmr-datefield { display: flex; flex-direction: column; gap: var(--mp-spacing-1); width: 220px; }
.cmr-date-label { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }
.cmr-apply { height: 36px; padding: 0 var(--mp-spacing-4); border: none; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-brand-bold, #0a6e4e); color: #fff; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold, 600); cursor: pointer; }
.cmr-apply:hover { background: var(--mp-background-brand-bold-hovered, #095c41); }
.cmr-allfilters-count { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; margin-left: 2px; border-radius: 999px; background: var(--mp-background-brand-bold, #0a6e4e); color: #fff; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); }
.cmr-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default); }
.cmr-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
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
.cmr-viewbar { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--mp-border-default); }
.cmr-views { display: flex; align-items: center; gap: var(--mp-spacing-5); }
.cmr-viewtab { position: relative; border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); padding: var(--mp-spacing-3) 0; }
.cmr-viewtab:not(.is-active):hover { color: var(--mp-text-default); }
.cmr-viewtab.is-active { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); }
.cmr-viewtab.is-active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--mp-text-selected); border-radius: 2px 2px 0 0; }
.cmr-addview { display: inline-flex; align-items: center; gap: 4px; border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) 0; }
.cmr-addview:hover { color: var(--mp-text-link); }
.cmr-allviews { border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); padding: var(--mp-spacing-3) 0; text-decoration: underline; text-underline-offset: 2px; }
.cmr-viewbar-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.cmr-collapse-all { border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.cmr-fs-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default, #536062); }
.cmr-fs-btn:hover { background: var(--mp-background-neutral-subtle); }

/* Report */
.cmr-report { display: flex; flex-direction: column; }
.cmr-fs-topbar { display: flex; justify-content: flex-end; }
.cmr-report-head { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-2) 0; }
.cmr-report-range { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cmr-report-updated { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cmr-info-banner { display: inline-flex; align-items: center; gap: 6px; margin: 0 0 var(--mp-spacing-2); padding: 6px 12px; border-radius: var(--mp-radii-md, 8px); background: var(--mp-background-information-subtle, #eaf2fd); color: var(--mp-text-information, #165082); font-size: var(--mp-font-sizes-sm); }

.cmr-table-wrap { overflow-x: auto; }
.cmr-table { width: 100%; min-width: 900px; border-collapse: collapse; table-layout: fixed; }
.cmr-col-date { width: 14%; } .cmr-col-number { width: 28%; } .cmr-col-desc { width: 15%; }
.cmr-col-status { width: 11%; } .cmr-col-movement { width: 15%; } .cmr-col-balance { width: 17%; }

.cmr-th { padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral-subtle); border-top: 1px solid var(--mp-border-default); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; letter-spacing: 0.3px; color: var(--mp-text-secondary); text-align: left; white-space: nowrap; }
.cmr-th--right { text-align: right; }
.cmr-td { height: 40px; padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
.cmr-td--l3 { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cmr-saldo-awal { padding-left: 4px; color: var(--mp-text-secondary); }
.cmr-txn-link { color: var(--mp-text-link); cursor: pointer; }
.cmr-txn-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.cmr-row--end .cmr-td { border-top: 1px solid var(--mp-border-default); }

/* Status badges */
.cmr-badge { display: inline-flex; align-items: center; padding: 1px 8px; border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-medium, 500); }
.cmr-badge--active { background: var(--mp-background-success-subtle, #e6f4ea); color: var(--mp-text-success, #12805c); }
.cmr-badge--partial { background: var(--mp-background-warning-subtle, #fdf1dd); color: var(--mp-text-warning, #b54708); }
.cmr-badge--used { background: var(--mp-background-danger-subtle, #fdecec); color: var(--mp-text-danger, #c62828); }
/* Mutation type chip */
.cmr-type { display: inline-flex; align-items: center; padding: 0 6px; border-radius: var(--mp-radii-sm, 4px); font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-medium, 500); }
.cmr-type--pos { background: var(--mp-background-success-subtle, #e6f4ea); color: var(--mp-text-success, #12805c); }
.cmr-type--neg { background: var(--mp-background-neutral-subtle, #eceef0); color: var(--mp-text-secondary); }

/* Empty state */
.cmr-empty { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.cmr-empty--idle { padding: 72px 0 64px; }
.cmr-skel { display: inline-block; background-color: var(--mp-border-default) !important; background-image: none !important; animation: none !important; }
.cmr-empty-img { width: 240px; height: 200px; object-fit: contain; }
.cmr-empty-title { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cmr-empty-desc { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.cmr-empty-cta { margin-top: var(--mp-spacing-3); height: 36px; padding: 0 var(--mp-spacing-4); border: 1px solid var(--mp-border-bold); background: var(--mp-background-neutral); border-radius: var(--mp-radii-full, 999px); cursor: pointer; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); }

/* Save-view / all-views drawers */
.cmr-vd-enter-active, .cmr-vd-leave-active { transition: background-color 200ms ease; }
.cmr-vd-enter-from, .cmr-vd-leave-to { background-color: transparent; }
.cmr-vd-enter-active .cmr-vd-panel { transition: transform 300ms ease-out; }
.cmr-vd-enter-from .cmr-vd-panel, .cmr-vd-leave-to .cmr-vd-panel { transform: translateX(calc(100% + 12px)); }
.cmr-vd-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.cmr-vd-panel { margin: var(--mp-spacing-3); width: min(400px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden; }
.cmr-vd-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.cmr-vd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cmr-vd-close { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.cmr-vd-close:hover { background: var(--mp-background-neutral-hovered); }
.cmr-vd-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cmr-vd-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cmr-vd-input { height: 36px; padding: 0 var(--mp-spacing-3); border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md, 6px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; }
.cmr-vd-input:focus { border-color: var(--mp-border-brand, #0a6e4e); }
.cmr-vd-hint { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cmr-vd-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.cmr-vd-btn { height: 36px; padding: 0 var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium, 500); cursor: pointer; border: 1px solid transparent; }
.cmr-vd-btn--ghost { background: transparent; color: var(--mp-text-default); }
.cmr-vd-btn--ghost:hover { background: var(--mp-background-neutral-hovered); }
.cmr-vd-btn--primary { background: var(--mp-background-brand-bold, #0a6e4e); color: #fff; }
.cmr-view-item { text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); flex: 1; }
.cmr-view-item:hover { background: var(--mp-background-neutral-subtle); }
.cmr-view-item.is-active { background: var(--mp-background-brand-subtle, #e8f5f0); color: var(--mp-text-brand, #0a6e4e); font-weight: var(--mp-font-weights-medium, 500); }
.cmr-view-item-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.cmr-view-del { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-subtle, #97a0af); }
.cmr-view-del:hover { background: var(--mp-background-danger-subtle, #fdecec); color: var(--mp-text-danger, #c62828); }

.cmr--full { padding: var(--mp-spacing-3); box-sizing: border-box; background: var(--mp-background-neutral-subtle); }
.cmr--full .cmr-stage { border: 1px solid var(--mp-border-default); border-radius: 12px; padding-top: var(--mp-spacing-4); }
</style>
