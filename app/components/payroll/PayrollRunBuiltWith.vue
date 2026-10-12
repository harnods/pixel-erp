<script setup lang="ts">
/**
 * "Built with": the read-only settings snapshot a draft or posted journal was
 * built with (TN-06): pay item mapping with group accounts, dimension links,
 * value maps and tax presets.
 */
import { computed } from 'vue'
import { snapshotById, accountLabel, wib, currentSnapshotId } from '~/data/payrollStore'

const props = defineProps<{ snapshotId: string | null }>()
const { t } = useLocale()
const snap = computed(() => snapshotById(props.snapshotId))
const s = computed(() => snap.value?.settings)
const groupRows = computed(() => {
  const g = s.value?.groupMaps
  if (!g) return []
  return Object.entries(g).flatMap(([dim, map]) => Object.entries(map).map(([value, tag]) => ({ dim, value, tag })))
})
const splits = computed(() => (s.value?.mapping ?? []).filter((m) => m.groupAccounts?.length || m.fixedTag))
const PRESETS: { key: 'pph21' | 'dtp' | 'pph26' | 'resign' | 'trueUp'; label: string }[] = [
  { key: 'pph21', label: 'Regular PPh 21' }, { key: 'dtp', label: 'PPh 21 DTP' }, { key: 'pph26', label: 'PPh 26' },
  { key: 'resign', label: 'PPh 21 on severance' }, { key: 'trueUp', label: 'December true-up' },
]
</script>

<template>
  <div v-if="snap && s" class="pbw">
    <div class="pbw__meta">
      <span class="pbw__strong">{{ snap.id }}</span>
      <span class="pbw__muted"> · {{ wib(snap.at) }} · {{ snap.by }} · {{ snap.note }}</span>
      <span v-if="snap.id !== currentSnapshotId()" class="pbw__flag">{{ t('Settings changed since') }}</span>
    </div>

    <section class="pbw__card">
      <header class="pbw__cardhead"><div class="pbw__cardtitle">{{ t('Pay items') }} ({{ s.mapping.length }})</div></header>
      <table class="pbw__table">
        <thead><tr>
          <th class="pbw__th">{{ t('Pay item') }}</th><th class="pbw__th">{{ t('Role') }}</th>
          <th class="pbw__th">{{ t('Debit') }}</th><th class="pbw__th">{{ t('Credit') }}</th><th class="pbw__th">{{ t('Override') }}</th>
        </tr></thead>
        <tbody>
          <tr v-for="m in s.mapping" :key="m.key">
            <td class="pbw__td">{{ m.name }} <span class="pbw__muted">· {{ t(m.section) }}</span></td>
            <td class="pbw__td">{{ m.role ? t(m.role) : t('No role') }}</td>
            <td class="pbw__td">{{ accountLabel(m.debit) }}</td>
            <td class="pbw__td">{{ accountLabel(m.credit) }}</td>
            <td class="pbw__td pbw__muted">{{ m.override?.reason ?? '' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="splits.length" class="pbw__card">
      <header class="pbw__cardhead"><div class="pbw__cardtitle">{{ t('Group accounts and fixed dimension values') }}</div></header>
      <table class="pbw__table">
        <thead><tr><th class="pbw__th">{{ t('Pay item') }}</th><th class="pbw__th">{{ t('Group account') }}</th><th class="pbw__th">{{ t('Fixed dimension value') }}</th></tr></thead>
        <tbody>
          <tr v-for="m in splits" :key="m.key">
            <td class="pbw__td">{{ m.name }}</td>
            <td class="pbw__td">{{ (m.groupAccounts ?? []).map((g) => `${g.value}: ${accountLabel(g.account)}`).join(' · ') }}</td>
            <td class="pbw__td">{{ m.fixedTag ? `${m.fixedTag.dimension} ${m.fixedTag.value}` : '' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <div class="pbw__grid">
      <section class="pbw__card">
        <header class="pbw__cardhead"><div class="pbw__cardtitle">{{ t('Group to dimension') }}</div></header>
        <table class="pbw__table">
          <thead><tr><th class="pbw__th">{{ t('Dimension') }}</th><th class="pbw__th">{{ t('Talenta value') }}</th><th class="pbw__th">{{ t('Dimension value') }}</th></tr></thead>
          <tbody>
            <tr v-for="g in groupRows" :key="`${g.dim}${g.value}`"><td class="pbw__td">{{ t(g.dim) }}</td><td class="pbw__td">{{ g.value }}</td><td class="pbw__td">{{ g.tag }}</td></tr>
          </tbody>
        </table>
      </section>
      <section class="pbw__card">
        <header class="pbw__cardhead"><div class="pbw__cardtitle">{{ t('Tax presets and dimensions') }}</div></header>
        <table class="pbw__table">
          <tbody>
            <tr v-for="p in PRESETS" :key="p.key"><td class="pbw__td">{{ t(p.label) }}</td><td class="pbw__td">{{ accountLabel(s.taxPresets[p.key]) }}</td></tr>
            <tr v-for="l in s.dimensionLinks ?? []" :key="l.field"><td class="pbw__td">{{ l.dimension }}</td><td class="pbw__td">{{ t(l.empty === 'hold' ? 'Empty value holds the run' : 'Empty value left blank') }}</td></tr>
          </tbody>
        </table>
      </section>
    </div>
  </div>
  <div v-else class="pbw__muted">{{ t('No settings snapshot') }}</div>
</template>

<style scoped>
.pbw { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.pbw__meta { font-size: var(--mp-font-sizes-md); }
.pbw__grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-5); align-items: start; }
.pbw__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.pbw__cardhead { padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.pbw__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pbw__table { width: 100%; border-collapse: collapse; }
.pbw__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase;
  color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-1) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default);
}
.pbw__td { padding: var(--mp-spacing-2) var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.pbw__strong { font-weight: var(--mp-font-weights-semi-bold); }
.pbw__muted { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }
.pbw__flag {
  display: inline-block; margin-left: var(--mp-spacing-2); padding: 0 var(--mp-spacing-2); border-radius: var(--mp-radii-full);
  font-size: var(--mp-font-sizes-sm); background: var(--mp-colors-background-warning); color: var(--mp-colors-text-warning);
}
@media (max-width: 1200px) { .pbw__grid { grid-template-columns: 1fr; } }
</style>
