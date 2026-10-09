<script setup lang="ts">
/**
 * "Partial production completion" — close a work order for part of its quantity
 * and leave the balance open.
 *
 * Laid out like the standard partial-production form: every figure on the page is
 * the REMAINING value of the run, not the original plan, because what is being
 * recorded is this batch and not the order. Qty produced drives the rest — the
 * components it consumes, the vendor's charges against it, the output it yields —
 * so the cost of this batch is visible before it is saved.
 *
 * What differs for subcontracting: **Production cost and Routing are replaced by
 * Subcon cost**, exactly as on the work order itself. There is no in-house labour
 * or routing to restate; the vendor's charges are the cost.
 *
 * `recordSubconProduction` owns the status rule — partially produced until the
 * total reaches the plan, partially completed once it does — so this form and a
 * vendor delivery cannot disagree about where the order stands.
 */
import { MpIcon, MpInput, MpInputGroup, MpInputRightAddon } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { successToast } from '~/utils/toasts'
import { workOrders, recordSubconProduction, recordSubconCost } from '~/data/workOrders'
import { billOfMaterials, catalogProduct } from '~/data/billOfMaterials'
import { warehouseTransfers } from '~/data/warehouseTransfers'
import { SUBCON_BATCH_QTY } from '~/data/subcon'

const props = defineProps<{ orderId: string }>()

const router = useRouter()
const { t } = useLocale()

const wo = computed(() => workOrders.find(w => w.id === props.orderId))
const subcon = computed(() => wo.value?.subcon)
const bom = computed(() => billOfMaterials.find(b => b.id === wo.value?.bomId))

function goBack(completed = false) {
  // `complete=1` tells the work order this record finished the quantity, so it
  // can offer completion straight away instead of making the user find the
  // button for a run that has nothing left to produce.
  router.push(`/work-orders/${props.orderId}${completed ? '?complete=1' : ''}`)
}

const num = (v: string) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }

// ── Header fields ───────────────────────────────────────────────────────────

const endDate = ref(new Date().toISOString().slice(0, 10))
const qtyProduced = ref('')
const error = ref('')

const alreadyProduced = computed(() => wo.value?.producedQty ?? 0)
const remainingToProduce = computed(() =>
  Math.max(0, (wo.value?.plannedQty ?? 0) - alreadyProduced.value))

/** The batch being recorded. Everything below is priced against this. */
const batchQty = computed(() => num(qtyProduced.value))

/** This batch as a fraction of the whole order — the scale for every figure. */
const batchFactor = computed(() => {
  const planned = wo.value?.plannedQty ?? 0
  return planned > 0 ? batchQty.value / planned : 0
})

// ── Product components ──────────────────────────────────────────────────────

/** What has actually gone to the vendor, so "remaining" is real and not planned. */
const sentBySku = computed<Record<string, number>>(() => {
  const ids = (subcon.value?.raisedDocuments ?? [])
    .filter(d => d.route === '/warehouse-transfers')
    .map(d => d.id)
  const totals: Record<string, number> = {}
  for (const id of ids) {
    for (const line of warehouseTransfers.find(tr => tr.id === id)?.lines ?? []) {
      totals[line.sku] = (totals[line.sku] ?? 0) + line.qty
    }
  }
  return totals
})

/**
 * Components, with the quantity this batch needs pre-filled from its share of
 * the order and editable — a partial run rarely consumes exactly pro rata.
 */
const componentQty = ref<Record<string, string>>({})

/**
 * Which warehouse a component is consumed FROM on this record — not where it was
 * originally drawn from.
 *
 * On `resupply` it was transferred into the vendor's location before the run
 * started, so that is where it is consumed. On `dropship` it never entered a
 * company warehouse — a 3rd party shipped it straight to the vendor — so the row
 * shows whatever the work order recorded.
 */
function componentWarehouseName(productId: string): string {
  const c = subcon.value
  if (c?.method === 'resupply' && c.subconWarehouseName) return c.subconWarehouseName
  return wo.value?.componentWarehouses?.[productId]?.name ?? '—'
}

const components = computed(() => (bom.value?.rawMaterials ?? []).map((r) => {
  const p = catalogProduct(r.productId)
  const sku = p?.sku ?? '—'
  const planned = subcon.value?.componentAdjustments?.[sku] ?? r.needed
  const consumedSoFar = Math.round(planned * (alreadyProduced.value / (wo.value?.plannedQty || 1)))
  const remaining = Math.max(0, planned - consumedSoFar)
  const suggested = Math.round(planned * batchFactor.value)
  const entered = componentQty.value[sku]
  const needed = entered !== undefined && entered !== '' ? num(entered) : suggested
  return {
    productId: r.productId,
    product: p?.name ?? '—',
    sku,
    unitCost: r.purchaseCost,
    warehouse: componentWarehouseName(r.productId),
    onHand: sentBySku.value[sku] ?? 0,
    remaining,
    needed,
    unit: r.unit,
    estimated: r.purchaseCost * needed,
  }
}))

const componentsSubtotal = computed(() =>
  components.value.reduce((s, r) => s + r.estimated, 0))

// ── Subcon cost ─────────────────────────────────────────────────────────────

/**
 * The vendor's charges, taken onto this record the way production cost is: the
 * amount is entered, not derived.
 *
 * A partial run does not necessarily cost a pro-rata slice of the order — the
 * vendor may bill the setup once, charge a minimum, or split it differently — so
 * the form suggests the batch's share and lets it be set. What it will not allow
 * is charging more than the order agreed: each line shows the amount still
 * remaining across every record, and `costLineRecorded` is what earlier ones
 * already took.
 */
const costAmount = ref<Record<string, string>>({})

const subconCostLines = computed(() => {
  const c = subcon.value
  if (!c) return []
  const planned = wo.value?.plannedQty ?? 0
  const orderFactor = planned / SUBCON_BATCH_QTY
  return (bom.value?.subconCost ?? []).map((l) => {
    const perOrder = c.costLineOverrides?.[l.productId] ?? Math.round(l.amount * orderFactor)
    const taken = c.costLineRecorded?.[l.productId] ?? 0
    const remaining = Math.max(0, perOrder - taken)
    // The batch's share, never more than is left to charge.
    const suggested = Math.min(remaining, Math.round(perOrder * batchFactor.value))
    const entered = costAmount.value[l.productId]
    const amount = entered !== undefined && entered !== '' ? num(entered) : suggested
    return {
      id: l.productId,
      account: l.name,
      chargedBy: c.vendorName,
      /** What one unit of output costs at the order's agreed total. */
      perUnit: planned > 0 ? perOrder / planned : 0,
      remaining,
      amount,
      over: amount > remaining,
    }
  })
})

const subconCostSubtotal = computed(() =>
  subconCostLines.value.reduce((s, l) => s + l.amount, 0))

const processCostTotal = computed(() => componentsSubtotal.value + subconCostSubtotal.value)

// ── Outputs ─────────────────────────────────────────────────────────────────

/** By-product and waste value for this batch, which the main output nets off. */
const otherOutputsRaw = computed(() =>
  (bom.value?.otherOutputs ?? []).reduce((s, o) => s + Math.round(o.estCost * batchFactor.value), 0))
const wasteRaw = computed(() =>
  (bom.value?.productionWaste ?? []).reduce((s, w) => s + Math.round(w.amount * batchFactor.value), 0))

const mainOutput = computed(() => {
  const fg = bom.value ? catalogProduct(bom.value.finishedGoodId) : undefined
  return {
    product: fg?.name ?? wo.value?.bomName ?? '—',
    sku: fg?.sku ?? '—',
    warehouse: subcon.value?.receivingWarehouseName ?? '—',
    qty: batchQty.value,
    unit: bom.value?.finishedGoodUnit ?? 'Pcs',
    percentage: bom.value?.finishedGoodPercentage ?? 100,
    // The main output carries whatever the by-products and waste do not.
    estimated: Math.max(0, processCostTotal.value - otherOutputsRaw.value - wasteRaw.value),
  }
})

/** The by-products this batch yields, scaled from the BOM the same way. */
const otherOutputs = computed(() => (bom.value?.otherOutputs ?? []).map((o) => {
  const p = catalogProduct(o.productId)
  return {
    product: p?.name ?? '—',
    sku: p?.sku ?? '—',
    warehouse: subcon.value?.receivingWarehouseName ?? '—',
    qty: Math.round(o.qty * batchFactor.value),
    unit: o.unit,
    percentage: o.percentage,
    estimated: Math.round(o.estCost * batchFactor.value),
  }
}))
const otherOutputsSubtotal = computed(() =>
  otherOutputs.value.reduce((s, o) => s + o.estimated, 0))

const productionWaste = computed(() => (bom.value?.productionWaste ?? []).map(w => ({
  ...w,
  amount: Math.round(w.amount * batchFactor.value),
})))
const wasteSubtotal = computed(() =>
  productionWaste.value.reduce((s, w) => s + w.amount, 0))

const outputTotal = computed(() =>
  mainOutput.value.estimated + otherOutputsSubtotal.value + wasteSubtotal.value)
const perUnit = computed(() => batchQty.value > 0 ? mainOutput.value.estimated / batchQty.value : 0)

// ── Save ────────────────────────────────────────────────────────────────────

/**
 * Validated inline, with the buttons staying live
 * (rule/btn-no-disabled-validation, rule/form-errors-inline).
 */
function validate(): boolean {
  if (!qtyProduced.value.trim() || batchQty.value <= 0) {
    error.value = t('Enter how many were produced.')
    return false
  }
  if (batchQty.value > remainingToProduce.value) {
    error.value = `${t('That is more than the remaining quantity')} (${remainingToProduce.value} ${mainOutput.value.unit}).`
    return false
  }
  if (!endDate.value) {
    error.value = t('Pick the date this partial production ended.')
    return false
  }
  // A line may not take more than the order still has to give — several partial
  // records must not between them bill more than was agreed.
  const over = subconCostLines.value.find(l => l.over)
  if (over) {
    error.value = `${over.account}: ${t('more than this line has left to charge')} (${formatIDR(over.remaining)}).`
    return false
  }
  error.value = ''
  return true
}

function save() {
  if (!wo.value || !validate()) return
  // Cost first: the quantity record is what changes the order's status, so the
  // charges it carries must already be on the order when that happens.
  recordSubconCost(wo.value.id, Object.fromEntries(
    subconCostLines.value.map(l => [l.id, l.amount]),
  ))
  recordSubconProduction(wo.value.id, batchQty.value)
  const finished = (wo.value.producedQty ?? 0) >= (wo.value.plannedQty ?? 0)
  successToast(t('Partial production recorded'))
  // Both paths return to the work order: the record is made, and what it changed
  // — produced qty, the charges taken, what is still outstanding — is read
  // there, not on a form that has already done its job.
  goBack(finished)
}
</script>

<template>
  <div v-if="wo && subcon" class="ppc-page">
    <header class="ppc-bar">
      <div>
        <nav class="ppc-crumbs">
          <button class="ppc-crumb btn-enterprise" @click="router.push('/work-orders')">{{ t('Work orders') }}</button>
          <span class="ppc-crumb-sep">/</span>
          <button class="ppc-crumb btn-enterprise" @click="goBack">{{ wo.number }}</button>
        </nav>
        <h1 class="ppc-title">{{ t('Partial production completion') }}</h1>
      </div>
    </header>

    <div class="ppc-stage">
      <div class="ppc-note">
        <MpIcon name="information" size="md" />
        <div>
          <p class="ppc-note-title">{{ t('Important information') }}</p>
          <p>{{ t('All values (qty, percentage, amount) on this page are the remaining values of the ongoing production process.') }}</p>
          <p>{{ t('Qty produced is different from the initial plan. Please adjust in the related column.') }}</p>
          <p>{{ t('To continue the production in the same work order, click Save button.') }}</p>
        </div>
      </div>

      <!-- ── What is being recorded ── -->
      <div class="ppc-fields">
        <div class="ppc-field">
          <label class="ppc-label" for="ppc-end-date">{{ t('Partial production end date') }} *</label>
          <MpInput id="ppc-end-date" v-model="endDate" type="date" is-full-width />
        </div>
        <div class="ppc-field">
          <label class="ppc-label" for="ppc-qty">{{ t('Qty produced') }} *</label>
          <div class="ppc-qty-pair">
            <div>
              <MpInput id="ppc-qty" v-model="qtyProduced" type="number" placeholder="0" is-full-width />
              <span class="ppc-caption">{{ t('Already produced') }}: {{ alreadyProduced }}</span>
            </div>
            <span class="ppc-slash">/</span>
            <div>
              <MpInputGroup id="ppc-remaining-group" is-full-width>
                <MpInput id="ppc-remaining" :model-value="String(remainingToProduce)" is-disabled is-full-width />
                <MpInputRightAddon has-background>{{ mainOutput.unit }}</MpInputRightAddon>
              </MpInputGroup>
              <span class="ppc-caption">{{ t('Remaining qty to produce') }}</span>
            </div>
          </div>
        </div>
      </div>
      <p v-if="error" class="ppc-error">{{ error }}</p>

      <!-- ── Product components ── -->
      <section class="ppc-section">
        <h2 class="ppc-section-title">{{ t('Product components') }}</h2>
        <div class="ppc-note ppc-note--inline">
          <MpIcon name="information" size="md" />
          <span>{{ t('Unit purchase price may change if there is an adjustment to the inventory value.') }}</span>
        </div>
        <div class="ppc-scroll">
          <table class="ppc-table">
            <thead>
              <tr>
                <th class="ppc-th">{{ t('Product name') }}</th>
                <th class="ppc-th">{{ t('Product code / SKU') }}</th>
                <th class="ppc-th ppc-th--num">{{ t('Unit buy price') }}</th>
                <th class="ppc-th">{{ t('Warehouse') }}</th>
                <th class="ppc-th ppc-th--num">{{ t('Stock on hand') }}</th>
                <th class="ppc-th ppc-th--num">{{ t('Qty remaining') }}</th>
                <th class="ppc-th ppc-th--num">{{ t('Qty needed') }}</th>
                <th class="ppc-th">{{ t('Unit') }}</th>
                <th class="ppc-th ppc-th--num">{{ t('Estimated price') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in components" :key="row.sku" class="ppc-tr">
                <td class="ppc-td">{{ row.product }}</td>
                <td class="ppc-td">{{ row.sku }}</td>
                <td class="ppc-td ppc-td--num">{{ formatIDR(row.unitCost) }}</td>
                <td class="ppc-td">{{ row.warehouse }}</td>
                <td class="ppc-td ppc-td--num">{{ row.onHand.toLocaleString('id-ID') }}</td>
                <td class="ppc-td ppc-td--num">{{ row.remaining.toLocaleString('id-ID') }}</td>
                <td class="ppc-td ppc-td--num">
                  <div class="ppc-qty-input">
                    <MpInput
                      :id="`ppc-cmp-${row.sku}`"
                      :model-value="String(row.needed)"
                      type="number"
                      is-full-width
                      @update:model-value="(v: string) => componentQty[row.sku] = v"
                    />
                  </div>
                </td>
                <td class="ppc-td">{{ row.unit }}</td>
                <td class="ppc-td ppc-td--num">{{ formatIDR(row.estimated) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="ppc-subtotal">
          <span>{{ t('Estimated subtotal of product component prices') }}</span>
          <span class="ppc-amount">{{ formatIDR(componentsSubtotal) }}</span>
        </div>
      </section>

      <!-- ── Subcon cost — in place of production cost + routing ── -->
      <section class="ppc-section">
        <h2 class="ppc-section-title">{{ t('Subcon cost') }}</h2>
        <div class="ppc-scroll">
          <table class="ppc-table">
            <thead>
              <tr>
                <th class="ppc-th">{{ t('Cost component') }}</th>
                <th class="ppc-th">{{ t('Charged by') }}</th>
                <th class="ppc-th ppc-th--num">{{ t('Cost per unit estimation') }}</th>
                <th class="ppc-th ppc-th--num">{{ t('Amount') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="l in subconCostLines" :key="l.id" class="ppc-tr">
                <td class="ppc-td">{{ l.account }}</td>
                <td class="ppc-td">{{ l.chargedBy }}</td>
                <td class="ppc-td ppc-td--num">{{ formatIDR(l.perUnit) }}</td>
                <!-- Entered, like the multiplier on a standard partial: what the
                     vendor is actually billing for this batch, bounded by what is
                     left of the order's agreed total. -->
                <td class="ppc-td ppc-td--num">
                  <div class="ppc-qty-input">
                    <MpInput
                      :id="`ppc-cost-${l.id}`"
                      :model-value="String(l.amount)"
                      type="number"
                      is-full-width
                      @update:model-value="(v: string) => costAmount[l.id] = v"
                    />
                  </div>
                  <span class="ppc-cell-note" :class="{ 'ppc-cell-note--bad': l.over }">
                    {{ t('Remaining') }}: {{ formatIDR(l.remaining) }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="ppc-subtotal">
          <span>{{ t('Subcon cost subtotal') }}</span>
          <span class="ppc-amount">{{ formatIDR(subconCostSubtotal) }}</span>
        </div>

        <dl class="ppc-totals">
          <div class="ppc-total-row">
            <dt>{{ t('Estimated subtotal of product component prices') }}</dt>
            <dd>{{ formatIDR(componentsSubtotal) }}</dd>
          </div>
          <div class="ppc-total-row">
            <dt>{{ t('Subcon cost subtotal') }}</dt>
            <dd>{{ formatIDR(subconCostSubtotal) }}</dd>
          </div>
          <div class="ppc-total-row ppc-total-row--grand">
            <dt>{{ t('Estimated total of production process cost') }}</dt>
            <dd>{{ formatIDR(processCostTotal) }}</dd>
          </div>
        </dl>
      </section>

      <!-- ── Main output ── -->
      <section class="ppc-section">
        <h2 class="ppc-section-title">{{ t('Main output') }}</h2>
        <div class="ppc-scroll">
          <table class="ppc-table">
            <thead>
              <tr>
                <th class="ppc-th">{{ t('Product name') }}</th>
                <th class="ppc-th">{{ t('Product code / SKU') }}</th>
                <th class="ppc-th">{{ t('Warehouse') }}</th>
                <th class="ppc-th ppc-th--num">{{ t('Qty produced') }}</th>
                <th class="ppc-th">{{ t('Unit') }}</th>
                <th class="ppc-th ppc-th--num">{{ t('Percentage') }}</th>
                <th class="ppc-th ppc-th--num">{{ t('Estimated price') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr class="ppc-tr">
                <td class="ppc-td">{{ mainOutput.product }}</td>
                <td class="ppc-td">{{ mainOutput.sku }}</td>
                <td class="ppc-td">{{ mainOutput.warehouse }}</td>
                <td class="ppc-td ppc-td--num">{{ mainOutput.qty }}</td>
                <td class="ppc-td">{{ mainOutput.unit }}</td>
                <td class="ppc-td ppc-td--num">{{ mainOutput.percentage }}%</td>
                <td class="ppc-td ppc-td--num">{{ formatIDR(mainOutput.estimated) }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- ── Other outputs ── -->
        <h3 class="ppc-subsection-title">{{ t('Other outputs') }}</h3>
        <div class="ppc-scroll">
          <table class="ppc-table">
            <thead>
              <tr>
                <th class="ppc-th">{{ t('Product name') }}</th>
                <th class="ppc-th">{{ t('Product code / SKU') }}</th>
                <th class="ppc-th">{{ t('Warehouse') }}</th>
                <th class="ppc-th ppc-th--num">{{ t('Qty produced') }}</th>
                <th class="ppc-th">{{ t('Unit') }}</th>
                <th class="ppc-th ppc-th--num">{{ t('Percentage') }}</th>
                <th class="ppc-th ppc-th--num">{{ t('Estimated price') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in otherOutputs" :key="o.sku" class="ppc-tr">
                <td class="ppc-td">{{ o.product }}</td>
                <td class="ppc-td">{{ o.sku }}</td>
                <td class="ppc-td">{{ o.warehouse }}</td>
                <td class="ppc-td ppc-td--num">{{ o.qty }}</td>
                <td class="ppc-td">{{ o.unit }}</td>
                <td class="ppc-td ppc-td--num">{{ o.percentage }}%</td>
                <td class="ppc-td ppc-td--num">{{ formatIDR(o.estimated) }}</td>
              </tr>
              <!-- A BOM with no by-products still shows the section, so its
                   absence is a fact on the page rather than a missing row. -->
              <tr v-if="!otherOutputs.length" class="ppc-tr">
                <td class="ppc-td ppc-td--empty" colspan="7">{{ t('This BOM has no other outputs.') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="ppc-subtotal">
          <span>{{ t('Estimated subtotal of other output prices') }}</span>
          <span class="ppc-amount">{{ formatIDR(otherOutputsSubtotal) }}</span>
        </div>

        <!-- ── Production waste ── -->
        <h3 class="ppc-subsection-title">{{ t('Production waste') }}</h3>
        <div class="ppc-scroll">
          <table class="ppc-table">
            <thead>
              <tr>
                <th class="ppc-th">{{ t('Account mapping') }}</th>
                <th class="ppc-th">{{ t('Allocation method') }}</th>
                <th class="ppc-th ppc-th--num">{{ t('Percentage') }}</th>
                <th class="ppc-th ppc-th--num">{{ t('Amount') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="w in productionWaste" :key="w.accountMapping" class="ppc-tr">
                <td class="ppc-td">{{ w.accountMapping }}</td>
                <td class="ppc-td">{{ t(w.allocationMethod) }}</td>
                <td class="ppc-td ppc-td--num">{{ w.percentage }}%</td>
                <td class="ppc-td ppc-td--num">{{ formatIDR(w.amount) }}</td>
              </tr>
              <tr v-if="!productionWaste.length" class="ppc-tr">
                <td class="ppc-td ppc-td--empty" colspan="4">{{ t('This BOM allocates no production waste.') }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="ppc-subtotal">
          <span>{{ t('Estimated subtotal of production waste') }}</span>
          <span class="ppc-amount">{{ formatIDR(wasteSubtotal) }}</span>
        </div>

        <dl class="ppc-totals">
          <div class="ppc-total-row">
            <dt>{{ t('Estimated subtotal of main output prices') }}</dt>
            <dd>{{ formatIDR(mainOutput.estimated) }}</dd>
          </div>
          <div class="ppc-total-row">
            <dt>{{ t('Estimated subtotal of other output prices') }}</dt>
            <dd>{{ formatIDR(otherOutputsSubtotal) }}</dd>
          </div>
          <div class="ppc-total-row">
            <dt>{{ t('Estimated subtotal of production waste') }}</dt>
            <dd>{{ formatIDR(wasteSubtotal) }}</dd>
          </div>
          <div class="ppc-total-row ppc-total-row--grand">
            <dt>{{ t('Estimated total of production output prices') }}</dt>
            <dd>{{ formatIDR(outputTotal) }}</dd>
          </div>
          <div class="ppc-total-row">
            <dt>{{ t('Estimated main output price per unit') }}</dt>
            <dd>{{ formatIDR(perUnit) }}</dd>
          </div>
        </dl>
      </section>
    </div>

    <footer class="ppc-footer">
      <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="goBack">{{ t('Cancel') }}</button>
      <!-- One Save: both buttons now returned to the work order, so offering
           "Save & close" beside it was two labels for one action. -->
      <button class="btn-enterprise btn-enterprise--primary ppc-action" type="button" @click="save()">{{ t('Save') }}</button>
    </footer>
  </div>

  <div v-else class="ppc-page">
    <header class="ppc-bar">
      <h1 class="ppc-title">{{ t('Work order not found') }}</h1>
    </header>
  </div>
</template>

<style scoped>
.ppc-page { display: flex; flex-direction: column; height: 100%; }

.ppc-bar {
  flex: none;
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-neutral-subtle, #f5f6f7);
  border-bottom: 1px solid var(--mp-border-default);
}
.ppc-crumbs { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.ppc-crumb {
  border: none; background: transparent; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-link);
}
.ppc-crumb-sep { font-size: var(--mp-font-sizes-md); color: var(--mp-text-subtle, #75808f); }
.ppc-title {
  margin: var(--mp-spacing-1) 0 0;
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.ppc-stage { flex: 1; overflow-y: auto; padding: var(--mp-spacing-6); }

.ppc-note {
  display: flex; align-items: flex-start; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  margin-bottom: var(--mp-spacing-5);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-information, #eef0fc);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.ppc-note :deep(svg) { color: var(--mp-text-link); flex: none; }
.ppc-note p { margin: 0; }
.ppc-note-title { font-weight: var(--mp-font-weights-semi-bold); }
.ppc-note--inline { align-items: center; margin-bottom: var(--mp-spacing-3); }

.ppc-fields {
  display: flex; flex-wrap: wrap; gap: var(--mp-spacing-6);
  margin-bottom: var(--mp-spacing-6);
}
.ppc-field { min-width: var(--mp-sizes-48, 192px); }
.ppc-label {
  display: block; margin-bottom: var(--mp-spacing-1\.5);
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ppc-qty-pair { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); }
.ppc-slash { padding-top: var(--mp-spacing-2); color: var(--mp-text-subtle, #75808f); }
.ppc-caption {
  display: block; margin-top: var(--mp-spacing-1);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
}
.ppc-error {
  margin: 0 0 var(--mp-spacing-5);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-danger, #a8352d);
}

.ppc-section { margin-bottom: var(--mp-spacing-8, 32px); }
.ppc-section-title {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ppc-scroll { overflow-x: auto; }
.ppc-table { width: 100%; border-collapse: collapse; }
.ppc-th {
  text-align: left; white-space: nowrap;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
}
.ppc-th--num { text-align: right; }
.ppc-td {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
}
.ppc-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.ppc-td--empty { color: var(--mp-text-secondary); }
.ppc-cell-note { display: block; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ppc-cell-note--bad { color: var(--mp-text-danger, #a8352d); }
.ppc-subsection-title {
  margin: var(--mp-spacing-5) 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ppc-qty-input { max-width: var(--mp-sizes-32, 128px); margin-left: auto; }

.ppc-subtotal {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-6);
  padding: var(--mp-spacing-3) var(--mp-spacing-3) 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.ppc-amount { font-variant-numeric: tabular-nums; color: var(--mp-text-default); }

.ppc-totals { margin: var(--mp-spacing-6) 0 0 auto; max-width: var(--mp-sizes-120, 480px); }
.ppc-total-row {
  display: flex; justify-content: space-between; gap: var(--mp-spacing-6);
  padding: var(--mp-spacing-2) 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
}
.ppc-total-row dt, .ppc-total-row dd { margin: 0; }
.ppc-total-row dd { font-variant-numeric: tabular-nums; color: var(--mp-text-default); }
.ppc-total-row--grand {
  border-top: 1px solid var(--mp-border-default);
  margin-top: var(--mp-spacing-2); padding-top: var(--mp-spacing-3);
  font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default);
}
.ppc-total-row--grand dd { font-weight: var(--mp-font-weights-semi-bold); }

.ppc-footer {
  flex: none;
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage, #fff);
  border-top: 1px solid var(--mp-border-default);
}
.ppc-action { padding: var(--mp-spacing-2) var(--mp-spacing-5); border-radius: var(--mp-radii-full, 999px); cursor: pointer; }
</style>
