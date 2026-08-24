<script setup lang="ts">
import {
  MpSelect, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpIcon, MpTooltip, toast, css,
} from '@mekari/pixel3'
import { infoToast } from '~/utils/toasts'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import { formatDate } from '~/utils/date'
import PurchaseRequestFiltersDrawer, { emptyPurchaseRequestFilters, type PurchaseRequestFiltersValue } from '~/components/patterns/PurchaseRequestFiltersDrawer.vue'
import { purchaseRequests, updatePurchaseRequest } from '~/data'
import type { PurchaseRequest } from '~/data'

const toggleAirene = inject<() => void>('toggleAirene')
const { t } = useLocale()
const route = useRoute()
const router = useRouter()

// The "Awaiting approval" tab is driven by ?tab= (same as StockAdjustmentsPage).
const isAwaiting = computed(() => route.query.tab === 'Awaiting approval')

function viewDetails(id: string) { router.push(`/purchase-requests/${id}`) }

// ─── Column definitions (DATE + NUMBER mirror the Expenses index) ──────────────
const columns: TableColumn[] = [
  { key: 'date',             label: t('Date'),             width: '160px',                                 sortType: 'date'   },
  { key: 'number',           label: t('Number'),           width: '160px', sortable: true,                 sortType: 'number' },
  { key: 'attachment',       label: '',                    width: '52px',  noHeader: true, align: 'center' },
  { key: 'procurementStaff', label: t('Procurement staff'), width: '200px', sortable: true,                sortType: 'text'   },
  { key: 'requiredDate',     label: t('Required date'),    width: '160px',                                 sortType: 'date'   },
  { key: 'status',           label: t('Status'),           width: '160px',                                 sortType: 'text'   },
  { key: 'totalProducts',    label: t('Total products'),   width: '140px',                 sortable: true,  sortType: 'number' },
  { key: 'urgency',          label: t('Urgency level'),    width: '160px', sortable: true,                 sortType: 'text'   },
  { key: 'tags',             label: t('Tags'),             width: '160px'                                  },
]

// ─── Rows — newest request first (transactional log), awaiting subset on that tab ──
const rows = computed<PurchaseRequest[]>(() => {
  const list = [...purchaseRequests].sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number)
  return isAwaiting.value ? list.filter(pr => pr.awaitingApproval) : list
})

// ─── "All filters" drawer — a second, independent filter layer, ANDed with the
// toolbar's own Status select + search (same pattern as SalesOrdersPage). ──────
const filtersOpen = ref(false)
const appliedFilters = reactive<PurchaseRequestFiltersValue>(emptyPurchaseRequestFilters())

const keywordColumns = [
  { key: 'number',           label: t('Number')            },
  { key: 'procurementStaff', label: t('Procurement staff') },
  { key: 'tags',             label: t('Tags')              },
]
const tagOptions = computed(() => [...new Set(purchaseRequests.flatMap(pr => pr.tags ?? []))].sort())

function applyDrawerFilters(v: PurchaseRequestFiltersValue) { Object.assign(appliedFilters, v) }

function dayStart(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()) }
// AdvancedDateRangePicker emits a [start, end] Date pair (or null = not applied).
function matchesDateRange(iso: string, range: Date[] | null): boolean {
  if (!range) return true
  const time = dayStart(new Date(iso)).getTime()
  return time >= dayStart(range[0]!).getTime() && time <= dayStart(range[1]!).getTime()
}

// ─── Table state ──────────────────────────────────────────────────────────────
const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<PurchaseRequest>(rows, {
  perPage: 25,
  filterFn: (row, s, status) => {
    const matchesSearch = String(row.number).includes(s) || row.procurementStaff.toLowerCase().includes(s)
    const matchesStatus = !status || row.status === status

    // ── Drawer filters (independent of the toolbar's Status select / search) ──
    const f = appliedFilters
    const kw = f.keyword.toLowerCase().trim()
    const rowTags = row.tags ?? []
    const matchesKeyword = !kw || (
      f.keywordColumn === 'all'
        ? String(row.number).includes(kw) || row.procurementStaff.toLowerCase().includes(kw) || rowTags.some(tg => tg.toLowerCase().includes(kw))
        : f.keywordColumn === 'number' ? String(row.number).includes(kw)
        : f.keywordColumn === 'procurementStaff' ? row.procurementStaff.toLowerCase().includes(kw)
        : rowTags.some(tg => tg.toLowerCase().includes(kw))
    )
    const matchesRequestDate = matchesDateRange(row.date, f.requestDate)
    const matchesRequiredDate = matchesDateRange(row.requiredDate, f.requiredDate)
    const matchesDrawerStatus = f.status.length === 0 || f.status.includes(row.status)
    const matchesUrgency = f.urgency.length === 0 || f.urgency.includes(row.urgency)
    const matchesTags = f.tags.length === 0
      || (f.tagsComparator === 'isAnyOf' ? f.tags.some(tg => rowTags.includes(tg))
        : f.tagsComparator === 'isAllOf' ? f.tags.every(tg => rowTags.includes(tg))
        : f.tags.every(tg => !rowTags.includes(tg)))

    return matchesSearch && matchesStatus
      && matchesKeyword && matchesRequestDate && matchesRequiredDate && matchesDrawerStatus
      && matchesUrgency && matchesTags
  },
})

watch(appliedFilters, () => setPage(1))
// Reset to page 1 when switching between the All / Awaiting approval tabs.
watch(isAwaiting, () => setPage(1))

const isDrawerFilterActive = computed(() => {
  const f = appliedFilters
  return !!f.keyword || !!f.requestDate || !!f.requiredDate
    || f.status.length > 0 || f.urgency.length > 0 || f.tags.length > 0
})

// ─── Filter options ───────────────────────────────────────────────────────────
// Quick-filter options — NO "All status" entry; clearing (x) resets to show-all.
const statusOptions = [
  { label: t('Open'),                value: 'open'                },
  { label: t('Partially processed'), value: 'partially processed' },
  { label: t('Closed'),              value: 'closed'              },
  { label: t('Voided'),              value: 'voided'              },
]
const statusLabel = computed(
  () => statusOptions.find(o => o.value === statusFilter.value)?.label ?? '',
)

const urgencyOptions = [
  { label: t('High'),   value: 'high'   },
  { label: t('Medium'), value: 'medium' },
  { label: t('Low'),    value: 'low'    },
]

// ─── Urgency pip (Pixel priority icon + label) ─────────────────────────────────
const URGENCY_META: Record<string, { label: string; icon: string; color: string }> = {
  low:    { label: t('Low'),    icon: 'priority-low',    color: 'var(--mp-text-link, #165082)'    },
  medium: { label: t('Medium'), icon: 'priority-medium', color: 'var(--mp-icon-warning, #e46910)' },
  high:   { label: t('High'),   icon: 'priority-high',   color: 'var(--mp-icon-danger, #e2483d)'  },
}

// ─── First-load skeleton (pagination skeleton is handled by ErpTablePage) ─────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

const emptyIllustration = '/illustrations/empty-folder.png'

function clearFilters() {
  search.value = ''
  statusFilter.value = ''
  Object.assign(appliedFilters, emptyPurchaseRequestFilters())
}

// ─── Row actions ───────────────────────────────────────────────────────────────
// Create purchase order → opens the PO form pre-loaded with this request's items
// (grouped in the accordion table). Wired at the router level in [...slug].vue.
const createPurchaseOrderFromRequests = inject<(ids: string[]) => void>('createPurchaseOrderFromRequests')
function createPurchaseOrder(pr: PurchaseRequest) {
  createPurchaseOrderFromRequests?.([pr.id])
}
function markCompleted(id: string) {
  updatePurchaseRequest(id, { status: 'closed', awaitingApproval: false })
  toast.notify({ variant: 'success', title: t('Purchase request marked as completed') })
}
function duplicate(pr: PurchaseRequest) {
  toast.notify({ variant: 'success', title: `${t('Purchase request duplicated')} #${pr.number}` })
}
function copyLink() { infoToast(t('Link copied')) }

// Column show/hide (first column always on; Last updated appended, hidden by default)
const allCols: TableColumn[] = [...columns, { key: 'lastUpdated', label: t('Last updated'), width: '200px' }]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allCols.map(c => [c.key, c.key !== 'lastUpdated'])))
const columnItems = allCols
  .filter(c => c.label && !c.noHeader)
  .map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => allCols.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }
</script>

<template>
  <ErpTablePage
    :columns="visibleColumns"
    :rows="(paginated as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :loading="loading"
    :has-active-filter="!!search || !!statusFilter || isDrawerFilterActive"
    :search="search"
    has-checkbox
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >

    <!-- ── Filter bar ── -->
    <template #filters>
      <!-- Left: status select (MpSelect + MpPopover) + All filters -->
      <div class="filter-left">
        <MpPopover id="pr-status-filter" is-close-on-select>
          <MpPopoverTrigger>
            <MpSelect
              id="pr-status-select"
              :placeholder="t('Status')"
              :model-value="statusFilter"
              is-clearable
              :class="css({ width: '160px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' })"
              @mousedown.prevent
              @clear="statusFilter = ''"
            >
              <option v-if="statusFilter" :value="statusFilter">{{ statusLabel }}</option>
            </MpSelect>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', maxWidth: '320px' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="opt in statusOptions"
                :key="opt.value"
                :is-active="opt.value === statusFilter"
                @click="statusFilter = opt.value"
              >
                {{ opt.label }}
              </MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <button class="filter-all-btn" :class="{ 'filter-all-btn--active': isDrawerFilterActive }" @click="filtersOpen = true">
          <MpIcon name="filter" size="sm" />
          {{ t('All filters') }}
        </button>
      </div>

      <!-- Right: icon buttons + search -->
      <div class="filter-right">
        <div class="filter-btn-group">
          <!-- Airene -->
          <MpTooltip id="pr-tt-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
            <button class="filter-icon-btn filter-icon-btn--airene" type="button" :aria-label="t('Ask Airene')" @click="toggleAirene?.()">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
              </svg>
            </button>
          </MpTooltip>
          <!-- Column settings -->
          <ColumnSettingsMenu id="pr-tt-columns" :items="columnItems" :visibility="columnVisibility" />
          <!-- Export -->
          <MpTooltip id="pr-tt-export" :label="t('Export')" placement="bottom" use-portal>
            <button class="filter-icon-btn" type="button" :aria-label="t('Export')">
              <MpIcon name="download" size="md" />
            </button>
          </MpTooltip>
        </div>

        <!-- Pill search -->
        <div class="filter-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
          <input
            v-model="search"
            class="filter-search-input"
            type="text"
            :placeholder="t('Search...')"
          />
          <button v-if="search" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </template>

    <!-- ── Cell: Date ── -->
    <template #cell-date="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Number — "View details" on row hover ── -->
    <template #cell-number="{ row, value }">
      <a class="cell-link cell-text cell-number" :title="`${t('Purchase Request')} #${value}`" @click.stop="viewDetails((row as PurchaseRequest).id)">{{ t('Purchase Request') }} #{{ value }}</a>
    </template>

    <!-- ── Cell: Attachment icon (narrow column, no header) ── -->
    <template #cell-attachment="{ value, row }">
      <div v-if="value" class="attachment-icons-cell">
        <MpTooltip :id="`pr-attachment-tt-${(row as PurchaseRequest).id}`" :label="t('Attachment')" placement="bottom" use-portal>
          <span class="attachment-icon-indicator"><MpIcon name="attachment" size="sm" /></span>
        </MpTooltip>
      </div>
    </template>

    <!-- ── Cell: Procurement staff ── -->
    <template #cell-procurementStaff="{ value }">
      <span class="cell-text">{{ value }}</span>
    </template>

    <!-- ── Cell: Required date ── -->
    <template #cell-requiredDate="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Status ── -->
    <template #cell-status="{ value }">
      <ErpStatusBadge :status="value as string" />
    </template>

    <!-- ── Cell: Total products ── -->
    <template #cell-totalProducts="{ value }">
      {{ value }}
    </template>

    <!-- ── Cell: Urgency level (Pixel priority icon + label) ── -->
    <template #cell-urgency="{ value }">
      <span class="urgency">
        <MpIcon :name="URGENCY_META[value as string]?.icon" size="sm" class="urgency__ic" :style="{ color: URGENCY_META[value as string]?.color }" />
        <span class="urgency__label">{{ URGENCY_META[value as string]?.label }}</span>
      </span>
    </template>

    <!-- ── Cell: Tags — clamped to 2 lines, "More" link on overflow ── -->
    <template #cell-tags="{ value }">
      <ErpTagList :tags="(value as string[])" />
    </template>

    <!-- ── Full empty state (no purchase requests yet) ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No purchase requests') }}</p>
        <p class="empty-full-desc">{{ t('Purchase requests will appear here.') }}</p>
        <button class="empty-cta">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          {{ t('New purchase request') }}
        </button>
      </div>
    </template>

    <!-- ── Actions — kebab → MpPopover dropdown (View details always first) ── -->
    <template #actions="{ row }">
      <MpPopover :id="`pr-actions-${(row as PurchaseRequest).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="row-kebab" :aria-label="t('More actions')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetails((row as PurchaseRequest).id)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="createPurchaseOrder(row as PurchaseRequest)">{{ t('Create purchase order') }}</MpPopoverListItem>
            <MpPopoverListItem @click="markCompleted((row as PurchaseRequest).id)">{{ t('Mark as completed') }}</MpPopoverListItem>
            <MpPopoverListItem @click="duplicate(row as PurchaseRequest)">{{ t('Duplicate') }}</MpPopoverListItem>
          </MpPopoverList>
          <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
          <MpPopoverList>
            <MpPopoverListItem @click="copyLink">{{ t('Copy link') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #cell-lastUpdated="{ row }">
      <LastUpdatedCell v-bind="lastUpdatedFor((row as Record<string, unknown>).id as string)" />
    </template>
  </ErpTablePage>

  <PurchaseRequestFiltersDrawer
    id="pr-allfilters"
    :is-open="filtersOpen"
    :model-value="appliedFilters"
    :columns="keywordColumns"
    :status-options="statusOptions"
    :urgency-options="urgencyOptions"
    :tag-options="tagOptions"
    @update:is-open="filtersOpen = $event"
    @apply="applyDrawerFilters"
  />
</template>

<style scoped>
/* ── Cell helpers ───────────────────────────────────────────────────────── */
.cell-number { color: var(--mp-text-default); }
.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; max-width: 100%; }

/* Attachment icon indicator — plain icon, no button chrome. */
.attachment-icons-cell { display: flex; align-items: center; justify-content: center; }
.attachment-icon-indicator { display: inline-flex; align-items: center; justify-content: center; color: var(--mp-text-subtle); }

/* Urgency pip */
.urgency { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.urgency__ic { flex-shrink: 0; }
.urgency__label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.row-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  border: none; background: transparent; cursor: pointer;
  border-radius: var(--mp-radii-sm); color: var(--mp-text-subtle);
}
.row-kebab:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

/* ── Full empty state ───────────────────────────────────────────────────── */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: auto; height: 240px; object-fit: contain; margin-bottom: 0; }
.empty-full-title {
  margin: 0 0 var(--mp-spacing-0\.5);
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-full-desc {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.empty-cta {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer;
}
.empty-cta:hover { background: var(--mp-background-neutral-hovered); }

/* ── Filter bar ─────────────────────────────────────────────────────────── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.filter-all-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary);
  cursor: pointer; white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-all-btn--active {
  background: var(--mp-background-selected, var(--mp-background-information));
  border-color: var(--mp-border-selected, var(--mp-border-information));
  color: var(--mp-text-selected, var(--mp-text-information));
}

.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn {
  display: flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); padding: var(--mp-spacing-2);
  border: none; background: transparent; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-text-default);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-icon-btn--airene { color: var(--mp-airene-default); }

.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default); min-width: 0;
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
</style>
