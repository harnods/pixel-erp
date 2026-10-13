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
import { MpButton, MpIcon, MpInput, MpTextarea } from '@mekari/pixel3'
import { formatIDR } from '~/utils/currency'
import { successToast } from '~/utils/toasts'
import { workOrders, applySubconAdjustment, subconSentToVendor, subconPlannedComponentQty, subconCostLinesFor } from '~/data/workOrders'
import { billOfMaterials, catalogProduct } from '~/data/billOfMaterials'
import { evaluateComponentAdjustment } from '~/data/subconAccounting'
import { evaluateSubconAdjustment, SUBCON_COST_DRIVERS, SUBCON_DEFAULT_ACCOUNT_MAPPING } from '~/data/subcon'

const props = defineProps<{ orderId: string }>()

const router = useRouter()
const { t } = useLocale()

const wo = computed(() => workOrders.find(w => w.id === props.orderId))
const subcon = computed(() => wo.value?.subcon)
const bom = computed(() => billOfMaterials.find(b => b.id === wo.value?.bomId))

function goBack() { router.push(`/work-orders/${props.orderId}`) }

/**
 * Which warehouse a component is adjusted AGAINST — which is not where it was
 * drawn from.
 *
 * On `resupply` the components have already been transferred into the vendor's
 * location, so by the time anything is adjusted that is where they sit; naming
 * the company warehouse they left would point at stock that is no longer there.
 *
 * On `dropship` they never entered a company warehouse at all — a 3rd party
 * shipped them straight to the vendor — so the row shows the warehouse the work
 * order recorded for it, and nothing when there was none.
 */
function componentWarehouseName(productId: string): string {
  const c = subcon.value
  if (c?.method === 'resupply' && c.subconWarehouseName) return c.subconWarehouseName
  return wo.value?.componentWarehouses?.[productId]?.name ?? t('Unassigned')
}

// ── Components ────────────────────────────────────────────────────────────────

/** How much of each component has actually gone to the vendor (transfers or component deliveries). */
const sentBySku = computed<Record<string, number>>(() =>
  wo.value ? subconSentToVendor(wo.value) : {})

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
/** Basic: the vendor's own materials, so this order has no components to adjust. */
const subconIsBasic = computed(() => subcon.value?.method === 'basic')

const costLines = ref<{ id: string; name: string; driver: string; mapping: string; draft: string; isNew?: boolean; baseline: number; recorded?: number }[]>([])

/** Load the form from the order. Runs once — this is an edit form, not a live view. */
onMounted(() => {
  const w = wo.value
  const c = subcon.value
  if (!w || !c) return

  components.value = (bom.value?.rawMaterials ?? []).map((r) => {
    const p = catalogProduct(r.productId)
    const sku = p?.sku ?? '—'
    const planned = subconPlannedComponentQty(w, sku, r.needed)
    return {
      productId: r.productId,
      sku,
      product: p?.name ?? '—',
      unitCost: r.purchaseCost,
      warehouse: componentWarehouseName(r.productId),
      onHand: 0,
      sent: sentBySku.value[sku] ?? 0,
      planned,
      draft: String(planned),
    }
  })

  outputQty.value = String(w.plannedQty)

  // The same lines every other screen reads (R9): the BOM's, scaled to this order's
  // output and revised where revised, plus any added on an earlier adjustment.
  costLines.value = subconCostLinesFor(w, t).map(l => ({
    id: l.id, name: l.name, driver: l.costDriver,
    mapping: l.accountMapping || SUBCON_DEFAULT_ACCOUNT_MAPPING,
    draft: String(l.amount), baseline: l.amount, recorded: l.recorded,
  }))
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

/**
 * R10 — a revised amount cannot fall below what partial records already took
 * against the line. Refused inline, naming the amount already charged.
 */
const belowChargedLines = computed(() =>
  costLines.value.filter(l => !l.isNew && (l.recorded ?? 0) > 0 && costAmount(l) < (l.recorded ?? 0)))

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

// ── R7: increase only, always with a reason ───────────────────────────────────

const reason = ref('')

const outputNumber = computed(() => {
  const n = Number(outputQty.value)
  return Number.isFinite(n) ? n : (wo.value?.plannedQty ?? 0)
})

/** Revised or added cost lines — changes the reason must also explain. */
const costChanges = computed(() =>
  costLines.value
    .filter(l => l.isNew ? costAmount(l) > 0 : costAmount(l) !== l.baseline)
    .map(l => ({
      key: l.id, from: l.isNew ? 0 : l.baseline, to: costAmount(l),
      ...(l.isNew ? { newLine: { name: l.name.trim(), costDriver: l.driver } } : {}),
    })))

const adjustment = computed(() => evaluateSubconAdjustment({
  currentOutput: wo.value?.plannedQty ?? 0,
  newOutput: outputNumber.value,
  components: components.value.map(r => ({
    sku: r.sku, name: r.product, unit: unitFor(r), current: r.planned, next: qtyOf(r),
  })),
  otherChanges: costChanges.value.length,
  reason: reason.value,
}))
const outputLowerIssue = computed(() =>
  adjustment.value.issues.find(i => i.kind === 'output-lower') as { current: number } | undefined)
const reasonMissing = computed(() => adjustment.value.issues.some(i => i.kind === 'reason-missing'))

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
/** The store refused what the form accepted — shown inline, never as a toast. */
const saveRefused = ref(false)

function onSave() {
  attempted.value = true
  // Errors surface inline on the offending rows, never as a toast.
  if (blockedRows.value.length || incompleteNewLines.value.length || belowChargedLines.value.length || outputLowerIssue.value || reasonMissing.value) return

  const w = wo.value
  const c = subcon.value
  if (!w || !c) return

  // Everything goes through the store in one write: it applies the same
  // increase-only, reason and charged-floor rules, records the previous figure,
  // the new one and the reason, and only then re-derives the next step. Nothing is
  // written if any rule refuses, so the history never lists a change that did not
  // happen.
  const applied = applySubconAdjustment(w.id, {
    outputQty: outputNumber.value,
    components: Object.fromEntries(components.value.map(r => [r.sku, qtyOf(r)])),
    costChanges: costChanges.value,
    reason: reason.value,
  })
  saveRefused.value = !applied
  if (!applied) return

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

      <!-- ── Product components ──
           Absent on a Basic order: the vendor sources every component from its
           own stock, so there is no quantity of ours to revise and the three
           adjustment outcomes below have nothing to act on. -->
      <section v-if="!subconIsBasic" class="awo-section">
        <h2 class="awo-section-title">{{ t('Product components') }}</h2>
        <div class="awo-scroll">
          <table class="awo-table">
            <thead>
              <tr>
                <th class="awo-th">{{ t('Product name') }}</th>
                <th class="awo-th">{{ t('Product code / SKU') }}</th>
                <th class="awo-th awo-th--num">{{ t('Unit buy price') }}</th>
                <th class="awo-th">{{ t('Warehouse') }}</th>
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
                        {{ t('more than the vendor holds, so supply returns as the next step for the difference.') }}
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
                <th class="awo-th">{{ t('Unit') }}</th>
                <th class="awo-th">{{ t('Account mapping') }}</th>
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
                <td class="awo-td">{{ line.mapping }}</td>
                <td class="awo-td awo-td--num">
                  <MpInput
                    :id="`awo-cost-${line.id}`" v-model="line.draft" type="number" min="0" class="awo-qty"
                    :is-invalid="attempted && ((line.isNew && costAmount(line) <= 0) || belowChargedLines.some(b => b.id === line.id))"
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
                <th class="awo-th">{{ t('Warehouse') }}</th>
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
                  <MpInput id="awo-output-qty" v-model="outputQty" type="number" min="1" class="awo-qty" :is-invalid="attempted && !!outputLowerIssue" />
                </td>
                <td class="awo-td">{{ bom?.finishedGoodUnit ?? '' }}</td>
                <td class="awo-td awo-td--num">{{ formatIDR(processTotal) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <!-- ── Reason — required for every adjustment (R7) ── -->
      <section class="awo-section">
        <h2 class="awo-section-title">{{ t('Reason') }}</h2>
        <MpTextarea
          id="awo-reason" v-model="reason" is-full-width :rows="2"
          :placeholder="t('Why is this order being adjusted?')"
          :is-invalid="attempted && reasonMissing"
        />
        <p v-if="attempted && reasonMissing" class="awo-blocked">{{ t('Give a reason for this adjustment.') }}</p>
      </section>

      <!-- ── Totals ── -->
      <section class="awo-section awo-section--totals">
        <div class="awo-total-row"><span>{{ t('Estimated subtotal of product component prices') }}</span><span>{{ formatIDR(componentsSubtotal) }}</span></div>
        <div class="awo-total-row"><span>{{ t('Subtotal subcon cost') }}</span><span>{{ formatIDR(subconSubtotal) }}</span></div>
        <div class="awo-total-row awo-total-row--grand"><span>{{ t('Estimated total of production process cost') }}</span><span>{{ formatIDR(processTotal) }}</span></div>
        <div class="awo-total-row"><span>{{ t('Estimated main output price per unit') }}</span><span>{{ formatIDR(Math.round(perUnit)) }}</span></div>
      </section>

      <p v-if="attempted && blockedRows.length" class="awo-blocked">
        {{ t('Quantities can only be increased. Fix the highlighted quantities before saving.') }}
      </p>
      <p v-if="attempted && outputLowerIssue" class="awo-blocked">
        {{ t('Planned output cannot be lower than the current') }} {{ outputLowerIssue.current.toLocaleString('id-ID') }}.
      </p>
      <p v-if="attempted && belowChargedLines.length" class="awo-blocked">
        <template v-for="l in belowChargedLines" :key="l.id">
          {{ l.name }}: {{ t('cannot be lower than the') }} {{ formatIDR(l.recorded ?? 0) }} {{ t('already charged.') }}
        </template>
      </p>
      <p v-if="saveRefused" class="awo-blocked">
        {{ t('This adjustment could not be saved. Check the quantities and amounts, then try again.') }}
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
