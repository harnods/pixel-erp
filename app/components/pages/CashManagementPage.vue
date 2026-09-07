<script setup lang="ts">
/**
 * Cash management — index of every cash, bank and card account.
 *
 * Each row carries two balances: what the imported bank statement says and what
 * the books say. The gap between them is what the row's "Reconcile (n)" action
 * clears, so the button only appears when there are unreconciled transactions.
 */
import {
  MpToggle, MpButton, MpIcon, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpPopoverList, MpPopoverListItem, MpModal, MpModalContent, MpModalHeader, MpModalBody,
  MpModalFooter, MpModalOverlay, MpModalCloseButton, toast, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { cashAccounts } from '~/data'
import type { CashAccount } from '~/data'
import { formatMoney } from '~/utils/currency'
import { formatDateTime } from '~/utils/date'

const { t } = useLocale()
const router = useRouter()
const toggleAirene = inject<() => void>('toggleAirene')

function goToDetail(id: string) { router.push(`/cash-management/${id}`) }

/** A cash account annotated for the tree: its nesting depth and whether it has
 *  sub-accounts (which makes it an expandable group row). */
interface TreeRow extends CashAccount { depth: number; hasChildren: boolean }

// ─── Column definitions ───────────────────────────────────────────────────────

const columns: TableColumn[] = [
  { key: 'code',             label: 'Account code',      kind: 'number',                 sortType: 'text'   },
  { key: 'name',             label: 'Account name',      kind: 'name', sortable: true, sortType: 'text'   },
  { key: 'currency',         label: 'Currency',                                          sortType: 'text'   },
  { key: 'statementBalance', label: 'Statement balance', kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'bookBalance',      label: 'Book balance',      kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'lastUpdated',      label: 'Last updated',      kind: 'date',                   sortType: 'date'   },
  // Reconcile lives in its OWN column, right-aligned, sticky just left of the
  // kebab so it stays pinned to the table's right edge even when the table
  // overflows horizontally (narrow screens). isTrailingAction places the shared
  // ErpTablePage flex spacer BEFORE it, pushing reconcile + kebab flush right.
  { key: 'reconcile',        label: '',                  width: '148px', align: 'right', noHeader: true, isFixed: true, noSkeleton: true, isTrailingAction: true },
]

/** Columns the user can toggle in Column settings — excludes the layout-only
 *  spacer/reconcile columns. */
const SETTINGS_KEYS = ['code', 'name', 'currency', 'statementBalance', 'bookBalance', 'lastUpdated']

// ─── First-load skeleton ──────────────────────────────────────────────────────

const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 600) })

// ─── Tree (parent → sub-account) rows ─────────────────────────────────────────

const showArchived = ref(false)
/** Ids of expanded parents — everything collapsed by default. */
const expanded = ref<Set<string>>(new Set())
function isExpanded(id: string) { return expanded.value.has(id) }
function toggleExpand(id: string) {
  const next = new Set(expanded.value)
  next.has(id) ? next.delete(id) : next.add(id)
  expanded.value = next
}

/** Ids of pinned accounts — pinned rows float to the top of their sibling group. */
const pinned = ref<Set<string>>(new Set())
function isPinned(id: string) { return pinned.value.has(id) }
function togglePin(id: string) {
  const next = new Set(pinned.value)
  next.has(id) ? next.delete(id) : next.add(id)
  pinned.value = next
}

// ─── Archive / delete ─────────────────────────────────────────────────────────
// Accounts with posted transactions can't be archived or deleted.
function canModify(a: CashAccount) { return a.hasTransactions === false }

const archiveTarget = ref<CashAccount | null>(null)
const deleteTarget = ref<CashAccount | null>(null)

function confirmArchive() {
  const target = archiveTarget.value
  if (target) {
    const found = accounts.value.find(a => a.id === target.id)
    if (found) found.isArchived = true
    toast.notify({ variant: 'success', title: `${target.name} ${t('archived')}`, maxWidth: 'max-content' })
  }
  archiveTarget.value = null
}

function confirmDelete() {
  const target = deleteTarget.value
  if (target) {
    accounts.value = accounts.value.filter(a => a.id !== target.id)
    toast.notify({ variant: 'success', title: `${target.name} ${t('deleted')}`, maxWidth: 'max-content' })
  }
  deleteTarget.value = null
}

function unarchiveAccount(a: CashAccount) {
  const found = accounts.value.find(x => x.id === a.id)
  if (found) found.isArchived = false
  toast.notify({ variant: 'success', title: `${a.name} ${t('unarchived')}`, maxWidth: 'max-content' })
}

/** Local reactive copy so Archive/Delete update the list in-session. */
const accounts = ref<CashAccount[]>(cashAccounts.map(a => ({ ...a })))

/** Accounts grouped by parent id (top-level under `undefined`), archived filtered out. */
const byParent = computed(() => {
  const m = new Map<string | undefined, CashAccount[]>()
  for (const a of accounts.value) {
    if (!showArchived.value && a.isArchived) continue
    const arr = m.get(a.parentId) ?? []
    arr.push(a)
    m.set(a.parentId, arr)
  }
  return m
})

/** Depth-first flatten of the tree, skipping the children of collapsed parents. */
const treeRows = computed<TreeRow[]>(() => {
  const out: TreeRow[] = []
  const walk = (parentId: string | undefined, depth: number) => {
    // Pinned accounts float to the top of their sibling group (stable otherwise).
    const kids = [...(byParent.value.get(parentId) ?? [])]
      .sort((a, b) => Number(pinned.value.has(b.id)) - Number(pinned.value.has(a.id)))
    for (const a of kids) {
      const hasChildren = (byParent.value.get(a.id)?.length ?? 0) > 0
      out.push({ ...a, depth, hasChildren })
      if (hasChildren && (searchActive.value || isExpanded(a.id))) walk(a.id, depth + 1)
    }
  }
  walk(undefined, 0)
  return out
})

// A search should reach into collapsed branches, so expand everything while searching.
const searchActive = ref(false)

const {
  search, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState(treeRows, {
  filterFn: (row: TreeRow, s) =>
    row.code.toLowerCase().includes(s) ||
    row.name.toLowerCase().includes(s) ||
    (row.accountNumber?.toLowerCase().includes(s) ?? false),
})

watch(search, (s) => { searchActive.value = !!s.trim() })

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
  // Last updated is hidden by default — users opt in via Column settings.
  Object.fromEntries(columns.map(c => [c.key, c.key !== 'lastUpdated'])),
)
const columnItems = columns
  .filter(c => SETTINGS_KEYS.includes(c.key))
  .map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
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
    :loading="loading"
    :has-active-filter="hasActiveFilter"
    filter-empty-label="account"
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

    <!-- ── Cell: Account code — chevron toggle + indentation for sub-accounts ── -->
    <template #cell-code="{ row }">
      <div class="code-cell" :style="{ '--depth': (row as TreeRow).depth }">
        <button
          v-if="(row as TreeRow).hasChildren"
          class="tree-toggle btn-enterprise"
          :class="{ 'tree-toggle--open': isExpanded((row as TreeRow).id) }"
          :aria-label="isExpanded((row as TreeRow).id) ? t('Collapse') : t('Expand')"
          :aria-expanded="isExpanded((row as TreeRow).id)"
          @click.stop="toggleExpand((row as TreeRow).id)"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </button>
        <MpTooltip
          v-else-if="isPinned((row as TreeRow).id)"
          :id="`cash-pin-${(row as TreeRow).id}`"
          :label="t('Click to unpin')"
          placement="top"
          use-portal
        >
          <button class="pin-btn btn-enterprise" :aria-label="t('Click to unpin')" @click.stop="togglePin((row as TreeRow).id)">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path fill-rule="evenodd" clip-rule="evenodd" d="M12.5793 3.75687L12.8073 5.12526C12.8642 5.46649 12.7359 5.81229 12.4701 6.03375L9.66381 8.37232C10.0287 8.64316 10.3816 8.94698 10.7172 9.28258C11.0528 9.61817 11.3566 9.97111 11.6274 10.336L13.966 7.52967C14.1875 7.26392 14.5333 7.13554 14.8745 7.19241L16.2429 7.42048L12.5793 3.75687ZM12.455 11.686L14.9253 8.72157L17.6149 9.16984C18.5497 9.32563 19.134 8.19026 18.4639 7.52015L12.4796 1.53589C11.8095 0.865779 10.6741 1.45007 10.8299 2.38485L11.2782 5.07444L8.31377 7.5448C6.31575 6.56076 4.05569 6.44913 2.46491 7.65263C1.8483 8.11912 1.92122 8.94735 2.3662 9.39233L5.95649 12.9826L1.46967 17.4694C1.17678 17.7623 1.17678 18.2372 1.46967 18.5301C1.76256 18.823 2.23744 18.823 2.53033 18.5301L7.01715 14.0433L10.6074 17.6336C11.0524 18.0785 11.8806 18.1515 12.3471 17.5349C13.5506 15.9441 13.439 13.684 12.455 11.686ZM3.72167 8.62647C4.79964 8.06193 6.41574 8.16212 8.04645 9.10151C8.60563 9.42363 9.15189 9.83861 9.65653 10.3432C10.1612 10.8479 10.5761 11.3941 10.8982 11.9533C11.8376 13.584 11.9378 15.2001 11.3733 16.2781L3.72167 8.62647Z" fill="currentColor"/>
            </svg>
          </button>
        </MpTooltip>
        <span v-else class="tree-spacer" />
        <span>{{ (row as TreeRow).code }}</span>
      </div>
    </template>

    <!-- ── Cell: Account name — bank name + account number underneath ── -->
    <template #cell-name="{ row }">
      <div class="account-cell">
        <span class="account-cell__name">
          <a class="cell-link account-cell__title" @click.stop="goToDetail((row as CashAccount).id)">{{ (row as CashAccount).name }}</a>
          <ErpStatusBadge v-if="(row as CashAccount).isArchived" status="archived" />
          <ErpStatusBadge v-else-if="(row as CashAccount).isConnected" status="active" label="Connected" />
        </span>
        <span v-if="(row as CashAccount).accountNumber" class="account-cell__number">
          {{ (row as CashAccount).accountNumber }}
        </span>
      </div>
    </template>

    <!-- ── Cell: Currency — blank on parent group rows ──
         Note: the wrapping <span> must always render — an empty conditional slot
         makes ErpTablePage fall back to its default `{{ row[key] }}` cell. -->
    <template #cell-currency="{ row }">
      <span>{{ (row as TreeRow).hasChildren ? '' : (row as CashAccount).currency }}</span>
    </template>

    <!-- ── Cell: Statement balance — amount + statement date underneath (blank on parents) ── -->
    <template #cell-statementBalance="{ row }">
      <span v-if="(row as TreeRow).hasChildren" />
      <span v-else-if="(row as CashAccount).statementBalance === null" class="balance-cell__empty">{{ t('No statement imported') }}</span>
      <div v-else class="balance-cell">
        <span>{{ formatMoney((row as CashAccount).statementBalance!, (row as CashAccount).statementCurrency ?? (row as CashAccount).currency) }}</span>
        <span v-if="(row as CashAccount).statementDate" class="balance-cell__date">
          {{ formatDate((row as CashAccount).statementDate!) }}
        </span>
      </div>
    </template>

    <!-- ── Cell: Book balance — parents show a rolled-up total only when collapsed ── -->
    <template #cell-bookBalance="{ row }">
      <span v-if="(row as TreeRow).hasChildren && isExpanded((row as TreeRow).id)" />
      <span v-else>{{ formatMoney((row as CashAccount).bookBalance, (row as CashAccount).currency) }}</span>
    </template>

    <!-- ── Cell: Last updated ── -->
    <template #cell-lastUpdated="{ row }">
      {{ formatDateTime((row as CashAccount).lastUpdated) }}
    </template>

    <!-- ── Cell: Reconcile — its own right-aligned column (Figma 5527-171257) ── -->
    <template #cell-reconcile="{ row }">
      <span class="reconcile-cell">
        <button
          v-if="(row as CashAccount).unreconciledCount > 0"
          class="reconcile-btn btn-enterprise btn-enterprise--secondary"
          @click.stop="goToDetail((row as CashAccount).id)"
        >
          {{ t('Reconcile') }} ({{ (row as CashAccount).unreconciledCount }})
        </button>
      </span>
    </template>

    <!-- ── Actions — per-account kebab menu (Figma 4562-37444), sticky far right ── -->
    <template #actions="{ row }">
      <MpPopover :id="`cash-row-actions-${(row as CashAccount).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton class="row-kebab" :aria-label="t('More actions')">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="goToDetail((row as CashAccount).id)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem
              v-if="(row as CashAccount).unreconciledCount > 0"
              @click="goToDetail((row as CashAccount).id)"
            >
              {{ t('Reconcile account') }} ({{ (row as CashAccount).unreconciledCount }})
            </MpPopoverListItem>
            <MpPopoverListItem v-if="(row as CashAccount).isConnected" @click="router.push(`/cash-management/${(row as CashAccount).id}/connect`)">{{ t('Bank connection') }}</MpPopoverListItem>
            <MpPopoverListItem v-else @click="router.push(`/cash-management/${(row as CashAccount).id}/connect`)">{{ t('Connect to bank') }}</MpPopoverListItem>
            <MpPopoverListItem @click.stop>{{ t('Add sub-account') }}</MpPopoverListItem>
            <div class="row-menu-divider" />
            <MpPopoverListItem @click.stop>{{ t('Import statement') }}</MpPopoverListItem>
            <MpPopoverListItem @click="togglePin((row as CashAccount).id)">{{ isPinned((row as CashAccount).id) ? t('Unpin') : t('Pin to top') }}</MpPopoverListItem>
            <MpPopoverListItem @click="router.push(`/cash-management/${(row as CashAccount).id}/edit`)">{{ t('Edit') }}</MpPopoverListItem>
            <div class="row-menu-divider" />
            <!-- Archive ↔ Unarchive -->
            <MpPopoverListItem v-if="(row as CashAccount).isArchived" @click="unarchiveAccount(row as CashAccount)">{{ t('Unarchive') }}</MpPopoverListItem>
            <MpPopoverListItem v-else-if="canModify(row as CashAccount)" @click="archiveTarget = (row as CashAccount)">{{ t('Archive') }}</MpPopoverListItem>
            <MpPopoverListItem v-else class="row-menu-item--disabled" @click.stop>
              <MpTooltip
                :id="`cash-archive-${(row as CashAccount).id}`"
                :label="t('Cannot archive. This account has recorded transactions.')"
                placement="left"
                use-portal
                :class="css({ display: 'block' })"
              >
                <span class="row-menu-disabled-label">{{ t('Archive') }}</span>
              </MpTooltip>
            </MpPopoverListItem>
            <!-- Delete -->
            <MpPopoverListItem v-if="canModify(row as CashAccount)" class="row-menu-item--danger" @click="deleteTarget = (row as CashAccount)">{{ t('Delete') }}</MpPopoverListItem>
            <MpPopoverListItem v-else class="row-menu-item--disabled" @click.stop>
              <MpTooltip
                :id="`cash-delete-${(row as CashAccount).id}`"
                :label="t('Cannot delete. This account has recorded transactions.')"
                placement="left"
                use-portal
                :class="css({ display: 'block' })"
              >
                <span class="row-menu-disabled-label">{{ t('Delete') }}</span>
              </MpTooltip>
            </MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
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

  <!-- ── Archive confirmation (Figma 5506-162835) ── -->
  <MpModal
    id="cash-archive-modal"
    :is-open="archiveTarget !== null"
    size="sm"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="archiveTarget = null"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Archive account?') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        {{ t("Archived accounts will be hidden from the list and can't be used in any transactions.") }}
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="archiveTarget = null">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmArchive">{{ t('Archive') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <!-- ── Delete confirmation (Figma 5507-164858) ── -->
  <MpModal
    id="cash-delete-modal"
    :is-open="deleteTarget !== null"
    size="sm"
    is-close-on-esc
    is-close-on-overlay-click
    :is-keep-alive="false"
    @close="deleteTarget = null"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ t('Delete account?') }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        {{ t('Deleted accounts cannot be restored.') }}
      </MpModalBody>
      <MpModalFooter>
        <div class="modal-footer-btns">
          <button class="btn-enterprise btn-enterprise--ghost" @click="deleteTarget = null">{{ t('Cancel') }}</button>
          <button class="btn-enterprise btn-enterprise--danger" @click="confirmDelete">{{ t('Delete') }}</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
/* The Reconcile column is a second sticky-right column: it sits one kebab-width
   (--erp-actions-width, 44px) in from the right so it lands immediately left of
   the sticky kebab. The shared ErpTablePage only pins the actions column at
   right:0, so nudge this one over here. */
:deep(.erp-th[data-col="reconcile"]),
:deep(.erp-td[data-col="reconcile"]) {
  right: var(--erp-actions-width, 44px);
}
/* Keep a single separator at the left edge of the sticky group (on the Reconcile
   column) — drop the kebab's own inset border so they don't double up. */
:deep(.erp-table-wrapper.is-overflowing .erp-th--actions),
:deep(.erp-table-wrapper.is-overflowing .erp-td--actions) {
  box-shadow: none;
}

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

/* ── Account code — tree toggle + indentation ── */
.code-cell {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  /* Each nesting level indents by one spacing-5 step (matches the toggle slot width). */
  padding-left: calc(var(--depth, 0) * var(--mp-spacing-5));
}
.tree-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--mp-sizes-5, 20px);
  height: var(--mp-sizes-5, 20px);
  padding: 0;
  border: none;
  background: transparent;
  border-radius: var(--mp-radii-sm);
  cursor: pointer;
  color: var(--mp-text-subtle);
}
.tree-toggle:hover {
  background: var(--mp-background-neutral-hovered);
  color: var(--mp-text-default);
}
.tree-toggle svg { transition: transform 0.12s ease; }
.tree-toggle--open svg { transform: rotate(90deg); }
/* Leaf rows reserve the toggle's width so their codes line up under their siblings. */
.tree-spacer {
  display: inline-block;
  flex-shrink: 0;
  width: var(--mp-sizes-5, 20px);
}
/* Pin marker — sits in the leading slot (where a chevron would be) on pinned rows. */
.pin-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--mp-sizes-5, 20px);
  height: var(--mp-sizes-5, 20px);
  padding: 0;
  border: none;
  background: transparent;
  border-radius: var(--mp-radii-sm);
  cursor: pointer;
  color: var(--mp-text-subtle);
}
.pin-btn:hover {
  background: var(--mp-background-neutral-hovered);
  color: var(--mp-text-default);
}

/* ── Row action menu ── */
.row-menu-divider {
  height: 1px;
  margin: var(--mp-spacing-1) 0;
  background: var(--mp-border-default);
}
/* Disabled Archive/Delete: greyed and inert (no click handler), but still
   hoverable so the "why" tooltip can appear. */
.row-menu-item--disabled {
  color: var(--mp-text-disabled);
  cursor: not-allowed;
}
.row-menu-disabled-label {
  color: var(--mp-text-disabled);
}
/* Destructive Delete row — red text. */
.row-menu-item--danger {
  color: var(--mp-text-critical, var(--mp-text-danger));
}

/* ── Confirmation modal footer ── */
.modal-footer-btns {
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
  width: 100%;
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

/* ── Reconcile — its own right-aligned column, just left of the kebab ─────── */
.reconcile-cell {
  display: inline-flex;
  justify-content: flex-end;
}
.reconcile-btn {
  white-space: nowrap;
}

/* ── Row actions — kebab button (same as the other index pages) ─────────── */
.row-kebab {
  display: flex !important;
  align-items: center;
  justify-content: center;
  padding: var(--mp-spacing-1) !important;
  min-width: 0 !important;
  border: none !important;
  background: transparent !important;
  cursor: pointer;
  border-radius: var(--mp-radii-sm) !important;
  color: var(--mp-text-subtle);
}
.row-kebab:hover {
  background: var(--mp-background-neutral-hovered) !important;
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

/* ── Responsive stats (audit): keep the row horizontal on small screens and let
   it scroll/swipe instead of stacking (home stacks; index pages scroll). ── */
@media (max-width: 640px) {
  .stats-section { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  .stat-card { flex: 0 0 auto; }
}
</style>
