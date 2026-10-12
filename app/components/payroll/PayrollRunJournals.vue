<script setup lang="ts">
/**
 * Payroll journals of a run: number, type, journal date, tax month, memo, total, who posted
 * and when, and the reversal link. Lines open per journal. Posted journals are read-only; the
 * one way to change them is Reverse (every posted journal of the run together) or, when Talenta
 * sends the period again, Use vN and repost.
 */
import { computed, ref } from 'vue'
import { MpButton } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import PayrollReverseDrawer from '~/components/payroll/PayrollReverseDrawer.vue'
import { runJournals } from '~/data/payrollUiIntake'
import { can, liveJournals, accountLabel, tagsLabel, rupiah, wib, dateLabel, monthLabel, journalById } from '~/data/payrollStore'

const props = withDefaults(defineProps<{ runId: string; onlyLive?: boolean }>(), { onlyLive: false })
const { t } = useLocale()
const list = computed(() => runJournals(props.runId).filter((j) => !props.onlyLive || j.live))
const live = computed(() => liveJournals(props.runId))
const open = ref<string | null>(props.onlyLive ? (list.value[0]?.id ?? null) : null)
const state = (j: (typeof list.value)[number]) => j.reversesId ? 'Reversal' : j.reversedById ? 'Reversed' : 'Posted'
const reverseOpen = ref(false)
</script>

<template>
  <div class="prj" :data-tour="onlyLive ? undefined : 'payroll-run-journals'">
    <div v-if="!onlyLive" class="prj__bar">
      <div>
        <div class="prj__bartitle">{{ t('Payroll journals') }}</div>
        <div class="prj__barsub">{{ live.length ? t(`${live.length} posted. Posted journals change only by reversing them.`) : t('No posted journal') }}</div>
      </div>
      <MpButton v-if="can('correct') && live.length" variant="secondary" is-rounded data-testid="prp-reverse" @click="reverseOpen = true">
        {{ live.length > 1 ? t(`Reverse ${live.length} journals`) : t('Reverse journal') }}
      </MpButton>
    </div>
    <div v-if="!list.length" class="prj__card prj__empty">{{ t('No posted journal yet. Post the draft journal from Draft review.') }}</div>
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
            {{ t('Journal date') }} {{ dateLabel(j.date) }} · {{ t('tax month') }} {{ monthLabel(j.taxMonth) }}
            · {{ t('posted by') }} {{ j.postedBy }} {{ wib(j.postedAt) }}
            <template v-if="j.reversedById"> · {{ t('reversed by') }} {{ journalById(j.reversedById)?.number }}</template>
            <template v-if="j.reversesId"> · {{ t('reverses') }} {{ journalById(j.reversesId)?.number }}</template>
          </div>
        </div>
        <div class="prj__total">{{ rupiah(j.debit) }}</div>
      </div>
      <table v-if="open === j.id" class="prj__table">
        <thead><tr><th class="prj__th">{{ t('Account') }}</th><th class="prj__th">{{ t('Dimensions') }}</th><th class="prj__th prj__num">{{ t('Debit') }}</th><th class="prj__th prj__num">{{ t('Credit') }}</th></tr></thead>
        <tbody>
          <tr v-for="(l, i) in j.lines" :key="i">
            <td class="prj__td">{{ accountLabel(l.account) }}</td>
            <td class="prj__td">{{ tagsLabel(l.tags) || '-' }}</td>
            <td class="prj__td prj__num">{{ l.debit ? rupiah(l.debit) : '' }}</td>
            <td class="prj__td prj__num">{{ l.credit ? rupiah(l.credit) : '' }}</td>
          </tr>
          <tr class="prj__totalrow">
            <td class="prj__td prj__strong" colspan="2">{{ t('Total') }}</td>
            <td class="prj__td prj__num prj__strong">{{ rupiah(j.debit) }}</td>
            <td class="prj__td prj__num prj__strong">{{ rupiah(j.credit) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <PayrollReverseDrawer v-if="!onlyLive" :is-open="reverseOpen" :run-id="runId" @close="reverseOpen = false" />
  </div>
</template>

<style scoped>
.prj { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.prj__bar { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); }
.prj__bartitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.prj__barsub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
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
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; white-space: nowrap;
  color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default);
}
.prj__td { padding: var(--mp-spacing-2\.5) var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.prj__th.prj__num, .prj__num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.prj__strong { font-weight: var(--mp-font-weights-semi-bold); }
.prj__totalrow .prj__td { border-bottom: 0; }
.prj__muted { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }
</style>
