<script setup lang="ts">
/**
 * Work order detail — read-only view of a manufacturing work order (Production →
 * Work orders → View details). Built from the Figma reference (Work Order Detail)
 * using the ERP detail-page shell: title bar (breadcrumb + title + status badge +
 * header actions), scrollable stage, read-only borderless tables + summaries.
 *
 * Status-aware: the header primary action, the raw-material/routing status columns,
 * and the reserved/consumed/start/end values all reflect the work order's status.
 */
import { ref, reactive, computed } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpIcon, css,
} from '@mekari/pixel3'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import ContentList from '~/components/patterns/ContentList.vue'
import { formatDate } from '~/utils/date'
import { workOrders, type WorkOrder, type WorkOrderStatus } from '~/data/workOrders'
import { workOrderLinks } from '~/data/workOrderLinks'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const route = useRoute()

const wo = computed<WorkOrder | undefined>(() => workOrders.find(w => w.id === props.orderId))

function goList() { router.push('/work-orders') }

// ── Flow (Default vs From production request) ────────────────────────────────
// From-PR adds the "Linked transactions" bottom tab. Preselected via ?source=pr.
type Flow = 'default' | 'production-request'
const flow = ref<Flow>(route.query.source === 'pr' ? 'production-request' : 'default')
const flowOptions: { value: Flow; label: string }[] = [
  { value: 'default', label: 'Default' },
  { value: 'production-request', label: 'From production request' },
]
const fromProductionRequest = computed(() => flow.value === 'production-request')

// ── Bottom tabs ──────────────────────────────────────────────────────────────
const bottomTabs = computed(() =>
  fromProductionRequest.value ? ['Partial production', 'Linked transactions'] : ['Partial production'],
)
const activeBottomTab = ref('Partial production')

// ── Formatters ────────────────────────────────────────────────────────────────
function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2 }).format(n || 0)
}
const num = (n: number) => n.toLocaleString('id-ID')

// BOM no. derived from the work order number's running suffix (e.g. WO-2026-0006 → #10006)
const bomNo = computed(() => {
  const suffix = Number(wo.value?.number.split('-').pop() ?? 0)
  return `Bill of Materials #${10000 + suffix}`
})
const planRange = computed(() => wo.value ? `${formatDate(wo.value.planStartDate)} - ${formatDate(wo.value.planEndDate)}` : '—')

// ── Header status → primary action ──────────────────────────────────────────────
const STATUS_LABEL: Record<WorkOrderStatus, string> = {
  'not started': 'Not started', 'in progress': 'In progress', 'partially produced': 'Partially produced',
  'partially completed': 'Partially completed', 'completed': 'Completed', 'canceled': 'Canceled',
}
const primaryAction = computed(() => {
  switch (wo.value?.status) {
    case 'not started': return 'Start work order'
    case 'in progress':
    case 'partially produced': return 'Complete work order'
    case 'partially completed': return 'Complete work order'
    default: return '' // completed / canceled → no primary action
  }
})
// Actions menu items — terminal statuses drop the destructive/edit options.
const actionItems = computed(() => {
  const s = wo.value?.status
  if (s === 'completed') return ['Print']
  if (s === 'canceled') return ['Print', 'Delete']
  return ['Edit', 'Replace attachment', 'Print', 'Delete']
})

// ── Attachments (representative) ────────────────────────────────────────────────
const attachments = [
  { name: 'applying paint to skateboard wood tutorial.pdf' },
  { name: 'detail & finishing skateboard.pdf' },
  { name: 'basic skateboard building guide.pdf' },
]

// ── Collapsible sections ──────────────────────────────────────────────────────
const collapsed = reactive<Record<string, boolean>>({
  raw: false, cost: false, routing: false, finished: false,
})

// ── Line-item status derivation (from the work order status) ─────────────────────
const routingLineStatus = computed(() => STATUS_LABEL[wo.value?.status ?? 'not started'])

// Adjusted qty = the (possibly adjusted) planned qty; consumed = actual used per
// status; variance = adjusted − consumed.
function adjustedFor(r: { needed: number; adjusted: number }) {
  return wo.value?.status === 'canceled' ? 0 : r.adjusted
}
function varianceFor(r: { needed: number; adjusted: number }) {
  return adjustedFor(r) - consumedFor(r.needed)
}
function consumedFor(needed: number) {
  const s = wo.value?.status
  if (s === 'partially produced' || s === 'partially completed') return Math.round(needed * 0.5)
  if (s === 'completed') return needed
  return 0
}
// Actual start/end shown only when the work order has reached that stage.
const showStart = computed(() => !['not started', 'canceled'].includes(wo.value?.status ?? ''))
const showEnd = computed(() => ['partially completed', 'completed', 'canceled'].includes(wo.value?.status ?? ''))

// ── Mock line-item data (consistent with the Figma reference) ───────────────────
// `adjusted` = needed qty after the "adjust work order" action (differs from needed
// on rows that were adjusted).
const rawMaterials = [
  { product: 'Board',  sku: 'SKU ID10011', purchaseCost: 100_000, warehouse: 'Production Jakarta', needed: 10, adjusted: 12, unit: 'Pcs' },
  { product: 'Screws', sku: 'SKU ID10040', purchaseCost: 2_000,   warehouse: 'Production Jakarta', needed: 80, adjusted: 80, unit: 'Pcs' },
  { product: 'Wheels', sku: 'SKU ID10271', purchaseCost: 30_000,  warehouse: 'Production Jakarta', needed: 40, adjusted: 40, unit: 'Pcs' },
  { product: 'Trucks', sku: 'SKU ID10012', purchaseCost: 50_000,  warehouse: 'Production Jakarta', needed: 20, adjusted: 22, unit: 'Pcs' },
]
const rawEst = (r: { purchaseCost: number; needed: number }) => r.purchaseCost * r.needed
const rawSubtotal = computed(() => rawMaterials.reduce((s, r) => s + rawEst(r), 0))

const productionCost = [
  { group: 'Labor cost',    account: 'Worker',      driver: 'Person', unitCost: 100_000, multiplier: 1 },
  { group: 'Overhead cost', account: 'Electricity', driver: 'Kwh',    unitCost: 1_000,   multiplier: 50 },
  { group: 'Other costs',   account: '',            driver: '',       unitCost: 0,       multiplier: 0 },
]
const costAmount = (c: { unitCost: number; multiplier: number }) => c.unitCost * c.multiplier
const productionCostSubtotal = computed(() => productionCost.reduce((s, c) => s + costAmount(c), 0))

const routing = [
  { process: 'Fitting',   description: 'Check every components before start assembling', mapping: 'Routing cost', planStart: '2026-03-01', planEnd: '2026-03-01', amount: 25_000 },
  { process: 'Assembly',  description: 'Follow the instruction guide to assembly',       mapping: 'Routing cost', planStart: '2026-03-01', planEnd: '2026-03-09', amount: 25_000 },
  { process: 'Finishing', description: 'Apply paint and coating',                        mapping: 'Routing cost', planStart: '2026-03-09', planEnd: '2026-03-10', amount: 25_000 },
]
const routingSubtotal = computed(() => routing.reduce((s, r) => s + r.amount, 0))
const totalProductionCost = computed(() => rawSubtotal.value + productionCostSubtotal.value + routingSubtotal.value)

const mainOutput = computed(() => ({
  product: wo.value?.bomName ?? '—', sku: 'SB-001', qty: wo.value?.producedQty ?? 0, unit: 'Pcs', percentage: 90,
  estCost: Math.round(totalProductionCost.value * 0.9),
}))
const otherOutputs = computed(() => ([
  { product: 'Sawdust', sku: 'SK-492', qty: 50, unit: 'g', percentage: 5, estCost: Math.round(totalProductionCost.value * 0.05) },
]))
const productionWaste = computed(() => ([
  { mapping: 'Production waste', method: 'Percentage', percentage: 5, amount: Math.round(totalProductionCost.value * 0.05) },
]))
const mainOutputSubtotal = computed(() => mainOutput.value.estCost)
const otherOutputsSubtotal = computed(() => otherOutputs.value.reduce((s, r) => s + r.estCost, 0))
const wasteSubtotal = computed(() => productionWaste.value.reduce((s, r) => s + r.amount, 0))
const finishedGoodsTotal = computed(() => mainOutputSubtotal.value + otherOutputsSubtotal.value)
</script>

<template>
  <div v-if="wo" class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goList">Work orders</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">Work Order #{{ wo.number.split('-').pop() }}</h1>
          <ErpStatusBadge
            :status="wo.status"
            :label="wo.status === 'in progress' ? 'In progress' : undefined"
            badge-for="additionalInformation" size="md"
          />
        </div>
      </div>

      <!-- Header actions -->
      <div class="detail-bar-actions">
        <MpPopover id="wod-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
          <MpPopoverTrigger>
            <button class="detail-btn detail-btn--secondary">
              Actions
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
          </MpPopoverTrigger>
          <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content', whiteSpace: 'nowrap' })">
            <MpPopoverList>
              <MpPopoverListItem
                v-for="item in actionItems" :key="item"
                :class="item === 'Delete' ? css({ color: 'var(--mp-text-critical)' }) : ''"
              >{{ item }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <button class="detail-btn detail-btn--secondary detail-btn--icon">
          <MpIcon name="hierarchy" size="sm" />
          View work order hierarchy
        </button>

        <button v-if="primaryAction" class="detail-btn detail-btn--primary">{{ primaryAction }}</button>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- ── Work order info ── -->
      <section class="wod-section">
        <h2 class="wod-section-title">Work order info</h2>
        <div class="wod-info-grid">
          <div class="content-list-col">
            <ContentList label="BOM name" :value="wo.bomName" />
            <ContentList label="BOM no." :value="bomNo" />
            <ContentList label="Work order no." :value="`Work Order #${wo.number.split('-').pop()}`" />
          </div>
          <div class="content-list-col">
            <ContentList label="Type" :value="wo.type" />
            <ContentList label="Track routing" :value="wo.trackRouting ? 'Yes' : 'No'" />
            <ContentList label="Produced qty" :value="`${wo.producedQty}`" />
          </div>
          <div class="content-list-col">
            <ContentList label="Work plan dates" :value="planRange" />
            <ContentList label="Start date" :value="showStart ? formatDate(wo.startDate) : '—'" />
            <ContentList label="End date" :value="showEnd ? formatDate(wo.endDate) : '—'" />
          </div>
          <div class="content-list-col">
            <ContentList :label="`Attachments`">
              <div class="wod-attach-list">
                <a v-for="a in attachments" :key="a.name" class="wod-attach" @click.prevent>
                  <MpIcon name="pdf-document" size="sm" />
                  <span class="wod-attach-name">{{ a.name }}</span>
                </a>
              </div>
            </ContentList>
          </div>
        </div>
      </section>

      <!-- ── Raw materials ── -->
      <section class="wod-section">
        <button class="wod-section-head" @click="collapsed.raw = !collapsed.raw">
          <h2 class="wod-section-title">Raw materials</h2>
          <svg class="wod-chevron" :class="{ 'wod-chevron--open': !collapsed.raw }" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <template v-if="!collapsed.raw">
          <div class="wod-table-scroll">
            <table class="wod-table">
              <thead>
                <tr>
                  <th class="wod-th">Product</th>
                  <th class="wod-th wod-th--num">Purchase cost</th>
                  <th class="wod-th">Warehouse</th>
                  <th class="wod-th wod-th--num">Needed qty</th>
                  <th class="wod-th wod-th--num">Adjusted qty</th>
                  <th class="wod-th wod-th--num">Consumed qty</th>
                  <th class="wod-th wod-th--num">Variance</th>
                  <th class="wod-th">Unit</th>
                  <th class="wod-th wod-th--num">Estimated cost</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in rawMaterials" :key="r.sku" class="wod-tr">
                  <td class="wod-td">
                    <div class="wod-product"><span>{{ r.product }}</span><span class="wod-product-sub">{{ r.sku }}</span></div>
                  </td>
                  <td class="wod-td wod-td--num">{{ formatIDR(r.purchaseCost) }}</td>
                  <td class="wod-td">{{ r.warehouse }}</td>
                  <td class="wod-td wod-td--num">{{ num(r.needed) }}</td>
                  <td class="wod-td wod-td--num">{{ num(adjustedFor(r)) }}</td>
                  <td class="wod-td wod-td--num">{{ num(consumedFor(r.needed)) }}</td>
                  <td class="wod-td wod-td--num">{{ num(varianceFor(r)) }}</td>
                  <td class="wod-td">{{ r.unit }}</td>
                  <td class="wod-td wod-td--num">{{ formatIDR(rawEst(r)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wod-subtotal-row"><span>Estimated raw materials subtotal</span><span class="wod-amount">{{ formatIDR(rawSubtotal) }}</span></div>
        </template>
      </section>

      <!-- ── Production cost ── -->
      <section class="wod-section">
        <button class="wod-section-head" @click="collapsed.cost = !collapsed.cost">
          <h2 class="wod-section-title">Production cost</h2>
          <svg class="wod-chevron" :class="{ 'wod-chevron--open': !collapsed.cost }" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <template v-if="!collapsed.cost">
          <div class="wod-table-scroll">
            <table class="wod-table">
              <tbody>
                <template v-for="c in productionCost" :key="c.group">
                  <tr class="wod-subhead-row">
                    <th class="wod-th">{{ c.group }}</th>
                    <th class="wod-th">Cost driver</th>
                    <th class="wod-th wod-th--num">Estimated unit cost</th>
                    <th class="wod-th">Multiplier</th>
                    <th class="wod-th wod-th--num">Amount</th>
                  </tr>
                  <tr class="wod-tr">
                    <td class="wod-td">{{ c.account || '—' }}</td>
                    <td class="wod-td">{{ c.driver || '—' }}</td>
                    <td class="wod-td wod-td--num">{{ c.unitCost ? formatIDR(c.unitCost) : '—' }}</td>
                    <td class="wod-td">{{ c.multiplier || '—' }}</td>
                    <td class="wod-td wod-td--num">{{ c.account ? formatIDR(costAmount(c)) : '—' }}</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <div class="wod-subtotal-row"><span>Production cost subtotal</span><span class="wod-amount">{{ formatIDR(productionCostSubtotal) }}</span></div>
        </template>
      </section>

      <!-- ── Routing ── -->
      <section class="wod-section">
        <button class="wod-section-head" @click="collapsed.routing = !collapsed.routing">
          <h2 class="wod-section-title">Routing</h2>
          <svg class="wod-chevron" :class="{ 'wod-chevron--open': !collapsed.routing }" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <template v-if="!collapsed.routing">
          <div class="wod-table-scroll">
            <table class="wod-table">
              <thead>
                <tr>
                  <th class="wod-th">Process</th>
                  <th class="wod-th">Description</th>
                  <th class="wod-th">Account mapping</th>
                  <th class="wod-th">Work plan dates</th>
                  <th class="wod-th">Start date</th>
                  <th class="wod-th">End date</th>
                  <th class="wod-th">Status</th>
                  <th class="wod-th wod-th--num">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in routing" :key="r.process" class="wod-tr">
                  <td class="wod-td">{{ r.process }}</td>
                  <td class="wod-td wod-td--wrap">{{ r.description }}</td>
                  <td class="wod-td">{{ r.mapping }}</td>
                  <td class="wod-td">{{ formatDate(r.planStart) }} - {{ formatDate(r.planEnd) }}</td>
                  <td class="wod-td">{{ showStart ? formatDate(r.planStart) : '—' }}</td>
                  <td class="wod-td">{{ showEnd ? formatDate(r.planEnd) : '—' }}</td>
                  <td class="wod-td"><span class="wod-line-status wod-line-status--muted">{{ routingLineStatus }}</span></td>
                  <td class="wod-td wod-td--num">{{ formatIDR(r.amount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wod-subtotal-row"><span>Routing cost subtotal</span><span class="wod-amount">{{ formatIDR(routingSubtotal) }}</span></div>
        </template>

        <!-- Cost summary -->
        <div class="wod-summary">
          <div class="wod-summary-row"><span>Est. subtotal of raw materials</span><span>{{ formatIDR(rawSubtotal) }}</span></div>
          <div class="wod-summary-row"><span>Subtotal production cost</span><span>{{ formatIDR(productionCostSubtotal) }}</span></div>
          <div class="wod-summary-row"><span>Subtotal routing cost</span><span>{{ formatIDR(routingSubtotal) }}</span></div>
          <div class="wod-summary-row wod-summary-row--total"><span>Est. total of production cost</span><span>{{ formatIDR(totalProductionCost) }}</span></div>
        </div>
      </section>

      <!-- ── Finished goods ── -->
      <section class="wod-section wod-section--last">
        <button class="wod-section-head" @click="collapsed.finished = !collapsed.finished">
          <h2 class="wod-section-title">Finished goods</h2>
          <svg class="wod-chevron" :class="{ 'wod-chevron--open': !collapsed.finished }" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <template v-if="!collapsed.finished">
          <!-- Main output — shares its column widths with Other outputs (same colgroup) -->
          <h3 class="wod-subsection-title">Main output</h3>
          <div class="wod-table-scroll">
            <table class="wod-table wod-table--outputs">
              <colgroup>
                <col style="width: 280px" /><col style="width: 140px" /><col style="width: 130px" />
                <col style="width: 100px" /><col style="width: 130px" /><col style="width: 180px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wod-th">Product</th><th class="wod-th">SKU</th>
                  <th class="wod-th wod-th--num">Produced qty</th><th class="wod-th">Unit</th>
                  <th class="wod-th wod-th--num">Percentage</th><th class="wod-th wod-th--num">Estimated cost</th>
                </tr>
              </thead>
              <tbody>
                <tr class="wod-tr">
                  <td class="wod-td">{{ mainOutput.product }}</td>
                  <td class="wod-td">{{ mainOutput.sku }}</td>
                  <td class="wod-td wod-td--num">{{ num(mainOutput.qty) }}</td>
                  <td class="wod-td">{{ mainOutput.unit }}</td>
                  <td class="wod-td wod-td--num">{{ mainOutput.percentage }}%</td>
                  <td class="wod-td wod-td--num">{{ formatIDR(mainOutput.estCost) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wod-subtotal-row"><span>Estimated main output subtotal</span><span class="wod-amount">{{ formatIDR(mainOutputSubtotal) }}</span></div>

          <!-- Other outputs — same column widths as Main output -->
          <h3 class="wod-subsection-title">Other outputs</h3>
          <div class="wod-table-scroll">
            <table class="wod-table wod-table--outputs">
              <colgroup>
                <col style="width: 280px" /><col style="width: 140px" /><col style="width: 130px" />
                <col style="width: 100px" /><col style="width: 130px" /><col style="width: 180px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="wod-th">Product</th><th class="wod-th">SKU</th>
                  <th class="wod-th wod-th--num">Produced qty</th><th class="wod-th">Unit</th>
                  <th class="wod-th wod-th--num">Percentage</th><th class="wod-th wod-th--num">Estimated cost</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="o in otherOutputs" :key="o.sku" class="wod-tr">
                  <td class="wod-td">{{ o.product }}</td>
                  <td class="wod-td">{{ o.sku }}</td>
                  <td class="wod-td wod-td--num">{{ num(o.qty) }}</td>
                  <td class="wod-td">{{ o.unit }}</td>
                  <td class="wod-td wod-td--num">{{ o.percentage }}%</td>
                  <td class="wod-td wod-td--num">{{ formatIDR(o.estCost) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wod-subtotal-row"><span>Estimated other outputs subtotal</span><span class="wod-amount">{{ formatIDR(otherOutputsSubtotal) }}</span></div>

          <!-- Production waste -->
          <h3 class="wod-subsection-title">Production waste</h3>
          <div class="wod-table-scroll">
            <table class="wod-table">
              <thead>
                <tr>
                  <th class="wod-th">Account mapping</th><th class="wod-th">Allocation method</th>
                  <th class="wod-th wod-th--num">Percentage</th><th class="wod-th wod-th--num">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="w in productionWaste" :key="w.mapping" class="wod-tr">
                  <td class="wod-td">{{ w.mapping }}</td>
                  <td class="wod-td">{{ w.method }}</td>
                  <td class="wod-td wod-td--num">{{ w.percentage }}%</td>
                  <td class="wod-td wod-td--num">{{ formatIDR(w.amount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="wod-subtotal-row"><span>Estimated production waste subtotal</span><span class="wod-amount">{{ formatIDR(wasteSubtotal) }}</span></div>

          <!-- Finished goods summary -->
          <div class="wod-summary">
            <div class="wod-summary-row"><span>Estimated main output subtotal</span><span>{{ formatIDR(mainOutputSubtotal) }}</span></div>
            <div class="wod-summary-row"><span>Estimated other outputs subtotal</span><span>{{ formatIDR(otherOutputsSubtotal) }}</span></div>
            <div class="wod-summary-row"><span>Estimated production waste subtotal</span><span>{{ formatIDR(wasteSubtotal) }}</span></div>
            <div class="wod-summary-row wod-summary-row--total"><span>Estimated finished goods total</span><span>{{ formatIDR(finishedGoodsTotal) }}</span></div>
          </div>
        </template>
      </section>

      <!-- ── Bottom tabs (Partial production / Linked transactions) ── -->
      <section class="wod-section wod-section--tabs">
        <div class="wod-bottom-tabs" role="tablist">
          <button
            v-for="tab in bottomTabs" :key="tab"
            class="wod-bottom-tab" :class="{ 'wod-bottom-tab--active': activeBottomTab === tab }"
            role="tab" :aria-selected="activeBottomTab === tab"
            @click="activeBottomTab = tab"
          >{{ tab }}</button>
        </div>

        <div v-if="activeBottomTab === 'Linked transactions' && fromProductionRequest">
          <h3 class="wod-subsection-title">Production request</h3>
          <div class="wod-table-scroll">
            <table class="wod-table">
              <thead>
                <tr>
                  <th class="wod-th">Number</th><th class="wod-th wod-th--num">Qty to produce</th>
                  <th class="wod-th wod-th--num">Fulfilled qty</th><th class="wod-th">Unit</th>
                  <th class="wod-th">Due date</th><th class="wod-th">Status</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="t in workOrderLinks" :key="t.number" class="wod-tr">
                  <td class="wod-td">{{ t.number }}</td>
                  <td class="wod-td wod-td--num">{{ t.qtyToProduce }}</td>
                  <td class="wod-td wod-td--num">{{ t.fulfilledQty }}</td>
                  <td class="wod-td">{{ t.unit }}</td>
                  <td class="wod-td">{{ formatDate(t.dueDate) }}</td>
                  <td class="wod-td"><ErpStatusBadge :status="t.status" /></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div v-else class="wod-empty">
          <p class="wod-empty-title">No partial production yet</p>
          <p class="wod-empty-desc">Partial production records will appear here as the work order progresses.</p>
        </div>
      </section>

    </div>

    <!-- ── Demo flow scenario switcher ── -->
    <MpPopover id="wod-flow-fab" is-close-on-select use-portal placement="top-end">
      <MpPopoverTrigger>
        <button class="wod-flow-fab" aria-label="Change work order flow"><MpIcon name="sliders" size="md" color="icon.inverse" /></button>
      </MpPopoverTrigger>
      <MpPopoverContent :class="css({ minWidth: '220px', width: 'max-content' })">
        <p class="wod-flow-fab-heading">Work order flow</p>
        <MpPopoverList>
          <MpPopoverListItem v-for="o in flowOptions" :key="o.value" :is-active="o.value === flow" @click="flow = o.value">{{ o.label }}</MpPopoverListItem>
        </MpPopoverList>
      </MpPopoverContent>
    </MpPopover>
  </div>

  <!-- Not found -->
  <div v-else class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goList">Work orders</button>
        <div class="detail-titlerow-left"><h1 class="detail-title">Work order not found</h1></div>
      </div>
    </header>
  </div>
</template>

<style scoped>
/* ── Bottom tabs (Partial production / Linked transactions) ───────────────── */
.wod-section--tabs { border-bottom: none; }
.wod-bottom-tabs { display: flex; align-items: center; gap: var(--mp-spacing-5); border-bottom: 1px solid var(--mp-border-default); margin-bottom: var(--mp-spacing-4); }
.wod-bottom-tab {
  position: relative; background: none; border: none; padding: var(--mp-spacing-2) 0; cursor: pointer;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md);
}
.wod-bottom-tab--active { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); }
.wod-bottom-tab--active::after { content: ''; position: absolute; left: 0; right: 0; bottom: -1px; height: 2px; background: var(--mp-background-brand-bold, #029861); }
.wod-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-10) 0; }
.wod-empty-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.wod-empty-desc { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Demo flow scenario switcher ─────────────────────────────────────────── */
.wod-flow-fab {
  position: fixed; right: var(--mp-spacing-6); bottom: var(--mp-spacing-6);
  width: var(--mp-spacing-12, 48px); height: var(--mp-spacing-12, 48px);
  display: inline-flex; align-items: center; justify-content: center;
  border: none; border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-inverse, #080d0e); color: #fff; cursor: pointer; z-index: 1200;
  box-shadow: 0 4px 6px -2px rgba(0,0,0,0.1), 0 10px 15px -3px rgba(0,0,0,0.2);
}
.wod-flow-fab:hover { opacity: 0.9; }
.wod-flow-fab-heading { padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Page shell (shared detail-page pattern) ─────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; min-height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
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
.detail-bar-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); flex-shrink: 0; }

.detail-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4); border-radius: var(--mp-radii-full, 999px);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  cursor: pointer; border: 1px solid transparent; white-space: nowrap;
}
.detail-btn--icon { padding-left: var(--mp-spacing-3); }
.detail-btn--secondary { background: var(--mp-background-neutral); border-color: var(--mp-border-bold); color: var(--mp-text-secondary); }
.detail-btn--secondary:hover { background: var(--mp-background-neutral-hovered); }
.detail-btn--primary { background: var(--mp-colors-emerald-700, #029861); border-color: var(--mp-colors-emerald-700, #029861); color: var(--mp-text-inverse); }
.detail-btn--primary:hover { background: var(--mp-colors-emerald-800, #186f4a); border-color: var(--mp-colors-emerald-800, #186f4a); }

.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-8);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
}

/* ── Sections ────────────────────────────────────────────────────────────── */
.wod-section { padding: var(--mp-spacing-8) 0; border-bottom: 1px dashed var(--mp-border-default); }
.wod-section:first-child { padding-top: 0; }
.wod-section--last { border-bottom: none; }
.wod-section-head {
  display: flex; align-items: center; justify-content: space-between; width: 100%;
  background: none; border: none; padding: 0; cursor: pointer; color: var(--mp-text-secondary);
  margin-bottom: var(--mp-spacing-5);
}
.wod-section-title {
  margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}
/* Collapse chevron — points down when collapsed, rotates up when the section is open. */
.wod-chevron { flex-shrink: 0; color: var(--mp-icon-default); transition: transform 0.15s ease; }
.wod-chevron--open { transform: rotate(180deg); }
.wod-section > .wod-section-title { margin-bottom: var(--mp-spacing-5); }
.wod-subsection-title {
  margin: var(--mp-spacing-6) 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}

/* ── Work order info grid — 4 columns ────────────────────────────────────── */
.wod-info-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); }
.content-list-col { display: flex; flex-direction: column; min-width: 0; }
.wod-attach-list { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.wod-attach { display: inline-flex; align-items: flex-start; gap: var(--mp-spacing-2); cursor: pointer; color: var(--mp-text-link); }
.wod-attach-name { font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); }
.wod-attach:hover .wod-attach-name { text-decoration: underline; text-underline-offset: 2px; }

/* ── Read-only tables (borderless ERP style) ─────────────────────────────── */
.wod-table-scroll {
  overflow-x: auto;
  border-top: 1px solid var(--mp-border-default);
  border-bottom: 1px solid var(--mp-border-default);
}
.wod-table { width: 100%; border-collapse: collapse; table-layout: auto; min-width: max-content; }
/* Main output + Other outputs share the same fixed column widths (via matching
   colgroups) so their columns line up regardless of each table's content. */
.wod-table--outputs { table-layout: fixed; }
.wod-th {
  height: var(--mp-sizes-7, 28px); text-align: left; white-space: nowrap;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
}
.wod-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.wod-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: top;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.wod-tr:last-child .wod-td { border-bottom: none; }
.wod-td--num { text-align: right; font-variant-numeric: tabular-nums; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
.wod-td--wrap { white-space: normal; min-width: 200px; }
.wod-product { display: flex; flex-direction: column; }
.wod-product-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* production cost repeated sub-headers */
.wod-subhead-row .wod-th { border-top: 1px solid var(--mp-border-default); }
.wod-table tbody tr:first-child .wod-th { border-top: none; }

/* line status text */
.wod-line-status { font-size: var(--mp-font-sizes-md); }
.wod-line-status--warning { color: var(--mp-colors-text-warning, #a14a0b); }
.wod-line-status--information { color: var(--mp-colors-text-information, #4b61dc); }
.wod-line-status--success { color: var(--mp-colors-text-success, #0f6d4d); }
.wod-line-status--muted { color: var(--mp-text-secondary); }

/* ── Subtotal + summary ──────────────────────────────────────────────────── */
.wod-subtotal-row {
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-8);
  padding: var(--mp-spacing-3) var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.wod-amount { min-width: 180px; text-align: right; font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.wod-summary { margin-top: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.wod-summary-row {
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-8);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.wod-summary-row > :last-child { min-width: 200px; text-align: right; font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.wod-summary-row--total { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
</style>
