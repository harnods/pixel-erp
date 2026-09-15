<script setup lang="ts">
/**
 * Batch traceability detail — "View locations" drawer: where a batch sits inside one
 * warehouse (PRD story 7, Stock position › action item per warehouse).
 *
 * Read-only, so no footer — the header × is the only way out
 * (rule/modal-drawer-close-explicit-only). Shell copied from BillsFiltersDrawer.vue
 * (rule/drawer-custom-shell).
 */
import { computed } from 'vue'
import { MpButton, MpIcon } from '@mekari/pixel3'
import { batchStorageLocations } from '~/data/batchTraceability'
import { warehouses } from '~/data/warehouses'

const props = defineProps<{
  isOpen: boolean
  sku: string
  batchNo: string
  warehouseId: string | null
  unit: string
}>()
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void }>()
const { t } = useLocale()

const warehouseName = computed(() => warehouses.find((w) => w.id === props.warehouseId)?.name ?? '')
const locations = computed(() =>
  props.isOpen && props.warehouseId ? batchStorageLocations(props.sku, props.batchNo, props.warehouseId) : [],
)
const qtyFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })

function close() { emit('update:isOpen', false) }
</script>

<template>
  <Teleport to="body">
    <Transition name="bsl">
      <div v-if="isOpen" class="bsl-overlay">
        <div class="bsl-panel" role="dialog" :aria-label="t('Storage locations')">
          <header class="bsl-header">
            <div class="bsl-heading">
              <span class="bsl-title">{{ t('Storage locations') }}</span>
              <span class="bsl-subtitle">{{ warehouseName }} · {{ batchNo }}</span>
            </div>
            <MpButton is-rounded class="bsl-close" :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>

          <div class="bsl-body">
            <table v-if="locations.length" class="bsl-table">
              <thead>
                <tr>
                  <th class="bsl-th">{{ t('Storage location') }}</th>
                  <th class="bsl-th bsl-th--num">{{ t('On hand') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="l in locations" :key="l.location">
                  <td class="bsl-td">{{ l.location || '—' }}</td>
                  <td class="bsl-td bsl-td--num">{{ qtyFormat.format(l.onHand) }} {{ unit }}</td>
                </tr>
              </tbody>
            </table>
            <p v-else class="bsl-empty">{{ t('Not stocked in any warehouse') }}</p>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.bsl-enter-active, .bsl-leave-active { transition: background-color 250ms ease; }
.bsl-enter-from, .bsl-leave-to { background-color: transparent; }
.bsl-enter-active .bsl-panel { transition: transform 350ms ease-out; }
.bsl-leave-active .bsl-panel { transition: transform 250ms ease-in; }
.bsl-enter-from .bsl-panel, .bsl-leave-to .bsl-panel { transform: translateX(calc(100% + 12px)); }

.bsl-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.bsl-panel {
  margin: var(--mp-spacing-3);
  width: min(480px, calc(100% - 24px)); height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden;
}
.bsl-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.bsl-heading { display: flex; flex-direction: column; min-width: 0; }
.bsl-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bsl-subtitle { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.bsl-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; color: var(--mp-icon-default);
}
.bsl-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3) !important; }

.bsl-body { flex: 1; overflow-y: auto; padding: var(--mp-spacing-4); }

/* ErpTablePage header/row spec (docs/patterns/ErpTablePage.md). */
.bsl-table { width: 100%; border-collapse: collapse; }
.bsl-th {
  height: var(--mp-sizes-7, 28px); text-align: left;
  padding: var(--mp-spacing-1) var(--mp-spacing-4) var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase; color: var(--mp-text-secondary); white-space: nowrap;
}
.bsl-th--num { text-align: right; padding: var(--mp-spacing-1) var(--mp-spacing-2) var(--mp-spacing-1) var(--mp-spacing-4); }
.bsl-td {
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4) var(--mp-spacing-2\.5) var(--mp-spacing-2);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.bsl-td--num {
  text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums;
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-2) var(--mp-spacing-2\.5) var(--mp-spacing-4);
}
.bsl-empty { margin: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
