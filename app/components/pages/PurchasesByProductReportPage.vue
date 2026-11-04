<!-- prod-parity: jurnal-frontend-app/src/pages/reports/purchases_by_product/index.vue (+ utils.ts, i18n.json, components/filter-drawer.vue) -->
<script setup lang="ts">
/**
 * Reports › Purchases › Purchase by product. Prod v3: a summary table
 * (Product code / SKU · Product name · Purchase qty · Return qty · Unit ·
 * Purchase value · Return value · Average purchase value, Total footer) or —
 * with "View detailed version" ticked in the filter drawer — a nested table
 * grouped by product (Product name & Date · Transaction type · No. · Vendor ·
 * Qty · Unit · Price per unit · Total price · Discount · Final price, Subtotal
 * per product, Total). Data: purchaseInvoiceDetails.ts line items.
 */
import { MpIcon } from '@mekari/pixel3'
import PurchaseReportShell from '~/components/patterns/PurchaseReportShell.vue'
import PurchaseReportFiltersDrawer, { type PurchaseReportDrawerValue } from '~/components/patterns/PurchaseReportFiltersDrawer.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import {
  PUR_RPT_VENDOR_TRANSACTION_TYPES, emptyPurRptFilters, purchasesByProduct, purchasesByProductDetail, purRptSum, assertPurchaseReportsTie,
  type PurRptProductRow, type PurRptProductGroup, type PurRptProductSort,
} from '~/data/purchaseReports'

const router = useRouter()

const BASE_SORT = [
  { value: 'product_name_pbp', label: 'Product name' },
  { value: 'product_code_pbp', label: 'Product code' },
  { value: 'product_qty_pbp', label: 'Qty' },
]
const SORT_OPTIONS = [...BASE_SORT,
  { value: 'product_qty_return_pbp', label: 'Return qty' },
  { value: 'total_value_bought_pbp', label: 'Purchase value' },
  { value: 'avg_buy_price_pbp', label: 'Average purchase value' },
]
const DETAIL_SORT_OPTIONS = [...BASE_SORT,
  { value: 'price_pbp', label: 'Total price' },
  { value: 'total_pbp', label: 'Final price' },
]
const DEFAULTS: PurchaseReportDrawerValue = {
  range: [new Date(2026, 7, 1), new Date(2026, 7, 31)],
  transactionType: 'Purchase invoice',
  filters: emptyPurRptFilters(),
  sortBy: 'product_name_pbp', sortLogic: 'asc', showDetail: false,
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
  filterActive.value = true
  generate()
}

const active = computed(() => state.value !== 'idle' && applied.transactionType === 'Purchase invoice')
const rows = computed<PurRptProductRow[]>(() => active.value && !applied.showDetail
  ? purchasesByProduct(applied.range, applied.filters, applied.sortBy as PurRptProductSort, applied.sortLogic) : [])
const groups = computed<PurRptProductGroup[]>(() => active.value && applied.showDetail
  ? purchasesByProductDetail(applied.range, applied.filters, applied.sortBy as PurRptProductSort, applied.sortLogic) : [])
const hasRows = computed(() => (applied.showDetail ? groups.value.length : rows.value.length) > 0)
watch(() => state.value, (s) => { if (s === 'ready' && import.meta.dev) assertPurchaseReportsTie(applied.range, { ...applied.filters, productCategories: [], products: [] }) })

const totalValue = computed(() => purRptSum(rows.value, 'purchaseValue'))
const totalReturn = computed(() => purRptSum(rows.value, 'returnValue'))
const detTotals = computed(() => ({
  qty: purRptSum(groups.value, 'subQty'), price: purRptSum(groups.value, 'subPrice'), final: purRptSum(groups.value, 'subFinal'),
}))
const fmtQty = (n: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(n)

const collapsed = ref<Set<string>>(new Set())
function toggle(id: string) { const s = new Set(collapsed.value); s.has(id) ? s.delete(id) : s.add(id); collapsed.value = s }
</script>

<template>
  <div class="prp-root">
    <PurchaseReportShell
      id="prp"
      title="Purchase by product"
      v-model:range="pendingRange"
      :state="state"
      :has-rows="hasRows"
      primary-label="Show"
      filter-label="Filter"
      :filter-active="filterActive"
      :error="error"
      show-example
      @show="show"
      @open-filter="drawerOpen = true"
    >
      <!-- Summary -->
      <div v-if="!applied.showDetail" class="prr-table-wrap">
        <table class="prr-table">
          <thead>
            <tr>
              <th class="prr-th">Product code / SKU</th>
              <th class="prr-th">Product name</th>
              <th class="prr-th prr-th--num">Purchase qty</th>
              <th class="prr-th prr-th--num">Return qty</th>
              <th class="prr-th">Unit</th>
              <th class="prr-th prr-th--num">Purchase value</th>
              <th class="prr-th prr-th--num">Return value</th>
              <th class="prr-th prr-th--num">Average purchase value</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in rows" :key="r.sku" class="prr-row">
              <td class="prr-td prr-td--nowrap">{{ r.sku }}</td>
              <td class="prr-td prr-wrap"><a class="prr-a" role="link" tabindex="0" @click="router.push(`/product-list/${r.sku}`)" @keydown.enter="router.push(`/product-list/${r.sku}`)">{{ r.name }}</a></td>
              <td class="prr-td prr-td--num">{{ fmtQty(r.purchaseQty) }}</td>
              <td class="prr-td prr-td--num">{{ fmtQty(r.returnQty) }}</td>
              <td class="prr-td">{{ r.unit }}</td>
              <td class="prr-td prr-td--num">{{ formatIDR(r.purchaseValue) }}</td>
              <td class="prr-td prr-td--num">{{ formatIDR(r.returnValue) }}</td>
              <td class="prr-td prr-td--num">{{ formatIDR(r.avgPurchaseValue) }}</td>
            </tr>
            <tr class="prr-row--total">
              <td class="prr-td">Total</td>
              <td class="prr-td prr-td--num" colspan="5">{{ formatIDR(totalValue) }}</td>
              <td class="prr-td prr-td--num">{{ formatIDR(totalReturn) }}</td>
              <td class="prr-td" />
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Detailed version -->
      <div v-else class="prr-table-wrap">
        <table class="prr-table">
          <thead>
            <tr>
              <th class="prr-th">Product name &amp; Date</th>
              <th class="prr-th">Transaction type</th>
              <th class="prr-th">No.</th>
              <th class="prr-th">Vendor</th>
              <th class="prr-th prr-th--num">Qty</th>
              <th class="prr-th">Unit</th>
              <th class="prr-th prr-th--num">Price per unit</th>
              <th class="prr-th prr-th--num">Total price</th>
              <th class="prr-th">Discount</th>
              <th class="prr-th prr-th--num">Final price</th>
            </tr>
          </thead>
          <tbody v-for="g in groups" :key="g.sku">
            <tr class="prr-row--group" @click="toggle(g.sku)">
              <td class="prr-td" colspan="10">
                <span class="prr-group-name">
                  <MpIcon :name="collapsed.has(g.sku) ? 'caret-right' : 'caret-down'" size="sm" />
                  <a class="prr-a" role="link" tabindex="0" @click.stop="router.push(`/product-list/${g.sku}`)" @keydown.enter.stop="router.push(`/product-list/${g.sku}`)">{{ g.name }}</a>
                  <span class="prr-td--muted">{{ g.sku }}</span>
                </span>
              </td>
            </tr>
            <template v-if="!collapsed.has(g.sku)">
              <tr v-for="l in g.lines" :key="l.key" class="prr-row">
                <td class="prr-td prr-td--nowrap">{{ formatDate(l.date) }}</td>
                <td class="prr-td">{{ l.type }}</td>
                <td class="prr-td prr-td--nowrap"><a class="prr-a" role="link" tabindex="0" @click="router.push(l.link)" @keydown.enter="router.push(l.link)">{{ l.number }}</a></td>
                <td class="prr-td">{{ l.vendor }}</td>
                <td class="prr-td prr-td--num">{{ fmtQty(l.quantity) }}</td>
                <td class="prr-td">{{ l.unit }}</td>
                <td class="prr-td prr-td--num">{{ formatIDR(l.pricePerUnit) }}</td>
                <td class="prr-td prr-td--num">{{ formatIDR(l.totalPrice) }}</td>
                <td class="prr-td">{{ l.discount }}</td>
                <td class="prr-td prr-td--num">{{ formatIDR(l.finalPrice) }}</td>
              </tr>
              <tr class="prr-row--sub">
                <td class="prr-td">Subtotal</td>
                <td class="prr-td prr-td--num" colspan="4">{{ fmtQty(g.subQty) }}</td>
                <td class="prr-td prr-td--num" colspan="3">{{ formatIDR(g.subPrice) }}</td>
                <td class="prr-td prr-td--num" colspan="2">{{ formatIDR(g.subFinal) }}</td>
              </tr>
            </template>
          </tbody>
          <tbody>
            <tr class="prr-row--total">
              <td class="prr-td">Total</td>
              <td class="prr-td prr-td--num" colspan="4">{{ fmtQty(detTotals.qty) }}</td>
              <td class="prr-td prr-td--num" colspan="3">{{ formatIDR(detTotals.price) }}</td>
              <td class="prr-td prr-td--num" colspan="2">{{ formatIDR(detTotals.final) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </PurchaseReportShell>

    <PurchaseReportFiltersDrawer
      v-model:is-open="drawerOpen"
      variant="product"
      :model-value="{ ...applied, range: pendingRange }"
      :defaults="DEFAULTS"
      :transaction-types="[...PUR_RPT_VENDOR_TRANSACTION_TYPES]"
      :sort-options="SORT_OPTIONS"
      :detail-sort-options="DETAIL_SORT_OPTIONS"
      @apply="onApply"
    />
  </div>
</template>

<style scoped>
.prp-root { height: 100%; min-height: 0; }
</style>
