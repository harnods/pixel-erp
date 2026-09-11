<script setup lang="ts">
/**
 * CRM (Qontak) — Deal record detail (/crm/deals/:id). ERP transaction detail-page
 * format (docs/patterns/details-page-format.md §A): title bar → pipeline stepper
 * (segmented bar) → tabs (Deal details · Activity · Notes · Files · Sales orders).
 *
 * Stage flow:
 *  • "Mark as won" (primary) → marks the deal Won → asks "Create sales order?" →
 *    full-screen CrmCreateTransactionDrawer (embedded ERP sales-order form, prefilled).
 *  • Split chevron → inline stage picker (no modal). Picking Proposal → asks
 *    "Create sales quote?" → the same drawer (embedded ERP sales-quote form).
 *  • "Mark as lost" → CrmDealStageModal (captures a Lost reason).
 * A Lost deal shows the terminal stepper node as red "Lost".
 */
import { ref, computed } from 'vue'
import {
  MpIcon, MpButton, css,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel, MpTextlink,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ErpTagList from '~/components/patterns/ErpTagList.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import CrmDealStageModal from '~/components/patterns/CrmDealStageModal.vue'
import CrmCreateTransactionDrawer from '~/components/patterns/CrmCreateTransactionDrawer.vue'
import ActivityLogTable from '~/components/patterns/ActivityLogTable.vue'
import CrmNotesPanel from '~/components/patterns/CrmNotesPanel.vue'
import FilePreviewModal from '~/components/patterns/FilePreviewModal.vue'
import CrmEditProductsDrawer from '~/components/patterns/CrmEditProductsDrawer.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import { formatMoney } from '~/utils/currency'
import { successToast, infoToast } from '~/utils/toasts'
import {
  getDeal, ONGOING_STAGES, moveDealStage, archiveDeal, restoreDeal, deleteDeal,
  dealConversionTarget, dealTotals, dealExpectedValue, dealDaysInStage, dealStageAgingDays, formatAging,
  dealActivityLog, addDealAttachment, removeDealAttachment, setDealProductsFull,
  getDealSalesOrder, linkDealSalesOrder,
  lineSubtotal, crmCustomers, dealNo, dealStageLabel,
  type DealStage, type DealLineItem, type DealAttachment, type DealProductsPayload,
} from '~/data/crm'

const currentUser = 'Rizal Candra'

// ERP sales-order status → ErpStatusBadge (mirrors the ERP Sales Orders index).
const ORDER_STATUS: Record<string, { label: string; type: 'completed' | 'warning' | 'information' | 'announcement' }> = {
  open: { label: 'Open', type: 'information' },
  'partially processed': { label: 'Partially processed', type: 'warning' },
  closed: { label: 'Closed', type: 'completed' },
  voided: { label: 'Voided', type: 'announcement' },
}

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const { t } = useLocale()

const deal = computed(() => getDeal(props.orderId))
const money = (n: number) => formatMoney(n, deal.value?.currency ?? 'IDR')
const totals = computed(() => (deal.value ? dealTotals(deal.value) : null))
void lineSubtotal

// ── Linked records ──
const customer = computed(() => (deal.value ? crmCustomers.find((c) => c.id === deal.value!.customerId) : undefined))
const linkedOrder = computed(() => (deal.value ? getDealSalesOrder(deal.value) : undefined))

// ── State flags ──
const isConverted = computed(() => deal.value?.conversion === 'converted')
const isFailed = computed(() => deal.value?.conversion === 'failed')
const isArchived = computed(() => !!deal.value?.archived)
const isWon = computed(() => deal.value?.stage === 'Won')
const isLost = computed(() => deal.value?.stage === 'Lost')
const isOngoing = computed(() => !isWon.value && !isLost.value)
const convTarget = computed(() => deal.value?.convertedTarget ?? dealConversionTarget.value)
const dealNumber = computed(() => (deal.value ? dealNo(deal.value.id) : ''))

// ── Pipeline stepper (segmented bar) ──
const FORWARD_STAGES: DealStage[] = ['Open Lead', '1st Meeting', 'Proposal', 'Negotiation', 'Won']
const currentStageIndex = computed(() => (deal.value ? FORWARD_STAGES.indexOf(deal.value.stage) : -1))
const stepLabels = computed(() =>
  (['Open Lead', '1st Meeting', 'Proposal', 'Negotiation', isLost.value ? 'Lost' : 'Won'] as DealStage[])
    .map((s) => t(dealStageLabel(s))),
)
const agingMap = computed(() => (deal.value ? dealStageAgingDays(deal.value) : {} as Record<string, number>))
function isFilled(i: number) { return isLost.value ? i <= 3 : i <= currentStageIndex.value }
function isLostNode(i: number) { return isLost.value && i === 4 }
function isCurrentStep(i: number) { return !isLost.value && i === currentStageIndex.value }
function isDoneStep(i: number) { return (!isLost.value && i < currentStageIndex.value) || (isLost.value && i <= 3) }
function agingLabel(i: number) {
  const days = agingMap.value[FORWARD_STAGES[i]!]
  return days == null ? '' : formatAging(days)
}

// ── Activity log — all events for this deal (created · stage moves · edits w/
// old → new · conversion / lost / archive), same table as ActivityLogModal ──
const dealActivity = computed(() => (deal.value ? dealActivityLog(deal.value) : []))

// ── Stage moves ──
function moveTo(stage: DealStage): boolean {
  const d = deal.value; if (!d) return false
  const r = moveDealStage(d.id, stage)
  if (!r.ok) { infoToast(r.error ?? t('Could not change stage')); return false }
  successToast(`${t('Stage changed to')} ${stage}`)
  return true
}
// "Mark as won" → mark Won, then offer to create a sales order.
function markWon() { if (moveTo('Won')) createSoAskOpen.value = true }
// Stage picker (chevron popover) → move directly; Proposal offers a sales quote.
function onPickStage(stage: DealStage) {
  if (moveTo(stage) && stage === 'Proposal') createSqAskOpen.value = true
}

// Lost (needs a reason) / reopen — via CrmDealStageModal
const stageModalOpen = ref(false)
const stagePreset = ref<DealStage | null>(null)
const stageAllowed = ref<DealStage[] | undefined>(undefined)
function openMarkLost() { stagePreset.value = 'Lost'; stageAllowed.value = undefined; stageModalOpen.value = true }
function openReopen() { stagePreset.value = null; stageAllowed.value = [...ONGOING_STAGES]; stageModalOpen.value = true }
const reopenConfirmOpen = ref(false)
const pendingStage = ref<DealStage | null>(null)
function onStageConfirm(payload: { stage: DealStage; lostReason?: string }) {
  stageModalOpen.value = false
  const d = deal.value; if (!d) return
  // Moving a CLOSED deal (Won/Lost) back to an ongoing stage → confirm first.
  if ((d.stage === 'Lost' || d.stage === 'Won') && payload.stage !== 'Lost') {
    pendingStage.value = payload.stage; reopenConfirmOpen.value = true; return
  }
  const r = moveDealStage(d.id, payload.stage, { lostReason: payload.lostReason })
  if (r.ok) successToast(`${t('Stage changed to')} ${payload.stage}`)
  else infoToast(r.error ?? t('Could not change stage'))
}
function confirmReopen() {
  const d = deal.value
  if (d && pendingStage.value) { const r = moveDealStage(d.id, pendingStage.value); if (r.ok) successToast(t('Deal reopened')) }
  reopenConfirmOpen.value = false; pendingStage.value = null
}

// ── Create sales order / quote (full-screen drawer, embedded ERP form) ──
const createSoAskOpen = ref(false)
const createSqAskOpen = ref(false)
const txDrawerOpen = ref(false)
const txDrawerKind = ref<'sales-order' | 'sales-quote'>('sales-order')
function openSoDrawer() { txDrawerKind.value = 'sales-order'; txDrawerOpen.value = true }
function openSqDrawer() { txDrawerKind.value = 'sales-quote'; txDrawerOpen.value = true }
// Won primary: open the linked order if converted, else start the create flow.
function onCreateSalesOrder() {
  if (isConverted.value && deal.value?.salesOrderId) { goOrder(deal.value.salesOrderId); return }
  openSoDrawer()
}
function onTxCreated(payload?: { id?: string }) {
  txDrawerOpen.value = false
  // A created sales order links back to the deal so the Sales orders tab shows it.
  if (txDrawerKind.value === 'sales-order' && payload?.id && deal.value) {
    linkDealSalesOrder(deal.value.id, { id: payload.id })
  }
}

// ── Archive / restore / delete ──
const archiveConfirmOpen = ref(false)
function confirmArchive() { const d = deal.value; if (d) { archiveDeal(d.id); successToast(t('Deal archived')) } archiveConfirmOpen.value = false }
function onRestore() { const d = deal.value; if (d) { restoreDeal(d.id); successToast(t('Deal restored')) } }
const deleteConfirmOpen = ref(false)
function confirmDelete() {
  const d = deal.value
  deleteConfirmOpen.value = false
  if (d) { deleteDeal(d.id); successToast(t('Deal deleted')); router.push('/crm') }
}

// ── Formatters ──
function fmtDate(iso?: string) {
  return iso ? new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(iso)) : '—'
}
function lineDiscountText(li: DealLineItem) {
  if (li.discountType === 'percentage' && li.discount) return `${li.discount}%`
  if (li.discountType === 'fixed' && li.discount) return money(li.discount)
  return ''
}
function deductionText(amount: number) { return amount > 0 ? `(${money(amount)})` : money(0) }
function attachmentIcon(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(ext)) return 'image-document'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'excel-document'
  if (['doc', 'docx'].includes(ext)) return 'word-document'
  return 'attachment'
}
void dealDaysInStage

// ── Products (Deal details): search + Add product drawer ──
const productSearch = ref('')
const visibleProducts = computed(() => {
  const list = deal.value?.products ?? []
  const q = productSearch.value.trim().toLowerCase()
  return q ? list.filter((li) => li.productName.toLowerCase().includes(q) || (li.sku ?? '').toLowerCase().includes(q)) : list
})
const productDrawerOpen = ref(false)
function onProductsSaved(payload: DealProductsPayload) {
  const d = deal.value; if (!d) return
  setDealProductsFull(d.id, payload)
  productDrawerOpen.value = false
  successToast(t('Products updated'))
}

// ── Files tab: search · upload · preview · download · delete ──
const RENDERABLE = /\.(pdf|png|jpe?g|gif|webp|svg|bmp)$/i
const fileSearch = ref('')
const visibleAttachments = computed(() => {
  const list = deal.value?.attachments ?? []
  const q = fileSearch.value.trim().toLowerCase()
  return q ? list.filter((a) => a.name.toLowerCase().includes(q)) : list
})
// Hidden input driven by the "Upload file" button (no dropzone).
const fileInput = ref<HTMLInputElement | null>(null)
function pickFiles() { fileInput.value?.click() }
function onFileInput(e: Event) {
  const files = (e.target as HTMLInputElement | null)?.files
  if (files?.length) onUploadFiles(files)
  if (fileInput.value) fileInput.value.value = ''
}
function onUploadFiles(files: FileList) {
  const d = deal.value; if (!d) return
  let n = 0
  for (const f of Array.from(files)) {
    addDealAttachment(d.id, {
      name: f.name,
      sizeKB: Math.round((f.size / 1024) * 10) / 10,
      uploadedBy: currentUser,
      uploadedAt: new Date().toISOString().slice(0, 19),
      src: URL.createObjectURL(f),
    })
    n++
  }
  if (n) successToast(n > 1 ? `${n} ${t('files uploaded')}` : t('File uploaded'))
}

const previewOpen = ref(false)
const previewSrc = ref('')
const previewName = ref('')
const previewKind = ref<'pdf' | 'image' | undefined>(undefined)
function placeholderPreview(name: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="100%" height="100%" fill="#f1f5f9"/><text x="50%" y="47%" font-family="sans-serif" font-size="26" fill="#8c9596" text-anchor="middle">${name}</text><text x="50%" y="55%" font-family="sans-serif" font-size="15" fill="#b0b7bb" text-anchor="middle">Preview not available in this demo</text></svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}
function openPreview(a: DealAttachment) {
  if (a.src && RENDERABLE.test(a.name)) { previewSrc.value = a.src; previewKind.value = undefined }
  else { previewSrc.value = placeholderPreview(a.name); previewKind.value = 'image' }
  previewName.value = a.name
  previewOpen.value = true
}
function downloadFile(a: DealAttachment) {
  if (a.src) {
    const el = document.createElement('a')
    el.href = a.src; el.download = a.name
    document.body.appendChild(el); el.click(); el.remove()
  } else {
    infoToast(`${t('This demo file has no downloadable content.')}`)
  }
}
const fileDeleteOpen = ref(false)
const fileToDelete = ref<DealAttachment | null>(null)
function askDeleteFile(a: DealAttachment) { fileToDelete.value = a; fileDeleteOpen.value = true }
function confirmDeleteFile() {
  const d = deal.value
  if (d?.attachments && fileToDelete.value) {
    const idx = d.attachments.indexOf(fileToDelete.value)
    if (idx !== -1) { removeDealAttachment(d.id, idx); successToast(t('File deleted')) }
  }
  fileDeleteOpen.value = false; fileToDelete.value = null
}
function fmtUploaded(iso?: string) { return iso ? formatDateTime(iso) : '—' }

function goOrder(id: string) { router.push(`/crm/orders/${id}`) }
function goSalesOrder(id: string) { router.push(`/sales-orders/${id}`) }
function goCustomer(id: string) { router.push(`/crm/customers/${id}`) }
</script>

<template>
  <div v-if="deal" class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <MpTextlink id="deal-breadcrumb" as="a" class="detail-breadcrumb" @click.prevent="router.push('/crm')">{{ t('Deals') }}</MpTextlink>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ deal.name }}</h1>
          <ErpStatusBadge v-if="deal.archived" status="archived" type="announcement" label="Archived" />
        </div>
      </div>

      <div class="detail-titlerow-right">
        <!-- Ongoing: "Mark as won" split button + inline stage picker -->
        <div v-if="!isArchived && isOngoing" class="detail-split-btn">
          <button class="btn-enterprise btn-enterprise--primary detail-split-btn__main" @click="markWon">{{ t('Mark as won') }}</button>
          <MpPopover id="deal-stage-menu" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <button class="btn-enterprise btn-enterprise--primary detail-split-btn__chevron" :aria-label="t('Change stage')">
                <MpIcon name="chevrons-down" size="sm" />
              </button>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content', whiteSpace: 'nowrap' })">
              <p class="deal-stage-menu-label">{{ t('Move to stage') }}</p>
              <MpPopoverList>
                <MpPopoverListItem v-for="s in ONGOING_STAGES.filter((x) => x !== deal!.stage)" :key="s" @click="onPickStage(s)">{{ s }}</MpPopoverListItem>
              </MpPopoverList>
              <div :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
              <MpPopoverList>
                <MpPopoverListItem @click="openMarkLost">{{ t('Mark as lost') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
        <!-- Won (not yet converted): create the sales order. A converted Won deal has
             no primary — its sales order lives in the Sales orders tab. -->
        <button v-else-if="!isArchived && isWon && !isConverted" class="btn-enterprise btn-enterprise--primary" @click="openSoDrawer">{{ t('Create sales order') }}</button>
        <!-- Lost: reopen -->
        <button v-else-if="!isArchived && isLost" class="btn-enterprise btn-enterprise--primary" @click="openReopen">{{ t('Reopen deal') }}</button>
        <!-- Archived: restore -->
        <button v-else-if="isArchived" class="btn-enterprise btn-enterprise--secondary" @click="onRestore">{{ t('Restore') }}</button>

        <!-- Kebab -->
        <MpPopover id="deal-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <MpButton class="detail-icon-btn" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
            <template v-if="isArchived">
              <MpPopoverList>
                <MpPopoverListItem @click="deleteConfirmOpen = true">{{ t('Delete') }}</MpPopoverListItem>
              </MpPopoverList>
            </template>
            <template v-else>
              <!-- A Won deal can be moved back to an earlier stage, or marked Lost. -->
              <MpPopoverList v-if="isWon">
                <MpPopoverListItem @click="openReopen">{{ t('Move to stage…') }}</MpPopoverListItem>
                <MpPopoverListItem @click="openMarkLost">{{ t('Mark as lost') }}</MpPopoverListItem>
              </MpPopoverList>
              <div v-if="isWon" :class="css({ height: '1px', backgroundColor: 'var(--mp-border-default)', marginTop: 'var(--mp-spacing-1)', marginBottom: 'var(--mp-spacing-1)' })" />
              <MpPopoverList>
                <MpPopoverListItem @click="router.push(`/crm/deals/${deal.id}/edit`)">{{ t('Edit') }}</MpPopoverListItem>
                <MpPopoverListItem @click="archiveConfirmOpen = true">{{ t('Archive') }}</MpPopoverListItem>
                <MpPopoverListItem @click="deleteConfirmOpen = true">{{ t('Delete') }}</MpPopoverListItem>
              </MpPopoverList>
            </template>
          </MpPopoverContent>
        </MpPopover>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- Contextual banners -->
      <div v-if="isArchived" class="detail-banner detail-banner--muted">
        <MpIcon name="information" size="md" class="detail-banner-icon" />
        <span class="detail-banner-text">{{ t('This deal is archived — hidden from active views and metrics. Restore it to edit, change stage, or convert.') }}</span>
      </div>
      <div v-else-if="isFailed" class="detail-banner detail-banner--warn">
        <MpIcon name="information" size="md" class="detail-banner-icon" />
        <span class="detail-banner-text">{{ deal.conversionError }}</span>
      </div>
      <div v-else-if="isConverted" class="detail-banner">
        <MpIcon name="information" size="md" class="detail-banner-icon" />
        <span class="detail-banner-text">{{ t('This deal is linked to') }} {{ convTarget }} <template v-if="linkedOrder">#{{ linkedOrder.number }}</template>. {{ t('Editing the deal does not update the ERP transaction.') }}</span>
      </div>
      <div v-else-if="isLost" class="detail-banner detail-banner--warn">
        <MpIcon name="information" size="md" class="detail-banner-icon" />
        <span class="detail-banner-text">{{ t('This deal was marked Lost.') }}<span v-if="deal.lostReason">&nbsp;{{ t('Reason') }}: {{ deal.lostReason }}.</span></span>
      </div>

      <!-- ── Pipeline stepper (segmented bar) ── -->
      <section class="deal-stepper">
        <div class="deal-stepper-labels">
          <div
            v-for="(label, i) in stepLabels"
            :key="i"
            class="deal-step"
            :class="{ 'deal-step--current': isCurrentStep(i), 'deal-step--done': isDoneStep(i), 'deal-step--lost': isLostNode(i) }"
          >
            <span class="deal-step-name">{{ label }}</span>
            <span v-if="agingLabel(i)" class="deal-step-dur">{{ agingLabel(i) }}</span>
          </div>
        </div>
        <div class="deal-stepper-bar">
          <span
            v-for="(label, i) in stepLabels"
            :key="i"
            class="deal-bar-seg"
            :class="{ 'deal-bar-seg--filled': isFilled(i) && !isLostNode(i), 'deal-bar-seg--lost': isLostNode(i) }"
          />
        </div>
      </section>

      <!-- ── Tabs ── -->
      <MpTabs :key="deal.id" id="deal-tabs" :default-value="0" variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab id="deal-tab-details" value="details">{{ t('Deal details') }}</MpTab>
          <MpTab id="deal-tab-activity" value="activity">{{ t('Activity') }}</MpTab>
          <MpTab id="deal-tab-notes" value="notes">{{ t('Notes') }}</MpTab>
          <MpTab id="deal-tab-files" value="files">{{ t('Files') }}</MpTab>
          <MpTab id="deal-tab-orders" value="orders">{{ t('ERP transactions') }}</MpTab>
        </MpTabList>
        <MpTabPanels>

          <!-- ── Deal details ── -->
          <MpTabPanel value="details">
            <section class="detail-summary">
              <!-- Primary row: Customer · Contact person · emphasised Deal value -->
              <div class="content-list-grid">
                <div class="content-list-col">
                  <ContentList :label="t('Customer')">
                    <a v-if="customer" class="cell-link" @click="goCustomer(customer.id)">{{ deal.company }}</a>
                    <span v-else>{{ deal.company }}</span>
                  </ContentList>
                </div>
                <div class="content-list-col deal-contact-col">
                  <ContentList :label="t('Contact person')">
                    <div v-if="deal.contacts?.length" class="deal-contacts">
                      <div v-for="(cp, i) in deal.contacts" :key="i" class="deal-contact">
                        <span class="deal-contact-name">{{ cp.name }}</span>
                        <a v-if="cp.email" class="deal-contact-line cell-link" :href="`mailto:${cp.email}`">{{ cp.email }}</a>
                        <span v-if="cp.phone" class="deal-contact-line">{{ cp.phone }}</span>
                      </div>
                    </div>
                    <template v-else>—</template>
                  </ContentList>
                </div>
                <div class="detail-primary-total">
                  <span class="detail-total-label">{{ t('Deal value') }}</span>
                  <span class="detail-total-amount">{{ money(dealExpectedValue(deal)) }}</span>
                </div>
              </div>

              <div class="detail-divider" />

              <!-- Detail grid: col 1 = 318px, col 2+ fill equally (max 5 cols) -->
              <div class="content-list-grid">
                <div class="content-list-col">
                  <ContentList :label="t('Billing address')" :value="deal.billingAddress || '—'" />
                  <ContentList :label="t('Ship to')" :value="deal.shipTo || '—'" />
                </div>
                <div class="content-list-col">
                  <ContentList :label="t('Transaction date')" :value="fmtDate(deal.transactionDate || deal.createdAt)" />
                  <ContentList :label="t('Due date')" :value="fmtDate(deal.expectedCloseDate)" />
                  <ContentList :label="t('Payment terms')" :value="deal.paymentTerms || '—'" />
                </div>
                <div class="content-list-col">
                  <ContentList :label="t('Ship date')" :value="fmtDate(deal.shipDate)" />
                  <ContentList :label="t('Ship via')" :value="deal.shipVia || '—'" />
                  <ContentList :label="t('Tracking no.')" :value="deal.trackingNo || '—'" />
                </div>
                <div class="content-list-col">
                  <ContentList :label="t('Transaction no.')" :value="dealNumber" />
                  <ContentList :label="t('Reference no.')" :value="deal.referenceNumber || '—'" />
                  <ContentList :label="t('Warehouse')" :value="deal.warehouse || '—'" />
                </div>
              </div>
            </section>

            <!-- ── Line items ── -->
            <section class="detail-items-section detail-details-block">
              <!-- Filter bar — left empty; right = search + tertiary "Add product" -->
              <div class="deal-files-filterbar">
                <div class="filter-left" />
                <div class="filter-right">
                  <div class="filter-search">
                    <MpIcon name="search" size="sm" />
                    <input v-model="productSearch" class="filter-search-input" type="text" :placeholder="t('Search products…')" />
                    <button v-if="productSearch" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="productSearch = ''"><MpIcon name="close" size="sm" /></button>
                  </div>
                  <MpButton variant="tertiary" is-rounded left-icon="add" @click="productDrawerOpen = true">{{ t('Add product') }}</MpButton>
                </div>
              </div>

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
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(li, i) in visibleProducts" :key="li.productId + i" class="detail-item-row">
                    <td class="detail-td">
                      <ProductCell :name="li.productName" :image="li.image" :desc="li.sku ? `${t('SKU')}: ${li.sku}` : undefined" />
                    </td>
                    <td class="detail-td detail-td--muted">{{ li.description || '—' }}</td>
                    <td class="detail-td detail-td--num">{{ li.quantity }}</td>
                    <td class="detail-td">{{ li.unit }}</td>
                    <td class="detail-td detail-td--num">{{ money(li.originalPrice) }}</td>
                    <td class="detail-td detail-td--num">{{ lineDiscountText(li) }}</td>
                    <td class="detail-td">{{ totals!.taxLabel }}</td>
                  </tr>
                  <tr v-if="!visibleProducts.length">
                    <td class="detail-td detail-td--muted" colspan="7">
                      {{ deal.products?.length ? t('No products match your search.') : t('No products added to this deal yet.') }}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div class="detail-items-count">
                <span>{{ t('Showing') }} {{ visibleProducts.length }} {{ t('of') }} {{ deal.products?.length ?? 0 }} {{ t('products') }}</span>
              </div>
            </section>

            <!-- ── Notes + totals ── -->
            <section class="detail-notes detail-details-block">
              <div class="detail-notes-left">
                <ContentList v-if="deal.description" :label="t('Message')">
                  <p class="detail-note-text">{{ deal.description }}</p>
                </ContentList>
                <ContentList v-if="deal.notes" :label="t('Memo')">
                  <p class="detail-note-text">{{ deal.notes }}</p>
                </ContentList>
              </div>

              <!-- Totals only apply once the deal has products; otherwise the Deal
                   value emphasis (above) carries the estimated value. -->
              <div v-if="deal.products?.length" class="detail-totals">
                <div class="detail-total-row">
                  <span class="detail-total-row-label detail-total-row-label--strong">{{ t('Subtotal') }}</span>
                  <span class="detail-total-row-amt detail-total-row-amt--strong">{{ money(totals!.subtotal) }}</span>
                </div>
                <div class="detail-total-row">
                  <span class="detail-total-row-label">{{ t('Discount per line') }}</span>
                  <span class="detail-total-row-amt">{{ deductionText(totals!.discountPerLine) }}</span>
                </div>
                <div class="detail-total-row">
                  <span class="detail-total-row-label">{{ t('Global discount') }}</span>
                  <span class="detail-total-row-amt">{{ deductionText(totals!.globalDiscount) }}</span>
                </div>
                <div v-if="totals!.taxLabel" class="detail-total-row">
                  <span class="detail-total-row-label">{{ totals!.taxLabel }}</span>
                  <span class="detail-total-row-amt">{{ money(totals!.taxAmount) }}</span>
                </div>
                <div v-if="totals!.shippingFee" class="detail-total-row">
                  <span class="detail-total-row-label">{{ t('Shipping fee') }}</span>
                  <span class="detail-total-row-amt">{{ money(totals!.shippingFee) }}</span>
                </div>
                <div class="detail-total-rule" />
                <div class="detail-total-row">
                  <span class="detail-total-row-label detail-total-row-label--total">{{ t('Total') }}</span>
                  <span class="detail-total-row-amt detail-total-row-amt--total">{{ money(totals!.total) }}</span>
                </div>
              </div>
            </section>
          </MpTabPanel>

          <!-- ── Activity — every event for this deal (same table as the activity log) ── -->
          <MpTabPanel value="activity">
            <h3 class="detail-tab-heading">{{ t('Activity log') }}</h3>
            <ActivityLogTable :entries="dealActivity" />
          </MpTabPanel>

          <!-- ── Notes — write + threaded notes/comments (self + teammates) ── -->
          <MpTabPanel value="notes">
            <h3 class="detail-tab-heading">{{ t('Notes') }}</h3>
            <CrmNotesPanel entity-type="deal" :entity-id="deal.id" :author="currentUser" />
          </MpTabPanel>

          <!-- ── Files — upload / drag-drop + attachments table ── -->
          <MpTabPanel value="files">
            <h3 class="detail-tab-heading">{{ t('Attachment') }} ({{ deal.attachments?.length ?? 0 }})</h3>

            <!-- Filter bar — left empty; right = search + tertiary "Upload file" -->
            <div class="deal-files-filterbar">
              <div class="filter-left" />
              <div class="filter-right">
                <div class="filter-search">
                  <MpIcon name="search" size="sm" />
                  <input v-model="fileSearch" class="filter-search-input" type="text" :placeholder="t('Search files…')" />
                  <button v-if="fileSearch" class="search-clear-btn" type="button" :aria-label="t('Clear search')" @click="fileSearch = ''"><MpIcon name="close" size="sm" /></button>
                </div>
                <MpButton variant="tertiary" is-rounded @click="pickFiles">{{ t('Upload file') }}</MpButton>
                <input ref="fileInput" type="file" multiple class="deal-files-input" accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.xls,.xlsx,.csv,.doc,.docx" @change="onFileInput" />
              </div>
            </div>

            <table v-if="visibleAttachments.length" class="detail-linked deal-files-table">
              <colgroup>
                <col />
                <col class="detail-linked-col--owner" />
                <col class="detail-linked-col--date" />
                <col class="detail-linked-col--actions" />
              </colgroup>
              <thead>
                <tr>
                  <th class="detail-th">{{ t('File name') }}</th>
                  <th class="detail-th">{{ t('Uploaded by') }}</th>
                  <th class="detail-th">{{ t('Uploaded') }}</th>
                  <th class="detail-th" aria-hidden="true"></th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(a, i) in visibleAttachments" :key="`${a.name}-${a.uploadedAt ?? ''}-${i}`" class="detail-item-row">
                  <td class="detail-td">
                    <div class="deal-file-cell">
                      <span class="deal-file-icon"><MpIcon :name="attachmentIcon(a.name)" size="md" /></span>
                      <span class="deal-file-meta">
                        <a class="cell-link deal-file-name" @click.prevent="openPreview(a)">{{ a.name }}</a>
                        <span class="deal-file-size">{{ a.sizeKB.toFixed(1) }} KB</span>
                      </span>
                    </div>
                  </td>
                  <td class="detail-td">{{ a.uploadedBy || '—' }}</td>
                  <td class="detail-td">{{ fmtUploaded(a.uploadedAt) }}</td>
                  <td class="detail-td detail-td--actions">
                    <MpPopover :id="`deal-file-actions-${i}`" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
                      <MpPopoverTrigger>
                        <MpButton class="row-kebab" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="sm" /></MpButton>
                      </MpPopoverTrigger>
                      <MpPopoverContent :class="css({ minWidth: '140px', width: 'max-content', whiteSpace: 'nowrap' })">
                        <MpPopoverList>
                          <MpPopoverListItem @click="downloadFile(a)">{{ t('Download') }}</MpPopoverListItem>
                          <MpPopoverListItem @click="askDeleteFile(a)">{{ t('Delete') }}</MpPopoverListItem>
                        </MpPopoverList>
                      </MpPopoverContent>
                    </MpPopover>
                  </td>
                </tr>
              </tbody>
            </table>
            <p v-else class="detail-tab-empty">{{ t('No files attached to this deal yet. Upload one above.') }}</p>
          </MpTabPanel>

          <!-- ── ERP transactions — the linked ERP sales order, same table as the ERP index ── -->
          <MpTabPanel value="orders">
            <h3 class="detail-tab-heading">{{ t('ERP transactions') }}</h3>
            <table v-if="linkedOrder" class="detail-linked">
              <colgroup>
                <col class="detail-linked-col--date" />
                <col class="detail-linked-col--number" />
                <col />
                <col class="detail-linked-col--date" />
                <col class="detail-linked-col--status" />
                <col class="detail-linked-col--amount" />
                <col class="detail-linked-col--amount" />
                <col class="detail-linked-col--tags" />
              </colgroup>
              <thead>
                <tr>
                  <th class="detail-th">{{ t('Date') }}</th>
                  <th class="detail-th">{{ t('Number') }}</th>
                  <th class="detail-th">{{ t('Customer') }}</th>
                  <th class="detail-th">{{ t('Due date') }}</th>
                  <th class="detail-th">{{ t('Status') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Balance due') }}</th>
                  <th class="detail-th detail-th--num">{{ t('Total') }}</th>
                  <th class="detail-th">{{ t('Tags') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr class="detail-item-row">
                  <td class="detail-td">{{ fmtDate(linkedOrder.date) }}</td>
                  <td class="detail-td"><a class="cell-link cell-text" @click="goSalesOrder(linkedOrder.id)">{{ t('Sales Order') }} #{{ linkedOrder.number }}</a></td>
                  <td class="detail-td">{{ linkedOrder.customer.name }}</td>
                  <td class="detail-td">{{ fmtDate(linkedOrder.dueDate) }}</td>
                  <td class="detail-td">
                    <ErpStatusBadge :status="linkedOrder.status" :label="ORDER_STATUS[linkedOrder.status]?.label ?? linkedOrder.status" :type="ORDER_STATUS[linkedOrder.status]?.type ?? 'announcement'" />
                  </td>
                  <td class="detail-td detail-td--num">{{ money(linkedOrder.balanceDue) }}</td>
                  <td class="detail-td detail-td--num">{{ money(linkedOrder.total) }}</td>
                  <td class="detail-td"><ErpTagList v-if="linkedOrder.tags?.length" :tags="linkedOrder.tags" /><template v-else>—</template></td>
                </tr>
              </tbody>
            </table>
            <p v-else class="detail-tab-empty">{{ t('No sales order created from this deal yet.') }}</p>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>

    </div><!-- /detail-stage -->

    <!-- ── Lost / reopen ── -->
    <CrmDealStageModal
      :open="stageModalOpen"
      :count="1"
      :preset-stage="stagePreset"
      :allowed-stages="stageAllowed"
      @close="stageModalOpen = false"
      @confirm="onStageConfirm"
    />
    <ConfirmModal
      v-model:is-open="reopenConfirmOpen"
      :title="t('Move this deal back to an ongoing stage?')"
      :description="t('The deal reopens into an active ongoing stage and rejoins the pipeline.')"
      :confirm-label="t('Move deal')"
      :is-danger="false"
      @confirm="confirmReopen"
    />

    <!-- ── Create sales order / quote — ask, then full-screen drawer ── -->
    <ConfirmModal
      v-model:is-open="createSoAskOpen"
      :title="t('Create sales order?')"
      :description="t('Start a sales order from this deal. It opens the sales order form, pre-filled from the deal and still editable.')"
      :confirm-label="t('Create sales order')"
      :is-danger="false"
      @confirm="openSoDrawer"
    />
    <ConfirmModal
      v-model:is-open="createSqAskOpen"
      :title="t('Create sales quote?')"
      :description="t('Start a sales quote from this deal. It opens the sales quote form, pre-filled from the deal and still editable.')"
      :confirm-label="t('Create sales quote')"
      :is-danger="false"
      @confirm="openSqDrawer"
    />
    <CrmCreateTransactionDrawer
      :open="txDrawerOpen"
      :kind="txDrawerKind"
      :deal="deal"
      @close="txDrawerOpen = false"
      @created="onTxCreated"
    />

    <!-- ── Add / edit products (full-screen line-items + totals editor) ── -->
    <CrmEditProductsDrawer
      :open="productDrawerOpen"
      :deal="deal"
      @close="productDrawerOpen = false"
      @save="onProductsSaved"
    />

    <!-- ── Archive / delete ── -->
    <ConfirmModal
      v-model:is-open="archiveConfirmOpen"
      :title="t('Archive this deal?')"
      :description="t('It will be hidden from active views and metrics. History and any ERP link are preserved, and you can restore it later.')"
      :confirm-label="t('Archive deal')"
      :is-danger="false"
      @confirm="confirmArchive"
    />
    <ConfirmModal
      v-model:is-open="deleteConfirmOpen"
      :title="t('Delete deal?')"
      :description="t('Deleted deal cannot be restored.')"
      :confirm-label="t('Delete deal')"
      @confirm="confirmDelete"
    />

    <!-- ── Files: preview + delete confirm ── -->
    <FilePreviewModal
      :open="previewOpen"
      :src="previewSrc"
      :filename="previewName"
      :kind="previewKind"
      @close="previewOpen = false"
    />
    <ConfirmModal
      v-model:is-open="fileDeleteOpen"
      :title="t('Delete file?')"
      :description="t('This file will be removed from the deal. This cannot be undone.')"
      :confirm-label="t('Delete file')"
      @confirm="confirmDeleteFile"
    />
  </div>

  <!-- Not-found reachable state -->
  <div v-else class="detail-notfound">
    <p class="detail-notfound-title">{{ t('Deal not found') }}</p>
    <p class="detail-notfound-desc">{{ t('This deal may have been deleted or the link is invalid.') }}</p>
    <MpButton variant="secondary" is-rounded @click="router.push('/crm')">{{ t('Back to Deals') }}</MpButton>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }

/* ── Title bar ── */
.detail-bar {
  flex-shrink: 0;
  height: var(--mp-sizes-18, 72px);
  box-sizing: border-box;
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between;
  gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb {
  align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); line-height: var(--mp-line-heights-sm, 16px);
}
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.detail-title {
  margin: 0; font-size: var(--mp-font-sizes-2xl); font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px);
  color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.detail-titlerow-right { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }
.detail-icon-btn {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border-radius: var(--mp-radii-md); background: none !important; border: none !important; cursor: pointer;
  color: var(--mp-icon-default, var(--mp-text-secondary));
}
.detail-icon-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

/* Split button — "Mark as won" main + chevron sharing one pill */
.detail-split-btn { display: inline-flex; align-items: stretch; }
.detail-split-btn__main { border-radius: var(--mp-radii-full, 999px) 0 0 var(--mp-radii-full, 999px); }
.detail-split-btn__chevron {
  padding-left: var(--mp-spacing-3); padding-right: var(--mp-spacing-3);
  border-radius: 0 var(--mp-radii-full, 999px) var(--mp-radii-full, 999px) 0;
  border-left: 1px solid rgba(255, 255, 255, 0.3);
}
.deal-stage-menu-label {
  margin: 0; padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}

/* ── Stage ── */
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage, #ffffff);
  border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column;
  gap: var(--mp-spacing-8);   /* 32px between every region */
}

/* ── Info banner ── */
.detail-banner {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-information, #eef0fc);
  border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.detail-banner-icon { color: var(--mp-icon-information, #1d6fdc); flex-shrink: 0; }
.detail-banner-text { flex: 1; }
.detail-banner--muted { background: var(--mp-background-neutral-subtle, #f4f5f7); border: 1px solid var(--mp-border-default, #e3e7e9); color: var(--mp-text-secondary); }
.detail-banner--muted .detail-banner-icon { color: var(--mp-text-secondary); }
.detail-banner--warn { background: var(--mp-background-warning-subtle, #fef6e7); border: 1px solid var(--mp-border-warning, #f5c26b); color: var(--mp-text-warning, #b54708); }
.detail-banner--warn .detail-banner-icon { color: var(--mp-text-warning, #b54708); }

/* ── Pipeline stepper (segmented bar) ── */
.deal-stepper { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.deal-stepper-labels { display: flex; gap: var(--mp-spacing-1); }
.deal-step { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.deal-step-name {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary); line-height: var(--mp-line-heights-lg, 20px);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.deal-step--done .deal-step-name { color: var(--mp-text-default); }
.deal-step--current .deal-step-name { color: var(--mp-text-selected, #029861); font-weight: var(--mp-font-weights-semi-bold); }
.deal-step--lost .deal-step-name { color: var(--mp-text-danger, #c9372c); font-weight: var(--mp-font-weights-semi-bold); }
.deal-step-dur { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }
.deal-stepper-bar { display: flex; gap: var(--mp-spacing-1); }
/* rectangular segments; unreached segments are a clear mid-gray (not white) */
.deal-bar-seg { flex: 1; height: 12px; border-radius: 0; background: var(--mp-color-neutral-40, #d0d5dd); }
.deal-bar-seg--filled { background: var(--mp-border-selected, #029861); }
.deal-bar-seg--lost { background: var(--mp-background-danger, #c9372c); }

/* ── Header summary ── */
.detail-summary { display: flex; flex-direction: column; gap: var(--mp-spacing-5); }
.detail-primary-total {
  grid-column: 3 / -1; justify-self: end; align-self: start;
  padding-top: var(--mp-spacing-2);
  display: flex; align-items: baseline; gap: var(--mp-spacing-2);
}
.detail-total-label, .detail-total-amount {
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}

/* dashed rule between header 1 and header 2 */
.detail-divider {
  height: var(--mp-border-width-sm, 1px);
  background: repeating-linear-gradient(to right, var(--mp-border-default, #e3e7e9) 0, var(--mp-border-default, #e3e7e9) 4px, transparent 4px, transparent 8px);
}

/* Detail grid: col 1 = 318px, col 2+ fill equally */
.content-list-grid {
  display: grid;
  grid-template-columns: minmax(0, 318px) repeat(4, minmax(0, 1fr));
  column-gap: var(--mp-spacing-6); row-gap: 0;
}
.content-list-col { display: flex; flex-direction: column; min-width: 0; }

/* Contact person — multiple contacts side by side inside one ContentList */
.deal-contact-col { grid-column: span 1; }
.deal-contacts { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-6); }
.deal-contact { display: flex; flex-direction: column; min-width: 0; }
.deal-contact-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.deal-contact-line { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }
a.deal-contact-line { color: var(--mp-text-secondary); }
a.deal-contact-line:hover { text-decoration: underline; text-underline-offset: 2px; }

/* ── Line items ── */
.detail-items-section { display: flex; flex-direction: column; flex-shrink: 0; }
.detail-items, .detail-linked { width: 100%; border-collapse: collapse; }
.detail-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9); white-space: nowrap;
}
.detail-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.detail-td {
  height: var(--mp-sizes-10, 40px);
  padding: var(--mp-spacing-1\.5) var(--mp-spacing-4) var(--mp-spacing-1\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular);
  line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9); vertical-align: middle;
}
.detail-td--num { text-align: right; white-space: nowrap; padding: var(--mp-spacing-1\.5) var(--mp-spacing-2) var(--mp-spacing-1\.5) var(--mp-spacing-4); }
.detail-items tbody .detail-td { vertical-align: top; }
.detail-td--muted { color: var(--mp-text-secondary); }
.detail-item-primary { display: block; }
.detail-item-name { display: block; color: var(--mp-text-default); }
.detail-item-sku { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-subtle); margin-top: var(--mp-spacing-0\.5); }
.detail-items-count {
  display: flex; align-items: center; justify-content: flex-start; gap: var(--mp-spacing-3);
  margin: 0; padding: var(--mp-spacing-3) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}

/* Deal-details tab: inner regions keep the 32px vertical rhythm */
.detail-details-block { margin-top: var(--mp-spacing-8); }

/* linked / activity tables — fixed left-aligned columns */
.detail-linked { table-layout: auto; }
.detail-linked-col--date { width: 160px; }
.detail-linked-col--number { width: 200px; }
.detail-linked-col--status { width: 160px; }
.detail-linked-col--amount { width: 200px; }
.detail-linked-col--owner { width: 160px; }
.detail-linked-col--tags { width: 200px; }
.detail-linked-col--actions { width: 56px; }

/* ── Files tab ── */
/* Filter bar above the table: left column empty, right = search + Upload file. */
.deal-files-filterbar { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-3); }
.filter-left { display: flex; align-items: center; gap: var(--mp-spacing-4); }
.filter-right { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.filter-search { display: flex; align-items: center; gap: var(--mp-spacing-2); width: 248px; padding: var(--mp-spacing-2) var(--mp-spacing-3); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full, 999px); color: var(--mp-text-subtle); }
.filter-search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.filter-search-input::placeholder { color: var(--mp-text-placeholder, #97a0af); }
.search-clear-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 18px; height: 18px; padding: 0; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); border-radius: var(--mp-radii-full, 999px); }
.search-clear-btn:hover { background: var(--mp-background-neutral-hovered, #eef0f3); color: var(--mp-icon-default, #536062); }
.deal-files-input { display: none; }
.deal-files-table { margin-top: 0; }
.deal-file-cell { display: flex; align-items: center; gap: var(--mp-spacing-3); min-width: 0; }
.deal-file-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--mp-icon-default, var(--mp-text-secondary)); }
.deal-file-meta { display: flex; flex-direction: column; min-width: 0; }
.deal-file-name { color: var(--mp-text-link); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.deal-file-size { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-0\.5); }
.detail-td--actions { text-align: right; }
.detail-items tbody .detail-td.detail-td--actions,
.deal-files-table tbody .detail-td { vertical-align: middle; }
.row-kebab {
  display: inline-flex !important; align-items: center; justify-content: center;
  padding: var(--mp-spacing-1) !important; min-width: 0 !important;
  border: none !important; background: transparent !important; cursor: pointer;
  border-radius: var(--mp-radii-sm) !important; color: var(--mp-text-subtle);
}
.row-kebab:hover { background: var(--mp-background-neutral-hovered, #eef0f3); color: var(--mp-text-default); }
.cell-link { color: var(--mp-text-link); cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cell-text { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

/* ── Notes + totals ── */
.detail-notes { display: grid; grid-template-columns: 1fr 380px; gap: var(--mp-spacing-6); align-items: start; }
.detail-notes-left { display: flex; flex-direction: column; }
.detail-note-text { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default); white-space: pre-line; }
.detail-attach-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.detail-attach { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); cursor: pointer; width: fit-content; }
.detail-attach-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.detail-attach-meta { display: flex; flex-direction: column; }
.detail-attach-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.detail-attach:hover .detail-attach-name { text-decoration: underline; text-underline-offset: 2px; }
.detail-attach-size { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.detail-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding-top: var(--mp-spacing-2); }
.detail-total-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-total-row-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
.detail-total-row-amt { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.detail-total-row-label--strong, .detail-total-row-amt--strong,
.detail-total-row-label--total, .detail-total-row-amt--total {
  font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.detail-total-rule {
  height: var(--mp-border-width-sm, 1px);
  background: repeating-linear-gradient(to right, var(--mp-border-default, #e3e7e9) 0, var(--mp-border-default, #e3e7e9) 4px, transparent 4px, transparent 8px);
}

/* ── Tabs ── */
.detail-tabs { margin-top: 0; }
.detail-tabs :deep(.mp-tab--isSelected_true),
.detail-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.detail-tabs :deep(.mp-tab-selected-border--isSelected_true) { background-color: var(--mp-border-selected, #029861) !important; }
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }
.detail-tab-heading { margin: 0 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.detail-tab-empty { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Not found ── */
.detail-notfound { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-9) var(--mp-spacing-4); }
.detail-notfound-title { font-size: var(--mp-font-sizes-lg, 1rem); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.detail-notfound-desc { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); margin-bottom: var(--mp-spacing-2); }
</style>
