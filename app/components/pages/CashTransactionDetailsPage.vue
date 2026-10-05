<!-- prod-parity: jurnal-accounting-frontend/src/modules/cash-management/bank-deposits/views/BankDepositDetailView.vue + bank-withdrawals/views/BankWithdrawalDetailView.vue -->
<script setup lang="ts">
/**
 * Receive money #n / Spend money #n — show page. Kind comes from the route's
 * first segment (/bank-deposits/:id vs /bank-withdrawals/:id).
 */
import { ref, computed } from 'vue'
import { useRoute } from 'vue-router'
import { formatDateLong } from '~/utils/date'
import { formatMoney } from '~/utils/currency'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton,
  MpTextlink, MpBadge, css, toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ActivityLogModal from '~/components/patterns/ActivityLogModal.vue'
import JournalEntryDrawer, { type JournalEntryRow } from '~/components/patterns/JournalEntryDrawer.vue'
import SetRecurringModal, { type RecurringConfig } from '~/components/patterns/SetRecurringModal.vue'
import { cashAccounts } from '~/data/cashAccounts'
import { companyTaxes } from '~/data/companyTaxes'
import {
  getCashTx, cashTxOfKind, cashTxTotals, deleteCashTx, setCashTxRecurring,
  coaLabel, cashAccountLabel, taxName, type CashTxKind,
} from '~/data/bankTransactions'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()
const route = useRoute()

const kind: CashTxKind = route.path.startsWith('/bank-withdrawals') ? 'withdrawal' : 'deposit'
const base = kind === 'deposit' ? '/bank-deposits' : '/bank-withdrawals'
const L = kind === 'deposit'
  ? { name: 'Receive money', account: 'Deposit to', contact: 'Payer', deleteTitle: 'Delete receive money?', deleted: 'Receive money deleted', linkDesc: 'Anyone with this link will be able to view the receive money.' }
  : { name: 'Spend money', account: 'Pay from', contact: 'Payee', deleteTitle: 'Delete spend money?', deleted: 'Spend money deleted', linkDesc: 'Anyone with this link will be able to view the spend money.' }

const tx = computed(() => getCashTx(props.orderId))
const account = computed(() => cashAccounts.find((a) => a.id === tx.value?.cashAccountId))
const currency = computed(() => account.value?.currency ?? 'IDR')
const totals = computed(() => tx.value ? cashTxTotals(tx.value.lines, tx.value.priceIncludesTax) : { subtotal: 0, taxTotal: 0, total: 0 })
const title = computed(() => tx.value ? `${t(L.name)} #${tx.value.number}` : '')
const money = (n: number) => formatMoney(n, currency.value)

function goBack() { router.push(tx.value ? `/cash-management/${tx.value.cashAccountId}` : '/cash-management') }

// ── Jump to ────────────────────────────────────────────────────────────────────
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const q = jumpSearch.value.trim()
  return cashTxOfKind(kind).filter((x) => !q || String(x.number).includes(q))
})
function jumpTo(id: string) { jumpSearch.value = ''; router.push(`${base}/${id}`) }

// ── Journal entry (debit/credit lines) ─────────────────────────────────────────
const showJournal = ref(false)
const journalRows = computed<JournalEntryRow[]>(() => {
  const x = tx.value
  if (!x) return []
  const cash = cashAccountLabel(x.cashAccountId)
  const isDep = kind === 'deposit'
  const rows: JournalEntryRow[] = []
  const net = cashTxTotals(x.lines, x.priceIncludesTax)
  // One row per line (net of tax), one per tax account, one for the cash side.
  for (const l of x.lines) {
    const lt = cashTxTotals([l], x.priceIncludesTax)
    rows.push(isDep ? { account: coaLabel(l.accountCode), credit: lt.subtotal } : { account: coaLabel(l.accountCode), debit: lt.subtotal })
  }
  if (net.taxTotal) {
    const taxAcc = isDep ? '2-20500 VAT Out' : '1-10500 VAT In'
    const firstTax = companyTaxes.find((c) => x.lines.some((l) => l.taxId === c.id))
    const label = (isDep ? firstTax?.sellAccount : firstTax?.buyAccount) || taxAcc
    rows.push(isDep ? { account: label, credit: net.taxTotal } : { account: label, debit: net.taxTotal })
  }
  rows.push(isDep ? { account: cash, debit: net.total } : { account: cash, credit: net.total })
  return rows
})

// ── Activity log / last updated ────────────────────────────────────────────────
const lastUpdatedBy = 'Rizal Candra'
const lastUpdatedAt = computed(() => tx.value?.createdAt ?? new Date().toISOString())
function formatUpdatedAt(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date}, ${time}`
}
const activityOpen = ref(false)
const activityEntries = computed(() => tx.value ? [{
  date: tx.value.createdAt, user: lastUpdatedBy, activity: 'Created',
  details: [
    { label: t('Transaction no.'), value: String(tx.value.number) },
    { label: t('Transaction date'), value: formatDateLong(tx.value.transactionDate) },
    { label: t(L.account), value: cashAccountLabel(tx.value.cashAccountId) },
    { label: t('Total'), value: money(totals.value.total) },
  ],
}] : [])

// ── Actions ────────────────────────────────────────────────────────────────────
const recurringOpen = ref(false)
function saveRecurring(c: RecurringConfig) {
  setCashTxRecurring(props.orderId, c)
  recurringOpen.value = false
  toast.notify({ variant: 'success', title: t('Recurring schedule created') })
}
function edit() { router.push(`${base}/${props.orderId}/edit`) }
function duplicate() { router.push({ path: `${base}/new`, query: { duplicateFrom: props.orderId } }) }
function printPdf() { toast.notify({ variant: 'info', title: t('Not in this prototype') }) }
function copyLink() {
  navigator.clipboard?.writeText(window.location.href).catch(() => {})
  toast.notify({ variant: 'success', title: t('Link copied to clipboard') })
}
const deleteOpen = ref(false)
function confirmDelete() {
  const back = tx.value?.cashAccountId
  deleteCashTx(props.orderId)
  deleteOpen.value = false
  toast.notify({ variant: 'success', title: t(L.deleted) })
  router.push(back ? `/cash-management/${back}` : '/cash-management')
}
</script>

<template>
  <div v-if="tx" class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <MpTextlink id="ctd-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="router.push('/cash-management')">{{ t('Cash management') }}</MpTextlink>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ title }}</h1>
          <MpBadge v-if="tx.recurring" type="information" size="md" for="additionalInformation">{{ t('Recurring') }}</MpBadge>
          <MpPopover id="ctd-jump" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <button class="detail-jump-chevron btn-enterprise" :aria-label="t('Jump to')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '304px' })">
              <div class="detail-jump">
                <div class="detail-jump-search-wrap">
                  <input v-model="jumpSearch" class="detail-jump-search btn-enterprise" type="text" :placeholder="t('Search transaction no.')" />
                </div>
                <div class="detail-jump-list">
                  <button v-for="x in jumpResults" :key="x.id" class="detail-jump-item btn-enterprise" @click="jumpTo(x.id)">
                    <span class="detail-jump-item-number">{{ t(L.name) }} #{{ x.number }}</span>
                    <span class="detail-jump-item-customer">{{ cashAccountLabel(x.cashAccountId) }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">{{ t('No transaction found') }}</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
    </header>

    <div class="detail-stage-wrapper">
      <div class="detail-stage">
        <section class="bd-primary">
          <div class="bd-primary-left">
            <ContentList :label="t(L.account)" :value="cashAccountLabel(tx.cashAccountId)" />
            <ContentList :label="t(L.contact)" :value="tx.contact || '—'" />
          </div>
          <div class="detail-primary-total">
            <span class="detail-total-amount"><span class="detail-total-label">{{ t('Total') }}</span> {{ money(totals.total) }}</span>
            <a class="detail-banner-link ctd-journal-link" @click.prevent="showJournal = true">{{ t('View journal entry') }}</a>
          </div>
        </section>

        <section class="bd-meta content-list-grid">
          <div class="content-list-col"><ContentList :label="t('Transaction date')" :value="formatDateLong(tx.transactionDate)" /></div>
          <div class="content-list-col"><ContentList :label="t('Transaction no.')" :value="String(tx.number)" /></div>
          <div class="content-list-col"><ContentList :label="t('Reference no.')" :value="tx.referenceNo || '—'" /></div>
          <div class="content-list-col">
            <ContentList :label="t('Tags')">
              <span v-if="tx.tags.length">{{ tx.tags.join(', ') }}</span>
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
                <th class="detail-th">{{ t('Tax') }}</th>
                <th class="detail-th detail-th--num">{{ t('Amount') }}</th>
              </tr>
            </thead>
            <tbody class="detail-items-body">
              <tr v-for="(l, i) in tx.lines" :key="i">
                <td class="detail-td">{{ coaLabel(l.accountCode) }}</td>
                <td class="detail-td">{{ l.description || '—' }}</td>
                <td class="detail-td">{{ taxName(l.taxId) || '—' }}</td>
                <td class="detail-td detail-td--num">{{ money(l.amount) }}</td>
              </tr>
            </tbody>
          </table>
          <div class="detail-items-count">{{ t('Showing') }} {{ tx.lines.length }} {{ t('of') }} {{ tx.lines.length }} {{ tx.lines.length === 1 ? t('entry') : t('entries') }}</div>
        </section>

        <section class="detail-notes">
          <div class="detail-notes-left">
            <ContentList :label="t('Memo')"><p class="detail-note-text">{{ tx.memo || '—' }}</p></ContentList>
            <ContentList :label="t('Attachment')" value="—" />
          </div>
          <div class="detail-totals">
            <div class="detail-total-row"><span>{{ t('Subtotal') }}</span><span>{{ money(totals.subtotal) }}</span></div>
            <div v-if="totals.taxTotal" class="detail-total-row"><span>{{ t('Tax total') }}</span><span>{{ money(totals.taxTotal) }}</span></div>
            <div class="detail-total-row detail-total-row--grand"><span>{{ t('Total') }}</span><span>{{ money(totals.total) }}</span></div>
          </div>
        </section>

        <a class="detail-updated" @click.prevent="activityOpen = true">{{ t('Last updated by') }} {{ lastUpdatedBy }} {{ t('on') }} {{ formatUpdatedAt(lastUpdatedAt) }}</a>
      </div>

      <footer class="detail-footer">
        <MpPopover id="ctd-print" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
          <MpPopoverTrigger>
            <button class="detail-btn detail-btn--secondary btn-enterprise">{{ t('Print PDF') }}</button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
            <MpPopoverList>
              <MpPopoverListItem @click="printPdf">{{ t('Print PDF') }}</MpPopoverListItem>
              <MpPopoverListItem @click="copyLink">{{ t('Copy link') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
        <MpPopover id="ctd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
          <MpPopoverTrigger>
            <button class="detail-btn detail-btn--primary btn-enterprise">
              {{ t('Actions') }}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" /></svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="recurringOpen = true">{{ tx.recurring ? t('See recurring schedules') : t('Set as recurring') }}</MpPopoverListItem>
              <MpPopoverListItem @click="activityOpen = true">{{ t('View activity log') }}</MpPopoverListItem>
            </MpPopoverList>
            <div class="ctd-menu-divider" />
            <MpPopoverList>
              <MpPopoverListItem @click="edit">{{ t('Edit') }}</MpPopoverListItem>
              <MpPopoverListItem @click="duplicate">{{ t('Duplicate') }}</MpPopoverListItem>
              <MpPopoverListItem class="ctd-menu-item--danger" @click="deleteOpen = true">{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </footer>
    </div>

    <JournalEntryDrawer v-model:is-open="showJournal" :heading="title" :rows="journalRows" />
    <SetRecurringModal :is-open="recurringOpen" :min-date="tx.transactionDate" @close="recurringOpen = false" @save="saveRecurring" />
    <ActivityLogModal
      :is-open="activityOpen" :subject="title" :updated-by="lastUpdatedBy" :updated-at="lastUpdatedAt"
      :entries="activityEntries" @close="activityOpen = false"
    />
    <MpModal id="ctd-delete-modal" :is-close-on-esc="false" :is-close-on-overlay-click="false" :is-open="deleteOpen" size="sm" :is-keep-alive="false" @close="deleteOpen = false">
      <MpModalContent>
        <MpModalHeader>{{ t(L.deleteTitle) }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>{{ t(L.name) }} #{{ tx.number }} {{ t('will be permanently deleted. This action cannot be undone.') }}</MpModalBody>
        <MpModalFooter>
          <div class="ctd-delete-footer">
            <button class="btn-enterprise btn-enterprise--ghost" @click="deleteOpen = false">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmDelete">{{ t('Delete') }}</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>

  <div v-else class="ctd-not-found">
    <p>{{ t('We couldn\'t load this transaction.') }}</p>
    <MpTextlink id="ctd-not-found-back" as="a" class="detail-breadcrumb" @click.prevent="goBack">{{ t('Cash management') }}</MpTextlink>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.detail-breadcrumb { cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
}
.detail-jump-chevron {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  background: none; border: none; padding: 0; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-colors-icon-default);
}
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); }
.detail-jump-search {
  width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md); outline: none;
}
.detail-jump-list { display: flex; flex-direction: column; max-height: 320px; overflow-y: auto; }
.detail-jump-item { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); width: 100%; text-align: left; background: none; border: none; cursor: pointer; padding: var(--mp-spacing-2) var(--mp-spacing-3); }
.detail-jump-item:hover { background: var(--mp-background-neutral-subtle); }
.detail-jump-item-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-customer { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty { margin: 0; padding: var(--mp-spacing-3); color: var(--mp-text-secondary); }

.detail-stage-wrapper { flex: 1; min-height: 0; display: flex; flex-direction: column; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0; overflow: hidden; }
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  padding: var(--mp-spacing-6) var(--mp-spacing-6) var(--mp-spacing-8);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8); container-type: inline-size;
}
.bd-primary { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); }
.bd-primary-left { display: flex; gap: var(--mp-spacing-6); }
.bd-primary-left > * { width: var(--mp-sizes-79, 316px); }
.detail-primary-total { display: flex; flex-direction: column; align-items: flex-end; }
.detail-total-amount { font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); white-space: nowrap; }
.detail-total-label { font-weight: var(--mp-font-weights-semi-bold); }
.detail-banner-link { color: var(--mp-text-link); cursor: pointer; }
.detail-banner-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.ctd-journal-link { font-size: var(--mp-font-sizes-md); }
.content-list-grid { display: grid; grid-template-columns: minmax(0, 318px) repeat(3, minmax(0, 1fr)); gap: 0 var(--mp-spacing-6); }
.content-list-col { display: flex; flex-direction: column; }
.bd-meta { padding-top: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.detail-items-section { display: flex; flex-direction: column; }
.detail-items { width: 100%; border-collapse: collapse; }
.detail-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.detail-th--num, .detail-td--num { text-align: right; }
.detail-td {
  height: var(--mp-sizes-10, 40px); padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
}
.detail-td--num { white-space: nowrap; }
.detail-items-count { padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.detail-notes { display: flex; flex-direction: row; justify-content: space-between; align-items: flex-start; gap: var(--mp-spacing-6); flex-wrap: wrap; }
.detail-notes-left { display: flex; flex-direction: column; gap: var(--mp-spacing-6); width: min(432px, 100%); }
.detail-note-text { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: pre-line; }
.detail-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-3); width: min(428px, 100%); }
.detail-total-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-total-row--grand { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); padding-top: var(--mp-spacing-3); border-top: 1px solid var(--mp-border-default); }
.detail-updated { align-self: flex-start; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer; }
.detail-updated:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); }
.detail-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; border: 1px solid transparent; white-space: nowrap;
}
.detail-btn--primary { background: var(--mp-colors-emerald-700); border-color: var(--mp-colors-emerald-700); color: var(--mp-text-inverse); }
.detail-btn--primary:hover { background: var(--mp-colors-emerald-800); border-color: var(--mp-colors-emerald-800); }
.detail-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-secondary); }
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.ctd-menu-divider { height: 1px; margin: var(--mp-spacing-1) 0; background: var(--mp-border-default); }
.ctd-menu-item--danger { color: var(--mp-text-danger); }
.ctd-delete-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
.ctd-not-found { padding: var(--mp-spacing-6); }
</style>
