<script setup lang="ts">
/**
 * Claims paid through payroll (OD-26): Reimbursement lines of each posted run by item, account
 * and tag, with run version and journal number. No names. Claims paid outside payroll do not
 * reach Jurnal and are not included.
 */
import { MpBadge } from '@mekari/pixel3'
import { runs, claimsSummary, liveJournals, rupiah, periodLabel, monthLabel } from '~/data/payrollStore'

const { t } = useLocale()
const claimRuns = computed(() => runs.value
  .filter((r) => r.mode === 'Live' && liveJournals(r.id).length)
  .map((r) => ({ run: r, summary: claimsSummary(r.id) })))
const grand = computed(() => claimRuns.value.reduce((s, x) => s + x.summary.total, 0))
</script>

<template>
  <div class="pac">
    <div class="pac-card">
      <div class="pac-head">
        <span class="pac-title">{{ t('Claims paid through payroll') }}</span>
        <span class="pac-sub">{{ t('Claims paid outside payroll don\'t reach Jurnal. Keep booking them as you do today.') }}</span>
      </div>
      <template v-for="x in claimRuns" :key="x.run.id">
        <div class="pac-run">
          <NuxtLink class="pac-link" :to="`/payroll-runs/${x.run.id}`">{{ x.run.kind === 'Regular' ? t('Payroll') : x.run.label }} {{ periodLabel(x.run.start, x.run.end) }}</NuxtLink>
          <span class="pac-sub">{{ monthLabel(x.run.month) }}</span>
          <MpBadge for="additionalInformation" type="announcement">v{{ x.run.ledgerVersion }}</MpBadge>
          <span class="pac-run-total">{{ rupiah(x.summary.total) }}</span>
        </div>
        <table v-if="x.summary.rows.length" class="pac-table">
          <thead><tr><th>{{ t('Pay item') }}</th><th>{{ t('Account') }}</th><th>{{ t('Dimensions') }}</th><th>{{ t('Journal') }}</th><th class="pac-r">{{ t('Amount') }}</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in x.summary.rows" :key="i">
              <td>{{ r.item }}</td><td>{{ r.account }}</td><td>{{ r.tags || '-' }}</td><td>{{ r.journal ?? '-' }}</td><td class="pac-r">{{ rupiah(r.amount) }}</td>
            </tr>
          </tbody>
        </table>
        <p v-else class="pac-empty">{{ t('No claims in this run') }}</p>
      </template>
      <p v-if="!claimRuns.length" class="pac-empty">{{ t('No posted runs yet') }}</p>
      <div v-else class="pac-grand"><span>{{ t('Total claims in posted runs') }}</span><span class="pac-r">{{ rupiah(grand) }}</span></div>
    </div>
  </div>
</template>

<style scoped>
.pac-card { border: 1px solid var(--mp-colors-border-default); border-radius: var(--mp-radii-md); overflow: hidden; }
.pac-head { display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); }
.pac-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.pac-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.pac-run { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-colors-background-neutral-subtle); border-bottom: 1px solid var(--mp-colors-border-default); }
.pac-run-total { margin-left: auto; font-weight: var(--mp-font-weights-semi-bold); font-variant-numeric: tabular-nums; }
.pac-link { color: var(--mp-colors-text-link, var(--mp-text-link)); text-decoration: none; font-weight: var(--mp-font-weights-semi-bold); }
.pac-table { width: 100%; border-collapse: collapse; }
.pac-table th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-secondary); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); }
.pac-table td { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); }
.pac-r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pac-empty { margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-secondary); border-bottom: 1px solid var(--mp-colors-border-default); }
.pac-grand { display: flex; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-4); font-weight: var(--mp-font-weights-semi-bold); }
</style>
