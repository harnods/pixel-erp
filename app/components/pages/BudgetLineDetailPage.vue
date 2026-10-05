<script setup lang="ts">
/**
 * Budget line record (PRD FG-1 TS-04, FG-2): the line's figures for the year,
 * the twelve months, every ledger entry behind them and the version history.
 * Department heads and project managers read; the requester sees the balance.
 */
import { MpButton, MpIcon, MpTextlink } from '@mekari/pixel3'
import BudgetLineFormDrawer from '~/components/patterns/BudgetLineFormDrawer.vue'
import {
  budget, lineById, lineTitle, lineClass, yearFigures, monthFigures, entriesFor, versionsFor, isLocked,
  lineVersionNo, BUDGET_TODAY, BUDGET_CURRENT_MONTH, BUDGET_YEAR, LOCKED_EDIT_MESSAGE,
} from '~/data/budgetStore'
import { MONTH_NAMES, accountLabel, deptName } from '~/data/budgetMaster'
import {
  lineAccess, canReadLine, entryDate, entryLink, versionLink, versionDeltaOn, versionLabel, shortDate, ENTRY_TYPE_LABEL,
} from '~/data/budgetUiLines'
import { formatIDRWhole } from '~/utils/currency'

const props = defineProps<{ orderId?: string }>()
const { t } = useLocale()
const router = useRouter()

const line = computed(() => lineById(props.orderId ?? null))
const access = computed(() => lineAccess(budget.viewAs))
const readable = computed(() => !!line.value && canReadLine(line.value, budget.viewAs))
const locked = computed(() => !!line.value && isLocked(line.value.year))
const year = computed(() => line.value?.year ?? BUDGET_YEAR)

const fig = computed(() => (line.value ? yearFigures(line.value.id) : null))
const asOf = computed(() => t(`Budget ${year.value} · as of ${shortDate(BUDGET_TODAY)}`))

interface Stat { label: string; value: number; danger?: boolean; sub?: string }
const stats = computed<Stat[]>(() => {
  const f = fig.value
  if (!f) return []
  const all: Stat[] = [
    { label: 'Budget', value: f.budget },
    { label: 'Reserved', value: f.reserved, sub: f.pending ? `Pending approval ${formatIDRWhole(f.pending)}, not held` : undefined },
    { label: 'Committed', value: f.committed },
    { label: 'Actual', value: f.actual },
    { label: 'Available', value: f.available, danger: f.available < 0, sub: f.held ? `After ${formatIDRWhole(f.held)} held for transfers` : undefined },
  ]
  return access.value.detail ? all : all.filter((s) => s.label === 'Budget' || s.label === 'Available')
})

// ── Months ──────────────────────────────────────────────────────────────────
const isCurrentYear = computed(() => year.value === BUDGET_YEAR)
const monthRows = computed(() => {
  const l = line.value
  if (!l) return []
  return MONTH_NAMES.map((name, m) => {
    const f = monthFigures(l.id, m)
    const planned = !isCurrentYear.value || m > BUDGET_CURRENT_MONTH
    return { m, name, ...f, planned, current: isCurrentYear.value && m === BUDGET_CURRENT_MONTH }
  })
})

// ── Ledger and versions ─────────────────────────────────────────────────────
const entries = computed(() => (line.value ? [...entriesFor(line.value.id)].sort((a, b) => entryDate(b).localeCompare(entryDate(a)) || b.id - a.id) : []))
const versions = computed(() => (line.value ? [...versionsFor(line.value.id)].sort((a, b) => b.no - a.no) : []))
const signed = (n: number) => (n > 0 ? `+${formatIDRWhole(n)}` : formatIDRWhole(n))

// ── Actions ─────────────────────────────────────────────────────────────────
const editOpen = ref(false)
const refusal = ref('')
function goBack() { router.push('/budget-lines') }
function revise() { if (line.value) router.push(`/budget-changes/new?kind=Revision&line=${line.value.id}`) }
function transfer() { router.push('/budget-changes/new?kind=Transfer') }
function editAmounts() {
  refusal.value = ''
  if (!access.value.manage) { refusal.value = t('Only the Budget Controller changes budget lines.'); return }
  if (locked.value) { refusal.value = t(LOCKED_EDIT_MESSAGE); return }
  editOpen.value = true
}
watch(() => budget.viewAs, () => { refusal.value = '' })
function openDoc(link: string | null) { if (link) router.push(link) }
</script>

<template>
  <div class="bld">
    <header class="bld__bar">
      <div class="bld__barleft">
        <nav class="bld__crumbs">
          <MpTextlink id="bld-crumb" as="a" class="bld__crumb" @click.prevent="goBack">{{ t('Budget lines') }}</MpTextlink>
        </nav>
        <h1 class="bld__title">{{ line && readable ? lineTitle(line) : t('Budget line') }}</h1>
        <p v-if="line && readable" class="bld__sub">
          {{ accountLabel(line.account) }} · {{ lineClass(line) ?? t('No class') }} · {{ t(`Budget ${line.year}`) }} ·
          {{ t(versionLabel(lineVersionNo(line.id))) }}
        </p>
      </div>
      <div v-if="line && readable && access.manage" class="bld__baractions">
        <template v-if="locked">
          <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="transfer">{{ t('Transfer') }}</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="revise">{{ t('Revise') }}</button>
        </template>
        <button v-else class="btn-enterprise btn-enterprise--secondary" type="button" @click="editAmounts">{{ t('Edit amounts') }}</button>
      </div>
    </header>

    <div v-if="!line" class="bld__body">
      <div class="bld__empty">
        <p class="bld__emptytitle">{{ t('This budget line does not exist') }}</p>
        <span class="cell-link" @click="goBack">{{ t('Back to budget lines') }}</span>
      </div>
    </div>

    <div v-else-if="!readable" class="bld__body">
      <div class="bld__note" role="alert">
        <MpIcon name="info" size="sm" />
        <span>{{ t(`You can read budget lines of your own department only. This line belongs to ${deptName(line.dept)}.`) }}</span>
      </div>
    </div>

    <div v-else class="bld__body">
      <div v-if="refusal" class="bld__note" role="alert">
        <MpIcon name="info" size="sm" />
        <span>{{ refusal }}</span>
      </div>

      <div class="stats-section" data-tour="budget-line-stats">
        <div v-for="(s, i) in stats" :key="s.label" class="stat-card" :class="{ 'stat-card--bordered': i < stats.length - 1 }">
          <div class="stat-title">{{ t(s.label) }}</div>
          <div class="stat-period">{{ asOf }}</div>
          <div class="stat-amount" :class="{ 'stat-amount--danger': s.danger }">{{ formatIDRWhole(s.value) }}</div>
          <div v-if="s.sub" class="stat-sub">{{ t(s.sub) }}</div>
        </div>
      </div>

      <section class="bld__card">
        <div class="bld__cardhead">
          <div class="bld__cardtitle">{{ t(`Months · ${year}`) }}</div>
          <div class="bld__cardsub">
            {{ isCurrentYear ? t(`January to December · ${MONTH_NAMES[BUDGET_CURRENT_MONTH]} is the current month; later months are planned`) : t('January to December · all months planned') }}
          </div>
        </div>
        <div class="bld__scroll">
          <table class="bld__table">
            <thead>
              <tr>
                <th class="bld__th">{{ t('Month') }}</th>
                <th class="bld__th bld__num">{{ t('Budget') }}</th>
                <template v-if="access.detail">
                  <th class="bld__th bld__num">{{ t('Reserved') }}</th>
                  <th class="bld__th bld__num">{{ t('Committed') }}</th>
                  <th class="bld__th bld__num">{{ t('Actual') }}</th>
                </template>
                <th class="bld__th bld__num">{{ t('Available') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in monthRows" :key="r.m" :class="{ 'bld__tr--current': r.current, 'bld__tr--planned': r.planned }">
                <td class="bld__td">
                  {{ t(r.name) }}
                  <span v-if="r.planned" class="bld__state">{{ t('Planned') }}</span>
                  <span v-else-if="r.current" class="bld__state">{{ t('Current month') }}</span>
                </td>
                <td class="bld__td bld__num">{{ formatIDRWhole(r.budget) }}</td>
                <template v-if="access.detail">
                  <td class="bld__td bld__num">{{ formatIDRWhole(r.reserved) }}</td>
                  <td class="bld__td bld__num">{{ formatIDRWhole(r.committed) }}</td>
                  <td class="bld__td bld__num">{{ formatIDRWhole(r.actual) }}</td>
                </template>
                <td class="bld__td bld__num" :class="{ 'bld__neg': r.available < 0 }">{{ formatIDRWhole(r.available) }}</td>
              </tr>
              <tr v-if="fig" class="bld__tr--total">
                <td class="bld__td">{{ t(`Year ${year}`) }}</td>
                <td class="bld__td bld__num">{{ formatIDRWhole(fig.budget) }}</td>
                <template v-if="access.detail">
                  <td class="bld__td bld__num">{{ formatIDRWhole(fig.reserved) }}</td>
                  <td class="bld__td bld__num">{{ formatIDRWhole(fig.committed) }}</td>
                  <td class="bld__td bld__num">{{ formatIDRWhole(fig.actual) }}</td>
                </template>
                <td class="bld__td bld__num" :class="{ 'bld__neg': fig.available < 0 }">{{ formatIDRWhole(fig.available) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <template v-if="access.detail">
        <section class="bld__card" data-tour="budget-line-ledger">
          <div class="bld__cardhead">
            <div class="bld__cardtitle">{{ t('Ledger entries') }}</div>
            <div class="bld__cardsub">{{ t(`${entries.length} entries · newest first`) }}</div>
          </div>
          <div v-if="!entries.length" class="bld__cardempty">{{ t('No requests, orders, bills or changes on this line yet.') }}</div>
          <div v-else class="bld__scroll">
            <table class="bld__table">
              <thead>
                <tr>
                  <th class="bld__th">{{ t('Date') }}</th>
                  <th class="bld__th">{{ t('Document') }}</th>
                  <th class="bld__th">{{ t('Event') }}</th>
                  <th class="bld__th">{{ t('Type') }}</th>
                  <th class="bld__th bld__num">{{ t('Amount') }}</th>
                  <th class="bld__th">{{ t('User') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="e in entries" :key="e.id">
                  <td class="bld__td bld__nowrap">{{ shortDate(entryDate(e)) }}</td>
                  <td class="bld__td bld__nowrap">
                    <span v-if="entryLink(e)" class="cell-link" @click="openDoc(entryLink(e))">{{ e.docNo }}</span>
                    <span v-else>{{ e.docNo }}</span>
                  </td>
                  <td class="bld__td">{{ t(e.event) }}</td>
                  <td class="bld__td bld__nowrap">{{ t(ENTRY_TYPE_LABEL[e.type]) }}</td>
                  <td class="bld__td bld__num" :class="{ 'bld__neg': e.amount < 0 }">{{ formatIDRWhole(e.amount) }}</td>
                  <td class="bld__td bld__nowrap">{{ e.user }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <section class="bld__card" data-tour="budget-line-versions">
          <div class="bld__cardhead">
            <div class="bld__cardtitle">{{ t('Version history') }}</div>
            <div class="bld__cardsub">
              {{ versions.length ? t(`${versions.length} versions changed this line`) : t('No version yet. Version 0 is posted when the budget is locked.') }}
            </div>
          </div>
          <div v-if="versions.length" class="bld__scroll">
            <table class="bld__table">
              <thead>
                <tr>
                  <th class="bld__th">{{ t('Version') }}</th>
                  <th class="bld__th">{{ t('Type') }}</th>
                  <th class="bld__th">{{ t('Document') }}</th>
                  <th class="bld__th">{{ t('Reason') }}</th>
                  <th class="bld__th">{{ t('Requested by') }}</th>
                  <th class="bld__th">{{ t('Approved by') }}</th>
                  <th class="bld__th">{{ t('Date') }}</th>
                  <th class="bld__th bld__num">{{ t('Change on this line') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="v in versions" :key="v.no">
                  <td class="bld__td bld__nowrap">{{ t(`Version ${v.no}`) }}</td>
                  <td class="bld__td bld__nowrap">{{ t(v.type) }}</td>
                  <td class="bld__td bld__nowrap">
                    <span v-if="versionLink(v)" class="cell-link" @click="openDoc(versionLink(v))">{{ v.docNo }}</span>
                    <span v-else>{{ v.docNo }}</span>
                  </td>
                  <td class="bld__td">{{ t(v.reason) }}</td>
                  <td class="bld__td bld__nowrap">{{ v.requestedBy }}</td>
                  <td class="bld__td bld__nowrap">{{ v.approvedBy }}</td>
                  <td class="bld__td bld__nowrap">{{ shortDate(v.at) }}</td>
                  <td class="bld__td bld__num" :class="{ 'bld__neg': versionDeltaOn(v, line.id) < 0 }">{{ signed(versionDeltaOn(v, line.id)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </template>
    </div>

    <BudgetLineFormDrawer v-if="line" :is-open="editOpen" :year="line.year" :line-id="line.id" @close="editOpen = false" />
  </div>
</template>

<style scoped>
.bld { display: flex; flex-direction: column; height: 100%; overflow: auto; }
.bld__bar {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4);
  flex: none; min-height: 72px; padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-neutral); border-bottom: 1px solid var(--mp-border-default);
}
.bld__barleft { display: flex; flex-direction: column; min-width: 0; }
.bld__crumbs { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.bld__crumb { font-size: var(--mp-font-sizes-sm); }
.bld__title { font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: 0; }
.bld__sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: var(--mp-spacing-1) 0 0; }
.bld__baractions { flex: none; display: flex; gap: var(--mp-spacing-2); }

.bld__body { padding: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
.bld__note {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-colors-background-warning); border-radius: var(--mp-radii-md);
  color: var(--mp-colors-text-warning); font-size: var(--mp-font-sizes-md);
}
.bld__empty { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-2); }
.bld__emptytitle { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch; }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-period { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-amount--danger { color: var(--mp-text-danger); }
.stat-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.bld__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.bld__cardhead { padding: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.bld__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bld__cardsub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.bld__cardempty { padding: var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.bld__scroll { overflow-x: auto; }
.bld__table { width: 100%; border-collapse: collapse; }
.bld__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.bld__td {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.bld__num { text-align: right; white-space: nowrap; }
.bld__nowrap { white-space: nowrap; }
.bld__neg { color: var(--mp-text-danger); }
.bld__state { margin-left: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bld__tr--planned .bld__td { color: var(--mp-text-secondary); }
.bld__tr--current .bld__td { font-weight: var(--mp-font-weights-semi-bold); }
.bld__tr--total .bld__td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-neutral-subtle); border-bottom: 0; }
</style>
