<!-- prod-parity: jurnal-frontend-app/src/pages/consolidations/reports/index.vue (+ profit_loss, balance_sheet, components/report-selector, report-tabs, report-filter, report-table, report-settings-popover) -->
<script setup lang="ts">
/**
 * Consolidation report — prod's /v3/consolidations/reports. Pick a completed
 * consolidation, then Profit & Loss / Balance Sheet (Cash Flow and Trial
 * Balance tabs as in prod; Trial Balance lists every consolidation account). Filters: business unit + intercompany elimination
 * (without / with / only). Columns by business unit: one per entity, then
 * Elimination, then the consolidated total — consolidated = Σ entities −
 * eliminations (asserted in data/consolidation.ts).
 */
import {
  MpButton, MpIcon, MpCheckbox, MpRadio, MpTooltip,
  MpTabs, MpTabList, MpTab,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import { infoToast } from '~/utils/toasts'
import { formatIDR } from '~/utils/currency'
import {
  consolidations, consolUnits, profitLossLines, balanceSheetLines, trialBalanceLines, assertReportBalances, formatPeriod, formatDay,
  type EliminationMode, type ReportLine,
} from '~/data/consolidation'

const { t } = useLocale()
const route = useRoute()
const router = useRouter()
const go = inject<(id: string, extra?: Record<string, string>) => void>('consolGo')!

const completed = computed(() => consolidations.filter((c) => c.status === 'completed').sort((a, b) => b.periodEnd.localeCompare(a.periodEnd)))
const selectedId = ref(String(route.query.consolidation ?? '') || completed.value[0]?.id || '')
watch(completed, (list) => { if (!list.some((c) => c.id === selectedId.value)) selectedId.value = list[0]?.id ?? '' })
const selected = computed(() => completed.value.find((c) => c.id === selectedId.value) ?? null)
const consolidationOptions = computed(() => completed.value.map((c) => ({ value: c.id, label: c.name })))
watch(selectedId, (v) => { router.replace({ query: { ...route.query, consolidation: v } }); resetFilters() })

type Tab = 'profit_loss' | 'balance_sheet' | 'cash_flow' | 'trial_balance'
const tab = ref<Tab>('profit_loss')
const TABS: { value: Tab; label: string }[] = [
  { value: 'profit_loss', label: 'Profit & Loss' },
  { value: 'balance_sheet', label: 'Balance Sheet' },
  { value: 'cash_flow', label: 'Cash Flow' },
  { value: 'trial_balance', label: 'Trial Balance' },
]

const tabIndex = computed({ get: () => TABS.findIndex((x) => x.value === tab.value), set: (i: number) => { tab.value = TABS[i]?.value ?? 'profit_loss' } })

// ─── Filters (draft → Apply) ─────────────────────────────────────────────────
const draftUnits = ref<string[]>([])
const draftMode = ref<EliminationMode>('with_elimination')
const appliedUnits = ref<string[]>([])
const appliedMode = ref<EliminationMode>('with_elimination')
function resetFilters() {
  const ids = selected.value?.unitIds ?? []
  draftUnits.value = [...ids]; appliedUnits.value = [...ids]
  draftMode.value = 'with_elimination'; appliedMode.value = 'with_elimination'
}
resetFilters()
function applyFilters() { appliedUnits.value = [...draftUnits.value]; appliedMode.value = draftMode.value }
const modeOptions = computed(() => [
  { value: 'without_elimination', label: t('Without elimination') },
  { value: 'with_elimination', label: t('With elimination') },
  { value: 'only_elimination', label: t('Only elimination') },
])
function toggleUnit(id: string) { draftUnits.value = draftUnits.value.includes(id) ? draftUnits.value.filter((x) => x !== id) : [...draftUnits.value, id] }
const unitTriggerLabel = computed(() => draftUnits.value.length === (selected.value?.unitIds.length ?? 0)
  ? t('All business units') : `${draftUnits.value.length} ${t('business unit selected')}`)
const unitsInOrder = computed(() => (selected.value?.unitIds ?? []).filter((id) => appliedUnits.value.includes(id)))

// ─── Settings popover ────────────────────────────────────────────────────────
const density = ref<'default' | 'compact'>('default')
const columnGroup = ref<'by_business_unit' | 'by_period'>('by_business_unit')

// ─── Report lines ────────────────────────────────────────────────────────────
const integrityError = ref('')
const lines = computed<ReportLine[]>(() => {
  const c = selected.value
  if (!c || !unitsInOrder.value.length) return []
  try { assertReportBalances(c, unitsInOrder.value); integrityError.value = '' } catch (e) { integrityError.value = (e as Error).message }
  return tab.value === 'balance_sheet' ? balanceSheetLines(c, unitsInOrder.value) : tab.value === 'trial_balance' ? trialBalanceLines(c, unitsInOrder.value) : profitLossLines(c, unitsInOrder.value)
})
interface Col { key: string; label: string; sub?: string }
const cols = computed<Col[]>(() => {
  if (columnGroup.value === 'by_period') return [{ key: appliedMode.value === 'only_elimination' ? 'elim' : appliedMode.value === 'without_elimination' ? 'gross' : 'consolidated', label: selected.value ? formatPeriod(selected.value) : '' }]
  if (appliedMode.value === 'only_elimination') return [{ key: 'elim', label: t('Elimination') }]
  const unitCols = unitsInOrder.value.map((id) => {
    const u = consolUnits.find((x) => x.id === id)
    return { key: id, label: u?.code ?? id, sub: u?.name }
  })
  if (appliedMode.value === 'without_elimination') return [...unitCols, { key: 'gross', label: t('Total') }]
  return [...unitCols, { key: 'elim', label: t('Elimination') }, { key: 'consolidated', label: t('Ending balance after elimination') }]
})
function cell(l: ReportLine, key: string): string {
  if (!l.values) return ''
  if (key === 'gross') return formatIDR(unitsInOrder.value.reduce((s, u) => s + (l.values![u] ?? 0), 0))
  const v = l.values[key] ?? 0
  if (key === 'elim') return v ? formatIDR(-v) : '-'
  return formatIDR(v)
}
const periodLabel = computed(() => selected.value ? `${formatDay(selected.value.periodStart)} - ${formatDay(selected.value.periodEnd)}` : '')
function exportReport(fmt: string) { infoToast(`${t('Not in this prototype')} (${fmt})`) }
</script>

<template>
  <div class="rp">
    <div class="rp-head">
      <div class="rp-selector">
        <h2 class="rp-title">{{ t('Report') }}</h2>
        <ErpFilterSelect v-if="completed.length" id="rp-consolidation" v-model="selectedId" :placeholder="t('Select consolidation')" :options="consolidationOptions" :is-clearable="false" width="320px" :empty-text="t('No consolidation found')" />
      </div>
    </div>

    <!-- No completed consolidation -->
    <div v-if="!selected" class="empty-full">
      <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
      <p class="empty-full-title">{{ t('No completed consolidation yet') }}</p>
      <p class="empty-full-desc">{{ t('Complete a consolidation to view the report.') }}</p>
      <MpButton variant="secondary" is-rounded @click="go('list')">{{ t('Consolidation list') }}</MpButton>
    </div>

    <template v-else>
      <MpTabs id="rp-tabs" v-model="tabIndex" is-manual variant-color="green">
        <MpTabList>
          <MpTab v-for="tb in TABS" :id="`rp-tab-${tb.value}`" :key="tb.value" :value="tb.value">{{ t(tb.label) }}</MpTab>
        </MpTabList>
      </MpTabs>

      <div class="rp-filters">
        <div class="rp-filter-left">
          <MpPopover id="rp-units" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <MpButton variant="secondary" is-rounded right-icon="chevrons-down">{{ unitTriggerLabel }}</MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent class="erp-dropdown-menu rp-units-menu">
              <div class="rp-units-list">
                <MpCheckbox
                  id="rp-u-all"
                  :is-checked="draftUnits.length === selected.unitIds.length"
                  :is-indeterminate="draftUnits.length > 0 && draftUnits.length < selected.unitIds.length"
                  @change="draftUnits = draftUnits.length === selected.unitIds.length ? [] : [...selected.unitIds]"
                >{{ t('All business units') }}</MpCheckbox>
                <MpCheckbox v-for="id in selected.unitIds" :id="`rp-u-${id}`" :key="id" :is-checked="draftUnits.includes(id)" @change="toggleUnit(id)">
                  {{ consolUnits.find((u) => u.id === id)?.name ?? id }}
                </MpCheckbox>
              </div>
            </MpPopoverContent>
          </MpPopover>
          <ErpFilterSelect id="rp-mode" :model-value="draftMode" :placeholder="t('Intercompany elimination')" :options="modeOptions" :is-clearable="false" width="200px" @update:model-value="(v: string) => (draftMode = v as EliminationMode)" />
          <MpButton variant="secondary" is-rounded @click="applyFilters">{{ t('Apply') }}</MpButton>
        </div>
        <div class="rp-filter-right">
          <MpPopover id="rp-settings" use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="ghost" is-rounded left-icon="settings" :aria-label="t('Table settings')" />
            </MpPopoverTrigger>
            <MpPopoverContent class="erp-dropdown-menu rp-settings">
              <div class="rp-settings-body">
                <span class="rp-settings-label">{{ t('Density') }}</span>
                <MpRadio id="rp-d-default" name="rp-density" value="default" :is-checked="density === 'default'" @change="density = 'default'">{{ t('Default') }}</MpRadio>
                <span class="rp-settings-hint">{{ t('This screen provides more space for transactions for ease of reading.') }}</span>
                <MpRadio id="rp-d-compact" name="rp-density" value="compact" :is-checked="density === 'compact'" @change="density = 'compact'">{{ t('Compact') }}</MpRadio>
                <span class="rp-settings-hint">{{ t('This screen loads more transactions on the screen, which is ideal for faster data checking.') }}</span>
                <span class="rp-settings-label">{{ t('Column group') }}</span>
                <MpRadio id="rp-c-period" name="rp-colgroup" value="by_period" :is-checked="columnGroup === 'by_period'" @change="columnGroup = 'by_period'">{{ t('By period') }}</MpRadio>
                <span class="rp-settings-hint">{{ t('Compare data between time periods.') }}</span>
                <MpRadio id="rp-c-bu" name="rp-colgroup" value="by_business_unit" :is-checked="columnGroup === 'by_business_unit'" @change="columnGroup = 'by_business_unit'">{{ t('By business unit') }}</MpRadio>
                <span class="rp-settings-hint">{{ t('Compare data between business units.') }}</span>
              </div>
            </MpPopoverContent>
          </MpPopover>
          <MpPopover id="rp-export" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="secondary" is-rounded right-icon="chevrons-down">{{ t('Export') }}</MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent class="erp-dropdown-menu">
              <MpPopoverList>
                <MpPopoverListItem @click="exportReport('PDF')">PDF</MpPopoverListItem>
                <MpPopoverListItem @click="exportReport('XLS')">XLS</MpPopoverListItem>
                <MpPopoverListItem @click="exportReport('CSV')">CSV</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <p v-if="integrityError" class="rp-error">{{ integrityError }}</p>

      <!-- Cash flow -->
      <div v-if="tab === 'cash_flow'" class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No report data found') }}</p>
        <p class="empty-full-desc">{{ t('No results match the filter criteria. Try adjusting your filter.') }}</p>
      </div>

      <div v-else-if="!lines.length" class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No report data found') }}</p>
        <p class="empty-full-desc">{{ t('No results match the filter criteria. Try adjusting your filter.') }}</p>
      </div>

      <div v-else class="rp-table-wrap">
        <table class="rp-table" :class="{ 'rp-table--compact': density === 'compact' }">
          <thead>
            <tr>
              <th class="rp-th rp-th--account" rowspan="2">{{ t('Account') }}</th>
              <th class="rp-th rp-th--period" :colspan="cols.length">{{ periodLabel }}</th>
            </tr>
            <tr>
              <th v-for="col in cols" :key="col.key" class="rp-th rp-num" :class="{ 'rp-th--total': col.key === 'consolidated' || col.key === 'gross' }">
                <MpTooltip v-if="col.sub" :label="col.sub" placement="top"><span>{{ col.label }}</span></MpTooltip>
                <span v-else>{{ col.label }}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(l, i) in lines" :key="i" class="rp-row" :class="`rp-row--${l.kind}`">
              <td class="rp-td rp-td--account" :style="{ paddingLeft: `calc(var(--mp-spacing-3) + ${l.level} * var(--mp-spacing-6))` }">
                <span v-if="l.code" class="rp-code">{{ l.code }}</span>{{ t(l.label) }}
              </td>
              <td v-for="col in cols" :key="col.key" class="rp-td rp-num" :class="{ 'rp-td--total': col.key === 'consolidated' || col.key === 'gross', 'rp-td--elim': col.key === 'elim' }">{{ cell(l, col.key) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>
  </div>
</template>

<style scoped>
.rp { display: flex; flex-direction: column; gap: var(--mp-spacing-4); flex: 1; min-height: 0; }
.rp-head { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.rp-selector { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.rp-title { margin: 0; font-size: var(--mp-font-sizes-xl); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rp-filters { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.rp-filter-left, .rp-filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.rp-units-list { display: flex; flex-direction: column; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3); min-width: var(--mp-sizes-72, 288px); }
.rp-settings-body { display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: var(--mp-spacing-3); width: var(--mp-sizes-80, 320px); }
.rp-settings-label { margin-top: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rp-settings-hint { padding-left: var(--mp-spacing-7, 28px); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.rp-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }

.rp-table-wrap { overflow-x: auto; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.rp-table { width: 100%; border-collapse: separate; border-spacing: 0; }
.rp-th {
  padding: var(--mp-spacing-2) var(--mp-spacing-3); text-align: left; white-space: nowrap;
  background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary);
}
.rp-th--account { min-width: var(--mp-sizes-80, 320px); vertical-align: bottom; position: sticky; left: 0; z-index: 1; }
.rp-th--period { text-align: center; }
.rp-th--total { color: var(--mp-text-default); }
.rp-td { padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.rp-td--account { position: sticky; left: 0; background: var(--mp-background-stage, #fff); white-space: normal; }
.rp-table--compact .rp-td { padding-top: var(--mp-spacing-1); padding-bottom: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); }
.rp-num { text-align: right !important; font-variant-numeric: tabular-nums; }
.rp-td--total { font-weight: var(--mp-font-weights-semi-bold); }
.rp-td--elim { color: var(--mp-text-secondary); }
.rp-code { margin-right: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.rp-row--section .rp-td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-neutral-subtle); text-transform: uppercase; font-size: var(--mp-font-sizes-sm); letter-spacing: 1px; }
.rp-row--category .rp-td { font-weight: var(--mp-font-weights-semi-bold); }
.rp-row--total .rp-td { font-weight: var(--mp-font-weights-semi-bold); border-top: 1px solid var(--mp-border-default); }
.rp-row--grand .rp-td { font-weight: var(--mp-font-weights-semi-bold); background: var(--mp-background-neutral-subtle); }
.rp-table tbody tr:last-child .rp-td { border-bottom: none; }

.empty-full { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-6) 0; }
.empty-illustration { width: var(--empty-illo-w, 288px); height: var(--empty-illo-h, 240px); object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
