<script setup lang="ts">
/**
 * Cash management account detail — /cash-management/:id
 *
 * The overview header renders one of two states straight off the account's
 * `isConnected` flag (see cashAccounts.ts): a live bank feed (logo badge,
 * "Connected" pill, "Last updated…" + refresh) or a plain manual account
 * (generic bank glyph, no badge, no last-updated row). Everything below —
 * balances, statement lines, transactions — is dummy data, no real bank
 * integration.
 */
import { useRouter, useRoute } from 'vue-router'
import {
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpIcon, MpCheckbox, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay,
  MpModalCloseButton, toast, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import CashTxFiltersDrawer, {
  type CashTxFiltersValue, emptyCashTxFilters, matchCashTxFilters, cashTxFilterCount,
} from '~/components/patterns/CashTxFiltersDrawer.vue'
import ImportBankStatementOcrModal from '~/components/patterns/ImportBankStatementOcrModal.vue'
import GlobalFileDropOverlay from '~/components/patterns/GlobalFileDropOverlay.vue'
import { cashAccounts } from '~/data'
import type { CashAccountCurrency } from '~/data'
import { formatMoney } from '~/utils/currency'
import {
  getBankStatementLines, getAccountTransactions,
  type BankStatementLine, type AccountTransactionLine, type LedgerProfile,
} from '~/data/bankStatementLines'
import { formatDate, formatDateLong } from '~/utils/date'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const route = useRoute()
const { t } = useLocale()

const account = computed(() => cashAccounts.find(a => a.id === props.orderId))

function goBack() { router.push('/cash-management') }

// First-load skeleton.
const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 600) })

// "All filters" drawers (one per tab). appliedTx/Stmt hold the committed filters.
const txFiltersOpen = ref(false)
const appliedTxFilters = ref<CashTxFiltersValue>(emptyCashTxFilters())
const stmtFiltersOpen = ref(false)
const appliedStmtFilters = ref<CashTxFiltersValue>(emptyCashTxFilters())

const txFilterCount = computed(() => cashTxFilterCount(appliedTxFilters.value))
const stmtFilterCount = computed(() => cashTxFilterCount(appliedStmtFilters.value))

// Inline quick date-range filter (kept alongside "All filters"). Its value is the
// same transactionDate the drawer edits — the "Apply" button commits it, and a
// drawer apply syncs back so the two stay in lockstep.
const txDateRange = ref<Date[] | null>(null)
const stmtDateRange = ref<Date[] | null>(null)
// Picking a range applies it immediately (no Apply button).
function onTxDatePick(v: Date[] | null) { txDateRange.value = v; appliedTxFilters.value = { ...appliedTxFilters.value, transactionDate: v } }
function onStmtDatePick(v: Date[] | null) { stmtDateRange.value = v; appliedStmtFilters.value = { ...appliedStmtFilters.value, transactionDate: v } }
function onTxFiltersApply(f: CashTxFiltersValue) { appliedTxFilters.value = f; txDateRange.value = f.transactionDate }
function onStmtFiltersApply(f: CashTxFiltersValue) { appliedStmtFilters.value = f; stmtDateRange.value = f.transactionDate }

// Status options — only offered when the account has a bank statement.
const reconcileStatusOptions = computed(() => hasStatement.value
  ? [{ value: 'reconciled', label: t('Reconciled') }, { value: 'unreconciled', label: t('Unreconciled') }]
  : [])

// Title "jump to" — switch to another account (chevron-only trigger + search).
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const q = jumpSearch.value.trim().toLowerCase()
  const list = cashAccounts.filter(a => !a.isArchived && a.id !== props.orderId)
  return q ? list.filter(a => `${a.code} ${a.name}`.toLowerCase().includes(q)) : list
})
function jumpTo(id: string) { jumpSearch.value = ''; router.push(`/cash-management/${id}`) }

// Number / Contact are links to the underlying transaction & contact. Those
// detail pages aren't built yet, so this is a placeholder hook (no navigation).
function openTransaction(_row: AccountTransactionLine) { /* → transaction detail (TODO) */ }
function openContact(_name: string) { /* → contact detail (TODO) */ }

// Row reconcile actions — only meaningful for accounts that have a statement.
function toggleReconcile(row: AccountTransactionLine) {
  const wasReconciled = row.status === 'reconciled'
  toast.notify({ variant: 'success', title: wasReconciled ? t('Transaction unreconciled') : t('Transaction reconciled'), maxWidth: 'max-content' })
}
function markReconciled(_row: AccountTransactionLine) {
  toast.notify({ variant: 'success', title: t('Marked as reconciled'), maxWidth: 'max-content' })
}
function deleteTransaction(_row: AccountTransactionLine) {
  toast.notify({ variant: 'success', title: t('Transaction deleted'), maxWidth: 'max-content' })
}

// ── Import bank statement dropdown → "Import with OCR" modal ─────────────────
const ocrModalOpen = ref(false)
const ocrInitialFiles = ref<File[]>([])
function openOcrModal() { ocrInitialFiles.value = []; ocrModalOpen.value = true }

// Dragging a file anywhere onto this page opens the same modal, pre-loaded
// with what was dropped — same destination as the "Import with OCR" menu item.
function onGlobalFileDrop(fileList: FileList) {
  ocrInitialFiles.value = Array.from(fileList)
  ocrModalOpen.value = true
}
// ── Header (dummy "last updated" — no real bank feed) ──────────────────────
const lastUpdatedLabel = ref('Last updated a few minutes ago')
function refreshConnection() { lastUpdatedLabel.value = 'Last updated just now' }

// Bank-feed sync quota, shown on hover over "Last updated…". When exhausted a
// second line warns that further syncs are charged.
const syncTooltip = computed(() => {
  const a = account.value
  if (!a?.isConnected) return ''
  const total = a.syncTotal ?? 500
  const rem = a.syncRemaining ?? total
  return rem <= 0
    ? `Sync quota: 0 of ${total}.\nYou will be charged Rp100/sync`
    : `Sync quota: ${rem} of ${total}.`
})

// ── Edit / Archive / Delete — same rules as the index page: accounts with
//    recorded transactions can't be archived or deleted (disabled + tooltip). ──
const canModify = computed(() => account.value?.hasTransactions === false)
const archiveModalOpen = ref(false)
const deleteModalOpen = ref(false)

function confirmArchive() {
  const a = account.value
  if (a) {
    const found = cashAccounts.find(x => x.id === a.id)
    if (found) found.isArchived = true
    toast.notify({ variant: 'success', title: `${a.name} ${t('archived')}`, maxWidth: 'max-content' })
  }
  archiveModalOpen.value = false
  router.push('/cash-management')
}
function confirmDelete() {
  const a = account.value
  if (a) {
    const i = cashAccounts.findIndex(x => x.id === a.id)
    if (i >= 0) cashAccounts.splice(i, 1)
    toast.notify({ variant: 'success', title: `${a.name} ${t('deleted')}`, maxWidth: 'max-content' })
  }
  deleteModalOpen.value = false
  router.push('/cash-management')
}
function unarchiveAccount() {
  const a = account.value
  if (!a) return
  const found = cashAccounts.find(x => x.id === a.id)
  if (found) found.isArchived = false
  toast.notify({ variant: 'success', title: `${a.name} ${t('unarchived')}`, maxWidth: 'max-content' })
}

// ── Statement availability ─────────────────────────────────────────────────
// An account only has a bank statement if one has ever been imported / fed:
//   • cash & petty-cash accounts, brand-new accounts, and parent groups have
//     statementBalance = null → no statement → no bank balance, empty tab.
//   • isConnected → a live bank feed ("Last updated …").
//   • otherwise a statement was imported once → "Last import: <date>".
const hasStatement = computed(() => {
  const a = account.value
  return !!a && a.hasTransactions !== false && a.statementBalance !== null
})
// Derived from the latest statement line so it always agrees with the "Bank
// balance — As of <date>" card (an import brings the feed up to that date).
const statementImportLabel = computed(() => {
  const latest = allStatementLines.value[0]
  return latest ? `${t('Last import')}: ${formatDateLong(latest.date)}` : ''
})

// ── Bank statement (Bank statement tab) ─────────────────────────────────────
const allStatementLines = computed<BankStatementLine[]>(() => {
  const a = account.value
  if (!a || !hasStatement.value) return []            // no statement → empty state
  return getBankStatementLines(a.id, a.bookBalance, a.unreconciledCount, ledgerProfile.value)
})

// null when there is no statement — the header shows "—" / "No statement imported".
const bankBalance = computed<number | null>(() => hasStatement.value ? (allStatementLines.value[0]?.balance ?? account.value?.bookBalance ?? 0) : null)
const bankBalanceDateLabel = computed(() => {
  if (!hasStatement.value) return t('No statement imported')
  const latest = allStatementLines.value[0]
  return latest ? `${t('As of')} ${formatDateLong(latest.date)}` : t('No statement imported')
})
// Pending (book-only) transactions — the ones not yet cleared on the bank feed.
const unreconciledCount = computed(() => hasStatement.value ? (account.value?.unreconciledCount ?? 0) : 0)
const difference = computed<number | null>(() => hasStatement.value ? (bankBalance.value ?? 0) - (account.value?.bookBalance ?? 0) : null)
const differenceLabel = computed(() => {
  if (!hasStatement.value) return t('No statement imported')
  const n = unreconciledCount.value
  if (n === 0) return t('All transactions reconciled')
  return `${n} ${n === 1 ? t('transaction') : t('transactions')} ${t('to reconcile')}`
})

const hideDeleted = ref(false)
const statementSource = computed(() =>
  hideDeleted.value ? allStatementLines.value.filter(l => l.status !== 'deleted') : allStatementLines.value,
)
const {
  search: stmtSearch, currentPage: stmtCurrentPage, paginated: stmtPaginated, total: stmtTotal,
  perPage: stmtPerPage, sortKey: stmtSortKey, sortDir: stmtSortDir,
  setPage: stmtSetPage, setPerPage: stmtSetPerPage, setSort: stmtSetSort,
} = useTableState(statementSource, {
  filterFn: (row: BankStatementLine, s) =>
    (!s || row.description.toLowerCase().includes(s)) && matchCashTxFilters(row, appliedStmtFilters.value),
})

// This is a chronological running-balance ledger, so only Date is sortable —
// re-sorting by amount/balance/contact would break the running-balance column.
// The trailing empty flex column absorbs leftover width so columns keep their
// declared widths and the sticky action kebab stays flush right (not flung out
// by a stretched last column).
const statementColumns: TableColumn[] = [
  { key: 'date',        label: 'Date',        width: '140px',                 sortType: 'date' },
  { key: 'description', label: 'Description', width: '360px'                                    },
  { key: 'moneyIn',     label: 'Money in',    width: '160px', align: 'right'                    },
  { key: 'moneyOut',    label: 'Money out',   width: '160px', align: 'right'                    },
  { key: 'balance',     label: 'Balance',     width: '160px', align: 'right'                    },
  { key: 'status',      label: 'Status',      width: '140px'                                    },
  { key: 'spacer',      label: '',                          noHeader: true, noSkeleton: true    },
]

// ── Account transactions (Account transactions tab) — the software's own
//    documents (sales invoices, payments, expenses, credit memos…), not the
//    raw bank feed shown in the Bank statement tab. ───────────────────────────
// Each account's transaction mix depends on its role (main operating, credit
// card, FX/import, payroll, utilities, logistics, finance, retail cash, petty).
const ledgerProfile = computed<LedgerProfile>(() => {
  const a = account.value
  if (!a) return 'operating'
  const n = a.name.toLowerCase()
  if (/petty/.test(n)) return 'petty'
  if (/^2-/.test(a.code)) return 'card'                    // credit-card codes are 2-xxxxx
  if (/dbs|singapore|valas|\bfx\b|us\$|usd/.test(n)) return 'fx'
  if (/utilit/.test(n)) return 'utilities'
  if (/transport|logistic/.test(n)) return 'logistics'
  if (/hrbp|payroll/.test(n)) return 'payroll'
  if (/finance/.test(n)) return 'finance'
  if (/\bcash\b|drawer|wallet/.test(n)) return 'retailcash'
  return 'operating'
})
const allTransactionLines = computed<AccountTransactionLine[]>(() => {
  const a = account.value
  if (!a || a.hasTransactions === false) return []   // brand-new account → empty state
  return getAccountTransactions(a.id, a.bookBalance, a.unreconciledCount, ledgerProfile.value)
})
const {
  search: txSearch, currentPage: txCurrentPage, paginated: txPaginated, total: txTotal,
  perPage: txPerPage, sortKey: txSortKey, sortDir: txSortDir,
  setPage: txSetPage, setPerPage: txSetPerPage, setSort: txSetSort,
} = useTableState(allTransactionLines, {
  filterFn: (row: AccountTransactionLine, s) =>
    (!s || row.contact.toLowerCase().includes(s) || row.type.toLowerCase().includes(s) || String(row.number).includes(s))
    && matchCashTxFilters(row, appliedTxFilters.value),
})

// Running-balance ledger → only Date is sortable (see statementColumns note).
const allTransactionColumns: TableColumn[] = [
  { key: 'date',     label: 'Date',     width: '140px',                 sortType: 'date' },
  { key: 'number',   label: 'Number',   width: '220px'                                    },
  { key: 'contact',  label: 'Contact',  width: '260px'                                    },
  { key: 'moneyIn',  label: 'Money in', width: '160px', align: 'right'                    },
  { key: 'moneyOut', label: 'Money out',width: '160px', align: 'right'                    },
  { key: 'balance',  label: 'Balance',  width: '160px', align: 'right'                    },
  { key: 'status',   label: 'Status',   width: '140px'                                    },
  // Empty flex column — absorbs leftover width so the sticky kebab stays flush right.
  { key: 'spacer',   label: '',                         noHeader: true, noSkeleton: true  },
]
const txColumnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(allTransactionColumns.map(c => [c.key, true])),
)
const txColumnItems = computed(() => allTransactionColumns
  .filter(c => c.key !== 'spacer' && (c.key !== 'status' || hasStatement.value))
  .map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 })))
// Reconciliation status only exists relative to a bank statement, so the Status
// column is dropped entirely for accounts that have none (cash, petty cash).
const transactionColumns = computed<TableColumn[]>(() =>
  allTransactionColumns.filter(c => txColumnVisibility[c.key] && (c.key !== 'status' || hasStatement.value)),
)
function hideTxColumn(key: string) { txColumnVisibility[key] = false }

// ── Tabs — persisted via ?tab=transactions|statement so back/forward restores it ──
const TAB_NAMES = ['transactions', 'statement']
const activeTabIndex = computed({
  get(): number {
    const tab = route.query.tab as string | undefined
    const idx = tab ? TAB_NAMES.indexOf(tab) : -1
    return idx >= 0 ? idx : 0
  },
  set(idx: number) {
    router.replace({ query: { ...route.query, tab: TAB_NAMES[idx] ?? 'transactions' } })
  },
})
const activeTabName = computed(() => TAB_NAMES[activeTabIndex.value] ?? 'transactions')
</script>

<template>
  <div v-if="account" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb btn-enterprise" @click="goBack">{{ t('Cash management') }}</button>
        <!-- Plain title + a chevron-only "jump to another account" switcher.
             Only the chevron triggers the dropdown, never the H1 (see docs/patterns/details-page-format.md). -->
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ account.code }} {{ account.name }}</h1>
          <MpPopover id="cmd-jump" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <button class="detail-title-chevron" :aria-label="t('Switch account')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '304px' })">
              <div class="detail-jump">
                <div class="detail-jump-search-wrap">
                  <input v-model="jumpSearch" class="detail-jump-search" type="text" :placeholder="t('Search...')" />
                  <button v-if="jumpSearch" class="search-clear-btn search-clear-btn--overlay" type="button" :aria-label="t('Clear search')" @click="jumpSearch = ''">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                    </svg>
                  </button>
                </div>
                <div class="detail-jump-list">
                  <button v-for="o in jumpResults" :key="o.id" class="detail-jump-item" @click="jumpTo(o.id)">
                    <span class="detail-jump-item-number">{{ o.code }} {{ o.name }}</span>
                    <span v-if="o.accountNumber" class="detail-jump-item-customer">{{ o.currency }} {{ o.accountNumber }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">{{ t('No accounts found.') }}</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <div class="detail-bar-right">
        <!-- Primary button is tab-dependent: New transaction on Account transactions,
             Import bank statement on Bank statement. -->
        <MpPopover v-if="activeTabName === 'statement'" id="cmd-import-stmt" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="btn-enterprise btn-enterprise--primary">
              {{ t('Import bank statement') }}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem>{{ t('Import from spreadsheet') }}</MpPopoverListItem>
              <MpPopoverListItem @click="openOcrModal">{{ t('Import with OCR') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <!-- New transaction dropdown (Account transactions tab) -->
        <MpPopover v-else id="cmd-new-tx" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="btn-enterprise btn-enterprise--primary">
              {{ t('New transaction') }}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem>{{ t('Internal transfer') }}</MpPopoverListItem>
              <MpPopoverListItem>{{ t('Receive money') }}</MpPopoverListItem>
              <MpPopoverListItem>{{ t('Spend money') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <!-- Account options kebab -->
        <MpPopover id="cmd-detail-kebab" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="detail-jump-chevron btn-enterprise" :aria-label="t('More actions')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <!-- Connected → pull latest from the bank feed; otherwise set up a connection. -->
              <MpPopoverListItem v-if="account.isConnected" @click="refreshConnection">{{ t('Sync transactions') }}</MpPopoverListItem>
              <MpPopoverListItem v-else>{{ t('Connect to bank') }}</MpPopoverListItem>
              <div class="cmd-menu-divider" />
              <MpPopoverListItem @click="router.push(`/cash-management/${account.id}/edit`)">{{ t('Edit') }}</MpPopoverListItem>
              <!-- Archive ↔ Unarchive (disabled + tooltip when it has transactions) -->
              <MpPopoverListItem v-if="account.isArchived" @click="unarchiveAccount">{{ t('Unarchive') }}</MpPopoverListItem>
              <MpPopoverListItem v-else-if="canModify" @click="archiveModalOpen = true">{{ t('Archive') }}</MpPopoverListItem>
              <MpPopoverListItem v-else class="row-menu-item--disabled" @click.stop>
                <MpTooltip :id="`cmd-archive-${account.id}`" :label="t('Cannot archive. This account has recorded transactions.')" placement="left" use-portal class="cmd-menu-tip">
                  <span class="row-menu-disabled-label">{{ t('Archive') }}</span>
                </MpTooltip>
              </MpPopoverListItem>
              <!-- Delete (disabled + tooltip when it has transactions) -->
              <MpPopoverListItem v-if="canModify" class="cmd-menu-item--danger" @click="deleteModalOpen = true">{{ t('Delete') }}</MpPopoverListItem>
              <MpPopoverListItem v-else class="row-menu-item--disabled" @click.stop>
                <MpTooltip :id="`cmd-delete-${account.id}`" :label="t('Cannot delete. This account has recorded transactions.')" placement="left" use-portal class="cmd-menu-tip">
                  <span class="row-menu-disabled-label">{{ t('Delete') }}</span>
                </MpTooltip>
              </MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- ── Bank account overview — connected vs default header (dummy) ── -->
      <section class="cmd-overview">
        <div class="cmd-ov-item cmd-account">
          <div class="cmd-bank-logo">
            <MpIcon name="bank" size="lg" class="cmd-bank-logo__icon" />
          </div>
          <div class="cmd-account-col">
            <div class="cmd-account-name-row">
              <span class="cmd-account-name">{{ account.name }}</span>
              <ErpStatusBadge v-if="account.isConnected" status="active" label="Connected" size="sm" />
            </div>
            <div v-if="account.accountNumber" class="cmd-account-number">
              {{ account.currency }}&nbsp;&nbsp;{{ account.accountNumber }}
            </div>
            <!-- Live feed → last updated + refresh; imported statement → last import date. -->
            <MpTooltip v-if="account.isConnected" :id="`cmd-sync-${account.id}`" :label="syncTooltip" placement="bottom" use-portal class="cmd-sync-tip">
              <button type="button" class="cmd-last-updated btn-enterprise" @click="refreshConnection">
                <span>{{ t(lastUpdatedLabel) }}</span>
                <MpIcon name="refresh" size="sm" />
              </button>
            </MpTooltip>
            <div v-else-if="hasStatement && statementImportLabel" class="cmd-last-import">{{ statementImportLabel }}</div>
            <!-- Never imported a statement → offer to import one. -->
            <button v-else class="btn-enterprise btn-enterprise--secondary cmd-import-btn" @click="openOcrModal">
              {{ t('Import bank statement') }}
            </button>
          </div>
        </div>

        <div class="cmd-ov-item">
          <div class="cmd-stat-title">{{ t('Bank balance') }}</div>
          <div class="cmd-stat-period">{{ bankBalanceDateLabel }}</div>
          <div class="cmd-stat-amount">{{ bankBalance === null ? '—' : formatMoney(bankBalance, account.currency) }}</div>
        </div>

        <div class="cmd-ov-item">
          <div class="cmd-stat-title">{{ t('Book balance') }}</div>
          <div class="cmd-stat-period">{{ t('As of today') }}</div>
          <div class="cmd-stat-amount">{{ formatMoney(account.bookBalance, account.currency) }}</div>
        </div>

        <div class="cmd-ov-item cmd-ov-item--last">
          <div class="cmd-stat-title">{{ t('Difference') }}</div>
          <div class="cmd-stat-period">{{ differenceLabel }}</div>
          <div class="cmd-stat-amount">{{ difference === null ? '—' : formatMoney(difference, account.currency) }}</div>
        </div>
      </section>

      <!-- ── Tabs ── -->
      <MpTabs id="cmd-detail-tabs" v-model="activeTabIndex" is-manual variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab id="cmd-tab-transactions" value="transactions">{{ t('Account transactions') }}</MpTab>
          <MpTab id="cmd-tab-statement" value="statement">{{ t('Bank statement') }}</MpTab>
        </MpTabList>
        <MpTabPanels>

          <!-- ── Account transactions tab — the software's own documents ── -->
          <MpTabPanel value="transactions">
            <ErpTablePage
              :columns="transactionColumns"
              :rows="(txPaginated as Record<string, unknown>[])"
              :total="txTotal"
              :current-page="txCurrentPage"
              :per-page="txPerPage"
              :sort-key="txSortKey"
              :sort-dir="txSortDir"
              :search="txSearch"
              :loading="loading"
              has-checkbox
              actions-width="52px"
              filter-empty-label="transaction"
              @page-change="txSetPage"
              @per-page-change="txSetPerPage"
              @sort-change="txSetSort"
              @hide-column="hideTxColumn"
              @clear-filters="txSearch = ''"
            >
              <template #filters>
                <div class="cmd-stmt-filterrow">
                  <div class="cmd-stmt-filterrow-left">
                    <AdvancedDateRangePicker
                      id="cmd-tx-daterange" :model-value="txDateRange" placeholder="All dates"
                      @update:model-value="onTxDatePick"
                    />
                    <button type="button" class="cmd-allfilters-btn btn-enterprise" :class="{ 'cmd-allfilters-btn--active': txFilterCount > 0 }" @click="txFiltersOpen = true">
                      <MpIcon name="filter" size="sm" />
                      {{ t('All filters') }}{{ txFilterCount > 0 ? ` (${txFilterCount})` : '' }}
                    </button>
                  </div>
                  <div class="cmd-stmt-filterrow-right">
                    <div class="cmd-btn-group">
                      <button v-tooltip="{ label: t('Ask Airene'), placement: 'bottom' }" class="filter-icon-btn filter-icon-btn--airene btn-enterprise" :aria-label="t('Ask Airene')">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                          <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
                        </svg>
                      </button>
                      <ColumnSettingsMenu id="cmd-tx-columns" :items="txColumnItems" :visibility="txColumnVisibility" />
                    </div>
                    <div class="filter-search">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                      </svg>
                      <input v-model="txSearch" class="filter-search-input" type="text" :placeholder="t('Search...')" />
                      <button v-if="txSearch" class="search-clear-btn btn-enterprise" type="button" :aria-label="t('Clear search')" @click="txSearch = ''">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </template>

              <template #empty>
                <div class="cmd-empty">
                  <img src="/illustrations/empty-folder.png" alt="" class="cmd-empty__img" width="240" height="200" />
                  <p class="cmd-empty__title">{{ t('No transactions yet') }}</p>
                  <p class="cmd-empty__desc">{{ t('Transactions for this account will appear here once you record them.') }}</p>
                </div>
              </template>

              <template #cell-date="{ value }">{{ formatDate(value as string) }}</template>
              <template #cell-number="{ row }">
                <span class="cmd-cell-link" @click.stop="openTransaction(row as AccountTransactionLine)">{{ (row as AccountTransactionLine).type }} #{{ (row as AccountTransactionLine).number }}</span>
              </template>
              <template #cell-contact="{ row }">
                <span class="cmd-cell-link" @click.stop="openContact((row as AccountTransactionLine).contact)">{{ (row as AccountTransactionLine).contact }}</span>
              </template>
              <template #cell-moneyIn="{ row }">
                <span v-if="(row as AccountTransactionLine).moneyIn > 0">{{ formatMoney((row as AccountTransactionLine).moneyIn, account.currency) }}</span>
                <span v-else class="cmd-zero">—</span>
              </template>
              <template #cell-moneyOut="{ row }">
                <span v-if="(row as AccountTransactionLine).moneyOut > 0">{{ formatMoney((row as AccountTransactionLine).moneyOut, account.currency) }}</span>
                <span v-else class="cmd-zero">—</span>
              </template>
              <template #cell-balance="{ value }">{{ formatMoney(value as number, account.currency) }}</template>
              <template #cell-status="{ row }">
                <ErpStatusBadge v-if="(row as AccountTransactionLine).status === 'reconciled'" status="active" label="Reconciled" />
                <ErpStatusBadge v-else status="pending" label="Unreconciled" />
              </template>

              <template #actions="{ row }">
                <MpPopover :id="`cmd-tx-act-${(row as AccountTransactionLine).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                  <MpPopoverTrigger>
                    <button class="row-kebab btn-enterprise" :aria-label="t('More actions')">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
                    <MpPopoverList>
                      <MpPopoverListItem @click="openTransaction(row as AccountTransactionLine)">{{ t('View details') }}</MpPopoverListItem>
                      <!-- Reconcile actions only for accounts with a bank statement. -->
                      <template v-if="hasStatement">
                        <MpPopoverListItem @click="toggleReconcile(row as AccountTransactionLine)">
                          {{ (row as AccountTransactionLine).status === 'reconciled' ? t('Unreconcile') : t('Reconcile') }}
                        </MpPopoverListItem>
                        <MpPopoverListItem @click="markReconciled(row as AccountTransactionLine)">{{ t('Mark as reconciled') }}</MpPopoverListItem>
                      </template>
                      <MpPopoverListItem class="cmd-menu-item--danger" @click="deleteTransaction(row as AccountTransactionLine)">{{ t('Delete') }}</MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </template>
            </ErpTablePage>
          </MpTabPanel>

          <!-- ── Bank statement tab ── -->
          <MpTabPanel value="statement">
            <ErpTablePage
              :columns="statementColumns"
              :rows="(stmtPaginated as Record<string, unknown>[])"
              :total="stmtTotal"
              :current-page="stmtCurrentPage"
              :per-page="stmtPerPage"
              :sort-key="stmtSortKey"
              :sort-dir="stmtSortDir"
              :search="stmtSearch"
              :loading="loading"
              has-checkbox
              actions-width="52px"
              filter-empty-label="transaction"
              @page-change="stmtSetPage"
              @per-page-change="stmtSetPerPage"
              @sort-change="stmtSetSort"
              @clear-filters="stmtSearch = ''"
            >
              <template #filters>
                <div class="cmd-stmt-filterrow">
                  <div class="cmd-stmt-filterrow-left">
                    <AdvancedDateRangePicker
                      id="cmd-stmt-daterange" :model-value="stmtDateRange" placeholder="All dates"
                      @update:model-value="onStmtDatePick"
                    />
                    <button type="button" class="cmd-allfilters-btn btn-enterprise" :class="{ 'cmd-allfilters-btn--active': stmtFilterCount > 0 }" @click="stmtFiltersOpen = true">
                      <MpIcon name="filter" size="sm" />
                      {{ t('All filters') }}{{ stmtFilterCount > 0 ? ` (${stmtFilterCount})` : '' }}
                    </button>
                    <label class="cmd-hide-deleted">
                      <MpCheckbox v-model:is-checked="hideDeleted" :aria-label="t('Hide deleted lines')" />
                      <span>{{ t('Hide deleted lines') }}</span>
                    </label>
                  </div>
                  <div class="cmd-stmt-filterrow-right">
                    <div class="cmd-btn-group">
                      <button v-tooltip="{ label: t('Ask Airene'), placement: 'bottom' }" class="filter-icon-btn filter-icon-btn--airene btn-enterprise" :aria-label="t('Ask Airene')">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                          <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
                        </svg>
                      </button>
                      <button v-tooltip="{ label: t('Export'), placement: 'bottom' }" class="filter-icon-btn btn-enterprise" :aria-label="t('Export')">
                        <MpIcon name="download" size="md" />
                      </button>
                    </div>
                    <div class="filter-search">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                      </svg>
                      <input v-model="stmtSearch" class="filter-search-input" type="text" :placeholder="t('Search...')" />
                      <button v-if="stmtSearch" class="search-clear-btn btn-enterprise" type="button" :aria-label="t('Clear search')" @click="stmtSearch = ''">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </template>

              <template #empty>
                <div class="cmd-empty">
                  <img src="/illustrations/empty-folder.png" alt="" class="cmd-empty__img" width="240" height="200" />
                  <p class="cmd-empty__title">{{ t('No bank statement imported') }}</p>
                  <p class="cmd-empty__desc">{{ t('Import a bank statement to see its lines here.') }}</p>
                </div>
              </template>

              <template #cell-date="{ value }">{{ formatDate(value as string) }}</template>
              <template #cell-description="{ row }">
                <span :class="{ 'cmd-desc--deleted': (row as BankStatementLine).status === 'deleted' }">
                  {{ (row as BankStatementLine).description }}
                </span>
              </template>
              <template #cell-moneyIn="{ row }">
                <span v-if="(row as BankStatementLine).moneyIn > 0">{{ formatMoney((row as BankStatementLine).moneyIn, account.currency) }}</span>
                <span v-else class="cmd-zero">—</span>
              </template>
              <template #cell-moneyOut="{ row }">
                <span v-if="(row as BankStatementLine).moneyOut > 0">{{ formatMoney((row as BankStatementLine).moneyOut, account.currency) }}</span>
                <span v-else class="cmd-zero">—</span>
              </template>
              <template #cell-balance="{ value }">{{ formatMoney(value as number, account.currency) }}</template>
              <template #cell-status="{ row }">
                <ErpStatusBadge v-if="(row as BankStatementLine).status === 'reconciled'" status="active" label="Reconciled" />
                <ErpStatusBadge v-else-if="(row as BankStatementLine).status === 'unreconciled'" status="pending" label="Unreconciled" />
                <ErpStatusBadge v-else status="voided" label="Deleted" />
              </template>

              <template #actions="{ row }">
                <MpPopover :id="`cmd-stmt-act-${(row as BankStatementLine).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                  <MpPopoverTrigger>
                    <button class="row-kebab btn-enterprise" :aria-label="t('More actions')">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                        <circle cx="12" cy="5" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="12" cy="19" r="2" />
                      </svg>
                    </button>
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                    <MpPopoverList>
                      <MpPopoverListItem>{{ t('View details') }}</MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </template>
            </ErpTablePage>
          </MpTabPanel>

        </MpTabPanels>
      </MpTabs>
    </div>

    <!-- v-if (not just :open) — MpModal's internal isOpen state only reacts to the
         prop turning true, never false, so closing must unmount the component. -->
    <ImportBankStatementOcrModal
      v-if="ocrModalOpen" :open="true" :initial-files="ocrInitialFiles"
      @close="ocrModalOpen = false"
    />
    <GlobalFileDropOverlay v-if="TAB_NAMES[activeTabIndex] === 'statement'" @drop="onGlobalFileDrop" />

    <!-- ── All filters drawers (one per tab) ── -->
    <CashTxFiltersDrawer
      id="cmd-tx-filters"
      v-model:is-open="txFiltersOpen"
      :model-value="appliedTxFilters"
      :status-options="reconcileStatusOptions"
      @apply="onTxFiltersApply"
    />
    <CashTxFiltersDrawer
      id="cmd-stmt-filters"
      v-model:is-open="stmtFiltersOpen"
      :model-value="appliedStmtFilters"
      :status-options="[{ value: 'reconciled', label: t('Reconciled') }, { value: 'unreconciled', label: t('Unreconciled') }]"
      @apply="onStmtFiltersApply"
    />

    <!-- ── Archive confirmation ── -->
    <MpModal id="cmd-archive-modal" :is-open="archiveModalOpen" size="sm" is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="archiveModalOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Archive account?') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>{{ t("Archived accounts will be hidden from the list and can't be used in any transactions.") }}</MpModalBody>
        <MpModalFooter>
          <div class="cmd-modal-btns">
            <button class="btn-enterprise btn-enterprise--ghost" @click="archiveModalOpen = false">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmArchive">{{ t('Archive') }}</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Delete confirmation ── -->
    <MpModal id="cmd-delete-modal" :is-open="deleteModalOpen" size="sm" is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="deleteModalOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Delete account?') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>{{ t('Deleted accounts cannot be restored.') }}</MpModalBody>
        <MpModalFooter>
          <div class="cmd-modal-btns">
            <button class="btn-enterprise btn-enterprise--ghost" @click="deleteModalOpen = false">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmDelete">{{ t('Delete') }}</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>
</template>

<style scoped>
/* ── Import bank statement dropdown ── */
.cmd-import-menu {
  display: flex;
  flex-direction: column;
  padding: var(--mp-spacing-2) 0;
}
.cmd-import-option {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  gap: var(--mp-spacing-1, 4px);
  height: auto !important;
  min-height: 0 !important;
  padding: var(--mp-spacing-3) var(--mp-spacing-4) !important;
  white-space: normal !important;
  cursor: pointer;
}
/* MpPopoverListItem wraps its slot in its own flex row (justify-content:space-between) —
   override that inner wrapper too, or our title/desc spans get squeezed side-by-side. */
.cmd-import-option :deep(> div) {
  display: flex !important;
  flex-direction: column !important;
  align-items: flex-start !important;
  justify-content: flex-start !important;
  gap: var(--mp-spacing-1, 4px);
  width: 100%;
}
.cmd-import-option__title-row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
}
.cmd-import-option__title {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.cmd-import-option__desc {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
  white-space: normal;
}
.cmd-import-option__sparkle {
  flex-shrink: 0;
  color: var(--mp-airene-default);
}

/* ── Page shell (mirrors the other ERP detail pages — no shared base component) ── */

.detail-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

.detail-bar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle);
  padding: 0 var(--mp-spacing-6);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.detail-bar-left {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
  min-width: 0;
}
.detail-bar-right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  flex-shrink: 0;
}
.detail-breadcrumb {
  align-self: flex-start;
  background: none;
  border: none;
  border-radius: 0;
  padding: 0;
  cursor: pointer;
  font-size: var(--mp-font-sizes-sm, 12px);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-link);
  line-height: var(--mp-line-heights-md);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}
.detail-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl, 24px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

.detail-jump-chevron {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  background: none; border: none; padding: 0;
  border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default);
}
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }

/* Title row: plain H1 + chevron-only jump switcher (chevron triggers, never the H1). */
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.detail-title-chevron {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  background: none; border: none; padding: 0; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default, var(--mp-text-secondary));
}
.detail-title-chevron:hover { background: var(--mp-background-neutral-hovered); }

/* Jump-to-account popover (search + list) — mirrors expense details. */
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); position: relative; }
.detail-jump-search {
  width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none;
  padding-right: 34px;
}
.detail-jump-search:focus { border-color: var(--mp-border-brand-bold, #029861); }
.detail-jump-search::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn--overlay { position: absolute; right: 18px; top: 50%; transform: translateY(-50%); }
.detail-jump-list { display: flex; flex-direction: column; max-height: 320px; overflow-y: auto; padding-bottom: var(--mp-spacing-2); }
.detail-jump-item {
  display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); width: 100%; text-align: left;
  background: none; border: none; cursor: pointer; padding: var(--mp-spacing-2) var(--mp-spacing-3);
}
.detail-jump-item:hover { background: var(--mp-background-neutral-subtle); }
.detail-jump-item-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-customer { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* Account-options kebab menu */
.cmd-menu-divider { height: 1px; margin: var(--mp-spacing-1) 0; background: var(--mp-border-default); }
.cmd-menu-item--danger { color: var(--mp-text-critical, var(--mp-text-danger)); }
/* Disabled Archive / Delete (has recorded transactions) — greyed + inert, but
   still hoverable so the "why" tooltip shows (same treatment as the index). */
.row-menu-item--disabled { color: var(--mp-text-disabled); cursor: not-allowed; }
.row-menu-disabled-label { color: var(--mp-text-disabled); }
.cmd-menu-tip { display: block; }
.cmd-modal-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

/* ── Stage ── */
.detail-stage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-8);
}

/* ── Bank account overview ── */
.cmd-overview {
  display: flex;
  gap: var(--mp-spacing-6);
  align-items: stretch;
}
.cmd-ov-item {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
  padding-right: var(--mp-spacing-6);
  border-right: 1px solid var(--mp-border-default);
}
.cmd-ov-item--last { border-right: none; }

.cmd-account {
  flex-direction: row;
  gap: var(--mp-spacing-3);
  align-items: flex-start;
}
.cmd-bank-logo {
  flex-shrink: 0;
  width: var(--mp-sizes-8, 32px);
  height: var(--mp-sizes-8, 32px);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--mp-text-secondary);
}
.cmd-bank-logo__icon { width: var(--mp-sizes-6, 24px) !important; height: var(--mp-sizes-6, 24px) !important; }
.cmd-account-col {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1, 4px);
  min-width: 0;
}
.cmd-account-name-row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
}
.cmd-account-name {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
  white-space: nowrap;
}
.cmd-account-number {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-md);
  white-space: nowrap;
}
.cmd-last-updated {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1, 4px);
  border: none;
  border-radius: 0;
  background: none;
  padding: 0;
  cursor: pointer;
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}
.cmd-last-updated:hover { color: var(--mp-text-default); }
.cmd-last-import {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}
.cmd-import-btn { align-self: flex-start; margin-top: var(--mp-spacing-1); }

.cmd-stat-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-md);
  white-space: nowrap;
}
.cmd-stat-period {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-sm, 16px);
  white-space: nowrap;
}
.cmd-stat-amount {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-2xl, 32px);
  white-space: nowrap;
}

/* ── Tabs ── */
.detail-tabs { margin-top: 0; }
.detail-tabs :deep(.mp-tab--isSelected_true),
.detail-tabs :deep(.mp-tab--isSelected_true:hover) {
  color: var(--mp-text-selected) !important;
}
.detail-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) {
  background-color: var(--mp-border-selected, #029861) !important;
}
.detail-tabs :deep([data-pixel-component="MpTabList"]) {
  margin-bottom: var(--mp-spacing-5) !important;
}

/* ── Filter bar ── */
.cmd-stmt-filterrow {
  display: flex;
  align-items: center;   /* everything centres on the date-picker field */
  justify-content: space-between;
  gap: var(--mp-spacing-3);
  width: 100%;
}
.cmd-stmt-filterrow-left {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-4);
}
.cmd-stmt-filterrow-right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}
/* Icon buttons sit together (no gap), then spacing-3 to the search — matches the
   index-page filter bar (.filter-btn-group + .filter-right). */
.cmd-btn-group {
  display: flex;
  align-items: center;
}
.cmd-apply-btn { flex-shrink: 0; }
/* "All filters" pill — mirrors the index-page filter button. */
.cmd-allfilters-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-md);
  color: var(--mp-text-secondary);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
}
.cmd-allfilters-btn:hover { background: var(--mp-background-neutral-hovered); }
.cmd-allfilters-btn--active {
  background: var(--mp-background-selected, var(--mp-background-information));
  border-color: var(--mp-border-selected, var(--mp-border-information));
  color: var(--mp-text-selected, var(--mp-text-information));
}
.cmd-hide-deleted {
  display: inline-flex;
  align-items: center;
  /* gap:0 — MpCheckbox renders its own 12px control-to-label gap (docs/patterns/Form.md). */
  gap: 0;
  cursor: pointer;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  white-space: nowrap;
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
  flex-shrink: 0;
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

/* ── Table cells ── */
/* Clickable Number / Contact — span styled as a link (not MpTextlink, per the
   table-name-link rule: button padding misaligns the cell). */
.cmd-cell-link { color: var(--mp-text-link); cursor: pointer; }
.cmd-cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cmd-zero { color: var(--mp-text-secondary); }
.cmd-desc--deleted {
  text-decoration: line-through;
  color: var(--mp-text-secondary);
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
  border-radius: var(--mp-radii-sm);
  color: var(--mp-text-subtle);
  flex-shrink: 0;
}
.row-kebab:hover {
  background: var(--mp-background-neutral-hovered);
  color: var(--mp-text-default);
}
/* Pin the icon size — as a flex item the SVG can otherwise collapse to 0 width
   (width/height attrs aren't a firm basis), leaving the button visually empty. */
.row-kebab svg { width: 20px; height: 20px; flex-shrink: 0; }

/* ── Empty state (no transactions / no statement) ── */
.cmd-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-10, 40px) 0;
}
.cmd-empty__img {
  width: var(--mp-sizes-60, 240px);
  height: var(--mp-sizes-50, 200px);
  object-fit: contain;
  margin-bottom: var(--mp-spacing-1);
}
.cmd-empty__title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.cmd-empty__desc {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
</style>

<!-- Non-scoped: the sync-quota tooltip is two lines when the quota is exhausted.
     Pixel tooltips default to white-space:normal (collapses the label's newline);
     pre-line preserves it. Safe for every tooltip — only labels that actually
     contain a newline are affected. -->
<style>
.mp-tooltip { white-space: pre-line; }
</style>
