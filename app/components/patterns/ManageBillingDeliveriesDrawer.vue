<script setup lang="ts">
/**
 * ManageBillingDeliveriesDrawer — "Manage deliveries" for ONE sales invoice line
 * that bills sales deliveries (PRD Partial & Progress Invoicing, F-07).
 *
 * By default a line bills its ticked deliveries oldest created first (Rule 5).
 * When the line bills less than everything left, the user can choose instead how
 * much comes from each ticked delivery — e.g. the BAST names Sales Delivery #106.
 * Same idea as Manage batch on the work order: one row per source, type a qty.
 *
 * Edits a local draft; commits to the parent only on Save (rule/drawer-custom-shell
 * via ErpDrawer, rule/modal-drawer-close-explicit-only). Save is never disabled —
 * a row above what is left on its delivery is flagged inline on Save
 * (rule/btn-no-disabled-validation, rule/form-errors-inline).
 */
import { computed, ref, watch } from 'vue'
import { MpButton, MpInput, MpInputGroup, MpInputRightAddon, MpTooltip } from '@mekari/pixel3'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import { formatDate } from '~/utils/date'
import { QTY_EPS, pctText, qtyText, trunc6, type BillingPlan, type PlanLine } from '~/data/deliveryBilling'

const props = defineProps<{
  isOpen: boolean
  plan: BillingPlan
  /** The line being managed (null while closed). */
  line: PlanLine | null
}>()

const emit = defineEmits<{
  close: []
  /** deliveryId -> qty billed now from that delivery, for this line. */
  save: [pick: Record<string, number>]
}>()

const { t } = useLocale()

interface Row { deliveryId: string; number: number; date: string; delivered: number; billedBefore: number; available: number }

/** One row per ticked delivery that delivered this line — oldest created first (plan order). */
const rows = computed<Row[]>(() => {
  const l = props.line
  if (!l) return []
  return props.plan.deliveries.flatMap((d) => {
    const c = d.cells.find(x => x.orderLineIndex === l.orderLineIndex)
    if (!c || c.delivered <= 0) return []
    return [{ deliveryId: d.deliveryId, number: d.number, date: d.date, delivered: c.delivered, billedBefore: c.billedBefore, available: c.available }]
  })
})

const draft = ref<Record<string, string>>({})
const saveTried = ref(false)

// Re-sync the draft from the current split every time the drawer opens.
watch(() => props.isOpen, (open) => {
  if (!open || !props.line) return
  const idx = props.line.orderLineIndex
  const next: Record<string, string> = {}
  for (const d of props.plan.deliveries) {
    const c = d.cells.find(x => x.orderLineIndex === idx)
    if (c && c.delivered > 0) next[d.deliveryId] = c.billNow > QTY_EPS ? String(c.billNow) : ''
  }
  draft.value = next
  saveTried.value = false
}, { immediate: true })

const num = (v: string | undefined) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : 0
}
const total = computed(() => rows.value.reduce((s, r) => s + num(draft.value[r.deliveryId]), 0))
const totalPct = computed(() => (props.line && props.line.orderedQty > 0 ? total.value / props.line.orderedQty * 100 : 0))
const isOver = (r: Row) => num(draft.value[r.deliveryId]) > r.available + QTY_EPS
const overRows = computed(() => rows.value.filter(isOver))

const unit = computed(() => props.line?.unit ?? '')
const qtyUnit = (n: number) => `${qtyText(n)} ${unit.value}`.trim()
const overLabel = (r: Row) => `${t('Max')} ${qtyUnit(r.available)} ${t('on this delivery')}`

function setRow(r: Row, v: unknown) {
  draft.value = { ...draft.value, [r.deliveryId]: v === null || v === undefined ? '' : String(v) }
}

function save() {
  saveTried.value = true
  if (overRows.value.length) return
  const pick: Record<string, number> = {}
  for (const r of rows.value) pick[r.deliveryId] = trunc6(num(draft.value[r.deliveryId]))
  emit('save', pick)
}
</script>

<template>
  <ErpDrawer :is-open="isOpen" :title="t('Manage deliveries')" width="760px" @close="emit('close')">
    <template #body>
      <div v-if="line" class="mbd" data-devchange="si-manage-deliveries-drawer">
        <div class="mbd-info">
          <div class="mbd-info-names">
            <span class="mbd-info-name">{{ line.product }}</span>
            <span class="mbd-info-sku">{{ line.sku }}</span>
          </div>
          <div class="mbd-stats">
            <div class="mbd-stat">
              <span class="mbd-stat-label">{{ t('Qty ordered') }}</span>
              <span class="mbd-stat-value">{{ qtyUnit(line.orderedQty) }}</span>
            </div>
            <div class="mbd-stat">
              <span class="mbd-stat-label">{{ t('Left to bill') }}</span>
              <span class="mbd-stat-value">{{ qtyUnit(line.maxQty) }}</span>
            </div>
            <div class="mbd-stat">
              <span class="mbd-stat-label">{{ t('Bill now') }}</span>
              <span class="mbd-stat-value" data-testid="mbd-total">
                {{ qtyUnit(total) }}<template v-if="plan.basis === 'percent'"> ({{ pctText(totalPct) }})</template>
              </span>
            </div>
          </div>
        </div>

        <p class="mbd-caption">{{ t('Enter how much to bill from each delivery. Bill now on the line becomes the total.') }}</p>

        <div class="mbd-scroll">
          <table class="mbd-table">
            <colgroup>
              <col />
              <col class="mbd-col-num" />
              <col class="mbd-col-num" />
              <col class="mbd-col-num" />
              <col class="mbd-col-now" />
            </colgroup>
            <thead>
              <tr>
                <th class="mbd-th">{{ t('Sales Delivery') }}</th>
                <th class="mbd-th mbd-th--num">{{ t('Delivered') }}</th>
                <th class="mbd-th mbd-th--num">{{ t('Billed before') }}</th>
                <th class="mbd-th mbd-th--num">{{ t('Left to bill') }}</th>
                <th class="mbd-th mbd-th--num">{{ t('Bill now') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in rows" :key="r.deliveryId" :data-delivery-id="r.deliveryId">
                <td class="mbd-td mbd-td--border mbd-td--calc">
                  #{{ r.number }} <span class="mbd-date">· {{ formatDate(r.date) }}</span>
                </td>
                <td class="mbd-td mbd-td--border mbd-td--calc mbd-td--num">{{ qtyUnit(r.delivered) }}</td>
                <td class="mbd-td mbd-td--border mbd-td--calc mbd-td--num">{{ qtyUnit(r.billedBefore) }}</td>
                <td class="mbd-td mbd-td--border mbd-td--calc mbd-td--num">{{ qtyUnit(r.available) }}</td>
                <td class="mbd-td mbd-td--input" :class="{ 'mbd-td--error': saveTried && isOver(r) }">
                  <MpTooltip
                    v-if="saveTried && isOver(r)" :id="`mbd-cap-tt-${r.deliveryId}`"
                    :label="overLabel(r)" placement="top" use-portal class="mbd-tooltip-wrap"
                  >
                    <MpInputGroup :id="`f-mbd-group-${r.deliveryId}`" is-full-width>
                      <MpInput
                        :id="`f-mbd-${r.deliveryId}`" type="number" placeholder="0" is-full-width :is-invalid="true"
                        :model-value="draft[r.deliveryId] ?? ''" @update:model-value="(v) => setRow(r, v)"
                      />
                      <MpInputRightAddon has-background>{{ unit }}</MpInputRightAddon>
                    </MpInputGroup>
                  </MpTooltip>
                  <MpInputGroup v-else :id="`f-mbd-group-${r.deliveryId}`" is-full-width>
                    <MpInput
                      :id="`f-mbd-${r.deliveryId}`" type="number" placeholder="0" is-full-width
                      :model-value="draft[r.deliveryId] ?? ''" @update:model-value="(v) => setRow(r, v)"
                    />
                    <MpInputRightAddon has-background>{{ unit }}</MpInputRightAddon>
                  </MpInputGroup>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <ul v-if="saveTried && overRows.length" class="mbd-errors" data-testid="mbd-errors">
          <li v-for="r in overRows" :key="r.deliveryId">
            {{ t('Sales Delivery') }} #{{ r.number }}: {{ t('Max') }} {{ qtyUnit(r.available) }}
          </li>
        </ul>
      </div>
    </template>
    <template #footer>
      <span />
      <div class="mbd-footer-right">
        <MpButton id="mbd-cancel" class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="emit('close')">{{ t('Cancel') }}</MpButton>
        <MpButton id="mbd-save" class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="save">{{ t('Save') }}</MpButton>
      </div>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.mbd { display: flex; flex-direction: column; gap: var(--mp-spacing-4); }

.mbd-info {
  display: flex; align-items: center; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.mbd-info-names { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); flex: 1; min-width: 0; }
.mbd-info-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mbd-info-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.mbd-stats { display: flex; gap: var(--mp-spacing-6); }
.mbd-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.mbd-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.mbd-stat-value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; white-space: nowrap; }

.mbd-caption { margin: 0; font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); color: var(--mp-text-secondary); }

.mbd-scroll { overflow-x: auto; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); }
.mbd-table { width: 100%; min-width: 640px; table-layout: fixed; border-collapse: collapse; border-spacing: 0; }
.mbd-col-num { width: 120px; }
.mbd-col-now { width: 160px; }

.mbd-th {
  height: var(--mp-sizes-7);
  text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral);
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase;
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.mbd-th--num { text-align: right; }

.mbd-td {
  height: var(--mp-sizes-10);
  padding: 0 var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: middle;
}
tbody tr:last-child .mbd-td { border-bottom: none; }
.mbd-td--border { border-right: 1px solid var(--mp-border-default); }
.mbd-td--num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.mbd-td--calc { background: var(--mp-background-neutral-strong); }
.mbd-date { color: var(--mp-text-secondary); }

/* Editable Bill now — the cell is the field (FormTable.md). */
.mbd-td--input { padding: 0; position: relative; background: var(--mp-background-neutral); }
.mbd-td--input :deep([class*='input']) { border-radius: 0; border-color: transparent; }
.mbd-td--input :deep(.mp-input__root) { height: var(--mp-sizes-10); background: transparent; }
.mbd-td--input :deep(.mp-input__control) {
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
.mbd-td--input:focus-within::after {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  box-shadow: inset 0 0 0 2px var(--mp-border-focused); /* pixel-police-allow-shadow: focus ring over collapsed borders */
}
.mbd-td--error {
  background: var(--mp-background-danger-subtle, #fef2f2);
  box-shadow: inset 0 -1px 0 0 var(--mp-border-danger, #dc2626); /* pixel-police-allow-shadow: inset error underline */
}
.mbd-td--error :deep([class*='input']) { background: transparent; }
.mbd-tooltip-wrap { display: block; width: 100%; }
.mbd-tooltip-wrap :deep([class*='tooltip__trigger']) { display: block; width: 100%; }

.mbd-errors {
  margin: 0;
  padding-left: var(--mp-spacing-5);
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-danger);
}

.mbd-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
