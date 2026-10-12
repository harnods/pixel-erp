<script setup lang="ts">
/**
 * "Talenta sent this period again": a posted period arrived again and the latest version is
 * current. Says what changes (take-home pay, PPh 21, PPh 26, BPJS, staff joined / left / amount
 * changed as counts, the accounts and dimensions that move). "Use vN and repost" reverses the
 * posted journal in full and posts the chosen version in full on one journal date.
 */
import { computed, ref } from 'vue'
import { MpButton, MpIcon } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import PayrollReadOnlyNote from '~/components/payroll/PayrollReadOnlyNote.vue'
import PayrollPostDrawer from '~/components/payroll/PayrollPostDrawer.vue'
import {
  can, runById, revisionOf, currentVersionOf, pendingApproval, liveJournals,
  rupiah, wib, accountLabel, tagsLabel, listLabel,
} from '~/data/payrollStore'
import { infoToast } from '~/utils/toasts'

const props = defineProps<{ runId: string }>()
const emit = defineEmits<{ compare: [] }>()
const { t } = useLocale()

const run = computed(() => runById(props.runId))
const rev = computed(() => revisionOf(props.runId))
const cur = computed(() => (run.value ? currentVersionOf(run.value) : undefined))
const live = computed(() => (run.value ? liveJournals(run.value.id) : []))
const s = computed(() => rev.value?.summary ?? null)
const partial = computed(() => !!run.value?.versions.some((v) => v.state === 'partial'))
const awaiting = computed(() => !!run.value && !!pendingApproval(run.value))
const sign = (n: number) => (n > 0 ? `+${rupiah(n)}` : n < 0 ? `-${rupiah(-n)}` : rupiah(0))

const figures = computed(() => (s.value ? [
  { key: 'thp', label: 'Take-home pay', x: s.value.takeHome },
  { key: 'pph21', label: 'PPh 21 (income tax)', x: s.value.pph21 },
  { key: 'pph26', label: 'PPh 26 (foreign staff)', x: s.value.pph26 },
  { key: 'bpjs', label: 'BPJS (state insurance)', x: s.value.bpjs },
] : []))
const people = computed(() => (s.value ? [
  { key: 'joined', label: 'Joined', count: s.value.joined },
  { key: 'left', label: 'Left', count: s.value.left },
  { key: 'amount', label: 'Amount changed', count: s.value.amountChanged },
] : []))
const staffCount = computed(() => people.value.reduce((n, p) => n + p.count, 0))
function seeInTalenta() { infoToast(t('Opens Talenta')) }

const open = ref(false)
function showCompare() { emit('compare') }
</script>

<template>
  <section v-if="run && s && cur" class="pcn" data-tour="payroll-revision" data-testid="payroll-revision">
    <div class="pcn__top">
      <MpIcon name="warning-circular" size="md" />
      <div class="pcn__intro">
        <div class="pcn__title">
          {{ t('Talenta sent this period again') }}
          <ErpStatusBadge status="Revision ready" :label="`v${s.toVersion} ${t('sent')} ${wib(cur.sentAt)}`" type="warning" />
        </div>
        <div class="pcn__text">
          {{ `v${s.fromVersion}` }} {{ t('is posted as') }} {{ listLabel(live.map((j) => j.number)) }}. {{ t(`Use v${s.toVersion} and repost to replace it in full.`) }}
        </div>
      </div>
      <div class="pcn__actions">
        <MpButton v-if="run.versions.length > 1" variant="secondary" is-rounded @click="showCompare">{{ t('Compare versions') }}</MpButton>
        <MpButton v-if="can('correct') && !partial && !awaiting" is-rounded data-testid="pcn-repost" data-tour="payroll-repost" @click="open = true">{{ t(`Use v${s.toVersion} and repost`) }}</MpButton>
      </div>
    </div>

    <PayrollReadOnlyNote v-if="!can('correct')" :text="t('Reposting needs Owner, Ultimate + LM or Accountant + LM.')" />

    <div class="pcn__grid" data-tour="payroll-correction">
      <div v-for="f in figures" :key="f.key" class="pcn__fig" :data-figure="f.key">
        <div class="pcn__figlabel">{{ t(f.label) }}</div>
        <div class="pcn__figvalue" :class="{ 'pcn__figvalue--zero': !f.x.change }">{{ sign(f.x.change) }}</div>
        <div class="pcn__figsub">{{ rupiah(f.x.before) }} {{ t('to') }} {{ rupiah(f.x.after) }}</div>
      </div>
    </div>

    <div class="pcn__block">
      <div class="pcn__blocktitle">{{ t('Staff') }} · {{ staffCount }} {{ t('changed') }}</div>
      <ul class="pcn__list">
        <li v-for="p in people" :key="p.key" :data-people="p.key">
          <span class="pcn__lead">{{ t(p.label) }}</span>
          <span class="pcn__ids">{{ p.count }} {{ t('staff') }}</span>
        </li>
      </ul>
      <span v-if="staffCount" class="cell-link pcn__seewho" data-testid="pcn-see-who" @click="seeInTalenta">{{ t('See who in Talenta') }}</span>
    </div>

    <div class="pcn__block">
      <div class="pcn__blocktitle">{{ t('Accounts and dimensions that change') }} · {{ s.moved.length }}</div>
      <ul v-if="s.moved.length" class="pcn__list">
        <li v-for="m in s.moved" :key="`${m.account}-${m.label}`">
          <span class="pcn__ids">{{ accountLabel(m.account) }}<template v-if="tagsLabel(m.tags)"> | {{ tagsLabel(m.tags) }}</template></span>
          <span class="pcn__amount">{{ m.change >= 0 ? t('Debit') : t('Credit') }} {{ rupiah(Math.abs(m.change)) }}</span>
        </li>
      </ul>
      <div v-else class="pcn__muted">{{ t('No account changes') }}</div>
    </div>

    <div v-if="s.settingsChanged || partial" class="pcn__notes">
      <div v-if="s.settingsChanged">{{ t('Settings changed after the posted journal, so part of this change comes from settings.') }}</div>
      <div v-if="partial">{{ t('A later send looks like part of the run. Use it as the full run or reject it first.') }}</div>
    </div>

    <PayrollPostDrawer mode="repost" :is-open="open" :run-id="runId" @close="open = false" />
  </section>
</template>

<style scoped>
.pcn {
  display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral);
}
.pcn__top { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); color: var(--mp-colors-text-warning); }
.pcn__intro { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.pcn__title { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pcn__text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow-wrap: anywhere; }
.pcn__actions { flex: none; display: flex; gap: var(--mp-spacing-2); align-items: center; }
.pcn__grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.pcn__fig { padding: var(--mp-spacing-3) var(--mp-spacing-4); border-right: 1px solid var(--mp-border-default); display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.pcn__fig:last-child { border-right: 0; }
.pcn__figlabel { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pcn__figvalue { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; white-space: nowrap; }
.pcn__figvalue--zero { color: var(--mp-text-secondary); }
.pcn__figsub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.pcn__block { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.pcn__blocktitle { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; }
.pcn__list { margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.pcn__list li { display: flex; gap: var(--mp-spacing-3); justify-content: space-between; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pcn__lead { flex: none; width: 168px; color: var(--mp-text-secondary); }
.pcn__ids { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.pcn__seewho { align-self: flex-start; }
.pcn__amount { flex: none; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pcn__muted { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pcn__notes {
  display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-radius: var(--mp-radii-md); background: var(--mp-colors-background-warning); color: var(--mp-colors-text-warning); font-size: var(--mp-font-sizes-sm);
}
</style>
