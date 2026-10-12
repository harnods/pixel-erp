<script setup lang="ts">
/**
 * Warnings on the run's current version: worth a look, never stop posting. Each one marked as
 * checked leaves the Post journal drawer's list. A missing pay item comes from the send, a manual
 * journal on a payroll account from the ledger, large changes and headcount from the draft review
 * (a note or an Expected mark clears those).
 */
import { computed } from 'vue'
import { MpButton } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { can, runById, currentVersionOf, runWarnings, acknowledgeWarning, clearAcknowledgement, rupiah, wib, type RunWarning } from '~/data/payrollStore'
import { successToast, errorToast } from '~/utils/toasts'
import { sectionLabel } from '~/data/payrollUiRunCopy'
import PayrollReadOnlyNote from '~/components/payroll/PayrollReadOnlyNote.vue'

const props = defineProps<{ runId: string }>()
const { t } = useLocale()

const run = computed(() => runById(props.runId))
const v = computed(() => (run.value ? currentVersionOf(run.value) : undefined))
const warnings = computed(() => runWarnings(props.runId))
const open = computed(() => warnings.value.filter((w) => !w.acknowledged).length)

const CODE_LABEL: Record<RunWarning['code'], string> = {
  'missing-component': 'Missing pay item',
  'tax-rule': 'PPh 21 check',
  'duplicate-employee': 'Same person twice',
  'hutang-gaji': 'Salaries payable',
  'negative-payable': 'Payable below Rp0',
  'large-change': 'Large change',
  'headcount': 'Headcount',
  'manual-journal': 'Manual journal',
}
function detail(w: RunWarning): string {
  const d = w.details as Record<string, unknown>
  if (w.code === 'missing-component' && typeof d.lastAmount === 'number') return `${t(sectionLabel(String(d.section ?? '')))} · ${rupiah(d.lastAmount)} ${t('in')} ${String(d.last ?? t('the last send'))}`
  if (w.code === 'headcount' && Array.isArray(d.groups)) return (d.groups as string[]).join(', ')
  return ''
}
function ack(w: RunWarning) {
  const r = acknowledgeWarning(props.runId, w.key)
  if (!r.ok) { errorToast(t(r.message ?? 'Not saved. Try again.')); return }
  successToast(t('Marked as checked'))
}
function undo(w: RunWarning) {
  const r = clearAcknowledgement(props.runId, w.key)
  if (!r.ok) { errorToast(t(r.message ?? 'Not saved. Try again.')); return }
  successToast(t('Check removed'))
}
</script>

<template>
  <section v-if="run && v" class="prw" data-tour="payroll-warnings" data-testid="payroll-warnings">
    <header class="prw__head">
      <div class="prw__title">{{ t('Warnings') }}<template v-if="warnings.length"> ({{ warnings.length }})</template></div>
      <div class="prw__sub">
        <template v-if="warnings.length">{{ open }} {{ t('of') }} {{ warnings.length }} {{ t('not checked yet') }} · {{ t('Worth a look. They don\'t stop posting.') }}</template>
        <template v-else>{{ t('No warnings on') }} v{{ v.no }}</template>
      </div>
    </header>
    <ul v-if="warnings.length" class="prw__list">
      <li v-for="w in warnings" :key="w.key" class="prw__row" :class="{ 'prw__row--done': w.acknowledged }" :data-code="w.code">
        <div class="prw__body">
          <div class="prw__msg">
            <ErpStatusBadge :status="w.code" :label="t(CODE_LABEL[w.code] ?? w.code)" :type="w.acknowledged ? 'completed' : 'warning'" />
            <span>{{ w.message }}</span>
          </div>
          <div v-if="detail(w)" class="prw__detail">{{ detail(w) }}</div>
          <div v-if="w.acknowledged" class="prw__detail">
            {{ t('Checked by') }} {{ w.acknowledged.by }} · {{ wib(w.acknowledged.at) }}<template v-if="w.acknowledged.note"> · {{ w.acknowledged.note }}</template>
          </div>
        </div>
        <div v-if="can('post')" class="prw__actions">
          <MpButton v-if="w.acknowledged" variant="ghost" is-rounded @click="undo(w)">{{ t('Undo') }}</MpButton>
          <MpButton v-else variant="secondary" is-rounded @click="ack(w)">{{ t('Mark as checked') }}</MpButton>
        </div>
      </li>
    </ul>
    <div v-if="warnings.length && !can('post')" class="prw__foot"><PayrollReadOnlyNote :text="t('Marking as checked needs a role that can post.')" /></div>
  </section>
</template>

<style scoped>
.prw { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.prw__head { padding: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.prw__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.prw__sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.prw__list { margin: 0; padding: 0; }
.prw__row {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default);
}
.prw__row:last-child { border-bottom: 0; }
.prw__row--done .prw__msg { color: var(--mp-text-secondary); }
.prw__body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.prw__msg { display: flex; align-items: baseline; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow-wrap: anywhere; }
.prw__detail { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow-wrap: anywhere; }
.prw__msg > :first-child { flex: none; }
.prw__foot { padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.prw__actions { flex: none; display: flex; gap: var(--mp-spacing-2); }
</style>
