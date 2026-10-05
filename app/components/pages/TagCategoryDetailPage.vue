<!-- prod-parity: jurnal-non-core-feature-frontend/src/modules/tags/views/TagCategoryDetailView.vue -->
<script setup lang="ts">
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpButton, MpIcon, MpTooltip, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import TagFormModal from '~/components/tags/TagFormModal.vue'
import {
  tags, tagCategories, addTag, updateTag, setTagArchived, deleteTags, transferTags, isTagInUse,
  renameTagCategory, deleteTagCategory, type Tag,
} from '~/data/tags'
import { successToast } from '~/utils/toasts'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

// `ungrouped` and `archived` are pseudo-ids with a page of their own, like prod.
const isBucket = computed(() => props.orderId === 'ungrouped' || props.orderId === 'archived')
const category = computed(() => tagCategories.find(c => c.id === props.orderId) ?? null)
const title = computed(() => {
  if (props.orderId === 'ungrouped') return t('Uncategorized')
  if (props.orderId === 'archived') return t('Archived')
  return category.value?.name ?? t('Category not found')
})
const notFound = computed(() => !isBucket.value && !category.value)

const columns: TableColumn[] = [
  { key: 'name', label: t('Tag name'), kind: 'name', sortable: true, sortType: 'text' },
]
const rowsSource = computed<Tag[]>(() => tags.filter((tag) => {
  if (props.orderId === 'archived') return tag.archived
  if (props.orderId === 'ungrouped') return tag.categoryId === null && !tag.archived
  return tag.categoryId === props.orderId
}))
const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, setSort,
} = useTableState<Tag>(rowsSource, {
  perPage: 25,
  filterFn: (row, s) => !s || row.name.toLowerCase().includes(s),
  defaultSort: { key: '', dir: 'asc' },
})
const hasActiveFilter = computed(() => !!search.value)
function clearFilters() { search.value = '' }
const asTag = (r: unknown) => r as Tag

function goToCategories() { router.push('/tags?tab=Categories') }

// ─── New tag in this category / edit tag ─────────────────────────────────────
const tagFormOpen = ref(false)
const tagTarget = ref<Tag | null>(null)
function openTagCreate() { tagTarget.value = null; tagFormOpen.value = true }
function openTagEdit(tag: Tag) { tagTarget.value = tag; tagFormOpen.value = true }
function submitTag(v: { name: string; categoryId: string | null }) {
  if (tagTarget.value) { updateTag(tagTarget.value.id, v.name, v.categoryId); successToast(t('Tag updated')) }
  else { addTag(v.name, category.value?.id ?? null); successToast(t('Tag created')) }
  tagFormOpen.value = false
}

// ─── Category edit / delete ──────────────────────────────────────────────────
const categoryFormOpen = ref(false)
function submitCategory(v: { name: string }) {
  if (category.value) renameTagCategory(category.value.id, v.name)
  categoryFormOpen.value = false
  successToast(t('Category updated'))
}
const deleteCategoryOpen = ref(false)
function confirmDeleteCategory() {
  if (category.value) deleteTagCategory(category.value.id)
  successToast(t('Category deleted'))
  goToCategories()
}

// ─── Row actions ─────────────────────────────────────────────────────────────
type ConfirmKind = 'archive' | 'unarchive' | 'deleteTag'
const confirmKind = ref<ConfirmKind | null>(null)
const confirmTarget = ref<Tag | null>(null)
const confirmOpen = computed({
  get: () => confirmKind.value !== null,
  set: (v: boolean) => { if (!v) confirmKind.value = null },
})
const confirmCopy = computed(() => {
  const name = confirmTarget.value?.name ?? ''
  if (confirmKind.value === 'archive') return { title: t('Archive tag?'), description: `"${name}" ${t('will be archived and moved to Uncategorized. You can restore it later.')}`, confirm: t('Archive'), danger: false }
  if (confirmKind.value === 'unarchive') return { title: t('Unarchive tag?'), description: `"${name}" ${t('will be restored as an active tag under Uncategorized.')}`, confirm: t('Unarchive'), danger: false }
  return { title: t('Delete tag?'), description: `"${name}" ${t('will be permanently deleted. This cannot be undone.')}`, confirm: t('Delete'), danger: true }
})
function openConfirm(kind: ConfirmKind, tag: Tag) { confirmTarget.value = tag; confirmKind.value = kind }
function runConfirm() {
  const tag = confirmTarget.value
  if (!tag) return
  if (confirmKind.value === 'archive') { setTagArchived(tag.id, true); successToast(t('Tag archived')) }
  else if (confirmKind.value === 'unarchive') { setTagArchived(tag.id, false); successToast(t('Tag unarchived')) }
  else { deleteTags([tag.id]); successToast(t('Tag deleted')) }
  confirmKind.value = null
}

// ─── Bulk: transfer + delete ─────────────────────────────────────────────────
let deselect: (() => void) | null = null
const transferOpen = ref(false)
const transferIds = ref<string[]>([])
const bulkDeleteOpen = ref(false)
const bulkDeleteIds = ref<string[]>([])
function selectedTags(sel: Set<number>): Tag[] {
  const rows = paginated.value as Tag[]
  return [...sel].map(i => rows[i]).filter((r): r is Tag => !!r)
}
function openTransfer(sel: Set<number>, deselectAll: () => void) {
  transferIds.value = selectedTags(sel).map(r => r.id)
  deselect = deselectAll
  transferOpen.value = true
}
function submitTransfer(v: { categoryId: string | null }) {
  const n = transferIds.value.length
  transferTags(transferIds.value, v.categoryId)
  transferOpen.value = false
  deselect?.()
  successToast(n === 1 ? t('1 tag moved') : `${n} ${t('tags moved')}`)
}
function openBulkDelete(sel: Set<number>, deselectAll: () => void) {
  bulkDeleteIds.value = selectedTags(sel).map(r => r.id)
  deselect = deselectAll
  bulkDeleteOpen.value = true
}
const bulkDeleteDescription = computed(() => {
  const n = bulkDeleteIds.value.length
  return n === 1 ? t('1 tag will be permanently deleted. This cannot be undone.') : `${n} ${t('tags will be permanently deleted. This cannot be undone.')}`
})
function confirmBulkDelete() {
  const n = bulkDeleteIds.value.length
  deleteTags(bulkDeleteIds.value)
  deselect?.()
  successToast(n === 1 ? t('1 tag deleted') : `${n} ${t('tags deleted')}`)
}
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goToCategories">{{ t('Tag categories') }}</button>
        <h1 class="detail-title">{{ title }}</h1>
      </div>
      <div v-if="!notFound" class="detail-bar-right">
        <button v-if="props.orderId !== 'archived'" class="btn-enterprise btn-enterprise--primary btn-enterprise--icon-before" @click="openTagCreate">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ t('New tag') }}
        </button>
        <MpPopover v-if="!isBucket" id="tag-category-detail-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="secondary" left-icon="menu-kebab" :aria-label="t('Row actions')" is-rounded />
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '140px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="categoryFormOpen = true">{{ t('Edit') }}</MpPopoverListItem>
              <MpPopoverListItem @click="deleteCategoryOpen = true">{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <div class="detail-stage">
      <div v-if="notFound" class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('Category not found') }}</p>
        <p class="empty-full-desc">{{ t('This category may have been deleted, or the link is incorrect.') }}</p>
      </div>
      <ErpTablePage
        v-else
        :columns="columns"
        :rows="(paginated as unknown as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        :has-active-filter="hasActiveFilter"
        :search="search"
        filter-empty-label="tags"
        has-checkbox
        :row-disabled="(r) => isTagInUse(asTag(r))"
        bulk-label="tag"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort-change="setSort"
        @clear-filters="clearFilters"
      >
        <template #filters>
          <div class="filter-left">
            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search tag name')" />
            </div>
          </div>
        </template>

        <template #bulk-actions="{ selectedRows, deselectAll }">
          <MpPopover id="tag-category-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent class="erp-dropdown-menu">
              <MpPopoverList>
                <MpPopoverListItem @click="openTransfer(selectedRows as Set<number>, deselectAll as () => void)">{{ t('Transfer') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
          <MpButton size="sm" variant="secondary" is-rounded @click="openBulkDelete(selectedRows as Set<number>, deselectAll as () => void)">{{ t('Delete') }}</MpButton>
        </template>

        <template #cell-name="{ row }">
          <span class="cell-link" @click.stop="router.push(`/tags/${asTag(row).id}`)">{{ asTag(row).name }}</span>
        </template>

        <template #actions="{ row }">
          <MpPopover :id="`tag-category-tag-actions-${asTag(row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Row actions')" is-rounded />
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="openTagEdit(asTag(row))">{{ t('Edit') }}</MpPopoverListItem>
                <MpPopoverListItem v-if="!asTag(row).archived" @click="openConfirm('archive', asTag(row))">{{ t('Archive') }}</MpPopoverListItem>
                <MpPopoverListItem v-else @click="openConfirm('unarchive', asTag(row))">{{ t('Unarchive') }}</MpPopoverListItem>
                <MpTooltip v-if="isTagInUse(asTag(row))" :label="t('This tag is used in transactions and cannot be deleted.')" placement="left">
                  <MpPopoverListItem is-disabled>{{ t('Delete') }}</MpPopoverListItem>
                </MpTooltip>
                <MpPopoverListItem v-else @click="openConfirm('deleteTag', asTag(row))">{{ t('Delete') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>

        <template #empty>
          <div class="empty-full">
            <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
            <p class="empty-full-title">{{ t('No tags in this category') }}</p>
            <p class="empty-full-desc">{{ t('Add a tag to this category and it will appear here.') }}</p>
          </div>
        </template>
      </ErpTablePage>
    </div>

    <TagFormModal
      v-model:is-open="tagFormOpen"
      mode="tag"
      :edit-id="tagTarget?.id ?? null"
      :initial-name="tagTarget?.name ?? ''"
      :initial-category-id="tagTarget ? tagTarget.categoryId : (category?.id ?? null)"
      :category-locked="!tagTarget && !!category"
      @submit="submitTag"
    />
    <TagFormModal
      v-model:is-open="categoryFormOpen"
      mode="category"
      :edit-id="category?.id ?? null"
      :initial-name="category?.name ?? ''"
      @submit="submitCategory"
    />
    <TagFormModal
      v-model:is-open="transferOpen"
      mode="transfer"
      :exclude-category-id="category?.id ?? null"
      :transfer-count="transferIds.length"
      @submit="submitTransfer"
    />
    <ConfirmModal
      v-model:is-open="confirmOpen"
      :title="confirmCopy.title"
      :description="confirmCopy.description"
      :confirm-label="confirmCopy.confirm"
      :is-danger="confirmCopy.danger"
      @confirm="runConfirm"
    />
    <ConfirmModal
      v-model:is-open="bulkDeleteOpen"
      :title="t('Delete tags?')"
      :description="bulkDeleteDescription"
      :confirm-label="t('Delete')"
      @confirm="confirmBulkDelete"
    />
    <ConfirmModal
      v-model:is-open="deleteCategoryOpen"
      :title="t('Delete category?')"
      :description="t('Tags inside this category will be moved to Uncategorized. Once deleted, this category can not be recovered.')"
      :confirm-label="t('Delete')"
      @confirm="confirmDeleteCategory"
    />
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-bar-right { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-md);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: var(--mp-spacing-6); display: flex; flex-direction: column;
}
.empty-full { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.filter-left { flex: 1 1 auto; display: flex; }
.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
</style>
