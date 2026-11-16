<!-- prod-parity: jurnal-accounting-frontend/src/modules/assets/views/AssetListView.vue + components/list/AssetActiveTable.vue, AssetPendingTable.vue, AssetSoldTable.vue -->
<script setup lang="ts">
import {
  MpButton, MpIcon, MpTooltip, MpButtonGroup,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast, successToast } from '~/utils/toasts'
import {
  currentAssets, currentAccountLabel, caGainLossOf, caCanRevertDepreciation,
  deleteCurrentAssets, revertCurrentDepreciation, revertCurrentDisposal,
  type CurrentAsset, type CurrentAssetStatus,
} from '~/data/currentAssets'

const { t } = useLocale()
const route = useRoute()
const router = useRouter()
const toggleAirene = inject<() => void>('toggleAirene')

// Tabs are page tabs (shell, ?tab=) — Active assets / Draft assets / Disposed assets.
const TAB_STATUS: Record<string, CurrentAssetStatus> = {
  'Active assets': 'active',
  'Draft assets': 'pending',
  'Disposed assets': 'disposed',
}
const status = computed<CurrentAssetStatus>(() => TAB_STATUS[String(route.query.tab ?? '')] ?? 'active')

// ── Filters: acquisition date range + search ─────────────────────────────────
const dateRange = ref<Date[] | null>(null)
function dayKey(d: Date) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

const source = computed<CurrentAsset[]>(() => currentAssets.value.filter((a) => {
  if (a.status !== status.value) return false
  if (dateRange.value?.length === 2) {
    const d = status.value === 'disposed' ? (a.disposal?.date ?? '') : a.acquisitionDate
    if (d < dayKey(dateRange.value[0]!) || d > dayKey(dateRange.value[1]!)) return false
  }
  return true
}))

interface Row {
  id: string
  date: string
  number: string
  name: string
  account: string
  cost: number
  salePrice: number
  gainLoss: number
  asset: CurrentAsset
}
const rows = computed<Row[]>(() => source.value.map((a) => ({
  id: a.id,
  date: status.value === 'disposed' ? (a.disposal?.date ?? '') : a.acquisitionDate,
  number: Number(a.number) as unknown as string,
  name: a.name,
  account: currentAccountLabel(a.assetAccount),
  cost: a.acquisitionCost,
  salePrice: a.disposal?.salePrice ?? 0,
  gainLoss: caGainLossOf(a),
  asset: a,
})))

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, setSort, toggleSort,
} = useTableState<Row>(rows, {
  perPage: 25,
  filterFn: (r, s) => !s || r.name.toLowerCase().includes(s),
  defaultSort: { key: 'date', dir: 'desc' },
})
watch(status, () => { search.value = ''; dateRange.value = null })

const hasActiveFilter = computed(() => !!search.value || !!dateRange.value)
function clearFilters() { search.value = ''; dateRange.value = null }

const columns = computed<TableColumn[]>(() => {
  if (status.value === 'pending') return [
    { key: 'date', label: t('Date'), kind: 'date', sortable: true, sortType: 'date' },
    { key: 'name', label: t('Name'), kind: 'name', sortable: true, sortType: 'text' },
    { key: 'cost', label: t('Acquisition cost'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  ]
  if (status.value === 'disposed') return [
    { key: 'date', label: t('Date'), kind: 'date', sortable: true, sortType: 'date' },
    { key: 'name', label: t('Name'), kind: 'name', sortable: true, sortType: 'text' },
    { key: 'salePrice', label: t('Sale price'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
    { key: 'gainLoss', label: t('Gain / Loss'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  ]
  return [
    { key: 'date', label: t('Date'), kind: 'date', sortable: true, sortType: 'date' },
    { key: 'number', label: t('Number'), kind: 'number', sortable: true, sortType: 'number' },
    { key: 'name', label: t('Name'), kind: 'name', sortable: true, sortType: 'text' },
    { key: 'account', label: t('Fixed asset account'), kind: 'default' },
    { key: 'cost', label: t('Acquisition cost'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  ]
})

const asRow = (r: unknown) => r as Row

// ── Navigation ──────────────────────────────────────────────────────────────
function goDetail(r: Row) {
  router.push(r.asset.status === 'disposed' ? `/current-assets/${r.id}/disposal` : `/current-assets/${r.id}`)
}
function goEdit(id: string) { router.push(`/current-assets/${id}/edit`) }
function goCreate() { router.push('/current-assets/new') }
function goDispose(id: string) { router.push({ path: `/current-assets/${id}`, query: { dispose: '1' } }) }

// ── Confirmations ───────────────────────────────────────────────────────────
type Confirm = { kind: 'delete' | 'revertDepreciation' | 'revertDisposal'; ids: string[] }
const confirm = ref<Confirm | null>(null)
const confirmOpen = computed({ get: () => !!confirm.value, set: (v: boolean) => { if (!v) confirm.value = null } })
const confirmCopy = computed(() => {
  const c = confirm.value
  const n = c?.ids.length ?? 0
  if (c?.kind === 'revertDepreciation') return {
    title: t('Revert depreciation?'),
    description: t('Are you sure you want to revert depreciation for {count} asset(s)? Applied depreciation entries will be reversed.').replace('{count}', String(n)),
    label: t('Revert depreciation'), danger: false,
  }
  if (c?.kind === 'revertDisposal') return {
    title: t('Revert disposal?'),
    description: t("This reverses the disposal entry and returns the asset to active. This can't be undone."),
    label: t('Revert'), danger: true,
  }
  return {
    title: t('Delete asset?'),
    description: t("Are you sure you want to delete {count} asset(s)? This action can't be undone.").replace('{count}', String(n)),
    label: t('Delete'), danger: true,
  }
})
function runConfirm() {
  const c = confirm.value
  if (!c) return
  if (c.kind === 'delete') {
    deleteCurrentAssets(c.ids)
    successToast(c.ids.length === 1 ? t('Asset deleted') : t('Assets deleted'))
  } else if (c.kind === 'revertDepreciation') {
    const done = revertCurrentDepreciation(c.ids)
    const failed = c.ids.length - done
    if (failed > 0) infoToast(t("{count} couldn't be processed — they're still selected, try again.").replace('{count}', String(failed)))
    if (done) successToast(t('Depreciation reverted'))
  } else {
    c.ids.forEach(revertCurrentDisposal)
    successToast(t('Disposal reverted'))
  }
  confirm.value = null
}

function bulkIds(sel: Set<number>): string[] {
  return [...sel].map((i) => (paginated.value[i] as Row | undefined)?.id).filter((x): x is string => !!x)
}
function onBulk(kind: Confirm['kind'], sel: Set<number>, deselect: () => void) {
  const ids = bulkIds(sel)
  if (!ids.length) return
  confirm.value = { kind, ids }
  deselect()
}

const emptyIllustration = '/illustrations/empty-folder.png'
const emptyTitle = computed(() => status.value === 'pending'
  ? t('You have no pending assets to be recorded')
  : status.value === 'disposed' ? t('Nothing is on this list!') : t('You have no active assets listed'))

function notInPrototype() { infoToast(t('Not in this prototype')) }
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
    :has-checkbox="status === 'active'"
    bulk-label="asset"
    filter-empty-label="asset"
    :search="search"
    :has-active-filter="hasActiveFilter"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @clear-filters="clearFilters"
  >
    <!-- ── Bulk actions (Active assets) ── -->
    <template #bulk-actions="{ selectedRows, deselectAll }">
      <MpPopover id="ca-bulk-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
        <MpPopoverTrigger>
          <MpButton size="sm" variant="secondary" right-icon="chevrons-down" is-rounded>{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="onBulk('revertDepreciation', selectedRows as Set<number>, deselectAll as () => void)">{{ t('Revert depreciation') }}</MpPopoverListItem>
            <MpPopoverListItem @click="onBulk('delete', selectedRows as Set<number>, deselectAll as () => void)">{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <AdvancedDateRangePicker
          id="ca-date-range"
          :model-value="dateRange"
          :placeholder="t('All dates')"
          @update:model-value="dateRange = $event"
        />
      </div>
      <div class="filter-right">
        <MpButtonGroup class="filter-btn-group">
          <MpTooltip :label="t('Ask Airene')" placement="bottom">
            <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
          </MpTooltip>
          <MpTooltip :label="t('Export')" placement="bottom">
            <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded @click="notInPrototype" />
          </MpTooltip>
        </MpButtonGroup>
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search asset name...')" />
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <MpIcon name="close" size="sm" />
          </button>
        </div>
      </div>
    </template>

    <template #cell-date="{ row }">{{ formatDate(asRow(row).date) }}</template>
    <template #cell-number="{ row }">
      <span class="cell-link cell-text" @click.stop="goDetail(asRow(row))">{{ t('Fixed Assets') }} #{{ asRow(row).asset.number }}</span>
    </template>
    <template #cell-name="{ row }">
      <span v-if="status === 'active'" class="ca-wrap" :title="asRow(row).name">{{ asRow(row).name }}</span>
      <span v-else class="cell-link cell-text ca-wrap" @click.stop="goDetail(asRow(row))">{{ asRow(row).name }}</span>
    </template>
    <template #cell-account="{ row }"><span class="ca-wrap" :title="asRow(row).account">{{ asRow(row).account }}</span></template>
    <template #cell-cost="{ row }">{{ formatIDR(asRow(row).cost) }}</template>
    <template #cell-salePrice="{ row }">{{ formatIDR(asRow(row).salePrice) }}</template>
    <template #cell-gainLoss="{ row }">
      <span :class="{ 'ca-gain': asRow(row).gainLoss > 0, 'ca-loss': asRow(row).gainLoss < 0 }">{{ formatIDR(asRow(row).gainLoss) }}</span>
    </template>

    <!-- ── Row actions ── -->
    <template #actions="{ row }">
      <MpPopover :id="`ca-row-${asRow(row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('Actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="goDetail(asRow(row))">{{ t('View details') }}</MpPopoverListItem>
            <template v-if="status === 'active'">
              <MpPopoverListItem @click="goEdit(asRow(row).id)">{{ t('Edit') }}</MpPopoverListItem>
              <MpPopoverListItem @click="goDispose(asRow(row).id)">{{ t('Sell / Dispose') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="caCanRevertDepreciation(asRow(row).asset)" @click="confirm = { kind: 'revertDepreciation', ids: [asRow(row).id] }">{{ t('Revert depreciation') }}</MpPopoverListItem>
            </template>
            <MpPopoverListItem v-else-if="status === 'pending'" @click="goEdit(asRow(row).id)">{{ t('Record') }}</MpPopoverListItem>
            <MpPopoverListItem v-else @click="confirm = { kind: 'revertDisposal', ids: [asRow(row).id] }">{{ t('Revert') }}</MpPopoverListItem>
            <MpPopoverListItem class="ca-menu-danger" @click="confirm = { kind: 'delete', ids: [asRow(row).id] }">{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <!-- ── Full empty state ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ emptyTitle }}</p>
        <p v-if="status === 'disposed'" class="empty-full-desc">{{ t('You can move your active assets to this list if you happen to sell or dispose them') }}</p>
        <template v-else>
          <p class="empty-full-desc">{{ t('Just bought a new asset?') }} <span class="cell-link" @click="goCreate">{{ t('Add it here') }}</span></p>
          <p class="empty-full-desc">{{ t('Had it with you before migrating to Mekari ERP?') }} <span class="cell-link" @click="goCreate">{{ t('Record it here') }}</span></p>
        </template>
      </div>
    </template>
  </ErpTablePage>

  <ConfirmModal
    v-model:is-open="confirmOpen"
    :title="confirmCopy.title"
    :description="confirmCopy.description"
    :confirm-label="confirmCopy.label"
    :is-danger="confirmCopy.danger"
    @confirm="runConfirm"
  />
</template>

<style scoped>
/* Filter bar + cells — copied from BillsIndexPage.vue */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
.filter-btn-group :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.ca-wrap { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.ca-gain { color: var(--mp-colors-text-success); }
.ca-loss { color: var(--mp-text-danger); }
.ca-menu-danger { color: var(--mp-text-danger); }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
</style>
