<script lang="ts">
/**
 * Value shape + helpers for the replenishment "All filters" drawer.
 *
 * In a plain <script> block, not <script setup>: runtime exports are not allowed
 * there. Same split as PurchaseRequestFiltersDrawer.vue.
 */
import type { AmountComparator } from '~/components/patterns/AmountComparatorField.vue'

export interface ReplenishmentFiltersValue {
  /**
   * The worklist's warehouse SCOPE (one warehouse, or all). It always holds a value, so
   * it is not "applied or not" and is NOT counted in the "All filters (N)" pill.
   */
  warehouseId: string
  /** Movement class (Fast / Slow / Non-moving), '' = any — same value as the quick filter. */
  fsn: string
  /** One replenishment signal, '' = any — same value as the quick filter. */
  signal: string
  vendorIds: string[]
  categories: string[]
  /** Days of cover: "Is greater than / between / less than" (AmountComparatorField). */
  coverComparator: AmountComparator
  coverValue: string
  coverMin: string
  coverMax: string
}

/**
 * Row-level signals a buyer triages by (US-013 AC-01 §4) — the options of the
 * worklist's "Signals" quick filter. The first four mirror the "Signals" column — the
 * demand read and the lead-time basis — "Stocks out before resupply" is kept since that
 * risk shows as a days-of-cover emphasis rather than a column badge, and "Covered by
 * inbound" isolates the rows an open PO already fills.
 */
export const REPLENISHMENT_SIGNALS: { id: string; name: string }[] = [
  { id: 'volatile', name: 'Volatile demand' },
  { id: 'provisional', name: 'Provisional' },
  { id: 'estimated-lead', name: 'Estimated lead time' },
  { id: 'waiting-lead', name: 'Waiting for real lead time' },
  { id: 'below-lead', name: 'Stocks out before resupply' },
  { id: 'covered', name: 'Covered by inbound' },
  // Numbers from a recalculation older than the nightly window (US-002 EH-01).
  { id: 'stale', name: 'Stale velocity' },
]

export function emptyReplenishmentFilters(): ReplenishmentFiltersValue {
  return { warehouseId: '', fsn: '', signal: '', vendorIds: [], categories: [], coverComparator: 'gt', coverValue: '', coverMin: '', coverMax: '' }
}

/** How many controls are actually set — drives the "All filters (N)" pill. */
export function countReplenishmentFilters(v: ReplenishmentFiltersValue): number {
  return (v.fsn ? 1 : 0)
    + (v.signal ? 1 : 0)
    + (v.vendorIds.length ? 1 : 0)
    + (v.categories.length ? 1 : 0)
    + (v.coverComparator === 'between' ? (v.coverMin || v.coverMax ? 1 : 0) : (v.coverValue ? 1 : 0))
}

/** Whether a row's days of cover satisfies the drawer's comparator (null cover never does). */
export function coverMatches(cover: number | null, f: ReplenishmentFiltersValue): boolean {
  const active = f.coverComparator === 'between' ? (f.coverMin !== '' || f.coverMax !== '') : f.coverValue !== ''
  if (!active) return true
  // A row with no cover figure cannot satisfy a numeric range — exclude it rather
  // than silently treating "unknown" as 0 or infinity.
  if (cover === null) return false
  if (f.coverComparator === 'gt') return cover > Number(f.coverValue)
  if (f.coverComparator === 'lt') return cover < Number(f.coverValue)
  const lo = f.coverMin === '' ? -Infinity : Number(f.coverMin)
  const hi = f.coverMax === '' ? Infinity : Number(f.coverMax)
  return cover >= lo && cover <= hi
}
</script>

<script setup lang="ts">
/**
 * Replenishment worklist — "All filters" drawer. Same custom Teleport overlay
 * pattern as StockAdjustmentsFiltersDrawer.vue (MpDrawer has no structural CSS in
 * this Pixel3 build). Edits a local draft and only commits on Apply; × and Cancel
 * discard it. The overlay ignores clicks (rule/modal-drawer-close-explicit-only).
 *
 * Warehouse, Movement and Signals repeat the filter bar's three controls and edit the
 * same values, so the drawer is a complete filter surface on its own. Warehouse stays
 * single-choice (a scope, never a blend). Tracked-only and needs-setup are absent —
 * they are the tab axis.
 */
import { MpIcon, MpButton, MpCheckbox, MpFormControl, MpFormLabel } from '@mekari/pixel3'
import AmountComparatorField from '~/components/patterns/AmountComparatorField.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'

const { t } = useLocale()

const props = defineProps<{
  isOpen: boolean
  modelValue: ReplenishmentFiltersValue
  vendorOptions: { id: string; name: string }[]
  categoryOptions: { id: string; name: string }[]
  warehouseOptions: { value: string; label: string }[]
  fsnOptions: { value: string; label: string }[]
  signalOptions: { value: string; label: string }[]
}>()

const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: ReplenishmentFiltersValue): void
}>()

const draft = reactive<ReplenishmentFiltersValue>({ ...props.modelValue })
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, props.modelValue) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', { ...draft }); close() }
// Reset clears every filter; the warehouse scope always holds a value, so it goes back
// to the widest one on offer (the first option is "All warehouses" when it exists).
function clearAll() {
  Object.assign(draft, { ...emptyReplenishmentFilters(), warehouseId: props.warehouseOptions[0]?.value ?? draft.warehouseId })
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((v) => v !== id) : [...list, id]
}
function toggleVendor(id: string) { draft.vendorIds = toggle(draft.vendorIds, id) }
function toggleCategory(id: string) { draft.categories = toggle(draft.categories, id) }
</script>

<template>
  <!-- Canonical drawer shell (BillsFiltersDrawer.vue): Teleported, and the overlay
       is a backdrop only — closing is × or Cancel (rule/modal-drawer-close-explicit-only). -->
  <Teleport to="body">
  <Transition name="rp-filters">
    <div v-if="isOpen" class="rp-filters-overlay">
      <div class="rp-filters-panel" role="dialog" :aria-label="t('All filters')">
        <header class="rp-filters-header">
          <span class="rp-filters-title">{{ t('All filters') }}</span>
          <MpButton class="rp-filters-close" is-rounded :aria-label="t('Close')" @click="close">
            <MpIcon name="close" size="md" />
          </MpButton>
        </header>

        <div class="rp-filters-body">
          <!-- No Keywords field: the page's search box already searches SKU, product,
               vendor and warehouse (US-013) — two keyword inputs would disagree. -->
          <!-- Same three controls as the filter bar (warehouse scope, Movement, Signals),
               so everything can be set from here too — they edit the same values. -->
          <MpFormControl id="rp-filters-warehouse-fc">
            <MpFormLabel>{{ t('Warehouse') }}</MpFormLabel>
            <ErpFilterSelect
              id="rp-filters-warehouse"
              :model-value="draft.warehouseId"
              :placeholder="t('Warehouse')"
              :options="warehouseOptions"
              width="100%"
              :is-clearable="false"
              @update:model-value="(v: string) => { draft.warehouseId = v }"
            />
          </MpFormControl>

          <MpFormControl id="rp-filters-fsn-fc">
            <MpFormLabel>{{ t('Movement') }}</MpFormLabel>
            <ErpFilterSelect
              id="rp-filters-fsn"
              :model-value="draft.fsn"
              :placeholder="t('Movement')"
              :options="fsnOptions"
              width="100%"
              @update:model-value="(v: string) => { draft.fsn = v }"
            />
          </MpFormControl>

          <MpFormControl id="rp-filters-signal-fc">
            <MpFormLabel>{{ t('Signals') }}</MpFormLabel>
            <ErpFilterSelect
              id="rp-filters-signal"
              :model-value="draft.signal"
              :placeholder="t('Signals')"
              :options="signalOptions"
              width="100%"
              @update:model-value="(v: string) => { draft.signal = v }"
            />
          </MpFormControl>

          <MpFormControl id="rp-filters-vendor-fc">
            <MpFormLabel>{{ t('Vendor') }}</MpFormLabel>
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
            <MpFormLabel>{{ t('Category') }}</MpFormLabel>
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
            <MpFormLabel>{{ t('Days of cover') }}</MpFormLabel>
            <AmountComparatorField
              id="rp-filters-cover"
              :comparator="draft.coverComparator"
              :value="draft.coverValue"
              :min="draft.coverMin"
              :max="draft.coverMax"
              @update:comparator="draft.coverComparator = $event"
              @update:value="draft.coverValue = $event"
              @update:min="draft.coverMin = $event"
              @update:max="draft.coverMax = $event"
            />
          </MpFormControl>
        </div>

        <!-- rule/filter-drawer-footer: Reset pinned left, ghost Cancel + primary Apply right. -->
        <footer class="rp-filters-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="clearAll">{{ t('Reset filter') }}</button>
          <div class="rp-filters-footer-right">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">{{ t('Apply') }}</button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
  </Teleport>
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
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.rp-filters-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 12px;
  overflow: hidden;
}
.rp-filters-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.rp-filters-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.rp-filters-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-colors-icon-default);
}
.rp-filters-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

.rp-filters-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
}
/* The selects fill the drawer's width like every other field (the wrapper is inline-flex). */
.rp-filters-body :deep(.efs) { display: flex; width: 100%; }

/* A company can have any number of vendors and categories, so each checklist is a
   bordered panel that shows up to 10 rows and scrolls beyond that (the documented
   10-row page size, Form.md › line items). Row height is fixed so the cap is exact. */
.rp-filters-checkbox-list {
  display: flex; flex-direction: column;
  max-height: calc(10 * var(--mp-sizes-8));
  overflow-y: auto;
  border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md);
}
.rp-filters-checkbox-item {
  display: flex; align-items: center; flex-shrink: 0;
  min-height: var(--mp-sizes-8); padding: 0 var(--mp-spacing-3);
}

.rp-filters-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
.rp-filters-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
