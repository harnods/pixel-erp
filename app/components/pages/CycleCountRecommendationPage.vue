<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import {
  MpBadge, MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpCheckbox, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ClampText from '~/components/patterns/ClampText.vue'
import { warehouses } from '~/data/warehouses'
import { productBySku } from '~/data/inventory'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { getWarehouseConfig } from '~/data/warehouseConfig'
import { MIN_STOCK_LIMIT, hashStr, recommendationReasons, type Reason } from '~/data/cycleCountRecommendations'

const router = useRouter()

// ─── First-load skeleton (matches Count task / Awaiting approval tabs) ────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

// ── Warehouse filter (non-default, active) — multi-select; empty = all warehouses ──
const wmsWarehouses = computed(() => warehouses.filter(w => w.status === 'active' && !w.isDefault))
const warehouseOptions = computed(() => wmsWarehouses.value.map(w => ({ value: w.id, label: w.name })))
const warehouseFilter = ref<string[]>([])
const warehouseLabel = computed(() => {
  const n = warehouseFilter.value.length
  if (n === 0) return ''
  if (n === 1) return warehouseOptions.value.find(o => o.value === warehouseFilter.value[0])?.label ?? ''
  return `${n} warehouses`
})
function toggleWarehouse(id: string) {
  const idx = warehouseFilter.value.indexOf(id)
  if (idx >= 0) warehouseFilter.value = warehouseFilter.value.filter(v => v !== id)
  else warehouseFilter.value = [...warehouseFilter.value, id]
}
const selectedWarehouses = computed(() =>
  warehouseFilter.value.length ? wmsWarehouses.value.filter(w => warehouseFilter.value.includes(w.id)) : wmsWarehouses.value,
)
const anyRecEnabled = computed(() => selectedWarehouses.value.some(w => getWarehouseConfig(w.id).cycleCountRec))

// ── Columns ─────────────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'product',       label: 'Product',       width: '260px', sortable: true, sortType: 'text'   },
  { key: 'sku',           label: 'SKU',           width: '150px', sortable: true, sortType: 'text'   },
  { key: 'warehouseName', label: 'Warehouse',     width: '200px', sortable: true, sortType: 'text'   },
  { key: 'onHand',        label: 'On hand qty',   width: '120px', sortable: true, sortType: 'number', align: 'right' },
  { key: 'unit',          label: 'Unit',          width: '72px'  },
  { key: 'score',         label: 'Score',         width: '160px', sortable: true, sortType: 'number', align: 'right' },
  { key: 'reasons',       label: 'Reason',        width: '240px' },
]

// ── Recommendation logic ─────────────────────────────────────────────────────
// Formula per "[WMS PRD 2] Cycle Count Recommendation — Basic (MVP)":
//   CountPriorityScore = W_neg × NegativeStockFlag + W_min × MinStockProximity + W_var × VarianceSignal
//   Weights derive from the active-signal count + order (cycleCountRuleOrder):
//   3 active → 0.5/0.3/0.2, 2 active → 0.6/0.4, 1 active → 1.0
// (reason logic shared with the "Cycle counts" tab badge count — see ~/data/cycleCountRecommendations)

interface Recommendation {
  warehouseId: string
  warehouseName: string
  product: string  // used for sorting (name)
  sku: string
  name: string
  photo: string | undefined
  desc: string | undefined

  locations: string[] // raw array for cell rendering
  onHand: number
  unit: string
  reasons: Reason[]
  score: number
}

const WEIGHT_TABLE: Record<number, number[]> = { 3: [0.5, 0.3, 0.2], 2: [0.6, 0.4], 1: [1] }
const RULE_KEY = { neg: 'cycleCountRuleNeg', min: 'cycleCountRuleMin', var: 'cycleCountRuleVar' } as const

const baseRows = computed<Recommendation[]>(() => {
  const results: Recommendation[] = []
  for (const wh of selectedWarehouses.value) {
    const cfg = getWarehouseConfig(wh.id)
    if (!cfg.cycleCountRec) continue
    const detail = getWarehouseDetail(wh.id)
    if (!detail) continue

    // Active signals in the user-configured priority order → positional weights.
    const activeOrder = cfg.cycleCountRuleOrder.filter(r => cfg[RULE_KEY[r]])
    const weights = WEIGHT_TABLE[activeOrder.length] ?? []
    const weightFor = (rule: 'neg' | 'min' | 'var') => {
      const i = activeOrder.indexOf(rule)
      return i === -1 ? 0 : (weights[i] ?? 0)
    }

    for (const stock of detail.stock) {
      // Continuous, deterministic normalized variance (0–1) — same source used both to
      // trigger the "Variance signal" reason and to score, so mock stays coherent.
      const varianceNorm = (hashStr(stock.sku + wh.id + 'variance') % 101) / 100

      const reasons = recommendationReasons(cfg, wh.id, stock)
      if (!reasons.length) continue

      const negativeStockFlag = reasons.includes('Negative stock') ? 1 : 0
      const minStockProximity = reasons.includes('Min. stock')
        ? Math.max(0, (MIN_STOCK_LIMIT - stock.onHand) / MIN_STOCK_LIMIT)
        : 0
      const score = Math.round(
        (weightFor('neg') * negativeStockFlag + weightFor('min') * minStockProximity + weightFor('var') * varianceNorm) * 1000,
      ) / 1000

      const p = productBySku(stock.sku)
      results.push({
        warehouseId: wh.id,
        warehouseName: wh.name,
        product: stock.name ?? p?.name ?? stock.sku,
        sku: stock.sku,
        name: stock.name ?? p?.name ?? stock.sku,
        photo: p?.img,
        desc: p?.desc,

        locations: stock.locations ?? [],
        onHand: stock.onHand,
        unit: stock.unit,
        reasons,
        score,
      })
    }
  }
  return results
})

// ── Filter: reason ───────────────────────────────────────────────────────────
const reasonFilter = ref<Reason | ''>('')

// ── Table state ──────────────────────────────────────────────────────────────
const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<Recommendation>(baseRows, {
  filterFn: (row, s) => {
    if (s
      && !row.sku.toLowerCase().includes(s)
      && !row.name.toLowerCase().includes(s)
      && !row.warehouseName.toLowerCase().includes(s)
    ) return false
    if (reasonFilter.value && !row.reasons.includes(reasonFilter.value as Reason)) return false
    return true
  },
})

sortKey.value = 'score'
sortDir.value = 'desc'

const hasActiveFilter = computed(() => !!search.value || !!reasonFilter.value)
function clearFilters() { search.value = ''; reasonFilter.value = '' }
watch([warehouseFilter, reasonFilter], () => setPage(1))

// ── Bulk: create cycle count ──────────────────────────────────────────────────
function createCycleCount(sel: Set<number>, deselectAll: () => void) {
  const rows = [...sel].map(i => paginated.value[i]).filter(Boolean) as Recommendation[]
  if (!rows.length) return
  // A cycle count task is scoped to one warehouse — guard mixed selections instead
  // of silently picking one (buttons stay clickable; show an error toast per convention).
  const warehouseIds = new Set(rows.map(r => r.warehouseId))
  if (warehouseIds.size > 1) {
    toast.notify({ variant: 'error', title: 'Select SKUs from a single warehouse to create a cycle count', maxWidth: 'max-content' })
    return
  }
  const skus = rows.map(r => r.sku)
  deselectAll()
  router.push({ path: '/stock-adjustments/new', query: { type: 'count', preselect: skus.join(','), warehouse: rows[0]!.warehouseId } })
}

function viewWarehouse(id: string) { router.push(`/warehouses/${id}`) }

// ── Badge type ────────────────────────────────────────────────────────────────
function reasonBadgeType(reason: string): string {
  if (reason === 'Negative stock') return 'critical'
  if (reason === 'Min. stock') return 'warning'
  return 'information'
}
</script>

<template>
  <ErpTablePage
    :columns="columns"
    :rows="(paginated as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :loading="loading"
    :has-active-filter="hasActiveFilter"
    :has-checkbox="anyRecEnabled"
    bulk-label="SKU"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @clear-filters="clearFilters"
  >
    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <!-- Warehouse — multi-select (checkbox list, mirrors OutgoingIndexPage's Status filter); empty = all warehouses -->
        <MpPopover id="ccr-warehouse-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect
              id="ccr-warehouse-select" placeholder="Warehouse"
              :model-value="warehouseFilter.length ? '__selected__' : undefined" is-clearable
              :class="css({ width: '220px' })" @mousedown.prevent @clear="warehouseFilter = []"
            >
              <option v-if="warehouseFilter.length" value="__selected__">{{ warehouseLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content', maxWidth: '320px' })">
            <div class="checkbox-filter-list">
              <label v-for="opt in warehouseOptions" :key="opt.value" class="checkbox-filter-item">
                <MpCheckbox
                  :id="`ccr-wh-${opt.value}`"
                  :is-checked="warehouseFilter.includes(opt.value)"
                  @change="toggleWarehouse(opt.value)"
                  @click.stop
                />
                <span>{{ opt.label }}</span>
              </label>
            </div>
          </MpPopoverContent>
        </MpPopover>

        <!-- Reason filter -->
        <MpPopover id="ccr-reason-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="ccr-reason-select" placeholder="Reason" :model-value="reasonFilter" is-clearable
              :class="css({ width: '170px' })" @mousedown.prevent @clear="reasonFilter = ''"
            >
              <option v-if="reasonFilter" :value="reasonFilter">{{ reasonFilter }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '170px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="r in ALL_REASONS" :key="r"
                :is-active="r === reasonFilter"
                @click="reasonFilter = r"
              >{{ r }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>

      <div class="filter-right">
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" placeholder="Search..." />
          <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </template>

    <!-- ── Bulk action ── -->
    <template #bulk-actions="{ deselectAll, selectedRows }">
      <button
        class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
        @click="createCycleCount(selectedRows as Set<number>, deselectAll)"
      >
        Create cycle count
      </button>
    </template>

    <!-- ── Product cell: photo + name + desc ── -->
    <template #cell-product="{ row }">
      <div class="ccr-product">
        <img
          v-if="(row as any).photo"
          class="ccr-thumb"
          :src="(row as any).photo"
          :alt="(row as any).name"
          loading="lazy"
        />
        <span v-else class="ccr-thumb ccr-thumb--empty" />
        <span class="ccr-product-text">
          <span class="ccr-product-name">{{ (row as any).name }}</span>
          <ClampText v-if="(row as any).desc" class="ccr-product-sub" :text="(row as any).desc" />
        </span>
      </div>
    </template>

    <!-- ── Warehouse — View details chip → warehouse detail (mirrors StockAdjustmentsPage) ── -->
    <template #cell-warehouseName="{ value, row }">
      <div class="cell-with-action">
        <span class="cell-text">{{ value }}</span>
        <button class="row-hover-btn" @click.stop="viewWarehouse((row as any).warehouseId)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="row-hover-btn__label">VIEW DETAILS</span>
        </button>
      </div>
    </template>

    <!-- ── Score ── -->
    <template #cell-score="{ value }">
      {{ (value as number).toFixed(2) }}
    </template>

    <!-- ── On hand qty ── -->
    <template #cell-onHand="{ value }">
      {{ (value as number).toLocaleString('id-ID') }}
    </template>

    <!-- ── Reason badges ── -->
    <template #cell-reasons="{ value }">
      <div class="ccr-reasons">
        <MpBadge
          v-for="reason in (value as string[])"
          :key="reason"
          for="tableStatus"
          :type="reasonBadgeType(reason)"
        >{{ reason }}</MpBadge>
      </div>
    </template>

    <!-- ── Empty state ── -->
    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">
          {{ !anyRecEnabled ? 'Recommendations not set up' : 'No recommendations' }}
        </p>
        <p class="empty-full-desc">
          {{ !anyRecEnabled
            ? 'Turn on cycle count recommendations in Warehouse settings to see which SKUs need counting.'
            : 'All SKUs are within their target stock levels.' }}
        </p>
      </div>
    </template>
  </ErpTablePage>
</template>

<style scoped>
/* ── Filter bar (mirrored from StockAdjustmentsPage — these classes are scoped there) ── */
.filter-left  { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 200px;
}
.filter-search-input {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

/* ── Checkbox multi-select filter list (mirrors OutgoingIndexPage's status-filter-list) ── */
.checkbox-filter-list { display: flex; flex-direction: column; padding: var(--mp-spacing-1); }
.checkbox-filter-item {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) 10px; border-radius: var(--mp-radii-md);
  cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.checkbox-filter-item:hover { background: var(--mp-background-neutral-subtle); }

/* ── Product cell ── */
.ccr-product { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); min-width: 0; }
.ccr-thumb {
  flex-shrink: 0;
  width: var(--mp-sizes-8, 32px);
  height: var(--mp-sizes-8, 32px);
  border-radius: var(--mp-radii-sm);
  object-fit: cover;
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
}
.ccr-thumb--empty { display: inline-block; }
.ccr-product-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.ccr-product-name { color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ccr-product-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); margin-top: 2px; }

/* ── Reason badges ── */
.ccr-reasons { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }

/* ── Warehouse cell hover chip (mirrored from StockAdjustmentsPage) ── */
.cell-with-action { position: relative; display: flex; align-items: center; width: 100%; min-width: 0; }
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.row-hover-btn {
  position: absolute; right: 0; top: var(--mp-spacing-2\.5, 10px); transform: translateY(-50%); display: none;
  align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1;
}
.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase;
}
:global(.erp-tr:hover .row-hover-btn) { display: flex; }
:deep(.erp-tr:hover .erp-td) { background: var(--mp-background-neutral); }

/* ── Empty state ── */
.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); max-width: 360px; text-align: center; }
</style>
