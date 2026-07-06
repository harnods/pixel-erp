<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { MpIcon, MpBadge, MpSpinner } from '@mekari/pixel3'
import { getWarehouseDetail } from '~/data/warehouseDetails'
import { productBySku } from '~/data/inventory'

const props = defineProps<{
  open: boolean
  sku: string
  warehouseId: string
  countedTotal: number
  productName: string
  productImg: string
}>()

const emit = defineEmits<{ 'update:open': [boolean] }>()

const warehouseStock = computed(() => {
  const wh = getWarehouseDetail(props.warehouseId)
  return wh?.stock.find(s => s.sku === props.sku)
})

interface SerialRow { serial: string; location: string; counted: boolean }

// Mark the first `countedTotal` serials as counted, the rest as not counted.
const allRows = computed<SerialRow[]>(() => {
  const serials = warehouseStock.value?.serials
  if (!serials) return []
  const all = [
    ...serials.available.map(u => ({ serial: u.serial, location: u.location })),
    ...serials.reserved.map(u => ({ serial: u.serial, location: u.location })),
  ]
  return all.map((u, i) => ({ ...u, counted: i < props.countedTotal }))
})

const totalOnHand = computed(() => allRows.value.length)
const difference = computed(() => props.countedTotal - totalOnHand.value)

// ── Progressive pagination ────────────────────────────────────────────────────
const PAGE_SIZE = 50
const shownCount = ref(PAGE_SIZE)
const loadingMore = ref(false)
const visibleRows = computed(() => allRows.value.slice(0, shownCount.value))
const hasMore = computed(() => shownCount.value < allRows.value.length)

function loadMore() {
  if (loadingMore.value || !hasMore.value) return
  loadingMore.value = true
  setTimeout(() => {
    shownCount.value = Math.min(shownCount.value + PAGE_SIZE, allRows.value.length)
    loadingMore.value = false
  }, 300)
}

const contentEl = ref<HTMLElement | null>(null)
const sentinelEl = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

function setupObserver() {
  observer?.disconnect()
  if (!contentEl.value || !sentinelEl.value) return
  observer = new IntersectionObserver(
    (entries) => { if (entries[0]!.isIntersecting) loadMore() },
    { root: contentEl.value, rootMargin: '0px 0px 100px 0px' },
  )
  observer.observe(sentinelEl.value)
}

watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  shownCount.value = PAGE_SIZE
  nextTick(setupObserver)
})

onUnmounted(() => observer?.disconnect())

function fmt(n: number) { return n.toLocaleString('id-ID') }
function fmtDiff(n: number) { return n > 0 ? `+${fmt(n)}` : fmt(n) }
function close() { emit('update:open', false) }
</script>

<template>
  <Transition name="vsd">
  <div v-if="open" class="vsd-overlay" @click.self="close">
    <div class="vsd-panel" role="dialog" aria-label="View serial numbers">

      <header class="vsd-header">
        <h2 class="vsd-title">Serial number detail</h2>
        <button class="vsd-close" type="button" aria-label="Close" @click="close">
          <MpIcon name="close" size="md" />
        </button>
      </header>

      <div ref="contentEl" class="vsd-content">

        <!-- Product info bar -->
        <div class="vsd-info-bar">
          <div class="vsd-info-product">
            <img v-if="productImg" class="vsd-info-thumb" :src="productImg" :alt="productName" loading="lazy" />
            <span v-else class="vsd-info-thumb vsd-info-thumb--empty" />
            <div class="vsd-info-names">
              <span class="vsd-info-name">{{ productName }}</span>
              <span class="vsd-info-sku">{{ sku }}</span>
            </div>
          </div>
          <div class="vsd-info-stats">
            <div class="vsd-stat">
              <span class="vsd-stat-label">On hand</span>
              <span class="vsd-stat-value">{{ fmt(totalOnHand) }}</span>
            </div>
            <div class="vsd-stat">
              <span class="vsd-stat-label">Counted</span>
              <span class="vsd-stat-value">{{ fmt(countedTotal) }}</span>
            </div>
            <div
              class="vsd-stat"
              :class="{ 'vsd-stat--pos': difference > 0, 'vsd-stat--neg': difference < 0 }"
            >
              <span class="vsd-stat-label">Difference</span>
              <span class="vsd-stat-value">{{ fmtDiff(difference) }}</span>
            </div>
          </div>
        </div>

        <!-- Table -->
        <div class="vsd-table-wrap">
          <table class="vsd-table">
            <colgroup>
              <col class="vsd-col-sn" />
              <col class="vsd-col-loc" />
              <col class="vsd-col-status" />
            </colgroup>
            <thead>
              <tr>
                <th class="vsd-th">Serial number</th>
                <th class="vsd-th">Location</th>
                <th class="vsd-th">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in visibleRows" :key="row.serial" class="vsd-tr" :class="{ 'vsd-tr--removed': !row.counted }">
                <td class="vsd-td vsd-td--mono" :class="{ 'vsd-td--strike': !row.counted }">{{ row.serial }}</td>
                <td class="vsd-td vsd-td--muted" :class="{ 'vsd-td--strike': !row.counted }">{{ row.location }}</td>
                <td class="vsd-td vsd-td--status">
                  <MpBadge v-if="row.counted" variant="success">Counted</MpBadge>
                  <MpBadge v-else variant="danger">Not counted</MpBadge>
                </td>
              </tr>
              <tr v-if="!allRows.length" class="vsd-tr">
                <td colspan="3" class="vsd-td vsd-td--empty">No serial number data available.</td>
              </tr>
            </tbody>
          </table>
          <div ref="sentinelEl" class="vsd-sentinel" aria-hidden="true" />
          <div v-if="loadingMore" class="vsd-loading">
            <MpSpinner size="sm" /> Loading…
          </div>
        </div>

        <p class="vsd-count">Showing {{ visibleRows.length }} of {{ allRows.length }} serial numbers</p>

      </div>

    </div>
  </div>
  </Transition>
</template>

<style scoped>
.vsd-enter-active,
.vsd-leave-active { transition: background-color 250ms ease; }
.vsd-enter-from, .vsd-leave-to { background-color: transparent; }
.vsd-enter-active :deep(.vsd-panel) { transition: transform 350ms ease-out; }
.vsd-leave-active :deep(.vsd-panel)  { transition: transform 250ms ease-in; }
.vsd-enter-from :deep(.vsd-panel),
.vsd-leave-to :deep(.vsd-panel) { transform: translateX(calc(100% + 12px)); }

.vsd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.vsd-panel {
  margin: var(--mp-spacing-3);
  width: min(800px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}

.vsd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.vsd-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-default); }
.vsd-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.vsd-close:hover { background: var(--mp-background-neutral-hovered); }

.vsd-content {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: 20px;
}
.vsd-content > * { flex-shrink: 0; }

.vsd-info-bar {
  display: flex; align-items: center; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.vsd-info-product { display: flex; align-items: center; gap: var(--mp-spacing-3); flex: 1; min-width: 0; }
.vsd-info-thumb {
  width: 40px; height: 40px; border-radius: var(--mp-radii-md);
  object-fit: cover; flex-shrink: 0;
  border: 1px solid var(--mp-border-subtle);
  background: var(--mp-background-neutral);
}
.vsd-info-thumb--empty { background: var(--mp-background-neutral-subtle); }
.vsd-info-names { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.vsd-info-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.vsd-info-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.vsd-info-stats { display: flex; gap: var(--mp-spacing-6); flex-shrink: 0; }
.vsd-stat { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }
.vsd-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.vsd-stat-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; font-weight: var(--mp-font-weights-medium); }
.vsd-stat--pos .vsd-stat-value { color: var(--mp-text-success, #18794e); }
.vsd-stat--neg .vsd-stat-value { color: var(--mp-text-danger, #a8352d); }

.vsd-table-wrap {
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  overflow: hidden;
}
.vsd-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; }
.vsd-col-sn     { width: 220px; }
.vsd-col-loc    { /* flexible */ }
.vsd-col-status { width: 120px; }

.vsd-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
  position: sticky; top: 0; z-index: 1;
}

.vsd-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: middle;
  background: var(--mp-background-neutral, #fff);
}
.vsd-td--muted { color: var(--mp-text-secondary); }
.vsd-td--mono { font-family: monospace; font-size: var(--mp-font-sizes-md); }
.vsd-td--strike { text-decoration: line-through; }
.vsd-td--status { padding: 8px var(--mp-spacing-2); }
.vsd-td--empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-6); }

/* Not-counted rows get danger-subtle background */
.vsd-tr--removed .vsd-td { background: var(--mp-background-danger-subtle, #fff0ee); }

.vsd-sentinel { height: 1px; }
.vsd-loading {
  display: flex; align-items: center; justify-content: center;
  gap: var(--mp-spacing-2); padding: var(--mp-spacing-3);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
  background: var(--mp-background-neutral, #fff);
}
.vsd-count { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

</style>
