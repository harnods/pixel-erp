<script setup lang="ts">
/**
 * Warnings on the run's current version (OD-12). Warnings never block Post; each one the
 * Accountant acknowledges leaves the Post confirm text. Missing components come from the send
 * ("PPH 21 Paid not in this send"), manual journals on payroll accounts from the ledger, large
 * changes and headcount from the draft review (a note or an Expected mark clears those).
 */
import { computed } from 'vue'
import { MpButton } from '@mekari/pixel3'
import { can, runById, currentVersionOf, runWarnings, acknowledgeWarning, clearAcknowledgement, rupiah, wib, type RunWarning } from '~/data/payrollStore'
import { successToast, errorToast } from '~/utils/toasts'

const props = defineProps<{ runId: string }>()
const { t } = useLocale()

const run = computed(() => runById(props.runId))
const v = computed(() => (run.value ? currentVersionOf(run.value) : undefined))
const warnings = computed(() => runWarnings(props.runId))
const open = computed(() => warnings.value.filter((w) => !w.acknowledged).length)

const CODE_LABEL: Record<RunWarning['code'], string> = {
  'missing-component': 'Missing component',
  'tax-rule': 'Tax rule',
  'duplicate-employee': 'Duplicate employee',
  'hutang-gaji': 'Hutang Gaji',
  'negative-payable': 'Payable below Rp0',
  'large-change': 'Large change',
  'headcount': 'Headcount',
  'manual-journal': 'Manual journal',
}
function detail(w: RunWarning): string {
  const d = w.details as Record<string, unknown>
  if (w.code === 'missing-component' && typeof d.lastAmount === 'number') return `${String(d.section ?? '')} · ${rupiah(d.lastAmount)} in ${String(d.last ?? 'the last send')}`
  if (w.code === 'headcount' && Array.isArray(d.groups)) return (d.groups as string[]).join(', ')
  return ''
}
function ack(w: RunWarning) {
  const r = acknowledgeWarning(props.runId, w.key)
  if (!r.ok) { errorToast(t(r.message ?? 'Not acknowledged')); return }
  successToast(t('Warning acknowledged'))
}
function undo(w: RunWarning) {
  const r = clearAcknowledgement(props.runId, w.key)
  if (!r.ok) { errorToast(t(r.message ?? 'Not changed')); return }
  successToast(t('Acknowledgement removed'))
}
</script>

<template>
  <section v-if="run && v" class="prw" data-tour="payroll-warnings" data-testid="payroll-warnings">
    <header class="prw__head">
      <div class="prw__title">{{ t('Warnings') }}</div>
      <div class="prw__sub">
        <template v-if="warnings.length">{{ `v${v.no}` }} · {{ warnings.length }} {{ t(warnings.length === 1 ? 'warning' : 'warnings') }} · {{ open }} {{ t('not acknowledged') }} · {{ t('Warnings never block Post') }}</template>
        <template v-else>{{ `v${v.no}` }} · {{ t('No warnings') }}</template>
      </div>
    </header>
    <ul v-if="warnings.length" class="prw__list">
      <li v-for="w in warnings" :key="w.key" class="prw__row" :class="{ 'prw__row--done': w.acknowledged }" :data-code="w.code">
        <div class="prw__body">
          <div class="prw__msg">
            <span class="prw__tag" :class="{ 'prw__tag--ok': w.acknowledged }">{{ t(CODE_LABEL[w.code] ?? w.code) }}</span>
            <span>{{ w.message }}</span>
          </div>
          <div v-if="detail(w)" class="prw__detail">{{ detail(w) }}</div>
          <div v-if="w.acknowledged" class="prw__detail">
            {{ t('Acknowledged by') }} {{ w.acknowledged.by }} · {{ wib(w.acknowledged.at) }}<template v-if="w.acknowledged.note"> · {{ w.acknowledged.note }}</template>
          </div>
        </div>
        <div v-if="can('warning.ack')" class="prw__actions">
          <MpButton v-if="w.acknowledged" variant="ghost" is-rounded @click="undo(w)">{{ t('Undo') }}</MpButton>
          <MpButton v-else variant="secondary" is-rounded @click="ack(w)">{{ t('Acknowledge') }}</MpButton>
        </div>
      </li>
    </ul>
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
.prw__tag {
  flex: none; display: inline-block; padding: 0 var(--mp-spacing-2); border-radius: var(--mp-radii-full);
  font-size: var(--mp-font-sizes-sm); white-space: nowrap;
  background: var(--mp-colors-background-warning); color: var(--mp-colors-text-warning);
}
.prw__tag--ok { background: var(--mp-colors-background-success); color: var(--mp-colors-text-success); }
.prw__actions { flex: none; display: flex; gap: var(--mp-spacing-2); }
</style>
