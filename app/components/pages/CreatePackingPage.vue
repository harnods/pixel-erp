<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  MpButton, MpCheckbox, MpAutocomplete, MpSpinner, MpTooltip, MpIcon,
  MpFormControl, MpFormLabel, MpFormErrorMessage, css,
} from '@mekari/pixel3'
import ProductCell from '~/components/patterns/ProductCell.vue'
import SourceLabel from '~/components/patterns/SourceLabel.vue'
import { getPickingTask, pickedQtyForOrderSku, getPickingForOrder, orderPickedQtyInTask, type PickingTask } from '~/data/pickingTasks'
import { addPackingTask, addPackingTaskFromOrder, getPackingForOrder, remainingSkusForOrder } from '~/data/packingTasks'
import { outgoingOrders, isMarketplaceOrder } from '~/data/outgoing'
import { orderSkuLines } from '~/data/inventory'
import { getWarehouseOperators } from '~/data/warehouseTeam'
import { scrollToFirstError } from '~/utils/form'

const router = useRouter()
const route  = useRoute()

// ─── Source picking task(s) ─────────────────────────────────────────────────────
// Opened from one picking list (?pickingId) or a bulk selection (?pickingIds=a,b,c).
// All selected lists are the same warehouse (validated on the Picking index).
const pickingIds = computed<string[]>(() => {
  const multi = (route.query.pickingIds as string | undefined)?.split(',').map(s => s.trim()).filter(Boolean)
  if (multi?.length) return multi
  const single = route.query.pickingId as string | undefined
  return single ? [single] : []
})
const picks = computed<PickingTask[]>(() => pickingIds.value.map(id => getPickingTask(id)).filter(Boolean) as PickingTask[])
// Primary list — drives the warehouse + form context; order packing aggregates all lists.
const pick = computed(() => picks.value[0])

// ─── Direct-from-order mode (?orderId) ───────────────────────────────────────────
// Picking is disabled for the order's warehouse — non-marketplace orders land here
// (marketplace orders use the lightweight modal on the Outgoing index instead,
// since they're all-or-nothing and have nothing to review).
const directOrderId = computed(() => route.query.orderId as string | undefined)
const directOrder = computed(() => directOrderId.value ? outgoingOrders.find(o => o.id === directOrderId.value) : undefined)
const isDirectMode = computed(() => !pickingIds.value.length && !!directOrder.value)

const hasSource = computed(() => !!pick.value || !!directOrder.value)
const warehouseName = computed(() => pick.value?.warehouseName ?? directOrder.value?.warehouseName ?? '')
// Display-only warehouse autocomplete (locked to the source's warehouse)
const warehouseAc = computed(() => {
  if (pick.value) return [{ id: pick.value.warehouseId, name: pick.value.warehouseName }]
  if (directOrder.value) return [{ id: directOrder.value.warehouseId, name: directOrder.value.warehouseName }]
  return []
})
const warehouseId = ref(pick.value?.warehouseId ?? directOrder.value?.warehouseId ?? '')

// ─── Assignee ───────────────────────────────────────────────────────────────────
const assigneeId    = ref('')
const assigneeError = ref(false)
const isSaving      = ref(false)
watch(assigneeId, (v) => { if (v) assigneeError.value = false })
// Assignee can only be an operator of the (locked) source warehouse.
const ASSIGNEES = computed(() => getWarehouseOperators(warehouseId.value))
const assigneeLabel = computed(() => ASSIGNEES.value.find(a => a.id === assigneeId.value)?.name ?? '')

// ─── Picked items per sales order (what's available to pack) ─────────────────────
interface PackLine { key: string; sku: string; product: string; desc: string; img: string; unit: string; order: number; picked: number }
interface OrderTable { orderId: string; salesNo: string; customer: string; source: string; isMarketplace: boolean; fullyPicked: boolean; alreadyPacked: boolean; packable: boolean; lines: PackLine[] }

const orderTables = computed<OrderTable[]>(() => {
  // Direct mode: no picking task at all — only the SKUs not yet covered by an earlier
  // direct-mode packing task on this order are available to pack (picking was skipped
  // for this warehouse, and a partial packing leaves the rest for a follow-up).
  if (isDirectMode.value) {
    const o = directOrder.value
    if (!o) return []
    // `order` = the SKU's full order demand; `picked` here doubles as "available to
    // pack now" (order qty minus whatever an earlier direct-mode task already packed)
    // — the cap the Pack qty input can't exceed.
    const lines: PackLine[] = remainingSkusForOrder(o).map((l) => ({
      key: `${o.id}::${l.sku}`,
      sku: l.sku, product: l.product.name, desc: l.product.desc, img: l.product.img,
      unit: l.product.unit, order: l.qty, picked: l.qty - l.packed,
    }))
    return [{
      orderId: o.id, salesNo: o.salesNo, customer: o.customer ?? '', source: o.source,
      isMarketplace: false, fullyPicked: true, alreadyPacked: false, packable: lines.length > 0,
      lines,
    }]
  }
  if (!picks.value.length) return []
  // Union of every selected list's orders, deduped — an order split across lists (or
  // repeated because two selected lists include it) becomes ONE packing task.
  const orderNo = new Map<string, string>()
  for (const p of picks.value) {
    p.salesOrderIds.forEach((orderId, oi) => {
      if (!orderNo.has(orderId)) orderNo.set(orderId, p.salesNos[oi] ?? orderId)
    })
  }
  return [...orderNo.entries()].map(([orderId, salesNoFallback]) => {
    const o = outgoingOrders.find(x => x.id === orderId)
    // Pack the order's TOTAL picked across every picking list (an order split over 2
    // lists still packs as one), so completeness is judged at the order level.
    const lines: PackLine[] = o
      ? orderSkuLines(o).map((l) => ({
          key: `${orderId}::${l.sku}`,
          sku: l.sku, product: l.product.name, desc: l.product.desc, img: l.product.img,
          unit: l.product.unit, order: l.qty,
          picked: Math.min(l.qty, pickedQtyForOrderSku(orderId, l.sku)),
        }))
      : []
    const isMarketplace = isMarketplaceOrder(o)
    const fullyPicked = lines.length > 0 && lines.every(l => l.picked >= l.order)
    const pickedAny = lines.some(l => l.picked > 0)
    const alreadyPacked = getPackingForOrder(orderId).length > 0
    // Marketplace ⇒ packable only when fully picked (across lists); others ⇒ any picked
    // unit. Never twice — an order that already has a packing task is excluded.
    const packable = !alreadyPacked && pickedAny && (isMarketplace ? fullyPicked : true)
    return {
      orderId,
      salesNo: o?.salesNo ?? salesNoFallback,
      customer: o?.customer ?? '',
      source: o?.source ?? '',
      isMarketplace, fullyPicked, alreadyPacked, packable,
      lines,
    }
  })
})
const packableTables = computed(() => orderTables.value.filter(t => t.packable))
// Marketplace orders held back (not fully picked across lists), and orders already packed.
const blockedTables = computed(() => orderTables.value.filter(t => !t.packable && !t.alreadyPacked && t.isMarketplace && t.lines.some(l => l.picked > 0)))
const packedTables = computed(() => orderTables.value.filter(t => t.alreadyPacked))
// Every picking list that contributed to the packable orders (an order split across
// several lists shows them all, not just the one this form was opened from).
const sourcePickingNos = computed(() => {
  const seen = new Map<string, string>()
  for (const p of picks.value) seen.set(p.id, p.taskNo)
  for (const t of packableTables.value) {
    for (const pt of getPickingForOrder(t.orderId)) {
      if (pt.status !== 'canceled' && orderPickedQtyInTask(pt, t.orderId) > 0) seen.set(pt.id, pt.taskNo)
    }
  }
  return [...seen.values()]
})

// ─── Which sales orders to pack (order-level selection) ──────────────────────────
// Items are NOT individually selectable — everything picked must be packed. Only WHICH
// sales orders to pack is a choice, and only when there's more than one; a single
// packable order is always included (no checkbox).
const excludedOrderIds = ref(new Set<string>())
const showOrderSelect = computed(() => packableTables.value.length > 1)
function isOrderSelected(orderId: string) {
  return !showOrderSelect.value || !excludedOrderIds.value.has(orderId)
}
function toggleOrder(orderId: string) {
  const s = new Set(excludedOrderIds.value)
  s.has(orderId) ? s.delete(orderId) : s.add(orderId)
  excludedOrderIds.value = s
}

// ─── Direct mode: per-SKU exclusion + qty ────────────────────────────────────────
// Non-marketplace, skip-picking orders can exclude individual SKUs AND set how much
// of each to pack — same as Create picking list. Excluded SKUs, or the un-packed
// remainder of a partially-packed one, stay eligible for a follow-up packing task.
const excludedSkuKeys = ref(new Set<string>())
function isLineSelected(key: string) { return !excludedSkuKeys.value.has(key) }
function toggleLineSelection(key: string) {
  const s = new Set(excludedSkuKeys.value)
  s.has(key) ? s.delete(key) : s.add(key)
  excludedSkuKeys.value = s
}
const directLines = computed(() => orderTables.value[0]?.lines ?? [])

const packQtyOverrides = ref<Record<string, number>>({})
/** row.picked is the cap here (order qty minus what's already covered elsewhere). */
function packQtyFor(row: PackLine): number { return packQtyOverrides.value[row.key] ?? row.picked }
function setPackQty(key: string, val: string, cap: number) {
  const n = Math.min(cap, Math.max(0, Math.floor(Number(val) || 0)))
  packQtyOverrides.value = { ...packQtyOverrides.value, [key]: n }
}

const selectedDirectLines = computed(() =>
  directLines.value
    .filter(l => isLineSelected(l.key))
    .map(l => ({ ...l, picked: packQtyFor(l) }))
    .filter(l => l.picked > 0),
)
const allDirectLinesSelected = computed(() => directLines.value.length > 0 && directLines.value.every(l => isLineSelected(l.key)))
function toggleAllDirectLines() {
  excludedSkuKeys.value = allDirectLinesSelected.value ? new Set(directLines.value.map(l => l.key)) : new Set()
}

const orderError = ref(false)
const selectedTotals = computed(() => {
  let skus = 0, qty = 0, orders = 0
  for (const t of packableTables.value) {
    if (!isOrderSelected(t.orderId)) continue
    orders++
    skus += t.lines.length
    qty += t.lines.reduce((a, l) => a + l.picked, 0)
  }
  return { skus, qty, orders }
})

// ─── Footer divider ────────────────────────────────────────────────────────────
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() {
  const el = stageEl.value
  if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1
}
// Each per-order table gets an outer border only when its OWN scroll area actually
// overflows (rows exceed its max height) — measured, not by row count.
const overflowingOrders = ref(new Set<string>())
const scrollEls = new Map<string, HTMLElement>()
function setScrollRef(orderId: string, el: unknown) {
  const node = el as HTMLElement | null
  if (node) scrollEls.set(orderId, node)
  else scrollEls.delete(orderId)
}
function measureTableOverflow() {
  const next = new Set<string>()
  for (const [orderId, el] of scrollEls) {
    if (el.scrollHeight > el.clientHeight + 1) next.add(orderId)
  }
  overflowingOrders.value = next
}
function recheckLayout() { checkStageOverflow(); measureTableOverflow() }
let stageObserver: ResizeObserver | null = null
onMounted(() => {
  nextTick(() => {
    recheckLayout()
    stageObserver = new ResizeObserver(recheckLayout)
    if (stageEl.value) {
      stageObserver.observe(stageEl.value)
      stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true })
    }
  })
})
onUnmounted(() => {
  stageObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkStageOverflow)
  tableObservers.forEach(o => o.disconnect())
})
watch(orderTables, () => nextTick(recheckLayout))

// ─── Per-table progressive loading (10 rows, lazy-load the rest on scroll) ──────
const PAGE_SIZE = 10
const shownCounts = ref<Record<string, number>>({})
const loadingOrders = ref<Set<string>>(new Set())
function shownFor(orderId: string) { return shownCounts.value[orderId] ?? PAGE_SIZE }
function visibleLines(t: OrderTable) { return t.lines.slice(0, shownFor(t.orderId)) }
function isLoadingMore(orderId: string) { return loadingOrders.value.has(orderId) }
function loadMore(orderId: string, total: number) {
  if (loadingOrders.value.has(orderId) || shownFor(orderId) >= total) return
  loadingOrders.value = new Set(loadingOrders.value).add(orderId)
  setTimeout(() => {
    shownCounts.value = { ...shownCounts.value, [orderId]: Math.min(shownFor(orderId) + PAGE_SIZE, total) }
    const s = new Set(loadingOrders.value); s.delete(orderId); loadingOrders.value = s
    nextTick(recheckLayout)
  }, 400)
}
const tableObservers = new Map<string, IntersectionObserver>()
function setSentinelRef(orderId: string, el: unknown) {
  const prev = tableObservers.get(orderId)
  if (prev) { prev.disconnect(); tableObservers.delete(orderId) }
  const node = el as HTMLElement | null
  const root = scrollEls.get(orderId)
  if (!node || !root) return
  const obs = new IntersectionObserver(
    (entries) => {
      if (!entries[0]!.isIntersecting) return
      const t = orderTables.value.find(x => x.orderId === orderId)
      if (t) loadMore(orderId, t.lines.length)
    },
    { root, rootMargin: '0px 0px 120px 0px' },
  )
  obs.observe(node)
  tableObservers.set(orderId, obs)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }
function goPacking() {
  router.push({ path: '/outbound-delivery', query: { tab: 'Packing' } })
}

async function handleCreate() {
  if (!hasSource.value) return
  let valid = true
  if (!assigneeId.value) { assigneeError.value = true; valid = false }
  if (isDirectMode.value) {
    if (selectedDirectLines.value.length === 0) { orderError.value = true; valid = false }
  } else if (selectedTotals.value.orders === 0) { orderError.value = true; valid = false }
  if (!valid) { scrollToFirstError(); return }
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))

  if (isDirectMode.value) {
    // No picking task at all — pack only the SKUs the operator kept checked; any
    // excluded ones stay available for a follow-up packing task on this order.
    const o = directOrder.value!
    addPackingTaskFromOrder({
      salesOrderId: o.id,
      salesNo: o.salesNo,
      warehouseId: o.warehouseId,
      warehouseName: o.warehouseName,
      assignee: assigneeLabel.value,
      lines: selectedDirectLines.value.map(l => ({ sku: l.sku, qty: l.picked })),
    })
    router.push({ path: '/outbound-delivery', query: { tab: 'Packing', saved: '1' } })
    return
  }

  const p = pick.value!
  // One packing task per selected PACKABLE sales order — packs everything picked for it
  // across ALL its picking lists, and records every contributing picking list.
  for (const t of packableTables.value) {
    if (!isOrderSelected(t.orderId) || !t.lines.length) continue
    const lists = getPickingForOrder(t.orderId)
      .filter(pt => pt.status !== 'canceled' && orderPickedQtyInTask(pt, t.orderId) > 0)
    addPackingTask({
      salesOrderId:  t.orderId,
      salesNo:       t.salesNo,
      pickingTaskId: p.id,
      pickingTaskNo: p.taskNo,
      pickingTaskIds: lists.map(x => x.id),
      pickingTaskNos: lists.map(x => x.taskNo),
      warehouseId:   p.warehouseId,
      warehouseName: p.warehouseName,
      assignee:      assigneeLabel.value,
      skuQty:        t.lines.length,
      toPackQty:     t.lines.reduce((a, l) => a + l.picked, 0),
    })
  }

  router.push({ path: '/outbound-delivery', query: { tab: 'Packing', saved: '1' } })
}
</script>

<template>
  <div class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goPacking">Packing</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">New packing</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <!-- Not found -->
      <div v-if="!hasSource" class="pk-empty">
        <p class="pk-empty-title">Picking task not found</p>
        <p class="pk-empty-desc">This packing task must be created from a completed picking task.</p>
      </div>

      <template v-else>
        <!-- Warehouse + Assignee -->
        <div class="pk-section pk-grid">
          <MpFormControl id="pc-warehouse" :class="css({ gridColumn: 'span 3' })">
            <MpFormLabel>Warehouse</MpFormLabel>
            <MpAutocomplete
              id="pc-warehouse-ac"
              v-model="warehouseId"
              :data="warehouseAc"
              label-prop="name"
              value-prop="id"
              placeholder="Warehouse"
              use-portal is-full-width is-disabled
            />
          </MpFormControl>

          <MpFormControl id="pc-assignee" is-required :is-invalid="assigneeError" :class="css({ gridColumn: 'span 3' })">
            <MpFormLabel>Assignee</MpFormLabel>
            <MpAutocomplete
              id="pc-assignee-ac"
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

        <!-- Items to pack, per sales order -->
        <div class="pk-sku-section">
          <h2 class="pk-section-title">Items to pack</h2>
          <div class="pk-section-meta">
            <div v-if="!isDirectMode" class="pk-picking-ref">
              <span class="pk-picking-ref-label">{{ sourcePickingNos.length > 1 ? 'Picking lists' : 'Picking list' }}</span>
              <span class="pk-picking-ref-val">{{ sourcePickingNos.join(', ') }}</span>
            </div>
            <div v-if="selectedTotals.orders" class="pk-picking-ref">
              <span class="pk-picking-ref-label">Packing tasks</span>
              <span class="pk-picking-ref-val">{{ formatNum(selectedTotals.orders) }}</span>
            </div>
          </div>
          <p v-if="blockedTables.length" class="pk-tasks-note">
            Note: {{ blockedTables.map(t => t.salesNo).join(', ') }} ({{ blockedTables.length > 1 ? 'marketplace orders' : 'marketplace order' }}) not fully picked yet across its picking lists, so {{ blockedTables.length > 1 ? 'they’re' : 'it’s' }} not included here — finish picking {{ blockedTables.length > 1 ? 'them' : 'it' }} to pack. You can still save this packing for the order{{ packableTables.length > 1 ? 's' : '' }} below.
          </p>
          <p v-if="packedTables.length" class="pk-tasks-note">
            Note: {{ packedTables.map(t => t.salesNo).join(', ') }} already {{ packedTables.length > 1 ? 'have' : 'has a' }} packing task, so {{ packedTables.length > 1 ? 'they’re' : 'it’s' }} not shown here.
          </p>
          <p v-if="orderError" class="pk-tasks-error">Select at least one SKU to pack.</p>

          <div v-for="t in packableTables" :key="t.orderId" class="pk-order-block">
            <div class="pk-order-head">
              <span v-if="showOrderSelect" @click.stop>
                <MpCheckbox
                  :id="`pc-ord-${t.orderId}`"
                  :is-checked="isOrderSelected(t.orderId)"
                  @change="toggleOrder(t.orderId)"
                />
              </span>
              <span class="pk-order-no">{{ t.salesNo }}</span>
              <span v-if="t.customer" class="pk-order-cust">{{ t.customer }}</span>
              <span v-if="t.source" class="pk-order-source">
                <SourceLabel :source="t.source" />
                <MpTooltip
                  v-if="t.isMarketplace"
                  :id="`pc-mkt-${t.orderId}`"
                  label="Marketplace orders must be packed in full. Items can't be removed."
                  placement="top"
                  use-portal
                >
                  <span class="pk-source-info"><MpIcon name="info" size="sm" /></span>
                </MpTooltip>
              </span>
            </div>
            <section class="pk-items-section" :class="{ 'pk-items-section--bordered': overflowingOrders.has(t.orderId) }">
              <div :ref="el => setScrollRef(t.orderId, el)" class="pk-items-scroll">
                <table class="pk-items">
                  <colgroup>
                    <col v-if="isDirectMode" style="width: 6%" />
                    <col :style="{ width: isDirectMode ? '30%' : '42%' }" />
                    <col style="width: 18%" />
                    <col :style="{ width: isDirectMode ? '14%' : '14%' }" />
                    <col v-if="!isDirectMode" style="width: 14%" />
                    <col v-if="isDirectMode" style="width: 14%" />
                    <col style="width: 8%" />
                  </colgroup>
                  <thead>
                    <tr>
                      <th v-if="isDirectMode" class="pk-th pk-th--check" @click.stop>
                        <MpCheckbox
                          :id="`pc-all-${t.orderId}`"
                          :is-checked="allDirectLinesSelected"
                          @change="toggleAllDirectLines"
                        />
                      </th>
                      <th class="pk-th">Product</th>
                      <th class="pk-th">SKU</th>
                      <th class="pk-th pk-th--num">Order qty</th>
                      <th v-if="!isDirectMode" class="pk-th pk-th--num">Picked qty</th>
                      <th v-if="isDirectMode" class="pk-th pk-th--num">Pack qty</th>
                      <th class="pk-th">Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="row in visibleLines(t)"
                      :key="row.key"
                      class="pk-item-row"
                      :class="{ 'pk-item-row--off': isDirectMode ? !isLineSelected(row.key) : !isOrderSelected(t.orderId) }"
                    >
                      <td v-if="isDirectMode" class="pk-td" @click.stop>
                        <MpCheckbox
                          :id="`pc-line-${row.key}`"
                          :is-checked="isLineSelected(row.key)"
                          @change="toggleLineSelection(row.key)"
                        />
                      </td>
                      <td class="pk-td">
                        <ProductCell :name="row.product" :desc="row.desc" :image="row.img" />
                      </td>
                      <td class="pk-td"><span class="pk-sku-text">{{ row.sku }}</span></td>
                      <td class="pk-td pk-td--num">{{ formatNum(row.order) }}</td>
                      <td v-if="!isDirectMode" class="pk-td pk-td--num">{{ formatNum(row.picked) }}</td>
                      <td v-if="isDirectMode" class="pk-td pk-td--input">
                        <input
                          type="number" min="0" :max="row.picked" class="pk-qty-input"
                          :value="packQtyFor(row)"
                          :disabled="!isLineSelected(row.key)"
                          :aria-label="`Pack qty for ${row.product}`"
                          @input="setPackQty(row.key, ($event.target as HTMLInputElement).value, row.picked)"
                          @click.stop
                        />
                      </td>
                      <td class="pk-td">{{ row.unit }}</td>
                    </tr>
                  </tbody>
                </table>
                <div :ref="el => setSentinelRef(t.orderId, el)" class="pk-items-sentinel" aria-hidden="true" />
                <div v-if="isLoadingMore(t.orderId)" class="pk-loading pk-items-loading">
                  <MpSpinner size="sm" /> Loading products…
                </div>
              </div>
              <div class="pk-items-count">
                <span>Showing {{ visibleLines(t).length }} of {{ t.lines.length }} products</span>
              </div>
            </section>
          </div>
        </div>
      </template>

    </div><!-- /detail-stage -->

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpButton variant="ghost" is-rounded @click="goPacking">Cancel</MpButton>
      <MpButton variant="primary" is-rounded :is-disabled="isSaving" @click="handleCreate">{{ isSaving ? 'Saving…' : 'Save' }}</MpButton>
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

/* ── Source + form grid ──────────────────────────────────────────────────────── */
.pk-source { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pk-source strong { color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }
.pk-section-meta { display: flex; align-items: flex-start; gap: var(--mp-spacing-10); margin: var(--mp-spacing-2) 0 var(--mp-spacing-5); }
.pk-picking-ref { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.pk-picking-ref-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }
.pk-picking-ref-val { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); }
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
.pk-section-desc { margin: 0 0 var(--mp-spacing-5); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md); }
.pk-sku-section { margin-bottom: var(--mp-spacing-6); }
.pk-tasks-error { margin: 0 0 var(--mp-spacing-3) 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c0392b); }
.pk-tasks-note { margin: 0 0 var(--mp-spacing-3) 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md); }

/* ── Per-order blocks ────────────────────────────────────────────────────────── */
.pk-order-block { margin-bottom: var(--mp-spacing-5); }
.pk-order-head { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-2); }
.pk-order-no { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pk-order-cust { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pk-order-source { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pk-source-info { display: inline-flex; align-items: center; color: var(--mp-icon-default, var(--mp-text-secondary)); cursor: default; }

/* ── Items table (form-table look) ───────────────────────────────────────────── */
.pk-items-section { display: flex; flex-direction: column; }
.pk-items-section--bordered { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg); overflow: hidden; }
.pk-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.pk-items-sentinel { height: 1px; }
.pk-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.pk-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.pk-items-count { display: flex; align-items: center; margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pk-items { width: 100%; table-layout: fixed; border-collapse: collapse; }
.pk-cell-check { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.pk-items thead .pk-th { position: sticky; top: 0; z-index: 1; }
.pk-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pk-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.pk-th--check { width: var(--mp-sizes-12, 48px); }
.pk-td {
  height: var(--mp-sizes-10, 40px);
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: left;
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
}
.pk-item-row--off { opacity: 0.45; }
.pk-td--num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
.pk-sku-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* Editable Pack qty cell — white, input fills edge-to-edge, focus ring */
.pk-td--input { padding: 0; background: var(--mp-background-neutral); }
.pk-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); }
.pk-qty-input {
  display: block; width: 100%; height: 100%; box-sizing: border-box; text-align: right;
  padding: 0 var(--mp-spacing-2);
  border: none; background: transparent; color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-md); font-variant-numeric: tabular-nums; outline: none;
}
.pk-qty-input:disabled { color: var(--mp-text-disabled); cursor: not-allowed; background: var(--mp-background-neutral-subtle); }

.pk-summary { display: flex; align-items: center; gap: var(--mp-spacing-10); align-self: flex-start; margin-top: var(--mp-spacing-4); }
.pk-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: var(--mp-sizes-24, 96px); }
.pk-stat-val { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.pk-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Empty state ─────────────────────────────────────────────────────────────── */
.pk-empty {
  display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-10, 40px) 0;
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg);
}
.pk-empty-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pk-empty-desc { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
</style>
