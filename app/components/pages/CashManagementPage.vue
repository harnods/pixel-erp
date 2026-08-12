<script setup lang="ts">
/**
 * Cash management — index of every cash, bank and card account.
 *
 * Each row carries two balances: what the imported bank statement says and what
 * the books say. The gap between them is what the row's "Reconcile (n)" action
 * clears, so the button only appears when there are unreconciled transactions.
 */
import { MpToggle } from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { cashAccounts } from '~/data'
import type { CashAccount, CashAccountCurrency } from '~/data'
import { formatMoney } from '~/utils/currency'

const { t } = useLocale()
const router = useRouter()
const toggleAirene = inject<() => void>('toggleAirene')

function goToDetail(id: string) { router.push(`/cash-management/${id}`) }

// ─── Column definitions ───────────────────────────────────────────────────────

const columns: TableColumn[] = [
  { key: 'code',             label: 'Account code',      width: '160px',                 sortType: 'text'   },
  { key: 'name',             label: 'Account name',      width: '360px', sortable: true, sortType: 'text'   },
  { key: 'currency',         label: 'Currency',          width: '120px',                 sortType: 'text'   },
  { key: 'statementBalance', label: 'Statement balance', width: '200px', align: 'right', sortType: 'number' },
  { key: 'bookBalance',      label: 'Book balance',      width: '200px', align: 'right', sortType: 'number' },
]

// ─── Rows ─────────────────────────────────────────────────────────────────────

const showArchived = ref(false)

const rows = computed<CashAccount[]>(() =>
  cashAccounts.filter(a => showArchived.value || !a.isArchived)
)

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState(rows, {
  filterFn: (row: CashAccount, s) =>
    row.code.toLowerCase().includes(s) ||
    row.name.toLowerCase().includes(s) ||
    (row.accountNumber?.toLowerCase().includes(s) ?? false),
})

const hasActiveFilter = computed(() => !!search.value || showArchived.value)
function clearFilters() {
  search.value = ''
  showArchived.value = false
}

// ─── Formatters ───────────────────────────────────────────────────────────────


function formatDate(iso: string) {
  return new Intl.DateTimeFormat('id-ID', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  }).format(new Date(iso))
}

// ─── Column show/hide ─────────────────────────────────────────────────────────

const columnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(columns.map(c => [c.key, true])),
)
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter(c => columnVisibility[c.key]))
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
    :search="search"
    :has-active-filter="hasActiveFilter"
    filter-empty-label="account"
    actions-width="204px"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort="toggleSort"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >

    <!-- ── Stats ── -->
    <template #stats>
      <div class="stats-section">
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Total cash on hand') }}</div>
          <div class="stat-period">{{ t('As of today') }}</div>
          <div class="stat-amount">Rp238.025.000,00</div>
        </div>
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Expected receivables') }}</div>
          <div class="stat-period">{{ t('Due in 30 days') }}</div>
          <div class="stat-amount">Rp820.000.000,00</div>
        </div>
        <div class="stat-card stat-card--bordered">
          <div class="stat-title">{{ t('Expected payables') }}</div>
          <div class="stat-period">{{ t('Due in 30 days') }}</div>
          <div class="stat-amount">Rp50.000.000,00</div>
        </div>
        <div class="stat-card">
          <div class="stat-title">{{ t('Projected cash') }}</div>
          <div class="stat-period">{{ t('In 30 days') }}</div>
          <div class="stat-amount">Rp1.008.025.000,00</div>
        </div>
      </div>
    </template>

    <!-- ── Filter bar ── -->
    <template #filters>
      <div class="filter-left">
        <label class="archive-toggle">
          <MpToggle v-model:is-checked="showArchived" :aria-label="t('Show archived accounts')" />
          <span class="archive-toggle__label">{{ t('Show archived accounts') }}</span>
        </label>
      </div>

      <div class="filter-right">
        <div class="filter-btn-group">
          <button class="filter-icon-btn filter-icon-btn--airene btn-enterprise" :aria-label="t('Ask Airene')" @click="toggleAirene?.()">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
              <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
            </svg>
          </button>
          <ColumnSettingsMenu id="cm-columns" :items="columnItems" :visibility="columnVisibility" />
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
          <button v-if="search" class="search-clear-btn btn-enterprise" type="button" :aria-label="t('Clear search')" @click="search = ''">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
            </svg>
          </button>
        </div>
      </div>
    </template>

    <!-- ── Cell: Account name — bank name + account number underneath ── -->
    <template #cell-name="{ row }">
      <div class="account-cell">
        <span class="account-cell__name">
          <a class="cell-link account-cell__title" @click.stop="goToDetail((row as CashAccount).id)">{{ (row as CashAccount).name }}</a>
          <ErpStatusBadge v-if="(row as CashAccount).isConnected" status="active" label="Connected" />
        </span>
        <span v-if="(row as CashAccount).accountNumber" class="account-cell__number">
          {{ (row as CashAccount).accountNumber }}
        </span>
      </div>
    </template>

    <!-- ── Cell: Statement balance — amount + statement date underneath ── -->
    <template #cell-statementBalance="{ row }">
      <template v-if="(row as CashAccount).statementBalance === null">
        <span class="balance-cell__empty">{{ t('No statement imported') }}</span>
      </template>
      <div v-else class="balance-cell">
        <span>{{ formatMoney((row as CashAccount).statementBalance!, (row as CashAccount).statementCurrency ?? (row as CashAccount).currency) }}</span>
        <span v-if="(row as CashAccount).statementDate" class="balance-cell__date">
          {{ formatDate((row as CashAccount).statementDate!) }}
        </span>
      </div>
    </template>

    <!-- ── Cell: Book balance ── -->
    <template #cell-bookBalance="{ row }">
      {{ formatMoney((row as CashAccount).bookBalance, (row as CashAccount).currency) }}
    </template>

    <!-- ── Actions — Reconcile (n) + kebab ── -->
    <template #actions="{ row }">
      <div class="row-actions">
        <button
          v-if="(row as CashAccount).unreconciledCount > 0"
          class="btn-enterprise btn-enterprise--secondary"
        >
          {{ t('Reconcile') }} ({{ (row as CashAccount).unreconciledCount }})
        </button>
        <button class="row-kebab btn-enterprise" :aria-label="t('More actions')">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="12" cy="5" r="2" />
            <circle cx="12" cy="12" r="2" />
            <circle cx="12" cy="19" r="2" />
          </svg>
        </button>
      </div>
    </template>

    <!-- ── Empty state ── -->
    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-full__illustration" width="288" height="240" />
        <p class="empty-full__title">{{ t('No accounts yet') }}</p>
        <p class="empty-full__desc">{{ t('Cash, bank and card accounts will appear here once you add them.') }}</p>
      </div>
    </template>
  </ErpTablePage>
</template>

<style scoped>
/* ── Stats ──────────────────────────────────────────────────────────────── */

.stats-section {
  display: flex;
  gap: var(--mp-spacing-6);
  align-items: flex-start;
}

.stat-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  padding-right: var(--mp-spacing-6);
  align-self: stretch;
}

.stat-card--bordered {
  border-right: 1px solid var(--mp-border-default);
}

.stat-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
  white-space: nowrap;
}

.stat-period {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px);
  white-space: nowrap;
}

.stat-amount {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-2xl, 32px);
  white-space: nowrap;
}

/* ── Filter bar ─────────────────────────────────────────────────────────── */

.filter-left {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-4);
}

.filter-right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}

.archive-toggle {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-3);
  cursor: pointer;
}

.archive-toggle__label {
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  white-space: nowrap;
}

.filter-btn-group {
  display: flex;
  align-items: center;
}

.filter-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px);
  height: var(--mp-sizes-9, 36px);
  padding: var(--mp-spacing-2);
  border: none;
  background: transparent;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  color: var(--mp-text-default);
}
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-icon-btn--airene { color: var(--mp-airene-default); }

.filter-search {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  width: var(--mp-sizes-62, 248px);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}

.filter-search-input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-default);
  min-width: 0;
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

/* ── Cells ──────────────────────────────────────────────────────────────── */

.account-cell {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-0\.5, 2px);
  min-width: 0;
}

.account-cell__name {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  min-width: 0;
}

.account-cell__title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.account-cell__number {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}

.balance-cell {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-0\.5, 2px);
}

.balance-cell__date {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}

.balance-cell__empty {
  color: var(--mp-text-secondary);
}

/* ── Row actions ────────────────────────────────────────────────────────── */

.row-actions {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
}

/* Fixed width so "Reconcile (1)" and "Reconcile (50)" line up down the column. */
.row-actions .btn-enterprise {
  min-width: 140px;
}

.row-kebab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-8, 32px);
  height: var(--mp-sizes-8, 32px);
  border: none;
  background: transparent;
  cursor: pointer;
  border-radius: var(--mp-radii-md);
  color: var(--mp-text-secondary);
  flex-shrink: 0;
}
.row-kebab:hover {
  background: var(--mp-background-neutral-hovered);
  color: var(--mp-text-default);
}

/* ── Empty state ────────────────────────────────────────────────────────── */

.empty-full {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-10, 40px) 0;
}
.empty-full__illustration {
  width: var(--mp-sizes-72, 288px);
  height: var(--mp-sizes-60, 240px);
  object-fit: contain;
  margin-bottom: var(--mp-spacing-1);
}
.empty-full__title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.empty-full__desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
</style>
