<!-- prod-parity: jurnal-frontend-app/src/pages/reports/inventory/valuation/index.vue -->
<script setup lang="ts">
/**
 * Inventory valuation — Reports › Inventory › Inventory valuation.
 *
 * Prod layout: Start date / End date / Period + Show, a Filter drawer (product
 * category with Include all / Either, product), Export, "View example", then one
 * collapsible group per product (beginning balance, every movement, product
 * subtotal) and a grand "Total value (All pages)" row.
 *
 * Data: app/data/inventoryValuationReport.ts — ending stock = the Products index
 * on-hand, movements = seeded sales / purchase invoice lines, average cost from
 * the product master. The helper asserts the arithmetic in dev.
 */
import { ref, computed, reactive, watch, onBeforeUnmount } from 'vue'
import { MpButton, MpIcon, MpDatePicker, MpFormControl, MpFormLabel, MpRadio, MpSpinner } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import MultiSelectDropdown from '~/components/patterns/MultiSelectDropdown.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import {
  inventoryValuationReport, invValuationTotal, invValuationProducts, invValuationProductLabel,
  INV_VALUATION_TODAY_ISO, RPT_PERIOD_PRESETS, rptPresetRange, rptPresetFor, rptIsoToDmy, rptDmyToIso,
  type InvValuationGroup, type InvValuationRow, type RptPeriodPreset,
} from '~/data/inventoryValuationReport'

const { t } = useLocale()
const router = useRouter()

// ── Filter bar (prod defaults to "Today") ────────────────────────────────────
const startDate = ref(rptIsoToDmy(INV_VALUATION_TODAY_ISO))
const endDate = ref(rptIsoToDmy(INV_VALUATION_TODAY_ISO))
const period = ref<RptPeriodPreset>('today')
const periodOptions = computed(() => RPT_PERIOD_PRESETS.map((o) => ({ value: o.value, label: t(o.label) })))

function syncPeriod() { period.value = rptPresetFor(rptDmyToIso(startDate.value), rptDmyToIso(endDate.value), INV_VALUATION_TODAY_ISO) }
function onStartChange(v: string) {
  startDate.value = v
  if (rptDmyToIso(v) > rptDmyToIso(endDate.value)) endDate.value = v
  syncPeriod()
}
function onEndChange(v: string) {
  endDate.value = v
  if (rptDmyToIso(v) < rptDmyToIso(startDate.value)) startDate.value = v
  syncPeriod()
}
function onPeriodChange(v: string) {
  const p = (v || 'custom') as RptPeriodPreset
  period.value = p
  const r = rptPresetRange(p, INV_VALUATION_TODAY_ISO)
  if (r) { startDate.value = rptIsoToDmy(r[0]); endDate.value = rptIsoToDmy(r[1]) }
}

// ── Report filter drawer ─────────────────────────────────────────────────────
interface DrawerFilters { categories: string[]; categoryLogic: 'all' | 'either'; products: string[] }
const applied = reactive<DrawerFilters>({ categories: [], categoryLogic: 'either', products: [] })
const draft = reactive<DrawerFilters>({ categories: [], categoryLogic: 'either', products: [] })
const drawerOpen = ref(false)
const drawerType = ref<'filter' | 'export'>('filter')
const allProducts = invValuationProducts()
const categoryOptions = [...new Set(allProducts.map((p) => p.category))]
const productOptions = allProducts.map((p) => invValuationProductLabel(p))
const isFiltered = computed(() => applied.categories.length > 0 || applied.products.length > 0)

function openDrawer(type: 'filter' | 'export') {
  drawerType.value = type
  draft.categories = [...applied.categories]
  draft.categoryLogic = applied.categoryLogic
  draft.products = [...applied.products]
  drawerOpen.value = true
}
function resetDrawer() { draft.categories = []; draft.categoryLogic = 'either'; draft.products = [] }
function submitDrawer() {
  drawerOpen.value = false
  if (drawerType.value === 'export') { infoToast(t('Not in this prototype')); return }
  applied.categories = [...draft.categories]
  applied.categoryLogic = draft.categoryLogic
  applied.products = [...draft.products]
  show()
}

// ── Report states: idle → loading → ready ────────────────────────────────────
const state = ref<'idle' | 'loading' | 'ready'>('idle')
const shownRange = ref<[string, string]>([INV_VALUATION_TODAY_ISO, INV_VALUATION_TODAY_ISO])
let timer: ReturnType<typeof setTimeout> | null = null
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })
function show() {
  shownRange.value = [rptDmyToIso(startDate.value), rptDmyToIso(endDate.value)]
  page.value = 1
  state.value = 'loading'
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { state.value = 'ready' }, 700)
}

const groups = computed<InvValuationGroup[]>(() => state.value === 'idle' ? [] : inventoryValuationReport({
  startIso: shownRange.value[0], endIso: shownRange.value[1],
  categories: applied.categories, categoryLogic: applied.categoryLogic, products: applied.products,
}))
const grandTotal = computed(() => invValuationTotal(groups.value))

// ── Pagination (per product, prod default 25) ────────────────────────────────
const page = ref(1)
const perPage = ref(25)
const pageGroups = computed(() => groups.value.slice((page.value - 1) * perPage.value, page.value * perPage.value))
watch(perPage, () => { page.value = 1 })

// ── Collapse ─────────────────────────────────────────────────────────────────
const collapsed = ref<Set<string>>(new Set())
function toggle(sku: string) {
  const s = new Set(collapsed.value)
  s.has(sku) ? s.delete(sku) : s.add(sku)
  collapsed.value = s
}

function rowLink(r: InvValuationRow) {
  if (r.isBeginning) return
  router.push(r.type === 'Sales invoice' ? `/sales-invoices/${r.docId}` : `/purchase-invoices/${r.docId}`)
}
function mutationText(n: number) { return n > 0 ? `+${n}` : String(n) }
</script>

<template>
  <div class="ivr">
    <header class="ivr-titlebar">
      <div class="ivr-titlebar-left">
        <MpButton class="ivr-breadcrumb" variant="textLink" is-rounded @click="router.push('/inventory-report')">{{ t('Inventory') }}</MpButton>
        <h1 class="ivr-title">{{ t('Inventory valuation') }} <span class="ivr-title-cur">(IDR)</span></h1>
      </div>
    </header>

    <div class="ivr-stage">
      <!-- ── Filter section ── -->
      <div class="ivr-controls">
        <div class="ivr-controls-left">
          <MpFormControl id="ivr-start" class="ivr-field">
            <MpFormLabel>{{ t('Start date') }}</MpFormLabel>
            <div class="ivr-datepicker">
              <MpDatePicker id="ivr-start-dp" :model-value="startDate" format="DD/MM/YYYY" value-type="format" :is-clearable="false" use-portal @update:model-value="onStartChange" />
            </div>
          </MpFormControl>
          <MpFormControl id="ivr-end" class="ivr-field">
            <MpFormLabel>{{ t('End date') }}</MpFormLabel>
            <div class="ivr-datepicker">
              <MpDatePicker id="ivr-end-dp" :model-value="endDate" format="DD/MM/YYYY" value-type="format" :is-clearable="false" use-portal @update:model-value="onEndChange" />
            </div>
          </MpFormControl>
          <MpFormControl id="ivr-period" class="ivr-field">
            <MpFormLabel>{{ t('Period') }}</MpFormLabel>
            <ErpFilterSelect id="ivr-period-select" :model-value="period" :placeholder="t('Period')" :options="periodOptions" width="172px" :is-clearable="false" @update:model-value="onPeriodChange" />
          </MpFormControl>
          <MpButton is-rounded @click="show">{{ t('Show') }}</MpButton>
          <MpButton variant="secondary" is-rounded @click="openDrawer('filter')">
            {{ t('Filter') }}<span v-if="isFiltered" class="ivr-dot" />
          </MpButton>
        </div>
        <MpButton variant="secondary" is-rounded @click="openDrawer('export')">{{ t('Export') }}</MpButton>
      </div>

      <div class="ivr-example">
        <span class="ivr-link" role="button" @click="infoToast(t('Not in this prototype'))">{{ t('View example') }}</span>
      </div>

      <!-- ── Report ── -->
      <div v-if="state === 'loading'" class="ivr-loading">
        <MpSpinner />
        <p class="ivr-empty-title">{{ t('Loading report') }}</p>
      </div>

      <div v-else-if="state === 'idle'" class="ivr-empty">
        <img src="/illustrations/report-empty.png" alt="" class="ivr-empty-img" width="240" height="200" />
        <p class="ivr-empty-title">{{ t('Report will appear here') }}</p>
        <p class="ivr-empty-desc">{{ t('Select dates or period, then click') }} <strong>{{ t('Show') }}</strong> {{ t('button.') }}</p>
      </div>

      <div v-else-if="!groups.length" class="ivr-empty">
        <img src="/illustrations/empty-folder.png" alt="" class="ivr-empty-img" width="240" height="200" />
        <p class="ivr-empty-title">{{ t('There were no inventory details in this period') }}</p>
        <p class="ivr-empty-desc">{{ t('Recheck the filter or select other dates/period.') }}</p>
      </div>

      <template v-else>
        <div class="ivr-table-wrap">
          <table class="ivr-table">
            <thead>
              <tr>
                <th class="ivr-th ivr-th--date">{{ t('Date') }}</th>
                <th class="ivr-th">{{ t('Transaction type') }}</th>
                <th class="ivr-th">{{ t('Transaction no.') }}</th>
                <th class="ivr-th ivr-th--desc">{{ t('Description') }}</th>
                <th class="ivr-th ivr-th--num">{{ t('Mutation') }}</th>
                <th class="ivr-th ivr-th--num">{{ t('Stock on hand') }}</th>
                <th class="ivr-th">{{ t('Unit') }}</th>
                <th class="ivr-th ivr-th--num">{{ t('Average cost') }}</th>
                <th class="ivr-th ivr-th--num">{{ t('Buy/sell price') }}</th>
                <th class="ivr-th ivr-th--num">{{ t('Value') }}</th>
              </tr>
            </thead>
            <tbody v-for="g in pageGroups" :key="g.sku">
              <tr class="ivr-row ivr-row--group" @click="toggle(g.sku)">
                <td class="ivr-td ivr-td--group" colspan="10">
                  <MpIcon :name="collapsed.has(g.sku) ? 'caret-right' : 'caret-down'" size="sm" class="ivr-chev" />
                  <span class="ivr-link" @click.stop="router.push(`/product-list/${g.sku}`)">{{ g.sku }} | {{ g.name }}</span>
                </td>
              </tr>
              <template v-if="!collapsed.has(g.sku)">
                <tr v-for="r in g.rows" :key="r.id" class="ivr-row">
                  <td class="ivr-td">{{ formatDate(r.date) }}</td>
                  <td class="ivr-td">
                    <span v-if="r.isBeginning">{{ t('Beginning Balance') }}</span>
                    <span v-else class="ivr-link" @click="rowLink(r)">{{ t(r.type) }}</span>
                  </td>
                  <td class="ivr-td">
                    <span v-if="r.isBeginning">-</span>
                    <span v-else class="ivr-link" @click="rowLink(r)">{{ r.number }}</span>
                  </td>
                  <td class="ivr-td ivr-td--desc">{{ r.description || '-' }}</td>
                  <td class="ivr-td ivr-td--num">{{ r.isBeginning ? '-' : mutationText(r.mutation) }}</td>
                  <td class="ivr-td ivr-td--num">{{ r.stockOnHand }}</td>
                  <td class="ivr-td">{{ g.unit }}</td>
                  <td class="ivr-td ivr-td--num">{{ formatIDR(r.averageCost) }}</td>
                  <td class="ivr-td ivr-td--num">{{ formatIDR(r.price) }}</td>
                  <td class="ivr-td ivr-td--num">{{ formatIDR(r.value) }}</td>
                </tr>
                <tr class="ivr-row ivr-row--sub">
                  <td class="ivr-td ivr-td--subl" colspan="5">
                    <span class="ivr-muted">({{ g.sku }} | {{ g.name }})</span> {{ t('Total stock on hand') }}
                  </td>
                  <td class="ivr-td ivr-td--num">{{ g.endingQty }}</td>
                  <td class="ivr-td">{{ g.unit }}</td>
                  <td class="ivr-td ivr-td--num" colspan="2">{{ t('Subtotal value') }}</td>
                  <td class="ivr-td ivr-td--num">{{ formatIDR(g.subtotalValue) }}</td>
                </tr>
              </template>
            </tbody>
            <tbody>
              <tr class="ivr-row ivr-row--total">
                <td class="ivr-td ivr-td--num" colspan="9">
                  <span class="ivr-total-label">{{ t('Total value') }}</span>
                  <span class="ivr-total-sub">({{ t('All pages') }})</span>
                </td>
                <td class="ivr-td ivr-td--num">{{ formatIDR(grandTotal) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ErpPagination :current-page="page" :per-page="perPage" :total="groups.length" @page-change="page = $event" @per-page-change="perPage = $event" />
      </template>
    </div>

    <!-- ── Report filter / Export report drawer ── -->
    <Teleport to="body">
      <Transition name="ivf">
        <div v-if="drawerOpen" class="ivf-overlay" @click.self="drawerOpen = false">
          <div class="ivf-panel" role="dialog" :aria-label="drawerType === 'export' ? t('Export report') : t('Report filter')">
            <header class="ivf-head">
              <span class="ivf-title">{{ drawerType === 'export' ? t('Export report') : t('Report filter') }}</span>
              <MpButton variant="ghost" is-rounded :aria-label="t('Close')" @click="drawerOpen = false"><MpIcon name="close" size="md" /></MpButton>
            </header>
            <div class="ivf-body">
              <div class="ivf-grid">
                <MpFormControl id="ivf-start">
                  <MpFormLabel>{{ t('Start date') }}</MpFormLabel>
                  <div class="ivr-datepicker">
                    <MpDatePicker id="ivf-start-dp" :model-value="startDate" format="DD/MM/YYYY" value-type="format" :is-clearable="false" use-portal @update:model-value="onStartChange" />
                  </div>
                </MpFormControl>
                <MpFormControl id="ivf-end">
                  <MpFormLabel>{{ t('End date') }}</MpFormLabel>
                  <div class="ivr-datepicker">
                    <MpDatePicker id="ivf-end-dp" :model-value="endDate" format="DD/MM/YYYY" value-type="format" :is-clearable="false" use-portal @update:model-value="onEndChange" />
                  </div>
                </MpFormControl>
              </div>
              <MpFormControl id="ivf-period">
                <MpFormLabel>{{ t('Period') }}</MpFormLabel>
                <ErpFilterSelect id="ivf-period-select" :model-value="period" :placeholder="t('Period')" :options="periodOptions" width="100%" :is-clearable="false" @update:model-value="onPeriodChange" />
              </MpFormControl>
              <MpFormControl id="ivf-category">
                <MpFormLabel>{{ t('Product category') }}</MpFormLabel>
                <MultiSelectDropdown id="ivf-category-ms" v-model="draft.categories" :options="categoryOptions" :placeholder="t('Search product category')" is-full-width />
                <div class="ivf-radios">
                  <label class="ivf-radio"><MpRadio id="ivf-logic-all" name="ivf-logic" :is-checked="draft.categoryLogic === 'all'" @change="draft.categoryLogic = 'all'" /> {{ t('Include all') }}</label>
                  <label class="ivf-radio"><MpRadio id="ivf-logic-either" name="ivf-logic" :is-checked="draft.categoryLogic === 'either'" @change="draft.categoryLogic = 'either'" /> {{ t('Either') }}</label>
                </div>
                <p class="ivf-hint">{{ t('Example: Selecting two categories, A and B.') }} {{ t('Include all will show data of product category A and B.') }} {{ t('Either will show data of product category A, B, or both.') }}</p>
              </MpFormControl>
              <MpFormControl id="ivf-product">
                <MpFormLabel>{{ t('Product') }}</MpFormLabel>
                <MultiSelectDropdown id="ivf-product-ms" v-model="draft.products" :options="productOptions" :placeholder="t('Search product')" is-full-width />
              </MpFormControl>
            </div>
            <footer class="ivf-foot">
              <MpButton variant="ghost" is-rounded @click="resetDrawer">{{ t('Reset') }}</MpButton>
              <div class="ivf-foot-actions">
                <MpButton variant="ghost" is-rounded @click="drawerOpen = false">{{ t('Cancel') }}</MpButton>
                <MpButton is-rounded @click="submitDrawer">{{ drawerType === 'export' ? t('Export') : t('Apply') }}</MpButton>
              </div>
            </footer>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.ivr { display: flex; flex-direction: column; height: 100%; min-height: 0; }
.ivr-titlebar { flex-shrink: 0; min-height: 72px; background: var(--mp-background-neutral-subtle); display: flex; align-items: center; padding: 0 var(--mp-spacing-6); }
.ivr-titlebar-left { display: flex; flex-direction: column; justify-content: center; align-items: flex-start; }
.ivr-breadcrumb { padding: 0; height: auto; font-size: var(--mp-font-sizes-sm); }
.ivr-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default); }
.ivr-title-cur { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }

.ivr-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage); border-top-left-radius: var(--mp-radii-lg); padding: var(--mp-spacing-5) var(--mp-spacing-6) var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.ivr-controls { display: flex; align-items: flex-end; justify-content: space-between; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.ivr-controls-left { display: flex; align-items: flex-end; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.ivr-field { width: var(--mp-sizes-44, 176px); }
.ivr-datepicker { width: 100%; }
.ivr-datepicker :deep(.mp-datepicker__root) { width: 100%; }
.ivr-dot { display: inline-block; width: var(--mp-sizes-2, 8px); height: var(--mp-sizes-2, 8px); margin-left: var(--mp-spacing-1); border-radius: var(--mp-radii-full); background: var(--mp-colors-red-400); }
.ivr-example { display: flex; justify-content: flex-end; }
.ivr-link { color: var(--mp-text-link); cursor: pointer; }
.ivr-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.ivr-muted { color: var(--mp-text-secondary); }

.ivr-loading, .ivr-empty { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-16, 64px) 0; gap: var(--mp-spacing-2); }
.ivr-empty-img { width: 240px; height: 200px; object-fit: contain; }
.ivr-empty-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ivr-empty-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.ivr-table-wrap { flex-shrink: 0; overflow-x: auto; }
.ivr-table { width: 100%; min-width: 1200px; border-collapse: collapse; }
.ivr-th { padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral-subtle); border-top: 1px solid var(--mp-border-default); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-align: left; white-space: nowrap; }
.ivr-th--num { text-align: right; }
.ivr-th--date { width: var(--mp-sizes-28, 112px); }
.ivr-th--desc { min-width: var(--mp-sizes-64, 256px); }
.ivr-td { padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: middle; white-space: nowrap; }
.ivr-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.ivr-td--desc { white-space: normal; }
.ivr-row--group { cursor: pointer; }
.ivr-td--group { background: var(--mp-background-neutral-subtle); font-weight: var(--mp-font-weights-semi-bold); }
.ivr-chev { vertical-align: middle; margin-right: var(--mp-spacing-2); color: var(--mp-colors-icon-default); }
.ivr-row--sub .ivr-td { font-weight: var(--mp-font-weights-semi-bold); border-top: 1px solid var(--mp-border-bold, var(--mp-border-default)); border-bottom: 1px solid var(--mp-border-bold, var(--mp-border-default)); }
.ivr-td--subl { text-align: right; }
.ivr-row--sub .ivr-muted { font-weight: var(--mp-font-weights-regular); }
.ivr-row--total .ivr-td { font-weight: var(--mp-font-weights-semi-bold); border-top: 1px solid var(--mp-border-bold, var(--mp-border-default)); }
.ivr-total-label { display: block; }
.ivr-total-sub { display: block; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }

.ivf-enter-active, .ivf-leave-active { transition: background-color 250ms ease; }
.ivf-enter-from, .ivf-leave-to { background-color: transparent; }
.ivf-enter-active .ivf-panel { transition: transform 350ms ease-out; }
.ivf-leave-active .ivf-panel { transition: transform 250ms ease-in; }
.ivf-enter-from .ivf-panel, .ivf-leave-to .ivf-panel { transform: translateX(calc(100% + 12px)); }
.ivf-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.ivf-panel { margin: var(--mp-spacing-3); width: min(420px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage); border-radius: var(--mp-radii-3xl, 24px); overflow: hidden; }
.ivf-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.ivf-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ivf-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4); }
.ivf-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-3); }
.ivf-radios { display: flex; gap: var(--mp-spacing-5); margin-top: var(--mp-spacing-2); }
.ivf-radio { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); cursor: pointer; }
.ivf-hint { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ivf-foot { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.ivf-foot-actions { display: flex; gap: var(--mp-spacing-2); }
</style>
