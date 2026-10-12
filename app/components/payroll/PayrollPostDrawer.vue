<script setup lang="ts">
/**
 * Post journal and Reverse and repost: one drawer for both. Post books the draft as one payroll
 * journal. Repost reverses every posted payroll journal of the run in full and posts the chosen
 * version in full (latest preselected). Both take one journal date, default the last day of the
 * pay period; a locked period is refused. When a Settings > Approval workflows rule matches, the
 * button reads Send for approval and the date is kept for the approver.
 */
import { computed, ref, shallowRef, watch } from 'vue'
import { MpDatePicker, MpRadio } from '@mekari/pixel3'
import PayrollCompareDrawerShell from '~/components/payroll/PayrollCompareDrawerShell.vue'
import {
  runById, currentVersionOf, liveJournals, journalTotals, postRun, reverseAndRepost, repostVersions, previewDryRun,
  defaultEntryDate, checkEntryDate, postConfirmText, dateLabel, periodLabel, rupiah, wib, sendFigures, actingPerson, listLabel,
} from '~/data/payrollStore'
import { checkApprovalRequired } from '~/data/payrollApproval'
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
watch(() => props.isOpen, (o) => {
  if (!o || !run.value) return
  date.value = toDisplay(defaultEntryDate(run.value))
  versionNo.value = props.mode === 'repost' ? (choices.value[0]?.no ?? null) : (cur.value?.no ?? null)
  error.value = ''
}, { immediate: true })
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
const approval = computed(() => (props.isOpen && preview.value ? checkApprovalRequired(preview.value.total, actingPerson()) : null))
const confirmLabel = computed(() => (approval.value?.required ? t('Send for approval') : props.mode === 'post' ? t('Post journal') : t(`Use v${versionNo.value ?? ''} and repost`)))

function confirm() {
  error.value = ''
  if (!iso.value) { error.value = t('Pick a journal date.'); return }
  if (dateError.value) { error.value = t(dateError.value); return }
  const r = props.mode === 'post'
    ? postRun(props.runId, { versionNo: versionNo.value ?? undefined, date: iso.value })
    : reverseAndRepost(props.runId, { versionNo: versionNo.value ?? undefined, date: iso.value })
  if (!r.ok) { error.value = t(r.message ?? 'Not posted. Check the date and try again.'); return }
  if (r.awaitingApproval) { successToast(t('Sent for approval. The approver sees it in Inbox > Awaiting approval.')); emit('close'); return }
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
        <div v-if="mode === 'repost'" class="ppd__row">
          <div class="ppd__label">{{ t('Version') }}</div>
          <div class="ppd__field ppd__choices">
            <label v-for="x in choices" :key="x.no" class="ppd__choice">
              <MpRadio :id="`ppd-v${x.no}`" name="ppd-version" :is-checked="versionNo === x.no" @change="versionNo = x.no; error = ''" />
              <span>v{{ x.no }} · {{ t('sent') }} {{ wib(x.sentAt) }} · {{ sendFigures(x).staff }} {{ t('staff') }}<template v-if="x.no === choices[0]?.no"> · {{ t('latest') }}</template></span>
            </label>
          </div>
        </div>
        <div class="ppd__row" data-tour="payroll-journal-date">
          <label class="ppd__label" for="ppd-date">{{ t('Journal date') }}</label>
          <div class="ppd__field">
            <MpDatePicker id="ppd-date" v-model="date" format="DD/MM/YYYY" value-type="format" use-portal is-full-width :is-clearable="false" @update:model-value="error = ''" />
            <div v-if="dateError" class="ppd__fielderror" data-testid="ppd-date-error">{{ t(dateError) }}</div>
            <div v-else class="ppd__fieldhint">{{ mode === 'repost' ? t('The reversal and the new journal both use this date.') : t('Defaults to the last day of the pay period.') }}</div>
          </div>
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

      <div v-if="approval?.required" class="ppd__info" data-testid="ppd-approval">
        {{ t('This journal matches the approval rule') }} {{ approval.ruleName }}. {{ t('It posts on this date once') }} {{ listLabel(approval.approvers) }} {{ t('approves it.') }}
      </div>

      <div v-if="warnings.length" class="ppd__note" data-testid="ppd-warnings">
        <div class="ppd__notetitle">{{ warnings.length }} {{ t(warnings.length === 1 ? 'warning not checked yet' : 'warnings not checked yet') }}</div>
        <ul class="ppd__list"><li v-for="w in warnings" :key="w">{{ w }}</li></ul>
      </div>
      <div v-if="error" class="ppd__error" role="alert" data-testid="ppd-error">{{ error }}</div>
    </template>

    <template #footer>
      <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('close')">{{ t('Cancel') }}</button>
      <button class="btn-enterprise btn-enterprise--primary" type="button" data-testid="ppd-confirm" @click="confirm">{{ confirmLabel }}</button>
    </template>
  </PayrollCompareDrawerShell>
</template>

<style scoped>
.ppd__identity { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ppd__form { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.ppd__row { display: grid; grid-template-columns: 120px minmax(0, 1fr); gap: var(--mp-spacing-4); align-items: start; }
.ppd__label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: 38px; }
.ppd__field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); max-width: 360px; }
.ppd__choices { max-width: none; gap: var(--mp-spacing-2); padding-top: var(--mp-spacing-2); }
.ppd__choice { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer; }
.ppd__fielderror { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.ppd__fieldhint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ppd__info { padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ppd__scroll { overflow-x: auto; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.ppd__table { width: 100%; border-collapse: collapse; }
.ppd__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase;
  color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.ppd__td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.ppd__table tbody tr:last-child .ppd__td { border-bottom: 0; }
.ppd__num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
.ppd__nowrap { white-space: nowrap; }
.ppd__muted { color: var(--mp-text-secondary); }
.ppd__note {
  padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-colors-background-warning);
  border-radius: var(--mp-radii-md); color: var(--mp-colors-text-warning); font-size: var(--mp-font-sizes-md);
}
.ppd__notetitle { font-weight: var(--mp-font-weights-semi-bold); margin-bottom: var(--mp-spacing-1); }
.ppd__list { margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); }
.ppd__error {
  padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-colors-background-danger);
  border-radius: var(--mp-radii-md); color: var(--mp-text-danger); font-size: var(--mp-font-sizes-md);
}
</style>
