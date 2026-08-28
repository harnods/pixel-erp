<script setup lang="ts">
import { ref, computed } from 'vue'
import { formatIDR } from '~/utils/currency'
import {
  MpIcon, MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpBanner, MpBannerIcon, MpBannerDescription, MpTextlink, MpButton,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpTooltip,
  MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter, MpModalOverlay,
  css, toast,
} from '@mekari/pixel3'
import type jsPDF from 'jspdf'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import MatchedDetailsDrawer from '~/components/patterns/MatchedDetailsDrawer.vue'
import JournalEntryDrawer, { type JournalEntryRow } from '~/components/patterns/JournalEntryDrawer.vue'
import PdfPreviewModal from '~/components/patterns/PdfPreviewModal.vue'
import { bills, deleteBills } from '~/data/bills'
import { generateBillsBulkPdf } from '~/utils/billsBulkPdf'
import { formatDate, formatDateLong } from '~/utils/date'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()
const route = useRoute()

const bill = computed(() => bills.find((b) => b.id === props.orderId) ?? null)

// "Set as recurring" isn't built yet — kept in the Actions popover markup below
// (per design) but hidden until the feature ships.
const showSetAsRecurring = false

// Duplicate — opens the New expense form pre-filled from this bill (minus payment);
// nothing is saved until the user submits the form.
function duplicate() {
  if (!bill.value) return
  router.push({ path: '/expenses/new', query: { duplicate: bill.value.id } })
}

function edit() {
  if (!bill.value) return
  router.push(`/expenses/${bill.value.id}/edit`)
}

// ── Print / Preview PDF — same PdfPreviewModal used across the Expenses module ──
const pdfPreviewOpen = ref(false)
const pdfPreviewDoc = ref<jsPDF | null>(null)
const pdfPreviewFilename = ref('')
function openPdfPreview() {
  if (!bill.value) return
  pdfPreviewDoc.value = generateBillsBulkPdf([bill.value])
  pdfPreviewFilename.value = `Expense #${String(bill.value.number).padStart(5, '0')}.pdf`
  pdfPreviewOpen.value = true
}

// ── Delete confirmation (same modal pattern as BillsIndexPage's bulk delete) ──
const deleteModalOpen = ref(false)
function confirmDelete() {
  if (!bill.value) return
  deleteBills([bill.value.id])
  deleteModalOpen.value = false
  toast.notify({ variant: 'success', title: `1 ${t('expense')} ${t('deleted')}` })
  goExpenses()
}

// Awaiting-approval — same pattern as the Purchase Order detail page: a primary
// Approve action instead of the usual payment actions. The Awaiting Approval tab
// relabels every bill as "Draft" for display (not the bill's real status — see
// BillsAwaitingApprovalPage.vue), so this page takes the same cue from how it was
// entered (?approval=1) rather than bill.status.
const isAwaitingApproval = computed(() => route.query.approval === '1')
function approve() {
  toast.notify({ variant: 'success', title: t('Expense approved') })
  router.push({ path: '/expenses', query: { tab: 'Awaiting Approval' } })
}

// Info banner — shows once a paid bill's payment has been reconciled against a
// bank transaction (see bill.reconciled in ~/data/bills.ts). Never alongside the
// awaiting-approval banner — a transaction can't be both unapproved and reconciled.
const showBanner = computed(() => !!bill.value?.reconciled && !isAwaitingApproval.value)
const showMatchedDetails = ref(false)
const showJournalEntry = ref(false)

// Journal entry — one debit line per line item + VAT in (if taxed), balanced by a
// credit to the withholding payable account (if any) and the bank/AP account for
// the remainder. Always balances: subtotal + tax = withholding + (payment or total).
const journalEntryRows = computed<JournalEntryRow[]>(() => {
  const b = bill.value
  if (!b) return []
  const rows: JournalEntryRow[] = (b.lineItems ?? []).map((li) => ({ account: li.account, debit: li.amount }))
  if (b.taxAmount) rows.push({ account: '2-10001 VAT In (PPN)', debit: b.taxAmount })
  if (b.withholding) rows.push({ account: b.withholding.account, credit: b.withholding.amount })
  if (b.payment) rows.push({ account: b.payment.paymentAccount, credit: b.payment.amountPaid })
  else rows.push({ account: '2-10000 Accounts Payable', credit: b.total })
  return rows
})

// Totals breakdown — Group 1 (Subtotal/PPN), Group 2 (Total/Less lines), and a
// conditional Group 3 (Balance due) that only appears once any deduction ("Less:
// withholding" and/or "Less: payment") exists. The page-level total badge next to
// Beneficiary mirrors Group 3 whenever it's shown, so "Total" only ever appears
// when nothing has been deducted from it yet.
const groupTotal = computed(() => (bill.value?.subtotal ?? bill.value?.total ?? 0) + (bill.value?.taxAmount ?? 0))
// Tax breakdown only renders when the bill actually carries PPN — a "No tax" bill
// shows neither the Subtotal/PPN group nor a "PPN 10%" row. The rate label is derived
// from the data (taxAmount ÷ subtotal) so it matches whatever rate the bill was taxed at.
const hasTax = computed(() => (bill.value?.taxAmount ?? 0) > 0)
const ppnRate = computed(() => {
  const sub = bill.value?.subtotal ?? 0
  const tax = bill.value?.taxAmount ?? 0
  return sub > 0 ? Math.round((tax / sub) * 100) : 0
})
const hasLess = computed(() => !!bill.value?.withholding || !!bill.value?.payment)
const balanceDue = computed(() => groupTotal.value - (bill.value?.withholding?.amount ?? 0) - (bill.value?.payment?.amountPaid ?? 0))

// Paid bills never show a due date and are always simply "Paid"; only an
// unpaid bill's due date can put it into "Open" vs "Overdue".
const isOverdue = computed(() => !!bill.value && bill.value.status === 'unpaid' && new Date(bill.value.dueDate).getTime() < Date.now())
const displayStatus = computed(() => {
  if (!bill.value) return 'unpaid'
  if (isAwaitingApproval.value) return 'draft'
  if (bill.value.status === 'paid') return 'paid'
  return isOverdue.value ? 'overdue' : 'open'
})
// Payment tab: always present for a bill created already-paid; for a bill
// created unpaid it only appears once a payment has actually been added.
const showPaymentTab = computed(() => bill.value?.status === 'paid' || !!bill.value?.payment)

// Actions menu — reconciled bills are bank-matched, so Delete is disabled to
// avoid breaking that match; unreconciled paid bills can still be deleted.
const isReconciled = computed(() => !!bill.value?.reconciled)

// ── Jump-to-transaction switcher (title-bar chevron) — same as the outbound /
// inbound delivery detail pages. Search by number or beneficiary, top 6 shown. ──
const jumpSearch = ref('')
const jumpLabel = (b: (typeof bills)[number]) => `expense #${String(b.number).padStart(5, '0')}`
const jumpResults = computed(() => {
  const q = jumpSearch.value.trim().toLowerCase()
  const matched = q
    ? bills.filter((b) => jumpLabel(b).includes(q) || b.beneficiary.name.toLowerCase().includes(q))
    : bills
  return matched.slice(0, 6)
})
function jumpTo(id: string) { jumpSearch.value = ''; router.push(`/expenses/${id}`) }

function attachmentIcon(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image-document'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel-document'
  if (['doc', 'docx'].includes(ext)) return 'word-document'
  return 'attachment'
}

function goExpenses() {
  router.push({ path: '/expenses', query: { tab: 'Bills' } })
}
</script>

<template>
  <div v-if="bill" class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <MpTextlink id="bd-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="goExpenses">{{ t('Expenses') }}</MpTextlink>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('Expense') }} #{{ String(bill.number).padStart(5, '0') }}</h1>
          <ErpStatusBadge :status="displayStatus" size="md" badge-for="additionalInformation" />
          <MpPopover id="bd-jump" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <button class="detail-jump-chevron" :aria-label="t('Switch expense')">
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
                    <span class="detail-jump-item-number">{{ t('Expense') }} #{{ String(o.number).padStart(5, '0') }}</span>
                    <span class="detail-jump-item-customer">{{ o.beneficiary.name }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">{{ t('No transactions found.') }}</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <!-- Right-side header actions — only while awaiting approval, same icon row as the PO detail page -->
      <div v-if="isAwaitingApproval" class="detail-titlerow-right">
        <MpTooltip id="detail-tt-applog" :label="t('Approval log')" placement="bottom" use-portal>
          <MpButton class="detail-icon-btn" :aria-label="t('Approval log')">
            <MpIcon name="task-todo" size="md" />
          </MpButton>
        </MpTooltip>
        <MpTooltip id="detail-tt-comments" :label="t('Comments')" placement="bottom" use-portal>
          <MpButton class="detail-icon-btn" :aria-label="t('Comments')">
            <MpIcon name="comment" size="md" />
          </MpButton>
        </MpTooltip>
        <button class="btn-enterprise btn-enterprise--primary" @click="approve">{{ t('Approve') }}</button>
      </div>
    </header>

    <!-- ── Stage wrapper: rounded top corners tinted to match the active banner ── -->
    <div class="detail-stage-wrapper" :style="{ '--stage-tint': isAwaitingApproval ? 'var(--mp-colors-background-warning, #fef3d6)' : (showBanner ? 'var(--mp-background-information, #eef0fc)' : 'var(--mp-background-stage)') }">

    <!-- Awaiting-approval warning banner — full width, no border-radius, sits between header and stage -->
    <MpBanner v-if="isAwaitingApproval" id="bd-approval-banner" variant="warning" is-inline class="detail-info-banner">
      <MpBannerIcon id="bd-approval-banner-icon" />
      <MpBannerDescription id="bd-approval-banner-desc">
        {{ t('Transaction requires approval before it can be processed.') }}
        <MpTextlink id="bd-approval-banner-link" as="a" @click.prevent="router.push('/approval-workflows')">{{ t('View approval workflow') }}</MpTextlink>
      </MpBannerDescription>
    </MpBanner>

    <!-- Info banner — full width, no border-radius, sits between header and stage -->
    <MpBanner v-if="showBanner" id="bd-banner" variant="info" is-inline class="detail-info-banner">
      <MpBannerIcon id="bd-banner-icon" />
      <MpBannerDescription id="bd-banner-desc">
        {{ t('Transaction has been reconciled.') }}
        <MpTextlink id="bd-banner-link" as="a" @click.prevent="showMatchedDetails = true">{{ t('View details') }}</MpTextlink>
      </MpBannerDescription>
    </MpBanner>

    <MatchedDetailsDrawer v-if="bill" v-model:is-open="showMatchedDetails" :bill="bill" />
    <JournalEntryDrawer
      v-if="bill"
      v-model:is-open="showJournalEntry"
      :heading="`${t('Expense')} #${String(bill.number).padStart(5, '0')}`"
      :rows="journalEntryRows"
    />

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- Beneficiary + Total — separated section, inline together -->
      <section class="bd-primary">
        <ContentList :label="t('Beneficiary')" :value="bill.beneficiary.name" />
        <div class="detail-primary-total">
          <span class="detail-total-amount">
            <span class="detail-total-label">{{ t(hasLess ? 'Balance due' : 'Total') }}</span> {{ formatIDR(hasLess ? balanceDue : groupTotal) }}
          </span>
          <a class="detail-banner-link bd-journal-link" @click.prevent="showJournalEntry = true">{{ t('View journal entry') }}</a>
        </div>
      </section>

      <!-- Meta grid: col 1 = 318px, col 2-4 fill equally -->
      <section class="bd-meta content-list-grid">
        <!-- Has a due date: [trx date/due date] [trx no./reference no.] [category] [tags] -->
        <template v-if="bill.status !== 'paid'">
          <div class="content-list-col">
            <ContentList :label="t('Transaction date')" :value="formatDateLong(bill.date)" />
            <ContentList :label="t('Due date')" :value="formatDateLong(bill.dueDate)" />
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Transaction no.')" :value="`${t('Expense')} #${String(bill.number).padStart(5, '0')}`" />
            <ContentList :label="t('Reference no.')" value="—" />
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Category')" :value="bill.category" />
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Tags')">
              <span v-if="bill.tags?.length">{{ bill.tags.join(', ') }}</span>
              <template v-else>—</template>
            </ContentList>
          </div>
        </template>

        <!-- No due date: [trx date] [trx no.] [tags] / [category] [reference no.] -->
        <template v-else>
          <div class="content-list-col">
            <ContentList :label="t('Transaction date')" :value="formatDateLong(bill.date)" />
            <ContentList :label="t('Category')" :value="bill.category" />
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Transaction no.')" :value="`${t('Expense')} #${String(bill.number).padStart(5, '0')}`" />
            <ContentList :label="t('Reference no.')" value="—" />
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Tags')">
              <span v-if="bill.tags?.length">{{ bill.tags.join(', ') }}</span>
              <template v-else>—</template>
            </ContentList>
          </div>
        </template>
      </section>

      <!-- ── Line items — canonical detail-page table pattern ── -->
      <section class="detail-items-section">
        <table class="detail-items">
          <thead>
            <tr>
              <th class="detail-th">{{ t('Account') }}</th>
              <th class="detail-th">{{ t('Description') }}</th>
              <th class="detail-th">{{ t('Tax') }}</th>
              <th class="detail-th detail-th--num">{{ t('Amount') }}</th>
            </tr>
          </thead>
          <tbody class="detail-items-body">
            <tr v-if="!bill.lineItems?.length">
              <td class="detail-td detail-td--muted" colspan="4">{{ t('No accounts.') }}</td>
            </tr>
            <tr v-for="(li, i) in bill.lineItems" :key="i" class="detail-item-row">
              <td class="detail-td">{{ li.account }}</td>
              <td class="detail-td">{{ li.description || '—' }}</td>
              <td class="detail-td">{{ li.tax }}</td>
              <td class="detail-td detail-td--num">{{ formatIDR(li.amount) }}</td>
            </tr>
          </tbody>
        </table>
        <div v-if="bill.lineItems?.length" class="detail-items-count">
          <span>{{ t('Showing') }} {{ bill.lineItems.length }} {{ t('of') }} {{ bill.lineItems.length }} {{ t('accounts') }}</span>
        </div>
      </section>

      <!-- ── Notes + totals ── -->
      <section class="detail-notes">
        <div class="detail-notes-left">
          <ContentList :label="t('Memo')" class="detail-memo-section">
            <p class="detail-note-text">{{ bill.memo || '—' }}</p>
          </ContentList>
          <ContentList :label="`${t('Attachment')} (${bill.attachments?.length ?? 0})`" class="detail-attachment-section">
            <div v-if="bill.attachments?.length" class="detail-attach-list">
              <a
                v-for="(a, i) in bill.attachments" :key="i" class="detail-attach"
                :href="a.url" target="_blank" rel="noopener"
              >
                <span class="detail-attach-icon"><MpIcon :name="attachmentIcon(a.name)" size="md" /></span>
                <span class="detail-attach-meta">
                  <span class="detail-attach-name">{{ a.name }}</span>
                  <span class="detail-attach-size">{{ a.sizeKB.toFixed(1) }} KB</span>
                </span>
              </a>
            </div>
            <template v-else>—</template>
          </ContentList>
        </div>
        <div class="detail-totals">
          <!-- Group 1: Subtotal + PPN — only for taxed bills (a "No tax" bill jumps
               straight to Total, with no redundant Subtotal or empty PPN row). -->
          <template v-if="hasTax">
            <div class="detail-total-row">
              <span class="detail-total-row-label detail-total-row-label--total">{{ t('Subtotal') }}</span>
              <span class="detail-total-row-amt detail-total-row-amt--total">{{ formatIDR(bill.subtotal ?? bill.total) }}</span>
            </div>
            <div class="detail-total-row">
              <span class="detail-total-row-label">PPN {{ ppnRate }}%</span>
              <span class="detail-total-row-amt">{{ formatIDR(bill.taxAmount ?? 0) }}</span>
            </div>
            <p v-if="bill.priceIncludesTax" class="detail-total-note">{{ t('Prices are inclusive of tax') }}</p>
            <div class="detail-total-rule detail-total-rule--dashed" />
          </template>

          <!-- Group 2: Total + Less: withholding / Less: payment -->
          <div class="detail-total-row">
            <span class="detail-total-row-label detail-total-row-label--total">{{ t('Total') }}</span>
            <span class="detail-total-row-amt detail-total-row-amt--total">{{ formatIDR(groupTotal) }}</span>
          </div>
          <div v-if="bill.withholding" class="detail-total-row">
            <span class="detail-total-row-label">{{ t('Less:') }} {{ bill.withholding.name }}</span>
            <span class="detail-total-row-amt">({{ formatIDR(bill.withholding.amount) }})</span>
          </div>
          <div v-if="bill.payment" class="detail-total-row">
            <span class="detail-total-row-label">{{ t('Less: payment') }}</span>
            <span class="detail-total-row-amt">({{ formatIDR(bill.payment.amountPaid) }})</span>
          </div>
          <div v-if="hasLess" class="detail-total-rule detail-total-rule--dashed" />

          <!-- Group 3: Balance due — only when a deduction exists -->
          <div v-if="hasLess" class="detail-total-row">
            <span class="detail-total-row-label detail-total-row-label--total">{{ t('Balance due') }}</span>
            <span class="detail-total-row-amt detail-total-row-amt--total">{{ formatIDR(balanceDue) }}</span>
          </div>
        </div>
      </section>

      <!-- ── Payment tab — same tab-selected state (blue) as the creation page's payment tab ── -->
      <MpTabs v-if="showPaymentTab" id="bd-tabs" :default-value="0" variant-color="blue" class="detail-tabs">
        <MpTabList>
          <MpTab id="bd-tab-payment" value="payment">{{ t('Payment') }}</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel value="payment">
            <h3 class="detail-tab-heading">{{ t('Payment details') }}</h3>
            <table class="detail-payment">
              <thead>
                <tr>
                  <th class="detail-th">{{ t('Date') }}</th>
                  <th class="detail-th">{{ t('Number') }}</th>
                  <th class="detail-th">{{ t('Pay from') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Amount') }}</th>
                  <th class="detail-th">{{ t('Reference no.') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!bill.payment">
                  <td class="detail-td detail-td--muted" colspan="5">{{ t('No payment recorded.') }}</td>
                </tr>
                <tr v-else class="detail-item-row">
                  <td class="detail-td">{{ formatDate(bill.payment.paymentDate) }}</td>
                  <td class="detail-td">
                    <span class="detail-payment-number" @click="router.push(`/expenses/${bill.id}/payment-details`)">{{ t('Spend money') }} #{{ String(bill.number).padStart(5, '0') }}</span>
                  </td>
                  <td class="detail-td">{{ bill.payment.paymentAccount }}</td>
                  <td class="detail-td detail-td--num">{{ formatIDR(bill.payment.amountPaid) }}</td>
                  <td class="detail-td">{{ bill.payment.reference || '—' }}</td>
                </tr>
              </tbody>
            </table>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>
    </div>
    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer">
      <button class="detail-btn detail-btn--secondary btn-enterprise" @click="openPdfPreview">{{ t('Print PDF') }}</button>

      <button v-if="bill.status === 'unpaid' && !isAwaitingApproval" class="detail-btn detail-btn--secondary btn-enterprise">
        <MpIcon name="pay-brand" size="md" />
        {{ t('Pay with Mekari Pay') }}
      </button>

      <MpPopover id="detail-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="detail-btn btn-enterprise" :class="isAwaitingApproval ? 'detail-btn--secondary' : 'detail-btn--primary'">
            {{ t('Actions') }}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="openPdfPreview">{{ t('Preview') }}</MpPopoverListItem>
            <MpPopoverListItem v-if="bill.status === 'unpaid' && !isAwaitingApproval" @click="router.push(`/expenses/${bill.id}/payment`)">{{ t('Add payment') }}</MpPopoverListItem>
            <MpPopoverListItem v-if="showSetAsRecurring && !isAwaitingApproval">{{ t('Set as recurring') }}</MpPopoverListItem>
          </MpPopoverList>
          <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
          <MpPopoverList>
            <MpPopoverListItem @click="duplicate">{{ t('Duplicate') }}</MpPopoverListItem>
            <MpPopoverListItem v-if="bill.status === 'unpaid' || isAwaitingApproval" @click="edit">{{ t('Edit') }}</MpPopoverListItem>
            <MpTooltip v-if="isReconciled" id="detail-actions-delete-tt" :label="t('Unmatch reconciliation to delete')" placement="top" use-portal>
              <span class="detail-actions-delete-tt-wrap">
                <MpPopoverListItem is-disabled>{{ t('Delete') }}</MpPopoverListItem>
              </span>
            </MpTooltip>
            <MpPopoverListItem v-else @click="deleteModalOpen = true">{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </footer>

    <!-- ── Print / Preview PDF modal ── -->
    <PdfPreviewModal
      :open="pdfPreviewOpen"
      :doc="pdfPreviewDoc"
      :filename="pdfPreviewFilename"
      :title="`${t('Expense')} #${String(bill.number).padStart(5, '0')} ${t('preview')}`"
      @close="pdfPreviewOpen = false"
    />

    <!-- ── Delete confirmation modal (same pattern as BillsIndexPage's bulk delete) ── -->
    <MpModal
      id="bd-delete-modal"
      :is-open="deleteModalOpen"
      size="md"
      is-close-on-esc
      is-close-on-overlay-click
      :is-keep-alive="false"
      @close="deleteModalOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>
          {{ t('Delete') }} {{ t('Expense') }} #{{ String(bill.number).padStart(5, '0') }}?
          <MpModalCloseButton />
        </MpModalHeader>
        <MpModalBody>
          {{ t('Deleted expenses cannot be restored.') }}
        </MpModalBody>
        <MpModalFooter>
          <div class="bd-delete-footer">
            <button class="btn-enterprise btn-enterprise--ghost" @click="deleteModalOpen = false">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmDelete">{{ t('Delete') }}</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>

  <!-- Not found fallback -->
  <div v-else class="bd-not-found">
    <p>{{ t('Expense not found.') }}</p>
    <MpTextlink id="bd-not-found-back" as="a" class="detail-breadcrumb" @click.prevent="goExpenses">{{ t('Back to Expenses') }}</MpTextlink>
  </div>
</template>

<style scoped>
/* ── Page shell — canonical detail pattern ──────────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }

/* ── Jump-to-transaction switcher (title-bar chevron) — mirrors OutgoingOrderDetailsPage ── */
.detail-jump-chevron {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  background: none; border: none; padding: 0; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default, var(--mp-text-secondary));
}
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }
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
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
.search-clear-btn--overlay { position: absolute; right: 18px; top: 50%; transform: translateY(-50%); }
.detail-jump-list { display: flex; flex-direction: column; }
.detail-jump-item {
  display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); width: 100%; text-align: left;
  background: none; border: none; cursor: pointer; padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md);
}
.detail-jump-item:hover { background: var(--mp-background-neutral-subtle); }
.detail-jump-item-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-customer { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.detail-titlerow-right { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-shrink: 0; }
.detail-icon-btn {
  display: flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  padding: var(--mp-spacing-2) !important; border: none !important; background: transparent !important;
  border-radius: var(--mp-radii-md) !important; cursor: pointer; color: var(--mp-text-default);
}
.detail-icon-btn:hover { background: var(--mp-background-neutral-hovered) !important; }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  /* --mp-line-heights-2xl resolves to a unitless 1.67 in this app (not a px value), which
     computes to 40px on a 24px title — taller than intended and reads as a gap above the
     breadcrumb. Hardcode the real 32px instead of trusting the var/fallback. */
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
/* ── Stage wrapper: provides rounded top corners tinted to match the active banner ── */
.detail-stage-wrapper {
  flex: 1; min-height: 0; display: flex; flex-direction: column;
  background: var(--stage-tint, var(--mp-background-stage));
  border-radius: 12px 12px 0 0;
  overflow: hidden;
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: 12px 12px 0 0;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-8);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8);
  container-type: inline-size;
}

/* ── Info banner — full width, no border-radius, sits between header and stage ── */
.detail-info-banner { border-radius: 0 !important; }
.detail-banner-link { color: var(--mp-text-link); cursor: pointer; font-weight: var(--mp-font-weights-semi-bold); }
.detail-banner-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Beneficiary + Total (separated section, inline) ─────────────────────── */
.bd-primary { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-primary-total { display: flex; flex-direction: column; align-items: flex-end; gap: 0; }
.detail-total-amount { font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bd-journal-link { font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); font-weight: var(--mp-font-weights-regular); }

/* ── Meta grid: col 1 = 318px, col 2-4 fill equally, 24px gap ────────────── */
.content-list-grid {
  display: grid;
  grid-template-columns: minmax(0, 318px) repeat(3, minmax(0, 1fr));
  gap: 0 var(--mp-spacing-6);
}
.content-list-col { display: flex; flex-direction: column; }
.bd-meta { padding-top: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }

/* ── Line items — canonical detail-page table pattern ────────────────────── */
.detail-items-section { display: flex; flex-direction: column; }
.detail-items, .detail-payment { width: 100%; border-collapse: collapse; }
.detail-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.detail-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.detail-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
}
.detail-td--num { text-align: right; white-space: nowrap; padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4); }
.detail-td--muted { color: var(--mp-text-secondary); text-align: center; }
.detail-items-body { border-bottom: 1px solid var(--mp-border-default); }
.detail-items-count {
  padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px);
  font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary);
}

/* ── Notes + totals ───────────────────────────────────────────────────────── */
/* Matches NewExpensePage's .ex-notes rule: flush-left Memo/Attachment and flush-right
   Totals, each capped at a fixed reference width (measured at 1440px, scaled via cqw so
   they shrink proportionally on a narrower panel instead of stretching to fill grid
   columns). Stacked below the container breakpoint — Totals on top, Memo/Attachment
   below (order flip only, tab order unchanged). */
.detail-notes { display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
.detail-notes-left { display: flex; flex-direction: column; gap: var(--mp-spacing-6); flex-shrink: 0; order: 2; }
.detail-memo-section { width: min(432px, 32.7cqw); }
.detail-attachment-section { width: 318px; }
.detail-note-text {
  margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px);
  color: var(--mp-text-default); white-space: pre-line;
}
.detail-attach-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.detail-attach { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); cursor: pointer; width: fit-content; }
.detail-attach-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.detail-attach-meta { display: flex; flex-direction: column; }
.detail-attach-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.detail-attach:hover .detail-attach-name { text-decoration: underline; text-underline-offset: 2px; }
.detail-attach-size { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.detail-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-4); width: min(428px, 32.4cqw); flex-shrink: 0; padding-top: var(--mp-spacing-2); order: 1; }
@container (min-width: 650px) {
  .detail-notes { flex-direction: row; justify-content: space-between; align-items: flex-start; }
  .detail-notes-left { order: 1; }
  .detail-totals { order: 2; }
}
.detail-total-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-total-row-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.detail-total-row-amt { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.detail-total-row-label--total, .detail-total-row-amt--total {
  font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.detail-total-note {
  margin: calc(var(--mp-spacing-1) * -1) 0 0; font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}
.detail-total-rule { border-top: 1px solid var(--mp-border-default); }
.detail-total-rule--dashed { border-top-style: dashed; }

/* ── Payment tab — same spacing/style as SalesOrderDetailsPage's tab pattern ── */
.detail-tabs { margin-top: 0; }
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }
.detail-tab-heading {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

/* ── Footer ───────────────────────────────────────────────────────────────── */
.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage);
}

.detail-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer;
  border: 1px solid transparent;
  white-space: nowrap;
}
.detail-btn--secondary {
  background: var(--mp-background-neutral);
  border-color: var(--mp-border-bold);
  color: var(--mp-text-secondary);
}
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.detail-btn--primary {
  background: var(--mp-colors-emerald-700, #029861);
  border-color: var(--mp-colors-emerald-700, #029861);
  color: var(--mp-text-inverse);
}
.detail-btn--primary:hover {
  background: var(--mp-colors-emerald-800, #186f4a);
  border-color: var(--mp-colors-emerald-800, #186f4a);
}

.detail-actions-delete-tt-wrap { display: block; width: 100%; }
.detail-actions-delete-tt-wrap :deep(button[disabled]) { pointer-events: none; }

/* ── Delete confirmation modal footer ── */
.bd-delete-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

/* Clickable payment Number → payment (Spend money) detail. Plain span styled as a
   link (project rule: not MpTextlink, to keep table cells aligned). */
.detail-payment-number { color: var(--mp-text-link); cursor: pointer; }
.detail-payment-number:hover { text-decoration: underline; text-underline-offset: 2px; }

.bd-not-found { padding: var(--mp-spacing-6); }
</style>
