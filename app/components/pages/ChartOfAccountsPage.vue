<!-- prod-parity: jurnal-frontend-app/src/pages/accounts/index.vue -->
<script setup lang="ts">
/**
 * Accounting → Chart of accounts (prod "Accounts lists", /v3/accounts/chart_of_accounts).
 * Filters: Displayed columns · Account category · Show archived accounts; search by
 * code or name. Header accounts carry a caret that collapses their sub-accounts.
 * Balances come from the shared ledger (chartOfAccounts.ts). Title-bar Actions /
 * Create menus live in [...slug].vue and reach this page through `coaAction`.
 */
import { type Ref } from 'vue'
import {
  MpButton, MpIcon, MpToggle, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ExportModal from '~/components/patterns/ExportModal.vue'
import { formatIDR } from '~/utils/currency'
import { infoToast, successToast } from '~/utils/toasts'
import { SIM_TODAY_ISO } from '~/data/simClock'
import {
  coaRecords, ACCOUNT_CATEGORIES, categoryOf, categoryRank, accountBalance, hasTransactions, isDefaultAccount,
  isHeader, childrenOf, setArchived, deleteAccount, type CoaRecord,
} from '~/data/chartOfAccounts'
// Side effect: posts published closing books' closing entries into the shared ledger.
import '~/data/closeBooks'

const { t } = useLocale()
const router = useRouter()

type Row = CoaRecord & {
  depth: number
  hasChildren: boolean
  categoryName: string
  balance: number
  locked: boolean
  isDefault: boolean
}

// ── Filters ──
const categoryFilter = ref('')
const showArchived = ref(false)
const categoryOptions = ACCOUNT_CATEGORIES.map(c => ({ value: String(c.id), label: t(c.name) }))

// ── Tree ──
const collapsed = ref<Set<string>>(new Set())
function toggleCollapse(id: string) {
  const next = new Set(collapsed.value)
  next.has(id) ? next.delete(id) : next.add(id)
  collapsed.value = next
}

const visibleRecords = computed(() => coaRecords.filter(a =>
  (showArchived.value || !a.archived) && (!categoryFilter.value || String(a.categoryId) === categoryFilter.value)))

const searchActive = ref(false)
const treeRows = computed<Row[]>(() => {
  const ids = new Set(visibleRecords.value.map(a => a.id))
  const byParent = new Map<string | undefined, CoaRecord[]>()
  for (const a of visibleRecords.value) {
    const key = a.parentId && ids.has(a.parentId) ? a.parentId : undefined
    const arr = byParent.get(key) ?? []
    arr.push(a)
    byParent.set(key, arr)
  }
  const order = (a: CoaRecord, b: CoaRecord) =>
    categoryRank(a.categoryId) - categoryRank(b.categoryId) || a.code.localeCompare(b.code, undefined, { numeric: true })
  const out: Row[] = []
  const walk = (pid: string | undefined, depth: number) => {
    for (const a of [...(byParent.get(pid) ?? [])].sort(order)) {
      const kids = byParent.get(a.id)?.length ?? 0
      out.push({
        ...a, depth, hasChildren: kids > 0, categoryName: t(categoryOf(a.categoryId).name),
        balance: accountBalance(a), locked: hasTransactions(a), isDefault: isDefaultAccount(a),
      })
      if (kids && (searchActive.value || !collapsed.value.has(a.id))) walk(a.id, depth + 1)
    }
  }
  walk(undefined, 0)
  return out
})

const { search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, setSort } = useTableState<Row>(treeRows, {
  perPage: 25,
  filterFn: (row, s) => !s || row.code.toLowerCase().includes(s) || row.name.toLowerCase().includes(s),
})
watch(search, (s) => { searchActive.value = !!s.trim() })

const hasActiveFilter = computed(() => !!search.value || !!categoryFilter.value || showArchived.value)
function clearFilters() { search.value = ''; categoryFilter.value = ''; showArchived.value = false }

// ── Columns (prod tableHeads + "Displayed columns") ──
const columns: TableColumn[] = [
  { key: 'code', label: t('Account code'), kind: 'number' },
  { key: 'name', label: t('Account name'), kind: 'address' },
  { key: 'categoryName', label: t('Account category') },
  { key: 'tax', label: t('Account tax') },
  { key: 'currency', label: t('Currency'), kind: 'unit' },
  { key: 'balance', label: t('Balance'), kind: 'amount', align: 'right' },
]
const columnVisibility = reactive<Record<string, boolean>>({ code: true, name: true, categoryName: true, tax: false, currency: false, balance: true })
const columnItems = columns.map(c => ({ key: c.key, label: c.label, disabled: c.key === 'code' || c.key === 'name' }))
const visibleColumns = computed(() => columns.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

// Prod: dayjs().format('DD MMMM YYYY').
const balanceDate = new Date(SIM_TODAY_ISO + 'T00:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })

// Prod shows balances in the company base currency (company_base_currency_list_id).
function money(r: Row) { return formatIDR(r.balance) }
function lockTooltip(r: Row) {
  return r.isDefault
    ? t('This is a default account from Jurnal. This account cannot be deleted even if it has no transactions.')
    : t('This account cannot be deleted because it already has transactions and/or is used in products, contacts, and taxes.')
}

function openDetail(r: Row) { router.push(`/chart-of-accounts/${encodeURIComponent(r.id)}`) }
function openEdit(r: Row) { router.push(`/chart-of-accounts/${encodeURIComponent(r.id)}/edit`) }

// ── Archive / delete (rules from detail/show.vue) ──
function archiveBlock(r: Row): string {
  if (r.archived) return ''
  if (r.balance !== 0) return t('Cannot be archived because the balance is not zero')
  if (childrenOf(r.id).some(c => !c.archived)) return t('Cannot be archived because it still has unarchived child accounts')
  return ''
}
function deleteBlock(r: Row): string {
  if (r.isDefault) return t('This is a default account from Jurnal. This account cannot be deleted even if it has no transactions.')
  if (r.locked) return t('Cannot delete the account because it already has transactions.')
  return ''
}
function toggleArchive(r: Row) {
  if (archiveBlock(r)) return
  setArchived(r.id, !r.archived)
  successToast(r.archived ? t('Account unarchived') : t('Account archived'))
}
const deleteTarget = ref<Row | null>(null)
const deleteOpen = ref(false)
function askDelete(r: Row) { if (deleteBlock(r)) return; deleteTarget.value = r; deleteOpen.value = true }
function confirmDelete() {
  if (!deleteTarget.value) return
  deleteAccount(deleteTarget.value.id)
  successToast(t('Account deleted'))
  deleteTarget.value = null
}
const deleteIsHeader = computed(() => !!deleteTarget.value && isHeader(deleteTarget.value.id))

// ── Title-bar actions (from [...slug].vue) ──
const exportOpen = ref(false)
const exportColumns = columns.map(c => ({ key: c.key, label: c.label, required: c.key === 'code' || c.key === 'name' }))
const coaAction = inject<Ref<{ kind: string; n: number }>>('coaAction', ref({ kind: '', n: 0 }))
watch(() => coaAction.value.n, () => {
  if (coaAction.value.kind === 'export') exportOpen.value = true
  else infoToast(t('Not in this prototype'))
})
function onExport() { exportOpen.value = false; infoToast(t('Not in this prototype')) }

const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 400) })
</script>

<template>
  <ErpTablePage
    :columns="visibleColumns"
    :rows="(paginated as unknown as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    :sort-key="sortKey"
    :sort-dir="sortDir"
    :search="search"
    :loading="loading"
    :has-active-filter="hasActiveFilter"
    filter-empty-label="account"
    bulk-label="account"
    @page-change="setPage"
    @per-page-change="setPerPage"
    @sort-change="setSort"
    @hide-column="hideColumn"
    @clear-filters="clearFilters"
  >
    <template #filters>
      <div class="coa-filter-wrap">
        <div class="coa-filter-row">
          <div class="filter-left">
            <ErpFilterSelect id="coa-category" v-model="categoryFilter" :placeholder="t('Account category')" :options="categoryOptions" width="240px" />
            <label class="coa-toggle">
              <MpToggle id="coa-show-archived" v-model:is-checked="showArchived" :aria-label="t('Show archived accounts')" />
              <span>{{ t('Show archived accounts') }}</span>
            </label>
          </div>
          <div class="filter-right">
            <ColumnSettingsMenu id="coa-columns" :items="columnItems" :visibility="columnVisibility" :tooltip="t('Displayed columns')" />
            <div class="filter-search">
              <MpIcon name="search" size="sm" />
              <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search code or account name')" :aria-label="t('Search code or account name')" />
              <MpButton v-if="search" variant="ghost" is-rounded class="search-clear-btn" left-icon="close" :aria-label="t('Clear search')" @click="search = ''" />
            </div>
          </div>
        </div>
        <p class="coa-balance-date">{{ t('The balance is based on') }} {{ balanceDate }}, {{ t('unless stated otherwise') }}</p>
      </div>
    </template>

    <template #cell-code="{ row }">
      <div class="coa-code" :style="{ '--depth': (row as unknown as Row).depth }">
        <MpButton
          v-if="(row as unknown as Row).hasChildren"
          variant="ghost"
          is-rounded
          class="coa-caret"
          :class="{ 'coa-caret--open': !collapsed.has((row as unknown as Row).id) || !!search }"
          left-icon="chevrons-right"
          :aria-label="collapsed.has((row as unknown as Row).id) ? t('Expand') : t('Collapse')"
          @click.stop="toggleCollapse((row as unknown as Row).id)"
        />
        <span v-else class="coa-caret-spacer" />
        <span class="cell-link" @click.stop="openDetail(row as unknown as Row)">{{ (row as unknown as Row).code }}</span>
        <MpTooltip v-if="(row as unknown as Row).locked || (row as unknown as Row).isDefault" :label="lockTooltip(row as unknown as Row)" placement="top" use-portal>
          <span class="coa-lock"><MpIcon name="security" size="sm" color="icon.default" /></span>
        </MpTooltip>
      </div>
    </template>

    <template #cell-name="{ row }">
      <div class="coa-name">
        <div class="coa-name-line">
          <span class="cell-link" @click.stop="openDetail(row as unknown as Row)">{{ (row as unknown as Row).name }}</span>
          <ErpStatusBadge v-if="(row as unknown as Row).archived" status="archived" />
        </div>
        <span v-if="(row as unknown as Row).description" class="coa-desc">{{ (row as unknown as Row).description }}</span>
      </div>
    </template>

    <template #cell-tax="{ value }">{{ value || '-' }}</template>
    <template #cell-balance="{ row }">{{ money(row as unknown as Row) }}</template>

    <template #actions="{ row }">
      <MpPopover :id="`coa-actions-${(row as unknown as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '200px', maxWidth: '280px' })" class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="openDetail(row as unknown as Row)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="openEdit(row as unknown as Row)">{{ t('Edit account') }}</MpPopoverListItem>
            <MpPopoverListItem :is-disabled="!!archiveBlock(row as unknown as Row)" @click="toggleArchive(row as unknown as Row)">
              <span class="coa-menu-item">
                <span>{{ (row as unknown as Row).archived ? t('Unarchive account') : t('Archive account') }}</span>
                <span v-if="archiveBlock(row as unknown as Row)" class="coa-menu-reason">{{ archiveBlock(row as unknown as Row) }}</span>
              </span>
            </MpPopoverListItem>
            <MpPopoverListItem :is-disabled="!!deleteBlock(row as unknown as Row)" @click="askDelete(row as unknown as Row)">
              <span class="coa-menu-item">
                <span>{{ t('Delete account') }}</span>
                <span v-if="deleteBlock(row as unknown as Row)" class="coa-menu-reason">{{ deleteBlock(row as unknown as Row) }}</span>
              </span>
            </MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #empty>
      <div class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('Account empty') }}</p>
        <p class="empty-full-desc">{{ t('Create a new account to start recording your business financial transactions.') }}</p>
        <MpButton variant="secondary" is-rounded left-icon="add" @click="router.push('/chart-of-accounts/new')">{{ t('Create new account') }}</MpButton>
      </div>
    </template>
  </ErpTablePage>

  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="deleteIsHeader ? t('Delete header account?') : t('Delete account?')"
    :description="deleteIsHeader ? t('Deleting a header account will not delete its sub-accounts, and they will remain active as standalone accounts. Once a header account is deleted, it cannot be restored.') : t('The deleted account cannot be restored.')"
    :confirm-label="t('Delete')"
    @confirm="confirmDelete"
  />

  <ExportModal
    :open="exportOpen"
    :title="t('Export account')"
    :entity-label="t('accounts')"
    :columns="exportColumns"
    :total="total"
    :show-column-search="false"
    @close="exportOpen = false"
    @export="onExport"
  />
</template>

<style scoped>
.coa-filter-wrap { display: flex; flex-direction: column; gap: var(--mp-spacing-3); width: 100%; }
.coa-filter-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.coa-toggle { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); cursor: pointer; white-space: nowrap; color: var(--mp-text-default); }
.coa-balance-date { margin: 0; text-align: right; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: 280px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}
.filter-search-input {
  flex: 1; border: none; outline: none; background: transparent; min-width: 0;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default);
}
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn { min-width: 0 !important; width: var(--mp-sizes-5) !important; height: var(--mp-sizes-5) !important; padding: 0 !important; }

.coa-code { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); padding-left: calc(var(--depth, 0) * var(--mp-spacing-5)); white-space: nowrap; }
.coa-caret { min-width: 0 !important; width: var(--mp-sizes-5) !important; height: var(--mp-sizes-5) !important; padding: 0 !important; border-radius: var(--mp-radii-sm) !important; }
.coa-caret :deep(svg) { transition: transform 0.12s ease; }
.coa-caret--open :deep(svg) { transform: rotate(90deg); }
.coa-caret-spacer { display: inline-block; flex-shrink: 0; width: var(--mp-sizes-5); }
.coa-lock { display: inline-flex; }

.coa-name { display: flex; flex-direction: column; min-width: 0; }
.coa-name-line { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.coa-name-line .cell-link { white-space: normal; overflow-wrap: anywhere; min-width: 0; }
.coa-desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }

.coa-menu-item { display: flex; flex-direction: column; white-space: normal; }
.coa-menu-reason { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.empty-full { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
