<script setup lang="ts">
/**
 * Credit memo refund detail (Sales › Sales invoices › Credit memo refund › :id).
 *
 * Figma: "Credit Memo Refund / Details" (+ Options). One refund = paying 1..n of
 * a customer's credit memos back in cash from a bank/cash account. Read-only
 * detail with the refunded-memos table and Edit/Delete; deleting returns the
 * credit to the memo(s).
 */
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
  creditMemoRefunds, getRefund, getCreditMemo, refundTotal, refundLabel, memoLabel,
  cashAccountLabel, customerNameOf, deleteRefund, refundJournal,
} from '~/data/creditMemos'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const refund = computed(() => getRefund(props.orderId))
const total = computed(() => (refund.value ? refundTotal(refund.value) : 0))
const firstMemoId = computed(() => refund.value?.lines[0]?.creditMemoId)

function formatDateLong(iso: string) { return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)) }
function formatUpdatedAt(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date}, ${time}`
}

function goMemo() { if (firstMemoId.value) router.push(`/credit-memos/${firstMemoId.value}`) }
function memoNumberLabel(id: string) { const m = getCreditMemo(id); return m ? memoLabel(m.number) : id }

const jumpItems = computed<JumpItem[]>(() =>
  [...creditMemoRefunds]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => ({ id: r.id, primary: refundLabel(r.number), secondary: customerNameOf(r.customerId) })),
)
function jumpTo(id: string) { router.push(`/credit-memo-refunds/${id}`) }

const journalOpen = ref(false)
const journalRows = computed<JournalEntryRow[]>(() => (refund.value ? refundJournal(refund.value).map((r) => ({ account: r.account, debit: r.debit, credit: r.credit })) : []))
const activityOpen = ref(false)

function edit() { router.push(`/credit-memo-refunds/${props.orderId}/edit`) }
const deleteOpen = ref(false)
function confirmDelete() {
  deleteRefund(props.orderId)
  deleteOpen.value = false
  successToast(t('Credit memo refund deleted'))
  if (firstMemoId.value) router.push(`/credit-memos/${firstMemoId.value}`)
  else router.push('/sales-invoices')
}
</script>

<template>
  <div v-if="refund" class="cm-page">
    <header class="cm-bar">
      <div class="cm-bar-left">
        <nav class="cm-breadcrumb-trail">
          <MpTextlink v-if="firstMemoId" id="cmr-bc-memo" as="a" class="cm-breadcrumb" @click.prevent="goMemo">{{ memoNumberLabel(firstMemoId) }}</MpTextlink>
          <span v-else class="cm-breadcrumb cm-breadcrumb--static">{{ t('Credit memo') }}</span>
        </nav>
        <div class="cm-titlerow-left">
          <h1 class="cm-title">{{ refundLabel(refund.number) }}</h1>
          <DetailJumpTo id="cmr-jump" :items="jumpItems" :aria-label="t('Switch transaction')" :placeholder="t('Search...')" :empty-text="t('No transactions found')" @select="jumpTo" />
        </div>
      </div>
    </header>

    <div class="cm-stage-wrapper">
    <div class="cm-stage">
      <section class="cm-summary">
        <div class="cm-primary">
          <ContentList :label="t('Customer')" :value="customerNameOf(refund.customerId)" />
          <div class="cm-primary-right">
            <div class="cm-primary-figure">
              <span class="cm-figure-label">{{ t('Total') }}</span>
              <span class="cm-figure-amount">{{ formatIDR(total) }}</span>
            </div>
            <a class="cm-journal-link" @click.prevent="journalOpen = true">{{ t('View journal entry') }}</a>
          </div>
        </div>
        <div class="cm-divider" />
        <div class="content-list-grid--cm">
          <div class="cm-col"><ContentList :label="t('Pay from')" :value="cashAccountLabel(refund.payFromAccountId)" /></div>
          <div class="cm-col"><ContentList :label="t('Transaction date')" :value="formatDateLong(refund.date)" /></div>
          <div class="cm-col"><ContentList :label="t('Transaction no.')" :value="refundLabel(refund.number)" /></div>
        </div>
      </section>

      <section class="cm-items-section">
        <table class="cm-items">
          <thead>
            <tr>
              <th class="cm-th">{{ t('Credit memo') }}</th>
              <th class="cm-th">{{ t('Reason') }}</th>
              <th class="cm-th cm-th--num">{{ t('Credit refunded') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(l, i) in refund.lines" :key="i">
              <td class="cm-td"><a class="cm-link" @click="router.push(`/credit-memos/${l.creditMemoId}`)">{{ memoNumberLabel(l.creditMemoId) }}</a></td>
              <td class="cm-td cm-td--muted">{{ l.reason || '—' }}</td>
              <td class="cm-td cm-td--num">{{ formatIDR(l.amount) }}</td>
            </tr>
          </tbody>
        </table>
        <div class="cm-items-count">{{ t('Showing') }} {{ refund.lines.length }} {{ t('of') }} {{ refund.lines.length }} {{ t('credit memos') }}</div>
      </section>

      <section class="cm-notes">
        <div class="cm-notes-left">
          <ContentList :label="t('Memo')"><p class="cm-note-text">{{ refund.memo || '—' }}</p></ContentList>
        </div>
        <div class="cm-totals">
          <div class="cm-total-row">
            <span class="cm-total-label cm-total-label--strong">{{ t('Total') }}</span>
            <span class="cm-total-amt cm-total-amt--strong">{{ formatIDR(total) }}</span>
          </div>
        </div>
      </section>

      <a class="cm-updated" @click.prevent="activityOpen = true">{{ t('Last updated by') }} {{ refund.updatedBy }} {{ t('on') }} {{ formatUpdatedAt(refund.updatedAt) }} (GMT+7)</a>
    </div>

    <footer class="cm-footer">
      <PrintShareMenu id="cmrd-print" />

      <MpPopover id="cmrd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
        <MpPopoverTrigger>
          <MpButton variant="primary" is-rounded right-icon="chevrons-down">{{ t('Actions') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="edit">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem @click="deleteOpen = true">{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </footer>
    </div>

    <JournalEntryDrawer v-model:is-open="journalOpen" :heading="refundLabel(refund.number)" :rows="journalRows" />
    <ActivityLogModal :is-open="activityOpen" :subject="refundLabel(refund.number)" :updated-by="refund.updatedBy" :updated-at="refund.updatedAt" :entries="refund.history" @close="activityOpen = false" />
    <ConfirmModal
      v-model:is-open="deleteOpen"
      :title="`${t('Delete credit memo refund')}?`"
      :description="t('Deleting this returns the refunded credit to the credit memo. This cannot be undone.')"
      :confirm-label="t('Delete credit memo refund')"
      @confirm="confirmDelete"
    />
  </div>

  <div v-else class="cm-notfound">
    <p class="cm-notfound-title">{{ t('Credit memo refund not found') }}</p>
    <p class="cm-notfound-desc">{{ t('This record may have been deleted or the link is invalid.') }}</p>
    <MpButton variant="secondary" is-rounded @click="router.push('/sales-invoices')">{{ t('Back to sales invoices') }}</MpButton>
  </div>
</template>
