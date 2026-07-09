<script setup lang="ts">
/**
 * New shipment — same shape as Handover to Courier, except the deliveries aren't
 * pre-selected on the index page; the warehouse is picked here, then deliveries
 * are added by scanning their packing no. (stands in for a shipping label/AWB —
 * neither exists yet at this stage, since courier/tracking are decided on this
 * very form). Saving reuses the same handoverToCourierBulk() as the bulk flow.
 */
import { ref, computed, watch } from 'vue'
import {
  MpButton, MpAutocomplete, MpDatePicker, MpIcon,
  MpFormControl, MpFormLabel, MpFormErrorMessage, css, toast,
} from '@mekari/pixel3'
import SourceLabel from '~/components/patterns/SourceLabel.vue'
import ScanBar from '~/components/patterns/ScanBar.vue'
import {
  getDeliveryTask, findReadyToShipByPackingNo, findReadyToShipByPackingNoAnyWarehouse,
  handoverToCourierBulk, type DeliveryTask,
} from '~/data/deliveryTasks'
import { outgoingOrders, isMarketplaceOrder } from '~/data/outgoing'
import { warehouses } from '~/data/warehouses'
import { scrollToFirstError } from '~/utils/form'
import { getWarehouseOperators } from '~/data/warehouseTeam'

const router = useRouter()
const emptyIllustration = '/illustrations/empty-folder.png'

function toDisplayDate(iso: string) {
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function toISODate(display: string) {
  const [d, m, y] = display.split('/')
  return `${y}-${m}-${d}`
}
const todayDisplay = toDisplayDate(new Date().toISOString().slice(0, 10))

// ─── Warehouse — user-selectable (Handover locks this from pre-selected deliveries;
// here nothing is selected yet, so the manager picks the warehouse first). ────────
const warehouseOptions = computed(() =>
  warehouses.filter(w => w.status === 'active' && !w.isDefault).map(w => ({ id: w.id, name: w.name })),
)
const warehouseId = ref('')
const warehouseError = ref(false)
const isSaving = ref(false)
watch(warehouseId, (v) => { if (v) warehouseError.value = false })
const warehouseName = computed(() => warehouseOptions.value.find(w => w.id === warehouseId.value)?.name ?? '')

// ─── Deliveries — added by scanning a packing no., not pre-selected ──────────────
const taskIds = ref<string[]>([])
// A shipment is single-warehouse — switching warehouse voids whatever was scanned.
watch(warehouseId, () => { taskIds.value = [] })

const tasks = computed<DeliveryTask[]>(() =>
  taskIds.value.map(id => getDeliveryTask(id)).filter((t): t is DeliveryTask => !!t && t.status === 'ready to ship'),
)

interface Row { id: string; salesNo: string; taskNo: string; source: string; isMarketplace: boolean; skuQty: number; toShipQty: number }
const rows = computed<Row[]>(() => tasks.value.map((t) => {
  const order = outgoingOrders.find(o => o.id === t.salesOrderId)
  return {
    id: t.id,
    salesNo: t.salesNo,
    taskNo: t.taskNo,
    source: order?.source ?? '',
    isMarketplace: isMarketplaceOrder(order),
    skuQty: t.skuQty,
    toShipQty: t.toShipQty,
  }
}))

const flashRowId = ref<string | null>(null)
function handleScan(raw: string) {
  const value = raw.trim()
  if (!value) return
  if (!warehouseId.value) {
    toast.notify({ variant: 'error', title: 'Select a warehouse first', maxWidth: 'max-content' })
    return
  }
  const match = findReadyToShipByPackingNo(warehouseId.value, value)
  if (!match) {
    const elsewhere = findReadyToShipByPackingNoAnyWarehouse(value)
    if (elsewhere) {
      toast.notify({
        variant: 'error',
        title: `"${value}" belongs to ${elsewhere.warehouseName}, not ${warehouseName.value}`,
        maxWidth: 'max-content',
      })
    } else {
      toast.notify({ variant: 'error', title: `Barcode not found: "${value}"`, maxWidth: 'max-content' })
    }
    return
  }
  if (taskIds.value.includes(match.id)) {
    toast.notify({ variant: 'error', title: 'Already added to this shipment', maxWidth: 'max-content' })
    return
  }
  taskIds.value = [...taskIds.value, match.id]
  flashRowId.value = match.id
  setTimeout(() => { if (flashRowId.value === match.id) flashRowId.value = null }, 700)
}

// ─── Assignee + transaction date/no. ──────────────────────────────────────────
// Choices are scoped to the selected warehouse — only its Operators are valid.
const ASSIGNEES = computed(() => getWarehouseOperators(warehouseId.value))
const assigneeId = ref('')
const assigneeError = ref(false)
watch(assigneeId, (v) => { if (v) assigneeError.value = false })
watch(warehouseId, () => { assigneeId.value = '' })
const assigneeLabel = computed(() => ASSIGNEES.value.find(a => a.id === assigneeId.value)?.name ?? '')

const transactionDate = ref(todayDisplay)
const transactionDateError = ref(false)

// ─── Per-delivery courier + tracking no. — marketplace orders arrive with theirs
// already fixed (set when the delivery was created); non-marketplace ones are
// free text, filled in here. ─────────────────────────────────────────────────
const courierByRow = ref<Record<string, string>>({})
const trackingByRow = ref<Record<string, string>>({})
watch(tasks, (ts) => {
  const c: Record<string, string> = {}
  const tr: Record<string, string> = {}
  for (const t of ts) {
    c[t.id] = courierByRow.value[t.id] ?? t.courier ?? ''
    tr[t.id] = trackingByRow.value[t.id] ?? t.trackingNo ?? ''
  }
  courierByRow.value = c
  trackingByRow.value = tr
})
function setCourier(id: string, val: string) { courierByRow.value = { ...courierByRow.value, [id]: val } }
function setTracking(id: string, val: string) { trackingByRow.value = { ...trackingByRow.value, [id]: val } }

const showRowErrors = ref(false)
function rowCourierInvalid(r: Row) { return showRowErrors.value && !r.isMarketplace && !courierByRow.value[r.id]?.trim() }
function rowTrackingInvalid(r: Row) { return showRowErrors.value && !r.isMarketplace && !trackingByRow.value[r.id]?.trim() }

function formatNum(n: number) { return n.toLocaleString('id-ID') }
function goBack() { router.push({ path: '/outbound-delivery', query: { tab: 'Ready to ship' } }) }

function validate(): boolean {
  let valid = true
  if (!warehouseId.value) { warehouseError.value = true; valid = false }
  if (!assigneeId.value) { assigneeError.value = true; valid = false }
  if (!transactionDate.value) { transactionDateError.value = true; valid = false }
  if (!rows.value.length) valid = false
  showRowErrors.value = true
  if (rows.value.some(r => rowCourierInvalid(r) || rowTrackingInvalid(r))) valid = false
  return valid
}

async function handleSave() {
  if (!validate()) { scrollToFirstError(); return }
  isSaving.value = true
  await new Promise(r => setTimeout(r, 600))
  const { shipmentSeq } = handoverToCourierBulk(taskIds.value, {
    assignee: assigneeLabel.value,
    transactionDate: toISODate(transactionDate.value),
    courierByTaskId: Object.fromEntries(rows.value.map(r => [r.id, courierByRow.value[r.id]?.trim() ?? ''])),
    trackingNoByTaskId: Object.fromEntries(rows.value.map(r => [r.id, trackingByRow.value[r.id]?.trim() ?? ''])),
  })
  toast.notify({ variant: 'success', title: 'Shipment created', maxWidth: 'max-content' })
  router.push(`/outbound-delivery/shipment/${shipmentSeq}`)
}
</script>

<template>
  <div class="detail-page">

    <!-- ── Title bar ── -->
    <header class="detail-bar">
      <div class="detail-bar-left">
        <nav class="detail-breadcrumb-trail">
          <button class="detail-breadcrumb" @click="goBack">Ready to ship</button>
        </nav>
        <div class="detail-titlerow-left">
          <h1 class="detail-title">New shipment</h1>
        </div>
      </div>
    </header>

    <!-- ── Scrollable stage ── -->
    <div class="detail-stage">

      <!-- Warehouse + Assignee + Transaction date/no. -->
      <div class="ho-section ho-grid">
        <MpFormControl id="ns-warehouse" is-required :is-invalid="warehouseError">
          <MpFormLabel>Warehouse</MpFormLabel>
          <MpAutocomplete
            id="ns-warehouse-ac"
            v-model="warehouseId"
            :data="warehouseOptions"
            label-prop="name"
            value-prop="id"
            placeholder="Select warehouse"
            is-searchable use-portal is-full-width
            :is-invalid="warehouseError"
          />
          <MpFormErrorMessage>You must select a warehouse</MpFormErrorMessage>
        </MpFormControl>

        <MpFormControl id="ns-assignee" is-required :is-invalid="assigneeError">
          <MpFormLabel>Assignee</MpFormLabel>
          <MpAutocomplete
            id="ns-assignee-ac"
            v-model="assigneeId"
            :data="ASSIGNEES"
            label-prop="name"
            value-prop="id"
            placeholder="Select assignee"
            is-searchable is-clearable use-portal is-full-width
            :is-invalid="assigneeError"
          >
            <template #default="{ item }">
              <div class="ho-assignee-opt">
                <span
                  class="ho-assignee-avatar"
                  :style="{ background: `hsl(${item.hue},50%,88%)`, color: `hsl(${item.hue},55%,35%)` }"
                >{{ item.initials }}</span>
                {{ item.name }}
              </div>
            </template>
          </MpAutocomplete>
          <MpFormErrorMessage>You must select an assignee</MpFormErrorMessage>
        </MpFormControl>

        <MpFormControl id="ns-txdate" is-required :is-invalid="transactionDateError">
          <MpFormLabel>Transaction date</MpFormLabel>
          <div class="ho-datepicker">
            <MpDatePicker
              id="ns-txdate-dp"
              v-model="transactionDate"
              format="DD/MM/YYYY"
              value-type="format"
              use-portal
              @update:model-value="transactionDateError = false"
            />
          </div>
          <MpFormErrorMessage>Please enter a transaction date</MpFormErrorMessage>
        </MpFormControl>

        <MpFormControl id="ns-txno">
          <div class="ho-label-row">
            <MpFormLabel>Transaction no.</MpFormLabel>
            <span class="ho-label-icon" title="Auto-generated"><MpIcon name="settings" size="sm" /></span>
          </div>
          <input id="ns-txno-input" class="ho-txno-input" value="" placeholder="[Auto]" disabled />
        </MpFormControl>
      </div>

      <!-- Deliveries — empty until scanned -->
      <div class="ho-sku-section">
        <h2 class="ho-section-title">Deliveries</h2>
        <div class="ho-summary">
          <div class="ho-stat">
            <span class="ho-stat-label">Deliveries</span>
            <span class="ho-stat-val">{{ formatNum(rows.length) }}</span>
          </div>
        </div>

        <ScanBar placeholder="Scan packing no..." class="ns-scanbar" @scan="handleScan" />

        <div v-if="!rows.length" class="empty-full">
          <img :src="emptyIllustration" alt="" class="empty-illustration" width="288" height="240" />
          <p class="empty-full-title">No deliveries yet</p>
          <p class="empty-full-desc">Scan a packing no. above to add a delivery to this shipment.</p>
        </div>

        <section v-else class="ho-items-section">
          <div class="ho-items-scroll">
            <table class="ho-items">
              <colgroup>
                <col style="width: 16%" />
                <col style="width: 16%" />
                <col style="width: 20%" />
                <col style="width: 10%" />
                <col style="width: 12%" />
                <col style="width: 13%" />
                <col style="width: 13%" />
              </colgroup>
              <thead>
                <tr>
                  <th class="ho-th">Sales order no.</th>
                  <th class="ho-th">Delivery no.</th>
                  <th class="ho-th">Source</th>
                  <th class="ho-th ho-th--num">SKU qty</th>
                  <th class="ho-th ho-th--num">To ship qty</th>
                  <th class="ho-th">Courier</th>
                  <th class="ho-th">Tracking no.</th>
                </tr>
              </thead>
              <tbody>
                <tr
                  v-for="row in rows"
                  :key="row.id"
                  class="ho-item-row"
                  :class="{ 'ho-item-row--flash': flashRowId === row.id }"
                >
                  <td class="ho-td">{{ row.salesNo }}</td>
                  <td class="ho-td">{{ row.taskNo }}</td>
                  <td class="ho-td"><SourceLabel :source="row.source" /></td>
                  <td class="ho-td ho-td--num">{{ formatNum(row.skuQty) }}</td>
                  <td class="ho-td ho-td--num">{{ formatNum(row.toShipQty) }}</td>
                  <td class="ho-td ho-td--input">
                    <input
                      type="text" class="ho-text-input"
                      :value="courierByRow[row.id] ?? ''"
                      :disabled="row.isMarketplace"
                      :aria-invalid="rowCourierInvalid(row)"
                      placeholder="e.g. JNE, SiCepat"
                      @input="setCourier(row.id, ($event.target as HTMLInputElement).value)"
                    />
                  </td>
                  <td class="ho-td ho-td--input">
                    <input
                      type="text" class="ho-text-input"
                      :value="trackingByRow[row.id] ?? ''"
                      :disabled="row.isMarketplace"
                      :aria-invalid="rowTrackingInvalid(row)"
                      placeholder="e.g. SD0009583"
                      @input="setTracking(row.id, ($event.target as HTMLInputElement).value)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
        <p v-if="showRowErrors && !rows.length" class="ho-error">Scan at least one delivery to ship.</p>
        <p v-else-if="showRowErrors && rows.some(r => rowCourierInvalid(r) || rowTrackingInvalid(r))" class="ho-error">
          Courier and tracking no. are required for non-marketplace orders.
        </p>
      </div>

    </div><!-- /detail-stage -->

    <!-- ── Sticky footer ── -->
    <footer class="detail-footer">
      <MpButton variant="ghost" is-rounded @click="goBack">Cancel</MpButton>
      <MpButton variant="primary" is-rounded :is-disabled="isSaving" @click="handleSave">{{ isSaving ? 'Saving…' : 'Save' }}</MpButton>
    </footer>
  </div>
</template>

<style scoped>
/* ── Page shell ─────────────────────────────────────────────────────────────── */
.detail-page { height: 100%; display: flex; flex-direction: column; min-height: 0; overflow: hidden; }
.detail-bar {
  flex-shrink: 0; height: var(--mp-sizes-18, 72px); box-sizing: border-box;
  background: var(--mp-background-neutral-subtle); padding: 0 var(--mp-spacing-6);
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
}
.detail-bar-left { display: flex; flex-direction: column; justify-content: center; gap: 0; min-width: 0; }
.detail-breadcrumb-trail { display: flex; align-items: center; gap: var(--mp-spacing-1); align-self: flex-start; }
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
  padding: 0 var(--mp-spacing-6) var(--mp-spacing-6);
  border-top: var(--mp-spacing-6) solid var(--mp-background-stage);
}
.detail-footer {
  flex-shrink: 0;
  display: flex; justify-content: flex-end; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4) var(--mp-spacing-6);
  background: var(--mp-background-stage);
  border-top: 1px solid var(--mp-border-default);
}
/* ── Form grid ────────────────────────────────────────────────────────────── */
.ho-section { margin-bottom: var(--mp-spacing-6); }
.ho-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--mp-spacing-4); max-width: 558px; }
.ho-assignee-opt { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.ho-assignee-avatar {
  width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px);
  border-radius: var(--mp-radii-full); flex-shrink: 0;
  display: inline-flex; align-items: center; justify-content: center;
  font-size: var(--mp-font-sizes-xs); font-weight: var(--mp-font-weights-semi-bold);
}
.ho-datepicker :deep(.mp-date-picker) { width: 100%; }
.ho-label-row { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.ho-label-icon { display: inline-flex; align-items: center; color: var(--mp-icon-default, var(--mp-text-secondary)); cursor: default; }
.ho-txno-input {
  width: 100%; box-sizing: border-box; height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-3); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral-subtle); color: var(--mp-text-disabled);
  font-size: var(--mp-font-sizes-md); cursor: not-allowed;
}

/* ── Section title ───────────────────────────────────────────────────────── */
.ho-section-title {
  margin: 0 0 var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-xl, 20px); font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-xl, 32px); color: var(--mp-text-default);
}
.ho-sku-section { margin-bottom: var(--mp-spacing-6); }
.ho-summary { display: flex; align-items: center; gap: var(--mp-spacing-10); margin-bottom: var(--mp-spacing-4); }
.ho-stat { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); min-width: var(--mp-sizes-24, 96px); }
.ho-stat-val { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); font-variant-numeric: tabular-nums; }
.ho-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.ho-error { margin: var(--mp-spacing-3) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #c0392b); }

.ns-scanbar { margin-bottom: var(--mp-spacing-4); }

/* ── Empty state (no deliveries scanned yet) ───────────────────────────────── */
.empty-full { display: flex; flex-direction: column; align-items: center; padding: var(--mp-spacing-10, 40px) 0; }
.empty-illustration { width: 288px; height: 240px; object-fit: contain; }
.empty-full-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.empty-full-desc { margin-top: var(--mp-spacing-0\.5); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }

/* ── Items table (form-table look: grey read-only cells, white editable cell) ── */
.ho-items-section { display: flex; flex-direction: column; overflow: hidden; }
.ho-items-scroll { max-height: 484px; overflow-y: auto; overflow-x: auto; }
.ho-items { width: 100%; table-layout: fixed; border-collapse: collapse; }
.ho-items thead .ho-th { position: sticky; top: 0; z-index: 1; }
.ho-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.ho-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.ho-td {
  height: var(--mp-sizes-10, 40px);
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: left;
  border-bottom: 1px solid var(--mp-border-default); vertical-align: middle;
  background: var(--mp-background-neutral-subtle);
}
.ho-td--num { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
/* Editable Courier/Tracking cell — white, input fills edge-to-edge, focus ring */
.ho-td--input { padding: 0; background: var(--mp-background-neutral); }
.ho-td--input:focus-within { box-shadow: inset 0 0 0 2px var(--mp-border-focused, #2563eb); }
.ho-text-input {
  display: block; width: 100%; height: 100%; box-sizing: border-box;
  padding: 0 var(--mp-spacing-2); border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.ho-text-input:disabled { color: var(--mp-text-disabled); cursor: not-allowed; background: var(--mp-background-neutral-subtle); }
.ho-text-input::placeholder { color: var(--mp-text-placeholder); }

/* Newly-scanned row flash (~700ms), same idea as the receiving/put-away scan flash */
.ho-item-row--flash .ho-td { animation: ho-row-flash 700ms ease-out; }
@keyframes ho-row-flash {
  0% { background: var(--mp-background-success-subtle, #e3f6ec); }
  100% { background: transparent; }
}
</style>
