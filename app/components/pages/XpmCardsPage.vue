<script setup lang="ts">
/**
 * XpmCardsPage · XPM (Mekari Expense) spending cards index.
 *
 * Built on the shared ErpTablePage + useTableState pattern. The section tabs
 * (Virtual cards / Physical cards) are owned by the shell (`[...slug].vue` ›
 * pageTabs) · this page reads the active tab from the URL and filters `xpmCards`
 * by `type`. The title-bar "New card" primary button reaches the page through the
 * useXpmActions bus, which opens the create drawer.
 */
import {
  MpIcon, MpDrawer, MpDrawerContent, MpDrawerBody, MpDrawerOverlay,
  MpFormControl, MpFormLabel, MpInput, MpSelect, MpRadio, MpFlex, MpText, MpButton, toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { xpmCards, xpmBadgeType, type XpmCard } from '~/data/xpm'
import { formatIDR } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'
import { useXpmActions } from '~/composables/useXpmActions'

const router = useRouter()
const route = useRoute()
const activeTab = computed(() => (route.query.tab as string) || 'Virtual cards')

// Section tab → card list, filtered by card type.
const cardType = computed<XpmCard['type']>(() => (activeTab.value === 'Physical cards' ? 'Physical' : 'Virtual'))
const rows = computed<XpmCard[]>(() => xpmCards.filter(c => c.type === cardType.value))

// ── Summary cards ──
const stats = [
  { label: 'Active cards',         value: '12' },
  { label: 'Inactive',             value: '8' },
  { label: 'Card creation credit', value: '20' },
]

// ── Filter bar ──
const statusOptions = ['Active', 'Inactive', 'Frozen']
const searchPlaceholder = 'Search cardholder/card name…'

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort,
} = useTableState(rows, {
  perPage: 25,
  filterFn: (row, s, st) =>
    (row.cardholder.toLowerCase().includes(s) || row.name.toLowerCase().includes(s)) &&
    (!st || row.status === st),
})

const columns: TableColumn[] = [
  { key: 'name',       label: 'Card name',    kind: 'name', sortable: true, sortType: 'text' },
  { key: 'cardholder', label: 'Cardholder',   kind: 'name' },
  { key: 'expiration', label: 'Expiration',   kind: 'date' },
  { key: 'balance',    label: 'Card balance', kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'account',    label: 'Account',      kind: 'name' },
  { key: 'status',     label: 'Status',       kind: 'status' },
]

// ── Create drawer ──
const showCreateDrawer = ref(false)
const { pending } = useXpmActions()
watch(() => pending.value, (p) => { if (p?.action === 'createCard') showCreateDrawer.value = true })

const cardholderOptions = ['Priya Sharma', 'Daniel Reyes', 'Maya Chen', 'Tom Okafor', 'Indah Permata', 'Rizal Candra', 'Eka Setiawan']
const accountOptions = ['Card float', 'Reimbursement pool', 'Main account']

const form = reactive({ name: '', cardholder: '', type: 'Virtual', spendLimit: '', account: '' })
function resetForm() {
  form.name = ''
  form.cardholder = ''
  form.type = 'Virtual'
  form.spendLimit = ''
  form.account = ''
}
watch(showCreateDrawer, (open) => { if (open) resetForm() })

function closeDrawer() { showCreateDrawer.value = false }
function createCard() {
  closeDrawer()
  toast.notify({ variant: 'success', title: 'Card created.', maxWidth: 'max-content' })
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
    filter-empty-label="card"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
  >
    <!-- ── Summary cards ── -->
    <template #stats>
      <div class="xpm-stats">
        <div v-for="s in stats" :key="s.label" class="xpm-stat">
          <span class="xpm-stat__label">{{ s.label }}</span>
          <span class="xpm-stat__value">{{ s.value }}</span>
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
    <template #cell-name="{ row }">
      <span class="cell-link" @click="router.push(`/xpm-cards/${(row as XpmCard).id}`)">{{ (row as XpmCard).name }}</span>
    </template>
    <template #cell-cardholder="{ row }">
      <div class="stack-cell">
        <span class="stack-cell__main">{{ (row as XpmCard).cardholder }}</span>
        <span class="stack-cell__sub">{{ (row as XpmCard).cardholderCode }}</span>
      </div>
    </template>
    <template #cell-balance="{ value }">{{ formatIDR(value as number) }}</template>
    <template #cell-status="{ row }">
      <ErpStatusBadge :status="(row as XpmCard).status" :label="(row as XpmCard).status" :type="xpmBadgeType((row as XpmCard).status)" />
    </template>
  </ErpTablePage>

  <!-- ── New card drawer ── -->
  <MpDrawer :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="xpm-new-card-drawer"
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
            <MpText weight="semiBold">New card</MpText>
            <MpButton left-icon="close" variant="ghost" size="sm" aria-label="Close" @click="closeDrawer" />
          </div>
          <div class="xd-form">
            <MpFormControl id="xc-name" is-required>
              <MpFormLabel>Card name</MpFormLabel>
              <MpInput id="xc-name-input" v-model="form.name" is-full-width placeholder="e.g. Marketing subscriptions" />
            </MpFormControl>

            <MpFormControl id="xc-holder" is-required>
              <MpFormLabel>Cardholder</MpFormLabel>
              <MpSelect id="xc-holder-select" v-model="form.cardholder" placeholder="Select cardholder">
                <option v-for="o in cardholderOptions" :key="o" :value="o">{{ o }}</option>
              </MpSelect>
            </MpFormControl>

            <MpFormControl id="xc-type" is-required>
              <MpFormLabel>Type</MpFormLabel>
              <MpFlex direction="column" gap="0">
                <MpRadio id="xc-type-virtual" value="Virtual" v-model="form.type">Virtual</MpRadio>
                <MpRadio id="xc-type-physical" value="Physical" v-model="form.type">Physical</MpRadio>
              </MpFlex>
            </MpFormControl>

            <MpFormControl id="xc-limit">
              <MpFormLabel>Spend limit</MpFormLabel>
              <MpInput id="xc-limit-input" v-model="form.spendLimit" is-full-width placeholder="0" />
            </MpFormControl>

            <MpFormControl id="xc-account" is-required>
              <MpFormLabel>Funding account</MpFormLabel>
              <MpSelect id="xc-account-select" v-model="form.account" placeholder="Select account">
                <option v-for="o in accountOptions" :key="o" :value="o">{{ o }}</option>
              </MpSelect>
            </MpFormControl>
          </div>
          <div class="xd-footer">
            <MpButton variant="ghost" is-rounded @click="closeDrawer">Cancel</MpButton>
            <MpButton variant="primary" is-rounded @click="createCard">Create card</MpButton>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>
</template>

<style scoped>
/* ── Stacked cell (cardholder name + code) ── */
.stack-cell { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.stack-cell__main { color: var(--mp-text-default); }
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

/* ── Stats (verbatim ERP block) ── */
.xpm-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--mp-spacing-4); margin-bottom: var(--mp-spacing-5); }
.xpm-stat { border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 8px); padding: var(--mp-spacing-4) var(--mp-spacing-5); }
.xpm-stat__label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.xpm-stat__value { margin-top: var(--mp-spacing-1); font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

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
