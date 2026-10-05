<script setup lang="ts">
/**
 * Record salary payment (TS-08): debit Hutang Gaji, credit Cash & Bank, on a posted run.
 * The amount fills from the open Hutang Gaji balance with take-home pay beside it (TN-33).
 * One bank, or a bank per branch (group totals only, no names). Partial payments leave
 * the rest open. A transfer that differs from take-home pay is recorded and flagged (TN-05).
 */
import { MpButton, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpDatePicker, MpSegmentedControl, MpBanner, MpBannerIcon, MpBannerDescription } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import PayrollPayDrawer from '~/components/payroll/PayrollPayDrawer.vue'
import { recordSalaryPayment, payablesTracker, rupiah, today, accountLabel, dateLabel, type PayableRow } from '~/data/payrollStore'
import { cashAccounts, runTakeHome, branchTakeHome, lastBranchBanks, salaryReference, versionWaiting, toIso, fromIso } from '~/data/payrollUiPayables'
import { successToast, infoToast } from '~/utils/toasts'

const props = defineProps<{ isOpen: boolean; row: PayableRow | null }>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void; (e: 'posted'): void }>()
const { t } = useLocale()

const mode = ref<'one' | 'split'>('one')
const bank = ref('')
const date = ref('')
const amount = ref<string | number>('')
const branchBanks = reactive<Record<string, string>>({})
const error = ref('')
const showErrors = ref(false)

const runId = computed(() => props.row?.runId ?? '')
const open = computed(() => props.row?.balance ?? 0)
const takeHome = computed(() => (runId.value ? runTakeHome(runId.value) : 0))
const branches = computed(() => (runId.value ? branchTakeHome(runId.value) : []))
const bankOptions = computed(() => cashAccounts.value.map((a) => ({ value: a.code, label: accountLabel(a.code) })))
const modeOptions = computed(() => [{ id: 'one', label: t('One bank'), value: 'one' }, { id: 'split', label: t('Split by branch'), value: 'split' }])

watch(() => props.isOpen, (o) => {
  if (!o || !props.row) return
  mode.value = 'one'
  bank.value = cashAccounts.value[0]?.code ?? ''
  const start = props.row.month + '-01'
  date.value = fromIso(today() < start ? start : today())
  amount.value = String(open.value)
  const last = lastBranchBanks()
  for (const b of branches.value) branchBanks[b.branch] = last[b.branch] ?? ''
  error.value = ''
  showErrors.value = false
}, { immediate: true })

const amountNum = computed(() => Number(String(amount.value).replace(/[^\d-]/g, '')) || 0)
const bankError = computed(() => (mode.value === 'one' && !bank.value ? t('Pick a Cash & Bank account.') : ''))
const dateError = computed(() => (!toIso(date.value) ? t('Pick a payment date.') : ''))
const amountError = computed(() => (mode.value === 'one' && amountNum.value <= 0 ? t('Type an amount above Rp0.') : ''))
const branchError = computed(() => (mode.value === 'split' ? branches.value.find((b) => !branchBanks[b.branch]) : undefined))
const differs = computed(() => (mode.value === 'one' && amountNum.value >= open.value ? amountNum.value - takeHome.value : 0))

function post() {
  showErrors.value = true
  error.value = ''
  if (bankError.value || dateError.value || amountError.value || branchError.value || !runId.value) return
  const r = recordSalaryPayment(runId.value, mode.value === 'split'
    ? { bank: branchBanks[branches.value[0]!.branch]!, date: toIso(date.value), splits: branches.value.map((b) => ({ branch: b.branch, bank: branchBanks[b.branch]! })) }
    : { bank: bank.value, date: toIso(date.value), amount: amountNum.value })
  if (!r.ok) { error.value = r.message ?? t('The payment did not post.'); return }
  successToast(`${t('Salary payment posted as')} ${r.number as string}`)
  for (const w of (r.warnings as string[] | undefined) ?? []) infoToast(w)
  emit('posted')
  emit('update:isOpen', false)
}
const remaining = computed(() => {
  const now = payablesTracker(props.row?.month).find((x) => x.key === props.row?.key)
  return now?.balance ?? open.value
})
</script>

<template>
  <PayrollPayDrawer :is-open="isOpen" :title="t('Record salary payment')" @update:is-open="(v: boolean) => emit('update:isOpen', v)">
    <template v-if="row">
      <MpBanner v-if="versionWaiting(row.runId)" id="psf-waiting" variant="warning">
        <MpBannerIcon id="psf-waiting-icon" />
        <MpBannerDescription>{{ t('A newer version of this run is waiting for review. This payment clears the posted version.') }}</MpBannerDescription>
      </MpBanner>

      <dl class="psf-facts">
        <div class="psf-fact"><dt>{{ t('Run') }}</dt><dd>{{ salaryReference(row.runId!) }}</dd></div>
        <div class="psf-fact"><dt>{{ t('Hutang Gaji open') }}</dt><dd class="psf-num">{{ rupiah(remaining) }}</dd></div>
        <div class="psf-fact"><dt>{{ t('Take-home pay in the run') }}</dt><dd class="psf-num">{{ rupiah(takeHome) }}</dd></div>
        <div class="psf-fact"><dt>{{ t('Due') }}</dt><dd>{{ row.due ? dateLabel(row.due) : t('Not set') }}</dd></div>
      </dl>

      <MpSegmentedControl id="psf-mode" v-model="mode" name="psf-mode" :data="modeOptions" />

      <template v-if="mode === 'one'">
        <MpFormControl id="psf-bank" is-required :is-invalid="showErrors && !!bankError">
          <MpFormLabel>{{ t('Pay from') }}</MpFormLabel>
          <ErpFilterSelect id="psf-bank-select" :model-value="bank" :placeholder="t('Select account')" :options="bankOptions" :is-clearable="false" width="100%" @update:model-value="(v: string) => (bank = v)" />
          <MpFormErrorMessage>{{ bankError }}</MpFormErrorMessage>
        </MpFormControl>
        <MpFormControl id="psf-amount" is-required :is-invalid="showErrors && !!amountError">
          <MpFormLabel>{{ t('Amount') }}</MpFormLabel>
          <MpInput id="psf-amount-input" v-model="amount" autocomplete="off" />
          <MpFormErrorMessage>{{ amountError }}</MpFormErrorMessage>
        </MpFormControl>
        <p v-if="amountNum > 0 && amountNum < remaining" class="psf-hint">{{ t('Partial payment.') }} {{ rupiah(remaining - amountNum) }} {{ t('stays open on Hutang Gaji.') }}</p>
        <p v-if="differs" class="psf-warn">{{ t('Bank paid differs from the posted run by') }} {{ rupiah(Math.abs(differs)) }}. {{ t('Ask HR whether payroll changed.') }}</p>
      </template>

      <template v-else>
        <div class="psf-split">
          <div class="psf-split-head">
            <span>{{ t('Branch') }}</span><span class="psf-num">{{ t('Take-home pay') }}</span><span>{{ t('Pay from') }}</span>
          </div>
          <div v-for="b in branches" :key="b.branch" class="psf-split-row">
            <span>
              {{ b.branch }}
              <span class="psf-sub">{{ b.headcount }} {{ t(b.headcount === 1 ? 'employee' : 'employees') }}</span>
            </span>
            <span class="psf-num">{{ rupiah(b.amount) }}</span>
            <ErpFilterSelect :id="`psf-branch-${b.branch.replace(/\W/g, '')}`" :model-value="branchBanks[b.branch] ?? ''" :placeholder="t('Select account')" :options="bankOptions" :is-clearable="false" width="100%" variant="cell" @update:model-value="(v: string) => (branchBanks[b.branch] = v)" />
          </div>
        </div>
        <p v-if="showErrors && branchError" class="psf-error">{{ t('Pick a bank for') }} {{ branchError.branch }}.</p>
        <p class="psf-hint">{{ t('One journal posts a credit per bank and Hutang Gaji debits tagged by branch.') }}</p>
      </template>

      <MpFormControl id="psf-date" is-required :is-invalid="showErrors && !!dateError">
        <MpFormLabel>{{ t('Payment date') }}</MpFormLabel>
        <MpDatePicker id="psf-date-input" v-model="date" format="DD/MM/YYYY" value-type="format" use-portal />
        <MpFormErrorMessage>{{ dateError }}</MpFormErrorMessage>
      </MpFormControl>

      <p class="psf-hint">{{ t('Reference') }}: {{ salaryReference(row.runId!) }}</p>
      <p v-if="error" class="psf-error">{{ error }}</p>
    </template>

    <template #footer>
      <MpButton variant="ghost" is-rounded @click="emit('update:isOpen', false)">{{ t('Cancel') }}</MpButton>
      <MpButton is-rounded @click="post">{{ t('Post payment') }}</MpButton>
    </template>
  </PayrollPayDrawer>
</template>

<style scoped>
.psf-facts { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-3) var(--mp-spacing-4); margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-4); border: 1px solid var(--mp-colors-border-default); border-radius: var(--mp-radii-md); }
.psf-fact dt { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.psf-fact dd { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.psf-num { font-variant-numeric: tabular-nums; text-align: right; }
.psf-fact .psf-num { text-align: left; }
.psf-hint { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.psf-warn { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-warning); }
.psf-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.psf-split { display: flex; flex-direction: column; border: 1px solid var(--mp-colors-border-default); border-radius: var(--mp-radii-md); }
.psf-split-head, .psf-split-row { display: grid; grid-template-columns: 1fr 1fr 1.4fr; gap: var(--mp-spacing-3); align-items: center; padding: var(--mp-spacing-2) var(--mp-spacing-3); }
.psf-split-head { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); background: var(--mp-colors-background-neutral-subtle); border-bottom: 1px solid var(--mp-colors-border-default); }
.psf-split-row + .psf-split-row { border-top: 1px solid var(--mp-colors-border-default); }
.psf-split-row { font-size: var(--mp-font-sizes-md); }
.psf-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
</style>
