<script setup lang="ts">
/**
 * "Mapping used": the settings a draft or posted journal was built from, read-only. Shows only
 * the pay item to account list and, per group, the value of each dimension added to groups
 * (an explicit pick, else the value named like one of the group's Talenta values, else blank).
 */
import { computed } from 'vue'
import { snapshotById, accountLabel, groupLabel } from '~/data/payrollStore'
import { sectionLabel } from '~/data/payrollUiRunCopy'
import { groupDimensionsOf, nameMatch } from '~/data/payrollUiGroupDims'
import { groupFieldLabel } from '~/data/payrollUiSettings'

const props = defineProps<{ snapshotId: string | null }>()
const { t } = useLocale()
const snap = computed(() => snapshotById(props.snapshotId))
const s = computed(() => snap.value?.settings)
/** The dimension columns this journal was built with. */
const dims = computed(() => (s.value ? groupDimensionsOf(s.value) : []))
const groups = computed(() => (s.value?.groups ?? [])
  .map((g) => ({
    key: g.key,
    label: groupLabel(g.values),
    account: g.account,
    values: dims.value.map((d) => g.dims[d] ?? nameMatch(d, g.values)),
  }))
  .sort((a, b) => a.label.localeCompare(b.label)))
const groupedBy = computed(() => (s.value?.groupBy ?? []).map((f) => t(groupFieldLabel(f))).join(', '))
</script>

<template>
  <div v-if="snap && s" class="pbw" data-testid="payroll-mapping-used" data-tour="payroll-mapping-used">
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
            <td class="pbw__td">{{ m.name }} <span class="pbw__muted">· {{ t(sectionLabel(m.section)) }}</span></td>
            <td class="pbw__td">{{ m.debit ? accountLabel(m.debit) : '-' }}</td>
            <td class="pbw__td">{{ m.credit ? accountLabel(m.credit) : '-' }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <section v-if="groups.length" class="pbw__card" data-testid="payroll-mapping-groups">
      <header class="pbw__cardhead">
        <div class="pbw__cardtitle">{{ t('Groups') }} ({{ groups.length }})</div>
        <div class="pbw__muted">{{ t('Grouped by') }} {{ groupedBy }}</div>
      </header>
      <div class="pbw__scroll">
        <table class="pbw__table pbw__table--groups">
          <thead><tr>
            <th class="pbw__th">{{ t('Group') }}</th>
            <th class="pbw__th">{{ t('Expense account') }}</th>
            <th v-for="d in dims" :key="d" class="pbw__th" :data-dimension="d">{{ d }}</th>
          </tr></thead>
          <tbody>
            <tr v-for="g in groups" :key="g.key" :data-group="g.key">
              <td class="pbw__td">{{ g.label }}</td>
              <td class="pbw__td">{{ g.account ? accountLabel(g.account) : t('Use default account') }}</td>
              <td v-for="(v, i) in g.values" :key="dims[i]" class="pbw__td" :class="{ 'pbw__none': !v }">{{ v ?? t('No value') }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
  <div v-else class="pbw__card pbw__empty" data-tour="payroll-mapping-used">{{ t('No mapping saved for this run yet. It\'s saved when the draft journal builds.') }}</div>
</template>

<style scoped>
.pbw { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.pbw__empty { padding: var(--mp-spacing-4); color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-md); }
.pbw__card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.pbw__cardhead { padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.pbw__cardtitle { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pbw__table { width: 100%; border-collapse: collapse; }
.pbw__th {
  text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase;
  color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pbw__td { padding: var(--mp-spacing-2\.5) var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.pbw__muted { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }
.pbw__cardhead { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-3); }
.pbw__scroll { overflow-x: auto; }
.pbw__none { color: var(--mp-text-secondary); }
.pbw__table--groups .pbw__td { white-space: nowrap; }

</style>
