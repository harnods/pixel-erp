<script setup lang="ts">
import {
  MpButton, MpTextlink, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTooltip, MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpIcon, MpSpinner, css, toast,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalCloseButton, MpModalOverlay,
  MpFormControl, MpFormLabel, MpFormHelpText, MpTextarea,
  MpBanner, MpBannerIcon, MpBannerTitle, MpBannerDescription,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ActivityLogModal from '~/components/patterns/ActivityLogModal.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { getPurchaseOrderDetail, purchaseOrders } from '~/data'
import ErpLineDimensionsView from '~/components/patterns/ErpLineDimensionsView.vue'
import { applicableDimensions } from '~/data/dimensions'

const props = defineProps<{ orderId: string }>()

// Info banner temporarily hidden in the prototype (toggle back on when ready)
const showBanner = false

// Purchase orders have an approval flow → show Task + Comment icon actions.
const hasApproval = true

// Detail navigation is shell-driven (app/pages/index.vue) via provide/inject,
// not URL routing on this branch.
const openPurchaseOrder = inject<(id: string) => void>('openPurchaseOrder')
const closePurchaseOrder = inject<() => void>('closePurchaseOrder')
const approvePurchaseOrder = inject<(id: string) => void>('approvePurchaseOrder')
const rejectPurchaseOrder = inject<(id: string, reason: string) => void>('rejectPurchaseOrder')
const duplicatePurchaseOrder = inject<(id: string, banner?: { user: string; date: string; reason?: string } | null) => void>('duplicatePurchaseOrder')

const order = computed(() => getPurchaseOrderDetail(props.orderId))
const { dimensionsActivated } = useDimensionsActivation()
const showDimensionsColumn = computed(() => dimensionsActivated.value && applicableDimensions('purchases').length > 0)
function dimensionValuesFor(dimensions?: Record<string, string>): { name: string; value: string }[] {
  if (!dimensions) return []
  return Object.entries(dimensions).map(([name, value]) => ({ name, value }))
}

// Awaiting-approval variant: Approve button in the header, secondary Actions
// footer button, and a Reject item in the Actions menu.
const isAwaitingApproval = computed(() => order.value.status === 'draft')

// Rejected variant: no Print & share; Actions menu shows only Duplicate + Delete.
const isRejected = computed(() => order.value.status === 'rejected')

function onApprove() { approvePurchaseOrder?.(props.orderId) }

const showRejectModal = ref(false)
const rejectReason = ref('')
const rejectReasonMax = 256

const rejectionBanner = computed(() => order.value.rejection ?? null)

function onReject() { showRejectModal.value = true }
function onConfirmReject() {
  rejectPurchaseOrder?.(props.orderId, rejectReason.value)
  showRejectModal.value = false
  rejectReason.value = ''
}
function onCancelReject() {
  showRejectModal.value = false
  rejectReason.value = ''
}

// ── Activity log (rule/detail-activity-log-always) ─────────────────────────────
const activityOpen = ref(false)
const activityEntries = computed(() => [{
  date: order.value.lastUpdatedAt,
  user: order.value.lastUpdatedBy,
  activity: 'Created',
  details: [
    { label: 'Transaction no.', value: `Purchase Order #${order.value.number}` },
    { label: 'Transaction date', value: formatDateLong(order.value.date) },
    { label: 'Vendor', value: order.value.vendor.name },
    { label: 'Warehouse', value: order.value.warehouse },
  ],
}])

// ── Destructive delete → confirm modal (rule/btn-danger-confirm) ───────────────
const deleteOpen = ref(false)
function confirmDelete() {
  toast.notify({ variant: 'success', title: 'Purchase order deleted', rootProps: { class: 'toast-enterprise' } })
  closePurchaseOrder?.()
}

// ── Approval-log popover (title-bar [task] icon) ───────────────────────────────
const approvalLogOpen = ref(false)
const approvalLogAnchor = ref<HTMLElement | null>(null)
function toggleApprovalLog() { approvalLogOpen.value = !approvalLogOpen.value }
// Which stages are expanded (all open by default).
const expandedStages = ref<Set<number>>(new Set())
watch(order, (o) => { expandedStages.value = new Set(o.approvalLog.stages.map((_, i) => i)) }, { immediate: true })
function toggleStage(i: number) {
  const s = new Set(expandedStages.value)
  s.has(i) ? s.delete(i) : s.add(i)
  expandedStages.value = s
}
function onDocClick(e: MouseEvent) {
  if (approvalLogOpen.value && approvalLogAnchor.value && !approvalLogAnchor.value.contains(e.target as Node)) {
    approvalLogOpen.value = false
  }
}
function onDocKey(e: KeyboardEvent) { if (e.key === 'Escape') approvalLogOpen.value = false }
onMounted(() => { document.addEventListener('click', onDocClick); document.addEventListener('keydown', onDocKey) })
onUnmounted(() => { document.removeEventListener('click', onDocClick); document.removeEventListener('keydown', onDocKey) })

/** "5 Jan 2026, 14:30" — day without leading zero. */
function formatLogAt(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date}, ${time}`
}

// Flattened timeline rows — requested + each stage + (when expanded) its actors.
// Flat so first/last connector-line trimming and per-row branching stay simple.
interface TimelineRow {
  kind: 'requested' | 'stage' | 'actor'
  primary: string
  meta?: string
  rule?: string
  badgeStatus?: string
  icon: string
  color?: string     // MpIcon color (omit → default icon colour, e.g. toggle)
  muted?: boolean    // awaiting actor → regular weight
  stageIndex?: number
  expanded?: boolean
}
const TONE = { brand: '#029861', success: '#1fb088', warning: '#e46910', critical: '#e5484d' }
const timelineRows = computed<TimelineRow[]>(() => {
  const log = order.value.approvalLog
  const rows: TimelineRow[] = []
  rows.push({ kind: 'requested', primary: `Requested by ${log.requestedBy.name}`, meta: formatLogAt(log.requestedBy.at), icon: 'indicator-circle', color: TONE.brand })
  log.stages.forEach((stage, si) => {
    const expanded = expandedStages.value.has(si)
    rows.push({ kind: 'stage', primary: stage.title, rule: stage.rule, badgeStatus: stage.status, icon: expanded ? 'accordion-collapse' : 'accordion-expand', stageIndex: si, expanded })
    if (!expanded) return
    for (const actor of stage.actors) {
      if (actor.state === 'approved') rows.push({ kind: 'actor', primary: `Approved by ${actor.name}`, meta: formatLogAt(actor.at!), icon: 'done', color: TONE.success })
      else if (actor.state === 'rejected') rows.push({ kind: 'actor', primary: `Rejected by ${actor.name}`, meta: formatLogAt(actor.at!), icon: 'error', color: TONE.critical })
      else rows.push({ kind: 'actor', primary: `Awaiting approval from ${actor.name}`, icon: 'time', color: TONE.warning, muted: true })
    }
  })
  return rows
})

// ── Line-items progressive pagination (auto lazy-load on scroll) ───────────────
const PAGE_SIZE = 10
const shownCount = ref(PAGE_SIZE)               // show 10 by default
const loadingMore = ref(false)
const visibleItems = computed(() => order.value.lineItems.slice(0, shownCount.value))
const hasMoreItems = computed(() => shownCount.value < order.value.lineItems.length)
// progressive pagination kicks in past the default page → the table becomes a
// bordered, internally-scrolling panel
const isProgressive = computed(() => order.value.lineItems.length > PAGE_SIZE)

function loadMoreItems() {
  if (loadingMore.value || !hasMoreItems.value) return
  loadingMore.value = true
  // brief loading state before the next batch appends
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, order.value.lineItems.length)
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
  const recent = [...purchaseOrders].sort((a, b) => b.date.localeCompare(a.date))   // most recent first
  const q = jumpSearch.value.trim().toLowerCase()
  const matched = q
    ? recent.filter(o => String(o.number).toLowerCase().includes(q) || o.vendor.name.toLowerCase().includes(q))
    : recent
  return matched.slice(0, 5)   // 5 most recent (or top 5 matches)
})
function jumpTo(id: string) { openPurchaseOrder?.(id) }

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

function goBack() { closePurchaseOrder?.() }
</script>

<template>
  <div class="detail-page">

    <!-- ── Title bar (breadcrumb + title + status dropdown + icon actions) ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpTextlink id="detail-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="goBack">Purchase orders</MpTextlink>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">Purchase Order #{{ order.number }}</h1>
          <ErpStatusBadge :status="order.status" badge-for="additionalInformation" size="md" />

          <!-- Chevron → jump-to-transaction switcher (search + 5 recent) -->
          <MpPopover id="detail-jump" use-portal :is-keep-alive="false" placement="bottom-start">
            <MpPopoverTrigger>
              <MpButton class="detail-jump-chevron" aria-label="Switch transaction">
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
                    placeholder="Search transaction…"
                  />
                </div>
                <div class="detail-jump-list">
                  <MpButton
                    v-for="o in jumpResults"
                    :key="o.id"
                    variant="secondary"
                    class="detail-jump-item"
                    @click="jumpTo(o.id)"
                  >
                    <span class="detail-jump-item-number">Purchase Order #{{ o.number }}</span>
                    <span class="detail-jump-item-customer">{{ o.vendor.name }}</span>
                  </MpButton>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">No transactions found.</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <!-- Right-side icon actions — only when the page has an approval flow -->
      <div v-if="hasApproval" class="detail-titlerow-right">
          <!-- Approval log — click opens the log popover 4px below the icon -->
          <div ref="approvalLogAnchor" class="applog-anchor">
            <MpTooltip id="detail-tt-tasks" label="Approval log" placement="bottom" use-portal>
              <MpButton class="detail-icon-btn" :class="{ 'detail-icon-btn--active': approvalLogOpen }" aria-label="Approval log" @click.stop="toggleApprovalLog">
                <MpIcon name="task-todo" size="md" />
              </MpButton>
            </MpTooltip>

            <div v-if="approvalLogOpen" class="applog" @click.stop>
              <header class="applog-header">
                <span class="applog-heading">Approval log</span>
                <MpButton class="applog-close" aria-label="Close" @click="approvalLogOpen = false">
                  <MpIcon name="close" size="md" />
                </MpButton>
              </header>

              <div class="applog-body">
                <div
                  v-for="(row, i) in timelineRows"
                  :key="i"
                  class="applog-row"
                  :class="[
                    row.kind === 'actor' ? 'applog-row--actor' : '',
                    i === 0 ? 'applog-row--first' : '',
                    i === timelineRows.length - 1 ? 'applog-row--last' : '',
                  ]"
                >
                  <span class="applog-rail">
                    <span v-if="row.kind === 'actor'" class="applog-branch" aria-hidden="true" />
                    <MpButton
                      v-if="row.kind === 'stage'"
                      class="applog-mark applog-mark--toggle"
                      :aria-label="row.expanded ? 'Collapse' : 'Expand'"
                      @click.stop="toggleStage(row.stageIndex!)"
                    >
                      <MpIcon :name="row.icon" size="md" />
                    </MpButton>
                    <span v-else class="applog-mark">
                      <MpIcon :name="row.icon" size="md" :color="row.color" />
                    </span>
                  </span>

                  <div class="applog-text">
                    <p class="applog-primary" :class="{ 'applog-primary--muted': row.muted }">{{ row.primary }}</p>
                    <p v-if="row.meta" class="applog-meta">{{ row.meta }}</p>
                    <div v-if="row.kind === 'stage'" class="applog-stage-sub">
                      <span class="applog-rule">{{ row.rule }}</span>
                      <ErpStatusBadge :status="row.badgeStatus" size="md" badge-for="additionalInformation" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <MpTooltip id="detail-tt-comments" label="Comments" placement="bottom" use-portal>
            <MpButton class="detail-icon-btn" aria-label="Comments">
              <MpIcon name="comment" size="md" />
            </MpButton>
          </MpTooltip>
          <!-- Approve — only while awaiting approval -->
          <MpButton v-if="isAwaitingApproval" variant="primary" @click="onApprove">Approve</MpButton>
      </div>
    </header>

    <!-- ── Stage wrapper: 12px rounded top corners colored to match active banner ── -->
    <div class="detail-stage-wrapper" :style="{ background: rejectionBanner ? 'var(--mp-colors-background-warning)' : (showBanner && order.banner ? 'var(--mp-colors-background-information)' : 'var(--mp-background-stage)') }">

    <!-- Rejection warning banner -->
    <MpBanner v-if="rejectionBanner" id="rejection-banner" variant="warning" class="detail-rejection-banner">
      <MpBannerIcon id="rejection-banner-icon" />
      <MpBannerTitle id="rejection-banner-title">Transaction rejected by {{ rejectionBanner.user }} on {{ rejectionBanner.date }}. Make sure you have made correction before saving this transaction.</MpBannerTitle>
      <MpBannerDescription v-if="rejectionBanner.reason" id="rejection-banner-desc">{{ rejectionBanner.reason }}</MpBannerDescription>
    </MpBanner>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- Info banner (conditional) — temporarily hidden in the prototype -->
      <div v-if="showBanner && order.banner" class="detail-banner">
        <MpIcon class="detail-banner-icon" name="info" size="md" />
        <span class="detail-banner-text">{{ order.banner.message }}</span>
        <a class="detail-banner-link" @click.prevent>{{ order.banner.linkLabel }}</a>
      </div>

      <!-- ── Header summary ── -->
      <section class="detail-summary">
        <!-- Primary row: shares the header grid (col 1 = 318px) + emphasised Total -->
        <div class="content-list-grid">
          <div class="content-list-col">
            <ContentList label="Vendor" :value="order.vendor.name" />
          </div>
          <div class="content-list-col">
            <ContentList label="Email">
              <span v-for="(e, i) in order.email" :key="i" class="content-list__line">{{ e }}</span>
            </ContentList>
          </div>
          <div class="detail-primary-total">
            <span class="detail-total-label">Total</span>
            <span class="detail-total-amount">{{ formatIDR(order.totals.total) }}</span>
          </div>
        </div>

        <div class="detail-divider" />

        <!-- Detail grid: col 1 = 318px, col 2+ fill equally (max 5 cols) -->
        <div class="content-list-grid">
          <!-- col 1: addresses -->
          <div class="content-list-col">
            <ContentList label="Billing address" :value="order.billingAddress" />
            <ContentList label="Ship to" :value="order.shipTo" />
          </div>
          <!-- col 2: order dates -->
          <div class="content-list-col">
            <ContentList label="Transaction date" :value="formatDateLong(order.date)" />
            <ContentList label="Due date" :value="formatDateLong(order.dueDate)" />
            <ContentList label="Payment terms" :value="order.paymentTerms" />
          </div>
          <!-- col 3: shipping -->
          <div class="content-list-col">
            <ContentList label="Ship date" :value="formatDateLong(order.shipDate)" />
            <ContentList label="Ship via" :value="order.shipVia" />
            <ContentList label="Tracking no." :value="order.trackingNo" />
          </div>
          <!-- col 4: references -->
          <div class="content-list-col">
            <ContentList label="Transaction no." :value="`Purchase Order #${order.number}`" />
            <ContentList label="Reference no." :value="order.referenceNo" />
            <ContentList label="Warehouse" :value="order.warehouse" />
          </div>
          <!-- col 5: tags -->
          <div class="content-list-col">
            <ContentList label="Tags">
              <ErpTagList v-if="order.tags?.length" :tags="order.tags" />
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
              <th class="detail-th">Product</th>
              <th class="detail-th">Description</th>
              <th class="detail-th detail-th--num">Qty</th>
              <th class="detail-th">Unit</th>
              <th class="detail-th detail-th--num">Unit price</th>
              <th class="detail-th detail-th--num">Discount</th>
              <th class="detail-th">Tax</th>
              <th v-if="showDimensionsColumn" class="detail-th">Dimensions</th>
              <th class="detail-th detail-th--num">Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(it, i) in visibleItems" :key="i" class="detail-item-row">
              <td class="detail-td">
                <div class="cell-with-action">
                  <span class="detail-item-primary">
                    <span class="detail-item-name">{{ it.product }}</span>
                    <span class="detail-item-sku">SKU: {{ it.sku }}</span>
                  </span>
                  <MpButton class="row-hover-btn" @click.stop>
                    <MpIcon name="newtab" size="sm" />
                    <span class="row-hover-btn__label">VIEW DETAILS</span>
                  </MpButton>
                </div>
              </td>
              <td class="detail-td detail-td--muted">{{ it.description }}</td>
              <td class="detail-td detail-td--num">{{ it.qty }}</td>
              <td class="detail-td">{{ it.unit }}</td>
              <td class="detail-td detail-td--num">{{ formatIDR(it.unitPrice) }}</td>
              <td class="detail-td detail-td--num">{{ discountText(it.discountPct) }}</td>
              <td class="detail-td">{{ it.taxLabel }}</td>
              <td v-if="showDimensionsColumn" class="detail-td">
                <ErpLineDimensionsView :values="dimensionValuesFor(it.dimensions)" />
              </td>
              <td class="detail-td detail-td--num">{{ formatIDR(it.amount) }}</td>
            </tr>
          </tbody>
        </table>
          <!-- sentinel observed for auto lazy-load + inline loading row -->
          <div ref="itemsSentinelEl" class="detail-items-sentinel" aria-hidden="true" />
          <div v-if="loadingMore" class="detail-loading detail-items-loading">
            <MpSpinner size="sm" /> Loading items…
          </div>
        </div>
        <div class="detail-items-count">
          <span>Showing {{ visibleItems.length }} of {{ order.lineItems.length }} products</span>
        </div>
      </section>

      <!-- ── Linked transactions ── -->
      <section v-if="order.linkedTransactions.length" class="detail-linked-section">
        <h3 class="detail-tab-heading">Linked transactions</h3>
        <table class="detail-linked">
          <thead>
            <tr>
              <th class="detail-th detail-linked-col--date">Date</th>
              <th class="detail-th">Type</th>
              <th class="detail-th detail-linked-col--number">Number</th>
              <th class="detail-th detail-linked-col--status">Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(txn, i) in order.linkedTransactions" :key="i" class="detail-item-row">
              <td class="detail-td">{{ formatDateLong(txn.date) }}</td>
              <td class="detail-td">{{ txn.type }}</td>
              <td class="detail-td">
                <a
                  v-if="txn.orderId"
                  class="detail-attach-name"
                  style="cursor:pointer"
                  @click="openPurchaseOrder?.(txn.orderId)"
                >{{ txn.number }}</a>
                <template v-else>{{ txn.number }}</template>
              </td>
              <td class="detail-td"><ErpStatusBadge :status="txn.status" size="md" /></td>
            </tr>
          </tbody>
        </table>
      </section>

      <!-- ── Notes + totals ── -->
      <section class="detail-notes">
        <!-- Left: message / memo / attachment -->
        <div class="detail-notes-left">
          <ContentList label="Message">
            <p class="detail-note-text">{{ order.message }}</p>
          </ContentList>
          <ContentList label="Memo">
            <p class="detail-note-text">{{ order.memo }}</p>
          </ContentList>
          <ContentList :label="`Attachment (${order.attachments.length})`">
            <div class="detail-attach-list">
              <a v-for="(a, i) in order.attachments" :key="i" class="detail-attach" @click.prevent>
                <span class="detail-attach-icon"><MpIcon :name="attachmentIcon(a.name)" size="md" /></span>
                <span class="detail-attach-meta">
                  <span class="detail-attach-name">{{ a.name }}</span>
                  <span class="detail-attach-size">{{ a.sizeKB.toFixed(1) }} KB</span>
                </span>
              </a>
            </div>
          </ContentList>
        </div>

        <!-- Right: totals summary -->
        <div class="detail-totals">
          <div class="detail-total-row">
            <span class="detail-total-row-label detail-total-row-label--strong">Subtotal</span>
            <span class="detail-total-row-amt detail-total-row-amt--strong">{{ formatIDR(order.totals.subtotal) }}</span>
          </div>
          <div class="detail-total-row">
            <span class="detail-total-row-label">Discount per line</span>
            <span class="detail-total-row-amt">{{ formatDeduction(order.totals.discountPerLine) }}</span>
          </div>
          <div class="detail-total-row">
            <span class="detail-total-row-label">Global discount</span>
            <span class="detail-total-row-amt">{{ formatDeduction(order.totals.globalDiscount) }}</span>
          </div>
          <div class="detail-total-row">
            <span class="detail-total-row-label">{{ order.totals.taxLabel }}</span>
            <span class="detail-total-row-amt">{{ formatIDR(order.totals.taxAmount) }}</span>
          </div>
          <div class="detail-total-row">
            <span class="detail-total-row-label">Shipping fee</span>
            <span class="detail-total-row-amt">{{ formatIDR(order.totals.shippingFee) }}</span>
          </div>
          <div class="detail-total-rule" />
          <div class="detail-total-row">
            <span class="detail-total-row-label detail-total-row-label--total">Total</span>
            <span class="detail-total-row-amt detail-total-row-amt--total">{{ formatIDR(order.totals.total) }}</span>
          </div>
        </div>
      </section>

      <!-- Last updated -->
      <a class="detail-updated" @click.prevent="activityOpen = true">Last updated by {{ order.lastUpdatedBy }} on {{ formatUpdatedAt(order.lastUpdatedAt) }}</a>

      <!-- ── Footer action bar ── -->
      <div class="detail-footer">
        <!-- Print & share (secondary dropdown) — not eligible once rejected -->
        <MpPopover v-if="!isRejected" id="detail-print-share" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
          <MpPopoverTrigger>
            <MpButton variant="secondary" class="btn-enterprise btn-enterprise--secondary" left-icon="chevrons-down">
              Print &amp; share
            </MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem>Print PDF</MpPopoverListItem>
              <MpPopoverListItem>Print dot matrix</MpPopoverListItem>
            </MpPopoverList>
            <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
            <MpPopoverList>
              <MpPopoverListItem>Share via WhatsApp</MpPopoverListItem>
              <MpPopoverListItem>Share via email</MpPopoverListItem>
              <MpPopoverListItem>Copy link</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <!-- Actions (secondary dropdown) -->
        <MpPopover id="detail-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
          <MpPopoverTrigger>
            <MpButton variant="primary" class="btn-enterprise btn-enterprise--primary" left-icon="chevrons-down">
              Actions
            </MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
            <template v-if="!isRejected">
              <MpPopoverList>
                <MpPopoverListItem>Preview</MpPopoverListItem>
              </MpPopoverList>
              <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
            </template>
            <MpPopoverList>
              <MpPopoverListItem v-if="!isRejected">Edit</MpPopoverListItem>
              <MpPopoverListItem v-if="!isAwaitingApproval && !isRejected">Set as recurring</MpPopoverListItem>
              <MpPopoverListItem @click="duplicatePurchaseOrder?.(props.orderId, rejectionBanner)">Duplicate</MpPopoverListItem>
              <MpPopoverListItem v-if="!isRejected">Void</MpPopoverListItem>
              <MpPopoverListItem v-if="isAwaitingApproval" @click="onReject">Reject</MpPopoverListItem>
              <MpPopoverListItem @click="deleteOpen = true">Delete</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>
      </div>

    </div><!-- /detail-stage -->
    </div><!-- /detail-stage-wrapper -->
  </div>

  <!-- ── Reject confirmation modal ── -->
  <MpModal :is-close-on-esc="false" :is-close-on-overlay-click="false"
    id="reject-transaction-modal"
    :is-open="showRejectModal"
    size="md"
    is-centered
    @close="onCancelReject"
  >
    <MpModalContent>
      <MpModalHeader>
        Reject transaction?
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <MpFormControl id="reject-reason">
          <div class="reject-label-row">
            <MpFormLabel>Reasons for rejection</MpFormLabel>
            <span class="reject-counter">{{ rejectReason.length }}/{{ rejectReasonMax }}</span>
          </div>
          <MpTextarea
            v-model="rejectReason"
            :maxlength="rejectReasonMax"
            is-full-width
            placeholder=""
          />
          <MpFormHelpText>Notes will be visible to your team.</MpFormHelpText>
        </MpFormControl>
      </MpModalBody>
      <MpModalFooter>
        <MpButton variant="ghost" class="btn-enterprise btn-enterprise--ghost" @click="onCancelReject">Cancel</MpButton>
        <MpButton variant="danger" class="btn-enterprise btn-enterprise--danger" @click="onConfirmReject">Reject</MpButton>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <ActivityLogModal
    :is-open="activityOpen"
    :subject="`Purchase Order #${order.number}`"
    :updated-by="order.lastUpdatedBy"
    :updated-at="order.lastUpdatedAt"
    :entries="activityEntries"
    @close="activityOpen = false"
  />

  <ConfirmModal
    v-model:is-open="deleteOpen"
    title="Delete purchase order?"
    :description="`Purchase Order #${order.number} will be permanently deleted. This cannot be undone.`"
    confirm-label="Delete purchase order"
    @confirm="confirmDelete"
  />
</template>

<style scoped>

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
  width: auto !important;
  height: auto !important;
  min-width: 0 !important;
  background: none !important;
  border: none !important;
  padding: 0 !important;
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
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-7, 28px) !important;
  height: var(--mp-sizes-7, 28px) !important;
  min-width: 0 !important;
  background: none !important;
  border: none !important;
  padding: 0 !important;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  color: var(--mp-icon-default);
}
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }

/* jump-to popover (304px): search on top (280px input, 12px padding), 5 recent below */
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); }   /* 12px around the search */
.detail-jump-search {
  width: 100%;        /* = 280px inside the 304px popover minus 12px padding each side */
  box-sizing: border-box;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  outline: none;
}
.detail-jump-search:focus { border-color: var(--mp-colors-border-bold, #8c9596); box-shadow: inset 0 0 0 1px var(--mp-colors-border-bold, #8c9596); outline: none; }
.detail-jump-search::placeholder { color: var(--mp-text-placeholder); }
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
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px) !important;
  height: var(--mp-sizes-9, 36px) !important;
  min-width: 0 !important;
  padding: 0 !important;
  border-radius: var(--mp-radii-md);
  background: none !important;
  border: none !important;
  cursor: pointer;
  color: var(--mp-icon-default);
}
.detail-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.detail-icon-btn--active { background: var(--mp-background-neutral-hovered); color: var(--mp-icon-brand); }

/* ── Approval-log popover ─────────────────────────────────────────────────── */
.applog-anchor { position: relative; display: inline-flex; }
.applog {
  position: absolute;
  top: calc(100% + 4px);   /* 4px below the icon button */
  right: 0;
  z-index: 60;
  width: var(--mp-sizes-112, 448px);
  max-width: min(448px, calc(100vw - 48px));
  background: var(--mp-background-stage, #fff);
  border: 1px solid var(--mp-border-bold, #8c9596);
  border-radius: var(--mp-radii-md, 6px);
  overflow: hidden;
}
.applog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-4, 16px);
  padding: var(--mp-spacing-3, 12px) var(--mp-spacing-4, 16px);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.applog-heading {
  font-size: var(--mp-font-sizes-md, 14px);
  font-weight: var(--mp-font-weights-semi-bold, 600);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-text-default, #080d0e);
}
.applog-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-6, 24px);
  height: var(--mp-sizes-6, 24px);
  border: none;
  background: none;
  cursor: pointer;
  border-radius: var(--mp-radii-md, 6px);
  color: var(--mp-icon-default, #536062);
}
.applog-close:hover { background: var(--mp-background-neutral-hovered); }

.applog-body {
  padding: var(--mp-spacing-4, 16px);
  max-height: min(480px, calc(100vh - 140px));
  overflow-y: auto;
}

/* Each top-level node + its children; the far-left connector runs through it. */
.applog-group { position: relative; }
.applog-group::before {
  content: '';
  position: absolute;
  left: 11px;                 /* centre of the 24px rail */
  top: 10px;                  /* default (first): start at the icon centre */
  bottom: 0;
  width: 1px;
  background: var(--mp-border-default, #e3e7e9);
}
.applog-group:not(:first-child)::before { top: 0; }      /* incoming line from above */
.applog-group:last-child::before { bottom: auto; height: 10px; }  /* stop at last icon */

.applog-row { display: flex; gap: var(--mp-spacing-3, 12px); }
.applog-row + .applog-group,
.applog-group + .applog-group { margin-top: var(--mp-spacing-4, 16px); }
.applog-row--child { margin-top: var(--mp-spacing-3, 12px); }

.applog-rail {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  width: 24px;
  display: flex;
  justify-content: center;
}
/* Children indent by one rail; their own connector links consecutive actors. */
.applog-children { position: relative; }
.applog-rail--child { margin-left: var(--mp-spacing-6, 24px); }
.applog-rail--child::before {   /* incoming */
  content: ''; position: absolute; left: 11px; top: -12px; height: 22px; width: 1px;
  background: var(--mp-border-default, #e3e7e9);
}
.applog-row--child:first-child .applog-rail--child::before { display: none; }

/* Node markers — sit on white to break the connector line behind them. */
.applog-node {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-inverse, #fff);
  flex-shrink: 0;
}
.applog-node--dot { width: 12px; height: 12px; margin: 4px; background: var(--mp-icon-brand); }
.applog-node--approved { background: var(--mp-icon-success, #1fb088); }
.applog-node--rejected { background: var(--mp-icon-critical, #e5484d); }
.applog-node--awaiting { background: var(--mp-icon-warning, #e46910); }

.applog-toggle {
  position: relative;
  z-index: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border: 1px solid var(--mp-border-bold, #8c9596);
  border-radius: var(--mp-radii-md, 6px);
  background: var(--mp-background-stage, #fff);
  cursor: pointer;
  color: var(--mp-icon-default, #536062);
  padding: 0;
}

.applog-text { min-width: 0; padding-top: 1px; }
.applog-primary {
  margin: 0;
  font-size: var(--mp-font-sizes-md, 14px);
  font-weight: var(--mp-font-weights-semi-bold, 600);
  line-height: var(--mp-line-heights-md, 20px);
  color: var(--mp-text-default, #080d0e);
}
.applog-primary--muted { font-weight: var(--mp-font-weights-regular, 400); }
.applog-meta {
  margin: 0;
  font-size: var(--mp-font-sizes-sm, 12px);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary, #3a4749);
}
.applog-stage-sub { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); flex-wrap: wrap; }

/* ── Stage wrapper: provides 12px rounded top corners colored to match the active banner ── */
.detail-stage-wrapper {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border-radius: 12px 12px 0 0;
}

/* ── Stage ── */
.detail-stage {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  background: var(--mp-background-stage);
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
  align-items: flex-start;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-information);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.detail-banner-icon { color: var(--mp-icon-information); flex-shrink: 0; margin-top: 1px; }
.detail-banner-text { flex: 1; }
.detail-banner-link {
  color: var(--mp-text-link);
  cursor: pointer;
  font-weight: var(--mp-font-weights-semi-bold);
}
.detail-banner-link:hover { text-decoration: underline; text-underline-offset: 2px; }

/* Full-width rejection banner — sits between header and stage, no border-radius */
.detail-rejection-banner {
  border-radius: 0 !important;
}

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
  height: 1px;
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
/* in the bordered panel the count sits at the bottom → divider above, not below */
.detail-items-section--bordered .detail-items-count {
  border-top: 1px solid var(--mp-border-default);
  border-bottom: none;
}
/* table scrolls internally past ~10 rows so the page doesn't grow unbounded */
.detail-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
/* header stays visible while the body scrolls */
.detail-items thead .detail-th { position: sticky; top: 0; z-index: 1; }
.detail-items-sentinel { height: 1px; }
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

/* ── Linked transactions ── */
.detail-linked-section { display: flex; flex-direction: column; flex-shrink: 0; }
/* fixed, left-aligned columns for the linked-transactions table (4th col fills) */
.detail-linked { table-layout: auto; }
.detail-linked-col--date   { width: 140px; }
.detail-linked-col--number { width: 260px; }
.detail-linked-col--status { width: 160px; }

/* row-hover "View details" button (per ErpTablePage.md) */
.cell-with-action { position: relative; }
.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.row-hover-btn {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: none;
  align-items: center;
  gap: var(--mp-spacing-1\.5);
  min-width: 0 !important;
  height: auto !important;
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5) !important;
  background: var(--mp-background-neutral) !important;
  border: 1px solid var(--mp-border-bold) !important;
  border-radius: var(--mp-radii-sm) !important;
  cursor: pointer;
}
.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px);
  font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase;
  color: var(--mp-text-secondary);
}
.detail-item-row:hover .row-hover-btn { display: flex; }
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
  height: 1px;
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
  /* border/selected semantic token */
  background-color: var(--mp-border-selected) !important;
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

/* ── Reject modal ── */
/* Every modal sits 80px below the top of the page. The library's "is-centered"
   wrapper vertically centers via flex (align-items: center), which makes
   margin-top just bias the centering rather than a fixed offset from the
   viewport top — so pin the wrapper to the top too. */
.mp-modal__contentRoot {
  align-items: flex-start !important;
}
:deep([data-pixel-component="MpModalContent"]) {
  margin-top: 80px !important;
}
:deep([data-pixel-component="MpModalFooter"]) {
  gap: var(--mp-spacing-3, 12px);
}
.reject-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-3);
}
.reject-counter {
  flex-shrink: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}

/* ── Enterprise pill buttons (matches app/pages/index.vue .btn-enterprise) ── */
.btn-enterprise {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--mp-spacing-2, 8px);
  padding: var(--mp-spacing-2, 8px) var(--mp-spacing-4, 16px);
  border-radius: 999px;
  font-size: var(--mp-font-sizes-md, 14px);
  font-weight: var(--mp-font-weights-semi-bold, 600);
  line-height: var(--mp-line-heights-md, 20px);
  cursor: pointer;
  white-space: nowrap;
  border: 1px solid transparent;
}
.btn-enterprise--secondary {
  background: var(--mp-background-neutral, #ffffff);
  border-color: var(--mp-border-bold, #8c9596);
  color: var(--mp-text-secondary, #3a4749);
}
.btn-enterprise--secondary:hover { background: var(--mp-background-neutral-hovered, #f0f1f3); }
.btn-enterprise--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--mp-text-secondary, #3a4749);
}
.btn-enterprise--ghost:hover { background: var(--mp-background-neutral-hovered, #f0f1f3); }
.btn-enterprise--danger {
  background: var(--mp-colors-red-700, #c33e35);
  border-color: var(--mp-colors-red-700, #c33e35);
  color: var(--mp-text-inverse, #ffffff);
}
.btn-enterprise--danger:hover {
  background: var(--mp-colors-red-800, #a8352d);
  border-color: var(--mp-colors-red-800, #a8352d);
}
</style>
