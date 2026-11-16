<script setup lang="ts">
/**
 * Payroll settings: Connection, Pay items, Groups. Every save goes through
 * payrollStore, which keeps a copy of the settings per journal and re-checks held runs;
 * this page only reads the store and calls it. The tab sits in ?section= so a link
 * from the fix list lands on the right one.
 */
import { computed } from 'vue'
import { MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel } from '@mekari/pixel3'
import PayrollSettingsConnection from '~/components/payroll/PayrollSettingsConnection.vue'
import PayrollSettingsPayItems from '~/components/payroll/PayrollSettingsPayItems.vue'
import PayrollSettingsGroups from '~/components/payroll/PayrollSettingsGroups.vue'

const { t } = useLocale()
const route = useRoute()
const router = useRouter()

const tabs = [
  { key: 'connection', label: 'Connection' },
  { key: 'pay-items', label: 'Pay items' },
  { key: 'groups', label: 'Groups' },
] as const
type TabKey = typeof tabs[number]['key']
const activeKey = computed<TabKey>(() => {
  const q = route.query.section as string | undefined
  return tabs.find((x) => x.key === (q === 'dimensions' ? 'groups' : q))?.key ?? 'connection'
})
const activeIndex = computed({
  get: () => tabs.findIndex((x) => x.key === activeKey.value),
  set: (i: number) => { router.replace({ query: { ...route.query, section: tabs[i]?.key ?? tabs[0].key } }) },
})
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
            <PayrollSettingsPayItems v-else-if="tb.key === 'pay-items'" />
            <PayrollSettingsGroups v-else-if="tb.key === 'groups'" />
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
.pset-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-text-selected) !important; }
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
/* Label / value form rows: one label width so values line up. */
.pset-form { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: var(--mp-spacing-4) var(--mp-spacing-5); align-items: start; }
.pset-form__label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
/* A label beside a 38px control lines up with the control, not with its hint below. */
.pset-form__label--control { align-self: start; line-height: 38px; }
.pset-form__value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.pset-inline { flex-direction: row; align-items: center; gap: var(--mp-spacing-3); max-width: 420px; }
.pset-steps { margin: 0; padding-left: var(--mp-spacing-5); list-style: decimal; display: flex; flex-direction: column; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pset-chips { display: flex; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.pset-note { display: flex; gap: var(--mp-spacing-2); align-items: flex-start; padding: var(--mp-spacing-3) var(--mp-spacing-4); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pset-note--warn { background: var(--mp-colors-background-warning); color: var(--mp-colors-text-warning); }
.pset-section-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: 0; }
</style>
