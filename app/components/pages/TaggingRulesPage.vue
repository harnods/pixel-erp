<!-- prod-parity: jurnal-non-core-feature-frontend/src/modules/tagging-rules/views/TaggingRuleListView.vue -->
<script setup lang="ts">
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpButton, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import {
  taggingRules, deleteTaggingRule, taggingTransactionTypeLabel, TAGGING_TRANSACTION_TYPES, TAG_TYPE_LABEL,
  type TaggingRule,
} from '~/data/taggingRules'
import { successToast } from '~/utils/toasts'

const { t } = useLocale()
const router = useRouter()

const allCols: TableColumn[] = [
  { key: 'name', label: t('Name'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'transactionTypeId', label: t('Transaction type'), kind: 'default' },
  { key: 'tagType', label: t('Tagging type'), kind: 'default' },
]
const columnVisibility = reactive<Record<string, boolean>>({ name: true, transactionTypeId: true, tagType: true })
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed(() => allCols.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { if (key !== 'name') columnVisibility[key] = false }

// Transaction type quick filter — options grouped Sales then Purchase, as prod.
const typeFilter = ref('')
const typeOptions = TAGGING_TRANSACTION_TYPES.map(o => ({ value: String(o.id), label: o.label }))

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, setSort,
} = useTableState<TaggingRule>(computed(() =>
  taggingRules.filter(r => !typeFilter.value || String(r.transactionTypeId) === typeFilter.value)), {
  perPage: 25,
  filterFn: (row, s) => !s || row.name.toLowerCase().includes(s),
  defaultSort: { key: '', dir: 'asc' },
})
const hasActiveFilter = computed(() => !!search.value || !!typeFilter.value)
function clearFilters() { search.value = ''; typeFilter.value = '' }
const asRule = (r: unknown) => r as TaggingRule

const deleteOpen = ref(false)
const deleteTarget = ref<TaggingRule | null>(null)
const deleteDescription = computed(() =>
  `${t('Are you sure you want to delete')} "${deleteTarget.value?.name ?? ''}"? ${t('This action cannot be undone.')}`)
function openDelete(r: TaggingRule) { deleteTarget.value = r; deleteOpen.value = true }
function confirmDelete() {
  if (deleteTarget.value) deleteTaggingRule(deleteTarget.value.id)
  deleteTarget.value = null
  successToast(t('Successfully deleted'))
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
    filter-empty-label="tagging rules"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <template #filters>
      <div class="filter-left">
        <ErpFilterSelect id="tagging-rule-type-filter" v-model="typeFilter" placeholder="Transaction type" :options="typeOptions" width="200px" />
      </div>
      <div class="filter-right">
        <div class="filter-btn-group">
          <ColumnSettingsMenu id="tagging-rule-columns" :items="columnItems" :visibility="columnVisibility" />
        </div>
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
        </div>
      </div>
    </template>

    <!-- Name is a plain label in prod — only the Edit action navigates. -->
    <template #cell-transactionTypeId="{ row }">{{ t(taggingTransactionTypeLabel(asRule(row).transactionTypeId)) }}</template>
    <template #cell-tagType="{ row }">{{ t(TAG_TYPE_LABEL[asRule(row).tagType]) }}</template>

    <template #actions="{ row }">
      <MpPopover :id="`tagging-rule-actions-${asRule(row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Action')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '140px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="router.push(`/tagging-rules/${asRule(row).id}/edit`)">{{ t('Edit rule') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openDelete(asRule(row))">{{ t('Delete rule') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('You have no tagging rules yet') }}</p>
        <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before empty-full-btn" @click="router.push('/tagging-rules/new')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ t('New tagging rule') }}
        </button>
      </div>
    </template>
  </ErpTablePage>

  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete rule')"
    :description="deleteDescription"
    :confirm-label="t('Delete')"
    @confirm="confirmDelete"
  />
</template>

<style scoped>
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); flex: 1 1 auto; }
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
.empty-full-btn { margin-top: var(--mp-spacing-2); }
</style>
