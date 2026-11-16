<!-- prod-parity: jurnal-frontend-app/src/pages/reports/sales_by_product/index.vue (+ i18n.json, components/filter-drawer.vue) -->
<script setup lang="ts">
/**
 * Sales by product — Reports › Sales › Sales by product.
 * Summary (default), Sales invoice columns:
 *   Product code / SKU · Product name · Sales qty · Return qty · Unit · Sales value ·
 *   Return value · Average sales value — footer "Total sales value" (+ return value).
 * Detailed version (drawer › "View detailed version"): one band per product with
 * its transactions —
 *   Product name & Date · Transaction type · Transaction no. · Customer · Qty · Unit ·
 *   Price per unit · Total price · Discount · Final price — Subtotal per product, Total.
 * Sales value / Final price are each line's share of its invoice total (line amount
 * less its share of the invoice discount, plus its PPN), so Total sales value equals
 * the Sales list Total and the Sales by customer Total for the same filters
 * (asserted in app/data/salesReports.ts). Prod sums the tax-exclusive line amount;
 * the brief's tie-out wins here. No returns exist in the mock, so Return qty /
 * Return value are 0.
 */
import { MpIcon, MpButton } from '@mekari/pixel3'
import SalesReportShell from '~/components/patterns/SalesReportShell.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import {
  defaultSalesReportFilters, salesByProductReport, invoiceLink, productLink, customerLink,
  type SalesReportFilters, type SalesByProductResult,
} from '~/data/salesReports'

const { t } = useLocale()
const router = useRouter()

const filters = ref<SalesReportFilters>(defaultSalesReportFilters('product'))
const applied = ref<SalesReportFilters>(defaultSalesReportFilters('product'))

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

const isInvoice = computed(() => applied.value.transactionType === 'Sales invoice')
const isQuote = computed(() => applied.value.transactionType === 'Sales quotation')
const detail = computed(() => applied.value.showDetail)

const EMPTY: SalesByProductResult = { products: [], totals: { salesQty: 0, returnQty: 0, salesValue: 0, returnValue: 0, totalPrice: 0 } }
const report = computed<SalesByProductResult>(() => (isInvoice.value ? salesByProductReport(applied.value) : EMPTY))

const PAGE_SIZE = 25
const page = ref(1)
const pageProducts = computed(() => report.value.products.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

// Summary column set follows prod: invoice adds Return qty + Return value; order adds
// Shipped qty; quotation keeps the base set.
const summaryCols = computed(() => {
  const c: { key: string; label: string; num?: boolean }[] = [
    { key: 'code', label: 'Product code / SKU' },
    { key: 'name', label: 'Product name' },
    { key: 'qty', label: isQuote.value || !isInvoice.value ? 'Qty' : 'Sales qty', num: true },
  ]
  if (isInvoice.value) c.push({ key: 'return_qty', label: 'Return qty', num: true })
  else if (!isQuote.value) c.push({ key: 'shipped_qty', label: 'Shipped qty', num: true })
  c.push({ key: 'unit', label: 'Unit' }, { key: 'value', label: 'Sales value', num: true })
  if (isInvoice.value) c.push({ key: 'return_value', label: 'Return value', num: true })
  c.push({ key: 'avg', label: 'Average sales value', num: true })
  return c
})
const DETAIL_COLS = [
  { key: 'date', label: 'Product name & Date' },
  { key: 'type', label: 'Transaction type' },
  { key: 'no', label: 'Transaction no.' },
  { key: 'customer', label: 'Customer' },
  { key: 'qty', label: 'Qty', num: true },
  { key: 'unit', label: 'Unit' },
  { key: 'price', label: 'Price per unit', num: true },
  { key: 'total_price', label: 'Total price', num: true },
  { key: 'discount', label: 'Discount' },
  { key: 'final', label: 'Final price', num: true },
]

const collapsed = ref<Set<string>>(new Set())
const isOpen = (sku: string) => !collapsed.value.has(sku)
function toggle(sku: string) { const s = new Set(collapsed.value); s.has(sku) ? s.delete(sku) : s.add(sku); collapsed.value = s }
const allCollapsed = computed(() => pageProducts.value.length > 0 && pageProducts.value.every((p) => collapsed.value.has(p.sku)))
function toggleAll() { collapsed.value = allCollapsed.value ? new Set() : new Set(pageProducts.value.map((p) => p.sku)) }

function qty(n: number) { return n.toLocaleString('id-ID') }
function openCustomer(name: string) { const to = customerLink(name); if (to) router.push(to) }
</script>

<template>
  <SalesReportShell
    v-model="filters"
    v-model:page="page"
    title="Sales by product"
    kind="product"
    run-label="Show"
    loading-label="Loading report"
    :state="state"
    :has-rows="report.products.length > 0"
    :page-size="PAGE_SIZE"
    :total-items="report.products.length"
    item-noun="products"
    @run="run"
  >
    <template v-if="detail" #head-right>
      <MpButton variant="textLink" is-rounded @click="toggleAll">{{ allCollapsed ? t('Expand all') : t('Collapse all') }}</MpButton>
    </template>

    <!-- ── Summary ── -->
    <table v-if="!detail" class="sbp-table">
      <thead>
        <tr>
          <th v-for="c in summaryCols" :key="c.key" class="sbp-th" :class="{ 'sbp-num': c.num }">{{ t(c.label) }}</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="p in pageProducts" :key="p.sku" class="sbp-row">
          <td v-for="c in summaryCols" :key="c.key" class="sbp-td" :class="{ 'sbp-num': c.num, 'sbp-wrap': c.key === 'name' }">
            <template v-if="c.key === 'code'">{{ p.sku }}</template>
            <span v-else-if="c.key === 'name'" class="sbp-link" @click="router.push(productLink(p.sku))">{{ p.productName }}</span>
            <template v-else-if="c.key === 'qty'">{{ qty(p.salesQty) }}</template>
            <template v-else-if="c.key === 'return_qty' || c.key === 'shipped_qty'">{{ qty(p.returnQty) }}</template>
            <template v-else-if="c.key === 'unit'">{{ p.unit }}</template>
            <template v-else-if="c.key === 'value'">{{ formatIDR(p.salesValue) }}</template>
            <template v-else-if="c.key === 'return_value'">{{ formatIDR(p.returnValue) }}</template>
            <template v-else-if="c.key === 'avg'">{{ formatIDR(Math.round(p.avgValue)) }}</template>
          </td>
        </tr>
      </tbody>
      <tfoot>
        <tr class="sbp-total">
          <td class="sbp-td sbp-strong">{{ t('Total sales value') }}</td>
          <td class="sbp-td sbp-num sbp-strong" :colspan="isInvoice ? summaryCols.length - 3 : summaryCols.length - 2">{{ formatIDR(report.totals.salesValue) }}</td>
          <td v-if="isInvoice" class="sbp-td sbp-num sbp-strong">{{ formatIDR(report.totals.returnValue) }}</td>
          <td class="sbp-td" />
        </tr>
      </tfoot>
    </table>

    <!-- ── Detailed version ── -->
    <table v-else class="sbp-table sbp-table--detail">
      <thead>
        <tr>
          <th v-for="c in DETAIL_COLS" :key="c.key" class="sbp-th" :class="{ 'sbp-num': c.num }">{{ t(c.label) }}</th>
        </tr>
      </thead>
      <tbody v-for="p in pageProducts" :key="p.sku">
        <tr class="sbp-row sbp-row--parent" @click="toggle(p.sku)">
          <td class="sbp-td sbp-td--parent" :colspan="DETAIL_COLS.length">
            <span class="sbp-parent">
              <MpIcon :name="isOpen(p.sku) ? 'caret-down' : 'caret-right'" size="sm" class="sbp-chev" />
              <span class="sbp-strong">{{ p.sku }}</span>
              <span class="sbp-link sbp-strong" @click.stop="router.push(productLink(p.sku))">{{ p.productName }}</span>
            </span>
          </td>
        </tr>
        <template v-if="isOpen(p.sku)">
          <tr v-for="l in p.lines" :key="l.key" class="sbp-row">
            <td class="sbp-td sbp-indent">{{ formatDate(l.date) }}</td>
            <td class="sbp-td"><span class="sbp-link" @click="router.push(invoiceLink(l.invoiceId))">{{ l.type }}</span></td>
            <td class="sbp-td"><span class="sbp-link" @click="router.push(invoiceLink(l.invoiceId))">{{ l.number }}</span></td>
            <td class="sbp-td sbp-wrap">
              <span v-if="customerLink(l.customerName)" class="sbp-link" @click="openCustomer(l.customerName)">{{ l.customerName }}</span>
              <template v-else>{{ l.customerName }}</template>
            </td>
            <td class="sbp-td sbp-num">{{ qty(l.qty) }}</td>
            <td class="sbp-td">{{ l.unit }}</td>
            <td class="sbp-td sbp-num">{{ formatIDR(l.unitPrice) }}</td>
            <td class="sbp-td sbp-num">{{ formatIDR(l.totalPrice) }}</td>
            <td class="sbp-td">{{ l.discountPct }}%</td>
            <td class="sbp-td sbp-num">{{ formatIDR(l.finalPrice) }}</td>
          </tr>
          <tr class="sbp-row sbp-row--sub">
            <td class="sbp-td sbp-strong">Subtotal</td>
            <td class="sbp-td sbp-num" colspan="4">{{ qty(p.salesQty) }}</td>
            <td class="sbp-td sbp-num" colspan="3">{{ formatIDR(p.totalPrice) }}</td>
            <td class="sbp-td sbp-num" colspan="2">{{ formatIDR(p.salesValue) }}</td>
          </tr>
        </template>
      </tbody>
      <tfoot>
        <tr class="sbp-total">
          <td class="sbp-td sbp-strong">Total</td>
          <td class="sbp-td sbp-num sbp-strong" colspan="4">{{ qty(report.totals.salesQty) }}</td>
          <td class="sbp-td sbp-num sbp-strong" colspan="3">{{ formatIDR(report.totals.totalPrice) }}</td>
          <td class="sbp-td sbp-num sbp-strong" colspan="2">{{ formatIDR(report.totals.salesValue) }}</td>
        </tr>
      </tfoot>
    </table>
  </SalesReportShell>
</template>

<style scoped>
.sbp-table { width: 100%; min-width: 1000px; border-collapse: collapse; }
.sbp-table--detail { min-width: 1200px; }
.sbp-th {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle);
  border-top: 1px solid var(--mp-border-default);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-align: left; white-space: nowrap;
}
.sbp-td {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  vertical-align: top; white-space: nowrap;
}
.sbp-num { text-align: right; font-variant-numeric: tabular-nums; }
.sbp-wrap { white-space: normal; min-width: 200px; }
.sbp-strong { font-weight: var(--mp-font-weights-semi-bold); }
.sbp-indent { padding-left: var(--mp-spacing-8); }
.sbp-row:not(.sbp-row--sub):hover .sbp-td { background: var(--mp-background-neutral-subtle); }
.sbp-row--parent { cursor: pointer; }
.sbp-parent { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.sbp-chev { color: var(--mp-colors-icon-default); flex-shrink: 0; }
.sbp-row--sub .sbp-td { background: var(--mp-background-neutral-subtle); border-bottom-color: var(--mp-text-default); }
.sbp-total .sbp-td { border-top: 1px solid var(--mp-text-default); border-bottom: 1px solid var(--mp-text-default); }
.sbp-link { color: var(--mp-text-link); cursor: pointer; }
.sbp-link:hover { text-decoration: underline; text-underline-offset: 2px; }
</style>
