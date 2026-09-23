<script setup lang="ts">
/**
 * Stock request detail — the warehouse crew's view of ONE request.
 *
 * A request is identified by its OWN number (SR-2026-xxxx); the transaction that
 * raised it (today always a work order) is a reference field, not the identity.
 * One request holds many components, and those components can be wanted at
 * different warehouses — so the table groups by destination warehouse and each
 * group carries its own "Create warehouse transfer", which is the unit a transfer
 * is actually raised in.
 *
 * There is exactly one stock request detail page: the product grouping on the
 * index is an aggregate across requests, not a record, so it has no detail of its
 * own — its rows drill into the transactions underneath instead.
 *
 * PRD "Work Order Material Reservation, Stock Request & Project Stock" › UC-11.
 * Reservation is always available here regardless of the Production reservation
 * method — under Two-step this page is the only place it happens (S-2).
 */
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpIcon, toast, css,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ReserveMaterialsModal from '~/components/patterns/ReserveMaterialsModal.vue'
import UnreserveMaterialsModal from '~/components/patterns/UnreserveMaterialsModal.vue'
import { formatDate } from '~/utils/date'
import {
  stockRequests, stockRequestStatus, lineCovered, lineToTransfer, lineReadiness,
  isOverdue, canReject, reserveRequestProducts, unreserveRequestProducts, rejectRequest,
  reservedTracking, trackingChanged, lineTracking, setReservedBatches, setReservedSerials,
  type StockRequest, type StockRequestLine, type UnreserveDisposition,
} from '~/data/stockRequests'
import PickBatchDrawer from '~/components/patterns/PickBatchDrawer.vue'
import PickSerialNumberDrawer from '~/components/patterns/PickSerialNumberDrawer.vue'
import { TODAY_ISO } from '~/data/master'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const req = computed<StockRequest | undefined>(() => stockRequests.find(r => r.id === props.orderId))

function goList() { router.push('/stock-requests') }
function goWorkOrder() { if (req.value) router.push(`/work-orders/${req.value.workOrderId}`) }

// ─── Roll-ups ──────────────────────────────────────────────────────────────────
const status = computed(() => req.value ? stockRequestStatus(req.value) : 'requested')
const lines = computed(() => req.value?.lines ?? [])
const componentCount = computed(() => lines.value.length)
const reservedLines = computed(() => lines.value.filter(l => lineCovered(l) >= l.qty).length)
const consumedLines = computed(() => lines.value.filter(l => l.qty > 0 && l.consumed >= l.qty).length)
const transferLines = computed(() => lines.value.filter(l => lineToTransfer(l) > 0))
const earliestRequired = computed(() => [...lines.value].map(l => l.requiredDate).sort()[0] ?? '')
const overdue = computed(() => req.value ? isOverdue(req.value, TODAY_ISO) : false)

/**
 * One group per destination warehouse — the unit a warehouse transfer is raised
 * in, so the crew can cover a whole group with a single document.
 */
const warehouseGroups = computed(() => {
  const byWarehouse = new Map<string, StockRequestLine[]>()
  for (const line of lines.value) {
    const key = line.destinationWarehouse || t('Unassigned warehouse')
    byWarehouse.set(key, [...(byWarehouse.get(key) ?? []), line])
  }
  return [...byWarehouse.entries()].map(([warehouse, groupLines]) => ({
    warehouse,
    warehouseId: groupLines[0]?.destinationWarehouseId ?? '',
    lines: groupLines,
    /** total still missing at this warehouse — 0 means no transfer is needed */
    toTransfer: groupLines.reduce((sum, l) => sum + lineToTransfer(l), 0),
  }))
})

const READINESS_LABEL: Record<string, string> = {
  requested: 'Requested',
  'partially reserved': 'Partially reserved',
  reserved: 'Reserved',
  'issued / picked': 'Issued / picked',
}
function lineStatus(line: StockRequestLine): string {
  const r = lineReadiness(line)
  if (r === 'reserved') return line.consumed >= line.qty ? 'issued / picked' : 'reserved'
  return lineCovered(line) > 0 ? 'partially reserved' : 'requested'
}

// ─── Actions ───────────────────────────────────────────────────────────────────
const reserveOpen = ref(false)
const unreserveOpen = ref(false)

function onReserve(productIds: string[]) {
  if (!req.value) return
  const r = reserveRequestProducts(req.value.id, productIds)
  reserveOpen.value = false
  if (r.reservedProducts === 0) {
    toast.notify({ variant: 'error', title: t('Nothing could be reserved — warehouse stock does not cover any selected component in full'), maxWidth: 'max-content' })
    return
  }
  const parts = [`${r.reservedProducts} ${t('component(s) reserved')} (${r.reservedQty} ${t('unit')})`]
  if (r.partialProducts > 0) parts.push(`${r.partialProducts} ${t('reserved short')}`)
  if (r.skippedProducts > 0) parts.push(`${r.skippedProducts} ${t('had no stock')}`)
  const msg = parts.join(' · ')
  toast.notify({ variant: 'success', title: msg, maxWidth: 'max-content' })
}

function onUnreserve(payload: { productIds: string[]; disposition: UnreserveDisposition; reason: string }) {
  if (!req.value) return
  const released = unreserveRequestProducts(req.value.id, payload.productIds, payload.disposition)
  unreserveOpen.value = false
  if (released === 0) return
  const where = payload.disposition === 'return-to-warehouse'
    ? t('returned to warehouse')
    : t('charged to production cost')
  toast.notify({ variant: 'success', title: `${released} ${t('unit unreserved')} — ${where}`, maxWidth: 'max-content' })
}

/** A transfer is raised per destination warehouse — the group carries the scope,
 *  so the form is prefilled with just that warehouse's short lines. */
function createWarehouseTransfer(warehouseId?: string) {
  if (!req.value) return
  router.push({
    path: '/warehouse-transfers/new',
    query: { fromStockRequest: req.value.id, ...(warehouseId ? { warehouse: warehouseId } : {}) },
  })
}
function createPurchaseRequest() {
  if (!req.value) return
  router.push({ path: '/purchase-requests/new', query: { fromStockRequest: req.value.id } })
}
function reject() {
  if (!req.value || !rejectRequest(req.value.id)) return
  toast.notify({ variant: 'success', title: `${req.value.number} ${t('request rejected')}`, maxWidth: 'max-content' })
}

const hasReservation = computed(() => lines.value.some(l => l.reserved > 0))

// ── Batch / serial (PPIC may reserve units other than the ones the work order
// picked; the work order detail is told about it) ─────────────────────────────
const trackingRow = ref<StockRequestLine | null>(null)
const batchOpen = ref(false)
const serialOpen = ref(false)

function trackingLabel(line: StockRequestLine): string {
  const tracking = lineTracking(line)
  if (!tracking) return '—'
  const { batches, serials } = reservedTracking(line)
  if (tracking === 'serial') return serials.length ? serials.join(', ') : t('Select serial number')
  return batches.length ? batches.map(b => `${b.batchNo} (${b.qty})`).join(', ') : t('Select batch')
}
function isChanged(line: StockRequestLine): boolean { return trackingChanged(line) }

function openTracking(line: StockRequestLine) {
  trackingRow.value = line
  if (lineTracking(line) === 'serial') serialOpen.value = true
  else if (lineTracking(line) === 'batch') batchOpen.value = true
}
function saveBatches(batches: { batchNo: string; qty: number }[]) {
  if (req.value && trackingRow.value) {
    setReservedBatches(req.value.id, trackingRow.value.productId, batches)
    toast.notify({ variant: 'success', title: t('Batch updated — the work order will be notified'), maxWidth: 'max-content' })
  }
  batchOpen.value = false
}
function saveSerials(serials: string[]) {
  if (req.value && trackingRow.value) {
    setReservedSerials(req.value.id, trackingRow.value.productId, serials)
    toast.notify({ variant: 'success', title: t('Serial numbers updated — the work order will be notified'), maxWidth: 'max-content' })
  }
  serialOpen.value = false
}
</script>

<template>
  <div v-if="req" class="detail-page">
    <!-- ── Title bar — the REQUEST's own number is the identity ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <a class="detail-breadcrumb" @click="goList">{{ t('Stock requests') }}</a>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('Stock request') }} {{ req.number }}</h1>
          <ErpStatusBadge :status="status" badge-for="additionalInformation" size="md" />
          <span v-if="req.kind" class="sr-tag" :class="`sr-tag--${req.kind}`">
            {{ req.kind === 'additional' ? t('Additional stock') : t('Adjustment') }}
          </span>
        </div>
      </div>

      <div class="detail-bar-actions">
        <!-- Everything the crew can do to the request lives in one Actions list;
             only Reserve stock is promoted, because it is the common case. -->
        <MpPopover id="srd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="btn-enterprise btn-enterprise--secondary">
              {{ t('Actions') }}
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="createPurchaseRequest">{{ t('Create purchase request') }}</MpPopoverListItem>
              <MpPopoverListItem @click="createWarehouseTransfer()">{{ t('Create warehouse transfer') }}</MpPopoverListItem>
              <MpPopoverListItem @click="goWorkOrder">{{ t('Open work order') }}</MpPopoverListItem>
              <MpPopoverListItem v-if="hasReservation" @click="unreserveOpen = true">{{ t('Unreserve') }}</MpPopoverListItem>
            </MpPopoverList>
            <template v-if="canReject(req)">
              <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
              <MpPopoverList>
                <MpPopoverListItem :class="css({ color: 'var(--mp-text-critical)' })" @click="reject">{{ t('Reject request') }}</MpPopoverListItem>
              </MpPopoverList>
            </template>
          </MpPopoverContent>
        </MpPopover>

        <button v-if="!req.rejected" class="btn-enterprise btn-enterprise--primary" @click="reserveOpen = true">{{ t('Reserve stock') }}</button>
      </div>
    </header>

    <!-- ── Stage ── -->
    <div class="detail-stage">
      <div v-if="req.rejected" class="srd-banner srd-banner--muted">
        <MpIcon name="information" size="md" />
        <span>{{ t('This request was rejected. No further stock actions are available.') }}</span>
      </div>
      <div v-else-if="transferLines.length" class="srd-banner srd-banner--critical">
        <MpIcon name="warning" size="md" />
        <span>
          {{ transferLines.length }}
          {{ transferLines.length === 1 ? t('component is short at its destination warehouse.') : t('components are short at their destination warehouse.') }}
          {{ t('Transfer stock in per warehouse below, or raise a purchase request.') }}
        </span>
      </div>

      <!-- ── Request info ── -->
      <section class="wod-section">
        <h2 class="wod-section-title">{{ t('Request info') }}</h2>
        <div class="srd-summary">
          <div class="srd-summary-grid">
            <div>
              <ContentList :label="t('Request no.')" :value="req.number" />
              <ContentList :label="t('Requestor')" :value="req.requestor" />
            </div>
            <div>
              <!-- The transaction is a reference on the request, not its identity -->
              <ContentList :label="t('Transaction')" :value="`${t('Work order')} ${req.workOrderNumber}`" />
              <ContentList :label="t('Request date')" :value="formatDate(req.requestDate)" />
            </div>
            <div>
              <ContentList :label="t('Earliest required')" :value="earliestRequired ? formatDate(earliestRequired) : '—'" />
              <ContentList :label="t('Components')" :value="String(componentCount)" />
            </div>
          </div>

          <div class="srd-emphasis">
            <span class="srd-emphasis-label">{{ t('Reserved') }}</span>
            <span class="srd-emphasis-value" :class="{ 'srd-ok': reservedLines === componentCount && componentCount > 0 }">
              {{ reservedLines }}/{{ componentCount }}
            </span>
            <span class="srd-emphasis-sub">{{ t('components fully reserved') }}</span>
            <span v-if="consumedLines > 0" class="srd-emphasis-sub">{{ consumedLines }}/{{ componentCount }} {{ t('consumed by production') }}</span>
            <span v-if="overdue" class="srd-emphasis-sub srd-short">{{ t('Overdue — reminder sent') }}</span>
          </div>
        </div>
      </section>

      <!-- ── Components, grouped by destination warehouse ──
           One transfer covers one warehouse, so the action sits on the group. -->
      <section
        v-for="(g, gi) in warehouseGroups" :key="g.warehouse"
        class="wod-section" :class="{ 'wod-section--last': gi === warehouseGroups.length - 1 }"
      >
        <div class="wod-section-head-static">
          <h2 class="wod-section-title">
            <MpIcon name="warehouse" size="md" />
            {{ g.warehouse }}
          </h2>
          <div class="srd-group-right">
            <span class="srd-section-sub">
              {{ g.lines.length }} {{ g.lines.length === 1 ? t('component') : t('components') }}
              <template v-if="g.toTransfer > 0"> · <span class="srd-short">{{ g.toTransfer }} {{ t('to transfer') }}</span></template>
            </span>
            <button
              v-if="!req.rejected && g.toTransfer > 0"
              class="btn-enterprise btn-enterprise--secondary"
              @click="createWarehouseTransfer(g.warehouseId)"
            >{{ t('Create warehouse transfer') }}</button>
          </div>
        </div>

        <div class="wod-table-scroll">
          <table class="wod-table">
            <thead>
              <tr>
                <th class="wod-th">{{ t('Product') }}</th>
                <th class="wod-th wod-th--num">{{ t('Request') }}</th>
                <th class="wod-th wod-th--num">{{ t('Available') }}</th>
                <th class="wod-th wod-th--num">{{ t('Reserved') }}</th>
                <th class="wod-th wod-th--num">{{ t('Consumed') }}</th>
                <th class="wod-th wod-th--num">{{ t('To transfer') }}</th>
                <th class="wod-th">{{ t('Required date') }}</th>
                <th class="wod-th">{{ t('Batch / SN') }}</th>
                <th class="wod-th">{{ t('Status') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in g.lines" :key="l.productId" class="wod-tr">
                <td class="wod-td wod-td--wrap">
                  <div class="srd-product">
                    <span class="srd-product-name">{{ l.product }}</span>
                    <span class="srd-product-sku">{{ l.sku }}</span>
                  </div>
                </td>
                <td class="wod-td wod-td--num">{{ l.qty }} {{ l.unit }}</td>
                <td class="wod-td wod-td--num" :class="{ 'srd-warn': l.destAvailable < l.qty - lineCovered(l) }">{{ l.destAvailable }} {{ l.unit }}</td>
                <td class="wod-td wod-td--num">{{ l.reserved }} {{ l.unit }}</td>
                <td class="wod-td wod-td--num srd-muted">{{ l.consumed }} {{ l.unit }}</td>
                <td class="wod-td wod-td--num" :class="lineToTransfer(l) > 0 ? 'srd-short' : 'srd-muted'">
                  {{ lineToTransfer(l) > 0 ? `${lineToTransfer(l)} ${l.unit}` : '—' }}
                </td>
                <td class="wod-td">{{ formatDate(l.requiredDate) }}</td>
                <!-- Tracked components carry the work order's pick; PPIC may reserve
                     other units, and the work order detail is told when they do. -->
                <td class="wod-td wod-td--wrap">
                  <span v-if="!lineTracking(l)" class="srd-muted">—</span>
                  <span v-else class="srd-tracking">
                    <span class="cell-link" @click="openTracking(l)">{{ trackingLabel(l) }}</span>
                    <span v-if="isChanged(l)" class="srd-tracking-changed">{{ t('changed') }}</span>
                  </span>
                </td>
                <td class="wod-td">
                  <ErpStatusBadge :status="lineStatus(l)" :label="t(READINESS_LABEL[lineStatus(l)] ?? '')" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <!-- ── Batch / serial pick (PPIC reserves specific units) ── -->
    <PickBatchDrawer
      v-if="trackingRow"
      :open="batchOpen" :product-name="trackingRow.product" :sku="trackingRow.sku"
      :warehouse-id="trackingRow.destinationWarehouseId" :warehouse-name="trackingRow.destinationWarehouse"
      :unit="trackingRow.unit" :target-count="trackingRow.qty"
      :model-value="reservedTracking(trackingRow).batches"
      @update:open="batchOpen = $event" @save="saveBatches"
    />
    <PickSerialNumberDrawer
      v-if="trackingRow"
      :open="serialOpen" :product-name="trackingRow.product" :sku="trackingRow.sku"
      :warehouse-id="trackingRow.destinationWarehouseId" :warehouse-name="trackingRow.destinationWarehouse"
      :unit="trackingRow.unit" :target-count="trackingRow.qty"
      :model-value="reservedTracking(trackingRow).serials"
      @update:open="serialOpen = $event" @save="saveSerials"
    />

    <!-- ── Reserve / Unreserve (UC-02 / UC-03) ── -->
    <ReserveMaterialsModal
      id="srd-reserve" :is-open="reserveOpen"
      :work-order-number="req.number" :lines="lines"
      @close="reserveOpen = false" @reserve="onReserve"
    />
    <UnreserveMaterialsModal
      id="srd-unreserve" :is-open="unreserveOpen"
      :work-order-number="req.number" :lines="lines"
      @close="unreserveOpen = false" @unreserve="onUnreserve"
    />
  </div>
</template>

<style scoped>
.srd-tracking { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.srd-tracking-changed {
  display: inline-flex; padding: 0 var(--mp-spacing-2);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-information-subtle, #eaf2fd);
  color: var(--mp-text-link, #165082);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
}

/* Structural detail-page classes mirror WorkOrderDetailsPage — the same shell is
   reused across transaction detail pages (docs/patterns/details-page-format.md). */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; min-height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  padding: var(--mp-spacing-3) var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link, #165082);
  line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); flex-wrap: wrap; }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default, #080d0e);
}
.detail-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }

.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage, #ffffff);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-8);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage, #ffffff);
}

.wod-section { padding: var(--mp-spacing-8) 0; border-bottom: 1px dashed var(--mp-border-default, #e3e7e9); }
.wod-section:first-child { padding-top: 0; }
.wod-section--last { border-bottom: none; }
.wod-section-head-static { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); width: 100%; margin-bottom: var(--mp-spacing-5); flex-wrap: wrap; }
.wod-section-title {
  display: flex; align-items: center; gap: var(--mp-spacing-2); margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default, #080d0e);
}
.wod-section > .wod-section-title { margin-bottom: var(--mp-spacing-5); }

.wod-table-scroll { overflow-x: auto; border-top: 1px solid var(--mp-border-default, #e3e7e9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.wod-table { width: 100%; border-collapse: collapse; table-layout: auto; min-width: max-content; }
.wod-th {
  height: var(--mp-sizes-7, 28px); text-align: left; white-space: nowrap;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary, #3a4749); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.wod-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.wod-td {
  padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-4) var(--mp-spacing-2\.5, 10px) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default, #080d0e);
  vertical-align: top; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); white-space: nowrap;
}
.wod-tr:last-child .wod-td { border-bottom: none; }
.wod-td--num {
  text-align: right; font-variant-numeric: tabular-nums;
  padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-2) var(--mp-spacing-2\.5, 10px) var(--mp-spacing-4);
}
.wod-td--wrap { white-space: normal; min-width: 200px; }

/* ── Summary ── */

.srd-subtitle { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #3a4749); }
.srd-link-row { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); flex-wrap: wrap; }
.srd-note {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-1);
  margin: var(--mp-spacing-3) 0 0;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-critical, #a8352d);
}
/* Four summary columns on the product perspective, three on the transaction one. */
.srd-group-right { display: flex; align-items: center; gap: var(--mp-spacing-4); flex-wrap: wrap; }

.srd-summary { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-6); flex-wrap: wrap; }
.srd-summary-grid {
  flex: 1; min-width: 0;
  display: grid; grid-template-columns: minmax(0, 318px) repeat(2, minmax(0, 1fr));
  column-gap: var(--mp-spacing-6); row-gap: 0;
}
/* The single emphasized value (details-page-format › header summary). */
.srd-emphasis { display: flex; flex-direction: column; align-items: flex-end; text-align: right; flex-shrink: 0; }
.srd-emphasis-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary, #3a4749); }
.srd-emphasis-value {
  font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); color: var(--mp-text-default, #080d0e);
  font-variant-numeric: tabular-nums;
}
.srd-emphasis-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary, #3a4749); }
.srd-section-sub { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary, #3a4749); }

/* ── Cells ── */
.srd-product { display: flex; flex-direction: column; }
.srd-product-name { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default, #080d0e); }
.srd-product-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary, #3a4749); }
.srd-muted { color: var(--mp-text-secondary, #3a4749); }
.srd-warn { color: var(--mp-text-warning, #a35200); }
.srd-short { color: var(--mp-text-critical, #a8352d); font-weight: var(--mp-font-weights-semi-bold); }
.srd-ok { color: var(--mp-text-success, #186f4a); }

/* ── Banners ── */
.srd-banner {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-radius: var(--mp-radii-md, 6px);
  font-size: var(--mp-font-sizes-md);
}
.srd-banner--critical {
  background: var(--mp-background-danger-subtle, #fceeed);
  border: 1px solid var(--mp-border-danger, #f0c8c4);
  color: var(--mp-text-critical, #a8352d);
}
.srd-banner--muted {
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  color: var(--mp-text-secondary, #3a4749);
}
.srd-banner-btn { margin-left: auto; flex-shrink: 0; }

/* Request tags (W-7) — same chips as the index */
.sr-tag {
  display: inline-flex; align-items: center; flex-shrink: 0;
  padding: 0 var(--mp-spacing-2); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); white-space: nowrap;
}
.sr-tag--additional { background: var(--mp-background-warning-subtle, #fff3e0); color: var(--mp-text-warning, #a35200); }
.sr-tag--adjustment { background: var(--mp-background-information-subtle, #eaf2fd); color: var(--mp-text-link, #165082); }
</style>
