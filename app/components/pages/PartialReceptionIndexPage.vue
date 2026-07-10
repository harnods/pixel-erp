<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted } from 'vue'
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import { useTableState } from '~/composables/useTableState'
import { receiptsForStage, closeReceipt, type Receipt } from '~/data/receipts'
import { warehouses } from '~/data/warehouses'

const toggleAirene = inject<() => void>('toggleAirene')

// ─── Demo scenario state (FAB) ─────────────────────────────────────────────────
type DemoState = 'empty' | 'data'
const demoState = ref<DemoState>('data')
const demoStates: { value: DemoState; label: string }[] = [
  { value: 'data', label: 'With data' },
  { value: 'empty', label: 'Empty state' },
]
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })
function setDemoState(s: DemoState) {
  demoState.value = s
  if (s === 'data') {
    loading.value = true
    setTimeout(() => { loading.value = false }, 1200)
  }
}

// ─── Columns ───────────────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'purchaseNo',    label: 'Purchase no.',  width: '260px', sortType: 'text' },
  { key: 'warehouseName', label: 'Warehouse',     width: '180px', sortType: 'text' },
  { key: 'skuQty',        label: 'SKU qty',       width: '90px',  align: 'right', sortType: 'number' },
  { key: 'purchaseQty',   label: 'Purchase qty',  width: '120px', align: 'right', sortType: 'number' },
  { key: 'receivedQty',   label: 'Received',      width: '110px', align: 'right', sortType: 'number' },
]
// Column show/hide — first column stays on; the sort menu's "Hide column" flips
// these off, the ColumnSettings menu turns them back on.
const colVis = reactive<Record<string, boolean>>(Object.fromEntries(columns.map(c => [c.key, true])))
const visibleColumns = computed(() => columns.filter(c => colVis[c.key]))
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
function hideColumn(key: string) { colVis[key] = false }

// ─── Scenario scoping (Ops = assigned warehouse(s)) ────────────────────────────
const { assignedWarehouses } = useWarehouseContext()
const scopedWarehouseIds = computed(() => assignedWarehouses.value.map(w => w.id))
const isScoped = computed(() => scopedWarehouseIds.value.length > 0)

// ─── Filters ───────────────────────────────────────────────────────────────────
const warehouseFilter = ref('')
const warehouseOptions = computed(() => {
  const src = isScoped.value
    ? warehouses.filter(w => scopedWarehouseIds.value.includes(w.id))
    : warehouses.filter(w => !w.isDefault && w.status === 'active')
  return src.map(w => ({ label: w.name, value: w.id }))
})
const warehouseLabel = computed(() => warehouseOptions.value.find(o => o.value === warehouseFilter.value)?.label ?? '')

// ─── Table state ─────────────────────────────────────────────────────────────
// This stage = POs whose receiving was closed but didn't reach the full qty.
const scopedReceipts = computed<Receipt[]>(() =>
  receiptsForStage('Partial reception', isScoped.value ? scopedWarehouseIds.value : undefined),
)
const rows = computed<Receipt[]>(() => (demoState.value === 'data' ? scopedReceipts.value : []))

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<Receipt>(rows, {
  perPage: 25,
  filterFn: (row, s) => {
    const matchesSearch = !s
      || row.purchaseNo.toLowerCase().includes(s)
      || row.warehouseName.toLowerCase().includes(s)
    const matchesWarehouse = !warehouseFilter.value || row.warehouseId === warehouseFilter.value
    return matchesSearch && matchesWarehouse
  },
})
watch(warehouseFilter, () => setPage(1))

const hasActiveFilter = computed(() => !!search.value || !!warehouseFilter.value)
function clearFilters() { search.value = ''; warehouseFilter.value = '' }

// ─── Formatters ────────────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }
function outstanding(r: Receipt) { return Math.max(0, r.purchaseQty - r.receivedQty) }

// ─── Row actions ─────────────────────────────────────────────────────────────
const router = useRouter()
function createPurchaseReceiving(row: Receipt) { router.push(`/inbound-delivery/${row.id}/receive`) }
function viewDetails(row: Receipt) { router.push(`/inbound-delivery/${row.id}`) }

const closeModalOpen = ref(false)
const receiptToClose = ref<Receipt | null>(null)
function openCloseModal(row: Receipt) { receiptToClose.value = row; closeModalOpen.value = true }
function closeCloseModal() { closeModalOpen.value = false; receiptToClose.value = null }
// Close finalizes the PO — it moves to Completed as a completed-but-partial PO.
function confirmClose() {
  if (receiptToClose.value) closeReceipt(receiptToClose.value.id)
  closeCloseModal()
}

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
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <MpPopover v-if="!isScoped" id="par-wh-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="par-wh-select" placeholder="Warehouse" :model-value="warehouseFilter" is-clearable
              :class="css({ width: '180px' })" @mousedown.prevent @clear="warehouseFilter = ''"
            >
              <option v-if="warehouseFilter" :value="warehouseFilter">{{ warehouseLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in warehouseOptions" :key="opt.value"
                :is-active="opt.value === warehouseFilter" @click="warehouseFilter = opt.value"
              >{{ opt.label }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <MpTooltip id="tt-par-airene" label="Ask Airene" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <ColumnSettingsMenu id="par-col-settings" :items="columnItems" :visibility="colVis" />
          <MpTooltip id="tt-par-export" label="Export" placement="bottom" use-portal>
            <button class="filter-icon-btn" aria-label="Export"><MpIcon name="download" size="md" /></button>
          </MpTooltip>
        </div>
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" placeholder="Search..." />
        </div>
      </div>
    </template>

    <!-- ── Cell: Purchase no. — memo + View details chip on hover ── -->
    <template #cell-purchaseNo="{ value, row }">
      <div class="cell-with-action">
        <span class="rcv-po">
          <span class="cell-text rcv-po__no">{{ value }}</span>
          <span v-if="(row as unknown as Receipt).memo" class="rcv-po__memo">{{ (row as unknown as Receipt).memo }}</span>
        </span>
        <button class="row-hover-btn" @click.stop="viewDetails(row as unknown as Receipt)">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="row-hover-btn__label">VIEW DETAILS</span>
        </button>
      </div>
    </template>

    <!-- ── Warehouse — wrap to 2 lines ── -->
    <template #cell-warehouseName="{ value }">
      <span class="rcv-warehouse">{{ value }}</span>
    </template>

    <!-- ── Numeric cells ── -->
    <template #cell-skuQty="{ value }">{{ formatNum(value as number) }}</template>
    <template #cell-purchaseQty="{ value }">{{ formatNum(value as number) }}</template>
    <template #cell-receivedQty="{ value }">{{ formatNum(value as number) }}</template>

    <!-- ── Actions kebab ── -->
    <template #actions="{ row }">
      <MpPopover :id="`par-actions-${row.id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" aria-label="More actions">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '190px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails(row as unknown as Receipt)">View details</MpPopoverListItem>
            <MpPopoverListItem @click="createPurchaseReceiving(row as unknown as Receipt)">Purchase receiving</MpPopoverListItem>
            <MpPopoverListItem
              :class="css({ color: 'var(--mp-text-critical)' })"
              @click="openCloseModal(row as unknown as Receipt)"
            >Close</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">No partial receptions</p>
        <p class="empty-full-desc">Purchase orders received short of their full quantity will appear here.</p>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Close confirmation modal ── -->
  <MpModal
    id="par-close-modal" :is-open="closeModalOpen" size="md"
    is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="closeCloseModal"
  >
    <MpModalContent>
      <MpModalHeader>Close {{ receiptToClose?.purchaseNo }}?<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <template v-if="receiptToClose">
          Only {{ formatNum(receiptToClose.receivedQty) }} of {{ formatNum(receiptToClose.purchaseQty) }} units were received.
          Closing accepts this as final — the remaining {{ formatNum(outstanding(receiptToClose)) }} units will not be received.
        </template>
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--secondary" @click="closeCloseModal">Keep open</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmClose">Close order</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>


  <!-- ── Demo scenario FAB ── -->
  <MpPopover id="par-demo-fab" is-close-on-select use-portal placement="top-end">
    <MpPopoverTrigger>
      <button class="demo-fab" aria-label="Change scenario state"><MpIcon name="sliders" size="md" color="icon.inverse" /></button>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
      <p class="demo-fab-heading">Scenario state</p>
      <MpPopoverList>
        <MpPopoverListItem
          v-for="s in demoStates" :key="s.value"
          :is-active="s.value === demoState" @click="setDemoState(s.value)"
        >{{ s.label }}</MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-btn-group { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.filter-icon-btn {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-secondary); padding: var(--mp-spacing-2);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-icon-btn--airene { color: var(--mp-airene-default); }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 200px;
}
.filter-search-input {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md);
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }

/* Purchase no. cell — number + memo subtitle, View details chip on hover */
.cell-with-action { position: relative; display: flex; align-items: center; }
.rcv-po { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.rcv-po__no { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rcv-po__memo { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.row-hover-btn {
  position: absolute; right: 0; top: 50%; transform: translateY(-50%); display: none;
  align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1; color: var(--mp-text-secondary);
}
.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase;
}
:global(.erp-tr:hover .row-hover-btn) { display: flex; }

.rcv-warehouse {
  white-space: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden;
}
.par-outstanding { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-warning, var(--mp-text-default)); }

.row-kebab {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-5, 20px); margin-left: auto;
  border: none; background: none; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-secondary);
}
.row-kebab svg { display: block; width: var(--mp-sizes-5, 20px); height: var(--mp-sizes-5, 20px); }
.row-kebab:hover { background: var(--mp-background-neutral-hovered); }

.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

.demo-fab {
  position: fixed; right: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse, #080d0e); color: #fff; cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2);
}
.demo-fab:hover { opacity: 0.9; }
.demo-fab-heading { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
