<script setup lang="ts">
/**
 * Budget report (PRD FG-6, TS-09). One row per budget line with budget, money
 * moved in and out, reserved, committed, actual, available, saving and money
 * held by POs idle 90 days or more. A No budget line row and a Not counted row
 * sit under the lines so the actual total ties to the general ledger.
 *
 * Every figure comes from budgetUiReport, which reads the budget ledger. The
 * URL query holds period, grouping and filters, so a copied link keeps them;
 * the viewer's scope is applied after the query and cannot be widened by it.
 */
import { computed, ref, watch } from 'vue'
import { MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpButton, MpIcon } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import BudgetReportFiltersDrawer from '~/components/patterns/BudgetReportFiltersDrawer.vue'
import BudgetReportDrillDrawer from '~/components/patterns/BudgetReportDrillDrawer.vue'
import { budget, lineById, lineTitle, tieOutFailed, BUDGET_YEAR, BUDGET_CURRENT_MONTH, type ReportFilter, type NoLineSpend } from '~/data/budgetStore'
import { MONTH_NAMES, deptName, projectName, accountLabel, budgetAccount } from '~/data/budgetMaster'
import {
  buildReport, drillLine, drillPostings, filterOptions, filterCount, parseReportQuery, toReportQuery,
  viewerDept, canRunTieOut, runTieOutAs, periodLabel, PERIOD_KINDS, GROUP_OPTIONS, EMPTY_FILTER,
  type ReportFigures, type ReportRow, type DrillDoc, type DrillFigure, type GroupBy, type PeriodKind, type ReportQueryState,
} from '~/data/budgetUiReport'
import { formatIDRWhole } from '~/utils/currency'
import { infoToast, successToast } from '~/utils/toasts'

defineProps<{ orderId?: string }>()

const { t } = useLocale()
const route = useRoute()
const router = useRouter()

// ── State lives in the URL query ─────────────────────────────────────────────
const state = computed<ReportQueryState>(() => parseReportQuery(route.query as Record<string, string>))
function setState(patch: Partial<ReportQueryState>) {
  const next = { ...state.value, ...patch }
  router.replace({ path: route.path, query: toReportQuery(next) })
}

const periodKind = computed({
  get: () => state.value.period.kind,
  set: (v: string) => setState({ period: { ...state.value.period, kind: (v || 'ytd') as PeriodKind } }),
})
const periodMonth = computed({
  get: () => String(state.value.period.month),
  set: (v: string) => setState({ period: { ...state.value.period, month: v === '' ? BUDGET_CURRENT_MONTH : Number(v) } }),
})
const groupBy = computed({
  get: () => state.value.groupBy,
  set: (v: string) => setState({ groupBy: (v || 'none') as GroupBy }),
})
const periodOptions = PERIOD_KINDS.map((p) => ({ value: p.value, label: t(p.label) }))
const monthOptions = MONTH_NAMES.map((m, i) => ({ value: String(i), label: `${t(m)} ${BUDGET_YEAR}` }))
const groupOptions = GROUP_OPTIONS.map((g) => ({ value: g.value, label: t(g.label) }))

const role = computed(() => budget.viewAs)
const scopeDept = computed(() => viewerDept(role.value))
const options = computed(() => filterOptions(role.value))
const activeFilters = computed(() => filterCount(state.value.filter))

// ── Report ──────────────────────────────────────────────────────────────────
const asOf = ref(new Date())
const refreshTick = ref(0)
watch([state, role, refreshTick], () => { asOf.value = new Date() })
const report = computed(() => {
  void refreshTick.value
  return buildReport(state.value.filter, state.value.period, state.value.groupBy, role.value)
})
const caption = computed(() => periodLabel(state.value.period))
const grouped = computed(() => state.value.groupBy !== 'none')

function fmtDateTime(d: Date | string): string {
  const x = typeof d === 'string' ? new Date(d) : d
  const date = `${x.getDate()} ${MONTH_NAMES[x.getMonth()]!.slice(0, 3)} ${x.getFullYear()}`
  const time = `${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`
  return `${date}, ${time}`
}
function refresh() { refreshTick.value++ }

// ── Tie-out ─────────────────────────────────────────────────────────────────
const lastTieOut = computed(() => budget.tieOuts[0] ?? null)
const lastFailed = computed(() => !!lastTieOut.value && tieOutFailed(lastTieOut.value))
const noLineSpend = computed(() => lastTieOut.value?.noLine ?? [])
function addLineFor(n: NoLineSpend) {
  const q = new URLSearchParams({ kind: 'Mid-year insert', account: n.account, dept: n.dept, amount: String(n.amount), reason: `Spend with no budget line: ${n.docs.join(', ')}` })
  if (n.project) q.set('project', n.project)
  router.push(`/budget-changes/new?${q.toString().replace(/\+/g, '%20')}`)
}
const tieError = ref('')
function failureLabel(lineId: string): string {
  const l = lineById(lineId)
  return l ? lineTitle(l) : lineId
}
function runTieOutNow() {
  tieError.value = ''
  const res = runTieOutAs(role.value)
  if (!res.ok) { tieError.value = t(res.reason); return }
  refresh()
  if (!tieOutFailed(res.run)) successToast(t('Tie-out passed'))
}
watch(role, () => { tieError.value = '' })

// ── Filters ─────────────────────────────────────────────────────────────────
const filtersOpen = ref(false)
function applyFilters(f: ReportFilter) { setState({ filter: f }) }
function clearFilters() { setState({ filter: { ...EMPTY_FILTER } }) }

interface Chip { key: string; label: string; remove: () => void }
const chips = computed<Chip[]>(() => {
  const f = state.value.filter
  const without = <K extends keyof ReportFilter>(dim: K, v: ReportFilter[K][number]) => () =>
    setState({ filter: { ...f, [dim]: (f[dim] as unknown[]).filter((x) => x !== v) } })
  return [
    ...f.depts.map((d) => ({ key: `d-${d}`, label: `${t('Department')}: ${deptName(d)}`, remove: without('depts', d) })),
    ...f.projects.map((p) => ({ key: `p-${p ?? 'none'}`, label: `${t('Project')}: ${t(projectName(p))}`, remove: without('projects', p) })),
    ...f.accounts.map((a) => ({ key: `a-${a}`, label: `${t('Account')}: ${accountLabel(a)}`, remove: without('accounts', a) })),
    ...f.classes.map((c) => ({ key: `c-${c}`, label: `${t('Class')}: ${c}`, remove: without('classes', c) })),
  ]
})

function download() { infoToast(t('Not in this prototype')) }

// ── Columns ─────────────────────────────────────────────────────────────────
const columns: { key: keyof ReportFigures; label: string; drill?: DrillFigure }[] = [
  { key: 'budget', label: 'Budget' },
  { key: 'movedIn', label: 'Moved in' },
  { key: 'movedOut', label: 'Moved out' },
  { key: 'reserved', label: 'Reserved', drill: 'reserved' },
  { key: 'committed', label: 'Committed', drill: 'committed' },
  { key: 'actual', label: 'Actual', drill: 'actual' },
  { key: 'available', label: 'Available' },
  { key: 'saving', label: 'Saving' },
  { key: 'idle', label: 'Idle 90+ days' },
]
const money = (n: number) => formatIDRWhole(n)

// ── Drill ───────────────────────────────────────────────────────────────────
const drill = ref<{ title: string; subtitle: string; caption: string; docs: DrillDoc[]; amount: number } | null>(null)
const drillOpen = ref(false)
const DRILL_LABEL: Record<DrillFigure, string> = { reserved: 'Reserved', committed: 'Committed', actual: 'Actual' }
const DRILL_CAPTION: Record<DrillFigure, string> = {
  reserved: 'Approved purchase requests holding money on this line.',
  committed: 'Open purchase orders on this line.',
  actual: 'Invoices and journals posted to this line, at the price before PPN.',
}
const drillSubtitle = () => `${caption.value} · ${t('As of')} ${fmtDateTime(asOf.value)}`
function openDrill(row: ReportRow, fig: DrillFigure) {
  drill.value = {
    title: `${t(DRILL_LABEL[fig])} · ${row.title}`,
    subtitle: drillSubtitle(),
    caption: t(DRILL_CAPTION[fig]),
    docs: drillLine(row.lineId, fig, state.value.period, role.value),
    amount: row.figures[fig],
  }
  drillOpen.value = true
}
function openNoLine() {
  drill.value = {
    title: t('No budget line'),
    subtitle: drillSubtitle(),
    caption: t('Invoices posted to a department, project and account with no budget line. They count as actual.'),
    docs: drillPostings(report.value.noLine.postings),
    amount: report.value.noLine.amount,
  }
  drillOpen.value = true
}
function openNotCounted() {
  drill.value = {
    title: t('Not counted'),
    subtitle: drillSubtitle(),
    caption: t('Journals that move spend already counted, such as reclasses to fixed assets. They do not add to actual.'),
    docs: drillPostings(report.value.notCounted.postings),
    amount: report.value.notCounted.amount,
  }
  drillOpen.value = true
}
const notCountedDocs = computed(() => report.value.notCounted.postings.map((g) => g.docNo).join(', '))
</script>

<template>
  <div class="brp">
    <!-- ── As of and tie-out ── -->
    <div class="brp-head" data-tour="report-tieout">
      <div class="brp-head-text">
        <span class="brp-asof">
          {{ caption }} · {{ t('As of') }} {{ fmtDateTime(asOf) }}<template v-if="scopeDept"> · {{ t('Lines for') }} {{ deptName(scopeDept) }}</template>
        </span>
        <span v-if="lastTieOut" class="brp-tie" :class="lastFailed ? 'brp-tie--failed' : 'brp-tie--passed'">
          <MpIcon :name="lastFailed ? 'error' : 'done'" size="sm" />
          <template v-if="lastFailed">{{ t('Last tie-out failed') }}</template>
          <template v-else>{{ t('Last tie-out passed') }}</template>
          · {{ fmtDateTime(lastTieOut.at) }} · {{ lastTieOut.lines }} {{ t('lines') }} · {{ t('Difference') }} {{ money(lastTieOut.difference) }}
        </span>
        <span v-else class="brp-tie">{{ t('No tie-out has run yet') }}</span>
        <span v-if="tieError" class="brp-error">{{ tieError }}</span>
      </div>
      <div class="brp-head-actions">
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="refresh">{{ t('Refresh') }}</button>
        <button v-if="canRunTieOut(role)" class="btn-enterprise btn-enterprise--secondary" type="button" @click="runTieOutNow">{{ t('Run tie-out now') }}</button>
      </div>
    </div>

    <MpBanner v-if="lastTieOut && lastFailed" id="brp-tie-banner" variant="danger" class="brp-banner">
      <MpBannerIcon id="brp-tie-banner-icon" />
      <MpBannerTitle>
        <template v-if="lastTieOut.failures.length">{{ t('Tie-out found') }} {{ lastTieOut.failures.length }} {{ t(lastTieOut.failures.length === 1 ? 'line that differs from the general ledger' : 'lines that differ from the general ledger') }}</template>
        <template v-else>{{ t('The budget ledger differs from the general ledger by') }} {{ money(lastTieOut.total?.difference ?? lastTieOut.difference) }}</template>
      </MpBannerTitle>
      <MpBannerDescription>
        <span v-if="lastTieOut.total" class="brp-banner-line">
          {{ t('General ledger') }} {{ money(lastTieOut.total.gl) }} · {{ t('budget lines') }} {{ money(lastTieOut.total.ledger) }} · {{ t('no budget line') }} {{ money(lastTieOut.total.noLine) }}
        </span>
        <span v-for="f in lastTieOut.failures" :key="f.lineId" class="brp-banner-line">
          {{ failureLabel(f.lineId) }}: {{ t('budget ledger') }} {{ money(f.ledger) }}, {{ t('general ledger') }} {{ money(f.gl) }}
        </span>
      </MpBannerDescription>
    </MpBanner>

    <MpBanner v-if="noLineSpend.length" id="brp-noline-banner" variant="warning" class="brp-banner" data-tour="report-noline">
      <MpBannerIcon id="brp-noline-banner-icon" />
      <MpBannerTitle>
        {{ noLineSpend.length }} {{ t(noLineSpend.length === 1 ? 'spend with no budget line' : 'spends with no budget line') }}, {{ money(noLineSpend.reduce((s, n) => s + n.amount, 0)) }}
      </MpBannerTitle>
      <MpBannerDescription>
        <span v-for="n in noLineSpend" :key="`${n.account}|${n.dept}|${n.project}`" class="brp-banner-line brp-nl-item">
          <span v-if="n.isNew" class="brp-new">{{ t('New') }}</span>
          {{ deptName(n.dept) }} × {{ projectName(n.project) }} × {{ budgetAccount(n.account)?.name ?? n.account }}: {{ money(n.amount) }} · {{ n.docs.join(', ') }}
          <a v-if="canRunTieOut(role)" class="cell-link" @click="addLineFor(n)">{{ t('Add a line') }}</a>
        </span>
      </MpBannerDescription>
    </MpBanner>

    <!-- ── Filter bar ── -->
    <div class="brp-filter-bar" data-tour="report-filters">
      <div class="filter-left">
        <ErpFilterSelect id="brp-period" v-model="periodKind" :placeholder="t('Period')" :options="periodOptions" :is-clearable="false" width="160px" />
        <ErpFilterSelect v-if="periodKind !== 'year'" id="brp-month" v-model="periodMonth" :placeholder="t('Month')" :options="monthOptions" :is-clearable="false" width="168px" />
        <ErpFilterSelect id="brp-group" v-model="groupBy" :placeholder="t('Group by')" :options="groupOptions" :is-clearable="false" width="160px" />
        <MpButton class="filter-all-btn" :class="{ 'filter-all-btn--active': activeFilters > 0 }" is-rounded @click="filtersOpen = true">
          <MpIcon name="filter" size="sm" />
          {{ t('All filters') }}{{ activeFilters > 0 ? ` (${activeFilters})` : '' }}
        </MpButton>
        <button v-if="activeFilters > 0" class="btn-enterprise btn-enterprise--ghost" type="button" @click="clearFilters">{{ t('Clear filters') }}</button>
      </div>
      <div class="filter-right">
        <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="download">{{ t('Download') }}</button>
      </div>
    </div>

    <div v-if="chips.length" class="brp-chips">
      <span v-for="c in chips" :key="c.key" class="brp-chip">
        {{ c.label }}
        <span class="brp-chip-x" role="button" tabindex="0" :aria-label="t('Remove')" @click="c.remove()" @keydown.enter="c.remove()"><MpIcon name="close" size="sm" /></span>
      </span>
    </div>

    <!-- ── Report table ── -->
    <div class="brp-table-wrap" data-tour="report-table">
      <table class="brp-table">
        <thead>
          <tr>
            <th class="brp-th brp-th--line">{{ t('Budget line') }}</th>
            <th v-for="c in columns" :key="c.key" class="brp-th brp-th--num">{{ t(c.label) }}</th>
          </tr>
        </thead>
        <tbody>
          <template v-if="report.rows.length">
            <template v-for="g in report.groups" :key="g.key">
              <tr v-if="grouped" class="brp-row brp-row--group">
                <td class="brp-td brp-td--line brp-strong">{{ t(g.label) }} <span class="brp-count">· {{ g.rows.length }} {{ t(g.rows.length === 1 ? 'line' : 'lines') }}</span></td>
                <td v-for="c in columns" :key="c.key" class="brp-td brp-td--num brp-strong" :class="{ 'brp-neg': c.key === 'available' && g.totals.available < 0 }">{{ money(g.totals[c.key]) }}</td>
              </tr>
              <tr v-for="r in g.rows" :key="r.lineId" class="brp-row" :class="{ 'brp-row--child': grouped }">
                <td class="brp-td brp-td--line">
                  <span class="brp-line-link" role="link" tabindex="0" @click="router.push(`/budget-lines/${r.lineId}`)" @keydown.enter="router.push(`/budget-lines/${r.lineId}`)">{{ t(r.name) }}</span>
                  <span class="brp-line-meta">{{ r.meta }}</span>
                </td>
                <td v-for="c in columns" :key="c.key" class="brp-td brp-td--num" :class="{ 'brp-neg': c.key === 'available' && r.figures.available < 0 }">
                  <span
                    v-if="c.drill && r.figures[c.key] !== 0"
                    class="brp-drill"
                    role="button"
                    tabindex="0"
                    @click="openDrill(r, c.drill)"
                    @keydown.enter="openDrill(r, c.drill)"
                  >{{ money(r.figures[c.key]) }}</span>
                  <template v-else>{{ money(r.figures[c.key]) }}</template>
                </td>
              </tr>
            </template>
          </template>
          <tr v-else class="brp-row">
            <td class="brp-td brp-td--empty" :colspan="columns.length + 1">
              <span class="brp-empty-title">{{ t('No budget lines match these filters') }}</span>
              <span v-if="activeFilters > 0" class="brp-line-link" role="button" tabindex="0" @click="clearFilters" @keydown.enter="clearFilters">{{ t('Clear filters') }}</span>
            </td>
          </tr>

          <!-- Spend with no budget line counts as actual so the total ties. -->
          <tr v-if="report.rows.length || report.noLine.amount" class="brp-row brp-row--special">
            <td class="brp-td brp-td--line">
              <span class="brp-noline">{{ t('No budget line') }}</span>
              <span class="brp-line-meta">{{ report.noLine.postings.length }} {{ t(report.noLine.postings.length === 1 ? 'invoice' : 'invoices') }}</span>
            </td>
            <td v-for="c in columns" :key="c.key" class="brp-td brp-td--num">
              <template v-if="c.key === 'actual'">
                <span v-if="report.noLine.amount" class="brp-drill" role="button" tabindex="0" @click="openNoLine" @keydown.enter="openNoLine">{{ money(report.noLine.amount) }}</span>
                <template v-else>{{ money(0) }}</template>
              </template>
              <span v-else class="brp-dash">-</span>
            </td>
          </tr>

          <!-- Journals the ledger does not count, listed so the gap to the GL is visible. -->
          <tr v-if="report.notCounted.postings.length" class="brp-row brp-row--special">
            <td class="brp-td brp-td--line">
              <span class="brp-strong">{{ t('Not counted') }}</span>
              <span class="brp-line-meta">{{ notCountedDocs }}</span>
            </td>
            <td v-for="c in columns" :key="c.key" class="brp-td brp-td--num">
              <span v-if="c.key === 'actual'" class="brp-drill brp-drill--muted" role="button" tabindex="0" @click="openNotCounted" @keydown.enter="openNotCounted">{{ money(report.notCounted.amount) }}</span>
              <span v-else class="brp-dash">-</span>
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr class="brp-row brp-row--total">
            <td class="brp-td brp-td--line brp-strong">{{ t('Total') }}</td>
            <td v-for="c in columns" :key="c.key" class="brp-td brp-td--num brp-strong" :class="{ 'brp-neg': c.key === 'available' && report.total.available < 0 }">{{ money(report.total[c.key]) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <BudgetReportFiltersDrawer v-model:is-open="filtersOpen" :model-value="state.filter" :options="options" @apply="applyFilters" />
    <BudgetReportDrillDrawer
      v-if="drill"
      v-model:is-open="drillOpen"
      :title="drill.title"
      :subtitle="drill.subtitle"
      :caption="drill.caption"
      :docs="drill.docs"
      :cell-amount="drill.amount"
    />
  </div>
</template>

<style scoped>
.brp { display: flex; flex-direction: column; gap: var(--mp-spacing-4); min-width: 0; }

/* As of + tie-out line */
.brp-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); }
.brp-head-text { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.brp-head-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }
.brp-asof { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); }
.brp-tie { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }
.brp-tie--passed :deep(svg) { color: var(--mp-colors-text-success); }
.brp-tie--failed { color: var(--mp-text-danger); }
.brp-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
/* tie-out banners */
.brp-nl-item { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.brp-new { font-size: var(--mp-font-sizes-xs); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-warning); border: 1px solid currentColor; border-radius: var(--mp-radii-sm); padding: 0 var(--mp-spacing-1); }
.brp-banner-line { display: block; }

/* Filter bar — same layout as the house index filter bar */
.brp-filter-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-all-btn {
  display: inline-flex !important; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3) !important;
  background: var(--mp-background-neutral) !important;
  border: 1px solid var(--mp-border-bold) !important;
  color: var(--mp-text-default) !important;
}
.filter-all-btn--active { border-color: var(--mp-colors-blue-600) !important; }

.brp-chips { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.brp-chip {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1);
  height: var(--mp-sizes-6, 24px); padding: 0 var(--mp-spacing-2) 0 var(--mp-spacing-3);
  border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default);
}
.brp-chip-x { display: inline-flex; align-items: center; cursor: pointer; color: var(--mp-text-secondary); }
.brp-chip-x:hover { color: var(--mp-text-default); }

/* Report table — the line column stays put while the money columns scroll. */
.brp-table-wrap { overflow-x: auto; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md, 6px); }
.brp-table { width: 100%; border-collapse: separate; border-spacing: 0; }
.brp-th {
  padding: var(--mp-spacing-1) var(--mp-spacing-3);
  height: var(--mp-sizes-7, 28px);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-secondary);
  text-align: right; white-space: nowrap;
}
.brp-th--num { min-width: 148px; }
.brp-th--line { position: sticky; left: 0; z-index: 2; min-width: 300px; text-align: left; border-right: 1px solid var(--mp-border-default); }
.brp-td {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  vertical-align: middle; white-space: nowrap; background: var(--mp-background-neutral);
}
.brp-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.brp-td--line {
  position: sticky; left: 0; z-index: 1; min-width: 300px; max-width: 360px;
  border-right: 1px solid var(--mp-border-default);
  white-space: normal;
}
.brp-td--line > span { display: block; }
.brp-row:hover .brp-td { background: var(--mp-background-neutral-subtle); }
.brp-row--group .brp-td { background: var(--mp-background-neutral-subtle); }
.brp-row--child .brp-td--line { padding-left: var(--mp-spacing-6); }
.brp-row--total .brp-td { border-bottom: none; border-top: 1px solid var(--mp-border-bold); }
.brp-strong { font-weight: var(--mp-font-weights-semi-bold); }
.brp-count { font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); display: inline !important; }
.brp-line-link { color: var(--mp-text-link); cursor: pointer; }
.brp-line-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.brp-line-meta { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }
.brp-noline { color: var(--mp-text-danger); font-weight: var(--mp-font-weights-semi-bold); }
.brp-neg, .brp-neg .brp-drill { color: var(--mp-text-danger); }
.brp-drill { color: var(--mp-text-link); cursor: pointer; }
.brp-drill:hover { text-decoration: underline; text-underline-offset: 2px; }
.brp-drill--muted { color: var(--mp-text-secondary); }
.brp-dash { color: var(--mp-text-secondary); }
.brp-td--empty { text-align: center; padding: var(--mp-spacing-8, 32px) var(--mp-spacing-3); }
.brp-td--empty > span { display: block; }
.brp-empty-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-1); }
</style>
