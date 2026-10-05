<!-- prod-parity: jurnal-frontend-app/src/pages/reports/sales_list/sales_list.vue -->
<script setup lang="ts">
/**
 * Sales list — Reports › Sales › Sales list.
 * Prod renders a report template (layout) over the transactions of one type.
 * The two built-in Sales Invoice templates are copied column-for-column from
 * quickbook config/report_header_column.yml (ids 1 and 2):
 *   Sales Invoice        → Date · Transaction Type · Transaction Number · Display Name ·
 *                          Status By Today · Memo · Total · Balance Due
 *   Sales Invoice Detail → + Due Date · Gross Amount · Total Tax · Payment
 * TOTAL footer on the last page (prod table-reports), 100 rows per page.
 * Rows read salesInvoices.ts via app/data/salesReports.ts; the number opens the
 * existing invoice detail page.
 */
import { MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import SalesReportShell from '~/components/patterns/SalesReportShell.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import { defaultSalesReportFilters, salesListReport, customerLink, invoiceLink, type SalesReportFilters, type SalesListRow } from '~/data/salesReports'

const { t } = useLocale()
const router = useRouter()

const filters = ref<SalesReportFilters>(defaultSalesReportFilters('list'))
const applied = ref<SalesReportFilters>(defaultSalesReportFilters('list'))

// idle → loading → ready (prod: blank slate until Filter is clicked)
const state = ref<'idle' | 'loading' | 'ready'>('idle')
let timer: ReturnType<typeof setTimeout> | null = null
function run() {
  applied.value = JSON.parse(JSON.stringify(filters.value))
  page.value = 1
  state.value = 'loading'
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { state.value = 'ready' }, 700)
}
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })

// ── Template (report layout) ─────────────────────────────────────────────────
type ColKey = 'date' | 'type' | 'number' | 'person' | 'status' | 'memo' | 'dueDate' | 'gross' | 'tax' | 'total' | 'payment' | 'balance'
const COL_LABEL: Record<ColKey, string> = {
  date: 'Date', type: 'Transaction Type', number: 'Transaction Number', person: 'Display Name',
  status: 'Status By Today', memo: 'Memo', dueDate: 'Due Date', gross: 'Gross Amount',
  tax: 'Total Tax', total: 'Total', payment: 'Payment', balance: 'Balance Due',
}
const NUM: ColKey[] = ['gross', 'tax', 'total', 'payment', 'balance']
const LAYOUTS: { id: string; name: string; cols: ColKey[] }[] = [
  { id: '1', name: 'Sales Invoice', cols: ['date', 'type', 'number', 'person', 'status', 'memo', 'total', 'balance'] },
  { id: '2', name: 'Sales Invoice Detail', cols: ['date', 'type', 'number', 'person', 'status', 'memo', 'dueDate', 'gross', 'tax', 'total', 'payment', 'balance'] },
]
const layoutId = ref('1')
const cols = computed(() => LAYOUTS.find((l) => l.id === layoutId.value)!.cols)
function selectLayout(id: string) { layoutId.value = id; if (state.value !== 'idle') run() }

// ── Data ─────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 100
const page = ref(1)
const report = computed(() => {
  // Only Sales Invoice carries data in this prototype; other types are empty.
  if (applied.value.transactionType !== 'Sales Invoice') return { rows: [] as SalesListRow[], totals: { gross: 0, tax: 0, total: 0, payment: 0, balance: 0 } }
  return salesListReport(applied.value)
})
const pageRows = computed(() => report.value.rows.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))
const lastPage = computed(() => page.value >= Math.ceil(report.value.rows.length / PAGE_SIZE))

function cell(r: SalesListRow, k: ColKey): string {
  switch (k) {
    case 'date': return formatDate(r.date)
    case 'dueDate': return formatDate(r.dueDate)
    case 'type': return r.type
    case 'number': return r.number
    case 'person': return r.customerName
    case 'status': return r.status
    case 'memo': return r.memo
    default: return formatIDR(r[k])
  }
}
function openCustomer(name: string) { const to = customerLink(name); if (to) router.push(to) }
</script>

<template>
  <SalesReportShell
    v-model="filters"
    v-model:page="page"
    title="Sales list"
    kind="list"
    :state="state"
    :has-rows="report.rows.length > 0"
    :page-size="PAGE_SIZE"
    :total-items="report.rows.length"
    item-noun="transactions"
    @run="run"
  >
    <template #actions>
      <MpPopover id="slr-template" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
        <MpPopoverTrigger>
          <MpButton variant="secondary" is-rounded right-icon="caret-down">{{ t('Template') }}</MpButton>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content' })">
          <MpPopoverList>
            <MpPopoverListItem v-for="l in LAYOUTS" :key="l.id" :is-active="layoutId === l.id" @click="selectLayout(l.id)">{{ l.name }}</MpPopoverListItem>
            <MpPopoverListItem @click="infoToast(t('Not in this prototype'))">{{ t('Create template') }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </template>

    <template #head-right>
      <span class="slr-layout">{{ LAYOUTS.find((l) => l.id === layoutId)!.name }}</span>
    </template>

    <table class="slr-table">
      <thead>
        <tr>
          <th v-for="k in cols" :key="k" class="slr-th" :class="{ 'slr-num': NUM.includes(k) }">{{ t(COL_LABEL[k]) }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="r in pageRows" :key="r.id" class="slr-row">
          <td v-for="k in cols" :key="k" class="slr-td" :class="{ 'slr-num': NUM.includes(k), 'slr-wrap': k === 'memo' }">
            <span v-if="k === 'number'" class="slr-link" @click="router.push(invoiceLink(r.id))">{{ cell(r, k) }}</span>
            <span v-else-if="k === 'type'" class="slr-link" @click="router.push(invoiceLink(r.id))">{{ cell(r, k) }}</span>
            <span v-else-if="k === 'person' && customerLink(r.customerName)" class="slr-link" @click="openCustomer(r.customerName)">{{ cell(r, k) }}</span>
            <ErpStatusBadge v-else-if="k === 'status'" :status="r.status.toLowerCase()" />
            <template v-else>{{ cell(r, k) }}</template>
          </td>
        </tr>
      </tbody>
      <tfoot v-if="lastPage">
        <tr class="slr-total">
          <td v-for="(k, i) in cols" :key="k" class="slr-td slr-strong" :class="{ 'slr-num': NUM.includes(k) }">
            <template v-if="i === 0">TOTAL</template>
            <template v-else-if="NUM.includes(k)">{{ formatIDR(report.totals[k as 'gross' | 'tax' | 'total' | 'payment' | 'balance']) }}</template>
          </td>
        </tr>
      </tfoot>
    </table>
  </SalesReportShell>
</template>

<style scoped>
.slr-layout { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.slr-table { width: 100%; min-width: 960px; border-collapse: collapse; }
.slr-th {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle);
  border-top: 1px solid var(--mp-border-default);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-align: left; white-space: nowrap;
}
.slr-td {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  vertical-align: top; white-space: nowrap;
}
.slr-wrap { white-space: normal; min-width: 200px; }
.slr-num { text-align: right; font-variant-numeric: tabular-nums; }
.slr-strong { font-weight: var(--mp-font-weights-semi-bold); }
.slr-row:hover .slr-td { background: var(--mp-background-neutral-subtle); }
.slr-total .slr-td { border-top: 1px solid var(--mp-text-default); border-bottom: 1px solid var(--mp-text-default); }
.slr-link { color: var(--mp-text-link); cursor: pointer; }
.slr-link:hover { text-decoration: underline; text-underline-offset: 2px; }
</style>
