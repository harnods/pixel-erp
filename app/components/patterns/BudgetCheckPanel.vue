<script setup lang="ts">
/**
 * BudgetCheckPanel — the budget figures for each budget line a purchase request
 * charges (PRD FG-3, UX3). One block per line: Budget, Reserved, Committed,
 * Actual, Pending and Available for the year and the request month, then this
 * request and what is left after it. Turns red when the line is short.
 */
import { MpButton } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import type { PanelRow } from '~/data/budgetUiPurchaseRequests'
import { MONTH_NAMES } from '~/data/budgetMaster'
import { BUDGET_YEAR } from '~/data/budgetStore'
import { formatIDRWhole } from '~/utils/currency'

const props = withDefaults(defineProps<{
  rows: PanelRow[]
  month: number
  /** 'after': show "After this request" (form, draft, pending). 'held': show what the request holds now. */
  mode?: 'after' | 'held'
  /** Held amount per row key, for mode 'held'. */
  held?: Record<string, number>
  /** Show "Request a new line" on a mix with no budget line. */
  canRequestLine?: boolean
}>(), { mode: 'after', held: () => ({}), canRequestLine: true })

const emit = defineEmits<{ (e: 'request-line', row: PanelRow): void }>()

const { t } = useLocale()
const monthLabel = computed(() => MONTH_NAMES[props.month] ?? '')

const STATE_BADGE: Record<string, { label: string; type: 'completed' | 'warning' | 'critical' | 'announcement' }> = {
  'ok': { label: 'Within budget', type: 'completed' },
  'warn': { label: 'Over month budget', type: 'warning' },
  'short': { label: 'Not enough budget', type: 'critical' },
  'not-controlled': { label: 'Not budget controlled', type: 'announcement' },
  'no-line': { label: 'No budget line', type: 'critical' },
  'not-locked': { label: 'Budget not locked', type: 'critical' },
  'blocked': { label: 'Cannot be charged', type: 'critical' },
}

function figureRows(r: PanelRow) {
  if (!r.year || !r.month) return []
  const y = r.year, m = r.month
  return [
    { key: 'budget', label: t('Budget'), y: y.budget, m: m.budget },
    { key: 'reserved', label: t('Reserved'), y: y.reserved, m: m.reserved },
    { key: 'committed', label: t('Committed'), y: y.committed, m: m.committed },
    { key: 'actual', label: t('Actual'), y: y.actual, m: m.actual },
    ...(y.held ? [{ key: 'held', label: t('Held for transfers'), y: y.held, m: m.held }] : []),
    { key: 'pending', label: t('Pending'), y: y.pending, m: m.pending },
    { key: 'available', label: t('Available'), y: y.available, m: m.available },
  ]
}
function shortText(r: PanelRow): string {
  if (r.state === 'short' && r.yearShort > 0) return `${t('Short')} ${formatIDRWhole(r.yearShort)} ${t('for the year')}.`
  if (r.state === 'short' || r.state === 'warn') {
    if (r.monthShort > 0) return `${t('Over the')} ${t(monthLabel.value)} ${t('budget by')} ${formatIDRWhole(r.monthShort)}.`
  }
  return ''
}
</script>

<template>
  <div class="bcp">
    <div
      v-for="r in rows" :key="r.key"
      class="bcp__line"
      :class="{ 'bcp__line--short': mode === 'after' && (r.state === 'short' || r.state === 'no-line' || r.state === 'not-locked' || r.state === 'blocked'), 'bcp__line--warn': mode === 'after' && r.state === 'warn' }"
    >
      <div class="bcp__head">
        <span class="bcp__title">{{ r.label }}</span>
        <ErpStatusBadge v-if="mode === 'after' || !r.year" status="budget" :label="t(STATE_BADGE[r.state]!.label)" :type="STATE_BADGE[r.state]!.type" />
      </div>

      <template v-if="r.year && r.month">
        <table class="bcp__table">
          <thead>
            <tr>
              <th class="bcp__th" />
              <th class="bcp__th bcp__th--num">{{ t('Year') }} {{ BUDGET_YEAR }}</th>
              <th class="bcp__th bcp__th--num">{{ t(monthLabel) }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in figureRows(r)" :key="f.key" :class="{ 'bcp__tr--total': f.key === 'available' }">
              <td class="bcp__td">{{ f.label }}</td>
              <td class="bcp__td bcp__td--num">{{ formatIDRWhole(f.y) }}</td>
              <td class="bcp__td bcp__td--num">{{ formatIDRWhole(f.m) }}</td>
            </tr>
            <template v-if="mode === 'after'">
              <tr>
                <td class="bcp__td">{{ t('This request') }}</td>
                <td class="bcp__td bcp__td--num">{{ formatIDRWhole(r.amount) }}</td>
                <td class="bcp__td bcp__td--num">{{ formatIDRWhole(r.amount) }}</td>
              </tr>
              <tr class="bcp__tr--after">
                <td class="bcp__td">{{ t('After this request') }}</td>
                <td class="bcp__td bcp__td--num" :class="{ 'bcp__neg': (r.afterYear ?? 0) < 0 }">{{ formatIDRWhole(r.afterYear ?? 0) }}</td>
                <td class="bcp__td bcp__td--num" :class="{ 'bcp__neg': (r.afterMonth ?? 0) < 0 }">{{ formatIDRWhole(r.afterMonth ?? 0) }}</td>
              </tr>
            </template>
            <tr v-else class="bcp__tr--after">
              <td class="bcp__td">{{ t('Held by this request') }}</td>
              <td class="bcp__td bcp__td--num">{{ formatIDRWhole(held[r.key] ?? 0) }}</td>
              <td class="bcp__td bcp__td--num" />
            </tr>
          </tbody>
        </table>
        <p v-if="mode === 'after' && shortText(r)" class="bcp__msg" :class="{ 'bcp__msg--warn': r.state === 'warn' }">{{ shortText(r) }}</p>
      </template>

      <p v-else-if="r.state === 'not-controlled'" class="bcp__note">{{ t('This account runs no budget check.') }}</p>
      <div v-else-if="r.state === 'no-line'" class="bcp__noline">
        <p class="bcp__msg">{{ t('No budget line for this department, project and account.') }}</p>
        <MpButton is-rounded v-if="canRequestLine" variant="secondary" @click="emit('request-line', r)">{{ t('Request a new line') }}</MpButton>
      </div>
      <p v-else class="bcp__msg">{{ t(r.message) }}</p>
    </div>
  </div>
</template>

<style scoped>
.bcp { display: grid; grid-template-columns: repeat(auto-fill, minmax(340px, 1fr)); gap: var(--mp-spacing-4); }
.bcp__line {
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-colors-background-neutral, #fff);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
}
.bcp__line--short { border-color: var(--mp-colors-border-danger, #e2483d); background: var(--mp-colors-background-danger, #fdecee); }
.bcp__line--warn { border-color: var(--mp-colors-border-warning, #e46910); }
.bcp__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); }
.bcp__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bcp__table { width: 100%; border-collapse: collapse; }
.bcp__th {
  text-align: left; padding: var(--mp-spacing-1) 0;
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default);
}
.bcp__th--num, .bcp__td--num { text-align: right; white-space: nowrap; padding-left: var(--mp-spacing-3); }
.bcp__td { padding: var(--mp-spacing-1) 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.bcp__tr--total .bcp__td { font-weight: var(--mp-font-weights-semi-bold); border-top: 1px solid var(--mp-border-default); }
.bcp__tr--after .bcp__td { font-weight: var(--mp-font-weights-semi-bold); border-top: 1px dashed var(--mp-border-default); }
.bcp__neg { color: var(--mp-text-danger, #e2483d); }
.bcp__msg { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-danger, #e2483d); }
.bcp__msg--warn { color: var(--mp-colors-text-warning, #e46910); }
.bcp__note { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.bcp__noline { display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-2); }
</style>
