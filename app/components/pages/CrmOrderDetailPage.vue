<script setup lang="ts">
/**
 * CRM (Qontak) — Order detail (/crm/orders/:id). Mirrors the ERP Sales order
 * detail layout: breadcrumb + title bar → summary (customer / dates / total) →
 * line-items table → totals (subtotal / PPN 11% / total). CRM orders carry a
 * single product line; amount is treated as tax-inclusive so it matches the list.
 */
import { computed } from 'vue'
import { infoToast } from '~/utils/toasts'
import { toast } from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { formatDateLong } from '~/utils/date'
import { formatIDR } from '~/utils/currency'
import { crmOrders, crmCustomers, crmProducts, type OrderStatus } from '~/data/crm'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
function soon(what: string) { infoToast(`${what} — coming soon`) }
function goBack() { router.push('/crm/orders') }

const order = computed(() => crmOrders.find((o) => o.id === props.orderId))
const customer = computed(() => crmCustomers.find((c) => c.company === order.value?.customer))
const product = computed(() => crmProducts.find((p) => p.name === order.value?.product))

const STATUS: Record<OrderStatus, { label: string; type: 'completed' | 'warning' | 'information' | 'announcement' }> = {
  'draft':            { label: 'Draft',            type: 'announcement' },
  'awaiting-payment': { label: 'Awaiting payment', type: 'warning' },
  'paid':             { label: 'Paid',             type: 'completed' },
  'fulfilled':        { label: 'Fulfilled',        type: 'information' },
  'cancelled':        { label: 'Cancelled',        type: 'announcement' },
}

// amount = tax-inclusive total (keeps the list "Total" == detail total).
const totals = computed(() => {
  const total = order.value?.amount ?? 0
  const subtotal = Math.round(total / 1.11)
  return { subtotal, tax: total - subtotal, total }
})
const unitPrice = computed(() => product.value?.price ?? totals.value.total)
const qty = computed(() => Math.max(1, Math.round(totals.value.total / (unitPrice.value || 1))))
const dueDate = computed(() => {
  if (!order.value) return ''
  const d = new Date(order.value.date); d.setDate(d.getDate() + 14)
  return d.toISOString().slice(0, 10)
})
</script>

<template>
  <div v-if="order" class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" type="button" @click="goBack">Orders</button>
        <div class="detail-titlerow">
          <h1 class="detail-title">Order #{{ order.id }}</h1>
          <ErpStatusBadge :status="order.status" :label="STATUS[order.status].label" :type="STATUS[order.status].type" size="md" badge-for="additionalInformation" />
        </div>
      </div>
      <div class="detail-bar-right">
        <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="soon('Edit order')">Edit</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="soon('Record payment')">Record payment</button>
      </div>
    </header>

    <div class="detail-stage">
      <!-- Summary -->
      <section class="d-summary">
        <div class="d-field"><span class="d-k">Customer</span><span class="d-v d-v--strong">{{ order.customer }}</span><span v-if="customer" class="d-sub">{{ customer.segment }} · {{ customer.city }}</span></div>
        <div class="d-field"><span class="d-k">Owner</span><span class="d-v">{{ order.owner }}</span></div>
        <div class="d-field"><span class="d-k">Order date</span><span class="d-v">{{ formatDateLong(order.date) }}</span></div>
        <div class="d-field"><span class="d-k">Due date</span><span class="d-v">{{ formatDateLong(dueDate) }}</span></div>
        <div class="d-total">
          <span class="d-total-k">Total</span>
          <span class="d-total-v">{{ formatIDR(totals.total) }}</span>
        </div>
      </section>

      <!-- Line items -->
      <section class="d-card">
        <div class="d-table-scroll">
          <table class="d-table">
            <thead>
              <tr><th>Product</th><th class="num">Qty</th><th>Unit</th><th class="num">Unit price</th><th class="num">Amount</th></tr>
            </thead>
            <tbody>
              <tr>
                <td>{{ order.product }}</td>
                <td class="num">{{ qty }}</td>
                <td>{{ product?.unit ?? '—' }}</td>
                <td class="num">{{ formatIDR(unitPrice) }}</td>
                <td class="num">{{ formatIDR(totals.total) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="d-totals">
          <div class="d-totals-row"><span>Subtotal</span><span>{{ formatIDR(totals.subtotal) }}</span></div>
          <div class="d-totals-row"><span>PPN 11%</span><span>{{ formatIDR(totals.tax) }}</span></div>
          <div class="d-totals-row d-totals-row--grand"><span>Total</span><span>{{ formatIDR(totals.total) }}</span></div>
        </div>
      </section>
    </div>
  </div>

  <div v-else class="detail-page">
    <header class="detail-bar"><div class="detail-bar-left"><button class="detail-breadcrumb" type="button" @click="goBack">Orders</button><h1 class="detail-title">Order not found</h1></div></header>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-neutral-subtle, #f8f9f9); }
.detail-bar-left { display: flex; flex-direction: column; gap: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); line-height: 16px; color: var(--mp-text-link, #165082); font-weight: var(--mp-font-weights-semi-bold); }
.detail-titlerow { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; color: var(--mp-text-default); }
.detail-bar-right { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }

.detail-page { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage, #fff); border-radius: var(--mp-radii-xl, 12px) var(--mp-radii-xl, 12px) 0 0; padding: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
.d-summary { display: grid; grid-template-columns: repeat(4, 1fr) auto; gap: var(--mp-spacing-5); align-items: start; padding-bottom: var(--mp-spacing-5); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.d-field { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.d-k { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.d-v { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.d-v--strong { font-weight: var(--mp-font-weights-semi-bold); }
.d-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.d-total { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
.d-total-k { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.d-total-v { font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.d-card { border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-xl, 12px); overflow: hidden; }
.d-table-scroll { overflow-x: auto; }
.d-table { width: 100%; border-collapse: collapse; }
.d-table thead th { text-align: left; padding: var(--mp-spacing-3) var(--mp-spacing-4); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.d-table th.num, .d-table td.num { text-align: right; }
.d-table tbody td { padding: var(--mp-spacing-3) var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.strong { font-weight: var(--mp-font-weights-semi-bold); }
.d-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default, #e3e7e9); align-items: flex-end; }
.d-totals-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-6); width: 260px; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.d-totals-row span:last-child { color: var(--mp-text-default); }
.d-totals-row--grand { font-weight: var(--mp-font-weights-semi-bold); font-size: var(--mp-font-sizes-lg, 16px); padding-top: var(--mp-spacing-2); border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.d-totals-row--grand span { color: var(--mp-text-default); }
</style>
