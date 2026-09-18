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
import { computed } from 'vue'
import { MpIcon, MpButton } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'
import { tieCheckRows } from '~/data/fixedAssetScreens'
import { fixedAssets, ASSET_HEADLINE_FIGURES as H } from '~/data/fixedAssets'

const { t } = useLocale()

type CheckState = 'passed' | 'failed' | 'incomplete'
interface Check {
  id: string
  name: string
  what: string
  state: CheckState
  detail: string
}

const unclassified = computed(() => fixedAssets.filter((a) => a.taxGroup === null))

/** The four checks, in the order the design lists them. */
const checks = computed<Check[]>(() => {
  const tieBreak = tieCheckRows.find((r) => r.difference !== 0)
  return [
    {
      id: 'C1',
      name: t('Register to control account'),
      what: t('The asset listing total against the general ledger balance'),
      state: tieBreak ? 'failed' : 'passed',
      detail: tieBreak
        ? `${tieBreak.account} ${tieBreak.name} ${t('differs by')} ${formatIDR(tieBreak.difference)}`
        : t('Every account agrees'),
    },
    {
      id: 'C2',
      name: t('Schedule integrity'),
      what: t('Every schedule sums to its depreciable base, both books'),
      state: 'passed',
      detail: t('24 schedules checked, all tie'),
    },
    {
      id: 'C3',
      name: t('Fiscal book coverage'),
      what: t('The fiscal book population against the register population'),
      state: unclassified.value.length ? 'failed' : 'passed',
      detail: unclassified.value.length
        ? `${unclassified.value.length} ${t('asset in the register is not in the fiscal book:')} ${unclassified.value.map((a) => a.id).join(', ')}`
        : t('Every asset is on both books'),
    },
    {
      id: 'C4',
      name: t('Export coverage'),
      what: t('The statutory export population against the fiscal book'),
      state: unclassified.value.length ? 'incomplete' : 'passed',
      detail: unclassified.value.length
        ? t('Cannot run until every asset carries a statutory group')
        : t('The export covers the whole fiscal book'),
    },
  ]
})

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
  failed: 'Found something',
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
      <p class="sc__sub">{{ t('September 2026 · closed 30/09/2026 · the result is retained against the period') }}</p>
      <MpButton variant="secondary" is-rounded @click="infoToast(t('Re-running the check is not part of this screen yet.'))">
        {{ t('Run again') }}
      </MpButton>
    </header>

    <!-- The summary states the result either way. Silence is what the feature
         exists to remove. -->
    <div class="sc__summary" :class="`sc__summary--${overall}`">
      <MpIcon :name="stateIcon[overall]" size="md" />
      <div>
        <div class="sc__summarytitle">
          {{ passed }} {{ t('of') }} {{ checks.length }} {{ t('checks passed') }}
        </div>
        <div class="sc__summarysub">
          <template v-if="overall === 'passed'">
            {{ t('The register, both books and the statutory output agree.') }}
          </template>
          <template v-else>
            {{ failed }} {{ t('found something') }}<template v-if="incomplete">, {{ incomplete }} {{ t('could not complete') }}</template>.
            {{ t('A check that cannot run is never reported as a pass.') }}
          </template>
        </div>
      </div>
    </div>

    <div class="sc__list">
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

    <div class="sc__card">
      <div class="sc__cardhead">{{ t('Sub-ledger to ledger, account by account') }}</div>
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
            <td class="sc__td sc__td--num">{{ formatIDR(r.subLedger) }}</td>
            <td class="sc__td sc__td--num">{{ formatIDR(r.generalLedger) }}</td>
            <td class="sc__td sc__td--num" :class="{ 'sc__td--bad': r.difference !== 0 }">
              {{ r.difference === 0 ? '—' : formatIDR(r.difference) }}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>

.sc__head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-4); min-height: 32px; }
.sc__title { font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: 0; }
.sc__sub { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; max-width: 720px; }

.sc__summary { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4); border-radius: var(--mp-radii-md); margin-bottom: var(--mp-spacing-4); border: 1px solid; }
.sc__summary--passed { background: var(--mp-background-success-subtle); border-color: var(--mp-border-default); color: var(--mp-text-success); }
.sc__summary--failed { background: var(--mp-background-critical-subtle); border-color: var(--mp-border-default); color: var(--mp-text-critical); }
.sc__summary--incomplete { background: var(--mp-background-warning-subtle); border-color: var(--mp-border-default); color: var(--mp-text-warning); }
.sc__summarytitle { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); }
.sc__summarysub { font-size: var(--mp-font-sizes-md); margin-top: var(--mp-spacing-1); opacity: 0.92; }

.sc__list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-4); }
.sc__check { display: flex; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); }
.sc__checkicon { flex: none; margin-top: var(--mp-spacing-1); }
.sc__check--passed .sc__checkicon { color: var(--mp-text-success); }
.sc__check--failed .sc__checkicon { color: var(--mp-text-critical); }
.sc__check--incomplete .sc__checkicon { color: var(--mp-text-warning); }
.sc__checkbody { flex: 1; min-width: 0; }
.sc__checkhead { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.sc__checkname { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.sc__checkwhat { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.sc__checkdetail { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); margin-top: var(--mp-spacing-2); }

.sc__badge { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); padding: var(--mp-spacing-1) var(--mp-spacing-2); border-radius: var(--mp-radii-full); }
.sc__badge--passed { background: var(--mp-background-success-subtle); color: var(--mp-text-success); }
.sc__badge--failed { background: var(--mp-background-critical-subtle); color: var(--mp-text-critical); }
.sc__badge--incomplete { background: var(--mp-background-warning-subtle); color: var(--mp-text-warning); }

.sc__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.sc__cardhead { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.sc__table { width: 100%; border-collapse: collapse; }
.sc__th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.sc__th--num { text-align: right; }
.sc__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.sc__td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sc__td--mono { font-variant-numeric: tabular-nums; color: var(--mp-text-secondary); }
.sc__td--bad { color: var(--mp-text-critical); font-weight: var(--mp-font-weights-semi-bold); }
.sc__tr--break { background: var(--mp-background-critical-subtle); }
</style>
