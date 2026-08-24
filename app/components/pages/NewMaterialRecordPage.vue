<script setup lang="ts">
/**
 * New material record — Work order detail → Material consume & return → New
 * record. Built from the Figma reference (Work Order Details / Partial
 * Consumption / New Consume · New Return) using the ERP create-page shell
 * (.detail-page + scrollable stage + sticky footer).
 *
 * One form, one Record type radio (Consume / Return) — switching it swaps the
 * line-item columns (Needed/On hand/Qty to consume vs Consumed/Qty to return).
 * Saving creates one persisted record per checked row (see
 * ~/data/materialConsumeReturn.ts) and returns to the work order's Material
 * consume & return tab.
 */
import { ref, reactive, computed } from 'vue'
import {
  MpFormControl, MpFormLabel, MpFormErrorMessage,
  MpAutocomplete, MpDatePicker, MpInput, MpTextarea, MpButton, MpIcon,
  MpCheckbox, MpRadio, toast,
} from '@mekari/pixel3'
import { workOrders } from '~/data/workOrders'
import { billOfMaterials, catalogProduct } from '~/data/billOfMaterials'
import { warehouses } from '~/data/warehouses'
import { isBatchTracked, isSerialized } from '~/data/warehouseDetails'
import { recordsForWorkOrder, addMaterialConsumeReturnRecord, remainingReservation } from '~/data/materialConsumeReturn'
import PickSerialNumberDrawer from '~/components/patterns/PickSerialNumberDrawer.vue'
import PickBatchDrawer, { type PickedBatch } from '~/components/patterns/PickBatchDrawer.vue'

const props = defineProps<{ orderId: string }>()
const router = useRouter()
const route = useRoute()

const wo = computed(() => workOrders.find(w => w.id === props.orderId))
const bom = computed(() => wo.value ? billOfMaterials.find(b => b.id === wo.value!.bomId) : undefined)

function goBack() { router.push(`/work-orders/${props.orderId}?tab=material-consume-return`) }

// ── Record type ──────────────────────────────────────────────────────────────
type RecordType = 'consume' | 'return'
const recordType = ref<RecordType>(route.query.type === 'return' ? 'return' : 'consume')
const isConsume = computed(() => recordType.value === 'consume')

// ── Header fields ────────────────────────────────────────────────────────────
const recordDate = ref('') // DD/MM/YYYY
const recordDateError = ref(false)
const warehouseId = ref('')
const warehouseError = ref(false)
const memo = ref('')
const MEMO_MAX = 256

const warehouseOptions = warehouses
  .filter(w => !w.isDefault && w.status === 'active')
  .map(w => ({ id: w.id, name: w.name }))

// ── Line items — one row per BOM raw material ────────────────────────────────
interface MaterialRow {
  productId: string
  product: string
  sku: string
  unit: string
  neededQty: number
  onHandQty: number
  consumedQty: number // net already consumed for this work order + product
  qtyValue: string
  selected: boolean
  trackingType?: 'serial' | 'batch'
  /** Chosen via the Manage serial number drawer — same real per-warehouse serial
   *  pool a work order's reservation would have drawn from (see ~/data/warehouseDetails).
   *  The qty this row consumes/returns IS the size of this selection. */
  serialSelection: string[]
  /** Chosen via the Manage batch drawer — same real per-warehouse batch pool. */
  batchSelection: PickedBatch[]
}

// Tracking type is a real product attribute (category), not synthetic — same
// rule the rest of the app (stock counts, transfers, picking) uses to decide
// whether a SKU is batch- or serial-tracked.
function trackingTypeFor(productId: string): 'serial' | 'batch' | undefined {
  const category = catalogProduct(productId)?.category ?? ''
  if (isSerialized(category)) return 'serial'
  if (isBatchTracked(category)) return 'batch'
  return undefined
}

function netConsumed(productId: string): number {
  if (!wo.value) return 0
  return recordsForWorkOrder(wo.value.id)
    .filter(r => r.productId === productId)
    .reduce((s, r) => s + r.qty, 0)
}

// ── Reservation pre-fill (Consume only) ──────────────────────────────────────
// Batch/serial units were already picked for this work order at creation time
// (New work order → Raw materials → Manage batch/serial number). Consuming
// should start from whatever of that reservation hasn't been consumed yet —
// not an empty drawer — so the operator is just confirming, not re-picking.
function remainingReservedBatch(productId: string): PickedBatch[] {
  if (!wo.value) return []
  return remainingReservation(wo.value.id, productId, wo.value.materialReservations?.[productId]).batchSelection ?? []
}
function remainingReservedSerial(productId: string): string[] {
  if (!wo.value) return []
  return remainingReservation(wo.value.id, productId, wo.value.materialReservations?.[productId]).serialSelection ?? []
}

const rows = reactive<MaterialRow[]>(
  (bom.value?.rawMaterials ?? []).map((r) => {
    const p = catalogProduct(r.productId)
    const trackingType = trackingTypeFor(r.productId)
    const prefillSerial = isConsume.value && trackingType === 'serial' ? remainingReservedSerial(r.productId) : []
    const prefillBatch = isConsume.value && trackingType === 'batch' ? remainingReservedBatch(r.productId) : []
    const prefillQty = trackingType === 'serial' ? prefillSerial.length : trackingType === 'batch' ? prefillBatch.reduce((s, b) => s + b.qty, 0) : 0
    return {
      productId: r.productId,
      product: p?.name ?? '—',
      sku: p?.sku ?? '—',
      unit: r.unit,
      neededQty: r.needed,
      onHandQty: r.needed,
      consumedQty: Math.max(0, netConsumed(r.productId)),
      qtyValue: prefillQty > 0 ? String(prefillQty) : '',
      selected: true,
      trackingType,
      serialSelection: prefillSerial,
      batchSelection: prefillBatch,
    }
  }),
)

const num = (v: string) => Number(v) || 0
// A tracked row's qty IS its drawer selection — typed qty only applies to
// untracked rows (the drawer is the only way to change how much of a
// batch/serial-tracked material this record consumes/returns).
function effectiveQty(row: MaterialRow): number {
  if (row.trackingType === 'serial') return row.serialSelection.length
  if (row.trackingType === 'batch') return row.batchSelection.reduce((s, b) => s + b.qty, 0)
  return num(row.qtyValue)
}
const remainingQty = (row: MaterialRow) =>
  isConsume.value
    ? Math.max(0, row.onHandQty - effectiveQty(row))
    : Math.max(0, row.consumedQty - effectiveQty(row))

// ── Manage serial number / Manage batch drawers ─────────────────────────────
// The pool each drawer offers is the SKU's real per-warehouse stock — the same
// source its work-order-creation reservation would have drawn from. No scanning:
// PickSerialNumberDrawer / PickBatchDrawer are dedicated pattern components
// (matching the Pixel library's PickSerialNumberDrawer / ManageBatchDrawer
// Storybook layouts) — pick straight off the real list, nothing more. For a
// tracked row, "Qty to consume/return" is the TARGET typed first; the drawer
// then requires picking exactly that many specific units before it saves — the
// row's real qty only becomes final once that's done (effectiveQty reads off
// the drawer's own selection, not the typed target).
const activeDrawerRow = ref<MaterialRow | null>(null)
function openTracking(row: MaterialRow) {
  if (!warehouseId.value) return
  if (num(row.qtyValue) <= 0) {
    toast.notify({ variant: 'warning', title: 'Input the qty first' })
    return
  }
  activeDrawerRow.value = row
}
function closeTracking() { activeDrawerRow.value = null }
function onSerialDrawerSave(serials: string[]) {
  if (activeDrawerRow.value) activeDrawerRow.value.serialSelection = serials
}
function onBatchDrawerSave(batches: PickedBatch[]) {
  if (activeDrawerRow.value) activeDrawerRow.value.batchSelection = batches
}
// Target passed to the drawer — the qty the operator typed for this row,
// capped by what could ever be consumed (on hand) or returned (consumed so far).
function drawerTargetCount(row: MaterialRow): number {
  const ceiling = isConsume.value ? row.onHandQty : row.consumedQty
  return Math.min(num(row.qtyValue), ceiling)
}
// A return can never exceed what was actually consumed for this work order —
// clamp the typed qty back down the moment it goes over.
function onReturnQtyInput(row: MaterialRow) {
  if (num(row.qtyValue) > row.consumedQty) row.qtyValue = row.consumedQty > 0 ? String(row.consumedQty) : ''
}
const drawerWarehouseName = computed(() => warehouseOptions.find(w => w.id === warehouseId.value)?.name ?? '')
function drawerProductImg(row: MaterialRow): string | undefined {
  return catalogProduct(row.productId)?.img
}

// ── Row selection (header checkbox) ─────────────────────────────────────────
const allSelected = computed(() => rows.length > 0 && rows.every(r => r.selected))
const someSelected = computed(() => rows.some(r => r.selected) && !allSelected.value)
function toggleAll() {
  const next = !allSelected.value
  rows.forEach(r => { r.selected = next })
}

// ── Empty state — Consume only. Before a warehouse is picked there's nothing
// to show on-hand qty against, so the table shows a blank slate instead of
// the material rows (Figma: Table / New record → Blank Slate). Return doesn't
// depend on a source warehouse for its qty columns, so its rows load
// immediately — the warehouse is still required, just validated on Save.
const showEmptyState = computed(() => isConsume.value && !warehouseId.value)
const colCount = computed(() => 3 + (isConsume.value ? 4 : 2) + 2)

// ── Save ─────────────────────────────────────────────────────────────────────
const CURRENT_USER = 'Rizal Candra'

function parseDMY(v: string): string {
  const [dd, mm, yyyy] = v.split('/')
  const today = new Date().toISOString().slice(0, 10)
  return dd && mm && yyyy ? `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}` : today
}

function validate() {
  let ok = true
  if (!recordDate.value) { recordDateError.value = true; ok = false }
  if (!warehouseId.value) { warehouseError.value = true; ok = false }
  return ok
}

function handleSave() {
  if (!wo.value || !validate()) return
  const isoDate = parseDMY(recordDate.value)
  let saved = 0
  rows.forEach(row => {
    if (!row.selected) return
    const qty = effectiveQty(row)
    if (qty <= 0) return
    addMaterialConsumeReturnRecord({
      workOrderId: wo.value!.id,
      type: isConsume.value ? 'Consume' : 'Return',
      productId: row.productId,
      date: isoDate,
      qty: isConsume.value ? qty : -qty,
      unit: row.unit,
      warehouseId: warehouseId.value,
      memo: memo.value,
      recordedBy: CURRENT_USER,
      batchSelection: row.trackingType === 'batch' ? row.batchSelection : undefined,
      serialSelection: row.trackingType === 'serial' ? row.serialSelection : undefined,
    })
    saved++
  })
  if (saved === 0) {
    toast.notify({ variant: 'warning', title: 'Enter a quantity for at least one product' })
    return
  }
  toast.notify({ variant: 'success', title: 'Material record saved' })
  goBack()
}
</script>

<template>
  <div v-if="wo" class="detail-page">
    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="goBack">Work Order #{{ wo.number.split('-').pop() }}</button>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">New material record</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">
      <div class="mr-body">

        <!-- ── Record type ── -->
        <MpFormControl id="mr-type" is-required>
          <MpFormLabel>Record type</MpFormLabel>
          <div class="mr-radio-group">
            <MpRadio id="mr-type-consume" name="mr-type" value="consume" :is-checked="recordType === 'consume'" @change="recordType = 'consume'">Consume</MpRadio>
            <MpRadio id="mr-type-return" name="mr-type" value="return" :is-checked="recordType === 'return'" @change="recordType = 'return'">Return</MpRadio>
          </div>
        </MpFormControl>

        <!-- ── Date + Warehouse ── -->
        <div class="mr-grid">
          <MpFormControl id="mr-date" is-required :is-invalid="recordDateError">
            <MpFormLabel>{{ isConsume ? 'Consume date' : 'Return date' }}</MpFormLabel>
            <div class="mr-datepicker">
              <MpDatePicker
                id="mr-date-dp" v-model="recordDate" format="DD/MM/YYYY" value-type="format"
                placeholder="Select date" is-clearable use-portal
                @update:model-value="recordDateError = false"
              />
            </div>
            <MpFormErrorMessage>You must select a date</MpFormErrorMessage>
          </MpFormControl>

          <MpFormControl id="mr-warehouse" is-required :is-invalid="warehouseError">
            <MpFormLabel>{{ isConsume ? 'Pick from warehouse' : 'Return to warehouse' }}</MpFormLabel>
            <MpAutocomplete
              id="mr-warehouse-ac" v-model="warehouseId" :data="warehouseOptions"
              label-prop="name" value-prop="id" placeholder="Select warehouse"
              is-searchable is-clearable use-portal is-full-width :is-invalid="warehouseError"
              @update:model-value="warehouseError = false"
            />
            <MpFormErrorMessage>You must select a warehouse</MpFormErrorMessage>
          </MpFormControl>
        </div>

        <!-- ── Memo ── -->
        <MpFormControl id="mr-memo" class="mr-memo">
          <div class="mr-memo-label-row">
            <MpFormLabel>Memo</MpFormLabel>
            <span class="mr-memo-counter">{{ memo.length }} / {{ MEMO_MAX }}</span>
          </div>
          <MpTextarea id="mr-memo-textarea" v-model="memo" is-full-width :rows="3" :maxlength="MEMO_MAX" />
        </MpFormControl>

        <!-- ── Line items ── -->
        <div class="mr-table-section" :class="{ 'mr-table-section--empty': showEmptyState }">
          <div class="mr-table-scroll">
            <table class="mr-table">
              <colgroup>
                <col class="mr-col-check" />
                <col class="mr-col-product" />
                <col class="mr-col-sku" />
                <template v-if="isConsume">
                  <col class="mr-col-num" /><col class="mr-col-num" /><col class="mr-col-num" />
                  <col class="mr-col-qty" />
                </template>
                <template v-else>
                  <col class="mr-col-num" />
                  <col class="mr-col-qty" />
                </template>
                <col class="mr-col-num" />
                <col class="mr-col-unit" />
              </colgroup>
              <thead>
                <tr>
                  <th class="mr-th mr-th--check">
                    <div class="mr-check-wrap">
                      <MpCheckbox id="mr-select-all" :is-checked="allSelected" :is-indeterminate="someSelected" :is-disabled="showEmptyState" @change="toggleAll" />
                    </div>
                  </th>
                  <th class="mr-th">Product</th>
                  <th class="mr-th">SKU</th>
                  <template v-if="isConsume">
                    <th class="mr-th mr-th--right">Needed qty</th>
                    <th class="mr-th mr-th--right">Consumed qty</th>
                    <th class="mr-th mr-th--right">On hand qty</th>
                    <th class="mr-th">Qty to consume</th>
                  </template>
                  <template v-else>
                    <th class="mr-th mr-th--right">Consumed qty</th>
                    <th class="mr-th">Qty to return</th>
                  </template>
                  <th class="mr-th mr-th--right">Remaining qty</th>
                  <th class="mr-th">Unit</th>
                </tr>
              </thead>
              <!-- Empty state — Consume only, no warehouse picked yet -->
              <tbody v-if="showEmptyState">
                <tr class="mr-tr mr-tr--empty">
                  <td class="mr-td mr-td--empty" :colspan="colCount">
                    <div class="mr-empty">
                      <img src="/illustrations/empty-box.png" alt="" class="mr-empty-illustration" width="144" height="132" />
                      <p class="mr-empty-title">No material to record</p>
                      <p class="mr-empty-desc">Select warehouse first.</p>
                    </div>
                  </td>
                </tr>
              </tbody>
              <tbody v-else>
                <tr v-for="row in rows" :key="row.productId" class="mr-tr">
                  <td class="mr-td mr-td--check">
                    <div class="mr-check-wrap">
                      <MpCheckbox :id="`mr-row-${row.productId}`" :is-checked="row.selected" @change="() => row.selected = !row.selected" />
                    </div>
                  </td>
                  <td class="mr-td mr-td--locked">{{ row.product }}</td>
                  <td class="mr-td mr-td--locked">{{ row.sku }}</td>
                  <template v-if="isConsume">
                    <td class="mr-td mr-td--locked mr-td--num">{{ row.neededQty }}</td>
                    <td class="mr-td mr-td--locked mr-td--num">{{ row.consumedQty }}</td>
                    <td class="mr-td mr-td--locked mr-td--num">{{ row.onHandQty }}</td>
                    <td class="mr-td mr-td--input">
                      <MpInput :id="`mr-qty-${row.productId}`" v-model="row.qtyValue" type="number" placeholder="0" is-full-width />
                      <template v-if="row.trackingType">
                        <span v-if="num(row.qtyValue) > 0" class="mr-tracked-hint">{{ effectiveQty(row) }} of {{ num(row.qtyValue) }} selected</span>
                        <a class="mr-tracking" :class="{ 'mr-tracking--disabled': !warehouseId }" @click.prevent="openTracking(row)">
                          {{ row.trackingType === 'serial' ? 'Manage serial number' : 'Manage batch' }}
                        </a>
                      </template>
                    </td>
                  </template>
                  <template v-else>
                    <td class="mr-td mr-td--locked mr-td--num">{{ row.consumedQty }}</td>
                    <td class="mr-td mr-td--input">
                      <MpInput
                        :id="`mr-qty-${row.productId}`"
                        :model-value="row.consumedQty === 0 ? '0' : row.qtyValue"
                        type="number" placeholder="0" is-full-width
                        :is-disabled="row.consumedQty === 0"
                        :max="row.consumedQty"
                        @update:model-value="(v: string) => { row.qtyValue = v; onReturnQtyInput(row) }"
                      />
                      <template v-if="row.trackingType">
                        <span v-if="num(row.qtyValue) > 0" class="mr-tracked-hint">{{ effectiveQty(row) }} of {{ num(row.qtyValue) }} selected</span>
                        <a
                          class="mr-tracking" :class="{ 'mr-tracking--disabled': !warehouseId || row.consumedQty === 0 }"
                          @click.prevent="openTracking(row)"
                        >{{ row.trackingType === 'serial' ? 'Manage serial number' : 'Manage batch' }}</a>
                      </template>
                    </td>
                  </template>
                  <td class="mr-td mr-td--locked mr-td--num">{{ remainingQty(row) }}</td>
                  <td class="mr-td mr-td--locked">{{ row.unit }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer">
      <MpButton variant="ghost" is-rounded @click="goBack">Cancel</MpButton>
      <MpButton variant="primary" is-rounded @click="handleSave">Save</MpButton>
    </footer>

    <!-- ── Manage serial number / Manage batch — dedicated pattern components (no
         scanning, no bins, no ad-hoc "add new"): pick straight from the SKU's
         real warehouse stock up to the qty typed above. ── -->
    <PickSerialNumberDrawer
      v-if="activeDrawerRow && activeDrawerRow.trackingType === 'serial'"
      :open="!!activeDrawerRow"
      :product-name="activeDrawerRow.product"
      :product-img="drawerProductImg(activeDrawerRow)"
      :sku="activeDrawerRow.sku"
      :warehouse-id="warehouseId"
      :warehouse-name="drawerWarehouseName"
      :target-count="drawerTargetCount(activeDrawerRow)"
      :model-value="activeDrawerRow.serialSelection"
      @update:open="(v: boolean) => { if (!v) closeTracking() }"
      @save="onSerialDrawerSave"
    />
    <PickBatchDrawer
      v-if="activeDrawerRow && activeDrawerRow.trackingType === 'batch'"
      :open="!!activeDrawerRow"
      :product-name="activeDrawerRow.product"
      :product-img="drawerProductImg(activeDrawerRow)"
      :sku="activeDrawerRow.sku"
      :warehouse-id="warehouseId"
      :warehouse-name="drawerWarehouseName"
      :unit="activeDrawerRow.unit"
      :target-count="drawerTargetCount(activeDrawerRow)"
      :model-value="activeDrawerRow.batchSelection"
      @update:open="(v: boolean) => { if (!v) closeTracking() }"
      @save="onBatchDrawerSave"
    />
  </div>

  <!-- Not found -->
  <div v-else class="detail-page">
    <header class="detail-bar">
      <div class="detail-bar-left">
        <button class="detail-breadcrumb" @click="router.push('/work-orders')">Work orders</button>
        <div class="detail-titlerow-left"><h1 class="detail-title">Work order not found</h1></div>
      </div>
    </header>
  </div>
</template>

<style scoped>
/* ── Page shell (shared create-page pattern) ─────────────────────────────── */
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
.detail-stage {
  flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0;
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-8);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
}
.detail-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage); border-top: 1px solid var(--mp-border-default);
}

/* ── Body ─────────────────────────────────────────────────────────────────── */
.mr-body { display: flex; flex-direction: column; gap: var(--mp-spacing-6); padding-top: var(--mp-spacing-2); }
/* MpRadio already renders its own label (as the component's default slot) with a
   built-in control→label gap — wrapping it in another <label>+<span> (the pattern
   used elsewhere in the app) double-spaces it. Passing the text straight into the
   slot keeps just Pixel's own spacing, so only the group's own gap needs setting. */
.mr-radio-group { display: flex; align-items: center; gap: var(--mp-spacing-8); height: var(--mp-sizes-10, 40px); }

.mr-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 318px)); gap: var(--mp-spacing-4) var(--mp-spacing-6); }
.mr-datepicker { width: 100%; }
.mr-datepicker :deep(.mp-datepicker__root) { width: 100%; }

.mr-memo { max-width: 660px; }
.mr-memo-label-row { display: flex; align-items: center; justify-content: space-between; }
.mr-memo-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* ── Line-item table — follows the form-table pattern (docs/patterns/FormTable.md,
   live reference: CreateReceiptPage.vue's .cr-table). ─────────────────────────── */
.mr-table-section { border-bottom: 1px solid var(--mp-border-default); }
.mr-table-section--empty { border-bottom: none; }
.mr-table-scroll { overflow-x: auto; }
.mr-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; }
.mr-table tbody tr:last-child .mr-td { border-bottom: none; }

.mr-col-check { width: 44px; }
.mr-col-product { width: 240px; }
.mr-col-sku { width: 120px; }
.mr-col-num { width: 110px; }
.mr-col-qty { width: 160px; }
.mr-col-unit { width: 90px; }

.mr-th {
  height: var(--mp-sizes-7, 28px); text-align: left; white-space: nowrap;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary);
  border-bottom: 1px solid var(--mp-border-default);
}
.mr-th--right { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.mr-th--check { padding: 0; }

.mr-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: middle;
  border-bottom: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.mr-td:last-child { border-right: none; }
.mr-td--check { padding: 0; text-align: center; }
.mr-check-wrap { display: flex; align-items: center; justify-content: center; }
/* MpCheckbox's root is a flex row (control + label) with a gap between them even
   when the label is empty — that leaves the visible 16px box sitting left of the
   root's own center, so the wrap above centers the wrong box. Zero the gap (no
   label is ever passed here) so the root's box IS the control's box. */
.mr-check-wrap :deep(.mp-checkbox__root) { gap: 0; }

/* Read-only / calculated cells (product, SKU, needed/consumed/on-hand/remaining qty,
   unit) — gray subtle background, same as .cr-td--sku / .cr-td--unit. */
.mr-td--locked { background: var(--mp-background-neutral-subtle); color: var(--mp-text-secondary); }
.mr-td--num { text-align: right; font-variant-numeric: tabular-nums; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }

/* Editable qty cell — the input owns the full cell, cell owns the focus ring.
   Tracked rows stack a "N of target selected" hint + the Manage link underneath
   the input, so top-align (not middle) once there's more than just the input. */
.mr-td--input { padding: 0; vertical-align: top; white-space: normal; }
.mr-td--input :deep([class*='input']) { border-radius: 0; border-color: transparent; }
.mr-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); }
.mr-tracked-hint { display: block; padding: var(--mp-spacing-1) var(--mp-spacing-2) 0 var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.mr-tracking { display: block; padding: 0 var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); cursor: pointer; }
.mr-tracking:hover { text-decoration: underline; text-underline-offset: 2px; }
.mr-tracking--disabled { color: var(--mp-text-disabled); cursor: not-allowed; pointer-events: none; }

/* Empty state — before a warehouse is picked (Figma: Table / New record → Blank Slate) */
.mr-tr--empty:hover { background: none; }
.mr-td--empty { padding: var(--mp-spacing-6) var(--mp-spacing-4); border-right: none; border-bottom: none; white-space: normal; }
.mr-empty { display: flex; flex-direction: column; align-items: center; gap: var(--mp-spacing-1); }
.mr-empty-illustration { width: 144px; height: 132px; object-fit: contain; }
.mr-empty-title { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.mr-empty-desc { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
