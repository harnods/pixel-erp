<script setup lang="ts">
/**
 * Reverse journal: lists every posted payroll journal of the run and reverses them together
 * (Use vN and repost lives on the "Talenta sent this period again" notice). The journal date is
 * not before the original; a locked month moves it to the first open period. Matched payments
 * are listed and need a second confirm; no payment, bank line or reconciliation changes.
 */
import { MpDatePicker, MpCheckbox } from '@mekari/pixel3'
import PayrollCompareDrawerShell from '~/components/payroll/PayrollCompareDrawerShell.vue'
import {
  runById, liveJournals, reverseRun, journalTotals, paymentsFor, journalById,
  isLocked, firstOpenAfter, monthLabel, dateLabel, rupiah, accountLabel, payroll,
} from '~/data/payrollStore'
import { successToast } from '~/utils/toasts'
import { PARTY_LABEL } from '~/data/payrollUiPay'

const props = defineProps<{ isOpen: boolean; runId: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useLocale()

const run = computed(() => runById(props.runId))
const live = computed(() => (run.value ? liveJournals(run.value.id) : []))
const earliest = computed(() => live.value.map((j) => j.date).sort().pop() ?? '')
const salaryPays = computed(() => payroll.payments.filter((p) => p.runId === props.runId))
const otherPays = computed(() => paymentsFor(props.runId).filter((p) => p.runId !== props.runId))

const toDisplay = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
const toIso = (d: string) => (d ? `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}` : '')
const date = ref('')
const confirmPays = ref(false)
const error = ref('')
watch(() => props.isOpen, (o) => { if (o) { date.value = toDisplay(earliest.value); confirmPays.value = false; error.value = '' } })

const iso = computed(() => toIso(date.value))
const redirected = computed(() => !!iso.value && isLocked(iso.value.slice(0, 7)))
const effective = computed(() => (redirected.value ? `${firstOpenAfter(iso.value.slice(0, 7))}-01` : iso.value))
const disabledDate = (d: Date) => {
  const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return s < earliest.value
}

function guard(): boolean {
  error.value = ''
  if (!iso.value) { error.value = t('Pick a journal date.'); return false }
  if (iso.value < earliest.value) { error.value = t(`The date can't be before the original journal, ${dateLabel(earliest.value)}.`); return false }
  if (salaryPays.value.length && !confirmPays.value) { error.value = t('Tick Reverse anyway and keep the payments to reverse a run that has payments.'); return false }
  return true
}
function reverseAll() {
  if (!guard()) return
  const r = reverseRun(props.runId, { date: iso.value, confirmPayments: confirmPays.value })
  if (!r.ok) { error.value = t(r.message ?? 'Not reversed. Check the date and try again.'); return }
  successToast(t(`${(r.journals as string[]).join(', ')} posted`))
  emit('close')
}
</script>

<template>
  <PayrollCompareDrawerShell :is-open="isOpen" :title="live.length > 1 ? t('Reverse journals') : t('Reverse journal')" wide @close="emit('close')">
    <template v-if="run">
      <div class="prv__identity">
        {{ live.length > 1 ? t(`This run has ${live.length} posted journals. They reverse together.`) : t('Reversing posts the same lines with debit and credit swapped.') }}
      </div>

      <div class="prv__scroll">
        <table class="prv__table">
          <thead>
            <tr>
              <th class="prv__th">{{ t('Journal') }}</th>
              <th class="prv__th">{{ t('Type') }}</th>
              <th class="prv__th">{{ t('Version') }}</th>
              <th class="prv__th">{{ t('Date') }}</th>
              <th class="prv__th prv__num">{{ t('Total') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="j in live" :key="j.id">
              <td class="prv__td">{{ j.number }}</td>
              <td class="prv__td">{{ t(j.type) }}</td>
              <td class="prv__td">{{ `v${j.versionNo}` }}</td>
              <td class="prv__td prv__nowrap">{{ dateLabel(j.date) }}</td>
              <td class="prv__td prv__num">{{ rupiah(journalTotals(j).debit) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="prv__row">
        <label class="prv__label" for="prv-date-input">{{ t('Journal date') }}</label>
        <div class="prv__field">
          <MpDatePicker id="prv-date-input" v-model="date" format="DD/MM/YYYY" value-type="format" use-portal is-full-width :is-clearable="false" :disabled-date="disabledDate" />
        </div>
      </div>
      <div v-if="redirected" class="prv__note" data-testid="prv-locked">
        {{ t(`${monthLabel(iso.slice(0, 7))} is locked, so the reversal is dated ${dateLabel(effective)}. Tax month stays ${monthLabel(run.month)}.`) }}
      </div>

      <div v-if="salaryPays.length" class="prv__pays" data-testid="prv-payments">
        <div class="prv__paystitle">{{ t('Payments on this run') }}</div>
        <ul class="prv__list">
          <li v-for="p in salaryPays" :key="p.id">{{ journalById(p.journalId)?.number }} · {{ t(PARTY_LABEL.Staff) }} · {{ rupiah(p.amount) }} · {{ dateLabel(p.date) }}</li>
          <li v-for="p in otherPays" :key="p.id">{{ journalById(p.journalId)?.number }} · {{ t(PARTY_LABEL[p.party]) }} · {{ accountLabel(p.account) }} · {{ rupiah(p.amount) }}</li>
        </ul>
        <div class="prv__paysnote">{{ t('The payments stay. Salaries payable goes below Rp0 until you post again.') }}</div>
        <label class="prv__check">
          <MpCheckbox id="prv-confirm-pays" :is-checked="confirmPays" @change="confirmPays = !confirmPays; error = ''" />
          <span>{{ t('Reverse anyway and keep the payments') }}</span>
        </label>
      </div>

      <div v-if="error" class="prv__error" role="alert" data-testid="prv-error">{{ error }}</div>
    </template>

    <template #footer>
      <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('close')">{{ t('Cancel') }}</button>
      <button class="btn-enterprise btn-enterprise--primary" type="button" data-testid="prv-confirm" @click="reverseAll">
        {{ live.length > 1 ? t(`Reverse ${live.length} journals`) : t('Reverse journal') }}
      </button>
    </template>
  </PayrollCompareDrawerShell>
</template>

<style scoped>
.prv__identity { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.prv__scroll { overflow-x: auto; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.prv__table { width: 100%; border-collapse: collapse; }
.prv__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.prv__td {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.prv__table tbody tr:last-child .prv__td { border-bottom: 0; }
.prv__num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.prv__row { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: var(--mp-spacing-4); align-items: start; }
.prv__label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: 38px; }
.prv__field { max-width: 360px; }
.prv__nowrap { white-space: nowrap; }
.prv__note {
  padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-colors-background-warning);
  border-radius: var(--mp-radii-md); color: var(--mp-colors-text-warning); font-size: var(--mp-font-sizes-md);
}
.prv__pays { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.prv__paystitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.prv__list { margin: 0; padding-left: var(--mp-spacing-5, 20px); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.prv__paysnote { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.prv__check { display: flex; align-items: center; gap: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer; }
.prv__error { padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-colors-background-danger); border-radius: var(--mp-radii-md); color: var(--mp-text-danger); font-size: var(--mp-font-sizes-md); }
</style>
