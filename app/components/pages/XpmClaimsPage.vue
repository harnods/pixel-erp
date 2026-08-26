<script setup lang="ts">
/**
 * XPM Claims — admin index of employee reimbursement & cash-advance claims.
 * Standard ERP index pattern: filter bar + summary stats + custom table
 * (ErpTablePage + useTableState). The title-bar "Manage claim policy" button
 * lives in the shell and fires the `claimPolicy` action bus, which opens the
 * read-only Claim policy drawer here.
 */
import {
  MpIcon, MpButton, MpDrawer, MpDrawerContent, MpDrawerHeader, MpDrawerBody,
  MpDrawerFooter, MpDrawerCloseButton, MpDrawerOverlay, MpButtonGroup, MpToggle,
  MpInputGroup, MpInput, MpInputLeftAddon,
} from '@mekari/pixel3'
import { toast } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { formatDateTime } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { xpmClaims, xpmBadgeType, type XpmClaim } from '~/data/xpm'
import { useXpmActions } from '~/composables/useXpmActions'

const router = useRouter()

// ── Title-bar action bus — "Manage claim policy" opens the policy drawer ──
const showPolicyDrawer = ref(false)
const { pending } = useXpmActions()
watch(() => pending.value, (p) => { if (p?.action === 'claimPolicy') showPolicyDrawer.value = true })

// ── Filter bar ──
const statusOptions = ['Settled', 'Disbursed', 'Declined', 'Awaiting disbursement', 'Awaiting approval']
const searchPlaceholder = 'Search transaction id…'

// ── Table state ──
const rawRows = computed<XpmClaim[]>(() => xpmClaims)
const { search, statusFilter, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, toggleSort } =
  useTableState<XpmClaim>(rawRows, {
    perPage: 25,
    filterFn: (row, s, st) => row.id.toLowerCase().includes(s) && (!st || row.status === st),
  })

const columns: TableColumn[] = [
  { key: 'id',          label: 'Transaction number', width: '160px', sortable: true, sortType: 'text' },
  { key: 'requestDate', label: 'Request date',       width: '200px', sortable: true, sortType: 'date' },
  { key: 'claimType',   label: 'Claim type',         width: '160px',                 sortType: 'text' },
  { key: 'category',    label: 'Claim category',     width: '220px',                 sortType: 'text' },
  { key: 'status',      label: 'Status',             width: '180px' },
  { key: 'amount',      label: 'Amount', align: 'right', width: '160px', sortable: true, sortType: 'number' },
]

// ── Policy drawer ──
const receiptRequired = ref(true)
const autoApproveThreshold = ref('100.000')
const policyCategories = [
  { name: 'Meals',        cap: 'Rp200.000 / day' },
  { name: 'Transport',    cap: 'Rp500.000 / week' },
  { name: 'Accommodation',cap: 'Rp1.500.000 / night' },
  { name: 'Software',     cap: 'Rp5.000.000 / month' },
]
function savePolicy() {
  showPolicyDrawer.value = false
  toast.notify({ variant: 'success', title: 'Policy saved.', maxWidth: 'max-content' })
}
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
    <!-- ── Summary stats ── -->
    <template #stats>
      <div class="xpm-stats">
        <div class="xpm-stat">
          <div class="xpm-stat__caption">Total</div>
          <div class="xpm-stat__label">Awaiting approval</div>
          <div class="xpm-stat__value">{{ formatIDR(3145000) }}</div>
        </div>
        <div class="xpm-stat">
          <div class="xpm-stat__caption">Total</div>
          <div class="xpm-stat__label">Awaiting disbursement</div>
          <div class="xpm-stat__value">{{ formatIDR(954000) }}</div>
        </div>
        <div class="xpm-stat">
          <div class="xpm-stat__caption">Total</div>
          <div class="xpm-stat__label">Disbursed this month</div>
          <div class="xpm-stat__value">{{ formatIDR(4682000) }}</div>
        </div>
      </div>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <div class="filter-select-wrap">
          <select class="filter-select" v-model="statusFilter">
            <option value="">Status</option>
            <option v-for="o in statusOptions" :key="o" :value="o">{{ o }}</option>
          </select>
          <svg class="filter-select-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </div>
        <button class="filter-all-btn"><MpIcon name="filter" size="md" /> All filters</button>
      </div>
      <div class="filter-right">
        <div class="filter-btn-group">
          <button class="filter-icon-btn" aria-label="Export" @click="infoToast('Export — coming soon')"><MpIcon name="download" size="md" /></button>
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
      <span class="cell-link" @click="router.push('/xpm-claims')">{{ (row as XpmClaim).id }}</span>
    </template>
    <template #cell-requestDate="{ value }">{{ formatDateTime(value as string) }}</template>
    <template #cell-category="{ row }">
      <div class="cell-stacked">
        <span class="cell-stacked__primary">{{ (row as XpmClaim).category }}</span>
        <span class="cell-stacked__secondary">{{ (row as XpmClaim).subCategory }}</span>
      </div>
    </template>
    <template #cell-status="{ row }">
      <ErpStatusBadge :status="(row as XpmClaim).status" :label="(row as XpmClaim).status" :type="xpmBadgeType((row as XpmClaim).status)" />
    </template>
    <template #cell-amount="{ value }">{{ formatIDR(value as number) }}</template>
  </ErpTablePage>

  <!-- ── Claim policy drawer ── -->
  <MpDrawer id="xpm-claim-policy" :is-open="showPolicyDrawer" variant="floating" placement="right" size="md" @close="showPolicyDrawer = false">
    <MpDrawerContent>
      <MpDrawerHeader>Claim policy <MpDrawerCloseButton /></MpDrawerHeader>
      <MpDrawerBody>
        <section class="policy-section">
          <h3 class="policy-heading">Categories &amp; caps</h3>
          <div class="policy-rows">
            <div v-for="c in policyCategories" :key="c.name" class="policy-row">
              <span class="policy-row__name">{{ c.name }}</span>
              <span class="policy-row__cap">{{ c.cap }}</span>
            </div>
          </div>
        </section>

        <section class="policy-section">
          <div class="policy-toggle-row">
            <div>
              <div class="policy-field-label">Receipt required</div>
              <div class="policy-field-hint">Employees must attach a receipt before submitting.</div>
            </div>
            <MpToggle v-model:is-checked="receiptRequired" aria-label="Receipt required" />
          </div>
        </section>

        <section class="policy-section">
          <div class="policy-field-label">Auto-approve threshold</div>
          <div class="policy-field-hint">Claims at or below this amount are approved automatically.</div>
          <MpInputGroup id="xpm-auto-approve-group" is-full-width>
            <MpInputLeftAddon>Rp</MpInputLeftAddon>
            <MpInput id="xpm-auto-approve" v-model="autoApproveThreshold" />
          </MpInputGroup>
        </section>

        <section class="policy-section">
          <p class="policy-note">Claims above the threshold are routed to the claimant's direct manager, then Finance for disbursement.</p>
        </section>
      </MpDrawerBody>
      <MpDrawerFooter>
        <MpButtonGroup>
          <MpButton is-rounded variant="ghost" @click="showPolicyDrawer = false">Cancel</MpButton>
          <MpButton is-rounded variant="primary" @click="savePolicy">Save policy</MpButton>
        </MpButtonGroup>
      </MpDrawerFooter>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>
</template>

<style scoped>
/* ── Summary stats ── */
.xpm-stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--mp-spacing-4); }
.xpm-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding: var(--mp-spacing-4); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.xpm-stat__caption { font-size: 12px; color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }
.xpm-stat__label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); }
.xpm-stat__value { font-size: 24px; font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: 32px; }

/* ── Cells ── */
.cell-link { color: var(--mp-text-link); cursor: pointer; }
.cell-link:hover { text-decoration: underline; }
.cell-stacked { display: flex; flex-direction: column; gap: 2px; }
.cell-stacked__primary { color: var(--mp-text-default); }
.cell-stacked__secondary { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }

/* ── Policy drawer ── */
.policy-section { padding-bottom: var(--mp-spacing-5); margin-bottom: var(--mp-spacing-5); border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default)); }
.policy-section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
.policy-heading { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: 0 0 var(--mp-spacing-3); }
.policy-rows { display: flex; flex-direction: column; }
.policy-row { display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-default); }
.policy-row:last-child { border-bottom: none; }
.policy-row__name { color: var(--mp-text-default); }
.policy-row__cap { color: var(--mp-text-secondary); }
.policy-toggle-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.policy-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.policy-field-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); margin: 2px 0 var(--mp-spacing-2); }
.policy-note { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md); margin: 0; }

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
