<script setup lang="ts">
import { ref, computed } from 'vue'
import ContentList from '~/components/patterns/ContentList.vue'
import SourceLabel from '~/components/patterns/SourceLabel.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import PdfPreviewModal from '~/components/patterns/PdfPreviewModal.vue'
import {
  MpModal, MpModalContent, MpModalHeader, MpModalCloseButton, MpModalBody, MpModalFooter, MpModalOverlay,
  MpButton, MpFormControl, MpFormLabel, MpFormErrorMessage, MpInput, MpTextarea, MpDatePicker, MpIcon, toast,
} from '@mekari/pixel3'
import { getShipment, completeShipment, acknowledgeCanceledShipment } from '~/data/deliveryTasks'
import { outgoingOrders, isMarketplaceOrder } from '~/data/outgoing'
import { formatDateTimeLong } from '~/utils/date'
import { generateShipmentPdf } from '~/utils/shipmentPdf'
import type jsPDF from 'jspdf'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const shipment = computed(() => getShipment(props.orderId))

interface Row {
  id: string; salesOrderId: string; salesNo: string; packingTaskId: string; packingTaskNo: string
  source: string; skuQty: number; orderQty: number; shippedQty: number; courier: string; trackingNo: string
  status: string
}
const rows = computed<Row[]>(() => {
  const s = shipment.value
  if (!s) return []
  return s.deliveries.map((t) => {
    const order = outgoingOrders.find(o => o.id === t.salesOrderId)
    return {
      id: t.id,
      salesOrderId: t.salesOrderId,
      salesNo: t.salesNo,
      packingTaskId: t.packingTaskId,
      packingTaskNo: t.packingTaskNo,
      source: order?.source ?? '',
      skuQty: t.skuQty,
      // Full order demand for this SKU line's sales order — same source as the
      // "Order qty" column on Delivery details' linked-orders table.
      orderQty: order?.orderQty ?? t.orderQty,
      shippedQty: t.shippedQty,
      courier: t.courier ?? '—',
      trackingNo: t.trackingNo ?? '—',
      status: t.status,
    }
  })
})

function acknowledgeCancel() {
  if (!shipment.value) return
  acknowledgeCanceledShipment(shipment.value.shipmentSeq)
  toast.notify({ variant: 'success', title: 'Shipment updated — cancelled order removed', maxWidth: 'max-content' })
}

function formatNum(n: number) { return n.toLocaleString('id-ID') }
function goBack() { router.push({ path: '/outbound-delivery', query: { tab: 'Shipped' } }) }
function viewSalesOrder(row: Row) { router.push(`/outbound-delivery/${row.salesOrderId}`) }
function viewPacking(row: Row) { router.push(`/packing/${row.packingTaskId}`) }
const pdfPreviewOpen = ref(false)
const pdfPreviewDoc = ref<jsPDF | null>(null)
const pdfPreviewFilename = ref('')
function printPdf() {
  if (!shipment.value) return
  pdfPreviewDoc.value = generateShipmentPdf(
    { ...shipment.value, courier: rows.value[0]?.courier ?? '-' },
    rows.value.map((r) => ({
      salesNo: r.salesNo,
      packingTaskNo: r.packingTaskNo,
      trackingNo: r.trackingNo,
      skuQty: r.skuQty,
      orderQty: r.orderQty,
      shippedQty: r.shippedQty,
    })),
  )
  pdfPreviewFilename.value = `Shipment - ${shipment.value.shipmentNo}.pdf`
  pdfPreviewOpen.value = true
}

/** File-type → Pixel document icon for an attachment (mirrors Sales/Outgoing order detail). */
function attachmentIcon(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? ''
  if (ext === 'pdf') return 'pdf-document'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'heic'].includes(ext)) return 'image-document'
  return 'attachment'
}

// ── Complete shipment — courier/customer has signed for the goods ──────────────
function toDisplayDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function toISODate(display: string) {
  const [d, m, y] = display.split('/')
  return `${y}-${m}-${d}`
}
const todayDisplay = toDisplayDate(new Date().toISOString().slice(0, 10))

const completeOpen = ref(false)
const receivedDate = ref(todayDisplay)
const receivedBy = ref('')
const receivedByError = ref('')
const note = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const attachedFiles = ref<File[]>([])

function onFileChange(ev: Event) {
  const files = (ev.target as HTMLInputElement).files
  for (const f of Array.from(files ?? [])) {
    if (!attachedFiles.value.some(x => x.name === f.name)) attachedFiles.value.push(f)
  }
  if (fileInput.value) fileInput.value.value = ''
}
function removeFile(name: string) { attachedFiles.value = attachedFiles.value.filter(f => f.name !== name) }

function openComplete() {
  receivedDate.value = todayDisplay
  receivedBy.value = ''
  receivedByError.value = ''
  note.value = ''
  attachedFiles.value = []
  completeOpen.value = true
}
function confirmComplete() {
  if (!shipment.value) return
  if (!receivedBy.value.trim()) { receivedByError.value = 'You must fill in received by'; return }
  completeShipment(shipment.value.shipmentSeq, {
    receivedDate: toISODate(receivedDate.value),
    receivedBy: receivedBy.value.trim(),
    note: note.value.trim() || undefined,
    proofFile: attachedFiles.value[0]?.name,
  })
  toast.notify({ variant: 'success', title: 'Shipment completed', maxWidth: 'max-content' })
  completeOpen.value = false
}
</script>

<template>
  <div v-if="shipment" class="detail-page">

    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">Shipped</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ shipment.shipmentNo }}</h1>
          <ErpStatusBadge :status="shipment.status" badge-for="additionalInformation" size="md" />
        </div>
      </div>
    </header>

    <div class="detail-stage">

      <!-- One of this shipment's orders was cancelled (parcel came back) — it's still
           listed as Canceled until the operator acknowledges, which removes it from
           this shipment (it stays on its own order's detail). -->
      <div v-if="shipment.needsCancelAck" class="shd-cancel-banner">
        <svg class="shd-cancel-banner-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 9v4M12 16.5h.01" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <path d="M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.58 0Z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/>
        </svg>
        <span class="shd-cancel-banner-text">
          An order in this shipment was cancelled. Acknowledge to remove it from this shipment — it stays on its own order's detail.
        </span>
        <button class="shd-cancel-banner-btn" type="button" @click="acknowledgeCancel">Acknowledge</button>
      </div>

      <section class="shd-summary">
        <div class="content-list-col">
          <ContentList label="Warehouse">
            <div class="wh-link-wrap">
              <span>{{ shipment.warehouseName }}</span>
              <button class="row-hover-btn" @click.stop="router.push(`/warehouses/${shipment.warehouseId}`)">
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                  <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                  <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                <span class="row-hover-btn__label">VIEW DETAILS</span>
              </button>
            </div>
          </ContentList>
          <ContentList label="Assignee" :value="shipment.assignee" />
        </div>
        <div class="content-list-col">
          <ContentList label="Transaction date" :value="shipment.transactionDate ? formatDateTimeLong(shipment.transactionDate) : '—'" />
          <ContentList label="Transaction no." :value="shipment.shipmentNo" />
          <template v-if="shipment.status === 'completed'">
            <ContentList label="Received by" :value="shipment.receivedBy || '—'" />
            <ContentList label="Date received" :value="shipment.receivedDate ? formatDateTimeLong(shipment.receivedDate) : '—'" />
          </template>
        </div>
      </section>

      <div class="shd-table-wrap">
        <table class="detail-items">
          <colgroup>
            <col style="width: 15%" />
            <col style="width: 15%" />
            <col style="width: 16%" />
            <col style="width: 12%" />
            <col style="width: 12%" />
            <col style="width: 10%" />
            <col style="width: 10%" />
            <col style="width: 10%" />
          </colgroup>
          <thead>
            <tr>
              <th class="detail-th">Sales order no.</th>
              <th class="detail-th">Packing no.</th>
              <th class="detail-th">Source</th>
              <th class="detail-th">Courier</th>
              <th class="detail-th">Tracking no.</th>
              <th class="detail-th detail-th--num">SKU qty</th>
              <th class="detail-th detail-th--num">Order qty</th>
              <th class="detail-th detail-th--num">Shipped qty</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.id" class="detail-item-row" :class="{ 'shd-row-canceled': row.status === 'canceled' }">
              <td class="detail-td">
                <div class="cell-with-action">
                  <span class="cell-text">{{ row.salesNo }}</span>
                  <ErpStatusBadge v-if="row.status === 'canceled'" status="canceled" />
                  <button class="row-hover-btn" @click.stop="viewSalesOrder(row)">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span class="row-hover-btn__label">VIEW DETAILS</span>
                  </button>
                </div>
              </td>
              <td class="detail-td">
                <div class="cell-with-action">
                  <span class="cell-text">{{ row.packingTaskNo }}</span>
                  <button class="row-hover-btn" @click.stop="viewPacking(row)">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                      <path d="M5 2H2.5C2.22 2 2 2.22 2 2.5v7c0 .28.22.5.5.5h7c.28 0 .5-.22.5-.5V7" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                      <path d="M7 2h3v3M10 2L6.5 5.5" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                    <span class="row-hover-btn__label">VIEW DETAILS</span>
                  </button>
                </div>
              </td>
              <td class="detail-td"><SourceLabel :source="row.source" /></td>
              <td class="detail-td">{{ row.courier }}</td>
              <td class="detail-td">{{ row.trackingNo }}</td>
              <td class="detail-td detail-td--num">{{ formatNum(row.skuQty) }}</td>
              <td class="detail-td detail-td--num">{{ formatNum(row.orderQty) }}</td>
              <td class="detail-td detail-td--num">{{ formatNum(row.shippedQty) }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <section v-if="shipment.status === 'completed'" class="detail-notes-left">
        <ContentList label="Note">
          <p class="detail-note-text">{{ shipment.receivedNote || '—' }}</p>
        </ContentList>
        <ContentList label="Attachment">
          <div v-if="shipment.proofFile" class="detail-attach-list">
            <a class="detail-attach" @click.prevent>
              <span class="detail-attach-icon"><MpIcon :name="attachmentIcon(shipment.proofFile)" size="md" /></span>
              <span class="detail-attach-meta">
                <span class="detail-attach-name">{{ shipment.proofFile }}</span>
              </span>
            </a>
          </div>
          <p v-else class="detail-note-text">—</p>
        </ContentList>
      </section>

    </div>

    <footer class="detail-footer">
      <button class="detail-btn detail-btn--secondary" @click="printPdf">Print PDF</button>
      <button v-if="shipment.status === 'open'" class="detail-btn detail-btn--primary" @click="openComplete">Complete shipment</button>
    </footer>

    <!-- Complete shipment -->
    <MpModal
      id="shd-complete" :is-open="completeOpen" size="md"
      is-close-on-esc is-close-on-overlay-click :is-keep-alive="false" @close="completeOpen = false"
    >
      <MpModalContent>
        <MpModalHeader>Complete shipment<MpModalCloseButton /></MpModalHeader>
        <MpModalBody>
          <MpFormControl id="shd-received-date" is-required class="shd-complete-field">
            <MpFormLabel>Date received</MpFormLabel>
            <div class="shd-datepicker">
              <MpDatePicker id="shd-received-date-dp" v-model="receivedDate" format="DD/MM/YYYY" value-type="format" use-portal />
            </div>
          </MpFormControl>

          <MpFormControl id="shd-received-by" is-required :is-invalid="!!receivedByError" class="shd-complete-field">
            <MpFormLabel>Received by</MpFormLabel>
            <MpInput
              id="shd-received-by-input" v-model="receivedBy" placeholder="Recipient name"
              @update:model-value="receivedByError = ''"
            />
            <MpFormErrorMessage>{{ receivedByError }}</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="shd-note" class="shd-complete-field">
            <MpFormLabel>Note</MpFormLabel>
            <MpTextarea id="shd-note-textarea" v-model="note" is-full-width :rows="3" />
          </MpFormControl>

          <MpFormControl id="shd-attachment" class="shd-complete-field">
            <MpFormLabel>Attachment</MpFormLabel>
            <div class="shd-attachment">
              <input ref="fileInput" type="file" accept=".pdf,.jpg,.jpeg,.png" class="shd-file-hidden" @change="onFileChange" />
              <div class="shd-attachment-row">
                <MpButton variant="secondary" size="sm" is-rounded @click="fileInput?.click()">Choose file</MpButton>
                <span class="shd-attach-or">or drag and drop here</span>
              </div>
              <ul v-if="attachedFiles.length" class="shd-file-list">
                <li v-for="f in attachedFiles" :key="f.name" class="shd-file-item">
                  <span class="shd-file-name">{{ f.name }}</span>
                  <button class="shd-file-remove" type="button" @click="removeFile(f.name)"><MpIcon name="close" size="xs" /></button>
                </li>
              </ul>
            </div>
          </MpFormControl>
        </MpModalBody>
        <MpModalFooter>
          <div class="shd-modal-footer">
            <MpButton variant="ghost" is-rounded @click="completeOpen = false">Cancel</MpButton>
            <MpButton variant="primary" is-rounded @click="confirmComplete">Complete shipment</MpButton>
          </div>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <PdfPreviewModal
      :open="pdfPreviewOpen"
      :doc="pdfPreviewDoc"
      :filename="pdfPreviewFilename"
      title="Shipment preview"
      @close="pdfPreviewOpen = false"
    />

  </div>

  <div v-else class="shd-not-found">
    <p>Shipment not found.</p>
    <button class="detail-breadcrumb" @click="goBack">Back to Shipped</button>
  </div>
</template>

<style scoped>
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center;
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
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
  display: flex; flex-direction: column; gap: var(--mp-spacing-8);
}
.shd-cancel-banner {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-warning-subtle, #fffbeb);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.shd-cancel-banner-icon { color: var(--mp-icon-warning, #d97706); flex-shrink: 0; }
.shd-cancel-banner-text { flex: 1; }
.shd-cancel-banner-btn {
  flex-shrink: 0; height: var(--mp-sizes-8, 32px); padding: 0 var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, #fff); color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); cursor: pointer;
}
.shd-cancel-banner-btn:hover { background: var(--mp-background-neutral-hovered); }
.shd-row-canceled .cell-text { color: var(--mp-text-secondary); }

.shd-summary { display: grid; grid-template-columns: 244px 244px; column-gap: var(--mp-spacing-6); row-gap: 0; }
.content-list-col { display: flex; flex-direction: column; }

.shd-table-wrap { overflow-x: auto; }
.detail-items { width: 100%; border-collapse: collapse; table-layout: fixed; }
.detail-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle); font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.detail-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.detail-td {
  position: relative;
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2); font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default); vertical-align: top;
}
.detail-td--num { text-align: right; white-space: nowrap; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }

/* Number cells — View details chip on hover */
.cell-with-action { position: relative; display: flex; align-items: center; width: 100%; min-width: 0; }
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.row-hover-btn {
  position: absolute; right: 0; top: var(--mp-spacing-2\.5, 10px); transform: translateY(-50%); display: none;
  align-items: center; gap: var(--mp-spacing-1\.5);
  padding: var(--mp-spacing-1) var(--mp-spacing-1\.5);
  background: var(--mp-background-neutral); border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-sm); cursor: pointer; white-space: nowrap; line-height: 1; color: var(--mp-text-secondary);
}
.row-hover-btn__label {
  font-size: var(--mp-font-sizes-2xs, 10px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-2xs, 12px); color: var(--mp-text-secondary); text-transform: uppercase;
}
.detail-item-row:hover .row-hover-btn { display: flex; }
.wh-link-wrap { position: relative; display: inline-flex; align-items: center; }
.wh-link-wrap:hover .row-hover-btn { display: flex; }

.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); background: var(--mp-background-stage);
  border-top: 1px solid var(--mp-border-default);
}
.detail-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap;
}
.detail-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-default); }
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.detail-btn--primary { background: var(--mp-background-brand-bold, #029861); border-color: transparent; color: var(--mp-text-on-color, #fff); }
.detail-btn--primary:hover { background: var(--mp-background-brand-bold-hovered, #027a4e); }

.shd-not-found { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--mp-spacing-4); height: 100%; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* Note / Attachment (mirrors Outgoing order detail) */
.detail-notes-left { display: flex; flex-direction: column; }
.detail-note-text { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); color: var(--mp-text-default); white-space: pre-line; }
.detail-attach-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.detail-attach { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); cursor: pointer; width: fit-content; }
.detail-attach-icon { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.detail-attach-meta { display: flex; flex-direction: column; }
.detail-attach-name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-link); }
.detail-attach:hover .detail-attach-name { text-decoration: underline; text-underline-offset: 2px; }

/* Complete shipment modal */
.shd-complete-field { margin-bottom: var(--mp-spacing-4); }
.shd-datepicker :deep(.mp-date-picker) { width: 100%; }
.shd-attachment { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.shd-file-hidden { display: none; }
.shd-attachment-row { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.shd-attach-or { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.shd-file-list { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; }
.shd-file-item { display: flex; align-items: center; gap: var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); }
.shd-file-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.shd-file-remove { display: flex; align-items: center; background: none; border: none; padding: 0; cursor: pointer; color: var(--mp-text-secondary); }
.shd-file-remove:hover { color: var(--mp-text-default); }
.shd-modal-footer { display: flex; justify-content: flex-end; gap: var(--mp-spacing-2); width: 100%; }
</style>
