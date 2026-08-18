<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { formatIDR } from '~/utils/currency'
import { formatDateLong } from '~/utils/date'
import type jsPDF from 'jspdf'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpTextlink, MpBadge, css, toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import PdfPreviewModal from '~/components/patterns/PdfPreviewModal.vue'
import ActivityLogModal from '~/components/patterns/ActivityLogModal.vue'
import JournalEntryDrawer, { type JournalEntryRow } from '~/components/patterns/JournalEntryDrawer.vue'
import ApprovalLogPopover from '~/components/patterns/ApprovalLogPopover.vue'
import ApprovalCommentPopover from '~/components/patterns/ApprovalCommentPopover.vue'
import SetRecurringModal, { type RecurringConfig } from '~/components/patterns/SetRecurringModal.vue'
import type { ApprovalLevel, TaskComment } from '~/data/tasks'
import { cashAccounts } from '~/data/cashAccounts'
import { internalTransfers, getInternalTransfer, deleteInternalTransfer, setInternalTransferRecurring } from '~/data/internalTransfers'
import { generateInternalTransferPdf } from '~/utils/internalTransferPdf'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const transfer = computed(() => getInternalTransfer(props.orderId))
function accountLabel(id: string) { const a = cashAccounts.find((c) => c.id === id); return a ? `${a.code} ${a.name}` : id }
function docNo(n: number) { return `#${String(n).padStart(5, '0')}` }
const displayNo = computed(() => transfer.value ? docNo(transfer.value.number) : '')

function goBack() { router.push('/cash-management') }

// ── Last updated / Activity log ─────────────────────────────────────────────────
const lastUpdatedBy = 'Rizal Candra'
const lastUpdatedAt = computed(() => transfer.value?.createdAt ?? new Date().toISOString())
function formatUpdatedAt(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date}, ${time}`
}
const activityOpen = ref(false)
const activityEntries = computed(() => {
  const tr = transfer.value
  if (!tr) return []
  return [{
    date: tr.createdAt ?? tr.transactionDate,
    user: lastUpdatedBy,
    activity: 'Created',
    details: [
      { label: t('Transaction no.'), value: displayNo.value },
      { label: t('Transaction date'), value: formatDateLong(tr.transactionDate) },
      { label: t('Transfer from'), value: accountLabel(tr.fromAccountId) },
      { label: t('Total'), value: formatIDR(tr.total) },
    ],
  }]
})

// ── Approval log + comments (reusable popovers, mock data) ───────────────────────
const approvalRequested = computed(() => ({ name: lastUpdatedBy, timestamp: lastUpdatedAt.value }))
const approvalLevels = computed<ApprovalLevel[]>(() => [{
  label: t('Finance approval'), rule: 'any', status: 'approved', approvedCount: 1,
  steps: [{ name: 'Andi Wijaya', role: 'Finance Manager', status: 'approved', timestamp: lastUpdatedAt.value }],
}])
const comments = computed<TaskComment[]>(() => {
  const tr = transfer.value
  if (!tr) return []
  return [{ id: `${tr.id}-c1`, author: 'Andi Wijaya', timestamp: tr.createdAt, text: 'Approved — matches the treasury plan.' }]
})

// ── Journal entry ────────────────────────────────────────────────────────────────
const showJournalEntry = ref(false)
const journalEntryRows = computed<JournalEntryRow[]>(() => {
  const tr = transfer.value
  if (!tr) return []
  const rows: JournalEntryRow[] = tr.lines.map((l) => ({ account: accountLabel(l.accountId), debit: l.amount }))
  rows.push({ account: accountLabel(tr.fromAccountId), credit: tr.total })
  return rows
})

// ── Jump to another internal transfer ────────────────────────────────────────────
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const q = jumpSearch.value.trim().toLowerCase()
  return internalTransfers.filter((tr) =>
    !q || docNo(tr.number).includes(q) || accountLabel(tr.fromAccountId).toLowerCase().includes(q),
  )
})
function jumpTo(id: string) { jumpSearch.value = ''; router.push(`/cash-management/internal-transfer/${id}`) }

// ── Preview PDF ────────────────────────────────────────────────────────────────
const pdfPreviewOpen = ref(false)
const pdfPreviewDoc = ref<jsPDF | null>(null)
const pdfPreviewFilename = ref('')
function openPdfPreview() {
  if (!transfer.value) return
  pdfPreviewDoc.value = generateInternalTransferPdf(transfer.value)
  pdfPreviewFilename.value = `Internal transfer ${displayNo.value}.pdf`
  pdfPreviewOpen.value = true
}

// ── Set as recurring ─────────────────────────────────────────────────────────────
const recurringOpen = ref(false)
function saveRecurring(config: RecurringConfig) {
  setInternalTransferRecurring(props.orderId, config)
  recurringOpen.value = false
  toast.notify({ variant: 'success', title: t('Recurring schedule saved') })
}

function edit() { router.push(`/cash-management/internal-transfer/${props.orderId}/edit`) }
function duplicate() { router.push(`/cash-management/internal-transfer/${props.orderId}/duplicate`) }

// ── Delete ──────────────────────────────────────────────────────────────────────
const deleteModalOpen = ref(false)
function confirmDelete() {
  deleteInternalTransfer(props.orderId)
  deleteModalOpen.value = false
  toast.notify({ variant: 'success', title: t('Internal transfer deleted') })
  goBack()
}
</script>

<template>
  <div v-if="transfer" class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <MpTextlink id="itd-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="goBack">{{ t('Cash management') }}</MpTextlink>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('Internal transfer') }} {{ displayNo }}</h1>
          <MpBadge v-if="transfer.recurring" type="information" size="md" for="additionalInformation">{{ t('Recurring') }}</MpBadge>
          <!-- Jump to another internal transfer -->
          <MpPopover id="itd-jump" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <button class="detail-jump-chevron" :aria-label="t('Switch transaction')">
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
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg>
                  </button>
                </div>
                <div class="detail-jump-list">
                  <button v-for="tr in jumpResults" :key="tr.id" class="detail-jump-item" @click="jumpTo(tr.id)">
                    <span class="detail-jump-item-number">{{ t('Internal transfer') }} {{ docNo(tr.number) }}</span>
                    <span class="detail-jump-item-customer">{{ accountLabel(tr.fromAccountId) }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">{{ t('No transactions found.') }}</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <!-- Right-side header actions — approval log + comments (reusable popovers) -->
      <div class="detail-titlerow-right">
        <ApprovalLogPopover
          :id="`itd-applog-${transfer.id}`"
          :subject="`${t('Internal transfer')} ${displayNo}`"
          :requested="approvalRequested"
          :levels="approvalLevels"
        />
        <ApprovalCommentPopover :id="`itd-comments-${transfer.id}`" :comments="comments" />
      </div>
    </header>

    <div class="detail-stage-wrapper">
    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- Transfer from + Total + View journal entry -->
      <section class="bd-primary">
        <ContentList :label="t('Transfer from')" :value="accountLabel(transfer.fromAccountId)" />
        <div class="detail-primary-total">
          <span class="detail-total-amount">
            <span class="detail-total-label">{{ t('Total') }}</span> {{ formatIDR(transfer.total) }}
          </span>
          <a class="detail-banner-link itd-journal-link" @click.prevent="showJournalEntry = true">{{ t('View journal entry') }}</a>
        </div>
      </section>

      <!-- Meta grid -->
      <section class="bd-meta content-list-grid">
        <div class="content-list-col">
          <ContentList :label="t('Transaction date')" :value="formatDateLong(transfer.transactionDate)" />
        </div>
        <div class="content-list-col">
          <ContentList :label="t('Transaction no.')" :value="`${t('Internal transfer')} ${displayNo}`" />
        </div>
        <div class="content-list-col">
          <ContentList :label="t('Reference no.')" :value="transfer.referenceNo || '—'" />
        </div>
        <div class="content-list-col">
          <ContentList :label="t('Tags')">
            <span v-if="transfer.tags?.length">{{ transfer.tags.join(', ') }}</span>
            <template v-else>—</template>
          </ContentList>
        </div>
      </section>

      <!-- Line items -->
      <section class="detail-items-section">
        <table class="detail-items">
          <thead>
            <tr>
              <th class="detail-th">{{ t('Account') }}</th>
              <th class="detail-th">{{ t('Description') }}</th>
              <th class="detail-th detail-th--num">{{ t('Amount') }}</th>
            </tr>
          </thead>
          <tbody class="detail-items-body">
            <tr v-for="(l, i) in transfer.lines" :key="i" class="detail-item-row">
              <td class="detail-td">{{ accountLabel(l.accountId) }}</td>
              <td class="detail-td">{{ l.description || '—' }}</td>
              <td class="detail-td detail-td--num">{{ formatIDR(l.amount) }}</td>
            </tr>
          </tbody>
        </table>
        <div class="detail-items-count">
          <span>{{ t('Showing') }} {{ transfer.lines.length }} {{ t('of') }} {{ transfer.lines.length }} {{ t('accounts') }}</span>
        </div>
      </section>

      <!-- Memo + total -->
      <section class="detail-notes">
        <div class="detail-notes-left">
          <ContentList :label="t('Memo')" class="detail-memo-section">
            <p class="detail-note-text">{{ transfer.memo || '—' }}</p>
          </ContentList>
        </div>
        <div class="detail-totals">
          <div class="detail-total-row">
            <span class="detail-total-row-label detail-total-row-label--total">{{ t('Total') }}</span>
            <span class="detail-total-row-amt detail-total-row-amt--total">{{ formatIDR(transfer.total) }}</span>
          </div>
        </div>
      </section>

      <!-- Last updated → activity log -->
      <a class="detail-updated" @click.prevent="activityOpen = true">{{ t('Last updated by') }} {{ lastUpdatedBy }} {{ t('on') }} {{ formatUpdatedAt(lastUpdatedAt) }}</a>
    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer">
      <button class="detail-btn detail-btn--secondary btn-enterprise" @click="openPdfPreview">{{ t('Print PDF') }}</button>
      <MpPopover id="itd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <button class="detail-btn detail-btn--primary btn-enterprise">
            {{ t('Actions') }}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="openPdfPreview">{{ t('Preview') }}</MpPopoverListItem>
            <MpPopoverListItem @click="recurringOpen = true">{{ t('Set as recurring') }}</MpPopoverListItem>
          </MpPopoverList>
          <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
          <MpPopoverList>
            <MpPopoverListItem @click="edit">{{ t('Edit') }}</MpPopoverListItem>
            <MpPopoverListItem @click="duplicate">{{ t('Duplicate') }}</MpPopoverListItem>
            <MpPopoverListItem @click="deleteModalOpen = true">{{ t('Delete') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </footer>
    </div>

    <!-- ── Modals / drawers ── -->
    <PdfPreviewModal
      :open="pdfPreviewOpen" :doc="pdfPreviewDoc" :filename="pdfPreviewFilename"
      :title="`${t('Internal transfer')} ${displayNo} ${t('preview')}`" @close="pdfPreviewOpen = false"
    />
    <JournalEntryDrawer
      v-model:is-open="showJournalEntry"
      :heading="`${t('Internal transfer')} ${displayNo}`"
      :rows="journalEntryRows"
    />
    <SetRecurringModal :is-open="recurringOpen" :min-date="transfer.transactionDate" @close="recurringOpen = false" @save="saveRecurring" />
    <ActivityLogModal
      :is-open="activityOpen"
      :subject="`${t('Internal transfer')} ${displayNo}`"
      :updated-by="lastUpdatedBy"
      :updated-at="lastUpdatedAt"
      :entries="activityEntries"
      @close="activityOpen = false"
    />

    <!-- ── Delete confirmation modal ── -->
    <MpModal id="itd-delete-modal" :is-open="deleteModalOpen" size="md" is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="deleteModalOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Delete') }} {{ t('Internal transfer') }} {{ displayNo }}?<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>{{ t('Deleted internal transfers cannot be restored.') }}</MpModalBody>
        <MpModalFooter>
          <div class="itd-delete-footer">
            <button class="btn-enterprise btn-enterprise--ghost" @click="deleteModalOpen = false">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmDelete">{{ t('Delete') }}</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>

  <!-- Not found -->
  <div v-else class="itd-not-found">
    <p>{{ t('Internal transfer not found.') }}</p>
    <MpTextlink id="itd-not-found-back" as="a" class="detail-breadcrumb" @click.prevent="goBack">{{ t('Back to Cash management') }}</MpTextlink>
  </div>
</template>

<style scoped>
/* ── Page shell — canonical detail pattern (see BillDetailsPage) ─────────────── */
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
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
}
.detail-titlerow-right { display: flex; align-items: center; gap: var(--mp-spacing-1); flex-shrink: 0; }
/* The reusable approval/comment popovers ship an unstyled `.row-icon-btn` trigger
   (its CSS is scoped to TasksTablePage). Give it the same 36x36 hit area as the
   SalesOrder detail icon buttons so the two icons aren't cramped. */
.detail-titlerow-right :deep(.row-icon-btn) {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border-radius: var(--mp-radii-md); background: none; border: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
}
.detail-titlerow-right :deep(.row-icon-btn):hover { background: var(--mp-background-neutral-hovered); }

/* ── Jump-to switcher ── */
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
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; padding-right: 34px;
}
.detail-jump-search:focus { border-color: var(--mp-border-brand-bold, #029861); }
.detail-jump-search::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary)); border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
.search-clear-btn--overlay { position: absolute; right: 18px; top: 50%; transform: translateY(-50%); }
.detail-jump-list { display: flex; flex-direction: column; }
.detail-jump-item {
  display: flex; flex-direction: column; gap: 2px; width: 100%; text-align: left;
  background: none; border: none; cursor: pointer; padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md);
}
.detail-jump-item:hover { background: var(--mp-background-neutral-subtle); }
.detail-jump-item-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-customer { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.detail-stage-wrapper { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--mp-background-stage); border-radius: 12px 12px 0 0; overflow: hidden; }
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: 12px 12px 0 0;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-8);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8); container-type: inline-size;
}

/* ── Primary (Transfer from + Total + journal link) ──────────────────────────── */
.bd-primary { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-primary-total { display: flex; flex-direction: column; align-items: flex-end; gap: 0; }
.detail-total-amount { font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.detail-total-label { font-weight: var(--mp-font-weights-semi-bold); }
.detail-banner-link { color: var(--mp-text-link); cursor: pointer; font-weight: var(--mp-font-weights-semi-bold); }
.detail-banner-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.itd-journal-link { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); }

/* ── Meta grid ───────────────────────────────────────────────────────────────── */
.content-list-grid { display: grid; grid-template-columns: minmax(0, 318px) repeat(3, minmax(0, 1fr)); gap: 0 var(--mp-spacing-6); }
.content-list-col { display: flex; flex-direction: column; }
.bd-meta { padding-top: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }

/* ── Line items ──────────────────────────────────────────────────────────────── */
.detail-items-section { display: flex; flex-direction: column; }
.detail-items { width: 100%; border-collapse: collapse; }
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
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
}
.detail-td--num { text-align: right; white-space: nowrap; padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4); }
.detail-items-body { border-bottom: 1px solid var(--mp-border-default); }
.detail-items-count { padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Notes + totals ──────────────────────────────────────────────────────────── */
.detail-notes { display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
.detail-notes-left { display: flex; flex-direction: column; gap: var(--mp-spacing-6); flex-shrink: 0; order: 2; }
.detail-memo-section { width: min(432px, 32.7cqw); }
.detail-note-text { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default); white-space: pre-line; }
.detail-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-4); width: min(428px, 32.4cqw); flex-shrink: 0; padding-top: var(--mp-spacing-2); order: 1; }
@container (min-width: 650px) {
  .detail-notes { flex-direction: row; justify-content: space-between; align-items: flex-start; }
  .detail-notes-left { order: 1; }
  .detail-totals { order: 2; }
}
.detail-total-row { display: flex; align-items: baseline; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-total-row-label--total, .detail-total-row-amt--total { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.detail-total-row-amt--total { white-space: nowrap; }

/* ── Last updated ── */
.detail-updated { margin: 0; align-self: flex-start; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer; }
.detail-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Footer + Actions ────────────────────────────────────────────────────────── */
.detail-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); }
.detail-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap;
}
.detail-btn--primary { background: var(--mp-colors-emerald-700, #029861); border-color: var(--mp-colors-emerald-700, #029861); color: var(--mp-text-inverse); }
.detail-btn--primary:hover { background: var(--mp-colors-emerald-800, #186f4a); border-color: var(--mp-colors-emerald-800, #186f4a); }
.detail-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-secondary); }
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }

.itd-delete-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
.itd-not-found { padding: var(--mp-spacing-6); }
</style>
