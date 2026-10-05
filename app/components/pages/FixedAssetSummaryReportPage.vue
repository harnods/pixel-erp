<!-- prod-parity: quickbook/app/views/reports/fixed_asset_summary.html.haml -->
<script setup lang="ts">
/**
 * Fixed asset summary — Reports › Fixed assets › Fixed asset summary.
 *
 * Prod layout: As of date + Filter by period + Filter, a More filter drawer
 * (as of, period, filter by account, asset, group by tag), Export (PDF / XLS /
 * CSV), View sample, then the table: one band per fixed asset account with its
 * assets (asset number, name, acquisition date, initial cost, acc. depreciation,
 * book value), a Total row per account and a Total fixed asset grand total,
 * closed by "Showing total of N assets".
 *
 * Data: app/data/fixedAssetSummaryReport.ts over the Fixed assets (current)
 * module (currentAssets.ts). Book value = cost − acc. depreciation is asserted
 * per row, per account and in total.
 */
import { ref, computed, reactive } from 'vue'
import { MpButton, MpIcon, MpDatePicker, MpFormControl, MpFormLabel, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import MultiSelectDropdown from '~/components/patterns/MultiSelectDropdown.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import { TODAY_ISO } from '~/data/master'
import { RPT_PERIOD_PRESETS, rptPresetRange, rptIsoToDmy, rptDmyToIso, type RptPeriodPreset } from '~/data/inventoryValuationReport'
import {
  fixedAssetSummaryReport, fasAccountOptions, fasTagOptions, fasCandidateAssets, type FasRow,
} from '~/data/fixedAssetSummaryReport'

const { t } = useLocale()
const router = useRouter()

// ── As of + period (prod defaults to Today) ──────────────────────────────────
const asOf = ref(rptIsoToDmy(TODAY_ISO))
const period = ref<RptPeriodPreset>('today')
const periodOptions = computed(() => RPT_PERIOD_PRESETS.map((o) => ({ value: o.value, label: t(o.label) })))
function onAsOfChange(v: string) {
  asOf.value = v
  const iso = rptDmyToIso(v)
  const match = RPT_PERIOD_PRESETS.find((o) => rptPresetRange(o.value, TODAY_ISO)?.[1] === iso)
  period.value = match?.value ?? 'custom'
}
function onPeriodChange(v: string) {
  const p = (v || 'custom') as RptPeriodPreset
  period.value = p
  const r = rptPresetRange(p, TODAY_ISO)
  if (r) asOf.value = rptIsoToDmy(r[1])
}

// ── More filter drawer ───────────────────────────────────────────────────────
const accountOptions = fasAccountOptions()
const assetOptions = fasCandidateAssets().map((a) => ({ value: a.id, label: `${a.number} ${a.name}` }))
const tagOptions = fasTagOptions()
const applied = reactive({ accounts: [] as string[], assets: [] as string[], tags: [] as string[] })
const draft = reactive({ accounts: [] as string[], assets: [] as string[], tags: [] as string[] })
const drawerOpen = ref(false)
const labelsOf = (opts: { value: string; label: string }[], values: string[]) => opts.filter((o) => values.includes(o.value)).map((o) => o.label)
const valuesOf = (opts: { value: string; label: string }[], labels: string[]) => opts.filter((o) => labels.includes(o.label)).map((o) => o.value)
const draftAccountLabels = computed({ get: () => labelsOf(accountOptions, draft.accounts), set: (v: string[]) => { draft.accounts = valuesOf(accountOptions, v) } })
const draftAssetLabels = computed({ get: () => labelsOf(assetOptions, draft.assets), set: (v: string[]) => { draft.assets = valuesOf(assetOptions, v) } })
const activeFilterCount = computed(() => applied.accounts.length + applied.assets.length + applied.tags.length)

function openDrawer() {
  draft.accounts = [...applied.accounts]; draft.assets = [...applied.assets]; draft.tags = [...applied.tags]
  drawerOpen.value = true
}
function resetDrawer() { draft.accounts = []; draft.assets = []; draft.tags = [] }
function applyDrawer() {
  applied.accounts = [...draft.accounts]; applied.assets = [...draft.assets]; applied.tags = [...draft.tags]
  drawerOpen.value = false
  runFilter()
}

// ── Report ───────────────────────────────────────────────────────────────────
const shownAsOf = ref(TODAY_ISO)
function runFilter() { shownAsOf.value = rptDmyToIso(asOf.value) || TODAY_ISO }
const report = computed(() => fixedAssetSummaryReport({ asOfIso: shownAsOf.value, accounts: applied.accounts, assets: applied.assets, tags: applied.tags }))
const hasAnyAsset = computed(() => fasCandidateAssets().length > 0)

function openAsset(r: FasRow) { router.push(r.disposedLater ? `/current-assets/${r.assetId}/disposal` : `/current-assets/${r.assetId}`) }
</script>

<template>
  <div class="fas">
    <header class="fas-titlebar">
      <div class="fas-titlebar-left">
        <MpButton class="fas-breadcrumb" variant="textLink" is-rounded @click="router.push('/fixed-assets-report')">{{ t('Fixed assets') }}</MpButton>
        <h1 class="fas-title">{{ t('Fixed asset summary') }} <span class="fas-title-cur">(IDR)</span></h1>
      </div>
    </header>

    <div class="fas-stage">
      <div class="fas-controls">
        <div class="fas-controls-left">
          <MpFormControl id="fas-asof" class="fas-field">
            <MpFormLabel>{{ t('As of') }}</MpFormLabel>
            <div class="fas-datepicker">
              <MpDatePicker id="fas-asof-dp" :model-value="asOf" format="DD/MM/YYYY" value-type="format" :is-clearable="false" use-portal @update:model-value="onAsOfChange" />
            </div>
          </MpFormControl>
          <MpFormControl id="fas-period" class="fas-field">
            <MpFormLabel>{{ t('Filter by period') }}</MpFormLabel>
            <ErpFilterSelect id="fas-period-select" :model-value="period" :placeholder="t('Filter by period')" :options="periodOptions" width="176px" :is-clearable="false" @update:model-value="onPeriodChange" />
          </MpFormControl>
          <MpButton is-rounded @click="runFilter">{{ t('Filter') }}</MpButton>
          <MpButton variant="secondary" is-rounded @click="openDrawer">
            {{ t('More filter') }}<span v-if="activeFilterCount" class="fas-count">{{ activeFilterCount }}</span>
          </MpButton>
        </div>
        <MpPopover id="fas-export" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="secondary" is-rounded right-icon="caret-down">{{ t('Export') }}</MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '140px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem @click="infoToast(t('Not in this prototype'))">PDF</MpPopoverListItem>
              <MpPopoverListItem @click="infoToast(t('Not in this prototype'))">XLS</MpPopoverListItem>
              <MpPopoverListItem @click="infoToast(t('Not in this prototype'))">CSV</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>

      <!-- Zero data: no asset recorded at all -->
      <div v-if="!hasAnyAsset" class="fas-empty">
        <img src="/illustrations/empty-folder.png" alt="" class="fas-empty-img" width="240" height="200" />
        <p class="fas-empty-title">{{ t('You have no asset yet.') }}</p>
        <MpButton variant="secondary" is-rounded @click="router.push('/current-assets/new')">{{ t('Record asset') }}</MpButton>
      </div>

      <template v-else>
        <div class="fas-example">
          <span class="fas-link" role="button" @click="infoToast(t('Not in this prototype'))">{{ t('View sample') }}</span>
        </div>

        <div class="fas-table-wrap">
          <table class="fas-table">
            <thead>
              <tr>
                <th class="fas-th">{{ t('Asset number') }}</th>
                <th class="fas-th fas-th--name">{{ t('Asset name') }}</th>
                <th class="fas-th fas-th--num">{{ t('Acquisition date') }}</th>
                <th class="fas-th fas-th--num">{{ t('Initial cost') }}</th>
                <th class="fas-th fas-th--num">{{ t('Acc. depreciation') }}</th>
                <th class="fas-th fas-th--num">{{ t('Book value') }}</th>
              </tr>
            </thead>
            <tbody v-for="g in report.groups" :key="g.accountCode">
              <tr class="fas-row fas-row--account">
                <td class="fas-td fas-td--account" colspan="6">({{ g.accountCode }}) {{ g.accountName }}</td>
              </tr>
              <tr v-for="r in g.rows" :key="r.assetId" class="fas-row">
                <td class="fas-td"><span class="fas-link" @click="openAsset(r)">{{ r.number }}</span></td>
                <td class="fas-td fas-td--name"><span class="fas-link" @click="openAsset(r)">{{ r.name }}</span></td>
                <td class="fas-td fas-td--num">{{ formatDate(r.acquisitionDate) }}</td>
                <td class="fas-td fas-td--num">{{ formatIDR(r.cost) }}</td>
                <td class="fas-td fas-td--num">{{ formatIDR(r.accumulated) }}</td>
                <td class="fas-td fas-td--num">{{ formatIDR(r.bookValue) }}</td>
              </tr>
              <tr class="fas-row fas-row--subtotal">
                <td class="fas-td" colspan="2">{{ t('Total') }}</td>
                <td class="fas-td fas-td--num" colspan="2">{{ formatIDR(g.subtotalCost) }}</td>
                <td class="fas-td fas-td--num">{{ formatIDR(g.subtotalAccumulated) }}</td>
                <td class="fas-td fas-td--num">{{ formatIDR(g.subtotalBookValue) }}</td>
              </tr>
            </tbody>
            <tbody>
              <tr v-if="!report.groups.length" class="fas-row">
                <td class="fas-td fas-td--none" colspan="6">{{ t('No data matches this filter.') }}</td>
              </tr>
              <tr class="fas-row fas-row--grand">
                <td class="fas-td" colspan="2">{{ t('Total fixed asset') }}</td>
                <td class="fas-td fas-td--num" colspan="2">{{ formatIDR(report.totalCost) }}</td>
                <td class="fas-td fas-td--num">{{ formatIDR(report.totalAccumulated) }}</td>
                <td class="fas-td fas-td--num">{{ formatIDR(report.totalBookValue) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p class="fas-showing">{{ t('Showing total of') }} {{ report.assetCount }} {{ t('assets') }}</p>
      </template>
    </div>

    <!-- ── More filter drawer (Reports filter) ── -->
    <Teleport to="body">
      <Transition name="fasf">
        <div v-if="drawerOpen" class="fasf-overlay" @click.self="drawerOpen = false">
          <div class="fasf-panel" role="dialog" :aria-label="t('Reports filter')">
            <header class="fasf-head">
              <span class="fasf-title">{{ t('Reports filter') }}</span>
              <MpButton variant="ghost" is-rounded :aria-label="t('Close')" @click="drawerOpen = false"><MpIcon name="close" size="md" /></MpButton>
            </header>
            <div class="fasf-body">
              <MpFormControl id="fasf-asof">
                <MpFormLabel>{{ t('As of') }}</MpFormLabel>
                <div class="fas-datepicker">
                  <MpDatePicker id="fasf-asof-dp" :model-value="asOf" format="DD/MM/YYYY" value-type="format" :is-clearable="false" use-portal @update:model-value="onAsOfChange" />
                </div>
              </MpFormControl>
              <MpFormControl id="fasf-period">
                <MpFormLabel>{{ t('Filter by period') }}</MpFormLabel>
                <ErpFilterSelect id="fasf-period-select" :model-value="period" :placeholder="t('Filter by period')" :options="periodOptions" width="100%" :is-clearable="false" @update:model-value="onPeriodChange" />
              </MpFormControl>
              <MpFormControl id="fasf-account">
                <MpFormLabel>{{ t('Filter by account') }}</MpFormLabel>
                <MultiSelectDropdown id="fasf-account-ms" v-model="draftAccountLabels" :options="accountOptions.map((o) => o.label)" :placeholder="t('All')" is-full-width />
              </MpFormControl>
              <MpFormControl id="fasf-asset">
                <MpFormLabel>{{ t('Asset') }}</MpFormLabel>
                <MultiSelectDropdown id="fasf-asset-ms" v-model="draftAssetLabels" :options="assetOptions.map((o) => o.label)" :placeholder="t('All')" is-full-width />
              </MpFormControl>
              <MpFormControl id="fasf-tag">
                <MpFormLabel>{{ t('Group by tag') }}</MpFormLabel>
                <MultiSelectDropdown id="fasf-tag-ms" v-model="draft.tags" :options="tagOptions" :placeholder="t('All')" is-full-width />
              </MpFormControl>
            </div>
            <footer class="fasf-foot">
              <MpButton variant="ghost" is-rounded @click="resetDrawer">{{ t('Reset') }}</MpButton>
              <div class="fasf-foot-actions">
                <MpButton variant="ghost" is-rounded @click="drawerOpen = false">{{ t('Cancel') }}</MpButton>
                <MpButton is-rounded @click="applyDrawer">{{ t('Filter') }}</MpButton>
              </div>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.fas { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.fas-titlebar { flex-shrink: 0; min-height: 72px; background: var(--mp-background-neutral-subtle); display: flex; align-items: center; padding: 0 var(--mp-spacing-6); }
.fas-titlebar-left { display: flex; flex-direction: column; justify-content: center; align-items: flex-start; }
.fas-breadcrumb { padding: 0; height: auto; font-size: var(--mp-font-sizes-sm); }
.fas-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default); }
.fas-title-cur { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }

.fas-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage); border-top-left-radius: var(--mp-radii-lg); padding: var(--mp-spacing-5) var(--mp-spacing-6) var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.fas-controls { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.fas-controls-left { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.fas-field { width: var(--mp-sizes-44, 176px); }
.fas-datepicker { width: 100%; }
.fas-datepicker :deep(.mp-datepicker__root) { width: 100%; }
.fas-count { display: inline-flex; align-items: center; justify-content: center; min-width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); margin-left: var(--mp-spacing-1); border-radius: var(--mp-radii-full); background: var(--mp-background-brand-bold); color: var(--mp-text-inverse, white); font-size: var(--mp-font-sizes-sm); }
.fas-example { display: flex; justify-content: flex-end; }
.fas-link { color: var(--mp-text-link); cursor: pointer; }
.fas-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.fas-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-16, 64px) 0; }
.fas-empty-img { width: 240px; height: 200px; object-fit: contain; }
.fas-empty-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.fas-table-wrap { flex-shrink: 0; overflow-x: auto; }
.fas-table { width: 100%; min-width: 880px; border-collapse: collapse; }
.fas-th { padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral-subtle); border-top: 1px solid var(--mp-border-default); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-align: left; white-space: nowrap; }
.fas-th--num { text-align: right; }
.fas-th--name { min-width: var(--mp-sizes-60, 240px); }
.fas-td { padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: middle; white-space: nowrap; }
.fas-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.fas-td--name { white-space: normal; }
.fas-td--account { background: var(--mp-background-neutral-subtle); font-weight: var(--mp-font-weights-semi-bold); }
.fas-td--none { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-6) 0; }
.fas-row--subtotal .fas-td { font-weight: var(--mp-font-weights-semi-bold); }
.fas-row--grand .fas-td { font-weight: var(--mp-font-weights-semi-bold); border-top: 1px solid var(--mp-border-bold, var(--mp-border-default)); border-bottom: none; }
.fas-showing { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.fasf-enter-active, .fasf-leave-active { transition: background-color 250ms ease; }
.fasf-enter-from, .fasf-leave-to { background-color: transparent; }
.fasf-enter-active .fasf-panel { transition: transform 350ms ease-out; }
.fasf-leave-active .fasf-panel { transition: transform 250ms ease-in; }
.fasf-enter-from .fasf-panel, .fasf-leave-to .fasf-panel { transform: translateX(calc(100% + 12px)); }
.fasf-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.fasf-panel { margin: var(--mp-spacing-3); width: min(420px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage); border-radius: var(--mp-radii-3xl, 24px); overflow: hidden; }
.fasf-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.fasf-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.fasf-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); }
.fasf-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.fasf-foot-actions { display: flex; gap: var(--mp-spacing-2); }
</style>
