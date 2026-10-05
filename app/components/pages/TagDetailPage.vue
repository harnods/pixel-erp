<!-- prod-parity: jurnal-non-core-feature-frontend/src/modules/tags/views/TagDetailView.vue -->
<script setup lang="ts">
import { MpButton, MpIcon, MpBadge } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import TagFormModal from '~/components/tags/TagFormModal.vue'
import { tags, tagCategoryName, transactionsForTag, updateTag, type TagTransaction } from '~/data/tags'
import { successToast } from '~/utils/toasts'
import { formatDate } from '~/utils/date'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const tag = computed(() => tags.find(x => x.id === props.orderId) ?? null)

const columns: TableColumn[] = [
  { key: 'date', label: t('Date'), kind: 'date', sortable: true, sortType: 'date' },
  { key: 'number', label: t('Number'), kind: 'number' },
  { key: 'contact', label: t('Contact'), kind: 'name' },
]
const rowsSource = computed<TagTransaction[]>(() => (tag.value ? transactionsForTag(tag.value.name) : []))
const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, setSort,
} = useTableState<TagTransaction>(rowsSource, {
  perPage: 25,
  filterFn: (row, s) => !s || row.number.toLowerCase().includes(s) || row.contact.toLowerCase().includes(s),
  defaultSort: { key: 'date', dir: 'desc' },
})
const hasActiveFilter = computed(() => !!search.value)
function clearFilters() { search.value = '' }
const asTx = (r: unknown) => r as TagTransaction

function goToIndex() { router.push('/tags') }

const editOpen = ref(false)
function submitEdit(v: { name: string; categoryId: string | null }) {
  if (!tag.value) return
  updateTag(tag.value.id, v.name, v.categoryId)
  editOpen.value = false
  successToast(t('Tag updated'))
}
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goToIndex">{{ t('Tags') }}</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ tag?.name ?? t('Tag not found') }}</h1>
          <MpButton v-if="tag" variant="ghost" left-icon="edit" :aria-label="t('Edit tag name')" is-rounded @click="editOpen = true" />
          <MpBadge v-if="tag?.archived" for="additionalInformation" type="announcement">{{ t('Archived') }}</MpBadge>
        </div>
      </div>
    </header>

    <div class="detail-stage">
      <div v-if="!tag" class="td-not-found">
        <img src="/illustrations/empty-folder.png" alt="" width="288" height="240" />
        <p class="td-not-found-title">{{ t('Tag not found') }}</p>
        <p class="td-not-found-desc">{{ t('This tag may have been deleted, or the link is incorrect.') }}</p>
      </div>
      <template v-else>
        <div class="td-overview">
          <div class="td-category">
            <span class="td-category-label">{{ t('Category') }}</span>
            <span class="td-category-value">{{ t(tagCategoryName(tag.categoryId)) }}</span>
          </div>
        </div>
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
          @page-change="setPage"
          @per-page-change="setPerPage"
          @sort-change="setSort"
          @clear-filters="clearFilters"
        >
          <template #filters>
            <div class="filter-left" />
            <div class="filter-right">
              <div class="filter-search">
                <MpIcon name="search" size="sm" />
                <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
              </div>
            </div>
          </template>
          <template #cell-date="{ row }">{{ formatDate(asTx(row).date) }}</template>
          <template #cell-number="{ row }">
            <span class="cell-link" @click.stop="router.push(asTx(row).link)">{{ asTx(row).number }}</span>
          </template>
          <template #empty>
            <div class="empty-full">
              <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">{{ t('There is no transaction yet') }}</p>
              <p class="empty-full-desc">{{ t('Start creating transactions and put this tag.') }}</p>
            </div>
          </template>
        </ErpTablePage>
      </template>
    </div>

    <TagFormModal
      v-model:is-open="editOpen"
      mode="tag"
      :edit-id="tag?.id ?? null"
      :initial-name="tag?.name ?? ''"
      :initial-category-id="tag?.categoryId ?? null"
      @submit="submitEdit"
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
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-md);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-6);
}
.td-overview { display: flex; align-items: flex-start; }
.td-category { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.td-category-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.td-category-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.td-not-found, .empty-full { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-10, 40px) 0; }
.td-not-found-title, .empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.td-not-found-desc, .empty-full-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }

.filter-left { flex: 1 1 auto; }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
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
