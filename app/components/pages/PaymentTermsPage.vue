<!-- prod-parity: jurnal-non-core-feature-frontend/src/modules/payment-terms/views/PaymentTermListView.vue -->
<script setup lang="ts">
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpButton, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import {
  paymentTerms, deletePaymentTerms, canDeletePaymentTerm, type PaymentTerm,
} from '~/data/paymentTerms'
import { successToast } from '~/utils/toasts'

const { t } = useLocale()
const router = useRouter()

// ─── Columns ─────────────────────────────────────────────────────────────────
const allCols: TableColumn[] = [
  { key: 'name', label: t('Name'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'days', label: t('Due date'), kind: 'number', sortable: true, sortType: 'number' },
]
const columnVisibility = reactive<Record<string, boolean>>({ name: true, days: true })
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed(() => allCols.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { if (key !== 'name') columnVisibility[key] = false }

// ─── Rows ────────────────────────────────────────────────────────────────────
const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, setSort,
} = useTableState<PaymentTerm>(computed(() => paymentTerms), {
  perPage: 25,
  filterFn: (row, s) => !s || row.name.toLowerCase().includes(s),
  defaultSort: { key: '', dir: 'asc' },
})
const hasActiveFilter = computed(() => !!search.value)
function clearFilters() { search.value = '' }

function lengthLabel(days: number): string { return `${days} ${t('days')}` }

// ─── Delete ──────────────────────────────────────────────────────────────────
const deleteOpen = ref(false)
const deleteTarget = ref<PaymentTerm | null>(null)
const deleteDescription = computed(() =>
  `${t('Are you sure you want to delete')} "${deleteTarget.value?.name ?? ''}"? ${t('This action cannot be undone.')}`)
function openDelete(row: PaymentTerm) { deleteTarget.value = row; deleteOpen.value = true }
function confirmDelete() {
  if (!deleteTarget.value) return
  deletePaymentTerms([deleteTarget.value.id])
  deleteTarget.value = null
  successToast(t('Payment term deleted successfully'))
}

function goToCreate() { router.push('/payment-terms/new') }
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
    :search="search"
    bulk-label="payment term"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <template #filters>
      <div class="filter-left" />
      <div class="filter-right">
        <div class="filter-btn-group">
          <ColumnSettingsMenu id="payment-term-columns" :items="columnItems" :visibility="columnVisibility" />
        </div>
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
        </div>
      </div>
    </template>

    <template #cell-name="{ row }"><span class="cell-truncate" :title="(row as unknown as PaymentTerm).name">{{ (row as unknown as PaymentTerm).name }}</span></template>
    <template #cell-days="{ row }">
      {{ lengthLabel((row as unknown as PaymentTerm).days) }}
    </template>

    <!-- Delete is the only row action, so a term that can't be deleted (used,
         default or built-in) gets no kebab at all rather than a dead menu. -->
    <template #actions="{ row }">
      <MpPopover
        v-if="canDeletePaymentTerm(row as unknown as PaymentTerm)"
        :id="`payment-term-actions-${(row as unknown as PaymentTerm).id}`"
        is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end"
      >
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Row actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '140px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="openDelete(row as unknown as PaymentTerm)">{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No payment terms yet') }}</p>
        <p class="empty-full-desc">{{ t('Payment terms you create will show up here.') }}</p>
        <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before empty-full-btn" @click="goToCreate">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ t('New payment term') }}
        </button>
      </div>
    </template>
  </ErpTablePage>

  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete payment term')"
    :description="deleteDescription"
    :confirm-label="t('Delete')"
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

.empty-full {
  display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-10, 40px) 0;
}
.empty-illustration { width: 288px; height: 240px; object-fit: contain; margin-bottom: var(--mp-spacing-1); }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.empty-full-btn { margin-top: var(--mp-spacing-2); }
.cell-truncate { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
