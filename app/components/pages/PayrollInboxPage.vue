<script setup lang="ts">
/**
 * Payroll inbox (FG-2: OD-01, OD-02, TS-06). One row per run and its current
 * version, the sync log of every send and decision, and the month tracker.
 * Talenta sends arrive from the "Simulate Talenta send" menu. Everything reads
 * the payroll engine; no figure is stored here.
 */
import { computed, ref, watch } from 'vue'
import { MpButton, MpIcon, MpTooltip, MpSegmentedControl } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import PayrollInboxSimulateMenu from '~/components/payroll/PayrollInboxSimulateMenu.vue'
import PayrollInboxReasonDrawer from '~/components/payroll/PayrollInboxReasonDrawer.vue'
import { payroll, syncLog, can, today, rupiah, wib, monthLabel, monthOf, runs, runStatus } from '~/data/payrollStore'
import {
  runRow, statusType, completenessMonths, monthCompleteness, closeMonthGap, reopenMonthGap, markNotExpected, hrMessage,
} from '~/data/payrollUiIntake'
import { successToast, infoToast } from '~/utils/toasts'

const { t } = useLocale()
const router = useRouter()
const route = useRoute()

type View = 'runs' | 'log' | 'month'
const view = ref<View>((['runs', 'log', 'month'] as View[]).includes(route.query.view as View) ? (route.query.view as View) : 'runs')
watch(view, (v) => router.replace({ query: { ...route.query, view: v === 'runs' ? undefined : v } }))
const viewOptions = computed(() => [
  { id: 'pi-view-runs', value: 'runs', label: t('Runs') },
  { id: 'pi-view-log', value: 'log', label: t('Sync log') },
  { id: 'pi-view-month', value: 'month', label: t('Month completeness') },
])

// ── Stats ──────────────────────────────────────────────────────────────────
const rows = computed(() => runs.value.map(runRow))
const asOf = computed(() => `${t('As of')} ${wib(payroll.clock).replace(/ \d\d:\d\d WIB$/, '')}`)
const held = computed(() => rows.value.filter((r) => ['Held', 'Waiting for your choice', 'Confirm source'].includes(r.status)))
const ready = computed(() => rows.value.filter((r) => r.status === 'Ready to post'))
const thisMonth = computed(() => monthOf(today()))
const postedThisMonth = computed(() => payroll.journals.filter((j) => j.type === 'Payroll' && monthOf(wibDate(j.postedAt)) === thisMonth.value))
function wibDate(iso: string) { return new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10) }
const trackedMonth = computed(() => {
  const due = completenessMonths().map(monthCompleteness).find((m) => m.end <= today())
  return due ?? monthCompleteness(thisMonth.value)
})

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

// ── Month completeness ─────────────────────────────────────────────────────
const monthOptions = computed(() => completenessMonths().map((m) => ({ value: m, label: monthLabel(m) })))
const month = ref(trackedMonth.value.month)
const tracker = computed(() => monthCompleteness(month.value || trackedMonth.value.month))
const groupColumns = computed<TableColumn[]>(() => [
  { key: 'group', label: t('Organization / branch'), kind: 'name' },
  { key: 'expected', label: t('Expected'), kind: 'unit', align: 'right' },
  { key: 'arrived', label: t('Arrived'), kind: 'unit', align: 'right' },
  { key: 'missing', label: t('Missing employee IDs'), kind: 'address' },
  { key: 'extra', label: t('Not expected but sent'), kind: 'address' },
  { key: 'state', label: t('Status'), kind: 'status' },
])
const groupRows = computed(() => tracker.value.groups.map((g) => ({
  ...g, missing: g.missing.join(', '), extra: g.extra.join(', '), missingIds: g.missing,
  state: g.closed ? 'Closed with reason' : g.open ? 'Missing staff' : 'Complete',
})))

const drawer = ref<{ kind: 'close' | 'not-expected'; group?: string } | null>(null)
const drawerError = ref('')
const notExpectedOptions = computed(() => tracker.value.missingIds.map((id) => ({ value: id, label: id })))
function openClose(group: string) { drawerError.value = ''; drawer.value = { kind: 'close', group } }
function openNotExpected() { drawerError.value = ''; drawer.value = { kind: 'not-expected' } }
function submitDrawer(v: { reason: string; pick: string }) {
  const d = drawer.value
  if (!d) return
  const r = d.kind === 'close' ? closeMonthGap(tracker.value.month, d.group!, v.reason) : markNotExpected(tracker.value.month, v.pick, v.reason)
  if (!r.ok) { drawerError.value = r.message ?? ''; return }
  drawer.value = null
  successToast(t(d.kind === 'close' ? 'Gap closed' : 'Marked not expected'))
}
function reopen(group: string) { reopenMonthGap(tracker.value.month, group); successToast(t('Gap reopened')) }
function copyHr(ids: string[]) {
  const text = hrMessage(ids, tracker.value.period)
  navigator.clipboard?.writeText(text).catch(() => {})
  successToast(t('Message for HR copied'))
}
function notInPrototype() { infoToast(t('Not in this prototype')) }

// The run record links back here with ?view=…; keep the month picker in step with resets.
watch(() => payroll.runs, () => { if (!completenessMonths().includes(month.value)) month.value = trackedMonth.value.month })
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
            <div class="stat-title">{{ t('Month completeness') }}</div>
            <div class="stat-period">{{ trackedMonth.label }} · {{ t('staff arrived against expected') }}</div>
            <div class="stat-amount" :class="{ 'stat-amount--danger': trackedMonth.status !== 'Complete' }">{{ trackedMonth.arrived }} {{ t('of') }} {{ trackedMonth.expected }}</div>
            <a class="stat-link" @click="() => { month = trackedMonth.month; view = 'month' }">{{ t(trackedMonth.status) }}</a>
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
        {{ (row as { version: string }).version }}<span v-if="(row as { versions: number }).versions > 1" class="pi__muted"> {{ t('of') }} {{ (row as { versions: number }).versions }}</span>
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

    <!-- ── Month completeness ── -->
    <template v-else>
      <div class="stats-section pi__stats">
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Status') }}</div>
          <div class="stat-period">{{ tracker.label }} · {{ tracker.period }}</div>
          <div class="stat-amount" :class="{ 'stat-amount--danger': tracker.status === 'Open' || tracker.status === 'Missing send' }">{{ t(tracker.status) }}</div>
          <a v-if="tracker.runId" class="stat-link" @click="openRun(tracker.runId)">{{ t('Open run') }} {{ tracker.version }}</a>
        </div>
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Expected staff') }}</div>
          <div class="stat-period">{{ t('Starting list and employee events') }}</div>
          <div class="stat-amount">{{ tracker.expected }}</div>
        </div>
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Arrived') }}</div>
          <div class="stat-period">{{ t('Staff in the current version') }}</div>
          <div class="stat-amount">{{ tracker.arrived }}</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">{{ t('Missing staff') }}</div>
          <div class="stat-period">{{ t('Not closed with a reason') }}</div>
          <div class="stat-amount" :class="{ 'stat-amount--danger': tracker.missingIds.length > 0 }">{{ tracker.missingIds.length }}</div>
          <a v-if="tracker.missingIds.length" class="stat-link" @click="copyHr(tracker.missingIds)">{{ t('Copy message for HR') }}</a>
        </div>
      </div>

      <ErpTablePage
        :columns="groupColumns"
        :rows="(groupRows as unknown as Record<string, unknown>[])"
        :total="groupRows.length"
        :current-page="1"
        :per-page="100"
        no-row-hover
        actions-width="200px"
      >
        <template #filters>
          <div class="filter-left">
            <ErpFilterSelect id="pm-month" v-model="month" :placeholder="t('Month')" :options="monthOptions" :is-clearable="false" />
            <span class="pi__muted">{{ tracker.runs.length }} {{ t(tracker.runs.length === 1 ? 'run arrived' : 'runs arrived') }}<template v-if="tracker.runs.length">: {{ tracker.runs.map((r) => `${r.type} ${r.version} ${t(r.status)}`).join(', ') }}</template></span>
          </div>
          <div class="filter-right">
            <MpButton v-if="payroll.viewAs === 'Finance Manager' && tracker.missingIds.length" variant="secondary" is-rounded @click="openNotExpected">{{ t('Mark not expected') }}</MpButton>
          </div>
        </template>
        <template #cell-missing="{ value }"><span class="pi__wrap">{{ value || '' }}</span></template>
        <template #cell-extra="{ value }"><span class="pi__wrap">{{ value || '' }}</span></template>
        <template #cell-state="{ row }">
          <ErpStatusBadge
            :status="(row as { state: string }).state" :label="t((row as { state: string }).state)"
            :type="(row as { state: string }).state === 'Complete' ? 'completed' : (row as { state: string }).state === 'Missing staff' ? 'critical' : 'announcement'"
          />
          <div v-if="(row as { closed: { reason: string } | null }).closed" class="pi__muted pi__wrap">{{ (row as { closed: { reason: string } }).closed.reason }}</div>
        </template>
        <template #actions="{ row }">
          <div class="pi__rowactions">
            <MpButton v-if="(row as { missingIds: string[] }).missingIds.length && !(row as { closed: unknown }).closed" size="sm" variant="secondary" is-rounded @click="copyHr((row as { missingIds: string[] }).missingIds)">{{ t('Copy for HR') }}</MpButton>
            <MpButton v-if="payroll.viewAs === 'Accountant' && (row as { open: boolean }).open" size="sm" variant="secondary" is-rounded @click="openClose((row as { group: string }).group)">{{ t('Close gap') }}</MpButton>
            <MpButton v-if="payroll.viewAs === 'Accountant' && (row as { closed: unknown }).closed" size="sm" variant="secondary" is-rounded @click="reopen((row as { group: string }).group)">{{ t('Reopen') }}</MpButton>
          </div>
        </template>
      </ErpTablePage>
      <p v-if="tracker.notExpected.length" class="pi__muted pi__note">
        {{ t('Not expected') }}: {{ tracker.notExpected.map((n) => `${n.employee_id} (${n.reason})`).join(', ') }}
      </p>
    </template>

    <PayrollInboxReasonDrawer
      :is-open="!!drawer"
      :title="drawer?.kind === 'close' ? t('Close gap') : t('Mark not expected')"
      :subtitle="drawer?.kind === 'close' ? `${tracker.label} · ${drawer?.group}` : tracker.label"
      :confirm-label="drawer?.kind === 'close' ? t('Close gap') : t('Mark not expected')"
      :pick-label="drawer?.kind === 'not-expected' ? t('Employee ID') : ''"
      :pick-options="drawer?.kind === 'not-expected' ? notExpectedOptions : []"
      :error="drawerError"
      @close="drawer = null"
      @submit="submitDrawer"
    />
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
.pi__note { margin: var(--mp-spacing-3) 0 0; }
.pi__rowactions { display: flex; gap: var(--mp-spacing-2); justify-content: flex-end; }

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
