<!-- prod-parity: jurnal-non-core-feature-frontend/src/modules/payment-methods/views/PaymentMethodListView.vue + components/PaymentMethodFormModal.vue -->
<script setup lang="ts">
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpButton, MpIcon,
  MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import {
  paymentMethods, addPaymentMethod, renamePaymentMethod, deletePaymentMethods,
  canChangePaymentMethod, paymentMethodNameTaken, PAYMENT_METHOD_NAME_MAX_LENGTH, type PaymentMethod,
} from '~/data/paymentMethods'
import { successToast } from '~/utils/toasts'

const { t } = useLocale()

// ─── Columns ─────────────────────────────────────────────────────────────────
const allCols: TableColumn[] = [
  { key: 'name', label: t('Payment method'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'updatedAt', label: t('Last updated'), kind: 'date', sortable: true, sortType: 'date' },
]
const columnVisibility = reactive<Record<string, boolean>>({ name: true, updatedAt: true })
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed(() => allCols.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { if (key !== 'name') columnVisibility[key] = false }

// ─── Rows ────────────────────────────────────────────────────────────────────
const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, setSort,
} = useTableState<PaymentMethod>(computed(() => paymentMethods), {
  perPage: 25,
  filterFn: (row, s) => !s || row.name.toLowerCase().includes(s),
  defaultSort: { key: '', dir: 'asc' },
})
const hasActiveFilter = computed(() => !!search.value)
function clearFilters() { search.value = '' }

// ─── Create / edit modal ─────────────────────────────────────────────────────
const formOpen = ref(false)
const editTarget = ref<PaymentMethod | null>(null)
const formName = ref('')
const formError = ref('')
const isSaving = ref(false)

function openCreate() {
  editTarget.value = null
  formName.value = ''
  formError.value = ''
  formOpen.value = true
}
function openEdit(row: PaymentMethod) {
  editTarget.value = row
  formName.value = row.name
  formError.value = ''
  formOpen.value = true
}
// "+ New payment method" lives in the title bar ([...slug].vue) — it signals here.
const paymentMethodAddSignal = inject<Ref<number>>('paymentMethodAddSignal')
if (paymentMethodAddSignal) watch(paymentMethodAddSignal, () => openCreate())

async function submitForm() {
  const n = formName.value.trim()
  formError.value = ''
  if (!n) formError.value = t('Payment method name is required')
  else if (n.length > PAYMENT_METHOD_NAME_MAX_LENGTH) formError.value = t('Payment method name must be at most 60 characters')
  else if (/\p{Extended_Pictographic}/u.test(n)) formError.value = t('Payment method name must not contain emoji')
  else if (paymentMethodNameTaken(n, editTarget.value?.id)) formError.value = t('This payment method name already exists')
  if (formError.value) return
  isSaving.value = true
  await new Promise(r => setTimeout(r, 400))
  if (editTarget.value) renamePaymentMethod(editTarget.value.id, n)
  else addPaymentMethod(n)
  isSaving.value = false
  formOpen.value = false
  successToast(t('Payment method saved'))
}

// ─── Delete (single + bulk) ──────────────────────────────────────────────────
const deleteOpen = ref(false)
const deleteIds = ref<string[]>([])
let deselect: (() => void) | null = null
const deleteTitle = computed(() => deleteIds.value.length > 1 ? t('Delete payment methods') : t('Delete payment method'))
const deleteDescription = computed(() => {
  if (deleteIds.value.length > 1) return `${t('Are you sure you want to delete')} ${deleteIds.value.length} ${t('payment methods? This action cannot be undone.')}`
  const name = paymentMethods.find(m => m.id === deleteIds.value[0])?.name ?? ''
  return `${t('Are you sure you want to delete')} "${name}"? ${t('This action cannot be undone.')}`
})
function openSingleDelete(row: PaymentMethod) { deleteIds.value = [row.id]; deselect = null; deleteOpen.value = true }
function openBulkDelete(selected: Set<number>, deselectAll: () => void) {
  const rows = paginated.value as PaymentMethod[]
  deleteIds.value = [...selected].map(i => rows[i]).filter((r): r is PaymentMethod => !!r && canChangePaymentMethod(r)).map(r => r.id)
  deselect = deselectAll
  if (deleteIds.value.length) deleteOpen.value = true
}
function confirmDelete() {
  const n = deleteIds.value.length
  deletePaymentMethods(deleteIds.value)
  deselect?.()
  deleteIds.value = []
  successToast(n > 1 ? `${n} ${t('payment methods deleted successfully')}` : t('Payment method deleted successfully'))
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
    :search="search"
    has-checkbox
    :row-disabled="(r) => !canChangePaymentMethod(r as unknown as PaymentMethod)"
    bulk-label="payment method"
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
          <ColumnSettingsMenu id="payment-method-columns" :items="columnItems" :visibility="columnVisibility" />
        </div>
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
        </div>
      </div>
    </template>

    <!-- Prod's selection bar carries a Delete button beside the count. -->
    <template #bulk-actions="{ selectedRows, deselectAll }">
      <MpButton size="sm" variant="secondary" is-rounded @click="openBulkDelete(selectedRows as Set<number>, deselectAll as () => void)">{{ t('Delete') }}</MpButton>
    </template>

    <template #cell-updatedAt="{ row }">
      <LastUpdatedCell :at="(row as unknown as PaymentMethod).updatedAt" :by="(row as unknown as PaymentMethod).updatedBy" />
    </template>

    <!-- Used or cash-linked methods can't be edited or deleted: no kebab at all. -->
    <template #actions="{ row }">
      <MpPopover
        v-if="canChangePaymentMethod(row as unknown as PaymentMethod)"
        :id="`payment-method-actions-${(row as unknown as PaymentMethod).id}`"
        is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end"
      >
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Row actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '140px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="openEdit(row as unknown as PaymentMethod)">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openSingleDelete(row as unknown as PaymentMethod)">{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No payment methods yet') }}</p>
        <p class="empty-full-desc">{{ t('Payment methods you create will show up here.') }}</p>
        <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before empty-full-btn" @click="openCreate">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ t('New payment method') }}
        </button>
      </div>
    </template>
  </ErpTablePage>

  <!-- ── Create / edit payment method ── -->
  <Teleport to="body">
    <Transition name="pmm">
      <div v-if="formOpen" class="pmm-overlay">
        <div class="pmm-panel" role="dialog" aria-modal="true" :aria-label="editTarget ? t('Edit payment method') : t('New payment method')">
          <header class="pmm-header">
            <span class="pmm-title">{{ editTarget ? t('Edit payment method') : t('New payment method') }}</span>
            <MpButton class="pmm-close" is-rounded :aria-label="t('Close')" @click="formOpen = false">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>
          <div class="pmm-body">
            <MpFormControl id="pmm-name" is-required :is-invalid="!!formError">
              <div class="pmm-label-row">
                <MpFormLabel>{{ t('Payment method name') }}</MpFormLabel>
                <span class="pmm-counter">{{ formName.length }}/{{ PAYMENT_METHOD_NAME_MAX_LENGTH }}</span>
              </div>
              <MpInput id="pmm-name-input" v-model="formName" :maxlength="PAYMENT_METHOD_NAME_MAX_LENGTH" is-full-width @keyup.enter="submitForm" @update:model-value="formError = ''" />
              <MpFormErrorMessage>{{ formError }}</MpFormErrorMessage>
            </MpFormControl>
          </div>
          <footer class="pmm-footer">
            <button class="btn-enterprise btn-enterprise--ghost" @click="formOpen = false">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" @click="submitForm">{{ isSaving ? t('Saving…') : t('Save') }}</button>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>

  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="deleteTitle"
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

.empty-full { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; margin-bottom: var(--mp-spacing-1); }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.empty-full-btn { margin-top: var(--mp-spacing-2); }

.pmm-enter-active, .pmm-leave-active { transition: opacity 200ms ease; }
.pmm-enter-from, .pmm-leave-to { opacity: 0; }
.pmm-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: var(--mp-colors-background-overlay, rgba(8, 13, 14, 0.45));
  display: flex; align-items: center; justify-content: center;
}
.pmm-panel { width: min(480px, calc(100% - 32px)); display: flex; flex-direction: column; background: var(--mp-background-stage); border-radius: var(--mp-radii-lg, 12px); overflow: hidden; }
.pmm-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-5);
  border-bottom: 1px solid var(--mp-border-default);
}
.pmm-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pmm-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; color: var(--mp-colors-icon-default);
}
.pmm-body { padding: var(--mp-spacing-5); }
.pmm-label-row { display: flex; align-items: center; justify-content: space-between; }
.pmm-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.pmm-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4) var(--mp-spacing-5); border-top: 1px solid var(--mp-border-default); }
</style>
