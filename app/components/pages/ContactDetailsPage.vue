<!-- prod-parity-aligned: jurnal-non-core-feature-frontend/src/modules/contacts/views/ContactDetailView.vue -->
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
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpBadge, MpIcon, MpButton, MpTooltip,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  toast, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import { columnWidth, type ColumnKind } from '~/components/patterns/columnWidths'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpPagination from '~/components/patterns/ErpPagination.vue'
import { getContact, deleteContact, updateContact, nitkuFull, type ContactType } from '~/data/contacts'
import { contactTransactions, contactSummary } from '~/data/contactTransactions'
import { formatIDR } from '~/utils/currency'
import { infoToast } from '~/utils/toasts'

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

// ── Tab persistence via ?tab= so back/forward restores the tab ───────────────
const TAB_NAMES = ['details', 'transactions', 'files']
const activeTabIndex = computed({
  get(): number {
    const idx = TAB_NAMES.indexOf(route.query.tab as string)
    return idx >= 0 ? idx : 0
  },
  set(idx: number) {
    router.replace({ query: { ...route.query, tab: TAB_NAMES[idx] ?? 'details' } })
  },
})

function goBack() { router.push(`/${listSlug.value}`) }
function goEdit() { router.push(`/${listSlug.value}/${props.orderId}/edit`) }

// ── Derived display values ────────────────────────────────────────────────────
const fullNameDisplay = computed(() => {
  const c = contact.value
  if (!c?.fullName) return ''
  return c.title ? `${c.title} ${c.fullName}` : c.fullName
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

// ── Transactions tab — invoices raised against this contact (AR + AP) ───────
// Derived from the sales/purchase invoice mocks (data/contactTransactions.ts),
// so a contact with no matching record shows the empty line, not a fake list.
const transactions = computed(() => (contact.value ? contactTransactions(contact.value) : []))
const txPerPage = ref(20)
const txPage = ref(1)
const txRows = computed(() => transactions.value.slice((txPage.value - 1) * txPerPage.value, txPage.value * txPerPage.value))
const summary = computed(() => (contact.value ? contactSummary(contact.value) : null))
const isCustomer = computed(() => !!contact.value?.types.includes('customer'))
const isVendor = computed(() => !!contact.value?.types.includes('vendor'))
const STATUS_LABEL: Record<string, string> = { paid: 'Paid', open: 'Open', overdue: 'Overdue' }
function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
/** Related-records column width — from the shared standard, never hardcoded.
 *  Columns grow to their max (the trailing spacer <col> soaks up the rest). */
/** Narrow variant for the 8-column Transactions table — min widths, scrolls if needed. */
function colMin(kind: ColumnKind) {
  const { minWidth } = columnWidth(kind)
  return { width: minWidth, minWidth }
}
function colStyle(kind: ColumnKind) {
  const { minWidth, maxWidth } = columnWidth(kind)
  return { width: maxWidth, minWidth, maxWidth }
}

// ── Title-bar actions ─────────────────────────────────────────────────────────
// Prod CREATE_TRANSACTION_MENU, filtered by the contact's types the way
// quickbook's ContactHelper.*_create_transaction_type does.
const CREATE_TRANSACTION_MENU = [
  { key: 'sales_invoice',    label: 'Sales Invoice',    to: '/sales-invoices/new', types: ['customer'] },
  { key: 'credit_memo',      label: 'Credit Memo',      to: '',                    types: ['customer', 'other'] },
  { key: 'purchase_invoice', label: 'Purchase Invoice', to: '/purchase-invoices',  types: ['vendor'] },
  { key: 'debit_memo',       label: 'Debit Memo',       to: '',                    types: ['vendor', 'other'] },
  { key: 'expense',          label: 'Expense',          to: '/expenses/new',       types: ['vendor', 'other'] },
  { key: 'bank_withdrawal',  label: 'Bank Withdrawal',  to: '/bank-withdrawals/new', types: ['other'] },
  { key: 'bank_deposit',     label: 'Bank Deposit',     to: '/bank-deposits/new',  types: ['other'] },
]
const createTransactionItems = computed(() =>
  CREATE_TRANSACTION_MENU.filter((m) => contact.value?.types.some((tp) => m.types.includes(tp))))
function createTransaction(item: { to: string }) {
  if (item.to) router.push(item.to)
  else infoToast(t('Not in this prototype'))
}
function archiveContact() {
  updateContact(props.orderId, { archived: true })
  toast.notify({ variant: 'success', title: t('Contact archived'), maxWidth: 'max-content' })
}
const canDelete = computed(() => transactions.value.length === 0)
const deleteTitle = computed(() => {
  const tp = contact.value?.types[0]
  return tp === 'vendor' ? 'Delete vendor?' : tp === 'other' ? 'Delete other contact?' : 'Delete customer?'
})
const deleteMessage = computed(() => {
  const tp = contact.value?.types[0]
  return tp === 'vendor' ? 'Deleted vendor cannot be restored.' : tp === 'other' ? 'Deleted other contact cannot be restored.' : 'Deleted customer cannot be restored.'
})
const isDeleteModalOpen = ref(false)
function confirmDelete() {
  deleteContact(props.orderId)
  toast.notify({ variant: 'success', title: t('Contact deleted'), maxWidth: 'max-content' })
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
            <MpTooltip v-if="contact.archived" id="cd-create-tx-tt" :label="t('Transactions cannot be created for an archived contact')" use-portal>
              <MpButton variant="primary" is-rounded right-icon="chevrons-down" @click="infoToast(t('Transactions cannot be created for an archived contact'))">{{ t('Create transaction') }}</MpButton>
            </MpTooltip>
            <MpPopover v-else id="cd-create-tx" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <MpButton variant="primary" is-rounded right-icon="chevrons-down">{{ t('Create transaction') }}</MpButton>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
                <MpPopoverList>
                  <MpPopoverListItem
                    v-for="item in createTransactionItems" :key="item.key"
                    @click="createTransaction(item)"
                  >{{ t(item.label) }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>

            <MpPopover id="cd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
              <MpPopoverTrigger>
                <button class="btn-enterprise cd-kebab" :aria-label="t('More actions')">
                  <MpIcon name="menu-kebab" size="md" />
                </button>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
                <MpPopoverList>
                  <MpPopoverListItem @click="router.push('/sales-report/sales-by-customer')">{{ t('Statement report') }}</MpPopoverListItem>
                  <MpPopoverListItem @click="goEdit">{{ t('Edit') }}</MpPopoverListItem>
                  <MpTooltip id="cd-merge-tt" :label="t('Coming soon')" placement="left" use-portal>
                    <MpPopoverListItem is-disabled>{{ t('Merge contact') }}</MpPopoverListItem>
                  </MpTooltip>
                  <MpTooltip id="cd-group-tt" :label="t('Coming soon')" placement="left" use-portal>
                    <MpPopoverListItem is-disabled>{{ t('Add to contact group') }}</MpPopoverListItem>
                  </MpTooltip>
                  <MpPopoverListItem :is-disabled="contact.archived" @click="archiveContact">{{ t('Archive') }}</MpPopoverListItem>
                  <MpPopoverListItem
                    :is-disabled="!canDelete"
                    :title="canDelete ? undefined : t('This contact can\'t be deleted because it has existing transactions.')"
                    :class="css({ color: 'var(--mp-text-critical, var(--mp-text-danger))' })"
                    @click="isDeleteModalOpen = true"
                  >{{ t('Delete') }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>
        </div>

        <MpTabList>
          <MpTab id="cd-tab-details" value="details">{{ t('Contact details') }}</MpTab>
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

                  <ContentList :label="t('Identity')" :value="contact.identityNumber ? `${contact.identityType} ${contact.identityNumber}` : undefined" />
                  <ContentList :label="t('Contact group')">
                    <template v-if="contact.groups.length">
                      <a v-for="g in contact.groups" :key="g" class="cd-link content-list__line" @click="router.push(`/contact-groups?type=${listSlug === 'other-contacts' ? 'others' : listSlug}`)">{{ g }}</a>
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
                    v-if="contact.domicile === 'domestic' && contact.npwp"
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
              <section v-if="contact.banks.length" class="cd-section">
                <h2 class="cd-section-title">{{ t('Bank info') }}</h2>
                <div class="cd-grid">
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
                <p class="cd-memo">{{ contact.memo || '—' }}</p>
                <a class="cd-updated">{{ lastUpdatedDisplay }}</a>
              </section>

            </div>
          </MpTabPanel>

          <!-- ─────────── Transactions ─────────── -->
          <MpTabPanel value="transactions">
            <!-- Summary strip — tiles per side; a customer+vendor contact gets both -->
            <div v-if="summary" class="stats-section cd-stats">
              <template v-if="isCustomer">
                <div class="stat-card stat-card--bordered">
                  <div class="stat-title">{{ t('Invoices owed to you') }}</div>
                  <div class="stat-period">{{ t('As of today') }}</div>
                  <div class="stat-amount">{{ formatIDR(summary.owedToYou) }}</div>
                </div>
                <div class="stat-card stat-card--bordered">
                  <div class="stat-title">{{ t('Payment received') }}</div>
                  <div class="stat-period">{{ t('Last 30 days') }}</div>
                  <div class="stat-amount">{{ formatIDR(summary.paymentReceived) }}</div>
                </div>
                <div class="stat-card stat-card--bordered">
                  <div class="stat-title">{{ t('Total credit memo') }}</div>
                  <div class="stat-period">{{ t('As of today') }}</div>
                  <div class="stat-amount">{{ formatIDR(0) }}</div>
                </div>
              </template>
              <template v-if="isVendor">
                <div class="stat-card stat-card--bordered">
                  <div class="stat-title">{{ t('Invoices you need to pay') }}</div>
                  <div class="stat-period">{{ t('As of today') }}</div>
                  <div class="stat-amount">{{ formatIDR(summary.youNeedToPay) }}</div>
                </div>
                <div class="stat-card stat-card--bordered">
                  <div class="stat-title">{{ t('Payment made') }}</div>
                  <div class="stat-period">{{ t('Last 30 days') }}</div>
                  <div class="stat-amount">{{ formatIDR(summary.paymentMade) }}</div>
                </div>
                <div class="stat-card stat-card--bordered">
                  <div class="stat-title">{{ t('Total debit memo') }}</div>
                  <div class="stat-period">{{ t('As of today') }}</div>
                  <div class="stat-amount">{{ formatIDR(0) }}</div>
                </div>
              </template>
              <div class="stat-card">
                <div class="stat-title">{{ t('Overdue') }}</div>
                <div class="stat-period">{{ t('As of today') }}</div>
                <template v-if="isCustomer && isVendor">
                  <div class="stat-amount stat-amount--danger stat-amount--sm">{{ t('Owed to you') }}: {{ formatIDR(summary.overdueReceivable) }}</div>
                  <div class="stat-amount stat-amount--danger stat-amount--sm">{{ t('You owe') }}: {{ formatIDR(summary.overduePayable) }}</div>
                </template>
                <div v-else class="stat-amount stat-amount--danger">{{ formatIDR(isVendor ? summary.overduePayable : summary.overdueReceivable) }}</div>
              </div>
            </div>

            <div class="cd-tx-toolbar">
              <MpTooltip id="cd-tx-filter-tt" :label="t('Filters are not available yet')" use-portal>
                <MpButton variant="secondary" is-rounded left-icon="filter" @click="infoToast(t('Filters are not available yet'))">{{ t('Filter') }}</MpButton>
              </MpTooltip>
            </div>

            <div class="cd-table-wrap">
            <table class="cd-table">
              <colgroup>
                <col :style="colMin('date')" />
                <col :style="colMin('number')" />
                <col :style="colMin('default')" />
                <col :style="colMin('status')" />
                <col :style="colMin('date')" />
                <col :style="colMin('amount')" />
                <col :style="colMin('amount')" />
                <col :style="colMin('tags')" />
              </colgroup>
              <thead>
                <tr>
                  <th>{{ t('Date') }}</th>
                  <th>{{ t('Number') }}</th>
                  <th>{{ t('Description') }}</th>
                  <th>{{ t('Status') }}</th>
                  <th>{{ t('Due date') }}</th>
                  <th class="cd-td--right">{{ t('Amount') }}</th>
                  <th class="cd-td--right">{{ t('Balance due') }}</th>
                  <th>{{ t('Tags') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!transactions.length">
                  <td colspan="8" class="cd-td--empty">{{ t('No transactions yet.') }}</td>
                </tr>
                <tr v-for="row in txRows" :key="row.id">
                  <td>{{ formatDate(row.date) }}</td>
                  <td><a class="cd-link" @click="router.push(row.href)">{{ row.number }}</a></td>
                  <td>{{ row.description || '—' }}</td>
                  <td><ErpStatusBadge :status="row.status" :label="t(STATUS_LABEL[row.status] ?? row.status)" /></td>
                  <td>{{ formatDate(row.dueDate) }}</td>
                  <td class="cd-td--right">{{ formatIDR(row.amount) }}</td>
                  <td class="cd-td--right">{{ formatIDR(row.balanceDue) }}</td>
                  <td>{{ row.tags.length ? row.tags.join(', ') : '—' }}</td>
                </tr>
              </tbody>
            </table>
            </div>
            <ErpPagination
              v-if="transactions.length > txPerPage"
              :current-page="txPage" :per-page="txPerPage" :total="transactions.length"
              @page-change="(p: number) => (txPage = p)" @per-page-change="(n: number) => { txPerPage = n; txPage = 1 }"
            />
          </MpTabPanel>

          <!-- ─────────── Files ─────────── -->
          <MpTabPanel value="files">
            <div class="cd-tx-toolbar">
              <MpButton variant="secondary" is-rounded left-icon="upload" @click="infoToast(t('Not in this prototype'))">{{ t('Upload file') }}</MpButton>
            </div>
            <table class="cd-table">
              <colgroup>
                <col :style="colStyle('date')" />
                <col :style="colStyle('name')" />
                <col :style="colStyle('number')" />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>{{ t('Date') }}</th>
                  <th>{{ t('File') }}</th>
                  <th>{{ t('Related transaction') }}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                <tr><td colspan="4" class="cd-td--empty">{{ t('No files yet.') }}</td></tr>
              </tbody>
            </table>
          </MpTabPanel>

        </MpTabPanels>
      </div>
    </MpTabs>

    <ConfirmModal
      v-model:is-open="isDeleteModalOpen"
      :title="t(deleteTitle)"
      :description="t(deleteMessage)"
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

/* ── Related-records table (Transactions tab) ── */
.cd-table-wrap { overflow-x: auto; }
.cd-table { width: 100%; border-collapse: collapse; }
.cd-table th {
  height: var(--mp-sizes-7, 28px);
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-surface, #f1f5f9);
  text-align: left; text-transform: uppercase;
  font-size: 12px; font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary);
  white-space: nowrap;
}
.cd-table td {
  min-height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-4) var(--mp-spacing-2\.5, 10px) var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: middle;
}
.cd-table th.cd-td--right,
.cd-table td.cd-td--right { text-align: right; }

.cd-memo { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: pre-line; }
.cd-tx-toolbar { display: flex; align-items: center; margin: var(--mp-spacing-6) 0 var(--mp-spacing-4); }
.cd-tx-toolbar:first-child { margin-top: 0; }
.cd-table td.cd-td--empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-6) 0; }

/* Summary strip — same stat-card classes as BillsIndexPage */
.stats-section { display: flex; gap: var(--mp-spacing-6); align-items: flex-start; }
.stat-card { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-right: var(--mp-spacing-6); align-self: stretch; }
.stat-card--bordered { border-right: 1px solid var(--mp-border-default); }
.stat-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); white-space: nowrap; }
.stat-period { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); white-space: nowrap; }
.stat-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-2xl, 32px); white-space: nowrap; }
.stat-amount--sm { font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); }
.stat-amount--danger { color: var(--mp-text-danger); }

.cd-missing {
  display: flex; flex-direction: column; align-items: flex-start; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-6);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
