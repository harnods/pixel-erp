<script setup lang="ts">
/**
 * "Mapping used": the settings a draft or posted journal was built from (TN-06), read-only.
 * Shows only the pay item to account list and the dimension links.
 */
import { computed } from 'vue'
import { snapshotById, accountLabel } from '~/data/payrollStore'

const props = defineProps<{ snapshotId: string | null }>()
const { t } = useLocale()
const snap = computed(() => snapshotById(props.snapshotId))
const s = computed(() => snap.value?.settings)
const SECTION: Record<string, string> = { allowance: 'Allowance', deduction: 'Deduction', benefit: 'Benefit' }
</script>

<template>
  <div v-if="snap && s" class="pbw" data-testid="payroll-mapping-used">
    <p class="pbw__muted">{{ t('The settings this journal was built from. Later changes to settings don\'t change a posted journal.') }}</p>

    <section class="pbw__card">
      <header class="pbw__cardhead"><div class="pbw__cardtitle">{{ t('Pay items') }} ({{ s.mapping.length }})</div></header>
      <table class="pbw__table">
        <thead><tr>
          <th class="pbw__th">{{ t('Pay item') }}</th>
          <th class="pbw__th">{{ t('Debit account') }}</th>
          <th class="pbw__th">{{ t('Credit account') }}</th>
        </tr></thead>
        <tbody>
          <tr v-for="m in s.mapping" :key="m.key">
            <td class="pbw__td">{{ m.name }} <span class="pbw__muted">· {{ t(SECTION[m.section] ?? m.section) }}</span></td>
            <td class="pbw__td">{{ m.debit ? accountLabel(m.debit) : '-' }}</td>
            <td class="pbw__td">{{ m.credit ? accountLabel(m.credit) : '-' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="(s.dimensionLinks ?? []).length" class="pbw__card">
      <header class="pbw__cardhead"><div class="pbw__cardtitle">{{ t('Dimensions') }}</div></header>
      <table class="pbw__table">
        <thead><tr><th class="pbw__th">{{ t('Dimension') }}</th><th class="pbw__th">{{ t('When Talenta sends it empty') }}</th></tr></thead>
        <tbody>
          <tr v-for="l in s.dimensionLinks" :key="l.field">
            <td class="pbw__td">{{ t(l.dimension) }}</td>
            <td class="pbw__td">{{ t(l.empty === 'hold' ? 'Hold the run until it\'s filled' : 'Leave the dimension blank') }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
  <div v-else class="pbw__muted">{{ t('No mapping saved for this run yet. It\'s saved when the draft journal builds.') }}</div>
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
