<script setup lang="ts">
import { computed } from 'vue'
import { MpIcon } from '@mekari/pixel3'
import ScanBar from '~/components/patterns/ScanBar.vue'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { productBySku } from '~/data/inventory'

const DEMO_DESCS = [
  'Ethiopia Yirgacheffe, Grade 1, washed – harvest 2025',
  'Colombia Huila, natural process, lot #COL-25A',
  'Medium roast, 3-day degassing – roasted Jun 2025',
  'Single origin, certified organic, lot #B12',
]

export interface PickedBatchRow {
  batchNo: string; expiryDate: string; desc: string; qty: number; unit: string
  location?: string
  /** Put-away only — this batch's qty split across 2+ destination bins. When
   *  given (and non-empty), the table shows ONE ROW PER BIN instead of a
   *  single combined row (with `location`/`qty` above ignored in favor of
   *  this) — packing/delivery/picking never split a batch across bins, so
   *  they simply never pass this. */
  destLocations?: { locationId: string; qty: number }[]
}

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
  /** Packing mode: this line's ORIGINAL per-batch reservation plan, frozen at task
   *  creation — distinct from pickedBatches, which becomes the real per-batch result
   *  once anything is actually picked. When given, the table shows both a fixed
   *  "Qty to pick" column (from this) and a "Picked qty"/qtyLabel column (from
   *  pickedBatches) side by side, keyed by batchNo, instead of one relabeled column. */
  plannedBatches?: PickedBatchRow[]
  /** Packing mode: label for the qty stat + table column — defaults to "Picked qty".
   *  Callers downstream of picking (packing, delivery, ...) pass their own word for it
   *  ("Packed qty", ...) since it's the same numbers, just a different stage's name. */
  qtyLabel?: string
  /** Packing mode: the SKU's full order demand, shown as an extra stat when given
   *  (e.g. delivery wants "Order qty" next to "Packed qty"; picking doesn't need it
   *  here since it already shows separately). */
  orderQty?: number
  /** Packing mode: this line's planned/target qty, shown as its own stat (label
   *  below) when given (picking, before it's fully executed — pickedBatches already
   *  reflects the reservation plan, not real progress, so the two need to be told
   *  apart explicitly). */
  qtyToPick?: number
  /** Label for the qtyToPick stat + the "planned"/hasPlanned table column —
   *  defaults to "Qty to pick" (picking). Other stages reuse the exact same
   *  qtyToPick/plannedBatches plumbing under their own name, e.g. delivery's
   *  "Picked qty" shown before "Packed qty". */
  plannedQtyLabel?: string
  /** Packing mode: the REAL picked-so-far qty, overriding the qtyLabel stat's value
   *  (which otherwise sums pickedBatches — accurate once picking is finished, but
   *  wrong while a task is still open/in progress and pickedBatches is just the plan). */
  pickedQty?: number
  /** Packing mode: label for the TABLE's qty column only — defaults to qtyLabel.
   *  Split out from qtyLabel because the two can legitimately differ: e.g. picking
   *  (not yet executed) wants its header stat to say "Picked qty" (real progress,
   *  via pickedQty above) while the table's per-batch breakdown is still just the
   *  plan, so it reads "Qty to pick" instead. */
  tableQtyLabel?: string
  /** Delivery only: units of this line ALREADY shipped by an earlier, independent
   *  picking→packing→shipment cycle for the same order (partially shipped, then
   *  picked/packed/shipped again for the remainder) — shown as its own
   *  "Previously shipped" stat after Packed qty, explaining why Order qty doesn't
   *  match Picked/Packed qty. Only rendered when > 0 — a normal, single-cycle
   *  shipment never shows this stat at all. */
  shippedQty?: number
  /** Put-away only — shows the plannedQtyLabel ("Received qty") column BEFORE
   *  Storage location instead of after. Picking/delivery keep their existing
   *  order (Storage location, then their qty column) since their tests and
   *  layout already depend on that order. */
  qtyBeforeLocation?: boolean
  productName: string
  productImg: string
  /** Packing match-order verify mode: total units scanned/verified so far for
   *  this line. When provided, the drawer shows a scan bar (emits 'scan') and a
   *  "Verified x/y" stat so the operator confirms each batch matches the pick. */
  verifiedQty?: number
  /** Count mode only — hides the On hand qty stat/column (and Difference, which is
   *  derived from it) while a cycle count is still blind — the operator shouldn't
   *  be able to see the system's on-hand record before the count reaches Awaiting
   *  approval, where the reviewing manager needs it. Other kinds never pass this. */
  hideOnHand?: boolean
}>()

const emit = defineEmits<{ 'update:open': [boolean]; scan: [string] }>()
const { t } = useLocale()
function onScan(raw: string) { emit('scan', raw) }
const isVerify = computed(() => props.verifiedQty !== undefined)
const qtyLabel = computed(() => props.qtyLabel ?? 'Picked qty')
const plannedQtyLabel = computed(() => props.plannedQtyLabel ?? 'Qty to pick')
// batchPicks is ONE field, not "plan" + "actual" side by side — endPicking/
// savePickingDraft overwrite it in place with the real result the moment anything
// is actually picked. So callers that want BOTH numbers per batch (picking) pass
// plannedBatches separately — a frozen snapshot taken at task creation, never
// touched by that overwrite — and the table renders two columns keyed by batchNo.
// Callers that don't have/need that distinction (packing, delivery, ...) keep the
// single, dynamically-labeled column as before.
const hasPlanned = computed(() => isPacking.value && props.plannedBatches !== undefined)
const tableQtyLabel = computed(() => {
  if (props.pickedQty !== undefined) return props.pickedQty > 0 ? qtyLabel.value : 'Qty to pick'
  return props.tableQtyLabel ?? qtyLabel.value
})

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
  value: number        // counted qty (count mode), delta (in-out mode), OR picked qty (packing) — THIS ROW's own bin, if split
  plannedValue: number // packing + plannedBatches only: this batch's original planned qty (merges across a batch's own bin-rows)
  newOnHand: number    // only used in in-out mode
  unit: string
  location?: string
  /** Put-away only — this row's own bin, when the batch's destination is
   *  split across 2+ of them (one BatchRow per bin instead of one per
   *  batch). Null for every other caller (single location or none at all). */
  bin: string | null
  /** Rowspan grouping for Batch/Expiry/Description/plannedValue/Unit, which
   *  don't vary per bin — merged across a batch's own bin-rows. Always
   *  groupSize 1 unless this batch's destination is actually split. */
  groupIndex: number
  groupSize: number
}

/** Expands one batch entry into one row per destination bin (Storage
 *  location/Put-away qty split, everything else merged via groupIndex/
 *  groupSize) — or a single row when there's nothing to split (no
 *  destLocations, or just the one bin), so every other caller of this
 *  component (packing/delivery/picking, none of which ever split a batch
 *  across bins) renders exactly as before. */
function expandByBin(
  batchNo: string, expiryDate: string, desc: string, unit: string,
  plannedValue: number, fallbackValue: number, fallbackLocation: string | undefined,
  destLocations: { locationId: string; qty: number }[] | undefined,
): BatchRow[] {
  const bins = (destLocations ?? []).filter((d) => d.qty > 0)
  if (!bins.length) {
    return [{
      batchNo, expiryDate, desc, onHand: 0, value: fallbackValue, plannedValue, newOnHand: 0,
      unit, location: fallbackLocation, bin: fallbackLocation ?? null, groupIndex: 0, groupSize: 1,
    }]
  }
  return bins.map((d, bIdx) => ({
    batchNo, expiryDate, desc, onHand: 0, value: d.qty, plannedValue, newOnHand: 0,
    unit, bin: d.locationId, groupIndex: bIdx, groupSize: bins.length,
  }))
}

const rows = computed<BatchRow[]>(() => {
  // Packing: show the exact batches picked for this line, as-is — no derivation
  // from live warehouse stock, no on-hand/new-on-hand concept.
  if (isPacking.value) {
    if (props.plannedBatches) {
      // Union of every batch that was ever planned or ever actually picked,
      // keyed by batchNo — a re-pinned pick can name a batch that wasn't in
      // the original plan (plannedValue 0), and a partial pick can leave a
      // planned batch untouched (value 0).
      //
      // pickedBatches only reflects the REAL result once the task has actually
      // been draft-saved/finished at least once (pickedQty > 0) — savePickingDraft/
      // endPicking are what overwrite it down to just the batches genuinely
      // counted. Before that first save, pickedBatches is still the untouched
      // creation-time plan (identical to plannedBatches) — reading it as "picked"
      // would show the full plan as already picked on a task that hasn't started.
      // Callers with no such ambiguity (packing/delivery — their batch data is
      // always the real, already-settled result, never a leftover plan copy)
      // don't pass pickedQty at all, so they're never gated by this.
      const hasRealPicks = props.pickedQty === undefined || props.pickedQty > 0
      const plannedMap = new Map(props.plannedBatches.map(b => [b.batchNo, b]))
      const pickedMap = hasRealPicks ? new Map((props.pickedBatches ?? []).map(b => [b.batchNo, b])) : new Map<string, PickedBatchRow>()
      const batchNos = [...new Set([...plannedMap.keys(), ...pickedMap.keys()])]
      return batchNos.flatMap((batchNo, i) => {
        const planned = plannedMap.get(batchNo)
        const picked = pickedMap.get(batchNo)
        const src = picked ?? planned!
        return expandByBin(
          batchNo, src.expiryDate, src.desc || DEMO_DESCS[i % DEMO_DESCS.length]!, src.unit,
          planned?.qty ?? 0, picked?.qty ?? 0, picked?.location, picked?.destLocations,
        )
      })
    }
    return (props.pickedBatches ?? []).flatMap((b, i) =>
      expandByBin(b.batchNo, b.expiryDate, b.desc || DEMO_DESCS[i % DEMO_DESCS.length]!, b.unit, 0, b.qty, b.location, b.destLocations),
    )
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
        plannedValue: 0,
        newOnHand: b.onHand + delta,
        unit,
        bin: null, groupIndex: 0, groupSize: 1,
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
    plannedValue: 0,
    newOnHand: 0,
    unit,
    bin: null, groupIndex: 0, groupSize: 1,
  }))
})

// Column separators only when a batch actually splits across 2+ bins (put-away) —
// a non-split table (count / in-out / single-bin) must have no left/right borders.
const isSplit = computed(() => rows.value.some(r => r.groupSize > 1))

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
    <div class="vbd-panel" role="dialog" :aria-label="t('View batch')">

      <header class="vbd-header">
        <h2 class="vbd-title">{{ t('Batch detail') }}</h2>
        <button class="vbd-close" type="button" :aria-label="t('Close')" @click="close">
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
                <span class="vbd-stat-label">{{ t('Order qty') }}</span>
                <span class="vbd-stat-value">{{ fmt(orderQty) }}</span>
              </div>
              <div v-if="qtyToPick !== undefined" class="vbd-stat">
                <span class="vbd-stat-label">{{ t(plannedQtyLabel) }}</span>
                <span class="vbd-stat-value">{{ fmt(qtyToPick) }}</span>
              </div>
              <div class="vbd-stat">
                <span class="vbd-stat-label">{{ t(qtyLabel) }}</span>
                <span class="vbd-stat-value">{{ fmt(pickedQty ?? totalPicked) }}</span>
              </div>
              <!-- Match-order verify (packing): show how many units have been packed
                   (scanned/verified) so far, alongside the Picked qty above. -->
              <div v-if="isVerify" class="vbd-stat">
                <span class="vbd-stat-label">{{ t('Packed qty') }}</span>
                <span class="vbd-stat-value">{{ fmt(verifiedQty ?? 0) }}</span>
              </div>
              <div v-if="shippedQty !== undefined && shippedQty > 0" class="vbd-stat">
                <span class="vbd-stat-label">{{ t('Previously shipped') }}</span>
                <span class="vbd-stat-value">{{ fmt(shippedQty) }}</span>
              </div>
            </template>
            <template v-else>
              <div v-if="!hideOnHand" class="vbd-stat">
                <span class="vbd-stat-label">{{ t('On hand qty') }}</span>
                <span class="vbd-stat-value">{{ fmt(totalOnHand) }}</span>
              </div>
              <!-- count mode stats -->
              <template v-if="!isInOut">
                <div class="vbd-stat">
                  <span class="vbd-stat-label">{{ t('Counted qty') }}</span>
                  <span class="vbd-stat-value">{{ fmt(totalCounted) }}</span>
                </div>
                <!-- Difference is derived from on-hand — hidden alongside it, or the
                     operator could back-calculate the figure it's meant to hide. -->
                <div v-if="!hideOnHand" class="vbd-stat" :class="{ 'vbd-stat--pos': difference > 0, 'vbd-stat--neg': difference < 0 }">
                  <span class="vbd-stat-label">{{ t('Difference') }}</span>
                  <span class="vbd-stat-value">{{ fmtDiff(difference) }}</span>
                </div>
              </template>
              <!-- in-out mode stats -->
              <template v-else>
                <div class="vbd-stat" :class="{ 'vbd-stat--pos': totalDelta > 0, 'vbd-stat--neg': totalDelta < 0 }">
                  <span class="vbd-stat-label">{{ t('Stock in/out qty') }}</span>
                  <span class="vbd-stat-value">{{ fmtDelta(totalDelta) }}</span>
                </div>
                <div class="vbd-stat">
                  <span class="vbd-stat-label">{{ t('New on hand qty') }}</span>
                  <span class="vbd-stat-value">{{ fmt(totalNewOnHand) }}</span>
                </div>
              </template>
            </template>
          </div>
        </div>

        <!-- Match-order verify: scan each batch to confirm it matches the pick -->
        <div v-if="isVerify" class="vbd-scan">
          <ScanBar :placeholder="t('Scan batch number to verify…')" @scan="onScan" />
        </div>

        <!-- Table -->
        <div class="vbd-table-wrap">
          <table class="vbd-table" :class="{ 'vbd-table--split': isSplit }">
            <colgroup>
              <col class="vbd-col-batch" />
              <col class="vbd-col-expiry" />
              <col class="vbd-col-desc" />
              <col v-if="!isPacking && !hideOnHand" class="vbd-col-num" />
              <template v-if="qtyBeforeLocation">
                <col v-if="hasPlanned" class="vbd-col-num" />
                <col v-if="isPacking && !isVerify" class="vbd-col-loc" />
              </template>
              <template v-else>
                <col v-if="isPacking && !isVerify" class="vbd-col-loc" />
                <col v-if="hasPlanned" class="vbd-col-num" />
              </template>
              <col class="vbd-col-num" />
              <template v-if="isInOut"><col class="vbd-col-num" /></template>
              <col class="vbd-col-unit" />
            </colgroup>
            <thead>
              <tr>
                <th class="vbd-th">{{ t('Batch') }}</th>
                <th class="vbd-th">{{ t('Expiry date') }}</th>
                <th class="vbd-th">{{ t('Description') }}</th>
                <th v-if="!isPacking && !hideOnHand" class="vbd-th vbd-th--num">{{ t('On hand qty') }}</th>
                <template v-if="qtyBeforeLocation">
                  <th v-if="hasPlanned" class="vbd-th vbd-th--num">{{ t(plannedQtyLabel) }}</th>
                  <th v-if="isPacking && !isVerify" class="vbd-th">{{ t('Storage location') }}</th>
                </template>
                <template v-else>
                  <th v-if="isPacking && !isVerify" class="vbd-th">{{ t('Storage location') }}</th>
                  <th v-if="hasPlanned" class="vbd-th vbd-th--num">{{ t(plannedQtyLabel) }}</th>
                </template>
                <th v-if="isPacking" class="vbd-th vbd-th--num">{{ t(hasPlanned ? qtyLabel : tableQtyLabel) }}</th>
                <th v-if="!isPacking && !isInOut" class="vbd-th vbd-th--num">{{ t('Counted qty') }}</th>
                <template v-if="!isPacking && isInOut">
                  <th class="vbd-th vbd-th--num">{{ t('Stock in/out qty') }}</th>
                  <th class="vbd-th vbd-th--num">{{ t('New on hand qty') }}</th>
                </template>
                <th class="vbd-th vbd-th--unit">{{ t('Unit') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="`${row.batchNo}::${row.bin ?? ''}::${row.groupIndex}`" class="vbd-tr">
                <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="vbd-td vbd-td--muted">{{ row.batchNo }}</td>
                <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="vbd-td vbd-td--muted">{{ isoToDisplay(row.expiryDate) }}</td>
                <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="vbd-td vbd-td--muted">{{ row.desc }}</td>
                <td v-if="!isPacking && !hideOnHand" class="vbd-td vbd-td--num vbd-td--muted">{{ fmt(row.onHand) }}</td>
                <template v-if="qtyBeforeLocation">
                  <td v-if="hasPlanned && row.groupIndex === 0" :rowspan="row.groupSize" class="vbd-td vbd-td--num">{{ fmt(row.plannedValue) }}</td>
                  <td v-if="isPacking && !isVerify" class="vbd-td vbd-td--muted">{{ row.bin ?? '—' }}</td>
                </template>
                <template v-else>
                  <td v-if="isPacking && !isVerify" class="vbd-td vbd-td--muted">{{ row.bin ?? '—' }}</td>
                  <td v-if="hasPlanned && row.groupIndex === 0" :rowspan="row.groupSize" class="vbd-td vbd-td--num">{{ fmt(row.plannedValue) }}</td>
                </template>
                <td v-if="isPacking || !isInOut" class="vbd-td vbd-td--num">{{ fmt(row.value) }}</td>
                <template v-if="!isPacking && isInOut">
                  <td class="vbd-td vbd-td--num" :class="{ 'vbd-diff--pos': row.value > 0, 'vbd-diff--neg': row.value < 0 }">
                    {{ fmtDelta(row.value) }}
                  </td>
                  <td class="vbd-td vbd-td--num">{{ fmt(row.newOnHand) }}</td>
                </template>
                <td v-if="row.groupIndex === 0" :rowspan="row.groupSize" class="vbd-td vbd-td--muted vbd-td--unit">{{ row.unit }}</td>
              </tr>
              <tr v-if="!rows.length" class="vbd-tr">
                <td :colspan="isPacking ? (hasPlanned ? 7 : (isVerify ? 5 : 6)) : (isInOut ? 7 : 6)" class="vbd-td vbd-td--empty">{{ t('No batch data available.') }}</td>
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
  width: min(1400px, calc(100% - 24px));
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

.vbd-scan { margin-bottom: var(--mp-spacing-3); }
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
.vbd-col-loc     { width: 150px; }
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

/* Put-away only: a batch split across 2+ destination bins renders one row per
   bin — every column gets a left/right border so the split rows read as one
   grouped batch, not disconnected listings. Unit is always the true rightmost
   column (rendered once per batch, rowspan-merged) — not using `:last-child`
   for its border-right: none, since a groupIndex > 0 row renders fewer <td>s
   than the header and its own last rendered cell isn't reliably the table's
   true right edge. */
.vbd-table--split .vbd-th,
.vbd-table--split .vbd-td { border-right: 1px solid var(--mp-border-default); }
.vbd-table--split .vbd-th--unit,
.vbd-table--split .vbd-td--unit { border-right: none; }

</style>
