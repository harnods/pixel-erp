<script setup lang="ts">
/**
 * Replenishment › "Needs setup" and "Not tracked" tabs.
 *
 * These are tabs rather than filters on the worklist because they are different
 * jobs with different columns and no draft-PO action:
 *   • Needs setup — products that CANNOT be suggested yet (cold start, no vendor,
 *     no lead time). Leaving them in the worklist would break "select all → create
 *     draft PO" on every run and force a partial-failure summary every time. It is
 *     also usually a different person: data hygiene, done once.
 *   • Not tracked — muted products. This deliberately has NO tab of its own: a tab
 *     reads as a queue, and a product someone muted on purpose is not a queue. It is
 *     revealed on demand from the Needs setup tab instead, which keeps the one thing
 *     that would otherwise become impossible — turning tracking back ON — a single
 *     click away rather than a dead end.
 *
 * One component serves both views via `mode`; the columns and bulk action differ.
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import {
  toast, MpBadge, MpSelect,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ClampText from '~/components/patterns/ClampText.vue'
import SkuReplenishmentSettingsDrawer from '~/components/patterns/SkuReplenishmentSettingsDrawer.vue'
import VendorItemDrawer from '~/components/patterns/VendorItemDrawer.vue'
import {
  replenishmentWorklist, invalidateReplenishmentCaches, type WorklistRow,
} from '~/data/replenishment'
import { setTracked } from '~/data/replenishmentSettings'
import { ALL_WAREHOUSES } from '~/composables/useReplenishmentWarehouse'

const props = defineProps<{ mode: 'needs-setup' | 'not-tracked' }>()

// Local, so the Needs setup tab can reveal the muted list without it being a tab.
const mode = ref<'needs-setup' | 'not-tracked'>(props.mode)
watch(() => props.mode, (m) => { mode.value = m })

const router = useRouter()
const { t } = useLocale()

const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

// Shared scope singleton — same selector the worklist tab uses, so switching tabs
// keeps the warehouse and the badges stay in step.
const { options: whOptions, canSelectAll, warehouseId, isAllWarehouses, setWarehouse } =
  useReplenishmentWarehouse()

const activeWarehouseFilter = useActiveWarehouseFilter()
watch(warehouseId, (id) => {
  activeWarehouseFilter.value = id && id !== ALL_WAREHOUSES ? [id] : []
}, { immediate: true })
onUnmounted(() => { activeWarehouseFilter.value = [] })

const tick = ref(0)
const worklist = computed(() => {
  void tick.value
  return replenishmentWorklist(isAllWarehouses.value ? 'all' : warehouseId.value)
})

const baseRows = computed<WorklistRow[]>(() =>
  mode.value === 'needs-setup' ? worklist.value.needsSetup : worklist.value.notTracked,
)

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<WorklistRow>(baseRows, {
  filterFn: (row, s) =>
    !s || row.sku.toLowerCase().includes(s) || row.productName.toLowerCase().includes(s),
})

watch(warehouseId, () => setPage(1))

const hasActiveFilter = computed(() => !!search.value)
function clearFilters() { search.value = '' }

const SETUP_COLUMNS: TableColumn[] = [
  { key: 'productName',   label: 'Product',        width: '300px', sortable: true, sortType: 'text' },
  { key: 'sku',           label: 'SKU',            width: '120px', sortable: true, sortType: 'text' },
  { key: 'warehouseName', label: 'Warehouse',      width: '190px', sortable: true, sortType: 'text' },
  { key: 'availableQty',  label: 'Available',      width: '140px', sortable: true, sortType: 'number', align: 'right' },
  { key: 'historyDays',   label: 'Sales history',  width: '150px', sortable: true, sortType: 'number', align: 'right' },
  { key: 'missing',       label: 'Missing',        width: '320px' },
]

const TRACKED_COLUMNS: TableColumn[] = [
  { key: 'productName',   label: 'Product',        width: '300px', sortable: true, sortType: 'text' },
  { key: 'sku',           label: 'SKU',            width: '120px', sortable: true, sortType: 'text' },
  { key: 'warehouseName', label: 'Warehouse',      width: '190px', sortable: true, sortType: 'text' },
  { key: 'availableQty',  label: 'Available',      width: '140px', sortable: true, sortType: 'number', align: 'right' },
  { key: 'fsnClass',      label: 'FSN',            width: '130px', sortable: true, sortType: 'text' },
  { key: 'atRisk',        label: 'Status',         width: '220px' },
]

const columns = computed(() => (mode.value === 'needs-setup' ? SETUP_COLUMNS : TRACKED_COLUMNS))

sortKey.value = mode.value === 'needs-setup' ? 'availableQty' : 'productName'
sortDir.value = 'asc'

const rows = computed(() =>
  paginated.value.map((row) => ({
    ...row,
    availableQty: row.atp.available,
    historyDays: row.velocity.historyDays,
    fsnClass: row.fsn.committed,
  })),
)

const num = (v: number) => v.toLocaleString('id-ID')

const notTrackedCount = computed(() => worklist.value.notTracked.length)

const FSN_BADGE: Record<string, { type: string; label: string }> = {
  fast: { type: 'information', label: 'Fast' },
  slow: { type: 'warning', label: 'Slow' },
  'non-moving': { type: 'announcement', label: 'Non-moving' },
  unclassified: { type: 'announcement', label: 'Unclassified' },
}

// ─── Actions ─────────────────────────────────────────────────────────────────
const settingsRow = ref<WorklistRow | null>(null)
const settingsOpen = ref(false)
const vendorSku = ref<string | null>(null)
const vendorOpen = ref(false)

function viewProduct(sku: string) { router.push(`/product-list/${sku}`) }
function openSettings(row: WorklistRow) { settingsRow.value = row; settingsOpen.value = true }
function openVendors(sku: string) { vendorSku.value = sku; vendorOpen.value = true }

function turnOnTracking(row: WorklistRow) {
  setTracked(row.sku, row.warehouseId, true)
  invalidateReplenishmentCaches()
  tick.value++
  toast.notify({ variant: 'success', title: t('Tracking turned on.'), maxWidth: 'max-content' })
}

function bulkTrackOn(sel: Set<number>, deselectAll: () => void) {
  const selected = [...sel].map((i) => paginated.value[i]).filter(Boolean) as WorklistRow[]
  if (!selected.length) return
  for (const row of selected) setTracked(row.sku, row.warehouseId, true)
  deselectAll()
  invalidateReplenishmentCaches()
  tick.value++
  toast.notify({
    variant: 'success',
    title: `${t('Tracking turned on for')} ${selected.length} ${selected.length === 1 ? t('product') : t('products')}.`,
    maxWidth: 'max-content',
  })
}

function onSaved() {
  invalidateReplenishmentCaches()
  tick.value++
}
</script>

<template>
  <ErpTablePage
    :columns="columns"
    :rows="(rows as unknown as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :loading="loading"
    :has-active-filter="hasActiveFilter"
    :has-checkbox="mode === 'not-tracked'"
    bulk-label="product"
    filter-empty-label="product"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @clear-filters="clearFilters"
  >
    <template #stats>
      <div class="rp-setup-head">
        <p class="rp-setup-intro">
          <template v-if="mode === 'needs-setup'">
            {{ t('These products cannot be suggested yet. Fill in what is missing to include them in the worklist.') }}
          </template>
          <template v-else>
            {{ t('Tracking is off for these products on purpose, so they stay out of the worklist. A genuine stockout still raises an alert.') }}
          </template>
        </p>
        <!-- Muted products get no tab, but they must stay reachable: this is the
             only route back to turning tracking on. Hidden behind a link, and only
             shown when there is actually something muted. -->
        <p v-if="mode === 'needs-setup' && notTrackedCount" class="rp-setup-aside">
          {{ notTrackedCount }}
          {{ notTrackedCount === 1 ? t('product is not tracked') : t('products are not tracked') }}
          <a class="rp-setup-link" @click="mode = 'not-tracked'">{{ t('Show') }}</a>
        </p>
        <p v-else-if="mode === 'not-tracked'" class="rp-setup-aside">
          <a class="rp-setup-link" @click="mode = 'needs-setup'">← {{ t('Back to Needs setup') }}</a>
        </p>
      </div>
    </template>

    <template #filters>
      <div class="filter-left">
        <MpSelect
          id="rp-setup-warehouse"
          :model-value="warehouseId"
          :placeholder="t('Warehouse')"
          :class="css({ width: '220px' })"
          @update:model-value="(v: string) => setWarehouse(v)"
        >
          <option v-if="canSelectAll" :value="ALL_WAREHOUSES">{{ t('All warehouses') }}</option>
          <option v-for="wh in whOptions" :key="wh.id" :value="wh.id">{{ wh.name }}</option>
        </MpSelect>
      </div>
      <div class="filter-right">
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search product or SKU')" />
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </template>

    <template v-if="mode === 'not-tracked'" #bulk-actions="{ deselectAll, selectedRows }">
      <button
        class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm"
        @click="bulkTrackOn(selectedRows as Set<number>, deselectAll)"
      >{{ t('Turn on tracking') }}</button>
    </template>

    <template #cell-productName="{ row }">
      <div class="rp-product">
        <img v-if="(row as any).img" class="rp-thumb" :src="(row as any).img" :alt="(row as any).productName" loading="lazy" />
        <span v-else class="rp-thumb rp-thumb--empty" />
        <span class="rp-product-text">
          <a class="cell-link rp-product-name" @click.stop="viewProduct((row as any).sku)">
            {{ (row as any).productName }}
          </a>
          <ClampText v-if="(row as any).productDesc" class="rp-product-sub" :text="(row as any).productDesc" />
        </span>
      </div>
    </template>

    <template #cell-availableQty="{ row }">
      {{ num((row as any).atp.available) }} {{ (row as any).unit }}
    </template>

    <template #cell-historyDays="{ row }">
      <div class="rp-num">
        <span class="rp-num-value">{{ (row as any).velocity.historyDays }} {{ t('days') }}</span>
        <span class="rp-num-sub">{{ t('Needs 14') }}</span>
      </div>
    </template>

    <!-- What is missing, as chips — one per unmet input -->
    <template #cell-missing="{ row }">
      <div class="rp-badges">
        <MpBadge v-for="m in (row as any).missing" :key="m" for="tableStatus" type="warning">
          {{ t(m) }}
        </MpBadge>
        <span v-if="!(row as any).missing.length" class="rp-num-sub">—</span>
      </div>
    </template>

    <template #cell-fsnClass="{ row }">
      <MpBadge
        for="additionalInformation"
        :type="FSN_BADGE[(row as any).fsn.committed]?.type ?? 'announcement'"
      >{{ t(FSN_BADGE[(row as any).fsn.committed]?.label ?? 'Unclassified') }}</MpBadge>
    </template>

    <!-- Muting must never become a blind spot (US-014) — say so on the row. -->
    <template #cell-atRisk="{ row }">
      <div class="rp-badges">
        <MpBadge v-if="(row as any).flags.mutedButActive" for="tableStatus" type="critical">
          {{ t('Below reorder point') }}
        </MpBadge>
        <MpBadge v-else for="tableStatus" type="announcement">{{ t('Not tracked') }}</MpBadge>
      </div>
    </template>

    <template #actions="{ row }">
      <MpPopover
        :id="`rp-setup-actions-${(row as any).warehouseId}-${(row as any).sku}`"
        is-close-on-select
        use-portal
        :is-keep-alive="false"
        placement="bottom-end"
      >
        <MpPopoverTrigger>
          <button class="row-kebab" :aria-label="t('More actions')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '210px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewProduct((row as any).sku)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openVendors((row as any).sku)">
              {{ t('Vendors, lead time and MOQ') }}
            </MpPopoverListItem>
            <MpPopoverListItem @click="openSettings(row as unknown as WorklistRow)">
              {{ t('Replenishment settings') }}
            </MpPopoverListItem>
            <MpPopoverListItem
              v-if="mode === 'not-tracked'"
              @click="turnOnTracking(row as unknown as WorklistRow)"
            >{{ t('Turn on tracking') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">
          {{ mode === 'needs-setup' ? t('No products need setup') : t('No untracked products') }}
        </p>
        <p class="empty-full-desc">
          {{ mode === 'needs-setup'
            ? t('Every tracked product has sales history, a lead time and a vendor.')
            : t('Every product in scope is tracked for replenishment.') }}
        </p>
      </div>
    </template>
  </ErpTablePage>

  <SkuReplenishmentSettingsDrawer
    v-model:is-open="settingsOpen"
    :row="settingsRow"
    @saved="onSaved"
  />

  <VendorItemDrawer
    v-model:is-open="vendorOpen"
    :sku="vendorSku"
    @saved="onSaved"
  />
</template>

<style scoped>
.rp-setup-head { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.rp-setup-intro { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.rp-setup-aside { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.rp-setup-link { margin-left: var(--mp-spacing-1); color: var(--mp-text-link); cursor: pointer; }

.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-left: auto; }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 220px;
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

.row-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); margin-left: auto;
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
.row-kebab svg { display: block; width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

.rp-product { display: flex; align-items: flex-start; gap: var(--mp-spacing-3); min-width: 0; padding-right: var(--mp-spacing-2); }
.rp-thumb {
  flex-shrink: 0; width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  border-radius: var(--mp-radii-sm); object-fit: cover;
  background: var(--mp-background-neutral-subtle); border: 1px solid var(--mp-border-default);
}
.rp-thumb--empty { display: inline-block; }
.rp-product-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.rp-product-name { color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rp-product-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); margin-top: 2px; }

.rp-num { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.rp-num-value { color: var(--mp-text-default); white-space: nowrap; font-variant-numeric: tabular-nums; }
.rp-num-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); text-align: right; }
.rp-badges { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }

:deep(.erp-tr:hover .erp-td) { background: var(--mp-background-neutral); }

.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-full-desc {
  margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary); max-width: 400px; text-align: center;
}
</style>
