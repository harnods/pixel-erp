<!-- prod-parity: jurnal-non-core-feature-frontend/src/modules/tags/components/CategoriesPanel.vue -->
<script setup lang="ts">
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpButton, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import TagFormModal from '~/components/tags/TagFormModal.vue'
import {
  tagCategories, addTagCategory, renameTagCategory, deleteTagCategory, type TagCategory,
} from '~/data/tags'
import { successToast } from '~/utils/toasts'

const { t } = useLocale()
const router = useRouter()

interface CategoryRow { id: string; name: string; isSynthetic: boolean }

const columns: TableColumn[] = [
  { key: 'name', label: t('Category name'), kind: 'name', sortable: true, sortType: 'text' },
]

// Uncategorized and Archived are synthetic rows prod lists after the real
// categories; both open their own detail page but carry no actions.
const rowsSource = computed<CategoryRow[]>(() => [
  ...tagCategories.map(c => ({ id: c.id, name: c.name, isSynthetic: false })),
  { id: 'ungrouped', name: 'Uncategorized', isSynthetic: true },
  { id: 'archived', name: 'Archived', isSynthetic: true },
])

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, setSort,
} = useTableState<CategoryRow>(rowsSource, {
  perPage: 25,
  filterFn: (row, s) => !s || row.name.toLowerCase().includes(s),
  defaultSort: { key: '', dir: 'asc' },
})
const hasActiveFilter = computed(() => !!search.value)
function clearFilters() { search.value = '' }

const asRow = (r: unknown) => r as CategoryRow
function goToCategory(row: CategoryRow) { router.push(`/tags/categories/${row.id}`) }

// ─── Create / rename ─────────────────────────────────────────────────────────
const formOpen = ref(false)
const formTarget = ref<TagCategory | null>(null)
function openCreate() { formTarget.value = null; formOpen.value = true }
function openRename(row: CategoryRow) {
  formTarget.value = tagCategories.find(c => c.id === row.id) ?? null
  formOpen.value = true
}
const tagCategoryAddSignal = inject<Ref<number>>('tagCategoryAddSignal')
if (tagCategoryAddSignal) watch(tagCategoryAddSignal, () => openCreate())
function submitCategory(v: { name: string }) {
  if (formTarget.value) { renameTagCategory(formTarget.value.id, v.name); successToast(t('Category updated')) }
  else { addTagCategory(v.name); successToast(t('Category created')) }
  formOpen.value = false
}

// ─── Delete ──────────────────────────────────────────────────────────────────
const deleteOpen = ref(false)
const deleteTarget = ref<CategoryRow | null>(null)
function openDelete(row: CategoryRow) { deleteTarget.value = row; deleteOpen.value = true }
function confirmDelete() {
  if (deleteTarget.value) { deleteTagCategory(deleteTarget.value.id); successToast(t('Category deleted')) }
  deleteTarget.value = null
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
    :has-active-filter="hasActiveFilter"
    :search="search"
    filter-empty-label="categories"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort-change="setSort"
    @clear-filters="clearFilters"
  >
    <template #filters>
      <div class="filter-left" />
      <div class="filter-right">
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search category name...')" />
        </div>
      </div>
    </template>

    <template #cell-name="{ row }">
      <span class="cell-link" @click.stop="goToCategory(asRow(row))">{{ t(asRow(row).name) }}</span>
    </template>

    <template #actions="{ row }">
      <MpPopover
        v-if="!asRow(row).isSynthetic"
        :id="`tag-category-actions-${asRow(row).id}`"
        is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end"
      >
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Row actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '140px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="openRename(asRow(row))">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openDelete(asRow(row))">{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No categories') }}</p>
        <p class="empty-full-desc">{{ t('Categories will appear here.') }}</p>
      </div>
    </template>
  </ErpTablePage>

  <TagFormModal
    v-model:is-open="formOpen"
    mode="category"
    :edit-id="formTarget?.id ?? null"
    :initial-name="formTarget?.name ?? ''"
    @submit="submitCategory"
  />
  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete category?')"
    :description="t('Tags inside this category will be moved to Uncategorized. Once deleted, this category can not be recovered.')"
    :confirm-label="t('Delete')"
    @confirm="confirmDelete"
  />
</template>

<style scoped>
.filter-left { flex: 1 1 auto; }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
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
</style>
