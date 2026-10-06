<script setup lang="ts">
/**
 * Compare and fix (OD-15, OD-17): one confirm posts either fix for the current version.
 * "Post the difference" posts only changed lines by account and tag (decreases on the opposite
 * side; lines moved only by settings stay out unless ticked). "Reverse and repost" reverses
 * every live journal and posts the new version in full, both on one date. A locked period
 * dates the fix in the first open period with a correction memo and reference; the tax period
 * stays the run's own.
 */
import { MpRadio, MpCheckbox } from '@mekari/pixel3'
import PayrollCompareDrawerShell from '~/components/payroll/PayrollCompareDrawerShell.vue'
import {
  runById, versionOf, currentVersionOf, liveJournals, compareVersions, postDifference, reverseAndRepost,
  journalTotals, isLocked, firstOpenAfter, monthLabel, dateLabel, periodLabel, rupiah, accountLabel, tagsLabel, draftOf, currentSnapshotId,
} from '~/data/payrollStore'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ isOpen: boolean; runId: string }>()
const emit = defineEmits<{ close: [] }>()
const { t } = useLocale()

type Fix = 'difference' | 'repost'
const fix = ref<Fix>('difference')
const includeMoves = ref(false)
const error = ref('')
watch(() => props.isOpen, (o) => { if (o) { fix.value = 'difference'; includeMoves.value = false; error.value = '' } })

const run = computed(() => runById(props.runId))
const cur = computed(() => (run.value ? currentVersionOf(run.value) : undefined))
const ledgerV = computed(() => (run.value ? versionOf(run.value, run.value.ledgerVersion) : undefined))
const live = computed(() => (run.value ? liveJournals(run.value.id) : []))
/** compareVersions draws ids from the store sequence, so it runs from a watch, never a computed. */
const data = shallowRef<ReturnType<typeof compareVersions> | null>(null)
const fingerprint = computed(() => JSON.stringify([props.isOpen, props.runId, ledgerV.value?.no, cur.value?.no, cur.value?.state, live.value.map((j) => j.id), currentSnapshotId()]))
watch(fingerprint, () => {
  data.value = null
  if (!props.isOpen || !run.value || !cur.value || !ledgerV.value || cur.value.no === ledgerV.value.no) return
  try { data.value = compareVersions(props.runId, ledgerV.value.no, cur.value.no) } catch { data.value = null }
}, { immediate: true })

/** Difference lines: the change less what settings alone moved, unless the moves are included. */
const diffLines = computed(() => {
  const d = data.value
  if (!d) return []
  const moved = new Map(d.settingsMoved.map((r) => [r.key, r.diff]))
  const keys = new Set([...d.byAccountTag.map((r) => r.key), ...moved.keys()])
  const byKey = new Map([...d.byAccountTag, ...d.settingsMoved].map((r) => [r.key, r]))
  return [...keys].map((k) => {
    const r = byKey.get(k)!
    const full = d.byAccountTag.find((x) => x.key === k)?.diff ?? 0
    const amt = includeMoves.value ? full : full - (moved.get(k) ?? 0)
    return { key: k, account: accountLabel(r.account), tags: tagsLabel(r.tags), debit: amt > 0 ? amt : 0, credit: amt < 0 ? -amt : 0 }
  }).filter((l) => l.debit || l.credit)
})
const diffTotals = computed(() => ({ debit: diffLines.value.reduce((s, l) => s + l.debit, 0), credit: diffLines.value.reduce((s, l) => s + l.credit, 0) }))
const newTotal = computed(() => { const d = run.value ? draftOf(run.value) : null; return d ? journalTotals(d).debit : 0 })

const locked = computed(() => !!run.value && isLocked(run.value.month))
const postDate = computed(() => (run.value ? (locked.value ? `${firstOpenAfter(run.value.month)}-01` : run.value.end) : ''))
const sentDate = (iso: string) => dateLabel(new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10))
const memo = computed(() => {
  const r = run.value, v = cur.value, l = ledgerV.value
  if (!r || !v || !l) return ''
  if (locked.value) return `Correction of payroll ${periodLabel(r.start, r.end)} v${l.no}${live.value[0] ? ` (${live.value[0].number})` : ''}, from v${v.no} sent ${sentDate(v.sentAt)}`
  return fix.value === 'difference' ? `Difference v${l.no} to v${v.no}` : `Payroll ${periodLabel(r.start, r.end)} v${v.no}`
})

function confirm() {
  error.value = ''
  const r = fix.value === 'difference'
    ? postDifference(props.runId, cur.value?.no, { includeSettingsMoves: includeMoves.value })
    : reverseAndRepost(props.runId, cur.value?.no)
  if (!r.ok) { error.value = t(r.message ?? 'The fix did not post. Nothing changed.'); return }
  const nos = (r.journals as string[] | undefined) ?? []
  successToast(nos.length ? t(`${nos.join(', ')} posted`) : t('No ledger change'))
  emit('close')
}
</script>

<template>
  <PayrollCompareDrawerShell :is-open="isOpen" :title="t('Compare and fix')" wide @close="emit('close')">
    <template v-if="run && cur && ledgerV">
      <div class="pcf__identity">
        {{ t(`${periodLabel(run.start, run.end)} · v${ledgerV.no} in the ledger as ${live.map((j) => j.number).join(', ')} · fix to v${cur.no}`) }}
      </div>

      <div class="pcf__choices" role="radiogroup">
        <label class="pcf__choice" :class="{ 'pcf__choice--on': fix === 'difference' }">
          <MpRadio id="pcf-difference" name="pcf-fix" :is-checked="fix === 'difference'" @change="fix = 'difference'" />
          <span>
            <span class="pcf__choicetitle">{{ t('Post the difference') }}</span>
            <span class="pcf__choicesub">{{ t('Posts only the changed lines. Decreases post on the opposite side.') }}</span>
          </span>
        </label>
        <label class="pcf__choice" :class="{ 'pcf__choice--on': fix === 'repost' }">
          <MpRadio id="pcf-repost" name="pcf-fix" :is-checked="fix === 'repost'" @change="fix = 'repost'" />
          <span>
            <span class="pcf__choicetitle">{{ t('Reverse and repost') }}</span>
            <span class="pcf__choicesub">{{ t(`Reverses ${live.map((j) => j.number).join(' and ')} and posts v${cur.no} in full, on one date.`) }}</span>
          </span>
        </label>
      </div>

      <dl class="pcf__facts">
        <div><dt>{{ t('Journal date') }}</dt><dd data-testid="pcf-date">{{ dateLabel(postDate) }}</dd></div>
        <div><dt>{{ t('Tax period') }}</dt><dd>{{ monthLabel(run.month) }}</dd></div>
        <div v-if="locked"><dt>{{ t('Reference') }}</dt><dd>{{ monthLabel(run.month) }}</dd></div>
        <div class="pcf__memo"><dt>{{ t('Memo') }}</dt><dd>{{ memo }}</dd></div>
      </dl>
      <div v-if="locked" class="pcf__note" data-testid="pcf-locked">
        {{ t(`${monthLabel(run.month)} is locked. The fix posts on ${dateLabel(postDate)} in ${monthLabel(firstOpenAfter(run.month))}, the first open period. Memo and reference can't be removed.`) }}
      </div>

      <template v-if="fix === 'difference'">
        <label v-if="data && data.settingsMoved.length" class="pcf__check">
          <MpCheckbox id="pcf-moves" :is-checked="includeMoves" @change="includeMoves = !includeMoves" />
          <span>{{ t(`Include ${data.settingsMoved.length} lines moved by settings change`) }}</span>
        </label>
        <div v-if="!diffLines.length" class="pcf__empty">{{ t('Rp0 by account and dimension. Nothing posts; the log shows No ledger change.') }}</div>
        <div v-else class="pcf__scroll">
          <table class="pcf__table">
            <thead>
              <tr>
                <th class="pcf__th">{{ t('Account') }}</th>
                <th class="pcf__th">{{ t('Dimensions') }}</th>
                <th class="pcf__th pcf__num">{{ t('Debit') }}</th>
                <th class="pcf__th pcf__num">{{ t('Credit') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in diffLines" :key="l.key">
                <td class="pcf__td">{{ l.account }}</td>
                <td class="pcf__td">{{ l.tags || '-' }}</td>
                <td class="pcf__td pcf__num">{{ l.debit ? rupiah(l.debit) : '' }}</td>
                <td class="pcf__td pcf__num">{{ l.credit ? rupiah(l.credit) : '' }}</td>
              </tr>
              <tr class="pcf__total">
                <td class="pcf__td" colspan="2">{{ t('Total') }}</td>
                <td class="pcf__td pcf__num">{{ rupiah(diffTotals.debit) }}</td>
                <td class="pcf__td pcf__num">{{ rupiah(diffTotals.credit) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </template>
      <div v-else class="pcf__scroll">
        <table class="pcf__table">
          <thead>
            <tr>
              <th class="pcf__th">{{ t('Journal') }}</th>
              <th class="pcf__th">{{ t('What posts') }}</th>
              <th class="pcf__th pcf__num">{{ t('Total') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="j in live" :key="j.id">
              <td class="pcf__td">{{ t(`Reversal of ${j.number}`) }}</td>
              <td class="pcf__td">{{ t('Same lines, sides swapped') }}</td>
              <td class="pcf__td pcf__num">{{ rupiah(journalTotals(j).debit) }}</td>
            </tr>
            <tr>
              <td class="pcf__td">{{ t(`Payroll v${cur.no}`) }}</td>
              <td class="pcf__td">{{ t('Full journal from the new version') }}</td>
              <td class="pcf__td pcf__num">{{ rupiah(newTotal) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div v-if="error" class="pcf__error" role="alert" data-testid="pcf-error">{{ error }}</div>
    </template>

    <template #footer>
      <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="emit('close')">{{ t('Cancel') }}</button>
      <button class="btn-enterprise btn-enterprise--primary" type="button" data-testid="pcf-confirm" @click="confirm">
        {{ fix === 'difference' ? t('Post the difference') : t('Reverse and repost') }}
      </button>
    </template>
  </PayrollCompareDrawerShell>
</template>

<style scoped>
.pcf__identity { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pcf__choices { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-3); }
.pcf__choice {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3); cursor: pointer;
  padding: var(--mp-spacing-3) var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
}
.pcf__choice--on { border-color: var(--mp-colors-border-brand, var(--mp-border-default)); background: var(--mp-background-neutral-subtle); }
.pcf__choicetitle { display: block; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pcf__choicesub { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.pcf__facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--mp-spacing-3) var(--mp-spacing-4); margin: 0; }
.pcf__facts dt { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pcf__facts dd { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pcf__memo { grid-column: 1 / -1; }
.pcf__note {
  padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-colors-background-warning);
  border-radius: var(--mp-radii-md); color: var(--mp-colors-text-warning); font-size: var(--mp-font-sizes-md);
}
.pcf__check { display: flex; align-items: center; gap: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer; }
.pcf__empty { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pcf__scroll { overflow-x: auto; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.pcf__table { width: 100%; border-collapse: collapse; }
.pcf__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pcf__td {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.pcf__table tbody tr:last-child .pcf__td { border-bottom: 0; }
.pcf__num { text-align: right; white-space: nowrap; }
.pcf__total .pcf__td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-neutral-subtle); }
.pcf__error {
  padding: var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-colors-background-danger);
  border-radius: var(--mp-radii-md); color: var(--mp-text-danger); font-size: var(--mp-font-sizes-md);
}
</style>
