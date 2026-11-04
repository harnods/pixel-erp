<script setup lang="ts">
/**
 * Credit Memo Report — Reports › Sales › Credit Memo (v3, aligned to the engineering POC).
 * Sources: Figma 4531-72195 "Credit / Debit Memo Report" (4531-72196 populated ·
 * 4531-73269 loading skeleton · 4531-75341 idle) + engineering POC v2
 * (poc-cm-report-v2.html, report half) + PRD 51218514425 / RFC 51336217071.
 * Precedence: POC behaviour → PRD/RFC → Figma visuals → docs/design/RULES.md.
 *
 * A read-only, AS-OF report grouped by contact (customer for credit memos,
 * vendor for debit memos). The single as-of date has no lower bound: every memo
 * issued on/before it is listed with its applications/refunds dated on/before it.
 * L1 contact (gray row + total remaining) → L2 memo (date · number · description ·
 * Open / Closed · original amount) → L3 entries (applied / refund with the linked
 * document beneath, movement, running balance) → End balance. Document links open
 * in a new tab (PRD VR-011-02). Toolbar: As of date + Apply + All filters | Airene ·
 * Column settings · Export ▾ (Excel only, async → real .xlsx). Saved views store
 * filters minus the as-of date. Idle → skeleton → ready, plus a full-screen mode.
 */
import { ref, computed, reactive, watch, nextTick, onBeforeUnmount } from 'vue'
import * as XLSX from 'xlsx'
import { useReportFullscreen } from '~/composables/useReportFullscreen'
import { useAireneBridge } from '~/composables/useAireneBridge'
import { useLocale } from '~/composables/useLocale'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import {
  MpButton, MpButtonGroup, MpIcon, MpTooltip, MpSkeleton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpDatePicker, css,
} from '@mekari/pixel3'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import CreditMemoFiltersDrawer from '~/components/patterns/CreditMemoFiltersDrawer.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast, successToast } from '~/utils/toasts'
import { SIM_TODAY_ISO } from '~/data/simClock'
import {
  creditMemoReport, emptyCmReportFilters, activeFilterCount as countActiveFilters, buildExport,
  contactOptions, CONTACT_GROUPS,
  creditMemoViews, addCmView, updateCmView, deleteCmView,
  type CmReportFilters, type CmSavedView, type ReportContact, type ReportEntry,
} from '~/data/creditMemoReport'

const router = useRouter()
const { t } = useLocale()
/** t() with {placeholders} — the English source keeps the braces, so one key per sentence. */
function tf(en: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), t(en))
}

// ── As-of date (single date, no lower bound — POC / RFC §6.1) ────────────────
// MpDatePicker holds DD/MM/YYYY; the filters hold ISO.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
function isoToDmy(iso: string) { const [y, m, d] = iso.split('-'); return y && m && d ? `${d}/${m}/${y}` : '' }
function dmyToIso(dmy: string) { const [d, m, y] = (dmy || '').split('/'); return y && m && d ? `${y}-${m}-${d}` : '' }
function longDate(iso: string) { const [y, m, d] = iso.split('-').map(Number); return y && m && d ? `${d} ${t(MONTHS[m - 1]!)} ${y}` : '' }

const filters = reactive<CmReportFilters>(emptyCmReportFilters())
const pendingAsOf = ref(isoToDmy(filters.asOf || SIM_TODAY_ISO))
const appliedAsOf = ref(filters.asOf || SIM_TODAY_ISO)
const asOfError = ref('')
function onAsOfChange(v: string) { pendingAsOf.value = v ?? ''; asOfError.value = '' }
// Apply generates the report for the picked date (the date alone never generates).
function applyReport() {
  const iso = dmyToIso(pendingAsOf.value)
  if (!iso) { asOfError.value = t('Select an as-of date.'); return }
  asOfError.value = ''
  filters.asOf = iso
  appliedAsOf.value = iso
  generate()
}

// ── Expand / collapse — tracked as COLLAPSED ids so everything is open by default ─
const collapsedCustomers = ref<Set<string>>(new Set())
const collapsedMemos = ref<Set<string>>(new Set())
const isCustomerOpen = (id: string) => !collapsedCustomers.value.has(id)
const isMemoOpen = (id: string) => !collapsedMemos.value.has(id)
function toggleIn(set: typeof collapsedCustomers, id: string) { const s = new Set(set.value); s.has(id) ? s.delete(id) : s.add(id); set.value = s }
function toggleCustomer(id: string) { toggleIn(collapsedCustomers, id) }
function toggleMemo(id: string, hasEntries: boolean) { if (hasEntries) toggleIn(collapsedMemos, id) }

// ── Report generation state — idle (empty prompt) → loading (skeleton) → ready ─
const reportState = ref<'idle' | 'loading' | 'ready'>('idle')
let genTimer: ReturnType<typeof setTimeout> | null = null
function generate() {
  reportState.value = 'loading'
  // Every generate opens the whole tree — all contacts AND all memos (Figma 4531-72196).
  collapsedCustomers.value = new Set()
  collapsedMemos.value = new Set()
  if (genTimer) clearTimeout(genTimer)
  genTimer = setTimeout(() => { reportState.value = 'ready'; lastUpdated.value = stamp() }, 1100)
}
onBeforeUnmount(() => { if (genTimer) clearTimeout(genTimer) })

const asOfCaption = computed(() => tf('As of {date}', { date: longDate(appliedAsOf.value) }))
function stamp() {
  const n = new Date()
  return `${n.getDate()} ${t(MONTHS[n.getMonth()]!)} ${n.getFullYear()}, ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')} (GMT+7)`
}
const lastUpdated = ref(stamp())

// ── Filters (All filters drawer → CmReportFilters; asOf comes from the toolbar) ─
const drawerOpen = ref(false)
function assignFilters(next: Partial<CmReportFilters>) {
  const base = { ...emptyCmReportFilters(), ...next }
  Object.assign(filters, { ...base, contactIds: [...base.contactIds], groupIds: [...base.groupIds], asOf: filters.asOf })
}
function onApplyFilters(v: CmReportFilters) {
  // The drawer also edits As of date (+ Period) — keep the toolbar field in sync.
  if (v.asOf) { filters.asOf = v.asOf; appliedAsOf.value = v.asOf; pendingAsOf.value = isoToDmy(v.asOf); asOfError.value = '' }
  assignFilters({ ...v, asOf: filters.asOf })
  generate()
}
const activeFilterCount = computed(() => countActiveFilters(filters))
/** Reset filter — everything back to defaults except the as-of date (PRD AC-019-03). */
function resetFilters() { assignFilters({}) }
function regenIfReady() { if (reportState.value === 'ready') generate() }

// Badge labels (item 10)
const contactLabel = computed(() => new Map(contactOptions(filters).map((o) => [o.value, o.label])))
const groupLabel = new Map(CONTACT_GROUPS.map((g) => [g.id, g.name]))
const DOC_TYPE_LABEL = { all: 'Credit memo & debit memo', CM: 'Credit memo', DM: 'Debit memo' } as const
function rangeText(min: number | null, max: number | null) {
  if (min != null && max != null) return `${formatIDR(min)} – ${formatIDR(max)}`
  if (min != null) return `≥ ${formatIDR(min)}`
  return `≤ ${formatIDR(max ?? 0)}`
}
interface FilterBadge { key: string; label: string; clear: () => void }
const badges = computed<FilterBadge[]>(() => {
  const out: FilterBadge[] = []
  if (filters.docType !== 'all') out.push({ key: 'type', label: `${t('Type')}: ${t(DOC_TYPE_LABEL[filters.docType])}`, clear: () => { filters.docType = 'all' } })
  if (filters.contactIds.length) {
    const label = filters.contactIds.length === 1
      ? `${t('Customer')}: ${contactLabel.value.get(filters.contactIds[0]!) ?? filters.contactIds[0]}`
      : tf('{n} customers selected', { n: filters.contactIds.length })
    out.push({ key: 'contact', label, clear: () => { filters.contactIds = [] } })
  }
  if (filters.groupIds.length) {
    const names = filters.groupIds.map((g) => groupLabel.get(g) ?? g).join(', ')
    const mode = filters.groupIds.length > 1 ? ` (${t(filters.groupMode === 'all' ? 'Include all' : 'Either')})` : ''
    out.push({ key: 'group', label: `${t('Customer group')}: ${names}${mode}`, clear: () => { filters.groupIds = []; filters.groupMode = 'all' } })
  }
  if (filters.contactMin != null || filters.contactMax != null) out.push({ key: 'cbal', label: `${t('Customer balance')}: ${rangeText(filters.contactMin, filters.contactMax)}`, clear: () => { filters.contactMin = null; filters.contactMax = null } })
  if (filters.memoMin != null || filters.memoMax != null) out.push({ key: 'mbal', label: `${t('Credit memo balance')}: ${rangeText(filters.memoMin, filters.memoMax)}`, clear: () => { filters.memoMin = null; filters.memoMax = null } })
  if (filters.memoNumber) out.push({ key: 'num', label: `${t('Number')}: ${filters.memoNumber}`, clear: () => { filters.memoNumber = '' } })
  if (!filters.showZeroContacts) out.push({ key: 'zc', label: t('Hiding Rp 0 customers'), clear: () => { filters.showZeroContacts = true } })
  if (!filters.showZeroMemos) out.push({ key: 'zm', label: t('Hiding Rp 0 credit memos'), clear: () => { filters.showZeroMemos = true } })
  return out
})
function removeBadge(b: FilterBadge) { b.clear(); regenIfReady() }
function resetAndRegen() { resetFilters(); regenIfReady() }

// ── Saved views (Default + user views) — views store filters minus asOf ───────
const activeViewId = ref('default')
function viewFilters(): Omit<CmReportFilters, 'asOf'> {
  const { asOf: _asOf, ...rest } = filters
  return { ...rest, contactIds: [...rest.contactIds], groupIds: [...rest.groupIds] }
}
function selectView(id: string) {
  activeViewId.value = id
  const v = creditMemoViews.find((x) => x.id === id)
  if (v) assignFilters(v.filters as Partial<CmReportFilters>)
  else resetFilters()
  // Opening a view applies its saved filters and immediately shows its report.
  generate()
}
// All views drawer — close is the × only (rule/modal-drawer-close-explicit-only).
const allViewsOpen = ref(false)
function pickView(id: string) { selectView(id); allViewsOpen.value = false }
const addingView = ref(false)
const newViewName = ref('')
const newViewInput = ref<HTMLInputElement | null>(null)
function startAddView() { addingView.value = true; newViewName.value = ''; nextTick(() => newViewInput.value?.focus()) }
function commitAddView() {
  if (!addingView.value) return
  const name = newViewName.value.trim()
  addingView.value = false
  if (!name) return
  const v = addCmView({ name, filters: viewFilters() })
  activeViewId.value = v.id
  successToast(t('View saved'))
}
function cancelAddView() { addingView.value = false }

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
  if (name) { updateCmView(id, { name }); successToast(t('View renamed')) }
}
function cancelEditView() { editingViewId.value = '' }

const delViewOpen = ref(false)
const delViewTarget = ref<CmSavedView | null>(null)
function askDeleteView(v: CmSavedView) { delViewTarget.value = v; delViewOpen.value = true }
function confirmDeleteView() {
  const v = delViewTarget.value; if (!v) return
  deleteCmView(v.id)
  if (activeViewId.value === v.id) activeViewId.value = 'default'
  delViewTarget.value = null
  successToast(t('View deleted'))
}

// ── Columns ───────────────────────────────────────────────────────────────────
// Date and Balance are the identity/result columns — locked on in Column settings.
const COLUMNS = [
  { key: 'date', label: 'Date', right: false }, { key: 'number', label: 'Number', right: false }, { key: 'description', label: 'Description', right: false },
  { key: 'status', label: 'Status', right: false }, { key: 'movement', label: 'Movement', right: true }, { key: 'balance', label: 'Balance', right: true },
]
const colVis = reactive<Record<string, boolean>>(Object.fromEntries(COLUMNS.map((c) => [c.key, true])))
const columnItems = computed(() => COLUMNS.map((c, i) => ({ key: c.key, label: t(c.label), disabled: i === 0 || i === COLUMNS.length - 1 })))
const show = (k: string) => colVis[k] !== false
const visibleColumns = computed(() => COLUMNS.filter((c) => show(c.key)))
// The Date column carries two 32px tree-guide tracks in front of it (contact
// caret → memo caret), so it spans 3 table columns.
const leadSpan = computed(() => 2 + visibleColumns.value.length - 1)

// ── Rows ──────────────────────────────────────────────────────────────────────
const groups = computed<ReportContact[]>(() => creditMemoReport(filters))

const emptyReason = computed<'none' | 'no-activity' | 'filter'>(() => {
  if (groups.value.length) return 'none'
  return activeFilterCount.value ? 'filter' : 'no-activity'
})

/** Movement: reductions in parentheses (Figma), increases plain. */
function signed(n: number): string { return n < 0 ? `(${formatIDR(Math.abs(n))})` : formatIDR(n) }
/** Source documents open in a NEW TAB so the report keeps its state (PRD VR-011-02). */
function go(href?: string) {
  if (!href || href === '#') return
  window.open(router.resolve(href).href, '_blank', 'noopener')
}

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
function entryText(r: ReportEntry) { return `${r.date} ${r.title}${r.linkedNo ? ` (${r.linkedNo})` : ''} ${signed(r.movement)} → ${formatIDR(r.balance)}` }
function buildReportGround(): string {
  if (reportState.value !== 'ready') {
    return 'Credit Memo report (Reports › Sales › Credit Memo), IDR. No report generated yet — the user has not applied an as-of date.'
  }
  const filt = badges.value.map((b) => b.label)
  const lines = groups.value.map((g) => {
    const memos = g.memos.map((m) => {
      const moves = m.entries.map(entryText).join(', ')
      return `${m.number} (${m.docType === 'DM' ? 'debit memo' : 'credit memo'}, issued ${m.issueDate}) [${m.status}] original ${formatIDR(m.originalAmount)}, remaining ${formatIDR(m.remaining)}${moves ? ` — ${moves}` : ''}`
    }).join('; ')
    return `- ${g.name} (${g.kind}): total remaining ${formatIDR(g.total)} — ${memos}`
  })
  return `Credit Memo report (Reports › Sales › Credit Memo), IDR, read-only. `
    + `As of ${appliedAsOf.value} (end of day; every memo issued on or before this date, with its applications and refunds up to this date — there is no start date and no opening balance).`
    + `${filt.length ? ' Filters — ' + filt.join('; ') + '.' : ''}\n`
    + `Covers sales credit memos (customers) and purchase debit memos (vendors). Contacts ranked by total remaining balance (descending):\n${lines.join('\n')}\n`
    + `Status "Open" = the memo still has a remaining balance to apply or refund as of the date; "Closed" = fully used (zero remaining). `
    + `Each memo row shows its original amount; movement in parentheses is an application/refund that reduces the running balance; End balance = the contact's total remaining.`
}
function openAirene() {
  aireneBridge.openWithContext(buildReportGround(), 'Credit Memo report', AIRENE_SUGGESTIONS)
}

// ── Export ▾ — Excel only (PRD/RFC), always async (PRD TS-03) → real .xlsx ────
const exporting = ref(false)
function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') }
function exportFilename(): string {
  const asOf = filters.asOf
  if (filters.contactIds.length === 1) {
    const name = contactLabel.value.get(filters.contactIds[0]!) ?? filters.contactIds[0]!
    return `credit-memo-report-${slug(name)}-${asOf}.xlsx`
  }
  return `credit-memo-report-${asOf}.xlsx`
}
function exportExcel() {
  if (exporting.value) return
  if (reportState.value !== 'ready') { infoToast(t('Generate the report first.')); return }
  exporting.value = true
  infoToast(t('Your file is being prepared. You’ll be notified when it’s ready to download.'))
  // Simulate the async job → in-app notification → download.
  const snapshot: CmReportFilters = { ...filters, contactIds: [...filters.contactIds], groupIds: [...filters.groupIds] }
  const filename = exportFilename()
  window.setTimeout(() => {
    exporting.value = false
    // Zero-balance memos/contacts are always exported (PRD AC-006-05) — buildExport handles it.
    const data = buildExport(snapshot)
    const book = XLSX.utils.book_new()
    const summary = XLSX.utils.aoa_to_sheet(data.summary)
    summary['!cols'] = (data.summary[0] ?? []).map(() => ({ wch: 22 }))
    const detail = XLSX.utils.aoa_to_sheet(data.detail)
    detail['!cols'] = (data.detail[0] ?? []).map(() => ({ wch: 22 }))
    XLSX.utils.book_append_sheet(book, summary, t('Customer summary').slice(0, 31))
    XLSX.utils.book_append_sheet(book, detail, t('Credit memo detail').slice(0, 31))
    XLSX.writeFile(book, filename)
    successToast(t('File ready to download'))
  }, 1600)
}
</script>

<template>
  <div class="cmr" :class="{ 'cmr--full': fullscreen }">
    <!-- ── Title bar ── -->
    <header v-if="!fullscreen" class="cmr-titlebar">
      <div class="cmr-titlebar-left">
        <MpButton class="cmr-breadcrumb" variant="link" type="button" @click="router.push('/sales-report')">{{ t('Sales') }}</MpButton>
        <h1 class="cmr-title">{{ t('Credit Memo') }} <span class="cmr-title-cur">(IDR)</span></h1>
      </div>
    </header>

    <div class="cmr-stage">
      <!-- ── Toolbar: As of date + Apply + All filters | Airene · Column settings · Export ▾ ── -->
      <div v-if="!fullscreen" class="cmr-toolbar">
        <div class="cmr-controls">
          <div class="cmr-controls-left">
            <div class="cmr-datefield" data-devchange="cm-report-poc-v3">
              <label class="cmr-date-label" for="cmr-asof">{{ t('As of date') }}</label>
              <MpDatePicker
                id="cmr-asof" :model-value="pendingAsOf" format="DD/MM/YYYY" value-type="format"
                :placeholder="t('Select date')" use-portal is-full-width
                @update:model-value="onAsOfChange"
              />
            </div>
            <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" is-rounded type="button" @click="applyReport">{{ t('Apply') }}</MpButton>
            <MpButton variant="secondary" is-rounded left-icon="filter" class="btn-enterprise btn-enterprise--secondary cmr-allfilters" type="button" data-devchange="cm-report-poc-v3" @click="drawerOpen = true">
              {{ t('All filters') }}<span v-if="activeFilterCount" class="cmr-allfilters-count">{{ activeFilterCount }}</span>
            </MpButton>
          </div>
          <div class="cmr-controls-right">
            <MpButtonGroup class="cmr-tools">
              <MpTooltip id="cmr-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
                <MpButton class="cmr-airene-btn" variant="ghost" left-icon="airene-brand" is-rounded type="button" :aria-label="t('Ask Airene')" @click="openAirene" />
              </MpTooltip>
              <ColumnSettingsMenu id="cmr-columns" :items="columnItems" :visibility="colVis" :tooltip="t('Column settings')" />
            </MpButtonGroup>
            <MpPopover id="cmr-export" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <MpButton class="btn-enterprise btn-enterprise--secondary" variant="secondary" is-rounded right-icon="chevrons-down" type="button" data-devchange="cm-report-poc-v3">{{ t('Export') }}</MpButton>
              </MpPopoverTrigger>
              <MpPopoverContent class="erp-dropdown-menu" :class="css({ width: 'max-content' })">
                <MpPopoverList>
                  <MpPopoverListItem @click="exportExcel">{{ t('Export to Excel') }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>
        </div>
        <p v-if="asOfError" class="cmr-range-error">{{ asOfError }}</p>

        <!-- Active-filter badges — each removable; Reset filter keeps the as-of date -->
        <div v-if="badges.length" class="cmr-badges" data-devchange="cm-report-poc-v3">
          <span v-for="b in badges" :key="b.key" class="cmr-fbadge cmr-fbadge--dismiss">{{ b.label }}<MpButton variant="ghost" type="button" :aria-label="t('Remove')" left-icon="close" @click="removeBadge(b)" /></span>
          <MpButton class="cmr-reset" variant="link" type="button" @click="resetAndRegen">{{ t('Reset filter') }}</MpButton>
        </div>
      </div>

      <!-- ── View tabs ── -->
      <div v-if="!fullscreen" class="cmr-viewbar">
        <div class="cmr-views">
          <MpButton class="cmr-viewtab" variant="ghost" :class="{ 'is-active': activeViewId === 'default' }" type="button" @click="selectView('default')">{{ t('Default view') }}</MpButton>

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
                  <MpButton class="cmr-view-kebab" variant="ghost" type="button" :aria-label="t('View options')" left-icon="menu-kebab" />
                </MpPopoverTrigger>
                <MpPopoverContent class="erp-dropdown-menu" :class="css({ width: 'max-content' })">
                  <MpPopoverList>
                    <MpPopoverListItem @click="startEditView(v)">{{ t('Edit view name') }}</MpPopoverListItem>
                    <MpPopoverListItem @click="askDeleteView(v)">{{ t('Delete') }}</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
            </span>
          </template>

          <!-- Add view — the new tab is an inline name field -->
          <span v-if="addingView" class="cmr-viewtab cmr-viewtab--editing">
            <input ref="newViewInput" v-model="newViewName" class="cmr-viewtab-input" :placeholder="t('View name')" @keydown.enter.prevent="commitAddView" @keydown.esc="cancelAddView" @blur="commitAddView" /> <!-- pixel-police-allow: inline view-name field -->
          </span>
          <MpButton v-else class="cmr-addview" variant="ghost" type="button" left-icon="add" @click="startAddView">{{ t('Add view') }}</MpButton>

          <MpButton class="cmr-allviews" variant="link" type="button" @click="allViewsOpen = true">{{ t('All views') }}</MpButton>
        </div>
        <div class="cmr-viewbar-right">
          <MpTooltip id="cmr-fs-enter" :label="t('Full screen')" placement="bottom-end" use-portal>
            <MpButton class="cmr-fs-btn" variant="ghost" type="button" :aria-label="t('Full screen')" left-icon="full-screen" @click="fullscreen = true" />
          </MpTooltip>
        </div>
      </div>

      <!-- ── Report ── -->
      <div class="cmr-report">
        <div v-if="fullscreen" class="cmr-fs-topbar">
          <span class="cmr-fs-title">{{ t('Credit Memo') }} <span class="cmr-title-cur">(IDR)</span></span>
          <MpTooltip id="cmr-fs-exit" :label="t('Exit full screen')" placement="bottom-end" use-portal>
            <MpButton class="cmr-fs-btn" variant="ghost" type="button" :aria-label="t('Exit full screen')" left-icon="minimize" @click="fullscreen = false" />
          </MpTooltip>
        </div>

        <!-- Idle — no report generated yet (Figma 4531-75341) -->
        <div v-if="reportState === 'idle'" class="cmr-empty cmr-empty--idle">
          <img src="/illustrations/report-empty.png" alt="" class="cmr-empty-img cmr-empty-img--report" width="288" height="240" />
          <p class="cmr-empty-title">{{ t('Report data will appear here') }}</p>
          <p class="cmr-empty-desc">{{ t('Select an as-of date, then click Apply.') }}</p>
        </div>

        <!-- Loading skeleton (Figma 4531-73269). Solid + static per rule/skeleton-solid-static. -->
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
          <div class="cmr-report-head" data-devchange="cm-report-poc-v3">
            <span class="cmr-report-range">{{ asOfCaption }}</span>
            <span class="cmr-report-updated">{{ t('Last updated on') }} {{ lastUpdated }}</span>
          </div>

          <!-- Ready + data (Figma 4531-72196) -->
          <div v-if="groups.length" class="cmr-table-wrap">
            <table class="cmr-table" data-devchange="cm-report-poc-v3">
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
                  <th v-for="c in visibleColumns" :key="c.key" class="cmr-th" :class="{ 'cmr-th--right': c.right }" :colspan="c.key === 'date' ? 3 : 1">{{ t(c.label) }}</th>
                </tr>
              </thead>
              <tbody v-for="g in groups" :key="g.id">
                <!-- Contact (L1) — total remaining; Rp0,00 still renders (zero ≠ blank) -->
                <tr class="cmr-row cmr-row--group" @click="toggleCustomer(g.id)">
                  <td class="cmr-td cmr-td--group" :colspan="leadSpan">
                    <span class="cmr-lead">
                      <MpIcon :name="isCustomerOpen(g.id) ? 'chevrons-down' : 'chevrons-right'" size="20px" />
                      <span class="cmr-customer">{{ g.name }}<span v-if="g.kind === 'vendor'" class="cmr-kind">{{ t('Vendor') }}</span></span>
                    </span>
                  </td>
                  <td class="cmr-td cmr-td--right cmr-td--group cmr-strong">{{ formatIDR(g.total) }}</td>
                </tr>

                <template v-if="isCustomerOpen(g.id)">
                  <template v-for="m in g.memos" :key="m.id">
                    <!-- Memo (L2) — original amount; click to fold its entries -->
                    <tr class="cmr-row cmr-row--memo" :class="{ 'is-foldable': m.entries.length }" @click="toggleMemo(m.id, m.entries.length > 0)">
                      <td class="cmr-guide" aria-hidden="true" />
                      <td class="cmr-td" colspan="2">
                        <span class="cmr-lead">
                          <MpIcon v-if="m.entries.length" :name="isMemoOpen(m.id) ? 'chevrons-down' : 'chevrons-right'" size="20px" />
                          <span v-else class="cmr-chev-space" />
                          <span>{{ formatDate(m.issueDate) }}</span>
                        </span>
                      </td>
                      <td v-if="show('number')" class="cmr-td">
                        <span class="cmr-doc-link" role="link" tabindex="0" @click.stop="go(m.href)" @keydown.enter.stop="go(m.href)">{{ m.number }}</span>
                      </td>
                      <td v-if="show('description')" class="cmr-td">{{ m.description }}</td>
                      <td v-if="show('status')" class="cmr-td cmr-td--badge"><ErpStatusBadge :status="m.status" /></td>
                      <td v-if="show('movement')" class="cmr-td cmr-td--right" />
                      <td class="cmr-td cmr-td--right">{{ formatIDR(m.originalAmount) }}</td>
                    </tr>

                    <!-- Entries (L3): applied / refund → running balance -->
                    <template v-if="isMemoOpen(m.id)">
                      <tr v-for="r in m.entries" :key="r.id" class="cmr-row cmr-row--entry">
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
                        <td v-if="show('status')" class="cmr-td cmr-td--badge"><ErpStatusBadge status="Closed" /></td>
                        <td v-if="show('movement')" class="cmr-td cmr-td--right">{{ signed(r.movement) }}</td>
                        <td class="cmr-td cmr-td--right">{{ formatIDR(r.balance) }}</td>
                      </tr>
                    </template>
                  </template>

                  <!-- End balance — flush left, not indented -->
                  <tr class="cmr-row cmr-row--end">
                    <td class="cmr-td cmr-strong" :colspan="leadSpan">{{ t('End balance') }}</td>
                    <td class="cmr-td cmr-td--right cmr-strong">{{ formatIDR(g.total) }}</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>

          <!-- Ready, but no data — filtered-empty vs nothing on/before the date -->
          <div v-else class="cmr-empty" data-devchange="cm-report-poc-v3">
            <img src="/illustrations/empty-folder.png" alt="" class="cmr-empty-img" width="240" height="200" />
            <template v-if="emptyReason === 'filter'">
              <p class="cmr-empty-title">{{ t('No data found') }}</p>
              <p class="cmr-empty-desc">{{ t('No credit memo activity for the selected date and filters.') }}</p>
              <MpButton class="btn-enterprise btn-enterprise--secondary cmr-empty-cta" variant="secondary" is-rounded type="button" @click="resetAndRegen">{{ t('Reset filter') }}</MpButton>
            </template>
            <template v-else>
              <p class="cmr-empty-title">{{ tf('No credit memo on or before {date}.', { date: longDate(appliedAsOf) }) }}</p>
              <p class="cmr-empty-desc">{{ t('Try a later as-of date.') }}</p>
            </template>
          </div>
        </template>
      </div>
    </div>

    <!-- ── All filters drawer ── -->
    <CreditMemoFiltersDrawer
      id="cmr-filters"
      v-model:is-open="drawerOpen"
      :model-value="{ ...filters, asOf: dmyToIso(pendingAsOf) || filters.asOf }"
      @apply="onApplyFilters"
    />

    <!-- ── All views drawer — Default + saved views; close via × only ── -->
    <ErpDrawer :is-open="allViewsOpen" :title="t('All views')" width="400px" @close="allViewsOpen = false">
      <template #body>
        <div class="cmr-vd-list">
          <MpButton class="cmr-view-item" variant="ghost" :class="{ 'is-active': activeViewId === 'default' }" type="button" @click="pickView('default')">{{ t('Default view') }}</MpButton>
          <MpButton v-for="v in creditMemoViews" :key="v.id" class="cmr-view-item" variant="ghost" :class="{ 'is-active': activeViewId === v.id }" type="button" @click="pickView(v.id)">{{ v.name }}</MpButton>
          <p v-if="!creditMemoViews.length" class="cmr-vd-hint">{{ t('Views you save with Add view will appear here.') }}</p>
        </div>
      </template>
    </ErpDrawer>

    <!-- ── Delete view confirmation ── -->
    <ConfirmModal
      v-model:is-open="delViewOpen"
      :title="t('Delete view')"
      :description="tf('“{name}” will be permanently deleted.', { name: delViewTarget?.name ?? '' })"
      :confirm-label="t('Delete')"
      :cancel-label="t('Cancel')"
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
/* The 20px badge sits on the 20px text line — top-aligned so it never grows the row. */
.cmr-td--badge > :deep(*) { vertical-align: top; }
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
/* DM vendor marker — small neutral label after the name (spec item 6). */
.cmr-kind { display: inline-flex; align-items: center; height: 20px; margin-left: var(--mp-spacing-2, 8px); padding: 0 var(--mp-spacing-2, 8px); border-radius: var(--mp-radii-sm, 4px); background: var(--mp-background-neutral, #e3e7e9); font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-secondary); vertical-align: middle; }
/* Block-level flex so the 20px caret never grows the 20px line box (rows stay on the 40px baseline). */
.cmr-lead { display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); min-width: 0; }
.cmr-lead > span:last-child { overflow: hidden; text-overflow: ellipsis; }
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
