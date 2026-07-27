<script setup lang="ts">
/**
 * Products index — the Inventory module's product list (Figma: "Products / Index").
 * Reachable from ERP's Inventory > Products, and aliased as the WMS Standalone
 * top-level "Inventory" page. Tabs ("All products" / "Awaiting approval") are
 * driven by the shared ?tab= mechanism in [...slug].vue, same as Stock adjustments.
 */
import {
  MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpSelect, MpCheckbox, MpTooltip, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import { formatDateTimeLong } from '~/utils/date'
import { TODAY_ISO } from '~/data/master'
import {
  productIndexRows, PRODUCT_TYPE_LABEL, type ProductIndexRow, type ProductType,
} from '~/data/productsIndex'
import { warehouses } from '~/data/warehouses'

const toggleAirene = inject<() => void>('toggleAirene')
const route = useRoute()
const router = useRouter()
function viewDetails(sku: string) { router.push(`/product-list/${sku}`) }

// "Awaiting approval" tab — driven by the URL, same pattern as Stock adjustments.
const isAwaiting = computed(() => route.query.tab === 'Awaiting approval')

// WMS scenarios don't deal in pricing/costing — those columns/stats are ERP-only.
const { activeScenario } = useScenario()
const isWms = computed(() => activeScenario.value.startsWith('WMS'))

// ─── Column definitions — match Figma Products table exactly ──────────────────
//
//  Figma structure (left → right):
//  [checkbox] NAME 344px | SKU 160px | BARCODE 160px | CATEGORY 160px |
//  ON HAND QTY 130px ← right | RESERVED QTY 130px ← right | AVAILABLE QTY 130px ← right |
//  IN TRANSIT QTY 130px ← right | MIN. STOCK 104px ← right | UNIT 96px |
//  DEFAULT SALES PRICE 184px ← right | AVERAGE COST 184px ← right |
//  LAST PURCHASE COST 184px ← right | DEFAULT PURCHASE COST 184px ← right |
//  [actions 44px sticky]
const columns: TableColumn[] = [
  { key: 'name',                label: 'Name',                   width: '344px', sortable: true, sortType: 'text'   },
  { key: 'sku',                 label: 'SKU',                    width: '160px', sortable: true, sortType: 'text'   },
  { key: 'barcode',             label: 'Barcode',                width: '160px',                 sortType: 'text'   },
  { key: 'category',            label: 'Category',               width: '160px',                 sortType: 'text'   },
  { key: 'onHand',              label: 'On hand qty',            width: '130px', align: 'right', sortable: true, sortType: 'number' },
  { key: 'reserved',            label: 'Reserved qty',           width: '130px', align: 'right',                 sortType: 'number' },
  { key: 'available',           label: 'Available qty',          width: '130px', align: 'right', sortable: true, sortType: 'number' },
  { key: 'onTheWay',            label: 'In transit qty',         width: '130px', align: 'right',                 sortType: 'number' },
  { key: 'minStock',            label: 'Min. stock',             width: '104px', align: 'right',                 sortType: 'number' },
  { key: 'unit',                label: 'Unit',                   width: '96px',                  sortType: 'text'   },
  // Pricing/costing columns — ERP only, WMS doesn't deal in pricing.
  ...(isWms.value ? [] : [
    { key: 'defaultSalesPrice',   label: 'Default sales price',    width: '184px', align: 'right' as const, sortable: true, sortType: 'number' as const },
    { key: 'averageCost',         label: 'Average cost',           width: '184px', align: 'right' as const,                 sortType: 'number' as const },
    { key: 'lastPurchaseCost',    label: 'Last purchase cost',     width: '184px', align: 'right' as const,                 sortType: 'number' as const },
    { key: 'defaultPurchaseCost', label: 'Default purchase cost',  width: '184px', align: 'right' as const,                 sortType: 'number' as const },
  ]),
]

// Column show/hide (Name always on; Last updated appended, hidden by default)
const allCols: TableColumn[] = [...columns, { key: 'lastUpdated', label: 'Last updated', width: '200px' }]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allCols.map(c => [c.key, c.key !== 'lastUpdated'])))
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => allCols.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// ─── Warehouse filter (independent multi-select — rescopes the qty columns to
// just the selected warehouse(s), same as StockAdjustmentsPage.vue's pattern) ──
const warehouseFilter = ref<string[]>([])
const warehouseOptions = computed(() =>
  warehouses.filter(w => !w.isDefault && w.status !== 'archived').map(w => ({ label: w.name, value: w.id })),
)
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

// ─── Stock status filter — driven by the stat cards' "View product" links
// (Low stock / Out of stock), not a dropdown, so it's plain state applied at
// the `rows` level like `isAwaiting`, same as the other pre-filters here. ────
const stockStatusFilter = ref<'low' | 'out' | null>(null)
function viewLowStock() { stockStatusFilter.value = 'low' }
function viewOutOfStock() { stockStatusFilter.value = 'out' }

// ─── Rows ───────────────────────────────────────────────────────────────────
const allRows = computed<ProductIndexRow[]>(() => productIndexRows(warehouseFilter.value))
const rows = computed<ProductIndexRow[]>(() => {
  let list = allRows.value
  if (isAwaiting.value) list = list.filter(r => r.pendingApproval)
  if (stockStatusFilter.value === 'low') list = list.filter(r => r.available > 0 && r.available <= r.minStock)
  else if (stockStatusFilter.value === 'out') list = list.filter(r => r.available <= 0)
  return list
})

// ─── Table state — `statusFilter` doubles as the "Product type" filter ──
const {
  search, statusFilter: productTypeFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<ProductIndexRow>(rows, {
  perPage: 25,
  filterFn: (row, s, productType) =>
    (row.name.toLowerCase().includes(s) || row.sku.toLowerCase().includes(s) || row.barcode.includes(s)) &&
    (!productType || row.productType === productType),
})

// Default sort: alphabetical by name (named-entity table convention).
sortKey.value = 'name'

// ─── Filter options — always all 4 types, even ones with no matching products
// yet (filtering to one just shows the "No results found" empty state) ────────
const productTypeOptions = (Object.keys(PRODUCT_TYPE_LABEL) as ProductType[])
  .map(t => ({ label: PRODUCT_TYPE_LABEL[t], value: t }))
const productTypeLabel = computed(
  () => PRODUCT_TYPE_LABEL[productTypeFilter.value as ProductType] ?? '',
)

// ─── Formatters ───────────────────────────────────────────────────────────────
function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', minimumFractionDigits: 2,
  }).format(amount)
}
const asOfLabel = formatDateTimeLong(`${TODAY_ISO}T08:00:00`)

// ─── Stats ────────────────────────────────────────────────────────────────────
const totalInventoryValue = computed(() =>
  allRows.value.reduce((sum, r) => sum + r.onHand * r.averageCost, 0),
)
const lowStockRows = computed(() => allRows.value.filter(r => r.available > 0 && r.available <= r.minStock))
const outOfStockRows = computed(() => allRows.value.filter(r => r.available <= 0))
const inStockCount = computed(() => allRows.value.length - outOfStockRows.value.length)
const inStockRate = computed(() =>
  allRows.value.length ? Math.round((inStockCount.value / allRows.value.length) * 100) : 0,
)

// ─── First-load skeleton ──────────────────────────────────────────────────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

// ─── Empty state — illustrated (matches every other index page) ──────────────
const emptyIllustration = '/illustrations/empty-folder.png'
const emptyTitle = computed(() => isAwaiting.value ? 'No products awaiting approval' : 'No products')
const emptyDesc = computed(() =>
  isAwaiting.value ? 'Products pending approval will appear here.' : 'Products will appear here.',
)

function clearFilters() {
  search.value = ''
  productTypeFilter.value = ''
  warehouseFilter.value = []
  stockStatusFilter.value = null
}

// ─── "All filters" active count — productType + warehouse(s) + stock status;
// the search box has its own separate input, not counted here. ────────────────
const activeFilterCount = computed(() =>
  (productTypeFilter.value ? 1 : 0) + (warehouseFilter.value.length > 0 ? 1 : 0) + (stockStatusFilter.value ? 1 : 0),
)
</script>

<template>
  <ErpTablePage
    :columns="visibleColumns"
    :rows="(paginated as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :loading="loading"
    :has-active-filter="!!search || activeFilterCount > 0"
    :search="search"
    has-checkbox
    :context-label="(row) => `${row.name}`"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >

    <!-- ── Stats section ── -->
    <template v-if="!isAwaiting" #stats>
      <div class="stats-section">
        <!-- WMS doesn't deal in pricing/costing, so inventory value isn't meaningful there. -->
        <div v-if="!isWms" class="stat-card stat-card--bordered">
          <div class="stat-title">Total inventory value</div>
          <div class="stat-period">Based on current product value</div>
          <div class="stat-amount">{{ formatIDR(totalInventoryValue) }}</div>
          <span class="stat-asof">As of {{ asOfLabel }}</span>
        </div>
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">Low stock</div>
          <div class="stat-period">Below minimum stock</div>
          <div class="stat-amount stat-amount--warning">{{ lowStockRows.length }}</div>
          <a class="stat-link" @click="viewLowStock">View product</a>
        </div>
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">Out of stock</div>
          <div class="stat-period">Needs restocking</div>
          <div class="stat-amount stat-amount--danger">{{ outOfStockRows.length }}</div>
          <a class="stat-link" @click="viewOutOfStock">View product</a>
        </div>
        <div class="stat-card">
          <div class="stat-title">In-stock rate</div>
          <div class="stat-period">{{ inStockCount }} of {{ allRows.length }} products</div>
          <div class="stat-amount">{{ inStockRate }}%</div>
        </div>
      </div>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <MpPopover id="prod-type-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="prod-type-select"
              placeholder="Product type"
              :model-value="productTypeFilter"
              is-clearable
              :class="css({ width: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })"
              @mousedown.prevent
              @clear="productTypeFilter = ''"
            >
              <option v-if="productTypeFilter" :value="productTypeFilter">{{ productTypeLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in productTypeOptions"
                :key="opt.value"
                :is-active="opt.value === productTypeFilter"
                @click="productTypeFilter = opt.value"
              >
                {{ opt.label }}
              </MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <!-- Warehouse — multi-select (checkbox list) -->
        <MpPopover id="prod-warehouse-filter" :is-close-on-select="false">
          <MpPopoverTrigger>
            <MpSelect
              id="prod-warehouse-select"
              placeholder="Warehouse"
              :model-value="warehouseFilter.length ? '__selected__' : undefined"
              is-clearable
              :class="css({ width: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })"
              @mousedown.prevent
              @clear="warehouseFilter = []"
            >
              <option v-if="warehouseFilter.length" value="__selected__">{{ warehouseLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', maxWidth: '320px' })">
            <div class="checkbox-filter-list">
              <label v-for="opt in warehouseOptions" :key="opt.value" class="checkbox-filter-item">
                <MpCheckbox
                  :id="`prod-wh-${opt.value}`"
                  :is-checked="warehouseFilter.includes(opt.value)"
                  @change="toggleWarehouse(opt.value)"
                  @click.stop
                >
                  {{ opt.label }}
                </MpCheckbox>
              </label>
            </div>
          </MpPopoverContent>
        </MpPopover>

        <button class="filter-all-btn">
          <MpIcon name="filter" size="sm" />
          All filters{{ activeFilterCount > 0 ? ` (${activeFilterCount})` : '' }}
        </button>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <!-- Airene -->
          <MpTooltip id="prod-tt-airene" label="Ask Airene" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <!-- Column settings -->
          <ColumnSettingsMenu id="prod-col-settings" tooltip="Column settings" :items="columnItems" :visibility="columnVisibility" />
          <!-- Export -->
          <MpTooltip id="prod-tt-export" label="Export" placement="bottom" use-portal>
            <button class="filter-icon-btn" aria-label="Export">
              <MpIcon name="download" size="md" />
            </button>
          </MpTooltip>
        </div>

        <!-- Pill search -->
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input
            v-model="search"
            class="filter-search-input"
            type="text"
            placeholder="Search..."
          />
          <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </template>

    <!-- ── Cell: Name — thumbnail + name + desc, "View details" chip on row hover ── -->
    <template #cell-name="{ row }">
      <div class="cell-with-action">
        <ProductCell
          :name="(row as ProductIndexRow).name"
          :desc="(row as ProductIndexRow).desc"
          :image="(row as ProductIndexRow).img"
        />
        <button class="row-hover-btn" @click.stop="viewDetails((row as ProductIndexRow).sku)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="row-hover-btn__label">VIEW DETAILS</span>
        </button>
      </div>
    </template>

    <!-- ── Cell: quantity columns ── -->
    <template #cell-onHand="{ value }">{{ (value as number).toLocaleString('id-ID') }}</template>
    <template #cell-reserved="{ value }">{{ (value as number).toLocaleString('id-ID') }}</template>
    <template #cell-available="{ value }">{{ (value as number).toLocaleString('id-ID') }}</template>
    <template #cell-onTheWay="{ value }">{{ (value as number).toLocaleString('id-ID') }}</template>
    <template #cell-minStock="{ value }">{{ (value as number).toLocaleString('id-ID') }}</template>

    <!-- ── Cell: price columns ── -->
    <template #cell-defaultSalesPrice="{ value }">{{ formatIDR(value as number) }}</template>
    <template #cell-averageCost="{ value }">{{ formatIDR(value as number) }}</template>
    <template #cell-lastPurchaseCost="{ value }">{{ formatIDR(value as number) }}</template>
    <template #cell-defaultPurchaseCost="{ value }">{{ formatIDR(value as number) }}</template>

    <!-- ── Actions kebab ── -->
    <template #actions="{ row }">
      <MpPopover :id="`prod-actions-${(row as ProductIndexRow).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" aria-label="More actions">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails((row as ProductIndexRow).sku)">View details</MpPopoverListItem>
            <MpPopoverListItem @click="router.push(`/product-list/${(row as ProductIndexRow).sku}/edit`)">Edit</MpPopoverListItem>
            <MpPopoverListItem>Duplicate</MpPopoverListItem>
            <MpPopoverListItem :class="css({ color: 'var(--mp-text-critical)' })">Archive</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #cell-lastUpdated="{ row }">
      <LastUpdatedCell v-bind="lastUpdatedFor((row as Record<string, unknown>).id as string)" />
    </template>

    <!-- ── Full empty state ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ emptyTitle }}</p>
        <p class="empty-full-desc">{{ emptyDesc }}</p>
      </div>
    </template>

  </ErpTablePage>
</template>

<style scoped>
/* ── Stats section (mirrors SalesInvoicesPage/PurchaseInvoicesPage exactly) ── */
.stats-section {
  display: flex;
  gap: var(--mp-spacing-6);
  align-items: flex-start;
}

.stat-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  padding-right: var(--mp-spacing-6);
  align-self: stretch;
}

.stat-card--bordered {
  border-right: 1px solid var(--mp-border-default);
}

.stat-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
  white-space: nowrap;
}

.stat-period {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px);
  white-space: nowrap;
}

.stat-amount {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-2xl, 32px);
  white-space: nowrap;
}

.stat-amount--warning { color: var(--mp-text-warning); }
.stat-amount--danger { color: var(--mp-text-danger); }

.stat-link {
  display: inline-flex;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-link);
  line-height: var(--mp-line-heights-md);
  text-decoration: none;
  cursor: pointer;
  padding: 0 var(--mp-spacing-0\.5);
}

.stat-asof {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px);
  white-space: nowrap;
}

/* ── Filter bar — reused from other index pages ── */
.filter-left {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-4);
}

.filter-right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}

.filter-all-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
  cursor: pointer;
  white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }

.filter-btn-group {
  display: flex;
  align-items: center;
}

.checkbox-filter-list { display: flex; flex-direction: column; padding: var(--mp-spacing-1); }
.checkbox-filter-item {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) 10px; border-radius: var(--mp-radii-md);
  cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.checkbox-filter-item:hover { background: var(--mp-background-neutral-subtle); }

.filter-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px);
  height: var(--mp-sizes-9, 36px);
  padding: var(--mp-spacing-2);
  border: none;
  background: transparent;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  color: var(--mp-text-default);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-icon-btn--airene { color: var(--mp-airene-default); }

.filter-search {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  width: 248px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}

.filter-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  min-width: 0;
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

/* Cell with hover action button (View details) */
.cell-with-action {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
}
.row-hover-btn {
  position: absolute;
  right: 0;
  top: var(--mp-spacing-2\.5, 10px);
  transform: translateY(-50%);
  display: none;
  align-items: center;
  gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm);
  cursor: pointer;
  white-space: nowrap;
  line-height: 1;
}
.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xs, 12px);
  color: var(--mp-text-secondary);
  text-transform: uppercase;
  letter-spacing: var(--mp-letter-spacings-normal);
}
:global(.erp-tr:hover .row-hover-btn) {
  display: flex;
}

/* ── Row kebab ── */
.row-kebab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-8, 32px);
  height: var(--mp-sizes-8, 32px);
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--mp-radii-sm);
  color: var(--mp-text-subtle);
}
.row-kebab:hover {
  background: var(--mp-background-neutral-hovered);
  color: var(--mp-text-default);
}

/* ── Full empty state ── */
.empty-full {
  display: flex;
  flex-direction: column;
  align-items: center;
}
.empty-illustration {
  width: auto;
  height: 240px;
  object-fit: contain;
  margin-bottom: 0;
}
.empty-full-title {
  margin: 0 0 var(--mp-spacing-0\.5);
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-full-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
</style>
