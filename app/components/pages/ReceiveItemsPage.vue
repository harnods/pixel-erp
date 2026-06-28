<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import {
  MpButton, MpSpinner,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter,
  MpModalOverlay, MpModalCloseButton,
  toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import { findTaskWithPO, getTaskLineItems } from '~/data/receivingTaskDetails'
import { saveReceivingDraft, endReceiving as endReceivingTask } from '~/data/receivingTasks'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const entry     = computed(() => findTaskWithPO(props.orderId))
const task      = computed(() => entry.value?.task)
const po        = computed(() => entry.value?.po)
const lineItems = computed(() => task.value ? getTaskLineItems(task.value) : [])

const startDateLabel = computed(() => {
  const d = task.value?.startDate
  if (!d) return '—'
  const dt = new Date(d)
  const date = dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  return `${date}, ${time}`
})

// ── Draft quantities ─────────────────────────────────────────────────────────
const draftQty = ref<Record<string, number>>({})
const search   = ref('')

watch([() => props.orderId, lineItems], () => {
  const map: Record<string, number> = {}
  for (const it of lineItems.value) map[it.skuCode] = it.receivedQty
  draftQty.value = map
  search.value = ''
}, { immediate: true })

const purchaseTotal      = computed(() => task.value?.purchaseQty ?? 0)
const draftReceivedTotal = computed(() =>
  Object.values(draftQty.value).reduce((a, b) => a + (b || 0), 0),
)
const draftOutstanding = computed(() =>
  Math.max(0, purchaseTotal.value - draftReceivedTotal.value),
)
const shortItemsCount = computed(
  () => lineItems.value.filter(it => (draftQty.value[it.skuCode] ?? 0) < it.expectedQty).length,
)

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return lineItems.value
  return lineItems.value.filter(
    it => it.productName.toLowerCase().includes(q) || it.skuCode.toLowerCase().includes(q),
  )
})

// ── Progressive pagination ────────────────────────────────────────────────────
const PAGE_SIZE    = 10
const shownCount   = ref(PAGE_SIZE)
const loadingMore  = ref(false)
const pagedItems   = computed(() => filteredItems.value.slice(0, shownCount.value))
const hasMoreItems = computed(() => shownCount.value < filteredItems.value.length)
const isProgressive = computed(() => filteredItems.value.length > PAGE_SIZE)

function loadMoreItems() {
  if (loadingMore.value || !hasMoreItems.value) return
  loadingMore.value = true
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, filteredItems.value.length)
    loadingMore.value = false
  }, 500)
}

const itemsScrollEl   = ref<HTMLElement | null>(null)
const itemsSentinelEl = ref<HTMLElement | null>(null)
let itemsObserver: IntersectionObserver | null = null

function setupItemsObserver() {
  itemsObserver?.disconnect()
  if (!itemsScrollEl.value || !itemsSentinelEl.value) return
  itemsObserver = new IntersectionObserver(
    entries => { if (entries[0].isIntersecting) loadMoreItems() },
    { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' },
  )
  itemsObserver.observe(itemsSentinelEl.value)
}

watch(search, () => {
  shownCount.value = PAGE_SIZE
  loadingMore.value = false
  nextTick(() => {
    if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0
    setupItemsObserver()
  })
})

function receiveAll() {
  const map: Record<string, number> = {}
  for (const it of lineItems.value) map[it.skuCode] = it.expectedQty
  draftQty.value = map
}

const showQtyErrors = ref(false)

function onQtyInput(skuCode: string, expected: number, e: Event) {
  let n = Math.floor(Number((e.target as HTMLInputElement).value))
  if (!Number.isFinite(n) || n < 0) n = 0
  if (n > expected) n = expected
  draftQty.value = { ...draftQty.value, [skuCode]: n }
  if (showQtyErrors.value) showQtyErrors.value = false
}

function fmt(n: number) { return n.toLocaleString('id-ID') }

// ── Post confirmation modal ───────────────────────────────────────────────────
const showConfirm = ref(false)

function endReceiving() {
  if (draftReceivedTotal.value === 0) {
    showQtyErrors.value = true
    toast.notify({ variant: 'danger', title: 'Masukkan received qty minimal 1 item' })
    return
  }
  showConfirm.value = true
}

function commitReceiving(createPutAway = false) {
  showConfirm.value = false
  const received = { ...draftQty.value }
  const complete = draftReceivedTotal.value >= purchaseTotal.value
  endReceivingTask(props.orderId, received)
  if (createPutAway) {
    router.push({
      path: '/barang-masuk/put-away/create',
      query: { warehouseId: po.value?.warehouseId, taskId: props.orderId },
    })
  } else {
    toast.notify({
      variant: complete ? 'success' : 'warning',
      title: complete ? 'Penerimaan selesai, menunggu put-away' : 'Penerimaan disimpan, ada item kurang',
    })
    router.push(`/receiving/${props.orderId}`)
  }
}

function saveDraft() {
  saveReceivingDraft(props.orderId, { ...draftQty.value })
  toast.notify({ variant: 'success', title: 'Draf penerimaan tersimpan' })
  router.push(`/receiving/${props.orderId}`)
}

function goBack()      { router.push(`/receiving/${props.orderId}`) }
function goReceiving() { router.push('/barang-masuk?tab=Receiving') }

// ── Footer divider ────────────────────────────────────────────────────────────
const stageEl          = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)

function checkStageOverflow() {
  const el = stageEl.value
  if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1
}

let stageObserver: ResizeObserver | null = null

onMounted(() => {
  nextTick(() => {
    checkStageOverflow()
    stageObserver = new ResizeObserver(checkStageOverflow)
    if (stageEl.value) {
      stageObserver.observe(stageEl.value)
      stageEl.value.addEventListener('scroll', checkStageOverflow, { passive: true })
    }
    setupItemsObserver()
  })
})
onUnmounted(() => {
  stageObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkStageOverflow)
  itemsObserver?.disconnect()
})
watch([() => props.orderId, shownCount], () => nextTick(checkStageOverflow))
</script>

<template>
  <div v-if="task && po" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goReceiving">Receiving</button>
          <span class="detail-breadcrumb-sep">/</span>
          <button class="detail-breadcrumb" @click="goBack">{{ task.taskNo }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">Receive items</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <!-- PO header -->
      <div class="ri-header">
        <ContentList label="Purchase order" :value="po.purchaseNo" />
        <ContentList label="Warehouse" :value="po.warehouseName" />
        <ContentList label="Assignee" :value="task.assignee" />
        <ContentList label="Start date" :value="startDateLabel" />
      </div>

      <!-- Live summary -->
      <div class="ri-summary">
        <div class="ri-stat">
          <span class="ri-stat-val">{{ fmt(lineItems.length) }}</span>
          <span class="ri-stat-label">SKU qty</span>
        </div>
        <div class="ri-stat">
          <span class="ri-stat-val">{{ fmt(purchaseTotal) }}</span>
          <span class="ri-stat-label">Purchase qty</span>
        </div>
        <div class="ri-stat">
          <span class="ri-stat-val">{{ fmt(draftReceivedTotal) }}</span>
          <span class="ri-stat-label">Received qty</span>
        </div>
        <div class="ri-stat">
          <span class="ri-stat-val">{{ fmt(draftOutstanding) }}</span>
          <span class="ri-stat-label">Difference qty</span>
        </div>
      </div>

      <!-- Filter bar + table -->
      <div class="ri-sku-section">

        <!-- Filter bar -->
        <div class="ri-filter-bar">
          <div class="ri-filter-bar-left">
            <span class="ri-editing-hint">Scan or enter the received qty for each item.</span>
            <button class="ri-link-btn" @click="receiveAll">Receive all</button>
          </div>
          <div class="ri-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="search" class="ri-search" type="text" placeholder="Search product or SKU…" />
          </div>
        </div>

        <!-- SKU table -->
        <section class="ri-items-section" :class="{ 'ri-items-section--bordered': isProgressive }">
          <div ref="itemsScrollEl" class="ri-items-scroll">
            <table class="ri-items">
              <colgroup>
                <col />
                <col />
                <col />
                <col />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th class="ri-th">Product</th>
                  <th class="ri-th">SKU</th>
                  <th class="ri-th ri-th--num">Purchase qty</th>
                  <th class="ri-th ri-th--num">Received qty</th>
                  <th class="ri-th ri-th--num">Difference qty</th>
                  <th class="ri-th">Unit</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in pagedItems" :key="item.skuCode" class="ri-row">
                  <td class="ri-td">
                    <ProductCell :name="item.productName" :desc="item.productDesc" :image="item.image" />
                  </td>
                  <td class="ri-td">{{ item.skuCode }}</td>
                  <td class="ri-td ri-td--num">{{ fmt(item.expectedQty) }}</td>
                  <td
                    class="ri-td ri-td--input"
                    :class="{ 'ri-td--input--error': showQtyErrors && !(draftQty[item.skuCode] ?? 0) }"
                  >
                    <input
                      class="ri-qty-input"
                      type="number" min="0" :max="item.expectedQty"
                      :value="draftQty[item.skuCode] ?? 0"
                      :aria-label="`Received qty for ${item.productName}`"
                      @input="onQtyInput(item.skuCode, item.expectedQty, $event)"
                    />
                  </td>
                  <td class="ri-td ri-td--num">
                    <span v-if="item.expectedQty - (draftQty[item.skuCode] ?? 0) > 0" class="ri-outstanding">
                      {{ fmt(item.expectedQty - (draftQty[item.skuCode] ?? 0)) }}
                    </span>
                    <span v-else class="ri-qty--full">—</span>
                  </td>
                  <td class="ri-td">{{ item.unit }}</td>
                </tr>
                <tr v-if="!filteredItems.length">
                  <td class="ri-td ri-empty" colspan="6">No products match your search.</td>
                </tr>
              </tbody>
            </table>
            <div ref="itemsSentinelEl" class="ri-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="ri-loading ri-loading--inline">
              <MpSpinner size="sm" /> Loading products…
            </div>
          </div>
          <div class="ri-items-count">
            <span>Showing {{ pagedItems.length }} of {{ filteredItems.length }} products</span>
          </div>
        </section>

      </div>

    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <button class="ri-btn ri-btn--ghost" @click="goBack">Cancel</button>
      <button class="ri-btn ri-btn--secondary" @click="saveDraft">Save draft</button>
      <button class="ri-btn ri-btn--primary" @click="endReceiving">End receiving</button>
    </footer>
  </div>

  <!-- Not found -->
  <div v-else class="ri-not-found">
    <p>Receiving task not found.</p>
    <button class="detail-breadcrumb" @click="goReceiving">Back to Receiving</button>
  </div>

  <!-- ── Post confirmation modal ── -->
  <MpModal
    id="ri-confirm"
    :is-open="showConfirm"
    size="md"
    is-close-on-esc
    :is-keep-alive="false"
    @close="showConfirm = false"
  >
    <MpModalContent>
      <MpModalHeader>
        {{ draftOutstanding > 0 ? 'End receiving with outstanding items?' : 'Post receiving task?' }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <template v-if="draftOutstanding > 0">
          {{ fmt(draftOutstanding) }} of {{ fmt(purchaseTotal) }} units are still outstanding
          across {{ shortItemsCount }} {{ shortItemsCount === 1 ? 'item' : 'items' }}.
          This receiving will be saved as incomplete.
        </template>
        <template v-else>
          All {{ fmt(purchaseTotal) }} units have been received.
        </template>
      </MpModalBody>
      <MpModalFooter>
        <div class="ri-modal-footer">
          <button class="ri-btn ri-btn--ghost" @click="showConfirm = false">Cancel</button>
          <button class="ri-btn ri-btn--secondary" @click="commitReceiving(false)">Post</button>
          <button class="ri-btn ri-btn--primary" @click="commitReceiving(true)">Post &amp; Create put-away</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
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
.detail-breadcrumb-sep {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px);
}
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
  display: flex; flex-direction: column; gap: var(--mp-spacing-6);
}
.detail-footer {
  flex-shrink: 0;
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

/* ── PO header ───────────────────────────────────────────────────────────────── */
.ri-header {
  display: flex; gap: var(--mp-spacing-10);
  padding-bottom: var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
}
.ri-header :deep(.content-list) { padding-top: 0; }

/* ── Summary stats ───────────────────────────────────────────────────────────── */
.ri-summary { display: flex; align-items: center; gap: var(--mp-spacing-10); align-self: flex-start; }
.ri-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: var(--mp-sizes-24, 96px); }
.ri-stat-val {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); font-variant-numeric: tabular-nums;
}
.ri-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── SKU section (filter bar + table) ───────────────────────────────────────── */
.ri-sku-section { display: flex; flex-direction: column; }

/* ── Filter bar — 20px gap ke table ─────────────────────────────────────────── */
.ri-filter-bar {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5);
}
.ri-filter-bar-left { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.ri-editing-hint {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-normal);
  color: var(--mp-text-default);
}
.ri-link-btn {
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium);
  color: var(--mp-text-link); line-height: var(--mp-line-heights-sm);
}
.ri-link-btn:hover { text-decoration: underline; text-underline-offset: 2px; }
.ri-search-wrap {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 240px;
}
.ri-search-wrap:focus-within {
  border-color: var(--mp-border-bold);
  box-shadow: 0 0 0 1px var(--mp-border-bold);
}
.ri-search {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md);
}
.ri-search::placeholder { color: var(--mp-text-placeholder); }

/* ── Items table section ─────────────────────────────────────────────────────── */
.ri-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.ri-items-section--bordered {
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg); overflow: hidden;
}
.ri-items-section--bordered .ri-items-count { border-top: 1px solid var(--mp-border-default); }

/* Scroll container — same max-height as other create pages */
.ri-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.ri-items thead .ri-th { position: sticky; top: 0; z-index: 1; }

.ri-items { width: 100%; border-collapse: collapse; table-layout: auto; }
.ri-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default); white-space: nowrap;
}
.ri-th:last-child { border-right: none; }
.ri-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.ri-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  background: var(--mp-background-neutral-hovered);
  border-bottom: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
  vertical-align: top;
}
.ri-td:last-child { border-right: none; }
.ri-items-section--bordered .ri-row:last-child .ri-td { border-bottom: none; }
.ri-td--num { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); white-space: nowrap; }
.ri-td--input { padding: 0; }

/* Product cell */
.ri-product { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.ri-product-thumb {
  width: var(--mp-sizes-10, 40px); height: var(--mp-sizes-10, 40px);
  border-radius: var(--mp-radii-md); flex-shrink: 0;
  object-fit: cover; background: var(--mp-background-neutral); border: 1px solid var(--mp-border-subtle);
}
.ri-product-name {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium);
  color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

/* Qty input — fills full cell; white bg always, gray inset border on focus */
.ri-td--input { background: var(--mp-background-neutral, #fff); }
.ri-td--input:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.ri-td--input--error { background: var(--mp-background-danger-subtle, #fef2f2); }
.ri-td--input--error:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-danger, #dc2626); }
.ri-qty-input {
  display: block; width: 100%; box-sizing: border-box;
  padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4);
  border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  text-align: right; font-variant-numeric: tabular-nums;
  line-height: var(--mp-line-heights-md);
}

/* Qty colors */
.ri-qty--full   { color: var(--mp-text-success-default, #15803d); font-weight: var(--mp-font-weights-medium); }
.ri-outstanding { color: var(--mp-text-default); font-weight: var(--mp-font-weights-medium); }

/* Progressive pagination */
.ri-sentinel { height: 1px; }
.ri-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.ri-loading--inline { justify-content: center; padding: var(--mp-spacing-3); }

.ri-items-count {
  display: flex; align-items: center; margin: 0;
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

/* Empty search result */
.ri-empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-8) 0; }

/* Buttons (footer + modal) */
.ri-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap; line-height: var(--mp-line-heights-md);
  transition: background 0.15s;
}
.ri-btn--ghost {
  background: transparent; border-color: transparent; color: var(--mp-text-secondary);
}
.ri-btn--ghost:hover { background: var(--mp-background-neutral-hovered); }
.ri-btn--secondary {
  background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-default);
}
.ri-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.ri-btn--primary {
  background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff);
}
.ri-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }

/* Modal footer */
.ri-modal-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

/* Not found */
.ri-not-found {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--mp-spacing-4); flex: 1; height: 100%;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
