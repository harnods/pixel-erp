<script lang="ts">
// `<script setup>` can't contain plain function/interface exports (only
// type-only re-exports are) — this companion block holds the runtime export
// (a fresh, all-empty filters value) and the shared type, both used by
// TasksTablePage.vue and by <script setup> below (same module scope).
export interface InboxFiltersValue {
  /** null = not applied. AdvancedDateRangePicker always needs 2 real dates to
   *  render (its internal `range` computed reads modelValue[0]/[1] directly and
   *  throws on undefined), so null is only ever handled at the drawer boundary —
   *  see the fallback default passed into the picker in the template below. */
  dateRange: Date[] | null
  transactionType: string[]
  reason: string[]
  requestedBy: string[]
  warehouse: string[]
  dueDateRange: Date[] | null
  totalMin: string
  totalMax: string
  balanceDueMin: string
  balanceDueMax: string
}

export function emptyInboxFilters(): InboxFiltersValue {
  return {
    dateRange: null,
    transactionType: [],
    reason: [],
    requestedBy: [],
    warehouse: [],
    dueDateRange: null,
    totalMin: '',
    totalMax: '',
    balanceDueMin: '',
    balanceDueMax: '',
  }
}
</script>

<script setup lang="ts">
/**
 * Inbox (Awaiting approval) — "All filters" drawer. Same structural pattern as
 * BillOfMaterialsFiltersDrawer.vue / WorkOrderFiltersDrawer.vue (custom Teleport
 * overlay — MpDrawer has no structural CSS in this Pixel3 build). Edits a local
 * draft; only commits to the parent's filter state on Apply, so Cancel/close-
 * outside discards in-progress edits.
 *
 * The Date range and Transaction type fields here are INDEPENDENT of the
 * toolbar's own Date range picker / Transaction type cascade — opening the
 * drawer never pre-fills them from whatever is currently selected up top; it
 * only restores whatever was last Applied from the drawer itself. Both sets of
 * filters are ANDed together when the table filters its rows.
 */
import { MpIcon, MpInput, MpCheckbox } from '@mekari/pixel3'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import TransactionTypeCascadeMenu, { type CascadeGroup } from '~/components/patterns/TransactionTypeCascadeMenu.vue'

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: InboxFiltersValue
  cascadeGroups: CascadeGroup[]
  reasonOptions: string[]
  requestedByOptions: string[]
  warehouseOptions: string[]
  /** Warehouse checklist only makes sense on the Inbox "Warehouse" inner tab. */
  showWarehouse: boolean
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: InboxFiltersValue): void
}>()

const draft = reactive<InboxFiltersValue>({ ...props.modelValue })
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, props.modelValue) })

// AdvancedDateRangePicker display fallback while draft.dateRange/dueDateRange are
// null (unapplied) — picking a date writes a real range into the draft.
function defaultRange(): Date[] {
  const end = new Date()
  const start = new Date(end)
  start.setDate(start.getDate() - 29)
  return [start, end]
}

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', { ...draft }); close() }
function clearAll() { Object.assign(draft, emptyInboxFilters()) }

function toggleIn(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}
function toggleReason(value: string) { draft.reason = toggleIn(draft.reason, value) }
function toggleRequestedBy(value: string) { draft.requestedBy = toggleIn(draft.requestedBy, value) }
function toggleWarehouse(value: string) { draft.warehouse = toggleIn(draft.warehouse, value) }
</script>

<template>
  <Transition name="ibf-filters">
    <div v-if="isOpen" class="ibf-filters-overlay" @click.self="close">
      <div class="ibf-filters-panel" role="dialog" aria-label="All filters">
        <header class="ibf-filters-header">
          <span class="ibf-filters-title">All filters</span>
          <button class="ibf-filters-close" type="button" aria-label="Close" @click="close">
            <MpIcon name="close" size="md" />
          </button>
        </header>

        <div class="ibf-filters-body">
          <!-- Both of these are self-contained trigger + popover components (own
               button, is-manual control) — MpFormLabel requires an MpFormControl
               ancestor (every other usage in the codebase pairs them), and
               MpFormControl in turn breaks MpPopoverTrigger's cloneVNode injection
               (same reasoning as the ERP Approval/Comment Icon Pattern memory), so
               neither wrapper works here — plain text label instead. -->
          <div class="ibf-field">
            <span class="ibf-field-label">Date range</span>
            <AdvancedDateRangePicker
              :id="`${id}-daterange`" :model-value="draft.dateRange ?? defaultRange()"
              @update:model-value="draft.dateRange = $event"
            />
          </div>

          <div class="ibf-field">
            <span class="ibf-field-label">Transaction type</span>
            <TransactionTypeCascadeMenu
              :id="`${id}-txntype`" v-model="draft.transactionType"
              :groups="cascadeGroups" multiple placeholder="Select transaction type"
            />
          </div>

          <div class="ibf-field">
            <span class="ibf-field-label">Reason</span>
            <ul class="ibf-checklist">
              <li
                v-for="opt in reasonOptions" :key="opt"
                class="ibf-check-item" @click="toggleReason(opt)"
              >
                <span @click.stop>
                  <MpCheckbox :id="`${id}-reason-${opt}`" :is-checked="draft.reason.includes(opt)" @change="() => toggleReason(opt)" />
                </span>
                <span class="ibf-check-label">{{ opt }}</span>
              </li>
            </ul>
          </div>

          <div class="ibf-field">
            <span class="ibf-field-label">Requested by</span>
            <ul class="ibf-checklist">
              <li
                v-for="opt in requestedByOptions" :key="opt"
                class="ibf-check-item" @click="toggleRequestedBy(opt)"
              >
                <span @click.stop>
                  <MpCheckbox :id="`${id}-requestedby-${opt}`" :is-checked="draft.requestedBy.includes(opt)" @change="() => toggleRequestedBy(opt)" />
                </span>
                <span class="ibf-check-label">{{ opt }}</span>
              </li>
            </ul>
          </div>

          <!-- Warehouse only appears when filtering inside the Warehouse inner tab. -->
          <div v-if="showWarehouse" class="ibf-field">
            <span class="ibf-field-label">Warehouse</span>
            <ul class="ibf-checklist">
              <li
                v-for="opt in warehouseOptions" :key="opt"
                class="ibf-check-item" @click="toggleWarehouse(opt)"
              >
                <span @click.stop>
                  <MpCheckbox :id="`${id}-warehouse-${opt}`" :is-checked="draft.warehouse.includes(opt)" @change="() => toggleWarehouse(opt)" />
                </span>
                <span class="ibf-check-label">{{ opt }}</span>
              </li>
            </ul>
          </div>

          <div class="ibf-field">
            <span class="ibf-field-label">Due date</span>
            <AdvancedDateRangePicker
              :id="`${id}-duedate`" :model-value="draft.dueDateRange ?? defaultRange()"
              @update:model-value="draft.dueDateRange = $event"
            />
          </div>

          <div class="ibf-field">
            <span class="ibf-field-label">Total</span>
            <div class="ibf-range-row">
              <MpInput :id="`${id}-total-min`" v-model="draft.totalMin" type="number" placeholder="Min" is-full-width />
              <span class="ibf-range-sep">–</span>
              <MpInput :id="`${id}-total-max`" v-model="draft.totalMax" type="number" placeholder="Max" is-full-width />
            </div>
          </div>

          <div class="ibf-field">
            <span class="ibf-field-label">Balance due</span>
            <div class="ibf-range-row">
              <MpInput :id="`${id}-balancedue-min`" v-model="draft.balanceDueMin" type="number" placeholder="Min" is-full-width />
              <span class="ibf-range-sep">–</span>
              <MpInput :id="`${id}-balancedue-max`" v-model="draft.balanceDueMax" type="number" placeholder="Max" is-full-width />
            </div>
          </div>
        </div>

        <footer class="ibf-filters-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="clearAll">Reset filter</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">Apply</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ibf-filters-enter-active { transition: background-color 250ms ease; }
.ibf-filters-leave-active { transition: background-color 250ms ease; }
.ibf-filters-enter-from, .ibf-filters-leave-to { background-color: transparent; }
.ibf-filters-enter-active .ibf-filters-panel { transition: transform 350ms ease-out; }
.ibf-filters-leave-active .ibf-filters-panel { transition: transform 250ms ease-in; }
.ibf-filters-enter-from .ibf-filters-panel,
.ibf-filters-leave-to .ibf-filters-panel { transform: translateX(calc(100% + 12px)); }

.ibf-filters-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: rgba(8, 13, 14, 0.45);
  display: flex; justify-content: flex-end;
}
.ibf-filters-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}
.ibf-filters-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.ibf-filters-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ibf-filters-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.ibf-filters-close:hover { background: var(--mp-background-neutral-hovered); }

.ibf-filters-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
}

.ibf-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.ibf-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.ibf-checklist { list-style: none; margin: 0; padding: 0; border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-md); max-height: 176px; overflow-y: auto; }
.ibf-check-item {
  display: flex;
  align-items: center;
  gap: 0;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  cursor: pointer;
  user-select: none;
}
.ibf-check-item:hover { background: var(--mp-background-neutral-hovered); }
.ibf-check-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.ibf-range-row { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.ibf-range-sep { color: var(--mp-text-subtle); flex-shrink: 0; }

.ibf-filters-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
</style>
