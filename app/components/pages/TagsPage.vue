<!-- prod-parity: jurnal-non-core-feature-frontend/src/modules/tags/views/TagListView.vue + components/AllTagsPanel.vue -->
<script setup lang="ts">
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpButton, MpTooltip, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import TagFormModal from '~/components/tags/TagFormModal.vue'
import {
  tags, tagCategories, tagCategoryName, addTag, updateTag, setTagArchived, deleteTags, transferTags, isTagInUse,
  type Tag,
} from '~/data/tags'
import { successToast } from '~/utils/toasts'

const { t } = useLocale()
const router = useRouter()

const columns: TableColumn[] = [
  { key: 'name', label: t('Tag name'), kind: 'name', sortable: true, sortType: 'text' },
  { key: 'category', label: t('Category'), kind: 'name' },
  { key: 'status', label: t('Status'), kind: 'status' },
]

// ─── Filters ─────────────────────────────────────────────────────────────────
const statusFilter = ref('')
const categoryFilter = ref('')
const STATUS_OPTIONS = [{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]
const categoryOptions = computed(() => [
  { value: 'uncategorized', label: 'Uncategorized' },
  ...tagCategories.map(c => ({ value: c.id, label: c.name })),
])

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, setSort,
} = useTableState<Tag>(computed(() => tags.filter(tag =>
  (!statusFilter.value || (statusFilter.value === 'archived') === tag.archived)
  && (!categoryFilter.value || (categoryFilter.value === 'uncategorized' ? tag.categoryId === null : tag.categoryId === categoryFilter.value)),
)), {
  perPage: 25,
  filterFn: (row, s) => !s || row.name.toLowerCase().includes(s),
  defaultSort: { key: '', dir: 'asc' },
})
const hasActiveFilter = computed(() => !!search.value || !!statusFilter.value || !!categoryFilter.value)
function clearFilters() { search.value = ''; statusFilter.value = ''; categoryFilter.value = '' }

const asTag = (r: unknown) => r as Tag
function goToTag(tag: Tag) { router.push(`/tags/${tag.id}`) }
function goToCategory(tag: Tag) { router.push(`/tags/categories/${tag.categoryId ?? 'ungrouped'}`) }

// ─── Create / edit ───────────────────────────────────────────────────────────
const formOpen = ref(false)
const formTarget = ref<Tag | null>(null)
function openCreate() { formTarget.value = null; formOpen.value = true }
function openEdit(tag: Tag) { formTarget.value = tag; formOpen.value = true }
const tagAddSignal = inject<Ref<number>>('tagAddSignal')
if (tagAddSignal) watch(tagAddSignal, () => openCreate())
function submitTag(v: { name: string; categoryId: string | null }) {
  if (formTarget.value) { updateTag(formTarget.value.id, v.name, v.categoryId); successToast(t('Tag updated')) }
  else { addTag(v.name, v.categoryId); successToast(t('Tag created')) }
  formOpen.value = false
}

// ─── Archive / unarchive / delete ────────────────────────────────────────────
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
function selectedTags(sel: Set<number>): Tag[] {
  const rows = paginated.value as Tag[]
  return [...sel].map(i => rows[i]).filter((r): r is Tag => !!r)
}
function isUniform(sel: Set<number>): boolean {
  return new Set(selectedTags(sel).map(r => r.categoryId)).size <= 1
}
const transferOpen = ref(false)
const transferIds = ref<string[]>([])
const transferFrom = ref<string | null>(null)
let deselect: (() => void) | null = null
function openTransfer(sel: Set<number>, deselectAll: () => void) {
  const rows = selectedTags(sel)
  transferIds.value = rows.map(r => r.id)
  transferFrom.value = rows[0]?.categoryId ?? null
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
const bulkDeleteOpen = ref(false)
const bulkDeleteIds = ref<string[]>([])
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
        <ErpFilterSelect id="tags-status-filter" v-model="statusFilter" placeholder="Status" :options="STATUS_OPTIONS" />
        <ErpFilterSelect id="tags-category-filter" v-model="categoryFilter" placeholder="Category" :options="categoryOptions" width="200px" />
      </div>
      <div class="filter-right">
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
        </div>
      </div>
    </template>

    <template #bulk-actions="{ selectedRows, deselectAll }">
      <MpPopover v-if="isUniform(selectedRows as Set<number>)" id="tags-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
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
      <span class="cell-link" @click.stop="goToTag(asTag(row))">{{ asTag(row).name }}</span>
    </template>
    <template #cell-category="{ row }">
      <span class="cell-link" @click.stop="goToCategory(asTag(row))">{{ tagCategoryName(asTag(row).categoryId) }}</span>
    </template>
    <template #cell-status="{ row }">
      <ErpStatusBadge :status="asTag(row).archived ? 'archived' : 'active'" />
    </template>

    <template #actions="{ row }">
      <MpPopover :id="`tag-actions-${asTag(row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Row actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="openEdit(asTag(row))">{{ t('Edit') }}</MpPopoverListItem>
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
        <p class="empty-full-title">{{ t('No tags') }}</p>
        <p class="empty-full-desc">{{ t('Tags will appear here.') }}</p>
        <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--icon-before empty-full-btn" @click="openCreate">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ t('New tag') }}
        </button>
      </div>
    </template>
  </ErpTablePage>

  <TagFormModal
    v-model:is-open="formOpen"
    mode="tag"
    :edit-id="formTarget?.id ?? null"
    :initial-name="formTarget?.name ?? ''"
    :initial-category-id="formTarget?.categoryId ?? null"
    @submit="submitTag"
  />
  <TagFormModal
    v-model:is-open="transferOpen"
    mode="transfer"
    :exclude-category-id="transferFrom"
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
</template>

<style scoped>
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-2); flex: 1 1 auto; }
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
.empty-full-btn { margin-top: var(--mp-spacing-2); }
</style>
