<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  toast, MpBadge,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ClampText from '~/components/patterns/ClampText.vue'
import { warehouses } from '~/data/warehouses'
import { productBySku } from '~/data/inventory'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { getWarehouseConfig } from '~/data/warehouseConfig'
import { TODAY } from '~/data/master'
import { MIN_STOCK_LIMIT, hashStr, recommendationReasons, type Reason } from '~/data/cycleCountRecommendations'
import { formatDate } from '~/utils/date'

const router = useRouter()

// ─── First-load skeleton (matches Count task / Awaiting approval tabs) ────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

// ── Warehouses in scope — all active, non-default (no warehouse filter anymore) ──
const wmsWarehouses = computed(() => warehouses.filter(w => w.status === 'active' && !w.isDefault))
const anyRecEnabled = computed(() => wmsWarehouses.value.some(w => getWarehouseConfig(w.id).cycleCountRec))

// ── Columns ─────────────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'product',       label: 'Product',         width: '260px', sortable: true, sortType: 'text'   },
  { key: 'sku',           label: 'SKU',             width: '140px', sortable: true, sortType: 'text'   },
  { key: 'onHand',        label: 'On hand qty',     width: '180px', sortable: true, sortType: 'number', align: 'right' },
  { key: 'lastCountDate', label: 'Last count date', width: '160px', sortable: true, sortType: 'date'   },
  { key: 'reasons',       label: 'Triggered by',    width: '240px' },
]

// ── Recommendation logic ─────────────────────────────────────────────────────
// Formula per "[WMS PRD 2] Cycle Count Recommendation — Basic (MVP)":
//   CountPriorityScore = W_neg × NegativeStockFlag + W_min × MinStockProximity + W_var × VarianceSignal
//   Weights derive from the active-signal count + order (cycleCountRuleOrder):
//   3 active → 0.5/0.3/0.2, 2 active → 0.6/0.4, 1 active → 1.0
// (reason logic shared with the "Cycle counts" tab badge count — see ~/data/cycleCountRecommendations)
// Each warehouse has its own Cycle counts settings (Configure warehouse, WMS
// Standalone): a warehouse with the master toggle OFF contributes no rows at all;
// its own active rules + their order decide which of its SKUs qualify and how they rank.

interface Recommendation {
  warehouseId: string
  product: string  // used for sorting (name)
  sku: string
  name: string
  photo: string | undefined
  desc: string | undefined

  onHand: number
  unit: string
  minStock: number
  lastCountDate: string | null
  /** What triggered this recommendation — one or more active-rule signals. */
  reasons: Reason[]
  score: number // internal priority ranking only — not shown as a column
}

const WEIGHT_TABLE: Record<number, number[]> = { 3: [0.5, 0.3, 0.2], 2: [0.6, 0.4], 1: [1] }
const RULE_KEY = { neg: 'cycleCountRuleNeg', min: 'cycleCountRuleMin', var: 'cycleCountRuleVar' } as const

// Deterministic mock "last counted" date per SKU/warehouse — ~15% never counted,
// otherwise 1–90 days ago (same hashing technique as the variance signal above).
function lastCountDateFor(warehouseId: string, sku: string): string | null {
  const h = hashStr(sku + warehouseId + 'lastcount')
  if (h % 100 < 15) return null
  const daysAgo = 1 + (h % 90)
  const d = new Date(TODAY)
  d.setDate(d.getDate() - daysAgo)
  return d.toISOString().slice(0, 10)
}

const baseRows = computed<Recommendation[]>(() => {
  const results: Recommendation[] = []

  for (const wh of wmsWarehouses.value) {
    const cfg = getWarehouseConfig(wh.id)
    if (!cfg.cycleCountRec) continue
    const detail = getWarehouseDetail(wh.id)
    if (!detail) continue

    // Active signals in this warehouse's own priority order → positional weights.
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
        product: stock.name ?? p?.name ?? stock.sku,
        sku: stock.sku,
        name: stock.name ?? p?.name ?? stock.sku,
        photo: p?.img,
        desc: p?.desc,

        onHand: stock.onHand,
        unit: stock.unit,
        minStock: stock.minStock,
        lastCountDate: lastCountDateFor(wh.id, stock.sku),
        reasons,
        score,
      })
    }
  }
  return results
})

// ── Table state ──────────────────────────────────────────────────────────────
const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<Recommendation>(baseRows, {
  filterFn: (row, s) => {
    if (s
      && !row.sku.toLowerCase().includes(s)
      && !row.name.toLowerCase().includes(s)
    ) return false
    return true
  },
})

sortKey.value = 'score'
sortDir.value = 'desc'

const hasActiveFilter = computed(() => !!search.value)
function clearFilters() { search.value = '' }

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
  router.push({ path: '/cycle-counts/new', query: { preselect: skus.join(','), warehouse: rows[0]!.warehouseId } })
}

// ── Row actions ───────────────────────────────────────────────────────────────
function viewProduct(sku: string) { router.push(`/product-list/${sku}`) }
function createCountTaskForRow(row: Recommendation) {
  router.push({ path: '/cycle-counts/new', query: { preselect: row.sku, warehouse: row.warehouseId } })
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
    <!-- ── Filter bar (search only) ── -->
    <template #filters>
      <div class="filter-right">
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" placeholder="Search product or SKU" />
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

    <!-- ── Row actions: View details / Create count task, grouped in a kebab menu ── -->
    <template #actions="{ row }">
      <MpPopover :id="`ccr-actions-${(row as any).warehouseId}-${(row as any).sku}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" aria-label="More actions">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewProduct((row as any).sku)">View details</MpPopoverListItem>
            <MpPopoverListItem @click="createCountTaskForRow(row as unknown as Recommendation)">Create count task</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Product cell: photo + name + desc, hover "view details" chip ── -->
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
          <a class="cell-link ccr-product-name" @click.stop="viewProduct((row as any).sku)">{{ (row as any).name }}</a>
          <ClampText v-if="(row as any).desc" class="ccr-product-sub" :text="(row as any).desc" />
        </span>
      </div>
    </template>

    <!-- ── On hand qty — value + minimum stock description ── -->
    <template #cell-onHand="{ row }">
      <div class="ccr-onhand">
        <span class="ccr-onhand-value">{{ (row as any).onHand.toLocaleString('id-ID') }} {{ (row as any).unit }}</span>
        <span class="ccr-onhand-min">Min. {{ (row as any).minStock.toLocaleString('id-ID') }} {{ (row as any).unit }}</span>
      </div>
    </template>

    <!-- ── Last count date ── -->
    <template #cell-lastCountDate="{ value }">
      {{ formatDate(value as string | null) }}
    </template>

    <!-- ── Triggered by — one badge per active-rule signal that flagged this SKU ── -->
    <template #cell-reasons="{ value }">
      <div class="ccr-reasons">
        <MpBadge
          v-for="reason in (value as Reason[])"
          :key="reason"
          for="tableStatus"
          type="announcement"
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
            ? 'Turn on cycle count recommendations in Configure warehouse to see which SKUs need counting.'
            : 'All SKUs are within their target stock levels.' }}
        </p>
      </div>
    </template>
  </ErpTablePage>
</template>

<style scoped>
/* ── Filter bar (mirrored from StockAdjustmentsPage — these classes are scoped there) ── */
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-left: auto; }
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

/* ── Row actions (kebab: View details / Create count task) ── */
.row-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); margin-left: auto;
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
.row-kebab svg { display: block; width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

/* ── Product cell ── */
.ccr-product { position: relative; display: flex; align-items: flex-start; gap: var(--mp-spacing-3); min-width: 0; padding-right: var(--mp-spacing-2); }
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

:deep(.erp-tr:hover .erp-td) { background: var(--mp-background-neutral); }

/* ── Triggered by (reason badges) ── */
.ccr-reasons { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }

/* ── On hand qty cell ── */
.ccr-onhand { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.ccr-onhand-value { color: var(--mp-text-default); }
.ccr-onhand-min { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }

/* ── Empty state ── */
.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); max-width: 360px; text-align: center; }
</style>
