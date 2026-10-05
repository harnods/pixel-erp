<!-- prod-parity: quickbook/app/javascript/app/views/attachments/Attachments.jsx (mounted by quickbook/app/views/attachments/index.html.haml; modals per _modal_form*.html.haml) -->
<script setup lang="ts">
/**
 * Other lists → File manager (prod "File Attachments"). Columns: Name ·
 * Transaction · Transaction Type · Created Time; row "Select Action" menu
 * (Download, Assign to Transaction, Create New Transaction, Edit Transaction
 * Type); bulk Delete / Create New Transaction; "Add Attachment" in the title bar.
 */
import { type Ref } from 'vue'
import {
  MpButton, MpButtonGroup, MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { formatDate } from '~/utils/date'
import { infoToast, successToast } from '~/utils/toasts'
import {
  fileAttachments, ASSIGNABLE_TRANSACTIONS, OTHER_LIST_TRANSACTION_TYPES,
  type FileAttachment, type OtherListTransactionType,
} from '~/data/otherLists'

const { t } = useLocale()

const { search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, setSort } = useTableState<FileAttachment>(
  computed(() => fileAttachments),
  {
    perPage: 25,
    filterFn: (row, s) => !s || [row.fileName, row.transaction ?? '', row.transactionType ?? ''].join(' ').toLowerCase().includes(s),
    defaultSort: { key: 'createdAt', dir: 'desc' },
  },
)

const columns: TableColumn[] = [
  { key: 'fileName', label: t('Name'), kind: 'address', sortable: true, sortType: 'text' },
  { key: 'transaction', label: t('Transaction'), kind: 'number', sortable: true, sortType: 'text' },
  { key: 'transactionType', label: t('Transaction Type'), sortable: true, sortType: 'text' },
  { key: 'createdAt', label: t('Created Time'), kind: 'date', sortable: true, sortType: 'date' },
]
const hasActiveFilter = computed(() => !!search.value)
function clearFilters() { search.value = '' }

const typeOptions = OTHER_LIST_TRANSACTION_TYPES.map((v) => ({ value: v, label: t(v) }))
const transactionOptions = ASSIGNABLE_TRANSACTIONS.map((v) => ({ value: v, label: v }))

function download() { infoToast(t('Not in this prototype')) }

// ── Assign to Transaction ──
const assignOpen = ref(false)
const assignTarget = ref<FileAttachment | null>(null)
const assignValue = ref('')
const assignError = ref(false)
function openAssign(f: FileAttachment) { assignTarget.value = f; assignValue.value = ''; assignError.value = false; assignOpen.value = true }
function saveAssign() {
  if (!assignValue.value) { assignError.value = true; return }
  const f = fileAttachments.find((x) => x.id === assignTarget.value?.id)
  if (f) {
    f.transaction = assignValue.value
    const prefix = assignValue.value.replace(/ #.*/, '').toLowerCase()
    const type = OTHER_LIST_TRANSACTION_TYPES.find((tt) => tt.toLowerCase() === prefix)
    if (type) f.transactionType = type
  }
  successToast(t('Attachment assigned'))
  assignOpen.value = false
}

// ── Edit Transaction Type ──
const typeOpen = ref(false)
const typeTarget = ref<FileAttachment | null>(null)
const typeValue = ref('')
function openEditType(f: FileAttachment) { typeTarget.value = f; typeValue.value = f.transactionType ?? ''; typeOpen.value = true }
function saveType() {
  const f = fileAttachments.find((x) => x.id === typeTarget.value?.id)
  if (f) f.transactionType = (typeValue.value || null) as OtherListTransactionType | null
  successToast(t('Transaction type saved'))
  typeOpen.value = false
}

// ── Create New Transaction (single + bulk; max 5 attachments) ──
const newOpen = ref(false)
const newType = ref<string>('Sales invoice')
const newCount = ref(1)
function openNew(count: number, type?: string | null) { newCount.value = count; newType.value = type ?? 'Sales invoice'; newOpen.value = true }
function createNew() { newOpen.value = false; infoToast(t('Not in this prototype')) }

// ── Delete (row action; the bulk bar carries no Delete — rule/bulk-actions-no-delete) ──
const deleteOpen = ref(false)
const pendingDelete = ref<FileAttachment | null>(null)
function askDeleteOne(f: FileAttachment) { pendingDelete.value = f; deleteOpen.value = true }
function confirmDelete() {
  const i = fileAttachments.findIndex((x) => x.id === pendingDelete.value?.id)
  if (i >= 0) fileAttachments.splice(i, 1)
  successToast(t('Attachment deleted'))
  pendingDelete.value = null
}

// ── Add Attachment (title bar) ──
const addOpen = ref(false)
const addType = ref('')
const addError = ref(false)
const addSignal = inject<Ref<number>>('fileManagerAddSignal', ref(0))
watch(addSignal, () => { addType.value = ''; addError.value = false; addOpen.value = true })
function chooseFiles() { infoToast(t('Not in this prototype')) }
function saveAdd() { addError.value = true }
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
    :has-active-filter="hasActiveFilter"
    has-checkbox
    bulk-label="attachment"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort-change="setSort"
    @clear-filters="clearFilters"
  >
    <template #bulk-actions="{ selectedRows }">
      <MpPopover id="fm-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
        <MpPopoverTrigger>
          <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="openNew((selectedRows as Set<number>).size)">{{ t('Create New Transaction') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #filters>
      <div class="filter-left" />
      <div class="filter-right">
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" :aria-label="t('Search')" />
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <MpIcon name="close" size="sm" />
          </button>
        </div>
      </div>
    </template>

    <template #cell-fileName="{ row }">
      <span class="fm-file">
        <MpIcon name="attachment" size="sm" />
        <span class="cell-link fm-name" @click.stop="download">{{ (row as unknown as FileAttachment).fileName }}</span>
      </span>
    </template>
    <template #cell-transaction="{ value }">
      <span v-if="value" class="cell-link cell-text">{{ value }}</span>
      <span v-else>-</span>
    </template>
    <template #cell-transactionType="{ value }">{{ value ? t(value as string) : '-' }}</template>
    <template #cell-createdAt="{ value }">{{ formatDate(value as string) }}</template>

    <template #actions="{ row }">
      <MpPopover :id="`fm-actions-${(row as unknown as FileAttachment).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Select Action')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="download">{{ t('Download') }}</MpPopoverListItem>
            <template v-if="!(row as unknown as FileAttachment).transaction">
              <MpPopoverListItem @click="openAssign(row as unknown as FileAttachment)">{{ t('Assign to Transaction') }}</MpPopoverListItem>
              <MpPopoverListItem @click="openNew(1, (row as unknown as FileAttachment).transactionType)">{{ t('Create New Transaction') }}</MpPopoverListItem>
              <MpPopoverListItem @click="openEditType(row as unknown as FileAttachment)">{{ t('Edit Transaction Type') }}</MpPopoverListItem>
            </template>
            <MpPopoverListItem @click="askDeleteOne(row as unknown as FileAttachment)">{{ t('Delete Attachment') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No attachments') }}</p>
        <p class="empty-full-desc">{{ t('Attachments you add will appear here.') }}</p>
      </div>
    </template>
  </ErpTablePage>

  <!-- Add Attachment -->
  <MpModal id="fm-add" :is-open="addOpen" size="md" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="addOpen = false">
    <MpModalContent>
      <MpModalHeader>{{ t('Add Attachment') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <div class="fm-form">
          <div class="fm-field">
            <span class="fm-label">{{ t('Upload File') }}</span>
            <div><MpButton variant="secondary" is-rounded @click="chooseFiles">{{ t('+ Add File') }}</MpButton></div>
            <p class="fm-help">{{ t('File size must be less than 25 MB') }}</p>
            <p v-if="addError" class="fm-error">{{ t('Choose at least one file to upload.') }}</p>
          </div>
          <div class="fm-field">
            <span class="fm-label">{{ t('Transaction Type') }}</span>
            <ErpFilterSelect id="fm-add-type" v-model="addType" :placeholder="t('Select transaction type')" :options="typeOptions" width="100%" />
          </div>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="addOpen = false">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="saveAdd">{{ t('Save') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- Assign to Transaction -->
  <MpModal id="fm-assign" :is-open="assignOpen" size="md" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="assignOpen = false">
    <MpModalContent>
      <MpModalHeader>{{ t('Assign to Transaction') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <div class="fm-field">
          <span class="fm-label">{{ t('Transaction') }}</span>
          <ErpFilterSelect id="fm-assign-tx" v-model="assignValue" :placeholder="t('Select transaction')" :options="transactionOptions" width="100%" @update:model-value="assignError = false" />
          <p v-if="assignError" class="fm-error">{{ t('Select a transaction to assign this attachment to.') }}</p>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="assignOpen = false">{{ t('Close') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="saveAssign">{{ t('Save') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- Edit Transaction Type -->
  <MpModal id="fm-edit-type" :is-open="typeOpen" size="md" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="typeOpen = false">
    <MpModalContent>
      <MpModalHeader>{{ t('Edit Transaction Type') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <div class="fm-field">
          <span class="fm-label">{{ t('Transaction Type') }}</span>
          <ErpFilterSelect id="fm-type" v-model="typeValue" :placeholder="t('Select transaction type')" :options="typeOptions" width="100%" />
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="typeOpen = false">{{ t('Close') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="saveType">{{ t('Save') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- Create New Transaction -->
  <MpModal id="fm-new" :is-open="newOpen" size="md" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="newOpen = false">
    <MpModalContent>
      <MpModalHeader>{{ t('Create New Transaction') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        <div class="fm-form">
          <p v-if="newCount > 5" class="fm-error">{{ t('You can only assign up to 5 attachments to new transaction.') }}</p>
          <div class="fm-field">
            <span class="fm-label">{{ t('What transaction would you like to create?') }}</span>
            <ErpFilterSelect id="fm-new-type" :model-value="newType" :placeholder="t('Select transaction type')" :options="typeOptions" :is-clearable="false" width="100%" @update:model-value="newType = $event || newType" />
          </div>
        </div>
      </MpModalBody>
      <MpModalFooter>
        <MpButtonGroup class="erp-action-footer">
          <MpButton variant="ghost" is-rounded @click="newOpen = false">{{ t('Cancel') }}</MpButton>
          <MpButton variant="primary" is-rounded @click="createNew">{{ t('Create') }}</MpButton>
        </MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete attachment?')"
    :description="t('Are you sure you want to delete?')"
    :confirm-label="t('Delete attachment')"
    @confirm="confirmDelete"
  />
</template>

<style scoped>
.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); flex: 1 1 auto; }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: var(--filter-search-w, 248px);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent; min-width: 0;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default);
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn { display: inline-flex; border: none; background: none; padding: 0; cursor: pointer; color: var(--mp-text-subtle); }

.fm-file { display: inline-flex; align-items: flex-start; gap: var(--mp-spacing-2); min-width: 0; color: var(--mp-colors-icon-default); }
.fm-name { white-space: normal; overflow-wrap: anywhere; }

.fm-form { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.fm-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.fm-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.fm-help { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.fm-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }

.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: var(--mp-spacing-0\.5) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
