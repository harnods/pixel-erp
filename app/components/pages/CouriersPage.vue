<script setup lang="ts">
/**
 * Couriers — WMS master data: the list of courier/shipping services available
 * when handing over a shipment. A simple named-entity list (add/edit/delete),
 * mirroring the ErpTablePage index-page shell used across the app.
 */
import {
  MpFormControl, MpFormLabel, MpInput,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import { couriers, addCourier, updateCourier, deleteCourier, type Courier } from '~/data/couriers'

// ─── Columns ───────────────────────────────────────────────────────────────────
const columns: TableColumn[] = [
  { key: 'name', label: 'Courier name', width: '320px', sortable: true, sortType: 'text' },
]
const allCols: TableColumn[] = [...columns, { key: 'lastUpdated', label: 'Last updated', width: '200px' }]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allCols.map(c => [c.key, c.key !== 'lastUpdated'])))
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => allCols.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }
function luFor(c: Courier) {
  return c.updatedAt ? { at: c.updatedAt, by: c.updatedBy } : lastUpdatedFor(c.id)
}

// ─── Rows / table state — alphabetical by name by default ──────────────────────
const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, setSort,
} = useTableState<Courier>(computed(() => couriers), {
  perPage: 25,
  filterFn: (row, s) => !s || row.name.toLowerCase().includes(s),
})
sortKey.value = 'name'
sortDir.value = 'asc'

const hasActiveFilter = computed(() => !!search.value)
function clearFilters() { search.value = '' }

// ─── Add / edit modal ────────────────────────────────────────────────────────
const editOpen = ref(false)
const editingId = ref<string | null>(null)
const editName = ref('')
const isSaving = ref(false)
const isEdit = computed(() => !!editingId.value)

function openAdd() {
  editingId.value = null
  editName.value = ''
  editOpen.value = true
}
function openEdit(c: Courier) {
  editingId.value = c.id
  editName.value = c.name
  editOpen.value = true
}
async function saveEdit() {
  if (!editName.value.trim()) {
    toast.notify({ variant: 'error', title: 'Courier name is required' })
    return
  }
  isSaving.value = true
  await new Promise(r => setTimeout(r, 400))
  if (isEdit.value && editingId.value) {
    updateCourier(editingId.value, editName.value)
    toast.notify({ variant: 'success', title: 'Courier updated' })
  } else {
    addCourier(editName.value)
    toast.notify({ variant: 'success', title: 'Courier added' })
  }
  isSaving.value = false
  editOpen.value = false
}

// ─── Delete confirmation ────────────────────────────────────────────────────────
const isDeleteModalOpen = ref(false)
const courierToDelete = ref<Courier | null>(null)
function openDeleteModal(c: Courier) {
  courierToDelete.value = c
  isDeleteModalOpen.value = true
}
function confirmDelete() {
  if (courierToDelete.value) {
    deleteCourier(courierToDelete.value.id)
    toast.notify({ variant: 'success', title: 'Courier deleted' })
  }
  courierToDelete.value = null
}
</script>

<template>
  <ErpTablePage
    :columns="visibleColumns"
    :rows="(paginated as unknown as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :has-active-filter="hasActiveFilter"
    bulk-label="courier"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left" />
      <div class="filter-right">
        <div class="filter-btn-group">
          <ColumnSettingsMenu id="courier-columns" :items="columnItems" :visibility="columnVisibility" />
        </div>
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" placeholder="Search..." />
        </div>
        <button class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="openAdd">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Add courier
        </button>
      </div>
    </template>

    <!-- ── Last updated ── -->
    <template #cell-lastUpdated="{ row }">
      <LastUpdatedCell v-bind="luFor(row as unknown as Courier)" />
    </template>

    <!-- ── Actions kebab (sticky right) ── -->
    <template #actions="{ row }">
      <MpPopover :id="`courier-actions-${(row as unknown as Courier).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" aria-label="More actions">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '140px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="openEdit(row as unknown as Courier)">Edit</MpPopoverListItem>
            <MpPopoverListItem @click="openDeleteModal(row as unknown as Courier)">Delete</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state (first run) ── -->
    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">No couriers</p>
        <p class="empty-full-desc">Couriers you add will appear here.</p>
        <button class="empty-full-btn" @click="openAdd">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          Add courier
        </button>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Add / edit modal ──
       Custom Teleport overlay, not MpModal — same fix as ConfirmModal.vue (MpModal
       renders with no structural CSS in this Pixel3 build: content flows inline
       instead of as a dimmed, centered dialog). -->
  <Teleport to="body">
    <Transition name="cem">
      <div v-if="editOpen" class="cem-overlay" @click.self="editOpen = false">
        <div class="cem-panel" role="dialog" aria-modal="true" :aria-label="isEdit ? 'Edit courier' : 'Add courier'">
          <p class="cem-title">{{ isEdit ? 'Edit courier' : 'Add courier' }}</p>
          <MpFormControl id="courier-edit-name" class="cem-form">
            <MpFormLabel>Courier name</MpFormLabel>
            <MpInput id="courier-edit-name-input" v-model="editName" is-full-width placeholder="e.g. JNE REG" />
          </MpFormControl>
          <div class="cem-footer">
            <button class="btn-enterprise btn-enterprise--ghost" @click="editOpen = false">Cancel</button>
            <button class="btn-enterprise btn-enterprise--primary" :disabled="isSaving" @click="saveEdit">
              {{ isSaving ? 'Saving…' : (isEdit ? 'Save changes' : 'Save') }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>

  <!-- ── Delete confirmation ── -->
  <ConfirmModal
    v-model:is-open="isDeleteModalOpen"
    title="Delete courier?"
    :description="`${courierToDelete?.name ?? ''} will be removed from courier master data.`"
    confirm-label="Delete"
    @confirm="confirmDelete"
  />
</template>

<style scoped>
.filter-left { flex: 1 1 auto; }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.filter-btn-group { display: flex; align-items: center; gap: var(--mp-spacing-2); }

.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default); min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }

.row-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  border: none; background: none; cursor: pointer; border-radius: var(--mp-radii-sm);
  color: var(--mp-icon-default, var(--mp-text-secondary));
}
.row-kebab:hover { background: var(--mp-background-neutral-hovered); }

.cem-enter-active, .cem-leave-active { transition: opacity 200ms ease; }
.cem-enter-from, .cem-leave-to { opacity: 0; }
.cem-enter-active .cem-panel, .cem-leave-active .cem-panel { transition: transform 200ms ease, opacity 200ms ease; }
.cem-enter-from .cem-panel, .cem-leave-to .cem-panel { transform: scale(0.96); opacity: 0; }

.cem-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: rgba(8, 13, 14, 0.45);
  display: flex; align-items: center; justify-content: center;
}
.cem-panel {
  width: min(440px, calc(100% - 32px));
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 12px);
  padding: var(--mp-spacing-5) var(--mp-spacing-5) var(--mp-spacing-4);
}
.cem-title {
  margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.cem-form { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cem-footer {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-5);
}

.empty-full {
  display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-10, 40px) 0;
}
.empty-illustration { width: 288px; height: 240px; object-fit: contain; margin-bottom: var(--mp-spacing-1); }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.empty-full-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral); color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer;
}
.empty-full-btn:hover { background: var(--mp-background-neutral-hovered); }
</style>
