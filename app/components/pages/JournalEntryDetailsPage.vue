<!-- prod-parity: jurnal-accounting-frontend/src/modules/journal-entries/views/JournalEntryShowView.vue -->
<script setup lang="ts">
/** General Journal #n — /journal-entries/:id */
import { ref, computed } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpTextlink, css, toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import SetRecurringModal from '~/components/patterns/SetRecurringModal.vue'
import { getJournalEntry, deleteJournalEntry, journalTotals } from '~/data/journalEntries'
import { coaLabel } from '~/data/bankTransactions'
import { formatIDR } from '~/utils/currency'
import { formatDateLong } from '~/utils/date'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const entry = computed(() => getJournalEntry(props.orderId))
const totals = computed(() => entry.value ? journalTotals(entry.value.lines) : { debit: 0, credit: 0 })
const title = computed(() => entry.value ? `${t('General Journal')} #${entry.value.number}` : '')

const recurringOpen = ref(false)
function onRecurringSave() { recurringOpen.value = false; toast.notify({ variant: 'success', title: t('Recurring schedule created.') }) }
function preview() { toast.notify({ variant: 'info', title: t('Not in this prototype') }) }
function edit() { toast.notify({ variant: 'info', title: t('Not in this prototype') }) }
function duplicate() { router.push({ path: '/journal-entries/new', query: { duplicateFrom: props.orderId } }) }
const deleteOpen = ref(false)
function confirmDelete() {
  deleteJournalEntry(props.orderId)
  deleteOpen.value = false
  toast.notify({ variant: 'success', title: t('General Journal deleted.') })
  router.push('/chart-of-accounts')
}
function formatUpdated(iso: string) {
  const d = new Date(iso)
  return `${new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)} at ${new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)} (GMT+7)`
}
</script>

<template>
  <div v-if="entry" class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <MpTextlink id="jes-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="router.push('/chart-of-accounts')">{{ t('Chart of accounts') }}</MpTextlink>
        </nav>
        <h1 class="detail-title">{{ title }}</h1>
      </div>
    </header>

    <div class="detail-stage-wrapper">
      <div class="detail-stage">
        <section class="bd-meta content-list-grid">
          <div class="content-list-col"><ContentList :label="t('Transaction date')" :value="formatDateLong(entry.transactionDate)" /></div>
          <div class="content-list-col"><ContentList :label="t('Transaction no.')" :value="String(entry.number)" /></div>
          <div class="content-list-col">
            <ContentList :label="t('Tags')">
              <span v-if="entry.tags.length">{{ entry.tags.join(', ') }}</span>
              <template v-else>—</template>
            </ContentList>
          </div>
        </section>

        <section class="detail-items-section">
          <table class="detail-items">
            <thead>
              <tr>
                <th class="detail-th">{{ t('Account') }}</th>
                <th class="detail-th">{{ t('Description') }}</th>
                <th class="detail-th detail-th--num">{{ t('Debit') }}</th>
                <th class="detail-th detail-th--num">{{ t('Credit') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(l, i) in entry.lines" :key="i">
                <td class="detail-td">{{ coaLabel(l.accountCode) }}</td>
                <td class="detail-td">{{ l.description || '—' }}</td>
                <td class="detail-td detail-td--num">{{ l.debit ? formatIDR(l.debit) : '—' }}</td>
                <td class="detail-td detail-td--num">{{ l.credit ? formatIDR(l.credit) : '—' }}</td>
              </tr>
            </tbody>
          </table>
          <div class="detail-items-count">{{ t('Showing') }} {{ entry.lines.length }} {{ t('of') }} {{ entry.lines.length }} {{ t('lines') }}</div>
        </section>

        <section class="detail-notes">
          <div class="detail-notes-left">
            <ContentList :label="t('Memo')"><p class="detail-note-text">{{ entry.memo || '—' }}</p></ContentList>
            <ContentList :label="t('Attachments')" :value="t('No attachments')" />
          </div>
          <div class="detail-totals">
            <div class="detail-total-row"><span>{{ t('Total debit') }}</span><span>{{ formatIDR(totals.debit) }}</span></div>
            <div class="detail-total-row"><span>{{ t('Total credit') }}</span><span>{{ formatIDR(totals.credit) }}</span></div>
          </div>
        </section>

        <p class="detail-updated">{{ t('Last updated by') }} Rizal Candra {{ t('on') }} {{ formatUpdated(entry.createdAt) }}</p>
      </div>

      <footer class="detail-footer">
        <MpPopover id="jes-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
          <MpPopoverTrigger>
            <button class="detail-btn detail-btn--primary btn-enterprise">
              {{ t('Actions') }}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem @click="preview">{{ t('Preview') }}</MpPopoverListItem>
              <MpPopoverListItem @click="recurringOpen = true">{{ t('Set as recurring') }}</MpPopoverListItem>
            </MpPopoverList>
            <div class="jes-divider" />
            <MpPopoverList>
              <MpPopoverListItem @click="edit">{{ t('Edit') }}</MpPopoverListItem>
              <MpPopoverListItem @click="duplicate">{{ t('Duplicate') }}</MpPopoverListItem>
              <MpPopoverListItem class="jes-danger" @click="deleteOpen = true">{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </footer>
    </div>

    <SetRecurringModal :is-open="recurringOpen" :min-date="entry.transactionDate" @close="recurringOpen = false" @save="onRecurringSave" />
    <MpModal id="jes-delete" :is-close-on-esc="false" :is-close-on-overlay-click="false" :is-open="deleteOpen" size="sm" :is-keep-alive="false" @close="deleteOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t('Delete General Journal') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>{{ t('Are you sure you want to delete this General Journal? This action cannot be undone.') }}</MpModalBody>
        <MpModalFooter>
          <div class="jes-delete-footer">
            <button class="btn-enterprise btn-enterprise--ghost" @click="deleteOpen = false">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmDelete">{{ t('Delete') }}</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>
  <div v-else class="jes-not-found">
    <p>{{ t('We couldn\'t load this journal entry.') }}</p>
    <MpTextlink id="jes-back" as="a" class="detail-breadcrumb" @click.prevent="router.push('/chart-of-accounts')">{{ t('Chart of accounts') }}</MpTextlink>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-self: flex-start; }
.detail-breadcrumb { cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default); }
.detail-stage-wrapper { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0; overflow: hidden; }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-8); display: flex; flex-direction: column; gap: var(--mp-spacing-8); }
.content-list-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 318px)); gap: 0 var(--mp-spacing-6); }
.content-list-col { display: flex; flex-direction: column; }
.detail-items { width: 100%; border-collapse: collapse; }
.detail-th { height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default); }
.detail-th--num, .detail-td--num { text-align: right; white-space: nowrap; }
.detail-td { height: var(--mp-sizes-10, 40px); padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); }
.detail-items-count { padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-default); color: var(--mp-text-secondary); }
.detail-notes { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--mp-spacing-6); flex-wrap: wrap; }
.detail-notes-left { display: flex; flex-direction: column; gap: var(--mp-spacing-6); width: min(432px, 100%); }
.detail-note-text { margin: 0; white-space: pre-line; }
.detail-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-3); width: min(428px, 100%); }
.detail-total-row { display: flex; justify-content: space-between; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.detail-updated { margin: 0; color: var(--mp-text-secondary); }
.detail-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); }
.detail-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; border: 1px solid transparent; }
.detail-btn--primary { background: var(--mp-colors-emerald-700); border-color: var(--mp-colors-emerald-700); color: var(--mp-text-inverse); }
.jes-divider { height: 1px; margin: var(--mp-spacing-1) 0; background: var(--mp-border-default); }
.jes-danger { color: var(--mp-text-danger); }
.jes-delete-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
.jes-not-found { padding: var(--mp-spacing-6); }
</style>
