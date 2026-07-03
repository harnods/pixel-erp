<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTooltip, MpIcon, MpSpinner,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ActivityLogModal from '~/components/patterns/ActivityLogModal.vue'
import ViewBatchDrawer from '~/components/patterns/ViewBatchDrawer.vue'
import ViewSerialDrawer from '~/components/patterns/ViewSerialDrawer.vue'
import { formatDateLong } from '~/utils/date'
import {
  stockAdjustments, getAdjustment, adjustmentLineItems, adjustmentMemo, adjustmentAttachments,
  adjustmentUpdatedBy, adjustmentUpdatedAt, accountCodeFor, deleteAdjustments,
  type AdjustmentLine,
} from '~/data/stockAdjustments'
import { getWarehouseDetail } from '~/data/warehouseDetails'

// The catch-all route binds the id via the generic `orderId` prop for every detail page.
const props = defineProps<{ orderId: string }>()
const router = useRouter()

const adjustment = computed(() => getAdjustment(props.orderId))
const isCount = computed(() => adjustment.value?.kind === 'count')
const lineItems = computed(() => adjustment.value ? adjustmentLineItems(adjustment.value) : [])
const memo = computed(() => adjustment.value ? adjustmentMemo(adjustment.value) : '')
const attachments = computed(() => adjustment.value ? adjustmentAttachments(adjustment.value) : [])
const lastUpdatedBy = computed(() => adjustment.value ? adjustmentUpdatedBy(adjustment.value) : '')
const lastUpdatedAt = computed(() => adjustment.value ? adjustmentUpdatedAt(adjustment.value) : new Date().toISOString())
const accountCode = computed(() => adjustment.value ? accountCodeFor(adjustment.value.account) : '')

// ── Batch / serial detection ───────────────────────────────────────────────────
const warehouseStockMap = computed(() => {
  if (!adjustment.value) return {}
  const wh = getWarehouseDetail(adjustment.value.warehouseId)
  if (!wh) return {}
  return Object.fromEntries(wh.stock.map(s => [s.sku, s]))
})
function isBatchTrackedSku(sku: string) { return !!warehouseStockMap.value[sku]?.batches }
function isSerialTrackedSku(sku: string) { return !!warehouseStockMap.value[sku]?.serials }

// ── View batch drawer ──────────────────────────────────────────────────────────
const viewBatchOpen = ref(false)
const viewBatchItem = ref<AdjustmentLine | null>(null)
function openViewBatch(item: AdjustmentLine) {
  viewBatchItem.value = item
  viewBatchOpen.value = true
}

// ── View serial drawer ─────────────────────────────────────────────────────────
const viewSerialOpen = ref(false)
const viewSerialItem = ref<AdjustmentLine | null>(null)
function openViewSerial(item: AdjustmentLine) {
  viewSerialItem.value = item
  viewSerialOpen.value = true
}

function fmt(n: number) { return n.toLocaleString('id-ID') }
function diffLabel(n: number) { return n > 0 ? `+${fmt(n)}` : fmt(n) }
function formatIDR(amount: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2 }).format(amount)
}

// ── Line items — auto lazy-load, internal scroll & border past 10 rows ─────────
const PAGE_SIZE = 10
const shownCount = ref(PAGE_SIZE)
const loadingMore = ref(false)
const visibleItems = computed(() => lineItems.value.slice(0, shownCount.value))
const hasMoreItems = computed(() => shownCount.value < lineItems.value.length)
const itemsProgressive = computed(() => lineItems.value.length > PAGE_SIZE)
// Documented rule (details-page-format.md): a scrolling items table — vertical
// (>10 rows) OR horizontal (wide) — becomes a contained panel with a border-bold
// outer outline. Track horizontal overflow so wide tables get the outline too.
const itemsOverflowX = ref(false)
const itemsBordered = computed(() => itemsProgressive.value || itemsOverflowX.value)

function loadMoreItems() {
  if (loadingMore.value || !hasMoreItems.value) return
  loadingMore.value = true
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, lineItems.value.length)
    loadingMore.value = false
  }, 500)
}

const itemsScrollEl = ref<HTMLElement | null>(null)
const itemsTableEl = ref<HTMLElement | null>(null)
const itemsSentinelEl = ref<HTMLElement | null>(null)
let itemsObserver: IntersectionObserver | null = null
function setupItemsObserver() {
  itemsObserver?.disconnect()
  if (!itemsScrollEl.value || !itemsSentinelEl.value) return
  itemsObserver = new IntersectionObserver(
    (entries) => { if (entries[0]!.isIntersecting) loadMoreItems() },
    { root: itemsScrollEl.value, rootMargin: '0px 0px 120px 0px' },
  )
  itemsObserver.observe(itemsSentinelEl.value)
}
onMounted(() => nextTick(setupItemsObserver))
onUnmounted(() => itemsObserver?.disconnect())
watch(() => props.orderId, () => {
  shownCount.value = PAGE_SIZE
  loadingMore.value = false
  nextTick(() => {
    if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0
    setupItemsObserver()
    checkOverflow()
  })
})

/** File-type → Pixel document icon for an attachment. */
function attachmentIcon(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(ext)) return 'image-document'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel-document'
  if (['doc', 'docx'].includes(ext)) return 'word-document'
  return 'attachment'
}
function formatUpdatedAt(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date}, ${time}`
}

const activityOpen = ref(false)

// ── Jump-to-transaction switcher (title-bar chevron) ───────────────────────────
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const q = jumpSearch.value.trim().toLowerCase()
  const matched = q
    ? stockAdjustments.filter(a => a.number.toLowerCase().includes(q) || a.warehouseName.toLowerCase().includes(q) || a.category.toLowerCase().includes(q))
    : stockAdjustments
  return matched.slice(0, 6)
})
function jumpTo(id: string) { jumpSearch.value = ''; router.push(`/stock-adjustments/${id}`) }

function goBack() { router.push('/stock-adjustments') }
function preview() { /* opens the printable preview — not built in this prototype */ }
function printPdf() { /* generates the adjustment PDF — not built in this prototype */ }
function editAdjustment() { router.push(`/stock-adjustments/${props.orderId}/edit`) }

// ── Delete (single) — same alert as the index ──────────────────────────────────
const deleteOpen = ref(false)
const deleteReason = ref('')
const deleteError = ref('')
const REASON_MAX = 256
function askDelete() { deleteReason.value = ''; deleteError.value = ''; deleteOpen.value = true }
function confirmDelete() {
  if (!deleteReason.value.trim()) { deleteError.value = 'Enter a reason for deleting'; return }
  deleteAdjustments([props.orderId])
  deleteOpen.value = false
  router.push('/stock-adjustments')
}

// Footer divider appears only when the stage actually scrolls.
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkOverflow() {
  const el = stageEl.value; if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1
  const it = itemsScrollEl.value; if (it) itemsOverflowX.value = it.scrollWidth > it.clientWidth + 1
}
let ro: ResizeObserver | null = null
onMounted(() => nextTick(() => {
  checkOverflow()
  ro = new ResizeObserver(checkOverflow)
  if (stageEl.value) { ro.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkOverflow, { passive: true }) }
  // Observe BOTH the scroll container AND the table itself, so content-driven width
  // growth (fonts/columns) is caught — a container-only observer misses it.
  if (itemsScrollEl.value) ro.observe(itemsScrollEl.value)
  if (itemsTableEl.value) ro.observe(itemsTableEl.value)
  window.addEventListener('resize', checkOverflow)
}))
onUnmounted(() => {
  ro?.disconnect()
  stageEl.value?.removeEventListener('scroll', checkOverflow)
  window.removeEventListener('resize', checkOverflow)
})
</script>

<template>
  <div v-if="adjustment" class="detail-page">

    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">All stock adjustments</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ adjustment.number }}</h1>
          <MpPopover id="sad-jump" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <button class="detail-jump-chevron" aria-label="Switch transaction">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '304px' })">
              <div class="detail-jump">
                <div class="detail-jump-search-wrap">
                  <input v-model="jumpSearch" class="detail-jump-search" type="text" placeholder="Search transaction…" />
                </div>
                <div class="detail-jump-list">
                  <button v-for="a in jumpResults" :key="a.id" class="detail-jump-item" @click="jumpTo(a.id)">
                    <span class="detail-jump-item-number">{{ a.number }}</span>
                    <span class="detail-jump-item-customer">{{ a.warehouseName }} · {{ a.category }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">No transactions found.</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <div class="detail-titlerow-right">
        <MpTooltip id="sad-tt-tasks" label="Activity log" placement="bottom" use-portal>
          <button class="detail-icon-btn" aria-label="Activity log" @click="activityOpen = true"><MpIcon name="task-todo" size="md" /></button>
        </MpTooltip>
        <MpTooltip id="sad-tt-comments" label="Comments" placement="bottom" use-portal>
          <button class="detail-icon-btn" aria-label="Comments"><MpIcon name="comment" size="md" /></button>
        </MpTooltip>
      </div>
    </header>

    <div ref="stageEl" class="detail-stage">

      <!-- Header summary -->
      <section class="sad-summary">
        <div class="content-list-col">
          <ContentList label="Transaction date" :value="formatDateLong(adjustment.date)" />
          <ContentList label="Account" :value="accountCode ? `${accountCode} ${adjustment.account}` : adjustment.account" />
        </div>
        <div class="content-list-col">
          <ContentList label="Transaction no." :value="adjustment.number" />
          <ContentList label="Warehouse" :value="adjustment.warehouseName" />
        </div>
        <div class="content-list-col">
          <ContentList v-if="!isCount" label="Category" :value="adjustment.category" />
          <ContentList label="Tags">
            <ErpTagList v-if="adjustment.tags.length" :tags="adjustment.tags" />
            <span v-else class="detail-note-text">—</span>
          </ContentList>
        </div>
        <a class="sad-journal" @click.prevent>View journal entry</a>
      </section>

      <!-- Line items -->
      <section class="detail-items-section" :class="{ 'detail-items-section--bordered': itemsBordered }">
        <div ref="itemsScrollEl" class="detail-items-scroll">
          <table ref="itemsTableEl" class="detail-items">
            <thead>
              <tr>
                <th class="detail-th">Product</th>
                <th class="detail-th">SKU</th>
                <template v-if="isCount">
                  <th class="detail-th detail-th--num">Prev. on hand</th>
                  <th class="detail-th detail-th--num">Counted</th>
                  <th class="detail-th detail-th--num">Difference</th>
                </template>
                <th v-else class="detail-th detail-th--num">Qty in/out</th>
                <th class="detail-th">Unit</th>
                <th class="detail-th detail-th--num">Average cost</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="item in visibleItems" :key="item.key" class="detail-item-row"
                :class="{ 'detail-item-row--batch': isBatchTrackedSku(item.sku) || isSerialTrackedSku(item.sku) }"
              >
                <td class="detail-td"><ProductCell :name="item.product.name" :desc="item.product.desc" :image="item.product.img" /></td>
                <td class="detail-td">{{ item.sku }}</td>
                <template v-if="isCount">
                  <td class="detail-td detail-td--num">{{ fmt(item.prevOnHand) }}</td>
                  <!-- Batch-tracked: 2-row counted cell -->
                  <td v-if="isBatchTrackedSku(item.sku)" class="detail-td detail-td--counted-batch" style="padding: 0;">
                    <div class="detail-counted-qty">{{ fmt(item.counted) }}</div>
                    <div class="detail-counted-action">
                      <button class="detail-view-link" type="button" @click="openViewBatch(item)">View batch</button>
                    </div>
                  </td>
                  <td v-else-if="isSerialTrackedSku(item.sku)" class="detail-td detail-td--counted-batch" style="padding: 0;">
                    <div class="detail-counted-qty">{{ fmt(item.counted) }}</div>
                    <div class="detail-counted-action">
                      <button class="detail-view-link" type="button" @click="openViewSerial(item)">View serial numbers</button>
                    </div>
                  </td>
                  <td v-else class="detail-td detail-td--num">{{ fmt(item.counted) }}</td>
                  <td class="detail-td detail-td--num">{{ diffLabel(item.difference) }}</td>
                </template>
                <!-- in-out: batch/serial gets 2-row qty cell -->
                <template v-else>
                  <td v-if="isBatchTrackedSku(item.sku)" class="detail-td detail-td--counted-batch" style="padding: 0;">
                    <div class="detail-counted-qty detail-counted-qty--delta" :class="{ 'detail-diff--pos': item.difference > 0, 'detail-diff--neg': item.difference < 0 }">{{ diffLabel(item.difference) }}</div>
                    <div class="detail-counted-action">
                      <button class="detail-view-link" type="button" @click="openViewBatch(item)">View batch</button>
                    </div>
                  </td>
                  <td v-else-if="isSerialTrackedSku(item.sku)" class="detail-td detail-td--counted-batch" style="padding: 0;">
                    <div class="detail-counted-qty detail-counted-qty--delta" :class="{ 'detail-diff--pos': item.difference > 0, 'detail-diff--neg': item.difference < 0 }">{{ diffLabel(item.difference) }}</div>
                    <div class="detail-counted-action">
                      <button class="detail-view-link" type="button" @click="openViewSerial(item)">View serial numbers</button>
                    </div>
                  </td>
                  <td v-else class="detail-td detail-td--num">{{ diffLabel(item.difference) }}</td>
                </template>
                <td class="detail-td">{{ item.unit }}</td>
                <td class="detail-td detail-td--num">{{ formatIDR(item.averageCost) }}</td>
              </tr>
            </tbody>
          </table>
          <div ref="itemsSentinelEl" class="detail-items-sentinel" aria-hidden="true" />
          <div v-if="loadingMore" class="detail-loading detail-items-loading">
            <MpSpinner size="sm" /> Loading products…
          </div>
        </div>
        <div class="detail-items-count">
          <span>Showing {{ visibleItems.length }} of {{ lineItems.length }} products</span>
        </div>
      </section>

      <!-- Memo + attachment -->
      <section class="detail-notes-left">
        <ContentList label="Memo">
          <p class="detail-note-text">{{ memo || '—' }}</p>
        </ContentList>
        <ContentList :label="`Attachment (${attachments.length})`">
          <div v-if="attachments.length" class="detail-attach-list">
            <a v-for="(a, i) in attachments" :key="i" class="detail-attach" @click.prevent>
              <span class="detail-attach-icon"><MpIcon :name="attachmentIcon(a.name)" size="md" /></span>
              <span class="detail-attach-meta">
                <span class="detail-attach-name">{{ a.name }}</span>
                <span class="detail-attach-size">{{ a.sizeKB.toFixed(1) }} KB</span>
              </span>
            </a>
          </div>
          <p v-else class="detail-note-text">—</p>
        </ContentList>
      </section>

      <a class="detail-updated" @click.prevent="activityOpen = true">Last updated by {{ lastUpdatedBy }} on {{ formatUpdatedAt(lastUpdatedAt) }} (GMT+7)</a>

    </div>

    <footer class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <button class="detail-btn detail-btn--secondary" @click="printPdf">Print PDF</button>
      <MpPopover id="sad-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
        <MpPopoverTrigger>
          <button class="detail-btn detail-btn--primary">
            Actions
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem @click="preview">Preview</MpPopoverListItem>
            <div class="sad-menu-divider" role="separator" style="height:1px;margin:4px 0;background:var(--mp-border-default);" />
            <MpPopoverListItem @click="editAdjustment">Edit</MpPopoverListItem>
            <MpPopoverListItem @click="askDelete">Delete</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </footer>

    <ActivityLogModal
      :is-open="activityOpen"
      :subject="adjustment.number"
      :updated-by="lastUpdatedBy"
      :updated-at="lastUpdatedAt"
      @close="activityOpen = false"
    />

    <ViewBatchDrawer
      v-if="viewBatchItem"
      :open="viewBatchOpen"
      :sku="viewBatchItem.sku"
      :warehouse-id="adjustment.warehouseId"
      :kind="isCount ? 'count' : 'in-out'"
      :counted-total="isCount ? viewBatchItem.counted : undefined"
      :delta-total="isCount ? undefined : viewBatchItem.difference"
      :product-name="viewBatchItem.product.name"
      :product-img="viewBatchItem.product.img"
      @update:open="viewBatchOpen = $event"
    />

    <ViewSerialDrawer
      v-if="viewSerialItem"
      :open="viewSerialOpen"
      :sku="viewSerialItem.sku"
      :warehouse-id="adjustment.warehouseId"
      :counted-total="viewSerialItem.counted"
      :product-name="viewSerialItem.product.name"
      :product-img="viewSerialItem.product.img"
      @update:open="viewSerialOpen = $event"
    />

    <!-- Delete stock adjustment -->
    <MpModal
      id="sad-delete" :is-open="deleteOpen" size="md"
      is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="deleteOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>Delete stock adjustment?<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <p class="sa-del-intro">This action cannot be undone. Deleting this adjustment will:</p>
          <ul class="sa-del-list">
            <li>Remove the related journal entry</li>
            <li>Trigger recalculation that may affect COGS and product stock quantity</li>
          </ul>
          <div class="sa-del-field">
            <div class="sa-del-label-row">
              <label class="sa-del-label" for="sad-del-reason">Reason for deleting<span class="sa-del-req">*</span></label>
              <span class="sa-del-count">{{ deleteReason.length }} / {{ REASON_MAX }}</span>
            </div>
            <textarea
              id="sad-del-reason" class="sa-del-textarea" :class="{ 'sa-del-textarea--error': deleteError }"
              :maxlength="REASON_MAX" v-model="deleteReason" rows="3" @input="deleteError = ''"
            ></textarea>
            <p v-if="deleteError" class="sa-del-error">{{ deleteError }}</p>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <button class="btn-enterprise btn-enterprise--ghost" @click="deleteOpen = false">Cancel</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmDelete">Delete</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

  </div>

  <div v-else class="sad-not-found">
    <p>Stock adjustment not found.</p>
    <button class="detail-breadcrumb" @click="goBack">Back to stock adjustments</button>
  </div>
</template>

<style scoped>
.detail-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-titlerow-right { display: flex; align-items: center; gap: var(--mp-spacing-1); flex-shrink: 0; }
.detail-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border-radius: var(--mp-radii-md); background: none; border: none; cursor: pointer; color: var(--mp-icon-default); }
.detail-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump-chevron { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px); background: none; border: none; padding: 0; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); }
.detail-jump-search { width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; }
.detail-jump-search:focus { border-color: var(--mp-border-brand-bold, #029861); }
.detail-jump-search::placeholder { color: var(--mp-text-placeholder); }
.detail-jump-list { display: flex; flex-direction: column; }
.detail-jump-item { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); width: 100%; text-align: left; background: none; border: none; cursor: pointer; padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md); }
.detail-jump-item:hover { background: var(--mp-background-neutral-subtle); }
.detail-jump-item-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-customer { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }

.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; gap: var(--mp-spacing-8); }
/* 3 content columns + a trailing column that pushes "View journal entry" to the right. */
.sad-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 318px)) 1fr; column-gap: var(--mp-spacing-6); row-gap: 0; }
.content-list-col { display: flex; flex-direction: column; }
.sad-journal { justify-self: end; align-self: start; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer; white-space: nowrap; }
.sad-journal:hover { text-decoration: underline; text-underline-offset: 2px; }

.detail-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.detail-items-section--bordered { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); overflow: hidden; }
.detail-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.detail-items { width: 100%; border-collapse: collapse; table-layout: auto; }
.detail-th { height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default); white-space: nowrap; }
.detail-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.detail-td { padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.detail-items-section--bordered .detail-item-row:last-child .detail-td { border-bottom: none; }
.detail-items .detail-th { position: sticky; top: 0; z-index: 1; }
.detail-items-sentinel { height: 1px; }
.detail-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.detail-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.detail-items-count { display: flex; align-items: center; margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); border-bottom: 1px solid var(--mp-border-default); }
.detail-items-section--bordered .detail-items-count { border-top: 1px solid var(--mp-border-default); border-bottom: none; }
.detail-td--num { text-align: right; white-space: nowrap; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }

/* Batch/serial 2-row counted cell */
.detail-item-row--batch .detail-td { vertical-align: middle; }
.detail-td--counted-batch { display: table-cell; vertical-align: top; border-left: 1px solid var(--mp-border-default); border-right: 1px solid var(--mp-border-default); }
.detail-counted-qty {
  height: 40px; display: flex; align-items: center; justify-content: flex-end;
  padding: 0 var(--mp-spacing-2) 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.detail-counted-action {
  height: 40px; display: flex; align-items: center; justify-content: flex-end;
  padding: 0 var(--mp-spacing-2) 0 var(--mp-spacing-4);
}
.detail-counted-qty--delta { justify-content: flex-end; }
.detail-diff--pos { color: var(--mp-text-success, #18794e); }
.detail-diff--neg { color: var(--mp-text-danger, #a8352d); }
.detail-view-link {
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link);
  white-space: nowrap;
}
.detail-view-link:hover { text-decoration: underline; text-underline-offset: 2px; }

.detail-notes-left { display: flex; flex-direction: column; }
.detail-note-text { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default); white-space: pre-line; }
.detail-attach-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.detail-attach { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); cursor: pointer; width: fit-content; }
.detail-attach-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.detail-attach-meta { display: flex; flex-direction: column; }
.detail-attach-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.detail-attach:hover .detail-attach-name { text-decoration: underline; text-underline-offset: 2px; }
.detail-attach-size { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-updated { margin: 0; align-self: flex-start; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer; }
.detail-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

.detail-footer { flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage); border-top: 1px solid transparent; }
.detail-footer--floating { border-top-color: var(--mp-border-default); }
.detail-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer; border: 1px solid transparent; white-space: nowrap; }
.detail-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-text-default); color: var(--mp-text-default); }
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.detail-btn--primary { background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff); }
.detail-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }

.sad-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.sad-menu-divider { display: block; height: 1px; margin: var(--mp-spacing-1) 0; background: var(--mp-border-default); }

/* Delete modal */
.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); width: 100%; }
.sa-del-intro { color: var(--mp-text-default); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 24px); }
.sa-del-list { margin: var(--mp-spacing-2) 0 0; padding-left: 21px; list-style: disc; color: var(--mp-text-default); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 24px); }
.sa-del-field { margin-top: var(--mp-spacing-5, 20px); display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.sa-del-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); width: 100%; }
.sa-del-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.sa-del-req { color: var(--mp-text-danger, #a8352d); margin-left: 2px; }
.sa-del-count { margin-left: auto; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.sa-del-textarea { width: 100%; min-height: 80px; resize: vertical; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md); background: var(--mp-background-neutral, #fff); color: var(--mp-text-default); font-family: inherit; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); }
.sa-del-textarea:focus { outline: none; border-color: var(--mp-border-focus, var(--mp-text-selected)); }
.sa-del-textarea--error { border-color: var(--mp-border-danger, var(--mp-text-danger, #a8352d)); }
.sa-del-error { margin-top: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }
</style>
