<script setup lang="ts">
/**
 * Budget on a purchase order raised from purchase requests: one compact line
 * per budget line (PRD FG-3, UX3). The PO uses what its request already holds
 * and is checked only on the excess (LR-3). Rupiah show only to roles allowed
 * to see budget amounts. The form blocks save while `check.result` is Block.
 */
import { MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription, MpIcon } from '@mekari/pixel3'
import { formatIDRWhole } from '~/utils/currency'
import { budget, canSeeBudgetAmounts, yearFigures, type POPreviewRow, type CheckResult } from '~/data/budgetStore'

const props = defineProps<{ rows: POPreviewRow[]; check: CheckResult; blocked: string | null }>()
const { t } = useLocale()
const router = useRouter()
const fmt = formatIDRWhole
const showAmounts = computed(() => canSeeBudgetAmounts(budget.viewAs))

/** One row per budget line, amounts combined. */
const lines = computed(() => {
  const map = new Map<string, { lineId: string | null; title: string; excess: number; held: number; result: POPreviewRow['result']; message: string }>()
  for (const r of props.rows) {
    const k = r.lineId ?? `none:${r.lineTitle}`
    const cur = map.get(k) ?? { lineId: r.lineId, title: r.lineTitle, excess: 0, held: 0, result: r.result, message: r.message }
    cur.excess += r.excess
    cur.held += r.held
    if (r.result === 'Block' || (r.result === 'Warn' && cur.result !== 'Block')) { cur.result = r.result; cur.message = r.message }
    map.set(k, cur)
  }
  return [...map.values()]
})

function view(l: (typeof lines.value)[number]) {
  const remaining = l.lineId ? yearFigures(l.lineId).available - l.excess : 0
  if (l.result === 'Block') return { tone: 'bad', icon: 'error', status: t('Not enough budget'), detail: showAmounts.value ? `${t('Short')} ${fmt(-remaining)}` : '' }
  if (l.result === 'Warn') return { tone: 'warn', icon: 'warning-circular', status: t('Over the month budget'), detail: showAmounts.value ? `${fmt(remaining)} ${t('remaining for the year')}` : '' }
  if (l.message === 'Not budget controlled') return { tone: 'muted', icon: 'info', status: t('Not budget controlled'), detail: '' }
  if (l.excess === 0) return { tone: 'ok', icon: 'done', status: t('Covered by the request'), detail: showAmounts.value ? `${fmt(l.held)} ${t('already held')}` : '' }
  return { tone: 'ok', icon: 'done', status: t('Within budget'), detail: showAmounts.value ? `${fmt(remaining)} ${t('remaining')}` : '' }
}
</script>

<template>
  <section class="bpo-section" data-tour="po-budget-section">
    <h3 class="bpo-heading">{{ t('Budget') }}</h3>

    <MpBanner v-if="blocked" id="po-budget-block-banner" variant="danger" align-items="center">
      <MpBannerIcon id="po-budget-block-banner-icon" />
      <MpBannerTitle>{{ t('This purchase order cannot be saved') }}</MpBannerTitle>
      <MpBannerDescription>{{ showAmounts ? blocked : t('Not enough budget on one of its lines.') }}</MpBannerDescription>
    </MpBanner>

    <ul class="bpo-list">
      <li v-for="(l, i) in lines" :key="i" class="bpo-row" :class="`bpo-row--${view(l).tone}`">
        <MpIcon :name="view(l).icon" size="sm" class="bpo-icon" />
        <span class="bpo-status">{{ view(l).status }}</span>
        <span v-if="view(l).detail" class="bpo-detail">· {{ view(l).detail }}</span>
        <span class="bpo-line">{{ l.title }}</span>
        <a v-if="l.lineId && showAmounts" class="bpo-link" @click="router.push(`/budget-lines/${l.lineId}`)">{{ t('View budget line') }}</a>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.bpo-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.bpo-heading { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bpo-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.bpo-row {
  display: flex; align-items: center; flex-wrap: wrap; gap: var(--mp-spacing-2);
  min-height: var(--mp-sizes-10, 40px); padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-colors-background-neutral, #fff);
}
.bpo-row--bad { border-color: var(--mp-colors-border-danger, #e2483d); background: var(--mp-colors-background-danger, #fdecee); }
.bpo-row--warn { border-color: var(--mp-colors-border-warning, #e46910); background: var(--mp-colors-background-warning, #fff4e5); }
.bpo-row--ok .bpo-icon { color: var(--mp-colors-icon-success, #1a8a50); }
.bpo-row--bad .bpo-icon { color: var(--mp-colors-icon-danger, #e2483d); }
.bpo-row--warn .bpo-icon { color: var(--mp-colors-icon-warning, #e46910); }
.bpo-status { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bpo-row--bad .bpo-status { color: var(--mp-text-danger, #e2483d); }
.bpo-detail { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.bpo-line { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bpo-link { margin-left: auto; font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-link, #165082); cursor: pointer; }
.bpo-link:hover { text-decoration: underline; text-underline-offset: 2px; }
</style>
