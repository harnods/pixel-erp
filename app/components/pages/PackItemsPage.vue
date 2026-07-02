<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  MpSpinner,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton,
  toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import { getPackingLineItems } from '~/data/packingTaskDetails'
import { getPackingTask, savePackingDraft, endPacking } from '~/data/packingTasks'
import { outgoingOrders, isMarketplaceOrder } from '~/data/outgoing'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const task = computed(() => getPackingTask(props.orderId))
const lineItems = computed(() => task.value ? getPackingLineItems(task.value) : [])

// Marketplace orders must be fulfilled in full — every picked unit has to be packed
// (no short-packing). The order = picked side is enforced upstream at picking, where a
// marketplace order can't be short-picked, so a full flow ends with packed = picked = order.
const order = computed(() => outgoingOrders.find(o => o.id === task.value?.salesOrderId))
const isMarketplace = computed(() => isMarketplaceOrder(order.value))
const allPicked = computed(() =>
  lineItems.value.length > 0 &&
  lineItems.value.every(it => (draftQty.value[it.key] ?? 0) === it.pickedQty),
)
const canEndPacking = computed(() => !isMarketplace.value || allPicked.value)

const startDateLabel = computed(() => {
  const d = task.value?.startDate
  if (!d) return '—'
  const dt = new Date(d)
  const date = dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  return `${date}, ${time}`
})

// Due date carries an end-of-day cut-off for marketplace orders (…T23:59); show the
// time only when the ISO string includes one.
const dueDateLabel = computed(() => {
  const d = order.value?.dueDate
  if (!d) return '—'
  const dt = new Date(d)
  const date = dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  if (!d.includes('T')) return date
  const time = dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  return `${date}, ${time}`
})

const draftQty = ref<Record<string, number>>({})
const search = ref('')
watch([() => props.orderId, lineItems], () => {
  const map: Record<string, number> = {}
  for (const it of lineItems.value) map[it.key] = it.packedQty
  draftQty.value = map
  search.value = ''
}, { immediate: true })

const pickedTotal = computed(() => lineItems.value.reduce((s, it) => s + it.pickedQty, 0))
const draftPackedTotal = computed(() => Object.values(draftQty.value).reduce((a, b) => a + (b || 0), 0))
const draftOutstanding = computed(() => Math.max(0, pickedTotal.value - draftPackedTotal.value))
const shortItemsCount = computed(() => lineItems.value.filter(it => (draftQty.value[it.key] ?? 0) < it.pickedQty).length)

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return lineItems.value
  return lineItems.value.filter(it => it.productName.toLowerCase().includes(q) || it.skuCode.toLowerCase().includes(q))
})
const PAGE_SIZE = 10
const shownCount = ref(PAGE_SIZE)
const loadingMore = ref(false)
const pagedItems = computed(() => filteredItems.value.slice(0, shownCount.value))
const isProgressive = computed(() => filteredItems.value.length > PAGE_SIZE)
function loadMoreItems() {
  if (loadingMore.value || shownCount.value >= filteredItems.value.length) return
  loadingMore.value = true
  setTimeout(() => { shownCount.value = Math.min(shownCount.value + PAGE_SIZE, filteredItems.value.length); loadingMore.value = false }, 400)
}
const itemsScrollEl = ref<HTMLElement | null>(null)
const itemsSentinelEl = ref<HTMLElement | null>(null)
let itemsObserver: IntersectionObserver | null = null
function setupItemsObserver() {
  itemsObserver?.disconnect()
  if (!itemsScrollEl.value || !itemsSentinelEl.value) return
  itemsObserver = new IntersectionObserver(entries => { if (entries[0].isIntersecting) loadMoreItems() }, { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' })
  itemsObserver.observe(itemsSentinelEl.value)
}
watch(search, () => { shownCount.value = PAGE_SIZE; nextTick(() => { if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0; setupItemsObserver() }) })

function packAll() {
  const map: Record<string, number> = {}
  for (const it of lineItems.value) map[it.key] = it.pickedQty
  draftQty.value = map
}
const showQtyErrors = ref(false)
function onQtyInput(key: string, max: number, e: Event) {
  let n = Math.floor(Number((e.target as HTMLInputElement).value))
  if (!Number.isFinite(n) || n < 0) n = 0
  if (n > max) n = max
  draftQty.value = { ...draftQty.value, [key]: n }
  if (showQtyErrors.value) showQtyErrors.value = false
}
function fmt(n: number) { return n.toLocaleString('id-ID') }

const showConfirm = ref(false)
function endPackingClick() {
  if (draftPackedTotal.value === 0) {
    showQtyErrors.value = true
    toast.notify({ variant: 'danger', title: 'Enter packed qty for at least 1 item' })
    return
  }
  if (!canEndPacking.value) {
    showQtyErrors.value = true
    toast.notify({ variant: 'danger', title: 'Marketplace orders must be packed in full', description: 'Pack every picked unit — packed qty must match the picked qty for every item.' })
    return
  }
  showConfirm.value = true
}
function commit() {
  showConfirm.value = false
  if (!task.value) return
  endPacking(props.orderId, { ...draftQty.value })
  toast.notify({ variant: 'success', title: 'Packing completed, ready to ship' })
  router.push(`/packing/${props.orderId}`)
}
function saveDraft() {
  savePackingDraft(props.orderId, { ...draftQty.value })
  toast.notify({ variant: 'success', title: 'Packing draft saved' })
  router.push(`/packing/${props.orderId}`)
}
function goBack() { router.push(`/packing/${props.orderId}`) }
function goPacking() { router.push('/barang-keluar?tab=Packing') }

const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkStageOverflow() { const el = stageEl.value; if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1 }
let stageObserver: ResizeObserver | null = null
onMounted(() => {
  nextTick(() => {
    checkStageOverflow()
    stageObserver = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) { stageObserver.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true }) }
    setupItemsObserver()
  })
})
onUnmounted(() => { stageObserver?.disconnect(); stageEl.value?.removeEventListener('scroll', checkStageOverflow); itemsObserver?.disconnect() })
watch([() => props.orderId, shownCount], () => nextTick(checkStageOverflow))
</script>

<template>
  <div v-if="task" class="detail-page">

    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goPacking">Packing</button>
          <span class="detail-breadcrumb-sep">/</span>
          <button class="detail-breadcrumb" @click="goBack">{{ task.taskNo }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">Match order</h1>
        </div>
      </div>
    </header>

    <div ref="stageEl" class="detail-stage">

      <div class="pak-header">
        <ContentList label="Sales order" :value="task.salesNo" />
        <ContentList label="Source" :value="order?.source || '—'" />
        <ContentList label="Due date" :value="dueDateLabel" />
        <ContentList label="Warehouse" :value="task.warehouseName" />
        <ContentList label="Assignee" :value="task.assignee" />
        <ContentList label="Start date" :value="startDateLabel" />
      </div>

      <div class="pak-summary">
        <div class="pak-stat"><span class="pak-stat-val">{{ fmt(lineItems.length) }}</span><span class="pak-stat-label">SKU qty</span></div>
        <div class="pak-stat"><span class="pak-stat-val">{{ fmt(pickedTotal) }}</span><span class="pak-stat-label">Picked</span></div>
        <div class="pak-stat"><span class="pak-stat-val">{{ fmt(draftPackedTotal) }}</span><span class="pak-stat-label">Packed</span></div>
        <div class="pak-stat"><span class="pak-stat-val">{{ fmt(draftOutstanding) }}</span><span class="pak-stat-label">Outstanding</span></div>
      </div>

      <div class="pak-sku-section">
        <div class="pak-filter-bar">
          <div class="pak-filter-bar-left">
            <span class="pak-editing-hint">
              {{ isMarketplace
                ? 'Marketplace order — pack every picked unit in full to end packing.'
                : 'Match the picked goods to this order and enter the packed qty.' }}
            </span>
            <button class="pak-link-btn" @click="packAll">Pack all</button>
          </div>
          <div class="pak-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="search" class="pak-search" type="text" placeholder="Search product or SKU…" />
          </div>
        </div>

        <section class="pak-items-section" :class="{ 'pak-items-section--bordered': isProgressive }">
          <div ref="itemsScrollEl" class="pak-items-scroll">
            <table class="pak-items">
              <thead>
                <tr>
                  <th class="pak-th">Product</th>
                  <th class="pak-th">SKU</th>
                  <th class="pak-th pak-th--num">Order qty</th>
                  <th class="pak-th pak-th--num">Picked qty</th>
                  <th class="pak-th pak-th--num">Packed qty</th>
                  <th class="pak-th pak-th--num">Outstanding</th>
                  <th class="pak-th">Unit</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in pagedItems" :key="item.key" class="pak-row">
                  <td class="pak-td"><ProductCell :name="item.productName" :desc="item.productDesc" :image="item.image" /></td>
                  <td class="pak-td">{{ item.skuCode }}</td>
                  <td class="pak-td pak-td--num">{{ fmt(item.orderQty) }}</td>
                  <td class="pak-td pak-td--num">{{ fmt(item.pickedQty) }}</td>
                  <td class="pak-td pak-td--input" :class="{ 'pak-td--input--error': showQtyErrors && !(draftQty[item.key] ?? 0) }">
                    <input
                      class="pak-qty-input"
                      type="number" min="0" :max="item.pickedQty"
                      :value="draftQty[item.key] ?? 0"
                      :aria-label="`Packed qty for ${item.productName}`"
                      @input="onQtyInput(item.key, item.pickedQty, $event)"
                    />
                  </td>
                  <td class="pak-td pak-td--num">
                    <span v-if="item.pickedQty - (draftQty[item.key] ?? 0) > 0" class="pak-outstanding">{{ fmt(item.pickedQty - (draftQty[item.key] ?? 0)) }}</span>
                    <span v-else class="pak-qty--full">—</span>
                  </td>
                  <td class="pak-td">{{ item.unit }}</td>
                </tr>
                <tr v-if="!filteredItems.length"><td class="pak-td pak-empty" colspan="7">No products match your search.</td></tr>
              </tbody>
            </table>
            <div ref="itemsSentinelEl" class="pak-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="pak-loading pak-loading--inline"><MpSpinner size="sm" /> Loading products…</div>
          </div>
          <div class="pak-items-count"><span>Showing {{ pagedItems.length }} of {{ filteredItems.length }} products</span></div>
        </section>
      </div>

    </div>

    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <button class="pak-btn pak-btn--ghost" @click="goBack">Cancel</button>
      <button class="pak-btn pak-btn--secondary" @click="saveDraft">Save draft</button>
      <button class="pak-btn pak-btn--primary" :disabled="!canEndPacking" @click="endPackingClick">End packing</button>
    </footer>
  </div>

  <div v-else class="pak-not-found">
    <p>Packing task not found.</p>
    <button class="detail-breadcrumb" @click="goPacking">Back to Packing</button>
  </div>

  <MpModal id="pak-confirm" :is-open="showConfirm" size="md" is-close-on-esc :is-keep-alive="false" @close="showConfirm = false">
    <MpModalContent>
      <MpModalHeader>
        {{ draftOutstanding > 0 ? 'End packing with unpacked items?' : 'End packing task?' }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <template v-if="draftOutstanding > 0">
          {{ fmt(draftOutstanding) }} of {{ fmt(pickedTotal) }} picked units won't be packed
          across {{ shortItemsCount }} {{ shortItemsCount === 1 ? 'item' : 'items' }}.
          The order will be ready to ship for the {{ fmt(draftPackedTotal) }} packed units.
        </template>
        <template v-else>
          All {{ fmt(pickedTotal) }} picked units will be packed and ready to ship.
        </template>
      </MpModalBody>
      <MpModalFooter>
        <div class="pak-modal-footer">
          <button class="pak-btn pak-btn--ghost" @click="showConfirm = false">Cancel</button>
          <button class="pak-btn pak-btn--primary" @click="commit">End packing</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-breadcrumb-sep { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }
.detail-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid transparent; }
.detail-footer--floating { border-top-color: var(--mp-border-default); }

.pak-header { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-5) var(--mp-spacing-10); padding-bottom: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.pak-header :deep(.content-list) { padding-top: 0; }
.pak-summary { display: flex; align-items: center; gap: var(--mp-spacing-10); align-self: flex-start; }
.pak-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: var(--mp-sizes-24, 96px); }
.pak-stat-val { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.pak-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.pak-sku-section { display: flex; flex-direction: column; }
.pak-filter-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5); }
.pak-filter-bar-left { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.pak-editing-hint { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pak-link-btn { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium); color: var(--mp-text-link); }
.pak-link-btn:hover { text-decoration: underline; text-underline-offset: 2px; }
.pak-search-wrap { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-1\.5) var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full); background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 240px; }
.pak-search-wrap:focus-within { border-color: var(--mp-border-bold); box-shadow: 0 0 0 1px var(--mp-border-bold); }
.pak-search { flex: 1; border: none; background: transparent; outline: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pak-search::placeholder { color: var(--mp-text-placeholder); }

.pak-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.pak-items-section--bordered { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg); overflow: hidden; }
.pak-items-section--bordered .pak-items-count { border-top: 1px solid var(--mp-border-default); }
.pak-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.pak-items thead .pak-th { position: sticky; top: 0; z-index: 1; }
.pak-items { width: 100%; border-collapse: collapse; table-layout: auto; }
.pak-th { height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral, #fff); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); white-space: nowrap; }
.pak-th:last-child { border-right: none; }
.pak-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.pak-td { padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); background: var(--mp-background-neutral-hovered); border-bottom: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); vertical-align: top; }
.pak-td:last-child { border-right: none; }
.pak-items-section--bordered .pak-row:last-child .pak-td { border-bottom: none; }
.pak-td--num { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); white-space: nowrap; }
.pak-td--input { padding: 0; background: var(--mp-background-neutral, #fff); }
.pak-td--input:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.pak-td--input--error { background: var(--mp-background-danger-subtle, #fef2f2); }
.pak-td--input--error:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-danger, #dc2626); }
.pak-qty-input { display: block; width: 100%; box-sizing: border-box; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: right; font-variant-numeric: tabular-nums; line-height: var(--mp-line-heights-md); }
.pak-qty--full { color: var(--mp-text-success-default, #15803d); font-weight: var(--mp-font-weights-medium); }
.pak-outstanding { color: var(--mp-text-default); font-weight: var(--mp-font-weights-medium); }
.pak-sentinel { height: 1px; }
.pak-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.pak-loading--inline { justify-content: center; padding: var(--mp-spacing-3); }
.pak-items-count { display: flex; align-items: center; margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pak-empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-8) 0; }

.pak-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; border: 1px solid transparent; white-space: nowrap; transition: background 0.15s; }
.pak-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.pak-btn--primary:disabled:hover { background: var(--mp-background-brand-bold, #029861); }
.pak-btn--ghost { background: transparent; border-color: transparent; color: var(--mp-text-secondary); }
.pak-btn--ghost:hover { background: var(--mp-background-neutral-hovered); }
.pak-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-default); }
.pak-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.pak-btn--primary { background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff); }
.pak-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }
.pak-modal-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

.pak-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); flex: 1; height: 100%; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
