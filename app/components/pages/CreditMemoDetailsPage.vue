<script setup lang="ts">
/**
 * Credit memo detail (Sales › Sales invoices › Credit memo › :id).
 *
 * Figma: "Credit Memo / Details" (+ Options). Shows one credit memo, its running
 * balance (Available credit = remaining), the credit account lines, and — once it
 * has been spent — the Credit applications and/or Credit refund it produced.
 * Every reachable state is designed: active · partially used · used up ·
 * not-found. Actions (Apply credit memo / Create credit memo refund / Edit /
 * Delete) are gated by what the record allows (delete is blocked while the memo
 * is in use — rule/btn-danger-confirm + an inline-reason modal).
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpButton, MpTextlink, MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, css,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import PrintShareMenu from '~/components/patterns/PrintShareMenu.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import DetailJumpTo, { type JumpItem } from '~/components/patterns/DetailJumpTo.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ActivityLogModal from '~/components/patterns/ActivityLogModal.vue'
import JournalEntryDrawer, { type JournalEntryRow } from '~/components/patterns/JournalEntryDrawer.vue'
import { successToast } from '~/utils/toasts'
import { formatIDR } from '~/utils/currency'
import { getContactIdByName } from '~/data/contacts'
import {
  creditMemos, getCreditMemo, memoTotal, memoRemaining, memoUsed, memoStatus, MEMO_STATUS_LABEL,
  cmAccountLabel, customerNameOf, memoLabel, applicationLabel, refundLabel,
  applicationsForMemo, refundsForMemo, applicationTotal, invoiceLabel, invoiceById,
  canDeleteCreditMemo, deleteCreditMemo, memoJournal,
} from '~/data/creditMemos'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const memo = computed(() => getCreditMemo(props.orderId))
const total = computed(() => (memo.value ? memoTotal(memo.value) : 0))
const remaining = computed(() => memoRemaining(props.orderId))
const used = computed(() => memoUsed(props.orderId))
const status = computed(() => memoStatus(props.orderId))
const applications = computed(() => applicationsForMemo(props.orderId))
const refunds = computed(() => refundsForMemo(props.orderId))
const hasApplications = computed(() => applications.value.length > 0)
const hasRefunds = computed(() => refunds.value.length > 0)
const hasLinkedTabs = computed(() => hasApplications.value || hasRefunds.value)

function customerContactId(): string | undefined {
  return memo.value ? getContactIdByName(customerNameOf(memo.value.customerId)) : undefined
}
function goCustomer() {
  const id = customerContactId()
  router.push(id ? `/customers/${id}` : '/customers')
}
function goCustomers() { router.push('/customers') }

// ── Formatters ─────────────────────────────────────────────────────────────────
function formatDateLong(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}
function formatDateNumeric(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}
function formatUpdatedAt(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date}, ${time}`
}

// ── Jump to another credit memo ──────────────────────────────────────────────────
const jumpItems = computed<JumpItem[]>(() =>
  [...creditMemos]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((m) => ({ id: m.id, primary: memoLabel(m.number), secondary: customerNameOf(m.customerId) })),
)
function jumpTo(id: string) { router.push(`/credit-memos/${id}`) }

// ── Journal + activity ───────────────────────────────────────────────────────────
const journalOpen = ref(false)
const journalRows = computed<JournalEntryRow[]>(() => (memo.value ? memoJournal(memo.value).map((r) => ({ account: r.account, debit: r.debit, credit: r.credit })) : []))
const activityOpen = ref(false)

// ── Actions ──────────────────────────────────────────────────────────────────────
function applyCredit() { router.push(`/credit-memos/${props.orderId}/apply`) }
function createRefund() { router.push(`/credit-memos/${props.orderId}/refund`) }
function edit() { router.push(`/credit-memos/${props.orderId}/edit`) }

const deleteGuard = computed(() => canDeleteCreditMemo(props.orderId))
const deleteOpen = ref(false)
const blockedOpen = ref(false)
function askDelete() {
  if (deleteGuard.value.ok) deleteOpen.value = true
  else blockedOpen.value = true
}
function confirmDelete() {
  deleteCreditMemo(props.orderId)
  deleteOpen.value = false
  successToast(t('Credit memo deleted'))
  goCustomers()
}
</script>

<template>
  <div v-if="memo" class="cm-page">
    <!-- ── Title bar ── -->
    <header class="cm-bar">
      <div class="cm-bar-left">
        <nav class="cm-breadcrumb-trail">
          <MpTextlink id="cmd-bc-customers" as="a" class="cm-breadcrumb" @click.prevent="goCustomers">{{ t('Customers') }}</MpTextlink>
          <span class="cm-breadcrumb-sep">/</span>
          <MpTextlink id="cmd-bc-customer" as="a" class="cm-breadcrumb" @click.prevent="goCustomer">{{ customerNameOf(memo.customerId) }}</MpTextlink>
        </nav>
        <div class="cm-titlerow-left">
          <h1 class="cm-title">{{ memoLabel(memo.number) }}</h1>
          <ErpStatusBadge :status="status" badge-for="additionalInformation" size="md" />
          <DetailJumpTo id="cmd-jump" :items="jumpItems" :aria-label="t('Switch credit memo')" :placeholder="t('Search...')" :empty-text="t('No credit memos found')" data-devchange="cm-detail-jump" @select="jumpTo" />
        </div>
      </div>
    </header>

    <div class="cm-stage-wrapper">
    <div class="cm-stage">
      <!-- Summary: Customer + Available credit + journal link -->
      <section class="cm-summary">
        <div class="cm-primary">
          <ContentList :label="t('Customer')"><a class="detail-value-link" @click="window.open(`/customers/${getContactIdByName(customerNameOf(memo.customerId))}`, '_blank')">{{ customerNameOf(memo.customerId) }}</a></ContentList>
          <div class="cm-primary-right">
            <div class="cm-primary-figure">
              <span class="cm-figure-label">{{ t('Available credit') }}</span>
              <span class="cm-figure-amount">{{ formatIDR(remaining) }}</span>
            </div>
            <a class="cm-journal-link" data-devchange="cm-detail-journal" @click.prevent="journalOpen = true">{{ t('View journal entry') }}</a>
          </div>
        </div>
        <div class="cm-divider" />
        <div class="content-list-grid--cm">
          <div class="cm-col"><ContentList :label="t('Transaction date')" :value="formatDateLong(memo.date)" /></div>
          <div class="cm-col"><ContentList :label="t('Transaction no.')" :value="memoLabel(memo.number)" /></div>
          <div class="cm-col">
            <ContentList :label="t('Tags')">
              <ErpTagList v-if="memo.tags?.length" :tags="memo.tags" />
              <template v-else>—</template>
            </ContentList>
          </div>
        </div>
      </section>

      <!-- Credit account lines -->
      <section class="cm-items-section">
        <table class="cm-items">
          <thead>
            <tr>
              <th class="cm-th">{{ t('Credit account') }}</th>
              <th class="cm-th">{{ t('Reason') }}</th>
              <th class="cm-th cm-th--num">{{ t('Amount') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="l in memo.lines" :key="l.id">
              <td class="cm-td">{{ cmAccountLabel(l.accountCode) }}</td>
              <td class="cm-td cm-td--muted">{{ l.reason || '—' }}</td>
              <td class="cm-td cm-td--num">{{ formatIDR(l.amount) }}</td>
            </tr>
          </tbody>
        </table>
        <div class="cm-items-count">{{ t('Showing') }} {{ memo.lines.length }} {{ t('of') }} {{ memo.lines.length }} {{ t('lines') }}</div>
      </section>

      <!-- Memo + totals -->
      <section class="cm-notes">
        <div class="cm-notes-left">
          <ContentList :label="t('Memo')"><p class="cm-note-text">{{ memo.memo || '—' }}</p></ContentList>
          <ContentList v-if="memo.attachments.length" :label="`${t('Attachment')} (${memo.attachments.length})`">
            <a v-for="(a, i) in memo.attachments" :key="i" class="cm-link">{{ a.name }}</a>
          </ContentList>
        </div>
        <div class="cm-totals">
          <div class="cm-total-row">
            <span class="cm-total-label cm-total-label--strong">{{ t('Total credit') }}</span>
            <span class="cm-total-amt cm-total-amt--strong">{{ formatIDR(total) }}</span>
          </div>
          <div v-if="used > 0" class="cm-total-row">
            <span class="cm-total-label">{{ t('Used credit') }}</span>
            <span class="cm-total-amt">({{ formatIDR(used) }})</span>
          </div>
          <div class="cm-total-rule" />
          <div class="cm-total-row">
            <span class="cm-total-label cm-total-label--strong">{{ t('Remaining credit') }}</span>
            <span class="cm-total-amt cm-total-amt--strong">{{ formatIDR(remaining) }}</span>
          </div>
        </div>
      </section>

      <!-- Last updated → activity log -->
      <a class="cm-updated" data-devchange="cm-detail-activity" @click.prevent="activityOpen = true">{{ t('Last updated by') }} {{ memo.updatedBy }} {{ t('on') }} {{ formatUpdatedAt(memo.updatedAt) }} (GMT+7)</a>

      <!-- Linked transactions — tabs -->
      <MpTabs v-if="hasLinkedTabs" :key="memo.id" id="cm-detail-tabs" :default-value="0" variant-color="green" class="cm-detail-tabs">
        <MpTabList>
          <MpTab v-if="hasApplications" id="cm-tab-applied" value="applied">{{ t('Credit applications') }}</MpTab>
          <MpTab v-if="hasRefunds" id="cm-tab-refunds" value="refunds">{{ t('Credit refund') }}</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel v-if="hasApplications" value="applied">
            <h3 class="cm-tab-heading">{{ t('Transactions') }}</h3>
            <table class="cm-items cm-linked">
              <colgroup>
                <col class="cm-linked-col--date" />
                <col class="cm-linked-col--number" />
                <col />
                <col class="cm-linked-col--amount" />
              </colgroup>
              <thead>
                <tr>
                  <th class="cm-th">{{ t('Date') }}</th>
                  <th class="cm-th">{{ t('Number') }}</th>
                  <th class="cm-th">{{ t('Invoice') }}</th>
                  <th class="cm-th cm-th--num">{{ t('Credit applied') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="a in applications" :key="a.id">
                  <td class="cm-td">{{ formatDateNumeric(a.date) }}</td>
                  <td class="cm-td"><a class="cm-link" @click="router.push(`/credit-memo-applications/${a.id}`)">{{ applicationLabel(a.number) }}</a></td>
                  <td class="cm-td">
                    <template v-for="(al, i) in a.allocations" :key="i">
                      <a class="cm-link" @click="router.push(`/sales-invoices/${al.invoiceId}`)">{{ invoiceLabel(invoiceById(al.invoiceId)?.number ?? 0) }}</a><span v-if="i < a.allocations.length - 1">, </span>
                    </template>
                  </td>
                  <td class="cm-td cm-td--num">{{ formatIDR(applicationTotal(a)) }}</td>
                </tr>
              </tbody>
            </table>
          </MpTabPanel>
          <MpTabPanel v-if="hasRefunds" value="refunds">
            <h3 class="cm-tab-heading">{{ t('Transactions') }}</h3>
            <table class="cm-items cm-linked">
              <colgroup>
                <col class="cm-linked-col--date" />
                <col class="cm-linked-col--number" />
                <col />
                <col class="cm-linked-col--amount" />
              </colgroup>
              <thead>
                <tr>
                  <th class="cm-th">{{ t('Date') }}</th>
                  <th class="cm-th">{{ t('Number') }}</th>
                  <th class="cm-th" aria-hidden="true"></th>
                  <th class="cm-th cm-th--num">{{ t('Credit refunded') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in refunds" :key="r.id">
                  <td class="cm-td">{{ formatDateNumeric(r.date) }}</td>
                  <td class="cm-td"><a class="cm-link" @click="router.push(`/credit-memo-refunds/${r.id}`)">{{ refundLabel(r.number) }}</a></td>
                  <td class="cm-td"></td>
                  <td class="cm-td cm-td--num">{{ formatIDR(r.lines.filter(l => l.creditMemoId === memo!.id).reduce((s, l) => s + l.amount, 0)) }}</td>
                </tr>
              </tbody>
            </table>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>
    </div>

    <!-- ── Footer ── -->
    <footer class="cm-footer">
      <PrintShareMenu id="cmd-print" />

      <MpPopover id="cmd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
        <MpPopoverTrigger>
          <MpButton variant="primary" is-rounded right-icon="chevrons-down" data-devchange="cm-detail-actions">{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem>{{ t('Preview') }}</MpPopoverListItem>
            <MpPopoverListItem v-if="remaining > 0" @click="applyCredit">{{ t('Apply credit memo') }}</MpPopoverListItem>
            <MpPopoverListItem v-if="remaining > 0" @click="createRefund">{{ t('Create credit memo refund') }}</MpPopoverListItem>
          </MpPopoverList>
          <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
          <MpPopoverList>
            <MpPopoverListItem @click="edit">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem @click="askDelete">{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </footer>
    </div>

    <!-- ── Modals / drawers ── -->
    <JournalEntryDrawer v-model:is-open="journalOpen" :heading="memoLabel(memo.number)" :rows="journalRows" />
    <ActivityLogModal
      :is-open="activityOpen" :subject="memoLabel(memo.number)"
      :updated-by="memo.updatedBy" :updated-at="memo.updatedAt" :entries="memo.history"
      @close="activityOpen = false"
    />
    <ConfirmModal
      v-model:is-open="deleteOpen"
      :title="`${t('Delete credit memo')}?`"
      :description="t('Deleted credit memo cannot be restored.')"
      :confirm-label="t('Delete credit memo')"
      @confirm="confirmDelete"
    />

    <!-- Delete blocked — explains why instead of a disabled menu item -->
    <MpModal id="cmd-blocked" :is-open="blockedOpen" size="md" :is-centered="false" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="blockedOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Credit memo cannot be deleted') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          {{ t('This credit memo is still in use. Delete its credit applications and refunds first, then try again.') }}
          <ul class="cm-blocked-list">
            <li v-if="deleteGuard.applications">{{ deleteGuard.applications }} {{ t('credit memo applied') }}</li>
            <li v-if="deleteGuard.refunds">{{ deleteGuard.refunds }} {{ t('credit memo refund') }}</li>
          </ul>
        </MpModalBody>
        <MpModalFooter>
          <MpButton variant="ghost" is-rounded @click="blockedOpen = false">{{ t('Close') }}</MpButton>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>

  <!-- Not found / no access -->
  <div v-else class="cm-notfound">
    <p class="cm-notfound-title">{{ t('Credit memo not found') }}</p>
    <p class="cm-notfound-desc">{{ t('This credit memo may have been deleted or the link is invalid.') }}</p>
    <MpButton variant="secondary" is-rounded @click="goCustomers">{{ t('Back to customers') }}</MpButton>
  </div>
</template>

<style scoped>
.cm-blocked-list { margin: var(--mp-spacing-2) 0 0; padding-left: var(--mp-spacing-5); }
.cm-blocked-list li { list-style: disc outside; display: list-item; color: var(--mp-text-default); }

/* ── Linked-transactions tabs ── */
.cm-detail-tabs { margin-top: 0; }
.cm-detail-tabs :deep(.mp-tab--isSelected_true),
.cm-detail-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.cm-detail-tabs :deep(.mp-tab-selected-border--isSelected_true) { background-color: var(--mp-border-selected, #029861) !important; }
.cm-detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }
.cm-tab-heading { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cm-linked { table-layout: fixed; }
.cm-linked-col--date   { width: 160px; }
.cm-linked-col--number { width: 260px; }
.cm-linked-col--amount { width: 200px; }
</style>
