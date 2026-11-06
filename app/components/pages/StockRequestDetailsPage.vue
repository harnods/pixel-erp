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
 * PRD "Work Order: Material Reservation" › stock requests dashboard.
 * Reservation is always available here regardless of the Production reservation
 * method — under Two-step this page is the only place it happens (S-2).
 */
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpIcon, toast, css,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import DetailJumpTo from '~/components/patterns/DetailJumpTo.vue'
import ActivityLogModal from '~/components/patterns/ActivityLogModal.vue'
import { entriesFor, lastActivity } from '~/data/reservationActivityLog'
import ContentList from '~/components/patterns/ContentList.vue'
import ReserveMaterialsModal from '~/components/patterns/ReserveMaterialsModal.vue'
import UnreserveMaterialsModal from '~/components/patterns/UnreserveMaterialsModal.vue'
import { formatDate } from '~/utils/date'
import {
  stockRequests, stockRequestStatus, lineCovered, lineToTransfer, lineReadiness,
  isOverdue, reserveRequestProducts, unreserveRequestProducts,
  requestLineStatus,
  reservedTracking, trackingChanged, lineTracking, setReservedBatches, setReservedSerials,
  workOrderFor, isActionable,
  type StockRequest, type StockRequestLine,
} from '~/data/stockRequests'
import PickBatchDrawer from '~/components/patterns/PickBatchDrawer.vue'
import PickSerialNumberDrawer from '~/components/patterns/PickSerialNumberDrawer.vue'
import { TODAY_ISO } from '~/data/master'
import { pushNotification } from '~/data/notifications'

const props = defineProps<{ orderId: string }>()
const { t } = useLocale()
const router = useRouter()

const req = computed<StockRequest | undefined>(() => stockRequests.find(r => r.id === props.orderId))

function goList() { router.push('/stock-requests') }
function goWorkOrder() { if (req.value) router.push(`/work-orders/${req.value.workOrderId}`) }

// ─── Roll-ups ──────────────────────────────────────────────────────────────────
const status = computed(() => req.value ? stockRequestStatus(req.value) : 'requested')
const lines = computed(() => req.value?.lines ?? [])
/** Everyone who has changed a line's demand on this request (OPEN-17). */
const requestors = computed(() => [...new Set(lines.value.map(l => l.requestor))].join(', ') || '—')
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
  canceled: 'Canceled',
}
/** W-3 — derived centrally in the data layer so this page cannot drift from the dashboard. */
const lineStatus = (l: StockRequestLine) => (req.value ? requestLineStatus(req.value, l) : 'requested')

// ─── Actions ───────────────────────────────────────────────────────────────────
const reserveOpen = ref(false)
const unreserveOpen = ref(false)
/** The warehouse group Reserve was opened from — stock is committed at ONE
 *  warehouse, so the drawer is scoped to the group whose button opened it. */
const reserveGroupLines = ref<StockRequestLine[]>([])
const unreserveGroupLines = ref<StockRequestLine[]>([])
/** The component whose log is open — the log is asked for per component here. */
const logLine = ref<StockRequestLine | null>(null)
function openLineLog(line: StockRequestLine) {
  logLine.value = line
  activityOpen.value = true
}
function canReserveGroup(g: { lines: StockRequestLine[] }): boolean {
  // A completed, cancelled or deleted job's request is read-only (isActionable).
  if (!req.value || !isActionable(req.value)) return false
  return g.lines.some(l => lineCovered(l) < l.qty)
}
/** Unreserve is request-wide in the data layer but offered per warehouse, scoped to the
 *  components held there — the same rule as before: only while the job has not started. */
function canUnreserveGroup(g: { lines: StockRequestLine[] }): boolean {
  return canUnreserve.value && g.lines.some(l => l.reserved > 0)
}
function groupHasActions(g: { lines: StockRequestLine[]; toTransfer: number }): boolean {
  return canReserveGroup(g) || g.toTransfer > 0 || canUnreserveGroup(g)
}
function openGroupUnreserve(g: { lines: StockRequestLine[] }) {
  unreserveGroupLines.value = g.lines
  unreserveOpen.value = true
}
function openGroupReserve(g: { lines: StockRequestLine[] }) {
  reserveGroupLines.value = g.lines
  reserveOpen.value = true
}

function onReserve(productIds: string[]) {
  if (!req.value) return
  // PPIC acting on the dashboard side — the default source, logged as such.
  const r = reserveRequestProducts(req.value.id, productIds, { source: 'stock-request' })
  reserveOpen.value = false
  if (r.reservedProducts === 0) {
    toast.notify({ variant: 'error', title: t('No stock to reserve — the destination warehouse has none of the selected components'), maxWidth: 'max-content' })
    return
  }
  const parts = [`${r.reservedProducts} ${t('component(s) reserved')} (${r.reservedQty} ${t('unit')})`]
  if (r.partialProducts > 0) parts.push(`${r.partialProducts} ${t('reserved short')}`)
  if (r.skippedProducts > 0) parts.push(`${r.skippedProducts} ${t('had no stock')}`)
  const msg = parts.join(' · ')
  toast.notify({ variant: 'success', title: msg, maxWidth: 'max-content' })
}

// UC-03 — released stock always returns to the warehouse; there is no disposition.
function onUnreserve(payload: { productIds: string[]; reason: string }) {
  if (!req.value) return
  const released = unreserveRequestProducts(req.value.id, payload.productIds, {
    source: 'stock-request', reason: payload.reason,
  })
  unreserveOpen.value = false
  if (released === 0) return
  const where = t('returned to warehouse')
  // R-9 — a release on somebody else's work order notifies its owner, naming the
  // components, qty and reason. Reservation removed by another person must not be
  // discovered at start time.
  notifyWorkOrderOwner(payload.productIds, released, where, payload.reason)
  toast.notify({ variant: 'success', title: `${released} ${t('unit unreserved')} — ${where}`, maxWidth: 'max-content' })
}

/** Raised per destination warehouse — the form opens with that group's short lines,
 *  their shortfall qty, the destination and a memo naming this request. */
function createWarehouseTransfer(warehouseId?: string) {
  if (!req.value) return
  router.push({
    path: '/warehouse-transfers/new',
    query: { fromStockRequest: req.value.id, ...(warehouseId ? { warehouse: warehouseId } : {}) },
  })
}
function createPurchaseRequest(warehouseId?: string) {
  if (!req.value) return
  router.push({
    path: '/purchase-requests/new',
    query: { fromStockRequest: req.value.id, ...(warehouseId ? { warehouse: warehouseId } : {}) },
  })
}

/**
 * R-9 — the stockist releasing a reservation is acting on somebody else's job, so
 * its owner is told rather than left to discover it when the job won't start.
 */
function notifyWorkOrderOwner(productIds: string[], qty: number, where: string, reason: string) {
  const r = req.value
  if (!r || qty <= 0) return
  const names = productIds
    .map(id => lines.value.find(l => l.productId === id)?.product ?? id)
    .join(', ')
  pushNotification({
    title: `${t('Reservation released on')} ${r.workOrderNumber}`,
    preview: `${names} — ${qty} ${t('unit released from reservation')} (${where})`,
    heading: `${t('Reservation released on')} ${r.workOrderNumber}`,
    description: t('A stockist released material reserved for this work order. Check material readiness before starting it.'),
    fields: [
      { label: t('Components'), value: names },
      { label: t('Qty released'), value: `${qty}` },
      { label: t('Stock request'), value: r.number },
      ...(reason ? [{ label: t('Reason'), value: reason }] : []),
    ],
    actions: [{ label: t('View work order'), primary: true }, { label: t('View stock request') }],
  })
}

const hasReservation = computed(() => lines.value.some(l => l.reserved > 0))

/**
 * UC-03 / D-6 — unreserve exists in exactly two places: here and on the work order
 * page, and on BOTH only while the work order has not started. Once it is running,
 * the only way out of a reservation is inside the Adjust modal, where the Adjust
 * reason stands in for the approval this path would otherwise need.
 *
 * PPIC may release another job's reservation to serve a more urgent one (Roles),
 * which is why this is offered to the stockist at all — but the started-job rule
 * is the same for both roles: material already committed to a running job is not
 * something a second person should be able to pull out from under it.
 */
/**
 * rule/detail-jump-to — hop straight to another request without going back to the
 * list. Most recent first, captioned by the transaction that raised it.
 */
const jumpItems = computed(() =>
  [...stockRequests]
    .sort((a, b) => b.requestDate.localeCompare(a.requestDate))
    .slice(0, 12)
    .map(r => ({ id: r.id, primary: r.number, secondary: r.workOrderNumber })),
)
function jumpTo(id: string) { router.push(`/stock-requests/${id}`) }

const workOrder = computed(() => req.value ? workOrderFor(req.value) : undefined)
const workOrderNotStarted = computed(() => (workOrder.value?.status ?? 'not started') === 'not started')
const canUnreserve = computed(() => hasReservation.value && workOrderNotStarted.value)

/**
 * Activity log (rule/detail-activity-log-always, US-8). Reserve, unreserve and
 * every release are written to the shared store; the request's own creation is
 * derived, so a request nobody has acted on still shows how it came to exist.
 */
const activityOpen = ref(false)
const activityEntries = computed(() => {
  const r = req.value
  if (!r) return []
  return entriesFor('stock-request', r.id, [{
    date: `${r.requestDate}T08:00:00`,
    user: r.lines[0]?.requestor ?? '—',
    activity: t('Request raised'),
    details: [
      { label: t('Transaction'), value: `${t('Work order')} ${r.workOrderNumber}` },
      { label: t('Components'), value: String(r.lines.length) },
    ],
  }])
})
const lastUpdated = computed(() => {
  const r = req.value
  if (!r) return undefined
  return lastActivity('stock-request', r.id)
})

// ── Batch / serial (PPIC may reserve units other than the ones the work order
// picked; the work order detail is told about it) ─────────────────────────────
const trackingRow = ref<StockRequestLine | null>(null)
const batchOpen = ref(false)
const serialOpen = ref(false)

function trackingLabel(line: StockRequestLine): string {
  const tracking = lineTracking(line)
  if (!tracking) return '—'
  return tracking === 'serial' ? t('View serial number') : t('View batch')
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
        <div class="detail-titlerow-left" data-devchange="sr-feedback-round">
          <h1 class="detail-title">{{ t('Stock request') }} {{ req.number }}</h1>
          <ErpStatusBadge :status="status" badge-for="additionalInformation" />
          <!-- W-7 — a tag belongs to a LINE, so the lines below carry their own and
               the title says nothing about them (same rule the index follows). -->
          <DetailJumpTo
            id="srd-jump"
            :items="jumpItems"
            :aria-label="t('Switch stock request')"
            :placeholder="t('Search...')"
            :empty-text="t('No stock requests found')"
            @select="jumpTo"
          />
        </div>
      </div>
    </header>

    <!-- ── Stage ── -->
    <div class="detail-stage">
      <!-- ── Request info ── -->
      <section class="wod-section">
        <h2 class="wod-section-title">{{ t('Request info') }}</h2>
        <div class="srd-summary">
          <div class="srd-summary-grid">
            <div>
              <ContentList :label="t('Request no.')" :value="req.number" />
              <!-- OPEN-17 — requestor is per LINE, so the summary names everyone
                   who has changed this request's demand; each line names its own. -->
              <ContentList :label="t('Requestors')" :value="requestors" />
            </div>
            <div>
              <!-- The transaction is a reference on the request, not its identity -->
              <ContentList :label="t('Transaction')" data-devchange="sr-wo-link">
                <span class="cell-link" role="link" tabindex="0" @click="goWorkOrder" @keydown.enter="goWorkOrder">{{ t('Work order') }} {{ req.workOrderNumber }}</span>
              </ContentList>
              <ContentList :label="t('Request date')" :value="formatDate(req.requestDate)" />
            </div>
            <div>
              <ContentList :label="t('Earliest required')" :value="earliestRequired ? formatDate(earliestRequired) : '—'" />
              <ContentList :label="t('Components')" :value="String(componentCount)" />
            </div>
          </div>

          <div class="srd-emphasis">
            <span class="srd-emphasis-label">{{ t('Fulfilled') }}</span>
            <span class="srd-emphasis-value" :class="{ 'srd-ok': consumedLines === componentCount && componentCount > 0 }">
              {{ consumedLines }}/{{ componentCount }}
            </span>
            <span class="srd-emphasis-sub">{{ t('components fulfilled') }}</span>
            <span v-if="overdue" class="srd-emphasis-sub srd-short">{{ t('Overdue') }}</span>
          </div>
        </div>
      </section>

      <!-- ── Components, grouped by destination warehouse ──
           One transfer covers one warehouse, so each group states its own shortfall. -->
      <section
        v-for="(g, gi) in warehouseGroups" :key="g.warehouse"
        class="wod-section" :class="{ 'wod-section--last': gi === warehouseGroups.length - 1 }"
      >
        <div class="wod-section-head-static">
          <h2 class="wod-section-title">
            <MpIcon name="warehouse" size="md" />
            {{ g.warehouse }}
          </h2>
          <div class="srd-group-right" data-devchange="sr-group-actions">
            <!-- No component count or shortfall total here: the rows below are the
                 count, and the shortfall is in their Qty to transfer column.
                 Reservation is taken per warehouse — stock is committed at one —
                 so the action belongs beside the group it acts on, not on the
                 page header. -->
            <!-- What to do about a shortfall at THIS warehouse. Both documents open
                 prefilled with this group's short lines (see shortfallLinesForRequest). -->
            <MpPopover
              v-if="groupHasActions(g)"
              :id="`srd-actions-${gi}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end"
            >
              <MpPopoverTrigger>
                <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" data-devchange="sr-group-actions">
                  {{ t('Actions') }}
                  <MpIcon name="chevrons-down" size="sm" />
                </button>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content', whiteSpace: 'nowrap' })">
                <MpPopoverList>
                  <MpPopoverListItem v-if="canReserveGroup(g)" @click="openGroupReserve(g)">{{ t('Reserve stock') }}</MpPopoverListItem>
                  <MpPopoverListItem v-if="g.toTransfer > 0" @click="createPurchaseRequest(g.warehouseId)">{{ t('Create purchase request') }}</MpPopoverListItem>
                  <MpPopoverListItem v-if="g.toTransfer > 0" @click="createWarehouseTransfer(g.warehouseId)">{{ t('Create warehouse transfer') }}</MpPopoverListItem>
                  <MpPopoverListItem v-if="canUnreserveGroup(g)" @click="openGroupUnreserve(g)">{{ t('Unreserve') }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
          </div>
        </div>

        <div class="wod-table-scroll">
          <!-- Every warehouse group renders its own <table>, so without a shared
               column template each one sized to its own content and the headers
               stepped sideways down the page. The colgroup + `table-layout: fixed`
               give them all one grid. -->
          <table class="wod-table" data-devchange="sr-unit-column">
            <colgroup>
              <col class="wod-col-product">
              <col class="wod-col-qty">
              <col class="wod-col-qty">
              <col class="wod-col-qty">
              <col class="wod-col-qty">
              <col class="wod-col-qty">
              <col class="wod-col-unit">
              <col class="wod-col-date">
              <col class="wod-col-status">
              <col class="wod-col-tracking">
              <col class="wod-col-requestor">
            </colgroup>
            <thead>
              <tr>
                <th class="wod-th">{{ t('Product') }}</th>
                <th class="wod-th wod-th--num">{{ t('Requested qty') }}</th>
                <th class="wod-th wod-th--num">{{ t('Available qty') }}</th>
                <th class="wod-th wod-th--num">{{ t('Reserved qty') }}</th>
                <th class="wod-th wod-th--num">{{ t('Consumed qty') }}</th>
                <th class="wod-th wod-th--num">{{ t('Qty to transfer') }}</th>
                <th class="wod-th">{{ t('Unit') }}</th>
                <th class="wod-th">{{ t('Required date') }}</th>
                <th class="wod-th">{{ t('Status') }}</th>
                <th class="wod-th">{{ t('Batch / SN') }}</th>
                <!-- W-9 — each line names who last changed ITS demand (OPEN-17).
                     It sits last: it is provenance, not something acted on. -->
                <th class="wod-th">{{ t('Requestor') }}</th>
              </tr>
            </thead>
            <tbody>
              <!-- Keyed by INDEX, not productId: the creation form lets one product
                   be drawn twice, so productId is not unique here. v0.6 — no line
                   tags and no Reject (L-12); a line the warehouse can't cover stays
                   open as Requested / Partially reserved. -->
              <tr v-for="(l, li) in g.lines" :key="`${l.productId}-${li}`" class="wod-tr" data-devchange="sr-v06-no-reject">
                <td class="wod-td wod-td--wrap">
                  <div class="srd-product">
                    <span class="srd-product-name">{{ l.product }}</span>
                    <span class="srd-product-sku">{{ l.sku }}</span>
                    <!-- Same affordance as the index: a text link under the SKU,
                         not an icon that has to be guessed at and then explained. -->
                    <span
                      class="cell-link srd-log-link" role="button"
                      :aria-label="`${t('View log')} — ${l.product}`"
                      @click.stop="openLineLog(l)"
                    >{{ t('View log') }}</span>
                  </div>
                </td>
                <td class="wod-td wod-td--num">{{ l.qty }}</td>
                <td class="wod-td wod-td--num" :class="{ 'srd-warn': l.destAvailable < l.qty - lineCovered(l) }">{{ l.destAvailable }}</td>
                <td class="wod-td wod-td--num">{{ l.reserved }}</td>
                <td class="wod-td wod-td--num srd-muted">{{ l.consumed }}</td>
                <td class="wod-td wod-td--num" :class="lineToTransfer(l) > 0 ? 'srd-short' : 'srd-muted'">
                  {{ lineToTransfer(l) > 0 ? lineToTransfer(l) : '—' }}
                </td>
                <td class="wod-td">{{ l.unit }}</td>
                <td class="wod-td">{{ formatDate(l.requiredDate) }}</td>
                <td class="wod-td">
                  <ErpStatusBadge :status="lineStatus(l)" :label="t(READINESS_LABEL[lineStatus(l)] ?? '')" />
                </td>
                <!-- The units are already chosen on the work order that raised the
                     request; the warehouse reads them here rather than picking
                     again, so this is a view link, never an empty selector. -->
                <td class="wod-td wod-td--wrap">
                  <span v-if="!lineTracking(l)" class="srd-muted">—</span>
                  <span v-else class="srd-tracking">
                    <span class="cell-link" @click="openTracking(l)">{{ trackingLabel(l) }}</span>
                    <span v-if="isChanged(l)" class="srd-tracking-changed">{{ t('changed') }}</span>
                  </span>
                </td>
                <td class="wod-td">{{ l.requestor }}</td>
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
    <!-- Provenance line — states who last touched the request. The log itself is
         reached per COMPONENT, from the product name in the table: "what happened
         to this component" is the question actually asked here. -->
    <p class="detail-updated detail-updated--static">
      {{ t('Last updated by') }} {{ lastUpdated?.user ?? (req.lines[0]?.requestor ?? '—') }}
      {{ t('on') }} {{ formatDate((lastUpdated?.date ?? req.requestDate).slice(0, 10)) }}
    </p>

    <ActivityLogModal
      :is-open="activityOpen"
      :subject="logLine ? `${logLine.product} — ${req.number}` : `${t('Stock request')} ${req.number}`"
      :updated-by="lastUpdated?.user ?? (req.lines[0]?.requestor ?? '—')"
      :updated-at="lastUpdated?.date ?? req.requestDate"
      :entries="activityEntries"
      @close="activityOpen = false"
    />

    <ReserveMaterialsModal
      id="srd-reserve" :is-open="reserveOpen"
      :work-order-number="req.number" :lines="reserveGroupLines"
      @close="reserveOpen = false" @reserve="onReserve"
    />
    <UnreserveMaterialsModal
      id="srd-unreserve" :is-open="unreserveOpen"
      :work-order-number="req.number" :lines="unreserveGroupLines"
      @close="unreserveOpen = false" @unreserve="onUnreserve"
    />
  </div>

  <!-- Not found — a stale or mistyped link is a reachable state, and it used to
       land on a blank page (docs/design/reachable-states.md). -->
  <div v-else class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <a class="detail-breadcrumb" @click="goList">{{ t('Stock requests') }}</a>
        <div class="detail-titlerow-left"><h1 class="detail-title">{{ t('Stock request not found') }}</h1></div>
      </div>
    </header>
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

.wod-section { padding: var(--mp-spacing-8) 0; }
.wod-section:first-child { padding-top: 0; }
.wod-section-head-static { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); width: 100%; margin-bottom: var(--mp-spacing-5); flex-wrap: wrap; }
.wod-section-title {
  display: flex; align-items: center; gap: var(--mp-spacing-2); margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default, #080d0e);
}
.wod-section > .wod-section-title { margin-bottom: var(--mp-spacing-5); }

.wod-table-scroll { overflow-x: auto; border-top: 1px solid var(--mp-border-default, #e3e7e9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
/* Fixed layout + the colgroup above: the widths come from the template, not from
   each table's own content, which is what makes the groups align. The min-width is
   the sum of the columns, so a narrow stage scrolls rather than squashing them. */
.wod-table { width: 100%; border-collapse: collapse; table-layout: fixed; min-width: 1380px; }
.srd-group-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.wod-col-product   { width: 240px; }
.wod-col-qty       { width: 128px; }
.wod-col-unit      { width: 128px; }
.wod-col-date      { width: 128px; }
.wod-col-status    { width: 140px; }
.wod-col-tracking  { width: 128px; }
.wod-col-requestor { width: 144px; }
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
.detail-updated--static { cursor: default; text-decoration: none; color: var(--mp-text-secondary, #3a4749); }
/* The log link sits on its own line under the SKU, as it does on the index. */
.srd-log-link {
  display: inline-block; width: fit-content; margin-top: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm);
}
.detail-updated {
  margin: 0; align-self: flex-start;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer;
}
.srd-muted { color: var(--mp-text-secondary, #3a4749); }
.srd-warn { color: var(--mp-text-warning, #a35200); }
.srd-short { color: var(--mp-text-critical, #a8352d); font-weight: var(--mp-font-weights-semi-bold); }
.srd-ok { color: var(--mp-text-success, #186f4a); }

/* ── Shortfall banner ── */
/* The library MpBanner carries its own surface, border, icon and tone, and the
   section below it already pads its own top — so the page styles nothing here. */

/* Request tags (W-7) — same chips as the index */
</style>
