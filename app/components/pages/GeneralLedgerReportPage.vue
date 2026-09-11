<script setup lang="ts">
/**
 * General Ledger report — Reports › Financials › General Ledger.
 * Figma "Report / General Ledger / Activate Dimension" 4345-174595.
 *
 * Every posting for the period, grouped by account (collapsible): a starting
 * balance, the transactions with their running balance, then an end balance
 * carrying the period's debit and credit totals.
 *
 * The Dimensions column is off by default and turned on from Column settings —
 * that's the "Activate Dimension" story in the Figma: with it on, each line
 * shows the dimension tags it was posted with.
 *
 * Same shell as the other Financials reports (see MultidimensionalReportPage):
 * idle → loading → ready, saved views, All filters, Airene, Export, full screen.
 */
import { ref, computed, reactive, watch, nextTick, onBeforeUnmount } from 'vue'
import { useReportFullscreen } from '~/composables/useReportFullscreen'
import { useAireneBridge } from '~/composables/useAireneBridge'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { MpIcon, MpTooltip, MpSkeleton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast } from '@mekari/pixel3'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import GeneralLedgerFiltersDrawer from '~/components/patterns/GeneralLedgerFiltersDrawer.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import { ledgerAccounts, emptyGlFilters, type GlAccount, type GlEntry, type GlFilters } from '~/data/generalLedgerReport'
import { usingDemoDimensions } from '~/data/multidimensionalReport'

const { t } = useLocale()
const router = useRouter()

// ── Period ───────────────────────────────────────────────────────────────────
function d(y: number, m: number, day: number) { return new Date(y, m, day) }
const pendingRange = ref<Date[]>([d(2025, 11, 1), d(2025, 11, 31)])
const appliedRange = ref<Date[]>([d(2025, 11, 1), d(2025, 11, 31)])
const formError = ref('')
function onPendingChange(v: Date[]) { pendingRange.value = v; formError.value = '' }

// ── Report generation — idle (prompt) → loading (skeleton) → ready ───────────
const reportState = ref<'idle' | 'loading' | 'ready'>('idle')
let genTimer: ReturnType<typeof setTimeout> | null = null
function generate() {
  reportState.value = 'loading'
  if (genTimer) clearTimeout(genTimer)
  genTimer = setTimeout(() => { reportState.value = 'ready' }, 1100)
}
onBeforeUnmount(() => { if (genTimer) clearTimeout(genTimer) })

function applyReport() {
  const [s, e] = pendingRange.value
  if (!s || !e) { formError.value = t('You must fill in date range'); return }
  if (s > e) { formError.value = t('Start date cannot be after end date.'); return }
  formError.value = ''
  appliedRange.value = [...pendingRange.value]
  generate()
}

// ── Filters ──────────────────────────────────────────────────────────────────
const filters = reactive<GlFilters>(emptyGlFilters())
const drawerOpen = ref(false)
function onApplyFilters(v: GlFilters) {
  filters.accountKeyword = v.accountKeyword
  filters.types = [...v.types]
  filters.hideEmpty = v.hideEmpty
  if (reportState.value !== 'idle') generate()
}
const activeFilterCount = computed(() => filters.types.length + (filters.accountKeyword ? 1 : 0) + (filters.hideEmpty ? 1 : 0))
function resetFilters() { filters.accountKeyword = ''; filters.types = []; filters.hideEmpty = false }
function removeType(x: string) { filters.types = filters.types.filter((v) => v !== x) }

// ── Columns — Date and Number are fixed; Dimensions starts off (Figma) ───────
// The Dimension column is only offered once Settings > Dimensions is activated;
// before that it could only ever render an empty column, so it's dropped from
// Column settings entirely and forced off.
const { dimensionsActivated } = useDimensionsActivation()
const COLUMNS = [
  { key: 'date', label: 'Date', locked: true },
  { key: 'number', label: 'Number', locked: true },
  { key: 'detail', label: 'Detail' },
  { key: 'dimension', label: 'Dimension' },
  { key: 'debit', label: 'Debit' },
  { key: 'credit', label: 'Credit' },
  { key: 'balance', label: 'Balance' },
]
const colVis = reactive<Record<string, boolean>>({
  date: true, number: true, detail: true, dimension: false, debit: true, credit: true, balance: true,
})
const columnItems = computed(() =>
  COLUMNS.filter((c) => c.key !== 'dimension' || dimensionsActivated.value)
    .map((c) => ({ key: c.key, label: t(c.label), disabled: c.locked })))
const show = (k: string) => (k === 'dimension' ? dimensionsActivated.value && colVis[k] !== false : colVis[k] !== false)
/** Tags fall back to a sample set while no reportable dimension exists. */
const isDemoDimensions = computed(() => usingDemoDimensions())
/** Columns spanned by the "Starting balance" / "End balance" label cell. */
const labelSpan = computed(() => COLUMNS.filter((c) => show(c.key) && c.key !== 'debit' && c.key !== 'credit' && c.key !== 'balance').length)

// ── Rows ─────────────────────────────────────────────────────────────────────
const allAccounts = computed<GlAccount[]>(() => (reportState.value === 'idle' ? [] : ledgerAccounts(appliedRange.value)))

function matchesAccount(a: GlAccount) {
  const q = filters.accountKeyword.trim().toLowerCase()
  if (!q) return true
  return a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)
}
function keepEntry(e: GlEntry) { return !filters.types.length || filters.types.includes(e.type) }

/** Accounts after filtering, with their entry lists narrowed to match. */
const accounts = computed(() =>
  allAccounts.value
    .filter(matchesAccount)
    .map((a) => {
      const entries = a.entries.filter(keepEntry)
      const totalDebit = entries.reduce((s, e) => s + e.debit, 0)
      const totalCredit = entries.reduce((s, e) => s + e.credit, 0)
      return { ...a, entries, totalDebit, totalCredit, endBalance: a.startingBalance + totalDebit - totalCredit }
    })
    .filter((a) => !filters.hideEmpty || a.entries.length > 0))

const hasRows = computed(() => accounts.value.length > 0)
const entryTypeOptions = computed(() => [...new Set(allAccounts.value.flatMap((a) => a.entries.map((e) => e.type)))].sort())

// ── Expand / collapse — every account starts expanded (Figma) ────────────────
const collapsed = ref<Set<string>>(new Set())
const isOpen = (code: string) => !collapsed.value.has(code)
function toggleAccount(code: string) {
  const s = new Set(collapsed.value)
  s.has(code) ? s.delete(code) : s.add(code)
  collapsed.value = s
}
const allCollapsed = computed(() => hasRows.value && accounts.value.every((a) => collapsed.value.has(a.code)))
function toggleAll() {
  collapsed.value = allCollapsed.value ? new Set() : new Set(accounts.value.map((a) => a.code))
}

/** Money cell: negatives render in parentheses, per the Figma. */
function money(n: number): string { return n < 0 ? `(${formatIDR(Math.abs(n))})` : formatIDR(n) }

// ── Captions ─────────────────────────────────────────────────────────────────
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function fmtDay(x: Date) { return `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}` }
const rangeCaption = computed(() => { const [s, e] = appliedRange.value; return s && e ? `${fmtDay(s)} - ${fmtDay(e)}` : '' })
const lastUpdated = (() => {
  const now = new Date()
  return `Last updated on ${fmtDay(now)}, ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')} (GMT+7)`
})()

// ── Saved views ──────────────────────────────────────────────────────────────
interface GlView { id: string; name: string; filters: GlFilters }
const views = reactive<GlView[]>([])
const activeViewId = ref('default')
function selectView(id: string) {
  activeViewId.value = id
  const v = views.find((x) => x.id === id)
  if (v) {
    filters.accountKeyword = v.filters.accountKeyword
    filters.types = [...v.filters.types]
    filters.hideEmpty = v.filters.hideEmpty
  } else resetFilters()
  if (reportState.value !== 'idle') generate()
}
const addingView = ref(false)
const newViewName = ref('')
const newViewInput = ref<HTMLInputElement | null>(null)
function startAddView() { addingView.value = true; newViewName.value = ''; nextTick(() => newViewInput.value?.focus()) }
function commitAddView() {
  if (!addingView.value) return
  const name = newViewName.value.trim()
  addingView.value = false
  if (!name) return
  const v: GlView = { id: `glview-${Date.now()}`, name, filters: { ...filters, types: [...filters.types] } }
  views.push(v)
  activeViewId.value = v.id
  toast.notify({ variant: 'success', title: t('View saved'), rootProps: { class: 'toast-enterprise' } })
}
function cancelAddView() { addingView.value = false }

const editingViewId = ref('')
const editViewName = ref('')
function startEditView(v: GlView) {
  editingViewId.value = v.id; editViewName.value = v.name
  nextTick(() => { const el = document.querySelector('.glr-view-edit') as HTMLInputElement | null; el?.focus(); el?.select() })
}
function commitEditView() {
  if (!editingViewId.value) return
  const name = editViewName.value.trim()
  const v = views.find((x) => x.id === editingViewId.value)
  editingViewId.value = ''
  if (name && v) { v.name = name; toast.notify({ variant: 'success', title: t('View renamed'), rootProps: { class: 'toast-enterprise' } }) }
}
function cancelEditView() { editingViewId.value = '' }

const delViewOpen = ref(false)
const delViewTarget = ref<GlView | null>(null)
function askDeleteView(v: GlView) { delViewTarget.value = v; delViewOpen.value = true }
function confirmDeleteView() {
  const v = delViewTarget.value; if (!v) return
  const i = views.findIndex((x) => x.id === v.id)
  if (i !== -1) views.splice(i, 1)
  if (activeViewId.value === v.id) activeViewId.value = 'default'
  delViewTarget.value = null
  toast.notify({ variant: 'success', title: t('View deleted'), rootProps: { class: 'toast-enterprise' } })
}
const allViewsOpen = ref(false)

// ── Full screen ──────────────────────────────────────────────────────────────
const fullscreen = ref(false)
const { isReportFullscreen } = useReportFullscreen()
watch(fullscreen, (v) => { isReportFullscreen.value = v })
onBeforeUnmount(() => { isReportFullscreen.value = false })

// ── Airene — grounded on this report ─────────────────────────────────────────
const aireneBridge = useAireneBridge()
const AIRENE_SUGGESTIONS = [
  'Which account moved the most this period?',
  'Show me the largest postings in this ledger',
  'Which accounts ended with a negative balance?',
  'Summarise this report in 3 bullets',
]
function buildReportGround(): string {
  if (reportState.value !== 'ready') {
    return 'General Ledger report (Reports › Financials › General Ledger), IDR. No report generated yet — the user has not applied a period.'
  }
  const lines = accounts.value.map((a) =>
    `- ${a.code} ${a.name}: starting ${formatIDR(a.startingBalance)}, ${a.entries.length} postings, `
    + `debit ${formatIDR(a.totalDebit)}, credit ${formatIDR(a.totalCredit)}, ending ${formatIDR(a.endBalance)}`)
  return `General Ledger report (Reports › Financials › General Ledger), IDR, read-only. `
    + `Postings for ${rangeCaption.value}, grouped by account.\n${lines.join('\n')}\n`
    + `Balance runs from the starting balance down the rows (debit adds, credit subtracts). `
    + `Amounts in parentheses are negative.`
}
function openAirene() { aireneBridge.openWithContext(buildReportGround(), 'General Ledger report', AIRENE_SUGGESTIONS) }

// ── Export ───────────────────────────────────────────────────────────────────
const exporting = ref(false)
function exportExcel() {
  if (exporting.value || reportState.value !== 'ready') { infoToast(t('Generate the report first.')); return }
  exporting.value = true
  toast.notify({ variant: 'information', title: t('Your file is being prepared. You’ll be notified when it’s ready to download.'), rootProps: { class: 'toast-enterprise' } })
  window.setTimeout(() => {
    exporting.value = false
    const esc = (v: unknown) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
    const header = ['Account', 'Date', 'Number', 'Detail', ...(show('dimension') ? ['Dimensions'] : []), 'Debit', 'Credit', 'Balance']
    const lines = [`General Ledger — ${rangeCaption.value}`, header.join(',')]
    for (const a of accounts.value) {
      const label = `${a.code} ${a.name}`
      lines.push([label, '', 'Starting balance', '', ...(show('dimension') ? [''] : []), '', '', a.startingBalance].map(esc).join(','))
      for (const e of a.entries) {
        lines.push([label, e.date, e.number, e.detail, ...(show('dimension') ? [e.dimensions.map((x) => `${x.name}: ${x.value}`).join('; ')] : []), e.debit, e.credit, e.balance].map(esc).join(','))
      }
      lines.push([label, '', 'End balance', '', ...(show('dimension') ? [''] : []), a.totalDebit, a.totalCredit, a.endBalance].map(esc).join(','))
    }
    const blob = new Blob([`﻿${lines.join('\r\n')}`], { type: 'text/csv;charset=utf-8;' })
    const el = document.createElement('a'); el.href = URL.createObjectURL(blob); el.download = 'general-ledger.csv'; el.click(); URL.revokeObjectURL(el.href)
    toast.notify({ variant: 'success', title: t('File ready to download'), description: t('Saved to Export history for 7 days.'), rootProps: { class: 'toast-enterprise' } })
  }, 1600)
}
function exportPdf() { infoToast(t('PDF export — coming soon')) }
</script>

<template>
  <div class="glr" :class="{ 'glr--full': fullscreen }">
    <!-- ── Title bar ── -->
    <header v-if="!fullscreen" class="glr-titlebar">
      <div class="glr-titlebar-left">
        <button class="glr-breadcrumb" type="button" @click="router.push('/financial-report')">{{ t('Financials') }}</button>
        <h1 class="glr-title">{{ t('General Ledger') }} <span class="glr-title-cur">(IDR)</span></h1>
      </div>
    </header>

    <div class="glr-stage">
      <!-- ── Controls ── -->
      <div v-if="!fullscreen" class="glr-controls">
        <div class="glr-controls-left">
          <div class="glr-datefield">
            <AdvancedDateRangePicker
              id="glr-date"
              :model-value="pendingRange"
              is-full-width
              period-mode
              label-prefix-mode
              :placeholder="t('Select date')"
              @update:model-value="onPendingChange"
            />
          </div>
          <button class="glr-apply" type="button" @click="applyReport">{{ t('Apply') }}</button>
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="drawerOpen = true">
            <MpIcon name="filter" size="sm" /> {{ t('All filters') }}
            <span v-if="activeFilterCount" class="glr-allfilters-count">{{ activeFilterCount }}</span>
          </button>
        </div>

        <div class="glr-controls-right">
          <MpTooltip id="glr-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
            <button class="glr-icon-btn glr-icon-btn--airene" type="button" :aria-label="t('Ask Airene')" @click="openAirene">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>

          <ColumnSettingsMenu id="glr-columns" :items="columnItems" :visibility="colVis" :tooltip="t('Column settings')" />

          <MpPopover id="glr-export" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="btn-enterprise btn-enterprise--secondary glr-export" type="button">
                {{ t('Export') }}
                <MpIcon name="caret-down" size="sm" />
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
              <MpPopoverList>
                <MpPopoverListItem @click="exportExcel">{{ t('Export to Excel') }}</MpPopoverListItem>
                <MpPopoverListItem @click="exportPdf">{{ t('Export to PDF') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
      <p v-if="!fullscreen && formError" class="glr-form-error">{{ formError }}</p>
      <p v-if="!fullscreen && show('dimension') && isDemoDimensions" class="glr-demo-note">
        {{ t('Showing sample dimensions.') }}
        <a class="glr-demo-link" @click="router.push('/dimensions')">{{ t('Set up your dimensions') }}</a>
      </p>

      <!-- Active-filter badges -->
      <div v-if="!fullscreen && activeFilterCount" class="glr-badges">
        <span v-if="filters.accountKeyword" class="glr-fbadge">“{{ filters.accountKeyword }}”<button type="button" :aria-label="t('Remove')" @click="filters.accountKeyword = ''"><MpIcon name="close" size="sm" /></button></span>
        <span v-for="x in filters.types" :key="x" class="glr-fbadge">{{ x }}<button type="button" :aria-label="t('Remove')" @click="removeType(x)"><MpIcon name="close" size="sm" /></button></span>
        <span v-if="filters.hideEmpty" class="glr-fbadge">{{ t('Hiding accounts with no postings') }}<button type="button" :aria-label="t('Remove')" @click="filters.hideEmpty = false"><MpIcon name="close" size="sm" /></button></span>
        <button class="glr-reset" type="button" @click="resetFilters">{{ t('Reset filter') }}</button>
      </div>

      <!-- ── View tabs ── -->
      <div v-if="!fullscreen" class="glr-viewbar">
        <div class="glr-views">
          <button class="glr-viewtab" :class="{ 'is-active': activeViewId === 'default' }" type="button" @click="selectView('default')">{{ t('Default view') }}</button>

          <template v-for="v in views" :key="v.id">
            <span v-if="editingViewId === v.id" class="glr-viewtab glr-viewtab--editing">
              <input v-model="editViewName" class="glr-viewtab-input glr-view-edit" @keydown.enter.prevent="commitEditView" @keydown.esc="cancelEditView" @blur="commitEditView" />
            </span>
            <span v-else class="glr-viewtab-wrap">
              <button class="glr-viewtab" :class="{ 'is-active': activeViewId === v.id }" type="button" @click="selectView(v.id)">{{ v.name }}</button>
              <MpPopover :id="`glr-view-${v.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                <MpPopoverTrigger>
                  <button class="glr-view-kebab" type="button" :aria-label="t('View options')"><MpIcon name="menu-kebab" size="sm" /></button>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
                  <MpPopoverList>
                    <MpPopoverListItem @click="startEditView(v)">{{ t('Edit view name') }}</MpPopoverListItem>
                    <MpPopoverListItem @click="askDeleteView(v)">{{ t('Delete') }}</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
            </span>
          </template>

          <span v-if="addingView" class="glr-viewtab glr-viewtab--editing">
            <input ref="newViewInput" v-model="newViewName" class="glr-viewtab-input" :placeholder="t('View name')" @keydown.enter.prevent="commitAddView" @keydown.esc="cancelAddView" @blur="commitAddView" />
          </span>
          <button v-else class="glr-addview" type="button" @click="startAddView"><MpIcon name="add" size="sm" /> {{ t('Add view') }}</button>

          <button class="glr-allviews" type="button" @click="allViewsOpen = true">{{ t('All views') }}</button>
        </div>
        <div class="glr-viewbar-right">
          <button v-if="reportState === 'ready' && hasRows" class="glr-collapse-all" type="button" @click="toggleAll">{{ allCollapsed ? t('Expand all') : t('Collapse all') }}</button>
          <MpTooltip id="glr-fs-enter" :label="t('Full screen')" placement="bottom-end" use-portal>
            <button class="glr-fs-btn" type="button" :aria-label="t('Full screen')" @click="fullscreen = true"><MpIcon name="full-screen" size="md" /></button>
          </MpTooltip>
        </div>
      </div>

      <!-- ── Report ── -->
      <div class="glr-report">
        <div v-if="fullscreen" class="glr-fs-topbar">
          <span class="glr-fs-title">{{ t('General Ledger') }} <span class="glr-title-cur">(IDR)</span></span>
          <MpTooltip id="glr-fs-exit" :label="t('Exit full screen')" placement="bottom-end" use-portal>
            <button class="glr-fs-btn" type="button" :aria-label="t('Exit full screen')" @click="fullscreen = false"><MpIcon name="minimize" size="md" /></button>
          </MpTooltip>
        </div>

        <!-- Idle -->
        <div v-if="reportState === 'idle'" class="glr-empty glr-empty--idle">
          <img src="/illustrations/report-empty.png" alt="" class="glr-empty-img" width="240" height="200" />
          <p class="glr-empty-title">{{ t('Report data will appear here') }}</p>
          <p class="glr-empty-desc">{{ t('Select a date range, then click Apply button.') }}</p>
        </div>

        <template v-else>
          <div class="glr-report-head">
            <span class="glr-report-range">{{ rangeCaption }}</span>
            <span class="glr-report-updated">{{ lastUpdated }}</span>
          </div>

          <!-- Loading skeleton -->
          <div v-if="reportState === 'loading'" class="glr-table-wrap">
            <table class="glr-table">
              <thead>
                <tr>
                  <th v-for="c in COLUMNS.filter((x) => show(x.key))" :key="c.key" class="glr-th" :class="{ 'glr-th--num': c.key === 'debit' || c.key === 'credit' || c.key === 'balance' }">{{ t(c.label) }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="n in 6" :key="n" class="glr-row">
                  <td v-for="c in COLUMNS.filter((x) => show(x.key))" :key="c.key" class="glr-td" :class="{ 'glr-td--num': c.key === 'debit' || c.key === 'credit' || c.key === 'balance' }">
                    <MpSkeleton class="glr-skel" height="10px" rounded="sm" duration="0s" :width="c.key === 'debit' || c.key === 'credit' || c.key === 'balance' ? '96px' : '140px'" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Ready + data -->
          <div v-else-if="hasRows" class="glr-table-wrap">
            <table class="glr-table">
              <thead>
                <tr>
                  <th v-if="show('date')" class="glr-th glr-th--date">{{ t('Date') }}</th>
                  <th v-if="show('number')" class="glr-th glr-th--number">{{ t('Number') }}</th>
                  <th v-if="show('detail')" class="glr-th glr-th--detail">{{ t('Detail') }}</th>
                  <th v-if="show('dimension')" class="glr-th glr-th--dimension">{{ t('Dimensions') }}</th>
                  <th v-if="show('debit')" class="glr-th glr-th--num">{{ t('Debit') }}</th>
                  <th v-if="show('credit')" class="glr-th glr-th--num">{{ t('Credit') }}</th>
                  <th v-if="show('balance')" class="glr-th glr-th--num">{{ t('Balance') }}</th>
                </tr>
              </thead>

              <tbody v-for="a in accounts" :key="a.code">
                <!-- Account band — click to collapse -->
                <tr class="glr-row glr-row--account" @click="toggleAccount(a.code)">
                  <td class="glr-td glr-td--account" :colspan="COLUMNS.filter((c) => show(c.key)).length">
                    <span class="glr-account">
                      <MpIcon :name="isOpen(a.code) ? 'caret-down' : 'caret-right'" size="sm" class="glr-chev" />
                      {{ a.code }} {{ a.name.toUpperCase() }}
                    </span>
                  </td>
                </tr>

                <template v-if="isOpen(a.code)">
                  <!-- Starting balance -->
                  <tr class="glr-row glr-row--balance">
                    <td class="glr-td" :colspan="labelSpan">{{ t('Starting balance') }}</td>
                    <td v-if="show('debit')" class="glr-td glr-td--num" />
                    <td v-if="show('credit')" class="glr-td glr-td--num" />
                    <td v-if="show('balance')" class="glr-td glr-td--num">{{ money(a.startingBalance) }}</td>
                  </tr>

                  <!-- Postings -->
                  <tr v-for="e in a.entries" :key="e.id" class="glr-row">
                    <td v-if="show('date')" class="glr-td">{{ formatDate(e.date) }}</td>
                    <td v-if="show('number')" class="glr-td">
                      <a class="glr-number-link" @click.stop="infoToast(`${e.number} — ${t('opening transaction')}`)">{{ e.number }}</a>
                    </td>
                    <td v-if="show('detail')" class="glr-td">{{ e.detail }}</td>
                    <td v-if="show('dimension')" class="glr-td glr-td--dimension">
                      <span v-for="dim in e.dimensions" :key="dim.name" class="glr-dim-chip">{{ dim.name }}: {{ dim.value }}</span>
                    </td>
                    <td v-if="show('debit')" class="glr-td glr-td--num">{{ money(e.debit) }}</td>
                    <td v-if="show('credit')" class="glr-td glr-td--num">{{ money(e.credit) }}</td>
                    <td v-if="show('balance')" class="glr-td glr-td--num">{{ money(e.balance) }}</td>
                  </tr>

                  <!-- End balance -->
                  <tr class="glr-row glr-row--balance glr-row--end">
                    <td class="glr-td glr-strong" :colspan="labelSpan">{{ t('End balance') }}</td>
                    <td v-if="show('debit')" class="glr-td glr-td--num glr-strong">{{ money(a.totalDebit) }}</td>
                    <td v-if="show('credit')" class="glr-td glr-td--num glr-strong">{{ money(a.totalCredit) }}</td>
                    <td v-if="show('balance')" class="glr-td glr-td--num glr-strong">{{ money(a.endBalance) }}</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <!-- Ready, but nothing matches -->
          <div v-else class="glr-empty">
            <img src="/illustrations/empty-folder.png" alt="" class="glr-empty-img" width="240" height="200" />
            <p class="glr-empty-title">{{ t('No data matches this filter.') }}</p>
            <button class="glr-empty-cta" type="button" @click="resetFilters">{{ t('Reset filter') }}</button>
          </div>
        </template>
      </div>
    </div>

    <!-- ── All filters drawer ── -->
    <GeneralLedgerFiltersDrawer
      v-model:is-open="drawerOpen"
      :model-value="filters"
      :type-options="entryTypeOptions"
      @apply="onApplyFilters"
    />

    <!-- ── All views drawer ── -->
    <Transition name="glr-vd">
      <div v-if="allViewsOpen" class="glr-vd-overlay" @click.self="allViewsOpen = false">
        <div class="glr-vd-panel" role="dialog" :aria-label="t('All views')">
          <header class="glr-vd-head">
            <span class="glr-vd-title">{{ t('All views') }}</span>
            <button class="glr-vd-close" type="button" :aria-label="t('Close')" @click="allViewsOpen = false"><MpIcon name="close" size="md" /></button>
          </header>
          <div class="glr-vd-body">
            <button class="glr-view-item" :class="{ 'is-active': activeViewId === 'default' }" type="button" @click="selectView('default'); allViewsOpen = false">{{ t('Default view') }}</button>
            <div v-for="v in views" :key="v.id" class="glr-view-item-row">
              <button class="glr-view-item" :class="{ 'is-active': activeViewId === v.id }" type="button" @click="selectView(v.id); allViewsOpen = false">{{ v.name }}</button>
              <button class="glr-view-del" type="button" :aria-label="t('Delete')" @click="askDeleteView(v)"><MpIcon name="trash" size="sm" /></button>
            </div>
            <p v-if="!views.length" class="glr-vd-hint">{{ t('Saved views will appear here.') }}</p>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ── Delete view confirmation ── -->
    <ConfirmModal
      v-model:is-open="delViewOpen"
      :title="t('Delete view')"
      :description="`“${delViewTarget?.name}” ${t('will be permanently deleted.')}`"
      :confirm-label="t('Delete')"
      :cancel-label="t('Cancel')"
      is-danger
      @confirm="confirmDeleteView"
    />
  </div>
</template>

<style scoped>
.glr { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.glr-titlebar { flex-shrink: 0; min-height: 72px; background: var(--mp-background-neutral-subtle); display: flex; align-items: center; padding: 0 var(--mp-spacing-6); }
.glr-titlebar-left { display: flex; flex-direction: column; justify-content: center; }
.glr-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-link); font-family: inherit; }
.glr-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.glr-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.glr-title-cur { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }

.glr-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); border-top-left-radius: var(--mp-radii-lg, 12px); padding: var(--mp-spacing-5, 20px) var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); display: flex; flex-direction: column; gap: var(--mp-spacing-3, 12px); }

.glr-controls { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.glr-controls-left { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.glr-controls-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.glr-datefield { display: flex; flex-direction: column; gap: var(--mp-spacing-1); width: 220px; }
.glr-apply { height: 36px; padding: 0 var(--mp-spacing-4); border: none; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-brand-bold, #0a6e4e); color: #fff; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold, 600); cursor: pointer; font-family: inherit; }
.glr-apply:hover { background: var(--mp-background-brand-bold-hovered, #095c41); }
.glr-allfilters-count { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; height: 18px; padding: 0 5px; margin-left: 2px; border-radius: 999px; background: var(--mp-background-brand-bold, #0a6e4e); color: #fff; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); }
.glr-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default); }
.glr-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.glr-icon-btn--airene { color: var(--mp-airene-default, #7c3aed); }
.glr-export { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.glr-form-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c62828); }
.glr-demo-note { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.glr-demo-link { color: var(--mp-text-link); cursor: pointer; }
.glr-demo-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.glr-badges { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.glr-fbadge { display: inline-flex; align-items: center; gap: 4px; height: 26px; padding: 0 var(--mp-spacing-2) 0 var(--mp-spacing-3); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle, #eceef0); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-default); }
.glr-fbadge button { display: inline-flex; align-items: center; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); padding: 0; }
.glr-fbadge button:hover { color: var(--mp-text-default); }
.glr-reset { border: none; background: none; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); text-decoration: underline; text-underline-offset: 2px; font-family: inherit; }

.glr-viewbar { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--mp-border-default); }
.glr-views { display: flex; align-items: center; gap: var(--mp-spacing-5); }
.glr-viewtab { position: relative; border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); padding: var(--mp-spacing-3) 0; }
.glr-viewtab:not(.is-active):hover { color: var(--mp-text-default); }
.glr-viewtab.is-active { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); }
.glr-viewtab.is-active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--mp-text-selected); border-radius: 2px 2px 0 0; }
.glr-addview { display: inline-flex; align-items: center; gap: 4px; border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) 0; }
.glr-addview:hover { color: var(--mp-text-link); }
.glr-allviews { border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); padding: var(--mp-spacing-3) 0; text-decoration: underline; text-underline-offset: 2px; }
.glr-viewtab-wrap { display: inline-flex; align-items: center; gap: 2px; }
.glr-viewtab-wrap .glr-viewtab { padding-right: 0; }
.glr-view-kebab { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); border-radius: var(--mp-radii-sm, 4px); visibility: hidden; }
.glr-viewtab-wrap:hover .glr-view-kebab,
.glr-viewtab-wrap:focus-within .glr-view-kebab { visibility: visible; }
.glr-view-kebab:hover { background: var(--mp-background-neutral-subtle); color: var(--mp-text-default); }
.glr-viewtab--editing { display: inline-flex; align-items: center; padding: var(--mp-spacing-2) 0; }
.glr-viewtab-input { width: 140px; height: 28px; padding: 0 8px; border: 1px solid var(--mp-border-brand, #0a6e4e); border-radius: var(--mp-radii-md, 6px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; font-family: inherit; }
.glr-viewbar-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.glr-collapse-all { border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.glr-fs-btn { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default, #536062); }
.glr-fs-btn:hover { background: var(--mp-background-neutral-subtle); }

.glr-report { display: flex; flex-direction: column; min-width: 0; }
.glr-fs-topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--mp-spacing-2); }
.glr-fs-title { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.glr-report-head { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-2) 0; }
.glr-report-range, .glr-report-updated { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }

.glr-table-wrap { overflow-x: auto; }
.glr-table { width: 100%; min-width: 900px; border-collapse: collapse; }
.glr-th {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle, #f4f5f7);
  border-top: 1px solid var(--mp-border-default);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: 0.3px; color: var(--mp-text-secondary);
  text-align: left; white-space: nowrap;
}
.glr-th--num { text-align: right; }
.glr-th--date { width: 120px; }
.glr-th--number { width: 200px; }
.glr-th--detail { width: 180px; }
.glr-th--dimension { width: 280px; }

.glr-td {
  height: 40px; padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default);
  vertical-align: middle; white-space: nowrap;
}
.glr-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.glr-strong { font-weight: var(--mp-font-weights-semi-bold, 600); }

/* Account band — gray row spanning the table; click to collapse. */
.glr-row--account { cursor: pointer; }
.glr-td--account { background: var(--mp-background-neutral-subtle, #f4f5f7); height: 32px; }
.glr-row--account:hover .glr-td--account { background: var(--mp-background-neutral-hovered, #eef0f3); }
.glr-account { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold, 600); letter-spacing: 0.3px; color: var(--mp-text-default); }
.glr-chev { color: var(--mp-icon-default, #536062); flex-shrink: 0; }

.glr-row--balance .glr-td { font-weight: var(--mp-font-weights-semi-bold, 600); }
.glr-row--end .glr-td { border-top: 1px solid var(--mp-border-default); }
.glr-row:not(.glr-row--account):hover .glr-td { background: var(--mp-background-neutral-subtle, #f8f9f9); }

.glr-number-link { color: var(--mp-text-link); cursor: pointer; }
.glr-number-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Dimension tags — chips wrapped inside the cell (Figma 4345-174603). */
.glr-td--dimension { white-space: normal; padding-top: var(--mp-spacing-2); padding-bottom: var(--mp-spacing-2); }
.glr-dim-chip {
  display: inline-flex; align-items: center; margin: 2px 4px 2px 0;
  padding: 1px var(--mp-spacing-2); border-radius: var(--mp-radii-sm, 4px);
  background: var(--mp-background-neutral-subtle, #f0f1f3);
  font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); white-space: nowrap;
}

.glr-empty { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.glr-empty--idle { padding: 72px 0 64px; }
.glr-empty-img { width: 240px; height: 200px; object-fit: contain; }
.glr-empty-title { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.glr-empty-desc { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.glr-empty-cta { margin-top: var(--mp-spacing-3); height: 36px; padding: 0 var(--mp-spacing-4); border: 1px solid var(--mp-border-bold); background: var(--mp-background-neutral); border-radius: var(--mp-radii-full, 999px); cursor: pointer; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); font-family: inherit; }
.glr-skel { display: inline-block; background-color: var(--mp-border-default) !important; background-image: none !important; animation: none !important; }

/* All-views drawer */
.glr-vd-enter-active, .glr-vd-leave-active { transition: background-color 200ms ease; }
.glr-vd-enter-from, .glr-vd-leave-to { background-color: transparent; }
.glr-vd-enter-active .glr-vd-panel { transition: transform 300ms ease-out; }
.glr-vd-enter-from .glr-vd-panel, .glr-vd-leave-to .glr-vd-panel { transform: translateX(calc(100% + 12px)); }
.glr-vd-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.glr-vd-panel { margin: var(--mp-spacing-3); width: min(400px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 24px; overflow: hidden; }
.glr-vd-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.glr-vd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.glr-vd-close { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.glr-vd-close:hover { background: var(--mp-background-neutral-hovered); }
.glr-vd-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.glr-vd-hint { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.glr-view-item { text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); flex: 1; font-family: inherit; }
.glr-view-item:hover { background: var(--mp-background-neutral-subtle); }
.glr-view-item.is-active { background: var(--mp-background-brand-subtle, #e8f5f0); color: var(--mp-text-brand, #0a6e4e); font-weight: var(--mp-font-weights-medium, 500); }
.glr-view-item-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.glr-view-del { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-subtle, #97a0af); }
.glr-view-del:hover { background: var(--mp-background-danger-subtle, #fdecec); color: var(--mp-text-danger, #c62828); }

.glr--full .glr-stage { border-radius: 0; padding-top: var(--mp-spacing-4); }
</style>
