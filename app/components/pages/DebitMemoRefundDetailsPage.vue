<script setup lang="ts">
/**
 * Debit memo refund detail (Purchase › Purchase invoices › Debit memo refund › :id).
 * AP-side mirror of CreditMemoRefundDetailsPage.vue.
 * Key difference: "Deposit to" instead of "Pay from".
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
  debitMemoRefunds, getRefund, getDebitMemo, refundTotal, refundLabel, memoLabel,
  cashAccountLabel, vendorNameOf, deleteRefund, refundJournal,
} from '~/data/debitMemos'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const refund = computed(() => getRefund(props.orderId))
const total = computed(() => (refund.value ? refundTotal(refund.value) : 0))
const firstMemoId = computed(() => refund.value?.lines[0]?.debitMemoId)

function formatDateLong(iso: string) { return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)) }
function formatUpdatedAt(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date}, ${time}`
}

function goMemo() { if (firstMemoId.value) router.push(`/debit-memos/${firstMemoId.value}`) }
function memoNumberLabel(id: string) { const m = getDebitMemo(id); return m ? memoLabel(m.number) : id }

const jumpItems = computed<JumpItem[]>(() =>
  [...debitMemoRefunds]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((r) => ({ id: r.id, primary: refundLabel(r.number), secondary: vendorNameOf(r.vendorId) })),
)
function jumpTo(id: string) { router.push(`/debit-memo-refunds/${id}`) }

const journalOpen = ref(false)
const journalRows = computed<JournalEntryRow[]>(() => (refund.value ? refundJournal(refund.value).map((r) => ({ account: r.account, debit: r.debit, credit: r.credit })) : []))
const activityOpen = ref(false)

function edit() { router.push(`/debit-memo-refunds/${props.orderId}/edit`) }
const deleteOpen = ref(false)
function confirmDelete() {
  deleteRefund(props.orderId)
  deleteOpen.value = false
  successToast(t('Debit memo refund deleted'))
  if (firstMemoId.value) router.push(`/debit-memos/${firstMemoId.value}`)
  else router.push('/purchase-invoices')
}
</script>

<template>
  <div v-if="refund" class="cm-page">
    <header class="cm-bar">
      <div class="cm-bar-left">
        <nav class="cm-breadcrumb-trail">
          <MpTextlink v-if="firstMemoId" id="dmr-bc-memo" as="a" class="cm-breadcrumb" @click.prevent="goMemo">{{ memoNumberLabel(firstMemoId) }}</MpTextlink>
          <span v-else class="cm-breadcrumb cm-breadcrumb--static">{{ t('Debit memo') }}</span>
        </nav>
        <div class="cm-titlerow-left">
          <h1 class="cm-title">{{ refundLabel(refund.number) }}</h1>
          <DetailJumpTo id="dmr-jump" :items="jumpItems" :aria-label="t('Switch transaction')" :placeholder="t('Search...')" :empty-text="t('No transactions found')" @select="jumpTo" />
        </div>
      </div>
    </header>

    <div class="cm-stage-wrapper">
    <div class="cm-stage">
      <section class="cm-summary">
        <div class="cm-primary">
          <ContentList :label="t('Vendor')" :value="vendorNameOf(refund.vendorId)" />
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
          <div class="cm-col"><ContentList :label="t('Deposit to')" :value="cashAccountLabel(refund.depositToAccountId)" /></div>
          <div class="cm-col"><ContentList :label="t('Transaction date')" :value="formatDateLong(refund.date)" /></div>
          <div class="cm-col"><ContentList :label="t('Transaction no.')" :value="refundLabel(refund.number)" /></div>
        </div>
      </section>

      <section class="cm-items-section">
        <table class="cm-items">
          <thead>
            <tr>
              <th class="cm-th">{{ t('Debit memo') }}</th>
              <th class="cm-th">{{ t('Reason') }}</th>
              <th class="cm-th cm-th--num">{{ t('Debit refunded') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(l, i) in refund.lines" :key="i">
              <td class="cm-td"><a class="cm-link" @click="router.push(`/debit-memos/${l.debitMemoId}`)">{{ memoNumberLabel(l.debitMemoId) }}</a></td>
              <td class="cm-td cm-td--muted">{{ l.reason || '—' }}</td>
              <td class="cm-td cm-td--num">{{ formatIDR(l.amount) }}</td>
            </tr>
          </tbody>
        </table>
        <div class="cm-items-count">{{ t('Showing') }} {{ refund.lines.length }} {{ t('of') }} {{ refund.lines.length }} {{ t('debit memos') }}</div>
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
      <PrintShareMenu id="dmrd-print" />

      <MpPopover id="dmrd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
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
      :title="`${t('Delete debit memo refund')}?`"
      :description="t('Deleting this returns the refunded debit to the debit memo. This cannot be undone.')"
      :confirm-label="t('Delete debit memo refund')"
      @confirm="confirmDelete"
    />
  </div>

  <div v-else class="cm-notfound">
    <p class="cm-notfound-title">{{ t('Debit memo refund not found') }}</p>
    <p class="cm-notfound-desc">{{ t('This record may have been deleted or the link is invalid.') }}</p>
    <MpButton variant="secondary" is-rounded @click="router.push('/purchase-invoices')">{{ t('Back to purchase invoices') }}</MpButton>
  </div>
</template>
