<script setup lang="ts">
/**
 * PickBatchDrawer — single-table batch picker, matching the Pixel library's
 * ManageBatchDrawer (Storybook: components-managebatchdrawer--default). No scan
 * bar, no bins, no ad-hoc "add new batch" — just type a qty against each real,
 * already-known warehouse batch.
 */
import { ref, reactive, computed, watch } from 'vue'
import { MpIcon } from '@mekari/pixel3'
import { formatDate } from '~/utils/date'
import { getWarehouseDetail } from '~/data/warehouseDetails'

export interface PickedBatch { batchNo: string; qty: number }

// Batches carry no description in the data model — same representative pool
// ManageBatchDrawer.vue (the app's warehouse-ops picker) cycles through.
const DEMO_DESCS = [
  'Ethiopia Yirgacheffe, Grade 1, washed – harvest 2025',
  'Colombia Huila, natural process, lot #COL-25A',
  'Medium roast, 3-day degassing – roasted Jun 2025',
  'Single origin, certified organic, lot #B12',
]

const props = defineProps<{
  open: boolean
  productName: string
  productImg?: string
  sku: string
  warehouseId: string
  warehouseName: string
  unit: string
  /** Selected qty shown as "X / targetCount <unit>" */
  targetCount: number
  modelValue: PickedBatch[]
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  save: [batches: PickedBatch[]]
}>()

interface Row { batchNo: string; expiryDate: string; desc: string; available: number; qty: string }

const rows = reactive<Row[]>([])
const search = ref('')
const saveError = ref('')

watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  const wh = getWarehouseDetail(props.warehouseId)
  const item = wh?.stock.find(s => s.sku === props.sku)
  const qtyByBatch = new Map(props.modelValue.map(b => [b.batchNo, b.qty]))
  rows.splice(0, rows.length, ...(item?.batches ?? []).map((b, i) => ({
    batchNo: b.batchNo,
    expiryDate: b.expiryDate,
    desc: DEMO_DESCS[i % DEMO_DESCS.length]!,
    available: b.available,
    qty: qtyByBatch.has(b.batchNo) ? String(qtyByBatch.get(b.batchNo)) : '',
  })))
  search.value = ''
  saveError.value = ''
}, { immediate: true })

const filteredRows = computed(() => {
  const q = search.value.trim().toLowerCase()
  return q ? rows.filter(r => r.batchNo.toLowerCase().includes(q)) : rows
})
const num = (v: string) => Number(v) || 0
const totalSelected = computed(() => rows.reduce((s, r) => s + num(r.qty), 0))

function onQtyInput(row: Row) {
  saveError.value = ''
  const capped = Math.min(num(row.qty), row.available)
  if (num(row.qty) > row.available) row.qty = capped ? String(capped) : ''
}

function handleCancel() { emit('update:open', false) }
function handleSave() {
  if (totalSelected.value > props.targetCount) {
    saveError.value = `${totalSelected.value} of ${props.targetCount} ${props.unit} specified — that's more than the qty to pick.`
    return
  }
  const picked: PickedBatch[] = rows.filter(r => num(r.qty) > 0).map(r => ({ batchNo: r.batchNo, qty: num(r.qty) }))
  emit('save', picked)
  emit('update:open', false)
}
</script>

<template>
  <Transition name="pbd">
  <div v-if="open" class="pbd-overlay" @click.self="handleCancel">
    <div class="pbd-panel" role="dialog" aria-label="Manage batch">

      <header class="pbd-header">
        <h2 class="pbd-title">Manage batch</h2>
        <button class="pbd-close" type="button" aria-label="Close" @click="handleCancel">
          <MpIcon name="close" size="md" />
        </button>
      </header>

      <div class="pbd-content">
        <div class="pbd-info-bar">
          <div class="pbd-info-product">
            <img v-if="productImg" class="pbd-info-thumb" :src="productImg" :alt="productName" loading="lazy" />
            <span v-else class="pbd-info-thumb pbd-info-thumb--empty" />
            <div class="pbd-info-col">
              <span class="pbd-info-label">Product</span>
              <span class="pbd-info-value">{{ productName }}</span>
            </div>
          </div>
          <div class="pbd-info-col">
            <span class="pbd-info-label">SKU</span>
            <span class="pbd-info-value">{{ sku }}</span>
          </div>
          <div class="pbd-info-col">
            <span class="pbd-info-label">Warehouse</span>
            <span class="pbd-info-value">{{ warehouseName || '—' }}</span>
          </div>
          <div class="pbd-info-col">
            <span class="pbd-info-label">Selected</span>
            <span class="pbd-info-value">{{ totalSelected }}/{{ targetCount }} {{ unit }}</span>
          </div>
        </div>

        <div class="pbd-search">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          </svg>
          <input v-model="search" class="pbd-search-input" type="text" placeholder="Search batch" />
        </div>

        <div class="pbd-table-wrap">
          <table class="pbd-table">
            <colgroup>
              <col style="width: 200px" /><col style="width: 140px" /><col />
              <col style="width: 110px" /><col style="width: 120px" /><col style="width: 78px" />
            </colgroup>
            <thead>
              <tr>
                <th class="pbd-th">Batch</th>
                <th class="pbd-th">Expiry date</th>
                <th class="pbd-th">Description</th>
                <th class="pbd-th pbd-th--right">Available</th>
                <th class="pbd-th">Qty</th>
                <th class="pbd-th">Unit</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in filteredRows" :key="row.batchNo" class="pbd-tr">
                <td class="pbd-td pbd-td--muted">{{ row.batchNo }}</td>
                <td class="pbd-td pbd-td--muted">{{ formatDate(row.expiryDate) }}</td>
                <td class="pbd-td pbd-td--muted">{{ row.desc }}</td>
                <td class="pbd-td pbd-td--muted pbd-td--right">{{ row.available }}</td>
                <td class="pbd-td pbd-td--input">
                  <input v-model="row.qty" class="pbd-qty-input" type="number" min="0" :max="row.available" placeholder="0" @input="onQtyInput(row)" />
                </td>
                <td class="pbd-td pbd-td--muted">{{ unit }}</td>
              </tr>
              <tr v-if="!filteredRows.length">
                <td class="pbd-td pbd-td--empty" colspan="6">No batches found.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-if="saveError" class="pbd-save-error">{{ saveError }}</p>
      </div>

      <footer class="pbd-footer">
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="handleCancel">Cancel</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="handleSave">Save</button>
      </footer>

    </div>
  </div>
  </Transition>
</template>

<style scoped>
.pbd-enter-active,
.pbd-leave-active { transition: background-color 250ms ease; }
.pbd-enter-from, .pbd-leave-to { background-color: transparent; }
.pbd-enter-active :deep(.pbd-panel) { transition: transform 350ms ease-out; }
.pbd-leave-active :deep(.pbd-panel) { transition: transform 250ms ease-in; }
.pbd-enter-from :deep(.pbd-panel),
.pbd-leave-to :deep(.pbd-panel) { transform: translateX(calc(100% + 12px)); }

.pbd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.pbd-panel {
  margin: var(--mp-spacing-3);
  width: min(1000px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
}

.pbd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.pbd-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-default); }
.pbd-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.pbd-close:hover { background: var(--mp-background-neutral-hovered); }

.pbd-content { flex: 1; min-height: 0; overflow-y: auto; padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: var(--mp-spacing-4); }

.pbd-info-bar {
  flex-shrink: 0; display: flex; align-items: center; gap: var(--mp-spacing-6);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.pbd-info-product { display: flex; align-items: center; gap: var(--mp-spacing-3); }
.pbd-info-thumb { width: 40px; height: 40px; border-radius: var(--mp-radii-md); object-fit: cover; flex-shrink: 0; background: var(--mp-background-neutral-subtle); }
.pbd-info-thumb--empty { background: var(--mp-border-default); }
.pbd-info-col { display: flex; flex-direction: column; gap: 2px; }
.pbd-info-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pbd-info-value { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.pbd-search {
  flex-shrink: 0; display: flex; align-items: center; gap: var(--mp-spacing-2); align-self: flex-end;
  width: 280px; padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-text-subtle);
}
.pbd-search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.pbd-search-input::placeholder { color: var(--mp-text-placeholder); }

/* Table shell — matches ManageBatchDrawer.vue's .mbd-table pattern: a bordered,
   rounded box; uppercase secondary-colour headers; read-only cells default to a
   subtle gray background, editable cells go white with a focus ring. */
.pbd-table-wrap {
  flex: 1; min-height: 0; overflow: auto;
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-md);
}
.pbd-table { width: 100%; table-layout: fixed; border-collapse: collapse; min-width: 700px; }
.pbd-th {
  position: sticky; top: 0; z-index: 1;
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral, #fff);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.pbd-th--right { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.pbd-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); vertical-align: top;
  border-bottom: 1px solid var(--mp-border-default);
  background: var(--mp-background-neutral-subtle);
}
.pbd-td--muted { color: var(--mp-text-secondary); }
.pbd-td--right { text-align: right; font-variant-numeric: tabular-nums; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
.pbd-td--input { padding: 0; background: var(--mp-background-neutral, #fff); position: relative; }
.pbd-td--empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-6) 0; background: var(--mp-background-neutral, #fff); }
.pbd-qty-input {
  width: 100%; height: var(--mp-sizes-10, 40px); box-sizing: border-box;
  padding: 0 var(--mp-spacing-2); border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums;
}
.pbd-td--input:focus-within::after {
  content: ''; position: absolute; inset: 0;
  border: 1px solid var(--mp-border-bold); z-index: 2; pointer-events: none;
}

.pbd-save-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-critical); }

.pbd-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default);
}
</style>
