<!-- prod-parity-aligned: jurnal-transaction-frontend/src/modules/sales/deliveries/views/SalesDeliveryShowView.vue -->
<script setup lang="ts">
import { infoToast } from '~/utils/toasts'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTooltip, MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpIcon, MpSpinner, MpButton, MpTextlink, toast, css,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ActivityLogModal from '~/components/patterns/ActivityLogModal.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { getSalesDeliveryDetail } from '~/data/salesDeliveryDetails'
import { salesDeliveries } from '~/data'
import { isInClosedPeriod } from '~/data/salesDeliveries'
import { lockDate } from '~/data/closeBooks'

const props = defineProps<{ orderId: string }>()

const { t } = useLocale()

// Info banner temporarily hidden in the prototype (toggle back on when ready)
const showBanner = false

// Title-bar icon actions (Task + Comment) only when the page has an approval flow.
// Whether a module has approval is a per-module question — ask when generating.
const hasApproval = true

const router = useRouter()
function notInPrototype() { infoToast(t('Not in this prototype')) }

/** R-19 — a delivery inside a closed accounting period is not editable, and the
 *  option is not offered at all (PRD UX flow), rather than offered and refused. */
const editLocked = computed(() => !!delivery.value && isInClosedPeriod(delivery.value, lockDate()))
const delivery = computed(() => getSalesDeliveryDetail(props.orderId))

const activityOpen = ref(false)
// Destructive delete → confirm modal (rule/btn-danger-confirm)
const deleteOpen = ref(false)
function confirmDelete() {
  toast.notify({ variant: 'success', title: t('Delivery deleted successfully'), rootProps: { class: 'toast-enterprise' } })
  router.push('/sales-deliveries')
}
const activityEntries = computed(() => [{
  date: delivery.value.lastUpdatedAt,
  user: delivery.value.lastUpdatedBy,
  activity: t('Created'),
  details: [
    { label: t('Transaction no.'), value: `${t('Sales Delivery')} #${delivery.value.number}` },
    { label: t('Transaction date'), value: formatDateLong(delivery.value.date) },
    { label: t('Customer'), value: delivery.value.customer.name },
    { label: t('Warehouse'), value: delivery.value.warehouse },
  ],
}])

// ── Line-items progressive pagination (auto lazy-load on scroll) ───────────────
const PAGE_SIZE = 10
const shownCount = ref(PAGE_SIZE)               // show 10 by default
const loadingMore = ref(false)
const visibleItems = computed(() => delivery.value.lineItems.slice(0, shownCount.value))

/**
 * TS-001 — the audit trail. A contract delivery shows how each quantity was
 * arrived at: the input method and the figure typed, the derived quantity, and
 * how far the order line stood once this delivery posted. Generated deliveries
 * have no order line behind them, so their table stays as it was.
 */
const hasAudit = computed(() => delivery.value.lineItems.some(it => !!it.audit))
/** Six decimals at most, trailing zeros trimmed, decimal comma — as entered. */
function formatQty(n: number): string {
  return n.toLocaleString('id-ID', { minimumFractionDigits: 0, maximumFractionDigits: 6 })
}
function formatPct(n: number): string {
  return `${n.toLocaleString('id-ID', { maximumFractionDigits: 2 })}%`
}
function methodLabel(it: (typeof delivery.value.lineItems)[number]): string {
  const a = it.audit
  if (!a) return ''
  return a.inputMode === 'percent' ? `${t('Percentage')} (${formatPct(a.inputValue)})` : t('Quantity')
}
function cumulativeLabel(it: (typeof delivery.value.lineItems)[number]): string {
  const a = it.audit
  return a && a.orderedQty > 0 ? formatPct((a.cumulativeQty / a.orderedQty) * 100) : ''
}
const hasMoreItems = computed(() => shownCount.value < delivery.value.lineItems.length)
// progressive pagination kicks in past the default page → the table becomes a
// bordered, internally-scrolling panel
const isProgressive = computed(() => delivery.value.lineItems.length > PAGE_SIZE)

function loadMoreItems() {
  if (loadingMore.value || !hasMoreItems.value) return
  loadingMore.value = true
  // brief loading state before the next batch appends
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, delivery.value.lineItems.length)
    loadingMore.value = false
  }, 500)
}

// Auto-load the next batch when the user scrolls near the bottom of the table
// (IntersectionObserver on a sentinel inside the table's own scroll container).
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

// ── Jump-to-transaction switcher (title-bar chevron) ───────────────────────────
const jumpSearch = ref('')
const jumpResults = computed(() => {
  const recent = [...salesDeliveries].sort((a, b) => b.date.localeCompare(a.date))   // most recent first
  const q = jumpSearch.value.trim().toLowerCase()
  const matched = q
    ? recent.filter(o => String(o.number).includes(q) || o.customer.name.toLowerCase().includes(q))
    : recent
  return matched.slice(0, 5)   // 5 most recent (or top 5 matches)
})
function jumpTo(id: string) { router.push('/sales-deliveries/' + id) }

// ─── Formatters ───────────────────────────────────────────────────────────────
/** Parenthesised deduction, e.g. (Rp100.000,00); plain Rp0,00 for zero. */
function formatDeduction(amount: number) {
  return amount > 0 ? `(${formatIDR(amount)})` : formatIDR(0)
}
function formatDateLong(iso: string) {
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso))
}
function formatDateNumeric(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(iso))
}
function formatUpdatedAt(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date}, ${time}`
}

function discountText(pct: number) { return pct > 0 ? `${pct}%` : '' }

/** File-type → Pixel document icon for an attachment. */
function attachmentIcon(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(ext)) return 'image-document'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel-document'
  if (['doc', 'docx'].includes(ext)) return 'word-document'
  return 'attachment'
}

function goBack() { router.push('/sales-deliveries') }
</script>

<template>
  <div class="detail-page">

    <!-- ── Title bar (breadcrumb + title + status dropdown + icon actions) ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpTextlink id="detail-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="goBack">{{ t('Sales deliveries') }}</MpTextlink>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('Sales Delivery') }} #{{ delivery.number }}</h1>
          <ErpStatusBadge :status="delivery.fulfillmentStatus" badge-for="additionalInformation" size="md" />
          <ErpStatusBadge :status="delivery.billingStatus" badge-for="additionalInformation" size="md" />

          <!-- Chevron → jump-to-transaction switcher (search + 5 recent) -->
          <MpPopover id="detail-jump" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <MpButton class="detail-jump-chevron" :aria-label="t('Switch transaction')">
                <MpIcon name="chevrons-down" size="sm" />
              </MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ width: '304px' })">
              <div class="detail-jump">
                <div class="detail-jump-search-wrap">
                  <input
                    v-model="jumpSearch"
                    class="detail-jump-search"
                    type="text"
                    :placeholder="t('Search...')"
                  />
                  <MpButton v-if="jumpSearch" class="search-clear-btn search-clear-btn--overlay" :aria-label="t('Clear search')" @click="jumpSearch = ''">
                    <MpIcon name="close" size="sm" />
                  </MpButton>
                </div>
                <div class="detail-jump-list">
                  <button
                    v-for="o in jumpResults"
                    :key="o.id"
                    class="detail-jump-item"
                    @click="jumpTo(o.id)"
                  >
                    <span class="detail-jump-item-number">{{ t('Sales Delivery') }} #{{ o.number }}</span>
                    <span class="detail-jump-item-customer">{{ o.customer.name }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">{{ t('No transactions found') }}</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <!-- Right-side icon actions — only when the page has an approval flow -->
      <div v-if="hasApproval" class="detail-titlerow-right">
          <MpTooltip id="detail-tt-tasks" :label="t('Approval log')" placement="bottom" use-portal>
            <MpButton class="detail-icon-btn" :aria-label="t('Approval log')">
              <MpIcon name="task-todo" size="md" />
            </MpButton>
          </MpTooltip>
          <MpTooltip id="detail-tt-comments" :label="t('Comments')" placement="bottom" use-portal>
            <MpButton class="detail-icon-btn" :aria-label="t('Comments')">
              <MpIcon name="comment" size="md" />
            </MpButton>
          </MpTooltip>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- Info banner (conditional) — temporarily hidden in the prototype -->
      <div v-if="showBanner && delivery.banner" class="detail-banner">
        <MpIcon class="detail-banner-icon" name="info" size="md" />
        <span class="detail-banner-text">{{ delivery.banner.message }}</span>
        <a class="detail-banner-link" @click.prevent>{{ delivery.banner.linkLabel }}</a>
      </div>

      <!-- ── Header summary ── -->
      <section class="detail-summary">
        <!-- Primary row: shares the header grid (col 1 = 318px) + emphasised Total -->
        <div class="content-list-grid">
          <div class="content-list-col">
            <ContentList :label="t('Customer')" :value="delivery.customer.name" />
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Email')">
              <span v-for="(e, i) in delivery.email" :key="i" class="content-list__line">{{ e }}</span>
            </ContentList>
          </div>
          <div class="detail-primary-total">
            <a class="detail-journal-link" @click.prevent="notInPrototype">{{ t('View journal entry') }}</a>
          </div>
        </div>

        <div class="detail-divider" />

        <!-- Detail grid: col 1 = 318px, col 2+ fill equally (max 5 cols) -->
        <div class="content-list-grid">
          <!-- col 1: ship-to address (prod SalesDeliveryDetailFields) -->
          <div class="content-list-col">
            <ContentList :label="t('Ship to')" :value="delivery.shipTo" />
          </div>
          <!-- col 2: shipping -->
          <div class="content-list-col">
            <ContentList :label="t('Ship date')" :value="formatDateLong(delivery.date)" />
            <ContentList :label="t('Ship via')" :value="delivery.shipVia" />
            <ContentList :label="t('Tracking no.')" :value="delivery.trackingNo" />
            <ContentList :label="t('Driver')" :value="delivery.driver" />
          </div>
          <!-- col 4: references -->
          <div class="content-list-col">
            <ContentList :label="t('Transaction no.')" :value="`${t('Sales Delivery')} #${delivery.number}`" />
            <ContentList :label="t('Reference no.')" :value="delivery.referenceNo" />
            <ContentList :label="t('Warehouse')" :value="delivery.warehouse" />
          </div>
          <!-- col 5: tags -->
          <div class="content-list-col">
            <ContentList :label="t('Tags')">
              <ErpTagList v-if="delivery.tags?.length" :tags="delivery.tags" />
              <template v-else>—</template>
            </ContentList>
          </div>
        </div>
      </section>

      <!-- ── Line items table (read-only) — auto lazy-load, internal scroll ── -->
      <section class="detail-items-section" :class="{ 'detail-items-section--bordered': isProgressive }">
        <div ref="itemsScrollEl" class="detail-items-scroll">
        <table class="detail-items">
          <thead>
            <tr>
              <th class="detail-th">{{ t('Product') }}</th>
              <th class="detail-th">{{ t('Description') }}</th>
              <th v-if="hasAudit" class="detail-th">{{ t('Input method') }}</th>
              <th class="detail-th detail-th--num">{{ t('Delivered qty') }}</th>
              <th class="detail-th">{{ t('Unit') }}</th>
              <th v-if="hasAudit" class="detail-th detail-th--num">{{ t('Cumulative') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(it, i) in visibleItems" :key="i" class="detail-item-row">
              <td class="detail-td">
                <div class="cell-with-action">
                  <span class="detail-item-primary">
                    <a class="cell-link detail-item-name" @click.stop>{{ it.product }}</a>
                    <span class="detail-item-sku">{{ t('SKU') }}: {{ it.sku }}</span>
                  </span>
                </div>
              </td>
              <td class="detail-td detail-td--muted">{{ it.description }}</td>
              <!-- What was typed: "Percentage (33%)", or Quantity when the figure IS the qty. -->
              <td v-if="hasAudit" class="detail-td">{{ methodLabel(it) }}</td>
              <td class="detail-td detail-td--num">{{ formatQty(it.qty) }}</td>
              <td class="detail-td">{{ it.unit }}</td>
              <!-- The order line's progress once THIS delivery posted, not today's. -->
              <td v-if="hasAudit" class="detail-td detail-td--num">{{ cumulativeLabel(it) }}</td>
            </tr>
          </tbody>
        </table>
          <!-- sentinel observed for auto lazy-load + inline loading row -->
          <div ref="itemsSentinelEl" class="detail-items-sentinel" aria-hidden="true" />
          <div v-if="loadingMore" class="detail-loading detail-items-loading">
            <MpSpinner size="sm" /> {{ t('Loading items…') }}
          </div>
        </div>
        <div class="detail-items-count">
          <span>{{ t('Showing') }} {{ visibleItems.length }} {{ t('of') }} {{ delivery.lineItems.length }} {{ t('products') }}</span>
        </div>
      </section>

      <!-- ── Notes + totals ── -->
      <section class="detail-notes">
        <!-- Left: message / memo / attachment -->
        <div class="detail-notes-left">
          <ContentList :label="t('Message')">
            <p class="detail-note-text">{{ delivery.message }}</p>
          </ContentList>
          <ContentList :label="t('Memo')">
            <p class="detail-note-text">{{ delivery.memo }}</p>
          </ContentList>
          <ContentList :label="`${t('Attachments')} (${delivery.attachments.length})`">
            <div class="detail-attach-list">
              <a v-for="(a, i) in delivery.attachments" :key="i" class="detail-attach" @click.prevent>
                <span class="detail-attach-icon"><MpIcon :name="attachmentIcon(a.name)" size="md" /></span>
                <span class="detail-attach-meta">
                  <span class="detail-attach-name">{{ a.name }}</span>
                  <span class="detail-attach-size">{{ a.sizeKB.toFixed(1) }} KB</span>
                </span>
              </a>
            </div>
          </ContentList>
        </div>

        <!-- Right: shipping fee only — a delivery carries no prices (prod SalesDeliveryShippingFee) -->
        <div class="detail-totals">
          <div class="detail-total-row">
            <span class="detail-total-row-label">{{ t('Shipping fee') }}</span>
            <span class="detail-total-row-amt">{{ formatIDR(delivery.totals.shippingFee) }}</span>
          </div>
        </div>
      </section>

      <!-- Last updated -->
      <a class="detail-updated" @click.prevent="activityOpen = true">{{ t('Last updated by') }} {{ delivery.lastUpdatedBy }} {{ t('on') }} {{ formatUpdatedAt(delivery.lastUpdatedAt) }}</a>

      <!-- ── Tabs ── -->
      <MpTabs id="detail-tabs" :default-value="0" variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab id="detail-tab-linked" value="linked">{{ t('Linked transactions') }}</MpTab>
        </MpTabList>
        <MpTabPanels>
          <MpTabPanel value="linked">
            <h3 class="detail-tab-heading">{{ t('Transactions') }}</h3>
            <table class="detail-linked">
              <colgroup>
                <col class="detail-linked-col--date" />
                <col class="detail-linked-col--number" />
                <col class="detail-linked-col--status" />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th class="detail-th">{{ t('Date') }}</th>
                  <th class="detail-th">{{ t('Number') }}</th>
                  <th class="detail-th">{{ t('Status') }}</th>
                  <th class="detail-th" aria-hidden="true"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-if="!delivery.linkedTransactions.length">
                  <td class="detail-td detail-td--muted" colspan="4">{{ t('No linked transactions') }}</td>
                </tr>
                <tr v-for="(txn, i) in delivery.linkedTransactions" :key="i" class="detail-item-row">
                  <td class="detail-td">{{ formatDateNumeric(txn.date) }}</td>
                  <td class="detail-td">
                    <a class="cell-link cell-text" @click.stop>{{ txn.type }} {{ txn.number }}</a>
                  </td>
                  <td class="detail-td"><ErpStatusBadge :status="txn.status" /></td>
                  <td class="detail-td"></td>
                </tr>
              </tbody>
            </table>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>

      <!-- ── Footer action bar ── -->
      <div class="detail-footer">
        <!-- Print & share (secondary dropdown) — prod SalesDeliveryFooterActions -->
        <MpPopover id="detail-print-share" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
          <MpPopoverTrigger>
            <button class="btn-enterprise btn-enterprise--secondary">
              {{ t('Print & share') }}
              <MpIcon name="chevrons-down" size="sm" />
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="notInPrototype">{{ t('Print PDF') }}</MpPopoverListItem>
              <MpPopoverListItem @click="notInPrototype">{{ t('Print dot matrix') }}</MpPopoverListItem>
              <MpPopoverListItem @click="notInPrototype">{{ t('Share via email') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <!-- Unbilled: "Create sales invoice" primary split button; invoiced: plain Actions dropdown -->
        <div v-if="delivery.billingStatus === 'unbilled'" class="detail-split-btn">
          <button class="btn-enterprise btn-enterprise--primary detail-split-btn__main" @click="router.push('/sales-invoices/new')">
            {{ t('Create sales invoice') }}
          </button>
          <MpPopover id="detail-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
            <MpPopoverTrigger>
              <button class="btn-enterprise btn-enterprise--primary detail-split-btn__chevron" :aria-label="t('More actions')">
                <MpIcon name="chevrons-down" size="sm" />
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="notInPrototype">{{ t('Preview') }}</MpPopoverListItem>
              </MpPopoverList>
              <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
              <MpPopoverList>
                <MpPopoverListItem v-if="!editLocked" @click="router.push(`/sales-deliveries/${delivery.id}/edit`)">{{ t('Edit') }}</MpPopoverListItem>
                <MpPopoverListItem @click="notInPrototype">{{ t('Void') }}</MpPopoverListItem>
              </MpPopoverList>
              <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
              <MpPopoverList>
                <MpPopoverListItem @click="deleteOpen = true">{{ t('Delete') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
        <MpPopover v-else id="detail-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
          <MpPopoverTrigger>
            <button class="btn-enterprise btn-enterprise--primary">
              {{ t('Actions') }}
              <MpIcon name="chevrons-down" size="sm" />
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem @click="notInPrototype">{{ t('Preview') }}</MpPopoverListItem>
            </MpPopoverList>
            <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
            <MpPopoverList>
              <MpPopoverListItem v-if="!editLocked" @click="router.push(`/sales-deliveries/${delivery.id}/edit`)">{{ t('Edit') }}</MpPopoverListItem>
              <MpPopoverListItem @click="notInPrototype">{{ t('Void') }}</MpPopoverListItem>
            </MpPopoverList>
            <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
            <MpPopoverList>
              <MpPopoverListItem @click="deleteOpen = true">{{ t('Delete') }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>

    </div><!-- /detail-stage -->

    <ActivityLogModal
      :is-open="activityOpen"
      :subject="`${t('Sales Delivery')} #${delivery.number}`"
      :updated-by="delivery.lastUpdatedBy"
      :updated-at="delivery.lastUpdatedAt"
      :entries="activityEntries"
      @close="activityOpen = false"
    />

    <ConfirmModal
      v-model:is-open="deleteOpen"
      :title="t('Delete delivery')"
      :description="t('Are you sure you want to delete this delivery? This action cannot be undone.')"
      :confirm-label="t('Delete')"
      @confirm="confirmDelete"
    />
  </div>
</template>

<style scoped>
.detail-split-btn {
  display: inline-flex;
  align-items: stretch;
}
.detail-split-btn__main {
  border-radius: var(--mp-radii-full, 999px) 0 0 var(--mp-radii-full, 999px);
}
.detail-split-btn__chevron {
  padding-left: var(--mp-spacing-3);
  padding-right: var(--mp-spacing-3);
  border-radius: 0 var(--mp-radii-full, 999px) var(--mp-radii-full, 999px) 0;
  border-left: 1px solid rgba(255, 255, 255, 0.3);
}

.detail-journal-link { font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); cursor: pointer; }
.detail-journal-link:hover { text-decoration: underline; }
.detail-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* ── Title bar ── */
.detail-bar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);   /* page title bar is always 72px */
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle);
  padding: 0 var(--mp-spacing-6);
  display: flex;
  flex-direction: row;
  align-items: center;                /* icon actions vertically centred to the 72px bar */
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
/* left stack: breadcrumb directly above the title — no gap */
.detail-bar-left {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0;
  min-width: 0;
}
.detail-breadcrumb {
  align-self: flex-start;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-link);
  line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-3);
}
.detail-title {
  margin: 0;
  font-size: var(--mp-font-sizes-2xl);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xl, 32px);
  letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default);
}
/* chevron next to the badge → jump-to-transaction switcher */
.detail-jump-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-7, 28px);
  height: var(--mp-sizes-7, 28px);
  background: none;
  border: none;
  padding: 0;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
}
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }

/* jump-to popover (304px): search on top (280px input, 12px padding), 5 recent below */
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); position: relative; }   /* 12px around the search */
.detail-jump-search {
  width: 100%;        /* = 280px inside the 304px popover minus 12px padding each side */
  box-sizing: border-box;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  outline: none;
  padding-right: 34px;
}
.detail-jump-search:focus { border-color: var(--mp-colors-border-bold, #8c9596); box-shadow: inset 0 0 0 1px var(--mp-colors-border-bold, #8c9596); outline: none; }
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
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-0\.5);
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  cursor: pointer;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-radius: var(--mp-radii-md);
}
.detail-jump-item:hover { background: var(--mp-background-neutral-subtle); }
.detail-jump-item-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-customer { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty {
  margin: 0;
  padding: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.detail-titlerow-right {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-1);
}
.detail-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px);
  height: var(--mp-sizes-9, 36px);
  border-radius: var(--mp-radii-md);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
}
.detail-icon-btn:hover { background: var(--mp-background-neutral-hovered); }

/* ── Stage ── */
.detail-stage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--mp-background-stage);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  /* fixed 24px top border keeps content off the stage's top edge while scrolling */
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-8);   /* 32px between every region (transaction detail pages) */
}

/* ── Info banner ── */
.detail-banner {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-information, #e8f1ff);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.detail-banner-icon { color: var(--mp-icon-information, #1d6fdc); flex-shrink: 0; }
.detail-banner-text { flex: 1; }
.detail-banner-link {
  color: var(--mp-text-link);
  cursor: pointer;
  font-weight: var(--mp-font-weights-semi-bold);
}
.detail-banner-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Header summary ── */
.detail-summary { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
/* emphasised Total sits in the last columns of the primary grid, top- & right-aligned */
.detail-primary-total {
  grid-column: 3 / -1;
  justify-self: end;
  align-self: start;
  padding-top: var(--mp-spacing-2);   /* matches ContentList top padding → aligns with the labels */
  display: flex;
  align-items: baseline;
  gap: var(--mp-spacing-2);
}
.detail-total-label {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.detail-total-amount {
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

/* dashed rule between header 1 (primary row) and header 2 (detail grid): 4px dash / 4px gap */
.detail-divider {
  height: var(--mp-sizes-px, 1px);
  background: repeating-linear-gradient(
    to right,
    var(--mp-border-default) 0,
    var(--mp-border-default) 4px,
    transparent 4px,
    transparent 8px
  );
}

/* Detail grid: col 1 = 318px (shrinks proportionally when tight), col 2+ fill
   equally. Column gap 24px; no row gap — ContentList self-pads (8px top/bottom). */
.content-list-grid {
  display: grid;
  grid-template-columns: minmax(0, 318px) repeat(4, minmax(0, 1fr));
  column-gap: var(--mp-spacing-6);
  row-gap: 0;
}
/* no gap between fields in a column — spacing comes from ContentList padding */
.content-list-col { display: flex; flex-direction: column; }

/* ── Line items table ── */
.detail-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
/* progressive case → contained panel with a 1px bold outer border */
.detail-items-section--bordered {
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  overflow: hidden;
}
.detail-items-section--bordered .detail-items-count {
  border-bottom: none;
}
/* table scrolls internally past ~10 rows so the page doesn't grow unbounded */
.detail-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
/* header stays visible while the body scrolls */
.detail-items thead .detail-th { position: sticky; top: 0; z-index: 1; }
.detail-items-sentinel { height: var(--mp-sizes-px, 1px); }
.detail-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.detail-items, .detail-linked {
  width: 100%;
  border-collapse: collapse;
}
/* Header — per ErpTablePage.md: neutral-subtle gray, 28px, 12px/600 uppercase,
   padding 4px 16px 4px 8px (left) / 4px 8px 4px 16px (right). */
.detail-th {
  height: var(--mp-sizes-7, 28px);
  text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
  text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.detail-th--num {
  text-align: right;
  padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4);
}
/* Row — per ErpTablePage.md: 40px single-line, 6px vertical padding,
   vertical-align middle (conditional: top only when a cell wraps). */
.detail-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-lg, 20px);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: middle;
}
.detail-td--num {
  text-align: right;
  white-space: nowrap;
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4);
}
/* line-items rows carry a 2-line product cell → that whole row top-aligns */
.detail-items tbody .detail-td { vertical-align: top; }
.detail-td--muted { color: var(--mp-text-secondary); }
.detail-item-primary { display: block; }
.detail-item-name { display: block; color: var(--mp-text-default); }
.detail-item-sku {
  display: block;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-subtle);
  margin-top: var(--mp-spacing-0\.5);
}

/* fixed, left-aligned columns for the linked-transactions table (4th col fills) */
.detail-linked { table-layout: auto; }
.detail-linked-col--date   { width: 140px; }
.detail-linked-col--number { width: 260px; }
.detail-linked-col--status { width: 160px; }

.cell-with-action { position: relative; }
.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* progressive pagination (load-more) row — see ErpPagination.md */
.detail-items-count {
  display: flex;
  align-items: center;
  justify-content: flex-start;   /* Load link sits right beside the count */
  gap: var(--mp-spacing-3);      /* 12px between count and "Load N more…" */
  margin: 0;
  padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default);
}
.detail-loading {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  color: var(--mp-text-secondary);
}

/* ── Notes + totals ── */
.detail-notes {
  display: grid;
  grid-template-columns: 1fr 380px;
  gap: var(--mp-spacing-6);
  align-items: start;
}
.detail-notes-left { display: flex; flex-direction: column; }
.detail-note-text {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-lg, 20px);
  color: var(--mp-text-default);
  white-space: pre-line;
}
.detail-attach-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.detail-attach {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  cursor: pointer;
  width: fit-content;
}
.detail-attach-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.detail-attach-meta { display: flex; flex-direction: column; }
.detail-attach-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.detail-attach:hover .detail-attach-name { text-decoration: underline; text-underline-offset: 2px; }
.detail-attach-size { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* 8px top padding matches the left column's ContentList padding → Subtotal aligns with Message */
.detail-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding-top: var(--mp-spacing-2); }
.detail-total-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.detail-total-row-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.detail-total-row-amt { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
/* Subtotal + Total rows: H3 — 16px semibold */
.detail-total-row-label--strong, .detail-total-row-amt--strong,
.detail-total-row-label--total, .detail-total-row-amt--total {
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
/* dashed rule before Total: 4px dash / 4px gap, border-default */
.detail-total-rule {
  height: var(--mp-sizes-px, 1px);
  background: repeating-linear-gradient(
    to right,
    var(--mp-border-default) 0,
    var(--mp-border-default) 4px,
    transparent 4px,
    transparent 8px
  );
}

/* ── Last updated ── */
.detail-updated {
  margin: 0;
  align-self: flex-start;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-link);
  cursor: pointer;
}
.detail-updated:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Tabs ── */
.detail-tabs { margin-top: 0; }
/* active tab uses text/selected + border/selected (not the raw green variant) */
.detail-tabs :deep(.mp-tab--isSelected_true),
.detail-tabs :deep(.mp-tab--isSelected_true:hover) {
  color: var(--mp-text-selected) !important;
}
.detail-tabs :deep(.mp-tab-selected-border) {
  /* border/selected token (#029861); not exposed as a CSS var in this build → fallback */
  background-color: var(--mp-border-selected, #029861) !important;
}
/* MpTabList ships a 24px bottom margin → tighten the tabs→heading gap to 20px */
.detail-tabs :deep([data-pixel-component="MpTabList"]) {
  margin-bottom: var(--mp-spacing-5) !important;
}
.detail-tab-heading {
  /* 20px from the tab list above (set on MpTabList), 12px to the table below */
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

/* ── Footer action bar ── */
.detail-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-3);
  padding-top: var(--mp-spacing-4);
}
/* Footer buttons use the shared btn-enterprise--{secondary,primary} classes
   (erp.css) — no page-local button styling / hardcoded brand colors. */
</style>
