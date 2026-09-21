<script setup lang="ts">
/**
 * Budget tab — read-only (PRD §3, D5, D7; Stories 2, 3, 13).
 *
 *  • Budget detail = P&L by account against the frozen RAB/RAP baseline, with
 *    approver + date. A missing budget renders "not set", never Rp0. Accounts
 *    with actuals but no baseline appear as unbudgeted rows.
 *  • Work-order cost appears only on the Cost of production line.
 *  • Production monitoring: WO · status · Baseline (= budget set aside, not the
 *    estimate) · Actual · Variance.
 *  • Any change deep-links into Budget setup and returns here.
 */
import WoJournalOverlay from '../WoJournalOverlay.vue'
import type { Project } from '~/data/projects'
import { getWorkPackage, projectPhases } from '~/data/projects'
import { getBudget, budgetByAccount, accountName, COST_ACCOUNTS, COGM_ACCOUNT, phaseReserve } from '~/data/projectBudgets'
import { actualByAccount, projectCommitted, projectWos, woCommitted } from '~/data/projectTransactions'
import { recognisedToDate } from '~/data/projectRecognition'
import { rp, rpSigned, pct } from '~/utils/projectFormat'
import { formatDate } from '~/utils/date'

const props = defineProps<{ project: Project }>()
const { t } = useLocale()
const router = useRouter()

const budget = computed(() => getBudget(props.project.id))
const returnTo = computed(() => encodeURIComponent(`/projects/${props.project.id}?tab=budget`))
function openSetup() { router.push(`/budget-setup/${props.project.id}?returnTo=${returnTo.value}`) }

const rows = computed(() => {
  const base = budgetByAccount(props.project.id)
  const act = actualByAccount(props.project.id)
  const codes = new Set([...base.keys(), ...act.keys()])
  return COST_ACCOUNTS.filter(a => codes.has(a.code)).map(a => {
    const baseline = base.get(a.code)
    const committed = projectCommitted(props.project.id, a.code)
    const actual = act.get(a.code) ?? 0
    return {
      code: a.code, name: a.name, role: a.role, baseline, committed, actual,
      available: baseline === undefined ? undefined : baseline - committed - actual,
      unbudgeted: baseline === undefined,
    }
  })
})
const reserves = computed(() => projectPhases(props.project.id).reduce((s, ph) => s + phaseReserve(ph.id, props.project.id), 0))
const totals = computed(() => {
  const baseline = rows.value.reduce((s, r) => s + (r.baseline ?? 0), 0) + reserves.value
  const committed = rows.value.reduce((s, r) => s + r.committed, 0)
  const actual = rows.value.reduce((s, r) => s + r.actual, 0)
  return { baseline, committed, actual, available: baseline - committed - actual }
})
const plannedMargin = computed(() => budget.value ? budget.value.revenue - totals.value.baseline : 0)

const wos = computed(() => projectWos(props.project.id))
const journalWo = ref<string | undefined>()
const WO_TONE: Record<string, string> = { Draft: 'pm-pill--gray', Released: 'pm-pill--blue', 'In progress': 'pm-pill--yellow', Completed: 'pm-pill--green' }
</script>

<template>
  <div>
    <!-- Not set -->
    <div v-if="!budget" class="pm-card" style="text-align: center; padding: 40px 16px">
      <div class="pm-empty-title">{{ t('Budget not set') }}</div>
      <p class="pm-desc" style="max-width: 560px; margin: 4px auto 16px">{{ t('A missing budget is not a zero budget. Link the approved RAB/RAP plan — or enter the baseline manually — in Budget setup. Until then every budget check on this project reads “not set”.') }}</p>
      <button class="btn-enterprise btn-enterprise--primary" type="button" @click="openSetup">{{ t('Set up budget') }}</button>
    </div>

    <template v-else>
      <section class="pm-section">
        <div class="pm-section-head">
          <div>
            <h2 class="pm-h2">{{ t('Budget detail') }}</h2>
            <p class="pm-desc">{{ t('Frozen baseline from') }} <strong>{{ budget.planRef }}</strong> · {{ t('approved by') }} {{ budget.approvedBy }} {{ t('on') }} {{ formatDate(budget.approvedAt) }}<template v-if="budget.revisions.length"> · {{ budget.revisions.length }} {{ t('revision(s)') }}</template></p>
          </div>
          <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-after" type="button" @click="openSetup">
            {{ t('Revise in Budget setup') }}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M7 17L17 7M9 7h8v8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
        </div>

        <div class="pm-table-wrap">
          <table class="pm-table">
            <thead>
              <tr>
                <th>{{ t('Account') }}</th>
                <th class="pm-num">{{ t('Baseline') }}</th>
                <th class="pm-num">{{ t('Committed') }}</th>
                <th class="pm-num">{{ t('Actual') }}</th>
                <th class="pm-num">{{ t('Available') }}</th>
                <th style="width: 160px">{{ t('Used') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr class="pm-tr-sub">
                <td>4-40100 {{ t('Revenue (RAB)') }}</td>
                <td class="pm-num">{{ rp(budget.revenue) }}</td>
                <td class="pm-num pm-muted">—</td>
                <td class="pm-num">{{ rp(recognisedToDate(project.id)) }}<span class="pm-cell-sub">{{ t('recognised') }}</span></td>
                <td class="pm-num pm-muted">—</td>
                <td />
              </tr>
              <tr v-for="r in rows" :key="r.code" :class="{ 'pm-tr-warn': r.unbudgeted }">
                <td class="pm-wrap">
                  {{ r.code }} {{ t(r.name) }}
                  <span v-if="r.unbudgeted" class="pm-pill pm-pill--yellow" style="margin-left: 6px">{{ t('Unbudgeted') }}</span>
                  <span v-if="r.code === COGM_ACCOUNT" class="pm-cell-sub">{{ t('Consumed only through work orders — work-order cost never appears on any other row.') }}</span>
                  <span v-else-if="r.role === 'labour'" class="pm-cell-sub">{{ t('Non-production labour only (site supervision, PM time).') }}</span>
                  <span v-if="r.unbudgeted" class="pm-cell-sub">{{ t('Actuals with no baseline line — shown, never silently absorbed.') }}</span>
                </td>
                <td class="pm-num">
                  <template v-if="r.baseline !== undefined">{{ rp(r.baseline) }}</template>
                  <span v-else class="pm-warn">{{ t('Not set') }}</span>
                </td>
                <td class="pm-num">{{ rp(r.committed) }}</td>
                <td class="pm-num">{{ rp(r.actual) }}</td>
                <td class="pm-num" :class="r.available !== undefined && r.available < 0 ? 'pm-neg' : ''">{{ r.available !== undefined ? rp(r.available) : rpSigned(-(r.committed + r.actual)) }}</td>
                <td>
                  <template v-if="r.baseline">
                    <div class="pm-bar-track"><div class="pm-bar-fill" :class="{ 'pm-bar-fill--red': r.committed + r.actual > r.baseline, 'pm-bar-fill--warn': r.committed + r.actual > r.baseline * 0.9 && r.committed + r.actual <= r.baseline }" :style="{ width: Math.min((r.committed + r.actual) / r.baseline * 100, 100) + '%' }" /></div>
                    <span class="pm-cell-sub">{{ pct((r.committed + r.actual) / r.baseline * 100, 0) }}</span>
                  </template>
                </td>
              </tr>
              <tr>
                <td class="pm-wrap">{{ t('Phase reserves') }}<span class="pm-cell-sub">{{ t('Reserve is entered per phase in Budget setup (the only free-text budget amount).') }}</span></td>
                <td class="pm-num">{{ rp(reserves) }}</td>
                <td class="pm-num pm-muted">—</td><td class="pm-num pm-muted">—</td><td class="pm-num pm-muted">—</td><td />
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <td>{{ t('Total cost') }}</td>
                <td class="pm-num">{{ rp(totals.baseline) }}</td>
                <td class="pm-num">{{ rp(totals.committed) }}</td>
                <td class="pm-num">{{ rp(totals.actual) }}</td>
                <td class="pm-num" :class="{ 'pm-neg': totals.available < 0 }">{{ rp(totals.available) }}</td>
                <td />
              </tr>
              <tr>
                <td>{{ t('Planned margin') }}</td>
                <td class="pm-num" :class="plannedMargin < 0 ? 'pm-neg' : 'pm-pos'">{{ rp(plannedMargin) }}</td>
                <td colspan="4" class="pm-muted" style="font-weight: 400">{{ pct(budget.revenue ? plannedMargin / budget.revenue * 100 : 0) }} {{ t('of revenue') }}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section v-if="project.isProduction" class="pm-section">
        <div class="pm-section-head">
          <div>
            <h2 class="pm-h2">{{ t('Production monitoring') }}</h2>
            <p class="pm-desc">{{ t('Baseline is the budget set aside on the work order — not its cost estimate — so Variance reads actual against set-aside. Unused set-aside is released when the work order completes.') }}</p>
          </div>
          <button v-if="project.status !== 'closed'" class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before" type="button" @click="router.push(`/projects/${project.id}/work-orders/new`)">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
            {{ t('Work order') }}
          </button>
        </div>
        <div class="pm-table-wrap">
          <table class="pm-table">
            <thead>
              <tr>
                <th>{{ t('Work order') }}</th>
                <th>{{ t('Work package') }}</th>
                <th>{{ t('WO status') }}</th>
                <th class="pm-num">{{ t('Baseline') }}</th>
                <th class="pm-num">{{ t('Actual') }}</th>
                <th class="pm-num">{{ t('Variance') }}</th>
                <th class="pm-num">{{ t('Still committed') }}</th>
                <th class="pm-num">{{ t('Released') }}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr v-for="w in wos" :key="w.id">
                <td>{{ w.number }}<span class="pm-cell-sub">{{ t('Estimate') }} {{ rp(w.estimate) }}</span></td>
                <td>{{ getWorkPackage(w.wpId)?.code }} {{ getWorkPackage(w.wpId)?.name }}</td>
                <td><span class="pm-pill" :class="WO_TONE[w.status]">{{ t(w.status) }}</span><span v-if="w.override" class="pm-cell-sub pm-warn">{{ t('Overridden') }}</span></td>
                <td class="pm-num">{{ w.budgetSetAside ? rp(w.budgetSetAside) : t('Not set') }}</td>
                <td class="pm-num">{{ rp(w.actual) }}</td>
                <td class="pm-num" :class="w.actual > w.budgetSetAside ? 'pm-neg' : 'pm-pos'">{{ w.budgetSetAside ? rpSigned(w.budgetSetAside - w.actual) : '—' }}</td>
                <td class="pm-num">{{ rp(woCommitted(w)) }}</td>
                <td class="pm-num">{{ w.released ? rp(w.released) : '—' }}</td>
                <td><button class="pm-link" type="button" @click="journalWo = w.id">{{ t('Journal') }}</button></td>
              </tr>
              <tr v-if="!wos.length"><td colspan="9"><div class="pm-empty">{{ t('No work orders yet.') }}</div></td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>

    <WoJournalOverlay :wo-id="journalWo" @close="journalWo = undefined" />
  </div>
</template>
