<script setup lang="ts">
/**
 * Claims on the run (OD-26): reimbursement pay items by item, account and dimension, from the
 * live journals once posted, from the draft before. Replaces the old Payroll claims page.
 */
import { computed } from 'vue'
import { claimsSummary, runById, rupiah } from '~/data/payrollStore'

const props = defineProps<{ runId: string }>()
const { t } = useLocale()

const data = computed(() => (runById(props.runId) ? claimsSummary(props.runId) : { rows: [], total: 0 }))
const staff = computed(() => data.value.rows.reduce((s, r) => s + r.employees, 0))
</script>

<template>
  <section class="pcl" data-tour="payroll-claims" data-testid="payroll-claims">
    <header class="pcl__head">
      <div class="pcl__title">{{ t('Claims') }}</div>
      <div class="pcl__sub">
        <template v-if="data.rows.length">{{ t('Reimbursements in this run') }} · {{ data.rows.length }} {{ t(data.rows.length === 1 ? 'line' : 'lines') }} · {{ rupiah(data.total) }}</template>
        <template v-else>{{ t('No reimbursements in this run') }}</template>
      </div>
    </header>
    <table v-if="data.rows.length" class="pcl__table">
      <thead>
        <tr>
          <th class="pcl__th">{{ t('Pay item') }}</th>
          <th class="pcl__th">{{ t('Account') }}</th>
          <th class="pcl__th">{{ t('Dimensions') }}</th>
          <th class="pcl__th pcl__num">{{ t('Staff') }}</th>
          <th class="pcl__th">{{ t('Journal') }}</th>
          <th class="pcl__th pcl__num">{{ t('Amount') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(r, i) in data.rows" :key="i">
          <td class="pcl__td">{{ r.item }}</td>
          <td class="pcl__td">{{ r.account }}</td>
          <td class="pcl__td">{{ r.tags || '-' }}</td>
          <td class="pcl__td pcl__num">{{ r.employees }}</td>
          <td class="pcl__td">{{ r.journal ?? t('Draft') }}<span v-if="r.version != null" class="pcl__muted"> · v{{ r.version }}</span></td>
          <td class="pcl__td pcl__num">{{ rupiah(r.amount) }}</td>
        </tr>
        <tr class="pcl__total">
          <td class="pcl__td" colspan="3">{{ t('Total') }}</td>
          <td class="pcl__td pcl__num">{{ staff }}</td>
          <td class="pcl__td" />
          <td class="pcl__td pcl__num">{{ rupiah(data.total) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.pcl { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.pcl__head { padding: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.pcl__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pcl__sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.pcl__table { width: 100%; border-collapse: collapse; }
.pcl__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase;
  color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-1) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.pcl__td { padding: var(--mp-spacing-2\.5) var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.pcl__num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pcl__muted { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }
.pcl__total .pcl__td { border-bottom: 0; font-weight: var(--mp-font-weights-semi-bold); }
</style>
