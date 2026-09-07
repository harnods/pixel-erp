<script setup lang="ts">
/**
 * CRM (Qontak) — Deal record detail (/crm/deals/:id), mirrors CrmCustomerDetailPage:
 * detail-bar header + summary metrics + green MpTabs (Overview · Activity · Related).
 * The record's spine is the CRM ↔ ERP bridge: a Won deal converts into a real Sales
 * Order (crmOrders). The header/summary reflect that conversion state and the Convert
 * modal drives it — a validation-failed deal surfaces its stored error inline.
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
import { formatIDR } from '~/utils/currency'
import { formatDate, formatDateTime } from '~/utils/date'
import { infoToast } from '~/utils/toasts'
import {
  getDeal, DEAL_STAGES, convertDealToSalesOrder,
  crmCustomers, crmOrders, crmTasks,
  type DealStage,
} from '~/data/crm'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
function soon(what: string) { infoToast(`${what} — coming soon`) }

const deal = computed(() => getDeal(props.orderId))

// ── Linked records ──
const customer = computed(() => (deal.value ? crmCustomers.find((c) => c.id === deal.value!.customerId) : undefined))
const linkedOrder = computed(() => (deal.value?.salesOrderId ? crmOrders.find((o) => o.id === deal.value!.salesOrderId) : undefined))
const companyOrders = computed(() => (deal.value ? crmOrders.filter((o) => o.customer === deal.value!.company) : []))
const followUps = computed(() => (deal.value ? crmTasks.filter((t) => t.relatedTo === deal.value!.company && t.status === 'open') : []))

// ── Conversion helpers ──
const isConverted = computed(() => deal.value?.conversion === 'converted')
const isValidationFailed = computed(() => deal.value?.conversion === 'validation-failed')
const canConvert = computed(() => deal.value?.stage === 'Won' && deal.value?.conversion !== 'converted')

// Detail tabs (Overview / Activity / Related) — MpTabs is-manual needs a v-model.
const activeTab = ref<number>(0)

// ── Stage progress (forward stages; Lost shown distinctly) ──
const FORWARD_STAGES = DEAL_STAGES.filter((s) => s !== 'Lost')
const isLost = computed(() => deal.value?.stage === 'Lost')
const currentStageIndex = computed(() => (deal.value ? (FORWARD_STAGES as readonly DealStage[]).indexOf(deal.value.stage) : -1))

// ── Convert modal ──
const isConvertOpen = ref(false)
const convertError = ref('')
function openConvert() { convertError.value = ''; isConvertOpen.value = true }
function closeConvert() { isConvertOpen.value = false }
function confirmConvert() {
  if (!deal.value) return
  const result = convertDealToSalesOrder(deal.value.id)
  if (result.ok) {
    isConvertOpen.value = false
    toast.notify({ variant: 'success', title: 'Sales order created', maxWidth: 'max-content', rootProps: { class: 'toast-enterprise' } })
  } else {
    // rule/form-errors-inline — keep the modal open, show the reason inline (never toast it).
    convertError.value = result.error ?? 'Conversion validation failed.'
  }
}

// ── Delete confirm ──
const isDeleteOpen = ref(false)
function confirmDelete() {
  isDeleteOpen.value = false
  toast.notify({ variant: 'success', title: 'Deal deleted', maxWidth: 'max-content', rootProps: { class: 'toast-enterprise' } })
  router.push('/crm')
}

// ── Badges ──
function dealStageBadge(stage: DealStage) {
  if (stage === 'Won') return { status: 'active', label: 'Won' }
  if (stage === 'Lost') return { status: 'churned', type: 'announcement' as const, label: 'Lost' }
  if (stage === 'Negotiation' || stage === 'Proposal') return { status: 'prospect', type: 'information' as const, label: stage }
  return { status: 'prospect', type: 'announcement' as const, label: stage }
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
          <span class="dd-id">{{ deal.id }}</span>
        </div>
      </div>
      <div class="dd-bar-actions">
        <MpButtonGroup>
          <MpButton v-if="canConvert" variant="primary" is-rounded @click="openConvert">Convert to Sales Order</MpButton>
          <MpButton v-else-if="isConverted" variant="secondary" is-rounded @click="goOrder(deal.salesOrderId!)">View Sales Order {{ deal.salesOrderId }}</MpButton>
          <MpButton variant="secondary" is-rounded @click="soon('Edit deal')">Edit</MpButton>
          <MpPopover id="dd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
            <MpPopoverTrigger>
              <MpButton variant="primary" is-rounded right-icon="chevrons-down">Actions</MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
              <MpPopoverList>
                <MpPopoverListItem @click="soon('Change stage')">Change stage</MpPopoverListItem>
                <MpPopoverListItem @click="soon('Log activity')">Log activity</MpPopoverListItem>
                <MpPopoverListItem :class="css({ color: 'var(--mp-text-danger)' })" @click="isDeleteOpen = true">Delete</MpPopoverListItem>
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
          <span class="cd-metric-label">Value</span>
          <span class="cd-metric-value">{{ formatIDR(deal.value) }}</span>
          <span class="cd-metric-sub">Deal value</span>
        </div>
        <div class="cd-metric">
          <span class="cd-metric-label">Expected close</span>
          <span class="cd-metric-value cd-metric-value--sm">{{ formatDate(deal.expectedCloseDate) }}</span>
          <span class="cd-metric-sub">Target date</span>
        </div>
        <div class="cd-metric">
          <span class="cd-metric-label">Owner</span>
          <span class="cd-metric-value cd-metric-value--sm">{{ deal.owner }}</span>
          <span class="cd-metric-sub">Deal owner</span>
        </div>
        <div class="cd-metric">
          <span class="cd-metric-label">Priority</span>
          <span class="cd-metric-value cd-metric-value--sm dd-cap">{{ deal.priority }}</span>
          <span class="cd-metric-sub">Deal priority</span>
        </div>
        <div class="cd-metric cd-metric--wide">
          <span class="cd-metric-label">ERP transaction</span>
          <template v-if="isConverted">
            <a class="cd-metric-value cd-metric-value--sm cell-link" @click="goOrder(deal.salesOrderId!)">{{ deal.salesOrderId }}</a>
            <span class="cd-metric-sub">Sales Order · {{ linkedOrder ? linkedOrder.status : 'draft' }}</span>
          </template>
          <template v-else-if="isValidationFailed">
            <span class="cd-metric-value cd-metric-value--sm cd-owed">Conversion blocked</span>
            <span class="cd-metric-sub">See banner below</span>
          </template>
          <template v-else>
            <span class="cd-metric-value cd-metric-value--sm cd-muted">Not converted</span>
            <span class="cd-metric-sub">No Sales Order yet</span>
          </template>
        </div>
      </section>

      <!-- Validation-failed banner -->
      <div v-if="isValidationFailed" class="dd-banner dd-banner--warn">
        <MpIcon name="info" size="md" variant="fill" />
        <span>{{ deal.conversionError }}</span>
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
              <section class="cd-section">
                <h2 class="cd-section-title">Deal</h2>
                <div class="cd-grid">
                  <ContentList label="Deal name" :value="deal.name" />
                  <ContentList label="Deal number" :value="deal.id" />
                  <ContentList label="Customer">
                    <a v-if="customer" class="cell-link" @click="goCustomer(customer.id)">{{ deal.company }}</a>
                    <span v-else>{{ deal.company }}</span>
                  </ContentList>
                  <ContentList label="Stage">
                    <ErpStatusBadge v-bind="dealStageBadge(deal.stage)" />
                  </ContentList>
                  <ContentList label="Owner" :value="deal.owner" />
                  <ContentList label="Value" :value="formatIDR(deal.value)" />
                  <ContentList label="Priority"><span class="dd-cap">{{ deal.priority }}</span></ContentList>
                  <ContentList label="Expected close date" :value="formatDate(deal.expectedCloseDate)" />
                  <ContentList label="Created" :value="formatDate(deal.createdAt)" />
                  <ContentList label="Last activity" :value="formatDate(deal.lastActivity)" />
                  <ContentList v-if="isLost" label="Lost reason" :value="deal.lostReason || '—'" />
                  <ContentList label="ERP Sales Order">
                    <a v-if="isConverted" class="cell-link" @click="goOrder(deal.salesOrderId!)">{{ deal.salesOrderId }}</a>
                    <span v-else class="cd-muted">Not converted</span>
                  </ContentList>
                </div>
              </section>

              <section class="cd-section">
                <h2 class="cd-section-title">Contact</h2>
                <div v-if="customer" class="cd-grid">
                  <ContentList label="Primary contact" :value="customer.contact || '—'" />
                  <ContentList label="Email">
                    <a v-if="customer.email" class="cell-link" :href="`mailto:${customer.email}`">{{ customer.email }}</a>
                    <span v-else>—</span>
                  </ContentList>
                  <ContentList label="Mobile" :value="customer.phone || '—'" />
                  <ContentList label="City" :value="customer.city || '—'" />
                  <ContentList label="Segment" :value="customer.segment || '—'" />
                </div>
                <p v-else class="cd-muted">No linked customer record.</p>
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
                      <span class="dd-tl-title">Converted to Sales Order {{ deal.salesOrderId }}</span>
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
                      <span class="dd-tl-title">Last activity</span>
                      <span class="dd-tl-time">{{ formatDateTime(deal.lastActivity) }}</span>
                    </div>
                  </li>
                  <li class="dd-tl-item">
                    <span class="dd-tl-dot" />
                    <div class="dd-tl-body">
                      <span class="dd-tl-title">Deal created</span>
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
                    <span class="dd-num">{{ formatIDR(o.amount) }}</span>
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

    <!-- ── Convert modal (MpModal — needs a custom body summary + inline error banner) ── -->
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
        <MpModalHeader>Convert to Sales Order?</MpModalHeader>
        <MpModalBody>
          <p class="dd-modal-text">
            This creates a draft Sales Order for <strong>{{ deal.company }}</strong> worth
            <strong>{{ formatIDR(deal.value) }}</strong>, owned by <strong>{{ deal.owner }}</strong>.
          </p>
          <div v-if="convertError" class="dd-banner dd-banner--error">
            <MpIcon name="info" size="md" variant="fill" />
            <span>{{ convertError }}</span>
          </div>
        </MpModalBody>
        <MpModalFooter>
          <MpButtonGroup>
            <MpButton variant="ghost" is-rounded @click="closeConvert">Cancel</MpButton>
            <MpButton variant="primary" is-rounded @click="confirmConvert">Convert</MpButton>
          </MpButtonGroup>
        </MpModalFooter>
      </MpModalContent>
      <MpModalOverlay />
    </MpModal>

    <!-- ── Delete confirm (destructive → ConfirmModal) ── -->
    <ConfirmModal
      v-model:is-open="isDeleteOpen"
      title="Delete deal?"
      description="Deleted deal cannot be restored."
      confirm-label="Delete deal"
      @confirm="confirmDelete"
    />
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
.dd-cap { text-transform: capitalize; }

.dd-banner { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-radius: var(--mp-radii-md); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); }
.dd-banner--warn { background: var(--mp-background-warning-subtle, #fef6e7); border: 1px solid var(--mp-border-warning, #f5c26b); color: var(--mp-text-warning, #b54708); }
.dd-banner--error { background: var(--mp-background-danger-subtle, #fdecec); border: 1px solid var(--mp-border-danger, #f0a3a3); color: var(--mp-text-danger, #c9372c); margin-top: var(--mp-spacing-4); }

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
.cd-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); max-width: 860px; }
.cd-section--wide { max-width: none; }
.cd-section-title { margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default); }
.cd-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); row-gap: var(--mp-spacing-2); }
.cd-muted { color: var(--mp-text-subtle); }
.cd-owed { color: var(--mp-text-warning, #b54708); }

/* Activity timeline */
.dd-timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.dd-tl-item { display: flex; gap: var(--mp-spacing-3); padding-bottom: var(--mp-spacing-4); position: relative; }
.dd-tl-item:not(:last-child)::before { content: ''; position: absolute; left: 5px; top: 14px; bottom: 0; width: 2px; background: var(--mp-border-default); }
.dd-tl-dot { width: 12px; height: 12px; border-radius: var(--mp-radii-full, 999px); background: var(--mp-border-selected, #029861); flex-shrink: 0; margin-top: 2px; position: relative; z-index: 1; }
.dd-tl-body { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.dd-tl-title { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-weight: var(--mp-font-weights-medium, 500); }
.dd-tl-time { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Related tables */
.dd-table { border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 10px); overflow: hidden; }
.dd-thead, .dd-trow { display: grid; align-items: center; gap: var(--mp-spacing-3); padding: var(--mp-spacing-3) var(--mp-spacing-4); }
.dd-trow--tasks { grid-template-columns: 2fr 1fr 1fr 1.2fr 1fr; }
.dd-trow--orders { grid-template-columns: 1fr 2fr 1fr 1fr 1fr; }
.dd-thead { background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.dd-trow { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); border-bottom: 1px solid var(--mp-border-default); }
.dd-trow:last-child { border-bottom: none; }
.dd-trow--linked { background: var(--mp-background-neutral-subtle); }
.dd-num { text-align: right; font-variant-numeric: tabular-nums; }

.dd-modal-text { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); line-height: var(--mp-line-heights-md); }

.cd-missing { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-3); padding: 80px; color: var(--mp-text-secondary); }
</style>
