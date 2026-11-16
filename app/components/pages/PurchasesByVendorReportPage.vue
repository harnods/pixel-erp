<!-- prod-parity: jurnal-frontend-app/src/pages/reports/purchases_by_vendor/purchases_by_vendor.vue (+ default.js, i18n.json, components/filter.vue) -->
<script setup lang="ts">
/**
 * Reports › Purchases › Purchase by vendor. Prod v3 (ScmVirtualCollapseTable):
 * one collapsible group per vendor; each transaction line (product lines then a
 * "Tax" line per transaction) with a running total; purple-edged Subtotal per
 * vendor; grand Total. Columns from prod default.js. Data: purchaseInvoices.ts
 * + purchaseInvoiceDetails.ts line items.
 */
import { MpIcon } from '@mekari/pixel3'
import PurchaseReportShell from '~/components/patterns/PurchaseReportShell.vue'
import PurchaseReportFiltersDrawer, { type PurchaseReportDrawerValue } from '~/components/patterns/PurchaseReportFiltersDrawer.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import {
  PUR_RPT_VENDOR_TRANSACTION_TYPES, emptyPurRptFilters, purchasesByVendor, purRptSum, assertPurchaseReportsTie,
  type PurRptVendorGroup,
} from '~/data/purchaseReports'

const router = useRouter()

const SORT_OPTIONS = [
  { value: 'total_purchases', label: 'Total purchases' },
  { value: 'vendor_name', label: 'Vendor' },
]
const DEFAULTS: PurchaseReportDrawerValue = {
  range: [new Date(2026, 7, 1), new Date(2026, 7, 31)],
  transactionType: 'Purchase invoice',
  filters: emptyPurRptFilters(),
  sortBy: 'vendor_name', sortLogic: 'asc', showDetail: false,
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

const groups = computed<PurRptVendorGroup[]>(() => {
  if (state.value === 'idle' || applied.transactionType !== 'Purchase invoice') return []
  return purchasesByVendor(applied.range, applied.filters, applied.sortBy as 'vendor_name' | 'total_purchases', applied.sortLogic)
})
const grandTotal = computed(() => purRptSum(groups.value, 'subtotal'))
watch(() => state.value, (s) => { if (s === 'ready' && import.meta.dev) assertPurchaseReportsTie(applied.range, { ...applied.filters, productCategories: [] }) })

const collapsed = ref<Set<string>>(new Set())
function toggle(id: string) { const s = new Set(collapsed.value); s.has(id) ? s.delete(id) : s.add(id); collapsed.value = s }
const allCollapsed = computed(() => groups.value.length > 0 && groups.value.every((g) => collapsed.value.has(g.vendorId)))
function toggleAll() { collapsed.value = allCollapsed.value ? new Set() : new Set(groups.value.map((g) => g.vendorId)) }

const COLS = 10
</script>

<template>
  <div class="prv-root">
    <PurchaseReportShell
      id="prv"
      title="Purchase by vendor"
      v-model:range="pendingRange"
      :state="state"
      :has-rows="groups.length > 0"
      primary-label="Show"
      filter-label="Filter"
      :filter-active="filterActive"
      :error="error"
      show-example
      @show="show"
      @open-filter="drawerOpen = true"
    >
      <template #report-head-right>
        <a v-if="state === 'ready' && groups.length" class="prr-a" role="button" tabindex="0" @click="toggleAll" @keydown.enter="toggleAll">{{ allCollapsed ? 'Expand all' : 'Collapse all' }}</a>
      </template>

      <div class="prr-table-wrap">
        <table class="prr-table">
          <thead>
            <tr>
              <th class="prr-th">Vendor / Date</th>
              <th class="prr-th">Transaction type</th>
              <th class="prr-th">Transaction no.</th>
              <th class="prr-th">Product name</th>
              <th class="prr-th">Description</th>
              <th class="prr-th prr-th--num">Qty</th>
              <th class="prr-th">Unit</th>
              <th class="prr-th prr-th--num">Price per unit</th>
              <th class="prr-th prr-th--num">Amount due</th>
              <th class="prr-th prr-th--num">Total amount due</th>
            </tr>
          </thead>
          <tbody v-for="g in groups" :key="g.vendorId">
            <tr class="prr-row--group" @click="toggle(g.vendorId)">
              <td class="prr-td" :colspan="COLS">
                <span class="prr-group-name">
                  <MpIcon :name="collapsed.has(g.vendorId) ? 'caret-right' : 'caret-down'" size="sm" />
                  {{ g.vendorName }}
                </span>
              </td>
            </tr>
            <template v-if="!collapsed.has(g.vendorId)">
              <tr v-for="l in g.lines" :key="l.key" class="prr-row">
                <td class="prr-td prr-td--nowrap">{{ formatDate(l.date) }}</td>
                <td class="prr-td prr-td--type"><a class="prr-a" role="link" tabindex="0" @click="router.push(l.link)" @keydown.enter="router.push(l.link)">{{ l.type }}</a></td>
                <td class="prr-td prr-td--nowrap"><a class="prr-a" role="link" tabindex="0" @click="router.push(l.link)" @keydown.enter="router.push(l.link)">{{ l.number }}</a></td>
                <td class="prr-td prr-wrap">
                  <a v-if="l.productSku" class="prr-a" role="link" tabindex="0" @click="router.push(`/product-list/${l.productSku}`)" @keydown.enter="router.push(`/product-list/${l.productSku}`)">{{ l.productName }}</a>
                  <template v-else>{{ l.productName }}</template>
                </td>
                <td class="prr-td"><span class="prr-desc">{{ l.description }}</span></td>
                <td class="prr-td prr-td--num">{{ l.quantity }}</td>
                <td class="prr-td">{{ l.unit }}</td>
                <td class="prr-td prr-td--num">{{ formatIDR(l.unitPrice) }}</td>
                <td class="prr-td prr-td--num">{{ formatIDR(l.amount) }}</td>
                <td class="prr-td prr-td--num">{{ formatIDR(l.total) }}</td>
              </tr>
              <tr class="prr-row--sub">
                <td class="prr-td">Subtotal</td>
                <td class="prr-td prr-td--num" :colspan="COLS - 1">{{ formatIDR(g.subtotal) }}</td>
              </tr>
            </template>
          </tbody>
          <tbody>
            <tr class="prr-row--total">
              <td class="prr-td">Total</td>
              <td class="prr-td prr-td--num" :colspan="COLS - 1">{{ formatIDR(grandTotal) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </PurchaseReportShell>

    <PurchaseReportFiltersDrawer
      v-model:is-open="drawerOpen"
      variant="vendor"
      :model-value="{ ...applied, range: pendingRange }"
      :defaults="DEFAULTS"
      :transaction-types="[...PUR_RPT_VENDOR_TRANSACTION_TYPES]"
      :sort-options="SORT_OPTIONS"
      @apply="onApply"
    />
  </div>
</template>

<style scoped>
.prv-root { height: 100%; min-height: 0; }
</style>
