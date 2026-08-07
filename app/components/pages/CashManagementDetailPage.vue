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
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpIcon, MpCheckbox,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ImportBankStatementOcrModal from '~/components/patterns/ImportBankStatementOcrModal.vue'
import GlobalFileDropOverlay from '~/components/patterns/GlobalFileDropOverlay.vue'
import { cashAccounts } from '~/data'
import type { CashAccountCurrency } from '~/data'
import {
  getBankStatementLines, getAccountTransactions,
  type BankStatementLine, type AccountTransactionLine,
} from '~/data/bankStatementLines'
import { formatDate, formatDateLong } from '~/utils/date'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const route = useRoute()
const { t } = useLocale()

const account = computed(() => cashAccounts.find(a => a.id === props.orderId))

function goBack() { router.push('/cash-management') }

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

/** 'Rp15.000.000,00' — no space after the symbol, negatives in accounting parens. */
function formatMoney(amount: number, currency: CashAccountCurrency) {
  const text = new Intl.NumberFormat('id-ID', {
    style: 'currency', currency, minimumFractionDigits: 2,
  }).format(Math.abs(amount)).replace(/^(\D+?)[\s ]+/, '$1')
  return amount < 0 ? `(${text})` : text
}

// ── Header (dummy "last updated" — no real bank feed) ──────────────────────
const lastUpdatedLabel = ref('Last updated a few minutes ago')
function refreshConnection() { lastUpdatedLabel.value = 'Last updated just now' }

// ── Bank statement (Bank statement tab) ─────────────────────────────────────
const allStatementLines = computed<BankStatementLine[]>(() => {
  const a = account.value
  if (!a) return []
  return getBankStatementLines(a.id, a.bookBalance, a.unreconciledCount)
})

const bankBalance = computed(() => allStatementLines.value[0]?.balance ?? account.value?.bookBalance ?? 0)
const bankBalanceDateLabel = computed(() => {
  const latest = allStatementLines.value[0]
  return latest ? `${t('As of')} ${formatDateLong(latest.date)}` : t('No statement imported')
})
const unreconciledCount = computed(() => allStatementLines.value.filter(l => l.status === 'unreconciled').length)
const difference = computed(() => bankBalance.value - (account.value?.bookBalance ?? 0))
const differenceLabel = computed(() => {
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
  filterFn: (row: BankStatementLine, s) => row.description.toLowerCase().includes(s),
})

const statementColumns: TableColumn[] = [
  { key: 'date',        label: 'Date',        width: '120px',                 sortType: 'date'   },
  { key: 'description', label: 'Description', width: '360px',                 sortType: 'text'   },
  { key: 'moneyIn',     label: 'Money in',    width: '160px', align: 'right', sortType: 'number' },
  { key: 'moneyOut',    label: 'Money out',   width: '160px', align: 'right', sortType: 'number' },
  { key: 'balance',     label: 'Balance',     width: '160px', align: 'right', sortType: 'number' },
  { key: 'status',      label: 'Status',      width: '140px'                                      },
]

// ── Account transactions (Account transactions tab) — the software's own
//    documents (sales invoices, payments, expenses, credit memos…), not the
//    raw bank feed shown in the Bank statement tab. ───────────────────────────
const allTransactionLines = computed<AccountTransactionLine[]>(() => {
  const a = account.value
  if (!a) return []
  return getAccountTransactions(a.id, a.bookBalance, a.unreconciledCount)
})
const {
  search: txSearch, currentPage: txCurrentPage, paginated: txPaginated, total: txTotal,
  perPage: txPerPage, sortKey: txSortKey, sortDir: txSortDir,
  setPage: txSetPage, setPerPage: txSetPerPage, setSort: txSetSort,
} = useTableState(allTransactionLines, {
  filterFn: (row: AccountTransactionLine, s) =>
    row.contact.toLowerCase().includes(s) || row.type.toLowerCase().includes(s) || String(row.number).includes(s),
})

const allTransactionColumns: TableColumn[] = [
  { key: 'date',     label: 'Date',     width: '120px',                 sortType: 'date'   },
  { key: 'number',   label: 'Number',   width: '220px',                 sortType: 'text'   },
  { key: 'contact',  label: 'Contact',  width: '260px',                 sortType: 'text'   },
  { key: 'moneyIn',  label: 'Money in', width: '160px', align: 'right', sortType: 'number' },
  { key: 'moneyOut', label: 'Money out',width: '160px', align: 'right', sortType: 'number' },
  { key: 'balance',  label: 'Balance',  width: '160px', align: 'right', sortType: 'number' },
  { key: 'status',   label: 'Status',   width: '140px'                                      },
]
const txColumnVisibility = reactive<Record<string, boolean>>(
  Object.fromEntries(allTransactionColumns.map(c => [c.key, true])),
)
const txColumnItems = allTransactionColumns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const transactionColumns = computed<TableColumn[]>(() => allTransactionColumns.filter(c => txColumnVisibility[c.key]))
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
</script>

<template>
  <div v-if="account" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">{{ t('Cash management') }}</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ account.code }} {{ account.name }}</h1>
        </div>
      </div>

      <div class="detail-bar-right">
        <MpPopover id="cmd-import-menu" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="btn-enterprise btn-enterprise--primary">
              {{ t('Import bank statement') }}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ width: '320px', padding: '0' })">
            <div class="cmd-import-menu">
              <MpPopoverListItem class="cmd-import-option">
                <span class="cmd-import-option__title">{{ t('Import from spreadsheet') }}</span>
              </MpPopoverListItem>
              <MpPopoverListItem class="cmd-import-option" @click="openOcrModal">
                <span class="cmd-import-option__title-row">
                  <span class="cmd-import-option__title">{{ t('Import with OCR') }}</span>
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true" class="cmd-import-option__sparkle">
                    <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                    <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
                  </svg>
                </span>
                <span class="cmd-import-option__desc">{{ t('Upload any bank statement file without using an import template') }}</span>
              </MpPopoverListItem>
            </div>
          </MpPopoverContent>
        </MpPopover>

        <MpPopover id="cmd-detail-kebab" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="detail-jump-chevron" :aria-label="t('More actions')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <circle cx="12" cy="5" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="12" cy="19" r="2" />
              </svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem>{{ t('Export statement') }}</MpPopoverListItem>
              <MpPopoverListItem>{{ t('Rename account') }}</MpPopoverListItem>
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
            <button v-if="account.isConnected" type="button" class="cmd-last-updated" @click="refreshConnection">
              <span>{{ t(lastUpdatedLabel) }}</span>
              <MpIcon name="refresh" size="sm" />
            </button>
          </div>
        </div>

        <div class="cmd-ov-item">
          <div class="cmd-stat-title">{{ t('Bank balance') }}</div>
          <div class="cmd-stat-period">{{ bankBalanceDateLabel }}</div>
          <div class="cmd-stat-amount">{{ formatMoney(bankBalance, account.currency) }}</div>
        </div>

        <div class="cmd-ov-item">
          <div class="cmd-stat-title">{{ t('Book balance') }}</div>
          <div class="cmd-stat-period">{{ t('As of today') }}</div>
          <div class="cmd-stat-amount">{{ formatMoney(account.bookBalance, account.currency) }}</div>
        </div>

        <div class="cmd-ov-item cmd-ov-item--last">
          <div class="cmd-stat-title">{{ t('Difference') }}</div>
          <div class="cmd-stat-period">{{ differenceLabel }}</div>
          <div class="cmd-stat-amount">{{ formatMoney(difference, account.currency) }}</div>
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
                <div class="cmd-stmt-filterbar">
                  <div class="cmd-daterange-label">{{ t('Date range: All dates') }}</div>
                  <div class="cmd-stmt-filterrow">
                    <div class="cmd-stmt-filterrow-left">
                      <button type="button" class="cmd-daterange-pill">
                        <MpIcon name="calendar" size="md" />
                        <span>15/10/2024 - 17/01/2026</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </button>
                      <button type="button" class="btn-enterprise btn-enterprise--secondary">{{ t('Apply') }}</button>
                    </div>
                    <div class="cmd-stmt-filterrow-right">
                      <button class="filter-icon-btn filter-icon-btn--airene" :aria-label="t('Ask Airene')">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                          <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
                        </svg>
                      </button>
                      <ColumnSettingsMenu id="cmd-tx-columns" :items="txColumnItems" :visibility="txColumnVisibility" />
                      <div class="filter-search">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        <input v-model="txSearch" class="filter-search-input" type="text" :placeholder="t('Search...')" />
                        <button v-if="txSearch" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="txSearch = ''">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <template #cell-date="{ value }">{{ formatDate(value as string) }}</template>
              <template #cell-number="{ row }">{{ (row as AccountTransactionLine).type }} #{{ (row as AccountTransactionLine).number }}</template>
              <template #cell-contact="{ value }">{{ value }}</template>
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

              <template #actions>
                <button class="row-kebab" :aria-label="t('More actions')">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                  </svg>
                </button>
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
              has-checkbox
              actions-width="52px"
              filter-empty-label="transaction"
              @page-change="stmtSetPage"
              @per-page-change="stmtSetPerPage"
              @sort-change="stmtSetSort"
              @clear-filters="stmtSearch = ''"
            >
              <template #filters>
                <div class="cmd-stmt-filterbar">
                  <div class="cmd-daterange-label">{{ t('Date range: All dates') }}</div>
                  <div class="cmd-stmt-filterrow">
                    <div class="cmd-stmt-filterrow-left">
                      <button type="button" class="cmd-daterange-pill">
                        <MpIcon name="calendar" size="md" />
                        <span>15/10/2024 - 17/01/2026</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>
                      </button>
                      <label class="cmd-hide-deleted">
                        <MpCheckbox v-model:is-checked="hideDeleted" :aria-label="t('Hide deleted lines')" />
                        <span>{{ t('Hide deleted lines') }}</span>
                      </label>
                    </div>
                    <div class="cmd-stmt-filterrow-right">
                      <button class="filter-icon-btn filter-icon-btn--airene" :aria-label="t('Ask Airene')">
                        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                          <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                          <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
                        </svg>
                      </button>
                      <button class="filter-icon-btn" :aria-label="t('Export')">
                        <MpIcon name="download" size="md" />
                      </button>
                      <div class="filter-search">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                          <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                        <input v-model="stmtSearch" class="filter-search-input" type="text" :placeholder="t('Search...')" />
                        <button v-if="stmtSearch" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="stmtSearch = ''">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
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

              <template #actions>
                <button class="row-kebab" :aria-label="t('More actions')">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="12" cy="5" r="2" />
                    <circle cx="12" cy="12" r="2" />
                    <circle cx="12" cy="19" r="2" />
                  </svg>
                </button>
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
  padding: 0;
  cursor: pointer;
  font-size: var(--mp-font-sizes-sm, 12px);
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
  background: none;
  padding: 0;
  cursor: pointer;
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}
.cmd-last-updated:hover { color: var(--mp-text-default); }

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

/* ── Bank statement filter bar ── */
.cmd-stmt-filterbar {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
  width: 100%;
}
.cmd-daterange-label {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.cmd-stmt-filterrow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-3);
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
.cmd-daterange-pill {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  cursor: pointer;
}
.cmd-daterange-pill:hover { background: var(--mp-background-neutral-hovered); }
.cmd-hide-deleted {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-3);
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
  width: 248px;
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
</style>
