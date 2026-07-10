<script setup lang="ts">
import { computed } from 'vue'
import { MpIcon } from '@mekari/pixel3'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { productBySku } from '~/data/inventory'

const DEMO_DESCS = [
  'Ethiopia Yirgacheffe, Grade 1, washed – harvest 2025',
  'Colombia Huila, natural process, lot #COL-25A',
  'Medium roast, 3-day degassing – roasted Jun 2025',
  'Single origin, certified organic, lot #B12',
]

export interface PickedBatchRow { batchNo: string; expiryDate: string; desc: string; qty: number; unit: string }

const props = defineProps<{
  open: boolean
  sku: string
  warehouseId: string
  /** 'count' = stock count (show Counted qty). 'in-out' = stock in/out (show delta + new on-hand).
   *  'packing' = read-only list of batches picked for this line (no on-hand/location). */
  kind?: 'count' | 'in-out' | 'packing'
  /** Stock count mode: the total counted qty for this SKU. */
  countedTotal?: number
  /** Stock in/out mode: the total delta (positive = in, negative = out). */
  deltaTotal?: number
  /** Packing mode: the exact batches picked for this line — shown as-is, no derivation. */
  pickedBatches?: PickedBatchRow[]
  /** Packing mode: label for the qty stat + table column — defaults to "Picked qty".
   *  Callers downstream of picking (packing, delivery, ...) pass their own word for it
   *  ("Packed qty", ...) since it's the same numbers, just a different stage's name. */
  qtyLabel?: string
  /** Packing mode: the SKU's full order demand, shown as an extra stat when given
   *  (e.g. delivery wants "Order qty" next to "Packed qty"; picking doesn't need it
   *  here since it already shows separately). */
  orderQty?: number
  productName: string
  productImg: string
}>()

const emit = defineEmits<{ 'update:open': [boolean] }>()
const qtyLabel = computed(() => props.qtyLabel ?? 'Picked qty')

const isInOut = computed(() => props.kind === 'in-out')
const isPacking = computed(() => props.kind === 'packing')

const warehouseStock = computed(() => {
  const wh = getWarehouseDetail(props.warehouseId)
  return wh?.stock.find(s => s.sku === props.sku)
})

interface BatchRow {
  batchNo: string
  expiryDate: string
  desc: string
  onHand: number
  value: number      // counted qty (count mode) OR delta (in-out mode)
  newOnHand: number  // only used in in-out mode
  unit: string
}

const rows = computed<BatchRow[]>(() => {
  // Packing: show the exact batches picked for this line, as-is — no derivation
  // from live warehouse stock, no on-hand/new-on-hand concept.
  if (isPacking.value) {
    return (props.pickedBatches ?? []).map((b, i) => ({
      batchNo: b.batchNo, expiryDate: b.expiryDate, desc: b.desc || DEMO_DESCS[i % DEMO_DESCS.length]!,
      onHand: 0, value: b.qty, newOnHand: 0, unit: b.unit,
    }))
  }

  const batches = warehouseStock.value?.batches ?? []
  const unit = warehouseStock.value?.unit ?? productBySku(props.sku)?.unit ?? ''
  const totalOnHand = batches.reduce((s, b) => s + b.onHand, 0)

  if (isInOut.value) {
    const totalDelta = props.deltaTotal ?? 0
    return batches.map((b, i) => {
      const delta = totalOnHand > 0 ? Math.round((b.onHand / totalOnHand) * totalDelta) : 0
      return {
        batchNo: b.batchNo,
        expiryDate: b.expiryDate,
        desc: DEMO_DESCS[i % DEMO_DESCS.length]!,
        onHand: b.onHand,
        value: delta,
        newOnHand: b.onHand + delta,
        unit,
      }
    })
  }

  // count mode
  const counted = props.countedTotal ?? 0
  return batches.map((b, i) => ({
    batchNo: b.batchNo,
    expiryDate: b.expiryDate,
    desc: DEMO_DESCS[i % DEMO_DESCS.length]!,
    onHand: b.onHand,
    value: totalOnHand > 0 ? Math.round((b.onHand / totalOnHand) * counted) : 0,
    newOnHand: 0,
    unit,
  }))
})

const totalOnHand = computed(() => rows.value.reduce((s, r) => s + r.onHand, 0))
const totalPicked = computed(() => rows.value.reduce((s, r) => s + r.value, 0))
const totalDelta = computed(() => props.deltaTotal ?? 0)
const totalCounted = computed(() => props.countedTotal ?? 0)
const totalNewOnHand = computed(() => totalOnHand.value + totalDelta.value)
const difference = computed(() => totalCounted.value - totalOnHand.value)

function fmt(n: number) { return n.toLocaleString('id-ID') }
function fmtDelta(n: number) { return n > 0 ? `+${fmt(n)}` : fmt(n) }
function fmtDiff(n: number) { return n > 0 ? `+${fmt(n)}` : fmt(n) }
function isoToDisplay(iso: string): string {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function close() { emit('update:open', false) }
</script>

<template>
  <Transition name="vbd">
  <div v-if="open" class="vbd-overlay" @click.self="close">
    <div class="vbd-panel" role="dialog" aria-label="View batch">

      <header class="vbd-header">
        <h2 class="vbd-title">Batch detail</h2>
        <button class="vbd-close" type="button" aria-label="Close" @click="close">
          <MpIcon name="close" size="md" />
        </button>
      </header>

      <div class="vbd-content">

        <!-- Product info bar -->
        <div class="vbd-info-bar">
          <div class="vbd-info-product">
            <img v-if="productImg" class="vbd-info-thumb" :src="productImg" :alt="productName" loading="lazy" />
            <span v-else class="vbd-info-thumb vbd-info-thumb--empty" />
            <div class="vbd-info-names">
              <span class="vbd-info-name">{{ productName }}</span>
              <span class="vbd-info-sku">{{ sku }}</span>
            </div>
          </div>
          <div class="vbd-info-stats">
            <!-- packing mode stats -->
            <template v-if="isPacking">
              <div v-if="orderQty !== undefined" class="vbd-stat">
                <span class="vbd-stat-label">Order qty</span>
                <span class="vbd-stat-value">{{ fmt(orderQty) }}</span>
              </div>
              <div class="vbd-stat">
                <span class="vbd-stat-label">{{ qtyLabel }}</span>
                <span class="vbd-stat-value">{{ fmt(totalPicked) }}</span>
              </div>
            </template>
            <template v-else>
              <div class="vbd-stat">
                <span class="vbd-stat-label">On hand qty</span>
                <span class="vbd-stat-value">{{ fmt(totalOnHand) }}</span>
              </div>
              <!-- count mode stats -->
              <template v-if="!isInOut">
                <div class="vbd-stat">
                  <span class="vbd-stat-label">Counted qty</span>
                  <span class="vbd-stat-value">{{ fmt(totalCounted) }}</span>
                </div>
                <div class="vbd-stat" :class="{ 'vbd-stat--pos': difference > 0, 'vbd-stat--neg': difference < 0 }">
                  <span class="vbd-stat-label">Difference</span>
                  <span class="vbd-stat-value">{{ fmtDiff(difference) }}</span>
                </div>
              </template>
              <!-- in-out mode stats -->
              <template v-else>
                <div class="vbd-stat" :class="{ 'vbd-stat--pos': totalDelta > 0, 'vbd-stat--neg': totalDelta < 0 }">
                  <span class="vbd-stat-label">Stock in/out qty</span>
                  <span class="vbd-stat-value">{{ fmtDelta(totalDelta) }}</span>
                </div>
                <div class="vbd-stat">
                  <span class="vbd-stat-label">New on hand qty</span>
                  <span class="vbd-stat-value">{{ fmt(totalNewOnHand) }}</span>
                </div>
              </template>
            </template>
          </div>
        </div>

        <!-- Table -->
        <div class="vbd-table-wrap">
          <table class="vbd-table">
            <colgroup>
              <col class="vbd-col-batch" />
              <col class="vbd-col-expiry" />
              <col class="vbd-col-desc" />
              <col v-if="!isPacking" class="vbd-col-num" />
              <col class="vbd-col-num" />
              <template v-if="isInOut"><col class="vbd-col-num" /></template>
              <col class="vbd-col-unit" />
            </colgroup>
            <thead>
              <tr>
                <th class="vbd-th">Batch</th>
                <th class="vbd-th">Expiry date</th>
                <th class="vbd-th">Description</th>
                <th v-if="!isPacking" class="vbd-th vbd-th--num">On hand qty</th>
                <th v-if="isPacking" class="vbd-th vbd-th--num">{{ qtyLabel }}</th>
                <th v-else-if="!isInOut" class="vbd-th vbd-th--num">Counted qty</th>
                <template v-else>
                  <th class="vbd-th vbd-th--num">Stock in/out qty</th>
                  <th class="vbd-th vbd-th--num">New on hand qty</th>
                </template>
                <th class="vbd-th">Unit</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.batchNo" class="vbd-tr">
                <td class="vbd-td vbd-td--muted">{{ row.batchNo }}</td>
                <td class="vbd-td vbd-td--muted">{{ isoToDisplay(row.expiryDate) }}</td>
                <td class="vbd-td vbd-td--muted">{{ row.desc }}</td>
                <td v-if="!isPacking" class="vbd-td vbd-td--num vbd-td--muted">{{ fmt(row.onHand) }}</td>
                <td v-if="isPacking || !isInOut" class="vbd-td vbd-td--num">{{ fmt(row.value) }}</td>
                <template v-else>
                  <td class="vbd-td vbd-td--num" :class="{ 'vbd-diff--pos': row.value > 0, 'vbd-diff--neg': row.value < 0 }">
                    {{ fmtDelta(row.value) }}
                  </td>
                  <td class="vbd-td vbd-td--num">{{ fmt(row.newOnHand) }}</td>
                </template>
                <td class="vbd-td vbd-td--muted">{{ row.unit }}</td>
              </tr>
              <tr v-if="!rows.length" class="vbd-tr">
                <td :colspan="isPacking ? 5 : (isInOut ? 7 : 6)" class="vbd-td vbd-td--empty">No batch data available.</td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>

    </div>
  </div>
  </Transition>
</template>

<style scoped>
.vbd-enter-active,
.vbd-leave-active { transition: background-color 250ms ease; }
.vbd-enter-from, .vbd-leave-to { background-color: transparent; }
.vbd-enter-active :deep(.vbd-panel) { transition: transform 350ms ease-out; }
.vbd-leave-active :deep(.vbd-panel)  { transition: transform 250ms ease-in; }
.vbd-enter-from :deep(.vbd-panel),
.vbd-leave-to :deep(.vbd-panel) { transform: translateX(calc(100% + 12px)); }

.vbd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.vbd-panel {
  margin: var(--mp-spacing-3);
  width: min(900px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
}

.vbd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.vbd-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-default); }
.vbd-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.vbd-close:hover { background: var(--mp-background-neutral-hovered); }

.vbd-content {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: 20px;
}
.vbd-content > * { flex-shrink: 0; }

.vbd-info-bar {
  display: flex; align-items: center; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.vbd-info-product { display: flex; align-items: center; gap: var(--mp-spacing-3); flex: 1; min-width: 0; }
.vbd-info-thumb {
  width: 40px; height: 40px; border-radius: var(--mp-radii-md);
  object-fit: cover; flex-shrink: 0;
  border: 1px solid var(--mp-border-subtle);
  background: var(--mp-background-neutral);
}
.vbd-info-thumb--empty { background: var(--mp-background-neutral-subtle); }
.vbd-info-names { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.vbd-info-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vbd-info-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.vbd-info-stats { display: flex; gap: var(--mp-spacing-6); flex-shrink: 0; }
.vbd-stat { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }
.vbd-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.vbd-stat-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; font-weight: var(--mp-font-weights-medium); }
.vbd-stat--pos .vbd-stat-value { color: var(--mp-text-success, #18794e); }
.vbd-stat--neg .vbd-stat-value { color: var(--mp-text-danger, #a8352d); }

.vbd-table-wrap {
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  overflow: hidden;
  overflow-x: auto;
}
.vbd-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; }
.vbd-col-batch   { width: 170px; }
.vbd-col-expiry  { width: 140px; }
.vbd-col-desc    { /* flexible */ }
.vbd-col-num     { width: 120px; }
.vbd-col-unit    { width: 78px; }

.vbd-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.vbd-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }

.vbd-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: top;
  background: var(--mp-background-neutral, #fff);
}
.vbd-td--muted { color: var(--mp-text-secondary); }
.vbd-td--num { text-align: right; white-space: nowrap; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
.vbd-td--empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-6); }
.vbd-diff--pos { color: var(--mp-text-success, #18794e); }
.vbd-diff--neg { color: var(--mp-text-danger, #a8352d); }

</style>
