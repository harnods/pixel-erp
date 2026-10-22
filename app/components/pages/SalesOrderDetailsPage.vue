<script setup lang="ts">
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent,
  MpTooltip, MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpIcon, MpSpinner, MpButton, MpTextlink, toast, css,
  MpFormControl, MpFormLabel, MpInput, MpAutocomplete, MpDatePicker, MpToggle,
} from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ActivityLogModal from '~/components/patterns/ActivityLogModal.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import MarkSalesOrderCompletedModal from '~/components/patterns/MarkSalesOrderCompletedModal.vue'
import FilePreviewModal from '~/components/patterns/FilePreviewModal.vue'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import PrintShareMenu from '~/components/patterns/PrintShareMenu.vue'
import DetailActionsMenu from '~/components/patterns/DetailActionsMenu.vue'
import type { ActionItem } from '~/components/patterns/DetailActionsMenu.vue'
import { getContactIdByName } from '~/data/contacts'
import { getSalesOrderDetail } from '~/data/salesOrderDetails'
import { salesOrders } from '~/data'
import { salesOrderCompletionRows, recurringSalesOrders, getRecurringForSalesOrder, persistSalesOrders, persistRecurringSalesOrders } from '~/data/salesOrders'
import { addProductionRequest } from '~/data/productionRequests'

const props = defineProps<{ orderId: string }>()

const { t } = useLocale()

// Info banner temporarily hidden in the prototype (toggle back on when ready)
const showBanner = false

// Title-bar icon actions (Task + Comment) only when the page has an approval flow.
// Whether a module has approval is a per-module question — ask when generating.
const hasApproval = true

const router = useRouter()
const order = computed(() => getSalesOrderDetail(props.orderId))

// Raise a production request for every registered-product line on this order —
// the request carries this sales order as its real source (see productionRequests.ts).
function handleCreateProductionRequest() {
  const created = addProductionRequest(order.value)
  if (!created.length) {
    toast.notify({ variant: 'warning', title: t('No registered products on this order to produce') })
    return
  }
  toast.notify({ variant: 'success', title: t('Production request saved') })
  router.push('/production-request')
}
const activityOpen = ref(false)
// Destructive delete → confirm modal (rule/btn-danger-confirm)
const deleteOpen = ref(false)
function confirmDelete() {
  toast.notify({ variant: 'success', title: t('Sales order deleted'), rootProps: { class: 'toast-enterprise' } })
  router.push('/sales-orders')
}

// ─── Mark as completed — only Open / Partially processed can be completed ───────
// (Closed/Voided never show the action item; see the Actions-dropdown v-if.)
const canMarkCompleted = computed(() => order.value.status === 'open' || order.value.status === 'partially processed')
const markCompleteOpen = ref(false)
const markCompleteRows = computed(() => salesOrderCompletionRows(order.value))
function confirmMarkComplete() {
  toast.notify({ variant: 'success', title: t('Sales order marked as completed'), rootProps: { class: 'toast-enterprise' } })
}
const previewOpen = ref(false)
const pdfUrl = ref('')
const PDF_B64 = 'JVBERi0xLjQKMSAwIG9iajw8L1R5cGUvQ2F0YWxvZy9QYWdlcyAyIDAgUj4+ZW5kb2JqCjIgMCBvYmo8PC9UeXBlL1BhZ2VzL0tpZHNbMyAwIFJdL0NvdW50IDE+PmVuZG9iagozIDAgb2JqPDwvVHlwZS9QYWdlL1BhcmVudCAyIDAgUi9NZWRpYUJveFswIDAgNDIwIDI2MF0vQ29udGVudHMgNCAwIFIvUmVzb3VyY2VzPDwvRm9udDw8L0YxIDUgMCBSPj4+Pj4+ZW5kb2JqCjQgMCBvYmo8PC9MZW5ndGggMTIwPj5zdHJlYW0KQlQgL0YxIDIyIFRmIDQwIDIwMCBUZCAoU2FtcGxlIGludm9pY2UgUERGKSBUaiBFVApCVCAvRjEgMTMgVGYgNDAgMTY1IFRkIChQcmV2aWV3IHJlbmRlcmVkIGluIGFuIGlmcmFtZS4pIFRqIEVUCmVuZHN0cmVhbSBlbmRvYmoKNSAwIG9iajw8L1R5cGUvRm9udC9TdWJ0eXBlL1R5cGUxL0Jhc2VGb250L0hlbHZldGljYT4+ZW5kb2JqCnRyYWlsZXI8PC9Sb290IDEgMCBSPj4='
if (import.meta.client) {
  const bytes = Uint8Array.from(atob(PDF_B64), (c) => c.charCodeAt(0))
  pdfUrl.value = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
}

// ─── Recurring info drawer ──────────────────────────────────────────────────
const sourceOrder = computed(() => salesOrders.find(so => so.id === props.orderId))
const recurringTemplate = computed(() => {
  const rid = sourceOrder.value?.recurringId
  return rid ? getRecurringForSalesOrder(rid) : undefined
})
const hasRecurring = computed(() => !!recurringTemplate.value)
const recurringDrawerOpen = ref(false)
const recurringEditing = ref(false)
const isSettingRecurring = ref(false)
const setRecurringSendAutoEmail = ref(false)

const editRepeatInterval = ref(1)
const editRepeatUnit = ref('month')
const editEndRepeat = ref('never')
const editEndAfterCount = ref(12)
const editEndOnDate = ref('')
const editStartDate = ref('')

const repeatUnitOptions = [
  { label: 'Day(s)', value: 'day' }, { label: 'Week(s)', value: 'week' },
  { label: 'Month(s)', value: 'month' }, { label: 'Year(s)', value: 'year' },
]
const endRepeatOptions = [
  { label: 'Never', value: 'never' }, { label: 'After', value: 'after' }, { label: 'On', value: 'on' },
]

function unitLabel(unit: string) {
  const map: Record<string, string> = { day: 'day(s)', week: 'week(s)', month: 'month(s)', year: 'year(s)' }
  return map[unit] ?? unit
}
function endRepeatLabel(val: string) {
  const map: Record<string, string> = { never: 'Never', after: 'After', on: 'On' }
  return map[val] ?? val
}
function formatDateDMY(iso: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function todayDMY() {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function recurDmyToIso(dmy: string) {
  const [d, m, y] = dmy.split('/')
  return `${y}-${m}-${d}`
}

function openRecurringDrawer() {
  recurringEditing.value = false
  isSettingRecurring.value = false
  recurringDrawerOpen.value = true
}

function startEditing() {
  const s = recurringTemplate.value?.schedule
  if (!s) return
  editRepeatInterval.value = s.repeatInterval
  editRepeatUnit.value = s.repeatUnit
  editEndRepeat.value = s.endRepeat
  editEndAfterCount.value = s.endAfterCount ?? 12
  editEndOnDate.value = s.endOnDate ? formatDateDMY(s.endOnDate) : ''
  editStartDate.value = formatDateDMY(s.startDate)
  recurringEditing.value = true
}

function saveEditing() {
  const tmpl = recurringTemplate.value
  if (!tmpl?.schedule) return
  tmpl.schedule.repeatInterval = editRepeatInterval.value
  tmpl.schedule.repeatUnit = editRepeatUnit.value as 'day' | 'week' | 'month' | 'year'
  tmpl.schedule.endRepeat = editEndRepeat.value as 'never' | 'after' | 'on'
  tmpl.schedule.endAfterCount = editEndAfterCount.value
  const [d2, m2, y2] = editStartDate.value.split('/')
  tmpl.schedule.startDate = `${y2}-${m2}-${d2}`
  if (editEndRepeat.value === 'on' && editEndOnDate.value) {
    const [d3, m3, y3] = editEndOnDate.value.split('/')
    tmpl.schedule.endOnDate = `${y3}-${m3}-${d3}`
  }
  recurringEditing.value = false
  toast.notify({ variant: 'success', title: t('Recurring settings updated') })
}

function toggleAutoEmail() {
  const tmpl = recurringTemplate.value
  if (tmpl?.schedule) {
    tmpl.schedule.sendAutoEmail = !tmpl.schedule.sendAutoEmail
    toast.notify({ variant: 'success', title: t(tmpl.schedule.sendAutoEmail ? 'Automatic email enabled' : 'Automatic email disabled') })
  }
}

function openSetRecurringDrawer() {
  editRepeatInterval.value = 1
  editRepeatUnit.value = 'month'
  editEndRepeat.value = 'never'
  editEndAfterCount.value = 12
  editEndOnDate.value = ''
  editStartDate.value = todayDMY()
  setRecurringSendAutoEmail.value = false
  isSettingRecurring.value = true
  recurringEditing.value = false
  recurringDrawerOpen.value = true
}

function saveSetRecurring() {
  const ord = order.value
  if (!ord) return
  const newId = `rso-${Date.now()}`
  recurringSalesOrders.push({
    id: newId,
    templateName: `${ord.customer.name} - Recurring`,
    customer: ord.customer,
    frequency: `Every ${editRepeatInterval.value} ${editRepeatUnit.value}`,
    amount: ord.total,
    nextDate: recurDmyToIso(editStartDate.value),
    status: 'active',
    createdCount: 0,
    schedule: {
      repeatInterval: editRepeatInterval.value,
      repeatUnit: editRepeatUnit.value as 'day' | 'week' | 'month' | 'year',
      endRepeat: editEndRepeat.value as 'never' | 'after' | 'on',
      endAfterCount: editEndRepeat.value === 'after' ? editEndAfterCount.value : undefined,
      endOnDate: editEndRepeat.value === 'on' ? recurDmyToIso(editEndOnDate.value) : undefined,
      startDate: recurDmyToIso(editStartDate.value),
      sendAutoEmail: setRecurringSendAutoEmail.value,
    },
  } as any)
  persistRecurringSalesOrders()
  const src = sourceOrder.value
  if (src) { src.recurringId = newId; persistSalesOrders() }
  isSettingRecurring.value = false
  recurringDrawerOpen.value = false
  toast.notify({ variant: 'success', title: t('Recurring sales order created') })
}

const soActionGroups = computed<ActionItem[][]>(() => [
  [
    { label: 'Preview', onClick: () => { previewOpen.value = true } },
    { label: 'Create production request', onClick: handleCreateProductionRequest },
    { label: 'Mark as completed', onClick: () => { markCompleteOpen.value = true }, show: canMarkCompleted.value },
  ],
  [
    { label: 'Edit' },
    { label: 'Set as recurring', onClick: openSetRecurringDrawer, show: !hasRecurring.value },
    { label: 'Duplicate' },
    { label: 'Void' },
    { label: 'Delete', onClick: () => { deleteOpen.value = true } },
  ],
])

const activityEntries = computed(() => [{
  date: order.value.lastUpdatedAt,
  user: order.value.lastUpdatedBy,
  activity: t('Created'),
  details: [
    { label: t('Transaction no.'), value: `${t('Sales Order')} #${order.value.number}` },
    { label: t('Transaction date'), value: formatDateLong(order.value.date) },
    { label: t('Customer'), value: order.value.customer.name },
    { label: t('Warehouse'), value: order.value.warehouse },
  ],
}])

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
  const recent = [...salesOrders].sort((a, b) => b.date.localeCompare(a.date))   // most recent first
  const q = jumpSearch.value.trim().toLowerCase()
  const matched = q
    ? recent.filter(o => String(o.number).includes(q) || o.customer.name.toLowerCase().includes(q))
    : recent
  return matched.slice(0, 5)   // 5 most recent (or top 5 matches)
})
function jumpTo(id: string) { router.push(`/sales-orders/${id}`) }

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

function goBack() { router.push('/sales-orders') }
</script>

<template>
  <div class="detail-page">

    <!-- ── Title bar (breadcrumb + title + status dropdown + icon actions) ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpTextlink id="detail-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="goBack">{{ t('Sales orders') }}</MpTextlink>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ t('Sales Order') }} #{{ order.number }}</h1>
          <ErpStatusBadge :status="order.status" badge-for="additionalInformation" size="md" />

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
                  <MpButton
                    v-for="o in jumpResults"
                    :key="o.id"
                    variant="secondary"
                    class="detail-jump-item"
                    @click="jumpTo(o.id)"
                  >
                    <span class="detail-jump-item-number">{{ t('Sales Order') }} #{{ o.number }}</span>
                    <span class="detail-jump-item-customer">{{ o.customer.name }}</span>
                  </MpButton>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">{{ t('No transactions found') }}</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <!-- Right-side icon actions — only when the page has an approval flow -->
      <div v-if="hasApproval" class="detail-titlerow-right">
          <MpTooltip v-if="hasRecurring" id="detail-tt-recurring" :label="t('Recurring settings')" placement="bottom" use-portal>
            <MpButton class="detail-icon-btn" :aria-label="t('Recurring settings')" @click="openRecurringDrawer">
              <MpIcon name="refresh" size="md" />
            </MpButton>
          </MpTooltip>
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
            <ContentList :label="t('Customer')">
              <a class="detail-value-link" @click="window.open(`/customers/${getContactIdByName(order.customer.name)}`, '_blank')">{{ order.customer.name }}</a>
            </ContentList>
          </div>
          <div class="content-list-col">
            <ContentList :label="t('Email')">
              <span v-for="(e, i) in order.email" :key="i" class="content-list__line">{{ e }}</span>
            </ContentList>
          </div>
          <div class="detail-primary-total">
            <span class="detail-total-label">{{ t('Total') }}</span>
            <span class="detail-total-amount">{{ formatIDR(order.totals.total) }}</span>
          </div>
        </div>

        <div class="detail-divider" />

        <!-- Detail grid: col 1 = 318px, col 2+ fill equally (max 5 cols) -->
        <div class="content-list-grid">
          <!-- col 1: addresses -->
          <div class="content-list-col">
            <ContentList :label="t('Billing address')" :value="order.billingAddress" />
            <ContentList :label="t('Ship to')" :value="order.shipTo" />
          </div>
          <!-- col 2: order dates -->
          <div class="content-list-col">
            <ContentList :label="t('Transaction date')" :value="formatDateLong(order.date)" />
            <ContentList :label="t('Due date')" :value="formatDateLong(order.dueDate)" />
            <ContentList :label="t('Payment terms')" :value="order.paymentTerms" />
          </div>
          <!-- col 3: shipping -->
          <div class="content-list-col">
            <ContentList :label="t('Ship date')" :value="formatDateLong(order.shipDate)" />
            <ContentList :label="t('Ship via')" :value="order.shipVia" />
            <ContentList :label="t('Tracking no.')" :value="order.trackingNo" />
          </div>
          <!-- col 4: references -->
          <div class="content-list-col">
            <ContentList :label="t('Transaction no.')" :value="`${t('Sales Order')} #${order.number}`" />
            <ContentList :label="t('Reference no.')" :value="order.referenceNo" />
            <ContentList :label="t('Warehouse')" :value="order.warehouse" />
          </div>
          <!-- col 5: tags -->
          <div class="content-list-col">
            <ContentList :label="t('Tags')">
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
              <th class="detail-th">{{ t('Product') }}</th>
              <th class="detail-th">{{ t('Description') }}</th>
              <th class="detail-th detail-th--num">{{ t('Qty') }}</th>
              <th class="detail-th">{{ t('Unit') }}</th>
              <th class="detail-th detail-th--num">{{ t('Unit price') }}</th>
              <th class="detail-th detail-th--num">{{ t('Discount') }}</th>
              <th class="detail-th">{{ t('Tax') }}</th>
              <th class="detail-th detail-th--num">{{ t('Amount') }}</th>
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
              <td class="detail-td detail-td--num">{{ it.qty }}</td>
              <td class="detail-td">{{ it.unit }}</td>
              <td class="detail-td detail-td--num">{{ formatIDR(it.unitPrice) }}</td>
              <td class="detail-td detail-td--num">{{ discountText(it.discountPct) }}</td>
              <td class="detail-td">{{ it.taxLabel }}</td>
              <td class="detail-td detail-td--num">{{ formatIDR(it.amount) }}</td>
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
          <span>{{ t('Showing') }} {{ visibleItems.length }} {{ t('of') }} {{ order.lineItems.length }} {{ t('products') }}</span>
        </div>
      </section>

      <!-- ── Notes + totals ── -->
      <section class="detail-notes">
        <!-- Left: message / memo / attachment -->
        <div class="detail-notes-left">
          <ContentList :label="t('Message')">
            <p class="detail-note-text">{{ order.message }}</p>
          </ContentList>
          <ContentList :label="t('Memo')">
            <p class="detail-note-text">{{ order.memo }}</p>
          </ContentList>
          <ContentList :label="`${t('Attachment')} (${order.attachments.length})`">
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
            <span class="detail-total-row-label detail-total-row-label--strong">{{ t('Subtotal') }}</span>
            <span class="detail-total-row-amt detail-total-row-amt--strong">{{ formatIDR(order.totals.subtotal) }}</span>
          </div>
          <div class="detail-total-row">
            <span class="detail-total-row-label">{{ t('Discount per line') }}</span>
            <span class="detail-total-row-amt">{{ formatDeduction(order.totals.discountPerLine) }}</span>
          </div>
          <div class="detail-total-row">
            <span class="detail-total-row-label">{{ t('Global discount') }}</span>
            <span class="detail-total-row-amt">{{ formatDeduction(order.totals.globalDiscount) }}</span>
          </div>
          <div class="detail-total-row">
            <span class="detail-total-row-label">{{ order.totals.taxLabel }}</span>
            <span class="detail-total-row-amt">{{ formatIDR(order.totals.taxAmount) }}</span>
          </div>
          <div class="detail-total-row">
            <span class="detail-total-row-label">{{ t('Shipping fee') }}</span>
            <span class="detail-total-row-amt">{{ formatIDR(order.totals.shippingFee) }}</span>
          </div>
          <div class="detail-total-rule" />
          <div class="detail-total-row">
            <span class="detail-total-row-label detail-total-row-label--total">{{ t('Total') }}</span>
            <span class="detail-total-row-amt detail-total-row-amt--total">{{ formatIDR(order.totals.total) }}</span>
          </div>
        </div>
      </section>

      <!-- Last updated -->
      <a class="detail-updated" @click.prevent="activityOpen = true">{{ t('Last updated by') }} {{ order.lastUpdatedBy }} {{ t('on') }} {{ formatUpdatedAt(order.lastUpdatedAt) }}</a>

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
                <tr v-if="!order.linkedTransactions.length">
                  <td class="detail-td detail-td--muted" colspan="4">{{ t('No linked transactions') }}</td>
                </tr>
                <tr v-for="(txn, i) in order.linkedTransactions" :key="i" class="detail-item-row">
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
        <PrintShareMenu id="so-print" />
        <DetailActionsMenu id="so-actions" :groups="soActionGroups" />
      </div>

    </div><!-- /detail-stage -->

    <ActivityLogModal
      :is-open="activityOpen"
      :subject="`${t('Sales Order')} #${order.number}`"
      :updated-by="order.lastUpdatedBy"
      :updated-at="order.lastUpdatedAt"
      :entries="activityEntries"
      @close="activityOpen = false"
    />

    <ConfirmModal
      v-model:is-open="deleteOpen"
      :title="t('Delete sales order?')"
      :description="`${t('Sales Order')} #${order.number} ${t('will be permanently deleted. This cannot be undone.')}`"
      :confirm-label="`${t('Delete')} ${t('sales order')}`"
      @confirm="confirmDelete"
    />

    <MarkSalesOrderCompletedModal
      v-model:is-open="markCompleteOpen"
      :order-number="order.number"
      :rows="markCompleteRows"
      @confirm="confirmMarkComplete"
    />

    <FilePreviewModal :open="previewOpen" :src="pdfUrl" :filename="`sales-order-${order.number}.pdf`" @close="previewOpen = false" />

    <!-- ── Recurring settings drawer ── -->
    <ErpDrawer :is-open="recurringDrawerOpen" :title="isSettingRecurring ? t('Set as recurring') : recurringEditing ? t('Edit recurring settings') : t('Recurring settings')" @close="recurringDrawerOpen = false; isSettingRecurring = false">
      <template #body>
        <!-- ── Set as recurring (no template yet) ── -->
        <template v-if="isSettingRecurring">
          <MpFormControl id="recur-set-repeat">
            <MpFormLabel>{{ t('Repeats every') }}</MpFormLabel>
            <div class="recur-edit-repeat-row">
              <MpInput id="recur-set-interval" v-model.number="editRepeatInterval" type="number" :min="1" class="recur-edit-num" />
              <MpAutocomplete id="recur-set-unit" v-model="editRepeatUnit" :data="repeatUnitOptions" label-prop="label" value-prop="value" use-portal is-full-width class="recur-edit-unit" />
            </div>
          </MpFormControl>

          <MpFormControl id="recur-set-end">
            <MpFormLabel>{{ t('End repeat') }}</MpFormLabel>
            <MpAutocomplete id="recur-set-end-inp" v-model="editEndRepeat" :data="endRepeatOptions" label-prop="label" value-prop="value" use-portal is-full-width />
            <div v-if="editEndRepeat === 'after'" class="recur-edit-sub">
              <MpInput id="recur-set-end-count" v-model.number="editEndAfterCount" type="number" :min="1" class="recur-edit-count" />
              <span class="recur-edit-sublabel">{{ t('occurrences') }}</span>
            </div>
            <div v-if="editEndRepeat === 'on'" class="recur-edit-sub">
              <MpDatePicker id="recur-set-end-date" v-model="editEndOnDate" format="DD/MM/YYYY" value-type="format" use-portal />
            </div>
          </MpFormControl>

          <MpFormControl id="recur-set-start">
            <MpFormLabel>{{ t('Start date') }}</MpFormLabel>
            <MpDatePicker id="recur-set-start-date" v-model="editStartDate" format="DD/MM/YYYY" value-type="format" use-portal />
          </MpFormControl>

          <div class="recur-view-row recur-auto-toggle">
            <span class="recur-view-label">{{ t('Send automatic email') }}</span>
            <MpToggle :is-checked="setRecurringSendAutoEmail" @change="setRecurringSendAutoEmail = !setRecurringSendAutoEmail" />
          </div>
        </template>

        <template v-else-if="recurringTemplate?.schedule">
          <!-- ── View mode ── -->
          <template v-if="!recurringEditing">
            <div class="recur-view-section">
              <div class="recur-view-header">
                <span class="recur-view-title">{{ t('Schedule') }}</span>
                <MpTextlink @click="startEditing">{{ t('Edit') }}</MpTextlink>
              </div>

              <div class="recur-view-row">
                <span class="recur-view-label">{{ t('Repeats every') }}</span>
                <span class="recur-view-value">{{ recurringTemplate.schedule.repeatInterval }} {{ unitLabel(recurringTemplate.schedule.repeatUnit) }}</span>
              </div>
              <div class="recur-view-row">
                <span class="recur-view-label">{{ t('End repeat') }}</span>
                <span class="recur-view-value">
                  {{ endRepeatLabel(recurringTemplate.schedule.endRepeat) }}
                  <template v-if="recurringTemplate.schedule.endRepeat === 'after'"> — {{ recurringTemplate.schedule.endAfterCount }} {{ t('occurrences') }}</template>
                  <template v-if="recurringTemplate.schedule.endRepeat === 'on'"> — {{ formatDateDMY(recurringTemplate.schedule.endOnDate!) }}</template>
                </span>
              </div>
              <div class="recur-view-row">
                <span class="recur-view-label">{{ t('Start date') }}</span>
                <span class="recur-view-value">{{ formatDateDMY(recurringTemplate.schedule.startDate) }}</span>
              </div>
            </div>

            <div class="recur-view-row recur-auto-toggle">
              <span class="recur-view-label">{{ t('Send automatic email') }}</span>
              <MpToggle :is-checked="recurringTemplate.schedule.sendAutoEmail" @change="toggleAutoEmail" />
            </div>
          </template>

          <!-- ── Edit mode ── -->
          <template v-else>
            <MpFormControl id="recur-edit-repeat">
              <MpFormLabel>{{ t('Repeats every') }}</MpFormLabel>
              <div class="recur-edit-repeat-row">
                <MpInput id="recur-edit-interval" v-model.number="editRepeatInterval" type="number" :min="1" class="recur-edit-num" />
                <MpAutocomplete id="recur-edit-unit" v-model="editRepeatUnit" :data="repeatUnitOptions" label-prop="label" value-prop="value" use-portal is-full-width class="recur-edit-unit" />
              </div>
            </MpFormControl>

            <MpFormControl id="recur-edit-end">
              <MpFormLabel>{{ t('End repeat') }}</MpFormLabel>
              <MpAutocomplete id="recur-edit-end-inp" v-model="editEndRepeat" :data="endRepeatOptions" label-prop="label" value-prop="value" use-portal is-full-width />
              <div v-if="editEndRepeat === 'after'" class="recur-edit-sub">
                <MpInput id="recur-edit-end-count" v-model.number="editEndAfterCount" type="number" :min="1" class="recur-edit-count" />
                <span class="recur-edit-sublabel">{{ t('occurrences') }}</span>
              </div>
              <div v-if="editEndRepeat === 'on'" class="recur-edit-sub">
                <MpDatePicker id="recur-edit-end-date" v-model="editEndOnDate" format="DD/MM/YYYY" value-type="format" use-portal />
              </div>
            </MpFormControl>

            <MpFormControl id="recur-edit-start">
              <MpFormLabel>{{ t('Start date') }}</MpFormLabel>
              <MpDatePicker id="recur-edit-start-date" v-model="editStartDate" format="DD/MM/YYYY" value-type="format" use-portal />
            </MpFormControl>

            <div class="recur-view-row recur-auto-toggle">
              <span class="recur-view-label">{{ t('Send automatic email') }}</span>
              <MpToggle :is-checked="recurringTemplate.schedule.sendAutoEmail" @change="toggleAutoEmail" />
            </div>
          </template>

          <!-- ── Recurring history (view mode only) ── -->
          <div v-if="!recurringEditing && recurringTemplate.history?.length" class="recur-history-section">
            <h3 class="recur-history-heading">{{ t('Recurring history') }}</h3>
            <div class="recur-history-list">
              <div v-for="entry in recurringTemplate.history" :key="entry.orderNumber" class="recur-history-item">
                <span class="recur-history-number">Sales Order #{{ entry.orderNumber }}</span>
                <span class="recur-history-date">{{ formatDateDMY(entry.date) }}</span>
                <ErpStatusBadge :status="entry.status.toLowerCase()" />
              </div>
            </div>
          </div>
          <div v-else-if="!recurringEditing" class="recur-history-section">
            <h3 class="recur-history-heading">{{ t('Recurring history') }}</h3>
            <p class="recur-history-empty">{{ t('No orders created from this recurring template yet.') }}</p>
          </div>
        </template>
      </template>

      <template v-if="isSettingRecurring" #footer>
        <button class="btn-enterprise btn-enterprise--ghost" @click="isSettingRecurring = false; recurringDrawerOpen = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" @click="saveSetRecurring">{{ t('Save') }}</button>
      </template>
      <template v-else-if="recurringEditing" #footer>
        <button class="btn-enterprise btn-enterprise--ghost" @click="recurringEditing = false">{{ t('Cancel') }}</button>
        <button class="btn-enterprise btn-enterprise--primary" @click="saveEditing">{{ t('Save changes') }}</button>
      </template>
    </ErpDrawer>
  </div>
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
.detail-items-section--bordered .detail-items-count {
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

/* fixed, left-aligned columns for the linked-transactions table (4th col fills) */
.detail-linked { table-layout: fixed; }
.detail-linked-col--date   { width: 160px; }
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
.recur-view-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.recur-view-header { display: flex; align-items: center; justify-content: space-between; }
.recur-view-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.recur-view-row { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.recur-view-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); min-width: 160px; flex-shrink: 0; }
.recur-view-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); }
.recur-auto-toggle { padding-top: var(--mp-spacing-2); }
.recur-edit-repeat-row { display: flex; gap: var(--mp-spacing-2); }
.recur-edit-num { flex: 0 0 80px; }
.recur-edit-unit { flex: 1; }
.recur-edit-sub { display: flex; align-items: center; gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-2); }
.recur-edit-count { flex: 0 0 80px; }
.recur-edit-sublabel { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.recur-history-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); border-top: 1px solid var(--mp-border-default); padding-top: var(--mp-spacing-4); }
.recur-history-heading { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); margin: 0; }
.recur-history-list { display: flex; flex-direction: column; }
.recur-history-item { display: flex; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) 0; border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default)); }
.recur-history-item:last-child { border-bottom: none; }
.recur-history-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-weight: var(--mp-font-weights-semi-bold); min-width: 180px; }
.recur-history-date { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); flex: 1; }
.recur-history-empty { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
