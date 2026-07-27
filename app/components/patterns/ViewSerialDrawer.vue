<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { MpIcon, MpBadge, MpSpinner } from '@mekari/pixel3'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { productBySku } from '~/data/inventory'

export interface PickedSerialRow { serial: string; location: string }

const props = defineProps<{
  open: boolean
  sku: string
  warehouseId: string
  /** 'count' (default) = stock count. 'packing' = read-only list of serials picked
   *  for this line (no on-hand/status — just the serials + their bin, as-is). */
  kind?: 'count' | 'packing'
  countedTotal: number
  productName: string
  productImg: string
  storageLocation?: string
  /** Packing mode: the exact serials picked for this line — shown as-is. */
  pickedSerials?: PickedSerialRow[]
  /** Packing mode (picking task view): this line's ORIGINAL serial reservation
   *  plan, frozen at task creation — distinct from pickedSerials, which only ever
   *  holds what was actually scanned. When given, rows are the union of planned +
   *  picked serials, each carrying a status badge ("Reserved" while only planned,
   *  "Picked" once it's also in pickedSerials) — mirrors ManageSerialDrawer's
   *  picking-execution badges, read-only. */
  plannedSerials?: PickedSerialRow[]
  /** Picking only — true once the picking task is settled ("completed" or
   *  "partially picked", i.e. endPicking has actually run). endPicking releases
   *  the reservation for every planned serial that DIDN'T end up in the real
   *  result and re-reserves only what was actually picked — so once finished, a
   *  planned-but-never-picked serial genuinely isn't reserved for this line
   *  anymore (it's free stock again, possibly claimed by a different order next).
   *  Showing it as "Reserved" past that point would be factually wrong, so once
   *  taskFinished is true, plannedSerials stops contributing extra rows — only
   *  the real pickedSerials show, all "Picked". While still open/in progress
   *  (drafts only — savePickingDraft never releases anything), the union +
   *  "Reserved" badge for untouched plan serials is correct and unaffected. */
  taskFinished?: boolean
  /** Packing mode: this line's planned/target qty, shown as its own stat (label
   *  below) when given (picking, before it's fully executed — pickedSerials already
   *  reflects the reservation plan, not real progress, so the two need to be told
   *  apart explicitly). */
  qtyToPick?: number
  /** Label for the qtyToPick stat — defaults to "Qty to pick" (picking). Other
   *  stages reuse the exact same qtyToPick/plannedSerials plumbing under their own
   *  name, e.g. delivery's "Picked qty" shown before "Packed qty". */
  plannedQtyLabel?: string
  /** Packing mode: the REAL picked-so-far qty, overriding the qtyLabel stat's
   *  value (which otherwise counts pickedSerials — accurate once picking is
   *  finished, but wrong while a task is still open/in progress). */
  pickedQty?: number
  /** Label for the always-shown qty stat — defaults to "Picked qty" (picking).
   *  Delivery passes "Packed qty" instead (same numbers, different stage's name). */
  qtyLabel?: string
  /** The SKU's full order demand, shown as an extra stat when given (e.g. delivery
   *  wants "Order qty" before "Picked qty"/"Packed qty"). */
  orderQty?: number
  /** Delivery only: units of this line ALREADY shipped by an earlier, independent
   *  picking→packing→shipment cycle for the same order (partially shipped, then
   *  picked/packed/shipped again for the remainder) — shown as its own
   *  "Previously shipped" stat after Packed qty, explaining why Order qty doesn't
   *  match Picked/Packed qty. Only rendered when > 0 — a normal, single-cycle
   *  shipment never shows this stat at all. */
  shippedQty?: number
  /** Status badge text for a plannedSerials-only row (not yet in pickedSerials) —
   *  defaults to "Reserved" (picking: held for this order, not yet scanned). Put-
   *  away reuses this same union/badge plumbing for a different fact (a serial
   *  already received, not yet assigned a bin) and passes "Received" instead —
   *  nothing is being "reserved" there. */
  statusPlannedLabel?: string
  /** Status badge text once a serial is also in pickedSerials — defaults to
   *  "Picked" (picking). Put-away passes "Assigned", matching ManageSerialDrawer's
   *  own put-away vocabulary for the same assigned-a-bin fact. */
  statusPickedLabel?: string
}>()

const emit = defineEmits<{ 'update:open': [boolean] }>()

const isPacking = computed(() => props.kind === 'packing')
const qtyLabel = computed(() => props.qtyLabel ?? 'Picked qty')
const plannedQtyLabel = computed(() => props.plannedQtyLabel ?? 'Qty to pick')
const statusPlannedLabel = computed(() => props.statusPlannedLabel ?? 'Reserved')
const statusPickedLabel = computed(() => props.statusPickedLabel ?? 'Picked')
// Packing mode normally has no status concept (just the picked list, as-is) — but
// when plannedSerials is given (picking task view), rows carry a Reserved/Picked
// status just like ManageSerialDrawer's picking-execution badges, so show the column.
const hasStatus = computed(() => !isPacking.value || props.plannedSerials !== undefined)

const warehouseStock = computed(() => {
  const wh = getWarehouseDetail(props.warehouseId)
  return wh?.stock.find(s => s.sku === props.sku)
})

interface SerialRow { serial: string; location: string; counted: boolean; status?: 'reserved' | 'picked' }

const totalOnHand = computed(() => {
  const s = warehouseStock.value?.serials
  return s ? s.available.length + s.reserved.length : 0
})
const difference = computed(() => props.countedTotal - totalOnHand.value)

// Rows = all on-hand serials (first countedTotal marked counted, rest not counted)
// + any extra serials found during count (counted > onHand → generate extras).
const allRows = computed<SerialRow[]>(() => {
  // Packing: show the exact serials picked for this line, as-is — no derivation
  // from live warehouse stock. When plannedSerials is given (picking task view),
  // show the union of planned + picked, each with a Reserved/Picked status badge.
  if (isPacking.value) {
    if (props.plannedSerials) {
      // pickedSerials only reflects the REAL result once the task has actually
      // been draft-saved/finished at least once (pickedQty > 0) — before that
      // first save it's still the untouched creation-time plan (identical to
      // plannedSerials), so treating it as "picked" would mark every planned
      // serial Picked on a task that hasn't started. Callers with no such
      // ambiguity (delivery — its serial data is always the real, settled
      // result) don't pass pickedQty at all, so they're never gated by this.
      const hasRealPicks = props.pickedQty === undefined || props.pickedQty > 0
      // Once the task is finished, a planned serial that never got picked was
      // released back to free stock by endPicking — it no longer belongs on this
      // line at all, so don't merge it in as a stale "Reserved" row.
      const plannedMap = props.taskFinished ? new Map<string, PickedSerialRow>() : new Map(props.plannedSerials.map(s => [s.serial, s]))
      const pickedMap = hasRealPicks ? new Map((props.pickedSerials ?? []).map(s => [s.serial, s])) : new Map<string, PickedSerialRow>()
      const serials = [...new Set([...plannedMap.keys(), ...pickedMap.keys()])]
      return serials.map(serial => {
        const picked = pickedMap.get(serial)
        const planned = plannedMap.get(serial)
        return { serial, location: picked?.location ?? planned?.location ?? '', counted: true, status: picked ? 'picked' as const : 'reserved' as const }
      })
    }
    return (props.pickedSerials ?? []).map(s => ({ serial: s.serial, location: s.location, counted: true }))
  }

  const serials = warehouseStock.value?.serials
  const existing = serials ? [
    ...serials.available.map(u => ({ serial: u.serial, location: u.location })),
    ...serials.reserved.map(u => ({ serial: u.serial, location: u.location })),
  ] : []

  const counted = props.countedTotal
  const loc = props.storageLocation
  const rows: SerialRow[] = existing.map((u, i) => ({ serial: u.serial, location: loc ?? u.location, counted: i < counted }))

  if (counted > existing.length) {
    const prefix = (props.sku.replace(/[^A-Za-z0-9]/g, '').slice(0, 3).toUpperCase() || 'SN')
    const fallbackLoc = loc ?? existing[0]?.location ?? '—'
    for (let i = existing.length; i < counted; i++) {
      rows.push({
        serial: `${prefix}${String(90000 + i).padStart(5, '0')}`,
        location: fallbackLoc,
        counted: true,
      })
    }
  }

  return rows
})

// ── Search ────────────────────────────────────────────────────────────────────
const serialSearch = ref('')

const filteredRows = computed<SerialRow[]>(() => {
  const q = serialSearch.value.trim().toLowerCase()
  if (!q) return allRows.value
  return allRows.value.filter(r =>
    r.serial.toLowerCase().includes(q) ||
    r.location.toLowerCase().includes(q),
  )
})

// ── Progressive pagination ────────────────────────────────────────────────────
const PAGE_SIZE = 20
const shownCount = ref(PAGE_SIZE)
const loadingMore = ref(false)
const visibleRows = computed(() => filteredRows.value.slice(0, shownCount.value))
const hasMore = computed(() => shownCount.value < filteredRows.value.length)

function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, filteredRows.value.length)
    loadingMore.value = false
  }, 300)
}

const contentEl = ref<HTMLElement | null>(null)
const sentinelEl = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

function setupObserver() {
  observer?.disconnect()
  if (!contentEl.value || !sentinelEl.value) return
  observer = new IntersectionObserver(
    (entries) => { if (entries[0]!.isIntersecting) loadMore() },
    { root: contentEl.value, rootMargin: '0px 0px 80px 0px' },
  )
  observer.observe(sentinelEl.value)
}

watch(() => props.open, (isOpen) => {
  if (!isOpen) { serialSearch.value = ''; return }
  shownCount.value = PAGE_SIZE
  nextTick(setupObserver)
})

watch(serialSearch, () => {
  shownCount.value = PAGE_SIZE
  nextTick(setupObserver)
})

onUnmounted(() => observer?.disconnect())

function fmt(n: number) { return n.toLocaleString('id-ID') }
function fmtDiff(n: number) { return n > 0 ? `+${fmt(n)}` : fmt(n) }
function close() { emit('update:open', false) }
</script>

<template>
  <Transition name="vsd">
  <div v-if="open" class="vsd-overlay" @click.self="close">
    <div class="vsd-panel" role="dialog" aria-label="View serial numbers">

      <header class="vsd-header">
        <h2 class="vsd-title">Serial number detail</h2>
        <button class="vsd-close" type="button" aria-label="Close" @click="close">
          <MpIcon name="close" size="md" />
        </button>
      </header>

      <div class="vsd-content" :class="{ 'vsd-content--hug': isPacking }">

        <!-- Product info bar -->
        <div class="vsd-info-bar">
          <div class="vsd-info-product">
            <img v-if="productImg" class="vsd-info-thumb" :src="productImg" :alt="productName" loading="lazy" />
            <span v-else class="vsd-info-thumb vsd-info-thumb--empty" />
            <div class="vsd-info-names">
              <span class="vsd-info-name">{{ productName }}</span>
              <span class="vsd-info-sku">{{ sku }}</span>
            </div>
          </div>
          <div class="vsd-info-stats">
            <template v-if="isPacking">
              <div v-if="orderQty !== undefined" class="vsd-stat">
                <span class="vsd-stat-label">Order qty</span>
                <span class="vsd-stat-value">{{ fmt(orderQty) }}</span>
              </div>
              <div v-if="qtyToPick !== undefined" class="vsd-stat">
                <span class="vsd-stat-label">{{ plannedQtyLabel }}</span>
                <span class="vsd-stat-value">{{ fmt(qtyToPick) }}</span>
              </div>
              <div class="vsd-stat">
                <span class="vsd-stat-label">{{ qtyLabel }}</span>
                <span class="vsd-stat-value">{{ fmt(pickedQty ?? allRows.length) }}</span>
              </div>
              <div v-if="shippedQty !== undefined && shippedQty > 0" class="vsd-stat">
                <span class="vsd-stat-label">Previously shipped</span>
                <span class="vsd-stat-value">{{ fmt(shippedQty) }}</span>
              </div>
            </template>
            <template v-else>
              <div class="vsd-stat">
                <span class="vsd-stat-label">Prev. on hand qty</span>
                <span class="vsd-stat-value">{{ fmt(totalOnHand) }}</span>
              </div>
              <div class="vsd-stat">
                <span class="vsd-stat-label">Counted qty</span>
                <span class="vsd-stat-value">{{ fmt(countedTotal) }}</span>
              </div>
              <div
                class="vsd-stat"
                :class="{ 'vsd-stat--pos': difference > 0, 'vsd-stat--neg': difference < 0 }"
              >
                <span class="vsd-stat-label">Difference</span>
                <span class="vsd-stat-value">{{ fmtDiff(difference) }}</span>
              </div>
            </template>
          </div>
        </div>

        <!-- Filter bar -->
        <div class="vsd-filter-bar">
          <div class="vsd-filter-search-wrap">
            <svg class="vsd-filter-search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="1.5"/>
              <path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="serialSearch" class="vsd-filter-search" type="text" placeholder="Search..." />
            <button v-if="serialSearch" class="search-clear-btn search-clear-btn--overlay" type="button" aria-label="Clear search" @click="serialSearch = ''">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Table -->
        <div ref="contentEl" class="vsd-table-wrap" :class="{ 'vsd-table-wrap--hug': isPacking }">
          <table class="vsd-table">
            <colgroup>
              <col class="vsd-col-sn" />
              <col class="vsd-col-loc" />
              <col v-if="hasStatus" class="vsd-col-status" />
            </colgroup>
            <thead>
              <tr>
                <th class="vsd-th">Serial number</th>
                <th class="vsd-th">Location</th>
                <th v-if="hasStatus" class="vsd-th">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visibleRows" :key="row.serial" class="vsd-tr" :class="{ 'vsd-tr--removed': !row.counted }">
                <td class="vsd-td vsd-td--mono" :class="{ 'vsd-td--strike': !row.counted }">{{ row.serial }}</td>
                <td class="vsd-td vsd-td--muted" :class="{ 'vsd-td--strike': !row.counted }">{{ row.location || '—' }}</td>
                <td v-if="isPacking && hasStatus" class="vsd-td vsd-td--status">
                  <MpBadge v-if="row.status === 'picked'" for="tableStatus" type="completed">{{ statusPickedLabel }}</MpBadge>
                  <MpBadge v-else-if="row.status === 'reserved'" for="tableStatus" type="warning">{{ statusPlannedLabel }}</MpBadge>
                </td>
                <td v-else-if="!isPacking" class="vsd-td vsd-td--status">
                  <MpBadge v-if="row.counted" variant="success">Counted</MpBadge>
                  <MpBadge v-else variant="danger">Not counted</MpBadge>
                </td>
              </tr>
              <tr v-if="!filteredRows.length" class="vsd-tr">
                <td :colspan="hasStatus ? 3 : 2" class="vsd-td vsd-td--empty">{{ serialSearch ? 'No serial numbers match your search.' : 'No serial number data available.' }}</td>
              </tr>
              <tr ref="sentinelEl" aria-hidden="true" class="vsd-sentinel-row"><td :colspan="hasStatus ? 3 : 2" /></tr>
              <tr v-if="loadingMore" class="vsd-tr">
                <td :colspan="hasStatus ? 3 : 2" class="vsd-td">
                  <div class="vsd-loading-inner"><MpSpinner size="sm" /> Loading…</div>
                </td>
              </tr>
            </tbody>
          </table>
          <p class="vsd-count">Showing {{ visibleRows.length }} of {{ filteredRows.length }} serial numbers<template v-if="serialSearch"> (filtered from {{ allRows.length }})</template></p>
        </div>

      </div>

    </div>
  </div>
  </Transition>
</template>

<style scoped>
.vsd-enter-active,
.vsd-leave-active { transition: background-color 250ms ease; }
.vsd-enter-from, .vsd-leave-to { background-color: transparent; }
.vsd-enter-active :deep(.vsd-panel) { transition: transform 350ms ease-out; }
.vsd-leave-active :deep(.vsd-panel)  { transition: transform 250ms ease-in; }
.vsd-enter-from :deep(.vsd-panel),
.vsd-leave-to :deep(.vsd-panel) { transform: translateX(calc(100% + 12px)); }

.vsd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.vsd-panel {
  margin: var(--mp-spacing-3);
  width: min(1400px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}

.vsd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.vsd-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-default); }
.vsd-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.vsd-close:hover { background: var(--mp-background-neutral-hovered); }

.vsd-content {
  flex: 1; min-height: 0; overflow: hidden;
  padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: 20px;
}
.vsd-content > * { flex-shrink: 0; }
/* Packing/picking mode: short, fixed lists — hug content height like ViewBatchDrawer
   instead of stretching the table to fill the drawer, so the whole panel scrolls. */
.vsd-content--hug { overflow-y: auto; }

.vsd-info-bar {
  display: flex; align-items: center; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.vsd-info-product { display: flex; align-items: center; gap: var(--mp-spacing-3); flex: 1; min-width: 0; }
.vsd-info-thumb {
  width: 40px; height: 40px; border-radius: var(--mp-radii-md);
  object-fit: cover; flex-shrink: 0;
  border: 1px solid var(--mp-border-subtle);
  background: var(--mp-background-neutral);
}
.vsd-info-thumb--empty { background: var(--mp-background-neutral-subtle); }
.vsd-info-names { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.vsd-info-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vsd-info-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.vsd-info-stats { display: flex; gap: var(--mp-spacing-6); flex-shrink: 0; }
.vsd-stat { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }
.vsd-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.vsd-stat-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; font-weight: var(--mp-font-weights-medium); }
.vsd-stat--pos .vsd-stat-value { color: var(--mp-text-success, #18794e); }
.vsd-stat--neg .vsd-stat-value { color: var(--mp-text-danger, #a8352d); }

.vsd-filter-bar { display: flex; justify-content: flex-end; }
.vsd-filter-search-wrap {
  position: relative; display: flex; align-items: center;
  width: 220px;
}
.vsd-filter-search-icon {
  position: absolute; left: var(--mp-spacing-3); color: var(--mp-icon-subtle); pointer-events: none; flex-shrink: 0;
}
.vsd-filter-search {
  width: 100%; box-sizing: border-box;
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-2) calc(var(--mp-spacing-3) + 16px + var(--mp-spacing-2));
  padding-right: 30px;
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  background: var(--mp-background-neutral, #fff); outline: none;
}
.vsd-filter-search:focus { border-color: var(--mp-border-brand-bold, #029861); }
.vsd-filter-search::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
.search-clear-btn--overlay { position: absolute; right: var(--mp-spacing-3, 12px); top: 50%; transform: translateY(-50%); }

.vsd-table-wrap {
  flex: 1; min-height: 0;
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  overflow-y: auto;
}
.vsd-table-wrap--hug { flex: none; overflow-y: visible; }
.vsd-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; }
.vsd-col-sn     { width: 220px; }
.vsd-col-loc    { /* flexible */ }
.vsd-col-status { width: 120px; }

.vsd-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
  position: sticky; top: 0; z-index: 1;
}

.vsd-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: middle;
  background: var(--mp-background-neutral, #fff);
}
.vsd-td--muted { color: var(--mp-text-secondary); }
.vsd-td--mono { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); }
.vsd-td--strike { text-decoration: line-through; }
.vsd-td--status { padding: 8px var(--mp-spacing-2); }
.vsd-td--empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-8) 0; }

/* Not-counted rows get danger-subtle background */
.vsd-tr--removed .vsd-td { background: var(--mp-background-danger-subtle, #fff0ee); }

.vsd-sentinel-row { height: 0; }
.vsd-sentinel-row td { padding: 0; border: none; height: 0; }
.vsd-loading-inner {
  display: flex; align-items: center; justify-content: center;
  gap: var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.vsd-count {
  margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  position: sticky; bottom: 0;
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  background: var(--mp-background-neutral, #fff);
}
.vsd-table-wrap--hug .vsd-count { position: static; }

</style>
