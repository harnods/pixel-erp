<script setup lang="ts">
/**
 * Post correction / Reverse and repost (OD-15, OD-17). Correction mode posts one Correction
 * journal with the difference only (decreases on the opposite side). Repost mode (from More)
 * reverses every live journal and posts the current version in full, both on one date. A locked
 * month dates either in the first open period with a correction memo; the tax month stays.
 * Unacknowledged warnings are listed before the confirm; they never block.
 */
import { computed, ref, watch } from 'vue'
import PayrollCompareDrawerShell from '~/components/payroll/PayrollCompareDrawerShell.vue'
import {
  runById, versionOf, currentVersionOf, liveJournals, correctionOf, postCorrection, reverseAndRepost, postConfirmText,
  journalTotals, isLocked, firstOpenAfter, monthLabel, dateLabel, periodLabel, rupiah, accountLabel, tagsLabel, draftOf, listLabel,
} from '~/data/payrollStore'
import { successToast, infoToast } from '~/utils/toasts'

const props = defineProps<{ isOpen: boolean; runId: string; mode: 'correction' | 'repost' }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useLocale()

const error = ref('')
watch(() => props.isOpen, (o) => { if (o) error.value = '' })

const run = computed(() => runById(props.runId))
const cur = computed(() => (run.value ? currentVersionOf(run.value) : undefined))
const ledgerV = computed(() => (run.value ? versionOf(run.value, run.value.ledgerVersion) : undefined))
const live = computed(() => (run.value ? liveJournals(run.value.id) : []))
const data = computed(() => correctionOf(props.runId))
const lines = computed(() => (data.value?.lines ?? []).map((l, i) => ({ key: String(i), account: accountLabel(l.account), tags: tagsLabel(l.tags), debit: l.debit, credit: l.credit })))
const totals = computed(() => ({ debit: lines.value.reduce((s, l) => s + l.debit, 0), credit: lines.value.reduce((s, l) => s + l.credit, 0) }))
const newTotal = computed(() => { const d = run.value ? draftOf(run.value) : null; return d ? journalTotals(d).debit : 0 })
const warnings = computed(() => (props.isOpen && run.value ? postConfirmText(props.runId).warnings : []))

const locked = computed(() => !!run.value && isLocked(run.value.month))
const postDate = computed(() => (run.value ? (locked.value ? `${firstOpenAfter(run.value.month)}-01` : run.value.end) : ''))
const title = computed(() => (props.mode === 'correction' ? t('Post correction') : t('Reverse and repost')))

function confirm() {
  error.value = ''
  const r = props.mode === 'correction' ? postCorrection(props.runId) : reverseAndRepost(props.runId)
  if (!r.ok) { error.value = t(r.message ?? 'Nothing posted.'); return }
  const nos = (r.journals as string[] | undefined) ?? []
  successToast(nos.length ? t(`${nos.join(', ')} posted`) : t('No ledger change'))
  for (const w of (r.warnings as string[] | undefined) ?? []) infoToast(t(w))
  emit('close')
}
</script>

<template>
  <PayrollCompareDrawerShell :is-open="isOpen" :title="title" wide @close="emit('close')">
    <template v-if="run && cur && ledgerV">
      <div class="pcd__identity">
        {{ periodLabel(run.start, run.end) }} · {{ `v${ledgerV.no}` }} {{ t('posted as') }} {{ listLabel(live.map((j) => j.number)) }} · {{ t('to') }} {{ `v${cur.no}` }}
      </div>

      <dl class="pcd__facts">
        <div><dt>{{ t('Journal date') }}</dt><dd data-testid="pcd-date">{{ dateLabel(postDate) }}</dd></div>
        <div><dt>{{ t('Tax month') }}</dt><dd>{{ monthLabel(run.month) }}</dd></div>
        <div><dt>{{ t('Journal type') }}</dt><dd>{{ mode === 'correction' ? t('Correction') : t('Reversal and Payroll') }}</dd></div>
      </dl>
      <div v-if="locked" class="pcd__note" data-testid="pcd-locked">
        {{ monthLabel(run.month) }} {{ t('is locked. The journal posts on') }} {{ dateLabel(postDate) }} {{ t('in') }} {{ monthLabel(firstOpenAfter(run.month)) }}{{ t(', the first open period, with a correction memo and reference.') }}
      </div>
      <div v-if="warnings.length" class="pcd__note" data-testid="pcd-warnings">
        <div class="pcd__notetitle">{{ warnings.length }} {{ t(warnings.length === 1 ? 'warning not acknowledged' : 'warnings not acknowledged') }}</div>
        <ul class="pcd__warnlist"><li v-for="w in warnings" :key="w">{{ w }}</li></ul>
      </div>

      <template v-if="mode === 'correction'">
        <div v-if="data?.summary.settingsChanged" class="pcd__note">{{ t('Settings changed since the posted journal was built; part of this correction is the settings change.') }}</div>
        <div v-if="!lines.length" class="pcd__empty">{{ t('Rp0 by account and dimension. Nothing posts.') }}</div>
        <div v-else class="pcd__scroll">
          <table class="pcd__table">
            <thead>
              <tr>
                <th class="pcd__th">{{ t('Account') }}</th>
                <th class="pcd__th">{{ t('Dimensions') }}</th>
                <th class="pcd__th pcd__num">{{ t('Debit') }}</th>
                <th class="pcd__th pcd__num">{{ t('Credit') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in lines" :key="l.key">
                <td class="pcd__td">{{ l.account }}</td>
                <td class="pcd__td">{{ l.tags || '-' }}</td>
                <td class="pcd__td pcd__num">{{ l.debit ? rupiah(l.debit) : '' }}</td>
                <td class="pcd__td pcd__num">{{ l.credit ? rupiah(l.credit) : '' }}</td>
              </tr>
              <tr class="pcd__total">
                <td class="pcd__td" colspan="2">{{ t('Total') }}</td>
                <td class="pcd__td pcd__num">{{ rupiah(totals.debit) }}</td>
                <td class="pcd__td pcd__num">{{ rupiah(totals.credit) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <div v-else class="pcd__scroll">
        <table class="pcd__table">
          <thead>
            <tr>
              <th class="pcd__th">{{ t('Journal') }}</th>
              <th class="pcd__th">{{ t('What posts') }}</th>
              <th class="pcd__th pcd__num">{{ t('Total') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="j in live" :key="j.id">
              <td class="pcd__td">{{ t('Reversal of') }} {{ j.number }}</td>
              <td class="pcd__td">{{ t('Same lines, sides swapped') }}</td>
              <td class="pcd__td pcd__num">{{ rupiah(journalTotals(j).debit) }}</td>
            </tr>
            <tr>
              <td class="pcd__td">{{ t('Payroll') }} {{ `v${cur.no}` }}</td>
              <td class="pcd__td">{{ t('Full journal from the current version') }}</td>
              <td class="pcd__td pcd__num">{{ rupiah(newTotal) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="error" class="pcd__error" role="alert" data-testid="pcd-error">{{ error }}</div>
    </template>

    <template #footer>
      <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('close')">{{ t('Cancel') }}</button>
      <button class="btn-enterprise btn-enterprise--primary" type="button" data-testid="pcd-confirm" @click="confirm">{{ title }}</button>
    </template>
  </PayrollCompareDrawerShell>
</template>

<style scoped>
.pcd__identity { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pcd__facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--mp-spacing-3) var(--mp-spacing-4); margin: 0; }
.pcd__facts dt { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pcd__facts dd { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pcd__note {
  padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-colors-background-warning);
  border-radius: var(--mp-radii-md); color: var(--mp-colors-text-warning); font-size: var(--mp-font-sizes-md);
}
.pcd__notetitle { font-weight: var(--mp-font-weights-semi-bold); margin-bottom: var(--mp-spacing-1); }
.pcd__warnlist { margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); }
.pcd__empty { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pcd__scroll { overflow-x: auto; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.pcd__table { width: 100%; border-collapse: collapse; }
.pcd__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pcd__td {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.pcd__table tbody tr:last-child .pcd__td { border-bottom: 0; }
.pcd__num { text-align: right; white-space: nowrap; }
.pcd__total .pcd__td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-neutral-subtle); }
.pcd__error {
  padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-colors-background-danger);
  border-radius: var(--mp-radii-md); color: var(--mp-text-danger); font-size: var(--mp-font-sizes-md);
}
</style>
