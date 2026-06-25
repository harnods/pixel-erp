<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpIcon, MpSpinner, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { getReceiptDetail } from '~/data/receiptDetails'
import { receiptsForStage } from '~/data/receipts'
import { getPurchaseReceivingsForReceipt } from '~/data/purchaseReceivings'

const props = defineProps<{ orderId: string }>()

const router = useRouter()
const detail = computed(() => getReceiptDetail(props.orderId))

const STAFF = ['Budi Santoso', 'Dewi Rahayu', 'Rizki Pratama', 'Agus Firmansyah', 'Sari Indah', 'Hendra Wijaya']

function idSeed(id: string): number {
  return id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
}
const seed = computed(() => idSeed(props.orderId))

function lineIsReceived(index: number): boolean {
  return (seed.value + index) % 3 !== 0
}
function lineReceivedQty(purchaseQty: number, index: number): number {
  return lineIsReceived(index) ? purchaseQty : 0
}
function linePutAwayQty(purchaseQty: number, index: number): number {
  return lineReceivedQty(purchaseQty, index)
}
function lineReceivedBy(index: number): string {
  if (!lineIsReceived(index)) return '—'
  return STAFF[(seed.value + Math.floor(index / 3)) % STAFF.length]
}

// ── Line-items progressive pagination ─────────────────────────────────────────
const PAGE_SIZE = 10
const shownCount = ref(PAGE_SIZE)
const loadingMore = ref(false)
const allItems = computed(() => detail.value?.lineItems ?? [])
const visibleItems = computed(() => allItems.value.slice(0, shownCount.value))
const hasMoreItems = computed(() => shownCount.value < allItems.value.length)
const isProgressive = computed(() => allItems.value.length > PAGE_SIZE)

function loadMoreItems() {
  if (loadingMore.value || !hasMoreItems.value) return
  loadingMore.value = true
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, allItems.value.length)
    loadingMore.value = false
  }, 500)
}

const itemsScrollEl = ref<HTMLElement | null>(null)
const itemsSentinelEl = ref<HTMLElement | null>(null)
let itemsObserver: IntersectionObserver | null = null
function setupItemsObserver() {
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
watch(() => props.orderId, () => {
  shownCount.value = PAGE_SIZE
  loadingMore.value = false
  nextTick(() => {
    if (itemsScrollEl.value) itemsScrollEl.value.scrollTop = 0
    setupItemsObserver()
  })
})

// ── Footer divider only when stage overflows ───────────────────────────────────
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

// ── Jump-to-transaction switcher ───────────────────────────────────────────────
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const all = receiptsForStage('Completed')
  const q = jumpSearch.value.trim().toLowerCase()
  const matched = q ? all.filter(r => r.purchaseNo.toLowerCase().includes(q)) : all
  return matched.slice(0, 5)
})
function jumpTo(id: string) { router.push(`/barang-masuk/${id}`) }

// ─── Formatters ───────────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }
function formatDateLong(iso?: string) {
  return iso ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—'
}
function formatUpdatedAt(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date}, ${time} (GMT+7)`
}
function attachmentIcon(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image-document'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel-document'
  if (['doc', 'docx'].includes(ext)) return 'word-document'
  return 'attachment'
}
function trackingText(nos: string[]) { return nos.length ? nos.join(', ') : '—' }
function formatDateNumeric(iso?: string) {
  return iso ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso)) : '—'
}

// ── Linked purchase receivings ─────────────────────────────────────────────────
const linkedReceivings = computed(() => getPurchaseReceivingsForReceipt(props.orderId))

function agingDays(startDate?: string, endDate?: string): number {
  if (!startDate) return 0
  const ref = endDate ? new Date(endDate) : new Date('2026-06-23')
  const start = new Date(startDate)
  return Math.max(0, Math.round((ref.getTime() - start.getTime()) / 86400000) + 1)
}

function goBack() { router.push({ path: '/barang-masuk', query: { tab: 'Completed' } }) }
</script>

<template>
  <div v-if="detail" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">Completed</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ detail.purchaseNo }}</h1>
          <MpPopover id="cod-jump" use-portal :is-keep-alive="false" placement="bottom-start">
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
                  <button v-for="o in jumpResults" :key="o.id" class="detail-jump-item" @click="jumpTo(o.id)">
                    <span class="detail-jump-item-number">{{ o.purchaseNo }}</span>
                    <span class="detail-jump-item-customer">{{ o.warehouseName }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">No transactions found.</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div ref="stageEl" class="detail-stage">

      <!-- ── Header summary (2 columns) ── -->
      <section class="rcd-summary">
        <div class="content-list-col">
          <ContentList label="Transaction date" :value="formatDateLong(detail.transactionDate)" />
          <ContentList label="Transaction no." :value="detail.purchaseNo" />
          <ContentList label="Vendor" :value="detail.vendor" />
        </div>
        <div class="content-list-col">
          <ContentList label="Estimated arrival date" :value="formatDateLong(detail.estimatedArrival)" />
          <ContentList label="Ship via" :value="detail.shipVia" />
          <ContentList label="Tracking no." :value="trackingText(detail.trackingNos)" />
          <ContentList label="Warehouse" :value="detail.warehouseName" />
        </div>
      </section>

      <!-- ── Line items table ── -->
      <section class="detail-items-section" :class="{ 'detail-items-section--bordered': isProgressive }">
        <div ref="itemsScrollEl" class="detail-items-scroll">
          <table class="detail-items">
            <colgroup>
              <col style="width: 220px" />
              <col style="width: 140px" />
              <col style="width: 140px" />
              <col style="width: 140px" />
              <col style="width: 140px" />
              <col style="width: 80px" />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th class="detail-th">Product</th>
                <th class="detail-th">SKU</th>
                <th class="detail-th detail-th--num">Purchase qty</th>
                <th class="detail-th detail-th--num">Received qty</th>
                <th class="detail-th detail-th--num">Put-away qty</th>
                <th class="detail-th">Unit</th>
                <th class="detail-th">Received by</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(it, idx) in visibleItems" :key="it.productId" class="detail-item-row">
                <td class="detail-td">
                  <div class="rcd-product">
                    <img class="rcd-product-thumb" :src="it.image" :alt="it.productName" loading="lazy" width="28" height="28" />
                    <span class="rcd-product-name" :title="it.productName">{{ it.productName }}</span>
                  </div>
                </td>
                <td class="detail-td">{{ it.sku }}</td>
                <td class="detail-td detail-td--num">{{ formatNum(it.purchaseQty) }}</td>
                <td class="detail-td detail-td--num">{{ formatNum(lineReceivedQty(it.purchaseQty, idx)) }}</td>
                <td class="detail-td detail-td--num">{{ formatNum(linePutAwayQty(it.purchaseQty, idx)) }}</td>
                <td class="detail-td">{{ it.unit }}</td>
                <td class="detail-td">{{ lineReceivedBy(idx) }}</td>
              </tr>
            </tbody>
          </table>
          <div ref="itemsSentinelEl" class="detail-items-sentinel" aria-hidden="true" />
          <div v-if="loadingMore" class="detail-loading detail-items-loading">
            <MpSpinner size="sm" /> Loading products…
          </div>
        </div>
        <div class="detail-items-count">
          <span>Showing {{ visibleItems.length }} of {{ allItems.length }} products</span>
        </div>
      </section>

      <!-- ── Memo + attachment ── -->
      <section class="rcd-notes">
        <ContentList label="Memo">
          <p class="detail-note-text">{{ detail.memo }}</p>
        </ContentList>
        <ContentList :label="`Attachment (${detail.attachments.length})`">
          <div v-if="detail.attachments.length" class="detail-attach-list">
            <a v-for="(a, i) in detail.attachments" :key="i" class="detail-attach" @click.prevent>
              <span class="detail-attach-icon"><MpIcon :name="attachmentIcon(a.name)" size="md" /></span>
              <span class="detail-attach-meta">
                <span class="detail-attach-name">{{ a.name }}</span>
                <span class="detail-attach-size">{{ a.sizeKB.toFixed(1) }} KB</span>
              </span>
            </a>
          </div>
          <template v-else>—</template>
        </ContentList>
      </section>

      <!-- Last updated -->
      <a class="detail-updated" @click.prevent>Last updated by {{ detail.lastUpdatedBy }} on {{ formatUpdatedAt(detail.lastUpdatedAt) }}</a>

      <!-- ── Linked purchase receivings tab ── -->
      <MpTabs id="cod-tabs" :default-value="0" variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab id="cod-tab-pr" :value="0">Purchase receiving ({{ linkedReceivings.length }})</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel :value="0">
            <div class="detail-linked-wrap">
              <table class="detail-linked">
                <colgroup>
                  <col style="width: 148px" />
                  <col style="width: 100px" />
                  <col style="width: 160px" />
                  <col style="width: 120px" />
                  <col style="width: 110px" />
                  <col style="width: 110px" />
                  <col style="width: 120px" />
                  <col style="width: 100px" />
                  <col style="width: 100px" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="detail-th">Number</th>
                    <th class="detail-th">Date</th>
                    <th class="detail-th">Assignee</th>
                    <th class="detail-th">SKU scope</th>
                    <th class="detail-th detail-th--num">Purchase qty</th>
                    <th class="detail-th detail-th--num">Received qty</th>
                    <th class="detail-th">Status</th>
                    <th class="detail-th">Start date</th>
                    <th class="detail-th">End date</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="pr in linkedReceivings" :key="pr.id" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <div class="cell-with-action">
                        <span class="linked-num">{{ pr.receivingNo }}</span>
                        <button class="row-hover-btn">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                            <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                            <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                          </svg>
                          <span class="row-hover-btn__label">VIEW DETAILS</span>
                        </button>
                      </div>
                    </td>
                    <td class="detail-td">{{ formatDateNumeric(pr.date) }}</td>
                    <td class="detail-td">{{ pr.assignee }}</td>
                    <td class="detail-td">{{ pr.skuScope }}</td>
                    <td class="detail-td detail-td--num">{{ formatNum(pr.purchaseQty) }}</td>
                    <td class="detail-td detail-td--num">{{ formatNum(pr.receivedQty) }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="pr.status" /></td>
                    <td class="detail-td">{{ pr.startDate ? formatDateNumeric(pr.startDate) : '—' }}</td>
                    <td class="detail-td">
                      <span class="linked-end">
                        <span v-if="pr.endDate">{{ formatDateNumeric(pr.endDate) }}</span>
                        <span v-else class="linked-end__muted">—</span>
                        <span v-if="agingDays(pr.startDate, pr.endDate) > 1" class="linked-aging">{{ agingDays(pr.startDate, pr.endDate) }} days</span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>

    </div><!-- /detail-stage -->

    <!-- ── Footer — Print only ── -->
    <div class="detail-footer" :class="{ 'detail-footer--floating': stageOverflowing }">
      <MpPopover id="cod-print" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
        <MpPopoverTrigger>
          <button class="detail-btn detail-btn--secondary">
            Print
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </MpPopoverTrigger>
        <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
          <MpPopoverList>
            <MpPopoverListItem>Print PDF</MpPopoverListItem>
            <MpPopoverListItem>Print dot matrix</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </div>

  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; min-width: 0; }
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
.detail-jump-chevron {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  background: none; border: none; padding: 0; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); }
.detail-jump-search {
  width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none;
}
.detail-jump-search:focus { border-color: var(--mp-border-brand-bold, #029861); }
.detail-jump-search::placeholder { color: var(--mp-text-placeholder); }
.detail-jump-list { display: flex; flex-direction: column; }
.detail-jump-item {
  display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); width: 100%; text-align: left;
  background: none; border: none; cursor: pointer; padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md);
}
.detail-jump-item:hover { background: var(--mp-background-neutral-subtle); }
.detail-jump-item-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-customer { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8);
}

.rcd-summary {
  display: grid; grid-template-columns: 244px 244px; column-gap: var(--mp-spacing-6); row-gap: 0;
}
.content-list-col { display: flex; flex-direction: column; }

.detail-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.detail-items-section--bordered {
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); overflow: hidden;
}
.detail-items-section--bordered .detail-items-count {
  border-top: 1px solid var(--mp-border-default); border-bottom: none;
}
.detail-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: hidden; }
.detail-items thead .detail-th { position: sticky; top: 0; z-index: 1; }
.detail-items-sentinel { height: 1px; }
.detail-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.detail-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.detail-items { width: 100%; border-collapse: collapse; table-layout: fixed; }
.detail-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.detail-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.detail-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
}
.detail-td--num { text-align: right; white-space: nowrap; padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4); }
.detail-items-section--bordered .detail-item-row:last-child .detail-td { border-bottom: none; }

.rcd-product { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.rcd-product-thumb {
  width: 28px; height: 28px; border-radius: var(--mp-radii-sm); flex-shrink: 0;
  object-fit: cover; background: var(--mp-background-neutral); border: 1px solid var(--mp-border-subtle);
}
.rcd-product-name {
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.detail-items-count {
  display: flex; align-items: center; margin: 0;
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default);
}

.rcd-notes { display: flex; flex-direction: column; }
.detail-note-text {
  margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px);
  color: var(--mp-text-default); white-space: pre-line;
}
.detail-attach-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.detail-attach { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); cursor: pointer; width: fit-content; }
.detail-attach-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.detail-attach-meta { display: flex; flex-direction: column; }
.detail-attach-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.detail-attach:hover .detail-attach-name { text-decoration: underline; text-underline-offset: 2px; }
.detail-attach-size { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.detail-updated { margin: 0; align-self: flex-start; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer; }
.detail-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Linked purchase receivings tab ── */
.detail-tabs { flex-shrink: 0; }
.detail-tabs :deep(.mp-tab--isSelected_true),
.detail-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.detail-tabs :deep(.mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }
.detail-linked-wrap { overflow-x: auto; }
.detail-linked { width: 100%; min-width: 1160px; border-collapse: collapse; table-layout: fixed; border-top: 1px solid var(--mp-border-default); }
.detail-linked .detail-th { background: var(--mp-background-neutral-subtle); }
.detail-linked .detail-item-row:last-child .detail-td { border-bottom: none; }
.detail-td--number { position: relative; }
.cell-with-action { display: flex; align-items: center; width: 100%; min-width: 0; }
.linked-num { color: var(--mp-text-link); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.row-hover-btn {
  position: absolute; right: var(--mp-spacing-2); top: 50%; transform: translateY(-50%); display: none;
  align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1;
}
.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase;
}
.detail-item-row:hover .row-hover-btn { display: flex; }
.linked-end { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.linked-end__muted { color: var(--mp-text-secondary); }
.linked-aging { display: inline-flex; align-items: center; padding: 0 var(--mp-spacing-1\.5); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary); font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 20px); white-space: nowrap; }

.detail-footer {
  flex-shrink: 0;
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-top: 1px solid transparent;
}
.detail-footer--floating { border-top-color: var(--mp-border-default); }
.detail-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap;
}
.detail-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-secondary); }
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
</style>
