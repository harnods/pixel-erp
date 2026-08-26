<script setup lang="ts">
/**
 * XpmBudgetingPage · XPM (Mekari Expense) budgeting.
 *
 * Single "Configured budgets" table (Budgeting has no section tabs in the shell).
 * The title-bar primary "Set budget" button lives in `[...slug].vue` and fires the
 * `'setBudget'` action on the XPM action bus · this page watches for it and opens a
 * floating "New budget" drawer. Built on ErpTablePage + useTableState.
 */
import {
  MpIcon, MpButton, MpButtonGroup,
  MpDrawer, MpDrawerContent, MpDrawerBody, MpDrawerOverlay,
  MpFormControl, MpFormLabel, MpInput, MpInputGroup, MpInputLeftAddon, MpText, MpSelect,
  toast,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { xpmBudgets, type XpmBudgetRow } from '~/data/xpm'
import { formatIDR } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'
import { useXpmActions } from '~/composables/useXpmActions'

// ── Summary cards ──
const stats = [
  { caption: 'Monthly cap',        value: formatIDR(60000000) },
  { caption: 'Spent this period',  value: formatIDR(46200000) },
  { caption: 'Utilization',        value: '77%' },
]

// ── Filter bar ──
const periodOptions = ['Weekly', 'Monthly', 'Quarterly', 'Yearly']
const searchPlaceholder = 'Search budget scope…'

const rows = computed<XpmBudgetRow[]>(() => xpmBudgets)

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort,
} = useTableState(rows, {
  perPage: 25,
  filterFn: (row, s, st) =>
    (row.scope.toLowerCase().includes(s) || row.category.toLowerCase().includes(s)) &&
    (!st || row.period === st),
})

const columns: TableColumn[] = [
  { key: 'scope',    label: 'Scope',    width: '200px' },
  { key: 'period',   label: 'Period',   width: '140px' },
  { key: 'category', label: 'Category', width: '180px' },
  { key: 'cap',      label: 'Cap',      width: '160px', align: 'right', sortable: true, sortType: 'number' },
  { key: 'spent',    label: 'Spent',    width: '160px', align: 'right', sortable: true, sortType: 'number' },
  { key: 'type',     label: 'Type',     width: '140px' },
]

// ── "Set budget" drawer, opened from the shell title-bar action bus ──
const { pending } = useXpmActions()
const showBudgetDrawer = ref(false)
watch(() => pending.value, (p) => { if (p?.action === 'setBudget') showBudgetDrawer.value = true })

const bOrganization = ref('Company')
const bBranch = ref('All branches')
const bPeriod = ref('Monthly')
const bCategory = ref('All spend')
const bCap = ref('')

function closeBudget() { showBudgetDrawer.value = false }
function saveBudget() {
  closeBudget()
  toast.notify({ variant: 'success', title: 'Budget saved.', maxWidth: 'max-content' })
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
    filter-empty-label="budget"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
  >
    <!-- ── Summary cards ── -->
    <template #stats>
      <div class="xpm-stats">
        <div v-for="s in stats" :key="s.caption" class="xpm-stat">
          <span class="xpm-stat__caption">{{ s.caption }}</span>
          <span class="xpm-stat__value">{{ s.value }}</span>
        </div>
      </div>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <div class="filter-select-wrap">
          <select class="filter-select" v-model="statusFilter">
            <option value="">Period</option>
            <option v-for="o in periodOptions" :key="o" :value="o">{{ o }}</option>
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
    <template #cell-cap="{ value }">{{ formatIDR(value as number) }}</template>
    <template #cell-spent="{ value }">{{ formatIDR(value as number) }}</template>
    <template #cell-type="{ row }">
      <ErpStatusBadge
        :status="(row as any).type"
        :type="(row as any).type === 'Hard cap' ? 'critical' : (row as any).type === 'Flag' ? 'warning' : 'information'"
      />
    </template>
  </ErpTablePage>

  <!-- ── New budget drawer ── -->
  <MpDrawer
    id="xpm-budget-drawer"
    :is-open="showBudgetDrawer"
    placement="right"
    size="lg"
    variant="floating"
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="closeBudget"
  >
    <MpDrawerContent>
      <!-- Floating variant: MpDrawerBody is the white card · header / scroll body /
           footer all live inside it. -->
      <MpDrawerBody>
        <div class="bd-card">
          <div class="bd-header">
            <span class="bd-title">New budget</span>
            <MpButton left-icon="close" variant="ghost" size="sm" aria-label="Close" @click="closeBudget" />
          </div>

          <div class="bd-form">
            <!-- 1 · WHO -->
            <section class="bd-section">
              <h3 class="bd-section__head">1 · WHO</h3>
              <p class="bd-section__hint">Choose which part of the organization this budget applies to.</p>
              <MpFormControl id="bd-org">
                <MpFormLabel>Organization</MpFormLabel>
                <MpSelect id="bd-org-select" v-model="bOrganization" is-full-width>
                  <option value="Company">Company</option>
                  <option value="Sales">Sales</option>
                  <option value="Organization-wide">Organization-wide</option>
                </MpSelect>
              </MpFormControl>
              <MpFormControl id="bd-branch">
                <MpFormLabel>Branch</MpFormLabel>
                <MpSelect id="bd-branch-select" v-model="bBranch" is-full-width>
                  <option value="All branches">All branches</option>
                  <option value="Jakarta branch">Jakarta branch</option>
                  <option value="Bandung branch">Bandung branch</option>
                </MpSelect>
              </MpFormControl>
            </section>

            <!-- 2 · PERIOD -->
            <section class="bd-section">
              <h3 class="bd-section__head">2 · PERIOD</h3>
              <p class="bd-section__hint">How often the cap resets.</p>
              <div class="bd-pills">
                <button
                  v-for="p in periodOptions"
                  :key="p"
                  type="button"
                  class="bd-pill"
                  :class="{ 'bd-pill--active': bPeriod === p }"
                  @click="bPeriod = p"
                >{{ p }}</button>
              </div>
            </section>

            <!-- 3 · CATEGORY CAPS -->
            <section class="bd-section">
              <h3 class="bd-section__head">3 · CATEGORY CAPS</h3>
              <p class="bd-section__hint">Set the spending ceiling for a category.</p>
              <div class="bd-cap-row">
                <MpFormControl id="bd-cap-cat">
                  <MpFormLabel>Category</MpFormLabel>
                  <MpSelect id="bd-cap-cat-select" v-model="bCategory" is-full-width>
                    <option value="All spend">All spend</option>
                    <option value="Meals">Meals</option>
                    <option value="Transport">Transport</option>
                    <option value="Software">Software</option>
                    <option value="Accommodation">Accommodation</option>
                  </MpSelect>
                </MpFormControl>
                <MpFormControl id="bd-cap-amount">
                  <MpFormLabel>Cap</MpFormLabel>
                  <MpInputGroup id="bd-cap-amount-group" size="md">
                    <MpInputLeftAddon id="bd-cap-amount-addon" has-background>
                      <MpText weight="semiBold" class="bd-rp">Rp</MpText>
                    </MpInputLeftAddon>
                    <MpInput id="bd-cap-amount-input" v-model="bCap" placeholder="0" is-full-width />
                  </MpInputGroup>
                </MpFormControl>
              </div>
            </section>
          </div>

          <div class="bd-footer">
            <MpButtonGroup>
              <MpButton variant="ghost" is-rounded @click="closeBudget">Cancel</MpButton>
              <MpButton variant="primary" is-rounded @click="saveBudget">Save budget</MpButton>
            </MpButtonGroup>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>
</template>

<style scoped>
/* ── Summary cards ── */
.xpm-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--mp-spacing-4);
}
.xpm-stat {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-4);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral);
}
.xpm-stat__caption {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.xpm-stat__value {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
@media (max-width: 900px) {
  .xpm-stats { grid-template-columns: 1fr; }
}

/* ── Filter bar (canonical ERP markup) ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-select-wrap { position: relative; display: inline-flex; align-items: center; width: 160px; background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.filter-select { appearance: none; background: transparent; border: none; outline: none; width: 100%; padding: var(--mp-spacing-2) var(--mp-spacing-10) var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); cursor: pointer; }
.filter-select-chevron { position: absolute; right: var(--mp-spacing-2); pointer-events: none; color: var(--mp-text-default); width: 20px; height: 20px; }
.filter-all-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap; }
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: var(--mp-spacing-2); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default); }
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); min-width: 0; }
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-text-secondary); border-radius: var(--mp-radii-full, 999px); }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

/* ── New budget drawer (floating card) ── */
.bd-card { display: flex; flex-direction: column; height: 100%; }
.bd-header {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.bd-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bd-form { display: flex; flex-direction: column; gap: var(--mp-spacing-6); flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); }
.bd-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.bd-section__head { margin: 0; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); letter-spacing: 0.04em; color: var(--mp-text-secondary); }
.bd-section__hint { margin: 0 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.bd-pills { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2); }
.bd-pill {
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral); color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-md); cursor: pointer;
}
.bd-pill--active { border-color: var(--mp-border-selected, #0f6d4d); background: var(--mp-background-nav-stack-hovered, #d6f4e9); font-weight: var(--mp-font-weights-semi-bold); }
.bd-cap-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4); }
.bd-rp { padding-inline: var(--mp-spacing-1\.5, 6px); }
.bd-footer {
  display: flex; justify-content: flex-end;
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
</style>
