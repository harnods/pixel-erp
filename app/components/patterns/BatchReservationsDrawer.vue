<script setup lang="ts">
import { computed } from 'vue'
import { MpIcon } from '@mekari/pixel3'

export interface BatchReservationRow { salesNo: string; orderNumber: string; qty: number }

const props = defineProps<{
  open: boolean
  productName: string
  productImg: string
  sku: string
  batchNo: string
  rows: BatchReservationRow[]
}>()

const emit = defineEmits<{ 'update:open': [boolean] }>()

const totalReserved = computed(() => props.rows.reduce((s, r) => s + r.qty, 0))

function fmt(n: number) { return n.toLocaleString('id-ID') }
function close() { emit('update:open', false) }
</script>

<template>
  <Transition name="brd">
  <div v-if="open" class="brd-overlay">
    <div class="brd-panel" role="dialog" aria-label="Batch reservations">

      <header class="brd-header">
        <h2 class="brd-title">Batch reservations (temporary design)</h2>
        <button class="brd-close" type="button" aria-label="Close" @click="close">
          <MpIcon name="close" size="md" />
        </button>
      </header>

      <div class="brd-content">

        <!-- Product info bar -->
        <div class="brd-info-bar">
          <div class="brd-info-product">
            <img v-if="productImg" class="brd-info-thumb" :src="productImg" :alt="productName" loading="lazy" />
            <span v-else class="brd-info-thumb brd-info-thumb--empty" />
            <div class="brd-info-names">
              <span class="brd-info-name">{{ productName }}</span>
              <span class="brd-info-sku">{{ sku }} · Batch {{ batchNo }}</span>
            </div>
          </div>
          <div class="brd-info-stats">
            <div class="brd-stat">
              <span class="brd-stat-label">Total reserved qty</span>
              <span class="brd-stat-value">{{ fmt(totalReserved) }}</span>
            </div>
          </div>
        </div>

        <!-- Table -->
        <div class="brd-table-wrap">
          <table class="brd-table">
            <colgroup>
              <col class="brd-col-order" />
              <col class="brd-col-num" />
            </colgroup>
            <thead>
              <tr>
                <th class="brd-th">Sales order</th>
                <th class="brd-th brd-th--num">Reserved qty</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in rows" :key="row.orderNumber" class="brd-tr">
                <td class="brd-td">{{ row.salesNo }}</td>
                <td class="brd-td brd-td--num">{{ fmt(row.qty) }}</td>
              </tr>
              <tr v-if="!rows.length" class="brd-tr">
                <td colspan="2" class="brd-td brd-td--empty">No orders have reserved this batch yet</td>
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
.brd-enter-active,
.brd-leave-active { transition: background-color 250ms ease; }
.brd-enter-from, .brd-leave-to { background-color: transparent; }
.brd-enter-active :deep(.brd-panel) { transition: transform 350ms ease-out; }
.brd-leave-active :deep(.brd-panel)  { transition: transform 250ms ease-in; }
.brd-enter-from :deep(.brd-panel),
.brd-leave-to :deep(.brd-panel) { transform: translateX(calc(100% + 12px)); }

.brd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.brd-panel {
  margin: var(--mp-spacing-3);
  width: min(560px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
  box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
}

.brd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.brd-title { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular, 400); color: var(--mp-text-default); }
.brd-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.brd-close:hover { background: var(--mp-background-neutral-hovered); }

.brd-content {
  flex: 1; min-height: 0; overflow-y: auto;
  padding: var(--mp-spacing-4); display: flex; flex-direction: column; gap: 20px;
}
.brd-content > * { flex-shrink: 0; }

.brd-info-bar {
  display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
}
.brd-info-product { display: flex; align-items: center; gap: var(--mp-spacing-3); flex: 1; min-width: 0; }
.brd-info-thumb {
  width: 40px; height: 40px; border-radius: var(--mp-radii-md);
  object-fit: cover; flex-shrink: 0;
  border: 1px solid var(--mp-border-subtle);
  background: var(--mp-background-neutral);
}
.brd-info-thumb--empty { background: var(--mp-background-neutral-subtle); }
.brd-info-names { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.brd-info-name { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.brd-info-sku { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.brd-info-stats { display: flex; gap: var(--mp-spacing-6); flex-shrink: 0; }
.brd-stat { display: flex; flex-direction: column; gap: 2px; align-items: flex-end; }
.brd-stat-label { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
.brd-stat-value { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); font-variant-numeric: tabular-nums; font-weight: var(--mp-font-weights-medium); }

.brd-table-wrap {
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  overflow: hidden;
  overflow-x: auto;
}
.brd-table { width: 100%; table-layout: fixed; border-collapse: collapse; border-spacing: 0; }
.brd-col-order { /* flexible */ }
.brd-col-num   { width: 140px; }

.brd-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-secondary); text-transform: uppercase;
  border-bottom: 1px solid var(--mp-border-default); white-space: nowrap;
}
.brd-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }

.brd-td {
  padding: 10px var(--mp-spacing-4) 10px var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
  vertical-align: top;
  background: var(--mp-background-neutral, #fff);
}
.brd-td--num { text-align: right; white-space: nowrap; padding: 10px var(--mp-spacing-2) 10px var(--mp-spacing-4); }
.brd-td--empty { text-align: center; color: var(--mp-text-secondary); padding: var(--mp-spacing-6); }
</style>
