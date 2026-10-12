<script setup lang="ts">
/**
 * Dry run (run page Actions): the journal this run would post on the current settings, with
 * dimensions, payables per party and every warning or hold. Labelled "Test, not posted";
 * it stores and posts nothing, and nothing depends on it.
 */
import { shallowRef, watch } from 'vue'
import { MpBadge } from '@mekari/pixel3'
import PayrollCompareDrawerShell from '~/components/payroll/PayrollCompareDrawerShell.vue'
import { dryRunJournal, runById, accountName, accountLabel, tagsLabel, dateLabel, periodLabel, rupiah, type DryRunResult } from '~/data/payrollStore'

const props = defineProps<{ isOpen: boolean; runId: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useLocale()

// Built when the drawer opens (a build draws ids; never in a computed).
const res = shallowRef<DryRunResult | null>(null)
watch(() => props.isOpen, (o) => { res.value = o ? dryRunJournal(props.runId) : null }, { immediate: true })
const run = () => runById(props.runId)
</script>

<template>
  <PayrollCompareDrawerShell :is-open="isOpen" :title="t('Dry run')" wide @close="emit('close')">
    <template v-if="res && run()">
      <div class="pdd__identity">
        <span>{{ t('Payroll') }} {{ periodLabel(run()!.start, run()!.end) }} · v{{ res.versionNo }} · {{ dateLabel(res.date) }}</span>
        <MpBadge variant="subtle" variant-color="orange" data-testid="pdd-label">{{ t(res.label) }}</MpBadge>
      </div>

      <div v-if="res.holds.length" class="pdd__note pdd__note--danger" data-testid="pdd-holds">
        <div class="pdd__notetitle">{{ t('Would not post') }}</div>
        <ul class="pdd__list"><li v-for="h in res.holds" :key="h.code + h.message">{{ h.message }}</li></ul>
      </div>

      <section v-if="res.lines.length" class="pdd__section">
        <div class="pdd__title">{{ t('Journal') }} · {{ res.lines.length }} {{ t('lines') }}</div>
        <div class="pdd__scroll">
          <table class="pdd__table">
            <thead>
              <tr>
                <th class="pdd__th">{{ t('Account') }}</th>
                <th class="pdd__th">{{ t('Dimensions') }}</th>
                <th class="pdd__th pdd__num">{{ t('Debit') }}</th>
                <th class="pdd__th pdd__num">{{ t('Credit') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(l, i) in res.lines" :key="i">
                <td class="pdd__td">{{ accountLabel(l.account) }}</td>
                <td class="pdd__td">{{ tagsLabel(l.tags) || '-' }}</td>
                <td class="pdd__td pdd__num">{{ l.debit ? rupiah(l.debit) : '' }}</td>
                <td class="pdd__td pdd__num">{{ l.credit ? rupiah(l.credit) : '' }}</td>
              </tr>
              <tr class="pdd__total">
                <td class="pdd__td" colspan="2">{{ t('Total') }}</td>
                <td class="pdd__td pdd__num">{{ rupiah(res.total) }}</td>
                <td class="pdd__td pdd__num">{{ rupiah(res.total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="res.payables.length" class="pdd__section" data-testid="pdd-payables">
        <div class="pdd__title">{{ t('Payables') }}</div>
        <div class="pdd__scroll">
          <table class="pdd__table">
            <thead>
              <tr>
                <th class="pdd__th">{{ t('Party') }}</th>
                <th class="pdd__th">{{ t('Account') }}</th>
                <th class="pdd__th pdd__num">{{ t('Owed') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in res.payables" :key="p.account">
                <td class="pdd__td">{{ p.party === 'Other' ? accountName(p.account).replace(/ Payable$/, '') : t(p.party) }}</td>
                <td class="pdd__td">{{ accountLabel(p.account) }}</td>
                <td class="pdd__td pdd__num">{{ rupiah(p.amount) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <div v-if="res.warnings.length" class="pdd__note" data-testid="pdd-warnings">
        <div class="pdd__notetitle">{{ res.warnings.length }} {{ t(res.warnings.length === 1 ? 'warning' : 'warnings') }}</div>
        <ul class="pdd__list"><li v-for="w in res.warnings" :key="w">{{ w }}</li></ul>
      </div>
    </template>

    <template #footer>
      <button class="btn-enterprise btn-enterprise--primary" type="button" @click="emit('close')">{{ t('Close') }}</button>
    </template>
  </PayrollCompareDrawerShell>
</template>

<style scoped>
.pdd__identity { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pdd__section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.pdd__title { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; }
.pdd__scroll { overflow-x: auto; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.pdd__table { width: 100%; border-collapse: collapse; }
.pdd__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase;
  color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pdd__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.pdd__table tbody tr:last-child .pdd__td { border-bottom: 0; }
.pdd__num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.pdd__total .pdd__td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-neutral-subtle); }
.pdd__note {
  padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-colors-background-warning);
  border-radius: var(--mp-radii-md); color: var(--mp-colors-text-warning); font-size: var(--mp-font-sizes-md);
}
.pdd__note--danger { background: var(--mp-colors-background-danger); color: var(--mp-text-danger); }
.pdd__notetitle { font-weight: var(--mp-font-weights-semi-bold); margin-bottom: var(--mp-spacing-1); }
.pdd__list { margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); }
</style>
