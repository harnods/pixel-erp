<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  MpIcon,
  MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
  MpDatePicker, css,
} from '@mekari/pixel3'
import { productBySku } from '~/data/inventory'
import { getWarehouseDetail } from '~/data/warehouseDetails'

// ── Public interface ─────────────────────────────────────────────────────────────
export interface CommittedBatch {
  key: string
  batchNo: string
  expiryDate: string  // ISO
  desc: string
  onHand: number
  counted: number | null  // null = uncounted
  unit: string
}

const props = defineProps<{
  open: boolean
  sku: string
  warehouseId: string
  modelValue: CommittedBatch[]
  /** 'count' (default) = stock count; 'in-out' = stock in/out */
  kind?: 'count' | 'in-out'
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  'save': [batches: CommittedBatch[]]
}>()

// ── Working rows ─────────────────────────────────────────────────────────────────
interface WorkRow extends CommittedBatch {
  isNew: boolean
  expiryDisplay: string  // DD/MM/YYYY for the date picker
}

const DEMO_DESCS = [
  'Ethiopia Yirgacheffe, Grade 1, washed – harvest 2025',
  'Colombia Huila, natural process, lot #COL-25A',
  'Medium roast, 3-day degassing – roasted Jun 2025',
  'Single origin, certified organic, lot #B12',
]

function isoToDisplay(iso: string): string {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function displayToIso(display: string): string {
  if (!display) return ''
  const [d, m, y] = display.split('/')
  return `${y}-${m}-${d}`
}

const rows = ref<WorkRow[]>([])

// seed rows from modelValue or warehouse batches when drawer opens.
// { immediate: true } is required because the component mounts with open=true
// (parent uses v-if="batchDrawerRow"), so a lazy watch never fires on first open.
watch(() => props.open, (isOpen) => {
  if (!isOpen) return

  if (props.modelValue.length > 0) {
    rows.value = props.modelValue.map(b => ({
      ...b,
      isNew: false,
      expiryDisplay: isoToDisplay(b.expiryDate),
    }))
    return
  }

  // in-out mode: start empty — user manually picks which batches to affect
  if (props.kind === 'in-out') {
    rows.value = []
    return
  }

  // count mode: seed all warehouse batches (all uncounted by default)
  const wh = getWarehouseDetail(props.warehouseId)
  const si = wh?.stock.find(s => s.sku === props.sku)
  const batches = si?.batches ?? []
  const unit = si?.unit ?? productBySku(props.sku)?.unit ?? ''

  rows.value = batches.map((b, i) => ({
    key: b.batchNo,
    batchNo: b.batchNo,
    expiryDate: b.expiryDate,
    expiryDisplay: isoToDisplay(b.expiryDate),
    desc: DEMO_DESCS[i % DEMO_DESCS.length]!,
    onHand: b.onHand,
    counted: null,
    unit,
    isNew: false,
  }))
}, { immediate: true })

// ── Product info ─────────────────────────────────────────────────────────────────
const product = computed(() => productBySku(props.sku))
const warehouseStock = computed(() => {
  const wh = getWarehouseDetail(props.warehouseId)
  return wh?.stock.find(s => s.sku === props.sku)
})
const productImg = computed(() => product.value?.img ?? '')
const productName = computed(() => warehouseStock.value?.name ?? product.value?.name ?? props.sku)

const isInOut = computed(() => props.kind === 'in-out')

const totalOnHand = computed(() => rows.value.reduce((s, r) => s + r.onHand, 0))
const totalCounted = computed(() => {
  const counted = rows.value.filter(r => r.counted !== null)
  if (!counted.length) return null
  return counted.reduce((s, r) => s + (r.counted ?? 0), 0)
})
const totalDifference = computed(() => {
  if (totalCounted.value === null) return null
  return totalCounted.value - totalOnHand.value
})
const totalNewOnHand = computed(() => {
  if (totalCounted.value === null) return null
  return totalOnHand.value + totalCounted.value
})

function newOnHandOf(row: WorkRow): number | null {
  if (row.counted === null) return null
  return row.onHand + row.counted
}

// ── Filter state ─────────────────────────────────────────────────────────────────
type Progress = '' | 'counted' | 'uncounted'
const progress = ref<Progress>('')
const progressOptions: { value: Progress; label: string }[] = [
  { value: '', label: 'All items' },
  { value: 'counted', label: 'Counted' },
  { value: 'uncounted', label: 'Not counted' },
]
const progressLabel = computed(() =>
  progress.value === '' ? 'Count progress' : (progressOptions.find(o => o.value === progress.value)?.label ?? 'Count progress')
)
const search = ref('')

const displayRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return rows.value.filter(r => {
    if (progress.value === 'counted' && r.counted === null) return false
    if (progress.value === 'uncounted' && r.counted !== null) return false
    if (q && !r.batchNo.toLowerCase().includes(q) && !r.desc.toLowerCase().includes(q)) return false
    return true
  })
})

// ── Select batch popover ─────────────────────────────────────────────────────────
// Available batches = warehouse batches not yet in the table
const availableBatches = computed(() => {
  const wh = getWarehouseDetail(props.warehouseId)
  const si = wh?.stock.find(s => s.sku === props.sku)
  const all = si?.batches ?? []
  const inTable = new Set(rows.value.filter(r => !r.isNew).map(r => r.batchNo))
  return all.filter(b => !inTable.has(b.batchNo))
})

function addWarehouseBatch(batchNo: string) {
  const wh = getWarehouseDetail(props.warehouseId)
  const si = wh?.stock.find(s => s.sku === props.sku)
  const b = si?.batches?.find(x => x.batchNo === batchNo)
  if (!b) return
  const unit = si?.unit ?? productBySku(props.sku)?.unit ?? ''
  const idx = rows.value.length
  rows.value.push({
    key: b.batchNo,
    batchNo: b.batchNo,
    expiryDate: b.expiryDate,
    expiryDisplay: isoToDisplay(b.expiryDate),
    desc: DEMO_DESCS[idx % DEMO_DESCS.length]!,
    onHand: b.onHand,
    counted: null,
    unit,
    isNew: false,
  })
}

let newCounter = 0
function addNewBatch() {
  newCounter++
  const unit = warehouseStock.value?.unit ?? productBySku(props.sku)?.unit ?? ''
  rows.value.push({
    key: `__new__${newCounter}`,
    batchNo: '',
    expiryDate: '',
    expiryDisplay: '',
    desc: '',
    onHand: 0,
    counted: null,
    unit,
    isNew: true,
  })
}

function removeRow(key: string) {
  rows.value = rows.value.filter(r => r.key !== key)
}

function setCounted(row: WorkRow, val: string) {
  const n = val === '' ? null : Math.max(0, Math.floor(Number(val) || 0))
  row.counted = n
}

function setExpiryDisplay(row: WorkRow, val: string) {
  row.expiryDisplay = val
  row.expiryDate = displayToIso(val)
}

// ── Difference helpers ────────────────────────────────────────────────────────────
function diffOf(row: WorkRow): number | null {
  if (row.counted === null) return null
  return row.counted - row.onHand
}

function diffLabel(row: WorkRow): string {
  const d = diffOf(row)
  if (d === null) return 'Uncounted'
  return d > 0 ? `+${d.toLocaleString('id-ID')}` : d.toLocaleString('id-ID')
}

// ── Footer actions ────────────────────────────────────────────────────────────────
function handleCancel() {
  emit('update:open', false)
}

function handleSave() {
  const committed: CommittedBatch[] = rows.value.map(r => ({
    key: r.key,
    batchNo: r.batchNo,
    expiryDate: r.expiryDate,
    desc: r.desc,
    onHand: r.onHand,
    counted: r.counted,
    unit: r.unit,
  }))
  emit('save', committed)
  emit('update:open', false)
}

// Format helpers
function fmtNum(n: number | null): string {
  if (n === null) return '—'
  return n.toLocaleString('id-ID')
}
</script>

<template>
  <div v-if="open" class="mbd-overlay" @click.self="handleCancel">
    <div class="mbd-panel" role="dialog" aria-label="Manage batch">

      <!-- Header -->
      <header class="mbd-header">
        <h2 class="mbd-title">Manage batch</h2>
        <button class="mbd-close" type="button" aria-label="Close" @click="handleCancel">
          <MpIcon name="close" size="md" />
        </button>
      </header>

      <!-- Content -->
      <div class="mbd-content">

        <!-- Product info bar -->
        <div class="mbd-info-bar">
          <div class="mbd-info-product">
            <img v-if="productImg" class="mbd-info-thumb" :src="productImg" :alt="productName" loading="lazy" />
            <span v-else class="mbd-info-thumb mbd-info-thumb--empty" />
            <div class="mbd-info-names">
              <span class="mbd-info-name">{{ productName }}</span>
              <span class="mbd-info-sku">{{ sku }}</span>
            </div>
          </div>
          <div class="mbd-info-stats">
            <div class="mbd-stat">
              <span class="mbd-stat-label">On hand qty</span>
              <span class="mbd-stat-value">{{ totalOnHand.toLocaleString('id-ID') }}</span>
            </div>
            <!-- stock count stats -->
            <template v-if="!isInOut">
              <div class="mbd-stat">
                <span class="mbd-stat-label">Counted</span>
                <span class="mbd-stat-value">{{ fmtNum(totalCounted) }}</span>
              </div>
              <div
                class="mbd-stat"
                :class="{ 'mbd-stat--pos': (totalDifference ?? 0) > 0, 'mbd-stat--neg': (totalDifference ?? 0) < 0 }"
              >
                <span class="mbd-stat-label">Difference</span>
                <span class="mbd-stat-value">
                  <template v-if="totalDifference === null">—</template>
                  <template v-else-if="totalDifference > 0">+{{ totalDifference.toLocaleString('id-ID') }}</template>
                  <template v-else>{{ totalDifference.toLocaleString('id-ID') }}</template>
                </span>
              </div>
            </template>
            <!-- stock in/out stats -->
            <template v-else>
              <div
                class="mbd-stat"
                :class="{ 'mbd-stat--pos': (totalCounted ?? 0) > 0, 'mbd-stat--neg': (totalCounted ?? 0) < 0 }"
              >
                <span class="mbd-stat-label">Stock in/out qty</span>
                <span class="mbd-stat-value">
                  <template v-if="totalCounted === null">—</template>
                  <template v-else-if="totalCounted > 0">+{{ totalCounted.toLocaleString('id-ID') }}</template>
                  <template v-else>{{ totalCounted.toLocaleString('id-ID') }}</template>
                </span>
              </div>
              <div class="mbd-stat">
                <span class="mbd-stat-label">New on hand qty</span>
                <span class="mbd-stat-value">{{ totalNewOnHand !== null ? totalNewOnHand.toLocaleString('id-ID') : '—' }}</span>
              </div>
            </template>
          </div>
        </div>

        <!-- Filter bar -->
        <div class="mbd-filter-bar">
          <div class="mbd-filter-left">
            <MpPopover v-if="!isInOut" id="mbd-progress" is-close-on-select use-portal>
              <MpPopoverTrigger>
                <button class="mbd-progress-btn" :class="{ 'mbd-progress-btn--placeholder': progress === '' }" type="button">
                  {{ progressLabel }}
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                  </svg>
                </button>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '180px', width: 'max-content' })">
                <MpPopoverList>
                  <MpPopoverListItem v-for="o in progressOptions" :key="o.value" :is-active="o.value === progress" @click="progress = o.value">
                    {{ o.label }}
                  </MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
            <button class="mbd-add-new-btn" type="button" @click="addNewBatch">
              <MpIcon name="plus" size="sm" />
              Add new batch
            </button>
          </div>

          <div class="mbd-search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <input v-model="search" class="mbd-search-input" type="text" placeholder="Search..." />
          </div>
        </div>

        <!-- Table -->
        <div class="mbd-table-wrap">
          <table class="mbd-table">
            <colgroup>
              <col class="mbd-col-batch" />
              <col class="mbd-col-expiry" />
              <col class="mbd-col-desc" />
              <col class="mbd-col-num" />
              <col class="mbd-col-counted" />
              <col class="mbd-col-num" />
              <col class="mbd-col-unit" />
              <col class="mbd-col-del" />
            </colgroup>
            <thead>
              <tr>
                <th class="mbd-th">Batch</th>
                <th class="mbd-th">Expiry date</th>
                <th class="mbd-th">Description</th>
                <th class="mbd-th mbd-th--num">On hand qty</th>
                <th class="mbd-th mbd-th--num">{{ isInOut ? 'Stock in/out qty' : 'Counted qty' }}</th>
                <th class="mbd-th mbd-th--num">{{ isInOut ? 'New on hand qty' : 'Difference' }}</th>
                <th class="mbd-th">Unit</th>
                <th class="mbd-th mbd-th--del" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in displayRows" :key="row.key" class="mbd-tr">
                <!-- BATCH -->
                <td v-if="row.isNew" class="mbd-td mbd-td--input">
                  <input
                    class="mbd-cell-input"
                    type="text"
                    placeholder="Batch no."
                    :value="row.batchNo"
                    @input="row.batchNo = ($event.target as HTMLInputElement).value"
                  />
                </td>
                <td v-else class="mbd-td mbd-td--muted">{{ row.batchNo }}</td>

                <!-- EXPIRY DATE -->
                <td v-if="row.isNew" class="mbd-td mbd-td--input mbd-td--datepicker">
                  <MpDatePicker
                    use-portal
                    format="DD/MM/YYYY"
                    value-type="format"
                    :model-value="row.expiryDisplay"
                    :class="css({ width: '100%' })"
                    @update:model-value="setExpiryDisplay(row, $event as string)"
                  />
                </td>
                <td v-else class="mbd-td mbd-td--muted">{{ isoToDisplay(row.expiryDate) }}</td>

                <!-- DESCRIPTION -->
                <td v-if="row.isNew" class="mbd-td mbd-td--input">
                  <input
                    class="mbd-cell-input"
                    type="text"
                    placeholder="Description"
                    :value="row.desc"
                    @input="row.desc = ($event.target as HTMLInputElement).value"
                  />
                </td>
                <td v-else class="mbd-td mbd-td--muted">{{ row.desc }}</td>

                <!-- ON HAND -->
                <td class="mbd-td mbd-td--num mbd-td--muted">{{ row.onHand.toLocaleString('id-ID') }}</td>

                <!-- COUNTED (always editable) -->
                <td class="mbd-td mbd-td--input mbd-td--counted">
                  <input
                    class="mbd-qty-input"
                    type="number"
                    min="0"
                    :value="row.counted ?? ''"
                    placeholder="0"
                    @input="setCounted(row, ($event.target as HTMLInputElement).value)"
                  />
                </td>

                <!-- DIFFERENCE (count) / NEW ON HAND (in-out) -->
                <td
                  v-if="!isInOut"
                  class="mbd-td mbd-td--num"
                  :class="{
                    'mbd-diff--pos': (diffOf(row) ?? 0) > 0,
                    'mbd-diff--neg': (diffOf(row) ?? 0) < 0,
                    'mbd-diff--uncounted': diffOf(row) === null,
                  }"
                >{{ diffLabel(row) }}</td>
                <td v-else class="mbd-td mbd-td--num">
                  {{ newOnHandOf(row) !== null ? newOnHandOf(row)!.toLocaleString('id-ID') : '—' }}
                </td>

                <!-- UNIT -->
                <td class="mbd-td mbd-td--muted">{{ row.unit }}</td>

                <!-- REMOVE -->
                <td class="mbd-td mbd-td--del">
                  <button class="mbd-del-btn" type="button" aria-label="Remove batch" @click="removeRow(row.key)">
                    <MpIcon name="minus-circular" size="sm" />
                  </button>
                </td>
              </tr>

              <!-- Select batch row — same pattern as "Select product" in warehouse transfer -->
              <tr class="mbd-tr mbd-tr--select">
                <td class="mbd-td mbd-td--select-cell">
                  <MpPopover id="mbd-select-batch" is-close-on-select use-portal>
                    <MpPopoverTrigger>
                      <div class="mbd-batch-trigger">
                        <span class="mbd-batch-placeholder">Select batch</span>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" class="mbd-batch-chevron">
                          <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
                        </svg>
                      </div>
                    </MpPopoverTrigger>
                    <MpPopoverContent :class="css({ minWidth: '280px', width: 'max-content' })">
                      <MpPopoverList>
                        <MpPopoverListItem
                          v-for="b in availableBatches"
                          :key="b.batchNo"
                          @click="addWarehouseBatch(b.batchNo)"
                        >
                          {{ b.batchNo }} — exp. {{ isoToDisplay(b.expiryDate) }}
                        </MpPopoverListItem>
                        <MpPopoverListItem v-if="!availableBatches.length" disabled>
                          All batches added
                        </MpPopoverListItem>
                      </MpPopoverList>
                    </MpPopoverContent>
                  </MpPopover>
                </td>
                <td colspan="7" class="mbd-td mbd-td--select-empty" />
              </tr>

              <!-- Pagination info row -->
              <tr class="mbd-tr mbd-tr--info">
                <td colspan="8" class="mbd-td mbd-td--pagination">
                  Showing {{ displayRows.length }} of {{ rows.length }} batches
                </td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>

      <!-- Footer -->
      <footer class="mbd-footer">
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="handleCancel">Cancel</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="handleSave">Save</button>
      </footer>

    </div>
  </div>
</template>

<style scoped>
/* ── Overlay + panel ─────────────────────────────────────────────────────────── */
.mbd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.mbd-panel {
  margin: var(--mp-spacing-3);
  width: min(1400px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 12px);
  overflow: hidden;
}

/* ── Header ──────────────────────────────────────────────────────────────────── */
.mbd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.mbd-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-default); }
.mbd-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.mbd-close:hover { background: var(--mp-background-neutral-hovered); }

/* ── Content area ────────────────────────────────────────────────────────────── */
.mbd-content {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: 20px;
}

/* ── Product info bar ────────────────────────────────────────────────────────── */
.mbd-info-bar {
  display: flex; align-items: center; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.mbd-info-product { display: flex; align-items: center; gap: var(--mp-spacing-3); flex: 1; min-width: 0; }
.mbd-info-thumb {
  width: 40px; height: 40px; border-radius: var(--mp-radii-md);
  object-fit: cover; flex-shrink: 0;
  border: 1px solid var(--mp-border-subtle);
  background: var(--mp-background-neutral);
}
.mbd-info-thumb--empty { background: var(--mp-background-neutral-subtle); }
.mbd-info-names { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.mbd-info-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.mbd-info-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.mbd-info-stats { display: flex; gap: var(--mp-spacing-6); flex-shrink: 0; }
.mbd-stat { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }
.mbd-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.mbd-stat-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; font-weight: var(--mp-font-weights-medium); }
.mbd-stat--pos .mbd-stat-value { color: var(--mp-text-success, #18794e); }
.mbd-stat--neg .mbd-stat-value { color: var(--mp-text-danger, #a8352d); }

/* ── Filter bar ──────────────────────────────────────────────────────────────── */
.mbd-filter-bar {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3);
}
.mbd-filter-left {
  display: flex; align-items: center; gap: var(--mp-spacing-2);
}
.mbd-add-new-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-text-default); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral); font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default); cursor: pointer; white-space: nowrap;
}
.mbd-add-new-btn:hover { background: var(--mp-background-neutral-hovered); }
.mbd-progress-btn {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16)); border-radius: var(--mp-radii-md);
  background: var(--mp-background-neutral); font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default); cursor: pointer;
}
.mbd-progress-btn svg { color: var(--mp-icon-default); }
.mbd-progress-btn--placeholder { color: var(--mp-text-placeholder); }
.mbd-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: 280px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-icon-default);
}
.mbd-search-input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.mbd-search-input::placeholder { color: var(--mp-text-placeholder); }

/* ── Table ───────────────────────────────────────────────────────────────────── */
.mbd-table-wrap {
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  overflow: clip;
  overflow-x: auto;
}
.mbd-table {
  width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0;
  min-width: 1000px;
}
.mbd-col-batch   { width: 170px; }
.mbd-col-expiry  { width: 172px; }
.mbd-col-desc    { /* no width — flexibly absorbs remaining space after fixed cols */ }
.mbd-col-num     { width: 150px; }
.mbd-col-counted { width: 160px; }
.mbd-col-unit    { width: 78px; }
.mbd-col-del     { width: 44px; }
.mbd-th {
  height: var(--mp-sizes-7, 28px);
  text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.mbd-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.mbd-th--del { padding: 0; }

.mbd-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: top;
  background: var(--mp-background-neutral-subtle);
}
.mbd-td--muted { color: var(--mp-text-secondary); }
.mbd-td--num { text-align: right; white-space: nowrap; padding: 8px var(--mp-spacing-2) 8px var(--mp-spacing-4); }

/* White editable cells — focus ring via ::after (box-shadow: inset is painted
   before collapsed borders and gets covered on left/right; ::after is in the
   normal stacking context and paints on top of everything). */
.mbd-td--input { padding: 0; background: var(--mp-background-neutral, #fff); position: relative; }
.mbd-td--input:focus-within::after {
  content: ''; position: absolute; inset: 0;
  border: 1px solid var(--mp-border-bold);
  z-index: 2; pointer-events: none;
}

/* Counted cell is white + right-aligned */
.mbd-td--counted { padding: 0; background: var(--mp-background-neutral, #fff); position: relative; }
.mbd-td--counted:focus-within::after {
  content: ''; position: absolute; inset: 0;
  border: 1px solid var(--mp-border-bold);
  z-index: 2; pointer-events: none;
}

.mbd-cell-input {
  width: 100%; height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-2); border: none; background: transparent;
  color: var(--mp-text-default); font-size: var(--mp-font-sizes-md); outline: none;
}
.mbd-cell-input::placeholder { color: var(--mp-text-placeholder); }

/* Date picker inside table cell — strip all borders/shadows from every child element.
   Safe because use-portal teleports the calendar popup outside the <td>. */
.mbd-td--datepicker :deep(.mp-datepicker__root) { width: 100%; height: 100%; }
.mbd-td--datepicker :deep(*) {
  border: none !important;
  box-shadow: none !important;
  border-radius: 0 !important;
  outline: none !important;
}

.mbd-qty-input {
  width: 100%; text-align: right; height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-2); border: none; background: transparent;
  color: var(--mp-text-default); font-size: var(--mp-font-sizes-md);
  font-variant-numeric: tabular-nums; outline: none;
}
.mbd-qty-input::placeholder { color: var(--mp-text-placeholder); }

/* Difference column */
.mbd-diff--pos { color: var(--mp-text-success, #18794e); }
.mbd-diff--neg { color: var(--mp-text-danger, #a8352d); }
.mbd-diff--uncounted { color: var(--mp-text-secondary); }

/* Remove button — 44px enforced by table-layout: fixed on the col */
.mbd-td--del {
  padding: 0; text-align: center; background: var(--mp-background-neutral-subtle);
}
.mbd-del-btn {
  display: flex; align-items: center; justify-content: center;
  width: 44px; height: var(--mp-sizes-10, 40px);
  border: none; background: none; cursor: pointer; color: var(--mp-text-secondary);
}
.mbd-del-btn:hover { background: var(--mp-background-neutral-subtle); color: var(--mp-text-danger, #dc2626); }

/* Pagination row — white bg, no gray */
.mbd-tr--info .mbd-td { background: var(--mp-background-neutral, #fff); }
.mbd-td--pagination {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  text-align: left; border-bottom: none;
}

/* Select batch row — same pattern as "Select product" in warehouse transfer */
.mbd-tr--select .mbd-td { border-bottom: none; }
.mbd-td--select-cell { padding: 0; background: var(--mp-background-neutral, #fff); border-bottom: none; position: relative; }
.mbd-td--select-cell:focus-within::after {
  content: ''; position: absolute; inset: 0;
  border: 1px solid var(--mp-border-bold);
  z-index: 2; pointer-events: none;
}
.mbd-td--select-empty { background: var(--mp-background-neutral, #fff); border-bottom: none; }
.mbd-batch-trigger {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; min-height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-3);
  cursor: pointer; background: transparent; border: none;
}
.mbd-batch-trigger:hover { background: var(--mp-background-neutral-subtle); }
.mbd-batch-placeholder { color: var(--mp-text-placeholder); font-size: var(--mp-font-sizes-md); }
.mbd-batch-chevron { color: var(--mp-icon-default); flex-shrink: 0; }

/* Footer */
.mbd-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
  background: var(--mp-background-stage);
}
</style>
