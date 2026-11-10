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
 * Column settings · Full screen · Export (Excel only, async → real .xlsx).
 * No saved views. Idle → skeleton → ready, plus a full-screen mode.
 */
import { ref, computed, reactive, watch, onBeforeUnmount } from 'vue'
import * as XLSX from 'xlsx'
import { useReportFullscreen } from '~/composables/useReportFullscreen'
import { useAireneBridge } from '~/composables/useAireneBridge'
import { useLocale } from '~/composables/useLocale'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import {
  MpButton, MpButtonGroup, MpIcon, MpTooltip, MpSkeleton, MpDatePicker, MpTag,
} from '@mekari/pixel3'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import CreditMemoFiltersDrawer from '~/components/patterns/CreditMemoFiltersDrawer.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate, formatDateLong, formatDateTimeLong } from '~/utils/date'
import { columnWidth, type ColumnKind } from '~/components/patterns/columnWidths'
import { infoToast, successToast } from '~/utils/toasts'
import { SIM_TODAY_ISO } from '~/data/simClock'
import {
  creditMemoReport, emptyCmReportFilters, activeFilterCount as countActiveFilters, buildExport, amountActive, EXPORT_DETAIL_COLUMNS,
  contactOptions, CONTACT_GROUPS,
  type CmReportFilters, type ReportContact, type ReportEntry, type CmAmountComparator,
} from '~/data/creditMemoReport'

const router = useRouter()
const { t } = useLocale()
/** t() with {placeholders} — the English source keeps the braces, so one key per sentence. */
function tf(en: string, vars: Record<string, string | number>): string {
  return Object.entries(vars).reduce((s, [k, v]) => s.split(`{${k}}`).join(String(v)), t(en))
}

// ── As-of date (single date, no lower bound — POC / RFC §6.1) ────────────────
// MpDatePicker holds DD/MM/YYYY; the filters hold ISO. Display dates go through
// ~/utils/date (rule/format-date) — no local month table.
function isoToDmy(iso: string) { const [y, m, d] = iso.split('-'); return y && m && d ? `${d}/${m}/${y}` : '' }
function dmyToIso(dmy: string) { const [d, m, y] = (dmy || '').split('/'); return y && m && d ? `${y}-${m}-${d}` : '' }

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
  genTimer = setTimeout(() => { reportState.value = 'ready'; lastUpdated.value = new Date().toISOString() }, 1100)
}
onBeforeUnmount(() => { if (genTimer) clearTimeout(genTimer) })

const asOfCaption = computed(() => tf('As of {date}', { date: formatDateLong(appliedAsOf.value) }))
// Non-table timestamp, no "(GMT+7)" suffix (rule/format-date, docs/patterns/date-format.md).
const lastUpdated = ref(new Date().toISOString())
const lastUpdatedText = computed(() => formatDateTimeLong(lastUpdated.value))

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
/** Badge text for a balance filter, worded like AmountComparatorField's prefix. */
function rangeText(cmp: CmAmountComparator, min: number | null, max: number | null) {
  if (cmp === 'gt') return `${t('Is greater than')} ${formatIDR(min ?? 0)}`
  if (cmp === 'lt') return `${t('Is less than')} ${formatIDR(max ?? 0)}`
  if (min != null && max != null) return `${t('Is between')} ${formatIDR(min)} – ${formatIDR(max)}`
  return min != null ? `${t('Is greater than')} ${formatIDR(min)}` : `${t('Is less than')} ${formatIDR(max ?? 0)}`
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
  if (amountActive(filters.contactCmp, filters.contactMin, filters.contactMax)) out.push({ key: 'cbal', label: `${t('Customer balance')}: ${rangeText(filters.contactCmp, filters.contactMin, filters.contactMax)}`, clear: () => { filters.contactCmp = 'gt'; filters.contactMin = null; filters.contactMax = null } })
  if (amountActive(filters.memoCmp, filters.memoMin, filters.memoMax)) out.push({ key: 'mbal', label: `${t('Credit memo balance')}: ${rangeText(filters.memoCmp, filters.memoMin, filters.memoMax)}`, clear: () => { filters.memoCmp = 'gt'; filters.memoMin = null; filters.memoMax = null } })
  if (filters.memoNumber) out.push({ key: 'num', label: `${t('Number')}: ${filters.memoNumber}`, clear: () => { filters.memoNumber = '' } })
  if (!filters.showZeroContacts) out.push({ key: 'zc', label: t('Hiding Rp 0 customers'), clear: () => { filters.showZeroContacts = true } })
  if (!filters.showZeroMemos) out.push({ key: 'zm', label: t('Hiding Rp 0 credit memos'), clear: () => { filters.showZeroMemos = true } })
  return out
})
function removeBadge(b: FilterBadge) { b.clear(); regenIfReady() }
function resetAndRegen() { resetFilters(); regenIfReady() }

// ── Columns ───────────────────────────────────────────────────────────────────
// Date and Balance are the identity/result columns — locked on in Column settings.
// Widths come from the column-width standard via each column's kind
// (rule/table-column-kind, columnWidths.ts). Description has no width so it
// takes whatever the semantic columns leave.
const COLUMNS: { key: string; label: string; right: boolean; kind?: ColumnKind }[] = [
  { key: 'date', label: 'Date', right: false, kind: 'date' }, { key: 'number', label: 'Number', right: false, kind: 'number' }, { key: 'description', label: 'Description', right: false },
  { key: 'status', label: 'Status', right: false, kind: 'status' }, { key: 'movement', label: 'Movement', right: true, kind: 'amount' }, { key: 'balance', label: 'Balance', right: true, kind: 'amount' },
]
const colVis = reactive<Record<string, boolean>>(Object.fromEntries(COLUMNS.map((c) => [c.key, true])))
const columnItems = computed(() => COLUMNS.map((c, i) => ({ key: c.key, label: t(c.label), disabled: i === 0 || i === COLUMNS.length - 1 })))
const show = (k: string) => colVis[k] !== false
const visibleColumns = computed(() => COLUMNS.filter((c) => show(c.key)))
// The Date column carries two 32px tree-guide tracks in front of it (contact
// caret → memo caret), so it spans 3 table columns.
const leadSpan = computed(() => 2 + visibleColumns.value.length - 1)
/** <col> width for a column: the kind's minimum (fixed layout); none for flexible columns. */
function colStyle(key: string) {
  const kind = COLUMNS.find((c) => c.key === key)?.kind
  return kind ? { width: columnWidth(kind).minWidth } : undefined
}
/** Table floor = every visible column at its kind minimum (+ default for flexible ones). */
const tableMinWidth = computed(() => {
  const cols = visibleColumns.value.map((c) => `${columnWidth(c.kind).minWidth}`)
  return `calc(${cols.join(' + ')} + 2 * var(--mp-sizes-8))`
})

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
const AIRENE_SUGGESTIONS = computed(() => [
  t('Which customer has the largest open credit memo balance?'),
  t('What is the total open credit memo balance?'),
  t('Which credit memos are closed?'),
  t('Summarise this report in 3 bullets'),
])
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
  aireneBridge.openWithContext(buildReportGround(), t('Credit Memo report'), AIRENE_SUGGESTIONS.value)
}

// ── Export — the shared ExportModal (rule/export-modal) → Excel only (PRD/RFC),
// always async (PRD TS-03) → real .xlsx. The modal picks the detail-sheet columns.
const exporting = ref(false)
const exportOpen = ref(false)
const exportColumns = computed(() => EXPORT_DETAIL_COLUMNS.map((c) => ({ ...c, label: t(c.label) })))
const exportTotal = computed(() => groups.value.reduce((n, g) => n + g.memos.length, 0))
function openExport() {
  if (reportState.value !== 'ready') { infoToast(t('Generate the report first.')); return }
  exportOpen.value = true
}
function onExportConfirm(payload: { columns: string[] }) {
  exportOpen.value = false
  exportExcel(payload.columns)
}
function slug(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') }
function exportFilename(): string {
  const asOf = filters.asOf
  if (filters.contactIds.length === 1) {
    const name = contactLabel.value.get(filters.contactIds[0]!) ?? filters.contactIds[0]!
    return `credit-memo-report-${slug(name)}-${asOf}.xlsx`
  }
  return `credit-memo-report-${asOf}.xlsx`
}
function exportExcel(columns?: string[]) {
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
    const data = buildExport(snapshot, columns)
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
      <!-- ── Toolbar: As of date + Apply + All filters | Airene · Column settings · Full screen · Export ── -->
      <div v-if="!fullscreen" class="cmr-toolbar">
        <div class="cmr-controls">
          <div class="cmr-controls-left">
            <div class="cmr-datefield" data-devchange="cm-report-poc-v3">
              <label class="cmr-date-label" for="cmr-asof">{{ t('As of date') }}</label>
              <MpDatePicker
                id="cmr-asof" :model-value="pendingAsOf" format="DD/MM/YYYY" value-type="format"
                use-portal is-full-width
                @update:model-value="onAsOfChange"
              />
            </div>
            <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" is-rounded type="button" @click="applyReport">{{ t('Apply') }}</MpButton>
            <MpButton variant="secondary" is-rounded left-icon="filter" class="btn-enterprise btn-enterprise--secondary filter-all-btn" type="button" data-devchange="cm-report-patterns" @click="drawerOpen = true">{{ t('All filters') }}{{ activeFilterCount ? ` (${activeFilterCount})` : '' }}</MpButton>
          </div>
          <div class="cmr-controls-right">
            <MpButtonGroup class="cmr-tools">
              <MpTooltip id="cmr-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
                <MpButton class="cmr-airene-btn" variant="ghost" left-icon="airene-brand" is-rounded type="button" :aria-label="t('Ask Airene')" @click="openAirene" />
              </MpTooltip>
              <ColumnSettingsMenu id="cmr-columns" :items="columnItems" :visibility="colVis" :tooltip="t('Column settings')" />
              <MpTooltip id="cmr-fs-enter" :label="t('Full screen')" placement="bottom" use-portal>
                <MpButton class="cmr-fs-btn" variant="ghost" is-rounded type="button" :aria-label="t('Full screen')" left-icon="full-screen" data-devchange="cm-report-no-views" @click="fullscreen = true" />
              </MpTooltip>
            </MpButtonGroup>
            <!-- Export opens the shared ExportModal (rule/export-modal) — Excel only, so no format menu. -->
            <MpButton class="btn-enterprise btn-enterprise--secondary" variant="secondary" is-rounded type="button" data-devchange="cm-report-patterns" @click="openExport">{{ t('Export') }}</MpButton>
          </div>
        </div>
        <p v-if="asOfError" class="cmr-range-error">{{ asOfError }}</p>

        <!-- Active-filter badges — each removable; Reset filter keeps the as-of date -->
        <div v-if="badges.length" class="cmr-badges" data-devchange="cm-report-patterns">
          <MpTag v-for="b in badges" :key="b.key" as="span" is-closable @close="removeBadge(b)">{{ b.label }}</MpTag>
          <MpButton class="cmr-reset" variant="link" type="button" @click="resetAndRegen">{{ t('Reset filter') }}</MpButton>
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
          <img src="/illustrations/report-empty.png" alt="" class="cmr-empty-img" />
          <p class="cmr-empty-title">{{ t('Report data will appear here') }}</p>
          <p class="cmr-empty-desc">{{ t('Select an as-of date, then click Apply.') }}</p>
        </div>

        <!-- Loading skeleton (Figma 4531-73269). Solid + static per rule/skeleton-solid-static. -->
        <div v-else-if="reportState === 'loading'" class="cmr-table-wrap">
          <table class="cmr-table cmr-table--skeleton" :style="{ minWidth: tableMinWidth }" aria-busy="true">
            <colgroup>
              <col class="cmr-col-guide" /><col class="cmr-col-guide" />
              <col v-for="c in visibleColumns" :key="c.key" :style="colStyle(c.key)" />
            </colgroup>
            <thead>
              <tr>
                <th v-for="c in visibleColumns" :key="c.key" class="cmr-th" :class="{ 'cmr-th--right': c.right }" :colspan="c.key === 'date' ? 3 : 1">{{ t(c.label) }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="n in 3" :key="n" class="cmr-row" data-devchange="cm-report-patterns">
                <td v-for="c in visibleColumns" :key="c.key" class="cmr-td" :class="{ 'cmr-td--right': c.right }" :colspan="c.key === 'date' ? 3 : 1">
                  <MpSkeleton class="cmr-skel" :class="c.right ? 'cmr-skel--short' : 'cmr-skel--long'" rounded="sm" duration="0s" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <template v-else>
          <div class="cmr-report-head" data-devchange="cm-report-poc-v3">
            <span class="cmr-report-range">{{ asOfCaption }}</span>
            <span class="cmr-report-updated">{{ t('Last updated on') }} {{ lastUpdatedText }}</span>
          </div>

          <!-- Ready + data (Figma 4531-72196) -->
          <div v-if="groups.length" class="cmr-table-wrap">
            <table class="cmr-table" :style="{ minWidth: tableMinWidth }" data-devchange="cm-report-patterns">
              <colgroup>
                <col class="cmr-col-guide" /><col class="cmr-col-guide" />
                <col v-for="c in visibleColumns" :key="c.key" :style="colStyle(c.key)" />
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
                      <MpIcon :name="isCustomerOpen(g.id) ? 'chevrons-down' : 'chevrons-right'" size="sm" />
                      <span class="cmr-customer">{{ g.name }}<MpTag v-if="g.kind === 'vendor'" as="span" class="cmr-kind" data-devchange="cm-report-patterns">{{ t('Vendor') }}</MpTag></span>
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
                          <MpIcon v-if="m.entries.length" :name="isMemoOpen(m.id) ? 'chevrons-down' : 'chevrons-right'" size="sm" />
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
          <div v-else class="cmr-empty" data-devchange="cm-report-patterns">
            <img src="/illustrations/empty-folder.png" alt="" class="cmr-empty-img" />
            <!-- Filtered-empty copy + illustration match ErpTablePage (rule/table-empty-state). -->
            <template v-if="emptyReason === 'filter'">
              <p class="cmr-empty-title">{{ t('No results match your filters') }}</p>
              <p class="cmr-empty-desc">{{ t('Recheck the filters you have applied and try filtering again.') }}</p>
              <MpButton class="btn-enterprise btn-enterprise--secondary cmr-empty-cta" variant="secondary" is-rounded type="button" @click="resetAndRegen">{{ t('Reset filter') }}</MpButton>
            </template>
            <template v-else>
              <p class="cmr-empty-title">{{ tf('No credit memo on or before {date}.', { date: formatDateLong(appliedAsOf) }) }}</p>
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

    <!-- ── Export (rule/export-modal) ── -->
    <ExportModal
      :open="exportOpen"
      :title="t('Export credit memo report')"
      :entity-label="t('credit memos')"
      :columns="exportColumns"
      :total="exportTotal"
      @close="exportOpen = false"
      @export="onExportConfirm"
    />

  </div>
</template>

<style scoped>
/* Tokens only (rule/token-no-hardcoded-*). Colours use tokens verified to resolve in
   this Pixel build; the empty short aliases (--mp-text-brand, --mp-background-brand-*,
   --mp-border-brand, --mp-icon-*, --mp-font-weights-medium) are not used. */
.cmr { display: flex; flex-direction: column; height: 100%; min-height: 0; }

/* Title bar — docs/patterns/page-title-bar.md (72px = 2 × sizes-9; sizes-18 is not emitted). */
.cmr-titlebar { flex-shrink: 0; min-height: calc(var(--mp-sizes-9) * 2); background: var(--mp-colors-background-neutral-subtle); display: flex; align-items: center; padding: 0 var(--mp-spacing-6); }
.cmr-titlebar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; }
.cmr-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); color: var(--mp-colors-text-link); font-family: inherit; }
.cmr-breadcrumb:hover { text-decoration: underline; text-underline-offset: var(--mp-spacing-0\.5); }
.cmr-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl); letter-spacing: var(--mp-letter-spacings-tight); color: var(--mp-colors-text-default); }
/* "(IDR)" — a caption beside the H1. */
.cmr-title-cur { font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); font-weight: var(--mp-font-weights-regular); letter-spacing: var(--mp-letter-spacings-normal); color: var(--mp-colors-text-secondary); }

.cmr-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-colors-background-stage); border-top-left-radius: var(--mp-radii-xl); padding: var(--mp-spacing-3) var(--mp-spacing-6) var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-5); }

/* Toolbar — left gap 16px (rule/filter-bar-left-gap). */
.cmr-toolbar { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cmr-controls { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.cmr-controls-left { display: flex; align-items: flex-end; gap: var(--mp-spacing-4); }
.cmr-controls-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.cmr-datefield { display: flex; flex-direction: column; gap: var(--mp-spacing-1); width: calc(var(--mp-sizes-12) * 5); }
.cmr-date-label { font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
/* All filters — house .filter-all-btn padding (PurchaseInvoicesPage). */
.filter-all-btn { padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3); font-weight: var(--mp-font-weights-semi-bold); }
.cmr-airene-btn :deep(svg) { color: var(--mp-airene-default); }
.cmr-range-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-danger); }

/* Applied-filter tags (MpTag is-closable) + Reset filter link */
.cmr-badges { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.cmr-reset { border: none; background: none; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-link); text-decoration: underline; text-underline-offset: var(--mp-spacing-0\.5); }

/* Full-screen enter / exit — an icon button like Column settings (BalanceSheet / P&L toolbar). */
.cmr-fs-btn :deep(svg) { color: var(--mp-colors-icon-default); }

/* Report */
.cmr-report { display: flex; flex-direction: column; min-width: 0; }
.cmr-fs-topbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--mp-spacing-2); }
.cmr-fs-title { font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.cmr-report-head { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); }
.cmr-report-range { color: var(--mp-colors-text-default); }
.cmr-report-updated { color: var(--mp-colors-text-secondary); }

/* Table — widths come from colStyle()/tableMinWidth (columnWidths.ts); the two
   tree-guide tracks are layout-only columns (sizes-8). */
.cmr-table-wrap { overflow-x: auto; }
.cmr-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
.cmr-col-guide { width: var(--mp-sizes-8); }

/* Header — 28px, uppercase caption on the gray surface (rule/table-header-*). */
.cmr-th { height: var(--mp-sizes-7); padding: 0 var(--mp-spacing-4) 0 var(--mp-spacing-2); background: var(--mp-colors-background-neutral-subtle); border-bottom: var(--mp-border-widths-sm) solid var(--mp-colors-border-default); font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; letter-spacing: var(--mp-letter-spacings-wide); color: var(--mp-colors-text-secondary); text-align: left; white-space: nowrap; vertical-align: middle; }
.cmr-th--right { text-align: right; padding: 0 var(--mp-spacing-2) 0 var(--mp-spacing-4); }
/* Body cells — 40px row baseline. */
.cmr-td { height: var(--mp-sizes-10); padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2); border-bottom: var(--mp-border-widths-sm) solid var(--mp-colors-border-default); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-colors-text-default); vertical-align: middle; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cmr-td--right { text-align: right; font-variant-numeric: tabular-nums; padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4); }
.cmr-td--badge > :deep(*) { vertical-align: top; }
.cmr-strong { font-weight: var(--mp-font-weights-semi-bold); }

/* Tree guides — a border-default line under each caret (centred in the 32px track). */
.cmr-guide { padding: 0; border: none; background-image: linear-gradient(var(--mp-colors-border-default), var(--mp-colors-border-default)); background-size: var(--mp-border-widths-sm) 100%; background-repeat: no-repeat; background-position: calc(var(--mp-spacing-2) + var(--mp-sizes-5) / 2) 0; }

/* Contact (L1) */
.cmr-row--group { cursor: pointer; }
.cmr-td--group { background: var(--mp-colors-background-neutral-subtle); }
.cmr-row--group:hover .cmr-td--group { background: var(--mp-colors-background-neutral-subtle-hovered); }
.cmr-customer { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
/* Vendor marker — a gray MpTag after the name (rule/tag-gray-only); spacing only. */
/* The gray tag fill equals the contact row's neutral-subtle fill, so it sits on the
   white neutral surface here to stay visible. */
.cmr-kind { margin-left: var(--mp-spacing-2); vertical-align: middle; font-weight: var(--mp-font-weights-regular); background: var(--mp-colors-background-neutral); }
.cmr-lead { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.cmr-lead > span:last-child { overflow: hidden; text-overflow: ellipsis; }
.cmr-chev-space { display: inline-block; width: var(--mp-sizes-5); flex-shrink: 0; }

/* Credit memo (L2) */
.cmr-row--memo.is-foldable { cursor: pointer; }
.cmr-row--memo.is-foldable:hover .cmr-td { background: var(--mp-colors-background-neutral-subtle); }
/* Document numbers read as default text, underline on hover (rule/table-name-link-span). */
.cmr-doc-link { color: inherit; cursor: pointer; }
.cmr-doc-link:hover, .cmr-doc-link:focus-visible { text-decoration: underline; text-underline-offset: var(--mp-spacing-0\.5); outline: none; }

/* Entries (L3) — two-line rows align top (rule/table-cell-padding-align). */
.cmr-row--entry .cmr-td { vertical-align: top; }
.cmr-entry-title { display: block; overflow: hidden; text-overflow: ellipsis; }
.cmr-entry-linked { display: block; overflow: hidden; text-overflow: ellipsis; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); color: var(--mp-colors-text-secondary); }

/* Loading skeleton — solid + static, 3 rows (rule/skeleton-solid-static, rule/skeleton-3-rows);
   bar sizes mirror ErpTablePage (.erp-skeleton). */
.cmr-skel { display: inline-block; vertical-align: middle; height: calc(var(--mp-sizes-7) / 2) !important; background-color: var(--mp-colors-border-default) !important; background-image: none !important; animation: none !important; }
.cmr-skel--long { width: calc(var(--mp-sizes-9) * 2) !important; }
.cmr-skel--short { width: calc(var(--mp-sizes-7) * 2) !important; }

/* Empty states — illustration size matches ErpTablePage (.empty-inline-illustration). */
.cmr-empty { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10) 0; }
.cmr-empty--idle { padding: 0 0 var(--mp-spacing-6); }
.cmr-empty-img { width: calc(var(--mp-sizes-12) * 6); height: calc(var(--mp-sizes-10) * 6); object-fit: contain; }
.cmr-empty-title { margin: 0; font-size: var(--mp-font-sizes-lg); line-height: var(--mp-line-heights-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.cmr-empty-desc { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-colors-text-secondary); }
.cmr-empty-cta { margin-top: var(--mp-spacing-3); }

/* Full-screen — the white stage fills the window edge-to-edge. */
.cmr--full .cmr-stage { border-radius: 0; padding-top: var(--mp-spacing-4); }
</style>
