<script lang="ts">
/**
 * Value shape + helpers for the replenishment "All filters" drawer.
 *
 * In a plain <script> block, not <script setup>: runtime exports are not allowed
 * there. Same split as PurchaseRequestFiltersDrawer.vue.
 */
export interface ReplenishmentFiltersValue {
  keyword: string
  vendorIds: string[]
  categories: string[]
  coverFrom: string
  coverTo: string
  signals: string[]
}

/** Row-level signals a buyer triages by. */
export const REPLENISHMENT_SIGNALS: { id: string; name: string }[] = [
  { id: 'oversold', name: 'Oversold' },
  { id: 'below-lead', name: 'Stocks out before resupply' },
  { id: 'no-vendor', name: 'No vendor' },
  { id: 'volatile', name: 'Volatile demand' },
  { id: 'moq-adjusted', name: 'Adjusted for MOQ or pack size' },
]

export function emptyReplenishmentFilters(): ReplenishmentFiltersValue {
  return { keyword: '', vendorIds: [], categories: [], coverFrom: '', coverTo: '', signals: [] }
}

/** How many controls are actually set — drives the "All filters (N)" pill. */
export function countReplenishmentFilters(v: ReplenishmentFiltersValue): number {
  return (v.keyword ? 1 : 0)
    + (v.vendorIds.length ? 1 : 0)
    + (v.categories.length ? 1 : 0)
    + (v.coverFrom || v.coverTo ? 1 : 0)
    + (v.signals.length ? 1 : 0)
}
</script>

<script setup lang="ts">
/**
 * Replenishment worklist — "All filters" drawer. Same custom Teleport overlay
 * pattern as StockAdjustmentsFiltersDrawer.vue (MpDrawer has no structural CSS in
 * this Pixel3 build). Edits a local draft and only commits on Apply, so closing
 * outside discards in-progress edits.
 *
 * Warehouse is deliberately NOT here: it is the page's scope selector, not a
 * filter, and offering it in two places invites a blended selection. Tracked-only
 * and needs-setup are likewise absent — they are the tab axis.
 */
import { MpIcon, MpInput, MpCheckbox, MpFormControl, MpFormLabel, MpInputGroup, MpInputRightAddon } from '@mekari/pixel3'

const props = defineProps<{
  isOpen: boolean
  modelValue: ReplenishmentFiltersValue
  vendorOptions: { id: string; name: string }[]
  categoryOptions: { id: string; name: string }[]
}>()

const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: ReplenishmentFiltersValue): void
}>()

const draft = reactive<ReplenishmentFiltersValue>({ ...props.modelValue })
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, props.modelValue) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', { ...draft }); close() }
function clearAll() { Object.assign(draft, emptyReplenishmentFilters()) }

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((v) => v !== id) : [...list, id]
}
function toggleVendor(id: string) { draft.vendorIds = toggle(draft.vendorIds, id) }
function toggleCategory(id: string) { draft.categories = toggle(draft.categories, id) }
function toggleSignal(id: string) { draft.signals = toggle(draft.signals, id) }
</script>

<template>
  <Transition name="rp-filters">
    <div v-if="isOpen" class="rp-filters-overlay" @click.self="close">
      <div class="rp-filters-panel" role="dialog" aria-label="All filters">
        <header class="rp-filters-header">
          <span class="rp-filters-title">All filters</span>
          <button class="rp-filters-close" type="button" aria-label="Close" @click="close">
            <MpIcon name="close" size="md" />
          </button>
        </header>

        <div class="rp-filters-body">
          <MpFormControl id="rp-filters-keyword-fc">
            <MpFormLabel>Keywords</MpFormLabel>
            <MpInput id="rp-filters-keyword" v-model="draft.keyword" placeholder="Search..." is-full-width />
          </MpFormControl>

          <MpFormControl id="rp-filters-vendor-fc">
            <MpFormLabel>Vendor</MpFormLabel>
            <div class="rp-filters-checkbox-list">
              <label v-for="opt in vendorOptions" :key="opt.id" class="rp-filters-checkbox-item">
                <MpCheckbox
                  :id="`rp-filters-vendor-${opt.id}`"
                  :is-checked="draft.vendorIds.includes(opt.id)"
                  @change="toggleVendor(opt.id)"
                >{{ opt.name }}</MpCheckbox>
              </label>
            </div>
          </MpFormControl>

          <MpFormControl id="rp-filters-category-fc">
            <MpFormLabel>Category</MpFormLabel>
            <div class="rp-filters-checkbox-list">
              <label v-for="opt in categoryOptions" :key="opt.id" class="rp-filters-checkbox-item">
                <MpCheckbox
                  :id="`rp-filters-cat-${opt.id}`"
                  :is-checked="draft.categories.includes(opt.id)"
                  @change="toggleCategory(opt.id)"
                >{{ opt.name }}</MpCheckbox>
              </label>
            </div>
          </MpFormControl>

          <MpFormControl id="rp-filters-cover-fc">
            <MpFormLabel>Days of cover</MpFormLabel>
            <div class="rp-filters-range">
              <MpInputGroup id="rp-filters-cover-from-g">
                <MpInput id="rp-filters-cover-from" v-model="draft.coverFrom" type="number" placeholder="From" />
                <MpInputRightAddon>days</MpInputRightAddon>
              </MpInputGroup>
              <MpInputGroup id="rp-filters-cover-to-g">
                <MpInput id="rp-filters-cover-to" v-model="draft.coverTo" type="number" placeholder="To" />
                <MpInputRightAddon>days</MpInputRightAddon>
              </MpInputGroup>
            </div>
          </MpFormControl>

          <MpFormControl id="rp-filters-signals-fc">
            <MpFormLabel>Signals</MpFormLabel>
            <div class="rp-filters-checkbox-list">
              <label v-for="opt in REPLENISHMENT_SIGNALS" :key="opt.id" class="rp-filters-checkbox-item">
                <MpCheckbox
                  :id="`rp-filters-signal-${opt.id}`"
                  :is-checked="draft.signals.includes(opt.id)"
                  @change="toggleSignal(opt.id)"
                >{{ opt.name }}</MpCheckbox>
              </label>
            </div>
          </MpFormControl>
        </div>

        <footer class="rp-filters-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="clearAll">Reset filter</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">Apply</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.rp-filters-enter-active, .rp-filters-leave-active { transition: background-color 250ms ease; }
.rp-filters-enter-from, .rp-filters-leave-to { background-color: transparent; }
.rp-filters-enter-active .rp-filters-panel { transition: transform 350ms ease-out; }
.rp-filters-leave-active .rp-filters-panel { transition: transform 250ms ease-in; }
.rp-filters-enter-from .rp-filters-panel,
.rp-filters-leave-to .rp-filters-panel { transform: translateX(calc(100% + 12px)); }

.rp-filters-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.rp-filters-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}
.rp-filters-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.rp-filters-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.rp-filters-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.rp-filters-close:hover { background: var(--mp-background-neutral-hovered); }

.rp-filters-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
}
.rp-filters-checkbox-list {
  display: flex; flex-direction: column; gap: var(--mp-spacing-2);
  max-height: 200px; overflow-y: auto;
  border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md);
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
}
.rp-filters-checkbox-item { display: flex; align-items: center; }
.rp-filters-range { display: flex; gap: var(--mp-spacing-2); }

.rp-filters-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
</style>
