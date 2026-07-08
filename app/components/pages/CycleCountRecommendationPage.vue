<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  MpBadge, MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ClampText from '~/components/patterns/ClampText.vue'
import { warehouses } from '~/data/warehouses'
import { productBySku } from '~/data/inventory'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { getWarehouseConfig } from '~/data/warehouseConfig'

const router = useRouter()

// ── Warehouse options (non-default, active) ────────────────────────────────
const wmsWarehouses = computed(() => warehouses.filter(w => w.status === 'active' && !w.isDefault))
const warehouseOptions = computed(() => wmsWarehouses.value.map(w => ({ value: w.id, label: w.name })))
const warehouseFilter = ref(wmsWarehouses.value[0]?.id ?? '')
const warehouseLabel = computed(() => warehouseOptions.value.find(o => o.value === warehouseFilter.value)?.label ?? '')

const config = computed(() => warehouseFilter.value ? getWarehouseConfig(warehouseFilter.value) : null)
const warehouseDetail = computed(() => warehouseFilter.value ? getWarehouseDetail(warehouseFilter.value) : null)

// ── Columns ─────────────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'product',   label: 'Product',         width: '260px', sortable: true, sortType: 'text'   },
  { key: 'sku',       label: 'SKU',             width: '150px', sortable: true, sortType: 'text'   },
  { key: 'locations', label: 'Storage location',width: '180px' },
  { key: 'onHand',    label: 'On hand qty',     width: '120px', sortable: true, sortType: 'number', align: 'right' },
  { key: 'unit',      label: 'Unit',            width: '72px'  },
  { key: 'reasons',   label: 'Reason',          width: '240px' },
]

// ── Recommendation logic ─────────────────────────────────────────────────────
function hashStr(s: string): number {
  let h = 0
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return h
}

const ALL_REASONS = ['Negative stock', 'Min. stock', 'Variance signal'] as const
type Reason = typeof ALL_REASONS[number]

interface Recommendation {
  product: string  // used for sorting (name)
  sku: string
  name: string
  photo: string | undefined
  desc: string | undefined

  locations: string[] // raw array for cell rendering
  onHand: number
  unit: string
  reasons: Reason[]
}

const baseRows = computed<Recommendation[]>(() => {
  if (!config.value?.cycleCountRec || !warehouseDetail.value) return []
  const results: Recommendation[] = []
  for (const stock of warehouseDetail.value.stock) {
    const reasons: Reason[] = []
    if (config.value.cycleCountRuleNeg && stock.onHand === 0) reasons.push('Negative stock')
    if (config.value.cycleCountRuleMin && stock.onHand > 0 && stock.onHand < 10) reasons.push('Min. stock')
    if (config.value.cycleCountRuleVar && hashStr(stock.sku + warehouseFilter.value) % 5 === 0) reasons.push('Variance signal')
    if (!reasons.length) continue

    const p = productBySku(stock.sku)
    results.push({
      product: stock.name ?? p?.name ?? stock.sku,
      sku: stock.sku,
      name: stock.name ?? p?.name ?? stock.sku,
      photo: p?.img,
      desc: p?.desc,

      locations: stock.locations ?? [],
      onHand: stock.onHand,
      unit: stock.unit,
      reasons,
    })
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
    if (s && !row.sku.toLowerCase().includes(s) && !row.name.toLowerCase().includes(s)) return false
    if (reasonFilter.value && !row.reasons.includes(reasonFilter.value as Reason)) return false
    return true
  },
})

const hasActiveFilter = computed(() => !!search.value || !!reasonFilter.value)
function clearFilters() { search.value = ''; reasonFilter.value = '' }
watch([warehouseFilter, reasonFilter], () => setPage(1))

// ── Bulk: create cycle count ──────────────────────────────────────────────────
function createCycleCount(sel: Set<number>, deselectAll: () => void) {
  const skus = [...sel].map(i => paginated.value[i]?.sku).filter(Boolean) as string[]
  if (!skus.length) return
  deselectAll()
  router.push({ path: '/stock-adjustments/new', query: { type: 'count', preselect: skus.join(','), warehouse: warehouseFilter.value } })
}

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
    :has-active-filter="hasActiveFilter"
    :has-checkbox="!!config?.cycleCountRec"
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
        <!-- Warehouse — required selector, drives recommendations -->
        <MpPopover id="ccr-warehouse-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="ccr-warehouse-select" :model-value="warehouseFilter"
              :class="css({ width: '220px' })" @mousedown.prevent
            >
              <option :value="warehouseFilter">{{ warehouseLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in warehouseOptions" :key="opt.value"
                :is-active="opt.value === warehouseFilter"
                @click="warehouseFilter = opt.value"
              >{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
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

    <!-- ── Storage location — word-wrap, first loc + overflow count ── -->
    <template #cell-locations="{ value }">
      <span v-if="!(value as string[]).length" class="ccr-loc-empty">—</span>
      <template v-else>
        <span class="ccr-loc">{{ (value as string[])[0] }}</span>
        <span v-if="(value as string[]).length > 1" class="ccr-loc-more">+{{ (value as string[]).length - 1 }}</span>
      </template>
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
          {{ !config?.cycleCountRec ? 'Cycle count recommendation is not enabled' : 'No recommendations' }}
        </p>
        <p class="empty-full-desc">
          {{ !config?.cycleCountRec
            ? 'Enable Cycle count recommendation for this warehouse in Warehouse settings to see SKU suggestions here.'
            : 'All SKUs in this warehouse are within acceptable levels based on the configured rules.' }}
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

/* ── Storage location cell ── */
.ccr-loc { display: block; white-space: normal; overflow-wrap: anywhere; word-break: break-word; }
.ccr-loc-empty { color: var(--mp-text-secondary); }
.ccr-loc-more { display: inline-block; margin-top: 2px; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Reason badges ── */
.ccr-reasons { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }

/* No row hover — rows are not clickable (no view details) */
:deep(.erp-tr:hover .erp-td) { background: var(--mp-background-neutral); }
</style>
