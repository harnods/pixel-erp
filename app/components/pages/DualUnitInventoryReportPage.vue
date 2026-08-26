<script setup lang="ts">
/**
 * Dual Unit Inventory Report — Reports › Inventory › Dual Unit Inventory
 * (PRD "Dual Unit Inventory", Story 14).
 *
 * Laid out to match the agreed export template: one group per DUI product, expanding
 * into batch blocks with a line per stock mutation in the filtered range, showing
 * mutation AND running stock in BOTH units, closed by a "Total on-hand stock" line
 * carrying ending stock, average cost and valuation.
 *
 * One deliberate addition to the template: each batch gets its OWN line, carrying that
 * batch's ending stock (plus its unit conversion, expiry and tolerance). In the sheet a
 * batch's stock is only readable off its last mutation row, whose position moves with
 * the number of mutations — the batch line puts the answer at the head of the block.
 *
 * Products and batches are EXPANDED on load (the template is always fully expanded) and
 * collapse independently; a collapsed row keeps its summary figures. Rows come from
 * `dualUnitReportGroups()` — this page only filters, formats and exports.
 *
 * Full-bleed (rendered via detailMatch in [...slug].vue), so it draws its own 72px
 * title bar with the Reports breadcrumb and its own 24px stage padding.
 */
import { ref, computed, watch } from 'vue'
import { MpButton, MpIcon, MpTooltip } from '@mekari/pixel3'
import AdvanceDateFilter from '~/components/patterns/AdvanceDateFilter.vue'
import MultiSelectDropdown from '~/components/patterns/MultiSelectDropdown.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import { formatDate } from '~/utils/date'
import { formatIDR } from '~/utils/currency'
import { resolveDateFilterRange, toIso, type DateFilterValue } from '~/utils/dateFilter'
import { TODAY, TODAY_ISO } from '~/data/master'
import { warehouses } from '~/data/warehouses'
import { DUI_PRODUCTS, dualUnitReportGroups, type DuiReportGroup } from '~/data/dualUnitInventory'

const { t, locale } = useLocale()
const router = useRouter()

const TITLE = 'Dual Unit Inventory Report'

// ── Filters ─────────────────────────────────────────────────────────────────────
// Date range is mandatory (a stock report has no "all time") — it drives both the
// rows and the "From … - …" caption. Defaults to the current month of the mock
// timeline, not the real clock, which is why AdvanceDateFilter gets `:today`.
const dateFilter = ref<DateFilterValue>({ mode: 'month', date: TODAY_ISO })
// MultiSelectDropdown works in plain option strings, so the selection is held as
// warehouse NAMES and mapped back to ids for the row builder. Empty = all warehouses.
const warehouseNames = ref<string[]>([])
const search = ref('')

const range = computed(() => {
  const r = resolveDateFilterRange(dateFilter.value, TODAY)
  // AdvanceDateFilter is not clearable here, but an incomplete custom pick resolves
  // to null — fall back to the current month so the table never blanks mid-pick.
  return r ?? resolveDateFilterRange({ mode: 'month', date: TODAY_ISO }, TODAY)!
})
const fromIso = computed(() => toIso(range.value.start))
const toIsoDate = computed(() => toIso(range.value.end))

/** Caption date — spelled-out month, as the export template writes it ("1 June 2026").
 *  The month name follows the UI language, unlike the numeric table dates. */
function captionDate(d: Date): string {
  const tag = locale.value === 'id' ? 'id-ID' : 'en-GB'
  return d.toLocaleDateString(tag, { day: 'numeric', month: 'long', year: 'numeric' })
}
const rangeCaption = computed(() => `${t('From')} ${captionDate(range.value.start)} - ${captionDate(range.value.end)}`)

const activeWarehouses = computed(() => warehouses.filter((w) => !w.isDefault && w.status === 'active'))
const warehouseOptions = computed(() => activeWarehouses.value.map((w) => w.name))
const warehouseIds = computed(() => {
  if (!warehouseNames.value.length) return []
  const idByName = new Map(activeWarehouses.value.map((w) => [w.name, w.id]))
  return warehouseNames.value.map((n) => idByName.get(n)).filter((id): id is string => Boolean(id))
})

// ── Rows ────────────────────────────────────────────────────────────────────────
const groups = computed<DuiReportGroup[]>(() => dualUnitReportGroups({
  from: fromIso.value,
  to: toIsoDate.value,
  warehouseIds: warehouseIds.value,
  search: search.value,
}))

// ── Expand / collapse ───────────────────────────────────────────────────────────
// Tracked as the COLLAPSED set so "expanded on load" needs no seeding and survives
// filter changes that bring new products into view.
const collapsed = ref<Set<string>>(new Set())
function isExpanded(sku: string): boolean { return !collapsed.value.has(sku) }
function toggleGroup(sku: string) {
  const next = new Set(collapsed.value)
  if (next.has(sku)) next.delete(sku)
  else next.add(sku)
  collapsed.value = next
}
const allCollapsed = computed(() => groups.value.length > 0 && groups.value.every((g) => collapsed.value.has(g.sku)))
function toggleAll() {
  collapsed.value = allCollapsed.value ? new Set() : new Set(groups.value.map((g) => g.sku))
}

// Each batch line can fold its own mutations away — the batch line already carries the
// batch's stock, so folding loses no answer, only the audit trail behind it. Tracked as
// the collapsed set for the same reason as products: open is the default.
const collapsedBatches = ref<Set<string>>(new Set())
function batchKey(sku: string, batchNo: string): string { return `${sku}::${batchNo}` }
function isBatchExpanded(sku: string, batchNo: string): boolean {
  return !collapsedBatches.value.has(batchKey(sku, batchNo))
}
function toggleBatch(sku: string, batchNo: string) {
  const key = batchKey(sku, batchNo)
  const next = new Set(collapsedBatches.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsedBatches.value = next
}

/** Rows the product's SKU cell has to span: the product line, each batch line plus its
 *  visible mutation rows, and the closing line. */
function groupRowspan(g: DuiReportGroup): number {
  const batchRows = g.batches.reduce(
    (sum, b) => sum + 1 + (isBatchExpanded(g.sku, b.batchNo) ? b.rows.length : 0),
    0,
  )
  return 1 + batchRows + 1
}

// ── Pagination — by PRODUCT, since a product is one expandable block ─────────────
const currentPage = ref(1)
const perPage = ref(25)
const total = computed(() => groups.value.length)
const pagedGroups = computed(() => {
  const start = (currentPage.value - 1) * perPage.value
  return groups.value.slice(start, start + perPage.value)
})
watch([dateFilter, warehouseNames, search, perPage], () => { currentPage.value = 1 })

// ── Cell formatting ─────────────────────────────────────────────────────────────
const qtyFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })
/** A quantity always travels with its unit, as one right-aligned cell: "10.000 mm". */
function fmtQty(value: number, unit: string): string {
  return `${qtyFormat.format(value)} ${unit}`
}
/** Batch caption line — expiry and tolerance, either of which may be unset. */
function batchMeta(expiryDate: string, tolerancePct: number | null): string {
  const parts: string[] = []
  if (expiryDate) parts.push(`${t('Exp.')} ${formatDate(expiryDate)}`)
  if (tolerancePct !== null) parts.push(`${t('Tolerance')} ±${tolerancePct}%`)
  return parts.join(' · ')
}

// ── Export (CSV) ────────────────────────────────────────────────────────────────
// Mirrors the export template exactly, including its value/unit column pairs, so the
// download can be diffed against the spreadsheet.
function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
function csvQty(value: number | null, unit: string): [string, string] {
  return value === null ? ['', ''] : [String(value), unit]
}
function exportCsv() {
  const rows: string[][] = [
    [t(TITLE)],
    [rangeCaption.value],
    [],
    [
      t('Product SKU'), t('Product name'), t('Transaction'), t('Date'),
      t('Mutation in Base Unit'), '', t('Stock in Base Unit'), '',
      t('Mutation in Secondary Unit'), '', t('Stock in Secondary Unit'), '',
      t('Average cost'), t('Value'),
    ],
  ]
  for (const g of groups.value) {
    rows.push(['', g.name, '', '', '', '', '', '', '', '', '', '', '', ''])
    for (const b of g.batches) {
      b.rows.forEach((row, i) => {
        const label = i === 0 ? [b.batchNo, b.conversionLabel].filter(Boolean).join(' ') : ''
        rows.push([
          '', label, t(row.transaction), formatDate(row.date),
          ...csvQty(row.baseDelta, g.baseUnit), ...csvQty(row.baseStock, g.baseUnit),
          ...csvQty(row.secondaryDelta, g.secondaryUnit), ...csvQty(row.secondaryStock, g.secondaryUnit),
          '', '',
        ])
      })
    }
    rows.push([
      '', '', t('Total on-hand stock'), '',
      '', '', ...csvQty(g.endingBase, g.baseUnit),
      '', '', ...csvQty(g.endingSecondary, g.secondaryUnit),
      String(g.averageCost), String(g.value),
    ])
    rows.push([])
  }
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\r\n')
  const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `dual-unit-inventory-${fromIso.value}-to-${toIsoDate.value}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ── Empty states ────────────────────────────────────────────────────────────────
// The report exists as soon as the company has DUI; it is empty until a product
// actually uses a secondary inventory unit (Story 14).
const hasDuiProducts = computed(() => DUI_PRODUCTS.length > 0)
const emptyIllustration = '/illustrations/empty-folder.png'
</script>

<template>
  <div class="dui-page">
    <!-- ── Title bar (full-bleed detail) ── -->
    <div class="dui-titlebar">
      <div class="dui-titlebar-left">
        <MpButton class="dui-breadcrumb" variant="textLink" size="sm" @click="router.push('/inventory-report')">{{ t('Reports') }}</MpButton>
        <h1 class="dui-title">{{ t(TITLE) }}</h1>
      </div>
    </div>

    <!-- ── Stage ── -->
    <div class="dui-stage">
      <!-- Filter bar: date range + warehouse on the left; Export + Search on the right. -->
      <div class="dui-filter-bar">
        <div class="dui-filter-left">
          <AdvanceDateFilter
            id="dui-date"
            v-model="dateFilter"
            :today="TODAY"
            :clearable="false"
            :placeholder="t('Select date')"
          />

          <MultiSelectDropdown
            id="dui-wh"
            v-model="warehouseNames"
            :options="warehouseOptions"
            :placeholder="t('All warehouses')"
          />

          <MpButton v-if="total" class="dui-toggle-all" variant="textLink" size="sm" @click="toggleAll">
            {{ allCollapsed ? t('Expand all') : t('Collapse all') }}
          </MpButton>
        </div>

        <div class="dui-filter-right">
          <MpTooltip id="tt-dui-export" :label="t('Export')" placement="bottom" use-portal>
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" @click="exportCsv" />
          </MpTooltip>
          <!-- Search pill: the project's sanctioned pattern (erp.css .filter-search) —
               MpInput can't sit borderless inside the pill, so the input stays raw. -->
          <div class="filter-search">
            <MpIcon name="search" size="md" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search product, SKU or batch')" />
            <MpIcon v-if="search" name="close" size="sm" class="search-clear" role="button" :aria-label="t('Clear search')" @click="search = ''" />
          </div>
        </div>
      </div>

      <!-- Resolved range — the report's own period line, as in the export template. -->
      <p class="dui-range-caption">{{ rangeCaption }}</p>

      <!-- Table + pagination -->
      <div v-if="total" class="dui-table-section">
        <div class="dui-table-wrap">
          <table class="dui-table">
            <thead>
              <tr>
                <th class="dui-th" rowspan="2">{{ t('Product SKU') }}</th>
                <th class="dui-th" rowspan="2">{{ t('Product name') }}</th>
                <th class="dui-th" rowspan="2">{{ t('Transaction') }}</th>
                <th class="dui-th" rowspan="2">{{ t('Date') }}</th>
                <th class="dui-th dui-th--group" colspan="2">{{ t('Base unit') }}</th>
                <th class="dui-th dui-th--group" colspan="2">{{ t('Secondary unit') }}</th>
                <th class="dui-th dui-th--right" rowspan="2">{{ t('Average cost') }}</th>
                <th class="dui-th dui-th--right" rowspan="2">{{ t('Value') }}</th>
              </tr>
              <tr>
                <th class="dui-th dui-th--right">{{ t('Mutation') }}</th>
                <th class="dui-th dui-th--right">{{ t('Stock') }}</th>
                <th class="dui-th dui-th--right">{{ t('Mutation') }}</th>
                <th class="dui-th dui-th--right">{{ t('Stock') }}</th>
              </tr>
            </thead>
            <tbody v-for="g in pagedGroups" :key="g.sku">
              <!-- Product line. Collapsed, it carries the closing figures as a summary. -->
              <tr class="dui-group-row" @click="toggleGroup(g.sku)">
                <td class="dui-td dui-td--sku" :rowspan="isExpanded(g.sku) ? groupRowspan(g) : 1">
                  <span class="dui-sku-cell">
                    <MpButton
                      class="dui-expand-btn" variant="ghost" size="sm"
                      :left-icon="isExpanded(g.sku) ? 'chevrons-down' : 'chevrons-right'"
                      :aria-label="isExpanded(g.sku) ? t('Collapse') : t('Expand')"
                    />
                    <span>{{ g.sku }}</span>
                  </span>
                </td>
                <td class="dui-td dui-td--product">{{ g.name }}</td>
                <template v-if="isExpanded(g.sku)">
                  <td class="dui-td" colspan="8" />
                </template>
                <template v-else>
                  <td class="dui-td" colspan="3" />
                  <td class="dui-td dui-td--right">{{ fmtQty(g.endingBase, g.baseUnit) }}</td>
                  <td class="dui-td" />
                  <td class="dui-td dui-td--right">{{ fmtQty(g.endingSecondary, g.secondaryUnit) }}</td>
                  <td class="dui-td dui-td--right">{{ formatIDR(g.averageCost) }}</td>
                  <td class="dui-td dui-td--right">{{ formatIDR(g.value) }}</td>
                </template>
              </tr>

              <template v-if="isExpanded(g.sku)">
                <template v-for="b in g.batches" :key="b.batchNo">
                  <!-- Batch line. It carries the batch's own ending stock, so the answer
                       sits at the head of the block instead of on its last mutation row —
                       whose position moves with the number of mutations. -->
                  <tr class="dui-batch-row" @click="toggleBatch(g.sku, b.batchNo)">
                    <td class="dui-td dui-td--batch">
                      <span class="dui-batch-cell">
                        <MpButton
                          class="dui-expand-btn" variant="ghost" size="sm"
                          :left-icon="isBatchExpanded(g.sku, b.batchNo) ? 'chevrons-down' : 'chevrons-right'"
                          :aria-label="isBatchExpanded(g.sku, b.batchNo) ? t('Collapse') : t('Expand')"
                        />
                        <span class="dui-batch-text">
                          <span class="dui-batch-no">{{ b.batchNo }} · {{ b.conversionLabel || '—' }}</span>
                          <span v-if="batchMeta(b.expiryDate, b.tolerancePct)" class="dui-batch-meta">{{ batchMeta(b.expiryDate, b.tolerancePct) }}</span>
                        </span>
                      </span>
                    </td>
                    <td class="dui-td" colspan="2" />
                    <td class="dui-td" />
                    <td class="dui-td dui-td--right dui-td--closing">{{ fmtQty(b.endingBase, g.baseUnit) }}</td>
                    <td class="dui-td" />
                    <td class="dui-td dui-td--right dui-td--closing">{{ fmtQty(b.endingSecondary, g.secondaryUnit) }}</td>
                    <td class="dui-td" colspan="2" />
                  </tr>
                  <!-- Its mutations — the audit trail behind that stock figure. -->
                  <tr v-for="(row, i) in (isBatchExpanded(g.sku, b.batchNo) ? b.rows : [])" :key="`${b.batchNo}-${i}`" class="dui-row">
                    <td class="dui-td dui-td--batch" />
                    <td class="dui-td">{{ t(row.transaction) }}</td>
                    <td class="dui-td">{{ formatDate(row.date) }}</td>
                    <td class="dui-td dui-td--right">{{ fmtQty(row.baseDelta, g.baseUnit) }}</td>
                    <td class="dui-td dui-td--right">{{ fmtQty(row.baseStock, g.baseUnit) }}</td>
                    <td class="dui-td dui-td--right">{{ fmtQty(row.secondaryDelta, g.secondaryUnit) }}</td>
                    <td class="dui-td dui-td--right">{{ fmtQty(row.secondaryStock, g.secondaryUnit) }}</td>
                    <td class="dui-td" colspan="2" />
                  </tr>
                </template>

                <!-- Closing line -->
                <tr class="dui-closing-row">
                  <td class="dui-td" />
                  <td class="dui-td dui-td--closing" colspan="2">{{ t('Total on-hand stock') }}</td>
                  <td class="dui-td" />
                  <td class="dui-td dui-td--right dui-td--closing">{{ fmtQty(g.endingBase, g.baseUnit) }}</td>
                  <td class="dui-td" />
                  <td class="dui-td dui-td--right dui-td--closing">{{ fmtQty(g.endingSecondary, g.secondaryUnit) }}</td>
                  <td class="dui-td dui-td--right dui-td--closing">{{ formatIDR(g.averageCost) }}</td>
                  <td class="dui-td dui-td--right dui-td--closing">{{ formatIDR(g.value) }}</td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <ErpPagination
          :current-page="currentPage"
          :per-page="perPage"
          :total="total"
          @page-change="currentPage = $event"
          @per-page-change="perPage = $event"
        />
      </div>

      <!-- Empty states: no DUI product at all vs nothing inside the current filters -->
      <div v-else class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ hasDuiProducts ? t('No report data found') : t('No dual unit products') }}</p>
        <p class="empty-full-desc">
          {{ hasDuiProducts
            ? t('Try adjusting your filters.')
            : t('Products with a secondary inventory unit will appear here.') }}
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.dui-page { display: flex; flex-direction: column; height: 100%; min-height: 0; }

/* ── Title bar (matches page-title-bar: 72px, neutral-subtle) ── */
.dui-titlebar {
  height: var(--mp-sizes-18, 72px);
  background: var(--mp-background-neutral-subtle);
  display: flex; align-items: center; justify-content: space-between;
  padding: 0 var(--mp-spacing-6); flex-shrink: 0;
}
.dui-titlebar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
/* Breadcrumb is an MpButton textLink; only strip its padding so it sits tight above the title. */
.dui-breadcrumb {
  align-self: flex-start; padding: 0;
  font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px);
}
.dui-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* ── Stage ── */
.dui-stage {
  flex: 1; min-height: 0; overflow-y: auto;
  background: var(--mp-background-stage, #fff);
  border-top-left-radius: var(--mp-radii-lg, 12px);
  padding: var(--mp-spacing-6);
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
}

/* ── Filter bar ── */
.dui-filter-bar { display: flex; gap: var(--mp-spacing-3); align-items: center; justify-content: space-between; flex-wrap: wrap; }
.dui-filter-left { display: flex; gap: var(--mp-spacing-3); align-items: center; flex-wrap: wrap; }
.dui-filter-right { display: flex; gap: var(--mp-spacing-3); align-items: center; margin-left: auto; }
/* Expand/collapse all — a text link, so it never competes with a real action. */
.dui-toggle-all { padding: 0; }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  height: var(--mp-sizes-9, 36px); padding: 0 var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #fff); color: var(--mp-text-secondary); min-width: 260px;
}
.filter-search-input {
  flex: 1; min-width: 0; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); line-height: var(--mp-line-heights-md, 20px);
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear { color: var(--mp-icon-default); cursor: pointer; flex: none; }
.search-clear:hover { color: var(--mp-text-default); }

/* Report period line — sits directly above the table, like the template's subtitle. */
.dui-range-caption {
  margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-md);
}

/* ── Table ── */
.dui-table-section { display: flex; flex-direction: column; }
.dui-table-wrap { overflow-x: auto; }
.dui-table { width: 100%; border-collapse: collapse; white-space: nowrap; }
.dui-th {
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-secondary); text-align: left; white-space: nowrap;
  vertical-align: bottom;
}
/* Unit group header spanning its Mutation + Stock pair. */
.dui-th--group {
  text-align: center; vertical-align: middle;
  border-left: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
}
.dui-th--right { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-3) var(--mp-spacing-1) var(--mp-spacing-4); }

.dui-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-4) var(--mp-spacing-2\.5, 10px) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: top; white-space: nowrap;
}
.dui-td--right { text-align: right; padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-3) var(--mp-spacing-2\.5, 10px) var(--mp-spacing-4); font-variant-numeric: tabular-nums; }

/* Product line — the merged SKU cell + bold name, chevron toggles the block. */
.dui-group-row { cursor: pointer; }
.dui-group-row:hover > .dui-td { background: var(--mp-background-neutral-subtle); }
.dui-td--sku { vertical-align: top; border-right: 1px solid var(--mp-border-default); }
.dui-sku-cell { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.dui-td--product { font-weight: var(--mp-font-weights-semi-bold); }
/* Row expander — a ghost MpButton shrunk to the chevron itself, so it sits inside the
   cell's text line. The icon direction (right / down) carries the open state. */
.dui-expand-btn {
  flex-shrink: 0;
  width: var(--mp-sizes-6, 24px); height: var(--mp-sizes-6, 24px);
  min-width: var(--mp-sizes-6, 24px); padding: 0;
  color: var(--mp-icon-default, var(--mp-text-secondary));
}

/* Batch line — a second-level group row: identity + unit conversion + expiry/tolerance
   on the left, the batch's own ending stock on the right. Sits on the frame tone so the
   weight ladder reads product (boldest) → batch → mutation rows. */
.dui-td--batch { border-right: 1px solid var(--mp-border-default); }
.dui-batch-row { cursor: pointer; }
.dui-batch-row > .dui-td { background: var(--mp-background-neutral-subtle); }
.dui-batch-row:hover > .dui-td { background: var(--mp-background-neutral-hovered); }
.dui-batch-cell { display: inline-flex; align-items: flex-start; gap: var(--mp-spacing-1); }
.dui-batch-text { display: inline-flex; flex-direction: column; min-width: 0; }
.dui-batch-no { display: block; font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.dui-batch-meta {
  display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px);
}

/* Closing line — the product's ending stock and valuation. */
.dui-closing-row > .dui-td { border-top: 1px solid var(--mp-border-bold, var(--mp-border-default)); }
.dui-td--closing { font-weight: var(--mp-font-weights-semi-bold); }

/* ── Empty state ── */
.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
