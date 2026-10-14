<script setup lang="ts">
/**
 * New shipment — same shape as Handover to Courier, except the deliveries aren't
 * pre-selected on the index page; the warehouse is picked here, then deliveries
 * are added by scanning any of the three codes a packed order carries: its
 * resi/tracking no. (marketplace orders arrive with one), its packing no., or its
 * order no. — all resolve to the same ready-to-ship delivery (see
 * findReadyToShipByScan). Saving reuses the same handoverToCourierBulk() as the
 * bulk flow.
 */
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import {
  MpButton, MpAutocomplete, MpDatePicker, MpIcon, MpSpinner,
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  css, toast,
} from '@mekari/pixel3'
import SourceLabel from '~/components/patterns/SourceLabel.vue'
import ScanBar from '~/components/patterns/ScanBar.vue'
import {
  getDeliveryTask, findReadyToShipByScan, findReadyToShipByScanAnyWarehouse,
  handoverToCourierBulk, deliveryTasks, type DeliveryTask,
} from '~/data/deliveryTasks'
import NumberFormatSettingsModal, { type NumberFormatConfig } from '~/components/patterns/NumberFormatSettingsModal.vue'
import { outgoingOrders, isMarketplaceOrder } from '~/data/outgoing'
import { couriers } from '~/data/couriers'
import { warehouses } from '~/data/warehouses'
import { scrollToFirstError } from '~/utils/form'
import { getWarehouseTeam } from '~/data/warehouseTeam'
import { picForWarehouse } from '~/data/warehouses'
import { notifyScanError } from '~/utils/scan'
import { playScanSuccessSound } from '~/utils/sound'

const router = useRouter()
const emptyIllustration = '/illustrations/empty-folder.png'

function toDisplayDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function toISODate(display: string) {
  const [d, m, y] = display.split('/')
  return `${y}-${m}-${d}`
}
const todayDisplay = toDisplayDate(new Date().toISOString().slice(0, 10))

// ─── Warehouse — user-selectable (Handover locks this from pre-selected deliveries;
// here nothing is selected yet, so the manager picks the warehouse first). ────────
const warehouseOptions = computed(() =>
  warehouses.filter(w => w.status === 'active' && !w.isDefault).map(w => ({ id: w.id, name: w.name })),
)
const warehouseId = ref('')
const warehouseError = ref(false)
const isSaving = ref(false)
watch(warehouseId, (v) => { if (v) warehouseError.value = false })
const warehouseName = computed(() => warehouseOptions.value.find(w => w.id === warehouseId.value)?.name ?? '')

// ─── Deliveries — added by scanning a packing no., not pre-selected ──────────────
const taskIds = ref<string[]>([])
// A shipment is single-warehouse — switching warehouse voids whatever was scanned.
watch(warehouseId, () => { taskIds.value = [] })

const tasks = computed<DeliveryTask[]>(() =>
  taskIds.value.map(id => getDeliveryTask(id)).filter((t): t is DeliveryTask => !!t && t.status === 'ready to ship'),
)

interface Row { id: string; salesOrderId: string; salesNo: string; packingTaskId: string; packingTaskNo: string; source: string; isMarketplace: boolean; channelCourier: string; channelTracking: string; skuQty: number; toShipQty: number }
const rows = computed<Row[]>(() => tasks.value.map((t) => {
  const order = outgoingOrders.find(o => o.id === t.salesOrderId)
  return {
    id: t.id,
    salesOrderId: t.salesOrderId,
    salesNo: t.salesNo,
    packingTaskId: t.packingTaskId,
    packingTaskNo: t.packingTaskNo,
    source: order?.source ?? '',
    isMarketplace: isMarketplaceOrder(order),
    // What the channel pre-assigned (may be a courier WMS doesn't recognise).
    channelCourier: t.courier ?? '',
    channelTracking: t.trackingNo ?? '',
    skuQty: t.skuQty,
    toShipQty: t.toShipQty,
  }
}))

// ─── Search + progressive pagination for the deliveries table (mirrors Create shipment) ──
const search = ref('')
const filteredRows = computed<Row[]>(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(r =>
    r.salesNo.toLowerCase().includes(q) || r.packingTaskNo.toLowerCase().includes(q) || r.source.toLowerCase().includes(q),
  )
})
const PAGE_SIZE = 10
const shownCount = ref(PAGE_SIZE)
const loadingMore = ref(false)
const pagedRows = computed<Row[]>(() => filteredRows.value.slice(0, shownCount.value))
const hasMoreRows = computed(() => shownCount.value < filteredRows.value.length)
const isProgressive = computed(() => filteredRows.value.length > PAGE_SIZE)

function loadMoreRows(): void {
  if (loadingMore.value || !hasMoreRows.value) return
  loadingMore.value = true
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, filteredRows.value.length)
    loadingMore.value = false
  }, 400)
}
watch(search, () => {
  shownCount.value = PAGE_SIZE
  nextTick(() => { if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0 })
})

const itemsScrollEl = ref<HTMLElement | null>(null)
const itemsSentinelEl = ref<HTMLElement | null>(null)
let itemsObserver: IntersectionObserver | null = null
function setupItemsObserver(): void {
  itemsObserver?.disconnect()
  if (!itemsScrollEl.value || !itemsSentinelEl.value) return
  itemsObserver = new IntersectionObserver(
    (entries) => { if (entries[0]?.isIntersecting) loadMoreRows() },
    { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' },
  )
  itemsObserver.observe(itemsSentinelEl.value)
}
onMounted(() => { nextTick(setupItemsObserver) })
onUnmounted(() => { itemsObserver?.disconnect() })
watch(rows, () => nextTick(setupItemsObserver))

// ─── Add deliveries by scanning a packing no. — same match/flash behavior as
// Create shipment. Scanning is harmless to undo — nothing is persisted until Save —
// so let the operator wipe every scanned delivery and start over. ────────────────
function resetScan() { taskIds.value = [] }
const flashRowId = ref<string | null>(null)
function handleScan(raw: string) {
  const value = raw.trim()
  if (!value) return
  if (!warehouseId.value) {
    notifyScanError('Select warehouse first')
    return
  }
  // Scan any of the three codes on a packed order: resi/tracking no., packing
  // no., or order no. — all resolve to the same ready-to-ship delivery.
  const found = findReadyToShipByScan(warehouseId.value, value)
  if (!found) {
    const elsewhere = findReadyToShipByScanAnyWarehouse(value)
    if (elsewhere) {
      notifyScanError(`"${value}" belongs to ${elsewhere.task.warehouseName}, not ${warehouseName.value}`)
    } else {
      notifyScanError(`Barcode not found: "${value}"`)
    }
    return
  }
  const match = found.task
  if (taskIds.value.includes(match.id)) {
    notifyScanError('Already added to this shipment')
    return
  }
  taskIds.value = [...taskIds.value, match.id]
  playScanSuccessSound()
  shownCount.value = Math.max(shownCount.value, filteredRows.value.length)
  flashRowId.value = match.id
  setTimeout(() => { if (flashRowId.value === match.id) flashRowId.value = null }, 700)
}

// ─── Assignee + transaction date/no. ──────────────────────────────────────────
// Assignee = the person creating this shipment. A "ready to ship" task has no
// shipment assignee yet; it binds here, defaulting to the signed-in user (who is
// doing the scan/select) and still editable. Choices are team members of the
// selected warehouse (the signed-in user is a manager, so the picker is the full
// team, not just operators).
const { activeWarehouse, hasWarehouseContext } = useWarehouseContext()
const currentUserName = computed(() =>
  hasWarehouseContext.value && activeWarehouse.value
    ? picForWarehouse(activeWarehouse.value.id, 0)
    : 'Rizal Candra',
)
const ASSIGNEES = computed(() => getWarehouseTeam(warehouseId.value))
function defaultAssigneeId(whId: string) {
  return getWarehouseTeam(whId).find(m => m.name === currentUserName.value)?.id ?? ''
}
const assigneeId = ref(defaultAssigneeId(warehouseId.value))
const assigneeError = ref(false)
watch(assigneeId, (v) => { if (v) assigneeError.value = false })
watch(warehouseId, () => { assigneeId.value = defaultAssigneeId(warehouseId.value) })
const assigneeLabel = computed(() => ASSIGNEES.value.find(a => a.id === assigneeId.value)?.name ?? '')

const transactionDate = ref(todayDisplay)
const transactionDateError = ref(false)

// ── Transaction no. settings (auto-numbering) — shared global component ────────
const noSettingsOpen = ref(false)
const nextTxNo = computed(() => `Shipment #${deliveryTasks.reduce((m, t) => Math.max(m, Number((t.shipmentNo || '').replace(/\D/g, '')) || 0), 60000) + 1}`)
const txNoFormats = [{ label: 'Auto', value: 'auto' }]
function onNoFormatSave(_config: NumberFormatConfig) { noSettingsOpen.value = false }

// ─── Per-delivery courier + tracking no. ──────────────────────────────────────
// Marketplace orders arrive with a courier + AWB from the channel. If WMS doesn't
// recognise the channel's courier name (e.g. Shopee sends "SPX Extra" when our
// master only has "SPX Standard"), it falls into "Lainnya" (Others) for the shipper
// to re-route. The channel AWB only stays LOCKED while the recognised original
// courier is selected — re-routing to a different courier clears it so the shipper
// enters the correct one; reverting restores it.
const OTHERS_COURIER = 'Lainnya'
const knownCourierNames = computed(() => new Set(couriers.map(c => c.name)))
function isKnownCourier(name?: string): boolean { return !!name && knownCourierNames.value.has(name) }
// Whether the channel AWB is still valid (locked) for a row: only while the row is
// a marketplace one showing its recognised original courier.
function channelAwbLocked(row: Row): boolean {
  return row.isMarketplace && isKnownCourier(row.channelCourier) && (courierByRow.value[row.id] ?? '') === row.channelCourier
}
const courierByRow = ref<Record<string, string>>({})
const trackingByRow = ref<Record<string, string>>({})
watch(tasks, (ts) => {
  const c: Record<string, string> = {}
  const tr: Record<string, string> = {}
  for (const t of ts) {
    const known = isKnownCourier(t.courier)
    // Unrecognised channel courier → Others, to be re-routed.
    const initCourier = t.courier ? (known ? t.courier : OTHERS_COURIER) : ''
    c[t.id] = courierByRow.value[t.id] ?? initCourier
    // Keep the channel AWB only while the recognised original courier is selected.
    const showChannelAwb = known && c[t.id] === t.courier
    tr[t.id] = trackingByRow.value[t.id] ?? (showChannelAwb ? (t.trackingNo ?? '') : '')
  }
  courierByRow.value = c
  trackingByRow.value = tr
})
function setCourier(id: string, val: string) {
  courierByRow.value = { ...courierByRow.value, [id]: val }
  // Re-routing away from the channel's recognised courier invalidates its AWB;
  // reverting to it restores the AWB. (Only marketplace rows carry a channel AWB.)
  const t = tasks.value.find(x => x.id === id)
  if (t && isMarketplaceOrder(outgoingOrders.find(o => o.id === t.salesOrderId))) {
    const restore = isKnownCourier(t.courier) && val === t.courier
    trackingByRow.value = { ...trackingByRow.value, [id]: restore ? (t.trackingNo ?? '') : '' }
  }
}
function setTracking(id: string, val: string) { trackingByRow.value = { ...trackingByRow.value, [id]: val } }

// ── Courier picker (searchable MpPopover, from master data couriers) — available
// on every row so a pre-carried (marketplace/order) courier can be re-routed. ──
const activeCourierRow = ref<string | null>(null)
const courierSearch = ref('')
function openCourierPicker(id: string) { activeCourierRow.value = id; courierSearch.value = '' }
function closeCourierPicker(id: string) { if (activeCourierRow.value === id) { activeCourierRow.value = null; courierSearch.value = '' } }
function couriersFiltered() {
  const q = courierSearch.value.trim().toLowerCase()
  return couriers.filter((c) => !q || c.name.toLowerCase().includes(q))
}
function selectCourier(id: string, name: string) { setCourier(id, name); courierError.value = false; closeCourierPicker(id) }

const showRowErrors = ref(false)
// Courier is required for every delivery before creating the shipment; tracking
// no. stays optional. Flags rows still missing a courier after a failed save.
const courierError = ref(false)

function formatNum(n: number) { return n.toLocaleString('id-ID') }
function goBack() { router.push({ path: '/outbound-delivery', query: { tab: 'Ready to ship' } }) }

function validate(): boolean {
  let valid = true
  if (!warehouseId.value) { warehouseError.value = true; valid = false }
  if (!assigneeId.value) { assigneeError.value = true; valid = false }
  if (!transactionDate.value) { transactionDateError.value = true; valid = false }
  if (!rows.value.length) valid = false
  // Courier required for every delivery (tracking no. stays optional).
  if (rows.value.some(r => !(courierByRow.value[r.id]?.trim()))) {
    courierError.value = true
    valid = false
    toast.notify({ variant: 'error', title: 'Select a courier for every delivery before creating the shipment', maxWidth: 'max-content' })
  }
  showRowErrors.value = true
  return valid
}

async function handleSave() {
  if (!validate()) { scrollToFirstError(); return }
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))
  const shipments = handoverToCourierBulk(taskIds.value, {
    assignee: assigneeLabel.value,
    transactionDate: toISODate(transactionDate.value),
    courierByTaskId: Object.fromEntries(rows.value.map(r => [r.id, courierByRow.value[r.id]?.trim() ?? ''])),
    trackingNoByTaskId: Object.fromEntries(rows.value.map(r => [r.id, trackingByRow.value[r.id]?.trim() ?? ''])),
  })
  toast.notify({
    variant: 'success',
    title: shipments.length > 1 ? `${shipments.length} shipments created` : 'Shipment created',
    maxWidth: 'max-content',
  })
  // A mixed-courier batch splits into several shipments, so there's no single
  // details page to land on — go back to the Shipments tab instead.
  if (shipments.length === 1) {
    router.push(`/outbound-delivery/shipment/${shipments[0]!.shipmentSeq}`)
  } else {
    router.push({ path: '/outbound-delivery', query: { tab: 'Shipments' } })
  }
}
</script>

<template>
  <div class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <MpButton variant="ghost" class="detail-breadcrumb" @click="goBack">Shipping</MpButton>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">New shipment</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- Warehouse + Assignee + Transaction date/no. -->
      <div class="ho-section ho-grid">
        <MpFormControl id="ns-warehouse" is-required :is-invalid="warehouseError">
          <MpFormLabel>Warehouse</MpFormLabel>
          <MpAutocomplete
            id="ns-warehouse-ac"
            v-model="warehouseId"
            :data="warehouseOptions"
            label-prop="name"
            value-prop="id"
            placeholder="Select warehouse"
            is-searchable use-portal is-full-width
            :is-invalid="warehouseError"
          />
          <MpFormErrorMessage>You must select warehouse</MpFormErrorMessage>
        </MpFormControl>

        <MpFormControl id="ns-assignee" is-required :is-invalid="assigneeError">
          <MpFormLabel>Assignee</MpFormLabel>
          <MpAutocomplete
            id="ns-assignee-ac"
            v-model="assigneeId"
            :data="ASSIGNEES"
            label-prop="name"
            value-prop="id"
            placeholder="Select assignee"
            is-searchable is-clearable use-portal is-full-width
            :is-invalid="assigneeError"
          >
            <template #default="{ item }">
              <div class="ho-assignee-opt">
                <span
                  class="ho-assignee-avatar"
                  :style="{ background: `hsl(${item.hue},50%,88%)`, color: `hsl(${item.hue},55%,35%)` }"
                >{{ item.initials }}</span>
                {{ item.name }}
              </div>
            </template>
          </MpAutocomplete>
          <MpFormErrorMessage>You must select assignee</MpFormErrorMessage>
        </MpFormControl>

        <MpFormControl id="ns-txdate" is-required :is-invalid="transactionDateError">
          <MpFormLabel>Transaction date</MpFormLabel>
          <div class="ho-datepicker">
            <MpDatePicker
              id="ns-txdate-dp"
              v-model="transactionDate"
              format="DD/MM/YYYY"
              value-type="format"
              use-portal
              @update:model-value="transactionDateError = false"
            />
          </div>
          <MpFormErrorMessage>You must select transaction date</MpFormErrorMessage>
        </MpFormControl>

        <MpFormControl id="ns-txno">
          <div class="ho-label-row">
            <MpFormLabel>Transaction no.</MpFormLabel>
            <MpButton variant="secondary" type="button" class="ho-label-icon" aria-label="Transaction no. settings" @click="noSettingsOpen = true"><MpIcon name="settings" size="sm" /></MpButton>
          </div>
          <input id="ns-txno-input" class="ho-txno-input" value="" placeholder="[Auto]" disabled />
        </MpFormControl>
      </div>

      <!-- Deliveries — empty until scanned -->
      <div class="ho-sku-section">
        <h2 class="ho-section-title">Deliveries</h2>
        <div class="ho-summary">
          <div class="ho-stat">
            <span class="ho-stat-label">Packages</span>
            <span class="ho-stat-val">{{ formatNum(rows.length) }}</span>
          </div>
        </div>

        <div class="ho-filter-bar">
          <div class="ho-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="search" class="ho-search" type="text" placeholder="Search..." />
            <MpButton v-if="search" variant="ghost" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </MpButton>
          </div>
        </div>

        <ScanBar placeholder="Scan tracking no., packing no., or order no." class="ns-scanbar" @scan="handleScan">
          <MpButton variant="secondary" class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" type="button" @click="resetScan">Reset scan</MpButton>
        </ScanBar>

        <div v-if="!rows.length" class="empty-full">
          <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">No deliveries yet</p>
          <p class="empty-full-desc">Scan a tracking no., packing no., or order no. above to add a delivery to this shipment.</p>
        </div>

        <section v-else class="ho-items-section" :class="{ 'ho-items-section--bordered': isProgressive }">
          <div ref="itemsScrollEl" class="ho-items-scroll">
            <table class="ho-items">
              <colgroup>
                <col style="width: 16%" />
                <col style="width: 16%" />
                <col style="width: 20%" />
                <col style="width: 10%" />
                <col style="width: 12%" />
                <col style="width: 13%" />
                <col style="width: 13%" />
              </colgroup>
              <thead>
                <tr>
                  <th class="ho-th">Sales order no.</th>
                  <th class="ho-th">Packing no.</th>
                  <th class="ho-th">Source</th>
                  <th class="ho-th ho-th--num">SKU qty</th>
                  <th class="ho-th ho-th--num">Packed qty</th>
                  <th class="ho-th">Courier</th>
                  <th class="ho-th">Tracking no.</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in pagedRows"
                  :key="row.id"
                  class="ho-item-row"
                  :class="{ 'ho-item-row--flash': flashRowId === row.id }"
                >
                  <td class="ho-td ho-td--number">
                    <a class="cell-link" @click.stop="router.push(`/outbound-delivery/${row.salesOrderId}`)">{{ row.salesNo }}</a>
                  </td>
                  <td class="ho-td ho-td--number">
                    <a class="cell-link" @click.stop="router.push(`/packing/${row.packingTaskId}`)">{{ row.packingTaskNo }}</a>
                  </td>
                  <td class="ho-td"><SourceLabel :source="row.source" /></td>
                  <td class="ho-td ho-td--num">{{ formatNum(row.skuQty) }}</td>
                  <td class="ho-td ho-td--num">{{ formatNum(row.toShipQty) }}</td>
                  <td class="ho-td ho-td--input" :class="{ 'ho-td--input--error': courierError && !(courierByRow[row.id]?.trim()) }">
                    <!-- Courier is re-routable for every Ready-to-Ship row — including
                         ones that already carry a courier from the order/marketplace
                         (D5 AC#1); it locks only once a shipment doc exists (Out for
                         Delivery), which is a separate, read-only screen. -->
                    <MpPopover
                      :id="`ns-courier-${row.id}`"
                      placement="bottom-start" use-portal :is-keep-alive="false" is-close-on-select
                      @close="closeCourierPicker(row.id)"
                    >
                      <MpPopoverTrigger>
                        <div class="ho-courier-trigger">
                          <input
                            type="text" class="ho-courier-input" autocomplete="off"
                            :value="activeCourierRow === row.id ? courierSearch : (courierByRow[row.id] ?? '')"
                            placeholder="Select courier"
                            @focus="openCourierPicker(row.id)"
                            @input="activeCourierRow = row.id; courierSearch = ($event.target as HTMLInputElement).value"
                          />
                          <svg class="ho-courier-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
                        </div>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ width: '280px', maxHeight: '300px', overflowY: 'auto', padding: '0' })">
                        <MpPopoverList>
                          <MpPopoverListItem v-for="c in couriersFiltered()" :key="c.id" :is-active="c.name === (courierByRow[row.id] ?? '')" @click="selectCourier(row.id, c.name)">{{ c.name }}</MpPopoverListItem>
                          <p v-if="!couriersFiltered().length" class="ho-courier-none">No couriers found.</p>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>
                  </td>
                  <td class="ho-td ho-td--input">
                    <input
                      type="text" class="ho-text-input"
                      :value="trackingByRow[row.id] ?? ''"
                      :disabled="channelAwbLocked(row)"
                      placeholder="e.g. SD0009583"
                      @input="setTracking(row.id, ($event.target as HTMLInputElement).value)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
            <div ref="itemsSentinelEl" class="ho-items-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="ho-loading ho-items-loading">
              <MpSpinner size="sm" /> Loading deliveries…
            </div>
          </div>
          <div v-if="isProgressive" class="ho-items-count">
            Showing {{ pagedRows.length }} of {{ filteredRows.length }} deliveries
          </div>
        </section>
        <p v-if="showRowErrors && !rows.length" class="ho-error">You must scan at least one delivery to ship</p>
      </div>

    </div><!-- /detail-stage -->

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer">
      <MpButton variant="ghost" is-rounded @click="goBack">Cancel</MpButton>
      <MpButton variant="primary" is-rounded :is-disabled="isSaving" @click="handleSave">{{ isSaving ? 'Saving…' : 'Save' }}</MpButton>
    </footer>

    <NumberFormatSettingsModal
      v-model:open="noSettingsOpen"
      title="Transaction no. settings"
      caption="Transaction numbers are auto-generated by the system."
      :next-number="nextTxNo"
      :existing-formats="txNoFormats"
      @save="onNoFormatSave"
    />
  </div>
</template>

<style scoped>
/* ── Page shell ─────────────────────────────────────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
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
  background: var(--mp-background-stage, #ffffff); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
}
.detail-footer {
  flex-shrink: 0;
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage, #ffffff);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
/* ── Form grid ────────────────────────────────────────────────────────────── */
.ho-section { margin-bottom: var(--mp-spacing-6); }
.ho-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--mp-spacing-4); max-width: 558px; }
.ho-assignee-opt { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.ho-assignee-avatar {
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  border-radius: var(--mp-radii-full); flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--mp-font-sizes-xs); font-weight: var(--mp-font-weights-semi-bold);
}
.ho-datepicker :deep(.mp-date-picker) { width: 100%; }
.ho-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.ho-label-icon { display: inline-flex; align-items: center; color: var(--mp-icon-default, var(--mp-text-secondary)); cursor: default; }
.ho-txno-input {
  width: 100%; box-sizing: border-box; height: var(--mp-sizes-9\.5, 38px);
  padding: 0 var(--mp-spacing-3); border: 1px solid var(--mp-colors-border-form, #1d1f2429); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle, #f8f9f9); color: var(--mp-text-disabled);
  font-size: var(--mp-font-sizes-md); cursor: not-allowed;
}

/* ── Section title ───────────────────────────────────────────────────────── */
.ho-section-title {
  margin: 0 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}
.ho-sku-section { margin-bottom: var(--mp-spacing-6); }
.ho-summary { display: flex; align-items: center; gap: var(--mp-spacing-10); margin-bottom: var(--mp-spacing-4); }
.ho-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: var(--mp-sizes-24, 96px); }
.ho-stat-val { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.ho-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ho-error { margin: var(--mp-spacing-3) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c0392b); }

.ns-scanbar { margin-bottom: var(--mp-spacing-4); }

/* ── Filter bar (search within already-added deliveries) ───────────────────── */
.ho-filter-bar { display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-4); }
.ho-search-wrap { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-1\.5) var(--mp-spacing-3); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full); background: var(--mp-background-neutral, #ffffff); color: var(--mp-text-secondary); min-width: 240px; }
.ho-search-wrap:focus-within { border-color: var(--mp-border-bold, #8c9596); box-shadow: inset 0 0 0 1px var(--mp-border-bold, #8c9596); }
.ho-search { flex: 1; border: none; background: transparent; outline: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ho-search::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

/* ── Empty state (no deliveries scanned yet) ───────────────────────────────── */
.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Items table (form-table look: grey read-only cells, white editable cell) ── */
.ho-items-section { display: flex; flex-direction: column; }
.ho-items-section--bordered { border: 1px solid var(--mp-border-bold, #8c9596); border-radius: var(--mp-radii-lg); overflow: hidden; }
.ho-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.ho-items { width: 100%; table-layout: fixed; border-collapse: collapse; }
.ho-items thead .ho-th { position: sticky; top: 0; z-index: 1; }
.ho-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9); white-space: nowrap;
}
.ho-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.ho-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: left;
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9); vertical-align: top;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-right: 1px solid var(--mp-border-default, #e3e7e9);
}
.ho-td:last-child { border-right: none; }
.ho-td--num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }

/* Sales order no. / Packing no. cells — hover chip linking to their own detail page */
.ho-td--number { position: relative; }
/* Editable Courier/Tracking cell — white, input fills edge-to-edge, focus ring */
.ho-td--input { padding: 0; background: var(--mp-background-neutral, #ffffff); }
.ho-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); }
.ho-td--input--error { box-shadow: inset 0 0 0 2px var(--mp-border-danger, #dc2626); }
.ho-td--input--error:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); }
.ho-text-input {
  display: block; width: 100%; height: var(--mp-sizes-10, 40px); box-sizing: border-box;
  padding: 0 var(--mp-spacing-2); border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.ho-text-input:disabled { color: var(--mp-text-disabled); cursor: not-allowed; background: var(--mp-background-neutral-subtle, #f8f9f9); }
.ho-text-input::placeholder { color: var(--mp-text-placeholder); }
/* Courier picker (searchable MpPopover, from master data couriers) */
.ho-courier-trigger { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 100%; min-height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-2); cursor: text; }
.ho-courier-input { flex: 1; min-width: 0; border: none; outline: none; background: none; padding: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ho-courier-input::placeholder { color: var(--mp-text-placeholder); }
.ho-courier-chevron { flex-shrink: 0; color: var(--mp-icon-default); }
.ho-courier-none { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); text-align: center; }

/* Newly-scanned row flash (~700ms), same idea as the receiving/put-away scan flash */
.ho-item-row--flash .ho-td { animation: ho-row-flash 700ms ease-out; }
@keyframes ho-row-flash {
  0% { background: var(--mp-background-success-subtle, #e3f6ec); }
  100% { background: transparent; }
}

/* Progressive pagination — sentinel + loading + count (mirrors Create shipment) */
.ho-items-sentinel { height: 1px; }
.ho-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.ho-loading {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-md);
}
.ho-items-count {
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
