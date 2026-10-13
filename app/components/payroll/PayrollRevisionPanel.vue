<script setup lang="ts">
/**
 * Notices on a run that are neither a fix nor a warning: a later send looks like part of the
 * run, and a run reversed but not posted again. The journals list lives in the Journals tab and the
 * version compare in the Versions tab.
 */
import { MpButton, MpIcon } from '@mekari/pixel3'
import PayrollReadOnlyNote from '~/components/payroll/PayrollReadOnlyNote.vue'
import {
  runById, liveJournals, journalTotals, versionOf, currentVersionOf, runStatus, postRun, draftOf,
  can, monthLabel, rupiah, wib, today, addDays, revisionOf,
} from '~/data/payrollStore'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ runId: string }>()
const { t } = useLocale()

const run = computed(() => runById(props.runId))
const status = computed(() => (run.value ? runStatus(run.value) : null))
const live = computed(() => (run.value ? liveJournals(run.value.id) : []))
const ledgerV = computed(() => (run.value ? versionOf(run.value, run.value.ledgerVersion) : undefined))
const cur = computed(() => (run.value ? currentVersionOf(run.value) : undefined))

const partial = computed(() => run.value?.versions.find((v) => v.state === 'partial'))
const waiting = computed(() => run.value?.versions.find((v) => v.state === 'waiting-choice'))
const hasRevision = computed(() => !!revisionOf(props.runId))
const partialText = computed(() => {
  const d = partial.value?.holds[0]?.details as { before?: number; after?: number } | undefined
  return partial.value && d ? t(`v${partial.value.no} has ${d.after} of ${d.before} staff. Use it as the full run or reject it before you repost.`) : ''
})

// ── Reversed, not reposted ──────────────────────────────────────────────────
function workingDaysSince(iso: string): number {
  let d = new Date(Date.parse(iso) + 7 * 3_600_000).toISOString().slice(0, 10)
  const end = today()
  let n = 0
  while (d < end) {
    d = addDays(d, 1)
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay()
    if (wd !== 0 && wd !== 6) n++
  }
  return n
}
const reversedNotReposted = computed(() => {
  const r = run.value
  if (!r || !r.reversedAt || live.value.length) return null
  const d = draftOf(r)
  return { at: wib(r.reversedAt), days: workingDaysSince(r.reversedAt), amount: d ? journalTotals(d).debit : 0 }
})
const repostError = ref('')
function repost() {
  repostError.value = ''
  const r = postRun(props.runId)
  if (!r.ok) { repostError.value = t(r.message ?? 'Not posted. Check the journal date and try again.'); return }
  successToast(t(`${r.number} posted`))
}
const visible = computed(() => (!!partial.value && !!ledgerV.value && !hasRevision.value && !waiting.value) || !!reversedNotReposted.value)
</script>

<template>
  <div v-if="run && visible" class="prp" data-testid="payroll-revision-panel">
    <!-- The same-run-or-separate choice itself is in To fix before posting; this panel adds nothing for it. -->
    <section v-if="partial && ledgerV && !hasRevision && !waiting" class="prp__notice prp__notice--warn" data-testid="prp-partial">
      <MpIcon name="warning-circular" size="md" />
      <div class="prp__noticebody">
        <div class="prp__noticetitle">{{ t('Looks like part of the run') }}</div>
        <div>{{ partialText }}</div>
      </div>
    </section>

    <!-- Reversed, not reposted -->
    <section v-if="reversedNotReposted" class="prp__notice prp__notice--danger" data-testid="prp-reversed">
      <MpIcon name="error" size="md" />
      <div class="prp__noticebody">
        <div class="prp__noticetitle">{{ t(`Reversed, not reposted: ${rupiah(reversedNotReposted.amount)}`) }}</div>
        <div>{{ t(`Reversed ${reversedNotReposted.at}. Payables for ${monthLabel(run.month)} show nothing owed until you post again.`) }}</div>
        <div v-if="reversedNotReposted.days >= 2" class="prp__noticesub">{{ t(`${reversedNotReposted.days} working days since the reversal.`) }}</div>
        <div v-if="repostError" class="prp__noticeerror" role="alert">{{ repostError }}</div>
        <PayrollReadOnlyNote v-if="!can('post') && cur?.draft && status === 'Reversed'" :text="t('Only the Owner or a user with LM can post.')" />
      </div>
      <div v-if="can('post') && cur?.draft && status === 'Reversed'" class="prp__noticeactions">
        <MpButton is-rounded data-testid="prp-repost" @click="repost">{{ t('Post journal') }} v{{ cur.no }}</MpButton>
      </div>
    </section>
  </div>
</template>

<style scoped>
.prp { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.prp__notice {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md);
}
.prp__notice--warn { background: var(--mp-colors-background-warning); color: var(--mp-colors-text-warning); }
.prp__notice--info { background: var(--mp-background-neutral-subtle); color: var(--mp-text-default); border: 1px solid var(--mp-border-default); }
.prp__notice--danger { background: var(--mp-colors-background-danger); color: var(--mp-text-danger); }
.prp__noticebody { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.prp__noticetitle { font-weight: var(--mp-font-weights-semi-bold); }
.prp__noticesub { font-size: var(--mp-font-sizes-sm); }
.prp__noticeerror { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); }
.prp__noticeactions { flex: none; display: flex; gap: var(--mp-spacing-2); }
</style>
