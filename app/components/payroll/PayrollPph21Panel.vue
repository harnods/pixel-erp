<script setup lang="ts">
/**
 * PPh 21 reconciliation (OD-23). Monthly: the one PPh 21 rule (LR-10) beside the ledger,
 * with severance, DTP, PPh 26 and non-staff on their own rows, all visible at Rp0; the
 * payable from opening balance to closing with the deposit due date; the e-Bupot filed total
 * (Tax Staff or Finance Manager) and Mark reconciled. Annual: 12 months of expected tax beside
 * the ledger, the ledger basis for 1721-A1; months before cut-over stay out of the total.
 */
import { MpButton, MpBadge, MpInput, MpFormControl, MpFormLabel, MpFormErrorMessage, MpSegmentedControl, MpBanner, MpBannerIcon, MpBannerDescription } from '@mekari/pixel3'
import { pph21Annual, setEbupotTotal, can, rupiah, monthLabel, accountLabel, wib } from '~/data/payrollStore'
import { pph21View, markPph21, markNonStaff, isNonStaff } from '~/data/payrollUiRecon'
import { successToast, infoToast } from '~/utils/toasts'

const props = defineProps<{ month: string }>()
const { t } = useLocale()

const mode = ref<'month' | 'year'>('month')
const modeOptions = computed(() => [{ id: 'pph-m', label: t('Tax month'), value: 'month' }, { id: 'pph-y', label: t('Tax year'), value: 'year' }])
const v = computed(() => pph21View(props.month))
const annual = computed(() => pph21Annual(Number(props.month.slice(0, 4))))

const filed = ref('')
const note = ref('')
const filedError = ref('')
const markError = ref('')
watch(() => props.month, () => { filed.value = v.value.ebupotFiled == null ? '' : String(v.value.ebupotFiled); note.value = v.value.note ?? ''; filedError.value = ''; markError.value = '' }, { immediate: true })

function saveFiled() {
  filedError.value = ''
  const n = Number(String(filed.value).replace(/[^\d-]/g, ''))
  if (filed.value.trim() === '' || Number.isNaN(n)) { filedError.value = t('Type the PPh 21 total filed in e-Bupot.'); return }
  const r = setEbupotTotal(props.month, n)
  if (!r.ok) { filedError.value = r.message ?? ''; return }
  successToast(t('e-Bupot total saved'))
}
function mark() {
  markError.value = ''
  const r = markPph21(props.month, note.value)
  if (!r.ok) { markError.value = r.message ?? ''; return }
  successToast(`${t('PPh 21')} ${monthLabel(props.month)} ${t('marked reconciled')}`)
}
function toggleNonStaff(id: string) { markNonStaff(id, !isNonStaff(id)) }
</script>

<template>
  <div class="pph">
    <div class="pph-bar">
      <MpSegmentedControl id="pph-mode" v-model="mode" name="pph-mode" :data="modeOptions" />
      <MpButton variant="secondary" is-rounded @click="infoToast(t('Not in this prototype'))">{{ t('Export PPh 21 summary') }}</MpButton>
    </div>

    <template v-if="mode === 'month'">
      <MpBanner v-if="v.outOfDate" id="pph-ood" variant="warning">
        <MpBannerIcon id="pph-ood-icon" />
        <MpBannerDescription>{{ t('Out of date: the ledger changed after PPh 21 was marked reconciled. Check the rows and mark it again.') }}</MpBannerDescription>
      </MpBanner>

      <div class="pph-card">
        <div class="pph-head">
          <span class="pph-title">{{ t('PPh 21') }} · {{ t('tax month') }} {{ monthLabel(month) }}</span>
          <MpBadge for="additionalInformation" :type="v.reconciled && !v.outOfDate ? 'completed' : 'warning'">{{ v.reconciled ? (v.outOfDate ? t('Out of date') : t('Reconciled')) : t('Not reconciled') }}</MpBadge>
        </div>
        <table class="pph-table">
          <thead><tr><th>{{ t('Row') }}</th><th>{{ t('Account') }}</th><th class="pph-r">{{ t('Expected') }}</th><th class="pph-r">{{ t('Ledger') }}</th><th class="pph-r">{{ t('Variance') }}</th></tr></thead>
          <tbody>
            <tr v-for="r in v.rows" :key="r.key">
              <td>
                {{ t(r.label) }}
                <span v-if="r.key === 'regular'" class="pph-sub">{{ t('PPh 21 Benefit + PPh 21 Payment - Total PPh 21 DTP Received') }}</span>
                <span v-if="r.key === 'regular' && v.staffManual" class="pph-sub">{{ t('Includes manual entries') }} {{ rupiah(v.staffManual) }}</span>
                <span v-if="r.key === 'dtp'" class="pph-sub">{{ t('DTP balance') }} {{ rupiah((r as { balance?: number }).balance ?? 0) }}</span>
                <span v-if="r.key === 'nonstaff'" class="pph-sub">{{ t('Freelancer withholding from bills, marked by Tax Staff') }}</span>
              </td>
              <td>{{ accountLabel(r.account) }}</td>
              <td class="pph-r">{{ rupiah(r.expected) }}</td>
              <td class="pph-r">{{ rupiah(r.ledger) }}</td>
              <td class="pph-r" :class="{ 'pph-var': r.variance }">{{ rupiah(r.variance) }}</td>
            </tr>
            <tr v-for="p in v.postedLater" :key="p.number" class="pph-later">
              <td colspan="3">{{ t('Posted in') }} {{ monthLabel(p.postedIn) }}: {{ p.number }}</td>
              <td class="pph-r">{{ rupiah(p.amount) }}</td><td />
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="v.manual.length" class="pph-card">
        <div class="pph-head"><span class="pph-title">{{ t('Manual entries on Hutang PPh 21') }}</span></div>
        <table class="pph-table">
          <thead><tr><th>{{ t('Entry') }}</th><th>{{ t('Memo') }}</th><th class="pph-r">{{ t('Amount') }}</th><th>{{ t('Source') }}</th></tr></thead>
          <tbody>
            <tr v-for="e in v.manual" :key="e.id">
              <td>{{ e.number }}</td>
              <td>{{ e.memo }}</td>
              <td class="pph-r">{{ rupiah(e.credit - e.debit) }}</td>
              <td>
                {{ isNonStaff(e.id) ? t('Non-staff') : t('Staff payroll') }}
                <MpButton v-if="can('pph21.reconcile')" variant="secondary" size="sm" is-rounded @click="toggleNonStaff(e.id)">{{ isNonStaff(e.id) ? t('Move to staff') : t('Mark non-staff') }}</MpButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="pph-grid">
        <div class="pph-card pph-pad">
          <span class="pph-title">{{ t('Hutang PPh 21') }}</span>
          <dl class="pph-roll">
            <div><dt>{{ t('Opening balance') }}</dt><dd>{{ rupiah(v.payable.opening) }}</dd></div>
            <div><dt>{{ t('Credited this tax month') }}</dt><dd>{{ rupiah(v.payable.credits) }}</dd></div>
            <div><dt>{{ t('Deposited') }}</dt><dd>{{ rupiah(-v.payable.paid) }}</dd></div>
            <div class="pph-roll-total"><dt>{{ t('Closing balance') }}</dt><dd>{{ rupiah(v.payable.opening + v.payable.credits - v.payable.paid) }}</dd></div>
            <div><dt>{{ t('Deposit due') }}</dt><dd>{{ v.payable.due }}</dd></div>
          </dl>
        </div>

        <div class="pph-card pph-pad">
          <span class="pph-title">{{ t('PPh 21 filed in e-Bupot') }}</span>
          <template v-if="can('ebupot.enter')">
            <MpFormControl id="pph-filed" :is-invalid="!!filedError">
              <MpFormLabel>{{ t('Filed total') }}</MpFormLabel>
              <div class="pph-row">
                <MpInput id="pph-filed-input" v-model="filed" autocomplete="off" />
                <MpButton variant="secondary" is-rounded @click="saveFiled">{{ t('Save') }}</MpButton>
              </div>
              <MpFormErrorMessage>{{ filedError }}</MpFormErrorMessage>
            </MpFormControl>
          </template>
          <p v-else class="pph-body">{{ v.ebupotFiled == null ? t('Not entered') : rupiah(v.ebupotFiled) }}</p>
          <p v-if="v.filedMessage" class="pph-warn">{{ v.filedMessage }}</p>
          <p v-else-if="v.ebupotFiled != null" class="pph-sub">{{ t('Matches the ledger') }}</p>

          <template v-if="can('pph21.reconcile')">
            <MpFormControl id="pph-note">
              <MpFormLabel>{{ t('Note') }}</MpFormLabel>
              <MpInput id="pph-note-input" v-model="note" autocomplete="off" />
            </MpFormControl>
            <div><MpButton is-rounded @click="mark">{{ t('Mark reconciled') }}</MpButton></div>
            <p v-if="markError" class="pph-err">{{ markError }}</p>
          </template>
          <p v-if="v.reconciled" class="pph-sub">{{ t('Reconciled by') }} {{ v.reconciled.by }} · {{ wib(v.reconciled.at) }}</p>
        </div>
      </div>
    </template>

    <div v-else class="pph-card">
      <div class="pph-head">
        <span class="pph-title">{{ t('PPh 21 regular') }} · {{ annual.year }}</span>
        <span class="pph-sub">{{ t('Ledger basis for 1721-A1. Months before cut-over stay out of the total.') }}</span>
      </div>
      <table class="pph-table">
        <thead><tr><th>{{ t('Tax month') }}</th><th class="pph-r">{{ t('Expected') }}</th><th class="pph-r">{{ t('Ledger') }}</th><th class="pph-r">{{ t('Variance') }}</th></tr></thead>
        <tbody>
          <tr v-for="r in annual.rows" :key="r.month" :class="{ 'pph-muted': r.beforeCutover, 'pph-current': r.month === month }">
            <td>{{ r.label }}<span v-if="r.beforeCutover" class="pph-sub">{{ t('Before cut-over') }}</span></td>
            <td class="pph-r">{{ rupiah(r.expected) }}</td>
            <td class="pph-r">{{ rupiah(r.ledger) }}</td>
            <td class="pph-r" :class="{ 'pph-var': r.variance }">{{ rupiah(r.variance) }}</td>
          </tr>
          <tr class="pph-total">
            <td>{{ t('Total') }}</td>
            <td class="pph-r">{{ rupiah(annual.total.expected) }}</td>
            <td class="pph-r">{{ rupiah(annual.total.ledger) }}</td>
            <td class="pph-r">{{ rupiah(annual.total.variance) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.pph { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.pph-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.pph-card { border: 1px solid var(--mp-colors-border-default); border-radius: var(--mp-radii-md); overflow: hidden; }
.pph-pad { display: flex; flex-direction: column; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.pph-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); }
.pph-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.pph-table { width: 100%; border-collapse: collapse; }
.pph-table th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-secondary); background: var(--mp-colors-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); }
.pph-table td { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); vertical-align: top; }
.pph-table tr:last-child td { border-bottom: 0; }
.pph-table .pph-r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pph-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.pph-warn { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-warning); }
.pph-err { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.pph-var { color: var(--mp-colors-text-warning); font-weight: var(--mp-font-weights-semi-bold); }
.pph-body { margin: 0; font-size: var(--mp-font-sizes-md); }
.pph-later td { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.pph-muted td { color: var(--mp-colors-text-secondary); }
.pph-current td { font-weight: var(--mp-font-weights-semi-bold); }
.pph-total td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-colors-background-neutral-subtle); }
.pph-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }
.pph-row { display: flex; gap: var(--mp-spacing-2); align-items: center; }
.pph-roll { margin: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.pph-roll div { display: flex; justify-content: space-between; font-size: var(--mp-font-sizes-md); }
.pph-roll dt { color: var(--mp-colors-text-secondary); }
.pph-roll dd { margin: 0; font-variant-numeric: tabular-nums; }
.pph-roll-total { border-top: 1px solid var(--mp-colors-border-default); padding-top: var(--mp-spacing-2); font-weight: var(--mp-font-weights-semi-bold); }
</style>
