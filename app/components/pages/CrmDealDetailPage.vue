<script setup lang="ts">
/**
 * CRM (Qontak) — Deal record detail (/crm/deals/:id). ERP transaction detail-page
 * format (docs/patterns/details-page-format.md §A): title bar → pipeline stepper
 * (segmented bar) → tabs (Deal details · Activity · Notes · Files · Sales orders).
 *
 * Stage flow:
 *  • "Mark as won" (primary) → marks the deal Won. Stage changes NEVER trigger a
 *    conversion (PRD "ERP Transaction Conversion Settings V1" — manual-only).
 *  • Split chevron → inline stage picker (no modal). "Mark as lost" →
 *    CrmDealStageModal (captures a Lost reason). A Lost deal shows the terminal
 *    stepper node as red "Lost" and cannot be converted.
 *
 * ERP conversion (PRD): a MANUAL "Create Sales Order/Quote" action (primary when
 * Won, else in the kebab) opens CrmConversionReviewDrawer — a READ-ONLY review +
 * explicit confirm that creates exactly one ERP transaction (see crmConversion.ts:
 * dealConvEligibility / runDealConversion). One success per deal; a Failed attempt
 * can be retried; a converted deal links to the ERP transaction (Open in ERP).
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
import CrmConversionReviewDrawer from '~/components/patterns/CrmConversionReviewDrawer.vue'
import ActivityLogTable from '~/components/patterns/ActivityLogTable.vue'
import CrmNotesPanel from '~/components/patterns/CrmNotesPanel.vue'
import FilePreviewModal from '~/components/patterns/FilePreviewModal.vue'
import CrmEditProductsDrawer from '~/components/patterns/CrmEditProductsDrawer.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import { formatMoney } from '~/utils/currency'
import { successToast, infoToast } from '~/utils/toasts'
import {
  getDeal, moduleStores, ONGOING_STAGES, moveDealStage, archiveDeal, restoreDeal, deleteDeal,
  dealTotals, dealExpectedValue, dealDaysInStage, dealStageAgingDays, formatAging,
  dealActivityLog, addDealAttachment, removeDealAttachment, setDealProductsFull,
  getDealSalesOrder,
  lineSubtotal, crmCustomers, dealNo, dealStageLabel,
  type DealStage, type DealLineItem, type DealAttachment, type DealProductsPayload,
} from '~/data/crm'
import { dealConvEligibility, dealTargetLabel, runDealConversion, dealErpTxn } from '~/data/crmConversion'

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

const ordersTabTarget = computed(() => moduleStores('deals').detailLayout.tabs.find(t => t.key === 'orders')?.erpTarget ?? null)
const ordersTabLabel = computed(() => ordersTabTarget.value === 'sales-order' ? 'Sales orders' : ordersTabTarget.value === 'sales-quote' ? 'Sales quotes' : null)

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
const convTarget = computed(() => deal.value?.convertedTarget ?? dealTargetLabel())
// Manual conversion is available whenever the module config is Ready and the record
// is eligible (PRD: never triggered by stage/status — only by this explicit action).
const convEligible = computed(() => (deal.value ? dealConvEligibility(deal.value).ok : false))
const erpTxn = computed(() => (deal.value ? dealErpTxn(deal.value) : undefined))
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
// "Mark as won" → mark Won only. Conversion is NEVER auto-triggered by stage
// (PRD manual-only invariant) — the user converts via the explicit Create action.
function markWon() { moveTo('Won') }
// Stage picker (chevron popover) → move directly.
function onPickStage(stage: DealStage) { moveTo(stage) }

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

// ── Manual ERP conversion — read-only review + confirm (PRD) ──
const reviewOpen = ref(false)
// Open the read-only review; a blocked record surfaces an inline reason (no drawer).
function openConvertReview() {
  const d = deal.value; if (!d) return
  const e = dealConvEligibility(d)
  if (!e.ok) { infoToast(e.reason ?? t('This deal cannot be converted.')); return }
  reviewOpen.value = true
}
function onConfirmConversion() {
  const d = deal.value; if (!d) return
  const r = runDealConversion(d.id)
  reviewOpen.value = false
  if (r.ok) successToast(`${t(convTarget.value)} ${t('created')}`)
  else infoToast(r.error ?? t('Conversion failed'))
}
// Open the created ERP transaction (converted deals).
function openErpTxn() { if (erpTxn.value) router.push(erpTxn.value.route) }
// Failed → retry replays the conversion (the one-success guard blocks a duplicate).
function retryConversion() { openConvertReview() }

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
        <!-- Won & not converted: manual conversion via read-only review (PRD). -->
        <button v-else-if="!isArchived && isWon && !isConverted" class="btn-enterprise btn-enterprise--primary" @click="openConvertReview">{{ t('Create') }} {{ t(convTarget) }}</button>
        <!-- Converted: open the created ERP transaction. -->
        <button v-else-if="!isArchived && isConverted && erpTxn" class="btn-enterprise btn-enterprise--secondary" @click="openErpTxn">{{ t('Open in ERP') }}</button>
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
                <!-- Manual convert available at any eligible stage (Won has its own primary button). -->
                <MpPopoverListItem v-if="convEligible && !isWon" @click="openConvertReview">{{ t('Create') }} {{ t(convTarget) }}</MpPopoverListItem>
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
        <MpTextlink v-if="convEligible" @click="retryConversion">{{ t('Retry conversion') }}</MpTextlink>
      </div>
      <div v-else-if="isConverted" class="detail-banner">
        <MpIcon name="information" size="md" class="detail-banner-icon" />
        <span class="detail-banner-text">{{ t('This deal is linked to') }} {{ t(convTarget) }}<template v-if="erpTxn"> #{{ erpTxn.number }}</template>. {{ t('Editing the deal does not update the ERP transaction.') }}</span>
        <MpTextlink v-if="erpTxn" @click="openErpTxn">{{ t('Open in ERP') }}</MpTextlink>
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
          <MpTab id="deal-tab-notes" value="notes">{{ t('Notes') }}</MpTab>
          <MpTab id="deal-tab-files" value="files">{{ t('Files') }}</MpTab>
          <MpTab v-if="ordersTabLabel" id="deal-tab-orders" value="orders">{{ t(ordersTabLabel) }}</MpTab>
          <MpTab id="deal-tab-activity" value="activity">{{ t('Activity') }}</MpTab>
        </MpTabList>
        <MpTabPanels>

          <!-- ── Deal details — sections mirror the module Layout config ── -->
          <MpTabPanel value="details">
            <!-- §1 Overview (3 cols) — matches Layout: col1=Deal name/Company/Billing,
                 col2=Contact/Email/Phone, col3=Value/Owner/Currency -->
            <section class="detail-summary" data-devchange="crm-deal-detail-layout-sync">
              <h3 class="detail-section-title">{{ t('Overview') }}</h3>
              <div class="content-list-grid content-list-grid--3">
                <div class="content-list-col">
                  <ContentList :label="t('Deal name')" :value="deal.name" />
                  <ContentList :label="t('Company')" data-devchange="deal-contact-first">
                    <a v-if="customer" class="cell-link" @click="goCustomer(customer.id)">{{ deal.company }}</a>
                    <span v-else>{{ deal.company || '—' }}</span>
                  </ContentList>
                  <ContentList :label="t('Billing address')" :value="deal.billingAddress || '—'" />
                </div>
                <div class="content-list-col">
                  <ContentList :label="t('Contact person')">
                    <div v-if="deal.contacts?.length" class="deal-contacts">
                      <div v-for="(cp, i) in deal.contacts" :key="i" class="deal-contact">
                        <span class="deal-contact-name">{{ cp.name }}</span>
                      </div>
                    </div>
                    <template v-else-if="deal.picName">{{ deal.picName }}</template>
                    <template v-else>—</template>
                  </ContentList>
                  <ContentList :label="t('Contact person email')">
                    <template v-if="deal.contacts?.length">
                      <a v-for="(cp, i) in deal.contacts.filter(c => c.email)" :key="i" class="cell-link" :href="`mailto:${cp.email}`">{{ cp.email }}</a>
                      <span v-if="!deal.contacts.some(c => c.email)">—</span>
                    </template>
                    <template v-else-if="deal.email"><a class="cell-link" :href="`mailto:${deal.email}`">{{ deal.email }}</a></template>
                    <template v-else>—</template>
                  </ContentList>
                  <ContentList :label="t('Contact person phone')">
                    <template v-if="deal.contacts?.length">
                      <span v-for="(cp, i) in deal.contacts.filter(c => c.phone)" :key="i">{{ cp.phone }}</span>
                      <span v-if="!deal.contacts.some(c => c.phone)">—</span>
                    </template>
                    <template v-else-if="deal.phones?.length">{{ deal.phones[0] }}</template>
                    <template v-else>—</template>
                  </ContentList>
                </div>
                <div class="content-list-col">
                  <ContentList :label="t('Value')">
                    <span class="detail-value-amount">{{ money(dealExpectedValue(deal)) }}</span>
                  </ContentList>
                  <ContentList :label="t('Owner')" :value="deal.owner || '—'" />
                  <ContentList :label="t('Currency')" :value="deal.currency || '—'" />
                </div>
              </div>
            </section>

            <!-- §2 Transaction (4 cols) -->
            <section class="detail-details-block">
              <h3 class="detail-section-title">{{ t('Transaction') }}</h3>
              <div class="content-list-grid content-list-grid--4">
                <div class="content-list-col">
                  <ContentList :label="t('Transaction date')" :value="fmtDate(deal.transactionDate || deal.createdAt)" />
                  <ContentList :label="t('Reference no.')" :value="deal.referenceNumber || '—'" />
                </div>
                <div class="content-list-col">
                  <ContentList :label="t('Due date')" :value="fmtDate(deal.expectedCloseDate)" />
                  <ContentList :label="t('Payment terms')" :value="deal.paymentTerms || '—'" />
                </div>
                <div class="content-list-col">
                  <ContentList :label="t('Expected close date')" :value="fmtDate(deal.expectedCloseDate)" />
                  <ContentList :label="t('Exchange rate')" :value="deal.exchangeRate !== 1 ? String(deal.exchangeRate) : '—'" />
                </div>
                <div class="content-list-col">
                  <ContentList :label="t('Transaction no.')" :value="dealNumber" />
                </div>
              </div>
            </section>

            <!-- §3 Shipping & delivery (4 cols) -->
            <section class="detail-details-block">
              <h3 class="detail-section-title">{{ t('Shipping & delivery') }}</h3>
              <div class="content-list-grid content-list-grid--4">
                <div class="content-list-col">
                  <ContentList :label="t('Warehouse')" :value="deal.warehouse || '—'" />
                  <ContentList :label="t('Ship via')" :value="deal.shipVia || '—'" />
                </div>
                <div class="content-list-col">
                  <ContentList :label="t('Shipping address')" :value="deal.shipTo || '—'" />
                  <ContentList :label="t('Tracking no.')" :value="deal.trackingNo || '—'" />
                </div>
                <div class="content-list-col">
                  <ContentList :label="t('Ship date')" :value="fmtDate(deal.shipDate)" />
                  <ContentList :label="t('Shipping fee')" :value="deal.shippingFee ? money(deal.shippingFee) : '—'" />
                </div>
                <div class="content-list-col">
                  <ContentList :label="t('Delivery date')" :value="'—'" />
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

            <!-- ── Totals ── -->
            <section v-if="deal.products?.length" class="detail-totals-section detail-details-block">
              <div class="detail-totals">
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

            <!-- ── Memo ── -->
            <section v-if="deal.description || deal.notes" class="detail-memo-section detail-details-block">
              <ContentList v-if="deal.description" :label="t('Message')">
                <p class="detail-note-text">{{ deal.description }}</p>
              </ContentList>
              <ContentList v-if="deal.notes" :label="t('Memo')">
                <p class="detail-note-text">{{ deal.notes }}</p>
              </ContentList>
            </section>
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

          <!-- ── Sales orders/quotes — the linked ERP transaction, same table as the ERP index ── -->
          <MpTabPanel v-if="ordersTabLabel" value="orders">
            <h3 class="detail-tab-heading">{{ t(ordersTabLabel) }}</h3>
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

          <!-- ── Activity — every event for this deal (same table as the activity log) ── -->
          <MpTabPanel value="activity">
            <h3 class="detail-tab-heading">{{ t('Activity log') }}</h3>
            <ActivityLogTable :entries="dealActivity" />
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

    <!-- ── Manual ERP conversion — read-only review + confirm (PRD) ── -->
    <CrmConversionReviewDrawer
      :open="reviewOpen"
      :deal="deal"
      @close="reviewOpen = false"
      @confirm="onConfirmConversion"
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

/* ── Section headings inside Deal details tab ── */
.detail-section-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); margin: 0 0 var(--mp-spacing-4) 0;
}
.detail-summary { display: flex; flex-direction: column; }
.detail-value-amount { font-size: var(--mp-font-sizes-lg, 18px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

/* Detail grids — 3-col (Overview) and 4-col (Transaction / Shipping) */
.content-list-grid {
  display: grid; column-gap: var(--mp-spacing-6); row-gap: 0;
}
.content-list-grid--3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.content-list-grid--4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.content-list-col { display: flex; flex-direction: column; min-width: 0; }

/* Contact person — multiple contacts side by side inside one ContentList */
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
.detail-totals-section { display: grid; grid-template-columns: 1fr 380px; }
.detail-totals-section .detail-totals { grid-column: 2; }
.detail-memo-section { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.detail-note-text { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default); white-space: pre-line; }
.detail-attach-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.detail-attach { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); cursor: pointer; width: fit-content; }
.detail-attach-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.detail-attach-meta { display: flex; flex-direction: column; }
.detail-attach-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.detail-attach:hover .detail-attach-name { text-decoration: underline; text-underline-offset: 2px; }
.detail-attach-size { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.detail-totals { display: flex; flex-direction: column; gap: var(--mp-spacing-4); padding-top: var(--mp-spacing-2); width: 380px; flex-shrink: 0; }
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
