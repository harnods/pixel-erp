<script setup lang="ts">
import { computed } from 'vue'
import ContentList from '~/components/patterns/ContentList.vue'
import SourceLabel from '~/components/patterns/SourceLabel.vue'
import { getShipment } from '~/data/deliveryTasks'
import { outgoingOrders, isMarketplaceOrder } from '~/data/outgoing'
import { formatDateTimeLong } from '~/utils/date'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const shipment = computed(() => getShipment(props.orderId))

interface Row {
  id: string; salesOrderId: string; salesNo: string; packingTaskId: string; packingTaskNo: string
  source: string; skuQty: number; shippedQty: number; courier: string; trackingNo: string
}
const rows = computed<Row[]>(() => {
  const s = shipment.value
  if (!s) return []
  return s.deliveries.map((t) => {
    const order = outgoingOrders.find(o => o.id === t.salesOrderId)
    return {
      id: t.id,
      salesOrderId: t.salesOrderId,
      salesNo: t.salesNo,
      packingTaskId: t.packingTaskId,
      packingTaskNo: t.packingTaskNo,
      source: order?.source ?? '',
      skuQty: t.skuQty,
      shippedQty: t.shippedQty,
      courier: t.courier ?? '—',
      trackingNo: t.trackingNo ?? '—',
    }
  })
})

function formatNum(n: number) { return n.toLocaleString('id-ID') }
function goBack() { router.push({ path: '/outbound-delivery', query: { tab: 'Shipped' } }) }
function viewSalesOrder(row: Row) { router.push(`/outbound-delivery/${row.salesOrderId}`) }
function viewPacking(row: Row) { router.push(`/packing/${row.packingTaskId}`) }
function printPdf() { /* generates the shipment PDF — not built in this prototype */ }
</script>

<template>
  <div v-if="shipment" class="detail-page">

    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">Shipped</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ shipment.shipmentNo }}</h1>
        </div>
      </div>
    </header>

    <div class="detail-stage">

      <section class="shd-summary">
        <div class="content-list-col">
          <ContentList label="Warehouse" :value="shipment.warehouseName" />
          <ContentList label="Assignee" :value="shipment.assignee" />
        </div>
        <div class="content-list-col">
          <ContentList label="Transaction date" :value="shipment.transactionDate ? formatDateTimeLong(shipment.transactionDate) : '—'" />
          <ContentList label="Transaction no." :value="shipment.shipmentNo" />
        </div>
      </section>

      <div class="shd-table-wrap">
        <table class="detail-items">
          <colgroup>
            <col style="width: 16%" />
            <col style="width: 16%" />
            <col style="width: 18%" />
            <col style="width: 13%" />
            <col style="width: 13%" />
            <col style="width: 12%" />
            <col style="width: 12%" />
          </colgroup>
          <thead>
            <tr>
              <th class="detail-th">Sales order no.</th>
              <th class="detail-th">Packing no.</th>
              <th class="detail-th">Source</th>
              <th class="detail-th">Courier</th>
              <th class="detail-th">Tracking no.</th>
              <th class="detail-th detail-th--num">SKU qty</th>
              <th class="detail-th detail-th--num">Shipped qty</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="detail-item-row">
              <td class="detail-td">
                <div class="cell-with-action">
                  <span class="cell-text">{{ row.salesNo }}</span>
                  <button class="row-hover-btn" @click.stop="viewSalesOrder(row)">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span class="row-hover-btn__label">VIEW DETAILS</span>
                  </button>
                </div>
              </td>
              <td class="detail-td">
                <div class="cell-with-action">
                  <span class="cell-text">{{ row.packingTaskNo }}</span>
                  <button class="row-hover-btn" @click.stop="viewPacking(row)">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span class="row-hover-btn__label">VIEW DETAILS</span>
                  </button>
                </div>
              </td>
              <td class="detail-td"><SourceLabel :source="row.source" /></td>
              <td class="detail-td">{{ row.courier }}</td>
              <td class="detail-td">{{ row.trackingNo }}</td>
              <td class="detail-td detail-td--num">{{ formatNum(row.skuQty) }}</td>
              <td class="detail-td detail-td--num">{{ formatNum(row.shippedQty) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

    </div>

    <footer class="detail-footer">
      <button class="detail-btn detail-btn--secondary" @click="printPdf">Print PDF</button>
    </footer>

  </div>

  <div v-else class="shd-not-found">
    <p>Shipment not found.</p>
    <button class="detail-breadcrumb" @click="goBack">Back to Shipped</button>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center;
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8);
}
.shd-summary { display: grid; grid-template-columns: 244px 244px; column-gap: var(--mp-spacing-6); row-gap: 0; }
.content-list-col { display: flex; flex-direction: column; }

.shd-table-wrap { overflow-x: auto; }
.detail-items { width: 100%; border-collapse: collapse; table-layout: fixed; }
.detail-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.detail-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.detail-td {
  position: relative;
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2); font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.detail-td--num { text-align: right; white-space: nowrap; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }

/* Number cells — View details chip on hover */
.cell-with-action { position: relative; display: flex; align-items: center; width: 100%; min-width: 0; }
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.row-hover-btn {
  position: absolute; right: 0; top: 50%; transform: translateY(-50%); display: none;
  align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1; color: var(--mp-text-secondary);
}
.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase;
}
.detail-item-row:hover .row-hover-btn { display: flex; }

.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage);
  border-top: 1px solid var(--mp-border-default);
}
.detail-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap;
}
.detail-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-default); }
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }

.shd-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); height: 100%; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
