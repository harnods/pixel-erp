<script setup lang="ts">
/**
 * "Simulate" on Payroll payables: stands in for Jurnal's bank reconciliation (a bank statement
 * line matched to a payroll payable) and for a manual journal on Salaries Payable. Both go
 * through payrollStore, so the tracker and the run react as they would to the real thing.
 */
import { MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem } from '@mekari/pixel3'
import { simulateBankPayment, simulateManualJournal, rupiah, type BankPaymentKind, type Result } from '~/data/payrollStore'
import { SIMULATE_BANK } from '~/data/payrollUiPay'
import { successToast, errorToast } from '~/utils/toasts'

const emit = defineEmits<{ (e: 'done', r: Result): void }>()
const { t } = useLocale()

function report(r: Result, ok: string) {
  if (r.ok) successToast(t(ok))
  else errorToast(t(r.message ?? 'Nothing to pay. Post a payroll journal first, or reset sample data.'))
  emit('done', r)
}
function bank(kind: BankPaymentKind) {
  const r = simulateBankPayment(kind)
  report(r, `${r.number} matched in bank reconciliation, ${rupiah(Number(r.amount ?? 0))}`)
}
function manual() {
  const r = simulateManualJournal()
  report(r, `${r.number} posted on Salaries Payable`)
}
</script>

<template>
  <MpPopover id="payroll-payables-simulate" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
    <MpPopoverTrigger>
      <MpButton data-tour="payroll-payables-simulate" variant="secondary" is-rounded right-icon="chevrons-down">{{ t('Simulate bank or journal') }}</MpButton>
    </MpPopoverTrigger>
    <MpPopoverContent class="erp-dropdown-menu psb-menu">
      <div class="psb-head">{{ t('Match in bank reconciliation') }}</div>
      <MpPopoverList>
        <MpPopoverListItem v-for="k in SIMULATE_BANK" :key="k.kind" @click="bank(k.kind)">{{ t(k.label) }}</MpPopoverListItem>
      </MpPopoverList>
      <div class="psb-head">{{ t('Manual journal') }}</div>
      <MpPopoverList>
        <MpPopoverListItem @click="manual">{{ t('Post a manual journal on Salaries Payable') }}</MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.psb-menu { min-width: 264px; max-height: 70vh; overflow-y: auto; }
.psb-head {
  /* 16px left: lines up with the item text (4px list padding + 12px item padding). */
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-colors-text-secondary, #3a4749);
}
</style>
