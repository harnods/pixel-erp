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
import { getPickingLineItems } from '~/data/pickingTaskDetails'
import { getPickingTask, savePickingDraft, endPicking } from '~/data/pickingTasks'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const task = computed(() => getPickingTask(props.orderId))
const lineItems = computed(() => task.value ? getPickingLineItems(task.value) : [])

const startDateLabel = computed(() => {
  const d = task.value?.startDate
  if (!d) return '—'
  const dt = new Date(d)
  const date = dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' })
  const time = dt.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  return `${date}, ${time}`
})

// ── Draft picked qty (keyed by line key) ──────────────────────────────────────
const draftQty = ref<Record<string, number>>({})
const search = ref('')
watch([() => props.orderId, lineItems], () => {
  const map: Record<string, number> = {}
  for (const it of lineItems.value) map[it.key] = it.pickedQty
  draftQty.value = map
  search.value = ''
}, { immediate: true })

const toPickTotal = computed(() => lineItems.value.reduce((s, it) => s + it.expectedQty, 0))
const draftPickedTotal = computed(() => Object.values(draftQty.value).reduce((a, b) => a + (b || 0), 0))
const draftOutstanding = computed(() => Math.max(0, toPickTotal.value - draftPickedTotal.value))
const shortItemsCount = computed(() => lineItems.value.filter(it => (draftQty.value[it.key] ?? 0) < it.expectedQty).length)

const filteredItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return lineItems.value
  return lineItems.value.filter(it => it.productName.toLowerCase().includes(q) || it.skuCode.toLowerCase().includes(q))
})

// ── Progressive pagination ────────────────────────────────────────────────────
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
  itemsObserver = new IntersectionObserver(
    entries => { if (entries[0].isIntersecting) loadMoreItems() },
    { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' },
  )
  itemsObserver.observe(itemsSentinelEl.value)
}
watch(search, () => { shownCount.value = PAGE_SIZE; nextTick(() => { if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0; setupItemsObserver() }) })

function pickAll() {
  const map: Record<string, number> = {}
  for (const it of lineItems.value) map[it.key] = it.expectedQty
  draftQty.value = map
}

const showQtyErrors = ref(false)
function onQtyInput(key: string, expected: number, e: Event) {
  let n = Math.floor(Number((e.target as HTMLInputElement).value))
  if (!Number.isFinite(n) || n < 0) n = 0
  if (n > expected) n = expected
  draftQty.value = { ...draftQty.value, [key]: n }
  if (showQtyErrors.value) showQtyErrors.value = false
}
function fmt(n: number) { return n.toLocaleString('id-ID') }

// ── End picking confirmation ──────────────────────────────────────────────────
const showConfirm = ref(false)
function endPickingClick() {
  if (draftPickedTotal.value === 0) {
    showQtyErrors.value = true
    toast.notify({ variant: 'danger', title: 'Enter picked qty for at least 1 item' })
    return
  }
  showConfirm.value = true
}
function commitPicking(createPacking = false) {
  showConfirm.value = false
  const complete = draftPickedTotal.value >= toPickTotal.value
  endPicking(props.orderId, { ...draftQty.value })
  if (createPacking) {
    router.push({ path: '/barang-keluar/packing/create', query: { pickingId: props.orderId } })
  } else {
    toast.notify({
      variant: complete ? 'success' : 'warning',
      title: complete ? 'Picking completed, ready to pack' : 'Picking saved with a short pick',
    })
    router.push(`/picking/${props.orderId}`)
  }
}
function saveDraft() {
  savePickingDraft(props.orderId, { ...draftQty.value })
  toast.notify({ variant: 'success', title: 'Picking draft saved' })
  router.push(`/picking/${props.orderId}`)
}
function goBack() { router.push(`/picking/${props.orderId}`) }
function goPicking() { router.push('/barang-keluar?tab=Picking') }

// ── Footer divider ────────────────────────────────────────────────────────────
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
onUnmounted(() => {
  stageObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkStageOverflow)
  itemsObserver?.disconnect()
})
watch([() => props.orderId, shownCount], () => nextTick(checkStageOverflow))
</script>

<template>
  <div v-if="task" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goPicking">Picking</button>
          <span class="detail-breadcrumb-sep">/</span>
          <button class="detail-breadcrumb" @click="goBack">{{ task.taskNo }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">Pick items</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <div class="pik-header">
        <ContentList label="Warehouse" :value="task.warehouseName" />
        <ContentList label="Assignee" :value="task.assignee" />
        <ContentList label="Sales orders" :value="task.salesNos.join(', ')" />
        <ContentList label="Start date" :value="startDateLabel" />
      </div>

      <div class="pik-summary">
        <div class="pik-stat"><span class="pik-stat-val">{{ fmt(lineItems.length) }}</span><span class="pik-stat-label">SKU qty</span></div>
        <div class="pik-stat"><span class="pik-stat-val">{{ fmt(toPickTotal) }}</span><span class="pik-stat-label">To pick</span></div>
        <div class="pik-stat"><span class="pik-stat-val">{{ fmt(draftPickedTotal) }}</span><span class="pik-stat-label">Picked</span></div>
        <div class="pik-stat"><span class="pik-stat-val">{{ fmt(draftOutstanding) }}</span><span class="pik-stat-label">Outstanding</span></div>
      </div>

      <div class="pik-sku-section">
        <div class="pik-filter-bar">
          <div class="pik-filter-bar-left">
            <span class="pik-editing-hint">Pick each item from its storage location and enter the picked qty.</span>
            <button class="pik-link-btn" @click="pickAll">Pick all</button>
          </div>
          <div class="pik-search-wrap">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="search" class="pik-search" type="text" placeholder="Search product or SKU…" />
          </div>
        </div>

        <section class="pik-items-section" :class="{ 'pik-items-section--bordered': isProgressive }">
          <div ref="itemsScrollEl" class="pik-items-scroll">
            <table class="pik-items">
              <thead>
                <tr>
                  <th class="pik-th">Product</th>
                  <th class="pik-th">SKU</th>
                  <th class="pik-th">Storage location</th>
                  <th class="pik-th pik-th--num">To pick</th>
                  <th class="pik-th pik-th--num">Picked qty</th>
                  <th class="pik-th pik-th--num">Outstanding</th>
                  <th class="pik-th">Unit</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in pagedItems" :key="item.key" class="pik-row">
                  <td class="pik-td"><ProductCell :name="item.productName" :desc="item.productDesc" :image="item.image" /></td>
                  <td class="pik-td">{{ item.skuCode }}</td>
                  <td class="pik-td">{{ item.binLocation }}</td>
                  <td class="pik-td pik-td--num">{{ fmt(item.expectedQty) }}</td>
                  <td
                    class="pik-td pik-td--input"
                    :class="{ 'pik-td--input--error': showQtyErrors && !(draftQty[item.key] ?? 0) }"
                  >
                    <input
                      class="pik-qty-input"
                      type="number" min="0" :max="item.expectedQty"
                      :value="draftQty[item.key] ?? 0"
                      :aria-label="`Picked qty for ${item.productName}`"
                      @input="onQtyInput(item.key, item.expectedQty, $event)"
                    />
                  </td>
                  <td class="pik-td pik-td--num">
                    <span v-if="item.expectedQty - (draftQty[item.key] ?? 0) > 0" class="pik-outstanding">
                      {{ fmt(item.expectedQty - (draftQty[item.key] ?? 0)) }}
                    </span>
                    <span v-else class="pik-qty--full">—</span>
                  </td>
                  <td class="pik-td">{{ item.unit }}</td>
                </tr>
                <tr v-if="!filteredItems.length">
                  <td class="pik-td pik-empty" colspan="7">No products match your search.</td>
                </tr>
              </tbody>
            </table>
            <div ref="itemsSentinelEl" class="pik-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="pik-loading pik-loading--inline"><MpSpinner size="sm" /> Loading products…</div>
          </div>
          <div class="pik-items-count"><span>Showing {{ pagedItems.length }} of {{ filteredItems.length }} products</span></div>
        </section>
      </div>

    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <button class="pik-btn pik-btn--ghost" @click="goBack">Cancel</button>
      <button class="pik-btn pik-btn--secondary" @click="saveDraft">Save draft</button>
      <button class="pik-btn pik-btn--primary" @click="endPickingClick">End picking</button>
    </footer>
  </div>

  <div v-else class="pik-not-found">
    <p>Picking task not found.</p>
    <button class="detail-breadcrumb" @click="goPicking">Back to Picking</button>
  </div>

  <!-- ── End picking confirmation ── -->
  <MpModal id="pik-confirm" :is-open="showConfirm" size="md" is-close-on-esc :is-keep-alive="false" @close="showConfirm = false">
    <MpModalContent>
      <MpModalHeader>
        {{ draftOutstanding > 0 ? 'End picking with a short pick?' : 'End picking task?' }}
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <template v-if="draftOutstanding > 0">
          {{ fmt(draftOutstanding) }} of {{ fmt(toPickTotal) }} units couldn't be picked
          across {{ shortItemsCount }} {{ shortItemsCount === 1 ? 'item' : 'items' }}.
          This picking will be completed short.
        </template>
        <template v-else>
          All {{ fmt(toPickTotal) }} units have been picked.
        </template>
      </MpModalBody>
      <MpModalFooter>
        <div class="pik-modal-footer">
          <button class="pik-btn pik-btn--ghost" @click="showConfirm = false">Cancel</button>
          <button class="pik-btn pik-btn--secondary" @click="commitPicking(false)">End picking</button>
          <button class="pik-btn pik-btn--primary" @click="commitPicking(true)">End &amp; Create packing</button>
        </div>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>
</template>

<style scoped>
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
.detail-breadcrumb-sep { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default);
}
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-6);
}
.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

.pik-header { display: flex; gap: var(--mp-spacing-10); padding-bottom: var(--mp-spacing-4); border-bottom: 1px solid var(--mp-border-default); }
.pik-header :deep(.content-list) { padding-top: 0; }
.pik-summary { display: flex; align-items: center; gap: var(--mp-spacing-10); align-self: flex-start; }
.pik-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: var(--mp-sizes-24, 96px); }
.pik-stat-val { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.pik-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.pik-sku-section { display: flex; flex-direction: column; }
.pik-filter-bar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5); }
.pik-filter-bar-left { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.pik-editing-hint { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pik-link-btn { background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-medium); color: var(--mp-text-link); }
.pik-link-btn:hover { text-decoration: underline; text-underline-offset: 2px; }
.pik-search-wrap {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 240px;
}
.pik-search-wrap:focus-within { border-color: var(--mp-border-bold); box-shadow: 0 0 0 1px var(--mp-border-bold); }
.pik-search { flex: 1; border: none; background: transparent; outline: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pik-search::placeholder { color: var(--mp-text-placeholder); }

.pik-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.pik-items-section--bordered { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg); overflow: hidden; }
.pik-items-section--bordered .pik-items-count { border-top: 1px solid var(--mp-border-default); }
.pik-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.pik-items thead .pik-th { position: sticky; top: 0; z-index: 1; }
.pik-items { width: 100%; border-collapse: collapse; table-layout: auto; }
.pik-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pik-th:last-child { border-right: none; }
.pik-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.pik-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  background: var(--mp-background-neutral-hovered);
  border-bottom: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); vertical-align: top;
}
.pik-td:last-child { border-right: none; }
.pik-items-section--bordered .pik-row:last-child .pik-td { border-bottom: none; }
.pik-td--num { text-align: right; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); white-space: nowrap; }
.pik-td--input { padding: 0; background: var(--mp-background-neutral, #fff); }
.pik-td--input:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.pik-td--input--error { background: var(--mp-background-danger-subtle, #fef2f2); }
.pik-td--input--error:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-danger, #dc2626); }
.pik-qty-input {
  display: block; width: 100%; box-sizing: border-box;
  padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4);
  border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  text-align: right; font-variant-numeric: tabular-nums; line-height: var(--mp-line-heights-md);
}
.pik-qty--full { color: var(--mp-text-success-default, #15803d); font-weight: var(--mp-font-weights-medium); }
.pik-outstanding { color: var(--mp-text-default); font-weight: var(--mp-font-weights-medium); }
.pik-sentinel { height: 1px; }
.pik-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.pik-loading--inline { justify-content: center; padding: var(--mp-spacing-3); }
.pik-items-count { display: flex; align-items: center; margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.pik-empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-8) 0; }

.pik-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap; transition: background 0.15s;
}
.pik-btn--ghost { background: transparent; border-color: transparent; color: var(--mp-text-secondary); }
.pik-btn--ghost:hover { background: var(--mp-background-neutral-hovered); }
.pik-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-default); }
.pik-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.pik-btn--primary { background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff); }
.pik-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }
.pik-modal-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }

.pik-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); flex: 1; height: 100%; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
