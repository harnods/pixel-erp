<!-- prod-parity: jurnal-frontend-app/src/pages/reports/sales_by_customer/sales_by_customer.vue (+ default.js columns, components/filter.vue) -->
<script setup lang="ts">
/**
 * Sales by customer — Reports › Sales › Sales by customer.
 * Prod (report_sales_by_customer_improvement): a collapsible table, one parent
 * row per customer, expanding to its transaction lines —
 *   Customer / Date · Transaction type · Transaction no. · Product name · Description ·
 *   Qty · Unit · Price per unit · Amount due · Total amount due (running)
 * — then a Subtotal row per customer and a grand Total row. Each invoice's tax
 * is its own line after the product lines (prod person_transaction_service), so
 * the Total includes tax and equals the Sales list Total for the same filters.
 * 25 customers per page. Transaction type / no. open the invoice detail page.
 */
import { MpIcon, MpButton } from '@mekari/pixel3'
import SalesReportShell from '~/components/patterns/SalesReportShell.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import {
  defaultSalesReportFilters, salesByCustomerReport, customerLink, invoiceLink, productLink,
  type SalesReportFilters, type SalesByCustomerResult,
} from '~/data/salesReports'

const { t } = useLocale()
const router = useRouter()

const filters = ref<SalesReportFilters>(defaultSalesReportFilters('customer'))
const applied = ref<SalesReportFilters>(defaultSalesReportFilters('customer'))

const state = ref<'idle' | 'loading' | 'ready'>('idle')
let timer: ReturnType<typeof setTimeout> | null = null
function run() {
  applied.value = JSON.parse(JSON.stringify(filters.value))
  page.value = 1
  expanded.value = new Set()
  state.value = 'loading'
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { state.value = 'ready' }, 700)
}
onBeforeUnmount(() => { if (timer) clearTimeout(timer) })

const COLUMNS = [
  { key: 'customer_date', label: 'Customer / Date' },
  { key: 'type', label: 'Transaction type' },
  { key: 'transaction_no', label: 'Transaction no.' },
  { key: 'product_name', label: 'Product name' },
  { key: 'description', label: 'Description' },
  { key: 'quantity', label: 'Qty', num: true },
  { key: 'unit', label: 'Unit' },
  { key: 'unit_price', label: 'Price per unit', num: true },
  { key: 'amount', label: 'Amount due', num: true },
  { key: 'total', label: 'Total amount due', num: true },
]

const PAGE_SIZE = 25
const page = ref(1)
const report = computed<SalesByCustomerResult>(() =>
  applied.value.transactionType === 'Sales invoice' ? salesByCustomerReport(applied.value) : { groups: [], total: 0 })
const pageGroups = computed(() => report.value.groups.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE))

// Prod rows start collapsed and load their lines on expand.
const expanded = ref<Set<string>>(new Set())
const isOpen = (id: string) => expanded.value.has(id)
function toggle(id: string) { const s = new Set(expanded.value); s.has(id) ? s.delete(id) : s.add(id); expanded.value = s }
const allOpen = computed(() => pageGroups.value.length > 0 && pageGroups.value.every((g) => expanded.value.has(g.customerId)))
function toggleAll() { expanded.value = allOpen.value ? new Set() : new Set(pageGroups.value.map((g) => g.customerId)) }

function qty(n: number | null) { return n === null ? '' : n.toLocaleString('id-ID') }
function openCustomer(name: string) { const to = customerLink(name); if (to) router.push(to) }
</script>

<template>
  <SalesReportShell
    v-model="filters"
    v-model:page="page"
    title="Sales by customer"
    kind="customer"
    run-label="Show"
    loading-label="Loading report"
    :state="state"
    :has-rows="report.groups.length > 0"
    :page-size="PAGE_SIZE"
    :total-items="report.groups.length"
    item-noun="customers"
    @run="run"
  >
    <template #head-right>
      <MpButton variant="textLink" is-rounded @click="toggleAll">{{ allOpen ? t('Collapse all') : t('Expand all') }}</MpButton>
    </template>

    <table class="sbc-table">
      <thead>
        <tr>
          <th v-for="c in COLUMNS" :key="c.key" class="sbc-th" :class="{ 'sbc-num': c.num }">{{ t(c.label) }}</th>
        </tr>
      </thead>
      <tbody v-for="g in pageGroups" :key="g.customerId">
        <tr class="sbc-row sbc-row--parent" @click="toggle(g.customerId)">
          <td class="sbc-td sbc-td--parent" :colspan="COLUMNS.length">
            <span class="sbc-parent">
              <MpIcon :name="isOpen(g.customerId) ? 'caret-down' : 'caret-right'" size="sm" class="sbc-chev" />
              <span v-if="customerLink(g.customerName)" class="sbc-link sbc-strong" @click.stop="openCustomer(g.customerName)">{{ g.customerName }}</span>
              <span v-else class="sbc-strong">{{ g.customerName }}</span>
            </span>
          </td>
        </tr>
        <template v-if="isOpen(g.customerId)">
          <tr v-for="r in g.rows" :key="r.key" class="sbc-row">
            <td class="sbc-td sbc-indent">{{ formatDate(r.date) }}</td>
            <td class="sbc-td"><span class="sbc-link" @click="router.push(invoiceLink(r.invoiceId))">{{ r.type }}</span></td>
            <td class="sbc-td"><span class="sbc-link" @click="router.push(invoiceLink(r.invoiceId))">{{ r.number }}</span></td>
            <td class="sbc-td sbc-wrap">
              <span v-if="r.kind === 'product'" class="sbc-link" @click="router.push(productLink(r.sku))">{{ r.productName }}</span>
              <template v-else>{{ r.productName }}</template>
            </td>
            <td class="sbc-td sbc-wrap sbc-muted">{{ r.description }}</td>
            <td class="sbc-td sbc-num">{{ qty(r.qty) }}</td>
            <td class="sbc-td">{{ r.unit }}</td>
            <td class="sbc-td sbc-num">{{ r.unitPrice === null ? '' : formatIDR(r.unitPrice) }}</td>
            <td class="sbc-td sbc-num">{{ formatIDR(r.amount) }}</td>
            <td class="sbc-td sbc-num">{{ formatIDR(r.running) }}</td>
          </tr>
          <tr class="sbc-row sbc-row--sub">
            <td class="sbc-td sbc-sub-label">Subtotal</td>
            <td class="sbc-td sbc-num" :colspan="COLUMNS.length - 1">{{ formatIDR(g.subtotal) }}</td>
          </tr>
        </template>
      </tbody>
      <tfoot>
        <tr class="sbc-total">
          <td class="sbc-td sbc-strong">Total</td>
          <td class="sbc-td sbc-num sbc-strong" :colspan="COLUMNS.length - 1">{{ formatIDR(report.total) }}</td>
        </tr>
      </tfoot>
    </table>
  </SalesReportShell>
</template>

<style scoped>
.sbc-table { width: 100%; min-width: 1200px; border-collapse: collapse; }
.sbc-th {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle);
  border-top: 1px solid var(--mp-border-default);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-align: left; white-space: nowrap;
}
.sbc-td {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-bottom: 1px solid var(--mp-border-default);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  vertical-align: top; white-space: nowrap;
}
.sbc-num { text-align: right; font-variant-numeric: tabular-nums; }
.sbc-wrap { white-space: normal; min-width: 160px; }
.sbc-muted { color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-sm); }
.sbc-strong { font-weight: var(--mp-font-weights-semi-bold); }
.sbc-indent { padding-left: var(--mp-spacing-8); }
.sbc-row--parent { cursor: pointer; }
.sbc-row--parent:hover .sbc-td { background: var(--mp-background-neutral-subtle); }
.sbc-parent { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.sbc-chev { color: var(--mp-colors-icon-default); flex-shrink: 0; }
.sbc-row:not(.sbc-row--parent):not(.sbc-row--sub):hover .sbc-td { background: var(--mp-background-neutral-subtle); }
/* Subtotal row — prod marks it with a 4px violet left rule. */
.sbc-sub-label { border-left: 4px solid var(--mp-colors-violet-500, var(--mp-border-brand)); }
.sbc-row--sub .sbc-td { background: var(--mp-background-neutral-subtle); }
.sbc-total .sbc-td { border-top: 1px solid var(--mp-text-default); border-bottom: 1px solid var(--mp-text-default); }
.sbc-link { color: var(--mp-text-link); cursor: pointer; }
.sbc-link:hover { text-decoration: underline; text-underline-offset: 2px; }
</style>
