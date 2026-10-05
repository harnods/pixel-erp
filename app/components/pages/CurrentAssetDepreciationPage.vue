<!-- prod-parity: jurnal-accounting-frontend/src/modules/assets/views/AssetDepreciationView.vue + components/list/DepreciationTable.vue -->
<script setup lang="ts">
import { MpButton, MpIcon, MpBanner, MpBannerIcon, MpBannerDescription } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import CurrentAssetApplyModal from '~/components/currentAssets/CurrentAssetApplyModal.vue'
import { formatIDR } from '~/utils/currency'
import { successToast } from '~/utils/toasts'
import {
  currentDepreciationSchedule, applyCurrentDepreciationRows, applyAllCurrentDepreciation,
  currentApplyAllRequested, type CurrentDepreciationScheduleRow,
} from '~/data/currentAssets'

const { t } = useLocale()
const router = useRouter()

interface Row extends CurrentDepreciationScheduleRow { number: string }
const rows = computed<Row[]>(() => currentDepreciationSchedule.value.map((r) => ({ ...r, number: r.assetNumber })))

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, setSort, toggleSort,
} = useTableState<Row>(rows, {
  perPage: 25,
  filterFn: (r, s) => !s || r.assetName.toLowerCase().includes(s) || r.assetNumber.includes(s),
  defaultSort: { key: 'period', dir: 'asc' },
})
const hasActiveFilter = computed(() => !!search.value)
function clearFilters() { search.value = '' }

const columns = computed<TableColumn[]>(() => [
  { key: 'number', label: t('Asset number'), kind: 'number', sortable: true, sortType: 'number' },
  { key: 'period', label: t('Period'), kind: 'date', align: 'right', sortable: true, sortType: 'date' },
  { key: 'rate', label: t('Rate'), kind: 'unit', align: 'right' },
  { key: 'method', label: t('Method'), kind: 'status' },
  { key: 'amount', label: t('Amount'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
])
const asRow = (r: unknown) => r as Row

// Applying is irreversible — every entry point confirms first.
const pending = ref<{ scope: 'all' | 'selected' | 'one'; ids: string[] } | null>(null)
const confirmOpen = computed({ get: () => !!pending.value, set: (v: boolean) => { if (!v) pending.value = null } })
watch(currentApplyAllRequested, (v) => {
  if (!v) return
  currentApplyAllRequested.value = false
  if (rows.value.length) pending.value = { scope: 'all', ids: [] }
})

function applyOne(r: Row) { pending.value = { scope: 'one', ids: [r.id] } }
function applySelected(sel: Set<number>, deselect: () => void) {
  const ids = [...sel].map((i) => (paginated.value[i] as Row | undefined)?.id).filter((x): x is string => !!x)
  if (!ids.length) return
  pending.value = { scope: 'selected', ids }
  deselect()
}
function confirmApply() {
  const p = pending.value
  if (!p) return
  if (p.scope === 'all') applyAllCurrentDepreciation()
  else applyCurrentDepreciationRows(p.ids)
  pending.value = null
  successToast(t('Depreciation applied'))
}

function selectedLabel(n: number) { return n === 1 ? t('Apply to 1 selected asset') : t('Apply to {count} selected assets').replace('{count}', String(n)) }
function goAsset(r: Row) { router.push(`/current-assets/${r.assetId}`) }
</script>

<template>
  <div class="cadp">
    <MpBanner v-if="rows.length" id="cadp-pending-banner" variant="warning" class="cadp-banner">
      <MpBannerIcon id="cadp-pending-banner-icon" />
      <MpBannerDescription>{{ t('Some depreciation schedules are pending. Apply them to keep book values up to date.') }}</MpBannerDescription>
    </MpBanner>

    <ErpTablePage
      :columns="columns"
      :rows="(paginated as unknown as Record<string, unknown>[])"
      :total="total"
      :current-page="currentPage"
      :per-page="perPage"
      :sort-key="sortKey"
      :sort-dir="sortDir"
      has-checkbox
      bulk-label="schedule"
      :search="search"
      :has-active-filter="hasActiveFilter"
      actions-width="96px"
      @page-change="setPage"
      @per-page-change="setPerPage"
      @sort="toggleSort"
      @sort-change="setSort"
      @clear-filters="clearFilters"
    >
      <template #bulk-actions="{ selectedRows, deselectAll, count }">
        <MpButton size="sm" variant="secondary" is-rounded @click="applySelected(selectedRows as Set<number>, deselectAll as () => void)">{{ selectedLabel(count as number) }}</MpButton>
      </template>

      <template #filters>
        <div class="filter-left" />
        <div class="filter-right">
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
            <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
              <MpIcon name="close" size="sm" />
            </button>
          </div>
        </div>
      </template>

      <template #cell-number="{ row }">
        <span class="cell-link cell-text" :title="asRow(row).assetName" @click.stop="goAsset(asRow(row))">{{ t('Fixed Assets') }} #{{ asRow(row).assetNumber }}</span>
      </template>
      <template #cell-period="{ row }">{{ asRow(row).periodLabel }}</template>
      <template #cell-amount="{ row }">{{ formatIDR(asRow(row).amount) }}</template>

      <template #actions="{ row }">
        <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" @click.stop="applyOne(asRow(row))">{{ t('Apply') }}</button>
      </template>

      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">{{ t('No pending depreciation schedules.') }}</p>
        </div>
      </template>
    </ErpTablePage>

    <CurrentAssetApplyModal v-model:is-open="confirmOpen" @confirm="confirmApply" />
  </div>
</template>

<style scoped>
/* Filter bar + cells — copied from BillsIndexPage.vue */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
.filter-btn-group :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cadp { display: flex; flex-direction: column; gap: var(--mp-spacing-4); min-height: 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
</style>
