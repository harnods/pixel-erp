<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import {
  MpButton, MpAutocomplete, MpDatePicker, MpIcon, MpSpinner,
  MpFormControl, MpFormLabel, MpFormErrorMessage, css, toast,
} from '@mekari/pixel3'
import SourceLabel from '~/components/patterns/SourceLabel.vue'
import ScanBar from '~/components/patterns/ScanBar.vue'
import {
  getDeliveryTask, findReadyToShipByPackingNo, findReadyToShipByPackingNoAnyWarehouse,
  handoverToCourierBulk, type DeliveryTask,
} from '~/data/deliveryTasks'
import { outgoingOrders, isMarketplaceOrder } from '~/data/outgoing'
import { scrollToFirstError } from '~/utils/form'
import { getWarehouseOperators } from '~/data/warehouseTeam'
import { notifyScanError } from '~/utils/scan'
import { playScanSuccessSound } from '~/utils/sound'

const router = useRouter()
const route = useRoute()

function toDisplayDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function toISODate(display: string) {
  const [d, m, y] = display.split('/')
  return `${y}-${m}-${d}`
}
const todayDisplay = toDisplayDate(new Date().toISOString().slice(0, 10))

// ─── Source deliveries — bulk-selected on the Delivery index, all one warehouse.
// Also extendable here by scanning a packing no. (same behavior as New shipment). ──
const initialDeliveryIds = computed<string[]>(() =>
  (route.query.deliveryIds as string | undefined)?.split(',').map(s => s.trim()).filter(Boolean) ?? [],
)
const taskIds = ref<string[]>(initialDeliveryIds.value)
const tasks = computed<DeliveryTask[]>(() =>
  taskIds.value
    .map(id => getDeliveryTask(id))
    .filter((t): t is DeliveryTask => !!t && t.status === 'ready to ship'),
)
const hasSource = computed(() => tasks.value.length > 0)
const warehouseName = computed(() => tasks.value[0]?.warehouseName ?? '')
const warehouseAc = computed(() => tasks.value[0] ? [{ id: tasks.value[0]!.warehouseId, name: warehouseName.value }] : [])
const warehouseId = ref('')
watch(tasks, (ts) => { warehouseId.value = ts[0]?.warehouseId ?? '' }, { immediate: true })

interface Row { id: string; salesOrderId: string; salesNo: string; packingTaskId: string; packingTaskNo: string; source: string; isMarketplace: boolean; skuQty: number; toShipQty: number }
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
    skuQty: t.skuQty,
    toShipQty: t.toShipQty,
  }
}))

// ─── Search + progressive pagination for the deliveries table (mirrors CreatePutAwayPage) ──
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

// ─── Add more by scanning a packing no. — same match/flash behavior as New shipment,
// scoped to this handover's (already-locked) warehouse. ─────────────────────────
// Scanning is harmless to undo — nothing is persisted until Save — so let the
// operator wipe every scan-added delivery and go back to what was pre-selected.
function resetScan() { taskIds.value = [...initialDeliveryIds.value] }
const flashRowId = ref<string | null>(null)
function handleScan(raw: string) {
  const value = raw.trim()
  if (!value) return
  const match = findReadyToShipByPackingNo(warehouseId.value, value)
  if (!match) {
    const elsewhere = findReadyToShipByPackingNoAnyWarehouse(value)
    if (elsewhere) {
      notifyScanError(`"${value}" belongs to ${elsewhere.warehouseName}, not ${warehouseName.value}`)
    } else {
      notifyScanError(`Barcode not found: "${value}"`)
    }
    return
  }
  if (taskIds.value.includes(match.id)) {
    notifyScanError('Already added to this handover')
    return
  }
  taskIds.value = [...taskIds.value, match.id]
  playScanSuccessSound()
  // Keep the newly-scanned row within the shown page so its flash is visible,
  // instead of resetting pagination (which would hide it behind "load more").
  shownCount.value = Math.max(shownCount.value, filteredRows.value.length)
  flashRowId.value = match.id
  setTimeout(() => { if (flashRowId.value === match.id) flashRowId.value = null }, 700)
}

// ─── Assignee + transaction date/no. ──────────────────────────────────────────
// Choices are scoped to this handover's warehouse — only its Operators are valid.
const ASSIGNEES = computed(() => getWarehouseOperators(warehouseId.value))
const assigneeId = ref('')
const assigneeError = ref(false)
const isSaving = ref(false)
watch(assigneeId, (v) => { if (v) assigneeError.value = false })
watch(warehouseId, () => { assigneeId.value = '' })
const assigneeLabel = computed(() => ASSIGNEES.value.find(a => a.id === assigneeId.value)?.name ?? '')

const transactionDate = ref(todayDisplay)
const transactionDateError = ref(false)

// ─── Per-delivery courier + tracking no. — marketplace orders arrive with theirs
// already fixed (set when the delivery was created); non-marketplace ones are
// free text, filled in here. ─────────────────────────────────────────────────
const courierByRow = ref<Record<string, string>>({})
const trackingByRow = ref<Record<string, string>>({})
watch(tasks, (ts) => {
  const c: Record<string, string> = {}
  const tr: Record<string, string> = {}
  for (const t of ts) {
    c[t.id] = courierByRow.value[t.id] ?? t.courier ?? ''
    tr[t.id] = trackingByRow.value[t.id] ?? t.trackingNo ?? ''
  }
  courierByRow.value = c
  trackingByRow.value = tr
}, { immediate: true })
function setCourier(id: string, val: string) { courierByRow.value = { ...courierByRow.value, [id]: val } }
function setTracking(id: string, val: string) { trackingByRow.value = { ...trackingByRow.value, [id]: val } }


function formatNum(n: number) { return n.toLocaleString('id-ID') }
function goBack() { router.push({ path: '/outbound-delivery', query: { tab: 'Ready to ship' } }) }

function validate(): boolean {
  let valid = true
  if (!assigneeId.value) { assigneeError.value = true; valid = false }
  if (!transactionDate.value) { transactionDateError.value = true; valid = false }
  return valid
}

async function handleSave() {
  if (!hasSource.value || !validate()) { scrollToFirstError(); return }
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
  // Print PDF only makes sense once the shipment is saved — it lives on the details
  // page, not this form. A mixed-courier batch splits into several shipments, so
  // there's no single details page to land on — go back to the Shipped tab instead.
  if (shipments.length === 1) {
    router.push(`/outbound-delivery/shipment/${shipments[0]!.shipmentSeq}`)
  } else {
    router.push({ path: '/outbound-delivery', query: { tab: 'Shipped' } })
  }
}
</script>

<template>
  <div class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goBack">Ready to ship</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">Create shipment</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- Not found -->
      <div v-if="!hasSource" class="ho-empty">
        <p class="ho-empty-title">Delivery not found</p>
        <p class="ho-empty-desc">Select one or more ready-to-ship deliveries from the same warehouse to hand over.</p>
      </div>

      <template v-else>
        <!-- Warehouse + Assignee + Transaction date/no. -->
        <div class="ho-section ho-grid">
          <MpFormControl id="ho-warehouse">
            <MpFormLabel>Warehouse</MpFormLabel>
            <MpAutocomplete
              id="ho-warehouse-ac"
              v-model="warehouseId"
              :data="warehouseAc"
              label-prop="name"
              value-prop="id"
              placeholder="Warehouse"
              use-portal is-full-width is-disabled
            />
          </MpFormControl>

          <MpFormControl id="ho-assignee" is-required :is-invalid="assigneeError">
            <MpFormLabel>Assignee</MpFormLabel>
            <MpAutocomplete
              id="ho-assignee-ac"
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

          <MpFormControl id="ho-txdate" is-required :is-invalid="transactionDateError">
            <MpFormLabel>Transaction date</MpFormLabel>
            <div class="ho-datepicker">
              <MpDatePicker
                id="ho-txdate-dp"
                v-model="transactionDate"
                format="DD/MM/YYYY"
                value-type="format"
                use-portal
                @update:model-value="transactionDateError = false"
              />
            </div>
            <MpFormErrorMessage>You must select transaction date</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="ho-txno">
            <div class="ho-label-row">
              <MpFormLabel>Transaction no.</MpFormLabel>
              <span class="ho-label-icon" title="Auto-generated"><MpIcon name="settings" size="sm" /></span>
            </div>
            <input id="ho-txno-input" class="ho-txno-input" value="" placeholder="[Auto]" disabled />
          </MpFormControl>
        </div>

        <!-- Deliveries to hand over -->
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
              <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                </svg>
              </button>
            </div>
          </div>

          <ScanBar placeholder="Scan barcode..." class="ns-scanbar" @scan="handleScan">
            <button class="btn-enterprise btn-enterprise--secondary btn-enterprise--sm" type="button" @click="resetScan">Reset scan</button>
          </ScanBar>

          <section class="ho-items-section" :class="{ 'ho-items-section--bordered': isProgressive }">
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
                      <div class="cell-with-action">
                        <span>{{ row.salesNo }}</span>
                        <button class="row-hover-btn" type="button" @click.stop="router.push(`/outbound-delivery/${row.salesOrderId}`)">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="ho-td ho-td--number">
                      <div class="cell-with-action">
                        <span>{{ row.packingTaskNo }}</span>
                        <button class="row-hover-btn" type="button" @click.stop="router.push(`/packing/${row.packingTaskId}`)">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="ho-td"><SourceLabel :source="row.source" /></td>
                    <td class="ho-td ho-td--num">{{ formatNum(row.skuQty) }}</td>
                    <td class="ho-td ho-td--num">{{ formatNum(row.toShipQty) }}</td>
                    <td class="ho-td ho-td--input">
                      <input
                        type="text" class="ho-text-input"
                        :value="courierByRow[row.id] ?? ''"
                        :disabled="row.isMarketplace"
                        placeholder="e.g. JNE, SiCepat"
                        @input="setCourier(row.id, ($event.target as HTMLInputElement).value)"
                      />
                    </td>
                    <td class="ho-td ho-td--input">
                      <input
                        type="text" class="ho-text-input"
                        :value="trackingByRow[row.id] ?? ''"
                        :disabled="row.isMarketplace"
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
        </div>
      </template>

    </div><!-- /detail-stage -->

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer">
      <MpButton variant="ghost" is-rounded @click="goBack">Cancel</MpButton>
      <MpButton variant="primary" is-rounded :is-disabled="isSaving" @click="handleSave">{{ isSaving ? 'Saving…' : 'Save' }}</MpButton>
    </footer>
  </div>
</template>

<style scoped>
/* ── Page shell ─────────────────────────────────────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
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
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
}
.detail-footer {
  flex-shrink: 0;
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-top: 1px solid var(--mp-border-default);
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
  width: 100%; box-sizing: border-box; height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle); color: var(--mp-text-disabled);
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
.ho-search-wrap { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-1\.5) var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full); background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 240px; }
.ho-search-wrap:focus-within { border-color: var(--mp-border-bold); box-shadow: 0 0 0 1px var(--mp-border-bold); }
.ho-search { flex: 1; border: none; background: transparent; outline: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.ho-search::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

/* ── Items table (form-table look: grey read-only cells, white editable cell) ── */
.ho-items-section { display: flex; flex-direction: column; }
.ho-items-section--bordered { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg); overflow: hidden; }
.ho-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.ho-items { width: 100%; table-layout: fixed; border-collapse: collapse; }
.ho-items thead .ho-th { position: sticky; top: 0; z-index: 1; }
.ho-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.ho-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.ho-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: left;
  border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
  background: var(--mp-background-neutral-subtle);
  border-right: 1px solid var(--mp-border-default);
}
.ho-td:last-child { border-right: none; }
.ho-td--num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }

/* Sales order no. / Packing no. cells — hover chip linking to their own detail page */
.ho-td--number { position: relative; }
.cell-with-action { display: flex; align-items: center; width: 100%; min-width: 0; }
.row-hover-btn {
  position: absolute; right: var(--mp-spacing-2); top: var(--mp-spacing-2\.5, 10px); transform: translateY(-50%); display: none;
  align-items: center; gap: var(--mp-spacing-1\.5); padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1; color: var(--mp-text-secondary);
}
.row-hover-btn__label { font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase; }
.ho-item-row:hover .row-hover-btn { display: flex; }
/* Editable Courier/Tracking cell — white, input fills edge-to-edge, focus ring */
.ho-td--input { padding: 0; background: var(--mp-background-neutral); }
.ho-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); }
.ho-text-input {
  display: block; width: 100%; height: var(--mp-sizes-10, 40px); box-sizing: border-box;
  padding: 0 var(--mp-spacing-2); border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.ho-text-input:disabled { color: var(--mp-text-disabled); cursor: not-allowed; background: var(--mp-background-neutral-subtle); }
.ho-text-input::placeholder { color: var(--mp-text-placeholder); }

/* Newly-scanned row flash (~700ms), same idea as New shipment / receiving / put-away */
.ho-item-row--flash .ho-td { animation: ho-row-flash 700ms ease-out; }
@keyframes ho-row-flash {
  0% { background: var(--mp-background-success-subtle, #e3f6ec); }
  100% { background: transparent; }
}

/* Progressive pagination — sentinel + loading + count (mirrors CreatePutAwayPage) */
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

/* ── Empty state ─────────────────────────────────────────────────────────── */
.ho-empty {
  display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-10, 40px) 0;
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg);
}
.ho-empty-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ho-empty-desc { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
