<script setup lang="ts">
/**
 * Month-end payroll accrual (OD-29, TN-20). The estimate is the Earning and Employer
 * contribution cost of the latest posted version of the last regular run, by account and tag,
 * times days from cut-off to month end over days in the base period. The Accountant can edit
 * a line with a reason or reset it, then posts one PAY journal of type "Payroll accrual",
 * dated month end. It reverses once, when any version of the next run posts.
 */
import { MpButton, MpBadge, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpBanner, MpBannerIcon, MpBannerDescription } from '@mekari/pixel3'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import PayrollPayDrawer from '~/components/payroll/PayrollPayDrawer.vue'
import {
  accrualEstimate, accrualFor, editAccrualLine, resetAccrualLine, postAccrual, reverseJournal, journalById, journalTotals,
  payroll, can, rupiah, monthLabel, dateLabel, periodLabel, accountLabel, tagsLabel, isLocked, lastDayOf, today, runById,
} from '~/data/payrollStore'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ month: string }>()
const { t } = useLocale()

const est = computed(() => accrualEstimate(props.month))
const posted = computed(() => accrualFor(props.month))
const postedJournal = computed(() => journalById(posted.value?.journalId ?? null))
const reversal = computed(() => journalById(posted.value?.reversalJournalId ?? null))
const postError = ref('')
watch(() => props.month, () => { postError.value = '' })

type Line = (typeof est.value.lines)[number]
const editOpen = ref(false)
const editLine = ref<Line | null>(null)
const editAmount = ref('')
const editReason = ref('')
const editError = ref('')
function openEdit(l: Line) { editLine.value = l; editAmount.value = String(l.amount); editReason.value = l.reason ?? ''; editError.value = ''; editOpen.value = true }
function saveEdit() {
  if (!editLine.value) return
  const n = Number(editAmount.value.replace(/[^\d-]/g, ''))
  if (Number.isNaN(n) || n < 0) { editError.value = t('Type an amount of Rp0 or more.'); return }
  const r = editAccrualLine(props.month, editLine.value.key, n, editReason.value)
  if (!r.ok) { editError.value = r.message ?? ''; return }
  editOpen.value = false
  successToast(t('Accrual line updated'))
}
function reset(l: Line) { const r = resetAccrualLine(props.month, l.key); if (r.ok) successToast(t('Line reset to the estimate')) }

function post() {
  postError.value = ''
  const r = postAccrual(props.month)
  if (!r.ok) { postError.value = r.message ?? ''; return }
  successToast(`${t('Accrual posted as')} ${r.number as string}`)
}
const reverseOpen = ref(false)
function reverseByHand() {
  if (!posted.value) return
  const r = reverseJournal(posted.value.journalId, { date: today() })
  if (!r.ok) { postError.value = r.message ?? ''; return }
  successToast(`${t('Accrual reversed by')} ${(r.journals as string[]).join(', ')}`)
}
const stateBadge = computed(() => {
  if (posted.value) return reversal.value ? { type: 'completed' as const, label: posted.value.reversedBy === 'manual' ? 'Reversed by hand' : 'Reversed by the next run' } : { type: 'warning' as const, label: 'Open, waiting for the next run' }
  return est.value.state === 'ready' ? { type: 'information' as const, label: 'Not posted' } : { type: 'announcement' as const, label: 'Nothing to post' }
})
const nextRunLabel = computed(() => {
  const a = posted.value
  if (!a) return ''
  const [, , start, end] = a.nextRunKey.split(' / ')
  return start && end ? periodLabel(start, end) : a.nextRunKey
})
</script>

<template>
  <div class="pae">
    <div class="pae-card">
      <div class="pae-head">
        <span class="pae-title">{{ t('Accrual') }} · {{ monthLabel(month) }}</span>
        <MpBadge for="additionalInformation" :type="stateBadge.type">{{ t(stateBadge.label) }}</MpBadge>
      </div>

      <template v-if="posted && postedJournal">
        <dl class="pae-facts">
          <div><dt>{{ t('Journal') }}</dt><dd>{{ postedJournal.number }}</dd></div>
          <div><dt>{{ t('Date') }}</dt><dd>{{ dateLabel(postedJournal.date) }}</dd></div>
          <div><dt>{{ t('Total') }}</dt><dd>{{ rupiah(journalTotals(postedJournal).debit) }}</dd></div>
          <div><dt>{{ t('Base run') }}</dt><dd>{{ runById(posted.baseRunId) ? periodLabel(runById(posted.baseRunId)!.start, runById(posted.baseRunId)!.end) : '-' }}</dd></div>
          <div><dt>{{ t('Reverses when this run posts') }}</dt><dd>{{ nextRunLabel }}</dd></div>
          <div><dt>{{ t('Reversal') }}</dt><dd>{{ reversal ? `${reversal.number}, ${dateLabel(reversal.date)}` : t('Not reversed yet') }}</dd></div>
        </dl>
        <table class="pae-table">
          <thead><tr><th>{{ t('Account') }}</th><th>{{ t('Tag') }}</th><th class="pae-r">{{ t('Debit') }}</th><th class="pae-r">{{ t('Credit') }}</th></tr></thead>
          <tbody>
            <tr v-for="(l, i) in postedJournal.lines" :key="i">
              <td>{{ accountLabel(l.account) }}<span v-for="w in l.why" :key="w" class="pae-sub">{{ w }}</span></td>
              <td>{{ tagsLabel(l.tags) || '-' }}</td>
              <td class="pae-r">{{ l.debit ? rupiah(l.debit) : '' }}</td>
              <td class="pae-r">{{ l.credit ? rupiah(l.credit) : '' }}</td>
            </tr>
          </tbody>
        </table>
        <div class="pae-foot">
          <ul class="pae-log"><li v-for="x in posted.log" :key="x">{{ x }}</li></ul>
          <MpButton v-if="!reversal && can('reverse')" variant="secondary" is-rounded @click="reverseOpen = true">{{ t('Reverse by hand') }}</MpButton>
        </div>
      </template>

      <template v-else>
        <div v-if="est.message" class="pae-pad">
          <MpBanner :id="`pae-msg-${est.state}`" :variant="est.state === 'none' ? 'info' : 'warning'">
            <MpBannerIcon :id="`pae-msg-${est.state}-icon`" />
            <MpBannerDescription>{{ est.message }}</MpBannerDescription>
          </MpBanner>
        </div>
        <template v-if="est.state === 'ready' && est.base">
          <dl class="pae-facts">
            <div><dt>{{ t('Base run') }}</dt><dd>{{ periodLabel(est.base.start, est.base.end) }} v{{ est.base.ledgerVersion }}</dd></div>
            <div><dt>{{ t('Cut-off') }}</dt><dd>{{ t('Day') }} {{ est.cutoff }}</dd></div>
            <div><dt>{{ t('Days to accrue') }}</dt><dd>{{ est.days }} {{ t('of') }} {{ est.baseDays }}</dd></div>
            <div><dt>{{ t('Posting date') }}</dt><dd>{{ dateLabel(lastDayOf(month)) }}</dd></div>
            <div><dt>{{ t('Credit') }}</dt><dd>{{ accountLabel(payroll.settings.accrual.account) }}</dd></div>
            <div><dt>{{ t('Total') }}</dt><dd>{{ rupiah(est.total) }}</dd></div>
          </dl>
          <table class="pae-table">
            <thead>
              <tr><th>{{ t('Account') }}</th><th>{{ t('Tag') }}</th><th class="pae-r">{{ t('Base cost') }}</th><th class="pae-r">{{ t('Estimate') }}</th><th class="pae-r">{{ t('Accrue') }}</th><th /></tr>
            </thead>
            <tbody>
              <tr v-for="l in est.lines" :key="l.key">
                <td>{{ accountLabel(l.account) }}</td>
                <td>{{ tagsLabel(l.tags) || '-' }}</td>
                <td class="pae-r">{{ rupiah(l.base) }}</td>
                <td class="pae-r">{{ rupiah(l.estimate) }}</td>
                <td class="pae-r">
                  {{ rupiah(l.amount) }}
                  <span v-if="l.reason" class="pae-sub">{{ t('Edited') }}: {{ l.reason }}</span>
                  <span v-if="l.warn" class="pae-warn">{{ t('More than 20% off the estimate') }}</span>
                </td>
                <td class="pae-r">
                  <template v-if="can('accrual.edit')">
                    <MpButton variant="secondary" size="sm" is-rounded @click="openEdit(l)">{{ t('Edit') }}</MpButton>
                    <MpButton v-if="l.reason" variant="secondary" size="sm" is-rounded @click="reset(l)">{{ t('Reset') }}</MpButton>
                  </template>
                </td>
              </tr>
              <tr class="pae-total">
                <td colspan="2">{{ t('Total') }}</td>
                <td class="pae-r">{{ rupiah(est.lines.reduce((s, l) => s + l.base, 0)) }}</td>
                <td class="pae-r">{{ rupiah(est.lines.reduce((s, l) => s + l.estimate, 0)) }}</td>
                <td class="pae-r">{{ rupiah(est.total) }}</td>
                <td />
              </tr>
            </tbody>
          </table>
          <div class="pae-foot">
            <span class="pae-sub">{{ isLocked(month) ? `${monthLabel(month)} ${t('is locked.')}` : t('One accrual per month. It reverses once, on the next run\'s journal date.') }}</span>
            <MpButton v-if="can('accrual.post')" is-rounded @click="post">{{ t('Post accrual') }}</MpButton>
          </div>
        </template>
      </template>
      <p v-if="postError" class="pae-err">{{ postError }}</p>
    </div>

    <PayrollPayDrawer v-model:is-open="editOpen" :title="t('Edit accrual line')">
      <template v-if="editLine">
        <p class="pae-body">{{ accountLabel(editLine.account) }} · {{ tagsLabel(editLine.tags) || t('No tag') }} · {{ t('estimate') }} {{ rupiah(editLine.estimate) }}</p>
        <MpFormControl id="pae-amt" is-required>
          <MpFormLabel>{{ t('Amount to accrue') }}</MpFormLabel>
          <MpInput id="pae-amt-input" v-model="editAmount" autocomplete="off" />
        </MpFormControl>
        <MpFormControl id="pae-reason" is-required :is-invalid="!!editError">
          <MpFormLabel>{{ t('Reason') }}</MpFormLabel>
          <MpInput id="pae-reason-input" v-model="editReason" autocomplete="off" />
          <MpFormErrorMessage>{{ editError }}</MpFormErrorMessage>
        </MpFormControl>
      </template>
      <template #footer>
        <MpButton variant="ghost" is-rounded @click="editOpen = false">{{ t('Cancel') }}</MpButton>
        <MpButton is-rounded @click="saveEdit">{{ t('Save') }}</MpButton>
      </template>
    </PayrollPayDrawer>
    <ConfirmModal
      v-model:is-open="reverseOpen"
      :title="t('Reverse accrual')"
      :description="t('Jurnal posts the reversal today and fills the accrual\'s one reversal slot. The next run then skips its own reversal.')"
      :confirm-label="t('Reverse')"
      :is-danger="false"
      @confirm="reverseByHand"
    />
  </div>
</template>

<style scoped>
.pae { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.pae-card { border: 1px solid var(--mp-colors-border-default); border-radius: var(--mp-radii-md); overflow: hidden; }
.pae-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); }
.pae-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.pae-pad { padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.pae-facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--mp-spacing-3) var(--mp-spacing-4); margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); }
.pae-facts dt { font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
.pae-facts dd { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.pae-table { width: 100%; border-collapse: collapse; }
.pae-table th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-secondary); background: var(--mp-colors-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); }
.pae-table td { font-size: var(--mp-font-sizes-md); color: var(--mp-colors-text-default); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-colors-border-default); vertical-align: top; }
.pae-table .pae-r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pae-total td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-colors-background-neutral-subtle); }
.pae-sub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); white-space: normal; }
.pae-warn { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-warning); }
.pae-err { margin: 0; padding: 0 var(--mp-spacing-4) var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.pae-body { margin: 0; font-size: var(--mp-font-sizes-md); }
.pae-foot { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.pae-log { margin: 0; padding-left: var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-secondary); }
</style>
