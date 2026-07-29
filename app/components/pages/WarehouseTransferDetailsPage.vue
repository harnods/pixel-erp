<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTooltip, MpIcon, MpSpinner, toast,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay, MpModalCloseButton, css,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ActivityLogModal from '~/components/patterns/ActivityLogModal.vue'
import ApprovalLogModal from '~/components/patterns/ApprovalLogModal.vue'
import { formatDateLong } from '~/utils/date'
import {
  warehouseTransfers, getTransfer, transferLineItems, transferMemo, transferAttachments,
  transferUpdatedBy, transferUpdatedAt, transferActivityEntries, transferApprovalLog,
  canCancelTransfer, cancelTransfer, duplicateTransfer, approveTransfer, canApproveTransfer,
  type TransferApproveCheck,
} from '~/data/warehouseTransfers'
import { useApprovalViewAs } from '~/composables/useApprovalViewAs'

// The catch-all route binds the id via the generic `orderId` prop for every detail page.
const props = defineProps<{ orderId: string }>()
const router = useRouter()

// Shared with the index page — "As user" (no Approve) vs "As manager" (can approve).
const { viewAs, setViewAs } = useApprovalViewAs()
const viewAsOptions: { value: 'user' | 'manager'; label: string }[] = [
  { value: 'user', label: 'As user' },
  { value: 'manager', label: 'As manager' },
]

const transfer = computed(() => getTransfer(props.orderId))
const lineItems = computed(() => transfer.value ? transferLineItems(transfer.value) : [])
const memo = computed(() => transfer.value ? transferMemo(transfer.value) : '')
const attachments = computed(() => transfer.value ? transferAttachments(transfer.value) : [])
const lastUpdatedBy = computed(() => transfer.value ? transferUpdatedBy(transfer.value) : '')
const lastUpdatedAt = computed(() => transfer.value ? transferUpdatedAt(transfer.value) : new Date().toISOString())
const activityEntries = computed(() => transfer.value ? transferActivityEntries(transfer.value) : [])
const approvalLog = computed(() => transfer.value ? transferApprovalLog(transfer.value) : null)
const approvalLogOpen = ref(false)
// Approve is only offered to a manager viewing a transfer that's still awaiting approval.
const canApprove = computed(() => viewAs.value === 'manager' && transfer.value?.status === 'draft')
// Map an approval refusal reason to a human-readable toast title.
function approveErrorTitle(check: TransferApproveCheck): string {
  if (check.ok) return "Can't approve this transfer"
  if (check.reason.startsWith('INSUFFICIENT_STOCK')) return "Can't approve: not enough stock at origin"
  if (check.reason === 'WAREHOUSE_ARCHIVED') return "Can't approve: a warehouse involved is archived"
  if (check.reason === 'SAME_WAREHOUSE') return "Can't approve: origin and destination are the same"
  return "Can't approve this transfer"
}
function approve() {
  if (!transfer.value) return
  const id = transfer.value.id
  const wasDraft = transfer.value.status === 'draft'
  const result = approveTransfer(id)
  if (wasDraft && result === undefined) {
    toast.notify({ variant: 'error', title: approveErrorTitle(canApproveTransfer(id)) , maxWidth: 'max-content'})
    return
  }
  toast.notify({ variant: 'success', title: `${transfer.value.number} approved` , maxWidth: 'max-content'})
}

function fmt(n: number) { return n.toLocaleString('id-ID') }

// ── Line items — auto lazy-load, internal scroll & border past 10 rows ─────────
const PAGE_SIZE = 10
const shownCount = ref(PAGE_SIZE)
const loadingMore = ref(false)
const visibleItems = computed(() => lineItems.value.slice(0, shownCount.value))
const hasMoreItems = computed(() => shownCount.value < lineItems.value.length)
const itemsProgressive = computed(() => lineItems.value.length > PAGE_SIZE)

function loadMoreItems() {
  if (loadingMore.value || !hasMoreItems.value) return
  loadingMore.value = true
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, lineItems.value.length)
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
    ? warehouseTransfers.filter(t => t.number.toLowerCase().includes(q) || t.originName.toLowerCase().includes(q) || t.destinationName.toLowerCase().includes(q))
    : warehouseTransfers
  return matched.slice(0, 6)
})
function jumpTo(id: string) { jumpSearch.value = ''; router.push(`/warehouse-transfers/${id}`) }

function goBack() { router.push('/warehouse-transfers') }
function preview() { /* opens the printable preview — not built in this prototype */ }
function printPdf() { /* generates the transfer PDF — not built in this prototype */ }
function editTransfer() { router.push(`/warehouse-transfers/${props.orderId}/edit`) }
function duplicate() {
  const copy = duplicateTransfer(props.orderId)
  if (copy) router.push(`/warehouse-transfers/${copy.id}/edit`)
}

// ── Cancel (single) — only while still a draft; once approved, stock has already
// moved (applyTransfer runs at approval time) so there's nothing left to void —
// the transfer is a permanent record from that point on, never deletable. ──────
const canCancel = computed(() => !!transfer.value && canCancelTransfer(transfer.value))
const cancelOpen = ref(false)
function askCancel() { cancelOpen.value = true }
function confirmCancel() {
  cancelTransfer(props.orderId)
  cancelOpen.value = false
  toast.notify({ variant: 'success', title: `${transfer.value?.number} canceled`, maxWidth: 'max-content' })
  router.push('/warehouse-transfers')
}

// Footer divider appears only when the stage actually scrolls.
const stageEl = ref<HTMLElement | null>(null)
const stageOverflowing = ref(false)
function checkOverflow() { const el = stageEl.value; if (el) stageOverflowing.value = el.scrollHeight > el.clientHeight + 1 }
let ro: ResizeObserver | null = null
onMounted(() => nextTick(() => {
  checkOverflow()
  ro = new ResizeObserver(checkOverflow)
  if (stageEl.value) { ro.observe(stageEl.value); stageEl.value.addEventListener('scroll', checkOverflow, { passive: true }) }
}))
onUnmounted(() => { ro?.disconnect(); stageEl.value?.removeEventListener('scroll', checkOverflow) })
</script>

<template>
  <div v-if="transfer" class="detail-page">

    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">All warehouse transfers</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ transfer.number }}</h1>
          <ErpStatusBadge
            v-if="transfer.status === 'draft' || transfer.status === 'canceled'"
            :status="transfer.status" badge-for="additionalInformation" size="md"
          />
          <MpPopover id="wtd-jump" use-portal :is-keep-alive="false" placement="bottom-start">
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
                  <button v-if="jumpSearch" class="search-clear-btn search-clear-btn--overlay" type="button" aria-label="Clear search" @click="jumpSearch = ''">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
                    </svg>
                  </button>
                </div>
                <div class="detail-jump-list">
                  <button v-for="t in jumpResults" :key="t.id" class="detail-jump-item" @click="jumpTo(t.id)">
                    <span class="detail-jump-item-number">{{ t.number }}</span>
                    <span class="detail-jump-item-customer">{{ t.originName }} → {{ t.destinationName }}</span>
                  </button>
                  <p v-if="!jumpResults.length" class="detail-jump-empty">No transactions found.</p>
                </div>
              </div>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </div>

      <!-- Right-side actions (warehouse transfer has an approval flow) —
           manager view adds a primary Approve button ahead of the icon actions. -->
      <div class="detail-titlerow-right">
        <button v-if="canApprove" class="btn-enterprise btn-enterprise--primary" @click="approve">Approve</button>
        <MpTooltip id="wtd-tt-tasks" label="Approval log" placement="bottom" use-portal>
          <button class="detail-icon-btn" aria-label="Approval log" @click="approvalLogOpen = true"><MpIcon name="task-todo" size="md" /></button>
        </MpTooltip>
        <MpTooltip id="wtd-tt-comments" label="Comments" placement="bottom" use-portal>
          <button class="detail-icon-btn" aria-label="Comments"><MpIcon name="comment" size="md" /></button>
        </MpTooltip>
      </div>
    </header>

    <div ref="stageEl" class="detail-stage">

      <!-- Header summary -->
      <section class="wtd-summary">
        <div class="content-list-col">
          <ContentList label="Transaction date" :value="formatDateLong(transfer.date)" />
          <ContentList label="Transaction no." :value="transfer.number" />
        </div>
        <div class="content-list-col">
          <ContentList label="Origin warehouse">
            <a class="cell-link" @click.stop="router.push(`/warehouses/${transfer.originId}`)">{{ transfer.originName }}</a>
          </ContentList>
          <ContentList label="Destination warehouse">
            <a class="cell-link" @click.stop="router.push(`/warehouses/${transfer.destinationId}`)">{{ transfer.destinationName }}</a>
          </ContentList>
        </div>
        <div class="content-list-col">
          <ContentList label="Tags">
            <ErpTagList v-if="transfer.tags.length" :tags="transfer.tags" />
            <span v-else class="detail-note-text">—</span>
          </ContentList>
        </div>
      </section>

      <!-- Line items -->
      <section class="detail-items-section" :class="{ 'detail-items-section--bordered': itemsProgressive }">
        <div ref="itemsScrollEl" class="detail-items-scroll">
          <table class="detail-items">
            <thead>
              <tr>
                <th class="detail-th">Product</th>
                <th class="detail-th">SKU</th>
                <th class="detail-th detail-th--num">Transfer qty</th>
                <th class="detail-th">Unit</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in visibleItems" :key="item.key" class="detail-item-row">
                <td class="detail-td"><ProductCell :name="item.product.name" :desc="item.product.desc" :image="item.product.img" /></td>
                <td class="detail-td">{{ item.sku }}</td>
                <td class="detail-td detail-td--num">{{ fmt(item.qty) }}</td>
                <td class="detail-td">{{ item.unit }}</td>
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
      <MpPopover id="wtd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="top-end">
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
            <div class="wtd-menu-divider" role="separator" style="height:1px;margin:4px 0;background:var(--mp-border-default);" />
            <MpPopoverListItem v-if="transfer.status === 'draft'" @click="editTransfer">Edit</MpPopoverListItem>
            <MpPopoverListItem @click="duplicate">Duplicate</MpPopoverListItem>
            <MpPopoverListItem
              v-if="canCancel"
              :class="css({ color: 'var(--mp-text-critical)' })"
              @click="askCancel"
            >Cancel</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </footer>

    <ActivityLogModal
      :is-open="activityOpen"
      :subject="transfer.number"
      :updated-by="lastUpdatedBy"
      :updated-at="lastUpdatedAt"
      :entries="activityEntries"
      @close="activityOpen = false"
    />

    <ApprovalLogModal
      :is-open="approvalLogOpen"
      :subject="transfer.number"
      :log="approvalLog"
      @close="approvalLogOpen = false"
    />

    <!-- Cancel warehouse transfer -->
    <MpModal
      id="wtd-cancel" :is-open="cancelOpen" size="md"
      is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="cancelOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>Cancel warehouse transfer?<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <p>This transfer will be canceled and can no longer be approved. This can't be undone.</p>
        </MpModalBody>
        <MpModalFooter>
          <div class="modal-footer-btns">
            <button class="btn-enterprise btn-enterprise--ghost" @click="cancelOpen = false">Keep transfer</button>
            <button class="btn-enterprise btn-enterprise--danger" @click="confirmCancel">Cancel transfer</button>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

  </div>

  <div v-else class="wtd-not-found">
    <p>Warehouse transfer not found.</p>
    <button class="detail-breadcrumb" @click="goBack">Back to warehouse transfers</button>
  </div>

  <!-- ── Demo scenario FAB (bottom-right) — shared with the index page ── -->
  <MpPopover id="wtd-demo-fab" is-close-on-select use-portal placement="top-end">
    <MpPopoverTrigger>
      <button class="demo-fab" aria-label="Change approval view">
        <MpIcon name="sliders" size="md" color="icon.inverse" />
      </button>
    </MpPopoverTrigger>
    <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
      <p class="demo-fab-heading">Approval view</p>
      <MpPopoverList>
        <MpPopoverListItem
          v-for="v in viewAsOptions" :key="v.value"
          :is-active="v.value === viewAs" @click="setViewAs(v.value)"
        >{{ v.label }}</MpPopoverListItem>
      </MpPopoverList>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.detail-page { display: flex; flex-direction: column; height: 100%; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-titlerow-right { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }
.detail-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px); border-radius: var(--mp-radii-md); background: none; border: none; cursor: pointer; color: var(--mp-icon-default); }
.detail-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump-chevron { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px); background: none; border: none; padding: 0; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.detail-jump-chevron:hover { background: var(--mp-background-neutral-hovered); }
.detail-jump { display: flex; flex-direction: column; }
.detail-jump-search-wrap { padding: var(--mp-spacing-3); position: relative; }
.detail-jump-search { width: 100%; box-sizing: border-box; padding: var(--mp-spacing-2) var(--mp-spacing-3); border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none; padding-right: 34px; }
.detail-jump-search:focus { border-color: var(--mp-border-brand-bold, #029861); }
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
.detail-jump-item { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); width: 100%; text-align: left; background: none; border: none; cursor: pointer; padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md); }
.detail-jump-item:hover { background: var(--mp-background-neutral-subtle); }
.detail-jump-item-number { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.detail-jump-item-customer { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.detail-jump-empty { margin: 0; padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-2xl, 32px); letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }

.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; gap: var(--mp-spacing-8); }
/* Three columns, each up to 318px; they shrink together (minmax floor 0) when the
   viewport is tight so the grid stays 3-up and responsive instead of overflowing. */
.wtd-summary { display: grid; grid-template-columns: repeat(3, minmax(0, 318px)); column-gap: var(--mp-spacing-6); row-gap: 0; }
.content-list-col { display: flex; flex-direction: column; }

.detail-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.detail-items-section--bordered { border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md); overflow: hidden; }
.detail-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.detail-items { width: 100%; border-collapse: collapse; table-layout: auto; }
.detail-th { height: var(--mp-sizes-7, 28px); text-align: left; padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2); background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase; border-bottom: 1px solid var(--mp-border-default); white-space: nowrap; }
.detail-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.detail-td { padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); vertical-align: top; }
.detail-items .detail-th { position: sticky; top: 0; z-index: 1; }
.detail-items-sentinel { height: 1px; }
.detail-loading { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); color: var(--mp-text-secondary); }
.detail-items-loading { justify-content: center; padding: var(--mp-spacing-3); }
.detail-items-count { display: flex; align-items: center; margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-2); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); border-bottom: 1px solid var(--mp-border-default); }
.detail-td--num { text-align: right; white-space: nowrap; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }

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
.detail-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-default); }
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.detail-btn--primary { background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff); }
.detail-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }

.wtd-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); flex: 1; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* Divider between action-menu groups (background line — reliably visible inside the
   portaled popover list, where a 0-height border can get reset away). */
.wtd-menu-divider { display: block; height: 1px; margin: var(--mp-spacing-1) 0; background: var(--mp-border-default); }

/* Cancel modal */
.modal-footer-btns { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3); width: 100%; }

/* Demo scenario FAB (matches the index page) */
.demo-fab {
  position: fixed; right: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse, #080d0e); color: #fff;
  cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2);
}
.demo-fab:hover { opacity: 0.9; }
.demo-fab-heading { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

</style>
