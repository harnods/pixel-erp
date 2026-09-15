<script lang="ts">
// Runtime exports can't live in <script setup> — the By transaction view imports the
// empty value and the active-filter counter from here (same split as BillsFiltersDrawer).

/** The Transaction filters behind "All filters" (PRD story 4). Warehouse selections hold
 *  ids; every active warehouse ticked means "All warehouse". */
export interface TransactionDrawerFiltersValue {
  numbers: string[]
  customerIds: string[]
  vendorIds: string[]
  originWarehouseIds: string[]
  destinationWarehouseIds: string[]
}

export function emptyTransactionDrawerFilters(): TransactionDrawerFiltersValue {
  return { numbers: [], customerIds: [], vendorIds: [], originWarehouseIds: [], destinationWarehouseIds: [] }
}

/** "All filters (N)" — one per filter with a selection (rule/filter-all-filters-active-count). */
export function countTransactionDrawerFilters(v: TransactionDrawerFiltersValue): number {
  return [v.numbers, v.customerIds, v.vendorIds, v.originWarehouseIds, v.destinationWarehouseIds]
    .filter((list) => list.length > 0).length
}
</script>

<script setup lang="ts">
/**
 * Batch Traceability — "All filters" drawer for the By transaction search: Transaction
 * number, Customer, Vendor, Warehouse origin, Warehouse destination.
 *
 * Shell copied from BillsFiltersDrawer.vue (rule/drawer-custom-shell, rule/filter-drawer-
 * shell): edits a local draft, commits only on Apply, closes only via ×, Cancel or Apply.
 *
 * Each filter only matches some transaction types (Customer → Sales, Vendor → Purchase,
 * origin/destination → the types that have one). A caption under each says so, because
 * the PRD's rule would otherwise read as filters silently dropping rows.
 */
import { MpIcon, MpButton } from '@mekari/pixel3'
import MultiSelectDropdown from '~/components/patterns/MultiSelectDropdown.vue'
import { traceTransactionNumberOptions } from '~/data/batchTraceability'
import { customers } from '~/data/customers'
import { vendors } from '~/data/vendors'
import { warehouses } from '~/data/warehouses'

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: TransactionDrawerFiltersValue
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: TransactionDrawerFiltersValue): void
}>()
const { t } = useLocale()

function copy(v: TransactionDrawerFiltersValue): TransactionDrawerFiltersValue {
  return {
    numbers: [...v.numbers],
    customerIds: [...v.customerIds],
    vendorIds: [...v.vendorIds],
    originWarehouseIds: [...v.originWarehouseIds],
    destinationWarehouseIds: [...v.destinationWarehouseIds],
  }
}
const draft = reactive<TransactionDrawerFiltersValue>(copy(props.modelValue))
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, copy(props.modelValue)) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', copy(draft)); close() }
function reset() { Object.assign(draft, emptyTransactionDrawerFilters()) }

const numberOptions = computed(() => traceTransactionNumberOptions())

/** MultiSelectDropdown works in option strings — names in, ids out. */
function byName<T extends { id: string; name: string }>(list: () => T[], field: 'customerIds' | 'vendorIds' | 'originWarehouseIds' | 'destinationWarehouseIds') {
  return computed({
    get: () => draft[field].map((id) => list().find((x) => x.id === id)?.name ?? id),
    set: (names: string[]) => { draft[field] = names.map((n) => list().find((x) => x.name === n)?.id ?? n) },
  })
}
const activeWarehouses = () => warehouses.filter((w) => !w.isDefault && w.status === 'active')

const customerNames = computed(() => customers.map((c) => c.name))
const vendorNames = computed(() => vendors.map((v) => v.name))
const warehouseNames = computed(() => activeWarehouses().map((w) => w.name))

const customerSelection = byName(() => customers, 'customerIds')
const vendorSelection = byName(() => vendors, 'vendorIds')
const originSelection = byName(activeWarehouses, 'originWarehouseIds')
const destinationSelection = byName(activeWarehouses, 'destinationWarehouseIds')
</script>

<template>
  <Teleport to="body">
    <Transition name="btxf">
      <div v-if="isOpen" class="btxf-overlay">
        <div class="btxf-panel" role="dialog" :aria-label="t('All filters')">
          <header class="btxf-header">
            <span class="btxf-title">{{ t('All filters') }}</span>
            <MpButton is-rounded class="btxf-close" :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>

          <div class="btxf-body">
            <div class="btxf-field">
              <span class="btxf-label">{{ t('Transaction number') }}</span>
              <MultiSelectDropdown
                :id="`${id}-number`" v-model="draft.numbers" :options="numberOptions"
                :placeholder="t('Select transaction number')" is-full-width
              />
            </div>

            <div class="btxf-field">
              <span class="btxf-label">{{ t('Customer') }}</span>
              <MultiSelectDropdown
                :id="`${id}-customer`" v-model="customerSelection" :options="customerNames"
                :placeholder="t('Select customer')" is-full-width
              />
              <span class="btxf-caption">{{ t('Only matches sales transactions') }}</span>
            </div>

            <div class="btxf-field">
              <span class="btxf-label">{{ t('Vendor') }}</span>
              <MultiSelectDropdown
                :id="`${id}-vendor`" v-model="vendorSelection" :options="vendorNames"
                :placeholder="t('Select vendor')" is-full-width
              />
              <span class="btxf-caption">{{ t('Only matches purchase transactions') }}</span>
            </div>

            <div class="btxf-field">
              <span class="btxf-label">{{ t('Warehouse origin') }}</span>
              <MultiSelectDropdown
                :id="`${id}-origin`" v-model="originSelection" :options="warehouseNames"
                :placeholder="t('Select warehouse')" :select-all-label="t('All warehouse')" :all-selected-label="t('All warehouse')"
                is-full-width
              />
              <span class="btxf-caption">{{ t('Applies to sales, warehouse transfer, stock in/out and stock count') }}</span>
            </div>

            <div class="btxf-field">
              <span class="btxf-label">{{ t('Warehouse destination') }}</span>
              <MultiSelectDropdown
                :id="`${id}-destination`" v-model="destinationSelection" :options="warehouseNames"
                :placeholder="t('Select warehouse')" :select-all-label="t('All warehouse')" :all-selected-label="t('All warehouse')"
                is-full-width
              />
              <span class="btxf-caption">{{ t('Applies to purchase and warehouse transfer') }}</span>
            </div>
          </div>

          <footer class="btxf-footer">
            <MpButton variant="ghost" is-rounded @click="reset">{{ t('Reset filter') }}</MpButton>
            <div class="btxf-footer-right">
              <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
              <MpButton variant="primary" is-rounded @click="apply">{{ t('Apply') }}</MpButton>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.btxf-enter-active, .btxf-leave-active { transition: background-color 250ms ease; }
.btxf-enter-from, .btxf-leave-to { background-color: transparent; }
.btxf-enter-active .btxf-panel { transition: transform 350ms ease-out; }
.btxf-leave-active .btxf-panel { transition: transform 250ms ease-in; }
.btxf-enter-from .btxf-panel, .btxf-leave-to .btxf-panel { transform: translateX(calc(100% + 12px)); }

.btxf-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.btxf-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px)); height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden;
}
.btxf-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.btxf-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.btxf-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; color: var(--mp-icon-default);
}
.btxf-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3) !important; }

.btxf-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px);
  padding: var(--mp-spacing-4);
}
.btxf-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.btxf-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.btxf-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

.btxf-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
.btxf-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
