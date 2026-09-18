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
      <div>
        <h2 class="sc__title">{{ t('Period self-check') }}</h2>
        <p class="sc__sub">{{ t('September 2026 · closed 30/09/2026 · retained against the period') }}</p>
      </div>
      <MpButton variant="secondary" left-icon="refresh-cw" @click="infoToast(t('Re-running the check is not part of this screen yet.'))">
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
.sc { padding: 4px 0 32px; }
.sc__head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; }
.sc__title { font-size: 18px; font-weight: 600; color: #1e2e2b; margin: 0; }
.sc__sub { font-size: 13px; color: #758195; margin: 4px 0 0; }

.sc__summary { display: flex; align-items: flex-start; gap: 12px; padding: 16px; border-radius: 10px; margin-bottom: 16px; border: 1px solid; }
.sc__summary--passed { background: #e8f4ef; border-color: #b8e2d1; color: #027a4f; }
.sc__summary--failed { background: #fceeed; border-color: #f3c9c5; color: #a8352d; }
.sc__summary--incomplete { background: #fdf9c4; border-color: #ece49a; color: #7a5700; }
.sc__summarytitle { font-size: 15px; font-weight: 600; }
.sc__summarysub { font-size: 13px; margin-top: 2px; opacity: 0.92; }

.sc__list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.sc__check { display: flex; gap: 10px; padding: 12px 16px; border: 1px solid #e2e7ed; border-radius: 10px; background: #fff; }
.sc__checkicon { flex: none; margin-top: 2px; }
.sc__check--passed .sc__checkicon { color: #027a4f; }
.sc__check--failed .sc__checkicon { color: #a8352d; }
.sc__check--incomplete .sc__checkicon { color: #7a5700; }
.sc__checkbody { flex: 1; min-width: 0; }
.sc__checkhead { display: flex; align-items: center; gap: 8px; }
.sc__checkname { font-size: 14px; font-weight: 600; color: #1e2e2b; }
.sc__checkwhat { font-size: 12px; color: #758195; margin-top: 2px; }
.sc__checkdetail { font-size: 13px; color: #3a4749; margin-top: 6px; }

.sc__badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
.sc__badge--passed { background: #e8f4ef; color: #027a4f; }
.sc__badge--failed { background: #fceeed; color: #a8352d; }
.sc__badge--incomplete { background: #fdf9c4; color: #7a5700; }

.sc__card { border: 1px solid #e2e7ed; border-radius: 10px; background: #fff; overflow: hidden; }
.sc__cardhead { font-size: 14px; font-weight: 600; color: #1e2e2b; padding: 12px 16px; border-bottom: 1px solid #eef1f4; }
.sc__table { width: 100%; border-collapse: collapse; }
.sc__th { text-align: left; font-size: 11px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: #758195; background: #f8fafb; padding: 8px 16px; border-bottom: 1px solid #eef1f4; }
.sc__th--num { text-align: right; }
.sc__td { font-size: 13px; color: #232933; padding: 10px 16px; border-bottom: 1px solid #f4f6f8; }
.sc__td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.sc__td--mono { font-variant-numeric: tabular-nums; color: #758195; }
.sc__td--bad { color: #a8352d; font-weight: 600; }
.sc__tr--break { background: #fffbfb; }
</style>
