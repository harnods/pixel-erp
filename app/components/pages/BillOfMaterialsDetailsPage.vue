<script setup lang="ts">
/**
 * Bill of Materials detail — read-only view of a BOM (Production → Bill of
 * materials → View details). Built from the Figma reference (BOM Detail) using
 * the ERP detail-page shell: title bar (breadcrumb + title + header actions),
 * scrollable stage, read-only borderless tables + cost summaries.
 *
 * Every table renders THIS record's actual stored content — raw materials,
 * production cost, routing, and finished goods all resolve real registered
 * products (via catalogProduct) rather than a shared example.
 *
 * A BOM is the *template* a work order is produced from, so — unlike the work
 * order detail — it carries no status, and its tables show planned figures only.
 */
import { ref, reactive, computed } from 'vue'
import {
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpIcon, css, toast,
} from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'
import ConfirmModal from '~/components/patterns/ConfirmModal.vue'
import { billOfMaterials, catalogProduct, persistBillOfMaterials, type BillOfMaterials, type BomProductionCost } from '~/data/billOfMaterials'

// The shared detail renderer passes the route id as `order-id`.
const props = defineProps<{ orderId: string }>()
const router = useRouter()

const bom = computed<BillOfMaterials | undefined>(() => billOfMaterials.find(b => b.id === props.orderId))

function goList() { router.push('/bill-of-materials') }
function createWorkOrder() { router.push(`/work-orders/new?source=bom&bomId=${encodeURIComponent(props.orderId)}`) }
function goEdit() { router.push(`/bill-of-materials/new?edit=${encodeURIComponent(props.orderId)}`) }
function goDuplicate() { router.push(`/bill-of-materials/new?duplicate=${encodeURIComponent(props.orderId)}`) }

// ── Header actions menu ────────────────────────────────────────────────────────
const actionItems = ['Edit', 'Duplicate', 'Print', 'Delete']
function onAction(item: string) {
  if (item === 'Edit') goEdit()
  else if (item === 'Duplicate') goDuplicate()
  else if (item === 'Delete') isDeleteModalOpen.value = true
}

// ── Delete confirmation ────────────────────────────────────────────────────────
const isDeleteModalOpen = ref(false)
function confirmDelete() {
  if (!bom.value) return
  bom.value.archived = true
  persistBillOfMaterials()
  toast.notify({ variant: 'success', title: 'Bill of materials deleted' })
  goList()
}

// ── Description "Show more" toggle ──────────────────────────────────────────────
const DESC_LIMIT = 90
const descExpanded = ref(false)
const isDescLong = computed(() => (bom.value?.description.length ?? 0) > DESC_LIMIT)
const descDisplay = computed(() => {
  const d = bom.value?.description ?? ''
  if (!isDescLong.value || descExpanded.value) return d
  return d.slice(0, DESC_LIMIT).trimEnd() + '…'
})

// ── Formatters ──────────────────────────────────────────────────────────────────
function formatIDR(n: number) {
  return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 2 }).format(n || 0)
}
const num = (n: number) => n.toLocaleString('id-ID')
function productName(id: string) { return catalogProduct(id)?.name ?? '—' }
function productSku(id: string) { return catalogProduct(id)?.sku ?? '—' }

// ── Collapsible sections ────────────────────────────────────────────────────────
const collapsed = reactive<Record<string, boolean>>({ raw: false, cost: false, routing: false, finished: false })

// ── Attachments (representative) ────────────────────────────────────────────────
const attachments = [
  { name: 'production guide.pdf' },
  { name: 'quality checklist.pdf' },
]

// ── Raw materials — resolved from real registered products ──────────────────────
const rawMaterials = computed(() => bom.value?.rawMaterials ?? [])
const rawEst = (r: { purchaseCost: number; needed: number }) => r.purchaseCost * r.needed
const rawSubtotal = computed(() => rawMaterials.value.reduce((s, r) => s + rawEst(r), 0))

// ── Production cost — grouped Labor / Overhead / Other (empty groups show a dash row) ──
const PRODUCTION_COST_GROUPS = ['Labor', 'Overhead', 'Other'] as const
const productionCostGroups = computed(() =>
  PRODUCTION_COST_GROUPS.map(group => ({
    label: `${group} cost`,
    rows: (bom.value?.productionCost ?? []).filter((c): c is BomProductionCost => c.group === group),
  })),
)
const productionCostSubtotal = computed(() => (bom.value?.productionCost ?? []).reduce((s, c) => s + c.amount, 0))

// ── Routing — the sequence of operations, each mapped to a routing-cost account. ──
const routing = computed(() => bom.value?.routing ?? [])
const routingSubtotal = computed(() => routing.value.reduce((s, r) => s + r.amount, 0))
const totalProductionCost = computed(() => rawSubtotal.value + productionCostSubtotal.value + routingSubtotal.value)

// ── Finished goods — main output absorbs whatever isn't allocated to other outputs/waste. ──
const otherOutputs = computed(() => bom.value?.otherOutputs ?? [])
const otherOutputsSubtotal = computed(() => otherOutputs.value.reduce((s, o) => s + o.estCost, 0))
const productionWaste = computed(() => bom.value?.productionWaste ?? [])
const wasteSubtotal = computed(() => productionWaste.value.reduce((s, w) => s + w.amount, 0))
const mainOutputEstCost = computed(() => Math.max(0, totalProductionCost.value - otherOutputsSubtotal.value - wasteSubtotal.value))
const mainOutputSubtotal = mainOutputEstCost
const finishedGoodsTotal = computed(() => mainOutputEstCost.value + otherOutputsSubtotal.value + wasteSubtotal.value)
</script>

<template>
  <div v-if="bom" class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goList">Bill of materials</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">{{ bom.number }}</h1>
        </div>
      </div>

      <!-- Header actions -->
      <div class="detail-bar-actions">
        <MpPopover id="bomd-actions" is-close-on-select use-portal :is-keep-alive="false" placement="bottom-end">
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
                @click="onAction(item)"
              >{{ item }}</MpPopoverListItem>
            </MpPopoverList>
          </MpPopoverContent>
        </MpPopover>

        <button class="detail-btn detail-btn--secondary detail-btn--icon">
          <MpIcon name="hierarchy" size="sm" />
          View BOM hierarchy
        </button>

        <button class="detail-btn detail-btn--primary" @click="createWorkOrder">Create work order</button>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- ── Bill of materials info ── -->
      <section class="bom-section">
        <h2 class="bom-section-title">Bill of materials info</h2>
        <div class="bom-info-grid">
          <div class="content-list-col">
            <ContentList label="BOM name" :value="bom.name" />
            <ContentList label="BOM no." :value="bom.number" />
            <ContentList label="Description">
              <template v-if="bom.description">
                <span>{{ descDisplay }}</span>
                <a v-if="isDescLong" class="bom-show-more" @click.prevent="descExpanded = !descExpanded">
                  {{ descExpanded ? 'Show less' : 'Show more' }}
                </a>
              </template>
              <template v-else>—</template>
            </ContentList>
          </div>
          <div class="content-list-col">
            <ContentList label="Category" :value="bom.category" />
            <ContentList label="Costing reference" :value="bom.costingReference" />
            <ContentList label="Attachments">
              <div class="bom-attach-list">
                <a v-for="a in attachments" :key="a.name" class="bom-attach" @click.prevent>
                  <MpIcon name="pdf-document" size="sm" />
                  <span class="bom-attach-name">{{ a.name }}</span>
                </a>
              </div>
            </ContentList>
          </div>
        </div>
      </section>

      <!-- ── Raw materials ── -->
      <section class="bom-section">
        <button class="bom-section-head" @click="collapsed.raw = !collapsed.raw">
          <h2 class="bom-section-title">Raw materials</h2>
          <svg class="bom-chevron" :class="{ 'bom-chevron--open': !collapsed.raw }" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <template v-if="!collapsed.raw">
          <div class="bom-table-scroll">
            <table class="bom-table">
              <colgroup>
                <col style="width:280px" /><col style="width:240px" />
                <col style="width:100px" /><col style="width:120px" /><col style="width:256px" /><col style="width:256px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="bom-th">Product</th><th class="bom-th">SKU</th>
                  <th class="bom-th bom-th--num">Needed</th><th class="bom-th">Unit</th>
                  <th class="bom-th bom-th--num">Purchase cost</th>
                  <th class="bom-th bom-th--num">Estimated cost</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="r in rawMaterials" :key="r.productId" class="bom-tr">
                  <td class="bom-td">{{ productName(r.productId) }}</td>
                  <td class="bom-td">{{ productSku(r.productId) }}</td>
                  <td class="bom-td bom-td--num">{{ num(r.needed) }}</td>
                  <td class="bom-td">{{ r.unit }}</td>
                  <td class="bom-td bom-td--num">{{ formatIDR(r.purchaseCost) }}</td>
                  <td class="bom-td bom-td--num">{{ formatIDR(rawEst(r)) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="bom-subtotal-row"><span>Estimated raw materials subtotal</span><span class="bom-amount">{{ formatIDR(rawSubtotal) }}</span></div>
        </template>
      </section>

      <!-- ── Production cost ── -->
      <section class="bom-section">
        <button class="bom-section-head" @click="collapsed.cost = !collapsed.cost">
          <h2 class="bom-section-title">Production cost</h2>
          <svg class="bom-chevron" :class="{ 'bom-chevron--open': !collapsed.cost }" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <template v-if="!collapsed.cost">
          <div class="bom-table-scroll">
            <table class="bom-table">
              <colgroup>
                <col style="width:33%" /><col style="width:33%" /><col style="width:34%" />
              </colgroup>
              <tbody>
                <template v-for="g in productionCostGroups" :key="g.label">
                  <tr class="bom-subhead-row">
                    <th class="bom-th">{{ g.label }}</th>
                    <th class="bom-th">Cost driver</th>
                    <th class="bom-th bom-th--num">Amount</th>
                  </tr>
                  <tr v-if="g.rows.length === 0" class="bom-tr">
                    <td class="bom-td">—</td><td class="bom-td">—</td><td class="bom-td bom-td--num">—</td>
                  </tr>
                  <tr v-for="(c, ci) in g.rows" :key="ci" class="bom-tr">
                    <td class="bom-td">{{ c.account }}</td>
                    <td class="bom-td">{{ c.costDriver }}</td>
                    <td class="bom-td bom-td--num">{{ formatIDR(c.amount) }}</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          <div class="bom-subtotal-row"><span>Production cost subtotal</span><span class="bom-amount">{{ formatIDR(productionCostSubtotal) }}</span></div>
        </template>
      </section>

      <!-- ── Routing ── -->
      <section class="bom-section">
        <button class="bom-section-head" @click="collapsed.routing = !collapsed.routing">
          <h2 class="bom-section-title">Routing</h2>
          <svg class="bom-chevron" :class="{ 'bom-chevron--open': !collapsed.routing }" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <template v-if="!collapsed.routing">
          <div class="bom-table-scroll">
            <table class="bom-table">
              <thead>
                <tr>
                  <th class="bom-th">Process</th>
                  <th class="bom-th">Description</th>
                  <th class="bom-th">Account mapping</th>
                  <th class="bom-th bom-th--num">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(r, ri) in routing" :key="ri" class="bom-tr">
                  <td class="bom-td">{{ r.process }}</td>
                  <td class="bom-td bom-td--wrap">{{ r.description }}</td>
                  <td class="bom-td">{{ r.accountMapping }}</td>
                  <td class="bom-td bom-td--num">{{ formatIDR(r.amount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="bom-subtotal-row"><span>Routing cost subtotal</span><span class="bom-amount">{{ formatIDR(routingSubtotal) }}</span></div>
        </template>

        <!-- Cost summary -->
        <div class="bom-summary">
          <div class="bom-summary-row"><span>Est. subtotal of raw materials</span><span>{{ formatIDR(rawSubtotal) }}</span></div>
          <div class="bom-summary-row"><span>Subtotal production cost</span><span>{{ formatIDR(productionCostSubtotal) }}</span></div>
          <div class="bom-summary-row"><span>Subtotal routing cost</span><span>{{ formatIDR(routingSubtotal) }}</span></div>
          <div class="bom-summary-row bom-summary-row--total"><span>Est. total of production cost</span><span>{{ formatIDR(totalProductionCost) }}</span></div>
        </div>
      </section>

      <!-- ── Finished goods ── -->
      <section class="bom-section bom-section--last">
        <button class="bom-section-head" @click="collapsed.finished = !collapsed.finished">
          <h2 class="bom-section-title">Finished goods</h2>
          <svg class="bom-chevron" :class="{ 'bom-chevron--open': !collapsed.finished }" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <template v-if="!collapsed.finished">
          <!-- Main output -->
          <h3 class="bom-subsection-title">Main output</h3>
          <div class="bom-table-scroll">
            <table class="bom-table bom-table--outputs">
              <colgroup>
                <col style="width:280px" /><col style="width:160px" /><col style="width:130px" />
                <col style="width:100px" /><col style="width:150px" /><col style="width:200px" />
              </colgroup>
              <thead>
                <tr>
                  <th class="bom-th">Product</th><th class="bom-th">SKU</th>
                  <th class="bom-th bom-th--num">Produced</th><th class="bom-th">Unit</th>
                  <th class="bom-th">Percentage</th><th class="bom-th bom-th--num">Estimated cost</th>
                </tr>
              </thead>
              <tbody>
                <tr class="bom-tr">
                  <td class="bom-td">{{ productName(bom.finishedGoodId) }}</td>
                  <td class="bom-td">{{ productSku(bom.finishedGoodId) }}</td>
                  <td class="bom-td bom-td--num">{{ num(bom.finishedGoodQty) }}</td>
                  <td class="bom-td">{{ bom.finishedGoodUnit }}</td>
                  <td class="bom-td">{{ bom.finishedGoodPercentage }}%</td>
                  <td class="bom-td bom-td--num">{{ formatIDR(mainOutputEstCost) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="bom-subtotal-row"><span>Estimated main output subtotal</span><span class="bom-amount">{{ formatIDR(mainOutputSubtotal) }}</span></div>

          <!-- Other outputs -->
          <template v-if="otherOutputs.length">
            <h3 class="bom-subsection-title">Other outputs</h3>
            <div class="bom-table-scroll">
              <table class="bom-table bom-table--outputs">
                <colgroup>
                  <col style="width:280px" /><col style="width:160px" /><col style="width:130px" />
                  <col style="width:100px" /><col style="width:150px" /><col style="width:200px" />
                </colgroup>
                <thead>
                  <tr>
                    <th class="bom-th">Product</th><th class="bom-th">SKU</th>
                    <th class="bom-th bom-th--num">Produced</th><th class="bom-th">Unit</th>
                    <th class="bom-th">Percentage</th><th class="bom-th bom-th--num">Estimated cost</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="o in otherOutputs" :key="o.productId" class="bom-tr">
                    <td class="bom-td">{{ productName(o.productId) }}</td>
                    <td class="bom-td">{{ productSku(o.productId) }}</td>
                    <td class="bom-td bom-td--num">{{ num(o.qty) }}</td>
                    <td class="bom-td">{{ o.unit }}</td>
                    <td class="bom-td">{{ o.percentage }}%</td>
                    <td class="bom-td bom-td--num">{{ formatIDR(o.estCost) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="bom-subtotal-row"><span>Estimated other outputs subtotal</span><span class="bom-amount">{{ formatIDR(otherOutputsSubtotal) }}</span></div>
          </template>

          <!-- Production waste -->
          <h3 class="bom-subsection-title">Production waste</h3>
          <div class="bom-table-scroll">
            <table class="bom-table">
              <thead>
                <tr>
                  <th class="bom-th">Account</th><th class="bom-th">Allocation method</th>
                  <th class="bom-th">Percentage</th><th class="bom-th bom-th--num">Amount</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(w, wi) in productionWaste" :key="wi" class="bom-tr">
                  <td class="bom-td">{{ w.accountMapping }}</td>
                  <td class="bom-td">{{ w.allocationMethod }}</td>
                  <td class="bom-td">{{ w.percentage }}%</td>
                  <td class="bom-td bom-td--num">{{ formatIDR(w.amount) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="bom-subtotal-row"><span>Estimated production waste subtotal</span><span class="bom-amount">{{ formatIDR(wasteSubtotal) }}</span></div>

          <!-- Finished goods summary -->
          <div class="bom-summary">
            <div class="bom-summary-row"><span>Estimated main output subtotal</span><span>{{ formatIDR(mainOutputSubtotal) }}</span></div>
            <div class="bom-summary-row"><span>Estimated other outputs subtotal</span><span>{{ formatIDR(otherOutputsSubtotal) }}</span></div>
            <div class="bom-summary-row"><span>Estimated production waste subtotal</span><span>{{ formatIDR(wasteSubtotal) }}</span></div>
            <div class="bom-summary-row bom-summary-row--total"><span>Estimated finished goods total</span><span>{{ formatIDR(finishedGoodsTotal) }}</span></div>
          </div>
        </template>
      </section>

    </div>
  </div>

  <!-- Not found -->
  <div v-else class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goList">Bill of materials</button>
        <div class="detail-titlerow-left"><h1 class="detail-title">Bill of materials not found</h1></div>
      </div>
    </header>
  </div>

  <!-- ── Delete confirmation ── -->
  <ConfirmModal
    v-if="bom"
    v-model:is-open="isDeleteModalOpen"
    title="Delete bill of materials?"
    :description="`${bom.number} will be removed from the list. You can still find it via the Show archived BOM filter.`"
    @confirm="confirmDelete"
  />
</template>

<style scoped>
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
.bom-section { padding: var(--mp-spacing-8) 0; border-bottom: 1px dashed var(--mp-border-default); }
.bom-section:first-child { padding-top: 0; }
.bom-section--last { border-bottom: none; }
.bom-section-head {
  display: flex; align-items: center; justify-content: space-between; width: 100%;
  background: none; border: none; padding: 0; cursor: pointer; color: var(--mp-text-secondary);
  margin-bottom: var(--mp-spacing-5);
}
.bom-section-title {
  margin: 0; font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}
.bom-chevron { flex-shrink: 0; color: var(--mp-icon-default); transition: transform 0.15s ease; }
.bom-chevron--open { transform: rotate(180deg); }
.bom-section > .bom-section-title { margin-bottom: var(--mp-spacing-5); }
.bom-subsection-title {
  margin: var(--mp-spacing-6) 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}

/* ── Info grid — 2 columns ───────────────────────────────────────────────── */
.bom-info-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: var(--mp-spacing-6); max-width: 900px; }
.content-list-col { display: flex; flex-direction: column; min-width: 0; }
.bom-show-more { display: block; margin-top: var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer; }
.bom-show-more:hover { text-decoration: underline; text-underline-offset: 2px; }
.bom-attach-list { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.bom-attach { display: inline-flex; align-items: flex-start; gap: var(--mp-spacing-2); cursor: pointer; color: var(--mp-text-link); }
.bom-attach-name { font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-lg, 20px); }
.bom-attach:hover .bom-attach-name { text-decoration: underline; text-underline-offset: 2px; }

/* ── Read-only tables (borderless ERP style) ─────────────────────────────── */
.bom-table-scroll {
  overflow-x: auto;
  border-top: 1px solid var(--mp-border-default);
  border-bottom: 1px solid var(--mp-border-default);
}
.bom-table { width: 100%; border-collapse: collapse; table-layout: auto; min-width: max-content; }
.bom-table--outputs { table-layout: fixed; }
.bom-th {
  height: var(--mp-sizes-7, 28px); text-align: left; white-space: nowrap;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
}
.bom-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.bom-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: top;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.bom-tr:last-child .bom-td { border-bottom: none; }
.bom-td--num { text-align: right; font-variant-numeric: tabular-nums; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
.bom-td--wrap { white-space: normal; min-width: 200px; }

/* production cost repeated sub-headers */
.bom-subhead-row .bom-th { border-top: 1px solid var(--mp-border-default); }
.bom-table tbody tr:first-child .bom-th { border-top: none; }

/* ── Subtotal + summary ──────────────────────────────────────────────────── */
.bom-subtotal-row {
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-8);
  padding: var(--mp-spacing-3) var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.bom-amount { min-width: 200px; text-align: right; font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.bom-summary { margin-top: var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.bom-summary-row {
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-8);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.bom-summary-row > :last-child { min-width: 200px; text-align: right; font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.bom-summary-row--total { font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
</style>
