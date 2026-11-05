<!-- prod-parity: jurnal-frontend-app/src/pages/reports/purchases_list/purchases_list.vue (+ purchases_list-i18n.json, components/more-filter.vue) -->
<script setup lang="ts">
/**
 * Reports › Purchases › Purchase List. Prod: Start/End date + Period, "Filter"
 * button, "More filter" drawer, Template popover (default layouts "Purchase
 * Invoice" / "Purchase Invoice Detail" from quickbook report_header_column.yml),
 * Export (PDF / Excel / CSV), table with a TOTAL row.
 * Rows come from purchaseInvoices.ts; the number opens the purchase invoice.
 */
import { MpButton, MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import PurchaseReportShell from '~/components/patterns/PurchaseReportShell.vue'
import PurchaseReportFiltersDrawer, { type PurchaseReportDrawerValue } from '~/components/patterns/PurchaseReportFiltersDrawer.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import {
  PUR_RPT_LIST_TRANSACTION_TYPES, emptyPurRptFilters, purchasesListRows, purRptSum, assertPurchaseReportsTie,
  type PurRptListRow,
} from '~/data/purchaseReports'

const router = useRouter()

const DEFAULTS: PurchaseReportDrawerValue = {
  range: [new Date(2026, 7, 1), new Date(2026, 7, 31)],
  transactionType: 'Purchase Invoice',
  filters: emptyPurRptFilters(),
  sortBy: '', sortLogic: 'asc', showDetail: false,
}
const pendingRange = ref<Date[]>([...DEFAULTS.range])
const applied = reactive<PurchaseReportDrawerValue>({ ...DEFAULTS, range: [...DEFAULTS.range], filters: emptyPurRptFilters() })
const drawerOpen = ref(false)
const filterActive = ref(false)
const error = ref('')

const state = ref<'idle' | 'loading' | 'ready'>('idle')
let timer: ReturnType<typeof setTimeout> | null = null
function generate() {
  state.value = 'loading'
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { state.value = 'ready' }, 700)
}
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })

function show() {
  const [s, e] = pendingRange.value
  if (!s || !e) { error.value = 'Start date and end date are required.'; return }
  error.value = ''
  applied.range = [...pendingRange.value]
  generate()
}
function onApply(v: PurchaseReportDrawerValue) {
  pendingRange.value = [...v.range]
  Object.assign(applied, { ...v, range: [...v.range] })
  if (v.transactionType !== DEFAULTS.transactionType) layoutId.value = 'invoice'
  filterActive.value = true
  generate()
}

// ── Template (report layout) ──────────────────────────────────────────────────
type ColKey = 'date' | 'type' | 'number' | 'name' | 'status' | 'memo' | 'dueDate' | 'gross' | 'tax' | 'total' | 'payment' | 'balance'
const COLUMNS: Record<ColKey, { label: string; num?: boolean }> = {
  date: { label: 'Date' },
  type: { label: 'Transaction Type' },
  number: { label: 'Transaction Number' },
  name: { label: 'Display Name' },
  status: { label: 'Status By Today' },
  memo: { label: 'Memo' },
  dueDate: { label: 'Due Date' },
  gross: { label: 'Gross Amount', num: true },
  tax: { label: 'Total Tax', num: true },
  total: { label: 'Total', num: true },
  payment: { label: 'Payment', num: true },
  balance: { label: 'Balance Due', num: true },
}
const LAYOUTS: { id: string; name: string; cols: ColKey[] }[] = [
  { id: 'invoice', name: 'Purchase Invoice', cols: ['date', 'type', 'number', 'name', 'status', 'memo', 'total', 'balance'] },
  { id: 'invoice-detail', name: 'Purchase Invoice Detail', cols: ['date', 'type', 'number', 'name', 'status', 'memo', 'dueDate', 'gross', 'tax', 'total', 'payment', 'balance'] },
]
const layoutId = ref('invoice')
const cols = computed(() => LAYOUTS.find((l) => l.id === layoutId.value)!.cols)
function selectLayout(id: string) { layoutId.value = id; applied.range = [...pendingRange.value]; generate() }

// ── Rows ──────────────────────────────────────────────────────────────────────
const rows = computed<PurRptListRow[]>(() => {
  if (state.value === 'idle' || applied.transactionType !== 'Purchase Invoice') return []
  return purchasesListRows(applied.range, applied.filters)
})
const NUM_KEY: Partial<Record<ColKey, keyof PurRptListRow>> = { gross: 'grossAmount', tax: 'totalTax', total: 'total', payment: 'payment', balance: 'balanceDue' }
const totals = computed(() => {
  const out: Partial<Record<ColKey, number>> = {}
  for (const c of cols.value) { const k = NUM_KEY[c]; if (k) out[c] = purRptSum(rows.value, k) }
  return out
})
// Dev check: the list total ties to Purchase by vendor / by product for the same period + filters.
watch(() => state.value, (s) => { if (s === 'ready' && import.meta.dev) assertPurchaseReportsTie(applied.range, applied.filters) })

function cell(r: PurRptListRow, c: ColKey): string {
  switch (c) {
    case 'date': return formatDate(r.date)
    case 'type': return r.transactionType
    case 'number': return r.number
    case 'name': return r.displayName
    case 'status': return r.status
    case 'memo': return r.memo
    case 'dueDate': return formatDate(r.dueDate)
    default: return formatIDR(Number(r[NUM_KEY[c]!]))
  }
}
</script>

<template>
  <div class="prl-root">
  <PurchaseReportShell
    id="prl"
    title="Purchase List"
    v-model:range="pendingRange"
    :state="state"
    :has-rows="rows.length > 0"
    primary-label="Filter"
    filter-label="More filter"
    :filter-active="filterActive"
    :error="error"
    @show="show"
    @open-filter="drawerOpen = true"
  >
    <template #controls-right>
      <MpPopover id="prl-template" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="secondary" is-rounded right-icon="caret-down">Template</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '240px', width: 'max-content' })">
          <MpPopoverList>
            <MpPopoverListItem v-for="l in LAYOUTS" :key="l.id" :is-active="layoutId === l.id" @click="selectLayout(l.id)">{{ l.name }}</MpPopoverListItem>
            <MpPopoverListItem @click="infoToast('Not in this prototype')"><span class="prl-create">Create template</span></MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <div class="prr-table-wrap">
      <table class="prr-table">
        <thead>
          <tr>
            <th v-for="c in cols" :key="c" class="prr-th" :class="{ 'prr-th--num': COLUMNS[c].num }">{{ COLUMNS[c].label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="r in rows" :key="r.id" class="prr-row">
            <td v-for="c in cols" :key="c" class="prr-td" :class="{ 'prr-td--num': COLUMNS[c].num, 'prr-td--nowrap': ['date', 'dueDate', 'number', 'type', 'status'].includes(c), 'prr-td--memo': c === 'memo', 'prr-td--name': c === 'name' }">
              <a v-if="c === 'number' || c === 'type'" class="prr-a" role="link" tabindex="0" @click="router.push(r.link)" @keydown.enter="router.push(r.link)">{{ cell(r, c) }}</a>
              <template v-else>{{ cell(r, c) }}</template>
            </td>
          </tr>
          <tr class="prr-row--total">
            <td v-for="(c, i) in cols" :key="c" class="prr-td" :class="{ 'prr-td--num': COLUMNS[c].num }">
              <template v-if="i === 0">TOTAL</template>
              <template v-else-if="totals[c] !== undefined">{{ formatIDR(totals[c]!) }}</template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <p class="prr-foot-note">Showing total of {{ rows.length }} lines</p>
  </PurchaseReportShell>

  <PurchaseReportFiltersDrawer
    v-model:is-open="drawerOpen"
    variant="list"
    :model-value="{ ...applied, range: pendingRange }"
    :defaults="DEFAULTS"
    :transaction-types="[...PUR_RPT_LIST_TRANSACTION_TYPES]"
    @apply="onApply"
  />
  </div>
</template>

<style scoped>
.prl-root { height: 100%; min-height: 0; }
.prl-create { color: var(--mp-text-link); font-weight: var(--mp-font-weights-semi-bold); }
</style>
