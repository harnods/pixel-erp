<script setup lang="ts">
/**
 * XPM My claims · the requester's own reimbursement & cash-advance claims.
 * Standard ERP index pattern: warning banner + summary stats + custom table
 * (ErpTablePage + useTableState). The title-bar "My limits" secondary button
 * lives in the shell and fires the `myLimits` action bus, which opens the
 * read-only My limits drawer here. (The primary "Request claim" button is
 * handled by the shell · it navigates to /my-claims/create.)
 */
import {
  MpIcon, MpButton, MpDrawer, MpDrawerContent, MpDrawerHeader, MpDrawerBody,
  MpDrawerFooter, MpDrawerCloseButton, MpDrawerOverlay, MpButtonGroup,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { formatDateTime } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { xpmMyClaims, xpmBadgeType, type XpmClaim } from '~/data/xpm'
import { useXpmActions } from '~/composables/useXpmActions'

const router = useRouter()

// ── Title-bar action bus · "My limits" opens the limits drawer ──
const showLimitsDrawer = ref(false)
const { pending } = useXpmActions()
watch(() => pending.value, (p) => { if (p?.action === 'myLimits') showLimitsDrawer.value = true })

// ── Filter bar ──
const statusOptions = ['Awaiting approval', 'Awaiting disbursement', 'Awaiting settlement', 'Disbursed', 'Settled']
const searchPlaceholder = 'Search transaction id...'

// ── Table state ──
const rawRows = computed<XpmClaim[]>(() => xpmMyClaims)
const { search, statusFilter, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, toggleSort } =
  useTableState<XpmClaim>(rawRows, {
    perPage: 25,
    filterFn: (row, s, st) => row.id.toLowerCase().includes(s) && (!st || row.status === st),
  })

const columns: TableColumn[] = [
  { key: 'id',          label: 'Transaction number', kind: 'number', sortable: true, sortType: 'text' },
  { key: 'requestDate', label: 'Request date',       kind: 'date',   sortable: true, sortType: 'date' },
  { key: 'claimType',   label: 'Claim type',                         sortType: 'text' },
  { key: 'category',    label: 'Claim category',                     sortType: 'text' },
  { key: 'status',      label: 'Status',             kind: 'status' },
  { key: 'amount',      label: 'Amount', align: 'right', kind: 'amount', sortable: true, sortType: 'number' },
]

function viewDetail(id: string) { router.push(`/my-claims/${id}`) }
function editClaim(id: string) { router.push(`/my-claims/${id}/edit`) }

// ── My limits drawer ──
const myLimits = [
  { name: 'Communication',              available: 'Rp10.000.000', pct: 42 },
  { name: 'Transportation Domestic',    available: 'Rp10.000.000', pct: 68 },
  { name: 'Transportation International', available: 'CAD 1.000 +3 more', pct: 25 },
]
</script>

<template>
  <ErpTablePage
    :columns="columns"
    :rows="(paginated as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :has-active-search="!!search"
    :search="search"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
  >
    <!-- ── Warning banner + summary stats ── -->
    <template #stats>
      <div class="myclaims-warning">
        <MpIcon name="warning-triangle" size="md" class="myclaims-warning__icon" />
        <span class="myclaims-warning__text">1,271 claims are awaiting refund or settlement and need your action.</span>
        <MpButton is-rounded variant="primary" size="sm" @click="infoToast('View · coming soon')">View</MpButton>
      </div>

      <div class="myclaims-stats">
        <div class="myclaims-group">
          <div class="myclaims-group__label">Reimbursement</div>
          <div class="myclaims-group__cards">
            <div class="xpm-stat">
              <div class="xpm-stat__caption">Total</div>
              <div class="xpm-stat__label">Awaiting approval</div>
              <div class="xpm-stat__value">{{ formatIDR(21092424) }}</div>
            </div>
            <div class="xpm-stat">
              <div class="xpm-stat__caption">Total</div>
              <div class="xpm-stat__label">Awaiting disbursement</div>
              <div class="xpm-stat__value">{{ formatIDR(1238823) }}</div>
            </div>
            <div class="xpm-stat">
              <div class="xpm-stat__caption">Total</div>
              <div class="xpm-stat__label">Disbursed</div>
              <div class="xpm-stat__value">{{ formatIDR(741000) }}</div>
            </div>
          </div>
        </div>
        <div class="myclaims-group">
          <div class="myclaims-group__label">Cash advance</div>
          <div class="myclaims-group__cards">
            <div class="xpm-stat">
              <div class="xpm-stat__caption">Total</div>
              <div class="xpm-stat__label">Awaiting approval</div>
              <div class="xpm-stat__value">{{ formatIDR(55000) }}</div>
            </div>
            <div class="xpm-stat">
              <div class="xpm-stat__caption">Total</div>
              <div class="xpm-stat__label">Awaiting disbursement</div>
              <div class="xpm-stat__value">{{ formatIDR(1317260) }}</div>
            </div>
            <div class="xpm-stat">
              <div class="xpm-stat__caption">Total</div>
              <div class="xpm-stat__label">Settled</div>
              <div class="xpm-stat__value">{{ formatIDR(35000) }}</div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <div class="filter-select-wrap">
          <select class="filter-select" v-model="statusFilter">
            <option value="">All status</option>
            <option v-for="o in statusOptions" :key="o" :value="o">{{ o }}</option>
          </select>
          <svg class="filter-select-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <button class="filter-all-btn"><MpIcon name="filter" size="md" /> All filters</button>
      </div>
      <div class="filter-right">
        <div class="filter-btn-group">
          <button class="filter-icon-btn" aria-label="Export" @click="infoToast('Export · coming soon')"><MpIcon name="download" size="md" /></button>
        </div>
        <div class="filter-search">
          <MpIcon name="search" size="md" />
          <input v-model="search" class="filter-search-input" type="text" :placeholder="searchPlaceholder" />
          <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''"><MpIcon name="close" size="sm" /></button>
        </div>
      </div>
    </template>

    <!-- ── Cells ── -->
    <template #cell-id="{ row }">
      <span class="cell-link" @click="viewDetail((row as XpmClaim).id)">{{ (row as XpmClaim).id }}</span>
    </template>
    <template #cell-requestDate="{ value }">{{ formatDateTime(value as string) }}</template>
    <template #cell-status="{ row }">
      <ErpStatusBadge :status="(row as XpmClaim).status" :label="(row as XpmClaim).status" :type="xpmBadgeType((row as XpmClaim).status)" />
    </template>
    <template #cell-amount="{ value }">{{ formatIDR(value as number) }}</template>

    <!-- ── Row actions ── -->
    <template #actions="{ row }">
      <MpPopover :id="`myclaim-actions-${(row as XpmClaim).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton is-rounded variant="ghost" left-icon="menu-kebab" aria-label="More actions" />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="viewDetail((row as XpmClaim).id)">View details</MpPopoverListItem>
            <MpPopoverListItem @click="editClaim((row as XpmClaim).id)">Edit</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>
  </ErpTablePage>

  <!-- ── My limits drawer ── -->
  <MpDrawer id="xpm-my-limits" :is-open="showLimitsDrawer" variant="floating" placement="right" size="lg" @close="showLimitsDrawer = false">
    <MpDrawerContent>
      <MpDrawerHeader>My limits <MpDrawerCloseButton /></MpDrawerHeader>
      <MpDrawerBody>
        <div class="limit-rows">
          <div v-for="l in myLimits" :key="l.name" class="limit-row">
            <div class="limit-row__top">
              <span class="limit-row__name">{{ l.name }}</span>
              <span class="limit-row__amount">{{ l.available }}</span>
            </div>
            <div class="limit-row__caption">Available to spend</div>
            <div class="limit-bar"><div class="limit-bar__fill" :style="{ width: l.pct + '%' }" /></div>
          </div>
        </div>
      </MpDrawerBody>
      <MpDrawerFooter>
        <MpButtonGroup>
          <MpButton is-rounded variant="ghost" @click="showLimitsDrawer = false">Close</MpButton>
        </MpButtonGroup>
      </MpDrawerFooter>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>
</template>

<style scoped>
/* ── Warning banner ── */
.myclaims-warning {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border: 1px solid var(--mp-border-warning, #ebdbbb);
  background: var(--mp-background-warning-subtle, #fffaea);
  border-radius: var(--mp-radii-md);
}
.myclaims-warning__icon { color: var(--mp-icon-warning, #e46910); flex-shrink: 0; }
.myclaims-warning__text { flex: 1; min-width: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-warning-bold, #a14a0b); line-height: var(--mp-line-heights-md); }

/* ── Summary stats · horizontally scrollable groups ── */
.myclaims-stats { display: flex; gap: var(--mp-spacing-6); overflow-x: auto; margin-top: var(--mp-spacing-4); }
.myclaims-group { display: flex; flex-direction: column; gap: var(--mp-spacing-2); min-width: 0; }
.myclaims-group__label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.myclaims-group__cards { display: flex; gap: var(--mp-spacing-3); }
.xpm-stat { flex: 0 0 auto; min-width: 180px; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: var(--mp-spacing-3) var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.xpm-stat__caption { font-size: 12px; color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }
.xpm-stat__label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; }
.xpm-stat__value { font-size: 20px; font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: 28px; }

/* ── Cells ── */
.cell-link { color: var(--mp-text-link); cursor: pointer; }
.cell-link:hover { text-decoration: underline; }

/* ── My limits drawer ── */
.limit-rows { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.limit-row { padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.limit-row__top { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.limit-row__name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.limit-row__amount { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.limit-row__caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); margin: 2px 0 var(--mp-spacing-3); }
.limit-bar { height: 6px; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle, #f1f5f9); overflow: hidden; }
.limit-bar__fill { height: 100%; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-brand-bold, #029861); }

/* ── Filter bar ── */
.filter-left { display:flex; align-items:center; gap:var(--mp-spacing-4); }
.filter-right { display:flex; align-items:center; gap:var(--mp-spacing-3); }
.filter-select-wrap { position:relative; display:inline-flex; align-items:center; width:160px; background:var(--mp-background-neutral); border:1px solid var(--mp-border-default); border-radius:var(--mp-radii-md); }
.filter-select { appearance:none; background:transparent; border:none; outline:none; width:100%; padding:var(--mp-spacing-2) var(--mp-spacing-10) var(--mp-spacing-2) var(--mp-spacing-3); font-size:var(--mp-font-sizes-md); line-height:var(--mp-line-heights-md); color:var(--mp-text-default); cursor:pointer; }
.filter-select-chevron { position:absolute; right:var(--mp-spacing-2); pointer-events:none; color:var(--mp-text-default); width:20px; height:20px; }
.filter-all-btn { display:inline-flex; align-items:center; gap:var(--mp-spacing-2); padding:var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3); background:var(--mp-background-neutral); border:1px solid var(--mp-border-bold); border-radius:var(--mp-radii-full,999px); font-size:var(--mp-font-sizes-md); font-weight:var(--mp-font-weights-semi-bold); line-height:var(--mp-line-heights-md); color:var(--mp-text-secondary); cursor:pointer; white-space:nowrap; }
.filter-all-btn:hover { background:var(--mp-background-neutral-hovered); }
.filter-btn-group { display:flex; align-items:center; }
.filter-icon-btn { display:flex; align-items:center; justify-content:center; width:36px; height:36px; padding:var(--mp-spacing-2); border:none; background:transparent; border-radius:var(--mp-radii-md); cursor:pointer; color:var(--mp-text-default); }
.filter-icon-btn:hover { background:var(--mp-background-neutral-hovered); }
.filter-search { display:flex; align-items:center; gap:var(--mp-spacing-2); width:248px; padding:var(--mp-spacing-2) var(--mp-spacing-3); background:var(--mp-background-neutral); border:1px solid var(--mp-border-default); border-radius:var(--mp-radii-full,999px); color:var(--mp-text-subtle); }
.filter-search-input { flex:1; border:none; outline:none; background:transparent; font-size:var(--mp-font-sizes-md); line-height:var(--mp-line-heights-md); color:var(--mp-text-default); min-width:0; }
.filter-search-input::placeholder { color:var(--mp-text-placeholder); }
.search-clear-btn { display:inline-flex; align-items:center; justify-content:center; flex-shrink:0; width:18px; height:18px; padding:0; border:none; background:none; cursor:pointer; color:var(--mp-text-secondary); border-radius:var(--mp-radii-full,999px); }
.search-clear-btn:hover { background:var(--mp-background-neutral-hovered); }
</style>
