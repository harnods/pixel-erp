<script setup lang="ts">
/**
 * XpmAccountsPage · XPM (Mekari Expense) "Accounts" (company wallets).
 *
 * Full-bleed page (routed via detailMatch): owns the whole content area · a left
 * wallet sidemenu, its own 72px title bar showing the SELECTED wallet name +
 * actions, then a stats strip, Transactions / Wallet info tabs, a filter bar and
 * the movement table. Mirrors Figma node 4317:3444.
 *
 * All figures come from the persisted wallet ledger in app/data/xpm.ts · balances
 * and stats are DERIVED from real movements, and Top up / Move money mutate the
 * ledger (and persist), so the numbers stay accurate and survive a refresh.
 */
import {
  MpIcon, MpButton, MpButtonGroup, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpDrawer, MpDrawerContent, MpDrawerBody, MpDrawerOverlay,
  MpFormControl, MpFormLabel, MpInput, MpSelect, MpTextarea, MpToggle,
  css, toast,
} from '@mekari/pixel3'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import ActivityLogModal, { type ActivityEntry } from '~/components/patterns/ActivityLogModal.vue'
import {
  xpmWallets, type XpmWallet,
  walletMovements, walletStats, walletDisplayBalances,
  topUpWallet, moveMoneyBetween, movementNumber, XPM_TODAY, xpmPeople,
} from '~/data/xpm'
import { formatMoney } from '~/utils/currency'
import { formatDateLong, formatDateTimeLong } from '~/utils/date'
import { infoToast } from '~/utils/toasts'

const num = (s: string) => Number(String(s).replace(/[^\d]/g, '')) || 0
const router = useRouter()

// ── Selection state ──────────────────────────────────────────────────────────
const wallets = computed<XpmWallet[]>(() => xpmWallets)
const selectedIndex = ref(0)
const selectedWallet = computed(() => wallets.value[selectedIndex.value]!)
// Single-currency for now · every wallet is IDR.
const activeCurrency = computed(() => selectedWallet.value.currency)
function selectWallet(i: number) { selectedIndex.value = i }

// ── Stats strip · derived from the ledger ────────────────────────────────────
// Balance & Pending payouts are point-in-time (current / as of today); Money in
// and Money out are the current month's cash flows.
const currentBalance = computed(() => walletStats(selectedWallet.value.id, activeCurrency.value).balance)
const isZeroBalance = computed(() => currentBalance.value === 0)
function viewLedger() { activeTabIndex.value = 0 }
const stats = computed(() => {
  const cur = activeCurrency.value
  const s = walletStats(selectedWallet.value.id, cur)
  return [
    { label: 'Balance',         caption: 'As of today', value: formatMoney(s.balance, cur) },
    { label: 'Pending payouts', caption: 'As of today', value: formatMoney(s.pending, cur) },
    { label: 'Money in',        caption: 'This month',      value: formatMoney(s.monthIn, cur) },
    { label: 'Money out',       caption: 'This month',      value: formatMoney(s.monthOut, cur) },
  ]
})

// ── Movements table (ErpTablePage) ───────────────────────────────────────────
// Filter by transaction type + period (This month / Last month / Custom range,
// the custom range uses the shared AdvancedDateRangePicker). Gray-header table,
// pagination, column settings and the Airene toggle all come from ErpTablePage.
const TYPE_OPTIONS = ['Top up', 'Payment', 'Payout', 'Transfer']
const PERIOD_OPTIONS = ['This month', 'Last month', 'Custom'] as const
const typeFilter = ref('')
const periodMode = ref<'This month' | 'Last month' | 'Custom'>('This month')
const customRange = ref<Date[] | null>(null)

const [XT_Y, XT_M] = XPM_TODAY.split('-').map(Number) as [number, number, number]
function monthMatch(dateISO: string, which: 'This month' | 'Last month'): boolean {
  const [y, m] = dateISO.split('-').map(Number) as [number, number, number]
  if (which === 'This month') return y === XT_Y && m === XT_M
  const lm = XT_M === 1 ? 12 : XT_M - 1, ly = XT_M === 1 ? XT_Y - 1 : XT_Y
  return y === ly && m === lm
}
function periodMatch(dateISO: string): boolean {
  if (periodMode.value === 'Custom') {
    if (!customRange.value || customRange.value.length < 2) return true
    const d = new Date(dateISO).setHours(0, 0, 0, 0)
    const s = new Date(customRange.value[0]!).setHours(0, 0, 0, 0)
    const e = new Date(customRange.value[1]!).setHours(0, 0, 0, 0)
    return d >= s && d <= e
  }
  return monthMatch(dateISO, periodMode.value)
}

interface MovementRow { id: string; number: string; date: string; type: string; moneyIn: number | null; moneyOut: number | null; balance: number; description: string }
const rows = computed<MovementRow[]>(() => walletMovements(selectedWallet.value.id, activeCurrency.value).map(m => ({
  id: m.id,
  number: movementNumber(m.id),
  date: m.date,
  type: m.category,
  moneyIn: m.direction === 'in' ? m.amount : null,
  moneyOut: m.direction === 'out' ? m.amount : null,
  balance: m.balance,
  description: m.description,
})))

const columns: TableColumn[] = [
  { key: 'number',   label: 'Number',           width: '160px', sortable: true, sortType: 'text' },
  { key: 'date',     label: 'Date',             width: '140px', sortType: 'date' },
  { key: 'type',     label: 'Transaction type', width: '180px', sortType: 'text' },
  { key: 'moneyIn',  label: 'Money in',         width: '160px', align: 'right', sortType: 'number' },
  { key: 'moneyOut', label: 'Money out',        width: '160px', align: 'right', sortType: 'number' },
  { key: 'balance',  label: 'Balance',          width: '160px', align: 'right' },
]
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(columns.map(c => [c.key, true])))
const columnItems = columns.map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 }))
const visibleColumns = computed<TableColumn[]>(() => columns.filter(c => columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

const { search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, toggleSort, setSort } =
  useTableState(rows, {
    filterFn: (row, s) => {
      const m = row as unknown as MovementRow
      if (typeFilter.value && m.type !== typeFilter.value) return false
      if (!periodMatch(m.date)) return false
      if (s && !(m.number.toLowerCase().includes(s) || m.description.toLowerCase().includes(s))) return false
      return true
    },
  })
watch([typeFilter, periodMode, customRange, () => selectedWallet.value.id], () => setPage(1))
function clearFilters() { search.value = ''; typeFilter.value = ''; periodMode.value = 'This month'; customRange.value = null }
const hasActiveFilter = computed(() => !!search.value || !!typeFilter.value || periodMode.value !== 'This month')

const toggleAirene = inject<() => void>('toggleAirene')
const filterMenuClass = css({ minWidth: '180px', width: 'max-content' })

// ── Tabs ─────────────────────────────────────────────────────────────────────
const activeTabIndex = ref(0)

// ── Drawers: Edit / Move / Top up ────────────────────────────────────────────
const showEdit = ref(false)
const showMove = ref(false)
const showTopUp = ref(false)

// Edit wallet
const eName = ref(''); const eCurrency = ref('IDR'); const eType = ref('Primary'); const eDefault = ref(false)
function openEdit() {
  eName.value = selectedWallet.value.name
  eCurrency.value = selectedWallet.value.currency
  eType.value = selectedWallet.value.type
  eDefault.value = !!selectedWallet.value.isDefault
  showEdit.value = true
}
function closeEdit() { showEdit.value = false }
function saveEdit() { closeEdit(); toast.notify({ variant: 'success', title: 'Wallet saved.', maxWidth: 'max-content' }) }

// Move money
const mFrom = ref(''); const mTo = ref(''); const mAmount = ref(''); const mNote = ref('')
function openMove() {
  mFrom.value = selectedWallet.value.name
  mTo.value = wallets.value.find(w => w.id !== selectedWallet.value.id)?.name ?? ''
  mAmount.value = ''; mNote.value = ''
  showMove.value = true
}
function closeMove() { showMove.value = false }
function saveMove() {
  const fromId = wallets.value.find(w => w.name === mFrom.value)?.id
  const toId = wallets.value.find(w => w.name === mTo.value)?.id
  if (fromId && toId) moveMoneyBetween(fromId, toId, num(mAmount.value), mNote.value)
  closeMove()
  toast.notify({ variant: 'success', title: 'Money moved.', maxWidth: 'max-content' })
}

// Top up
const tAmount = ref(''); const tSource = ref('Bank transfer'); const tNote = ref('')
function openTopUp() { tAmount.value = ''; tSource.value = 'Bank transfer'; tNote.value = ''; showTopUp.value = true }
function closeTopUp() { showTopUp.value = false }
function saveTopUp() {
  topUpWallet(selectedWallet.value.id, num(tAmount.value), tSource.value, tNote.value)
  closeTopUp()
  toast.notify({ variant: 'success', title: 'Top up complete.', maxWidth: 'max-content' })
}

const popoverContentClass = css({ minWidth: '180px', width: 'max-content' })

// Wallet info — the three people roles, each resolved from the employee directory.
const peopleRows = computed(() => [
  { label: 'Wallet holder',      people: xpmPeople(selectedWallet.value.holder) },
  { label: 'Expense card admin', people: xpmPeople(selectedWallet.value.cardAdmin) },
  { label: 'Assigned accountant', people: xpmPeople(selectedWallet.value.accountant) },
])

// Activity log — opened from the "Last updated by …" link (ERP ActivityLogModal).
const activityOpen = ref(false)
const activityEntries = computed<ActivityEntry[]>(() => {
  const w = selectedWallet.value
  const cur = activeCurrency.value
  const holderName = xpmPeople(w.holder)[0]?.name ?? w.updatedBy
  const adminNames = xpmPeople(w.cardAdmin).map(p => p.name).join(', ')
  const acctNames = xpmPeople(w.accountant).map(p => p.name).join(', ')
  const lastTopUp = walletMovements(w.id, cur).find(m => m.category === 'Top up')
  const entries: ActivityEntry[] = [{
    date: w.updatedAt,
    user: w.updatedBy,
    activity: 'Updated',
    details: [
      { label: 'Assigned accountant', value: `Anita Wijaya → ${acctNames}` },
      { label: 'Expense card admin', value: adminNames },
      { label: 'Pending payouts', value: `${formatMoney(0, cur)} → ${formatMoney(w.pendingPayouts, cur)}` },
    ],
  }]
  if (lastTopUp) entries.push({
    date: lastTopUp.date,
    user: holderName,
    activity: 'Top up',
    details: [
      { label: 'Amount', value: formatMoney(lastTopUp.amount, cur) },
      { label: 'Description', value: lastTopUp.description },
    ],
  })
  entries.push({
    date: '2026-06-01T09:00:00',
    user: holderName,
    activity: 'Created',
    details: [
      { label: 'Wallet name', value: w.name },
      { label: 'Wallet holder', value: xpmPeople(w.holder).map(p => p.name).join(', ') },
    ],
  })
  return entries
})
</script>

<template>
  <div class="acct">
    <!-- ── Left · wallet sidemenu ── -->
    <aside class="acct-side">
      <div class="acct-side__titlerow">
        <span class="acct-side__title">Accounts</span>
        <MpTooltip id="acct-add-wallet-tt" label="New wallet" placement="bottom" use-portal>
          <button class="acct-side__add" type="button" aria-label="New wallet" @click="infoToast('Add wallet · coming soon')">
            <MpIcon name="add" size="md" />
          </button>
        </MpTooltip>
      </div>
      <ul class="acct-side__list">
        <li v-for="(w, i) in wallets" :key="w.id">
          <button
            type="button"
            class="acct-wallet"
            :class="{ 'acct-wallet--active': i === selectedIndex }"
            @click="selectWallet(i)"
          >
            <div class="acct-wallet__head">
              <div class="acct-wallet__namerow">
                <span class="acct-wallet__name">{{ w.name }}</span>
                <span v-if="w.isDefault" class="acct-wallet__badge">Default</span>
              </div>
              <div v-for="b in walletDisplayBalances(w)" :key="b.currency" class="acct-wallet__bal">
                <span>{{ b.currency }}</span><span class="acct-wallet__dot" aria-hidden="true" /><span>{{ formatMoney(b.amount, b.currency) }}</span>
              </div>
            </div>
          </button>
        </li>
      </ul>
    </aside>

    <!-- ── Right · content ── -->
    <div class="acct-main">
      <!-- Title bar -->
      <div class="acct-titlebar">
        <h1 class="acct-titlebar__title">{{ selectedWallet.name }}</h1>
        <div class="acct-titlebar__actions">
          <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="openMove">Move money</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="openTopUp">Top up</button>
          <MpPopover id="acct-more-menu" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="acct-kebab" type="button" aria-label="More actions">
                <MpIcon name="menu-kebab" size="md" />
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="popoverContentClass">
              <MpPopoverList>
                <MpPopoverListItem @click="openEdit">Edit wallet</MpPopoverListItem>
                <MpPopoverListItem @click="viewLedger">View balance ledger</MpPopoverListItem>
                <MpPopoverListItem @click="infoToast('Archive wallet · coming soon')">Archive wallet</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <!-- Stage -->
      <div class="acct-stage">
        <!-- Stats strip -->
        <div class="acct-stats">
          <div v-for="s in stats" :key="s.label" class="acct-stat">
            <span class="acct-stat__label">{{ s.label }}</span>
            <span class="acct-stat__cap">{{ s.caption }}</span>
            <span class="acct-stat__val">{{ s.value }}</span>
            <!-- Empty wallet: a danger banner inside the Balance stat -->
            <div v-if="s.label === 'Balance' && isZeroBalance" class="acct-empty">
              <MpIcon name="warning-triangle" size="sm" class="acct-empty__icon" />
              <div class="acct-empty__body">
                <span class="acct-empty__text">Wallet is empty. Top up to start spending.</span>
                <button class="acct-empty__link" type="button" @click="openTopUp">Top up</button>
              </div>
            </div>
          </div>
        </div>

        <!-- Tabs -->
        <MpTabs id="acct-tabs" v-model="activeTabIndex" is-manual variant-color="green" class="acct-tabs detail-tabs">
          <MpTabList>
            <MpTab id="acct-tab-txn" value="transactions">Transactions</MpTab>
            <MpTab id="acct-tab-info" value="info">Wallet info</MpTab>
          </MpTabList>
          <MpTabPanels>
            <!-- Transactions -->
            <MpTabPanel value="transactions">
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
                filter-empty-label="transaction"
                @page-change="setPage"
                @per-page-change="setPerPage"
                @sort="toggleSort"
                @sort-change="setSort"
                @hide-column="hideColumn"
                @clear-filters="clearFilters"
              >
                <template #filters>
                  <!-- Left: transaction-type + period MpPopover dropdowns -->
                  <div class="filter-left">
                    <MpPopover id="acct-type-filter" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                      <MpPopoverTrigger>
                        <button type="button" class="filter-trigger">
                          <span class="filter-trigger__label" :class="{ 'filter-trigger__label--placeholder': !typeFilter }">{{ typeFilter || 'Transaction type' }}</span>
                          <svg class="filter-trigger__chev" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </button>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="filterMenuClass">
                        <MpPopoverList>
                          <MpPopoverListItem :is-active="!typeFilter" @click="typeFilter = ''">All types</MpPopoverListItem>
                          <MpPopoverListItem v-for="o in TYPE_OPTIONS" :key="o" :is-active="typeFilter === o" @click="typeFilter = o">{{ o }}</MpPopoverListItem>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>

                    <MpPopover id="acct-period-filter" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-start">
                      <MpPopoverTrigger>
                        <button type="button" class="filter-trigger">
                          <span class="filter-trigger__label">{{ periodMode }}</span>
                          <svg class="filter-trigger__chev" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </button>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="filterMenuClass">
                        <MpPopoverList>
                          <MpPopoverListItem v-for="o in PERIOD_OPTIONS" :key="o" :is-active="periodMode === o" @click="periodMode = o">{{ o }}</MpPopoverListItem>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>

                    <AdvancedDateRangePicker
                      v-if="periodMode === 'Custom'"
                      id="acct-date-range"
                      v-model="customRange"
                      hide-label
                      placeholder="Select date range"
                    />
                  </div>

                  <!-- Right: Airene + column settings + export + search -->
                  <div class="filter-right">
                    <div class="filter-btn-group">
                      <MpTooltip id="acct-airene-tt" label="Ask Airene" placement="bottom" use-portal>
                        <button class="filter-icon-btn filter-icon-btn--airene" aria-label="Ask Airene" @click="toggleAirene?.()">
                          <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                            <path d="M13.6346 10.2855L13.1389 10.2226C11.3824 9.99823 10.0009 8.61408 9.77833 6.85752L9.71892 6.38934C9.62227 5.62234 8.8668 5.10539 8.07142 5.10539C7.28491 5.10539 6.53121 5.60106 6.43013 6.3654L6.36717 6.86107C6.14284 8.61763 4.75869 9.99912 3.00213 10.2217L2.53395 10.2811C1.7501 10.3831 1.25 11.1332 1.25 11.9286C1.25 12.724 1.7235 13.4741 2.51001 13.5699L3.00568 13.6328C4.76224 13.8572 6.14372 15.2413 6.36629 16.9979L6.4257 17.4661C6.52235 18.2641 7.27782 18.75 8.07319 18.75C8.8597 18.75 9.62315 18.2144 9.71448 17.49L9.77744 16.9943C10.0018 15.2378 11.3859 13.8563 13.1425 13.6337L13.6107 13.5743C14.3989 13.4741 14.8946 12.7222 14.8946 11.9268C14.8946 11.1314 14.3998 10.3813 13.6346 10.2855Z" fill="currentColor"/>
                            <path d="M18.1196 3.84006L17.8722 3.80814C16.9943 3.69553 16.3027 3.0039 16.1919 2.12606L16.1626 1.89197C16.1138 1.50803 15.7361 1.25 15.3388 1.25C14.9452 1.25 14.5692 1.49739 14.5178 1.88045L14.4858 2.12784C14.3732 3.00568 13.6816 3.69731 12.8038 3.80814L12.5697 3.83741C12.1777 3.88883 11.9277 4.26391 11.9277 4.66115C11.9277 5.0584 12.1644 5.43436 12.5581 5.48224L12.8055 5.51416C13.6834 5.62678 14.375 6.31841 14.4858 7.19624L14.5151 7.43033C14.563 7.82935 14.9416 8.07231 15.3388 8.07231C15.7325 8.07231 16.1138 7.80452 16.1599 7.44186L16.1919 7.19447C16.3045 6.31663 16.9961 5.625 17.8739 5.51416L18.108 5.4849C18.5026 5.43525 18.75 5.0584 18.75 4.66115C18.75 4.26391 18.5026 3.88883 18.1196 3.84006Z" fill="currentColor"/>
                          </svg>
                        </button>
                      </MpTooltip>
                      <ColumnSettingsMenu id="acct-columns" :items="columnItems" :visibility="columnVisibility" />
                      <MpTooltip id="acct-export-tt" label="Export" placement="bottom" use-portal>
                        <button class="filter-icon-btn" aria-label="Export" @click="infoToast('Export · coming soon')"><MpIcon name="upload" size="md" /></button>
                      </MpTooltip>
                    </div>
                    <div class="filter-search">
                      <MpIcon name="search" size="md" />
                      <input v-model="search" class="filter-search-input" type="text" placeholder="Search..." />
                      <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''"><MpIcon name="close" size="sm" /></button>
                    </div>
                  </div>
                </template>

                <template #cell-number="{ row }">
                  <button class="cell-link" type="button" @click="router.push(`/accounts/txn/${(row as Record<string, unknown>).id}`)">{{ (row as Record<string, unknown>).number }}</button>
                </template>
                <template #cell-date="{ value }">{{ formatDateLong(value as string) }}</template>
                <template #cell-moneyIn="{ value }">{{ value != null ? formatMoney(value as number, activeCurrency) : '' }}</template>
                <template #cell-moneyOut="{ value }">{{ value != null ? formatMoney(value as number, activeCurrency) : '' }}</template>
                <template #cell-balance="{ value }">{{ formatMoney(value as number, activeCurrency) }}</template>
              </ErpTablePage>
            </MpTabPanel>

            <!-- Wallet info (plain details, not boxed) -->
            <MpTabPanel value="info">
              <div class="acct-info">
                <h3 class="acct-info__title">Wallet info</h3>
                <dl class="acct-dl">
                  <div class="acct-dl__row"><dt>Wallet name</dt><dd>{{ selectedWallet.name }}</dd></div>
                  <div class="acct-dl__row"><dt>Description</dt><dd>{{ selectedWallet.description }}</dd></div>
                  <div v-for="r in peopleRows" :key="r.label" class="acct-dl__row acct-dl__row--people">
                    <dt>{{ r.label }}</dt>
                    <dd>
                      <div class="user-chips">
                        <div v-for="p in r.people" :key="p.employeeId" class="user-chip">
                          <img :src="p.photo" alt="" class="user-chip__avatar">
                          <div class="user-chip__main">
                            <span class="user-chip__name">{{ p.name }}</span>
                            <span class="user-chip__meta">{{ p.employeeId }} | {{ p.jobPosition }} | {{ p.organization }}</span>
                          </div>
                        </div>
                      </div>
                    </dd>
                  </div>
                </dl>
                <a class="acct-info__updated" @click.prevent="activityOpen = true">Last updated {{ formatDateTimeLong(selectedWallet.updatedAt) }} by {{ selectedWallet.updatedBy }}</a>
              </div>
            </MpTabPanel>
          </MpTabPanels>
        </MpTabs>
      </div>
    </div>
  </div>

  <!-- ── Activity log (Last updated) ── -->
  <ActivityLogModal
    :is-open="activityOpen"
    :subject="selectedWallet.name"
    :updated-at="selectedWallet.updatedAt"
    :updated-by="selectedWallet.updatedBy"
    :entries="activityEntries"
    @close="activityOpen = false"
  />

  <!-- ── Edit wallet drawer ── -->
  <MpDrawer id="xpm-edit-wallet-drawer" :is-open="showEdit" placement="right" size="md" variant="floating" is-close-on-overlay-click :is-keep-alive="false" @close="closeEdit">
    <MpDrawerContent>
      <MpDrawerBody>
        <div class="dr-card">
          <div class="dr-header">
            <span class="dr-title">Edit wallet</span>
            <MpButton left-icon="close" variant="ghost" size="sm" aria-label="Close" @click="closeEdit" />
          </div>
          <div class="dr-form">
            <MpFormControl id="ew-name"><MpFormLabel>Wallet name</MpFormLabel><MpInput id="ew-name-input" v-model="eName" is-full-width /></MpFormControl>
            <MpFormControl id="ew-currency"><MpFormLabel>Currency</MpFormLabel>
              <MpSelect id="ew-currency-select" v-model="eCurrency" is-full-width>
                <option value="IDR">IDR</option><option value="USD">USD</option><option value="SGD">SGD</option><option value="AUD">AUD</option>
              </MpSelect>
            </MpFormControl>
            <MpFormControl id="ew-type"><MpFormLabel>Wallet type</MpFormLabel>
              <MpSelect id="ew-type-select" v-model="eType" is-full-width>
                <option value="Primary">Primary</option><option value="Sub-wallet">Sub-wallet</option><option value="Card float">Card float</option>
              </MpSelect>
            </MpFormControl>
            <div class="dr-toggle-row">
              <div class="dr-toggle-info">
                <span class="dr-toggle-title">Default account</span>
                <span class="dr-toggle-hint">Use this wallet as the company default for new spend</span>
              </div>
              <MpToggle v-model:is-checked="eDefault" aria-label="Default account" />
            </div>
          </div>
          <div class="dr-footer">
            <MpButtonGroup>
              <MpButton variant="ghost" is-rounded @click="closeEdit">Cancel</MpButton>
              <MpButton variant="primary" is-rounded @click="saveEdit">Save changes</MpButton>
            </MpButtonGroup>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>

  <!-- ── Move money drawer ── -->
  <MpDrawer id="xpm-move-money-drawer" :is-open="showMove" placement="right" size="md" variant="floating" is-close-on-overlay-click :is-keep-alive="false" @close="closeMove">
    <MpDrawerContent>
      <MpDrawerBody>
        <div class="dr-card">
          <div class="dr-header">
            <span class="dr-title">Move money</span>
            <MpButton left-icon="close" variant="ghost" size="sm" aria-label="Close" @click="closeMove" />
          </div>
          <div class="dr-form">
            <MpFormControl id="mm-from"><MpFormLabel>From wallet</MpFormLabel>
              <MpSelect id="mm-from-select" v-model="mFrom" is-full-width><option v-for="w in wallets" :key="w.id" :value="w.name">{{ w.name }}</option></MpSelect>
            </MpFormControl>
            <MpFormControl id="mm-to"><MpFormLabel>To wallet</MpFormLabel>
              <MpSelect id="mm-to-select" v-model="mTo" is-full-width><option v-for="w in wallets" :key="w.id" :value="w.name">{{ w.name }}</option></MpSelect>
            </MpFormControl>
            <MpFormControl id="mm-amount"><MpFormLabel>Amount</MpFormLabel><MpInput id="mm-amount-input" v-model="mAmount" placeholder="0" is-full-width /></MpFormControl>
            <MpFormControl id="mm-note"><MpFormLabel>Note</MpFormLabel><MpTextarea id="mm-note-textarea" v-model="mNote" is-full-width :rows="3" placeholder="What is this transfer for?" /></MpFormControl>
          </div>
          <div class="dr-footer">
            <MpButtonGroup>
              <MpButton variant="ghost" is-rounded @click="closeMove">Cancel</MpButton>
              <MpButton variant="primary" is-rounded left-icon="transfer" @click="saveMove">Move money</MpButton>
            </MpButtonGroup>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>

  <!-- ── Top up drawer ── -->
  <MpDrawer id="xpm-top-up-drawer" :is-open="showTopUp" placement="right" size="md" variant="floating" is-close-on-overlay-click :is-keep-alive="false" @close="closeTopUp">
    <MpDrawerContent>
      <MpDrawerBody>
        <div class="dr-card">
          <div class="dr-header">
            <span class="dr-title">Top up</span>
            <MpButton left-icon="close" variant="ghost" size="sm" aria-label="Close" @click="closeTopUp" />
          </div>
          <div class="dr-form">
            <MpFormControl id="tu-amount"><MpFormLabel>Amount</MpFormLabel><MpInput id="tu-amount-input" v-model="tAmount" placeholder="0" is-full-width /></MpFormControl>
            <MpFormControl id="tu-source"><MpFormLabel>Source</MpFormLabel>
              <MpSelect id="tu-source-select" v-model="tSource" is-full-width>
                <option value="Bank transfer">Bank transfer</option><option value="From Main account">From Main account</option><option value="Virtual account">Virtual account</option>
              </MpSelect>
            </MpFormControl>
            <MpFormControl id="tu-note"><MpFormLabel>Note</MpFormLabel><MpTextarea id="tu-note-textarea" v-model="tNote" is-full-width :rows="3" placeholder="Reference or reason for this top up" /></MpFormControl>
          </div>
          <div class="dr-footer">
            <MpButtonGroup>
              <MpButton variant="ghost" is-rounded @click="closeTopUp">Cancel</MpButton>
              <MpButton variant="primary" is-rounded @click="saveTopUp">Top up</MpButton>
            </MpButtonGroup>
          </div>
        </div>
      </MpDrawerBody>
    </MpDrawerContent>
    <MpDrawerOverlay />
  </MpDrawer>
</template>

<style scoped>
.acct {
  display: flex;
  height: 100%;
  min-height: 0;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
}

/* ── Left · wallet sidemenu ── */
.acct-side {
  flex-shrink: 0;
  width: 228px;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5, 20px);
  padding: 18px var(--mp-spacing-4, 16px) var(--mp-spacing-2, 8px);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  overflow-y: auto;
}
.acct-side__titlerow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-2, 8px);
  min-height: 36px;
}
.acct-side__title {
  font-size: var(--mp-font-sizes-sm, 12px);
  font-weight: var(--mp-font-weights-semi-bold);
  letter-spacing: 2.88px;
  text-transform: uppercase;
  color: var(--mp-text-default, #080d0e);
}
.acct-side__add {
  display: inline-flex; align-items: center; justify-content: center;
  width: 28px; height: 28px; flex-shrink: 0;
  border: none; background: transparent; border-radius: var(--mp-radii-md, 6px);
  cursor: pointer; color: var(--mp-text-secondary, #3a4749);
}
.acct-side__add:hover { background: var(--mp-background-neutral-hovered); }
.acct-side__list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); }
.acct-wallet {
  display: block;
  width: 100%;
  text-align: left;
  /* Inactive: no visible border (transparent keeps the box metrics stable). */
  border: 1px solid transparent;
  border-radius: var(--mp-radii-md, 6px);
  background: var(--mp-background-neutral, #fff);
  overflow: hidden;
  cursor: pointer;
  padding: 0;
}
.acct-wallet--active { border-color: var(--mp-border-bold, #8c9596); }
.acct-wallet__head {
  display: flex; flex-direction: column; gap: 2px;
  padding: var(--mp-spacing-2, 8px);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
}
.acct-wallet--active .acct-wallet__head { background: var(--mp-background-neutral-subtle-selected, #ebf0f1); }
/* Very subtle hover on non-active wallets (a hair darker than the subtle head). */
.acct-wallet:not(.acct-wallet--active) { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.acct-wallet:not(.acct-wallet--active):hover,
.acct-wallet:not(.acct-wallet--active):hover .acct-wallet__head { background: #eef1f2; }
.acct-wallet__namerow { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); }
.acct-wallet__name { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default, #080d0e); }
.acct-wallet__badge {
  padding: 2px var(--mp-spacing-1, 4px);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default, #080d0e);
  line-height: var(--mp-line-heights-xs, 12px);
}
.acct-wallet--active .acct-wallet__badge { background: var(--mp-background-neutral, #fff); }
.acct-wallet__bal { display: flex; align-items: center; gap: var(--mp-spacing-1, 4px); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary, #3a4749); }
.acct-wallet__dot { flex-shrink: 0; width: 3px; height: 3px; border-radius: var(--mp-radii-full, 999px); background: currentColor; }

/* ── Right · content ── */
.acct-main { flex: 1; min-width: 0; display: flex; flex-direction: column; min-height: 0; }

/* Title bar */
.acct-titlebar {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-6, 24px);
  height: 72px; flex-shrink: 0;
  padding: 0 var(--mp-spacing-6, 24px);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
}
.acct-titlebar__title {
  margin: 0; min-width: 0;
  font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); letter-spacing: -0.2px;
  color: var(--mp-text-default, #080d0e);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}
.acct-titlebar__actions { display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); flex-shrink: 0; }
/* Ghost icon-only button (kebab) · borderless, hover fill only. */
.acct-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: 36px; height: 36px; padding: var(--mp-spacing-2, 8px);
  border: none; background: transparent; border-radius: var(--mp-radii-md, 6px);
  cursor: pointer; color: var(--mp-text-secondary, #3a4749);
}
.acct-kebab:hover { background: var(--mp-background-neutral-hovered); }

/* Stage */
.acct-stage {
  flex: 1; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px);
  padding: var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px) var(--mp-spacing-10, 80px);
  background: var(--mp-background-neutral, #fff);
  border-top-left-radius: var(--mp-radii-md, 6px);
}

/* Stats strip · plain divided cells (no outer box) */
.acct-stats { display: flex; gap: var(--mp-spacing-6, 24px); }
.acct-stat {
  flex: 1; min-width: 0;
  display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px);
  padding-right: var(--mp-spacing-6, 24px);
  border-right: 1px solid var(--mp-border-default, #e3e7e9);
}
.acct-stat:last-child { border-right: none; padding-right: 0; }
.acct-stat__label { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default, #080d0e); }
.acct-stat__cap { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary, #3a4749); }
.acct-stat__val { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default, #080d0e); }
/* Empty-wallet danger banner (inside the Balance stat) */
.acct-empty {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-2, 8px);
  margin-top: var(--mp-spacing-3, 12px);
  padding: var(--mp-spacing-2, 8px) var(--mp-spacing-3, 12px);
  border: 1px solid var(--mp-border-danger, #f0c2bd);
  border-radius: var(--mp-radii-md, 6px);
  background: var(--mp-background-danger-subtle, #fdf0ef);
}
.acct-empty__icon { flex-shrink: 0; margin-top: 1px; color: var(--mp-icon-danger, #a8352d); }
.acct-empty__body { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.acct-empty__text { font-size: var(--mp-font-sizes-sm, 12px); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-danger, #a8352d); }
.acct-empty__link { align-self: flex-start; padding: 0; border: none; background: none; cursor: pointer; font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-danger, #a8352d); }
.acct-empty__link:hover { text-decoration: underline; }

/* Tabs · active-state + tab-to-content gap overrides (matches ERP detail pages) */
.acct-tabs { width: 100%; }
.detail-tabs :deep(.mp-tab--isSelected_true),
.detail-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.detail-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }
.acct-panel { display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); }

/* Filter bar (shared ERP pattern) */
.filter-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
/* MpPopover filter dropdown trigger (styled like the ERP quick-filter select) */
.filter-trigger { display: inline-flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); width: 180px; height: 36px; padding: 0 var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md); cursor: pointer; }
.filter-trigger:hover { background: var(--mp-background-neutral-hovered); }
.filter-trigger__label { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.filter-trigger__label--placeholder { color: var(--mp-text-placeholder); }
.filter-trigger__chev { flex-shrink: 0; width: 20px; height: 20px; color: var(--mp-text-default); }
.filter-select-wrap { position: relative; display: inline-flex; align-items: center; width: 160px; background: var(--mp-background-neutral); border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md); }
.filter-select { appearance: none; background: transparent; border: none; outline: none; width: 100%; padding: var(--mp-spacing-2) var(--mp-spacing-10) var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); cursor: pointer; }
.filter-select-chevron { position: absolute; right: var(--mp-spacing-2); pointer-events: none; color: var(--mp-text-default); width: 20px; height: 20px; }
.filter-all-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4) var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-md); color: var(--mp-text-secondary); cursor: pointer; white-space: nowrap; }
.filter-all-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-btn-group { display: flex; align-items: center; }
.filter-icon-btn { display: flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: var(--mp-spacing-2); border: none; background: transparent; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-text-default); }
.filter-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.filter-icon-btn--airene { color: var(--mp-airene-default, #7c3aed); }
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral); border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); min-width: 0; }
.filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-text-secondary); border-radius: var(--mp-radii-full, 999px); }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

/* Movement table · default text colour throughout */
.acct-table-wrap { overflow-x: auto; }
.acct-table { width: 100%; border-collapse: collapse; }
.acct-th { padding: var(--mp-spacing-2) var(--mp-spacing-3); text-align: left; text-transform: uppercase; letter-spacing: 0.04em; font-size: var(--mp-font-sizes-xs, 12px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); border-bottom: 1px solid var(--mp-border-default); white-space: nowrap; }
.acct-th--right { text-align: right; }
.acct-tr:hover { background: var(--mp-background-neutral-hovered); }
.acct-td { padding: var(--mp-spacing-2) var(--mp-spacing-3); vertical-align: middle; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); }
.acct-td--right { text-align: right; }
.acct-td--empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-5) var(--mp-spacing-3); }
.acct-td__sub { display: block; margin-top: 2px; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cell-link { padding: 0; border: none; background: none; cursor: pointer; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link, #1f6bb8); }
.cell-link:hover { text-decoration: underline; }

/* Wallet info (plain details, no box, no row dividers — matches ERP ContentList) */
.acct-info { max-width: 640px; }
.acct-info__title { margin: 0 0 var(--mp-spacing-3, 12px); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.acct-info__updated { display: inline-block; align-self: flex-start; margin: var(--mp-spacing-4, 16px) 0 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-link, #1f6bb8); cursor: pointer; }
.acct-info__updated:hover { text-decoration: underline; text-underline-offset: 2px; }
.acct-dl { margin: 0; display: flex; flex-direction: column; }
.acct-dl__row { display: grid; grid-template-columns: 200px 1fr; gap: var(--mp-spacing-4); align-items: start; padding: var(--mp-spacing-2) 0; }
/* Label + value share the same size/weight (14px regular); label is greyed. */
/* People rows sit further apart so the avatar chips don't crowd each other. */
.acct-dl__row--people + .acct-dl__row--people { margin-top: var(--mp-spacing-5, 20px); }
.acct-dl__row dt { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }
.acct-dl__row dd { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); }

/* User chips (holder / card admin / accountant) — avatar lg + name + meta */
.user-chips { display: flex; flex-direction: column; gap: var(--mp-spacing-3, 12px); }
.user-chip { display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); }
.user-chip__avatar { width: 40px; height: 40px; flex-shrink: 0; border-radius: var(--mp-radii-full, 999px); object-fit: cover; background: var(--mp-background-neutral-subtle, #f8f9f9); }
.user-chip__main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.user-chip__name { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.user-chip__meta { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }

/* ── Drawers (floating card) ── */
.dr-card { display: flex; flex-direction: column; height: 100%; }
.dr-header { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-1); padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.dr-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.dr-form { display: flex; flex-direction: column; gap: var(--mp-spacing-4); flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); }
.dr-toggle-row { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); }
.dr-toggle-info { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.dr-toggle-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.dr-toggle-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); }
.dr-footer { display: flex; justify-content: flex-end; padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }

/* Responsive */
@media (max-width: 900px) {
  .acct { flex-direction: column; height: auto; }
  .acct-side { width: 100%; }
  .acct-stats { flex-wrap: wrap; }
  .acct-stat { flex: 1 1 45%; }
}
</style>
