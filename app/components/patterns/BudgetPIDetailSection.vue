<script setup lang="ts">
/**
 * Budget section on a purchase invoice's detail page: the budget line each line
 * posted actual to, the PO it billed, Final invoice, and the over-budget flag
 * for a no-PO bill (Release 1 warn-only check).
 */
import { MpBanner, MpBannerIcon, MpBannerDescription } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { formatIDRWhole } from '~/utils/currency'
import { billByNumber, poById, lineById, lineTitle, overrunShort } from '~/data/budgetStore'

const props = defineProps<{ number: string }>()
const { t } = useLocale()
const fmt = formatIDRWhole

const bill = computed(() => billByNumber(props.number))
const po = computed(() => poById(bill.value?.poId ?? null))
const rows = computed(() => (bill.value?.lines ?? []).map((l, i) => {
  const bl = lineById(l.lineId)
  return { i, description: l.description, budgetLine: bl ? lineTitle(bl) : t('No budget line'), poLine: l.poLine, amount: l.amount }
}))
</script>

<template>
  <section v-if="bill" class="bpid-section" data-tour="pi-budget-section">
    <div class="bpid-head">
      <h3 class="bpid-heading">{{ t('Budget') }}</h3>
      <div class="bpid-meta">
        <span v-if="po">{{ t('Billed on') }} {{ po.number }}</span>
        <span v-else>{{ t('No purchase order') }}</span>
        <ErpStatusBadge v-if="bill.final" status="final" :label="t('Final invoice')" type="information" />
      </div>
    </div>
    <MpBanner v-if="bill.overBudget" id="bpid-overrun-banner" variant="warning" align-items="center">
      <MpBannerIcon id="bpid-overrun-banner-icon" />
      <MpBannerDescription>{{ t('Over budget by') }} {{ fmt(overrunShort(bill)) }}. {{ t('This bill is on the over-budget list.') }}</MpBannerDescription>
    </MpBanner>
    <table class="bpid-table">
      <thead>
        <tr>
          <th class="bpid-th">{{ t('Invoice line') }}</th>
          <th class="bpid-th">{{ t('Budget line') }}</th>
          <th v-if="po" class="bpid-th">{{ t('PO line') }}</th>
          <th class="bpid-th bpid-th--num">{{ t('Actual') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in rows" :key="r.i">
          <td class="bpid-td">{{ r.description }}</td>
          <td class="bpid-td">{{ r.budgetLine }}</td>
          <td v-if="po" class="bpid-td">{{ r.poLine !== null ? `${r.poLine + 1}. ${po.lines[r.poLine]?.description ?? ''}` : '-' }}</td>
          <td class="bpid-td bpid-td--num">{{ fmt(r.amount) }}</td>
        </tr>
      </tbody>
    </table>
  </section>
</template>

<style scoped>
.bpid-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); flex-shrink: 0; }
.bpid-head { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.bpid-heading { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bpid-meta { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.bpid-table { width: 100%; border-collapse: collapse; }
.bpid-th {
  height: var(--mp-sizes-7, 28px); text-align: left; white-space: nowrap;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase;
}
.bpid-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.bpid-td {
  height: var(--mp-sizes-10, 40px); padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.bpid-td--num { text-align: right; white-space: nowrap; padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4); }
</style>
