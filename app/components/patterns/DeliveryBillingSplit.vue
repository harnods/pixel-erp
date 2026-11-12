<script setup lang="ts">
/**
 * DeliveryBillingSplit — "Billing per delivery" on the sales invoice form when it
 * bills sales deliveries (PRD Partial & Progress Invoicing, Rule 5 / F-07).
 *
 * Shows, per ticked delivery (oldest CREATED first — the plan is already sorted),
 * what this invoice bills from each of its lines. "Oldest delivery first" renders
 * the engine's split read-only; "Set per delivery" turns Bill now into an input
 * per delivery per product. Pure presentation: it renders `planBilling()` output
 * and emits a NEW manual grid on every edit — it never writes a store and never
 * computes billing itself.
 *
 * Table markup follows docs/patterns/FormTable.md (40px editable rows, the cell
 * owns the focus/error ring, MpTooltip explains a cell error).
 */
import { computed } from 'vue'
import { MpFormControl, MpFormLabel, MpInput, MpInputGroup, MpInputRightAddon, MpTooltip } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpStatusBadge from '~/components/patterns/ErpStatusBadge.vue'
import { formatIDR } from '~/utils/currency'
import { formatDate } from '~/utils/date'
import { qtyText, type BillingPlan, type PlanCell, type PlanDelivery, type PlanLine, type SplitMode } from '~/data/deliveryBilling'

type ManualGrid = Record<string, Record<number, number>>

const props = defineProps<{
  plan: BillingPlan
  split: SplitMode
  manual: ManualGrid
}>()

const emit = defineEmits<{
  (e: 'update:split', v: SplitMode): void
  (e: 'update:manual', v: ManualGrid): void
}>()

const { t } = useLocale()

const splitOptions = computed(() => [
  { value: 'auto', label: t('Oldest delivery first') },
  { value: 'manual', label: t('Set per delivery') },
])

const isManual = computed(() => props.split === 'manual')

/** Product name / unit for a cell come from the plan's order lines. */
const lineByIndex = computed(() => new Map<number, PlanLine>(props.plan.lines.map((l) => [l.orderLineIndex, l])))
const lineOf = (c: PlanCell) => lineByIndex.value.get(c.orderLineIndex)
const unitOf = (c: PlanCell) => lineOf(c)?.unit ?? ''
const qtyUnit = (n: number, c: PlanCell) => `${qtyText(n)} ${unitOf(c)}`.trim()

/** The outcome hint on each group header (ErpStatusBadge colours). */
function outcome(d: PlanDelivery): { status: string; type: 'completed' | 'warning' | 'announcement'; label: string } {
  if (d.clears) return { status: 'invoiced', type: 'completed', label: t('Fully billed after this invoice') }
  if (d.goodsNow > 0) return { status: 'partially invoiced', type: 'warning', label: t('Partly billed') }
  return { status: 'unbilled', type: 'announcement', label: t('Not billed on this invoice') }
}

/** Manual mode shows what the user typed (falls back to the seeded split). */
function manualValue(c: PlanCell): number {
  return props.manual[c.deliveryId]?.[c.orderLineIndex] ?? c.billNow
}

/** One cell changed — emit a fresh grid; the prop is never mutated. */
function setCell(c: PlanCell, v: unknown) {
  const n = Number(v)
  const value = Number.isFinite(n) ? n : 0
  const next: ManualGrid = { ...props.manual }
  next[c.deliveryId] = { ...(props.manual[c.deliveryId] ?? {}), [c.orderLineIndex]: value }
  emit('update:manual', next)
}

function onSplit(v: string) {
  if (v === 'auto' || v === 'manual') emit('update:split', v)
}

const overCapLabel = (c: PlanCell) => `${t('Max')} ${qtyUnit(c.available, c)} ${t('on this delivery')}`
const discountText = (n: number) => formatIDR(Math.round(n) > 0 ? -Math.round(n) : 0)
</script>

<template>
  <section v-if="plan.deliveries.length" class="dbs" data-devchange="si-billing-per-delivery">
    <div class="dbs-head">
      <h3 class="dbs-title">{{ t('Billing per delivery') }}</h3>
      <MpFormControl id="f-billing-split" class="dbs-split">
        <MpFormLabel>{{ t('Split') }}</MpFormLabel>
        <ErpFilterSelect
          id="dbs-split"
          :model-value="split"
          :options="splitOptions"
          :placeholder="t('Split')"
          :is-clearable="false"
          width="240px"
          @update:model-value="onSplit"
        />
        <span class="dbs-caption">
          {{ isManual ? t('Enter the quantity to bill from each delivery.') : t('Deliveries are used in the order they were created.') }}
        </span>
      </MpFormControl>
    </div>

    <div class="dbs-scroll">
      <table class="dbs-table">
        <colgroup>
          <col class="dbs-col-product" />
          <col class="dbs-col-num" />
          <col class="dbs-col-num" />
          <col class="dbs-col-now" />
          <col class="dbs-col-num" />
          <col class="dbs-col-amount" />
        </colgroup>
        <thead>
          <tr>
            <th class="dbs-th">{{ t('Product') }}</th>
            <th class="dbs-th dbs-th--num">{{ t('Delivered') }}</th>
            <th class="dbs-th dbs-th--num">{{ t('Billed before') }}</th>
            <th class="dbs-th dbs-th--num">{{ t('Bill now') }}</th>
            <th class="dbs-th dbs-th--num">{{ t('Left to bill') }}</th>
            <th class="dbs-th dbs-th--num">{{ t('Amount now') }}</th>
          </tr>
        </thead>
        <tbody v-for="d in plan.deliveries" :key="d.deliveryId" class="dbs-group" :data-delivery-id="d.deliveryId">
          <tr>
            <td class="dbs-td dbs-td--group" colspan="6">
              <div class="dbs-group-row">
                <span class="dbs-group-name">
                  {{ t('Sales Delivery') }} #{{ d.number }}
                  <span class="dbs-group-date">· {{ formatDate(d.date) }}</span>
                </span>
                <ErpStatusBadge :status="outcome(d).status" :type="outcome(d).type" :label="outcome(d).label" />
              </div>
            </td>
          </tr>

          <tr v-for="c in d.cells" :key="`${d.deliveryId}-${c.orderLineIndex}`" class="dbs-tr">
            <td class="dbs-td dbs-td--border dbs-td--product">
              <span class="dbs-ellipsis" :title="lineOf(c)?.product">{{ lineOf(c)?.product ?? '-' }}</span>
            </td>
            <td class="dbs-td dbs-td--border dbs-td--calc dbs-td--num">{{ qtyUnit(c.delivered, c) }}</td>
            <td class="dbs-td dbs-td--border dbs-td--calc dbs-td--num">{{ qtyUnit(c.billedBefore, c) }}</td>

            <td
              v-if="isManual"
              class="dbs-td dbs-td--border dbs-td--input"
              :class="{ 'dbs-td--error': c.overCap }"
            >
              <MpTooltip
                v-if="c.overCap"
                :id="`dbs-cap-tt-${d.deliveryId}-${c.orderLineIndex}`"
                :label="overCapLabel(c)"
                placement="top"
                use-portal
                class="dbs-error-tooltip-wrap"
              >
                <MpInputGroup :id="`f-dbs-group-${d.deliveryId}-${c.orderLineIndex}`" is-full-width>
                  <MpInput
                    :id="`f-dbs-${d.deliveryId}-${c.orderLineIndex}`"
                    type="number"
                    :model-value="manualValue(c)"
                    is-full-width
                    :is-invalid="true"
                    @update:model-value="(v) => setCell(c, v)"
                  />
                  <MpInputRightAddon has-background>{{ unitOf(c) }}</MpInputRightAddon>
                </MpInputGroup>
              </MpTooltip>
              <MpInputGroup v-else :id="`f-dbs-group-${d.deliveryId}-${c.orderLineIndex}`" is-full-width>
                <MpInput
                  :id="`f-dbs-${d.deliveryId}-${c.orderLineIndex}`"
                  type="number"
                  :model-value="manualValue(c)"
                  is-full-width
                  @update:model-value="(v) => setCell(c, v)"
                />
                <MpInputRightAddon has-background>{{ unitOf(c) }}</MpInputRightAddon>
              </MpInputGroup>
            </td>
            <td v-else class="dbs-td dbs-td--border dbs-td--calc dbs-td--num dbs-td--now">{{ qtyUnit(c.billNow, c) }}</td>

            <td class="dbs-td dbs-td--border dbs-td--calc dbs-td--num">{{ qtyUnit(c.leftAfter, c) }}</td>
            <td class="dbs-td dbs-td--calc dbs-td--num">{{ formatIDR(Math.round(c.goodsNow)) }}</td>
          </tr>

          <tr class="dbs-foot dbs-foot--first">
            <td class="dbs-foot-label" colspan="5">{{ t('Discount (prorated)') }}</td>
            <td class="dbs-foot-value">{{ discountText(d.discountNow) }}</td>
          </tr>
          <tr class="dbs-foot">
            <td class="dbs-foot-label" colspan="5">{{ t('Shipping fee') }}</td>
            <td class="dbs-foot-value">{{ formatIDR(Math.round(d.shippingNow)) }}</td>
          </tr>
          <tr class="dbs-foot dbs-foot--last">
            <td class="dbs-foot-label" colspan="5">{{ t('Left to bill on this delivery') }}</td>
            <td class="dbs-foot-value">{{ formatIDR(Math.round(d.leftAfter)) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.dbs { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }

/* Title, then the Split field — a form field (label above), like the SD form's
   Input method block. */
.dbs-head { display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.dbs-title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg);
  line-height: var(--mp-line-heights-lg);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.dbs-split { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.dbs-caption {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
}

.dbs-scroll { overflow-x: auto; }
.dbs-table {
  width: 100%;
  min-width: 960px;
  table-layout: fixed;
  border-collapse: collapse;
  border-spacing: 0;
}
.dbs-col-product { width: auto; }
.dbs-col-num { width: 144px; }
.dbs-col-now { width: 176px; }
.dbs-col-amount { width: 164px; }

.dbs-th {
  height: var(--mp-sizes-7);
  text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase;
  letter-spacing: var(--mp-letter-spacings-normal);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.dbs-th--num { text-align: right; }

/* 40px rows — the editable cell's control fills the row (FormTable.md). */
.dbs-td {
  height: var(--mp-sizes-10);
  padding: 0 var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: middle;
}
.dbs-td--border { border-right: 1px solid var(--mp-border-default); }
.dbs-td--num {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.dbs-td--product { max-width: 0; }
.dbs-ellipsis { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
/* Calculated cells read as locked (rule/table-bg-white exception, as on the SD form). */
.dbs-td--calc { background: var(--mp-background-neutral-strong); }

/* Group header — one row per delivery, spanning every column. */
.dbs-td--group { background: var(--mp-background-neutral-subtle); }
.dbs-group-row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); }
.dbs-group-name { font-weight: var(--mp-font-weights-semi-bold); }
.dbs-group-date { font-weight: var(--mp-font-weights-regular); color: var(--mp-text-secondary); }

/* Editable Bill now — the cell is the field; the input is borderless inside. */
.dbs-td--input {
  padding: 0;
  position: relative;
  background: var(--mp-background-neutral);
}
.dbs-td--input :deep([class*='input']) { border-radius: 0; border-color: transparent; }
.dbs-td--input :deep(.mp-input__root) { height: var(--mp-sizes-10); background: transparent; }
.dbs-td--input :deep(.mp-input__control) {
  height: var(--mp-sizes-10);
  min-width: 0;
  width: 100%;
  border: none;
  border-radius: 0;
  background: transparent;
  text-align: right;
  font-variant-numeric: tabular-nums;
  box-shadow: var(--mp-shadows-none, none); /* pixel-police-allow-shadow: removing the default shadow */
}
.dbs-td--input:focus-within::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  box-shadow: inset 0 0 0 2px var(--mp-border-focused); /* pixel-police-allow-shadow: focus ring over collapsed borders */
}

/* Cell over its delivery's cap — tint + red underline + tooltip (as .si-td--error). */
.dbs-td--error {
  /* Same values as NewSalesInvoicePage .si-td--error — the tokens resolve only with their fallbacks here. */
  background: var(--mp-background-danger-subtle, #fef2f2);
  box-shadow: inset 0 -1px 0 0 var(--mp-border-danger, #dc2626); /* pixel-police-allow-shadow: inset error underline */
}
.dbs-td--error :deep([class*='input']) { background: transparent; }
.dbs-error-tooltip-wrap { display: block; width: 100%; }
.dbs-error-tooltip-wrap :deep([class*='tooltip__trigger']) { display: block; width: 100%; }

/* Group footer — caption rows, value under the Amount now column. */
.dbs-foot-label,
.dbs-foot-value {
  padding: var(--mp-spacing-0\.5) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm);
  color: var(--mp-text-secondary);
  text-align: right;
}
.dbs-foot-value { font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--mp-text-default); }
.dbs-foot--first > td { padding-top: var(--mp-spacing-2); }
.dbs-foot--last > td { padding-bottom: var(--mp-spacing-4); }
</style>
