<script setup lang="ts">
/**
 * Version compare (OD-15): any two versions of a run, by pay item or by account and tag, with
 * unchanged rows hidden. The old side reads the posted lines when it is the version in the
 * ledger; lines moved only by a settings change sit apart (TN-06). Headcount counts added and
 * removed staff by group, and the PPh 21 change panel totals the tax moves, no employee data
 * (TN-22), with PPh 26 and DTP apart from PPh 21.
 */
import { MpSegmentedControl } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import {
  runById, compareVersions, versionLabel, rupiah, monthLabel, wib, accountLabel, tagsLabel, liveJournals, currentSnapshotId, type Tags,
} from '~/data/payrollStore'

const props = defineProps<{ runId: string }>()
const { t } = useLocale()

const run = computed(() => runById(props.runId))
const versionOptions = computed(() => (run.value?.versions ?? []).map((v) => ({ value: String(v.no), label: `v${v.no} · ${versionLabel(run.value!, v)}` })))

const oldNo = ref('')
const newNo = ref('')
function resetPair() { oldNo.value = ''; newNo.value = '' }
watch(() => [props.runId, run.value?.versions.length, run.value?.ledgerVersion], resetPair)

const cmp = shallowRef<{ ok: true; data: ReturnType<typeof compareVersions> } | { ok: false } | null>(null)
/**
 * compareVersions builds journals, which draws ids from the store sequence. Called inside a
 * computed it would invalidate itself, so it runs from a watch keyed on what can change it.
 */
const fingerprint = computed(() => {
  const r = run.value
  if (!r) return ''
  return JSON.stringify([props.runId, oldNo.value, newNo.value, r.versions.map((v) => `${v.no}${v.state}`), r.ledgerVersion, r.currentVersion,
    liveJournals(r.id).map((j) => j.id), currentSnapshotId()])
})
watch(fingerprint, () => {
  const r = run.value
  if (!r || r.versions.length < 2) { cmp.value = null; return }
  try {
    const latest = r.versions[r.versions.length - 1]!.no
    // After a fix the ledger reflects the latest version; show what that fix changed.
    const prev = r.ledgerVersion === latest ? [...r.versions].reverse().find((v) => v.no < latest && v.state !== 'rejected')?.no : undefined
    const a = oldNo.value ? Number(oldNo.value) : prev
    const b = newNo.value ? Number(newNo.value) : undefined
    cmp.value = { ok: true, data: compareVersions(props.runId, a, b) }
  } catch {
    cmp.value = { ok: false }
  }
}, { immediate: true })
const data = computed(() => (cmp.value?.ok ? cmp.value.data : null))
const selOld = computed({ get: () => oldNo.value || String(data.value?.oldNo ?? ''), set: (v: string) => { oldNo.value = v } })
const selNew = computed({ get: () => newNo.value || String(data.value?.newNo ?? ''), set: (v: string) => { newNo.value = v } })

const view = ref<'item' | 'account'>('account')
const viewOptions = [
  { id: 'pcv-account', value: 'account', label: 'By account and dimension' },
  { id: 'pcv-item', value: 'item', label: 'By pay item' },
]

const SECTION: Record<string, string> = { allowance: 'Allowance', deduction: 'Deduction', benefit: 'Benefit' }
const signed = (n: number) => (n > 0 ? `+${rupiah(n)}` : rupiah(n))
/** Ledger amounts are debit-positive; show them on their side. */
const sided = (n: number) => (n === 0 ? rupiah(0) : `${rupiah(Math.abs(n))} ${n > 0 ? 'Dr' : 'Cr'}`)
const lineLabel = (r: { account: string; tags: Tags }) => ({ account: accountLabel(r.account), tags: tagsLabel(r.tags) })

/** Lines a difference post would carry: the change less what settings alone moved. */
const settingsKeys = computed(() => new Set((data.value?.settingsMoved ?? []).map((r) => r.key)))
const accountRows = computed(() => (data.value?.byAccountTag ?? []).map((r) => ({ ...r, ...lineLabel(r), moved: settingsKeys.value.has(r.key) })))
const movedRows = computed(() => (data.value?.settingsMoved ?? []).map((r) => ({ ...r, ...lineLabel(r) })))
const accountTotals = computed(() => {
  const rows = data.value?.byAccountTag ?? []
  return { debit: rows.reduce((s, r) => s + Math.max(r.diff, 0), 0), credit: rows.reduce((s, r) => s + Math.max(-r.diff, 0), 0) }
})

const headcount = computed(() => {
  const h = data.value?.headcount
  if (!h) return []
  const groups = new Map<string, { added: number; removed: number }>()
  for (const [list, kind] of [[h.added, 'added'], [h.removed, 'removed']] as const) {
    for (const e of list) {
      const g = groups.get(e.group) ?? { added: 0, removed: 0 }
      g[kind] += e.count
      groups.set(e.group, g)
    }
  }
  return [...groups].map(([group, v]) => ({ group, ...v })).sort((a, b) => a.group.localeCompare(b.group))
})

const taxRows = computed(() => (data.value?.taxChanges ?? []).map((e) => ({
  benefit: e.changes['PPh 21 Benefit'] ?? 0,
  payment: e.changes['PPH 21 Payment'] ?? 0,
  dtp: e.changes['Total PPh 21 DTP Received'] ?? 0,
  severance: e.changes['PPh 21 Resign Benefit'] ?? 0,
  pph26: e.changes['PPh 26 Benefit'] ?? 0,
})).map((r) => ({ ...r, pph21: r.benefit + r.payment - r.dtp })))
const taxTotal = computed(() => ({
  benefit: taxRows.value.reduce((s, r) => s + r.benefit, 0),
  payment: taxRows.value.reduce((s, r) => s + r.payment, 0),
  pph21: taxRows.value.reduce((s, r) => s + r.pph21, 0),
  dtp: taxRows.value.reduce((s, r) => s + r.dtp, 0),
  severance: taxRows.value.reduce((s, r) => s + r.severance, 0),
  pph26: taxRows.value.reduce((s, r) => s + r.pph26, 0),
}))
const sentOf = (no: number | undefined) => { const v = run.value?.versions.find((x) => x.no === no); return v ? wib(v.sentAt) : '' }
</script>

<template>
  <section class="pcv" data-testid="payroll-compare">
    <div class="pcv__head">
      <div>
        <div class="pcv__title">{{ t('Compare versions') }}</div>
        <div v-if="data" class="pcv__sub">
          {{ t(`${data.oldLabel} sent ${sentOf(data.oldNo)} against ${data.newLabel} sent ${sentOf(data.newNo)}`) }}
        </div>
      </div>
      <div class="pcv__pickers">
        <ErpFilterSelect id="pcv-old" v-model="selOld" :placeholder="t('Old version')" :options="versionOptions" :is-clearable="false" width="220px" />
        <span class="pcv__against">{{ t('against') }}</span>
        <ErpFilterSelect id="pcv-new" v-model="selNew" :placeholder="t('New version')" :options="versionOptions" :is-clearable="false" width="220px" />
      </div>
    </div>

    <div v-if="cmp && !cmp.ok" class="pcv__empty">{{ t('Unable to compare these versions. Ask HR to send the run from Talenta again.') }}</div>
    <template v-else-if="data">
      <div v-if="data.oldNo === data.newNo" class="pcv__empty">{{ t('Pick two different versions.') }}</div>
      <template v-else>
        <div class="pcv__toolbar">
          <MpSegmentedControl id="pcv-view" v-model="view" name="pcv-view" :data="viewOptions" />
          <span v-if="data.noLedgerChange" class="pcv__chip">{{ t('No change to the books') }}</span>
        </div>

        <!-- By account and dimension -->
        <div v-if="view === 'account'" class="pcv__scroll">
          <div v-if="!accountRows.length" class="pcv__empty">{{ t('Same lines by account and dimension. No change to the books.') }}</div>
          <table v-else class="pcv__table">
            <thead>
              <tr>
                <th class="pcv__th">{{ t('Account') }}</th>
                <th class="pcv__th">{{ t('Dimensions') }}</th>
                <th class="pcv__th pcv__num">{{ t(data.oldLabel) }}</th>
                <th class="pcv__th pcv__num">{{ t(data.newLabel) }}</th>
                <th class="pcv__th pcv__num">{{ t('Debit') }}</th>
                <th class="pcv__th pcv__num">{{ t('Credit') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in accountRows" :key="r.key">
                <td class="pcv__td">
                  {{ r.account }}
                  <div v-if="r.moved" class="pcv__rownote">{{ t('Partly from a settings change') }}</div>
                </td>
                <td class="pcv__td">{{ r.tags || '-' }}</td>
                <td class="pcv__td pcv__num">{{ sided(r.old) }}</td>
                <td class="pcv__td pcv__num">{{ sided(r.new) }}</td>
                <td class="pcv__td pcv__num">{{ r.diff > 0 ? rupiah(r.diff) : '' }}</td>
                <td class="pcv__td pcv__num">{{ r.diff < 0 ? rupiah(-r.diff) : '' }}</td>
              </tr>
              <tr class="pcv__total">
                <td class="pcv__td" colspan="4">{{ t('Difference') }}</td>
                <td class="pcv__td pcv__num">{{ rupiah(accountTotals.debit) }}</td>
                <td class="pcv__td pcv__num">{{ rupiah(accountTotals.credit) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- By pay item -->
        <div v-else class="pcv__scroll">
          <div v-if="!data.byPayItem.length" class="pcv__empty">{{ t('No pay item changed.') }}</div>
          <table v-else class="pcv__table">
            <thead>
              <tr>
                <th class="pcv__th">{{ t('Pay item') }}</th>
                <th class="pcv__th">{{ t('Section') }}</th>
                <th class="pcv__th pcv__num">{{ t(data.oldLabel) }}</th>
                <th class="pcv__th pcv__num">{{ t(data.newLabel) }}</th>
                <th class="pcv__th pcv__num">{{ t('Difference') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in data.byPayItem" :key="`${r.name}|${r.section}`">
                <td class="pcv__td">{{ r.name }}</td>
                <td class="pcv__td">{{ t(SECTION[r.section] ?? r.section) }}</td>
                <td class="pcv__td pcv__num">{{ rupiah(r.old) }}</td>
                <td class="pcv__td pcv__num">{{ rupiah(r.new) }}</td>
                <td class="pcv__td pcv__num" :class="{ 'pcv__neg': r.diff < 0 }">{{ signed(r.diff) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Moved by settings change -->
        <div v-if="movedRows.length" class="pcv__block" data-testid="pcv-moved">
          <div class="pcv__blocktitle">{{ t('Changed by settings') }}</div>
          <div class="pcv__blocksub">{{ t('Current settings put these lines on a different account or dimension. Reverse and repost includes them.') }}</div>
          <div class="pcv__scroll">
            <table class="pcv__table">
              <thead>
                <tr>
                  <th class="pcv__th">{{ t('Account') }}</th>
                  <th class="pcv__th">{{ t('Dimensions') }}</th>
                  <th class="pcv__th pcv__num">{{ t('Posted') }}</th>
                  <th class="pcv__th pcv__num">{{ t('With current settings') }}</th>
                  <th class="pcv__th pcv__num">{{ t('Difference') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in movedRows" :key="r.key">
                  <td class="pcv__td">{{ r.account }}</td>
                  <td class="pcv__td">{{ r.tags || '-' }}</td>
                  <td class="pcv__td pcv__num">{{ sided(r.old) }}</td>
                  <td class="pcv__td pcv__num">{{ sided(r.new) }}</td>
                  <td class="pcv__td pcv__num">{{ sided(r.diff) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Headcount -->
        <div class="pcv__block">
          <div class="pcv__blocktitle">{{ t('Headcount') }}</div>
          <div v-if="!headcount.length" class="pcv__blocksub">{{ t('Same staff in both versions.') }}</div>
          <div v-else class="pcv__scroll">
            <table class="pcv__table">
              <thead>
                <tr>
                  <th class="pcv__th">{{ t('Group') }}</th>
                  <th class="pcv__th">{{ t('Added') }}</th>
                  <th class="pcv__th">{{ t('Removed') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="g in headcount" :key="g.group">
                  <td class="pcv__td">{{ g.group }}</td>
                  <td class="pcv__td pcv__num">{{ g.added || '-' }}</td>
                  <td class="pcv__td pcv__num">{{ g.removed || '-' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- PPh 21 change -->
        <div class="pcv__block" data-testid="pcv-tax">
          <div class="pcv__blocktitle">{{ t('PPh 21 change') }}</div>
          <div class="pcv__blocksub">
            <template v-if="!taxRows.length">{{ t('No tax total changed.') }}</template>
            <template v-else>
              {{ t(`${taxRows.length} staff changed · tax period ${monthLabel(run!.month)} · PPh 21 ${signed(taxTotal.pph21)}`) }}
              <template v-if="taxTotal.pph26"> · {{ t(`PPh 26 ${signed(taxTotal.pph26)}`) }}</template>
              <template v-if="taxTotal.dtp"> · {{ t(`PPh 21 DTP ${signed(taxTotal.dtp)}`) }}</template>
              <template v-if="taxTotal.severance"> · {{ t(`PPh 21 severance ${signed(taxTotal.severance)}`) }}</template>
            </template>
          </div>
          <div v-if="taxRows.length && run!.month.endsWith('-12')" class="pcv__blocksub">{{ t('December recalculates the full-year PPh 21, so the yearly tax slip (1721-A1) changes too.') }}</div>
          <div v-if="taxRows.length" class="pcv__scroll">
            <table class="pcv__table">
              <thead>
                <tr>
                  <th class="pcv__th">{{ t('Staff changed') }}</th>
                  <th class="pcv__th pcv__num">{{ t('PPh 21 Benefit') }}</th>
                  <th class="pcv__th pcv__num">{{ t('PPh 21 Payment') }}</th>
                  <th class="pcv__th pcv__num">{{ t('PPh 21 DTP') }}</th>
                  <th class="pcv__th pcv__num">{{ t('PPh 21 change') }}</th>
                  <th class="pcv__th pcv__num">{{ t('PPh 21 severance') }}</th>
                  <th class="pcv__th pcv__num">{{ t('PPh 26') }}</th>
                </tr>
              </thead>
              <tbody>
                <!-- Totals only: the per-person figures are in Talenta. -->
                <tr>
                  <td class="pcv__td">{{ taxRows.length }}</td>
                  <td class="pcv__td pcv__num">{{ taxTotal.benefit ? signed(taxTotal.benefit) : '' }}</td>
                  <td class="pcv__td pcv__num">{{ taxTotal.payment ? signed(taxTotal.payment) : '' }}</td>
                  <td class="pcv__td pcv__num">{{ taxTotal.dtp ? signed(taxTotal.dtp) : '' }}</td>
                  <td class="pcv__td pcv__num pcv__strong">{{ signed(taxTotal.pph21) }}</td>
                  <td class="pcv__td pcv__num">{{ taxTotal.severance ? signed(taxTotal.severance) : '' }}</td>
                  <td class="pcv__td pcv__num">{{ taxTotal.pph26 ? signed(taxTotal.pph26) : '' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </template>
    </template>
  </section>
</template>

<style scoped>
.pcv { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.pcv__head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); flex-wrap: wrap;
  padding: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default);
}
.pcv__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pcv__sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.pcv__pickers { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pcv__against { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pcv__toolbar { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.pcv__toolbar :deep(.mp-segmented-control__item), .pcv__toolbar :deep([role='radio']) { min-width: max-content; }
.pcv__chip {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-colors-text-success);
  background: var(--mp-colors-background-success); border-radius: var(--mp-radii-md); padding: var(--mp-spacing-1) var(--mp-spacing-2);
}
.pcv__empty { padding: var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pcv__block { border-top: 1px solid var(--mp-border-default); }
.pcv__blocktitle { padding: var(--mp-spacing-4) var(--mp-spacing-4) 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pcv__blocksub { padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pcv__scroll { overflow-x: auto; }
.pcv__table { width: 100%; border-collapse: collapse; }
.pcv__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; letter-spacing: 0.04em; color: var(--mp-text-secondary);
  background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default); border-top: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pcv__td {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.pcv__table tbody tr:last-child .pcv__td { border-bottom: 0; }
.pcv__num { text-align: right; white-space: nowrap; }
.pcv__neg { color: var(--mp-text-danger); }
.pcv__strong { font-weight: var(--mp-font-weights-semi-bold); }
.pcv__rownote { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.pcv__total .pcv__td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-neutral-subtle); }
</style>
