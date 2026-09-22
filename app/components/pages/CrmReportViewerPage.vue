<script setup lang="ts">
/**
 * CRM — Report viewer/run surface (/crm/reports/:id).
 *
 * Runs the saved definition against current mock CRM data, offers temporary
 * session-only quick filters (never touch the saved definition), and real
 * CSV/XLSX export. See app/data/crmReports.ts for the execution engine.
 */
import { computed, reactive, ref, watch } from 'vue'
import {
  MpButton, MpIcon, MpTextlink, MpInput, MpButtonGroup, MpTooltip, css,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import AmountComparatorField from '~/components/patterns/AmountComparatorField.vue'
import ErpTagComparatorField from '~/components/patterns/ErpTagComparatorField.vue'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import { successToast } from '~/utils/toasts'
import { formatDate } from '~/utils/date'
import { formatIDR } from '~/utils/currency'
import {
  getCrmReport, runCrmReport, measureKey, reportableFieldsFor, fieldLabel,
  archiveCrmReport, restoreCrmReport, cloneCrmReport,
  pinReportMetric, compatibleMeasures, MAX_PINS_PER_MODULE, pinsForModule,
  type ReportCriterion, type ReportMeasure, type ReportRow, type ReportGroupResult, type ReportField,
} from '~/data/crmReports'
import { getCrmModule } from '~/data/crm'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const report = computed(() => getCrmReport(props.orderId))
const AGG_LABELS: Record<string, string> = { count: 'Count', sum: 'Sum', average: 'Average', min: 'Minimum', max: 'Maximum' }

// ─── Quick filters (session-only) — the "All filters" drawer follows the same
// component vocabulary as every other filters drawer in the ERP: an
// AmountComparatorField for currency/number fields, ErpTagComparatorField for
// pick-list/user fields, AdvancedDateRangePicker for date fields, plain text
// for everything else — one always-visible field per report column, not a
// step-by-step "add a criterion" builder (rule/filter-drawer-fields). ────────
const fields = computed(() => (report.value ? reportableFieldsFor(report.value.primaryModuleId, report.value.grain) : []))
function fieldType(id: string) { return fields.value.find((f) => f.id === id)?.type ?? 'text' }

type AmountDraft = { comparator: 'gt' | 'lt' | 'between'; value: string; min: string; max: string }
type TagDraft = { values: string[] }
type DateDraft = { range: Date[] | null }
type TextDraft = { value: string }
type FieldDraft = AmountDraft | TagDraft | DateDraft | TextDraft

function emptyDraftFor(type: ReportField['type']): FieldDraft {
  if (type === 'currency' || type === 'number') return { comparator: 'gt', value: '', min: '', max: '' }
  if (type === 'date') return { range: null }
  if (type === 'pick-list' || type === 'user') return { values: [] }
  return { value: '' }
}
const fieldDrafts = reactive<Record<string, FieldDraft>>({})
watch(fields, (fs) => { for (const f of fs) if (!(f.id in fieldDrafts)) fieldDrafts[f.id] = emptyDraftFor(f.type) }, { immediate: true })
function clearQuickFilters() { for (const f of fields.value) fieldDrafts[f.id] = emptyDraftFor(f.type) }

function isoDate(d: Date): string { return d.toISOString().slice(0, 10) }
const quickCriteria = computed<ReportCriterion[]>(() => {
  const out: ReportCriterion[] = []
  for (const f of fields.value) {
    const d = fieldDrafts[f.id]
    if (!d) continue
    if (f.type === 'currency' || f.type === 'number') {
      const ad = d as AmountDraft
      if (ad.comparator === 'between') { if (ad.min && ad.max) out.push({ id: f.id, fieldId: f.id, operator: 'between', value: ad.min, value2: ad.max }) }
      else if (ad.value) out.push({ id: f.id, fieldId: f.id, operator: ad.comparator, value: ad.value })
    } else if (f.type === 'date') {
      const dd = d as DateDraft
      if (dd.range?.length === 2) out.push({ id: f.id, fieldId: f.id, operator: 'between', value: isoDate(dd.range[0]!), value2: isoDate(dd.range[1]!) })
      else if (dd.range?.length === 1) out.push({ id: f.id, fieldId: f.id, operator: 'exact', value: isoDate(dd.range[0]!) })
    } else if (f.type === 'pick-list' || f.type === 'user') {
      const td = d as TagDraft
      if (td.values.length) out.push({ id: f.id, fieldId: f.id, operator: 'any-of', value: td.values.join(',') })
    } else {
      const xd = d as TextDraft
      if (xd.value.trim()) out.push({ id: f.id, fieldId: f.id, operator: 'contains', value: xd.value.trim() })
    }
  }
  return out
})
const filtersOpen = ref(false)
const activeFilterCount = computed(() => quickCriteria.value.length)

// ─── Execution ───────────────────────────────────────────────────────────────
const result = computed(() => {
  if (!report.value) return null
  return runCrmReport(report.value, { quickCriteria: quickCriteria.value, quickLogic: 'AND' })
})

function colLabel(id: string) { return report.value ? fieldLabel(report.value.primaryModuleId, report.value.grain, id) : id }
function measureLabel(m: ReportMeasure) { return m.fieldId ? `${t(AGG_LABELS[m.fn])} ${colLabel(m.fieldId)}` : t(AGG_LABELS[m.fn]) }
// The on-screen table skips the raw row Count — it's redundant noise next to
// the actual data (exports still carry the full measure set for fidelity).
const displayMeasures = computed(() => report.value?.measures.filter((m) => m.fn !== 'count') ?? [])

// Column settings (rule/filter-bar-icon-group) — the first column can't be hidden.
const columnVisibility = reactive<Record<string, boolean>>({})
watch(() => result.value?.columns, (cols) => { if (cols) for (const c of cols) if (!(c in columnVisibility)) columnVisibility[c] = true }, { immediate: true })
const columnItems = computed(() => result.value?.columns.map((c, i) => ({ key: c, label: colLabel(c), disabled: i === 0 })) ?? [])
const visibleColumns = computed(() => result.value?.columns.filter((c) => columnVisibility[c] !== false) ?? [])

// A report's columns are dynamic per definition, so cells need per-column-type
// formatting the same way any other ERP table formats a date/currency column —
// date fields render DD/MM/YYYY (rule/format-date), currency fields render Rp.
function cellText(col: string, value: unknown): string {
  if (value == null || value === '') return '—'
  const type = fieldType(col)
  if (type === 'date') return formatDate(String(value))
  if (type === 'currency') return formatIDR(Number(value))
  return String(value)
}
// A sum/average/min/max over a currency field is itself a currency amount; Count
// (and aggregates over non-currency fields) render as a plain number.
function measureText(m: ReportMeasure, n: number | undefined): string {
  const v = n ?? 0
  return m.fn !== 'count' && m.fieldId && fieldType(m.fieldId) === 'currency' ? formatIDR(v) : String(v)
}

// ─── Results table — filter bar + regular pagination. This table is the
// page's own primary content (an index-style result grid the user browses,
// filters and exports), not a secondary line-items list embedded in a bigger
// record — so per rule/table-pagination-model it takes ERP's REGULAR
// pagination (rows-per-page + page nav, via ErpPagination), not the
// progressive/infinite-scroll model reserved for embedded detail tables. ────
const tableSearch = ref('')
function rowMatches(row: ReportRow, q: string): boolean {
  return Object.values(row.cells).some((v) => String(v ?? '').toLowerCase().includes(q))
}

// rule/table-sortable-columns — every column sortable via a hover-header icon
// → MpPopover of asc/desc options (mirrors ErpTablePage's column-menu sort,
// docs/patterns/ErpTablePage.md), not just a bare click-to-toggle.
const sortKey = ref('')
const sortDir = ref<'asc' | 'desc'>('asc')
function sortOptionLabels(col: string): [string, string] {
  // Matches ErpTablePage.vue's own sort-menu option labels verbatim (plain,
  // unlocalized — that shared component doesn't run these through t() either).
  const type = fieldType(col)
  if (type === 'number' || type === 'currency') return ['Low to high', 'High to low']
  if (type === 'date') return ['Oldest first', 'Newest first']
  return ['A - Z', 'Z - A']
}
// Picking the already-active direction again clears the sort (rule/table-sortable-columns).
function setSort(key: string, dir: 'asc' | 'desc') {
  if (sortKey.value === key && sortDir.value === dir) { sortKey.value = ''; sortDir.value = 'asc' }
  else { sortKey.value = key; sortDir.value = dir }
}
function sortRows(rows: ReportRow[]): ReportRow[] {
  if (!sortKey.value) return rows
  const key = sortKey.value
  return [...rows].sort((a, b) => {
    const av = a.cells[key]
    const bv = b.cells[key]
    const cmp = typeof av === 'number' && typeof bv === 'number'
      ? av - bv
      : String(av ?? '').localeCompare(String(bv ?? ''), undefined, { numeric: true, sensitivity: 'base' })
    return sortDir.value === 'asc' ? cmp : -cmp
  })
}

type DisplayRow = { kind: 'group'; group: ReportGroupResult } | { kind: 'row'; row: ReportRow }
const flatRows = computed<DisplayRow[]>(() => {
  if (!result.value) return []
  const q = tableSearch.value.trim().toLowerCase()
  if (result.value.groups) {
    const out: DisplayRow[] = []
    for (const g of result.value.groups) {
      const rows = sortRows(q ? g.rows.filter((r) => rowMatches(r, q)) : g.rows)
      if (q && !rows.length) continue
      out.push({ kind: 'group', group: g })
      if (report.value?.grouping?.showDetailRows) for (const row of rows) out.push({ kind: 'row', row })
    }
    return out
  }
  const rows = sortRows(q ? result.value.rows.filter((r) => rowMatches(r, q)) : result.value.rows)
  return rows.map((row) => ({ kind: 'row', row }))
})

const currentPage = ref(1)
const perPage = ref(25)
const totalRows = computed(() => flatRows.value.length)
const visibleFlatRows = computed(() => flatRows.value.slice((currentPage.value - 1) * perPage.value, currentPage.value * perPage.value))
function setPage(page: number) { currentPage.value = Math.max(1, Math.min(page, Math.max(1, Math.ceil(totalRows.value / perPage.value)))) }
function setPerPage(n: number) { perPage.value = n; currentPage.value = 1 }
// Reset to page 1 whenever the underlying result set changes (report switched,
// a quick filter added/edited, or the results-table search term changes).
watch([result, tableSearch], () => { currentPage.value = 1 })

// ─── Actions ────────────────────────────────────────────────────────────────
function edit() { if (report.value) router.push(`/crm/reports/${report.value.id}/edit`) }
function duplicate() {
  if (!report.value) return
  const clone = cloneCrmReport(report.value.id)
  if (clone) { successToast(t('Report duplicated')); router.push(`/crm/reports/${clone.id}`) }
}
function doArchive() { if (report.value) { archiveCrmReport(report.value.id); successToast(t('Report archived')); router.push('/crm/reports') } }
function doRestore() { if (report.value) { restoreCrmReport(report.value.id); successToast(t('Report restored')) } }

function visibilityLabel(v: string) {
  return v === 'private' ? t('Private') : v === 'selected' ? t('Selected Users/Teams') : t('Everyone eligible')
}

// ─── Activity log (rule/activity-log-modal — opened only from the "Last
// updated by …" link, never a toolbar button or tab) ─────────────────────────
const activityOpen = ref(false)
const lastUpdatedDisplay = computed(() => {
  if (!report.value) return ''
  const d = new Date(report.value.updatedAt)
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${t('Last updated by')} ${report.value.updatedBy} ${t('on')} ${date}, ${time} (GMT+7)`
})
const activityEntries = computed<ActivityEntry[]>(() => {
  const r = report.value
  if (!r) return []
  return [
    { date: r.updatedAt, user: r.updatedBy, activity: 'Updated', details: [{ label: t('Report name'), value: r.name }] },
    {
      date: r.createdAt, user: r.ownerId, activity: 'Created',
      details: [
        { label: t('Report name'), value: r.name },
        { label: t('Module'), value: getCrmModule(r.primaryModuleId)?.name ?? r.primaryModuleId },
        { label: t('Visibility'), value: visibilityLabel(r.visibility) },
      ],
    },
  ]
})

// ─── Pin as module metric ───────────────────────────────────────────────────
const pinTarget = ref(false)
const pinMeasure = ref<ReportMeasure | null>(null)
const pinLabel = ref('')
const eligibleMeasures = computed(() => (report.value ? compatibleMeasures(report.value) : []))
function openPin() {
  if (!report.value) return
  pinMeasure.value = eligibleMeasures.value[0] ?? null
  pinLabel.value = report.value.name
  pinTarget.value = true
}
const pinCountForModule = computed(() => (report.value ? pinsForModule(report.value.primaryModuleId).length : 0))
function confirmPin() {
  if (!report.value || !pinMeasure.value) return
  const pin = pinReportMetric(report.value.primaryModuleId, report.value.id, pinMeasure.value, pinLabel.value.trim() || report.value.name)
  if (pin) { successToast(t('Pinned to module metrics')); pinTarget.value = false }
}

// ─── Export — the shared ExportModal (rule/filter-bar-search-export), same
// scope/column-picker behaviour used across every other index page. ─────────
const exportOpen = ref(false)
const exportColumnsForModal = computed(() => result.value?.columns.map((c) => ({ key: c, label: colLabel(c) })) ?? [])
function esc(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function onExportConfirm(payload: { scope: 'all' | 'page' | 'selected'; columns: string[] }) {
  if (!result.value || !report.value) return
  exportOpen.value = false
  const rows = payload.scope === 'page'
    ? visibleFlatRows.value.filter((dr): dr is Extract<DisplayRow, { kind: 'row' }> => dr.kind === 'row').map((dr) => dr.row)
    : result.value.rows
  const headers = payload.columns.map(colLabel)
  const lines = [headers.join(',')]
  for (const row of rows) lines.push(payload.columns.map((c) => esc(row.cells[c])).join(','))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${report.value.name}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
  successToast(t('Exported') + ` ${rows.length} ` + t('rows'))
}
</script>

<template>
  <div v-if="!report" class="rv-notfound">
    <p>{{ t('This report is unavailable or has been removed.') }}</p>
    <MpButton variant="secondary" is-rounded @click="router.push('/crm/reports')">{{ t('Back to Reports') }}</MpButton>
  </div>
  <div v-else class="crm">
    <MpTabs id="rv-tabs" :default-value="0" variant-color="green" class="rv-tabs">
      <div class="rv-header">
        <header class="crm-titlebar">
          <div class="crm-titlebar__left">
            <MpTextlink id="rv-breadcrumb" as="a" class="rv-breadcrumb" @click.prevent="router.push('/crm/reports')">{{ t('Reports') }}</MpTextlink>
            <div class="rv-title-row">
              <h1 class="crm-title">{{ report.name }}</h1>
              <ErpStatusBadge
                v-if="report.status !== 'active'"
                :status="report.status"
                type="announcement"
                :label="t('Archived')"
                badge-for="additionalInformation"
                size="md"
              />
            </div>
          </div>
          <div class="crm-titlebar__right">
            <!-- Single primary "Actions ▾" dropdown (details-page-format.md §C) — Edit,
                 Duplicate, Pin, Archive/Restore all live here (Export moved to the
                 table's own filter bar, matching every other index page). -->
            <MpPopover id="rv-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <MpButton variant="primary" is-rounded right-icon="chevrons-down">{{ t('Actions') }}</MpButton>
              </MpPopoverTrigger>
              <MpPopoverContent class="erp-dropdown-menu">
                <MpPopoverList>
                  <MpPopoverListItem v-if="report.status === 'active'" @click="edit">{{ t('Edit') }}</MpPopoverListItem>
                  <MpPopoverListItem @click="duplicate">{{ t('Duplicate') }}</MpPopoverListItem>
                  <MpPopoverListItem v-if="report.status === 'active' && eligibleMeasures.length" @click="openPin">{{ t('Pin as module metric') }}</MpPopoverListItem>
                </MpPopoverList>
                <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
                <MpPopoverList>
                  <MpPopoverListItem v-if="report.status !== 'archived'" @click="doArchive">{{ t('Archive') }}</MpPopoverListItem>
                  <MpPopoverListItem v-else @click="doRestore">{{ t('Restore') }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>
        </header>

        <!-- Tabs live in the gray header band, outside the white stage. -->
        <MpTabList>
          <MpTab>{{ t('Reports') }}</MpTab>
          <MpTab>{{ t('Report details') }}</MpTab>
        </MpTabList>
      </div>

      <div class="cc-stage">
        <MpTabPanels>

          <!-- ── Reports tab — quick filters (filter bar), results table, pagination ── -->
          <MpTabPanel>
            <!-- This is a dynamic pivot grid — columns, grouping and measures are all
                 user-defined per report definition, which doesn't map onto ErpTablePage's
                 fixed-`kind` column model, so it's a lighter hand-rolled read-only
                 `<table>` matching the ErpTablePage header/row spec instead (28px
                 UPPERCASE header, 8px cell padding, middle-aligned single-line rows,
                 no bold body text). This table IS the page's primary content — an
                 index-style result grid the user browses/filters/exports, not a
                 secondary line-items list embedded in a bigger record — so per
                 rule/table-pagination-model it uses ERP's regular pagination
                 (rows-per-page + page nav via ErpPagination), not the
                 progressive/infinite-scroll model reserved for embedded detail
                 tables. Borderless per rule/table-no-outer-border. -->
            <div v-if="result">
              <!-- Filter bar — left: "All filters" (the quick-filter criteria builder,
                   rule/filter-bar-all-filters-drawer); right: search. -->
              <div class="rv-table-filterbar">
                <div class="filter-left">
                  <button class="btn-enterprise btn-enterprise--secondary filter-all-btn" type="button" @click="filtersOpen = true">
                    <MpIcon name="filter" size="sm" />
                    {{ t('All filters') }}{{ activeFilterCount ? ` (${activeFilterCount})` : '' }}
                  </button>
                </div>
                <div class="filter-right">
                  <MpButtonGroup class="filter-btn-group">
                    <ColumnSettingsMenu id="rv-columns" :items="columnItems" :visibility="columnVisibility" />
                    <MpTooltip :label="t('Export')" placement="bottom">
                      <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="exportOpen = true" />
                    </MpTooltip>
                  </MpButtonGroup>
                  <div class="filter-search">
                    <MpIcon name="search" size="sm" />
                    <input v-model="tableSearch" class="filter-search-input" type="text" :placeholder="t('Search results…')">
                    <button v-if="tableSearch" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="tableSearch = ''"><MpIcon name="close" size="sm" /></button>
                  </div>
                </div>
              </div>

              <div class="rv-scroll">
                <table class="rv-table">
                  <thead>
                    <tr>
                      <th v-for="col in visibleColumns" :key="col" class="rv-th">
                        <span class="th-inner">
                          <span class="th-label">{{ colLabel(col) }}</span>
                          <MpPopover :id="`rv-sort-${col}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                            <MpPopoverTrigger>
                              <MpButton class="rv-sort-btn" is-rounded :class="{ 'rv-sort-btn--active': sortKey === col }" :aria-label="t('Sort column')" @click.stop>
                                <MpIcon name="sort-default" size="16px" />
                              </MpButton>
                            </MpPopoverTrigger>
                            <MpPopoverContent :class="css({ minWidth: '184px', width: 'max-content', whiteSpace: 'nowrap' })">
                              <MpPopoverList>
                                <MpPopoverListItem @click="setSort(col, 'asc')">{{ sortOptionLabels(col)[0] }}</MpPopoverListItem>
                                <MpPopoverListItem @click="setSort(col, 'desc')">{{ sortOptionLabels(col)[1] }}</MpPopoverListItem>
                              </MpPopoverList>
                            </MpPopoverContent>
                          </MpPopover>
                        </span>
                      </th>
                      <th v-for="m in displayMeasures" :key="measureKey(m)" class="rv-th rv-num">{{ measureLabel(m) }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="(dr, i) in visibleFlatRows" :key="i">
                      <tr v-if="dr.kind === 'group'" class="rv-group-row">
                        <td :colspan="visibleColumns.length" class="rv-td rv-group-label">{{ dr.group.label }}</td>
                        <td v-for="m in displayMeasures" :key="measureKey(m)" class="rv-td rv-num">{{ measureText(m, dr.group.totals[measureKey(m)]) }}</td>
                      </tr>
                      <tr v-else>
                        <td v-for="col in visibleColumns" :key="col" class="rv-td">{{ cellText(col, dr.row.cells[col]) }}</td>
                        <td v-for="m in displayMeasures" :key="measureKey(m)" class="rv-td rv-num">—</td>
                      </tr>
                    </template>
                    <tr v-if="!flatRows.length">
                      <td :colspan="visibleColumns.length + displayMeasures.length" class="rv-td rv-empty-cell">
                        {{ tableSearch.trim() ? t('No rows match your search.') : t('This report has no permitted records right now.') }}
                      </td>
                    </tr>
                    <tr v-else-if="displayMeasures.length" class="rv-grand-row">
                      <td :colspan="visibleColumns.length" class="rv-td rv-group-label">{{ result.groups ? t('Grand total') : t('Total') }}</td>
                      <td v-for="m in displayMeasures" :key="measureKey(m)" class="rv-td rv-num">{{ measureText(m, result.grandTotals[measureKey(m)]) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <ErpPagination
                :total="totalRows"
                :current-page="currentPage"
                :per-page="perPage"
                @page-change="setPage"
                @per-page-change="setPerPage"
              />
            </div>
          </MpTabPanel>

          <!-- ── Report details tab — horizontal ContentList (label left / value right) ── -->
          <MpTabPanel>
            <div class="rv-info-list" data-devchange="crm-reports-detail-tab">
              <ContentList horizontal :label="t('Description')" :value="report.description || t('No description')" />
              <ContentList horizontal :label="t('Module')" :value="getCrmModule(report.primaryModuleId)?.name ?? report.primaryModuleId" />
              <ContentList horizontal :label="t('Owner')" :value="report.ownerId" />
              <ContentList horizontal :label="t('Visibility')" :value="visibilityLabel(report.visibility)" />
              <ContentList horizontal :label="t('Status')" :value="report.status === 'active' ? t('Active') : t('Archived')" />
              <ContentList horizontal :label="t('Result grain')" :value="report.grain === 'product-line' ? t('Product List line') : t('CRM record')" />
              <ContentList horizontal :label="t('Columns')" :value="String(report.columns.length)" />
              <ContentList horizontal :label="t('Saved filters')" :value="report.criteria.length ? String(report.criteria.length) + ' (' + report.criteriaLogic + ')' : t('None')" />
              <ContentList horizontal :label="t('Grouping')" :value="report.grouping ? colLabel(report.grouping.fieldId) + (report.grouping.dateBucket ? ' (' + report.grouping.dateBucket + ')' : '') : t('None')" />
              <ContentList horizontal :label="t('Summaries')" :value="report.measures.length ? report.measures.map(measureLabel).join(', ') : t('None')" />
              <ContentList horizontal :label="t('Sort')" :value="report.sort ? colLabel(report.sort.fieldId) + ' (' + report.sort.direction + ')' : t('Default')" />
              <ContentList horizontal :label="t('Created')" :value="formatDate(report.createdAt)" />
            </div>
            <a class="rv-updated" role="button" tabindex="0" @click.prevent="activityOpen = true" @keydown.enter="activityOpen = true">{{ lastUpdatedDisplay }}</a>
          </MpTabPanel>

        </MpTabPanels>
      </div>
    </MpTabs>

    <!-- ── All filters drawer (rule/drawer-custom-shell, rule/filter-drawer-fields)
         — one always-visible field per report column, each using the same
         control vocabulary as every other filters drawer: AmountComparatorField
         (currency/number), ErpTagComparatorField (pick-list/user),
         AdvancedDateRangePicker (date), plain text otherwise. Edits apply live
         as you fill the form in, so Apply/Close both just dismiss the drawer. -->
    <Teleport to="body">
      <Transition name="rv-filters">
        <div v-if="filtersOpen" class="rv-filters-overlay">
          <div class="rv-filters-panel" role="dialog" :aria-label="t('All filters')">
            <header class="rv-filters-header">
              <span class="rv-filters-title">{{ t('All filters') }}</span>
              <MpButton class="rv-filters-close" is-rounded :aria-label="t('Close')" @click="filtersOpen = false"><MpIcon name="close" size="md" /></MpButton>
            </header>

            <div class="rv-filters-body">
              <div v-for="f in fields" :key="f.id" class="rv-filter-field">
                <span class="rv-filter-field-label">{{ f.label }}</span>

                <AmountComparatorField
                  v-if="f.type === 'currency' || f.type === 'number'"
                  :id="`rv-f-${f.id}`"
                  :comparator="(fieldDrafts[f.id] as any).comparator"
                  :value="(fieldDrafts[f.id] as any).value"
                  :min="(fieldDrafts[f.id] as any).min"
                  :max="(fieldDrafts[f.id] as any).max"
                  @update:comparator="(fieldDrafts[f.id] as any).comparator = $event"
                  @update:value="(fieldDrafts[f.id] as any).value = $event"
                  @update:min="(fieldDrafts[f.id] as any).min = $event"
                  @update:max="(fieldDrafts[f.id] as any).max = $event"
                />

                <AdvancedDateRangePicker
                  v-else-if="f.type === 'date'"
                  :id="`rv-f-${f.id}`"
                  :model-value="(fieldDrafts[f.id] as any).range"
                  is-full-width hide-label
                  :placeholder="t('Select a date range')"
                  @update:model-value="(fieldDrafts[f.id] as any).range = $event"
                />

                <ErpTagComparatorField
                  v-else-if="f.type === 'pick-list' || f.type === 'user'"
                  :id="`rv-f-${f.id}`"
                  comparator="isAnyOf"
                  :comparators="['isAnyOf']"
                  :values="(fieldDrafts[f.id] as any).values"
                  :options="[...(f.options ?? [])]"
                  :placeholder="t('Type a value…')"
                  @update:values="(fieldDrafts[f.id] as any).values = $event"
                />

                <MpInput
                  v-else
                  :id="`rv-f-${f.id}`"
                  :model-value="(fieldDrafts[f.id] as any).value"
                  :placeholder="t('Value')" is-full-width
                  @update:model-value="(fieldDrafts[f.id] as any).value = $event"
                />
              </div>
            </div>

            <footer class="rv-filters-footer">
              <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="clearQuickFilters">{{ t('Reset filter') }}</button>
              <button class="btn-enterprise btn-enterprise--primary" type="button" @click="filtersOpen = false">{{ t('Apply') }}</button>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>

    <!-- ── Export (rule/filter-bar-search-export) — the shared ExportModal. -->
    <ExportModal
      :open="exportOpen"
      :title="t('Export report')"
      :entity-label="t('rows')"
      :columns="exportColumnsForModal"
      :total="result?.rows.length ?? 0"
      @close="exportOpen = false"
      @export="onExportConfirm"
    />

    <!-- ── Pin as module metric ── -->
    <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false" id="rv-pin-modal" :is-open="pinTarget" size="md" :is-keep-alive="false" @close="pinTarget = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Pin as module metric') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <p v-if="pinCountForModule >= MAX_PINS_PER_MODULE" class="rv-pin-limit">
            {{ t('This module already has 6 pinned metrics — the maximum. Unpin one first.') }}
          </p>
          <template v-else>
            <ErpFilterSelect
              id="rv-pin-measure" :model-value="pinMeasure ? measureKey(pinMeasure) : ''" :placeholder="t('Metric')"
              :options="eligibleMeasures.map(m => ({ value: measureKey(m), label: measureLabel(m) }))"
              width="100%" :is-clearable="false"
              @update:model-value="(v: string) => pinMeasure = eligibleMeasures.find(m => measureKey(m) === v) ?? null"
            />
            <MpInput v-model="pinLabel" class="rv-pin-label-input" :placeholder="t('Card label')" is-full-width />
          </template>
        </MpModalBody>
        <MpModalFooter>
          <MpButton variant="ghost" is-rounded @click="pinTarget = false">{{ t('Cancel') }}</MpButton>
          <MpButton v-if="pinCountForModule < MAX_PINS_PER_MODULE" variant="primary" is-rounded @click="confirmPin">{{ t('Pin') }}</MpButton>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <ActivityLogModal :is-open="activityOpen" :subject="report.name" :entries="activityEntries" @close="activityOpen = false" />
  </div>
</template>

<style scoped>
.crm { display: flex; flex-direction: column; height: 100%; min-height: 0; }
/* page-title-bar.md — fixed 72px, contents vertically centred, no subtitle line. */
.crm-titlebar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.crm-titlebar__left { display: flex; flex-direction: column; justify-content: center; gap: 0; }
/* rule/detail-breadcrumb-no-gap — breadcrumb sits directly above the title, gap: 0. */
.rv-breadcrumb { align-self: flex-start; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px); }
.rv-title-row { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.crm-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.crm-titlebar__right { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }

.cc-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); padding: var(--mp-spacing-5, 20px) var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); }

/* Tabs live in the gray header band, outside the white stage (mirrors
   CrmCompanyRecordPage.vue's header-fused tabs). */
.rv-tabs { display: flex; flex-direction: column; height: 100%; min-height: 0; margin-top: 0; }
.rv-header { flex-shrink: 0; background: var(--mp-background-neutral-subtle, #f8f9f9); }
.rv-tabs :deep(.mp-tab--isSelected_true), .rv-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.rv-tabs :deep(.mp-tab-selected-border--isSelected_true) { background-color: var(--mp-border-selected, #029861) !important; }
.rv-tabs :deep([data-pixel-component="MpTabList"]) { margin: 0 var(--mp-spacing-6) !important; margin-bottom: 0 !important; border-bottom: none !important; box-shadow: none !important; } /* pixel-police-allow-shadow: removes Pixel's default shadow, doesn't add one */

/* Report details tab — horizontal ContentList stack (label left / value right). */
.rv-info-list { display: flex; flex-direction: column; gap: var(--mp-spacing-3); max-width: 640px; }
/* rule/activity-log-trigger — opens ActivityLogModal, the only affordance for it. */
.rv-updated { display: inline-block; margin-top: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer; text-decoration: none; }
.rv-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

.rv-pin-label-input { width: 100%; margin-top: var(--mp-spacing-3); }
.rv-pin-limit { color: var(--mp-text-danger); }

/* Filter bar above the results table — left: "All filters"; right: search. */
.rv-table-filterbar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5); }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-all-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3); font-weight: var(--mp-font-weights-semi-bold); }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  width: var(--mp-sizes-62, 248px); padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
/* rule/form-focus-border-bold — hand-rolled input focus is a neutral bold
   border + 1px neutral ring, never Pixel's default brand-emerald ring. */
.filter-search:focus-within { border-color: var(--mp-colors-border-bold, #8c9596); outline: 1px solid var(--mp-colors-border-bold, #8c9596); outline-offset: -1px; }
.filter-search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); border-radius: var(--mp-radii-full, 999px); }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

/* rule/table-no-outer-border — regular-pagination table has no outer border
   box; wrapper is overflow-x: auto only (horizontal scroll for wide reports). */
.rv-scroll { overflow-x: auto; }
.rv-table { width: 100%; border-collapse: collapse; }
/* rule/table-header-uppercase + rule/table-header-height — 28px, UPPERCASE 12px semibold. */
.rv-th {
  height: var(--mp-sizes-7, 28px); box-sizing: border-box;
  text-align: left; text-transform: uppercase;
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle, #f1f5f9);
  padding: var(--mp-spacing-1) var(--mp-spacing-3); white-space: nowrap;
}
/* rule/table-sortable-columns — hover-header icon → popover sort menu (mirrors ErpTablePage.vue). */
.th-inner { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); max-width: 100%; }
.th-label { overflow: hidden; text-overflow: ellipsis; }
.rv-sort-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-4, 16px) !important; height: var(--mp-sizes-4, 16px) !important; min-width: 0 !important; flex-shrink: 0;
  border: none !important; background: none !important; cursor: pointer; border-radius: var(--mp-radii-sm) !important;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  visibility: hidden;
}
.rv-th:hover .rv-sort-btn, .rv-sort-btn--active { visibility: visible; }
.rv-sort-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.rv-sort-btn--active { color: var(--mp-text-selected, var(--mp-text-default)); }
/* rule/table-cell-padding-align — 8px v-padding, middle-aligned (every row here is single-line).
   rule/table-cell-text-plain — body text stays regular weight; group/grand rows read via
   background shading only, never bold. */
.rv-td {
  padding: var(--mp-spacing-2) var(--mp-spacing-3); vertical-align: middle;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.rv-num { text-align: right; white-space: nowrap; }
.rv-group-row { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.rv-grand-row { background: var(--mp-background-neutral-subtle, #f1f5f9); }
.rv-empty-cell { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-8); }

.rv-notfound { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); height: 100%; color: var(--mp-text-secondary); }

/* "All filters" drawer — rule/drawer-custom-shell (never MpDrawer). */
.rv-filters-enter-active, .rv-filters-leave-active { transition: background-color 250ms ease; }
.rv-filters-enter-from, .rv-filters-leave-to { background-color: transparent; }
.rv-filters-enter-active .rv-filters-panel { transition: transform 350ms ease-out; }
.rv-filters-leave-active .rv-filters-panel { transition: transform 250ms ease-in; }
.rv-filters-enter-from .rv-filters-panel, .rv-filters-leave-to .rv-filters-panel { transform: translateX(calc(100% + 12px)); }

.rv-filters-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.rv-filters-panel { margin: var(--mp-spacing-3); width: min(420px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden; }
.rv-filters-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.rv-filters-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rv-filters-close { display: inline-flex !important; align-items: center; justify-content: center; width: 36px !important; height: 36px !important; min-width: 0 !important; border: none !important; background: none !important; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.rv-filters-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.rv-filters-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-5); padding: var(--mp-spacing-4); }
.rv-filter-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.rv-filter-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rv-filters-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default, #e3e7e9); }
</style>
