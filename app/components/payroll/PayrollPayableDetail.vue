<script setup lang="ts">
/**
 * One payable row opened: what is owed (the journal lines behind it, by dimension, plus any
 * repost still waiting), what the bank paid (bank reconciliation matches), and the flags on the
 * row. No employee names.
 */
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import PayrollPayDrawer from '~/components/payroll/PayrollPayDrawer.vue'
import { MpButton } from '@mekari/pixel3'
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
        <div><dt>{{ t('Account') }}</dt><dd>{{ accountLabel(row.account) }}</dd></div>
        <div><dt>{{ t('Period') }}</dt><dd>{{ monthLabel(row.month) }}</dd></div>
        <div><dt>{{ t('Due date') }}</dt><dd>{{ row.dueLabel }}</dd></div>
        <div><dt>{{ t('Owed') }}</dt><dd class="ppx-num">{{ rupiah(row.owed) }}</dd></div>
        <div><dt>{{ t('Paid') }}</dt><dd class="ppx-num">{{ rupiah(row.paid) }}</dd></div>
        <div><dt>{{ t('Balance') }}</dt><dd class="ppx-num">{{ rupiah(row.balance) }}</dd></div>
      </dl>
      <div v-if="row.balance > 0" class="ppx-pay">
        <span class="ppx-sub">{{ t('Pay opens New spend money with this payable filled in.') }}</span>
        <MpButton is-rounded data-testid="ppx-pay" @click="navigateTo({ path: '/bank-withdrawals/new', query: { payable: row.key } })">{{ t('Pay') }}</MpButton>
      </div>

      <section v-if="row.flags.length" class="ppx-section">
        <h3 class="ppx-h">{{ t('Flags') }}</h3>
        <div v-for="f in row.flags" :key="f.code + f.message" class="ppx-check">
          <ErpStatusBadge :status="f.code" :label="t(FLAG_CHIP[f.code])" :type="f.code === 'manual-journal' ? 'warning' : 'critical'" />
          <span>{{ f.message }}</span>
        </div>
      </section>

      <section class="ppx-section">
        <h3 class="ppx-h">{{ t('Payments') }}</h3>
        <table class="ppx-table ppx-table--fixed">
          <colgroup><col class="ppx-c-num"><col class="ppx-c-date"><col><col><col class="ppx-c-amt"></colgroup>
          <thead><tr><th>{{ t('Journal') }}</th><th>{{ t('Date') }}</th><th>{{ t('Bank account') }}</th><th>{{ t('Source') }}</th><th class="ppx-r">{{ t('Amount') }}</th></tr></thead>
          <tbody>
            <tr v-for="p in paid" :key="p.id">
              <td><NuxtLink v-if="p.cashTxId" class="ppx-link" :to="`/bank-withdrawals/${p.cashTxId}`">{{ p.number }}</NuxtLink><span v-else>{{ p.number }}</span></td><td>{{ dateLabel(p.date) }}</td><td>{{ p.bank }}</td><td>{{ p.cashTxId ? t('Spend money') : t('Bank reconciliation') }}<span v-if="!p.cashTxId && p.statement" class="ppx-sub"> · {{ p.statement }}</span></td><td class="ppx-r">{{ rupiah(p.amount) }}</td>
            </tr>
            <tr v-if="!paid.length"><td colspan="5" class="ppx-empty">{{ t('Not paid yet. Pay it here, or match the bank payment in bank reconciliation.') }}</td></tr>
          </tbody>
        </table>
      </section>

      <section class="ppx-section">
        <h3 class="ppx-h">{{ t('Owed, by dimension') }}</h3>
        <table class="ppx-table ppx-table--fixed">
          <colgroup><col class="ppx-c-num"><col class="ppx-c-date"><col class="ppx-c-date"><col><col class="ppx-c-amt"></colgroup>
          <thead><tr><th>{{ t('Journal') }}</th><th>{{ t('Type') }}</th><th>{{ t('Date') }}</th><th>{{ t('Dimensions') }}</th><th class="ppx-r">{{ t('Amount') }}</th></tr></thead>
          <tbody>
            <tr v-for="(l, i) in owed" :key="i">
              <td><NuxtLink v-if="l.runId" class="ppx-link" :to="`/payroll-runs/${l.runId}`">{{ l.number }}</NuxtLink><span v-else>{{ l.number }}</span></td>
              <td>{{ t(l.type) }}</td><td>{{ l.date }}</td><td>{{ l.tags }}</td><td class="ppx-r">{{ rupiah(l.amount) }}</td>
            </tr>
            <tr v-if="pendingChange != null" class="ppx-pending">
              <td>{{ t('Not posted yet') }}</td><td>{{ t('Draft journal') }}</td><td>-</td><td>{{ t('Waiting for repost') }}</td><td class="ppx-r">{{ rupiah(pendingChange) }}</td>
            </tr>
            <tr v-if="!owed.length && pendingChange == null"><td colspan="5" class="ppx-empty">{{ t('No posted journal yet') }}</td></tr>
          </tbody>
        </table>
        <p v-if="row.pendingOwed != null" class="ppx-sub">{{ t('Owed after repost') }}: {{ rupiah(row.pendingOwed) }}</p>
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
/* Fixed layout: an empty-state row (colspan) no longer stretches the first column and floats its header. */
.ppx-table--fixed { table-layout: fixed; }
.ppx-c-num { width: 150px; }
.ppx-c-date { width: 120px; }
.ppx-c-amt { width: 150px; }
.ppx-table td { overflow-wrap: anywhere; }
.ppx-table th { text-align: left; text-transform: uppercase; white-space: nowrap; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-secondary); background: var(--mp-colors-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-colors-border-default); }
.ppx-table td { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-colors-border-default); vertical-align: top; }
.ppx-table th.ppx-r, .ppx-table .ppx-r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ppx-pending td { color: var(--mp-colors-text-secondary); }
.ppx-num { font-variant-numeric: tabular-nums; }
.ppx-sub { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.ppx-pay { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.ppx-empty { color: var(--mp-colors-text-secondary); text-align: center; }
.ppx-link { color: var(--mp-colors-text-link, var(--mp-text-link)); text-decoration: none; }
</style>
