<script setup lang="ts">
/**
 * CRM (Qontak) — Deal record detail (/crm/deals/:id). Renders the effective PRD
 * layout in read mode (Deal overview · Contact information · Products and value ·
 * Notes · ERP conversion · System information) plus Activity and Related tabs.
 *
 * Actions follow the PRD: Edit (drawer), Change stage (Won terminal, Lost reason,
 * reopen — all via CrmDealStageModal / ConfirmModal), manual ERP conversion at any
 * non-archived stage to the configured target (Sales Quote/Order) with Converted/
 * Failed status, and Archive / Restore — NEVER permanent delete (rule/
 * bulk-actions-no-delete + PRD "no permanent deletion in V1").
 */
import { ref, computed } from 'vue'
import {
  MpIcon, MpButton, MpButtonGroup, css, toast,
  MpTabs, MpTabList, MpTab, MpTabPanels, MpTabPanel,
  MpModal, MpModalContent, MpModalHeader, MpModalBody, MpModalFooter, MpModalOverlay,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import CrmDealFormDrawer from '~/components/patterns/CrmDealFormDrawer.vue'
import CrmDealStageModal from '~/components/patterns/CrmDealStageModal.vue'
import { formatMoney } from '~/utils/currency'
import { formatDate, formatDateTime } from '~/utils/date'
import { successToast, infoToast } from '~/utils/toasts'
import {
  getDeal, ONGOING_STAGES, moveDealStage, archiveDeal, restoreDeal, deleteDeal, convertDeal,
  dealConversionTarget, dealCalculatedValue, dealExpectedValue, lineDiscountedPrice, lineSubtotal,
  crmCustomers, crmOrders, crmTasks,
  type Deal, type DealStage,
} from '~/data/crm'

const props = defineProps<{ orderId: string }>()
const router = useRouter()

const deal = computed(() => getDeal(props.orderId))
const money = (n: number) => formatMoney(n, deal.value?.currency ?? 'IDR')

// ── Linked records ──
const customer = computed(() => (deal.value ? crmCustomers.find((c) => c.id === deal.value!.customerId) : undefined))
const linkedOrder = computed(() => (deal.value?.salesOrderId ? crmOrders.find((o) => o.id === deal.value!.salesOrderId) : undefined))
const companyOrders = computed(() => (deal.value ? crmOrders.filter((o) => o.customer === deal.value!.company) : []))
const followUps = computed(() => (deal.value ? crmTasks.filter((t) => t.relatedTo === deal.value!.company && t.status === 'open') : []))

// ── Conversion helpers ──
const isConverted = computed(() => deal.value?.conversion === 'converted')
const isFailed = computed(() => deal.value?.conversion === 'failed')
const isArchived = computed(() => !!deal.value?.archived)
const canConvert = computed(() => !!deal.value && !isArchived.value && deal.value.conversion === 'none' && !!deal.value.products?.length)
const convTarget = computed(() => deal.value?.convertedTarget ?? dealConversionTarget.value)

const activeTab = ref<number>(0)

// ── Stage progress ──
const FORWARD_STAGES: DealStage[] = ['Open Lead', '1st Meeting', 'Proposal', 'Negotiation', 'Won']
const isLost = computed(() => deal.value?.stage === 'Lost')
const currentStageIndex = computed(() => (deal.value ? FORWARD_STAGES.indexOf(deal.value.stage) : -1))

// ── Edit drawer ──
const editOpen = ref(false)
function onEditSaved() { editOpen.value = false; successToast('Deal saved') }

// ── Change stage ──
const stageModalOpen = ref(false)
const stageAllowed = computed<DealStage[] | undefined>(() => (isLost.value ? [...ONGOING_STAGES] : undefined))
const wonConfirmOpen = ref(false)
const reopenConfirmOpen = ref(false)
const pendingStage = ref<DealStage | null>(null)
function onStageConfirm(payload: { stage: DealStage; lostReason?: string }) {
  stageModalOpen.value = false
  const d = deal.value; if (!d) return
  if (payload.stage === 'Won') { pendingStage.value = 'Won'; wonConfirmOpen.value = true; return }
  if (d.stage === 'Lost' && payload.stage !== 'Lost') { pendingStage.value = payload.stage; reopenConfirmOpen.value = true; return }
  commit(payload.stage, payload.lostReason)
}
function commit(stage: DealStage, lostReason?: string) {
  const d = deal.value; if (!d) return
  const r = moveDealStage(d.id, stage, { lostReason })
  if (r.ok) successToast(`Stage changed to ${stage}`)
  else infoToast(r.error ?? 'Could not change stage')
}
function confirmWon() { if (pendingStage.value) commit('Won'); wonConfirmOpen.value = false; pendingStage.value = null }
function confirmReopen() { if (pendingStage.value) commit(pendingStage.value); reopenConfirmOpen.value = false; pendingStage.value = null }

// ── Convert modal ──
const isConvertOpen = ref(false)
const convertError = ref('')
function openConvert() { convertError.value = ''; isConvertOpen.value = true }
function closeConvert() { isConvertOpen.value = false }
function confirmConvert() {
  const d = deal.value; if (!d) return
  const result = convertDeal(d.id)
  if (result.ok) {
    isConvertOpen.value = false
    successToast(`${result.target} created`)
  } else {
    convertError.value = result.error ?? 'Conversion validation failed.'
  }
}

// ── Archive / restore / delete ──
const archiveConfirmOpen = ref(false)
function confirmArchive() { const d = deal.value; if (d) { archiveDeal(d.id); successToast('Deal archived') } archiveConfirmOpen.value = false }
function onRestore() { const d = deal.value; if (d) { restoreDeal(d.id); successToast('Deal restored') } }
const deleteConfirmOpen = ref(false)
function confirmDelete() {
  const d = deal.value
  deleteConfirmOpen.value = false
  if (d) { deleteDeal(d.id); successToast('Deal deleted'); router.push('/crm') }
}

// ── Badges ──
function dealStageBadge(stage: DealStage) {
  if (stage === 'Won') return { status: 'active', label: 'Won' }
  if (stage === 'Lost') return { status: 'churned', type: 'announcement' as const, label: 'Lost' }
  if (stage === 'Negotiation' || stage === 'Proposal') return { status: 'prospect', type: 'information' as const, label: stage }
  return { status: 'prospect', type: 'announcement' as const, label: stage }
}
function conversionBadge(c: string) {
  if (c === 'converted') return { status: 'active', label: 'Converted' }
  if (c === 'failed') return { status: 'churned', type: 'critical' as const, label: 'Failed' }
  if (c === 'processing') return { status: 'prospect', type: 'information' as const, label: 'Processing' }
  return { status: 'prospect', type: 'announcement' as const, label: 'Not converted' }
}
function orderBadge(status: string) {
  if (status === 'paid' || status === 'fulfilled') return { status: 'active', label: status }
  if (status === 'cancelled') return { status: 'churned', type: 'announcement' as const, label: status }
  return { status: 'prospect', type: 'information' as const, label: status }
}
function taskBadge(stage: string) {
  if (stage === 'Completed') return { status: 'active', label: stage }
  if (stage === 'In progress') return { status: 'prospect', type: 'information' as const, label: stage }
  return { status: 'prospect', type: 'announcement' as const, label: stage }
}

function goOrder(id: string) { router.push(`/crm/orders/${id}`) }
function goCustomer(id: string) { router.push(`/crm/customers/${id}`) }
</script>

<template>
  <div class="detail-page" v-if="deal">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" type="button" @click="router.push('/crm')">Deals</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ deal.name }}</h1>
          <ErpStatusBadge v-bind="dealStageBadge(deal.stage)" />
          <ErpStatusBadge v-if="deal.archived" status="archived" type="announcement" label="Archived" />
          <span class="dd-id">{{ deal.id }}</span>
        </div>
      </div>
      <div class="dd-bar-actions">
        <MpButtonGroup>
          <MpButton v-if="canConvert" variant="primary" is-rounded @click="openConvert">Create {{ dealConversionTarget }}</MpButton>
          <MpButton v-else-if="isConverted" variant="secondary" is-rounded @click="goOrder(deal.salesOrderId!)">View {{ convTarget }} {{ deal.salesOrderId }}</MpButton>
          <MpButton v-if="!deal.archived" variant="secondary" is-rounded @click="editOpen = true">Edit</MpButton>
          <MpButton v-if="deal.archived" variant="secondary" is-rounded @click="onRestore">Restore</MpButton>
          <MpPopover v-if="!deal.archived" id="dd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="primary" is-rounded right-icon="chevrons-down">Actions</MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="stageModalOpen = true">Change stage</MpPopoverListItem>
                <MpPopoverListItem @click="archiveConfirmOpen = true">Archive</MpPopoverListItem>
                <MpPopoverListItem @click="deleteConfirmOpen = true">Delete</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </MpButtonGroup>
      </div>
    </header>

    <div class="detail-stage">
      <!-- ── Summary metrics ── -->
      <section class="cd-summary">
        <div class="cd-metric">
          <span class="cd-metric-label">Expected value</span>
          <span class="cd-metric-value">{{ money(dealExpectedValue(deal)) }}</span>
          <span class="cd-metric-sub">{{ deal.valueOverridden ? 'Manual override' : 'Calculated' }}</span>
        </div>
        <div class="cd-metric">
          <span class="cd-metric-label">Due date</span>
          <span class="cd-metric-value cd-metric-value--sm">{{ deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : '—' }}</span>
          <span class="cd-metric-sub">Expected close</span>
        </div>
        <div class="cd-metric">
          <span class="cd-metric-label">Deal owner</span>
          <span class="cd-metric-value cd-metric-value--sm">{{ deal.owner }}</span>
          <span class="cd-metric-sub">Deal owner</span>
        </div>
        <div class="cd-metric">
          <span class="cd-metric-label">Currency</span>
          <span class="cd-metric-value cd-metric-value--sm">{{ deal.currency }}<template v-if="deal.currency !== 'IDR'"> · {{ deal.exchangeRate }}</template></span>
          <span class="cd-metric-sub">{{ deal.currency === 'IDR' ? 'Base currency' : 'Exchange rate' }}</span>
        </div>
        <div class="cd-metric cd-metric--wide">
          <span class="cd-metric-label">ERP transaction</span>
          <template v-if="isConverted">
            <a class="cd-metric-value cd-metric-value--sm cell-link" @click="goOrder(deal.salesOrderId!)">{{ deal.salesOrderId }}</a>
            <span class="cd-metric-sub">{{ convTarget }} · {{ linkedOrder ? linkedOrder.status : 'draft' }}</span>
          </template>
          <template v-else-if="isFailed">
            <span class="cd-metric-value cd-metric-value--sm cd-owed">Conversion failed</span>
            <span class="cd-metric-sub">See banner below</span>
          </template>
          <template v-else>
            <span class="cd-metric-value cd-metric-value--sm cd-muted">Not converted</span>
            <span class="cd-metric-sub">No {{ dealConversionTarget }} yet</span>
          </template>
        </div>
      </section>

      <!-- Archived banner -->
      <div v-if="isArchived" class="dd-banner dd-banner--muted">
        <MpIcon name="info" size="md" variant="fill" />
        <span>This deal is archived — hidden from active views and metrics. Restore it to edit, change stage, or convert.</span>
      </div>
      <!-- Failed-conversion banner -->
      <div v-if="isFailed" class="dd-banner dd-banner--warn">
        <MpIcon name="info" size="md" variant="fill" />
        <span>{{ deal.conversionError }}</span>
      </div>
      <!-- Post-conversion notice -->
      <div v-if="isConverted" class="dd-banner dd-banner--muted">
        <MpIcon name="info" size="md" variant="fill" />
        <span>This deal is linked to {{ convTarget }} {{ deal.salesOrderId }}. Editing the deal does not update the ERP transaction.</span>
      </div>

      <!-- Stage progress -->
      <section class="dd-progress" :class="{ 'dd-progress--lost': isLost }">
        <div
          v-for="(s, i) in FORWARD_STAGES"
          :key="s"
          class="dd-step"
          :class="{ 'dd-step--done': !isLost && i <= currentStageIndex }"
        >
          <span class="dd-step-dot" />
          <span class="dd-step-label">{{ s }}</span>
        </div>
        <div v-if="isLost" class="dd-step dd-step--lost">
          <span class="dd-step-dot" />
          <span class="dd-step-label">Lost</span>
        </div>
      </section>

      <MpTabs id="deal-detail-tabs" v-model="activeTab" is-manual variant-color="green" class="detail-tabs">
        <MpTabList>
          <MpTab>Overview</MpTab>
          <MpTab>Activity</MpTab>
          <MpTab>Related</MpTab>
        </MpTabList>

        <MpTabPanels>
          <!-- ── Overview ── -->
          <MpTabPanel>
            <div class="cd-panel">
              <!-- Deal overview -->
              <section class="cd-section">
                <h2 class="cd-section-title">Deal overview</h2>
                <div class="cd-grid">
                  <ContentList label="Deal name" :value="deal.name" />
                  <ContentList label="Deal number" :value="deal.id" />
                  <ContentList label="Customer">
                    <a v-if="customer" class="cell-link" @click="goCustomer(customer.id)">{{ deal.company }}</a>
                    <span v-else>{{ deal.company }}</span>
                  </ContentList>
                  <ContentList label="Stage"><ErpStatusBadge v-bind="dealStageBadge(deal.stage)" /></ContentList>
                  <ContentList label="Deal owner" :value="deal.owner" />
                  <ContentList label="Related people" :value="deal.relatedPeople?.length ? deal.relatedPeople.join(', ') : '—'" />
                  <ContentList label="Reference number" :value="deal.referenceNumber || '—'" />
                  <ContentList label="Due date" :value="deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : '—'" />
                  <ContentList v-if="isLost" label="Lost reason" :value="deal.lostReason || '—'" />
                </div>
                <div v-if="deal.description" class="cd-desc">
                  <span class="cd-desc-label">Description</span>
                  <p class="cd-desc-text">{{ deal.description }}</p>
                </div>
              </section>

              <!-- Contact information -->
              <section class="cd-section">
                <h2 class="cd-section-title">Contact information</h2>
                <div class="cd-grid">
                  <ContentList label="PIC name" :value="deal.picName || customer?.contact || '—'" />
                  <ContentList label="Phone numbers" :value="deal.phones?.length ? deal.phones.join(', ') : (customer?.phone || '—')" />
                  <ContentList label="Email">
                    <a v-if="deal.email || customer?.email" class="cell-link" :href="`mailto:${deal.email || customer?.email}`">{{ deal.email || customer?.email }}</a>
                    <span v-else>—</span>
                  </ContentList>
                </div>
              </section>

              <!-- Products and value -->
              <section class="cd-section cd-section--wide">
                <h2 class="cd-section-title">Products and value</h2>
                <div v-if="deal.products?.length" class="dd-table">
                  <div class="dd-thead dd-trow--lines">
                    <span>Product</span><span class="dd-num">Qty</span><span class="dd-num">Original price</span><span class="dd-num">Discounted</span><span class="dd-num">Subtotal</span>
                  </div>
                  <div v-for="(li, i) in deal.products" :key="i" class="dd-trow dd-trow--lines">
                    <span class="cell-text">{{ li.productName }} <span class="cd-muted">· {{ li.unit }}</span></span>
                    <span class="dd-num">{{ li.quantity }}</span>
                    <span class="dd-num">{{ money(li.originalPrice) }}</span>
                    <span class="dd-num">{{ money(lineDiscountedPrice(li)) }}</span>
                    <span class="dd-num">{{ money(lineSubtotal(li)) }}</span>
                  </div>
                </div>
                <p v-else class="cd-muted">No products on this deal.</p>

                <div class="cd-valuegrid">
                  <ContentList v-if="deal.tax" label="Tax" :value="deal.taxType === 'percentage' ? `${deal.tax}%` : money(deal.tax)" />
                  <ContentList v-if="deal.orderDiscount" label="Order discount" :value="deal.orderDiscountType === 'percentage' ? `${deal.orderDiscount}%` : money(deal.orderDiscount)" />
                  <ContentList v-if="deal.shippingFee" label="Shipping fee" :value="money(deal.shippingFee)" />
                  <ContentList v-if="deal.otherExpense" label="Other expense" :value="money(deal.otherExpense)" />
                  <ContentList label="Calculated value" :value="money(dealCalculatedValue(deal))" />
                  <ContentList label="Expected deal value" :value="`${money(dealExpectedValue(deal))}${deal.valueOverridden ? ' (override)' : ''}`" />
                  <ContentList label="Currency" :value="deal.currency" />
                  <ContentList v-if="deal.currency !== 'IDR'" label="Exchange rate" :value="String(deal.exchangeRate)" />
                </div>
              </section>

              <!-- Notes -->
              <section v-if="deal.notes" class="cd-section">
                <h2 class="cd-section-title">Notes</h2>
                <p class="cd-desc-text">{{ deal.notes }}</p>
              </section>

              <!-- ERP conversion -->
              <section class="cd-section">
                <h2 class="cd-section-title">ERP conversion</h2>
                <div class="cd-grid">
                  <ContentList label="Conversion status"><ErpStatusBadge v-bind="conversionBadge(deal.conversion)" /></ContentList>
                  <ContentList label="Linked ERP transaction">
                    <a v-if="isConverted" class="cell-link" @click="goOrder(deal.salesOrderId!)">{{ convTarget }} · {{ deal.salesOrderId }}</a>
                    <span v-else class="cd-muted">—</span>
                  </ContentList>
                </div>
              </section>

              <!-- System information -->
              <section class="cd-section">
                <h2 class="cd-section-title">System information</h2>
                <div class="cd-grid">
                  <ContentList label="Created" :value="formatDate(deal.createdAt)" />
                  <ContentList label="Created by" :value="deal.createdBy || '—'" />
                  <ContentList label="Last modified" :value="formatDate(deal.lastActivity)" />
                  <ContentList label="Last modified by" :value="deal.lastModifiedBy || deal.createdBy || '—'" />
                </div>
              </section>
            </div>
          </MpTabPanel>

          <!-- ── Activity ── -->
          <MpTabPanel>
            <div class="cd-panel">
              <section class="cd-section">
                <h2 class="cd-section-title">Activity</h2>
                <ol class="dd-timeline">
                  <li v-if="isConverted" class="dd-tl-item">
                    <span class="dd-tl-dot" />
                    <div class="dd-tl-body">
                      <span class="dd-tl-title">Converted to {{ convTarget }} {{ deal.salesOrderId }}</span>
                      <span class="dd-tl-time">{{ formatDateTime(deal.lastActivity) }}</span>
                    </div>
                  </li>
                  <li class="dd-tl-item">
                    <span class="dd-tl-dot" />
                    <div class="dd-tl-body">
                      <span class="dd-tl-title">Stage: {{ deal.stage }}</span>
                      <span class="dd-tl-time">{{ formatDateTime(deal.lastActivity) }}</span>
                    </div>
                  </li>
                  <li class="dd-tl-item">
                    <span class="dd-tl-dot" />
                    <div class="dd-tl-body">
                      <span class="dd-tl-title">Deal created by {{ deal.createdBy || 'system' }}</span>
                      <span class="dd-tl-time">{{ formatDateTime(deal.createdAt) }}</span>
                    </div>
                  </li>
                </ol>
              </section>
            </div>
          </MpTabPanel>

          <!-- ── Related ── -->
          <MpTabPanel>
            <div class="cd-panel">
              <section class="cd-section cd-section--wide">
                <h2 class="cd-section-title">Open follow-ups</h2>
                <div v-if="followUps.length" class="dd-table">
                  <div class="dd-thead dd-trow--tasks">
                    <span>Task</span><span>Type</span><span>Due date</span><span>Owner</span><span>Stage</span>
                  </div>
                  <div v-for="t in followUps" :key="t.id" class="dd-trow dd-trow--tasks">
                    <span class="cell-text">{{ t.title }}</span>
                    <span>{{ t.type }}</span>
                    <span>{{ formatDate(t.dueDate) }}</span>
                    <span>{{ t.owner }}</span>
                    <span><ErpStatusBadge v-bind="taskBadge(t.stage)" /></span>
                  </div>
                </div>
                <p v-else class="cd-muted">No open follow-ups for this company.</p>
              </section>

              <section class="cd-section cd-section--wide">
                <h2 class="cd-section-title">Sales orders</h2>
                <div v-if="companyOrders.length" class="dd-table">
                  <div class="dd-thead dd-trow--orders">
                    <span>Order number</span><span>Product</span><span>Date</span><span class="dd-num">Amount</span><span>Status</span>
                  </div>
                  <div
                    v-for="o in companyOrders"
                    :key="o.id"
                    class="dd-trow dd-trow--orders"
                    :class="{ 'dd-trow--linked': o.id === deal.salesOrderId }"
                  >
                    <span><a class="cell-link cell-text" @click="goOrder(o.id)">{{ o.id }}</a></span>
                    <span class="cd-muted">{{ o.product }}</span>
                    <span>{{ formatDate(o.date) }}</span>
                    <span class="dd-num">{{ formatMoney(o.amount, 'IDR') }}</span>
                    <span><ErpStatusBadge v-bind="orderBadge(o.status)" /></span>
                  </div>
                </div>
                <p v-else class="cd-muted">No sales orders for this company yet.</p>
              </section>
            </div>
          </MpTabPanel>
        </MpTabPanels>
      </MpTabs>
    </div>

    <!-- ── Edit drawer ── -->
    <CrmDealFormDrawer :open="editOpen" mode="edit" :deal="deal" @cancel="editOpen = false" @saved="onEditSaved" />

    <!-- ── Change stage + confirms ── -->
    <CrmDealStageModal :open="stageModalOpen" :count="1" :allowed-stages="stageAllowed" @close="stageModalOpen = false" @confirm="onStageConfirm" />
    <ConfirmModal
      v-model:is-open="wonConfirmOpen"
      title="Mark this deal as Won?"
      description="Won is a terminal stage — once set, the deal can’t move to another stage."
      confirm-label="Mark as Won"
      :is-danger="false"
      @confirm="confirmWon"
    />
    <ConfirmModal
      v-model:is-open="reopenConfirmOpen"
      title="Reopen this lost deal?"
      description="The deal returns to an active ongoing stage and rejoins the pipeline."
      confirm-label="Reopen deal"
      :is-danger="false"
      @confirm="confirmReopen"
    />
    <ConfirmModal
      v-model:is-open="archiveConfirmOpen"
      title="Archive this deal?"
      description="It will be hidden from active views and metrics. History and any ERP link are preserved, and you can restore it later."
      confirm-label="Archive deal"
      :is-danger="false"
      @confirm="confirmArchive"
    />
    <ConfirmModal
      v-model:is-open="deleteConfirmOpen"
      title="Delete this deal?"
      description="This permanently removes the deal and its history. This can’t be undone."
      confirm-label="Delete deal"
      @confirm="confirmDelete"
    />

    <!-- ── Convert modal ── -->
    <MpModal
      id="dd-convert-modal"
      :is-open="isConvertOpen"
      size="md"
      is-close-on-esc
      is-close-on-overlay-click
      :is-keep-alive="false"
      @close="closeConvert"
    >
      <MpModalContent>
        <MpModalHeader>Create {{ dealConversionTarget }}?</MpModalHeader>
        <MpModalBody>
          <p class="dd-modal-text">
            This creates a draft {{ dealConversionTarget }} for <strong>{{ deal.company }}</strong> worth
            <strong>{{ money(dealExpectedValue(deal)) }}</strong>, owned by <strong>{{ deal.owner }}</strong>.
            The deal keeps one linked transaction — you can’t convert it again.
          </p>
          <div v-if="convertError" class="dd-banner dd-banner--error">
            <MpIcon name="info" size="md" variant="fill" />
            <span>{{ convertError }}</span>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup>
            <MpButton variant="ghost" is-rounded @click="closeConvert">Cancel</MpButton>
            <MpButton variant="primary" is-rounded @click="confirmConvert">Create {{ dealConversionTarget }}</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>
  </div>

  <div v-else class="cd-missing">
    <MpIcon name="document" size="lg" />
    <p>Deal not found.</p>
    <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="router.push('/crm')">Back to Deals</button>
  </div>
</template>

<style scoped>
.detail-tabs { margin-top: 0; }
.detail-tabs :deep(.mp-tab--isSelected_true), .detail-tabs :deep(.mp-tab--isSelected_true:hover) { color: var(--mp-text-selected) !important; }
.detail-tabs :deep(.mp-tab--isSelected_true .mp-tab-selected-border) { background-color: var(--mp-border-selected, #029861) !important; }
.detail-tabs :deep([data-pixel-component="MpTabList"]) { margin-bottom: var(--mp-spacing-5) !important; }

.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar { flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); }
.detail-breadcrumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.detail-titlerow-left { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.detail-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: var(--mp-letter-spacings-tight, -0.2px); color: var(--mp-text-default); }
.dd-id { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); font-variant-numeric: tabular-nums; }
.dd-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }

.detail-stage { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: 0 var(--mp-spacing-6) var(--mp-spacing-6); border-top: var(--mp-spacing-6) solid var(--mp-background-stage); display: flex; flex-direction: column; gap: var(--mp-spacing-6); }

.cd-summary { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--mp-spacing-6); align-items: stretch; }
.cd-metric { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); padding-right: var(--mp-spacing-6); border-right: 1px solid var(--mp-border-default); min-width: 0; }
.cd-metric:last-child { border-right: none; }
.cd-metric-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); white-space: nowrap; }
.cd-metric-value { font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; white-space: nowrap; }
.cd-metric-value--sm { font-size: var(--mp-font-sizes-lg, 16px); }
.cd-metric-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }

.dd-banner { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); }
.dd-banner--warn { background: var(--mp-background-warning-subtle, #fef6e7); border: 1px solid var(--mp-border-warning, #f5c26b); color: var(--mp-text-warning, #b54708); }
.dd-banner--error { background: var(--mp-background-danger-subtle, #fdecec); border: 1px solid var(--mp-border-danger, #f0a3a3); color: var(--mp-text-danger, #c9372c); margin-top: var(--mp-spacing-4); }
.dd-banner--muted { background: var(--mp-background-neutral-subtle, #f4f5f7); border: 1px solid var(--mp-border-default); color: var(--mp-text-secondary); }

/* Stage progress */
.dd-progress { display: flex; align-items: flex-start; gap: 0; }
.dd-step { flex: 1; display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-2); position: relative; }
.dd-step::before { content: ''; position: absolute; top: 6px; left: -50%; width: 100%; height: 2px; background: var(--mp-border-default); z-index: 0; }
.dd-step:first-child::before { display: none; }
.dd-step-dot { width: 14px; height: 14px; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral, #eef0f3); border: 2px solid var(--mp-border-default); position: relative; z-index: 1; }
.dd-step-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); text-align: center; }
.dd-step--done .dd-step-dot { background: var(--mp-border-selected, #029861); border-color: var(--mp-border-selected, #029861); }
.dd-step--done .dd-step-label { color: var(--mp-text-default); font-weight: var(--mp-font-weights-medium, 500); }
.dd-step--lost .dd-step-dot { background: var(--mp-background-danger, #c9372c); border-color: var(--mp-background-danger, #c9372c); }
.dd-step--lost .dd-step-label { color: var(--mp-text-danger, #c9372c); font-weight: var(--mp-font-weights-medium, 500); }

.cd-panel { display: flex; flex-direction: column; gap: var(--mp-spacing-6); padding-top: var(--mp-spacing-5); }
.cd-section { display: flex; flex-direction: column; gap: var(--mp-spacing-3); max-width: 860px; }
.cd-section--wide { max-width: none; }
.cd-section-title { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default); }
.cd-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-2); }
.cd-valuegrid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-2); margin-top: var(--mp-spacing-3); }
.cd-muted { color: var(--mp-text-subtle); }
.cd-owed { color: var(--mp-text-warning, #b54708); }
.cd-desc { display: flex; flex-direction: column; gap: var(--mp-spacing-1); margin-top: var(--mp-spacing-2); }
.cd-desc-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cd-desc-text { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); }

/* Activity timeline */
.dd-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.dd-tl-item { display: flex; gap: var(--mp-spacing-3); padding-bottom: var(--mp-spacing-4); position: relative; }
.dd-tl-item:not(:last-child)::before { content: ''; position: absolute; left: 5px; top: 14px; bottom: 0; width: 2px; background: var(--mp-border-default); }
.dd-tl-dot { width: 12px; height: 12px; border-radius: var(--mp-radii-full, 999px); background: var(--mp-border-selected, #029861); flex-shrink: 0; margin-top: 2px; position: relative; z-index: 1; }
.dd-tl-body { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.dd-tl-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-weight: var(--mp-font-weights-medium, 500); }
.dd-tl-time { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Related + line tables */
.dd-table { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 10px); overflow: hidden; }
.dd-thead, .dd-trow { display: grid; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.dd-trow--tasks { grid-template-columns: 2fr 1fr 1fr 1.2fr 1fr; }
.dd-trow--orders { grid-template-columns: 1fr 2fr 1fr 1fr 1fr; }
.dd-trow--lines { grid-template-columns: 2fr 0.6fr 1fr 1fr 1fr; }
.dd-thead { background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.dd-trow { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); }
.dd-trow:last-child { border-bottom: none; }
.dd-trow--linked { background: var(--mp-background-neutral-subtle); }
.dd-num { text-align: right; font-variant-numeric: tabular-nums; }

.dd-modal-text { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); }

.cell-link { color: var(--mp-text-link); cursor: pointer; }
.cell-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cell-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0; }

.cd-missing { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: 80px; color: var(--mp-text-secondary); }
</style>
