<script setup lang="ts">
/**
 * Post journal and Reverse and repost: one drawer for both. Post books the draft as one payroll
 * journal. Repost reverses every posted payroll journal of the run in full and posts the chosen
 * version in full (latest preselected). Both take one journal date, default the last day of the
 * pay period; a locked period is refused. Post also asks, per party this journal owes, Record as
 * payable (default) or Paid now from a bank account: paid now adds a Spend money on the journal
 * date for that party's full amount, recorded on its payable (postRunAndPay). Repost records
 * payables only.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import {
  MpBanner, MpBannerDescription, MpBannerTitle, MpButton, MpDatePicker, MpFormControl, MpFormErrorMessage, MpFormHelpText, MpFormLabel, MpRadio,
} from '@mekari/pixel3'
import PayrollCompareDrawerShell from '~/components/payroll/PayrollCompareDrawerShell.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  runById, currentVersionOf, liveJournals, journalTotals, postRunAndPay, reverseAndRepost, repostVersions, previewDryRun,
  defaultEntryDate, checkEntryDate, postConfirmText, dateLabel, periodLabel, rupiah, wib, sendFigures,
  payNowParties, payNowBanks,
} from '~/data/payrollStore'
import type { PayableParty } from '~/data/payrollMaster'
import { successToast, infoToast } from '~/utils/toasts'

const props = defineProps<{ isOpen: boolean; runId: string; mode: 'post' | 'repost' }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useLocale()

const run = computed(() => runById(props.runId))
const cur = computed(() => (run.value ? currentVersionOf(run.value) : undefined))
const live = computed(() => (run.value ? liveJournals(run.value.id) : []))
const choices = computed(() => (props.mode === 'repost' ? repostVersions(props.runId) : []))

const toDisplay = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
const toIso = (d: string) => (d ? `${d.slice(6, 10)}-${d.slice(3, 5)}-${d.slice(0, 2)}` : '')
const date = ref('')
const versionNo = ref<number | null>(null)
const error = ref('')

const PARTY_KEYS: PayableParty[] = ['Staff', 'DJP PPh 21', 'DJP PPh 26', 'BPJS Kesehatan', 'BPJS Ketenagakerjaan', 'Other']
// Per party: Record as payable (default) or Paid now from a bank account. Post only.
const parties = computed(() => (props.mode === 'post' && props.isOpen ? payNowParties(props.runId) : []))
const bankOptions = computed(() => payNowBanks().map((b) => ({ value: b.id, label: b.name })))
const defaultBank = () => payNowBanks().find((b) => b.name === 'Bank BCA')?.id ?? payNowBanks()[0]?.id ?? ''
const payNow = ref<Partial<Record<PayableParty, boolean>>>({})
const bankOf = ref<Partial<Record<PayableParty, string>>>({})

watch(() => props.isOpen, (o) => {
  if (!o || !run.value) return
  date.value = toDisplay(defaultEntryDate(run.value))
  versionNo.value = props.mode === 'repost' ? (choices.value[0]?.no ?? null) : (cur.value?.no ?? null)
  error.value = ''
  payNow.value = {}
  bankOf.value = Object.fromEntries(PARTY_KEYS.map((k) => [k, defaultBank()]))
}, { immediate: true })
const slug = (p: PayableParty) => p.replace(/\s+/g, '-').toLowerCase()
function setPayNow(p: PayableParty, on: boolean) { payNow.value = { ...payNow.value, [p]: on }; error.value = '' }
function setBank(p: PayableParty, v: string) { bankOf.value = { ...bankOf.value, [p]: v }; error.value = '' }
const iso = computed(() => toIso(date.value))

// The journal the chosen version posts: built in a watch (a build draws ids; never in a computed).
const preview = shallowRef<{ total: number; lines: number } | null>(null)
watch([() => props.isOpen, versionNo], () => {
  if (!props.isOpen || !run.value || versionNo.value == null) { preview.value = null; return }
  if (versionNo.value === cur.value?.no && cur.value?.draft) { preview.value = { total: journalTotals(cur.value.draft).debit, lines: cur.value.draft.lines.length }; return }
  const lines = previewDryRun(props.runId, versionNo.value).draft?.lines ?? []
  preview.value = { total: lines.reduce((s, l) => s + l.debit, 0), lines: lines.length }
}, { immediate: true })

const warnings = computed(() => (props.isOpen && run.value && versionNo.value === cur.value?.no ? postConfirmText(props.runId).warnings : []))
const dateError = computed(() => {
  if (!iso.value) return ''
  const last = [...live.value].sort((a, b) => b.date.localeCompare(a.date))[0]
  return checkEntryDate(iso.value, props.mode === 'repost' && last ? { date: last.date, number: last.number } : undefined) ?? ''
})
const confirmLabel = computed(() => (props.mode === 'post' ? t('Post journal') : t(`Use v${versionNo.value ?? ''} and repost`)))

function confirm() {
  error.value = ''
  if (!iso.value) { error.value = t('Pick a journal date.'); return }
  if (dateError.value) { error.value = t(dateError.value); return }
  const pick: Partial<Record<PayableParty, string>> = {}
  for (const p of parties.value) {
    if (!payNow.value[p.party]) continue
    if (!bankOf.value[p.party]) { error.value = t(`Pick a bank account to pay ${p.payee} from.`); return }
    pick[p.party] = bankOf.value[p.party]
  }
  if (props.mode === 'post') {
    const r = postRunAndPay(props.runId, { versionNo: versionNo.value ?? undefined, date: iso.value, payNow: pick })
    if (!r.ok) { error.value = t(r.message ?? 'Not posted. Check the date and try again.'); return }
    successToast(t(r.message as string))
    for (const f of (r.failed as string[] | undefined) ?? []) infoToast(t(`Not paid now. ${f}`))
    for (const w of (r.warnings as string[] | undefined) ?? []) infoToast(t(w))
    emit('close')
    return
  }
  const r = reverseAndRepost(props.runId, { versionNo: versionNo.value ?? undefined, date: iso.value })
  if (!r.ok) { error.value = t(r.message ?? 'Not posted. Check the date and try again.'); return }
  const nos = (r.journals as string[] | undefined) ?? [r.number as string]
  successToast(t(`${nos.join(', ')} posted`))
  for (const w of (r.warnings as string[] | undefined) ?? []) infoToast(t(w))
  emit('close')
}
</script>

<template>
  <PayrollCompareDrawerShell :is-open="isOpen" :title="mode === 'post' ? t('Post journal') : t('Reverse and repost')" wide @close="emit('close')">
    <template v-if="run && cur">
      <div class="ppd__identity">{{ t('Payroll') }} {{ periodLabel(run.start, run.end) }}</div>

      <div class="ppd__form">
        <MpFormControl v-if="mode === 'repost'" id="ppd-version-fc">
          <MpFormLabel>{{ t('Version') }}</MpFormLabel>
          <div class="ppd__choices">
            <MpRadio v-for="x in choices" :id="`ppd-v${x.no}`" :key="x.no" name="ppd-version" :is-checked="versionNo === x.no" @change="versionNo = x.no; error = ''">
              v{{ x.no }} · {{ t('sent') }} {{ wib(x.sentAt) }} · {{ sendFigures(x).staff }} {{ t('staff') }}<template v-if="x.no === choices[0]?.no"> · {{ t('latest') }}</template>
            </MpRadio>
          </div>
        </MpFormControl>
        <div class="ppd__field" data-tour="payroll-journal-date">
          <MpFormControl id="ppd-date" :is-invalid="!!dateError">
            <MpFormLabel>{{ t('Journal date') }}</MpFormLabel>
            <MpDatePicker id="ppd-date" v-model="date" format="DD/MM/YYYY" value-type="format" use-portal is-full-width :is-clearable="false" :is-invalid="!!dateError" @update:model-value="error = ''" />
            <MpFormErrorMessage v-if="dateError" data-testid="ppd-date-error">{{ t(dateError) }}</MpFormErrorMessage>
            <MpFormHelpText v-else>{{ mode === 'repost' ? t('The reversal and the new journal both use this date.') : t('Defaults to the last day of the pay period.') }}</MpFormHelpText>
          </MpFormControl>
        </div>
      </div>

      <div class="ppd__scroll">
        <table class="ppd__table">
          <thead>
            <tr>
              <th class="ppd__th">{{ t('Journal') }}</th>
              <th class="ppd__th">{{ t('Date') }}</th>
              <th class="ppd__th ppd__num">{{ t('Total') }}</th>
            </tr>
          </thead>
          <tbody>
            <template v-if="mode === 'repost'">
              <tr v-for="j in live" :key="j.id">
                <td class="ppd__td">{{ t('Reverses') }} {{ j.number }} (v{{ j.versionNo }})</td>
                <td class="ppd__td ppd__nowrap">{{ iso ? dateLabel(iso) : '-' }}</td>
                <td class="ppd__td ppd__num">{{ rupiah(journalTotals(j).debit) }}</td>
              </tr>
            </template>
            <tr>
              <td class="ppd__td">{{ t('Payroll') }} v{{ versionNo }}<span v-if="preview" class="ppd__muted"> · {{ preview.lines }} {{ t('lines') }}</span></td>
              <td class="ppd__td ppd__nowrap">{{ iso ? dateLabel(iso) : '-' }}</td>
              <td class="ppd__td ppd__num">{{ preview ? rupiah(preview.total) : '-' }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <section v-if="parties.length" class="ppd__pay" data-tour="payroll-pay-now" data-testid="ppd-pay-now">
        <div class="ppd__sectiontitle">{{ t('What this journal owes') }}</div>
        <div class="ppd__fieldhint">{{ t('Record each as payable, or pay it now from a bank account. Paying now adds a Spend money on the journal date.') }}</div>
        <div class="ppd__scroll">
          <table class="ppd__table ppd__paytable">
            <colgroup><col><col class="ppd__c-amount"><col class="ppd__c-choice"><col class="ppd__c-bank"></colgroup>
            <thead>
              <tr>
                <th class="ppd__th">{{ t('Owed to') }}</th>
                <th class="ppd__th ppd__num">{{ t('Amount') }}</th>
                <th class="ppd__th">{{ t('Payment') }}</th>
                <th class="ppd__th">{{ t('Pay from') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="p in parties" :key="p.party" :data-testid="`ppd-party-${slug(p.party)}`">
                <td class="ppd__td">{{ t(p.payee) }}</td>
                <td class="ppd__td ppd__num">{{ rupiah(p.amount) }}</td>
                <td class="ppd__td">
                  <div class="ppd__radios">
                    <MpRadio :id="`ppd-${slug(p.party)}-payable`" :name="`ppd-pay-${slug(p.party)}`" :is-checked="!payNow[p.party]" @change="setPayNow(p.party, false)">{{ t('Record as payable') }}</MpRadio>
                    <MpRadio :id="`ppd-${slug(p.party)}-paynow`" :name="`ppd-pay-${slug(p.party)}`" :is-checked="!!payNow[p.party]" @change="setPayNow(p.party, true)">{{ t('Paid now') }}</MpRadio>
                  </div>
                </td>
                <td class="ppd__td ppd__bankcell">
                  <ErpFilterSelect
                    :id="`ppd-bank-${slug(p.party)}`" :model-value="bankOf[p.party] ?? ''" :placeholder="t('Select bank account')"
                    :options="bankOptions" width="168px" :is-clearable="false" :is-disabled="!payNow[p.party]"
                    @update:model-value="(v: string) => setBank(p.party, v)"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <MpBanner v-if="warnings.length" id="ppd-warnings" variant="warning" data-testid="ppd-warnings">
        <MpBannerTitle>{{ warnings.length }} {{ t(warnings.length === 1 ? 'warning not checked yet' : 'warnings not checked yet') }}</MpBannerTitle>
        <ul class="ppd__list"><li v-for="w in warnings" :key="w">{{ w }}</li></ul>
      </MpBanner>
      <MpBanner v-if="error" id="ppd-error" variant="danger" role="alert" data-testid="ppd-error">
        <MpBannerDescription>{{ error }}</MpBannerDescription>
      </MpBanner>
    </template>

    <template #footer>
      <MpButton variant="ghost" is-rounded @click="emit('close')">{{ t('Cancel') }}</MpButton>
      <MpButton variant="primary" is-rounded data-testid="ppd-confirm" @click="confirm">{{ confirmLabel }}</MpButton>
    </template>
  </PayrollCompareDrawerShell>
</template>

<style scoped>
.ppd__identity { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ppd__form { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.ppd__field { max-width: 360px; }
.ppd__choices { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ppd__fieldhint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ppd__pay { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ppd__sectiontitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ppd__paytable { table-layout: fixed; }
/* Fits the 860px drawer at 1280 with no sideways scroll: party takes what is left (about 200px). */
.ppd__c-amount { width: 140px; }
.ppd__c-choice { width: 292px; }
.ppd__c-bank { width: 192px; }
.ppd__paytable .ppd__th, .ppd__paytable .ppd__td { padding-left: var(--mp-spacing-3); padding-right: var(--mp-spacing-3); }
.ppd__paytable .ppd__td { vertical-align: middle; padding-top: var(--mp-spacing-2); padding-bottom: var(--mp-spacing-2); }
.ppd__paytable .ppd__th:first-child, .ppd__paytable .ppd__td:first-child { padding-left: var(--mp-spacing-4); }
.ppd__radios { display: flex; gap: var(--mp-spacing-4); flex-wrap: nowrap; white-space: nowrap; }
/* A bordered mini-table in a drawer takes the bold outer edge (rule/table-outer-border-bold). */
.ppd__scroll { overflow-x: auto; border: 1px solid var(--mp-colors-border-bold, #8c9596); border-radius: var(--mp-radii-md); }
.ppd__table { width: 100%; border-collapse: collapse; }
.ppd__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase;
  color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); height: var(--mp-sizes-7); padding: var(--mp-spacing-1) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.ppd__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-2\.5) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.ppd__table tbody tr:last-child .ppd__td { border-bottom: 0; }
.ppd__num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ppd__nowrap { white-space: nowrap; }
.ppd__muted { color: var(--mp-text-secondary); }
.ppd__list { margin: var(--mp-spacing-1) 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
</style>
