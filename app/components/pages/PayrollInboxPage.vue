<script setup lang="ts">
/**
 * Payroll inbox (FG-2: OD-01, OD-02, TS-06). One row per run and its current
 * version, the sync log of every send and decision, and the month headcount: each
 * month's run against the previous posted run, by group, with the employee_ids
 * that are new, not in the run or moved.
 * Talenta sends arrive from the "Simulate Talenta send" menu. Everything reads
 * the payroll engine; no figure is stored here.
 */
import { computed, ref, watch } from 'vue'
import { MpButton, MpIcon, MpTooltip, MpSegmentedControl } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import PayrollInboxSimulateMenu from '~/components/payroll/PayrollInboxSimulateMenu.vue'
import { payroll, syncLog, can, today, rupiah, wib, monthLabel, monthOf, runs, runStatus } from '~/data/payrollStore'
import { runRow, statusType, headcountMonths, latestHeadcountMonth, monthHeadcount } from '~/data/payrollUiIntake'
import { infoToast } from '~/utils/toasts'

const { t } = useLocale()
const router = useRouter()
const route = useRoute()

type View = 'runs' | 'log' | 'month'
const view = ref<View>((['runs', 'log', 'month'] as View[]).includes(route.query.view as View) ? (route.query.view as View) : 'runs')
watch(view, (v) => router.replace({ query: { ...route.query, view: v === 'runs' ? undefined : v } }))
watch(() => route.query.view, (q) => { const next = (['log', 'month'] as View[]).includes(q as View) ? (q as View) : 'runs'; if (next !== view.value) view.value = next })
const viewOptions = computed(() => [
  { id: 'pi-view-runs', value: 'runs', label: t('Runs') },
  { id: 'pi-view-log', value: 'log', label: t('Sync log') },
  { id: 'pi-view-month', value: 'month', label: t('Month headcount') },
])

// ── Stats ──────────────────────────────────────────────────────────────────
const rows = computed(() => runs.value.map(runRow))
const asOf = computed(() => `${t('As of')} ${wib(payroll.clock).replace(/ \d\d:\d\d WIB$/, '')}`)
const held = computed(() => rows.value.filter((r) => ['Held', 'Waiting for your choice', 'Confirm source'].includes(r.status)))
const ready = computed(() => rows.value.filter((r) => r.status === 'Ready to post'))
const thisMonth = computed(() => monthOf(today()))
const postedThisMonth = computed(() => payroll.journals.filter((j) => j.type === 'Payroll' && monthOf(wibDate(j.postedAt)) === thisMonth.value))
function wibDate(iso: string) { return new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10) }
const trackedMonth = computed(() => monthHeadcount(latestHeadcountMonth()))
const changeSummary = (m: { joined: string[]; left: string[]; moved: unknown[] }) => [
  m.joined.length ? `${m.joined.length} ${t('new')}` : '',
  m.left.length ? `${m.left.length} ${t('not in the run')}` : '',
  m.moved.length ? `${m.moved.length} ${t('moved')}` : '',
].filter(Boolean).join(' · ')

// ── Runs table ─────────────────────────────────────────────────────────────
const statusFilter = ref('')
const search = ref('')
const page = ref(1)
const perPage = ref(25)
const runStatusOptions = computed(() => [...new Set(rows.value.map((r) => r.status))].map((s) => ({ value: s, label: t(s) })))
const filteredRuns = computed(() => {
  const q = search.value.trim().toLowerCase()
  return rows.value.filter((r) => {
    if (statusFilter.value === 'needs-fix') { if (!held.value.includes(r)) return false }
    else if (statusFilter.value && r.status !== statusFilter.value) return false
    return !q || `${r.period} ${r.key} ${r.type} ${r.reason}`.toLowerCase().includes(q)
  })
})
const pagedRuns = computed(() => filteredRuns.value.slice((page.value - 1) * perPage.value, page.value * perPage.value))
watch([statusFilter, search], () => { page.value = 1 })
const runColumns = computed<TableColumn[]>(() => [
  { key: 'period', label: t('Period'), kind: 'number' },
  { key: 'status', label: t('Status'), kind: 'status' },
  { key: 'reason', label: t('Reason or next step'), kind: 'address' },
  { key: 'type', label: t('Type'), kind: 'unit' },
  { key: 'version', label: t('Version'), kind: 'unit' },
  { key: 'staff', label: t('Staff'), kind: 'unit', align: 'right' },
  { key: 'takeHome', label: t('Take-home pay'), kind: 'amount', align: 'right' },
  { key: 'received', label: t('Last send'), kind: 'date' },
])
const statusFilterOptions = computed(() => [{ value: 'needs-fix', label: t('Needs a fix') }, ...runStatusOptions.value])
function openRun(id: string) { router.push(`/payroll-runs/${id}`) }
function drill(filter: string) { view.value = 'runs'; statusFilter.value = filter }

// ── Sync log ───────────────────────────────────────────────────────────────
const logStatus = ref('')
const logType = ref('')
const logSearch = ref('')
const logPage = ref(1)
const logPerPage = ref(25)
const logRows = computed(() => syncLog.value.map((l) => ({
  id: l.id, at: wib(l.at), type: l.type, runId: l.runId, runKey: l.runKey ?? '', version: l.version != null ? `v${l.version}` : '',
  employees: l.employees ?? '', status: l.status, reason: l.reason, nextStep: l.nextStep, journalNo: l.journalNo ?? '',
})))
const filteredLog = computed(() => {
  const q = logSearch.value.trim().toLowerCase()
  return logRows.value.filter((r) => (!logStatus.value || r.status === logStatus.value) && (!logType.value || r.type === logType.value)
    && (!q || `${r.runKey} ${r.reason} ${r.journalNo}`.toLowerCase().includes(q)))
})
const pagedLog = computed(() => filteredLog.value.slice((logPage.value - 1) * logPerPage.value, logPage.value * logPerPage.value))
watch([logStatus, logType, logSearch], () => { logPage.value = 1 })
const logStatusOptions = computed(() => [...new Set(logRows.value.map((r) => r.status))].sort().map((s) => ({ value: s, label: t(s) })))
const logTypeOptions = computed(() => [...new Set(logRows.value.map((r) => r.type))].sort().map((s) => ({ value: s, label: t(s) })))
const logColumns = computed<TableColumn[]>(() => [
  { key: 'at', label: t('Time (WIB)'), kind: 'date' },
  { key: 'type', label: t('Type'), kind: 'unit' },
  { key: 'runKey', label: t('Run key'), kind: 'name' },
  { key: 'version', label: t('Version'), kind: 'unit' },
  { key: 'employees', label: t('Staff'), kind: 'unit', align: 'right' },
  { key: 'status', label: t('Status'), kind: 'status' },
  { key: 'reason', label: t('Reason'), kind: 'address' },
  { key: 'nextStep', label: t('Next step'), kind: 'address' },
  { key: 'journalNo', label: t('Journal'), kind: 'unit' },
])

// ── Month headcount ────────────────────────────────────────────────────────
const monthOptions = computed(() => headcountMonths().map((m) => ({ value: m, label: monthLabel(m) })))
const month = ref(trackedMonth.value.month)
const tracker = computed(() => monthHeadcount(month.value || trackedMonth.value.month))
const groupColumns = computed<TableColumn[]>(() => [
  { key: 'label', label: t('Group'), kind: 'name' },
  { key: 'last', label: t('Last period'), kind: 'unit', align: 'right' },
  { key: 'current', label: t('This month'), kind: 'unit', align: 'right' },
  { key: 'change', label: t('Change'), kind: 'unit', align: 'right' },
  { key: 'people', label: t('Staff changes'), kind: 'address' },
  { key: 'state', label: t('Status'), kind: 'status' },
])
const groupRows = computed(() => tracker.value.groups.map((g) => ({
  key: g.key, label: g.label, last: tracker.value.previous ? g.last : '', current: g.current,
  change: tracker.value.previous ? (g.change > 0 ? `+${g.change}` : String(g.change)) : '',
  people: [
    g.left.length ? `${t('Not in this run')}: ${g.left.join(', ')}` : '',
    g.joined.length ? `${t('New in this run')}: ${g.joined.join(', ')}` : '',
    ...[...g.movedOut, ...g.movedIn].map((m) => `${t('Moved')}: ${m.employee_id} ${m.from} ${t('to')} ${m.to}`),
  ].filter(Boolean),
  state: !g.flagged ? 'No change' : g.expected ? 'Expected' : 'Check',
})))
function notInPrototype() { infoToast(t('Not in this prototype')) }

// The run record links back here with ?view=…; keep the month picker in step with resets.
watch(() => payroll.runs, () => { if (!headcountMonths().includes(month.value)) month.value = trackedMonth.value.month })
const heldCount = computed(() => runs.value.filter((r) => ['Held', 'Waiting for your choice', 'Confirm source'].includes(runStatus(r))).length)
</script>

<template>
  <div class="pi">
    <div class="pi__toolbar">
      <MpSegmentedControl id="pi-view" v-model="view" name="pi-view" :data="viewOptions" class="pi__views" />
      <PayrollInboxSimulateMenu @sent="(id) => { if (id && view === 'runs') statusFilter = '' }" />
    </div>

    <!-- ── Runs ── -->
    <ErpTablePage
      v-if="view === 'runs'"
      data-tour="payroll-inbox-runs"
      :columns="runColumns"
      :rows="(pagedRuns as unknown as Record<string, unknown>[])"
      :total="filteredRuns.length"
      :current-page="page"
      :per-page="perPage"
      :search="search"
      :has-active-search="!!search"
      :has-active-filter="!!statusFilter"
      filter-empty-label="run"
      is-row-clickable
      @row-click="(row) => openRun((row as { id: string }).id)"
      @page-change="(p) => page = p"
      @per-page-change="(n) => { perPage = n; page = 1 }"
      @clear-filters="statusFilter = ''"
      @clear-search="search = ''"
      @clear-all="() => { statusFilter = ''; search = '' }"
    >
      <template #stats>
        <div class="stats-section">
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Held runs') }}</div>
            <div class="stat-period">{{ asOf }}</div>
            <div class="stat-amount" :class="{ 'stat-amount--danger': heldCount > 0 }">{{ heldCount }}</div>
            <a v-if="heldCount" class="stat-link" @click="drill('needs-fix')">{{ t('Show runs to fix') }}</a>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Ready to post') }}</div>
            <div class="stat-period">{{ t('Drafts built, take-home pay') }}</div>
            <div class="stat-amount">{{ rupiah(ready.reduce((s, r) => s + r.takeHome, 0)) }}</div>
            <a v-if="ready.length" class="stat-link" @click="drill('Ready to post')">{{ ready.length }} {{ t(ready.length === 1 ? 'draft' : 'drafts') }}</a>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">{{ t('Posted this month') }}</div>
            <div class="stat-period">{{ t('PAY journals posted in') }} {{ monthLabel(thisMonth) }}</div>
            <div class="stat-amount">{{ postedThisMonth.length }}</div>
            <a v-if="postedThisMonth.length" class="stat-link" @click="drill('Posted')">{{ postedThisMonth.map((j) => j.number).join(', ') }}</a>
          </div>
          <div class="stat-card">
            <div class="stat-title">{{ t('Headcount change') }}</div>
            <div class="stat-period">{{ trackedMonth.previous ? `${trackedMonth.label} ${t('against')} ${monthLabel(trackedMonth.previous.month)}` : trackedMonth.label }} · {{ t('staff changed') }}</div>
            <div class="stat-amount">{{ trackedMonth.changed }}</div>
            <a class="stat-link" @click="() => { month = trackedMonth.month; view = 'month' }">{{ changeSummary(trackedMonth) || t('No change') }}</a>
          </div>
        </div>
      </template>

      <template #filters>
        <div class="filter-left">
          <ErpFilterSelect id="pi-status" v-model="statusFilter" :placeholder="t('Status')" :options="statusFilterOptions" />
          <MpButton v-if="statusFilter" variant="ghost" is-rounded @click="statusFilter = ''">{{ t('Clear filters') }}</MpButton>
        </div>
        <div class="filter-right">
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')">
          </div>
        </div>
      </template>

      <template #cell-period="{ row }">
        <span class="cell-link cell-text" @click.stop="openRun((row as { id: string }).id)">{{ (row as { period: string }).period }}</span>
      </template>
      <template #cell-version="{ row }">
        {{ (row as { version: string }).version }}<template v-if="(row as { versions: number }).versions > 1">{{ ` ${t('of')} ${(row as { versions: number }).versions}` }}</template>
      </template>
      <template #cell-takeHome="{ value }">{{ rupiah(value as number) }}</template>
      <template #cell-status="{ value }">
        <ErpStatusBadge :status="String(value)" :label="t(String(value))" :type="statusType(String(value))" />
      </template>
      <template #cell-reason="{ row }">
        <span class="pi__wrap">{{ (row as { reason: string }).reason || t((row as { nextStep: string }).nextStep) }}</span>
      </template>
    </ErpTablePage>

    <!-- ── Sync log ── -->
    <ErpTablePage
      v-else-if="view === 'log'"
      :columns="logColumns"
      :rows="(pagedLog as unknown as Record<string, unknown>[])"
      :total="filteredLog.length"
      :current-page="logPage"
      :per-page="logPerPage"
      :search="logSearch"
      :has-active-search="!!logSearch"
      :has-active-filter="!!(logStatus || logType)"
      filter-empty-label="log row"
      no-row-hover
      @page-change="(p) => logPage = p"
      @per-page-change="(n) => { logPerPage = n; logPage = 1 }"
      @clear-filters="() => { logStatus = ''; logType = '' }"
      @clear-search="logSearch = ''"
      @clear-all="() => { logStatus = ''; logType = ''; logSearch = '' }"
    >
      <template #filters>
        <div class="filter-left">
          <ErpFilterSelect id="pl-status" v-model="logStatus" :placeholder="t('Status')" :options="logStatusOptions" />
          <ErpFilterSelect id="pl-type" v-model="logType" :placeholder="t('Type')" :options="logTypeOptions" />
          <MpButton v-if="logStatus || logType" variant="ghost" is-rounded @click="() => { logStatus = ''; logType = '' }">{{ t('Clear filters') }}</MpButton>
        </div>
        <div class="filter-right">
          <MpTooltip v-if="can('log.export')" :label="t('Export')" placement="bottom">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="notInPrototype" />
          </MpTooltip>
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="logSearch" class="filter-search-input" type="text" :placeholder="t('Search...')">
          </div>
        </div>
      </template>
      <template #cell-runKey="{ row }">
        <span v-if="(row as { runId: string | null }).runId" class="cell-link cell-text" @click.stop="openRun((row as { runId: string }).runId)">{{ (row as { runKey: string }).runKey }}</span>
        <span v-else class="pi__muted">{{ (row as { runKey: string }).runKey }}</span>
      </template>
      <template #cell-status="{ value }">
        <ErpStatusBadge :status="String(value)" :label="t(String(value))" :type="statusType(String(value))" />
      </template>
      <template #cell-reason="{ value }"><span class="pi__wrap">{{ value }}</span></template>
      <template #cell-nextStep="{ value }"><span class="pi__wrap">{{ t(String(value)) }}</span></template>
    </ErpTablePage>

    <!-- ── Month headcount ── -->
    <template v-else>
      <div class="stats-section pi__stats">
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Status') }}</div>
          <div class="stat-period">{{ tracker.label }} · {{ tracker.period }}</div>
          <div class="stat-amount" :class="{ 'stat-amount--danger': tracker.status === 'Missing send' }">{{ t(tracker.status) }}</div>
          <a v-if="tracker.runId" class="stat-link" @click="openRun(tracker.runId)">{{ t('Open run') }} {{ tracker.version }}</a>
        </div>
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Last period') }}</div>
          <div class="stat-period">{{ tracker.previous ? `${t('Posted')} ${tracker.previous.label}` : t('No earlier posted run') }}</div>
          <div class="stat-amount">{{ tracker.last ?? '-' }}</div>
        </div>
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('This month') }}</div>
          <div class="stat-period">{{ tracker.version ? `${t('Staff in')} ${tracker.version}` : t('No run yet') }}</div>
          <div class="stat-amount">{{ tracker.current }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">{{ t('Staff changed') }}</div>
          <div class="stat-period">{{ t('New, not in the run, or moved group') }}</div>
          <div class="stat-amount">{{ tracker.changed }}</div>
          <a v-if="tracker.runId && tracker.unexpected" class="stat-link" @click="openRun(tracker.runId)">{{ tracker.unexpected }} {{ t(tracker.unexpected === 1 ? 'group to check' : 'groups to check') }}</a>
        </div>
      </div>

      <ErpTablePage
        :columns="groupColumns"
        :rows="(groupRows as unknown as Record<string, unknown>[])"
        :total="groupRows.length"
        :current-page="1"
        :per-page="100"
        no-row-hover
      >
        <template #filters>
          <div class="filter-left">
            <ErpFilterSelect id="pm-month" v-model="month" :placeholder="t('Month')" :options="monthOptions" :is-clearable="false" />
            <span class="pi__muted">{{ tracker.runStatus ? `${t('Regular run')} ${tracker.version} · ${t(tracker.runStatus)}` : t(tracker.status) }}</span>
          </div>
        </template>
        <template #cell-people="{ row }">
          <div class="pi__wrap">
            <div v-for="line in (row as { people: string[] }).people" :key="line">{{ line }}</div>
          </div>
        </template>
        <template #cell-state="{ value }">
          <ErpStatusBadge :status="String(value)" :label="t(String(value))" :type="statusType(String(value))" />
        </template>
      </ErpTablePage>
    </template>
  </div>
</template>

<style scoped>
.pi { display: flex; flex-direction: column; }
.pi__toolbar {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
  margin-bottom: var(--mp-spacing-6);
}
.pi__views :deep(.mp-segmented-control__item), .pi__views :deep([data-part='item']) { min-width: max-content; }
.pi__stats { padding-bottom: var(--mp-spacing-5); margin-bottom: var(--mp-spacing-5); border-bottom: 1px solid var(--mp-border-default); }
.pi__muted { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }
.pi__wrap { white-space: normal; overflow-wrap: anywhere; }

/* House stats band (BillsIndexPage). */
.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch; }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-period { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-amount--danger { color: var(--mp-text-danger); }
.stat-link {
  display: inline-flex; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-link); line-height: var(--mp-line-heights-md); text-decoration: none; cursor: pointer;
  padding: 0 var(--mp-spacing-0\.5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* House filter bar (BillsIndexPage). */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); min-width: 0; }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: var(--filter-search-w, 248px);
  padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md); color: var(--mp-text-default); min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
</style>
