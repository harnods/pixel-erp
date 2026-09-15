<script setup lang="ts">
/**
 * XpmPurchasesPage · XPM (Mekari Expense) purchasing documents index.
 *
 * Built on the shared ErpTablePage + useTableState pattern. Section tabs
 * (Invoice / Order / Quote / Request) are owned by the shell (`[...slug].vue` ›
 * pageTabs) · this page reads the active tab from the URL and filters
 * `xpmPurchases` by `type`. On the Request tab the 2nd column switches from
 * "Vendor" to "Requester". The title-bar "New purchase" primary button reaches
 * the page through the useXpmActions bus, which opens the create drawer.
 */
import {
  MpIcon, MpDrawer, MpDrawerContent, MpDrawerBody, MpDrawerOverlay,
  MpFormControl, MpFormLabel, MpInput, MpSelect, MpTextarea, MpText, MpButton, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { xpmPurchases, xpmBadgeType, type XpmPurchase, type XpmPurchaseType } from '~/data/xpm'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import { useXpmActions } from '~/composables/useXpmActions'

const router = useRouter()
const route = useRoute()
const activeTab = computed<XpmPurchaseType>(() => (route.query.tab as XpmPurchaseType) || 'Invoice')
const isRequest = computed(() => activeTab.value === 'Request')

// Section tab → documents, filtered by purchase type.
const rows = computed<XpmPurchase[]>(() => xpmPurchases.filter(p => p.type === activeTab.value))

// ── Filter bar ──
const statusOptions = ['Awaiting payment', 'Awaiting review', 'Paid', 'Overdue']
const searchPlaceholder = 'Search document or vendor…'

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort,
} = useTableState(rows, {
  perPage: 25,
  filterFn: (row, s, st) =>
    (row.document.toLowerCase().includes(s) || row.vendor.toLowerCase().includes(s) || row.requester.toLowerCase().includes(s)) &&
    (!st || row.status === st),
})

// 2nd column swaps Vendor → Requester on the Request tab (key drives #cell-party).
const columns = computed<TableColumn[]>(() => [
  { key: 'document', label: 'Document', kind: 'number' },
  { key: 'party',    label: isRequest.value ? 'Requester' : 'Vendor', kind: 'name' },
  { key: 'date',     label: 'Date',   kind: 'date', sortable: true, sortType: 'date' },
  { key: 'due',      label: 'Due',    kind: 'date', sortable: true, sortType: 'date' },
  { key: 'status',   label: 'Status', kind: 'status' },
  { key: 'total',    label: 'Total',  kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
])

// ── Create drawer ──
const showCreateDrawer = ref(false)
const { pending } = useXpmActions()
watch(() => pending.value, (p) => { if (p?.action === 'createPurchase') showCreateDrawer.value = true })

const typeOptions: XpmPurchaseType[] = ['Invoice', 'Order', 'Quote', 'Request']
const form = reactive({ type: 'Invoice', vendor: '', document: '', date: '', amount: '', description: '' })
function resetForm() {
  form.type = 'Invoice'
  form.vendor = ''
  form.document = ''
  form.date = ''
  form.amount = ''
  form.description = ''
}
watch(showCreateDrawer, (open) => { if (open) resetForm() })

function closeDrawer() { showCreateDrawer.value = false }
function createPurchase() {
  closeDrawer()
  toast.notify({ variant: 'success', title: 'Purchase created.', maxWidth: 'max-content' })
}
</script>

<template>
  <ErpTablePage
    :columns="columns"
    :rows="paginated"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :has-active-search="!!search"
    :has-active-filter="!!statusFilter"
    :search="search"
    filter-empty-label="document"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
  >
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
    <template #cell-document="{ row }">
      <div class="stack-cell">
        <span class="cell-link">{{ (row as XpmPurchase).document }}</span>
        <span class="stack-cell__sub">{{ (row as XpmPurchase).lineSummary }}</span>
      </div>
    </template>
    <template #cell-party="{ row }">{{ isRequest ? (row as XpmPurchase).requester : (row as XpmPurchase).vendor }}</template>
    <template #cell-date="{ value }">{{ formatDate(value as string) }}</template>
    <template #cell-due="{ value }">{{ formatDate(value as string) }}</template>
    <template #cell-status="{ row }">
      <ErpStatusBadge :status="(row as XpmPurchase).status" :label="(row as XpmPurchase).status" :type="xpmBadgeType((row as XpmPurchase).status)" />
    </template>
    <template #cell-total="{ value }">{{ formatIDR(value as number) }}</template>
  </ErpTablePage>

  <!-- ── New purchase drawer ── -->
  <MpDrawer :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="xpm-new-purchase-drawer"
    :is-open="showCreateDrawer"
    placement="right"
    size="md"
    variant="floating"
    :is-keep-alive="false"
    @close="closeDrawer"
  >
    <MpDrawerContent>
      <MpDrawerBody>
        <div class="xd-card">
          <div class="xd-header">
            <MpText weight="semiBold">New purchase</MpText>
            <MpButton left-icon="close" variant="ghost" size="sm" aria-label="Close" @click="closeDrawer" />
          </div>
          <div class="xd-form">
            <MpFormControl id="xp-type" is-required>
              <MpFormLabel>Type</MpFormLabel>
              <MpSelect id="xp-type-select" v-model="form.type" placeholder="Select type">
                <option v-for="o in typeOptions" :key="o" :value="o">{{ o }}</option>
              </MpSelect>
            </MpFormControl>

            <MpFormControl id="xp-vendor" is-required>
              <MpFormLabel>Vendor</MpFormLabel>
              <MpInput id="xp-vendor-input" v-model="form.vendor" is-full-width placeholder="Enter vendor" />
            </MpFormControl>

            <MpFormControl id="xp-doc" is-required>
              <MpFormLabel>Document no.</MpFormLabel>
              <MpInput id="xp-doc-input" v-model="form.document" is-full-width placeholder="e.g. PI-64500" />
            </MpFormControl>

            <MpFormControl id="xp-date" is-required>
              <MpFormLabel>Date</MpFormLabel>
              <MpInput id="xp-date-input" v-model="form.date" is-full-width placeholder="DD/MM/YYYY" />
            </MpFormControl>

            <MpFormControl id="xp-amount" is-required>
              <MpFormLabel>Amount</MpFormLabel>
              <MpInput id="xp-amount-input" v-model="form.amount" is-full-width placeholder="0" />
            </MpFormControl>

            <MpFormControl id="xp-desc">
              <MpFormLabel>Description</MpFormLabel>
              <MpTextarea id="xp-desc-input" v-model="form.description" :rows="3" is-full-width placeholder="Optional notes about this purchase" />
            </MpFormControl>
          </div>
          <div class="xd-footer">
            <MpButton variant="ghost" is-rounded @click="closeDrawer">Cancel</MpButton>
            <MpButton variant="primary" is-rounded @click="createPurchase">Create</MpButton>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>
</template>

<style scoped>
/* ── Stacked cell (document + line summary) ── */
.stack-cell { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); align-items: flex-start; }
.stack-cell__sub { font-size: 12px; color: var(--mp-text-secondary); }

/* ── Drawer (floating card) ── */
.xd-card { display: flex; flex-direction: column; height: 100%; }
.xd-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
}
.xd-form {
  display: flex; flex-direction: column; gap: var(--mp-spacing-5);
  flex: 1; overflow-y: auto;
  padding: var(--mp-spacing-4);
}
.xd-footer {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}

/* ── Filter bar (verbatim ERP block) ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-select-wrap { position: relative; display: inline-flex; align-items: center; width: 160px; height: var(--mp-sizes-9\.5, 38px); background: var(--mp-colors-background-neutral, #fff); border: 1px solid var(--mp-colors-border-form, #1d1f2429); border-radius: var(--mp-radii-md); }
.filter-select { appearance: none; background: transparent; border: none; outline: none; width: 100%; padding: var(--mp-spacing-2) var(--mp-spacing-10) var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); cursor: pointer; }
.filter-select-chevron { position: absolute; right: var(--mp-spacing-2); pointer-events: none; color: var(--mp-text-default); width: 20px; height: 20px; }
.filter-all-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral, #ffffff); border: 1px solid var(--mp-border-bold, #8c9596); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap; }
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: var(--mp-spacing-2); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default); }
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral, #ffffff); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); min-width: 0; }
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-text-secondary); border-radius: var(--mp-radii-full, 999px); }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.cell-link { color: var(--mp-text-link); cursor: pointer; }
.cell-link:hover { text-decoration: underline; }
</style>
