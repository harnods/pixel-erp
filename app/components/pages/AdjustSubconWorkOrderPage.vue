<script setup lang="ts">
/**
 * "Adjust work order" — the subcontracting variant.
 *
 * Same shape as the standard adjust form: the work order's own numbers laid out
 * editable, with running subtotals, so someone reconciling against what actually
 * happened in the field can correct the whole order in one pass rather than
 * hunting for per-row actions.
 *
 * What differs for subcon: **Production cost and Routing are replaced by Subcon
 * cost**, exactly as they are on the work order itself. There is no in-house
 * labour or routing to restate — the vendor's charges are the cost.
 *
 * The component quantities carry the adjustment rules (see
 * `evaluateComponentAdjustment`), and the boundary is the quantity already handed
 * over to the vendor. A row that breaks the rule is flagged inline and Save
 * refuses, with the button staying live (rule/btn-no-disabled-validation).
 */
import { MpButton, MpIcon, MpInput } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { successToast } from '~/utils/toasts'
import { workOrders, setSubconComponentQty, setSubconCostLineAmount, addSubconCostLine, persistWorkOrders } from '~/data/workOrders'
import { billOfMaterials, catalogProduct } from '~/data/billOfMaterials'
import { warehouseTransfers } from '~/data/warehouseTransfers'
import { evaluateComponentAdjustment } from '~/data/subconAccounting'
import { SUBCON_BATCH_QTY, SUBCON_SERVICE_FEE, SUBCON_HANDLING_FEE, SUBCON_COST_DRIVERS } from '~/data/subcon'

const props = defineProps<{ orderId: string }>()

const router = useRouter()
const { t } = useLocale()

const wo = computed(() => workOrders.find(w => w.id === props.orderId))
const subcon = computed(() => wo.value?.subcon)
const bom = computed(() => billOfMaterials.find(b => b.id === wo.value?.bomId))

function goBack() { router.push(`/work-orders/${props.orderId}`) }

// ── Components ────────────────────────────────────────────────────────────────

/** How much of each component has actually gone to the vendor. */
const sentBySku = computed<Record<string, number>>(() => {
  const c = subcon.value
  if (!c) return {}
  const ids = (c.raisedDocuments ?? [])
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

interface ComponentRow {
  productId: string
  sku: string
  product: string
  unitCost: number
  warehouse: string
  onHand: number
  sent: number
  /** Planned quantity as currently saved — the baseline an edit is judged against. */
  planned: number
  draft: string
}

const components = ref<ComponentRow[]>([])
const outputQty = ref('')
/** `isNew` lines do not exist on the order yet — they are created on save. */
const costLines = ref<{ id: string; name: string; driver: string; draft: string; isNew?: boolean; baseline: number }[]>([])

/** Load the form from the order. Runs once — this is an edit form, not a live view. */
onMounted(() => {
  const w = wo.value
  const c = subcon.value
  if (!w || !c) return

  components.value = (bom.value?.rawMaterials ?? []).map((r) => {
    const p = catalogProduct(r.productId)
    const sku = p?.sku ?? '—'
    const planned = c.componentAdjustments?.[sku] ?? r.needed
    return {
      productId: r.productId,
      sku,
      product: p?.name ?? '—',
      unitCost: r.purchaseCost,
      warehouse: w.componentWarehouses?.[r.productId]?.name ?? t('Unassigned'),
      onHand: 0,
      sent: sentBySku.value[sku] ?? 0,
      planned,
      draft: String(planned),
    }
  })

  outputQty.value = String(w.plannedQty)

  const factor = (w.plannedQty / SUBCON_BATCH_QTY) * (c.split === 'partial' ? 0.5 : 1)
  // A revised amount wins over the BOM's — see `costLineOverrides`.
  const amountFor = (id: string, fallback: number) => c.costLineOverrides?.[id] ?? fallback
  const fromBom = (bom.value?.subconCost ?? []).map((l) => {
    const amount = amountFor(l.productId, Math.round(l.amount * factor))
    return { id: l.productId, name: l.name, driver: l.costDriver, draft: String(amount), baseline: amount }
  })
  const base = fromBom.length ? fromBom : [
    { id: 'svc-fee', name: t(SUBCON_SERVICE_FEE[c.scope].name), driver: 'Unit',
      draft: String(amountFor('svc-fee', Math.round(SUBCON_SERVICE_FEE[c.scope].amount * factor))),
      baseline: amountFor('svc-fee', Math.round(SUBCON_SERVICE_FEE[c.scope].amount * factor)) },
    { id: 'svc-handling', name: t(SUBCON_HANDLING_FEE.name), driver: 'Amount',
      draft: String(amountFor('svc-handling', Math.round(SUBCON_HANDLING_FEE.amount * factor))),
      baseline: amountFor('svc-handling', Math.round(SUBCON_HANDLING_FEE.amount * factor)) },
  ]
  costLines.value = [
    ...base,
    ...(c.extraCostLines ?? []).map(l => ({
      id: l.id, name: l.name, driver: l.costDriver, draft: String(l.amount), baseline: l.amount,
    })),
  ]
})

/**
 * A charge agreed after the order was created. It is added here rather than from
 * the work order itself: this is the one place the order's numbers are restated,
 * and the running totals below already show what it does to cost per unit.
 */
let newLineSeq = 0
function addCostLine() {
  costLines.value.push({
    id: `extra-${Date.now()}-${++newLineSeq}`,
    name: '',
    driver: 'Amount',
    draft: '',
    isNew: true,
    baseline: 0,
  })
}
function removeCostLine(id: string) {
  costLines.value = costLines.value.filter(l => l.id !== id)
}

/** A new line needs a name and an amount before it can be saved. */
const incompleteNewLines = computed(() =>
  costLines.value.filter(l => l.isNew && (!l.name.trim() || costAmount(l) <= 0)))

function qtyOf(row: ComponentRow) {
  const n = Number(row.draft)
  return Number.isFinite(n) && n >= 0 ? n : row.planned
}

/** The adjustment rule, per row, evaluated as the user types. */
function outcomeFor(row: ComponentRow) {
  return evaluateComponentAdjustment({
    method: subcon.value?.method ?? 'resupply',
    plannedQty: row.planned,
    newPlannedQty: qtyOf(row),
    alreadySentQty: row.sent,
    componentName: row.product,
    unit: unitFor(row),
  })
}

function unitFor(row: ComponentRow) {
  return (bom.value?.rawMaterials ?? []).find(r => r.productId === row.productId)?.unit ?? ''
}

const blockedRows = computed(() => components.value.filter(r => outcomeFor(r).kind === 'rejected'))

// ── Totals ────────────────────────────────────────────────────────────────────

const componentsSubtotal = computed(() =>
  components.value.reduce((s, r) => s + r.unitCost * qtyOf(r), 0))

const costAmount = (line: { draft: string }) => {
  const n = Number(line.draft)
  return Number.isFinite(n) ? n : 0
}
const subconSubtotal = computed(() => costLines.value.reduce((s, l) => s + costAmount(l), 0))
const processTotal = computed(() => componentsSubtotal.value + subconSubtotal.value)
const producedQty = computed(() => {
  const n = Number(outputQty.value)
  return Number.isFinite(n) && n > 0 ? n : (wo.value?.plannedQty ?? 0)
})
const perUnit = computed(() => producedQty.value > 0 ? processTotal.value / producedQty.value : 0)

// ── Save ──────────────────────────────────────────────────────────────────────

const attempted = ref(false)

function onSave() {
  attempted.value = true
  // Errors surface inline on the offending rows, never as a toast.
  if (blockedRows.value.length || incompleteNewLines.value.length) return

  const w = wo.value
  const c = subcon.value
  if (!w || !c) return

  for (const row of components.value) {
    if (qtyOf(row) !== row.planned) setSubconComponentQty(w.id, row.sku, qtyOf(row))
  }

  for (const line of costLines.value) {
    const amount = costAmount(line)
    if (line.isNew) {
      addSubconCostLine(w.id, { id: line.id, name: line.name.trim(), costDriver: line.driver, amount })
      continue
    }
    // A revised amount is recorded as an override on this order, leaving the
    // BOM — the shared recipe every other order is built from — untouched.
    if (amount !== line.baseline) setSubconCostLineAmount(w.id, line.id, amount)
  }

  if (producedQty.value !== w.plannedQty) {
    w.plannedQty = producedQty.value
  }
  persistWorkOrders()

  successToast(t('Work order adjusted'))
  goBack()
}

</script>

<template>
  <div v-if="wo && subcon" class="awo-page">
    <header class="awo-bar">
      <div>
        <button class="awo-crumb btn-enterprise" @click="goBack">{{ t('Detail work order') }}</button>
        <h1 class="awo-title">{{ t('Adjust work order') }}</h1>
      </div>
    </header>

    <div class="awo-stage">
      <div class="awo-note">
        <MpIcon name="information" size="md" />
        <span>{{ t('Unit purchase price may change if there is an adjustment to the inventory value.') }}</span>
      </div>

      <!-- ── Product components ── -->
      <section class="awo-section">
        <h2 class="awo-section-title">{{ t('Product components') }}</h2>
        <div class="awo-scroll">
          <table class="awo-table">
            <thead>
              <tr>
                <th class="awo-th">{{ t('Product name') }}</th>
                <th class="awo-th">{{ t('Product code / SKU') }}</th>
                <th class="awo-th awo-th--num">{{ t('Unit buy price') }}</th>
                <th class="awo-th">{{ t('Warehouse name') }}</th>
                <th class="awo-th awo-th--num">{{ t('Sent to vendor') }}</th>
                <th class="awo-th awo-th--num">{{ t('Qty needed') }}</th>
                <th class="awo-th">{{ t('Unit') }}</th>
                <th class="awo-th awo-th--num">{{ t('Estimated price') }}</th>
              </tr>
            </thead>
            <tbody>
              <template v-for="row in components" :key="row.sku">
                <tr class="awo-tr">
                  <td class="awo-td">{{ row.product }}</td>
                  <td class="awo-td">{{ row.sku }}</td>
                  <td class="awo-td awo-td--num">{{ formatIDR(row.unitCost) }}</td>
                  <td class="awo-td">{{ row.warehouse }}</td>
                  <td class="awo-td awo-td--num">{{ row.sent.toLocaleString('id-ID') }}</td>
                  <td class="awo-td awo-td--num">
                    <MpInput
                      :id="`awo-qty-${row.sku}`" v-model="row.draft" type="number" min="0"
                      class="awo-qty" :is-invalid="outcomeFor(row).kind === 'rejected'"
                    />
                  </td>
                  <td class="awo-td">{{ unitFor(row) }}</td>
                  <td class="awo-td awo-td--num">{{ formatIDR(row.unitCost * qtyOf(row)) }}</td>
                </tr>
                <!-- What this edit will do, said before it is saved. -->
                <tr v-if="outcomeFor(row).kind !== 'planOnly'" class="awo-tr awo-tr--note">
                  <td class="awo-td awo-td--note" colspan="8">
                    <span :class="outcomeFor(row).kind === 'rejected' ? 'awo-note-text--bad' : 'awo-note-text'">
                      <template v-if="outcomeFor(row).kind === 'rejected'">
                        {{ (outcomeFor(row) as { message: string }).message }}
                      </template>
                      <template v-else-if="outcomeFor(row).kind === 'requiresShipment'">
                        {{ t('Adds') }} {{ (outcomeFor(row) as { extraQty: number }).extraQty }} {{ unitFor(row) }} —
                        {{ t('everything planned is already with the vendor, so this needs a new transfer or purchase to reach them.') }}
                      </template>
                    </span>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
        <div class="awo-subtotal">
          <span>{{ t('Estimated subtotal of product component prices') }}</span>
          <span class="awo-amount">{{ formatIDR(componentsSubtotal) }}</span>
        </div>
      </section>

      <!-- ── Subcon cost — stands in for Production cost + Routing ── -->
      <section class="awo-section">
        <h2 class="awo-section-title">{{ t('Subcon cost') }}</h2>
        <div class="awo-scroll">
          <table class="awo-table">
            <thead>
              <tr>
                <th class="awo-th">{{ t('Cost component') }}</th>
                <th class="awo-th">{{ t('Charged by') }}</th>
                <th class="awo-th">{{ t('Cost driver') }}</th>
                <th class="awo-th awo-th--num">{{ t('Amount') }}</th>
                <th class="awo-th awo-th--action" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="line in costLines" :key="line.id" class="awo-tr">
                <td class="awo-td">
                  <!-- A charge from the BOM is named already; a new one is typed. -->
                  <MpInput
                    v-if="line.isNew" :id="`awo-cost-name-${line.id}`" v-model="line.name"
                    :placeholder="t('Finishing &amp; packing')" is-full-width
                    :is-invalid="attempted && !line.name.trim()"
                  />
                  <template v-else>{{ line.name }}</template>
                </td>
                <td class="awo-td">{{ subcon.vendorName }}</td>
                <td class="awo-td">
                  <span v-if="!line.isNew">{{ t(line.driver) }}</span>
                  <span v-else class="awo-drivers">
                    <button
                      v-for="d in SUBCON_COST_DRIVERS" :key="d" type="button"
                      class="awo-driver btn-enterprise" :class="{ 'awo-driver--on': line.driver === d }"
                      @click="line.driver = d"
                    >{{ t(d) }}</button>
                  </span>
                </td>
                <td class="awo-td awo-td--num">
                  <MpInput
                    :id="`awo-cost-${line.id}`" v-model="line.draft" type="number" min="0" class="awo-qty"
                    :is-invalid="attempted && line.isNew && costAmount(line) <= 0"
                  />
                </td>
                <td class="awo-td awo-td--action">
                  <button
                    v-if="line.isNew" type="button" class="awo-remove btn-enterprise"
                    :aria-label="t('Remove cost component')" @click="removeCostLine(line.id)"
                  ><MpIcon name="close" size="sm" /></button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="awo-add">
          <MpButton variant="secondary" is-rounded left-icon="add" @click="addCostLine">
            {{ t('Add subcon cost') }}
          </MpButton>
        </div>
        <div class="awo-subtotal">
          <span>{{ t('Subtotal subcon cost') }}</span>
          <span class="awo-amount">{{ formatIDR(subconSubtotal) }}</span>
        </div>
      </section>

      <!-- ── Main output ── -->
      <section class="awo-section">
        <h2 class="awo-section-title">{{ t('Main output') }}</h2>
        <div class="awo-scroll">
          <table class="awo-table">
            <thead>
              <tr>
                <th class="awo-th">{{ t('Product name') }}</th>
                <th class="awo-th">{{ t('Warehouse name') }}</th>
                <th class="awo-th awo-th--num">{{ t('Qty needed') }}</th>
                <th class="awo-th">{{ t('Unit') }}</th>
                <th class="awo-th awo-th--num">{{ t('Estimated price') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr class="awo-tr">
                <td class="awo-td">{{ wo.bomName }}</td>
                <td class="awo-td">{{ subcon.receivingWarehouseName }}</td>
                <td class="awo-td awo-td--num">
                  <MpInput id="awo-output-qty" v-model="outputQty" type="number" min="1" class="awo-qty" />
                </td>
                <td class="awo-td">{{ bom?.finishedGoodUnit ?? '' }}</td>
                <td class="awo-td awo-td--num">{{ formatIDR(processTotal) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ── Totals ── -->
      <section class="awo-section awo-section--totals">
        <div class="awo-total-row"><span>{{ t('Estimated subtotal of product component prices') }}</span><span>{{ formatIDR(componentsSubtotal) }}</span></div>
        <div class="awo-total-row"><span>{{ t('Subtotal subcon cost') }}</span><span>{{ formatIDR(subconSubtotal) }}</span></div>
        <div class="awo-total-row awo-total-row--grand"><span>{{ t('Estimated total of production process cost') }}</span><span>{{ formatIDR(processTotal) }}</span></div>
        <div class="awo-total-row"><span>{{ t('Estimated main output price per unit') }}</span><span>{{ formatIDR(Math.round(perUnit)) }}</span></div>
      </section>

      <p v-if="attempted && blockedRows.length" class="awo-blocked">
        {{ t('Fix the highlighted quantities before saving — they are below what has already gone to the vendor.') }}
      </p>
      <p v-if="attempted && incompleteNewLines.length" class="awo-blocked">
        {{ t('Every new subcon cost needs a name and an amount.') }}
      </p>

      <footer class="awo-footer">
        <MpButton variant="ghost" is-rounded @click="goBack">{{ t('Cancel') }}</MpButton>
        <MpButton variant="primary" is-rounded @click="onSave">{{ t('Save') }}</MpButton>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.awo-page { display: flex; flex-direction: column; height: 100%; }

.awo-bar {
  flex: none;
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-neutral-subtle, #f5f6f7);
  border-bottom: 1px solid var(--mp-border-default);
}
.awo-crumb {
  border: none; background: transparent; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-link);
}
.awo-title {
  margin: var(--mp-spacing-1) 0 0;
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.awo-stage { flex: 1; overflow-y: auto; padding: var(--mp-spacing-6); }

.awo-note {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  margin-bottom: var(--mp-spacing-5);
  border-radius: var(--mp-radii-md);
  background: var(--mp-background-information, #eef0fc);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.awo-note :deep(svg) { color: var(--mp-text-link); flex: none; }

.awo-section { margin-bottom: var(--mp-spacing-6); }
.awo-section-title {
  margin: 0 0 var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.awo-scroll { overflow-x: auto; }
.awo-table { width: 100%; border-collapse: collapse; }
.awo-th {
  text-align: left; white-space: nowrap;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default);
}
.awo-th--num { text-align: right; }
.awo-td {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default));
}
.awo-td--num { text-align: right; font-variant-numeric: tabular-nums; }
.awo-qty { max-width: var(--mp-sizes-32, 128px); margin-left: auto; }

/* The consequence line sits under its own row, not in a tooltip. */
.awo-tr--note .awo-td--note {
  padding-top: 0;
  border-bottom: 1px solid var(--mp-border-subtle, var(--mp-border-default));
}
.awo-note-text { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.awo-note-text--bad { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger); }

.awo-add { padding: var(--mp-spacing-3) var(--mp-spacing-3) 0; }
.awo-th--action, .awo-td--action { width: var(--mp-sizes-10, 40px); }
.awo-remove {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px);
  padding: 0; border: none; border-radius: var(--mp-radii-md);
  background: transparent; color: var(--mp-text-secondary); cursor: pointer;
}
.awo-remove:hover { background: var(--mp-background-neutral-hovered); }
.awo-drivers { display: flex; gap: var(--mp-spacing-2); }
.awo-driver {
  padding: var(--mp-spacing-1) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-default, #fff);
  color: var(--mp-text-default);
  font-size: var(--mp-font-sizes-sm);
  cursor: pointer;
}
.awo-driver--on {
  border-color: var(--mp-border-selected, #029861);
  background: var(--mp-background-information, #eef0fc);
  font-weight: var(--mp-font-weights-semi-bold);
}

.awo-subtotal {
  display: flex; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.awo-amount { font-weight: var(--mp-font-weights-semi-bold); font-variant-numeric: tabular-nums; }

.awo-section--totals {
  border-top: 1px solid var(--mp-border-default);
  padding-top: var(--mp-spacing-4);
}
.awo-total-row {
  display: flex; justify-content: space-between;
  padding: var(--mp-spacing-1) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.awo-total-row span:last-child { font-variant-numeric: tabular-nums; }
.awo-total-row--grand { font-weight: var(--mp-font-weights-semi-bold); }

.awo-blocked {
  margin: 0 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-danger);
}

.awo-footer {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-3);
  padding-top: var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
</style>
