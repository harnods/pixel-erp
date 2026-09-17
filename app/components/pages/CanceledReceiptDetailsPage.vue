<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpSpinner, MpIcon, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ActivityLogModal from '~/components/patterns/ActivityLogModal.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { formatDateTime } from '~/utils/date'
import { getReceiptDetail } from '~/data/receiptDetails'
import { receipts } from '~/data/receipts'
import { getPurchaseReceivingsForReceipt } from '~/data/purchaseReceivings'
import { getPutAwayForReceipt } from '~/data/putAwayTasks'

const props = defineProps<{ orderId: string }>()

const router = useRouter()
const { t } = useLocale()
const detail = computed(() => getReceiptDetail(props.orderId))
const activityOpen = ref(false)
const activityEntries = computed(() => {
  const d = detail.value
  if (!d) return []
  return [{
    date: d.lastUpdatedAt,
    user: d.lastUpdatedBy,
    activity: t('Created'),
    details: [
      { label: t('Transaction no.'), value: d.purchaseNo },
      { label: t('Transaction date'), value: formatDateLong(d.transactionDate) },
      { label: t('Vendor'), value: d.vendor ?? '—' },
      { label: t('Warehouse'), value: d.warehouseName },
    ],
  }]
})
const receipt = computed(() => receipts.find((r) => r.id === props.orderId))

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


// ── Jump-to-transaction switcher ───────────────────────────────────────────────
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const all = receipts.filter((r) => r.status === 'canceled')
  const q = jumpSearch.value.trim().toLowerCase()
  const matched = q ? all.filter(r => r.purchaseNo.toLowerCase().includes(q)) : all
  return matched.slice(0, 5)
})
function jumpTo(id: string) { router.push(`/inbound-delivery/${id}`) }

// ── Linked purchase receivings — a canceled PO can still have real receiving
// history (an open task on it is auto-canceled, but an in-progress task with
// real receivedQty stays a record, or an earlier task may have already ended
// before this PO was canceled) — that history must stay visible here. ───────
const linkedReceivings = computed(() => getPurchaseReceivingsForReceipt(props.orderId))
const displayedReceivings = computed(() => linkedReceivings.value)
const linkedPutAways = computed(() => getPutAwayForReceipt(props.orderId))

// ─── Formatters ───────────────────────────────────────────────────────────────
function formatNum(n: number) { return n.toLocaleString('id-ID') }
function formatDateLong(iso?: string) {
  return iso ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—'
}
function formatUpdatedAt(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date}, ${time}`
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
function agingDays(startDate?: string, endDate?: string): number {
  if (!startDate) return 0
  const REF = '2026-06-23'
  const start = new Date(startDate).getTime()
  const end = new Date(endDate ?? REF).getTime()
  const diff = Math.round((end - start) / 86_400_000)
  return Math.max(0, diff) + 1
}

function goBack() { router.push({ path: '/inbound-delivery', query: { tab: 'Receipts' } }) }
</script>

<template>
  <div v-if="detail" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">{{ t('Receipts') }}</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ detail.purchaseNo }}</h1>
          <ErpStatusBadge v-if="receipt" :status="receipt.status" badge-for="additionalInformation" size="md" />
          <MpPopover id="cxd-jump" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <button class="detail-jump-chevron" :aria-label="t('Switch transaction')">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '304px' })">
              <div class="detail-jump">
                <div class="detail-jump-search-wrap">
                  <input v-model="jumpSearch" class="detail-jump-search" type="text" :placeholder="t('Search...')" />
                  <button v-if="jumpSearch" class="search-clear-btn search-clear-btn--overlay" type="button" :aria-label="t('Clear search')" @click="jumpSearch = ''">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                    </svg>
                  </button>
                </div>
                <div class="detail-jump-list">
                  <button v-for="o in jumpResults" :key="o.id" class="detail-jump-item" @click="jumpTo(o.id)">
                    <span class="detail-jump-item-number">{{ o.purchaseNo }}</span>
                    <span class="detail-jump-item-customer">{{ o.warehouseName }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">{{ t('No transactions found') }}</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- ── Header summary (3 columns) ── -->
      <section class="rcd-summary">
        <div class="content-list-col">
          <ContentList :label="t('Transaction date')" :value="formatDateLong(detail.transactionDate)" />
          <ContentList :label="t('Transaction no.')" :value="detail.purchaseNo" />
          <ContentList :label="t('Vendor')" :value="detail.vendor" />
        </div>
        <div class="content-list-col">
          <ContentList :label="t('Estimated arrival date')" :value="formatDateLong(detail.estimatedArrival)" />
          <ContentList :label="t('Ship via')" :value="detail.shipVia" />
          <ContentList :label="t('Tracking no.')" :value="trackingText(detail.trackingNos)" />
          <ContentList :label="t('Warehouse')">
            <div class="wh-link-wrap">
              <a class="cell-link" @click.stop="router.push(`/warehouses/${receipt?.warehouseId}`)">{{ detail.warehouseName }}</a>
            </div>
          </ContentList>
        </div>
        <div class="content-list-col">
          <ContentList :label="t('Canceled date')" :value="receipt?.canceledDate ? `${formatDateLong(receipt.canceledDate)}, ${t('by')} ${receipt.canceledBy ?? '—'}` : '—'" />
          <ContentList :label="t('Reason')" :value="receipt?.canceledReason ?? '—'" />
        </div>
      </section>

      <!-- ── Line items table (purchase qty only — nothing was received) ── -->
      <section class="detail-items-section" :class="{ 'detail-items-section--bordered': isProgressive }">
        <div ref="itemsScrollEl" class="detail-items-scroll">
          <table class="detail-items">
            <colgroup>
              <col />
              <col />
              <col />
              <col />
            </colgroup>
            <thead>
              <tr>
                <th class="detail-th">{{ t('Product') }}</th>
                <th class="detail-th">{{ t('SKU') }}</th>
                <th class="detail-th detail-th--num">{{ t('Purchase qty') }}</th>
                <th class="detail-th">{{ t('Unit') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="it in visibleItems" :key="it.productId" class="detail-item-row">
                <td class="detail-td">
                  <div class="rcd-product">
                    <ProductCell :name="it.productName" :desc="it.productDesc" :image="it.image" />
                  </div>
                </td>
                <td class="detail-td">{{ it.sku }}</td>
                <td class="detail-td detail-td--num">{{ formatNum(it.purchaseQty) }}</td>
                <td class="detail-td">{{ it.unit }}</td>
              </tr>
            </tbody>
          </table>
          <div ref="itemsSentinelEl" class="detail-items-sentinel" aria-hidden="true" />
          <div v-if="loadingMore" class="detail-loading detail-items-loading">
            <MpSpinner size="sm" /> {{ t('Loading products…') }}
          </div>
        </div>
        <div class="detail-items-count">
          <span>{{ t('Showing') }} {{ visibleItems.length }} {{ t('of') }} {{ allItems.length }} {{ t('products') }}</span>
        </div>
      </section>

      <!-- ── Memo + attachment ── -->
      <section class="rcd-notes">
        <ContentList :label="t('Memo')">
          <p class="detail-note-text">{{ detail.memo }}</p>
        </ContentList>
        <ContentList :label="`${t('Attachment')} (${detail.attachments.length})`">
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
      <a class="detail-updated" @click.prevent="activityOpen = true">{{ t('Last updated by') }} {{ detail.lastUpdatedBy }} {{ t('on') }} {{ formatUpdatedAt(detail.lastUpdatedAt) }}</a>

      <!-- ── Receiving only (no put-away tasks) ── -->
      <MpTabs v-if="displayedReceivings.length > 0 && linkedPutAways.length === 0" id="cxd-tabs" :default-value="0" variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab id="cxd-tab-pr" :value="0">{{ t('Purchase receiving') }} ({{ displayedReceivings.length }})</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel :value="0">
            <h3 class="linked-section-title">{{ t('Purchase receiving tasks') }}</h3>
            <div class="detail-linked-wrap">
              <table class="detail-linked">
                <colgroup><col /><col /><col /><col /><col /><col /><col /><col /><col /></colgroup>
                <thead>
                  <tr>
                    <th class="detail-th">{{ t('Number') }}</th>
                    <th class="detail-th">{{ t('Date') }}</th>
                    <th class="detail-th">{{ t('Assignee') }}</th>
                    <th class="detail-th">{{ t('Sku qty') }}</th>
                    <th class="detail-th detail-th--num">{{ t('Expected qty') }}</th>
                    <th class="detail-th detail-th--num">{{ t('Received qty') }}</th>
                    <th class="detail-th">{{ t('Status') }}</th>
                    <th class="detail-th">{{ t('Start date') }}</th>
                    <th class="detail-th">{{ t('End date') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="pr in displayedReceivings" :key="pr.id" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <a class="cell-link linked-num" @click.stop="router.push(`/receiving/${pr.taskId}`)">{{ pr.receivingNo }}</a>
                    </td>
                    <td class="detail-td">{{ formatDateNumeric(pr.date) }}</td>
                    <td class="detail-td">{{ pr.assignee }}</td>
                    <td class="detail-td">{{ pr.skuScope }}</td>
                    <td class="detail-td detail-td--num">{{ formatNum(pr.expectedQty) }}</td>
                    <td class="detail-td detail-td--num">{{ formatNum(pr.receivedQty) }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="pr.status" /></td>
                    <td class="detail-td">{{ pr.startDate ? formatDateTime(pr.startDate) : '—' }}</td>
                    <td class="detail-td">
                      <span class="linked-end">
                        <span v-if="pr.endDate">{{ formatDateTime(pr.endDate) }}</span>
                        <span v-else class="linked-end__muted">—</span>
                        <span v-if="agingDays(pr.startDate, pr.endDate) > 1" class="linked-aging">{{ agingDays(pr.startDate, pr.endDate) }} {{ t('days') }}</span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>

      <!-- ── Receiving + put-away tabs ── -->
      <MpTabs v-else-if="displayedReceivings.length > 0 && linkedPutAways.length > 0" id="cxd-tabs" :default-value="0" variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab id="cxd-tab-pr" :value="0">{{ t('Purchase receiving') }} ({{ displayedReceivings.length }})</MpTab>
          <MpTab id="cxd-tab-pa" :value="1">{{ t('Put-away') }} ({{ linkedPutAways.length }})</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel :value="0">
            <h3 class="linked-section-title">{{ t('Purchase receiving tasks') }}</h3>
            <div class="detail-linked-wrap">
              <table class="detail-linked">
                <colgroup><col /><col /><col /><col /><col /><col /><col /><col /><col /></colgroup>
                <thead>
                  <tr>
                    <th class="detail-th">{{ t('Number') }}</th>
                    <th class="detail-th">{{ t('Date') }}</th>
                    <th class="detail-th">{{ t('Assignee') }}</th>
                    <th class="detail-th">{{ t('Sku qty') }}</th>
                    <th class="detail-th detail-th--num">{{ t('Expected qty') }}</th>
                    <th class="detail-th detail-th--num">{{ t('Received qty') }}</th>
                    <th class="detail-th">{{ t('Status') }}</th>
                    <th class="detail-th">{{ t('Start date') }}</th>
                    <th class="detail-th">{{ t('End date') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="pr in displayedReceivings" :key="pr.id" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <a class="cell-link linked-num" @click.stop="router.push(`/receiving/${pr.taskId}`)">{{ pr.receivingNo }}</a>
                    </td>
                    <td class="detail-td">{{ formatDateNumeric(pr.date) }}</td>
                    <td class="detail-td">{{ pr.assignee }}</td>
                    <td class="detail-td">{{ pr.skuScope }}</td>
                    <td class="detail-td detail-td--num">{{ formatNum(pr.expectedQty) }}</td>
                    <td class="detail-td detail-td--num">{{ formatNum(pr.receivedQty) }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="pr.status" /></td>
                    <td class="detail-td">{{ pr.startDate ? formatDateTime(pr.startDate) : '—' }}</td>
                    <td class="detail-td">
                      <span class="linked-end">
                        <span v-if="pr.endDate">{{ formatDateTime(pr.endDate) }}</span>
                        <span v-else class="linked-end__muted">—</span>
                        <span v-if="agingDays(pr.startDate, pr.endDate) > 1" class="linked-aging">{{ agingDays(pr.startDate, pr.endDate) }} {{ t('days') }}</span>
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </MpTabPanel>
          <MpTabPanel :value="1">
            <h3 class="linked-section-title">{{ t('Put-away tasks') }}</h3>
            <div class="detail-linked-wrap">
              <table class="detail-linked">
                <colgroup><col /><col /><col /><col /><col /><col /><col /></colgroup>
                <thead>
                  <tr>
                    <th class="detail-th">{{ t('Number') }}</th>
                    <th class="detail-th">{{ t('Assignee') }}</th>
                    <th class="detail-th detail-th--num">{{ t('Item qty') }}</th>
                    <th class="detail-th">{{ t('Destination') }}</th>
                    <th class="detail-th">{{ t('Status') }}</th>
                    <th class="detail-th">{{ t('Start date') }}</th>
                    <th class="detail-th">{{ t('End date') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="pa in linkedPutAways" :key="pa.id" class="detail-item-row">
                    <td class="detail-td detail-td--number">
                      <a class="cell-link linked-num" @click.stop="router.push(`/put-away/${pa.id}`)">{{ pa.taskNo }}</a>
                    </td>
                    <td class="detail-td">{{ pa.assignee }}</td>
                    <td class="detail-td detail-td--num">{{ formatNum(pa.itemQty) }}</td>
                    <td class="detail-td">{{ pa.destination }}</td>
                    <td class="detail-td"><ErpStatusBadge :status="pa.status" /></td>
                    <td class="detail-td">{{ pa.startDate ? formatDateTime(pa.startDate) : '—' }}</td>
                    <td class="detail-td">
                      <span class="linked-end">
                        <span v-if="pa.endDate">{{ formatDateTime(pa.endDate) }}</span>
                        <span v-else class="linked-end__muted">—</span>
                        <span v-if="agingDays(pa.startDate, pa.endDate) > 1" class="linked-aging">{{ agingDays(pa.startDate, pa.endDate) }} {{ t('days') }}</span>
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

    <ActivityLogModal
      :is-open="activityOpen"
      :subject="detail.purchaseNo"
      :updated-by="detail.lastUpdatedBy"
      :updated-at="detail.lastUpdatedAt"
      :entries="activityEntries"
      @close="activityOpen = false"
    />
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
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
  cursor: pointer; color: var(--mp-icon-default, var(--mp-text-secondary));
}
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); position: relative; }
.detail-jump-search {
  width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none;
  padding-right: 34px;
}
.detail-jump-search:focus { border-color: var(--mp-border-bold, #8c9596); box-shadow: inset 0 0 0 1px var(--mp-border-bold, #8c9596); }
.detail-jump-search::placeholder { color: var(--mp-text-placeholder); }
.search-clear-btn {
  display: inline-flex; align-items: center; justify-content: center;
  flex-shrink: 0; width: 18px; height: 18px; padding: 0;
  border: none; background: none; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
  border-radius: var(--mp-radii-full, 999px);
}
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered); }
.search-clear-btn--overlay { position: absolute; right: 18px; top: 50%; transform: translateY(-50%); }
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
  display: grid; grid-template-columns: 244px 244px 244px; column-gap: var(--mp-spacing-6); row-gap: 0;
}
.content-list-col { display: flex; flex-direction: column; }

.detail-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.detail-items-section--bordered {
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); overflow: hidden;
}
.detail-items-section--bordered .detail-items-count {
 border-bottom: none;
}
.detail-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.detail-items thead .detail-th { position: sticky; top: 0; z-index: 1; }
.detail-items-sentinel { height: 1px; }
.detail-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.detail-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.detail-items { width: 100%; border-collapse: collapse; table-layout: auto; }
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
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.detail-td--num { text-align: right; white-space: nowrap; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }

.rcd-product { display: flex; align-items: center; gap: var(--mp-spacing-2); min-width: 0; }
.rcd-product-thumb {
  width: 28px; height: 28px; border-radius: var(--mp-radii-sm); flex-shrink: 0;
  object-fit: cover; background: var(--mp-background-neutral); border: 1px solid var(--mp-border-subtle, var(--mp-border-default));
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

.detail-updated { margin: 0; align-self: flex-start; font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer; }
.detail-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

.detail-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap;
}
.detail-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-secondary); }
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }

/* Warehouse header field — name links to the warehouse's own page */
.wh-link-wrap { position: relative; display: inline-flex; align-items: center; }

/* ── Linked transactions (Purchase receiving / Put-away) ─────────────────── */
.detail-tabs { flex-shrink: 0; }
.detail-tabs :deep(.mp-tab--isSelected_true),
.detail-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.detail-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }
.linked-section-title { margin: 0 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.detail-linked-wrap { overflow-x: auto; }
.detail-linked {
  width: 100%; min-width: 1160px; border-collapse: collapse; table-layout: auto;
  border-top: 1px solid var(--mp-border-default);
}
.detail-linked .detail-th { background: var(--mp-background-neutral-subtle); }
.detail-td--number { position: relative; }
.linked-num { color: var(--mp-text-link); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.linked-end { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); }
.linked-end__muted { color: var(--mp-text-secondary); }
.linked-aging {
  display: inline-flex; align-items: center;
  padding: 0 var(--mp-spacing-1\.5); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral-subtle);
  color: var(--mp-text-secondary);
  font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg, 20px); white-space: nowrap;
}
</style>
