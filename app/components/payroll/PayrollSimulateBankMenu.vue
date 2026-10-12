<script setup lang="ts">
/**
 * "Simulate" on Payroll payables: the prototype's stand-in for Jurnal's bank reconciliation
 * (a statement line matched to a payroll payable) and for a general journal posted by hand on
 * Hutang Gaji. Both go through payrollStore, so the tracker, the run and the sync log react
 * as they would to the real thing.
 */
import { MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem } from '@mekari/pixel3'
import { simulateBankPayment, simulateManualJournal, rupiah, type BankPaymentKind, type Result } from '~/data/payrollStore'
import { SIMULATE_BANK } from '~/data/payrollUiPay'
import { successToast, errorToast } from '~/utils/toasts'

const emit = defineEmits<{ (e: 'done', r: Result): void }>()
const { t } = useLocale()

function report(r: Result, ok: string) {
  if (r.ok) successToast(t(ok))
  else errorToast(t(r.message ?? 'Not recorded'))
  emit('done', r)
}
function bank(kind: BankPaymentKind) {
  const r = simulateBankPayment(kind)
  report(r, `${r.number} matched in bank reconciliation: ${rupiah(Number(r.amount ?? 0))}`)
}
function manual() {
  const r = simulateManualJournal()
  report(r, `${r.number} posted on Hutang Gaji`)
}
</script>

<template>
  <MpPopover id="payroll-payables-simulate" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
    <MpPopoverTrigger>
      <MpButton data-tour="payroll-payables-simulate" variant="secondary" is-rounded right-icon="chevrons-down">{{ t('Simulate') }}</MpButton>
    </MpPopoverTrigger>
    <MpPopoverContent class="erp-dropdown-menu psb-menu">
      <div class="psb-head">{{ t('Bank reconciliation match') }}</div>
      <MpPopoverList>
        <MpPopoverListItem v-for="k in SIMULATE_BANK" :key="k.kind" @click="bank(k.kind)">{{ t(k.label) }}</MpPopoverListItem>
      </MpPopoverList>
      <div class="psb-head">{{ t('General journal') }}</div>
      <MpPopoverList>
        <MpPopoverListItem @click="manual">{{ t('Manual journal on Hutang Gaji') }}</MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.psb-menu { min-width: 264px; max-height: 70vh; overflow-y: auto; }
.psb-head {
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
}
</style>
