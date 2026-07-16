<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import {
  MpButton, MpTooltip, MpSpinner, MpAutocomplete,
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  toast, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import { scrollToFirstError } from '~/utils/form'
import { formatDateLong } from '~/utils/date'
import ProductCell from '~/components/patterns/ProductCell.vue'
import { receipts, type Receipt } from '~/data/receipts'
import { lineItemsForReceipt, type ReceiptLineItem } from '~/data/receiptLineItems'
import { createReceivingTask, uncoveredLineItems, receivingTasksForReceipt } from '~/data/receivingTasks'
import { getWarehouseOperators } from '~/data/warehouseTeam'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const receipt = computed<Receipt | null>(() => receipts.find(r => r.id === props.orderId) ?? null)

// Assignee choices are scoped to this PO's warehouse — only its Operators are valid.
const ASSIGNEES = computed(() => getWarehouseOperators(receipt.value?.warehouseId ?? ''))

// ─── Form state ────────────────────────────────────────────────────────────────
const assigneeId    = ref('')
// Validation — the Save button stays active; the error surfaces on submit and
// clears once an assignee is picked.
const assigneeError = ref(false)
watch(assigneeId, (v) => { if (v) assigneeError.value = false })
const assigneeLabel = computed(() => ASSIGNEES.value.find(a => a.id === assigneeId.value)?.name ?? '')

// SKU scope = whatever stays in the table. Removing a row narrows the scope.
const removed = ref(new Set<string>())
const search  = ref('')

// A receiving task can only cover SKUs not already in another task (the coverage
// rule). So the picker shows just this PO's uncovered SKUs; once all are covered
// the page has nothing to add (and "Create receiving task" is blocked upstream).
const lineItems = computed<ReceiptLineItem[]>(() => {
  if (!receipt.value) return []
  const uncovered = new Set(uncoveredLineItems(props.orderId).map((l) => l.sku))
  return lineItemsForReceipt(receipt.value).filter((i) => uncovered.has(i.sku))
})
const keptItems = computed<ReceiptLineItem[]>(() =>
  lineItems.value.filter(i => !removed.value.has(i.productId)),
)
// Table shows ALL items; removed rows stay visible but dimmed.
const visibleItems = computed<ReceiptLineItem[]>(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return lineItems.value
  return lineItems.value.filter(i =>
    i.productName.toLowerCase().includes(q) ||
    i.sku.toLowerCase().includes(q) ||
    i.productDesc.toLowerCase().includes(q),
  )
})
const hasRemoved = computed(() => removed.value.size > 0)

// ─── Partial reception context ────────────────────────────────────────────────
const isPartialReceipt = computed(() => receipt.value?.status === 'partial reception')

const receivedPerSku = computed<Record<string, number>>(() => {
  const map: Record<string, number> = {}
  for (const t of receivingTasksForReceipt(props.orderId)) {
    if (t.status !== 'pending put-away' && t.status !== 'completed') continue
    for (const it of t.items) map[it.sku] = (map[it.sku] ?? 0) + it.receivedQty
  }
  return map
})
// What's actually still owed on this SKU — Purchase qty minus whatever prior
// ended tasks on this same receipt already received. This, not the full
// Purchase qty, is the real ceiling for a new task's Expected qty: a 2nd task
// covering the remainder can't realistically expect the whole original qty
// again once part of it has already arrived.
function outstandingQty(it: { sku: string; purchaseQty: number }): number {
  return Math.max(0, it.purchaseQty - (receivedPerSku.value[it.sku] ?? 0))
}

// "Expected qty" — how much is realistically expected this task, defaults to
// (and can never exceed) the outstanding qty. Keyed by SKU, since that's what
// createReceivingTask ultimately takes.
const targetQtyBySku = ref<Record<string, number>>({})
function onTargetQtyInput(sku: string, ceiling: number, e: Event) {
  let n = Math.floor(Number((e.target as HTMLInputElement).value))
  if (!Number.isFinite(n) || n < 0) n = 0
  if (n > ceiling) n = ceiling
  targetQtyBySku.value = { ...targetQtyBySku.value, [sku]: n }
}

// ─── Progressive pagination — auto lazy-load on scroll ────────────────────────
const PAGE_SIZE   = 10
const shownCount  = ref(PAGE_SIZE)
const loadingMore = ref(false)
const pagedItems  = computed<ReceiptLineItem[]>(() => visibleItems.value.slice(0, shownCount.value))
const hasMoreItems = computed(() => shownCount.value < visibleItems.value.length)
// Only wrap the table in an outside border when it needs progressive loading
// (more than one page of SKUs). Short lists render borderless.
const isProgressive = computed(() => visibleItems.value.length > PAGE_SIZE)

function loadMoreItems(): void {
  if (loadingMore.value || !hasMoreItems.value) return
  loadingMore.value = true
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, visibleItems.value.length)
    loadingMore.value = false
  }, 500)
}

const itemsScrollEl   = ref<HTMLElement | null>(null)
const itemsSentinelEl = ref<HTMLElement | null>(null)
let itemsObserver: IntersectionObserver | null = null
function setupItemsObserver(): void {
  itemsObserver?.disconnect()
  if (!itemsScrollEl.value || !itemsSentinelEl.value) return
  itemsObserver = new IntersectionObserver(
    (entries) => { if (entries[0].isIntersecting) loadMoreItems() },
    { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' },
  )
  itemsObserver.observe(itemsSentinelEl.value)
}
onMounted(() => nextTick(setupItemsObserver))
onUnmounted(() => itemsObserver?.disconnect())

// Reset the rendered slice + re-arm the observer when the order or search changes.
watch([() => props.orderId, search], () => {
  shownCount.value = PAGE_SIZE
  nextTick(() => {
    if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0
    setupItemsObserver()
  })
})
function removeItem(id: string): void {
  const s = new Set(removed.value)
  s.add(id)
  removed.value = s
}
function restoreItem(id: string): void {
  const s = new Set(removed.value)
  s.delete(id)
  removed.value = s
}
function resetItems(): void { removed.value = new Set() }

// Reset the form whenever the order changes.
watch(() => props.orderId, () => {
  assigneeId.value = ''
  removed.value = new Set()
  search.value = ''
  targetQtyBySku.value = Object.fromEntries(lineItems.value.map((it) => [it.sku, outstandingQty(it)]))
}, { immediate: true })

// ─── Footer divider — only show the top border once the stage scrolls ──────────
const stageEl = ref<HTMLElement | null>(null)
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
  })
})
onUnmounted(() => {
  stageObserver?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkStageOverflow)
})
watch([() => props.orderId, shownCount], () => nextTick(checkStageOverflow))

// ─── Helpers ──────────────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }

function goBack() {
  router.push(`/inbound-delivery/${props.orderId}`)
}
function goReceipts() {
  router.push({ path: '/inbound-delivery', query: { tab: 'Receipts' } })
}

function handleCreate() {
  // Button is always active — validate on submit and surface the error inline.
  if (!assigneeId.value) { assigneeError.value = true; scrollToFirstError(); return }
  if (!keptItems.value.length) return
  if (receipt.value) {
    // Create an Open receiving task covering the kept (included) SKUs. The operator
    // does the actual receiving; PO status stays Open until a task is ended.
    const task = createReceivingTask({
      receiptId: receipt.value.id,
      assignee: assigneeLabel.value,
      skus: keptItems.value.map((i) => i.sku),
      targetQtyBySku: targetQtyBySku.value,
    })
    toast.notify({ variant: 'success', title: 'Receiving task created' , maxWidth: 'max-content'})
    router.push(task ? `/receiving/${task.id}` : `/inbound-delivery/${props.orderId}`)
  }
}
</script>

<template>
  <div v-if="receipt" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goReceipts">Receipts</button>
          <span class="detail-breadcrumb-sep">/</span>
          <button class="detail-breadcrumb" @click="goBack">{{ receipt.purchaseNo }}</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">Create purchase receiving</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <!-- PO content list (header) -->
      <div class="pr-header">
        <ContentList label="Purchase no." :value="receipt.purchaseNo" />
        <ContentList label="Description" :value="receipt.memo ?? '—'" />
        <ContentList
          label="Tracking no."
          :value="receipt.trackingNos.length ? receipt.trackingNos.join(', ') : '—'"
        />
        <ContentList label="Estimated arrival" :value="formatDateLong(receipt.estimatedArrival)" />
      </div>

      <!-- Assignee — select spans 3 of the 6-col (558px) form grid -->
      <div class="pr-section pr-grid">
        <MpFormControl id="pr-assignee" is-required :is-invalid="assigneeError" :class="css({ gridColumn: 'span 3' })">
          <MpFormLabel>Assignee</MpFormLabel>
          <MpAutocomplete
            id="pr-assignee-ac"
            v-model="assigneeId"
            :data="ASSIGNEES"
            label-prop="name"
            value-prop="id"
            placeholder="Select assignee"
            is-searchable is-clearable use-portal is-full-width
            :is-invalid="assigneeError"
          >
            <template #default="{ item }">
              <div class="pr-assignee-opt">
                <span
                  class="pr-assignee-avatar"
                  :style="{ background: `hsl(${item.hue},50%,88%)`, color: `hsl(${item.hue},55%,35%)` }"
                >{{ item.initials }}</span>
                {{ item.name }}
              </div>
            </template>
          </MpAutocomplete>
          <MpFormErrorMessage>You must select assignee</MpFormErrorMessage>
        </MpFormControl>
      </div>

      <!-- SKU table — scope is whatever stays here -->
      <div class="pr-sku-section">
        <h2 class="pr-section-title">SKU to receive</h2>

        <!-- Filter bar: scope count (left) + search (always right) -->
        <div class="pr-filter-bar">
          <div class="pr-filter-left">
            <span class="pr-sku-count">{{ keptItems.length }} of {{ lineItems.length }} included</span>
            <MpButton v-if="hasRemoved" variant="textLink" size="sm" @click="resetItems">Reset</MpButton>
          </div>
          <div class="pr-filter-search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
            </svg>
            <input v-model="search" class="pr-filter-search-input" type="text" placeholder="Search SKU or product" />
            <button v-if="search" class="search-clear-btn" type="button" aria-label="Clear search" @click="search = ''">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Empty — search matched nothing -->
        <div v-if="!visibleItems.length" class="pr-empty">
          <p class="pr-empty-title">No results found</p>
          <p class="pr-empty-desc">No SKU matches your search. Try a different keyword.</p>
        </div>

        <!-- Table — outside border + internal scroll only when progressive (>10 SKUs) -->
        <section v-else class="pr-items-section" :class="{ 'pr-items-section--bordered': isProgressive }">
          <div ref="itemsScrollEl" class="pr-items-scroll">
            <table class="pr-items">
              <colgroup>
                <col />
                <col />
                <col class="pr-col--num" />
                <col class="pr-col--num" />
                <col v-if="isPartialReceipt" class="pr-col--num" />
                <col v-if="isPartialReceipt" class="pr-col--num" />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th class="pr-th">Product</th>
                  <th class="pr-th">SKU</th>
                  <th class="pr-th pr-th--num">Purchase qty</th>
                  <th class="pr-th pr-th--num">Expected qty</th>
                  <th v-if="isPartialReceipt" class="pr-th pr-th--num">Received qty</th>
                  <th v-if="isPartialReceipt" class="pr-th pr-th--num">Outstanding qty</th>
                  <th class="pr-th">Unit</th>
                  <th class="pr-th pr-th--action" aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                <tr v-for="it in pagedItems" :key="it.productId" class="pr-item-row" :class="{ 'pr-item-row--removed': removed.has(it.productId) }">
                  <td class="pr-td">
                    <ProductCell :name="it.productName" :desc="it.productDesc" :image="it.image" />
                  </td>
                  <td class="pr-td"><span class="pr-sku-text">{{ it.sku }}</span></td>
                  <td class="pr-td pr-td--num">{{ formatNum(it.purchaseQty) }}</td>
                  <td class="pr-td pr-td--input">
                    <input
                      class="pr-qty-input"
                      type="number" min="0" :max="outstandingQty(it)"
                      :value="targetQtyBySku[it.sku] ?? outstandingQty(it)"
                      :aria-label="`Expected qty for ${it.productName}`"
                      @input="onTargetQtyInput(it.sku, outstandingQty(it), $event)"
                    />
                  </td>
                  <td v-if="isPartialReceipt" class="pr-td pr-td--num">{{ formatNum(receivedPerSku[it.sku] ?? 0) }}</td>
                  <td v-if="isPartialReceipt" class="pr-td pr-td--num pr-td--outstanding">{{ formatNum(outstandingQty(it)) }}</td>
                  <td class="pr-td">{{ it.unit }}</td>
                  <td class="pr-td pr-td--action">
                    <template v-if="removed.has(it.productId)">
                      <MpTooltip :id="`pr-rs-${it.productId}`" label="Restore" placement="left" use-portal>
                        <MpButton
                          :aria-label="`Restore ${it.productName}`"
                          variant="ghost" left-icon="add"
                          @click="restoreItem(it.productId)"
                        />
                      </MpTooltip>
                    </template>
                    <template v-else>
                      <MpTooltip :id="`pr-rm-${it.productId}`" label="Remove" placement="left" use-portal>
                        <MpButton
                          :aria-label="`Remove ${it.productName}`"
                          variant="ghost" left-icon="minus-circular"
                          @click="removeItem(it.productId)"
                        />
                      </MpTooltip>
                    </template>
                  </td>
                </tr>
              </tbody>
            </table>
            <!-- sentinel observed for auto lazy-load + inline loading row -->
            <div ref="itemsSentinelEl" class="pr-items-sentinel" aria-hidden="true" />
            <div v-if="loadingMore" class="pr-loading pr-items-loading">
              <MpSpinner size="sm" /> Loading SKUs…
            </div>
          </div>
          <div class="pr-items-count">
            <span>Showing {{ pagedItems.length }} of {{ visibleItems.length }} SKUs</span>
          </div>
        </section>
      </div>
    </div><!-- /detail-stage -->

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpButton variant="ghost" is-rounded @click="goBack">Cancel</MpButton>
      <MpButton variant="primary" is-rounded @click="handleCreate">
        Save
      </MpButton>
    </footer>
  </div>

  <!-- Not found fallback -->
  <div v-else class="pr-not-found">
    <p>Purchase order not found.</p>
    <button class="detail-breadcrumb" @click="router.push('/inbound-delivery')">Back to Inbound delivery</button>
  </div>
</template>

<style scoped>
/* ── Page shell — canonical detail pattern ──────────────────────────────────── */
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
}
.detail-footer {
  flex-shrink: 0;
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }

/* ── PO content list (header) — flush, no side padding, border-bottom divider ── */
.pr-header {
  display: flex; flex-wrap: wrap; gap: var(--mp-spacing-10);
  padding: 0 0 var(--mp-spacing-4) 0;
  margin-bottom: var(--mp-spacing-6);
  border-bottom: 1px solid var(--mp-border-default);
}
.pr-header :deep(.content-list) { padding-top: 0; flex: 0 0 318px; width: 318px; }
.pr-header :deep(.content-list__label) {
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-lg, 20px);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-default);
}
.pr-header :deep(.content-list__value) { white-space: normal; overflow-wrap: break-word; word-break: break-word; }

/* ── Section / form grid — 6 columns over the 558px form width (per Form.md) ── */
.pr-section { margin-bottom: var(--mp-spacing-6); }
.pr-grid { display: grid; grid-template-columns: repeat(6, 1fr); gap: var(--mp-spacing-4); max-width: 558px; }
.pr-assignee-opt { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.pr-assignee-avatar {
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  border-radius: var(--mp-radii-full); flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--mp-font-sizes-xs); font-weight: var(--mp-font-weights-semi-bold);
}

/* ── Section title (h2) ───────────────────────────────────────────────────── */
.pr-section-title {
  margin: 0 0 var(--mp-spacing-4) 0;
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}

/* ── Filter bar (scope count left, search always right) ─────────────────────── */
.pr-filter-bar {
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-5);
}
.pr-filter-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.pr-sku-count { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pr-filter-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full);
  background: var(--mp-background-neutral); color: var(--mp-text-secondary); min-width: 260px;
}
.pr-filter-search-input {
  flex: 1; border: none; background: transparent; outline: none;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md);
}
.pr-filter-search-input::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }

/* ── Items table — ERP table spec + progressive internal scroll ─────────────── */
.pr-items-section { display: flex; flex-direction: column; }
.pr-items-section--bordered {
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-lg);
  overflow: hidden;
}
.pr-items-section--bordered .pr-items-count {
}
.pr-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.pr-items { width: 100%; table-layout: auto; border-collapse: collapse; }
.pr-items thead .pr-th { position: sticky; top: 0; z-index: 1; }

.pr-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.pr-th--num {
  text-align: right;
  padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4);
}
.pr-th--action { width: 56px; }

.pr-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
  background: var(--mp-background-neutral-subtle);
}
.pr-col--num { width: 110px; }
.pr-td--num {
  text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums;
  padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4);
}
/* Expected qty — the one editable column, so it's white with an inset focus
   ring, per this codebase's form-table convention (everything else stays gray). */
.pr-td--input { padding: 0; background: var(--mp-background-neutral, #fff); }
.pr-td--input:focus-within { box-shadow: inset 0 0 0 1px var(--mp-border-bold); }
.pr-qty-input {
  display: block; width: 100%; box-sizing: border-box;
  padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4);
  border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  text-align: right; font-variant-numeric: tabular-nums;
  line-height: var(--mp-line-heights-lg, 20px);
}
.pr-td--outstanding { color: var(--mp-text-warning, #b45309); font-weight: var(--mp-font-weights-semi-bold); }
.pr-td--action { text-align: right; padding-block: 2px; padding-right: var(--mp-spacing-2); }
.pr-item-row--removed .pr-td { background: var(--mp-background-neutral-subtle); color: var(--mp-text-disabled); }
.pr-item-row--removed :deep(.pc-name),
.pr-item-row--removed :deep(.pc-desc),
.pr-item-row--removed .pr-sku-text { color: var(--mp-text-disabled); }

/* Product cell — real photo + name + description */
.pr-product { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.pr-product-thumb {
  width: var(--mp-sizes-10, 40px); height: var(--mp-sizes-10, 40px);
  border-radius: var(--mp-radii-md); flex-shrink: 0;
  object-fit: cover; background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-subtle);
}
.pr-product-info { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: 0; }
.pr-product-name {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-medium);
  color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pr-product-desc {
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pr-sku-text { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* Sentinel + inline loading row (inside the scroll) */
.pr-items-sentinel { height: 1px; }
.pr-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.pr-loading {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-md);
}

/* Progressive count row */
.pr-items-count {
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}

/* ── Empty states ─────────────────────────────────────────────────────────── */
.pr-empty {
  display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-10, 40px) 0;
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-lg);
}
.pr-empty-title {
  margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.pr-empty-desc { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Not found */
.pr-not-found {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: var(--mp-spacing-4); flex: 1; height: 100%;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
</style>
