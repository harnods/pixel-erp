<script setup lang="ts">
/**
 * Contact details — the master-data detail page for one contact.
 *
 * Figma: Contacts › Details › Profile (both tax states: Not validated / Validated).
 * Follows the master-data detail variant in docs/patterns/details-page-format.md,
 * with the Figma's layout specifics: the tab strip sits in the title-bar band,
 * and each section is a 4-column ContentList grid separated by a hairline rule.
 *
 * Route: /{customers|vendors|other-contacts}/:id — the first segment only picks
 * the breadcrumb; the record is the same either way.
 */
import { ref, computed, reactive, watch, inject } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpBadge, MpIcon, MpButton, MpButtonGroup, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  toast, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import VendorProductsTab from '~/components/patterns/VendorProductsTab.vue'
import ScenarioFab, { type Scenario } from '~/components/patterns/ScenarioFab.vue'
import { columnWidth, type ColumnKind } from '~/components/patterns/columnWidths'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ColumnSettingsMenu from '~/components/patterns/ColumnSettingsMenu.vue'
import { getContact, deleteContact, nitkuFull, type ContactType } from '~/data/contacts'
import { getCustomerTransactions, getCustomerTxnSummary, customerIdForContact, type CustomerTransaction } from '~/data/customerTransactions'
import { vendors } from '~/data/vendors'
import { formatIDR } from '~/utils/currency'

const toggleAirene = inject<() => void>('toggleAirene')

const props = defineProps<{ orderId: string }>()

const route = useRoute()
const router = useRouter()
const { t } = useLocale()

const contact = computed(() => getContact(props.orderId))

// ── Breadcrumb / back target follows the list we came from ────────────────────
const LISTS: Record<string, { label: string; type: ContactType }> = {
  'customers':      { label: 'Customers',      type: 'customer' },
  'vendors':        { label: 'Vendors',        type: 'vendor'   },
  'other-contacts': { label: 'Other contacts', type: 'other'    },
}
const listSlug = computed(() => {
  const seg = route.path.split('/').filter(Boolean)[0] ?? 'customers'
  return LISTS[seg] ? seg : 'customers'
})
const listLabel = computed(() => LISTS[listSlug.value]!.label)

// A vendor contact gets a Products tab (the price list we buy at); customers and
// other contacts don't, so it is inserted only when the role is present.
const isVendor = computed(() => contact.value?.types.includes('vendor') ?? false)

// ── Tab persistence via ?tab= so back/forward restores the tab ───────────────
const TAB_NAMES = computed(() =>
  isVendor.value
    ? ['details', 'products', 'transactions', 'files']
    : ['details', 'transactions', 'files'],
)
const activeTabIndex = computed({
  get(): number {
    const idx = TAB_NAMES.value.indexOf(route.query.tab as string)
    return idx >= 0 ? idx : 0
  },
  set(idx: number) {
    router.replace({ query: { ...route.query, tab: TAB_NAMES.value[idx] ?? 'details' } })
  },
})

function goBack() { router.push(`/${listSlug.value}`) }
function goEdit() { router.push(`/${listSlug.value}/${props.orderId}/edit`) }

// ── Derived display values ────────────────────────────────────────────────────
const fullNameDisplay = computed(() => {
  const c = contact.value
  if (!c?.fullName) return ''
  return c.title ? `${c.fullName} (${c.title})` : c.fullName
})
const creditLimitDisplay = computed(() =>
  contact.value?.creditLimit == null ? '' : formatIDR(contact.value.creditLimit))

/** `Last updated by X on 25 Jan 2026, 11:00 (GMT+7)` */
const lastUpdatedDisplay = computed(() => {
  const c = contact.value
  if (!c) return ''
  const d = new Date(c.updatedAt)
  const date = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  return `${t('Last updated by')} ${c.updatedBy} ${t('on')} ${date}, ${time} (GMT+7)`
})

// ── Transactions tab — one ErpTablePage over the customer's unified document
// list (sales invoices/orders/quotes + credit memos), with KPI tiles + filters.
// Join is by customer name (sales docs) / resolved id (credit memos); a brand-new
// contact with no documents shows the empty state. ───────────────────────────
const txnRows = computed<CustomerTransaction[]>(() => getCustomerTransactions(contact.value))
const txnSummary = computed(() => getCustomerTxnSummary(contact.value))

const txnColumns: TableColumn[] = [
  { key: 'date',       label: t('Date'),        kind: 'date',                                   sortType: 'date'   },
  { key: 'number',     label: t('Number'),      kind: 'number', sortable: true,                 sortType: 'text'   },
  { key: 'attachment', label: '',               width: '40px',  noHeader: true, align: 'center' },
  { key: 'dueDate',    label: t('Due date'),    kind: 'date',                                   sortType: 'date'   },
  { key: 'status',     label: t('Status'),      kind: 'status',                                 sortType: 'text'   },
  { key: 'balanceDue', label: t('Balance due'), kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'total',      label: t('Total'),       kind: 'amount', align: 'right', sortable: true, sortType: 'number' },
  { key: 'tags',       label: t('Tags'),        kind: 'tags'                                    },
]

// Toolbar filters — Transaction type + Status
const txnType = ref('')
const typeOptions = computed(() => {
  if (listSlug.value === 'vendors') {
    return [
      { value: 'purchase-invoice', label: t('Purchase invoice') },
      { value: 'purchase-quote',   label: t('Purchase quote')   },
      { value: 'debit-memo',       label: t('Debit memo')       },
    ]
  }
  return [
    { value: 'sales-invoice', label: t('Sales invoice') },
    { value: 'sales-order',   label: t('Sales order')   },
    { value: 'sales-quote',   label: t('Sales quote')   },
    { value: 'credit-memo',   label: t('Credit memo')   },
  ]
})
function statusLabel(s: string): string { return s.replace(/-/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase()) }
const statusOptions = computed(() =>
  [...new Set(txnRows.value.map((r) => r.status))].sort().map((value) => ({ value, label: statusLabel(value) })),
)

const {
  search, statusFilter, currentPage, paginated, total, perPage,
  setPage, setPerPage, sortKey, sortDir, toggleSort, setSort,
} = useTableState(txnRows, {
  filterFn: (row: CustomerTransaction, s, status) =>
    row.numberDisplay.toLowerCase().includes(s)
    && (!status || row.status === status)
    && (!txnType.value || row.docType === txnType.value),
})
watch(txnType, () => setPage(1))

// Column show/hide (first column always on; layout-only `attachment` always rendered)
const columnVisibility = reactive<Record<string, boolean>>(Object.fromEntries(txnColumns.map((c) => [c.key, true])))
const columnItems = computed(() => txnColumns.filter((c) => !c.noHeader).map((c, i) => ({ key: c.key, label: c.label, disabled: i === 0 })))
const visibleColumns = computed<TableColumn[]>(() => txnColumns.filter((c) => c.noHeader || columnVisibility[c.key]))
function hideColumn(key: string) { columnVisibility[key] = false }

const hasTxnFilter = computed(() => !!statusFilter.value || !!txnType.value)
function clearTxnFilters() { search.value = ''; statusFilter.value = ''; txnType.value = '' }

function formatDate(iso?: string): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}

// ── Products tab — the Vendor Supply Profile ──────────────────────────────────
// Owned by VendorProductsTab.vue. The list is DERIVED from approved supplier
// invoices rather than maintained here, so this page holds no product state at
// all — only the demo scenario the ScenarioFab switches between.
//
// Note on what moved out: the agreed unit cost the replenishment engine orders at
// (`vendorItem.unitCost`) is no longer edited on this tab. The tab now shows the
// price actually PAID, read off the source invoice, which is a different figure
// with a different provenance. The agreed cost stays editable where it is used —
// Product detail › Vendors › Edit vendors (VendorItemDrawer).
const PRODUCT_SCENARIOS: Scenario[] = [
  { label: 'Default', value: 'data' },
  { label: 'Empty vendor', value: 'empty' },
  { label: 'No price permission', value: 'no-price-permission' },
  { label: 'Backfill running', value: 'backfill' },
]
const productsScenario = ref<'data' | 'empty' | 'no-price-permission' | 'backfill'>('data')

/** Related-records column width — from the shared standard, never hardcoded.
 *  Columns grow to their max (the trailing spacer <col> soaks up the rest). */
function colStyle(kind: ColumnKind) {
  const { minWidth, maxWidth } = columnWidth(kind)
  return { width: maxWidth, minWidth, maxWidth }
}

function overdueDaysLabel(row: CustomerTransaction): string | null {
  if (row.status !== 'overdue' || !row.dueDate) return null
  const days = Math.floor((Date.now() - new Date(row.dueDate).getTime()) / 86_400_000)
  return days > 0 ? `${days} ${days !== 1 ? t('days') : t('day')}` : null
}

// ── Title-bar actions ─────────────────────────────────────────────────────────
function vendorIdForContact(c: { displayName?: string; companyName?: string } | undefined): string | undefined {
  if (!c) return undefined
  const names = [c.displayName, c.companyName].filter(Boolean).map((n) => n!.toLowerCase())
  return vendors.find((v) => names.includes(v.name.toLowerCase()))?.id
}

const isVendorView = computed(() => listSlug.value === 'vendors')

const createTxItems = computed(() => {
  if (isVendorView.value) {
    const vendorId = vendorIdForContact(contact.value)
    return [
      { label: 'Purchase quote',   to: '/purchase-quotes/new' },
      { label: 'Purchase invoice', to: '/purchase-invoices'   },
      { label: 'Debit memo',       to: vendorId ? `/debit-memos/new?vendor=${vendorId}` : '/debit-memos/new' },
    ]
  }
  const custId = customerIdForContact(contact.value)
  return [
    { label: 'Sales quote',      to: '/sales-quotes'    },
    { label: 'Sales order',      to: '/sales-orders'    },
    { label: 'Sales invoice',    to: '/sales-invoices'  },
    { label: 'Credit memo',      to: custId ? `/credit-memos/new?customer=${custId}` : '/credit-memos/new' },
  ]
})
const isDeleteModalOpen = ref(false)
function confirmDelete() {
  deleteContact(props.orderId)
  toast.notify({ variant: 'success', title: t('Contact deleted'), maxWidth: 'max-content' })
  goBack()
}
// A contact with transactions on record can't be deleted (Delete is disabled).
const canDeleteContact = computed(() => txnRows.value.length === 0)

// Prototype placeholders for the actions menu (no data model yet).
function soon() {}
function archiveContact() {
  toast.notify({ variant: 'success', title: t('Contact archived'), maxWidth: 'max-content' })
  goBack()
}
</script>

<template>
  <div v-if="contact" class="cd-page">
    <MpTabs id="cd-tabs" v-model="activeTabIndex" is-manual variant-color="green" class="cd-tabs">

      <!-- ── Title bar band: breadcrumb + title + actions, then the tab strip ── -->
      <header class="cd-header">
        <div class="cd-bar">
          <div class="cd-bar-left">
            <a class="cd-breadcrumb" role="link" tabindex="0" @click="goBack" @keydown.enter="goBack">{{ t(listLabel) }}</a>
            <h1 class="cd-title">{{ contact.displayName }}</h1>
          </div>

          <div class="cd-bar-right">
            <MpPopover id="cd-create-tx" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <MpButton variant="primary" is-rounded right-icon="chevrons-down">{{ t('Create transaction') }}</MpButton>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
                <MpPopoverList>
                  <MpPopoverListItem
                    v-for="item in createTxItems" :key="item.label"
                    @click="router.push(item.to)"
                  >{{ t(item.label) }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>

            <MpPopover id="cd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <MpButton class="cd-kebab" :aria-label="t('More actions')">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                  </svg>
                </MpButton>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
                <MpPopoverList>
                  <MpPopoverListItem @click="soon">{{ t('Statement report') }}</MpPopoverListItem>
                </MpPopoverList>
                <div :class="css({ height: 'var(--mp-sizes-px, 1px)', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
                <MpPopoverList>
                  <MpPopoverListItem @click="goEdit">{{ t('Edit') }}</MpPopoverListItem>
                  <MpPopoverListItem @click="soon">{{ t('Merge contact') }}</MpPopoverListItem>
                  <MpPopoverListItem @click="soon">{{ t('Add to contact group') }}</MpPopoverListItem>
                  <MpPopoverListItem @click="archiveContact">{{ t('Archive') }}</MpPopoverListItem>
                  <MpPopoverListItem
                    :is-disabled="!canDeleteContact"
                    :class="canDeleteContact ? css({ color: 'var(--mp-text-critical, var(--mp-text-danger))' }) : undefined"
                    @click="canDeleteContact && (isDeleteModalOpen = true)"
                  >{{ t('Delete') }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>
        </div>

        <MpTabList>
          <MpTab id="cd-tab-details" value="details">{{ t('Contact details') }}</MpTab>
          <MpTab v-if="isVendor" id="cd-tab-products" value="products">{{ t('Products') }}</MpTab>
          <MpTab id="cd-tab-transactions" value="transactions">{{ t('Transactions') }}</MpTab>
          <MpTab id="cd-tab-files" value="files">{{ t('Files') }}</MpTab>
        </MpTabList>
      </header>

      <!-- ── Stage ── -->
      <div class="cd-stage">
        <MpTabPanels>

          <!-- ─────────── Contact details ─────────── -->
          <MpTabPanel value="details">
            <div class="cd-sections">

              <!-- Contact info -->
              <section class="cd-section">
                <h2 class="cd-section-title">{{ t('Contact info') }}</h2>
                <div class="cd-grid">
                  <ContentList :label="t('Display name')" :value="contact.displayName" />
                  <ContentList :label="t('Full name')" :value="fullNameDisplay || undefined" />
                  <ContentList :label="t('Email')">
                    <template v-if="contact.emails.length">
                      <span v-for="e in contact.emails" :key="e" class="content-list__line">{{ e }}</span>
                    </template>
                    <template v-else>—</template>
                  </ContentList>
                  <ContentList :label="t('Mobile')" :value="contact.mobile || undefined" />

                  <ContentList :label="contact.identityType" :value="contact.identityNumber || undefined" />
                  <ContentList :label="t('Contact group')">
                    <template v-if="contact.groups.length">
                      <a v-for="g in contact.groups" :key="g" class="cd-link content-list__line">{{ g }}</a>
                    </template>
                    <template v-else>—</template>
                  </ContentList>
                </div>
              </section>

              <!-- Company info -->
              <section class="cd-section">
                <h2 class="cd-section-title">{{ t('Company info') }}</h2>
                <div class="cd-grid">
                  <ContentList :label="t('Company name')" :value="contact.companyName || undefined" />
                  <ContentList :label="t('Billing address')" :value="contact.billingAddress || undefined" />
                  <ContentList :label="t('Shipping address')" :value="contact.shippingAddress || undefined" />
                  <ContentList :label="t('Phone')" :value="contact.phone || undefined" />
                  <ContentList :label="t('Fax')" :value="contact.fax || undefined" />
                </div>
              </section>

              <!-- Tax info — the heading carries the DJP validation state -->
              <section class="cd-section">
                <div class="cd-section-head">
                  <h2 class="cd-section-title cd-section-title--inline">{{ t('Tax info') }}</h2>
                  <MpBadge
                    for="additionalInformation" size="sm"
                    :type="contact.taxStatus === 'validated' ? 'completed' : 'announcement'"
                  >
                    {{ contact.taxStatus === 'validated' ? t('Validated') : t('Not validated') }}
                  </MpBadge>
                </div>
                <div v-if="contact.domicile === 'domestic'" class="cd-grid">
                  <ContentList :label="t('NPWP')" :value="contact.npwp || undefined" />
                  <ContentList :label="t('NITKU')" :value="nitkuFull(contact) || undefined" />
                </div>
                <div v-else class="cd-grid">
                  <ContentList :label="t('Tax Identification Number (TIN)')" :value="contact.tin || undefined" />
                </div>
              </section>

              <!-- Credit limit -->
              <section class="cd-section">
                <h2 class="cd-section-title">{{ t('Credit limit') }}</h2>
                <div class="cd-grid">
                  <ContentList :label="t('Amount')" :value="creditLimitDisplay || undefined" />
                </div>
              </section>

              <!-- Bank info — one column per account -->
              <section class="cd-section">
                <h2 class="cd-section-title">{{ t('Bank info') }}</h2>
                <div v-if="contact.banks.length" class="cd-grid">
                  <div v-for="(bank, i) in contact.banks" :key="bank.id" class="cd-bank">
                    <div class="cd-bank-head">
                      <span class="cd-bank-title">
                        {{ i === 0 ? t('Primary bank account') : `${t('Bank account')} ${i + 1}` }}
                      </span>
                      <MpBadge v-if="bank.isConnected" for="additionalInformation" type="completed" size="sm">
                        {{ t('Connected') }}
                      </MpBadge>
                    </div>
                    <ContentList :label="t('Bank name')" :value="bank.bankName || undefined" />
                    <ContentList :label="t('Bank branch')" :value="bank.branch || undefined" />
                    <ContentList :label="t('Account no.')" :value="bank.accountNo || undefined" />
                    <ContentList :label="t('Account name')" :value="bank.accountName || undefined" />
                  </div>
                </div>
                <p v-else class="cd-empty">{{ t('No bank account added.') }}</p>
              </section>

              <!-- Default settings -->
              <section class="cd-section">
                <h2 class="cd-section-title">{{ t('Default settings') }}</h2>
                <div class="cd-grid">
                  <ContentList :label="t('Accounts receivable account')" :value="contact.arAccount || undefined" />
                  <ContentList :label="t('Accounts payable account')" :value="contact.apAccount || undefined" />
                  <ContentList :label="t('Default payment terms')" :value="contact.paymentTerms || undefined" />
                  <ContentList :label="t('Default currency')" :value="contact.currency || undefined" />
                </div>
              </section>

              <!-- Memo -->
              <section class="cd-section cd-section--last">
                <h2 class="cd-section-title">{{ t('Memo') }}</h2>
                <div class="cd-grid">
                  <ContentList :label="t('Memo')" :value="contact.memo || undefined" />
                </div>
                <a class="cd-updated">{{ lastUpdatedDisplay }}</a>
              </section>

            </div>
          </MpTabPanel>

          <!-- ─────────── Products (vendors only) ───────────
               The Vendor Supply Profile surface (PRD v1.0). Lives in its own
               component: it carries a searchable, paged table plus an add/edit/
               remove/audit/import surface, which is more than a detail-page panel
               should hold inline. -->
          <MpTabPanel v-if="isVendor" value="products">
            <section class="cd-section cd-section--last">
              <VendorProductsTab
                :vendor-master-id="contact.vendorMasterId ?? ''"
                :contact-id="contact.id"
                :vendor-name="contact.displayName"
                :scenario="productsScenario"
              />
            </section>
          </MpTabPanel>

          <!-- ─────────── Transactions ─────────── -->
          <MpTabPanel value="transactions">
            <ErpTablePage
              data-devchange="cd-transactions-tab"
              :columns="visibleColumns"
              :rows="(paginated as Record<string, unknown>[])"
              :total="total"
              :current-page="currentPage"
              :per-page="perPage"
              :sort-key="sortKey"
              :sort-dir="sortDir"
              :search="search"
              filter-empty-label="transaction"
              :has-active-filter="hasTxnFilter"
              :has-active-search="!!search"
              :context-label="(row) => (row as CustomerTransaction).numberDisplay"
              @page-change="setPage"
              @per-page-change="setPerPage"
              @sort="toggleSort"
              @sort-change="setSort"
              @hide-column="hideColumn"
              @clear-filters="clearTxnFilters"
              @clear-all="clearTxnFilters"
            >
              <!-- KPI tiles -->
              <template #stats>
                <div class="stats-section">
                  <div class="stat-card stat-card--bordered">
                    <div class="stat-title">{{ t('Overdue invoices') }}</div>
                    <div class="stat-period">{{ t('As of today') }}</div>
                    <div class="stat-amount stat-amount--danger">{{ formatIDR(txnSummary.overdueAmount) }}</div>
                    <a v-if="txnSummary.overdueCount" class="stat-link">{{ txnSummary.overdueCount }} {{ txnSummary.overdueCount !== 1 ? t('invoices') : t('invoice') }}</a>
                  </div>
                  <div class="stat-card stat-card--bordered">
                    <div class="stat-title">{{ t('Unpaid invoices') }}</div>
                    <div class="stat-period">{{ t('As of today') }}</div>
                    <div class="stat-amount">{{ formatIDR(txnSummary.unpaidAmount) }}</div>
                    <a v-if="txnSummary.unpaidCount" class="stat-link">{{ txnSummary.unpaidCount }} {{ txnSummary.unpaidCount !== 1 ? t('invoices') : t('invoice') }}</a>
                  </div>
                  <div class="stat-card stat-card--bordered">
                    <div class="stat-title">{{ t('Payment received') }}</div>
                    <div class="stat-period">{{ t('Last 30 days') }}</div>
                    <div class="stat-amount">{{ formatIDR(txnSummary.paymentReceived) }}</div>
                    <a v-if="txnSummary.paymentReceivedCount" class="stat-link">{{ txnSummary.paymentReceivedCount }} {{ txnSummary.paymentReceivedCount !== 1 ? t('invoices') : t('invoice') }}</a>
                  </div>
                  <div class="stat-card">
                    <div class="stat-title">{{ t('Open credits') }}</div>
                    <div class="stat-period">{{ t('As of today') }}</div>
                    <div class="stat-amount">{{ formatIDR(txnSummary.openCredits) }}</div>
                  </div>
                </div>
              </template>

              <!-- Filter bar -->
              <template #filters>
                <div class="filter-left">
                  <ErpFilterSelect id="cd-txn-type" v-model="txnType" :placeholder="t('Transaction')" :options="typeOptions" />
                  <ErpFilterSelect id="cd-txn-status" v-model="statusFilter" :placeholder="t('Status')" :options="statusOptions" />
                </div>
                <div class="filter-right">
                  <MpButtonGroup class="filter-btn-group">
                    <MpTooltip :label="t('Ask Airene')" placement="bottom">
                      <MpButton class="filter-airene-btn" variant="ghost" left-icon="airene-brand" :aria-label="t('Ask Airene')" is-rounded @click="toggleAirene?.()" />
                    </MpTooltip>
                    <ColumnSettingsMenu id="cd-txn-columns" :items="columnItems" :visibility="columnVisibility" />
                    <MpTooltip :label="t('Export')" placement="bottom">
                      <MpButton variant="ghost" left-icon="download" :aria-label="t('Export')" is-rounded />
                    </MpTooltip>
                  </MpButtonGroup>
                  <div class="filter-search">
                    <MpIcon name="search" size="sm" />
                    <input v-model="search" class="filter-search-input" type="text" :placeholder="t('Search...')" />
                    <MpButton v-if="search" variant="secondary" class="search-clear-btn" type="button" left-icon="close" :aria-label="t('Clear search')" @click="search = ''" />
                  </div>
                </div>
              </template>

              <!-- Cells -->
              <template #cell-date="{ value }">{{ formatDate(value as string) }}</template>
              <template #cell-number="{ row }">
                <a class="cell-link cell-text" @click.stop="router.push((row as CustomerTransaction).href)">{{ (row as CustomerTransaction).numberDisplay }}</a>
              </template>
              <template #cell-attachment="{ row }">
                <MpIcon v-if="(row as CustomerTransaction).hasAttachment" name="attachment" size="sm" class="cd-attach-icon" />
              </template>
              <template #cell-dueDate="{ value }">{{ formatDate(value as string | undefined) }}</template>
              <template #cell-status="{ row }">
                <div class="status-cell">
                  <ErpStatusBadge :status="(row as CustomerTransaction).status" />
                  <span v-if="overdueDaysLabel(row as CustomerTransaction)" class="status-sub-label">{{ overdueDaysLabel(row as CustomerTransaction) }}</span>
                </div>
              </template>
              <template #cell-balanceDue="{ row }">
                <template v-if="(row as CustomerTransaction).balanceDue !== undefined">{{ formatIDR((row as CustomerTransaction).balanceDue as number) }}</template>
              </template>
              <template #cell-total="{ value }">{{ formatIDR(value as number) }}</template>
              <template #cell-tags="{ value }"><ErpTagList :tags="(value as string[])" /></template>

              <!-- Row kebab -->
              <template #actions="{ row }">
                <MpPopover :id="`cd-txn-${(row as CustomerTransaction).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                  <MpPopoverTrigger>
                    <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
                  </MpPopoverTrigger>
                  <MpPopoverContent class="erp-dropdown-menu">
                    <MpPopoverList>
                      <MpPopoverListItem @click="router.push((row as CustomerTransaction).href)">{{ t('View details') }}</MpPopoverListItem>
                    </MpPopoverList>
                  </MpPopoverContent>
                </MpPopover>
              </template>

              <!-- Full empty state -->
              <template #empty>
                <div class="cd-txn-empty">
                  <p class="cd-txn-empty-title">{{ t('No transactions yet') }}</p>
                  <p class="cd-txn-empty-desc">{{ t('Transactions raised for this customer will appear here.') }}</p>
                </div>
              </template>
            </ErpTablePage>
          </MpTabPanel>

          <!-- ─────────── Files ─────────── -->
          <MpTabPanel value="files">
            <section class="cd-section cd-section--last">
              <h2 class="cd-section-title">{{ t('Files') }}</h2>
              <p class="cd-empty">
                <MpIcon name="attachment" size="md" />
                {{ t('No files attached to this contact.') }}
              </p>
            </section>
          </MpTabPanel>

        </MpTabPanels>
      </div>
    </MpTabs>

    <!-- Demo scenario switcher for the Products tab's reachable states
         (rule/detail-scenario-fab). Only shown while that tab is open, since the
         scenarios it toggles have no meaning on the other three. -->
    <ScenarioFab
      v-if="isVendor && TAB_NAMES[activeTabIndex] === 'products'"
      v-model="productsScenario"
      :scenarios="PRODUCT_SCENARIOS"
      :aria-label="t('Products tab scenarios')"
    />

    <ConfirmModal
      v-model:is-open="isDeleteModalOpen"
      :title="t('Delete contact?')"
      :description="`${contact.displayName} ${t('will be removed from your contact list.')}`"
      :confirm-label="t('Delete')"
      @confirm="confirmDelete"
    />
  </div>

  <div v-else class="cd-missing">
    <p>{{ t('Contact not found.') }}</p>
    <MpButton variant="ghost" is-rounded @click="goBack">{{ t('Back to') }} {{ t(listLabel) }}</MpButton>
  </div>
</template>

<style scoped>
/* ── Page shell ── */
.cd-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.cd-tabs { display: flex; flex-direction: column; min-height: 0; flex: 1; }

/* ── Title bar band (bar + tab strip share the neutral-subtle background) ── */
.cd-header {
  flex-shrink: 0;
  background: var(--mp-background-neutral-subtle);
  padding: 0 var(--mp-spacing-6);
}
.cd-bar {
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.cd-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.cd-bar-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cd-breadcrumb {
  align-self: flex-start; cursor: pointer;
  font-size: 12px; line-height: var(--mp-line-heights-md); color: var(--mp-text-link);
}
.cd-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.cd-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl, 24px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}

/* Tab strip sits flush at the bottom of the header band (Figma) */
.cd-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: 0 !important; }
.cd-tabs :deep(.mp-tab--isSelected_true),
.cd-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.cd-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) {
  background-color: var(--mp-border-selected, #029861) !important;
}

/* ── Kebab (self-styled; no longer relies on .btn-enterprise) ── */
.cd-kebab {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  padding: 0; border: none; background: transparent;
  border-radius: var(--mp-radii-md); cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
}
.cd-kebab:hover { background: var(--mp-background-neutral-subtle); color: var(--mp-text-default); }

/* ── Stage ── */
.cd-stage {
  flex: 1; min-height: 0;
  overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: var(--mp-spacing-6);
}

/* ── Sections: 4-column key/value grid, hairline rule between sections ── */
.cd-sections { display: flex; flex-direction: column; }
.cd-section { padding: var(--mp-spacing-8) 0; border-bottom: 1px solid var(--mp-border-default); }
.cd-section:first-child { padding-top: 0; }
.cd-section--last { border-bottom: none; padding-bottom: 0; }
.cd-section-head { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-3); }
.cd-section-title {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px);
  color: var(--mp-text-default);
}
.cd-section-title--inline { margin-bottom: 0; }

.cd-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  column-gap: var(--mp-spacing-6);
  row-gap: 0;
}
/* a value that wraps (addresses) must not stretch the row */
.cd-grid > * { min-width: 0; }

.cd-bank { display: flex; flex-direction: column; }
.cd-bank-head { display: flex; align-items: center; gap: var(--mp-spacing-2); padding-bottom: var(--mp-spacing-1); }
.cd-bank-title {
  font-size: var(--mp-font-sizes-lg, 16px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.cd-link { color: var(--mp-text-link); cursor: pointer; }
.cd-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cd-product-badge { margin-left: 8px; vertical-align: middle; }
.cd-prod-actions { margin-left: auto; display: flex; gap: var(--mp-spacing-2); }
.cd-prod-hint { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin: 0 0 var(--mp-spacing-4); }
.cd-add-row td { vertical-align: top; }
.cd-add-actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2); }

.cd-empty {
  margin: 0; display: flex; align-items: center; gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

/* Last-updated metadata line */
.cd-updated {
  display: inline-block; align-self: flex-start;
  margin-top: var(--mp-spacing-8);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer;
}
.cd-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Transactions tab — KPI tiles (shared stat-card pattern) ── */
.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card {
  flex: 1; min-width: 0; display: flex; flex-direction: column;
  gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch;
}
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-period { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-amount--danger { color: var(--mp-text-danger); }
.stat-link { display: inline-flex; width: fit-content; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer; }
.stat-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Transactions tab — filter bar ── */
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-btn-group { display: flex; align-items: center; }
.filter-btn-group :deep(.mp-pixel-button-group) { gap: var(--mp-spacing-2); }
.filter-airene-btn :deep(svg) { color: var(--mp-airene-default, #6938ef); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary)); border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

/* ── Transactions tab — cells ── */
.cd-attach-icon { color: var(--mp-text-subtle); }
.status-cell { display: inline-flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-0\.5); width: fit-content; }
.status-sub-label { font-size: var(--mp-font-sizes-xs, 11px); line-height: var(--mp-line-heights-xs); color: var(--mp-text-danger); padding-left: var(--mp-spacing-1\.5); }

/* Transactions tab — full empty state */
.cd-txn-empty { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-9) var(--mp-spacing-4); color: var(--mp-text-secondary); }
.cd-txn-empty-title { margin: 0; font-size: var(--mp-font-sizes-lg, 1rem); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cd-txn-empty-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.cd-missing {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-6);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
