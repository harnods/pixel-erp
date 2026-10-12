<script setup lang="ts">
/**
 * PAY journals of a run (TS-05): number, type, date, tax month, memo, totals,
 * who posted and when, and the reversal link. Lines open per journal. Posted
 * journals are read-only here (LR-8); corrections live in the revision panel.
 */
import { computed, ref } from 'vue'
import { runJournals } from '~/data/payrollUiIntake'
import { accountLabel, tagsLabel, rupiah, wib, dateLabel, monthLabel, journalById } from '~/data/payrollStore'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'

const props = withDefaults(defineProps<{ runId: string; onlyLive?: boolean }>(), { onlyLive: false })
const { t } = useLocale()
const list = computed(() => runJournals(props.runId).filter((j) => !props.onlyLive || j.live))
const open = ref<string | null>(props.onlyLive ? (list.value[0]?.id ?? null) : null)
const state = (j: (typeof list.value)[number]) => j.reversesId ? 'Reversal' : j.reversedById ? 'Reversed' : 'Posted'
</script>

<template>
  <div class="prj">
    <div v-if="!list.length" class="prj__card prj__empty">{{ t('No journal posted for this run yet.') }}</div>
    <div v-for="j in list" :key="j.id" class="prj__card" :data-journal="j.number" data-tour="payroll-journal">
      <div class="prj__head" data-tour="payroll-journal-head" @click="open = open === j.id ? null : j.id">
        <div class="prj__headleft">
          <div class="prj__titlerow">
            <span class="prj__number">{{ j.number }}</span>
            <span class="prj__muted">{{ t(j.type) }}<template v-if="j.versionNo"> · v{{ j.versionNo }}</template></span>
            <ErpStatusBadge :status="state(j)" :label="t(state(j))" :type="state(j) === 'Posted' ? 'completed' : 'announcement'" />
          </div>
          <div class="prj__memo">{{ j.memo }}</div>
          <div class="prj__muted">
            {{ t('Date') }} {{ dateLabel(j.date) }} · {{ t('tax month') }} {{ monthLabel(j.taxMonth) }}<template v-if="j.reference"> · {{ t('ref') }} {{ j.reference }}</template>
            · {{ t('posted by') }} {{ j.postedBy }} {{ wib(j.postedAt) }}
            <template v-if="j.reversedById"> · {{ t('reversed by') }} {{ journalById(j.reversedById)?.number }}</template>
            <template v-if="j.reversesId"> · {{ t('reverses') }} {{ journalById(j.reversesId)?.number }}</template>
            <template v-if="j.snapshotId"> · {{ t('built with') }} {{ j.snapshotId }}</template>
          </div>
        </div>
        <div class="prj__total">{{ rupiah(j.debit) }}</div>
      </div>
      <table v-if="open === j.id" class="prj__table">
        <thead><tr><th class="prj__th">{{ t('Account') }}</th><th class="prj__th">{{ t('Dimensions') }}</th><th class="prj__th prj__num">{{ t('Debit') }}</th><th class="prj__th prj__num">{{ t('Credit') }}</th></tr></thead>
        <tbody>
          <tr v-for="(l, i) in j.lines" :key="i">
            <td class="prj__td">{{ accountLabel(l.account) }}</td>
            <td class="prj__td">{{ tagsLabel(l.tags) }}</td>
            <td class="prj__td prj__num">{{ l.debit ? rupiah(l.debit) : '' }}</td>
            <td class="prj__td prj__num">{{ l.credit ? rupiah(l.credit) : '' }}</td>
          </tr>
          <tr>
            <td class="prj__td prj__strong" colspan="2">{{ t('Total') }}</td>
            <td class="prj__td prj__num prj__strong">{{ rupiah(j.debit) }}</td>
            <td class="prj__td prj__num prj__strong">{{ rupiah(j.credit) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.prj { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.prj__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.prj__empty { padding: var(--mp-spacing-4); color: var(--mp-text-secondary); }
.prj__head { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); cursor: pointer; }
.prj__head:hover { background: var(--mp-background-neutral-hovered); }
.prj__headleft { min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.prj__titlerow { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.prj__number { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-link); }
.prj__memo { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow-wrap: anywhere; }
.prj__total { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); white-space: nowrap; font-variant-numeric: tabular-nums; }
.prj__table { width: 100%; border-collapse: collapse; border-top: 1px solid var(--mp-border-default); }
.prj__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase;
  color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-1) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default);
}
.prj__td { padding: var(--mp-spacing-2) var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); }
.prj__num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.prj__strong { font-weight: var(--mp-font-weights-semi-bold); }
.prj__muted { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }
</style>
