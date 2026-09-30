<script setup lang="ts">
/**
 * Period self-check.
 *
 * The module reconciles itself at each close and reports the result whether or
 * not anything is wrong. That last part is the whole feature: a check that only
 * speaks on failure reads exactly like a check that never ran, which is why a
 * preparer keeps a spreadsheet of their own.
 *
 * Three states, not two. Passed, failed, and did not complete. A check that
 * errors must never render as a pass — the output of a check that did not run
 * is otherwise indistinguishable from the output of one that succeeded, and the
 * feature then provides false assurance, which is worse than none.
 */
import { computed, ref } from 'vue'
import { MpIcon, MpButton } from '@mekari/pixel3'
import { formatIDRWhole } from '~/utils/currency'
import { successToast, infoToast } from '~/utils/toasts'
import { rerunSelfCheck } from '~/data/fixedAssetSession'
import {
  selfCheckFor, computeSelfCheck, CURRENT_PERIOD, retainedSelfChecks, simulateDirectJournal, withdrawDirectJournals,
  journals, type CheckResult,
} from '~/data/assetStore'
import { periodLabel, type Period } from '~/data/assetEngine'

const { t } = useLocale()

type CheckState = 'passed' | 'failed' | 'incomplete'
interface Check {
  id: string
  name: string
  what: string
  state: CheckState
  detail: string
}

/**
 * Re-running restates the result and the time it was taken. The timestamp is
 * the point: a check retained against a period is what a preparer shows an
 * examiner, so it has to say when it ran.
 */
function runAgain() {
  rerunSelfCheck()
  selected.value = CURRENT_PERIOD
  successToast(t('Checks re-run'))
}

/** OD-43: one retained result per period. Closed periods ran theirs at close. */
const selected = ref<Period>(CURRENT_PERIOD)
const history = computed(() => retainedSelfChecks())
const isCurrent = computed(() => selected.value === CURRENT_PERIOD)
function stateOf(checks: CheckResult[]): CheckState {
  if (checks.some((c) => c.state === 'failed')) return 'failed'
  if (checks.some((c) => c.state === 'incomplete')) return 'incomplete'
  return 'passed'
}

/**
 * FG6-AC3 demonstration. Nothing outside the module can post to an asset
 * control account in the product, so the only way to show this check
 * failing is to post such a journal here, clearly labelled.
 */
const demoJournals = computed(() => journals.value.filter((j) => j.source === 'manual'))
function simulate() {
  const j = simulateDirectJournal()
  selected.value = CURRENT_PERIOD
  infoToast(t(`Demonstration journal ${j.number} posted to 6-5100`))
}
function withdraw() {
  const n = withdrawDirectJournals()
  successToast(t(`${n} demonstration ${n === 1 ? 'journal' : 'journals'} withdrawn`))
}

/**
 * The result retained against the period, as the store last ran it. The
 * store re-runs it whenever the module changes, and Run again restates it.
 */
const result = computed(() => selfCheckFor(selected.value) ?? { ...computeSelfCheck(selected.value), runAt: '' })
const tieCheckRows = computed(() => result.value.tie)

/** What each check compares. The result and its detail come from the store. */
const CHECK_TEXT: Record<CheckResult['id'], { name: string; what: string }> = {
  C1: { name: 'Register to control account', what: 'Asset register total against the general ledger balance' },
  C2: { name: 'Schedule integrity', what: 'Each schedule adds up to its depreciable amount, on both books' },
  C3: { name: 'Tax book coverage', what: 'Every asset in the register is in the tax book' },
  C4: { name: 'Lampiran 9 coverage', what: 'Every asset in the tax book is in Lampiran 9' },
}

/** The four checks, in the order the design lists them. */
const checks = computed<Check[]>(() =>
  result.value.checks.map((c) => ({
    id: c.id,
    name: t(CHECK_TEXT[c.id].name),
    what: t(CHECK_TEXT[c.id].what),
    state: c.state,
    detail: t(c.detail),
  })),
)

const passed = computed(() => checks.value.filter((c) => c.state === 'passed').length)
const failed = computed(() => checks.value.filter((c) => c.state === 'failed').length)
const incomplete = computed(() => checks.value.filter((c) => c.state === 'incomplete').length)

const overall = computed<CheckState>(() => {
  if (failed.value) return 'failed'
  if (incomplete.value) return 'incomplete'
  return 'passed'
})

const stateLabel: Record<CheckState, string> = {
  passed: 'Passed',
  failed: 'Failed',
  incomplete: 'Did not complete',
}
const stateIcon: Record<CheckState, string> = {
  passed: 'check-circle',
  failed: 'alert-circle',
  incomplete: 'help-circle',
}
</script>

<template>
  <div class="sc">
    <header class="sc__head">
      <p class="sc__sub">
        {{ periodLabel(selected) }} · {{ t(isCurrent ? 'last run' : 'run at close') }} {{ result.runAt }}
      </p>
      <MpButton v-if="isCurrent" variant="secondary" is-rounded @click="runAgain">
        {{ t('Run again') }}
      </MpButton>
      <MpButton v-else variant="secondary" is-rounded @click="selected = CURRENT_PERIOD">
        {{ t('View current period') }}
      </MpButton>
    </header>

    <!-- OD-43: the result each period kept, so a reviewer can see the close ran it. -->
    <div class="sc__periods">
      <span
        v-for="h in history" :key="h.period" class="sc__period"
        :class="[`sc__period--${stateOf(h.checks)}`, { 'sc__period--on': h.period === selected }]"
        @click="selected = h.period"
      >
        <MpIcon :name="stateIcon[stateOf(h.checks)]" size="xs" />
        {{ periodLabel(h.period) }}
      </span>
    </div>

    <div class="sc__summary" :class="`sc__summary--${overall}`">
      <MpIcon :name="stateIcon[overall]" size="md" />
      <div>
        <div class="sc__summarytitle">
          {{ passed }} {{ t('of') }} {{ checks.length }} {{ t('checks passed') }}
        </div>
        <div class="sc__summarysub">
          <template v-if="overall === 'passed'">
            {{ t('The register, both books and Lampiran 9 agree') }}
          </template>
          <template v-else>
            {{ failed }} {{ t('failed') }}<template v-if="incomplete"> · {{ incomplete }} {{ t('did not complete') }}</template>
          </template>
        </div>
      </div>
    </div>

    <div class="sc__list" data-tour="recon-checks">
      <div v-for="c in checks" :key="c.id" class="sc__check" :class="`sc__check--${c.state}`">
        <MpIcon :name="stateIcon[c.state]" size="sm" class="sc__checkicon" />
        <div class="sc__checkbody">
          <div class="sc__checkhead">
            <span class="sc__checkname">{{ c.name }}</span>
            <span class="sc__badge" :class="`sc__badge--${c.state}`">{{ t(stateLabel[c.state]) }}</span>
          </div>
          <div class="sc__checkwhat">{{ c.what }}</div>
          <div class="sc__checkdetail">{{ c.detail }}</div>
        </div>
      </div>
    </div>

    <div class="sc__card" data-tour="recon-table">
      <div class="sc__cardhead">{{ t('Sub-ledger against general ledger') }}</div>
      <table class="sc__table">
        <thead>
          <tr>
            <th class="sc__th">{{ t('Account') }}</th>
            <th class="sc__th">{{ t('Name') }}</th>
            <th class="sc__th sc__th--num">{{ t('Sub-ledger') }}</th>
            <th class="sc__th sc__th--num">{{ t('General ledger') }}</th>
            <th class="sc__th sc__th--num">{{ t('Difference') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in tieCheckRows" :key="r.account" class="sc__tr" :class="{ 'sc__tr--break': r.difference !== 0 }">
            <td class="sc__td sc__td--mono">{{ r.account }}</td>
            <td class="sc__td">{{ r.name }}</td>
            <td class="sc__td sc__td--num">{{ formatIDRWhole(r.subLedger) }}</td>
            <td class="sc__td sc__td--num">{{ formatIDRWhole(r.generalLedger) }}</td>
            <td class="sc__td sc__td--num" :class="{ 'sc__td--bad': r.difference !== 0 }">
              {{ r.difference === 0 ? '—' : formatIDRWhole(r.difference) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- FG6-AC3: labelled as a demonstration wherever it appears. -->
    <div v-if="isCurrent" class="sc__card sc__demo">
      <div class="sc__cardhead">
        {{ t('Demonstration only') }}
      </div>
      <div class="sc__demobody">
        <p class="sc__demotext">
          {{ t('Posts a Rp4.000.000 journal to 6-5100 from outside the asset module, so the account check fails.') }}
        </p>
        <div v-if="demoJournals.length" class="sc__demolist">
          <div v-for="j in demoJournals" :key="j.number">{{ j.number }} · {{ j.date }} · {{ t(j.memo) }}</div>
        </div>
        <div class="sc__demobtns">
          <MpButton size="sm" variant="secondary" is-rounded @click="simulate">{{ t('Post demonstration journal') }}</MpButton>
          <MpButton v-if="demoJournals.length" size="sm" variant="ghost" is-rounded @click="withdraw">{{ t('Withdraw demonstration journals') }}</MpButton>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.sc__periods { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-4); }
.sc__period { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-1) var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); background: var(--mp-background-neutral); cursor: pointer; }
.sc__period--failed { color: var(--mp-text-danger); }
.sc__period--incomplete { color: var(--mp-colors-text-warning); }
.sc__period--passed :deep(svg) { color: var(--mp-colors-text-success); }
.sc__period--on { border-color: var(--mp-border-bold); font-weight: var(--mp-font-weights-semi-bold); }
.sc__demo { margin-top: var(--mp-spacing-4); border-style: dashed; }
.sc__demobody { padding: var(--mp-spacing-3) var(--mp-spacing-4) var(--mp-spacing-4); }
.sc__demotext { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0 0 var(--mp-spacing-3); max-width: 760px; }
.sc__demolist { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); margin-bottom: var(--mp-spacing-3); font-variant-numeric: tabular-nums; }
.sc__demobtns { display: flex; gap: var(--mp-spacing-2); }

.sc__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.sc__sub { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; max-width: 720px; }

.sc__summary { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4); border-radius: var(--mp-radii-md); margin-bottom: var(--mp-spacing-4); border: 1px solid; }
.sc__summary--passed { background: var(--mp-background-success-subtle); border-color: var(--mp-border-default); color: var(--mp-colors-text-success); }
.sc__summary--failed { background: var(--mp-colors-background-danger); border-color: var(--mp-border-default); color: var(--mp-text-danger); }
.sc__summary--incomplete { background: var(--mp-background-warning-subtle); border-color: var(--mp-border-default); color: var(--mp-colors-text-warning); }
.sc__summarytitle { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); }
.sc__summarysub { font-size: var(--mp-font-sizes-md); margin-top: var(--mp-spacing-1); opacity: 0.92; }

.sc__list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-4); }
.sc__check { display: flex; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); }
.sc__checkicon { flex: none; margin-top: var(--mp-spacing-1); }
.sc__check--passed .sc__checkicon { color: var(--mp-colors-text-success); }
.sc__check--failed .sc__checkicon { color: var(--mp-text-danger); }
.sc__check--incomplete .sc__checkicon { color: var(--mp-colors-text-warning); }
.sc__checkbody { flex: 1; min-width: 0; }
.sc__checkhead { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.sc__checkname { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.sc__checkwhat { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.sc__checkdetail { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); margin-top: var(--mp-spacing-2); }

.sc__badge { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); padding: var(--mp-spacing-1) var(--mp-spacing-2); border-radius: var(--mp-radii-full); }
.sc__badge--passed { background: var(--mp-background-success-subtle); color: var(--mp-colors-text-success); }
.sc__badge--failed { background: var(--mp-colors-background-danger); color: var(--mp-text-danger); }
.sc__badge--incomplete { background: var(--mp-background-warning-subtle); color: var(--mp-colors-text-warning); }

.sc__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.sc__cardhead { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.sc__table { width: 100%; border-collapse: collapse; }
.sc__th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.sc__th--num { text-align: right; }
.sc__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.sc__td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sc__td--mono { font-variant-numeric: tabular-nums; color: var(--mp-text-secondary); }
.sc__td--bad { color: var(--mp-text-danger); font-weight: var(--mp-font-weights-semi-bold); }
.sc__tr--break { background: var(--mp-colors-background-danger); }
</style>
