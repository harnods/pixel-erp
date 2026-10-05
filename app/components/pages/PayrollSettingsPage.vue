<script setup lang="ts">
/**
 * Payroll settings (PRD FG-1): connection, accounts, pay items, groups and
 * rules, dry run, cut-over. Every save goes through payrollStore, which runs
 * the guardrails, snapshots the settings (LR-9) and re-checks held runs; this
 * page only reads the store and calls it. The tab sits in ?section= so a link
 * from a hold screen lands on the right one.
 */
import { computed } from 'vue'
import { MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel } from '@mekari/pixel3'
import { payroll, can } from '~/data/payrollStore'
import PayrollSettingsConnection from '~/components/payroll/PayrollSettingsConnection.vue'
import PayrollSettingsAccounts from '~/components/payroll/PayrollSettingsAccounts.vue'
import PayrollSettingsPayItems from '~/components/payroll/PayrollSettingsPayItems.vue'
import PayrollSettingsGroups from '~/components/payroll/PayrollSettingsGroups.vue'
import PayrollSettingsDryRun from '~/components/payroll/PayrollSettingsDryRun.vue'
import PayrollSettingsCutover from '~/components/payroll/PayrollSettingsCutover.vue'

const { t } = useLocale()
const route = useRoute()
const router = useRouter()

const ALL_TABS = [
  { key: 'connection', label: 'Connection' },
  { key: 'accounts', label: 'Accounts' },
  { key: 'pay-items', label: 'Pay items' },
  { key: 'groups', label: 'Groups and rules' },
  { key: 'dry-run', label: 'Dry run' },
  { key: 'cut-over', label: 'Cut-over' },
] as const
type TabKey = typeof ALL_TABS[number]['key']

// FG-1.6: Tax Staff cannot open the connection panel.
const tabs = computed(() => ALL_TABS.filter((x) => x.key !== 'connection' || can('connection.view', payroll.viewAs)))
const activeKey = computed<TabKey>(() => {
  const q = route.query.section as string | undefined
  return (tabs.value.find((x) => x.key === q)?.key ?? tabs.value[0]!.key) as TabKey
})
const activeIndex = computed({
  get: () => tabs.value.findIndex((x) => x.key === activeKey.value),
  set: (i: number) => { router.replace({ query: { ...route.query, section: tabs.value[i]?.key ?? tabs.value[0]!.key } }) },
})
function go(key: TabKey) { router.replace({ query: { ...route.query, section: key } }) }
</script>

<template>
  <div class="pset">
    <MpTabs id="pset-tabs" v-model="activeIndex" is-manual variant-color="green" class="pset-tabs">
      <MpTabList>
        <MpTab v-for="tb in tabs" :id="`pset-tab-${tb.key}`" :key="tb.key" :value="tb.key">{{ t(tb.label) }}</MpTab>
      </MpTabList>
      <MpTabPanels>
        <MpTabPanel v-for="tb in tabs" :key="tb.key" :value="tb.key">
          <template v-if="tb.key === activeKey">
            <PayrollSettingsConnection v-if="tb.key === 'connection'" />
            <PayrollSettingsAccounts v-else-if="tb.key === 'accounts'" />
            <PayrollSettingsPayItems v-else-if="tb.key === 'pay-items'" @go="go" />
            <PayrollSettingsGroups v-else-if="tb.key === 'groups'" />
            <PayrollSettingsDryRun v-else-if="tb.key === 'dry-run'" @go="go" />
            <PayrollSettingsCutover v-else-if="tb.key === 'cut-over'" @go="go" />
          </template>
        </MpTabPanel>
      </MpTabPanels>
    </MpTabs>
  </div>
</template>

<style scoped>
.pset-tabs { margin-top: 0; }
.pset-tabs :deep(.mp-tab--isSelected_true),
.pset-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.pset-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected) !important; }
.pset-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }
</style>

<!-- Shared by the PayrollSettings* tab components and their drawers (teleported
     to body, so these rules are global and namespaced pset-). -->
<style>
.pset-stack { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.pset-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.pset-bar__left, .pset-bar__right { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.pset-card { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral); overflow: hidden; }
.pset-card__head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.pset-card__title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pset-card__sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.pset-card__body { padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.pset-card__actions { display: flex; align-items: center; gap: var(--mp-spacing-2); flex: none; }
.pset-table { width: 100%; border-collapse: collapse; }
.pset-th { text-align: left; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.04em; text-transform: uppercase; color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); white-space: nowrap; }
.pset-th--num, .pset-td--num { text-align: right; }
.pset-td { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.pset-td--num { font-variant-numeric: tabular-nums; white-space: nowrap; }
.pset-td--act { text-align: right; white-space: nowrap; width: 1%; }
.pset-td--strong { font-weight: var(--mp-font-weights-semi-bold); }
.pset-table tr:last-child .pset-td { border-bottom: 0; }
.pset-tr--total .pset-td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-neutral-subtle); }
.pset-muted { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pset-line { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.pset-danger { color: var(--mp-text-danger); }
.pset-warn { color: var(--mp-colors-text-warning); }
.pset-ok { color: var(--mp-colors-text-success); }
.pset-error { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); margin: 0; }
.pset-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0; }
.pset-link { color: var(--mp-text-link); cursor: pointer; }
.pset-link:hover { text-decoration: underline; }
.pset-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); min-width: 0; }
.pset-label { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pset-row { display: flex; gap: var(--mp-spacing-3); align-items: flex-end; flex-wrap: wrap; }
.pset-row > .pset-field { flex: 1 1 200px; }
.pset-kv { display: grid; grid-template-columns: minmax(180px, max-content) 1fr; gap: var(--mp-spacing-2) var(--mp-spacing-6); font-size: var(--mp-font-sizes-md); }
.pset-kv__k { color: var(--mp-text-secondary); }
.pset-kv__v { color: var(--mp-text-default); min-width: 0; }
.pset-steps { margin: 0; padding-left: var(--mp-spacing-5); display: flex; flex-direction: column; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pset-chips { display: flex; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.pset-note { display: flex; gap: var(--mp-spacing-2); align-items: flex-start; padding: var(--mp-spacing-3) var(--mp-spacing-4); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pset-note--warn { background: var(--mp-colors-background-warning); color: var(--mp-colors-text-warning); }
.pset-note--danger { background: var(--mp-colors-background-danger); color: var(--mp-text-danger); }
.pset-preview { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); overflow: hidden; }
.pset-preview__head { padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); border-bottom: 1px solid var(--mp-border-default); }
.pset-preview .pset-td, .pset-preview .pset-th { padding: var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); }
.pset-cond { display: grid; grid-template-columns: 1.2fr 0.8fr 1.6fr auto; gap: var(--mp-spacing-2); align-items: start; }
.pset-checks { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.pset-check { display: flex; align-items: center; gap: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
/* The house stats band (BillsIndexPage): divider-separated columns on the
   stage, caption above the figure. */
.pset-stack .stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; padding-bottom: var(--mp-spacing-5); border-bottom: 1px solid var(--mp-border-default); }
.pset-stack .stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch; }
.pset-stack .stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.pset-stack .stat-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); }
.pset-stack .stat-period { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }
.pset-stack .stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); font-variant-numeric: tabular-nums; }
.pset-stack .stat-link { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer; }
.pset-stack .stat-link:hover { text-decoration: underline; }
.pset-section-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: 0; }
</style>
