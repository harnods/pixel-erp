<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpButton, MpIcon, MpTextlink, css,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import PrintShareMenu from '~/components/patterns/PrintShareMenu.vue'
import DetailJumpTo, { type JumpItem } from '~/components/patterns/DetailJumpTo.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ActivityLogModal from '~/components/patterns/ActivityLogModal.vue'
import JournalEntryDrawer, { type JournalEntryRow } from '~/components/patterns/JournalEntryDrawer.vue'
import { successToast } from '~/utils/toasts'
import { formatIDR } from '~/utils/currency'
import {
  paymentsReceived, getPaymentReceived, paymentLabel, paymentSubtotal, paymentWht, paymentTotal,
  cashAccountLabel, whtAccountLabel, invoiceById, customerNameOf, deletePaymentReceived,
  paymentJournal,
} from '~/data/paymentsReceived'
import { invoiceLabel } from '~/data/creditMemos'
import { getContactIdByName } from '~/data/contacts'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const payment = computed(() => getPaymentReceived(props.orderId))
const total = computed(() => (payment.value ? paymentTotal(payment.value) : 0))
const subtotal = computed(() => (payment.value ? paymentSubtotal(payment.value) : 0))
const wht = computed(() => (payment.value ? paymentWht(payment.value) : 0))
const firstInvoiceId = computed(() => payment.value?.allocations[0]?.invoiceId)

function formatDateLong(iso: string) { return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)) }
function formatDateNumeric(iso: string) { return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso)) }
function formatUpdatedAt(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date}, ${time}`
}

function attachmentIcon(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(ext)) return 'image-document'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel-document'
  if (['doc', 'docx'].includes(ext)) return 'word-document'
  return 'attachment'
}

function goInvoices() { router.push('/sales-invoices') }
function goFirstInvoice() { if (firstInvoiceId.value) router.push(`/sales-invoices/${firstInvoiceId.value}`) }

const jumpItems = computed<JumpItem[]>(() =>
  [...paymentsReceived]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((p) => ({ id: p.id, primary: paymentLabel(p.number), secondary: customerNameOf(p.customerId) })),
)
function jumpTo(id: string) { router.push(`/payments-received/${id}`) }

const journalOpen = ref(false)
const journalRows = computed<JournalEntryRow[]>(() =>
  (payment.value ? paymentJournal(payment.value).map((r) => ({ account: r.account, debit: r.debit, credit: r.credit })) : []),
)
const activityOpen = ref(false)

function edit() { router.push(`/payments-received/${props.orderId}/edit`) }
const deleteOpen = ref(false)
function confirmDelete() {
  deletePaymentReceived(props.orderId)
  deleteOpen.value = false
  successToast(t('Payment received deleted'))
  if (firstInvoiceId.value) router.push(`/sales-invoices/${firstInvoiceId.value}`)
  else goInvoices()
}
</script>

<template>
  <div v-if="payment" class="detail-page" data-devchange="payment-received-detail">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <MpTextlink id="pr-bc-invoices" as="a" class="detail-breadcrumb" @click.prevent="goInvoices">{{ t('Sales invoices') }}</MpTextlink>
          <span v-if="firstInvoiceId" class="detail-breadcrumb-sep">/</span>
          <MpTextlink v-if="firstInvoiceId" id="pr-bc-invoice" as="a" class="detail-breadcrumb" @click.prevent="goFirstInvoice">{{ invoiceLabel(invoiceById(firstInvoiceId)?.number ?? 0) }}</MpTextlink>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ paymentLabel(payment.number) }}</h1>
          <DetailJumpTo id="pr-jump" :items="jumpItems" :aria-label="t('Switch transaction')" :placeholder="t('Search...')" :empty-text="t('No transactions found')" @select="jumpTo" />
        </div>
      </div>
    </header>

    <div class="detail-stage">
      <!-- Header section 1: Customer + Total -->
      <section class="detail-summary">
        <div class="content-list-grid">
          <div class="content-list-col">
            <ContentList :label="t('Customer')"><a class="detail-value-link" @click="window.open(`/customers/${getContactIdByName(customerNameOf(payment.customerId))}`, '_blank')">{{ customerNameOf(payment.customerId) }}</a></ContentList>
          </div>
          <div class="content-list-col" />
          <div class="detail-primary-total">
            <span class="detail-total-label">{{ t('Total') }}</span>
            <span class="detail-total-amount">{{ formatIDR(total) }}</span>
            <a class="pr-journal-link" @click.prevent="journalOpen = true">{{ t('View journal entry') }}</a>
          </div>
        </div>

        <div class="detail-divider" />

        <!-- Header section 2: details grid -->
        <div class="content-list-grid">
          <div class="content-list-col">
            <ContentList :label="t('Date paid')" :value="formatDateLong(payment.date)" />
            <ContentList :label="t('Account')" :value="cashAccountLabel(payment.depositToAccountId)" />
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Transaction no.')" :value="paymentLabel(payment.number)" />
            <ContentList :label="t('Payment method')" :value="payment.paymentMethod || '—'" />
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Reference no.')" :value="payment.referenceNo || '—'" />
          </div>
        </div>
      </section>

      <!-- Allocation table -->
      <section class="detail-items-section">
        <table class="detail-items pr-table">
          <colgroup>
            <col class="pr-col-number" />
            <col />
            <col class="pr-col-date" />
            <col class="pr-col-amount" />
            <col class="pr-col-amount" />
          </colgroup>
          <thead>
            <tr>
              <th class="detail-th">{{ t('Number') }}</th>
              <th class="detail-th" aria-hidden="true" />
              <th class="detail-th">{{ t('Due date') }}</th>
              <th class="detail-th detail-th--num">{{ t('Total') }}</th>
              <th class="detail-th detail-th--num">{{ t('Amount paid') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(al, i) in payment.allocations" :key="i">
              <td class="detail-td">
                <a class="cell-link cell-text" @click="router.push(`/sales-invoices/${al.invoiceId}`)">{{ invoiceLabel(invoiceById(al.invoiceId)?.number ?? 0) }}</a>
              </td>
              <td class="detail-td" />
              <td class="detail-td">{{ formatDateNumeric(invoiceById(al.invoiceId)?.dueDate ?? payment.date) }}</td>
              <td class="detail-td detail-td--num">{{ formatIDR(invoiceById(al.invoiceId)?.total ?? 0) }}</td>
              <td class="detail-td detail-td--num">{{ formatIDR(al.amount) }}</td>
            </tr>
          </tbody>
        </table>
        <div class="detail-items-count">{{ t('Showing') }} {{ payment.allocations.length }} {{ t('of') }} {{ payment.allocations.length }} {{ t('transactions') }}</div>
      </section>

      <!-- Notes + totals -->
      <section class="detail-notes">
        <div class="detail-notes-left">
          <ContentList :label="t('Memo')">
            <p class="detail-note-text">{{ payment.memo || '—' }}</p>
          </ContentList>
          <ContentList v-if="payment.attachments.length" :label="t('Attachment')">
            <div class="detail-attach-list">
              <a v-for="(a, i) in payment.attachments" :key="i" class="detail-attach" @click.prevent>
                <span class="detail-attach-icon"><MpIcon :name="attachmentIcon(a.name)" size="md" /></span>
                <span class="detail-attach-meta">
                  <span class="detail-attach-name">{{ a.name }}</span>
                  <span class="detail-attach-size">{{ a.sizeKB.toFixed(1) }} KB</span>
                </span>
              </a>
            </div>
          </ContentList>
          <ContentList v-else :label="t('Attachment')">—</ContentList>
        </div>
        <div class="detail-totals">
          <div class="detail-total-row">
            <span class="detail-total-row-label detail-total-row-label--strong">{{ t('Subtotal') }}</span>
            <span class="detail-total-row-amt detail-total-row-amt--strong">{{ formatIDR(subtotal) }}</span>
          </div>
          <div v-if="wht > 0" class="detail-total-row">
            <span class="detail-total-row-label">{{ t('Less: Withholding') }}</span>
            <span class="detail-total-row-amt">{{ formatIDR(-wht) }}</span>
          </div>
          <div class="detail-total-rule" />
          <div class="detail-total-row">
            <span class="detail-total-row-label detail-total-row-label--total">{{ t('Total') }}</span>
            <span class="detail-total-row-amt detail-total-row-amt--total">{{ formatIDR(total) }}</span>
          </div>
        </div>
      </section>

      <a class="detail-updated" @click.prevent="activityOpen = true">{{ t('Last updated by') }} {{ payment.updatedBy }} {{ t('on') }} {{ formatUpdatedAt(payment.updatedAt) }} (GMT+7)</a>
    </div>

    <footer class="detail-footer">
      <PrintShareMenu id="pr-print" />
      <MpPopover id="pr-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
        <MpPopoverTrigger>
          <MpButton variant="primary" is-rounded right-icon="chevrons-down">{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem>{{ t('Preview') }}</MpPopoverListItem>
          </MpPopoverList>
          <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
          <MpPopoverList>
            <MpPopoverListItem @click="edit">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem @click="deleteOpen = true">{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </footer>

    <JournalEntryDrawer v-model:is-open="journalOpen" :heading="paymentLabel(payment.number)" :rows="journalRows" />
    <ActivityLogModal :is-open="activityOpen" :subject="paymentLabel(payment.number)" :updated-by="payment.updatedBy" :updated-at="payment.updatedAt" :entries="payment.history" @close="activityOpen = false" />
    <ConfirmModal
      v-model:is-open="deleteOpen"
      :title="`${t('Delete payment received')}?`"
      :description="t('Deleting this payment restores the invoice balances. This cannot be undone.')"
      :confirm-label="t('Delete payment received')"
      @confirm="confirmDelete"
    />
  </div>

  <div v-else class="pr-notfound">
    <p class="pr-notfound-title">{{ t('Payment received not found') }}</p>
    <p class="pr-notfound-desc">{{ t('This record may have been deleted or the link is invalid.') }}</p>
    <MpButton variant="secondary" is-rounded @click="goInvoices">{{ t('Back to sales invoices') }}</MpButton>
  </div>
</template>

<style scoped>
/* ── Page shell ── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

/* ── Title bar ── */
.detail-bar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle);
  padding: 0 var(--mp-spacing-6);
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.detail-breadcrumb-sep { color: var(--mp-text-subtle); font-size: var(--mp-font-sizes-md); }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.detail-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
  white-space: nowrap;
}

/* ── Scrollable stage ── */
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
  gap: var(--mp-spacing-5);
  container-type: inline-size;
}

/* ── Header summary ── */
.detail-summary { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.content-list-grid {
  display: grid;
  grid-template-columns: minmax(0, 318px) repeat(4, minmax(0, 1fr));
  column-gap: var(--mp-spacing-6);
  row-gap: 0;
}
.content-list-col { display: flex; flex-direction: column; }
.detail-primary-total {
  grid-column: 3 / -1;
  justify-self: end;
  align-self: start;
  padding-top: var(--mp-spacing-2);
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: baseline;
  gap: var(--mp-spacing-2);
}
.detail-total-label {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.detail-total-amount {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.pr-journal-link { flex-basis: 100%; text-align: right; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer; }
.pr-journal-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.detail-divider {
  height: var(--mp-border-width-sm, 1px);
  background: repeating-linear-gradient(
    to right,
    var(--mp-border-default) 0,
    var(--mp-border-default) 4px,
    transparent 4px,
    transparent 8px
  );
}

/* ── Table ── */
.detail-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.detail-items { width: 100%; border-collapse: collapse; }
.pr-table { table-layout: fixed; }
.pr-col-number { width: 240px; }
.pr-col-date { width: 160px; }
.pr-col-amount { width: 200px; }
.detail-th {
  height: var(--mp-sizes-7, 28px);
  text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
  text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.detail-th--num {
  text-align: right;
  padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4);
}
.detail-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-lg, 20px);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: middle;
}
.detail-td--num {
  text-align: right;
  white-space: nowrap;
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4);
}
.cell-link { color: var(--mp-text-link); cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.detail-items-count {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--mp-spacing-3);
  margin: 0;
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default);
}

/* ── Notes + totals ── */
.detail-notes {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: var(--mp-spacing-6);
  align-items: start;
}
.detail-notes-left { display: flex; flex-direction: column; }
.detail-note-text {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-lg, 20px);
  color: var(--mp-text-default);
  white-space: pre-line;
}
.detail-attach-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.detail-attach {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  cursor: pointer;
  width: fit-content;
}
.detail-attach-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.detail-attach-meta { display: flex; flex-direction: column; }
.detail-attach-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.detail-attach:hover .detail-attach-name { text-decoration: underline; text-underline-offset: 2px; }
.detail-attach-size { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.detail-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding-top: var(--mp-spacing-2); }
.detail-total-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.detail-total-row-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.detail-total-row-amt { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.detail-total-row-label--strong, .detail-total-row-amt--strong,
.detail-total-row-label--total, .detail-total-row-amt--total {
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.detail-total-rule {
  height: var(--mp-border-width-sm, 1px);
  background: repeating-linear-gradient(
    to right,
    var(--mp-border-default) 0,
    var(--mp-border-default) 4px,
    transparent 4px,
    transparent 8px
  );
}

/* ── Last updated ── */
.detail-updated {
  margin: 0;
  align-self: flex-start;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-link);
  cursor: pointer;
}
.detail-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Footer ── */
.detail-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
}

/* ── Not found ── */
.pr-notfound { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-3); height: 100%; }
.pr-notfound-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: 0; }
.pr-notfound-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin: 0; }
</style>
