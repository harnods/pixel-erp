<!-- prod-parity: quickbook/app/views/closing_the_books/index.html.haml (+ _index_locks_table, _index_table_ctb, _index_table_lp, locking_periods/_locking_period_index_information, _has_draft_*_modal, _revert_lp_modal) -->
<script setup lang="ts">
/**
 * Accounting → Close books (prod "List of Period Lock & Closing Book").
 * Columns: Period (ⓘ) · Type · Memo · Net Profit Loss · Actions. A draft row offers
 * Change Period / Check Reconciliations / Worksheet / Delete Draft; only the latest
 * published lock can be reverted. Empty company → the "Function differences" guide.
 * Title-bar "Start locking period" / "Start closing book" signal via `closeBooksAction`.
 */
import { type Ref } from 'vue'
import {
  MpButton, MpIcon, MpTooltip, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast, successToast } from '~/utils/toasts'
import {
  closingBooks, sortedBooks, draftOf, latestPublished, lockDate, netProfitOf, deleteDraft, revert,
  type ClosingBook, type LockType,
} from '~/data/closeBooks'

const { t } = useLocale()
const router = useRouter()

type Row = ClosingBook & { periodLabel: string; typeLabel: string; netProfit: number | null; isLatest: boolean }

const latestId = computed(() => latestPublished()?.id)
const rows = computed<Row[]>(() => {
  void closingBooks.length
  const list = sortedBooks()
  return list.map((b) => {
    // Prod: a lock with no start date reads "From beginning".
    const start = b.startDate ? formatDate(b.startDate) : t('From beginning')
    return {
      ...b,
      periodLabel: `${start} - ${formatDate(b.endDate)}`,
      typeLabel: b.lockType === 'ctb' ? t('Closing book') : t('Period lock'),
      netProfit: b.lockType === 'ctb' && b.status === 'published' ? netProfitOf(b) : null,
      isLatest: b.id === latestId.value,
    }
  })
})

const { currentPage, paginated, total, perPage, setPage, setPerPage } = useTableState<Row>(rows, { perPage: 25, defaultSort: { key: 'endDate', dir: 'desc' } })

const columns: TableColumn[] = [
  { key: 'periodLabel', label: t('Period'), kind: 'address' },
  { key: 'typeLabel', label: t('Type'), kind: 'status' },
  { key: 'memo', label: t('Memo'), kind: 'address' },
  { key: 'netProfit', label: t('Net Profit Loss'), kind: 'amount', align: 'right' },
]
const periodTooltip = t('About period column: The end date of period lock and closing book are mutually exclusive. The start date of closing book will refer to the last closing book period to calculate the net profit/loss.')

function money(n: number) { return n < 0 ? `(${formatIDR(-n)})` : formatIDR(n) }

const currentLock = computed(() => lockDate())

// ── Navigation ──
function openRow(r: Row) {
  if (r.status === 'draft') router.push(`/close-books/${r.id}/${r.step}`)
  else router.push(`/close-books/${r.id}`)
}
function goStep(r: Row, step: string) { router.push(`/close-books/${r.id}/${step}`) }

// ── Start (title bar + guide) ──
const blockedOpen = ref<LockType | null>(null)
function start(type: LockType) {
  const other: LockType = type === 'ctb' ? 'lp' : 'ctb'
  if (draftOf(other)) { blockedOpen.value = type; return }
  const draft = draftOf(type)
  if (draft) { router.push(`/close-books/${draft.id}/period`); return }
  router.push({ path: '/close-books/new', query: { type } })
}
const signal = inject<Ref<{ kind: string; n: number }>>('closeBooksAction', ref({ kind: '', n: 0 }))
watch(() => signal.value.n, () => start(signal.value.kind as LockType))

// ── Delete draft / revert ──
const deleteTarget = ref<Row | null>(null)
const deleteOpen = ref(false)
function askDelete(r: Row) { deleteTarget.value = r; deleteOpen.value = true }
function confirmDelete() {
  if (!deleteTarget.value) return
  deleteDraft(deleteTarget.value.id)
  successToast(t('Draft deleted'))
  deleteTarget.value = null
}
const revertTarget = ref<Row | null>(null)
const revertOpen = ref(false)
function askRevert(r: Row) { revertTarget.value = r; revertOpen.value = true }
function confirmRevert() {
  const r = revertTarget.value
  if (!r) return
  revert(r.id)
  successToast(r.lockType === 'ctb' ? t('Reversion of closing book has finished') : t('Period lock reverted'))
  revertTarget.value = null
}
</script>

<template>
  <div v-if="!rows.length" class="cb-guide">
    <div class="cb-guide-copy">
      <h2 class="cb-guide-title">{{ t('Function differences') }}</h2>
      <p class="cb-guide-desc">{{ t('Period lock ensures transactions within the locked period are not changing.') }}</p>
      <p class="cb-guide-desc">{{ t('Closing book includes period lock and the net profit/loss transfer of the previous period into opening balance of the next period through the closing entry.') }}</p>
      <h3 class="cb-guide-sub">{{ t('When to perform') }}</h3>
      <ul class="cb-guide-list">
        <li>{{ t('Period lock can be performed when transactions inside the report are reviewed and don\'t want to change.') }}</li>
        <li>{{ t('Closing book is generally performed at year-end, end of the accounting period, or both.') }}</li>
      </ul>
      <div class="cb-guide-actions">
        <MpButton variant="secondary" is-rounded @click="start('lp')">{{ t('Start locking period') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="start('ctb')">{{ t('Start closing book') }}</MpButton>
        <MpButton variant="ghost" is-rounded @click="infoToast(t('Not in this prototype'))">{{ t('Guide article') }}</MpButton>
      </div>
    </div>
  </div>

  <ErpTablePage
    v-else
    :columns="columns"
    :rows="(paginated as unknown as Record<string, unknown>[])"
    :total="total"
    :current-page="currentPage"
    :per-page="perPage"
    @page-change="setPage"
    @per-page-change="setPerPage"
  >
    <template #filters>
      <div class="cb-filter">
        <span class="cb-lock-date">
          {{ t('Lock date') }}:
          <strong>{{ currentLock ? formatDate(currentLock) : '-' }}</strong>
        </span>
      </div>
    </template>

    <template #header-periodLabel>
      <span class="cb-th">
        {{ t('Period') }}
        <MpTooltip :label="periodTooltip" placement="top" use-portal>
          <span class="cb-th-info"><MpIcon name="info" size="sm" color="icon.secondary" /></span>
        </MpTooltip>
      </span>
    </template>

    <template #cell-periodLabel="{ row }">
      <span class="cb-period">
        <span class="cell-link" @click.stop="openRow(row as unknown as Row)">{{ (row as unknown as Row).periodLabel }}</span>
        <ErpStatusBadge v-if="(row as unknown as Row).status === 'draft'" status="draft" :label="t('Draft')" type="announcement" />
      </span>
    </template>
    <template #cell-memo="{ value }"><span class="cb-memo">{{ value || '-' }}</span></template>
    <template #cell-netProfit="{ row }">{{ (row as unknown as Row).netProfit === null ? '' : money((row as unknown as Row).netProfit!) }}</template>

    <template #actions="{ row }">
      <MpPopover v-if="(row as unknown as Row).status === 'draft' || (row as unknown as Row).isLatest" :id="`cb-actions-${(row as unknown as Row).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="ghost" left-icon="menu-kebab" :aria-label="t('More actions')" is-rounded />
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '200px' })" class="erp-dropdown-menu">
          <MpPopoverList v-if="(row as unknown as Row).status === 'draft'">
            <MpPopoverListItem @click="goStep(row as unknown as Row, 'period')">{{ t('Change Period') }}</MpPopoverListItem>
            <MpPopoverListItem @click="goStep(row as unknown as Row, 'reconciliations')">{{ t('Check Reconciliations') }}</MpPopoverListItem>
            <MpPopoverListItem @click="goStep(row as unknown as Row, 'worksheet')">{{ t('Worksheet') }}</MpPopoverListItem>
            <MpPopoverListItem @click="askDelete(row as unknown as Row)">{{ t('Delete Draft') }}</MpPopoverListItem>
          </MpPopoverList>
          <MpPopoverList v-else>
            <MpPopoverListItem @click="openRow(row as unknown as Row)">{{ t('View details') }}</MpPopoverListItem>
            <MpPopoverListItem @click="askRevert(row as unknown as Row)">{{ t('Revert') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #empty>
      <p class="cb-none">{{ t('You have not closed your accounting book this far') }}</p>
    </template>
  </ErpTablePage>

  <ConfirmModal
    v-model:is-open="deleteOpen"
    :title="t('Delete draft?')"
    :description="t('The draft will be removed from the list.')"
    :confirm-label="t('Delete Draft')"
    @confirm="confirmDelete"
  />
  <ConfirmModal
    v-model:is-open="revertOpen"
    :title="revertTarget?.lockType === 'ctb' ? t('Revert closing book?') : t('Revert lock period?')"
    :description="t('The reversion cannot be stopped once it is started.')"
    :confirm-label="t('Revert')"
    @confirm="confirmRevert"
  />

  <MpModal id="cb-blocked" :is-open="!!blockedOpen" size="sm" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="blockedOpen = null">
    <MpModalContent>
      <MpModalHeader>{{ blockedOpen === 'ctb' ? t('Closing book can\'t be started') : t('Locking period can\'t be started') }}<MpModalCloseButton /></MpModalHeader>
      <MpModalBody>
        {{ blockedOpen === 'ctb'
          ? t('There is a period lock enlisted as a draft. Please delete the period lock draft first.')
          : t('There is a closing book enlisted as a draft. Please delete the closing book draft first.') }}
      </MpModalBody>
      <MpModalFooter>
        <MpButton variant="primary" is-rounded @click="blockedOpen = null">{{ t('Ok, got it') }}</MpButton>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.cb-filter { display: flex; align-items: center; justify-content: flex-end; width: 100%; }
.cb-lock-date { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.cb-lock-date strong { color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }
.cb-th { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); }
.cb-th-info { display: inline-flex; text-transform: none; }
.cb-period { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); white-space: nowrap; }
.cb-memo { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
.cb-none { margin: 0; text-align: center; color: var(--mp-text-secondary); }

.cb-guide { display: flex; }
.cb-guide-copy { max-width: 560px; display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.cb-guide-title { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cb-guide-sub { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cb-guide-desc { margin: 0; color: var(--mp-text-default); }
.cb-guide-list { margin: 0; padding-left: var(--mp-spacing-5); list-style: disc outside; }
.cb-guide-list li { display: list-item; color: var(--mp-text-default); }
.cb-guide-actions { display: flex; gap: var(--mp-spacing-3); margin-top: var(--mp-spacing-3); }
</style>
