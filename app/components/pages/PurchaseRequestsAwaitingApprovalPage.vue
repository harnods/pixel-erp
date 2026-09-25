<script setup lang="ts">
/**
 * PurchaseRequestsAwaitingApprovalPage — "Awaiting approval" tab on Purchase
 * requests. Same approval-queue pattern as BillsAwaitingApprovalPage.vue /
 * PurchaseInvoicesAwaitingApprovalPage.vue: shows every request awaiting sign-off
 * with a single "Awaiting approval" status and an inline Approve action per row
 * (plus Create task / Add comment icons and a kebab), instead of the full index's
 * status quick-filter and standard kebab. Context = purchase requests.
 */
import {
  MpIcon, MpButton, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import LastUpdatedCell from '~/components/patterns/LastUpdatedCell.vue'
import { lastUpdatedFor } from '~/utils/lastUpdated'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import { formatDate } from '~/utils/date'
import { purchaseRequests, updatePurchaseRequest } from '~/data'
import type { PurchaseRequest } from '~/data'

const { t } = useLocale()
const router = useRouter()
const toggleAirene = inject<() => void>('toggleAirene')

function viewDetails(id: string) { router.push(`/purchase-requests/${id}`) }
function approve(id: string) {
  updatePurchaseRequest(id, { awaitingApproval: false })
  toast.notify({ variant: 'success', title: t('Purchase request approved') })
}
function duplicate(pr: PurchaseRequest) {
  toast.notify({ variant: 'success', title: `${t('Purchase request duplicated')} #${pr.number}` })
}

// ─── Urgency pip (Pixel priority icon + label) — same as the index ─────────────
const URGENCY_META: Record<string, { label: string; icon: string; color: string }> = {
  low:    { label: t('Low'),    icon: 'priority-low',    color: 'var(--mp-text-link, #165082)'    },
  medium: { label: t('Medium'), icon: 'priority-medium', color: 'var(--mp-icon-warning, #e46910)' },
  high:   { label: t('High'),   icon: 'priority-high',   color: 'var(--mp-icon-danger, #e2483d)'  },
}

// ─── Column definitions (Status renders the single "Awaiting approval" badge) ──
const columns: TableColumn[] = [
  { key: 'date',             label: t('Date'),             kind: 'date',                                 sortType: 'date'   },
  { key: 'number',           label: t('Number'),           kind: 'number', sortable: true,                 sortType: 'number' },
  { key: 'procurementStaff', label: t('Procurement staff'), kind: 'name', sortable: true,                sortType: 'text'   },
  { key: 'requiredDate',     label: t('Required date'),    kind: 'date',                                 sortType: 'date'   },
  { key: 'status',           label: t('Status'),           kind: 'status',                                 sortType: 'text'   },
  { key: 'totalProducts',    label: t('Total products'),                   sortable: true,  sortType: 'number' },
  { key: 'urgency',          label: t('Urgency level'),    sortable: true,                 sortType: 'text'   },
  { key: 'tags',             label: t('Tags'),             kind: 'tags'                                  },
]

// ─── Rows — only requests awaiting approval, newest first ──────────────────────
const rows = computed<PurchaseRequest[]>(() =>
  [...purchaseRequests]
    .filter(pr => pr.awaitingApproval)
    .sort((a, b) => b.date.localeCompare(a.date) || b.number - a.number),
)

// ─── Table state (search only — no status quick-filter on the approval queue) ──
const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState<PurchaseRequest>(rows, {
  perPage: 25,
  filterFn: (row, s) =>
    String(row.number).includes(s) || row.procurementStaff.toLowerCase().includes(s),
})

// Column show/hide (first column always on; Last updated appended, hidden by default)
const allCols: TableColumn[] = [...columns, { key: 'lastUpdated', label: t('Last updated'), kind: 'date' }]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(allCols.map(c => [c.key, c.key !== 'lastUpdated'])))
const columnItems = allCols.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => allCols.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// ─── First-load skeleton (pagination skeleton is handled by ErpTablePage) ─────
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

const emptyIllustration = '/illustrations/empty-folder.png'
function clearFilters() { search.value = '' }
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
    has-checkbox
    actions-width="228px"
    :loading="loading"
    :search="search"
    :has-active-filter="!!search"
    filter-empty-label="purchase request"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >

    <!-- ── Filter bar (approval queue: All filters + search, no status quick-filter) ── -->
    <template #filters>
      <div class="filter-left">
        <MpButton class="filter-all-btn">
          <MpIcon name="filter" size="sm" />
          {{ t('All filters') }}
        </MpButton>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <MpTooltip id="tt-pr-awaiting-airene" :label="t('Ask Airene')" placement="bottom" use-portal>
            <MpButton class="filter-icon-btn filter-icon-btn--airene" variant="ghost" :aria-label="t('Ask Airene')" left-icon="airene-brand" @click="toggleAirene?.()" />
          </MpTooltip>
          <ColumnSettingsMenu id="tt-columns-pr-awaiting" :items="columnItems" :visibility="columnVisibility" />
          <MpTooltip id="tt-pr-awaiting-export" :label="t('Export')" placement="bottom" use-portal>
            <MpButton class="filter-icon-btn" :aria-label="t('Export')">
              <MpIcon name="download" size="md" />
            </MpButton>
          </MpTooltip>
        </div>

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
        </div>
      </div>
    </template>

    <!-- ── Cell: Date ── -->
    <template #cell-date="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Number ── -->
    <template #cell-number="{ value, row }">
      <a class="cell-link cell-text cell-number" :title="`${t('Purchase Request')} #${value}`" @click.stop="viewDetails((row as PurchaseRequest).id)">{{ t('Purchase Request') }} #{{ value }}</a>
    </template>

    <!-- ── Cell: Procurement staff ── -->
    <template #cell-procurementStaff="{ value }">
      <span class="cell-text">{{ value }}</span>
    </template>

    <!-- ── Cell: Required date ── -->
    <template #cell-requiredDate="{ value }">
      {{ formatDate(value as string) }}
    </template>

    <!-- ── Cell: Status — single "Awaiting approval" badge for every row ── -->
    <template #cell-status>
      <ErpStatusBadge status="awaiting approval" :label="t('Awaiting approval')" />
    </template>

    <!-- ── Cell: Total products ── -->
    <template #cell-totalProducts="{ value }">
      {{ value }}
    </template>

    <!-- ── Cell: Urgency level ── -->
    <template #cell-urgency="{ value }">
      <span class="urgency">
        <MpIcon :name="URGENCY_META[value as string]?.icon" size="sm" class="urgency__ic" :style="{ color: URGENCY_META[value as string]?.color }" />
        <span class="urgency__label">{{ URGENCY_META[value as string]?.label }}</span>
      </span>
    </template>

    <!-- ── Cell: Tags ── -->
    <template #cell-tags="{ value }">
      <ErpTagList :tags="(value as string[])" />
    </template>

    <!-- ── Actions — inline Approve + Create task / Comment icons + kebab ── -->
    <template #actions="{ row }">
      <div class="row-actions">
        <MpButton class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" variant="secondary" @click.stop="approve((row as PurchaseRequest).id)">{{ t('Approve') }}</MpButton>
        <div class="row-actions__icons">
          <MpButton class="row-icon-btn" :aria-label="t('Create task')" @click.stop>
            <MpIcon name="task-todo" size="md" />
          </MpButton>
          <MpButton class="row-icon-btn" :aria-label="t('Add comment')" @click.stop>
            <MpIcon name="comment" size="md" />
          </MpButton>
          <MpPopover :id="`pr-awaiting-row-actions-${(row as PurchaseRequest).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton class="row-icon-btn" :aria-label="t('More actions')" @click.stop>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="12" cy="5" r="2" />
                  <circle cx="12" cy="12" r="2" />
                  <circle cx="12" cy="19" r="2" />
                </svg>
              </MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="viewDetails((row as PurchaseRequest).id)">{{ t('View details') }}</MpPopoverListItem>
                <MpPopoverListItem @click="duplicate(row as PurchaseRequest)">{{ t('Duplicate') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
    </template>

    <template #cell-lastUpdated="{ row }">
      <LastUpdatedCell v-bind="lastUpdatedFor((row as Record<string, unknown>).id as string)" />
    </template>

    <!-- ── Full empty state (no requests awaiting approval) ── -->
    <template #empty>
      <div class="empty-full">
        <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('No requests awaiting approval') }}</p>
        <p class="empty-full-desc">{{ t('Purchase requests awaiting approval will appear here.') }}</p>
      </div>
    </template>
  </ErpTablePage>
</template>

<style scoped>
.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; max-width: 100%; }
.cell-number { color: var(--mp-text-default); }

/* ── Full empty state (mirrors the Expenses index) ──────────────────────── */
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-full-desc {
  margin-top: var(--mp-spacing-0\.5);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

/* Urgency pip */
.urgency { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.urgency__ic { flex-shrink: 0; }
.urgency__label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* Row actions: Approve button + icon button group */
.row-actions { display: flex; align-items: center; gap: var(--mp-spacing-6); }
.row-actions__icons { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.row-icon-btn {
  display: flex !important; align-items: center; justify-content: center;
  padding: var(--mp-spacing-1) !important; min-width: 0 !important;
  border: none !important; background: transparent !important; cursor: pointer;
  border-radius: var(--mp-radii-sm) !important; color: var(--mp-text-subtle);
}
.row-icon-btn:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-text-default); }

/* ── Filter bar ─────────────────────────────────────────────────────────── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-all-btn {
  display: inline-flex !important; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3) !important;
  background: var(--mp-background-neutral) !important; border: 1px solid var(--mp-border-bold) !important;
  border-radius: var(--mp-radii-full, 999px) !important;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary);
  cursor: pointer; white-space: nowrap;
}
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered) !important; }
.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn {
  display: flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  padding: var(--mp-spacing-2) !important; border: none !important; background: transparent !important;
  border-radius: var(--mp-radii-md) !important; cursor: pointer; color: var(--mp-text-default);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered) !important; }
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
</style>
