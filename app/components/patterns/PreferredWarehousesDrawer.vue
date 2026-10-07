<script setup lang="ts">
/**
 * Preferred warehouses — a read-only drawer listing the warehouses that prefer one
 * vendor for a product (D23: the preferred vendor is chosen per SKU × warehouse).
 * Opened from the count link in the product page's Vendors tab. Same custom Teleport
 * overlay shell as BillsFiltersDrawer (MpDrawer has no structural CSS in this Pixel3
 * build); it closes only via × (rule/modal-drawer-close-explicit-only).
 */
import { MpIcon, MpButton } from '@mekari/pixel3'
import ContentList from '~/components/patterns/ContentList.vue'

export interface PreferredWarehouseRow {
  warehouseId: string
  warehouseName: string
  leadDays: number | null
  /** Set when the lead time is an estimate: where it comes from. */
  estimatedBasis: string
}

defineProps<{
  isOpen: boolean
  vendorName: string
  productName: string
  sku: string
  rows: PreferredWarehouseRow[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'open-warehouse', warehouseId: string): void
}>()

const { t, tf } = useLocale()
function close() { emit('update:isOpen', false) }
</script>

<template>
  <Teleport to="body">
    <Transition name="pwd">
      <div v-if="isOpen" class="pwd-overlay">
        <div class="pwd-panel" role="dialog" :aria-label="t('Preferred warehouses')">
          <header class="pwd-header">
            <span class="pwd-title">{{ t('Preferred warehouses') }}</span>
            <MpButton class="pwd-close" is-rounded :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>

          <div class="pwd-body">
            <ContentList :label="t('Vendor')" :value="vendorName" />
            <ContentList :label="t('Product')" :value="`${productName} (${sku})`" />

            <h3 class="pwd-subtitle">{{ tf('{n} warehouses', { n: rows.length }) }}</h3>
            <ul class="pwd-list">
              <li v-for="r in rows" :key="r.warehouseId" class="pwd-item">
                <a class="pwd-name" @click="emit('open-warehouse', r.warehouseId)">{{ r.warehouseName }}</a>
                <span v-if="r.leadDays != null" class="pwd-sub">
                  {{ tf('Lead time: {n} days', { n: r.leadDays }) }}
                  <span v-if="r.estimatedBasis" class="pwd-est">{{ r.estimatedBasis }}</span>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.pwd-enter-active, .pwd-leave-active { transition: background-color 250ms ease; }
.pwd-enter-from, .pwd-leave-to { background-color: transparent; }
.pwd-enter-active .pwd-panel { transition: transform 350ms ease-out; }
.pwd-leave-active .pwd-panel { transition: transform 250ms ease-in; }
.pwd-enter-from .pwd-panel,
.pwd-leave-to .pwd-panel { transform: translateX(calc(100% + 12px)); }

.pwd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.pwd-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 12px; overflow: hidden;
}
.pwd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.pwd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pwd-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-colors-icon-default);
}
.pwd-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

.pwd-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-3); padding: var(--mp-spacing-4); }
.pwd-subtitle { margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pwd-list { list-style: none; margin: 0; padding: 0; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md); }
.pwd-item { display: flex; flex-direction: column; padding: var(--mp-spacing-2\.5) var(--mp-spacing-3); }
.pwd-item + .pwd-item { border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.pwd-name { color: var(--mp-text-link); cursor: pointer; }
.pwd-name:hover { text-decoration: underline; }
.pwd-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pwd-est { margin-left: var(--mp-spacing-1); color: var(--mp-text-subtle); }
</style>
