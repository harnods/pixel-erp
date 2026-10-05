<script setup lang="ts">
/**
 * BudgetCheckPanel — one compact line per budget line a transaction charges
 * (PRD FG-3, UX3): a status and, for roles allowed to see budget amounts, what
 * is left after this transaction. The full breakdown lives on the budget line.
 */
import { MpButton, MpIcon } from '@mekari/pixel3'
import type { PanelRow } from '~/data/budgetUiPurchaseRequests'
import { MONTH_NAMES } from '~/data/budgetMaster'
import { budget, canSeeBudgetAmounts } from '~/data/budgetStore'
import { formatIDRWhole } from '~/utils/currency'

const props = withDefaults(defineProps<{
  rows: PanelRow[]
  month: number
  /** 'after': remaining after this transaction (form, draft, pending). 'held': what it holds now. */
  mode?: 'after' | 'held'
  held?: Record<string, number>
  canRequestLine?: boolean
  /** Show Request funds on a short line. */
  canRequestFunds?: boolean
  /** Already submitted: a month warning no longer asks for a reason. */
  submitted?: boolean
}>(), { mode: 'after', held: () => ({}), canRequestLine: true, canRequestFunds: false, submitted: false })

const emit = defineEmits<{ (e: 'request-line', row: PanelRow): void; (e: 'request-funds', row: PanelRow): void }>()

const { t } = useLocale()
const router = useRouter()
const showAmounts = computed(() => canSeeBudgetAmounts(budget.viewAs))
const monthName = computed(() => MONTH_NAMES[props.month] ?? '')

type Tone = 'ok' | 'warn' | 'bad' | 'muted'
interface View { tone: Tone; icon: string; status: string; detail: string }

function view(r: PanelRow): View {
  const amt = showAmounts.value
  if (props.mode === 'held' && r.lineId) {
    const h = props.held[r.key] ?? 0
    return { tone: 'ok', icon: 'done', status: t('Held on budget'), detail: amt ? formatIDRWhole(h) : '' }
  }
  switch (r.state) {
    case 'ok':
      return { tone: 'ok', icon: 'done', status: t('Within budget'), detail: amt ? `${formatIDRWhole(r.afterYear ?? 0)} ${t('remaining')}` : '' }
    case 'warn':
      return { tone: 'warn', icon: 'warning-circular', status: `${t('Over the')} ${t(monthName.value)} ${t('budget')}`, detail: amt ? `${formatIDRWhole(r.afterYear ?? 0)} ${t('remaining for the year')}` : props.submitted ? '' : t('A reason is needed to submit') }
    case 'short':
      return { tone: 'bad', icon: 'error', status: t('Not enough budget'), detail: amt ? `${t('Short')} ${formatIDRWhole(r.yearShort)}` : '' }
    case 'no-line':
      return { tone: 'bad', icon: 'error', status: t('No budget line'), detail: '' }
    case 'not-controlled':
      return { tone: 'muted', icon: 'info', status: t('Not budget controlled'), detail: '' }
    case 'not-locked':
      return { tone: 'bad', icon: 'error', status: t('Budget not locked yet'), detail: '' }
    default:
      return { tone: 'bad', icon: 'error', status: t('Cannot be charged'), detail: t(r.message) }
  }
}
</script>

<template>
  <ul class="bcp">
    <li v-for="r in rows" :key="r.key" class="bcp__row" :class="`bcp__row--${view(r).tone}`">
      <MpIcon :name="view(r).icon" size="sm" class="bcp__icon" />
      <span class="bcp__status">{{ view(r).status }}</span>
      <span v-if="view(r).detail" class="bcp__detail">· {{ view(r).detail }}</span>
      <span class="bcp__line">{{ r.label }}</span>
      <span class="bcp__actions">
        <MpButton v-if="r.state === 'short' && mode === 'after' && canRequestFunds" is-rounded variant="secondary" data-tour="pr-request-funds" @click="emit('request-funds', r)">{{ t('Request funds') }}</MpButton>
        <MpButton v-if="r.state === 'no-line' && canRequestLine" is-rounded variant="secondary" @click="emit('request-line', r)">{{ t('Request a new line') }}</MpButton>
        <a v-if="r.lineId && showAmounts" class="bcp__link" @click="router.push(`/budget-lines/${r.lineId}`)">{{ t('View budget line') }}</a>
      </span>
    </li>
  </ul>
</template>

<style scoped>
.bcp { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.bcp__row {
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--mp-spacing-2);
  min-height: var(--mp-sizes-10, 40px); padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-colors-background-neutral, #fff);
}
.bcp__row--bad { border-color: var(--mp-colors-border-danger, #e2483d); background: var(--mp-colors-background-danger, #fdecee); }
.bcp__row--warn { border-color: var(--mp-colors-border-warning, #e46910); background: var(--mp-colors-background-warning, #fff4e5); }
.bcp__icon { flex-shrink: 0; }
.bcp__row--ok .bcp__icon { color: var(--mp-colors-icon-success, #1a8a50); }
.bcp__row--bad .bcp__icon { color: var(--mp-colors-icon-danger, #e2483d); }
.bcp__row--warn .bcp__icon { color: var(--mp-colors-icon-warning, #e46910); }
.bcp__status { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bcp__row--bad .bcp__status { color: var(--mp-text-danger, #e2483d); }
.bcp__detail { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.bcp__line { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bcp__actions { margin-left: auto; display: flex; align-items: center; gap: var(--mp-spacing-3); }
.bcp__link { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-link, #165082); cursor: pointer; }
.bcp__link:hover { text-decoration: underline; text-underline-offset: 2px; }
</style>
