<script setup lang="ts">
/**
 * CrmServiceDetailPage — record detail for a Service deal (/crm/services/:id) in
 * the custom "Service deals" module. Mirrors the Deals detail-page format:
 * title bar (breadcrumb + actions) → stage stepper → 5 tabs (Service details ·
 * Activity · Notes · Files · ERP transactions). Read/write the ONE serviceDeals
 * dataset; Edit routes to the form, Archive/Delete use ConfirmModal + toast.
 */
import { ref, computed } from 'vue'
import {
  MpIcon, MpButton, css, MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ProductCell from '~/components/patterns/ProductCell.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ActivityLogTable from '~/components/patterns/ActivityLogTable.vue'
import CrmNotesPanel from '~/components/patterns/CrmNotesPanel.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { formatMoney } from '~/utils/currency'
import { successToast } from '~/utils/toasts'
import {
  getServiceDeal, serviceStages, serviceStageBadgeType, serviceActivityLog,
  serviceProductsTotal, lineSubtotal, archiveServiceDeal, restoreServiceDeal,
  deleteServiceDeal, persistServiceDeals, type OrderStatus,
} from '~/data/crm'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const { t } = useLocale()

const rec = computed(() => getServiceDeal(props.orderId))
const money = (n: number) => formatMoney(n, rec.value?.currency ?? 'IDR')
const stages = computed(() => serviceStages())
const currentIndex = computed(() => stages.value.findIndex((s) => s.name === rec.value?.stage))
const isArchived = computed(() => !!rec.value?.archived)
const activity = computed(() => (rec.value ? serviceActivityLog(rec.value) : []))
const productsTotal = computed(() => (rec.value ? serviceProductsTotal(rec.value) : 0))

// ERP transaction status → badge label + tone.
const TX_STATUS: Record<OrderStatus, { label: string; type: string }> = {
  'draft': { label: 'Draft', type: 'announcement' },
  'awaiting-payment': { label: 'Awaiting payment', type: 'warning' },
  'paid': { label: 'Paid', type: 'completed' },
  'fulfilled': { label: 'Fulfilled', type: 'information' },
  'cancelled': { label: 'Cancelled', type: 'announcement' },
}

function back() { router.push('/crm/services') }
function fmtDate(iso?: string) {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return iso
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}
function editRecord() { if (rec.value) router.push(`/crm/services/${rec.value.id}/edit`) }

// ── Archive / restore / delete ──
const archiveOpen = ref(false)
const deleteOpen = ref(false)
function confirmArchive() { if (rec.value) { archiveServiceDeal(rec.value.id); successToast(t('Service deal archived')); archiveOpen.value = false } }
function onRestore() { if (rec.value) { restoreServiceDeal(rec.value.id); successToast(t('Service deal restored')) } }
function confirmDelete() { if (rec.value) { deleteServiceDeal(rec.value.id); deleteOpen.value = false; router.push('/crm/services') } }

// ── Files (upload / list) ──
const fileInput = ref<HTMLInputElement | null>(null)
function pickFiles() { fileInput.value?.click() }
function onFileInput(e: Event) {
  const input = e.target as HTMLInputElement
  const r = rec.value
  if (!r || !input.files?.length) return
  r.files = r.files ?? []
  for (const f of Array.from(input.files)) {
    r.files.push({ name: f.name, sizeKB: Math.max(1, Math.round(f.size / 1024)), uploadedBy: 'Rizal Candra', uploadedAt: new Date().toISOString().slice(0, 19) })
  }
  persistServiceDeals()
  successToast(t('File uploaded'))
  input.value = ''
}
function attachmentIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['pdf'].includes(ext)) return 'file-pdf'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'file-excel'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp'].includes(ext)) return 'image'
  return 'file-blank'
}
function fmtSize(kb: number) { return kb >= 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB` }
function goTransaction(id: string) { router.push(`/sales-orders/${id}`) }
</script>

<template>
  <div class="crm">
    <template v-if="rec">
      <!-- Title bar -->
      <header class="svc-bar">
        <div class="svc-bar-left">
          <a class="svc-breadcrumb" @click="back">{{ t('Service deals') }}</a>
          <div class="svc-titlerow">
            <h1 class="svc-title">{{ rec.name }}</h1>
            <ErpStatusBadge v-if="isArchived" status="archived" :label="t('Archived')" type="announcement" />
          </div>
        </div>
        <div class="svc-bar-right">
          <MpButton v-if="!isArchived" variant="secondary" is-rounded left-icon="edit-pencil" @click="editRecord">{{ t('Edit') }}</MpButton>
          <MpButton v-else variant="secondary" is-rounded left-icon="undo" @click="onRestore">{{ t('Restore') }}</MpButton>
          <MpPopover id="svc-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton class="svc-icon-btn" :aria-label="t('More actions')"><MpIcon name="menu-kebab" size="md" /></MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '180px' })">
              <MpPopoverList>
                <MpPopoverListItem v-if="!isArchived" @click="editRecord">{{ t('Edit') }}</MpPopoverListItem>
                <MpPopoverListItem v-if="!isArchived" @click="archiveOpen = true">{{ t('Archive') }}</MpPopoverListItem>
                <MpPopoverListItem v-else @click="onRestore">{{ t('Restore') }}</MpPopoverListItem>
                <MpPopoverListItem @click="deleteOpen = true">{{ t('Delete') }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </header>

      <div class="svc-stage">
        <!-- Stage stepper -->
        <section class="svc-stepper">
          <div class="svc-stepper-labels">
            <div v-for="(s, i) in stages" :key="s.name" class="svc-step" :class="{ 'svc-step--current': i === currentIndex, 'svc-step--done': i <= currentIndex }">
              <span class="svc-step-name">{{ s.name }}</span>
            </div>
          </div>
          <div class="svc-stepper-bar">
            <span v-for="(s, i) in stages" :key="s.name" class="svc-bar-seg" :class="{ 'svc-bar-seg--filled': i <= currentIndex }" />
          </div>
        </section>

        <!-- Tabs -->
        <MpTabs :key="rec.id" id="svc-tabs" :default-value="0" variant-color="green" class="svc-tabs">
          <MpTabList>
            <MpTab id="svc-tab-details" value="details">{{ t('Service details') }}</MpTab>
            <MpTab id="svc-tab-activity" value="activity">{{ t('Activity') }}</MpTab>
            <MpTab id="svc-tab-notes" value="notes">{{ t('Notes') }}</MpTab>
            <MpTab id="svc-tab-files" value="files">{{ t('Files') }}</MpTab>
            <MpTab id="svc-tab-orders" value="orders">{{ t('ERP transactions') }}</MpTab>
          </MpTabList>
          <MpTabPanels>
            <!-- ── Service details ── -->
            <MpTabPanel value="details">
              <section class="svc-summary">
                <div class="content-list-grid">
                  <div class="svc-col">
                    <ContentList :label="t('Customer')" :value="rec.company || '—'" />
                    <ContentList :label="t('Primary contact')" :value="rec.contact || '—'" />
                  </div>
                  <div class="svc-col">
                    <ContentList :label="t('Service type')" :value="rec.serviceType" />
                    <ContentList :label="t('Owner')" :value="rec.owner" />
                    <ContentList :label="t('Stage')">
                      <ErpStatusBadge :status="rec.stage" :label="rec.stage" :type="serviceStageBadgeType(rec.stage)" />
                    </ContentList>
                  </div>
                  <div class="svc-col">
                    <ContentList :label="t('Transaction no.')" :value="rec.transactionNo" />
                    <ContentList :label="t('Reference no.')" :value="rec.referenceNo || '—'" />
                    <ContentList :label="t('Currency')" :value="rec.currency" />
                  </div>
                  <div class="svc-primary-total">
                    <span class="svc-total-label">{{ t('Value') }}</span>
                    <span class="svc-total-amount">{{ money(rec.value) }}</span>
                  </div>
                </div>

                <div class="svc-divider" />

                <div class="content-list-grid">
                  <div class="svc-col">
                    <ContentList :label="t('Transaction date')" :value="fmtDate(rec.transactionDate)" />
                    <ContentList :label="t('Due date')" :value="fmtDate(rec.dueDate)" />
                  </div>
                  <div class="svc-col">
                    <ContentList :label="t('Payment terms')" :value="rec.paymentTerms || '—'" />
                  </div>
                  <div class="svc-col" />
                  <div class="svc-col" />
                </div>
              </section>

              <!-- Products -->
              <section class="svc-block">
                <h3 class="svc-tab-heading">{{ t('Products') }}</h3>
                <table v-if="rec.products?.length" class="svc-items">
                  <thead>
                    <tr>
                      <th class="svc-th">{{ t('Service item') }}</th>
                      <th class="svc-th">{{ t('Description') }}</th>
                      <th class="svc-th svc-th--num">{{ t('Qty') }}</th>
                      <th class="svc-th">{{ t('Unit') }}</th>
                      <th class="svc-th svc-th--num">{{ t('Unit price') }}</th>
                      <th class="svc-th svc-th--num">{{ t('Amount') }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(li, i) in rec.products" :key="i" class="svc-item-row">
                      <td class="svc-td"><ProductCell :name="li.productName" /></td>
                      <td class="svc-td svc-td--muted">{{ li.description || '—' }}</td>
                      <td class="svc-td svc-td--num">{{ li.quantity }}</td>
                      <td class="svc-td">{{ li.unit }}</td>
                      <td class="svc-td svc-td--num">{{ money(li.originalPrice) }}</td>
                      <td class="svc-td svc-td--num">{{ money(lineSubtotal(li)) }}</td>
                    </tr>
                  </tbody>
                </table>
                <p v-else class="svc-tab-empty">{{ t('No products added to this service yet.') }}</p>

                <div v-if="rec.products?.length" class="svc-totals">
                  <div class="svc-total-row svc-total-row--total">
                    <span>{{ t('Total') }}</span>
                    <span>{{ money(productsTotal) }}</span>
                  </div>
                </div>
              </section>

              <!-- Description + memo -->
              <section class="svc-block svc-notes">
                <ContentList :label="t('Description')" :value="rec.description || '—'" />
                <ContentList v-if="rec.memo" :label="t('Memo')">
                  <span class="svc-note-text">{{ rec.memo }}</span>
                </ContentList>
              </section>
            </MpTabPanel>

            <!-- ── Activity ── -->
            <MpTabPanel value="activity">
              <h3 class="svc-tab-heading">{{ t('Activity log') }}</h3>
              <ActivityLogTable :entries="activity" />
            </MpTabPanel>

            <!-- ── Notes ── -->
            <MpTabPanel value="notes">
              <h3 class="svc-tab-heading">{{ t('Notes') }}</h3>
              <CrmNotesPanel entity-type="service" :entity-id="rec.id" author="Rizal Candra" />
            </MpTabPanel>

            <!-- ── Files ── -->
            <MpTabPanel value="files">
              <div class="svc-files-head">
                <h3 class="svc-tab-heading">{{ t('Attachment') }} ({{ rec.files?.length ?? 0 }})</h3>
                <MpButton variant="tertiary" is-rounded left-icon="upload" @click="pickFiles">{{ t('Upload file') }}</MpButton>
                <input ref="fileInput" type="file" multiple class="svc-files-input" @change="onFileInput" />
              </div>
              <table v-if="rec.files?.length" class="svc-linked">
                <colgroup><col /><col class="svc-col--owner" /><col class="svc-col--date" /></colgroup>
                <thead>
                  <tr>
                    <th class="svc-th">{{ t('File name') }}</th>
                    <th class="svc-th">{{ t('Uploaded by') }}</th>
                    <th class="svc-th">{{ t('Uploaded') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(f, i) in rec.files" :key="i" class="svc-item-row">
                    <td class="svc-td">
                      <span class="svc-file-cell">
                        <MpIcon :name="attachmentIcon(f.name)" size="md" class="svc-file-icon" />
                        <span class="svc-file-meta"><span class="svc-file-name">{{ f.name }}</span><span class="svc-file-size">{{ fmtSize(f.sizeKB) }}</span></span>
                      </span>
                    </td>
                    <td class="svc-td">{{ f.uploadedBy || '—' }}</td>
                    <td class="svc-td">{{ fmtDate(f.uploadedAt) }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="svc-tab-empty">{{ t('No files attached to this service yet. Upload one above.') }}</p>
            </MpTabPanel>

            <!-- ── ERP transactions ── -->
            <MpTabPanel value="orders">
              <h3 class="svc-tab-heading">{{ t('ERP transactions') }}</h3>
              <table v-if="rec.linkedTransaction" class="svc-linked">
                <thead>
                  <tr>
                    <th class="svc-th">{{ t('Date') }}</th>
                    <th class="svc-th">{{ t('Number') }}</th>
                    <th class="svc-th">{{ t('Type') }}</th>
                    <th class="svc-th">{{ t('Due date') }}</th>
                    <th class="svc-th">{{ t('Status') }}</th>
                    <th class="svc-th svc-th--num">{{ t('Balance due') }}</th>
                    <th class="svc-th svc-th--num">{{ t('Total') }}</th>
                  </tr>
                </thead>
                <tbody>
                  <tr class="svc-item-row">
                    <td class="svc-td">{{ fmtDate(rec.linkedTransaction.date) }}</td>
                    <td class="svc-td"><a class="cell-link" @click="goTransaction(rec.linkedTransaction.id)">{{ rec.linkedTransaction.number }}</a></td>
                    <td class="svc-td">{{ rec.linkedTransaction.type }}</td>
                    <td class="svc-td">{{ fmtDate(rec.linkedTransaction.dueDate) }}</td>
                    <td class="svc-td">
                      <ErpStatusBadge :status="rec.linkedTransaction.status" :label="TX_STATUS[rec.linkedTransaction.status]?.label ?? rec.linkedTransaction.status" :type="TX_STATUS[rec.linkedTransaction.status]?.type ?? 'announcement'" />
                    </td>
                    <td class="svc-td svc-td--num">{{ money(rec.linkedTransaction.balanceDue) }}</td>
                    <td class="svc-td svc-td--num">{{ money(rec.linkedTransaction.total) }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-else class="svc-tab-empty">{{ t('No ERP transaction linked to this service yet.') }}</p>
            </MpTabPanel>
          </MpTabPanels>
        </MpTabs>
      </div>

      <!-- Confirm modals -->
      <ConfirmModal
        v-model:is-open="archiveOpen" :title="t('Archive this service deal?')"
        :description="t('It will be hidden from active views and metrics. You can restore it later.')"
        :confirm-label="t('Archive')" @confirm="confirmArchive"
      />
      <ConfirmModal
        v-model:is-open="deleteOpen" :title="t('Delete this service deal?')"
        :description="t('This permanently removes the record. This action cannot be undone.')"
        :confirm-label="t('Delete')" is-danger @confirm="confirmDelete"
      />
    </template>

    <!-- Not found -->
    <div v-else class="svc-empty">
      <MpIcon name="folder-close" size="xl" />
      <p class="svc-empty-title">{{ t('Service deal not found') }}</p>
      <MpButton variant="secondary" is-rounded @click="back">{{ t('Back to Service deals') }}</MpButton>
    </div>
  </div>
</template>

<style scoped>
/* Title bar */
.svc-bar { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-4); padding: var(--mp-spacing-5) var(--mp-spacing-6) var(--mp-spacing-4); }
.svc-bar-left { display: flex; flex-direction: column; gap: var(--mp-spacing-1); min-width: 0; }
.svc-breadcrumb { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-link, #165082); cursor: pointer; }
.svc-breadcrumb:hover { text-decoration: underline; }
.svc-titlerow { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.svc-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-colors-text-default, #080d0e); }
.svc-bar-right { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }
.svc-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; padding: 0; border: 1px solid var(--mp-colors-border-default, #e3e7e9); background: var(--mp-colors-background-neutral, #fff); border-radius: var(--mp-radii-full, 999px); cursor: pointer; color: var(--mp-colors-icon-default, #536062); }
.svc-icon-btn:hover { background: var(--mp-colors-background-neutral-hovered, #eef0f3); }

.svc-stage { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-6); background: var(--mp-background-stage, #fff); padding: 0 var(--mp-spacing-6) var(--mp-spacing-8); }

/* Stage stepper */
.svc-stepper { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.svc-stepper-labels { display: flex; gap: var(--mp-spacing-2); }
.svc-step { flex: 1; min-width: 0; }
.svc-step-name { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #6b7678); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.svc-step--current .svc-step-name { color: var(--mp-colors-text-success, #16b364); font-weight: var(--mp-font-weights-semi-bold, 600); }
.svc-stepper-bar { display: flex; gap: var(--mp-spacing-2); }
.svc-bar-seg { flex: 1; height: 6px; border-radius: 3px; background: var(--mp-colors-background-neutral-subtle, #eef1f1); }
.svc-bar-seg--filled { background: var(--mp-colors-background-success-bold, #16b364); }

/* Tabs */
.svc-tabs { display: flex; flex-direction: column; }
.svc-tab-heading { margin: 0 0 var(--mp-spacing-4); font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-default, #080d0e); }
.svc-tab-empty { margin: 0; padding: var(--mp-spacing-6) 0; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #6b7678); }

/* Summary */
.svc-summary { padding-top: var(--mp-spacing-5); }
.content-list-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) auto; column-gap: var(--mp-spacing-6); }
.svc-col { display: flex; flex-direction: column; min-width: 0; }
.svc-primary-total { justify-self: end; text-align: right; }
.svc-total-label { display: block; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-secondary, #6b7678); }
.svc-total-amount { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-colors-text-default, #080d0e); }
.svc-divider { border-top: 1px dashed var(--mp-colors-border-default, #e3e7e9); margin: var(--mp-spacing-5) 0; }

/* Blocks + tables */
.svc-block { padding-top: var(--mp-spacing-6); }
.svc-items, .svc-linked { width: 100%; border-collapse: collapse; }
.svc-th { text-align: left; padding: var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-secondary, #6b7678); border-bottom: 1px solid var(--mp-colors-border-default, #e3e7e9); white-space: nowrap; }
.svc-th--num { text-align: right; }
.svc-td { padding: var(--mp-spacing-3); font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-default, #080d0e); border-bottom: 1px solid var(--mp-colors-border-subtle, #f0f2f2); vertical-align: middle; }
.svc-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.svc-td--muted { color: var(--mp-colors-text-secondary, #6b7678); }
.svc-col--owner { width: 200px; }
.svc-col--date { width: 160px; }

.svc-totals { display: flex; flex-direction: column; align-items: flex-end; padding-top: var(--mp-spacing-4); }
.svc-total-row { display: flex; justify-content: space-between; gap: var(--mp-spacing-8); min-width: 260px; font-size: var(--mp-font-sizes-md, 14px); }
.svc-total-row--total { font-weight: var(--mp-font-weights-bold, 700); color: var(--mp-colors-text-default, #080d0e); }

.svc-notes { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.svc-note-text { white-space: pre-wrap; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-default, #080d0e); }

/* Files */
.svc-files-head { display: flex; align-items: center; gap: var(--mp-spacing-3); margin-bottom: var(--mp-spacing-4); }
.svc-files-head .svc-tab-heading { margin: 0; margin-right: auto; }
.svc-files-input { display: none; }
.svc-file-cell { display: inline-flex; align-items: center; gap: var(--mp-spacing-3); }
.svc-file-icon { color: var(--mp-colors-icon-default, #536062); flex-shrink: 0; }
.svc-file-meta { display: flex; flex-direction: column; }
.svc-file-name { font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-colors-text-default, #080d0e); }
.svc-file-size { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-colors-text-secondary, #6b7678); }

.cell-link { color: var(--mp-colors-text-link, #165082); cursor: pointer; }
.cell-link:hover { text-decoration: underline; }

/* Not found */
.svc-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-12) var(--mp-spacing-6); text-align: center; color: var(--mp-colors-text-secondary, #6b7678); }
.svc-empty-title { font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-colors-text-default, #080d0e); margin: 0; }
</style>
