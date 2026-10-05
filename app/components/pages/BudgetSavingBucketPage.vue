<script setup lang="ts">
/**
 * Saving bucket (FG-5, OD-05): the company's pool of savings, by source slice.
 *
 * The bucket is budget, not money (LR-7). Fills and draws are budget changes;
 * every figure here is read from the change documents on each render. The
 * Budget Controller raises draws; the CFO approves them and never raises one.
 */
import { computed, ref, nextTick } from 'vue'
import { MpButton, MpInput, MpTooltip, MpButtonGroup } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { formatIDRWhole } from '~/utils/currency'
import { infoToast, successToast } from '~/utils/toasts'
import {
  budget, BUDGET_YEAR, savingSlices, savingBucketStats, savingHistory, changeApprover, pendingSavingDraws,
  canRaiseSavingDraw, canApproveChange, approveChange, rejectChange, changeTotal, lineById, lineTitle,
  type ChangeDoc, type SavingSlice, type SavingTag,
} from '~/data/budgetStore'
import { deptName, projectName } from '~/data/budgetMaster'
import { SAVING_RELEASE_2 } from '~/data/budgetUiSettings'

defineProps<{ orderId?: string }>()

const { t } = useLocale()
const router = useRouter()

const notReady = () => infoToast(t('Not in this prototype'))

// ── Figures (read on every render) ─────────────────────────────────────────
const stats = computed(() => savingBucketStats())
const slices = computed(() => savingSlices())
const history = computed(() => savingHistory())
const fillCount = computed(() => history.value.filter((c) => c.kind === 'Saving fill' && c.status === 'Approved').length)
const drawCount = computed(() => history.value.filter((c) => c.kind === 'Saving draw' && c.status === 'Approved').length)

function sliceLabel(s: Pick<SavingTag, 'dept' | 'project' | 'class' | 'type'>): string {
  return `${deptName(s.dept)} · ${projectName(s.project)} · ${s.class} · ${s.type}`
}
function fmtDate(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00+07:00` : iso)
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Jakarta' })
}

// ── Slices ──────────────────────────────────────────────────────────────────
const sliceColumns: TableColumn[] = [
  { key: 'dept', label: 'Department' },
  { key: 'project', label: 'Project' },
  { key: 'class', label: 'Class', kind: 'unit' },
  { key: 'type', label: 'Type', kind: 'status' },
  { key: 'filled', label: 'Filled', kind: 'amount', align: 'right' },
  { key: 'drawn', label: 'Drawn', kind: 'amount', align: 'right' },
  { key: 'held', label: 'Held', kind: 'amount', align: 'right' },
  { key: 'balance', label: 'Balance', kind: 'amount', align: 'right' },
]
const sliceRows = computed(() => slices.value.map((s) => ({ ...s, deptLabel: deptName(s.dept), projectLabel: projectName(s.project) })))

// FG5-AC2: the CFO never sees Draw, and the call path refuses too.
const canDraw = computed(() => { void budget.viewAs; return canRaiseSavingDraw().ok })
const drawError = ref('')
function onDraw(s: SavingSlice) {
  drawError.value = ''
  const can = canRaiseSavingDraw()
  if (!can.ok) { drawError.value = can.reason!; return }
  if (s.balance <= 0) { drawError.value = `Nothing is left to draw on ${sliceLabel(s)}.`; return }
  router.push({ path: '/budget-changes/new', query: { kind: 'Saving draw', slice: s.key } })
}

// ── Approval queue (CFO, or the President Director when the CFO benefits) ──
const pending = computed(() => pendingSavingDraws())
const queueColumns: TableColumn[] = [
  { key: 'number', label: 'Number', kind: 'number' },
  { key: 'slice', label: 'Slice', kind: 'name' },
  { key: 'toLine', label: 'To line', kind: 'name' },
  { key: 'amount', label: 'Amount', kind: 'amount', align: 'right' },
  { key: 'preparedBy', label: 'Raised by' },
  { key: 'waitingFor', label: 'Waiting for' },
]
const queueRows = computed(() => pending.value.map((c) => {
  const l = lineById(c.receivers[0]?.lineId ?? null)
  return {
    id: c.id,
    number: c.number,
    slice: c.saving ? sliceLabel(c.saving) : '-',
    toLine: l ? lineTitle(l) : '-',
    amount: changeTotal(c),
    preparedBy: c.preparedBy,
    waitingFor: changeApprover(c).name,
    reason: c.reason,
  }
}))
function canDecide(id: string): boolean {
  void budget.viewAs
  const c = pending.value.find((x) => x.id === id)
  return !!c && canApproveChange(c).ok
}

const queueError = ref('')
const rejecting = ref<string | null>(null)
const rejectNote = ref('')
const rejectNoteError = ref('')
function approve(id: string) {
  queueError.value = ''
  const c = pending.value.find((x) => x.id === id)
  const res = approveChange(id)
  if (!res.ok) { queueError.value = res.reason ?? 'This draw cannot be approved.'; return }
  successToast(t(`${c?.number ?? 'Draw'} approved`))
}
function startReject(id: string) {
  queueError.value = ''
  const c = pending.value.find((x) => x.id === id)
  const can = c ? canApproveChange(c) : { ok: false, reason: 'This draw is no longer waiting.' }
  if (!can.ok) { queueError.value = can.reason!; return }
  rejecting.value = id
  rejectNote.value = ''
  rejectNoteError.value = ''
}
function confirmReject() {
  if (!rejecting.value) return
  if (!rejectNote.value.trim()) { rejectNoteError.value = 'Add a reason for the Budget Controller.'; return }
  const c = pending.value.find((x) => x.id === rejecting.value)
  const res = rejectChange(rejecting.value, rejectNote.value.trim())
  if (!res.ok) { rejectNoteError.value = res.reason ?? 'This draw cannot be rejected.'; return }
  successToast(t(`${c?.number ?? 'Draw'} rejected`))
  rejecting.value = null
}
const rejectingNumber = computed(() => pending.value.find((x) => x.id === rejecting.value)?.number ?? '')

// ── Fills and draws ─────────────────────────────────────────────────────────
const kindFilter = ref('')
const kindOptions = [{ value: 'Saving fill', label: 'Fills' }, { value: 'Saving draw', label: 'Draws' }]
const historyColumns: TableColumn[] = [
  { key: 'date', label: 'Date', kind: 'date' },
  { key: 'number', label: 'Number', kind: 'number' },
  { key: 'kind', label: 'Type', kind: 'unit' },
  { key: 'slice', label: 'Slice', kind: 'name' },
  { key: 'sourceDoc', label: 'Source document', kind: 'name' },
  { key: 'amount', label: 'Amount', kind: 'amount', align: 'right' },
  { key: 'status', label: 'Status', kind: 'status' },
  { key: 'approver', label: 'Approver' },
]
function sourceOf(c: ChangeDoc): string {
  if (c.kind === 'Saving fill') return c.saving?.sourceDoc || '-'
  const l = lineById(c.receivers[0]?.lineId ?? null)
  return l ? `To ${lineTitle(l)}` : '-'
}
const historyRows = computed(() => history.value
  .filter((c) => !kindFilter.value || c.kind === kindFilter.value)
  .map((c) => {
    const ap = changeApprover(c)
    return {
      id: c.id,
      date: fmtDate(c.submittedAt ?? c.createdAt),
      number: c.number,
      kind: c.kind === 'Saving fill' ? 'Fill' : 'Draw',
      slice: c.saving ? sliceLabel(c.saving) : '-',
      sourceDoc: sourceOf(c),
      amount: changeTotal(c),
      status: c.status,
      approver: ap.decided ? ap.name : (c.status === 'Pending' ? `Waiting for ${ap.name}` : '-'),
    }
  }))
const historyPage = ref(1)
const historyPerPage = ref(25)
const historyPaged = computed(() => historyRows.value.slice((historyPage.value - 1) * historyPerPage.value, historyPage.value * historyPerPage.value))

const historyEl = ref<HTMLElement | null>(null)
const queueEl = ref<HTMLElement | null>(null)
async function showHistory(kind: string) {
  kindFilter.value = kind
  historyPage.value = 1
  await nextTick()
  historyEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function showQueue() { queueEl.value?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }

function statusType(s: string) { return s === 'Withdrawn' ? 'announcement' as const : undefined }
</script>

<template>
  <div class="sb">
    <!-- ── Headline figures ── -->
    <div class="stats-section">
      <div class="stat-card stat-card--bordered">
        <div class="stat-title">{{ t('Bucket balance') }}</div>
        <div class="stat-period">{{ t(`Available to draw · ${BUDGET_YEAR}`) }}</div>
        <div class="stat-amount" data-testid="sb-balance">{{ formatIDRWhole(stats.balance) }}</div>
        <a class="stat-link" @click="showHistory('')">{{ slices.length }} {{ t(slices.length === 1 ? 'slice' : 'slices') }}</a>
      </div>
      <div class="stat-card stat-card--bordered">
        <div class="stat-title">{{ t('Filled this year') }}</div>
        <div class="stat-period">{{ t(`Approved fills · ${BUDGET_YEAR}`) }}</div>
        <div class="stat-amount" data-testid="sb-filled">{{ formatIDRWhole(stats.filled) }}</div>
        <a class="stat-link" @click="showHistory('Saving fill')">{{ fillCount }} {{ t(fillCount === 1 ? 'fill' : 'fills') }}</a>
      </div>
      <div class="stat-card stat-card--bordered">
        <div class="stat-title">{{ t('Drawn this year') }}</div>
        <div class="stat-period">{{ t(`Approved draws · ${BUDGET_YEAR}`) }}</div>
        <div class="stat-amount" data-testid="sb-drawn">{{ formatIDRWhole(stats.drawn) }}</div>
        <a class="stat-link" @click="showHistory('Saving draw')">{{ drawCount }} {{ t(drawCount === 1 ? 'draw' : 'draws') }}</a>
      </div>
      <div class="stat-card">
        <div class="stat-title">{{ t('Held by pending draws') }}</div>
        <div class="stat-period">{{ t('Waiting for approval') }}</div>
        <div class="stat-amount" data-testid="sb-held">{{ formatIDRWhole(stats.held) }}</div>
        <a class="stat-link" @click="showQueue">{{ stats.pendingDraws }} {{ t(stats.pendingDraws === 1 ? 'draw waiting' : 'draws waiting') }}</a>
      </div>
    </div>

    <!-- ── Approval queue ── -->
    <section ref="queueEl" class="sb__section" data-tour="saving-approvals">
      <div class="sb__head">
        <span class="sb__title">{{ t('Draws waiting for approval') }}</span>
        <span class="sb__hint">{{ t('The CFO approves each draw alone. A draw the CFO raised or benefits from goes to the President Director.') }}</span>
      </div>
      <p v-if="queueError" class="sb__error" data-testid="sb-queue-error">{{ t(queueError) }}</p>
      <div v-if="rejecting" class="sb__reject">
        <div class="sb__field">
          <label class="sb__label" for="sb-reject-note">{{ t(`Reason for rejecting ${rejectingNumber}`) }}</label>
          <MpInput id="sb-reject-note" v-model="rejectNote" :is-invalid="!!rejectNoteError" />
          <span v-if="rejectNoteError" class="sb__fielderror">{{ t(rejectNoteError) }}</span>
        </div>
        <div class="sb__btns">
          <MpButton variant="ghost" is-rounded @click="rejecting = null">{{ t('Cancel') }}</MpButton>
          <MpButton is-rounded data-testid="sb-reject-confirm" @click="confirmReject">{{ t('Reject draw') }}</MpButton>
        </div>
      </div>
      <p v-if="!queueRows.length" class="sb__empty" data-testid="sb-queue-empty">{{ t('No draws are waiting for approval.') }}</p>
      <ErpTablePage
        v-else
        :columns="queueColumns"
        :rows="queueRows"
        :total="queueRows.length"
        :current-page="1"
        :per-page="25"
        actions-width="200px"
        no-row-hover
      >
        <template #cell-number="{ row }">
          <span class="sb__link" @click="router.push(`/budget-changes/${row.id}`)">{{ row.number }}</span>
        </template>
        <template #cell-amount="{ value }">{{ formatIDRWhole(value as number) }}</template>
        <template #cell-slice="{ row }">
          <div class="sb__cellstack">
            <span>{{ row.slice }}</span>
            <span class="sb__sub">{{ row.reason }}</span>
          </div>
        </template>
        <template #actions="{ row }">
          <div v-if="canDecide(row.id as string)" class="sb__rowbtns">
            <MpButton size="sm" variant="secondary" is-rounded :data-testid="`sb-reject-${row.number}`" @click="startReject(row.id as string)">{{ t('Reject') }}</MpButton>
            <MpButton size="sm" variant="secondary" is-rounded :data-testid="`sb-approve-${row.number}`" @click="approve(row.id as string)">{{ t('Approve') }}</MpButton>
          </div>
        </template>
      </ErpTablePage>
    </section>

    <!-- ── Slices ── -->
    <section class="sb__section" data-tour="saving-slices">
      <div class="sb__head">
        <span class="sb__title">{{ t('Balance by source') }}</span>
        <span class="sb__hint">{{ t('A draw keeps Opex and Capex apart and cannot exceed its slice') }}</span>
      </div>
      <p v-if="drawError" class="sb__error" data-testid="sb-draw-error">{{ t(drawError) }}</p>
      <p v-if="!sliceRows.length" class="sb__empty">{{ t('The bucket is empty. Fill it from a line that saved money.') }}</p>
      <ErpTablePage
        v-else
        :columns="sliceColumns"
        :rows="sliceRows"
        :total="sliceRows.length"
        :current-page="1"
        :per-page="25"
        actions-width="96px"
        no-row-hover
      >
        <template #cell-dept="{ row }">{{ row.deptLabel }}</template>
        <template #cell-project="{ row }">{{ row.projectLabel }}</template>
        <template #cell-filled="{ value }">{{ formatIDRWhole(value as number) }}</template>
        <template #cell-drawn="{ value }">{{ formatIDRWhole(value as number) }}</template>
        <template #cell-held="{ value }">{{ formatIDRWhole(value as number) }}</template>
        <template #cell-balance="{ value }"><strong>{{ formatIDRWhole(value as number) }}</strong></template>
        <template #actions="{ row }">
          <span v-if="canDraw" :data-tour="row.key === sliceRows[0]?.key ? 'saving-draw' : undefined">
            <MpButton size="sm" variant="secondary" is-rounded :data-testid="`sb-draw-${row.key}`" @click="onDraw(row as unknown as SavingSlice)">{{ t('Draw') }}</MpButton>
          </span>
        </template>
      </ErpTablePage>
    </section>

    <!-- ── Fills and draws ── -->
    <section ref="historyEl" class="sb__section">
      <div class="sb__head">
        <span class="sb__title">{{ t('Fills and draws') }}</span>
      </div>
      <ErpTablePage
        :columns="historyColumns"
        :rows="historyPaged"
        :total="historyRows.length"
        :current-page="historyPage"
        :per-page="historyPerPage"
        :has-active-filter="!!kindFilter"
        filter-empty-label="fill or draw"
        no-row-hover
        @page-change="(p: number) => historyPage = p"
        @per-page-change="(n: number) => { historyPerPage = n; historyPage = 1 }"
        @clear-filters="kindFilter = ''"
      >
        <template #filters>
          <div class="filter-left">
            <ErpFilterSelect id="sb-kind" v-model="kindFilter" :placeholder="t('Type')" :options="kindOptions" />
            <MpButton v-if="kindFilter" variant="ghost" is-rounded data-testid="sb-clear" @click="kindFilter = ''">{{ t('Clear filters') }}</MpButton>
          </div>
          <div class="filter-right">
            <MpButtonGroup class="filter-btn-group">
              <MpTooltip :label="t('Download')" placement="bottom">
                <MpButton variant="ghost" left-icon="download" :aria-label="t('Download')" is-rounded data-testid="sb-download" @click="notReady" />
              </MpTooltip>
            </MpButtonGroup>
          </div>
        </template>
        <template #cell-number="{ row }">
          <span class="sb__link" @click="router.push(`/budget-changes/${row.id}`)">{{ row.number }}</span>
        </template>
        <template #cell-amount="{ value }">{{ formatIDRWhole(value as number) }}</template>
        <template #cell-status="{ value }">
          <ErpStatusBadge :status="String(value).toLowerCase()" :label="t(String(value))" :type="statusType(String(value))" />
        </template>
      </ErpTablePage>
    </section>

    <!-- ── Release 2 ── -->
    <section class="sb__card">
      <div class="sb__cardhead">
        <span class="sb__title">{{ t('Saving rules') }}</span>
      </div>
      <div v-for="r in SAVING_RELEASE_2" :key="r.label" class="sb__rule">
        <div>
          <div class="sb__rulek">{{ t(r.label) }}</div>
          <div class="sb__rulev">{{ t(r.detail) }}</div>
        </div>
        <MpButton variant="secondary" is-rounded :data-testid="`sb-r2-${r.label}`" @click="notReady">{{ t('Set up') }}</MpButton>
      </div>
      <div class="sb__rule">
        <div>
          <div class="sb__rulek">{{ t('Year-end decision') }}</div>
          <div class="sb__rulev">{{ t(`The CFO decides what happens to the balance at year-end. The ${BUDGET_YEAR + 1} bucket starts at zero.`) }}</div>
        </div>
        <MpButton variant="secondary" is-rounded data-testid="sb-year-end" @click="notReady">{{ t('Decide') }}</MpButton>
      </div>
    </section>
  </div>
</template>

<style scoped>
.sb { display: flex; flex-direction: column; gap: var(--mp-spacing-8); }

/* Stats band (copied from BillsIndexPage) */
.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch; }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-period { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-link { display: inline-flex; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-link); line-height: var(--mp-line-heights-md); text-decoration: none; cursor: pointer; padding: 0 var(--mp-spacing-0\.5); }

.sb__section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); scroll-margin-top: var(--mp-spacing-6); }
.sb__head { display: flex; align-items: baseline; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.sb__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.sb__hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.sb__error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); margin: 0; }
.sb__empty { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.sb__link { color: var(--mp-text-link); cursor: pointer; }
.sb__cellstack { display: flex; flex-direction: column; min-width: 0; }
.sb__sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sb__rowbtns { display: flex; gap: var(--mp-spacing-2); justify-content: flex-end; }

.sb__reject { display: flex; align-items: flex-end; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.sb__field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); flex: 1 1 320px; min-width: 0; }
.sb__label { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.sb__fielderror { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.sb__btns { display: flex; gap: var(--mp-spacing-2); }

.sb__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.sb__cardhead { padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.sb__rule { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.sb__rule:last-child { border-bottom: 0; }
.sb__rulek { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.sb__rulev { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
</style>
