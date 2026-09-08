<script setup lang="ts">
/**
 * CRM (Qontak) — Deals. Landing page for the CRM product (/crm). Full-bleed page:
 * own title bar → shared metrics panel + filter bar → either a pipeline KANBAN
 * (board) or a TABLE, switched by a segmented view toggle. Both views read the ONE
 * `deals` dataset (app/data/crm.ts) so the metrics, the board and the table always
 * agree; a Won deal that converted carries its Sales Order id (the CRM ↔ ERP bridge).
 *
 * Mirrors CrmCustomersPage's structure (title bar + stats + filter bar + view
 * toggle over a shared, view-filtered dataset). The board is kept inline here (the
 * shared CrmBoardView is customer-shaped — lifecycle/segment/owner groupings — and
 * doesn't fit a deal-stage pipeline), but it is sourced from `deals`/`dealsInStage`
 * and wired to setDealStage (drag) + the deal detail route (click).
 */
import { ref, computed, inject, onMounted } from 'vue'
import {
  MpButton, MpButtonGroup, MpIcon, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpIconSegmented from '~/components/patterns/ErpIconSegmented.vue'
import { useTableState } from '~/composables/useTableState'
import { formatIDR } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'
import {
  deals, dealMetrics, DEAL_STAGES, setDealStage,
  type Deal, type DealStage, type DealPriority,
} from '~/data/crm'

const router = useRouter()
// ErpTablePage hands each cell/slot row as Record<string, unknown>; narrow it back
// to Deal (Deal has no index signature, so route the cast through unknown).
function asDeal(row: unknown): Deal { return row as Deal }
function soon(what: string) { infoToast(`${what} — coming soon`) }
function goDetail(id: string) { router.push(`/crm/deals/${id}`) }
function goOrder(id: string) { router.push(`/crm/orders/${id}`) }

// First-load skeleton (ERP guideline: solid, ~1.2s).
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 1200) })

// ── Metrics panel (all derived from `deals` via dealMetrics) ──
const m = dealMetrics

// ── Toolbar filters (shared across table + board) ──
const pipeline = ref('Sales pipeline')          // decorative pipeline switcher

// ── View toggle (board / table) — table now renders (no "coming soon") ──
const view = ref<'board' | 'table'>('board')
const viewOptions = [
  { value: 'board', icon: 'table-view-column', label: 'Board view' },
  { value: 'table', icon: 'table-view-list', label: 'Table view' },
]

// ── Table state (search + Stage filter + sort + pagination over `deals`) ──
// Deals are transactional → default newest-first by createdAt.
const source = computed<Deal[]>(() => deals)
const {
  search, statusFilter, currentPage, perPage, sortKey, sortDir, total, paginated,
  setPage, setPerPage, toggleSort, setSort,
} = useTableState<Deal>(source, {
  perPage: 25,
  defaultSort: { key: 'createdAt', dir: 'desc' },
  filterFn: (row, s, status) => {
    const matchesStage = !status || row.stage === status
    const matchesSearch = !s || [row.name, row.id, row.company, row.owner].join(' ').toLowerCase().includes(s)
    return matchesStage && matchesSearch
  },
})

const hasActiveFilter = computed(() => !!statusFilter.value)
function clearFilters() { search.value = ''; statusFilter.value = '' }

// ── Board columns — one per DEAL_STAGES, sourced from `deals` (respects the
// Stage filter + search, same as the table). ──
interface BoardColumn { stage: DealStage; cards: Deal[]; total: number }
const boardColumns = computed<BoardColumn[]>(() => {
  const s = search.value.trim().toLowerCase()
  return DEAL_STAGES.map((stage) => {
    const cards = deals.filter((d) =>
      d.stage === stage &&
      (!statusFilter.value || d.stage === statusFilter.value) &&
      (!s || [d.name, d.id, d.company, d.owner].join(' ').toLowerCase().includes(s)))
    return { stage, cards, total: cards.reduce((n, d) => n + d.value, 0) }
  })
})

// ── Board drag & drop — move a deal card to the dropped stage column ──
const draggingId = ref<string | null>(null)
const dragOverStage = ref<string | null>(null)
function onDragStart(id: string) { draggingId.value = id }
function onDragEnd() { draggingId.value = null; dragOverStage.value = null }
function onDrop(stage: DealStage) {
  const id = draggingId.value
  onDragEnd()
  if (id) setDealStage(id, stage)
}

// ── Stage → badge colour (Deals have their own stage vocabulary) ──
function stageBadge(stage: DealStage): { type: 'completed' | 'announcement' | 'information' | 'warning' | 'critical'; label: string } {
  switch (stage) {
    case 'Won':         return { type: 'completed',    label: 'Won' }
    case 'Lost':        return { type: 'critical',     label: 'Lost' }
    case 'Negotiation': return { type: 'warning',      label: 'Negotiation' }
    case 'Proposal':    return { type: 'warning',      label: 'Proposal' }
    case '1st meeting': return { type: 'information',  label: '1st meeting' }
    default:            return { type: 'information',  label: 'Open lead' }
  }
}

// ── Priority label (text-only — no decorative icons) ──
const PRIORITY_LABEL: Record<DealPriority, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }

// ── Columns ──
const columns: TableColumn[] = [
  { key: 'name',    label: 'Deal',           kind: 'name',   sortable: true, sortType: 'text'   },
  { key: 'company', label: 'Customer',       kind: 'name',   sortable: true, sortType: 'text'   },
  { key: 'stage',   label: 'Stage',          kind: 'status', sortable: true, sortType: 'text'   },
  { key: 'owner',   label: 'Owner',          kind: 'name',   sortable: true, sortType: 'text'   },
  { key: 'value',   label: 'Value',          kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'erp',     label: 'ERP transaction'                                                    },
]

// ── Filter-bar right group: Airene · export (ERP convention) ──
const toggleAirene = inject<() => void>('toggleAirene')
</script>

<template>
  <div class="crm">
    <!-- ── Title bar ── -->
    <header class="crm-titlebar">
      <div class="crm-titlebar__left">
        <h1 class="crm-title">Deals</h1>
        <span class="crm-subtitle">{{ deals.length }} records</span>
      </div>
      <div class="crm-titlebar__right">
        <MpButtonGroup>
          <MpButton variant="secondary" is-rounded @click="soon('Import deals')">Import</MpButton>
          <MpButton variant="primary" is-rounded left-icon="add" @click="soon('New deal')">Create deal</MpButton>
        </MpButtonGroup>
      </div>
    </header>

    <div class="cc-stage">
      <!-- ── Metrics panel (shared across table + board) ── -->
      <div class="cc-stats">
        <div class="stats-section">
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">Total deals</div>
            <div class="stat-amount">{{ m.total }}</div>
            <div class="stat-sub">{{ m.active }} active</div>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">Total deal value</div>
            <div class="stat-amount">{{ formatIDR(m.openValue) }}</div>
            <div class="stat-sub">{{ formatIDR(m.totalValue) }} total</div>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">Closing this month</div>
            <div class="stat-amount">{{ m.closingThisMonthCount }}</div>
            <div class="stat-sub">{{ formatIDR(m.closingThisMonthValue) }}</div>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">Overdue</div>
            <div class="stat-amount" :class="{ 'stat-amount--danger': m.overdueCount > 0 }">{{ m.overdueCount }}</div>
            <div class="stat-sub">Needs follow-up</div>
          </div>
          <div class="stat-card stat-card--bordered">
            <div class="stat-title">Sales Orders created</div>
            <div class="stat-amount">{{ m.salesOrdersCreatedCount }}</div>
            <div class="stat-sub">This month</div>
          </div>
          <div class="stat-card">
            <div class="stat-title">Conversion attention</div>
            <div class="stat-amount" :class="{ 'stat-amount--warning': m.conversionAttentionCount > 0 }">{{ m.conversionAttentionCount }}</div>
            <div class="stat-sub">Validation failed</div>
          </div>
        </div>
      </div>

      <!-- ── Filter bar (shared) ── -->
      <div class="cc-filterbar">
        <div class="filter-left">
          <ErpFilterSelect
            id="deal-stage-filter"
            :model-value="statusFilter"
            placeholder="Stage"
            :options="[...DEAL_STAGES]"
            @update:model-value="(v: string) => (statusFilter = v)"
          />
          <ErpFilterSelect
            id="deal-pipeline-select"
            :model-value="pipeline"
            placeholder="Sales pipeline"
            :options="['Sales pipeline', 'Wholesale pipeline', 'Retail pipeline']"
            @update:model-value="(v: string) => (pipeline = v)"
          />
          <MpButton variant="secondary" left-icon="filter" is-rounded class="filter-all-btn" @click="soon('All filters')">All filters</MpButton>
        </div>

        <div class="filter-right">
          <ErpIconSegmented id="deal-view-switch" v-model="view" :options="viewOptions" />
          <MpButtonGroup class="filter-btn-group">
            <MpTooltip label="Ask Airene" placement="bottom">
              <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" aria-label="Ask Airene" is-rounded @click="toggleAirene?.()" />
            </MpTooltip>
            <MpTooltip label="Export" placement="bottom">
              <MpButton variant="ghost" left-icon="download" aria-label="Export" is-rounded @click="soon('Export deals')" />
            </MpTooltip>
          </MpButtonGroup>
          <div class="filter-search">
            <MpIcon name="search" size="sm" />
            <input v-model="search" class="filter-search-input" type="text" placeholder="Search deals…" />
            <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''"><MpIcon name="close" size="sm" /></button>
          </div>
        </div>
      </div>

      <!-- ── Board view — pipeline kanban sourced from `deals` ── -->
      <div v-if="view === 'board'" class="kanban">
        <div class="kanban__board">
          <section
            v-for="col in boardColumns"
            :key="col.stage"
            class="kcol"
            :class="{ 'kcol--over': dragOverStage === col.stage }"
            @dragover.prevent="dragOverStage = col.stage"
            @dragleave="dragOverStage === col.stage && (dragOverStage = null)"
            @drop="onDrop(col.stage)"
          >
            <header class="kcol__head">
              <span class="kcol__name">{{ col.stage }}</span>
              <span class="kcol__count">{{ col.cards.length }}</span>
            </header>
            <div class="kcol__cards">
              <article
                v-for="d in col.cards"
                :key="d.id"
                class="deal"
                :class="{ 'deal--dragging': draggingId === d.id }"
                role="button" tabindex="0" draggable="true"
                @dragstart="onDragStart(d.id)"
                @dragend="onDragEnd"
                @click="goDetail(d.id)"
                @keydown.enter="goDetail(d.id)"
              >
                <div class="deal__head">
                  <p class="deal__company">{{ d.company }}</p>
                  <p class="deal__name">{{ d.name }}</p>
                </div>
                <div class="deal__value">{{ formatIDR(d.value) }}</div>
                <div class="deal__foot">
                  <span class="deal__owner"><MpIcon name="profile" size="sm" />{{ d.owner }}</span>
                  <span class="deal__prio" :class="`deal__prio--${d.priority}`">{{ PRIORITY_LABEL[d.priority] }}</span>
                </div>
              </article>
              <p v-if="!col.cards.length" class="kcol__empty">No deals</p>
            </div>
            <footer class="kcol__foot">
              <span class="kcol__total-k">Total:</span>
              <span class="kcol__total-v">{{ formatIDR(col.total) }}</span>
            </footer>
          </section>
        </div>
      </div>

      <!-- ── Table view ── -->
      <ErpTablePage
        v-else
        :columns="columns"
        :rows="(paginated as unknown as Record<string, unknown>[])"
        :total="total"
        :current-page="currentPage"
        :per-page="perPage"
        :sort-key="sortKey"
        :sort-dir="sortDir"
        :loading="loading"
        :search="search"
        :has-active-filter="hasActiveFilter"
        filter-empty-label="deal"
        @page-change="setPage"
        @per-page-change="setPerPage"
        @sort="toggleSort"
        @sort-change="setSort"
        @clear-filters="clearFilters"
      >
        <template #cell-name="{ row }">
          <span class="cell-link cell-text" @click.stop="goDetail(asDeal(row).id)">{{ asDeal(row).name }}</span>
          <span class="cc-sub cell-text">{{ asDeal(row).id }}</span>
        </template>

        <template #cell-company="{ row }">
          <span class="cell-text">{{ asDeal(row).company }}</span>
        </template>

        <template #cell-stage="{ row }">
          <ErpStatusBadge :status="asDeal(row).stage" v-bind="stageBadge(asDeal(row).stage)" />
        </template>

        <template #cell-owner="{ value }">{{ value || '—' }}</template>

        <template #cell-value="{ value }">{{ formatIDR(value as number) }}</template>

        <template #cell-erp="{ row }">
          <span v-if="asDeal(row).salesOrderId" class="cell-link cell-text" @click.stop="goOrder(asDeal(row).salesOrderId!)">{{ asDeal(row).salesOrderId }}</span>
          <span v-else-if="asDeal(row).conversion === 'validation-failed'" class="deal-attention">Validation failed</span>
          <span v-else class="cc-muted">—</span>
        </template>

        <template #actions="{ row }">
          <MpPopover :id="`deal-actions-${asDeal(row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="ghost" left-icon="menu-kebab" aria-label="More actions" is-rounded />
            </MpPopoverTrigger>
            <MpPopoverContent class="erp-dropdown-menu">
              <MpPopoverList>
                <MpPopoverListItem @click="goDetail(asDeal(row).id)">View details</MpPopoverListItem>
                <MpPopoverListItem
                  v-if="asDeal(row).stage === 'Won' && asDeal(row).conversion !== 'converted'"
                  @click="goDetail(asDeal(row).id)"
                >Convert to Sales Order</MpPopoverListItem>
                <MpPopoverListItem @click="soon('Edit deal')">Edit</MpPopoverListItem>
              </MpPopoverList>
              <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
              <MpPopoverList>
                <MpPopoverListItem @click="soon('Delete deal')">Delete</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </template>

        <template #empty>
          <div class="cc-empty">
            <img :src="'/illustrations/empty-folder.png'" alt="" class="cc-empty-illustration" width="288" height="240" />
            <p class="cc-empty-title">No deals</p>
            <p class="cc-empty-desc">Deals will appear here.</p>
          </div>
        </template>
      </ErpTablePage>
    </div>
  </div>
</template>

<style scoped>
.crm { display: flex; flex-direction: column; height: 100%; min-height: 0; }

/* ── Title bar ── */
.crm-titlebar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.crm-titlebar__left { display: flex; align-items: baseline; gap: var(--mp-spacing-3); }
.crm-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; color: var(--mp-text-default, #272b32); }
.crm-subtitle { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #656f80); }
.crm-titlebar__right { display: flex; align-items: center; gap: var(--mp-spacing-2); }

/* ── Stage (scroll area) ── */
/* No top padding on the scrollport: it would sit between the clip edge and the
   sticky .cc-filterbar's containing block, leaving a gap rows show through when
   the bar is pinned. The 20px lives on .cc-stats (the first child) instead. */
.cc-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); padding: 0 var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px); }

/* ── Stats (Bills / Sales-invoices pattern) ── */
/* 20px of the old 40px gap moved onto .cc-filterbar's padding-top, so the
   pinned bar carries an opaque strip above it. Rest-state spacing unchanged. */
.cc-stats { padding-top: var(--mp-spacing-5); margin-bottom: var(--mp-spacing-5); }
.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch; }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-amount--danger { color: var(--mp-text-danger); }
.stat-amount--warning { color: var(--mp-text-warning, #b54708); }
.stat-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; }

/* ── Filter bar (shared) ── */
/* The filter bar pins to the top of the scrolling stage. Left unpinned it scrolls
   under the stage's clip edge and the search pill gets sliced mid-scroll (its top
   border disappears while the rest is still visible); pinning also keeps search +
   filters reachable on a long list instead of forcing a scroll back to the top.
   Opaque stage background + z-index 3 so rows pass underneath, not through. */
.cc-filterbar { position: sticky; top: 0; z-index: 3; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding-top: var(--mp-spacing-5); padding-bottom: var(--mp-spacing-5); /* the gap below is padding, not margin, so the pinned bar's opaque strip travels with it and rows never show through it */ background: var(--mp-background-stage, #fff); }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-all-btn { padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3); font-weight: var(--mp-font-weights-semi-bold); }
.filter-btn-group { display: flex; align-items: center; }
.filter-btn-group :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }
@media (max-width: 640px) {
  .cc-filterbar { flex-wrap: wrap; }
  .cc-filterbar > :last-child { flex: 1 1 100%; }
}

/* Pill search (canonical ERP index search) */
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.filter-search-input::placeholder { color: var(--mp-text-placeholder, #97a0af); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); border-radius: var(--mp-radii-full, 999px); }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); color: var(--mp-icon-default, #536062); }

/* ── Table cell helpers ── */
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.cc-sub { display: block; margin-top: 1px; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cc-muted { color: var(--mp-text-subtle, #97a0af); }
.deal-attention { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-warning, #b54708); }

/* ── Kanban board ── */
.kanban { overflow-x: auto; padding-bottom: var(--mp-spacing-3); }
.kanban__board { display: flex; gap: var(--mp-spacing-4); align-items: flex-start; }
.kcol { flex: 0 0 288px; width: 288px; display: flex; flex-direction: column; background: var(--mp-background-neutral-subtle, #f4f5f7); border: 1px solid var(--mp-border-default); border-radius: 12px; transition: background 0.12s ease, border-color 0.12s ease; }
.kcol--over { background: var(--mp-background-brand-subtle, #e8f5f0); border-color: var(--mp-border-brand, #0a6e4e); }
.kcol__head { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-2); }
.kcol__name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.kcol__count { flex-shrink: 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); background: var(--mp-background-neutral, #fff); border-radius: 999px; padding: 1px 8px; }
.kcol__cards { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: 0 var(--mp-spacing-2) var(--mp-spacing-2); }
.kcol__empty { margin: 0; padding: var(--mp-spacing-4) 0; text-align: center; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.kcol__foot { display: flex; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-3); }
.kcol__total-k { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.kcol__total-v { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

/* ── Deal card ── */
.deal { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default); border-radius: 8px; cursor: pointer; }
.deal:hover { border-color: var(--mp-border-bold, #8c9596); }
.deal:active { cursor: grabbing; }
.deal--dragging { opacity: 0.45; }
.deal__head { display: flex; flex-direction: column; gap: 2px; }
.deal__company { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium, 500); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__name { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.deal__foot { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); }
.deal__owner { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal__prio { flex-shrink: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.deal__prio--high { color: var(--mp-text-warning, #b54708); }
.deal__prio--critical { color: var(--mp-text-danger, #b42318); font-weight: var(--mp-font-weights-semi-bold); }

/* ── Empty state ── */
.cc-empty { display: flex; flex-direction: column; align-items: center; }
.cc-empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.cc-empty-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cc-empty-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
