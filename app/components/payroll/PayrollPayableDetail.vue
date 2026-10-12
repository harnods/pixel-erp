<script setup lang="ts">
/**
 * One payable row opened (OD-18): what is owed (the journal lines behind it, by dimension, plus
 * any repost still waiting), what the bank paid (bank reconciliation matches), and the checks
 * on the row. No employee names.
 */
import { MpBadge } from '@mekari/pixel3'
import PayrollPayDrawer from '~/components/payroll/PayrollPayDrawer.vue'
import { rupiah, accountLabel, monthLabel, dateLabel, type PayableRow } from '~/data/payrollStore'
import { payableDrill } from '~/data/payrollUiPayables'
import { matchedPayments, FLAG_CHIP } from '~/data/payrollUiPay'

const props = defineProps<{ isOpen: boolean; row: PayableRow | null }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void }>()
const { t } = useLocale()

const owed = computed(() => (props.row ? payableDrill(props.row).owed : []))
const paid = computed(() => (props.row ? matchedPayments(props.row) : []))
const pendingChange = computed(() => (props.row?.pendingOwed != null ? props.row.pendingOwed - props.row.owed : null))
</script>

<template>
  <PayrollPayDrawer :is-open="isOpen" :title="row ? row.label : ''" wide @update:is-open="(v: boolean) => emit('update:isOpen', v)">
    <template v-if="row">
      <dl class="ppx-facts">
        <div><dt>{{ t('Payable') }}</dt><dd>{{ accountLabel(row.account) }}</dd></div>
        <div><dt>{{ t('Period') }}</dt><dd>{{ monthLabel(row.month) }}</dd></div>
        <div><dt>{{ t('Due') }}</dt><dd>{{ row.dueLabel }}</dd></div>
        <div><dt>{{ t('Owed') }}</dt><dd class="ppx-num">{{ rupiah(row.owed) }}</dd></div>
        <div><dt>{{ t('Paid') }}</dt><dd class="ppx-num">{{ rupiah(row.paid) }}</dd></div>
        <div><dt>{{ t('Balance') }}</dt><dd class="ppx-num">{{ rupiah(row.balance) }}</dd></div>
      </dl>

      <section v-if="row.flags.length" class="ppx-section">
        <h3 class="ppx-h">{{ t('Checks') }}</h3>
        <div v-for="f in row.flags" :key="f.code + f.message" class="ppx-check">
          <MpBadge for="tableStatus" :type="f.code === 'manual-journal' ? 'warning' : 'critical'">{{ t(FLAG_CHIP[f.code]) }}</MpBadge>
          <span>{{ f.message }}</span>
        </div>
      </section>

      <section class="ppx-section">
        <h3 class="ppx-h">{{ t('Paid: bank reconciliation matches') }}</h3>
        <table class="ppx-table">
          <thead><tr><th>{{ t('Journal') }}</th><th>{{ t('Date') }}</th><th>{{ t('Bank') }}</th><th>{{ t('Bank statement line') }}</th><th class="ppx-r">{{ t('Amount') }}</th></tr></thead>
          <tbody>
            <tr v-for="p in paid" :key="p.id">
              <td>{{ p.number }}</td><td>{{ dateLabel(p.date) }}</td><td>{{ p.bank }}</td><td>{{ p.statement }}</td><td class="ppx-r">{{ rupiah(p.amount) }}</td>
            </tr>
            <tr v-if="!paid.length"><td colspan="5" class="ppx-empty">{{ t('No bank match yet') }}</td></tr>
          </tbody>
        </table>
      </section>

      <section class="ppx-section">
        <h3 class="ppx-h">{{ t('Owed: journal lines by dimension') }}</h3>
        <table class="ppx-table">
          <thead><tr><th>{{ t('Journal') }}</th><th>{{ t('Type') }}</th><th>{{ t('Date') }}</th><th>{{ t('Dimensions') }}</th><th class="ppx-r">{{ t('Amount') }}</th></tr></thead>
          <tbody>
            <tr v-for="(l, i) in owed" :key="i">
              <td><NuxtLink v-if="l.runId" class="ppx-link" :to="`/payroll-runs/${l.runId}`">{{ l.number }}</NuxtLink><span v-else>{{ l.number }}</span></td>
              <td>{{ t(l.type) }}</td><td>{{ l.date }}</td><td>{{ l.tags }}</td><td class="ppx-r">{{ rupiah(l.amount) }}</td>
            </tr>
            <tr v-if="pendingChange != null" class="ppx-pending">
              <td>{{ t('Repost') }}</td><td>{{ t('Not posted') }}</td><td>-</td><td>{{ t('Waiting for reverse and repost') }}</td><td class="ppx-r">{{ rupiah(pendingChange) }}</td>
            </tr>
            <tr v-if="!owed.length && pendingChange == null"><td colspan="5" class="ppx-empty">{{ t('No journal lines') }}</td></tr>
          </tbody>
        </table>
        <p v-if="row.pendingOwed != null" class="ppx-sub">{{ t('Owed after the repost') }}: {{ rupiah(row.pendingOwed) }}</p>
      </section>
    </template>
  </PayrollPayDrawer>
</template>

<style scoped>
.ppx-facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--mp-spacing-3) var(--mp-spacing-4); margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-4); border: 1px solid var(--mp-colors-border-default); border-radius: var(--mp-radii-md); }
.ppx-facts dt { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.ppx-facts dd { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.ppx-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ppx-h { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.ppx-check { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default); }
.ppx-table { width: 100%; border-collapse: collapse; border: 1px solid var(--mp-colors-border-default); border-radius: var(--mp-radii-md); }
.ppx-table th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-secondary); background: var(--mp-colors-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-colors-border-default); }
.ppx-table td { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-colors-border-default); vertical-align: top; }
.ppx-table .ppx-r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ppx-pending td { color: var(--mp-colors-text-secondary); }
.ppx-num { font-variant-numeric: tabular-nums; }
.ppx-sub { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.ppx-empty { color: var(--mp-colors-text-secondary); text-align: center; }
.ppx-link { color: var(--mp-colors-text-link, var(--mp-text-link)); text-decoration: none; }
</style>
