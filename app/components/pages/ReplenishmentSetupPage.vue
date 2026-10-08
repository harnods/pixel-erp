<script setup lang="ts">
/**
 * Replenishment › "Needs setup" tab (PRD US-010, US-011).
 *
 * One list of every product that is NOT on "To order" for a reason a person has to
 * act on:
 *   • Missing lead time — it cannot be suggested until a vendor, a purchase or a
 *     default lead time exists.
 *   • Tracking off (muted) — US-010 AC-02: "all N SKUs replenishment will move into
 *     the Need Setup worklist", and tracking can be turned back on from here, one by
 *     one or in bulk. A muted SKU that is now at risk, or moving Fast again, says so
 *     on its row (US-011, US-010 AC-03) — muting never becomes a blind spot.
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import {
  toast, MpBadge, MpIcon, MpButton,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import SkuReplenishmentSettingsDrawer from '~/components/patterns/SkuReplenishmentSettingsDrawer.vue'
import VendorItemDrawer from '~/components/patterns/VendorItemDrawer.vue'
import {
  replenishmentWorklist, invalidateReplenishmentCaches, type WorklistRow,
} from '~/data/replenishment'
import { setTracked } from '~/data/replenishmentSettings'
import { ALL_WAREHOUSES } from '~/composables/useReplenishmentWarehouse'

// `mode` is kept for the route's props; both groups now live in one list.
defineProps<{ mode?: 'needs-setup' }>()

const router = useRouter()
const { t, tf } = useLocale()
const { canManageReplenishment } = useReplenishmentAccess()

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

/** Sort keys flattened BEFORE useTableState, which sorts the whole set on plain keys. */
type SetupRow = WorklistRow & { availableQty: number; fsnClass: string; reason: string }

const baseRows = computed<SetupRow[]>(() =>
  [...worklist.value.needsSetup, ...worklist.value.notTracked].map((row) => ({
    ...row,
    availableQty: row.atp.available,
    fsnClass: row.fsn.committed,
    reason: row.bucket === 'not-tracked' ? 'Tracking off' : 'Missing lead time',
  })),
)

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<SetupRow>(baseRows, {
  filterFn: (row, s) => !s
    || [row.sku, row.productName, row.warehouseName].some((v) => v.toLowerCase().includes(s)),
})

watch(warehouseId, () => setPage(1))

const hasActiveFilter = computed(() => !!search.value)
function clearFilters() { search.value = '' }

// Widths from `kind` (rule/table-column-kind). No "Sales history" column: demand
// no longer routes a product here (D18 — 0 sales simply drops off).
const columns: TableColumn[] = [
  { key: 'productName',   label: 'Product',   kind: 'name',   sortable: true, sortType: 'text' },
  { key: 'sku',           label: 'SKU',                       sortable: true, sortType: 'text' },
  { key: 'warehouseName', label: 'Warehouse', kind: 'name',   sortable: true, sortType: 'text' },
  { key: 'availableQty',  label: 'Available qty',             sortable: true, sortType: 'number', align: 'right' },
  // Quantity and unit are separate columns, as on the To order table.
  { key: 'unit',          label: 'Unit',      kind: 'unit' },
  { key: 'fsnClass',      label: 'Movement',  kind: 'status', sortable: true, sortType: 'text' },
  { key: 'reason',        label: 'Reason',    kind: 'address', sortable: true, sortType: 'text' },
]

sortKey.value = 'availableQty'
sortDir.value = 'asc'

const warehouseSelectOptions = computed(() => [
  ...(canSelectAll.value ? [{ value: ALL_WAREHOUSES, label: t('All warehouses') }] : []),
  ...whOptions.value.map((wh) => ({ value: wh.id, label: wh.name })),
])

const num = (v: number) => v.toLocaleString('id-ID')


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
function openVendors(sku: string) {
  vendorSku.value = sku
  vendorOpen.value = true
}

function turnOnTracking(row: WorklistRow) {
  if (!canManageReplenishment.value) return
  setTracked(row.sku, row.warehouseId, true)
  invalidateReplenishmentCaches()
  tick.value++
  toast.notify({ variant: 'success', title: t('Tracking turned on'), maxWidth: 'max-content' })
}

function selectedRows(sel: Set<number>): WorklistRow[] {
  return [...sel].map((i) => paginated.value[i]).filter(Boolean) as WorklistRow[]
}
/** Only muted rows can have tracking turned back on; missing-lead-time rows need setup. */
function mutedIn(sel: Set<number>): WorklistRow[] {
  return selectedRows(sel).filter((r) => r.bucket === 'not-tracked')
}

function bulkTrackOn(sel: Set<number>, deselectAll: () => void) {
  if (!canManageReplenishment.value) return
  const selected = mutedIn(sel)
  if (!selected.length) return
  for (const row of selected) setTracked(row.sku, row.warehouseId, true)
  deselectAll()
  invalidateReplenishmentCaches()
  tick.value++
  toast.notify({
    variant: 'success',
    title: selected.length === 1 ? t('Tracking turned on') : tf('Tracking turned on for {n} products', { n: selected.length }),
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
    :rows="(paginated as unknown as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :loading="loading"
    :has-active-filter="hasActiveFilter"
    :has-checkbox="true"
    bulk-label="product"
    filter-empty-label="product"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @clear-filters="clearFilters"
  >
    <template #filters>
      <div class="filter-left">
        <!-- Scope selector, like the worklist: one value always in force (not clearable). -->
        <ErpFilterSelect
          id="rp-setup-warehouse"
          :model-value="warehouseId"
          :placeholder="t('Warehouse')"
          :options="warehouseSelectOptions"
          width="220px"
          :is-clearable="false"
          @update:model-value="(v: string) => setWarehouse(v)"
        />
      </div>
      <div class="filter-right">
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search product or warehouse')" />
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </template>

    <template #bulk-actions="{ deselectAll, selectedRows: sel }">
      <MpButton
        v-if="canManageReplenishment && mutedIn(sel as Set<number>).length"
        variant="secondary"
        size="sm"
        is-rounded
        @click="bulkTrackOn(sel as Set<number>, deselectAll)"
      >{{ t('Turn on tracking') }} ({{ mutedIn(sel as Set<number>).length }})</MpButton>
      <span v-else-if="canManageReplenishment" class="rp-bulk-info">
        <MpIcon name="info" size="sm" />
        {{ t('Only products with tracking off can be turned back on. Missing lead times are fixed in Vendors or Replenishment settings.') }}
      </span>
    </template>

    <template #cell-productName="{ row }">
      <ProductCell
        :name="(row as any).productName"
        :desc="(row as any).productDesc"
        :image="(row as any).img"
        linkable
        @name-click="viewProduct((row as any).sku)"
      />
    </template>

    <template #cell-availableQty="{ row }">
      {{ num((row as any).atp.available) }}
    </template>

    <!-- Why the product is here, and what to do about it. -->
    <template #cell-reason="{ row }">
      <div class="rp-missing">
        <div class="rp-badges">
          <template v-if="(row as any).bucket === 'not-tracked'">
            <MpBadge for="tableStatus" type="announcement">{{ t('Tracking off') }}</MpBadge>
            <!-- US-011: muting never suppresses a genuine stockout risk. -->
            <MpBadge v-if="(row as any).flags.mutedButActive" for="tableStatus" type="critical">
              {{ t('Below reorder point') }}
            </MpBadge>
          </template>
          <MpBadge v-for="m in (row as any).missing" v-else :key="m" for="tableStatus" type="warning">
            {{ t('Missing') }}: {{ t(m) }}
          </MpBadge>
        </div>
        <span v-if="(row as any).bucket !== 'not-tracked' && (row as any).leadTimeTier === 'none'" class="rp-missing-reason">
          {{ t('No lead time yet. Add a preferred vendor, make a purchase, or set a default lead time.') }}
        </span>
        <!-- US-010 AC-03: a muted SKU that is moving Fast again is suggested back. -->
        <span v-if="(row as any).bucket === 'not-tracked' && (row as any).fsn.committed === 'fast'" class="rp-missing-reason">
          {{ t('Moving fast again.') }}
          <a v-if="canManageReplenishment" class="rp-setup-link" @click="turnOnTracking(row as unknown as WorklistRow)">{{ t('Turn tracking back on') }}</a>
        </span>
      </div>
    </template>

    <template #cell-fsnClass="{ row }">
      <MpBadge
        for="tableStatus"
        :type="FSN_BADGE[(row as any).fsn.committed]?.type ?? 'announcement'"
      >{{ t(FSN_BADGE[(row as any).fsn.committed]?.label ?? 'Unclassified') }}</MpBadge>
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
          <MpButton variant="ghost" class="row-kebab" :aria-label="t('More actions')">
            <MpIcon name="menu-kebab" size="md" />
          </MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '210px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewProduct((row as any).sku)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openVendors((row as any).sku)">
              {{ t('View vendors, lead time and MOQ') }}
            </MpPopoverListItem>
            <MpPopoverListItem @click="openSettings(row as unknown as WorklistRow)">
              {{ canManageReplenishment ? t('Replenishment settings') : t('View replenishment settings') }}
            </MpPopoverListItem>
            <MpPopoverListItem
              v-if="canManageReplenishment && (row as any).bucket === 'not-tracked'"
              @click="turnOnTracking(row as unknown as WorklistRow)"
            >{{ t('Turn on tracking') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No products need setup') }}</p>
        <p class="empty-full-desc">
          {{ t('Every product has a lead time and is tracked for replenishment.') }}
        </p>
        <MpButton
          id="rps-empty-to-order"
          variant="secondary"
          is-rounded
          class="empty-full-cta"
          data-devchange="replenishment-empty-states"
          @click="router.push('/replenishment')"
        >{{ t('View products to order') }}</MpButton>
      </div>
    </template>
  </ErpTablePage>

  <SkuReplenishmentSettingsDrawer
    v-model:is-open="settingsOpen"
    :row="settingsRow"
    :readonly="!canManageReplenishment"
    @saved="onSaved"
  />

  <!-- Read-only: stockist surface; vendor terms are edited by purchasing. -->
  <VendorItemDrawer
    v-model:is-open="vendorOpen"
    :sku="vendorSku"
  />
</template>

<style scoped>
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
  color: var(--mp-colors-icon-default);
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

.row-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); margin-left: auto;
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
.row-kebab:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

.rp-num { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.rp-num-value { color: var(--mp-text-default); white-space: nowrap; font-variant-numeric: tabular-nums; }
.rp-num-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); text-align: right; }
.rp-badges { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-1); align-items: center; }
/* Table cells are nowrap by default; the reason is prose, so it wraps inside its
   column instead of running under the pinned actions column and out of the table. */
.rp-missing { display: flex; flex-direction: column; gap: var(--mp-spacing-1); white-space: normal; min-width: 0; }
.rp-missing-reason { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }

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
.empty-full-cta { margin-top: var(--mp-spacing-4); }
.rp-bulk-info {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5, 6px);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
</style>
