<script setup lang="ts">
/**
 * SubconCostSummaryPanel — what the run was meant to cost, what it has cost, and
 * how much value is sitting at the vendor right now.
 *
 * Plan and actual legitimately diverge, and the gap is the point of showing both.
 * Reducing a component's planned quantity after part of it has already gone to the
 * vendor changes the plan and posts nothing (that is the adjustment rule); the
 * materials already issued stay in WIP regardless. A variance here is information,
 * not an error, so it is stated plainly rather than flagged red.
 */
import { formatIDR } from '~/utils/currency'
import type { SubconCostSummary } from '~/data/subconAccounting'

const props = defineProps<{
  summary: SubconCostSummary
  /** Value currently in the vendor's hands. */
  wipBalance: number
  plannedQty: number
}>()

const { t } = useLocale()

const rows = computed(() => [
  { label: t('Material'), planned: props.summary.plannedMaterial, actual: props.summary.actualMaterial },
  { label: t('Subcon'),   planned: props.summary.plannedSubcon,   actual: props.summary.actualSubcon },
])

const variance = computed(() => props.summary.actualTotal - props.summary.plannedTotal)

const idr = (n: number) => formatIDR(Math.round(n))
</script>

<template>
  <div class="scs">
    <!-- The one figure that is not a comparison: money physically elsewhere. -->
    <div class="scs-wip">
      <span class="scs-wip__label">{{ t('Value at vendor') }}</span>
      <span class="scs-wip__value">{{ idr(wipBalance) }}</span>
      <span class="scs-wip__hint">{{ t('Materials and subcon cost in the vendor’s hands, not yet received back') }}</span>
    </div>

    <table class="scs-table">
      <thead>
        <tr>
          <th class="scs-th" />
          <th class="scs-th scs-th--num">{{ t('Planned') }}</th>
          <th class="scs-th scs-th--num">{{ t('Actual') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="row.label" class="scs-tr">
          <td class="scs-td">{{ row.label }}</td>
          <td class="scs-td scs-td--num">{{ idr(row.planned) }}</td>
          <td class="scs-td scs-td--num">{{ idr(row.actual) }}</td>
        </tr>
        <tr class="scs-tr scs-tr--total">
          <td class="scs-td">{{ t('Total') }}</td>
          <td class="scs-td scs-td--num">{{ idr(summary.plannedTotal) }}</td>
          <td class="scs-td scs-td--num">{{ idr(summary.actualTotal) }}</td>
        </tr>
        <tr class="scs-tr">
          <td class="scs-td">
            {{ t('Cost per unit') }}
            <span class="scs-qty">{{ summary.receivedQty > 0
              ? `${summary.receivedQty.toLocaleString('id-ID')} ${t('received')}`
              : `${plannedQty.toLocaleString('id-ID')} ${t('planned')}` }}</span>
          </td>
          <td class="scs-td scs-td--num">{{ idr(summary.plannedPerUnit) }}</td>
          <td class="scs-td scs-td--num">{{ idr(summary.actualPerUnit) }}</td>
        </tr>
      </tbody>
    </table>

    <p v-if="variance !== 0" class="scs-variance">
      {{ variance > 0 ? t('Running over plan by') : t('Running under plan by') }}
      <strong>{{ idr(Math.abs(variance)) }}</strong>
    </p>
  </div>
</template>

<style scoped>
.scs { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }

.scs-wip { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.scs-wip__label {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.scs-wip__value {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  font-variant-numeric: tabular-nums;
}
.scs-wip__hint {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}

.scs-table { width: 100%; border-collapse: collapse; }
.scs-th {
  text-align: left;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default);
}
.scs-th--num { text-align: right; }
.scs-td {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default));
}
.scs-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.scs-tr--total .scs-td { font-weight: var(--mp-font-weights-semi-bold); }
.scs-qty {
  display: block;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}

.scs-variance {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
</style>
