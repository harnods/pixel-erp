<!-- prod-parity: jurnal-accounting-frontend/src/modules/reconciliation/components/matched/MatchedTab.vue -->
<script setup lang="ts">
/**
 * Matched — reconciled pairs (bank statement line(s) ↔ book transaction(s)).
 * Method filter + search; row kebab: View details (Matched details modal) /
 * Unmatch (confirm → the statement line returns to To match).
 */
import {
  MpButton, MpButtonGroup, MpIcon, MpBadge,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton, toast, css,
} from '@mekari/pixel3'
import ErpTablePage, { type TableColumn } from '~/components/patterns/ErpTablePage.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import {
  reconMatchedPairs, reconUnmatch, RECON_METHOD_LABELS,
  type CashAccount, type ReconMatchedPair, type ReconMethod,
} from '~/data'
import { formatMoney } from '~/utils/currency'
import { formatDate } from '~/utils/date'

const props = defineProps<{ account: CashAccount }>()
const { t } = useLocale()

interface MatchedRow {
  id: string
  statementDate: string
  statementAmount: number
  bookDate: string
  bookAmount: number
  method: ReconMethod
  pair: ReconMatchedPair
}

const columns: TableColumn[] = [
  { key: 'statementDate', label: 'Statement date', kind: 'date', sortType: 'date' },
  { key: 'statementAmount', label: 'Statement amount', kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'bookDate', label: 'Book date', kind: 'date', sortType: 'date' },
  { key: 'bookAmount', label: 'Book amount', kind: 'amount', align: 'right', sortType: 'number' },
  { key: 'method', label: 'Method', kind: 'status' },
]
const METHOD_OPTIONS = (Object.keys(RECON_METHOD_LABELS) as ReconMethod[]).map(k => ({ value: k, label: RECON_METHOD_LABELS[k] }))
const METHOD_COLOR: Record<ReconMethod, 'gray' | 'blue' | 'green'> = { manual: 'gray', matched: 'blue', bank_rule: 'green' }

const loading = ref(true)
onMounted(() => { setTimeout(() => { loading.value = false }, 400) })

const method = ref('')
const rows = computed<MatchedRow[]>(() => reconMatchedPairs(props.account.id)
  .filter(p => !method.value || p.method === method.value)
  .map(p => {
    const sign = (p.statementLines[0]?.direction ?? p.transactions[0]?.direction) === 'out' ? -1 : 1
    return {
      id: p.id,
      statementDate: p.statementLines[0]?.date ?? '',
      statementAmount: sign * p.statementLines.reduce((s, l) => s + l.amount, 0),
      bookDate: p.transactions[0]?.date ?? '',
      bookAmount: sign * p.transactions.reduce((s, x) => s + x.amount, 0),
      method: p.method,
      pair: p,
    }
  }))
const { search, currentPage, paginated, total, perPage, setPage, setPerPage, sortKey, sortDir, toggleSort, setSort } =
  useTableState(rows, {
    defaultSort: { key: 'statementDate', dir: 'desc' },
    filterFn: (r: MatchedRow, s) =>
      r.pair.statementLines.some(l => l.description.toLowerCase().includes(s))
      || r.pair.transactions.some(x => `${x.type} #${x.number}`.toLowerCase().includes(s) || x.contact.toLowerCase().includes(s)),
  })
const hasActiveFilter = computed(() => !!search.value || !!method.value)
function clearFilters() { search.value = ''; method.value = '' }

function money(n: number) { return formatMoney(n, props.account.currency) }
function stmtCaption(r: MatchedRow) {
  const n = r.pair.statementLines.length
  return n > 1 ? `${n} ${t('bank statement line(s)')}` : (r.pair.statementLines[0]?.description ?? '')
}
function bookCaption(r: MatchedRow) {
  const n = r.pair.transactions.length
  if (n > 1) return `${n} ${t('transaction(s)')}`
  const x = r.pair.transactions[0]
  return x ? `${x.type} #${x.number}` : ''
}

// ── Details / unmatch ──
const detail = ref<MatchedRow | null>(null)
const unmatchTarget = ref<MatchedRow | null>(null)
function confirmUnmatch() {
  if (!unmatchTarget.value) return
  reconUnmatch(unmatchTarget.value.pair)
  unmatchTarget.value = null
  detail.value = null
  toast.notify({ variant: 'success', title: t('Bank statement unmatched'), maxWidth: 'max-content' })
}
const detailDifference = computed(() => detail.value ? Math.abs(detail.value.statementAmount) - Math.abs(detail.value.bookAmount) : 0)
</script>

<template>
  <div class="mt">
    <ErpTablePage
      :columns="columns"
      :rows="(paginated as unknown as Record<string, unknown>[])"
      :total="total"
      :current-page="currentPage"
      :per-page="perPage"
      :sort-key="sortKey"
      :sort-dir="sortDir"
      :search="search"
      :loading="loading"
      :has-active-filter="hasActiveFilter"
      filter-empty-label="matched pair"
      @page-change="setPage"
      @per-page-change="setPerPage"
      @sort="toggleSort"
      @sort-change="setSort"
      @clear-filters="clearFilters"
    >
      <template #filters>
        <div class="mt-filter-left">
          <ErpFilterSelect id="mt-method" v-model="method" :placeholder="t('Method')" :options="METHOD_OPTIONS" />
        </div>
        <div class="filter-search">
          <MpIcon name="search" size="sm" />
          <input v-model="search" class="filter-search-input btn-enterprise" type="text" :placeholder="t('Search...')" :aria-label="t('Search...')" />
        </div>
      </template>

      <template #cell-statementDate="{ row }">
        <div class="mt-cell">
          <span>{{ formatDate((row as unknown as MatchedRow).statementDate) }}</span>
          <span class="mt-sub">{{ stmtCaption(row as unknown as MatchedRow) }}</span>
        </div>
      </template>
      <template #cell-statementAmount="{ row }">{{ money((row as unknown as MatchedRow).statementAmount) }}</template>
      <template #cell-bookDate="{ row }">
        <div class="mt-cell">
          <span>{{ formatDate((row as unknown as MatchedRow).bookDate) }}</span>
          <span class="cell-link mt-sub-link" @click.stop="detail = (row as unknown as MatchedRow)">{{ bookCaption(row as unknown as MatchedRow) }}</span>
        </div>
      </template>
      <template #cell-bookAmount="{ row }">{{ money((row as unknown as MatchedRow).bookAmount) }}</template>
      <template #cell-method="{ row }">
        <MpBadge variant="subtle" :variant-color="METHOD_COLOR[(row as unknown as MatchedRow).method]">{{ t(RECON_METHOD_LABELS[(row as unknown as MatchedRow).method]) }}</MpBadge>
      </template>

      <template #actions="{ row }">
        <MpPopover :id="`mt-act-${(row as unknown as MatchedRow).id}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton variant="ghost" is-rounded class="mt-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="sm" /></MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="detail = (row as unknown as MatchedRow)">{{ t('View details') }}</MpPopoverListItem>
              <MpPopoverListItem @click="unmatchTarget = (row as unknown as MatchedRow)">{{ t('Unmatch') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </template>

      <template #empty>
        <div class="empty-full">
          <img src="/illustrations/empty-folder.png" alt="" class="empty-full__illustration" width="288" height="240" />
          <p class="empty-full__title">{{ t('No matched pairs yet.') }}</p>
        </div>
      </template>
    </ErpTablePage>

    <!-- Matched details -->
    <MpModal id="mt-detail" :is-open="detail !== null" size="lg" :is-keep-alive="false" :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="detail = null">
      <MpModalContent>
        <MpModalHeader>{{ t('Matched details') }}<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <div v-if="detail" class="md">
            <section class="md-section">
              <div class="md-section__head">
                <p class="md-title">{{ t('Bank statement lines') }}</p>
                <span class="mt-sub">{{ detail.pair.statementLines.length }} {{ t('line(s)') }}</span>
              </div>
              <div class="md-table">
                <div class="md-row md-row--head"><span>{{ t('Date') }}</span><span>{{ t('Description') }}</span><span class="md-right">{{ t('Amount') }}</span></div>
                <div v-for="l in detail.pair.statementLines" :key="l.id" class="md-row">
                  <span>{{ formatDate(l.date) }}</span><span>{{ l.description }}</span><span class="md-right">{{ money(l.amount) }}</span>
                </div>
                <div class="md-row md-row--total"><span /><span>{{ t('Total') }}</span><span class="md-right">{{ money(Math.abs(detail.statementAmount)) }}</span></div>
              </div>
            </section>
            <section class="md-section">
              <div class="md-section__head">
                <p class="md-title">{{ t('Matched transactions') }}</p>
                <span class="mt-sub">{{ detail.pair.transactions.length }} {{ t('line(s)') }}</span>
              </div>
              <div class="md-table">
                <div class="md-row md-row--head md-row--4"><span>{{ t('Number') }}</span><span>{{ t('Date') }}</span><span>{{ t('Description') }}</span><span class="md-right">{{ t('Amount') }}</span></div>
                <div v-for="x in detail.pair.transactions" :key="x.id" class="md-row md-row--4">
                  <span>{{ x.type }} #{{ x.number }}</span><span>{{ formatDate(x.date) }}</span><span>{{ x.description }}</span><span class="md-right">{{ money(x.amount) }}</span>
                </div>
                <div class="md-row md-row--4 md-row--total"><span /><span /><span>{{ t('Total') }}</span><span class="md-right">{{ money(Math.abs(detail.bookAmount)) }}</span></div>
              </div>
            </section>
            <div class="md-diff"><span>{{ t('Difference') }}</span><span>{{ money(detailDifference) }}</span></div>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup>
            <MpButton variant="ghost" is-rounded @click="detail = null">{{ t('Cancel') }}</MpButton>
            <MpButton variant="secondary" is-rounded @click="unmatchTarget = detail">{{ t('Unmatch') }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <ConfirmModal
      :is-open="unmatchTarget !== null"
      :title="t('Unmatch this pair?')"
      :description="t('The bank statement line returns to To match.')"
      :confirm-label="t('Unmatch')"
      @update:is-open="(v: boolean) => { if (!v) unmatchTarget = null }"
      @confirm="confirmUnmatch"
    />
  </div>
</template>

<style scoped>
.mt { padding-top: var(--mp-spacing-5); }
.mt-filter-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.mt-cell { display: flex; flex-direction: column; min-width: 0; }
.mt-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mt-sub-link { font-size: var(--mp-font-sizes-sm); }
.mt-kebab { min-width: 0 !important; }
.md { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.md-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.md-section__head { display: flex; align-items: baseline; justify-content: space-between; }
.md-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.md-table { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); overflow: hidden; }
.md-row { display: grid; grid-template-columns: 110px 1fr 160px; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.md-row--4 { grid-template-columns: 170px 110px 1fr 160px; }
.md-row:last-child { border-bottom: none; }
.md-row--head { background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); text-transform: uppercase; color: var(--mp-text-secondary); }
.md-row--total { font-weight: var(--mp-font-weights-semi-bold); }
.md-right { text-align: right; font-variant-numeric: tabular-nums; }
.md-diff { display: flex; justify-content: flex-end; gap: var(--mp-spacing-6); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); }
.empty-full { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-10, 40px) 0; }
.empty-full__illustration { width: var(--mp-sizes-72, 288px); height: var(--mp-sizes-60, 240px); object-fit: contain; }
.empty-full__title { margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
</style>
