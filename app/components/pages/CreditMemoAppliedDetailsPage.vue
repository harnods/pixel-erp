<script setup lang="ts">
/**
 * Credit memo applied detail (Sales › Sales invoices › Credit memo applied › :id).
 *
 * Figma: "Credit Memo Applied / Details" (+ Options). One application = spending
 * ONE credit memo across one or more of the customer's invoices. Read-only detail
 * with the allocation table, the running "Total credit applied", and Edit/Delete
 * actions. Deleting restores the invoices' balances (handled in the data layer).
 */
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  MpButton, MpIcon, MpTextlink, css,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import DetailJumpTo, { type JumpItem } from '~/components/patterns/DetailJumpTo.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import ActivityLogModal from '~/components/patterns/ActivityLogModal.vue'
import JournalEntryDrawer, { type JournalEntryRow } from '~/components/patterns/JournalEntryDrawer.vue'
import { successToast } from '~/utils/toasts'
import { formatIDR } from '~/utils/currency'
import {
  creditMemoApplications, getApplication, getCreditMemo, applicationTotal, applicationLabel, memoLabel,
  invoiceLabel, invoiceById, customerNameOf, deleteApplication, applicationJournal,
} from '~/data/creditMemos'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const app = computed(() => getApplication(props.orderId))
const memo = computed(() => (app.value ? getCreditMemo(app.value.creditMemoId) : undefined))
const total = computed(() => (app.value ? applicationTotal(app.value) : 0))
const firstInvoiceId = computed(() => app.value?.allocations[0]?.invoiceId)

function formatDateLong(iso: string) { return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)) }
function formatDateNumeric(iso: string) { return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso)) }
function formatUpdatedAt(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date}, ${time}`
}

function goInvoices() { router.push('/sales-invoices') }
function goFirstInvoice() { if (firstInvoiceId.value) router.push(`/sales-invoices/${firstInvoiceId.value}`) }
function goMemo() { if (app.value) router.push(`/credit-memos/${app.value.creditMemoId}`) }

// Jump between applications
const jumpItems = computed<JumpItem[]>(() =>
  [...creditMemoApplications]
    .sort((a, b) => b.date.localeCompare(a.date))
    .map((a) => ({ id: a.id, primary: applicationLabel(a.number), secondary: customerNameOf(a.customerId) })),
)
function jumpTo(id: string) { router.push(`/credit-memo-applications/${id}`) }

const journalOpen = ref(false)
const journalRows = computed<JournalEntryRow[]>(() => (app.value ? applicationJournal(app.value).map((r) => ({ account: r.account, debit: r.debit, credit: r.credit })) : []))
const activityOpen = ref(false)

function edit() { router.push(`/credit-memo-applications/${props.orderId}/edit`) }
const deleteOpen = ref(false)
function confirmDelete() {
  deleteApplication(props.orderId)
  deleteOpen.value = false
  successToast(t('Credit memo applied deleted'))
  if (firstInvoiceId.value) router.push(`/sales-invoices/${firstInvoiceId.value}`)
  else goInvoices()
}
</script>

<template>
  <div v-if="app" class="cm-page">
    <header class="cm-bar">
      <div class="cm-bar-left">
        <nav class="cm-breadcrumb-trail">
          <MpTextlink id="cma-bc-invoices" as="a" class="cm-breadcrumb" @click.prevent="goInvoices">{{ t('Sales invoices') }}</MpTextlink>
          <span v-if="firstInvoiceId" class="cm-breadcrumb-sep">/</span>
          <MpTextlink v-if="firstInvoiceId" id="cma-bc-invoice" as="a" class="cm-breadcrumb" @click.prevent="goFirstInvoice">{{ invoiceLabel(invoiceById(firstInvoiceId)?.number ?? 0) }}</MpTextlink>
        </nav>
        <div class="cm-titlerow-left">
          <h1 class="cm-title">{{ applicationLabel(app.number) }}</h1>
          <DetailJumpTo id="cma-jump" :items="jumpItems" :aria-label="t('Switch transaction')" :placeholder="t('Search...')" :empty-text="t('No transactions found')" @select="jumpTo" />
        </div>
      </div>
    </header>

    <div class="cm-stage-wrapper">
    <div class="cm-stage">
      <section class="cm-summary">
        <div class="cm-primary">
          <div class="content-list-grid--cm cm-primary-grid">
            <div class="cm-col"><ContentList :label="t('Customer')" :value="customerNameOf(app.customerId)" /></div>
            <div class="cm-col">
              <ContentList :label="t('Credit memo')">
                <a class="cm-link" @click="goMemo">{{ memo ? memoLabel(memo.number) : '—' }}</a>
              </ContentList>
            </div>
          </div>
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
          <div class="cm-col"><ContentList :label="t('Transaction date')" :value="formatDateLong(app.date)" /></div>
          <div class="cm-col"><ContentList :label="t('Transaction no.')" :value="applicationLabel(app.number)" /></div>
        </div>
      </section>

      <section class="cm-items-section">
        <table class="cm-items">
          <thead>
            <tr>
              <th class="cm-th">{{ t('Date') }}</th>
              <th class="cm-th">{{ t('Number') }}</th>
              <th class="cm-th cm-th--num">{{ t('Total') }}</th>
              <th class="cm-th cm-th--num">{{ t('Credit applied') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(al, i) in app.allocations" :key="i">
              <td class="cm-td">{{ formatDateNumeric(invoiceById(al.invoiceId)?.date ?? app.date) }}</td>
              <td class="cm-td"><a class="cm-link" @click="router.push(`/sales-invoices/${al.invoiceId}`)">{{ invoiceLabel(invoiceById(al.invoiceId)?.number ?? 0) }}</a></td>
              <td class="cm-td cm-td--num">{{ formatIDR(invoiceById(al.invoiceId)?.total ?? 0) }}</td>
              <td class="cm-td cm-td--num">{{ formatIDR(al.amount) }}</td>
            </tr>
          </tbody>
        </table>
        <div class="cm-items-count">{{ t('Showing') }} {{ app.allocations.length }} {{ t('of') }} {{ app.allocations.length }} {{ t('transactions') }}</div>
      </section>

      <section class="cm-notes">
        <div class="cm-notes-left">
          <ContentList :label="t('Memo')"><p class="cm-note-text">{{ app.memo || '—' }}</p></ContentList>
        </div>
        <div class="cm-totals">
          <div class="cm-total-row">
            <span class="cm-total-label cm-total-label--strong">{{ t('Total credit applied') }}</span>
            <span class="cm-total-amt cm-total-amt--strong">{{ formatIDR(total) }}</span>
          </div>
        </div>
      </section>

      <a class="cm-updated" @click.prevent="activityOpen = true">{{ t('Last updated by') }} {{ app.updatedBy }} {{ t('on') }} {{ formatUpdatedAt(app.updatedAt) }} (GMT+7)</a>
    </div>

    <footer class="cm-footer">
      <MpPopover id="cma-print" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
        <MpPopoverTrigger>
          <MpButton variant="secondary" is-rounded left-icon="chevrons-down">{{ t('Print & share') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem>{{ t('Print PDF') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Print dot matrix') }}</MpPopoverListItem>
          </MpPopoverList>
          <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
          <MpPopoverList>
            <MpPopoverListItem>{{ t('Share via WhatsApp') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Share via email') }}</MpPopoverListItem>
            <MpPopoverListItem>{{ t('Copy link') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>

      <MpPopover id="cma-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
        <MpPopoverTrigger>
          <MpButton variant="primary" is-rounded left-icon="chevrons-down">{{ t('Actions') }}</MpButton>
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

    <JournalEntryDrawer v-model:is-open="journalOpen" :heading="applicationLabel(app.number)" :rows="journalRows" />
    <ActivityLogModal :is-open="activityOpen" :subject="applicationLabel(app.number)" :updated-by="app.updatedBy" :updated-at="app.updatedAt" :entries="app.history" @close="activityOpen = false" />
    <ConfirmModal
      v-model:is-open="deleteOpen"
      :title="`${t('Delete credit memo applied')}?`"
      :description="t('Deleting this returns the credit to the credit memo and restores the invoice balances. This cannot be undone.')"
      :confirm-label="t('Delete credit memo applied')"
      @confirm="confirmDelete"
    />
  </div>

  <div v-else class="cm-notfound">
    <p class="cm-notfound-title">{{ t('Credit memo applied not found') }}</p>
    <p class="cm-notfound-desc">{{ t('This record may have been deleted or the link is invalid.') }}</p>
    <MpButton variant="secondary" is-rounded @click="goInvoices">{{ t('Back to sales invoices') }}</MpButton>
  </div>
</template>

<style scoped>
.cm-primary-grid { flex: 1; }
</style>
