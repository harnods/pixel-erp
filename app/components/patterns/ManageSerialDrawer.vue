<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { MpIcon, MpBadge } from '@mekari/pixel3'
import { productBySku } from '~/data/inventory'
import { getWarehouseDetail } from '~/data/warehouseDetails'

interface SerialRow {
  serial: string
  counted: boolean
}

const props = defineProps<{
  open: boolean
  sku: string
  warehouseId: string
  targetCount: number
  modelValue: string[]
  /** 'count' (default) = stock count; 'in-out' = stock in/out */
  kind?: 'count' | 'in-out'
  /** Signed delta for in-out mode (e.g. +2 stock in, -5 stock out). */
  delta?: number
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  'save': [serials: string[]]
}>()

const PAGE_SIZE = 20

const rows = ref<SerialRow[]>([])
const inputText = ref('')
const search = ref('')
const page = ref(1)
const saveError = ref('')

watch(() => props.open, (isOpen) => {
  if (!isOpen) return

  const wh = getWarehouseDetail(props.warehouseId)
  const sr = wh?.stock.find(s => s.sku === props.sku)?.serials
  const warehouseSerials: string[] = [
    ...(sr?.available.map(u => u.serial) ?? []),
    ...(sr?.reserved.map(u => u.serial) ?? []),
  ]

  if (props.modelValue.length > 0) {
    const countedSet = new Set(props.modelValue)
    const seen = new Set<string>()
    const result: SerialRow[] = warehouseSerials.map(s => {
      seen.add(s)
      return { serial: s, counted: countedSet.has(s) }
    })
    for (const s of props.modelValue) {
      if (!seen.has(s)) result.push({ serial: s, counted: true })
    }
    rows.value = result
  } else {
    rows.value = warehouseSerials.map(s => ({ serial: s, counted: true }))
  }

  inputText.value = ''
  search.value = ''
  page.value = 1
  saveError.value = ''
}, { immediate: true })

const product = computed(() => productBySku(props.sku))
const warehouseStock = computed(() => {
  const wh = getWarehouseDetail(props.warehouseId)
  return wh?.stock.find(s => s.sku === props.sku)
})
const productImg = computed(() => product.value?.img ?? '')
const productName = computed(() => warehouseStock.value?.name ?? product.value?.name ?? props.sku)
const onHandCount = computed(() => warehouseStock.value?.onHand ?? 0)
// countedCount = rows currently marked as counted (for table X/Y indicator + validation)
const countedCount = computed(() => rows.value.filter(r => r.counted).length)
// Info bar stats are driven by targetCount (what user entered in the form), not table state
const difference = computed(() => props.targetCount - onHandCount.value)
const isInOut = computed(() => props.kind === 'in-out')
const signedDelta = computed(() => props.delta ?? 0)
const newOnHand = computed(() => onHandCount.value + signedDelta.value)

function fmtSerial(n: number): string {
  return n.toLocaleString('id-ID') + ' serial number' + (n !== 1 ? 's' : '')
}
function fmtDiff(n: number): string {
  const abs = Math.abs(n)
  return (n >= 0 ? '+' : '−') + fmtSerial(abs)
}

function parseInput(): string[] {
  return inputText.value.split(/[\n,]+/).map(s => s.trim()).filter(Boolean)
}

function addToList() {
  const parsed = parseInput()
  const existing = new Set(rows.value.map(r => r.serial))
  const newOnes = parsed.filter(s => !existing.has(s))
  if (!newOnes.length) return
  rows.value.push(...newOnes.map(s => ({ serial: s, counted: true })))
  inputText.value = ''
  saveError.value = ''
}

function toggleRow(row: SerialRow) {
  row.counted = !row.counted
  saveError.value = ''
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return rows.value
  return rows.value.filter(r => r.serial.toLowerCase().includes(q))
})

const displayRows = computed(() => filtered.value.slice(0, page.value * PAGE_SIZE))
const hasMore = computed(() => page.value * PAGE_SIZE < filtered.value.length)

function loadMore() {
  page.value++
}

function handleCancel() {
  emit('update:open', false)
}

function handleSave() {
  if (countedCount.value !== props.targetCount) {
    saveError.value = `${countedCount.value} of ${props.targetCount} serial numbers specified. Add or remove serial numbers to match the counted quantity.`
    return
  }
  saveError.value = ''
  emit('save', rows.value.filter(r => r.counted).map(r => r.serial))
  emit('update:open', false)
}
</script>

<template>
  <div v-if="open" class="msn-overlay" @click.self="handleCancel">
    <div class="msn-panel" role="dialog" aria-label="Manage serial number">

      <header class="msn-header">
        <h2 class="msn-title">Manage serial number</h2>
        <button class="msn-close" type="button" aria-label="Close" @click="handleCancel">
          <MpIcon name="close" size="md" />
        </button>
      </header>

      <div class="msn-content">

        <div class="msn-info-bar">
          <div class="msn-info-product">
            <img v-if="productImg" class="msn-info-thumb" :src="productImg" :alt="productName" loading="lazy" />
            <span v-else class="msn-info-thumb msn-info-thumb--empty" />
            <div class="msn-info-names">
              <span class="msn-info-name">{{ productName }}</span>
              <span class="msn-info-sku">{{ sku }}</span>
            </div>
          </div>
          <div class="msn-info-stats">
            <div class="msn-stat">
              <span class="msn-stat-label">On hand qty</span>
              <span class="msn-stat-value">{{ fmtSerial(onHandCount) }}</span>
            </div>
            <!-- stock count stats -->
            <template v-if="!isInOut">
              <div class="msn-stat">
                <span class="msn-stat-label">Counted qty</span>
                <span class="msn-stat-value">{{ fmtSerial(targetCount) }}</span>
              </div>
              <div class="msn-stat" :class="{ 'msn-stat--pos': difference > 0, 'msn-stat--neg': difference < 0 }">
                <span class="msn-stat-label">Difference</span>
                <span class="msn-stat-value">{{ fmtDiff(difference) }}</span>
              </div>
            </template>
            <!-- stock in/out stats -->
            <template v-else>
              <div class="msn-stat" :class="{ 'msn-stat--pos': signedDelta > 0, 'msn-stat--neg': signedDelta < 0 }">
                <span class="msn-stat-label">Stock in/out qty</span>
                <span class="msn-stat-value">{{ fmtDiff(signedDelta) }}</span>
              </div>
              <div class="msn-stat">
                <span class="msn-stat-label">New on hand qty</span>
                <span class="msn-stat-value">{{ fmtSerial(newOnHand) }}</span>
              </div>
            </template>
          </div>
        </div>

        <div class="msn-form-section">
          <label class="msn-form-label">Serial number</label>
          <textarea
            v-model="inputText"
            class="msn-textarea"
            placeholder="Paste or type serial numbers here. Supports comma-separated or one per line."
          />
          <div class="msn-form-action">
            <button class="btn-enterprise btn-enterprise--secondary" type="button" @click="addToList">Add to list</button>
          </div>
          <p v-if="saveError" class="msn-save-error">{{ saveError }}</p>
        </div>

        <div class="msn-filter-bar">
          <div class="msn-search">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M22 22L20 20M21 11.5C21 16.747 16.747 21 11.5 21C6.253 21 2 16.747 2 11.5C2 6.253 6.253 2 11.5 2C16.747 2 21 6.253 21 11.5Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            </svg>
            <input v-model="search" class="msn-search-input" type="text" placeholder="Search..." />
          </div>
        </div>

        <div class="msn-table-wrap">
          <table class="msn-table">
            <colgroup>
              <col class="msn-col-serial" />
              <col class="msn-col-status" />
              <col class="msn-col-toggle" />
            </colgroup>
            <thead>
              <tr>
                <th class="msn-th">SERIAL NUMBER ({{ countedCount }} / {{ targetCount }})</th>
                <th class="msn-th">STATUS</th>
                <th class="msn-th msn-th--del" />
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in displayRows" :key="row.serial" class="msn-tr" :class="{ 'msn-tr--removed': !row.counted }">
                <td class="msn-td" :class="{ 'msn-td--strike': !row.counted }">{{ row.serial }}</td>
                <td class="msn-td msn-td--status">
                  <MpBadge v-if="row.counted" type="success">Counted</MpBadge>
                  <MpBadge v-else type="danger">Not counted</MpBadge>
                </td>
                <td class="msn-td msn-td--del">
                  <button
                    class="msn-toggle-btn"
                    :class="row.counted ? 'msn-toggle-btn--remove' : 'msn-toggle-btn--restore'"
                    type="button"
                    :aria-label="row.counted ? 'Mark as not counted' : 'Mark as counted'"
                    @click="toggleRow(row)"
                  >
                    <MpIcon :name="row.counted ? 'minus-circular' : 'add'" size="sm" />
                  </button>
                </td>
              </tr>

              <tr class="msn-tr msn-tr--info">
                <td colspan="3" class="msn-td msn-td--pagination">
                  <span>Showing {{ displayRows.length }} of {{ filtered.length }} serial numbers</span>
                  <button v-if="hasMore" class="msn-load-more" type="button" @click="loadMore">Load more</button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

      </div>

      <footer class="msn-footer">
        <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="handleCancel">Cancel</button>
        <button class="btn-enterprise btn-enterprise--primary" type="button" @click="handleSave">Save</button>
      </footer>

    </div>
  </div>
</template>

<style scoped>
.msn-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.msn-panel {
  margin: var(--mp-spacing-3);
  width: min(800px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 12px);
  overflow: hidden;
  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
}

.msn-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.msn-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-default); }
.msn-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.msn-close:hover { background: var(--mp-background-neutral-hovered); }

.msn-content {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: 20px;
}
.msn-content > * { flex-shrink: 0; }

.msn-info-bar {
  display: flex; align-items: center; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.msn-info-product { display: flex; align-items: center; gap: var(--mp-spacing-3); flex: 1; min-width: 0; }
.msn-info-thumb {
  width: 40px; height: 40px; border-radius: var(--mp-radii-md);
  object-fit: cover; flex-shrink: 0;
  border: 1px solid var(--mp-border-subtle);
  background: var(--mp-background-neutral);
}
.msn-info-thumb--empty { background: var(--mp-background-neutral-subtle); }
.msn-info-names { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.msn-info-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.msn-info-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.msn-info-stats { display: flex; gap: var(--mp-spacing-6); flex-shrink: 0; }
.msn-stat { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }
.msn-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.msn-stat-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; font-weight: var(--mp-font-weights-medium); }
.msn-stat--pos .msn-stat-value { color: var(--mp-text-success, #18794e); }
.msn-stat--neg .msn-stat-value { color: var(--mp-text-danger, #a8352d); }

.msn-form-section { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.msn-form-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.msn-textarea {
  width: 100%; height: 80px; resize: vertical;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-form, rgba(29,31,36,0.16));
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  background: var(--mp-background-neutral, #fff);
  outline: none; font-family: inherit; box-sizing: border-box;
}
.msn-textarea::placeholder { color: var(--mp-text-placeholder); }
.msn-textarea:focus { border-color: var(--mp-border-bold); }
.msn-form-action { display: flex; justify-content: flex-end; }
.msn-save-error { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-danger, #a8352d); }

.msn-filter-bar { display: flex; justify-content: flex-end; }
.msn-search {
  display: flex; align-items: center; gap: var(--mp-spacing-2); width: 240px;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border: 1px solid var(--mp-border-bold); border-radius: var(--mp-radii-full, 999px);
  color: var(--mp-icon-default);
}
.msn-search-input { flex: 1; min-width: 0; border: none; outline: none; background: none; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.msn-search-input::placeholder { color: var(--mp-text-placeholder); }

.msn-table-wrap {
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  overflow: hidden;
  overflow-x: auto;
}
.msn-table {
  width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0;
}
.msn-col-serial { /* fills remaining */ }
.msn-col-status { width: 120px; }
.msn-col-toggle { width: 44px; }
.msn-th {
  height: var(--mp-sizes-7, 28px);
  text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
  white-space: nowrap;
}
.msn-th:last-child { border-right: none; }
.msn-th--del { padding: 0; }

.msn-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  border-right: 1px solid var(--mp-border-default);
  vertical-align: top;
  background: var(--mp-background-neutral, #fff);
}
.msn-td:last-child { border-right: none; }
.msn-td--strike { text-decoration: line-through; color: var(--mp-text-secondary); }
.msn-tr--removed .msn-td { background: var(--mp-background-danger-subtle, #fff5f5); }

.msn-td--status { padding: 8px var(--mp-spacing-2); vertical-align: middle; }
.msn-td--del {
  padding: 0; text-align: center; background: inherit;
}
.msn-toggle-btn {
  display: flex; align-items: center; justify-content: center;
  width: 44px; height: var(--mp-sizes-10, 40px);
  border: none; background: none; cursor: pointer;
}
.msn-toggle-btn--remove { color: var(--mp-text-secondary); }
.msn-toggle-btn--remove:hover { color: var(--mp-text-danger, #dc2626); }
.msn-toggle-btn--restore { color: var(--mp-text-secondary); }
.msn-toggle-btn--restore:hover { color: var(--mp-text-success, #18794e); }

.msn-tr--info .msn-td { background: var(--mp-background-neutral, #fff); }
.msn-td--pagination {
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary);
  text-align: left;
  border-bottom: none;
  display: flex; align-items: center; gap: var(--mp-spacing-3);
}
.msn-load-more {
  background: none; border: none; padding: 0; cursor: pointer;
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link);
}
.msn-load-more:hover { text-decoration: underline; text-underline-offset: 2px; }

.msn-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
  background: var(--mp-background-stage);
}
</style>
