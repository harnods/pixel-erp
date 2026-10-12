<script setup lang="ts">
/**
 * Correction notice (TS-07, OD-15): Talenta re-sent a posted period, the latest version wins and
 * Jurnal built the correction (difference only). The summary says what moved: take-home pay,
 * PPh 21, PPh 26, BPJS, the staff who joined, left or changed amount (employee_id), and the
 * accounts and dimensions the correction posts to. "Post correction" is the primary action;
 * "Reverse and repost" sits under More.
 */
import { computed, ref } from 'vue'
import { MpButton, MpIcon, MpBadge, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem } from '@mekari/pixel3'
import PayrollCorrectionDrawer from '~/components/payroll/PayrollCorrectionDrawer.vue'
import {
  can, runById, correctionOf, currentVersionOf, liveJournals, isLocked, firstOpenAfter, pph21Month,
  monthLabel, dateLabel, rupiah, wib, accountLabel, tagsLabel, listLabel,
} from '~/data/payrollStore'

const props = defineProps<{ runId: string }>()
const { t } = useLocale()

const run = computed(() => runById(props.runId))
const corr = computed(() => correctionOf(props.runId))
const cur = computed(() => (run.value ? currentVersionOf(run.value) : undefined))
const live = computed(() => (run.value ? liveJournals(run.value.id) : []))
const s = computed(() => corr.value?.summary ?? null)
const locked = computed(() => !!run.value && isLocked(run.value.month))
const filed = computed(() => !!run.value && pph21Month(run.value.month).filed != null)
const partial = computed(() => !!run.value?.versions.some((v) => v.state === 'partial'))
const superseded = computed(() => (run.value?.versions ?? []).filter((v) => v.state === 'superseded').map((v) => `v${v.no}`))
const total = computed(() => (corr.value?.lines ?? []).reduce((x, l) => x + l.debit, 0))
const sign = (n: number) => (n > 0 ? `+${rupiah(n)}` : n < 0 ? `-${rupiah(-n)}` : rupiah(0))

const figures = computed(() => (s.value ? [
  { key: 'thp', label: 'Take-home pay', x: s.value.takeHome },
  { key: 'pph21', label: 'PPh 21', x: s.value.pph21 },
  { key: 'pph26', label: 'PPh 26', x: s.value.pph26 },
  { key: 'bpjs', label: 'BPJS', x: s.value.bpjs },
] : []))
const people = computed(() => (s.value ? [
  { key: 'joined', label: 'Joined', ids: s.value.joined },
  { key: 'left', label: 'Left', ids: s.value.left },
  { key: 'amount', label: 'Amount changed', ids: s.value.amountChanged },
] : []))
const staffCount = computed(() => people.value.reduce((n, p) => n + p.ids.length, 0))

const drawer = ref<'correction' | 'repost' | null>(null)
function showCompare() { document.getElementById('prp-compare')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
</script>

<template>
  <section v-if="run && s && cur" class="pcn" data-tour="payroll-correction" data-testid="payroll-correction">
    <div class="pcn__top">
      <MpIcon name="warning-circular" size="md" />
      <div class="pcn__intro">
        <div class="pcn__title">
          {{ t('Correction ready') }}
          <MpBadge variant="subtle" variant-color="orange">{{ `v${s.toVersion}` }} {{ t('sent') }} {{ wib(cur.sentAt) }}</MpBadge>
        </div>
        <div class="pcn__text">
          {{ t('Talenta sent') }} {{ `v${s.toVersion}` }}; {{ `v${s.fromVersion}` }} {{ t('is posted as') }} {{ listLabel(live.map((j) => j.number)) }}.
          {{ t('The correction posts the difference') }}: {{ rupiah(total) }} {{ t('on') }} {{ corr?.lines.length ?? 0 }} {{ t((corr?.lines.length ?? 0) === 1 ? 'line' : 'lines') }}.
        </div>
      </div>
      <div class="pcn__actions">
        <MpButton v-if="run.versions.length > 1" variant="secondary" is-rounded @click="showCompare">{{ t('Compare versions') }}</MpButton>
        <MpPopover v-if="can('fix') && !partial" id="pcn-more" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="secondary" is-rounded right-icon="chevrons-down">{{ t('More') }}</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent class="erp-dropdown-menu">
            <MpPopoverList>
              <MpPopoverListItem data-testid="pcn-repost" @click="drawer = 'repost'">{{ t('Reverse and repost') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
        <MpButton v-if="can('fix') && !partial" is-rounded data-testid="pcn-post" @click="drawer = 'correction'">{{ t('Post correction') }}</MpButton>
      </div>
    </div>

    <div class="pcn__grid">
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
          <span class="pcn__lead">{{ t(p.label) }} ({{ p.ids.length }})</span>
          <span class="pcn__ids">{{ p.ids.length ? p.ids.join(', ') : t('None') }}</span>
        </li>
      </ul>
    </div>

    <div class="pcn__block">
      <div class="pcn__blocktitle">{{ t('Accounts and dimensions that move') }} · {{ s.moved.length }}</div>
      <ul v-if="s.moved.length" class="pcn__list">
        <li v-for="m in s.moved" :key="`${m.account}-${m.label}`">
          <span class="pcn__ids">{{ accountLabel(m.account) }}<template v-if="tagsLabel(m.tags)"> | {{ tagsLabel(m.tags) }}</template></span>
          <span class="pcn__amount">{{ m.change >= 0 ? t('Debit') : t('Credit') }} {{ rupiah(Math.abs(m.change)) }}</span>
        </li>
      </ul>
      <div v-else class="pcn__muted">{{ t('No account moves') }}</div>
    </div>

    <div v-if="s.settingsChanged || locked || filed || superseded.length || partial" class="pcn__notes">
      <div v-if="s.settingsChanged">{{ t('Settings changed since the posted journal was built; part of this correction is the settings change.') }}</div>
      <div v-if="locked">{{ monthLabel(run.month) }} {{ t('is locked. The correction posts on') }} {{ dateLabel(`${firstOpenAfter(run.month)}-01`) }} {{ t('with a correction memo; the tax month stays') }} {{ monthLabel(run.month) }}.</div>
      <div v-if="filed">{{ t('PPh 21 for') }} {{ monthLabel(run.month) }} {{ t('is filed. A PPh 21 change opens an amendment task for Tax Staff.') }}</div>
      <div v-if="superseded.length">{{ superseded.join(', ') }}: {{ t('superseded, not posted.') }}</div>
      <div v-if="partial">{{ t('A later send looks partial. Replace the full run or reject it before posting the correction.') }}</div>
    </div>

    <PayrollCorrectionDrawer :mode="drawer ?? 'correction'" :is-open="drawer !== null" :run-id="runId" @close="drawer = null" />
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
.pcn__amount { flex: none; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pcn__muted { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pcn__notes {
  display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-radius: var(--mp-radii-md); background: var(--mp-colors-background-warning); color: var(--mp-colors-text-warning); font-size: var(--mp-font-sizes-sm);
}
</style>
