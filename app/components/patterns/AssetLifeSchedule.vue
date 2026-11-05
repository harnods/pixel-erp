<script setup lang="ts">
/**
 * AssetLifeSchedule: an asset's whole life, year by year, on both books.
 *
 * Used before commit on New asset (TS-04) and on the asset record (OD-45),
 * so the schedule a preparer approves is the one the record then shows. A
 * book with no schedule states why instead of showing zeros.
 */
import { formatIDRWhole } from '~/utils/currency'
import type { LifeSchedule } from '~/data/assetPreview'

defineProps<{ schedule: LifeSchedule; caption?: string }>()
const { t } = useLocale()
const money = (v: number | null) => (v === null ? '' : formatIDRWhole(v))
</script>

<template>
  <div class="als">
    <p v-if="caption" class="als__caption">{{ t(caption) }}</p>
    <table class="als__table">
      <thead>
        <tr>
          <th class="als__th">{{ t('Year') }}</th>
          <th class="als__th als__th--num">{{ t('Accounting charge') }}</th>
          <th class="als__th als__th--num">{{ t('Accounting book value') }}</th>
          <th class="als__th als__th--num">{{ t('Tax charge') }}</th>
          <th class="als__th als__th--num">{{ t('Tax book value') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="y in schedule.years" :key="y.year" class="als__tr" :class="{ 'als__tr--projected': y.state === 'projected' }">
          <td class="als__td">
            {{ y.year }}
            <span v-if="y.months && y.months < 12" class="als__sub">· {{ y.months }} {{ t(y.months === 1 ? 'month' : 'months') }}</span>
          </td>
          <td class="als__td als__td--num">
            <span v-if="y.accounting === null" class="als__absent">{{ t(schedule.accountingAbsent ?? 'No charge') }}</span>
            <template v-else>{{ money(y.accounting) }}</template>
          </td>
          <td class="als__td als__td--num">{{ money(y.accountingClosing) }}</td>
          <td class="als__td als__td--num">
            <span v-if="y.tax === null" class="als__absent">{{ t(schedule.taxAbsent ?? 'No charge') }}</span>
            <template v-else>{{ money(y.tax) }}</template>
          </td>
          <td class="als__td als__td--num">
            <span v-if="y.taxClosing === null" class="als__absent">{{ t(schedule.taxAbsent ?? 'Not computed') }}</span>
            <template v-else>{{ money(y.taxClosing) }}</template>
          </td>
        </tr>
        <tr class="als__tr als__tr--total">
          <td class="als__td">{{ t('Whole life') }}</td>
          <td class="als__td als__td--num">
            <span v-if="schedule.totals.accounting === null" class="als__absent">{{ t(schedule.accountingAbsent ?? 'No charge') }}</span>
            <template v-else>{{ money(schedule.totals.accounting) }}</template>
          </td>
          <td class="als__td" />
          <td class="als__td als__td--num">
            <span v-if="schedule.totals.tax === null" class="als__absent">{{ t(schedule.taxAbsent ?? 'No charge') }}</span>
            <template v-else>{{ money(schedule.totals.tax) }}</template>
          </td>
          <td class="als__td" />
        </tr>
      </tbody>
    </table>
  </div>
</template>

<style scoped>
.als__caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0 0 var(--mp-spacing-2); line-height: var(--mp-line-heights-sm); }
.als__table { width: 100%; border-collapse: collapse; }
.als__th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); background: var(--mp-background-neutral-subtle); white-space: nowrap; }
.als__th--num { text-align: right; }
.als__td { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); white-space: nowrap; }
.als__td--num { text-align: right; font-variant-numeric: tabular-nums; }
.als__tr--projected .als__td { color: var(--mp-text-secondary); }
.als__tr--total .als__td { font-weight: var(--mp-font-weights-semi-bold); border-bottom: none; }
.als__sub { color: var(--mp-text-secondary); }
.als__absent { color: var(--mp-text-secondary); }
</style>
