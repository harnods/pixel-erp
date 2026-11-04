<!-- prod-parity: jurnal-frontend-app/src/pages/accounts/detail/show.vue -->
<script setup lang="ts">
/**
 * Account detail (/chart-of-accounts/:id). Title "(code) - name" + Archived badge;
 * Actions: Edit account · Archive/Unarchive account · Delete account (same gates as
 * prod). Body: Account category, then either the sub-account table (header account)
 * or the account's transactions for a Start/End date range with a running balance.
 * Full-page: routed via detailMatch, owns its title bar + stage.
 */
import {
  MpButton, MpDatePicker, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast, successToast } from '~/utils/toasts'
import { SIM_TODAY_ISO } from '~/data/simClock'
import {
  getAccount, categoryOf, accountTitle, accountBalance, accountTransactions, childrenOf, isHeader, hasTransactions,
  isDefaultAccount, setArchived, deleteAccount, type AccountTxRow,
} from '~/data/chartOfAccounts'
// Side effect: posts published closing books' closing entries into the shared ledger.
import '~/data/closeBooks'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const account = computed(() => getAccount(decodeURIComponent(props.orderId)))
const header = computed(() => !!account.value && isHeader(account.value.id))
const balance = computed(() => (account.value ? accountBalance(account.value) : 0))
const money = (n: number) => formatIDR(n) // base currency, as prod

// ── Date filter (DD/MM/YYYY strings, prod format) ──
const toDmy = (iso: string) => iso.split('-').reverse().join('/')
const toIso = (dmy: string) => dmy.split('/').reverse().join('-')
// Report drill-down (Balance sheet / Profit & loss) passes ?start=&end= (ISO), like prod's q[transaction_date_*].
const route = useRoute()
const isoQ = (k: string) => { const v = route.query[k]; return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '' }
const initStart = isoQ('start') || '2026-01-01'
const initEnd = isoQ('end') || SIM_TODAY_ISO
const startDate = ref(toDmy(initStart))
const endDate = ref(toDmy(initEnd))
const applied = ref({ start: initStart, end: initEnd })
const dateError = ref('')
function applyFilter() {
  dateError.value = ''
  if (!startDate.value || !endDate.value) { dateError.value = t('You must select start date and end date'); return }
  const s = toIso(startDate.value), e = toIso(endDate.value)
  if (s > e) { dateError.value = t('Start date must be before end date'); return }
  applied.value = { start: s, end: e }
}

// ── Transactions ──
type TxRow = AccountTxRow & { seq: number; [k: string]: unknown }
// Chronological, beginning balance first (seq keeps the ledger order through useTableState).
const txRows = computed<TxRow[]>(() => (account.value && !header.value
  ? accountTransactions(account.value, applied.value.start, applied.value.end).map((r, i) => ({ ...r, seq: i }))
  : []))
const realTx = computed(() => txRows.value.filter(r => !r.isBeginning))
const { currentPage, paginated, total, perPage, setPage, setPerPage } = useTableState<TxRow>(txRows, { perPage: 25, defaultSort: { key: 'seq', dir: 'asc' } })
const txColumns: TableColumn[] = [
  { key: 'date', label: t('Date'), kind: 'date' },
  { key: 'no', label: t('Transaction no.') },
  { key: 'contact', label: t('Contact name') },
  { key: 'debit', label: t('Debit'), kind: 'amount', align: 'right' },
  { key: 'credit', label: t('Credit'), kind: 'amount', align: 'right' },
  { key: 'balance', label: t('Balance'), kind: 'amount', align: 'right' },
]
const amt = (n: number) => (n ? money(n) : '-')

// ── Child accounts (header) ──
type ChildRow = { id: string; code: string; name: string; balance: number; archived?: boolean }
const childRows = computed<ChildRow[]>(() => (account.value ? childrenOf(account.value.id).map(c => ({ id: c.id, code: c.code, name: c.name, balance: accountBalance(c), archived: c.archived })).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })) : []))
const childColumns: TableColumn[] = [
  { key: 'code', label: t('Account code'), kind: 'number' },
  { key: 'name', label: t('Account name'), kind: 'address' },
  { key: 'balance', label: t('Balance'), kind: 'amount', align: 'right' },
]

// ── Actions (gates from detail/show.vue) ──
const locked = computed(() => !!account.value && (hasTransactions(account.value) || descendantsHaveTx()))
function descendantsHaveTx() { return !!account.value && childrenOf(account.value.id).some(c => hasTransactions(c)) }
const isDefault = computed(() => !!account.value && isDefaultAccount(account.value))
const archiveBlock = computed(() => {
  const a = account.value
  if (!a || a.archived) return ''
  if (balance.value !== 0) return t('Cannot be archived because the balance is not zero')
  if (childrenOf(a.id).some(c => !c.archived)) return t('Cannot be archived because it still has unarchived child accounts')
  return ''
})
const deleteBlock = computed(() => {
  if (isDefault.value) return t('This is a default account from Jurnal. This account cannot be deleted even if it has no transactions.')
  if (locked.value) return t('Cannot delete the account because it already has transactions.')
  return ''
})

function back() { router.push('/chart-of-accounts') }
function edit() { if (account.value) router.push(`/chart-of-accounts/${encodeURIComponent(account.value.id)}/edit`) }
function toggleArchive() {
  const a = account.value
  if (!a || archiveBlock.value) return
  const wasArchived = !!a.archived
  setArchived(a.id, !wasArchived)
  successToast(wasArchived ? t('Account unarchived') : t('Account archived'))
}
const deleteOpen = ref(false)
function confirmDelete() {
  if (!account.value) return
  deleteAccount(account.value.id)
  successToast(t('Account deleted'))
  back()
}
function openTx(r: TxRow) { if (!r.isBeginning) infoToast(t('Not in this prototype')) }
function openChild(r: ChildRow) { router.push(`/chart-of-accounts/${encodeURIComponent(r.id)}`) }
</script>

<template>
  <div class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <div class="detail-breadcrumb-row">
          <MpButton variant="ghost" is-rounded class="detail-breadcrumb" @click="back">{{ t('Chart of accounts') }}</MpButton>
        </div>
        <div class="detail-title-row">
          <h1 class="detail-title">{{ account ? accountTitle(account) : t('Account') }}</h1>
          <ErpStatusBadge v-if="account?.archived" status="archived" size="md" badge-for="additionalInformation" />
        </div>
      </div>
      <MpPopover v-if="account" id="coa-detail-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="primary" is-rounded right-icon="chevrons-down">{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '200px', maxWidth: '280px' })" class="erp-dropdown-menu">
          <MpPopoverList>
            <MpPopoverListItem @click="edit">{{ t('Edit account') }}</MpPopoverListItem>
            <MpPopoverListItem :is-disabled="!!archiveBlock" @click="toggleArchive">
              <span class="cad-menu-item">
                <span>{{ account.archived ? t('Unarchive account') : t('Archive account') }}</span>
                <span v-if="archiveBlock" class="cad-menu-reason">{{ archiveBlock }}</span>
              </span>
            </MpPopoverListItem>
            <MpPopoverListItem :is-disabled="!!deleteBlock" @click="!deleteBlock && (deleteOpen = true)">
              <span class="cad-menu-item">
                <span>{{ t('Delete account') }}</span>
                <span v-if="deleteBlock" class="cad-menu-reason">{{ deleteBlock }}</span>
              </span>
            </MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </header>

    <div class="detail-stage">
      <template v-if="account">
        <section class="cad-head">
          <dl class="cad-info">
            <dt>{{ t('Account category') }}</dt>
            <dd>{{ t(categoryOf(account.categoryId).name) }}</dd>
            <template v-if="account.description">
              <dt>{{ t('Description') }}</dt>
              <dd>{{ account.description }}</dd>
            </template>
            <template v-if="account.bankName">
              <dt>{{ t('Bank name') }}</dt>
              <dd>{{ account.bankName }}{{ account.bankAccountNo ? ` · ${account.bankAccountNo}` : '' }}</dd>
            </template>
            <dt>{{ t('Balance') }}</dt>
            <dd class="cad-balance">{{ money(balance) }}</dd>
          </dl>

          <div v-if="!header" class="cad-filter">
            <div class="cad-date">
              <MpDatePicker id="cad-start" v-model="startDate" format="DD/MM/YYYY" value-type="format" use-portal :aria-label="t('Start date')" />
            </div>
            <span class="cad-date-sep">–</span>
            <div class="cad-date">
              <MpDatePicker id="cad-end" v-model="endDate" format="DD/MM/YYYY" value-type="format" use-portal :aria-label="t('End date')" />
            </div>
            <MpButton variant="primary" is-rounded @click="applyFilter">{{ t('Show') }}</MpButton>
          </div>
        </section>
        <p v-if="dateError" class="cad-error">{{ dateError }}</p>

        <ErpTablePage
          v-if="header"
          :columns="childColumns"
          :rows="(childRows as unknown as Record<string, unknown>[])"
          :total="childRows.length"
          :current-page="1"
          :per-page="100"
          no-row-hover
        >
          <template #cell-code="{ row }">
            <span class="cell-link" @click.stop="openChild(row as unknown as ChildRow)">{{ (row as unknown as ChildRow).code }}</span>
          </template>
          <template #cell-name="{ row }">
            <span class="cad-name-line">
              <span class="cell-link" @click.stop="openChild(row as unknown as ChildRow)">{{ (row as unknown as ChildRow).name }}</span>
              <ErpStatusBadge v-if="(row as unknown as ChildRow).archived" status="archived" />
            </span>
          </template>
          <template #cell-balance="{ value }">{{ money(value as number) }}</template>
        </ErpTablePage>

        <ErpTablePage
          v-else
          :columns="txColumns"
          :rows="(paginated as unknown as Record<string, unknown>[])"
          :total="realTx.length ? total : 0"
          :current-page="currentPage"
          :per-page="perPage"
          @page-change="setPage"
          @per-page-change="setPerPage"
        >
          <template #cell-date="{ row }">{{ formatDate((row as TxRow).date) }}</template>
          <template #cell-no="{ row }">
            <span v-if="(row as TxRow).isBeginning" class="cad-strong">{{ t('Beginning Balance') }}</span>
            <div v-else class="cad-tx">
              <span class="cell-link" @click.stop="openTx(row as TxRow)">{{ t((row as TxRow).type) }} #{{ (row as TxRow).no }}</span>
              <span v-if="(row as TxRow).description" class="cad-tx-desc">{{ (row as TxRow).description }}</span>
            </div>
          </template>
          <template #cell-contact="{ row }">
            <span
              v-if="(row as TxRow).contact"
              class="cell-link cad-contact"
              @click.stop="router.push(`/${(row as TxRow).contact!.kind}/${(row as TxRow).contact!.id}`)"
            >{{ (row as TxRow).contact!.name }}</span>
            <span v-else>-</span>
          </template>
          <template #cell-debit="{ row }">{{ (row as TxRow).isBeginning ? '' : amt((row as TxRow).debit) }}</template>
          <template #cell-credit="{ row }">{{ (row as TxRow).isBeginning ? '' : amt((row as TxRow).credit) }}</template>
          <template #cell-balance="{ row }"><span :class="{ 'cad-strong': (row as TxRow).isBeginning }">{{ money((row as TxRow).balance) }}</span></template>
          <template #empty>
            <div class="empty-full">
              <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
              <p class="empty-full-title">{{ t('No transactions yet') }}</p>
              <p class="empty-full-desc">{{ t('Your list of transactions will appear here.') }}</p>
            </div>
          </template>
        </ErpTablePage>
      </template>
      <div v-else class="empty-full">
        <img src="/illustrations/empty-folder.png" alt="" class="empty-illustration" width="288" height="240" />
        <p class="empty-full-title">{{ t('Account not found') }}</p>
        <p class="empty-full-desc">{{ t('Recheck the URL you access and try again.') }}</p>
      </div>
    </div>

    <ConfirmModal
      v-model:is-open="deleteOpen"
      :title="header ? t('Delete header account?') : t('Delete account?')"
      :description="header ? t('Deleting a header account will not delete its sub-accounts, and they will remain active as standalone accounts. Once a header account is deleted, it cannot be restored.') : t('The deleted account cannot be restored.')"
      :confirm-label="t('Delete')"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.detail-breadcrumb {
  align-self: flex-start; height: auto !important; min-width: 0 !important; padding: 0 !important;
  font-size: var(--mp-font-sizes-sm) !important; font-weight: var(--mp-font-weights-regular) !important;
  color: var(--mp-text-link) !important; line-height: var(--mp-line-heights-md) !important; background: none !important;
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-title-row { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; color: var(--mp-text-default);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-6);
}
.cad-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-6); flex-wrap: wrap; }
.cad-info { display: grid; grid-template-columns: 160px minmax(0, 1fr); column-gap: var(--mp-spacing-4); row-gap: var(--mp-spacing-2); margin: 0; }
.cad-info dt { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md); }
.cad-info dd { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cad-balance { font-weight: var(--mp-font-weights-semi-bold); }
.cad-filter { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.cad-date { width: 180px; }
.cad-date-sep { color: var(--mp-text-secondary); }
.cad-error { margin: calc(-1 * var(--mp-spacing-4)) 0 0; text-align: right; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }
.cad-tx { display: flex; flex-direction: column; min-width: 0; white-space: normal; }
.cad-tx .cell-link, .cad-contact { white-space: normal; overflow-wrap: anywhere; }
.cad-tx-desc { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cad-strong { font-weight: var(--mp-font-weights-semi-bold); }
.cad-name-line { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.cad-menu-item { display: flex; flex-direction: column; white-space: normal; }
.cad-menu-reason { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.empty-full { display: flex; flex-direction: column; align-items: center; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin: var(--mp-spacing-0\.5) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
