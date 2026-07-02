<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import {
  MpButton, MpCheckbox, MpAutocomplete, MpSpinner,
  MpFormControl, MpFormLabel, MpFormErrorMessage, css,
} from '@mekari/pixel3'
import ProductCell from '~/components/patterns/ProductCell.vue'
import { pickableOrders, type OutgoingOrder } from '~/data/outgoing'
import { addPickingTask, pickedQtyForOrderSku, type PickingLine } from '~/data/pickingTasks'
import { orderSkuLines } from '~/data/inventory'
import { binForSku } from '~/data/warehouseDetails'

const router = useRouter()
const route  = useRoute()

const ASSIGNEES = [
  { id: 'u01', name: 'Budi Santoso',    initials: 'BS', hue: 210 },
  { id: 'u02', name: 'Dewi Rahayu',     initials: 'DR', hue: 145 },
  { id: 'u03', name: 'Rizki Pratama',   initials: 'RP', hue: 30  },
  { id: 'u04', name: 'Agus Firmansyah', initials: 'AF', hue: 280 },
  { id: 'u05', name: 'Sari Indah',      initials: 'SI', hue: 320 },
  { id: 'u06', name: 'Hendra Wijaya',   initials: 'HW', hue: 170 },
  { id: 'u07', name: 'Citra Kusuma',    initials: 'CK', hue: 55  },
  { id: 'u08', name: 'Galih Nugraha',   initials: 'GN', hue: 100 },
]

// ─── Pickable orders (open / in progress) ──────────────────────────────────────
const allPickable = computed<OutgoingOrder[]>(() => pickableOrders())

// Only warehouses that actually have pickable orders
const availableWarehouses = computed(() => {
  const seen = new Set<string>()
  const list: { id: string; name: string }[] = []
  for (const o of allPickable.value) {
    if (!seen.has(o.warehouseId)) {
      seen.add(o.warehouseId)
      list.push({ id: o.warehouseId, name: o.warehouseName })
    }
  }
  return list
})

// ─── Prefill from query (when opened from the Outgoing index: row / bulk) ───────
// Initialized at setup (before the clearing watcher is active) so the navigated
// warehouse + sales orders come in already selected.
const prefillWarehouse = (route.query.warehouseId as string | undefined) ?? ''
const prefillOrderIds = ((route.query.orderIds as string | undefined)?.split(',').filter(Boolean)) ?? []

// ─── Warehouse selector ────────────────────────────────────────────────────────
const warehouseId = ref(prefillWarehouse)
const warehouseError = ref(false)
// User changing the warehouse resets the order selection (initial value doesn't fire).
watch(warehouseId, (v) => { if (v) warehouseError.value = false })
const warehouseName = computed(() =>
  availableWarehouses.value.find(w => w.id === warehouseId.value)?.name ?? '',
)
const isWarehouseLocked = computed(() => !!route.query.warehouseId)

// ─── Assignee ───────────────────────────────────────────────────────────────────
const assigneeId    = ref('')
const assigneeError = ref(false)
watch(assigneeId, (v) => { if (v) assigneeError.value = false })
const assigneeLabel = computed(() => ASSIGNEES.find(a => a.id === assigneeId.value)?.name ?? '')

// ─── Orders to pick — fixed from the selection made on the Outgoing tab ──────────
// The sales orders are chosen on the Outgoing list (row / bulk "Create picking list")
// and passed in via the query; this form no longer lets you change that selection.
const selectedOrders = computed<OutgoingOrder[]>(() =>
  allPickable.value.filter(o => prefillOrderIds.includes(o.id)),
)

// ─── Picking list per sales order ───────────────────────────────────────────────
// Each selected order is exploded into its own SKU lines (deterministic from the
// catalog). Picking is reviewed PER ORDER, so each order gets its own table.
function hashStr(s: string): number {
  let h = 0
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return h
}

// Warehouse stock per SKU (deterministic). A WMS prevents overselling, so stock is
// normally plentiful; ~1 in 6 SKUs is genuinely low. Available = On hand − Reserved
// (reserved = committed to other orders outside this picking list).
function onHandForSku(sku: string): number {
  const h = hashStr(sku)
  return h % 6 === 0 ? (h % 30) + 8 : (h % 120) + 80 // low (8–37) vs healthy (80–199)
}
function reservedForSku(sku: string): number {
  const oh = onHandForSku(sku)
  return Math.round((oh * (hashStr(sku + 'r') % 30)) / 100) // 0–29% committed elsewhere
}

interface SkuLine { sku: string; product: string; desc: string; img: string; unit: string; qty: number; picked: number; bin: string }

function orderLines(o: OutgoingOrder): SkuLine[] {
  // SKUs + qty come from the product DB (drawn from what this warehouse stocks), so
  // each line maps to a real bin — same source picking/packing use downstream.
  // `qty` = the FULL order demand; `picked` = what's already been picked for this
  // order+SKU on earlier lists. SKUs already fully picked are dropped (nothing left).
  const lines: SkuLine[] = []
  for (const l of orderSkuLines(o)) {
    const picked = pickedQtyForOrderSku(o.id, l.sku)
    if (l.qty - picked <= 0) continue
    lines.push({
      sku: l.sku, product: l.product.name, desc: l.product.desc, img: l.product.img,
      unit: l.product.unit, qty: l.qty, picked, bin: binForSku(o.warehouseId, l.sku),
    })
  }
  // order each table by storage location so the picker route is ordered
  return lines.sort((a, b) => a.bin.localeCompare(b.bin))
}

interface PickLine extends SkuLine { key: string }
interface OrderTable { order: OutgoingOrder; lines: PickLine[] }
const orderTables = computed<OrderTable[]>(() =>
  selectedOrders.value.map(o => ({
    order: o,
    lines: orderLines(o).map(l => ({ ...l, key: `${o.id}::${l.sku}` })),
  })),
)

// ─── Supervisor edits: include/exclude ANY SKU (checkbox, default on) + edit qty ──
// A picking list can cover any subset of SKUs regardless of whether an order is a
// marketplace order — the marketplace "must be complete" rule is enforced later, at
// packing-task creation, not here.
const excludedKeys = ref(new Set<string>())
const qtyOverrides = ref<Record<string, number>>({})
const lockedKeys = computed(() => new Set<string>()) // nothing is locked
function isLocked(key: string) { return lockedKeys.value.has(key) }
function isSelected(key: string) { return isLocked(key) || !excludedKeys.value.has(key) }
function toggleLine(key: string) {
  if (isLocked(key)) return
  const s = new Set(excludedKeys.value)
  s.has(key) ? s.delete(key) : s.add(key)
  excludedKeys.value = s
}
// To pick is clamped to [0, cap] — can't pick more than the combined ordered qty,
// nor more than the available stock for that SKU.
function setQty(key: string, val: string, cap: number) {
  const n = Math.min(cap, Math.max(0, Math.floor(Number(val) || 0)))
  qtyOverrides.value = { ...qtyOverrides.value, [key]: n }
}

// ─── Picking list rows — merged by SKU across the selected orders ─────────────────
// Picking is by SKU + storage location, so the same SKU ordered on several sales
// orders is collected as ONE line (Order qty = the combined demand). Each merged row
// keeps its per-order members so the picked qty can be split back per order at save.
interface MergedRow {
  sku: string; product: string; desc: string; img: string; unit: string; bin: string
  key: string            // the SKU — unique per merged row
  orderQty: number       // combined ordered qty across orders
  pickedQty: number      // combined qty already picked on earlier lists
  members: { orderId: string; salesNo: string; qty: number }[]
}
const pickRows = computed<MergedRow[]>(() => {
  const map = new Map<string, MergedRow>()
  for (const t of orderTables.value) {
    for (const l of t.lines) {
      let g = map.get(l.sku)
      if (!g) {
        g = { sku: l.sku, product: l.product, desc: l.desc, img: l.img, unit: l.unit, bin: l.bin, key: l.sku, orderQty: 0, pickedQty: 0, members: [] }
        map.set(l.sku, g)
      }
      g.orderQty += l.qty
      g.pickedQty += l.picked
      g.members.push({ orderId: t.order.id, salesNo: t.order.salesNo, qty: l.qty })
    }
  }
  // storage-location order keeps the picker route tidy
  return [...map.values()].sort((a, b) => a.bin.localeCompare(b.bin))
})
// True once any SKU has been partially picked on a previous list → show Picked qty column.
const hasPriorPicks = computed(() => pickRows.value.some(g => g.pickedQty > 0))

// ─── Stock per merged SKU — one pool (On hand − Reserved); cap = min(demand, avail) ─
interface RowStock { onHand: number; reserved: number; available: number; cap: number; toPick: number }
const rowStock = computed<Map<string, RowStock>>(() => {
  const map = new Map<string, RowStock>()
  for (const g of pickRows.value) {
    const onHand = onHandForSku(g.sku)
    const reserved = reservedForSku(g.sku)
    const available = Math.max(0, onHand - reserved)
    // Can't pick more than what's still outstanding (order qty − already picked), nor
    // more than what's available in stock.
    const remaining = Math.max(0, g.orderQty - g.pickedQty)
    const cap = Math.min(remaining, available)
    const selected = isSelected(g.key)
    const desired = qtyOverrides.value[g.key] ?? cap
    const toPick = selected ? Math.min(Math.max(0, desired), cap) : 0
    map.set(g.key, { onHand, reserved, available, cap, toPick })
  }
  return map
})
function stockOf(key: string): RowStock {
  return rowStock.value.get(key) ?? { onHand: 0, reserved: 0, available: 0, cap: 0, toPick: 0 }
}

// Select-all across the merged rows
const allLinesSelected = computed(() => pickRows.value.length > 0 && pickRows.value.every(g => isSelected(g.key)))
const someLinesSelected = computed(() => {
  const sel = pickRows.value.filter(g => isSelected(g.key)).length
  return sel > 0 && sel < pickRows.value.length
})
const allLinesLocked = computed(() => pickRows.value.length > 0 && pickRows.value.every(g => isLocked(g.key)))
function toggleAllLines() {
  if (allLinesLocked.value) return
  const s = new Set(excludedKeys.value)
  // Locked (marketplace) rows can never be excluded.
  if (allLinesSelected.value) pickRows.value.forEach(g => { if (!isLocked(g.key)) s.add(g.key) })
  else pickRows.value.forEach(g => s.delete(g.key))
  excludedKeys.value = s
}

const selectedRows = computed(() => pickRows.value.filter(g => isSelected(g.key)))
const totalSkus   = computed(() => selectedRows.value.length)
const totalToPick = computed(() => selectedRows.value.reduce((a, g) => a + stockOf(g.key).toPick, 0))

// ─── Progressive loading — 10 rows, lazy-load past that; border only when > 10 ────
const PAGE_SIZE = 10
const shownCount = ref(PAGE_SIZE)
const loadingMore = ref(false)
const visibleRows = computed(() => pickRows.value.slice(0, shownCount.value))
const hasMoreRows = computed(() => shownCount.value < pickRows.value.length)

function loadMoreRows() {
  if (loadingMore.value || !hasMoreRows.value) return
  loadingMore.value = true
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, pickRows.value.length)
    loadingMore.value = false
  }, 400)
}

const itemsScrollEl = ref<HTMLElement | null>(null)
const itemsSentinelEl = ref<HTMLElement | null>(null)
let itemsObserver: IntersectionObserver | null = null
function setupItemsObserver() {
  itemsObserver?.disconnect()
  if (!itemsScrollEl.value || !itemsSentinelEl.value) return
  itemsObserver = new IntersectionObserver(
    (entries) => { if (entries[0]!.isIntersecting) loadMoreRows() },
    { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' },
  )
  itemsObserver.observe(itemsSentinelEl.value)
}
onMounted(() => nextTick(setupItemsObserver))
onUnmounted(() => itemsObserver?.disconnect())
watch(() => pickRows.value.length, () => {
  shownCount.value = PAGE_SIZE
  nextTick(() => {
    if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0
    setupItemsObserver()
    checkItemsOverflow()
  })
})
watch(shownCount, () => nextTick(checkItemsOverflow))

// ─── Footer divider ────────────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() {
  const el = stageEl.value
  if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1
}
// The items table gets an outer border only once its scroll area actually overflows.
const itemsOverflowing = ref(false)
function checkItemsOverflow() { const el = itemsScrollEl.value; itemsOverflowing.value = !!el && el.scrollHeight > el.clientHeight + 1 }
let stageObserver: ResizeObserver | null = null
let itemsResizeObserver: ResizeObserver | null = null
onMounted(() => {
  nextTick(() => {
    checkStageOverflow()
    checkItemsOverflow()
    stageObserver = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) {
      stageObserver.observe(stageEl.value)
      stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true })
    }
    itemsResizeObserver = new ResizeObserver(checkItemsOverflow)
    if (itemsScrollEl.value) itemsResizeObserver.observe(itemsScrollEl.value)
  })
})
onUnmounted(() => {
  stageObserver?.disconnect()
  itemsResizeObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkStageOverflow)
})
watch(selectedOrders, () => nextTick(() => { checkStageOverflow(); checkItemsOverflow() }))

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }

function goPicking() {
  router.push({ path: '/barang-keluar', query: { tab: 'Picking' } })
}

function handleCreate() {
  let valid = true
  if (!warehouseId.value) { warehouseError.value = true; valid = false }
  if (!assigneeId.value)  { assigneeError.value  = true; valid = false }
  if (!selectedOrders.value.length) valid = false
  if (!valid) return

  // Build the planned pick lines from the merged SKU rows. The picking list is shown
  // merged, but downstream packing sorts back per sales order — so each SKU's To-pick
  // qty is split across its member orders (filled order-by-order up to each demand).
  const lines: PickingLine[] = []
  for (const g of pickRows.value) {
    if (!isSelected(g.key)) continue
    let remaining = stockOf(g.key).toPick
    if (remaining <= 0) continue
    for (const m of g.members) {
      const alloc = Math.min(m.qty, remaining)
      if (alloc <= 0) continue
      remaining -= alloc
      lines.push({
        key: `${m.orderId}::${g.sku}`, orderId: m.orderId, salesNo: m.salesNo,
        sku: g.sku, product: g.product, desc: g.desc, img: g.img,
        unit: g.unit, bin: g.bin, qty: alloc,
      })
    }
  }

  addPickingTask({
    salesOrderIds: selectedOrders.value.map(o => o.id),
    salesNos:      selectedOrders.value.map(o => o.salesNo),
    warehouseId:   warehouseId.value,
    warehouseName: warehouseName.value,
    assignee:      assigneeLabel.value,
    lines,
  })

  router.push({ path: '/barang-keluar', query: { tab: 'Picking', saved: '1' } })
}
</script>

<template>
  <div class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goPicking">Picking</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">New picking list</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <!-- Warehouse + Assignee -->
      <div class="pk-section pk-grid">
        <MpFormControl id="pk-warehouse" is-required :is-invalid="warehouseError" :class="css({ gridColumn: 'span 3' })">
          <MpFormLabel>Warehouse</MpFormLabel>
          <MpAutocomplete
            id="pk-warehouse-ac"
            v-model="warehouseId"
            :data="availableWarehouses"
            label-prop="name"
            value-prop="id"
            placeholder="Select warehouse"
            is-searchable use-portal is-full-width
            :is-clearable="!isWarehouseLocked"
            :is-disabled="isWarehouseLocked"
            :is-invalid="warehouseError"
          />
          <MpFormErrorMessage>You must select a warehouse</MpFormErrorMessage>
        </MpFormControl>

        <MpFormControl id="pk-assignee" is-required :is-invalid="assigneeError" :class="css({ gridColumn: 'span 3' })">
          <MpFormLabel>Assignee</MpFormLabel>
          <MpAutocomplete
            id="pk-assignee-ac"
            v-model="assigneeId"
            :data="ASSIGNEES"
            label-prop="name"
            value-prop="id"
            placeholder="Select assignee"
            is-searchable is-clearable use-portal is-full-width
            :is-invalid="assigneeError"
          >
            <template #default="{ item }">
              <div class="pk-assignee-opt">
                <span
                  class="pk-assignee-avatar"
                  :style="{ background: `hsl(${item.hue},50%,88%)`, color: `hsl(${item.hue},55%,35%)` }"
                >{{ item.initials }}</span>
                {{ item.name }}
              </div>
            </template>
          </MpAutocomplete>
          <MpFormErrorMessage>You must select an assignee</MpFormErrorMessage>
        </MpFormControl>
      </div>

      <!-- Picking list — a single list across the selected orders (sales order no.
           is irrelevant to picking; lines are ordered by storage location) -->
      <div v-if="selectedOrders.length" class="pk-sku-section">
        <h2 class="pk-section-title">Picking list</h2>
        <p class="pk-section-desc">Items to collect for this picking list. Pick any subset of SKUs and set the quantity to pick for each line.</p>
        <div class="pk-summary">
          <div class="pk-stat">
            <span class="pk-stat-label">Orders</span>
            <span class="pk-stat-val">{{ formatNum(selectedOrders.length) }}</span>
          </div>
          <div class="pk-stat">
            <span class="pk-stat-label">SKU qty</span>
            <span class="pk-stat-val">{{ formatNum(totalSkus) }}</span>
          </div>
          <div class="pk-stat">
            <span class="pk-stat-label">To pick qty</span>
            <span class="pk-stat-val">{{ formatNum(totalToPick) }}</span>
          </div>
        </div>

        <section class="pk-items-section" :class="{ 'pk-items-section--bordered': itemsOverflowing }">
          <div ref="itemsScrollEl" class="pk-items-scroll">
            <table class="pk-items">
              <thead>
                <tr>
                  <th class="pk-th pk-th--check">
                    <span @click.stop>
                      <MpCheckbox
                        id="pk-all-lines"
                        :is-checked="allLinesSelected"
                        :is-indeterminate="someLinesSelected"
                        :is-disabled="allLinesLocked"
                        @change="toggleAllLines"
                      />
                    </span>
                  </th>
                  <th class="pk-th">Product</th>
                  <th class="pk-th">SKU</th>
                  <th class="pk-th">Storage location</th>
                  <th class="pk-th pk-th--num">Order qty</th>
                  <th v-if="hasPriorPicks" class="pk-th pk-th--num">Picked qty</th>
                  <th class="pk-th pk-th--num">Qty to pick</th>
                  <th class="pk-th">Unit</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in visibleRows"
                  :key="row.key"
                  class="pk-item-row"
                  :class="{ 'pk-item-row--off': !isSelected(row.key) }"
                >
                  <td class="pk-td">
                    <span @click.stop>
                      <MpCheckbox
                        :id="`pk-line-${row.key}`"
                        :is-checked="isSelected(row.key)"
                        :is-disabled="isLocked(row.key)"
                        @change="toggleLine(row.key)"
                      />
                    </span>
                  </td>
                  <td class="pk-td">
                    <ProductCell :name="row.product" :desc="row.desc" :image="row.img" />
                  </td>
                  <td class="pk-td"><span class="pk-sku-text">{{ row.sku }}</span></td>
                  <td class="pk-td"><span class="pk-loc-text">{{ row.bin }}</span></td>
                  <td class="pk-td pk-td--num">{{ formatNum(row.orderQty) }}</td>
                  <td v-if="hasPriorPicks" class="pk-td pk-td--num">{{ formatNum(row.pickedQty) }}</td>
                  <td class="pk-td pk-td--input">
                    <input
                      type="number" min="0" :max="stockOf(row.key).cap" class="pk-qty-input"
                      :value="stockOf(row.key).toPick"
                      :disabled="!isSelected(row.key) || isLocked(row.key)"
                      @input="setQty(row.key, ($event.target as HTMLInputElement).value, stockOf(row.key).cap)"
                      @click.stop
                    />
                  </td>
                  <td class="pk-td">{{ row.unit }}</td>
                </tr>
              </tbody>
            </table>
            <div ref="itemsSentinelEl" class="pk-items-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="pk-loading pk-items-loading">
              <MpSpinner size="sm" /> Loading SKUs…
            </div>
          </div>
          <div class="pk-items-count">
            <span>Showing {{ visibleRows.length }} of {{ pickRows.length }} SKUs</span>
          </div>
        </section>
      </div>

    </div><!-- /detail-stage -->

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpButton variant="ghost" is-rounded @click="goPicking">Cancel</MpButton>
      <MpButton variant="primary" is-rounded @click="handleCreate">Save</MpButton>
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
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

/* ── Section / form grid ─────────────────────────────────────────────────────── */
.pk-section { margin-bottom: var(--mp-spacing-6); }
.pk-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--mp-spacing-4); max-width: 558px; }
.pk-assignee-opt { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pk-assignee-avatar {
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  border-radius: var(--mp-radii-full); flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--mp-font-sizes-xs); font-weight: var(--mp-font-weights-semi-bold);
}

/* ── Section title ───────────────────────────────────────────────────────────── */
.pk-section-title {
  margin: 0;
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}
.pk-section-desc {
  margin: 0;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-md);
}
.pk-tasks-section .pk-section-title { margin-bottom: var(--mp-spacing-5); }
.pk-sku-section .pk-section-title { margin-bottom: 0; }
.pk-sku-section .pk-section-desc { margin-bottom: var(--mp-spacing-5); }

/* ── Sections ────────────────────────────────────────────────────────────────── */
.pk-tasks-section { margin-bottom: var(--mp-spacing-6); }
.pk-sku-section { margin-bottom: var(--mp-spacing-6); }
.pk-tasks-error {
  margin: 0 0 var(--mp-spacing-3) 0;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c0392b);
}

.pk-tasks-table-wrap { border-radius: var(--mp-radii-lg); overflow: hidden; }
.pk-tasks-table-wrap--bordered { border: 1px solid var(--mp-border-bold); }
.pk-tasks-table { width: 100%; table-layout: auto; border-collapse: collapse; }

/* ── Table header ─────────────────────────────────────────────────────────────── */
.pk-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pk-th--num {
  text-align: right;
  padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4);
}

/* ── Rows ────────────────────────────────────────────────────────────────────── */
.pk-td {
  height: var(--mp-sizes-10, 40px);
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: left;
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
}
.pk-task-row:last-child .pk-td, .pk-item-row:last-child .pk-td { border-bottom: none; }
.pk-task-row { cursor: pointer; transition: background 80ms; }
.pk-task-row:hover .pk-td { background: var(--mp-background-neutral-subtle); }
.pk-cell-check { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pk-td--num {
  text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums;
  padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4);
}

.pk-summary { display: flex; align-items: flex-start; gap: var(--mp-spacing-10); margin: var(--mp-spacing-4) 0 var(--mp-spacing-5); }
.pk-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: var(--mp-sizes-24, 96px); }
.pk-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pk-stat-val { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }

/* ── Picking list — per-order blocks ─────────────────────────────────────────── */
.pk-order-block { margin-bottom: var(--mp-spacing-5); }
.pk-order-head {
  display: flex; align-items: baseline; gap: var(--mp-spacing-2);
  margin-bottom: var(--mp-spacing-2);
}
.pk-order-no { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pk-order-cust { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pk-short { color: var(--mp-text-danger, #c0392b); font-weight: var(--mp-font-weights-semi-bold); }

/* ── Picking list table ──────────────────────────────────────────────────────── */
.pk-items-section { display: flex; flex-direction: column; }
.pk-items-section--bordered {
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-lg); overflow: hidden;
}
.pk-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.pk-items-sentinel { height: 1px; }
.pk-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.pk-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.pk-items-count {
  display: flex; align-items: center; margin: 0;
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
  border-top: 1px solid var(--mp-border-default);
}
.pk-items-section--bordered .pk-items-count { border-top: 1px solid var(--mp-border-default); }
.pk-items { width: 100%; table-layout: auto; border-collapse: collapse; }
.pk-items thead .pk-th { position: sticky; top: 0; z-index: 1; }
.pk-sku-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pk-loc-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pk-th--check { width: var(--mp-sizes-12, 48px); }
.pk-item-row--off { opacity: 0.45; }

/* Form-table look: column dividers + grey read-only cells, white editable cell */
.pk-items .pk-th { border-right: 1px solid var(--mp-border-default); }
.pk-items .pk-th:last-child { border-right: none; }
.pk-items .pk-td {
  border-right: 1px solid var(--mp-border-default);
  background: var(--mp-background-neutral-subtle);
}
.pk-items .pk-td:last-child { border-right: none; }
/* Editable qty cell — white, input fills edge-to-edge, focus ring */
.pk-items .pk-td--input { padding: 0; background: var(--mp-background-neutral); }
.pk-items .pk-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); }
.pk-qty-input {
  width: 100%; text-align: right;
  height: var(--mp-sizes-10, 40px); padding: 0 var(--mp-spacing-2);
  border: none; background: transparent; color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-md); font-variant-numeric: tabular-nums; outline: none;
}
.pk-qty-input:disabled { color: var(--mp-text-disabled); cursor: not-allowed; background: var(--mp-background-neutral-subtle); }

/* ── Empty state ─────────────────────────────────────────────────────────────── */
.pk-empty {
  display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-10, 40px) 0;
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg);
}
.pk-empty-title {
  margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.pk-empty-desc { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
