<script setup lang="ts">
/**
 * Bill of Materials — Production module index. Lists the BOMs that define which
 * finished good a work order produces, plus their category and costing reference.
 */
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import BillOfMaterialsFiltersDrawer, { type BomFiltersValue } from '~/components/patterns/BillOfMaterialsFiltersDrawer.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { billOfMaterials, catalogProduct, persistBillOfMaterials, type BillOfMaterials } from '~/data/billOfMaterials'

const toggleAirene = inject<() => void>('toggleAirene')
const { t } = useLocale()

// ─── Columns ───────────────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'number',           label: t('Number'),             width: '200px', sortable: true },
  { key: 'name',             label: t('Name'),               width: '200px', sortable: true },
  { key: 'category',         label: t('Category'),           width: '130px' },
  { key: 'costingReference', label: t('Costing reference'),  width: '170px' },
  { key: 'finishedGood',     label: t('Finished goods'),     width: '180px' },
  { key: 'description',      label: t('Description'),        width: '280px' },
]

// ─── Filters ───────────────────────────────────────────────────────────────────
// Category — Standard / Custom. Clearing (x) resets to show-all.
const CATEGORY_OPTIONS: { label: string; value: BillOfMaterials['category'] }[] = [
  { label: 'Standard', value: 'Standard' },
  { label: 'Custom',   value: 'Custom'   },
]
const categoryFilter = ref('')
const categoryLabel = computed(() => CATEGORY_OPTIONS.find(o => o.value === categoryFilter.value)?.label ?? '')

// Costing ref. — Actual cost / Standard cost. Clearing (x) resets to show-all.
const COSTING_OPTIONS: { label: string; value: BillOfMaterials['costingReference'] }[] = [
  { label: 'Actual cost',   value: 'Actual cost'   },
  { label: 'Standard cost', value: 'Standard cost' },
]
const costingFilter = ref('')
const costingLabel = computed(() => COSTING_OPTIONS.find(o => o.value === costingFilter.value)?.label ?? '')

// Finished goods — every registered product actually used as a BOM's main output.
const finishedGoodOptions = computed(() => {
  const seen = new Map<string, string>()
  for (const b of billOfMaterials) {
    if (!seen.has(b.finishedGoodId)) seen.set(b.finishedGoodId, catalogProduct(b.finishedGoodId)?.name ?? b.finishedGoodId)
  }
  return [...seen].map(([id, name]) => ({ id, name }))
})
const finishedGoodFilter = ref('')
const showArchived = ref(false)

// ─── All filters drawer ─────────────────────────────────────────────────────────
const isFiltersDrawerOpen = ref(false)
const drawerCategoryOptions = computed(() => CATEGORY_OPTIONS.map(o => ({ id: o.value, name: o.label })))
const drawerCostingOptions = computed(() => COSTING_OPTIONS.map(o => ({ id: o.value, name: o.label })))
const drawerValue = computed<BomFiltersValue>(() => ({
  keyword: search.value,
  category: categoryFilter.value,
  costingReference: costingFilter.value,
  finishedGoodId: finishedGoodFilter.value,
  showArchived: showArchived.value,
}))
function applyDrawerFilters(v: BomFiltersValue) {
  search.value = v.keyword
  categoryFilter.value = v.category
  costingFilter.value = v.costingReference
  finishedGoodFilter.value = v.finishedGoodId
  showArchived.value = v.showArchived
}

// ─── Rows / table state ─────────────────────────────────────────────────────────
// Prototype preview toggle (FAB, bottom-right): data vs empty-state view
const previewMode = ref<'data' | 'empty'>('data')
const rows = computed<BillOfMaterials[]>(() => (previewMode.value === 'empty' ? [] : billOfMaterials))
function finishedGoodName(row: BillOfMaterials) { return catalogProduct(row.finishedGoodId)?.name ?? '—' }

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort,
} = useTableState<BillOfMaterials>(rows, {
  perPage: 25,
  filterFn: (row, s) => {
    const matchesSearch = !s
      || row.number.toLowerCase().includes(s)
      || row.name.toLowerCase().includes(s)
      || finishedGoodName(row).toLowerCase().includes(s)
      || row.description.toLowerCase().includes(s)
    const matchesCategory = !categoryFilter.value || row.category === categoryFilter.value
    const matchesCosting = !costingFilter.value || row.costingReference === costingFilter.value
    const matchesFinishedGood = !finishedGoodFilter.value || row.finishedGoodId === finishedGoodFilter.value
    const matchesArchived = showArchived.value || !row.archived
    return matchesSearch && matchesCategory && matchesCosting && matchesFinishedGood && matchesArchived
  },
})
// Newest first by default.
sortKey.value = 'number'
sortDir.value = 'desc'

// Reset to page 1 when the extra (non-built-in) filters change
watch([categoryFilter, costingFilter, finishedGoodFilter, showArchived], () => setPage(1))

const hasActiveFilter = computed(() =>
  !!search.value || !!categoryFilter.value || !!costingFilter.value || !!finishedGoodFilter.value || showArchived.value,
)
function clearFilters() {
  search.value = ''
  categoryFilter.value = ''
  costingFilter.value = ''
  finishedGoodFilter.value = ''
  showArchived.value = false
}

function archiveBom(row: BillOfMaterials) {
  row.archived = true
  persistBillOfMaterials()
  toast.notify({ variant: 'success', title: t('Bill of materials archived') })
}

// ─── Delete confirmation ────────────────────────────────────────────────────────
const isDeleteModalOpen = ref(false)
const bomToDelete = ref<BillOfMaterials | null>(null)
function openDeleteModal(row: BillOfMaterials) {
  bomToDelete.value = row
  isDeleteModalOpen.value = true
}
function confirmDelete() {
  if (bomToDelete.value) archiveBom(bomToDelete.value)
  bomToDelete.value = null
}

function duplicateBom(row: BillOfMaterials) {
  router.push(`/bill-of-materials/new?duplicate=${encodeURIComponent(row.id)}`)
}

// ─── Column show/hide ───────────────────────────────────────────────────────────
const columnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(columns.map(c => [c.key, true])),
)
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter(c => columnVisibility[c.key]))

// ─── First-load skeleton (pagination skeleton handled by ErpTablePage) ───────────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

const router = useRouter()
function viewDetails(row: BillOfMaterials) { router.push(`/bill-of-materials/${row.id}`) }

const emptyIllustration = '/illustrations/empty-folder.png'
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
    :has-active-filter="hasActiveFilter"
    :search="search"
    has-checkbox
    :bulk-label="t('bill of materials')"
    :bulk-label-plural="t('bill of materials')"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @clear-filters="clearFilters"
  >
    <!-- ── Filter bar ── -->
    <template #filters>
      <!-- Left: Category + Costing ref. + All filters -->
      <div class="filter-left">
        <MpPopover id="bom-category-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="bom-category-select"
              :placeholder="t('Category')"
              :model-value="categoryFilter"
              is-clearable
              :class="css({ width: '160px' })"
              @mousedown.prevent
              @clear="categoryFilter = ''"
            >
              <option v-if="categoryFilter" :value="categoryFilter">{{ categoryLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in CATEGORY_OPTIONS"
                :key="opt.value"
                :is-active="opt.value === categoryFilter"
                @click="categoryFilter = opt.value"
              >{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <MpPopover id="bom-costing-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="bom-costing-select"
              :placeholder="t('Costing ref.')"
              :model-value="costingFilter"
              is-clearable
              :class="css({ width: '170px' })"
              @mousedown.prevent
              @clear="costingFilter = ''"
            >
              <option v-if="costingFilter" :value="costingFilter">{{ costingLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '170px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in COSTING_OPTIONS"
                :key="opt.value"
                :is-active="opt.value === costingFilter"
                @click="costingFilter = opt.value"
              >{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <button class="filter-all-btn" type="button" @click="isFiltersDrawerOpen = true">
          <MpIcon name="filter" size="sm" />
          {{ t('All filters') }}
        </button>
      </div>

      <!-- Right: icon buttons + search -->
      <div class="filter-right">
        <div class="filter-btn-group">
          <MpTooltip id="tt-bom-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" :aria-label="t('Ask Airene')" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <ColumnSettingsMenu id="bom-columns" :items="columnItems" :visibility="columnVisibility" />
          <MpTooltip id="tt-bom-export" :label="t('Export')" placement="bottom" use-portal>
            <button class="filter-icon-btn" :aria-label="t('Export')">
              <MpIcon name="download" size="md" />
            </button>
          </MpTooltip>
        </div>

        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
        </div>
      </div>
    </template>

    <!-- ── Number — View details on row hover ── -->
    <template #cell-number="{ value, row }">
      <a class="cell-link cell-text" @click.stop="viewDetails(row as unknown as BillOfMaterials)">{{ value }}</a>
    </template>

    <!-- ── Name — wraps to multiple lines (long variant names) ── -->
    <template #cell-name="{ value }">
      <span class="bom-name">{{ value }}</span>
    </template>

    <!-- ── Finished good — resolved from the registered product ── -->
    <template #cell-finishedGood="{ row }">
      <span class="bom-finished-good">{{ finishedGoodName(row as unknown as BillOfMaterials) }}</span>
    </template>

    <!-- ── Description — em dash when empty, wraps to multiple lines ── -->
    <template #cell-description="{ value }">
      <span v-if="value" class="bom-description">{{ value }}</span>
      <span v-else class="bom-muted">-</span>
    </template>

    <!-- ── Actions kebab (sticky right) ── -->
    <template #actions="{ row }">
      <MpPopover :id="`bom-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" :aria-label="t('More actions')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails(row as unknown as BillOfMaterials)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="duplicateBom(row as unknown as BillOfMaterials)">{{ t('Duplicate') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openDeleteModal(row as unknown as BillOfMaterials)">{{ t('Archive') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Bulk selection actions ── -->
    <template #bulk-actions>
      <button class="bulk-action-btn">{{ t('Delete') }}</button>
    </template>

    <!-- ── Full empty state (first run) ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No bill of materials') }}</p>
        <p class="empty-full-desc">{{ t('Bill of materials will appear here.') }}</p>
        <button class="empty-full-btn">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ t('New bill of materials') }}
        </button>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Delete confirmation ── -->
  <ConfirmModal
    v-model:is-open="isDeleteModalOpen"
    :title="t('Archive bill of materials?')"
    :description="`${bomToDelete?.number ?? ''} ${t('will be removed from the list. You can still find it via the Show archived BOM filter.')}`"
    :confirm-label="t('Archive')"
    @confirm="confirmDelete"
  />

  <!-- ── All filters drawer ── -->
  <BillOfMaterialsFiltersDrawer
    v-model:is-open="isFiltersDrawerOpen"
    :model-value="drawerValue"
    :category-options="drawerCategoryOptions"
    :costing-options="drawerCostingOptions"
    :finished-good-options="finishedGoodOptions"
    @apply="applyDrawerFilters"
  />

  <!-- ── Demo scenario FAB (bottom-right) ── -->
  <MpPopover id="bom-demo-fab" is-close-on-select use-portal placement="top-end">
    <MpPopoverTrigger>
      <button class="demo-fab" :aria-label="t('Change scenario state')">
        <MpIcon name="sliders" size="md" color="icon.inverse" />
      </button>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
      <p class="demo-fab-heading">{{ t('Scenario state') }}</p>
      <MpPopoverList>
        <MpPopoverListItem :is-active="previewMode === 'data'" @click="previewMode = 'data'">{{ t('With data') }}</MpPopoverListItem>
        <MpPopoverListItem :is-active="previewMode === 'empty'" @click="previewMode = 'empty'">{{ t('Empty state') }}</MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
/* ── Filter bar ─────────────────────────────────────────────────────────── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.filter-all-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary);
  cursor: pointer; white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }

.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  padding: var(--mp-spacing-2); border: none; background: transparent;
  border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-icon-btn--airene { color: var(--mp-airene-default); }

.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default); min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }

/* ── Cells ──────────────────────────────────────────────────────────────── */
.bom-muted { color: var(--mp-text-secondary); }
/* Name & description wrap to multiple lines (row auto-switches to top-aligned) */
.bom-name { white-space: normal; }
.bom-finished-good { white-space: normal; }
.bom-description { white-space: normal; }

.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

/* Kebab — 20px tall so the actions cell stays within the 40px text-only row */
.row-kebab {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-5, 20px);
  margin-left: auto; border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary);
}
.row-kebab svg { display: block; width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); }

/* Bulk bar action */
.bulk-action-btn {
  display: inline-flex; align-items: center; height: var(--mp-sizes-7, 28px);
  padding: 0 var(--mp-spacing-3); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md); background: var(--mp-background-neutral);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-critical); cursor: pointer;
}
.bulk-action-btn:hover { background: var(--mp-background-neutral-hovered); }

/* Empty state */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.empty-full-desc {
  margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.empty-full-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-3);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); cursor: pointer;
}
.empty-full-btn:hover { background: var(--mp-background-neutral-hovered); }

/* Demo scenario FAB */
.demo-fab {
  position: fixed; right: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse, #080d0e); color: #fff;
  cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2);
}
.demo-fab:hover { opacity: 0.9; }
.demo-fab-heading {
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
</style>
