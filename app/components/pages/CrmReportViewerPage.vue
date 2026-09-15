<script setup lang="ts">
/**
 * CRM — Report viewer/run surface (/crm/reports/:id).
 *
 * Runs the saved definition against current mock CRM data, offers temporary
 * session-only quick filters (never touch the saved definition), and real
 * CSV/XLSX export. See app/data/crmReports.ts for the execution engine.
 */
import { computed, reactive, ref } from 'vue'
import {
  MpButton, MpIcon, css,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { successToast } from '~/utils/toasts'
import {
  getCrmReport, runCrmReport, measureKey, reportableFieldsFor, fieldLabel,
  archiveCrmReport, restoreCrmReport, cloneCrmReport,
  pinReportMetric, compatibleMeasures, MAX_PINS_PER_MODULE, pinsForModule,
  OPERATORS_BY_TYPE, type ReportCriterion, type ReportMeasure,
} from '~/data/crmReports'
import { getCrmModule } from '~/data/crm'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const report = computed(() => getCrmReport(props.orderId))
const AGG_LABELS: Record<string, string> = { count: 'Count', sum: 'Sum', average: 'Average', min: 'Minimum', max: 'Maximum' }

// ─── Quick filters (session-only) ───────────────────────────────────────────
const quickCriteria = reactive<ReportCriterion[]>([])
const fields = computed(() => (report.value ? reportableFieldsFor(report.value.primaryModuleId, report.value.grain) : []))
function fieldType(id: string) { return fields.value.find((f) => f.id === id)?.type ?? 'text' }
function operatorsFor(id: string) { return OPERATORS_BY_TYPE[fieldType(id)] ?? [] }
function addQuickFilter() {
  const first = fields.value[0]
  if (!first) return
  quickCriteria.push({ id: `q-${Date.now()}`, fieldId: first.id, operator: operatorsFor(first.id)[0]?.value ?? 'equals' })
}
function removeQuickFilter(id: string) { const i = quickCriteria.findIndex((c) => c.id === id); if (i >= 0) quickCriteria.splice(i, 1) }
function clearQuickFilters() { quickCriteria.splice(0, quickCriteria.length) }
function needsValue(c: ReportCriterion) { return operatorsFor(c.fieldId).find((o) => o.value === c.operator)?.needsValue ?? true }

// ─── Execution ───────────────────────────────────────────────────────────────
const result = computed(() => {
  if (!report.value) return null
  return runCrmReport(report.value, { quickCriteria: [...quickCriteria], quickLogic: 'AND' })
})

function colLabel(id: string) { return report.value ? fieldLabel(report.value.primaryModuleId, report.value.grain, id) : id }
function measureLabel(m: ReportMeasure) { return m.fieldId ? `${t(AGG_LABELS[m.fn])} ${colLabel(m.fieldId)}` : t(AGG_LABELS[m.fn]) }

// ─── Actions ────────────────────────────────────────────────────────────────
function edit() { if (report.value) router.push(`/crm/reports/${report.value.id}/edit`) }
function duplicate() {
  if (!report.value) return
  const clone = cloneCrmReport(report.value.id)
  if (clone) { successToast(t('Report duplicated')); router.push(`/crm/reports/${clone.id}`) }
}
function doArchive() { if (report.value) { archiveCrmReport(report.value.id); successToast(t('Report archived')); router.push('/crm/reports') } }
function doRestore() { if (report.value) { restoreCrmReport(report.value.id); successToast(t('Report restored')) } }

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

// ─── Export ─────────────────────────────────────────────────────────────────
function esc(v: unknown): string {
  const s = String(v ?? '')
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function exportCsv() {
  if (!result.value || !report.value) return
  const headers = result.value.columns.map(colLabel)
  const lines = [headers.join(',')]
  for (const row of result.value.rows) lines.push(result.value.columns.map((c) => esc(row.cells[c])).join(','))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `${report.value.name}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
  successToast(t('Exported') + ` ${result.value.rows.length} ` + t('rows'))
}
async function exportXlsx() {
  if (!result.value || !report.value) return
  const XLSX = await import('xlsx')
  const headers = result.value.columns.map(colLabel)
  const detailRows = result.value.rows.map((r) => result.value!.columns.map((c) => r.cells[c] ?? ''))
  const wb = XLSX.utils.book_new()
  const detailSheet = XLSX.utils.aoa_to_sheet([headers, ...detailRows])
  XLSX.utils.book_append_sheet(wb, detailSheet, 'Details')
  if (result.value.groups) {
    const summaryRows: unknown[][] = [['Group', ...report.value.measures.map(measureLabel)]]
    for (const g of result.value.groups) summaryRows.push([g.label, ...report.value.measures.map((m) => g.totals[measureKey(m)])])
    summaryRows.push(['Grand total', ...report.value.measures.map((m) => result.value!.grandTotals[measureKey(m)])])
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows)
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary')
  }
  XLSX.writeFile(wb, `${report.value.name}.xlsx`)
  successToast(t('Exported') + ` ${result.value.rows.length} ` + t('rows'))
}
</script>

<template>
  <div v-if="!report" class="rv-notfound">
    <p>{{ t('This report is unavailable or has been removed.') }}</p>
    <MpButton variant="secondary" is-rounded @click="router.push('/crm/reports')">{{ t('Back to Reports') }}</MpButton>
  </div>
  <div v-else class="crm">
    <header class="crm-titlebar">
      <div class="crm-titlebar__left">
        <div class="rv-title-row">
          <h1 class="crm-title">{{ report.name }}</h1>
          <ErpStatusBadge
            v-if="report.status !== 'active'"
            :status="report.status"
            :type="report.status === 'needs-attention' ? 'warning' : 'announcement'"
            :label="report.status === 'needs-attention' ? t('Needs attention') : t('Archived')"
            size="md"
          />
        </div>
        <span class="crm-subtitle">{{ report.description || t('No description') }}</span>
      </div>
      <div class="crm-titlebar__right">
        <MpButton v-if="report.status === 'active'" variant="secondary" is-rounded left-icon="edit" @click="edit">{{ t('Edit') }}</MpButton>
        <MpPopover id="rv-export" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="secondary" is-rounded left-icon="download">{{ t('Export') }}</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem @click="exportCsv">{{ t('Detailed CSV') }}</MpPopoverListItem>
              <MpPopoverListItem @click="exportXlsx">{{ t('Detailed XLSX') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
        <MpPopover id="rv-more" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem @click="duplicate">{{ t('Clone') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="report.status === 'active' && eligibleMeasures.length" @click="openPin">{{ t('Pin as module metric') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="report.status !== 'archived'" :class="css({ color: 'var(--mp-text-critical, var(--mp-text-danger))' })" @click="doArchive">{{ t('Archive') }}</MpPopoverListItem>
              <MpPopoverListItem v-else @click="doRestore">{{ t('Restore') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <div class="cc-stage">
      <div class="rv-meta">
        <span><strong>{{ t('Module') }}:</strong> {{ getCrmModule(report.primaryModuleId)?.name ?? report.primaryModuleId }}</span>
        <span><strong>{{ t('Owner') }}:</strong> {{ report.ownerId }}</span>
        <span><strong>{{ t('Visibility') }}:</strong> {{ report.visibility === 'private' ? t('Private') : report.visibility === 'selected' ? t('Selected Users/Teams') : t('Everyone eligible') }}</span>
        <span><strong>{{ t('Last modified') }}:</strong> {{ new Date(report.updatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) }} — {{ report.updatedBy }}</span>
      </div>

      <!-- ── Saved criteria summary ── -->
      <div v-if="report.criteria.length" class="rv-criteria-chips">
        <span v-for="c in report.criteria" :key="c.id" class="rv-chip">
          {{ colLabel(c.fieldId) }} {{ c.operator }} {{ c.value ?? '' }}
        </span>
      </div>

      <!-- ── Quick filters (session-only) ── -->
      <div class="rv-quickfilters">
        <span class="rv-quick-label">{{ t('Quick filters') }} <span class="rv-quick-hint">({{ t('this session only — not saved') }})</span></span>
        <div v-for="c in quickCriteria" :key="c.id" class="rv-quick-row">
          <ErpFilterSelect :id="`rv-qf-field-${c.id}`" :model-value="c.fieldId" :placeholder="t('Field')" :options="fields.map(f => ({ value: f.id, label: f.label }))" width="180px" @update:model-value="(v: string) => { c.fieldId = v; c.operator = operatorsFor(v)[0]?.value ?? 'equals' }" />
          <ErpFilterSelect :id="`rv-qf-op-${c.id}`" v-model="c.operator" :placeholder="t('Operator')" :options="operatorsFor(c.fieldId)" width="140px" :is-clearable="false" />
          <input v-if="needsValue(c)" v-model="c.value" class="rv-value-input" type="text" :placeholder="t('Value')">
          <button class="rb-icon-btn" type="button" :aria-label="t('Remove filter')" @click="removeQuickFilter(c.id)"><MpIcon name="close" size="sm" /></button>
        </div>
        <div class="rv-quick-actions">
          <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="addQuickFilter"><MpIcon name="add" size="sm" /> {{ t('Add quick filter') }}</button>
          <button v-if="quickCriteria.length" class="btn-enterprise btn-enterprise--ghost" type="button" @click="clearQuickFilters">{{ t('Clear') }}</button>
        </div>
      </div>

      <!-- ── Results ── -->
      <div v-if="result" class="rv-table-wrap">
        <table class="rv-table">
          <thead>
            <tr>
              <th v-for="col in result.columns" :key="col">{{ colLabel(col) }}</th>
              <th v-for="m in report.measures" :key="measureKey(m)" class="rv-num">{{ measureLabel(m) }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-if="result.groups">
              <template v-for="g in result.groups" :key="g.key">
                <tr class="rv-group-row">
                  <td :colspan="result.columns.length" class="rv-group-label">{{ g.label }} ({{ g.rows.length }})</td>
                  <td v-for="m in report.measures" :key="measureKey(m)" class="rv-num rv-group-total">{{ g.totals[measureKey(m)] }}</td>
                </tr>
                <tr v-if="report.grouping?.showDetailRows" v-for="row in g.rows" :key="row.key">
                  <td v-for="col in result.columns" :key="col">{{ row.cells[col] ?? '—' }}</td>
                  <td v-for="m in report.measures" :key="measureKey(m)" class="rv-num">—</td>
                </tr>
              </template>
              <tr class="rv-grand-row">
                <td :colspan="result.columns.length" class="rv-group-label">{{ t('Grand total') }}</td>
                <td v-for="m in report.measures" :key="measureKey(m)" class="rv-num">{{ result.grandTotals[measureKey(m)] }}</td>
              </tr>
            </template>
            <template v-else>
              <tr v-for="row in result.rows" :key="row.key">
                <td v-for="col in result.columns" :key="col">{{ row.cells[col] ?? '—' }}</td>
                <td v-for="m in report.measures" :key="measureKey(m)" class="rv-num">—</td>
              </tr>
              <tr v-if="report.measures.length" class="rv-grand-row">
                <td :colspan="result.columns.length" class="rv-group-label">{{ t('Total') }}</td>
                <td v-for="m in report.measures" :key="measureKey(m)" class="rv-num">{{ result.grandTotals[measureKey(m)] }}</td>
              </tr>
            </template>
            <tr v-if="!result.rows.length">
              <td :colspan="result.columns.length + report.measures.length" class="rv-empty-cell">{{ t('This report has no permitted records right now.') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

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
            <input v-model="pinLabel" class="rv-value-input rv-pin-label-input" type="text" :placeholder="t('Card label')">
          </template>
        </MpModalBody>
        <MpModalFooter>
          <button class="btn-enterprise btn-enterprise--ghost" @click="pinTarget = false">{{ t('Cancel') }}</button>
          <button v-if="pinCountForModule < MAX_PINS_PER_MODULE" class="btn-enterprise btn-enterprise--primary" @click="confirmPin">{{ t('Pin') }}</button>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>
</template>

<style scoped>
.crm { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.crm-titlebar { flex-shrink: 0; min-height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: var(--mp-spacing-3) var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.crm-titlebar__left { display: flex; flex-direction: column; gap: 2px; }
.rv-title-row { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.crm-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.crm-subtitle { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.crm-titlebar__right { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }

.cc-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); padding: var(--mp-spacing-5, 20px) var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); }

.rv-meta { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-5); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-bottom: var(--mp-spacing-4); }
.rv-criteria-chips { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-4); }
.rv-chip { display: inline-flex; padding: 2px var(--mp-spacing-2); background: var(--mp-background-neutral-subtle, #f1f5f9); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }

.rv-quickfilters { border: 1px dashed var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md); padding: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5); }
.rv-quick-label { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-bottom: var(--mp-spacing-2); }
.rv-quick-row { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-2); }
.rv-quick-actions { display: flex; gap: var(--mp-spacing-2); }
.rv-value-input { padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md); width: 160px; box-sizing: border-box; }
.rv-pin-label-input { width: 100%; margin-top: var(--mp-spacing-3); }
.rv-pin-limit { color: var(--mp-text-danger); }
.rb-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 24px; height: 24px; border: none; background: none; cursor: pointer; color: var(--mp-text-secondary); border-radius: var(--mp-radii-md); }
.rb-icon-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

.rv-table-wrap { overflow-x: auto; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md); }
.rv-table { width: 100%; border-collapse: collapse; }
.rv-table thead th { text-align: left; text-transform: uppercase; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle, #f1f5f9); padding: var(--mp-spacing-2) var(--mp-spacing-3); white-space: nowrap; }
.rv-table tbody td { padding: var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.rv-num { text-align: right; white-space: nowrap; }
.rv-group-row { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.rv-group-label { font-weight: var(--mp-font-weights-semi-bold); }
.rv-group-total { font-weight: var(--mp-font-weights-semi-bold); }
.rv-grand-row { background: var(--mp-background-neutral-subtle, #f1f5f9); font-weight: var(--mp-font-weights-semi-bold); }
.rv-empty-cell { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-8); }

.rv-notfound { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); height: 100%; color: var(--mp-text-secondary); }
</style>
