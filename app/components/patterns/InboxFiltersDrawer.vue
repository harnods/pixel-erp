<script lang="ts">
// `<script setup>` can't contain plain function/interface exports (only
// type-only re-exports are) — this companion block holds the runtime export
// (a fresh, all-empty filters value) and the shared type, both used by
// TasksTablePage.vue and by <script setup> below (same module scope).
import type { AmountComparator } from '~/components/patterns/AmountComparatorField.vue'

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
  /** MpDatePicker format="DD/MM/YYYY" string — '' = not applied. */
  dueDate: string
  totalComparator: AmountComparator
  totalValue: string
  totalMin: string
  totalMax: string
  balanceDueComparator: AmountComparator
  balanceDueValue: string
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
    dueDate: '',
    totalComparator: 'gt',
    totalValue: '',
    totalMin: '',
    totalMax: '',
    balanceDueComparator: 'gt',
    balanceDueValue: '',
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
import { MpIcon, MpButton, MpCheckbox, MpFormControl, MpFormLabel, MpDatePicker } from '@mekari/pixel3'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import TransactionTypeCascadeMenu, { type CascadeGroup } from '~/components/patterns/TransactionTypeCascadeMenu.vue'
import AmountComparatorField from '~/components/patterns/AmountComparatorField.vue'
import MultiSelectDropdown from '~/components/patterns/MultiSelectDropdown.vue'

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
  /** Hides the Reason field (Purchase / Expense / Warehouse tabs). */
  hideReason?: boolean
  /** Hides the Due date field (Warehouse tab). */
  hideDueDate?: boolean
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: InboxFiltersValue): void
}>()

const draft = reactive<InboxFiltersValue>({ ...props.modelValue })
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, props.modelValue) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', { ...draft }); close() }
function clearAll() { Object.assign(draft, emptyInboxFilters()) }

function toggleReason(value: string) {
  draft.reason = draft.reason.includes(value) ? draft.reason.filter((v) => v !== value) : [...draft.reason, value]
}
</script>

<template>
  <Transition name="ibf-filters">
    <div v-if="isOpen" class="ibf-filters-overlay">
      <div class="ibf-filters-panel" role="dialog" aria-label="All filters">
        <header class="ibf-filters-header">
          <span class="ibf-filters-title">All filters</span>
          <MpButton class="ibf-filters-close" type="button" aria-label="Close" @click="close">
            <MpIcon name="close" size="md" />
          </MpButton>
        </header>

        <div class="ibf-filters-body">
          <!-- Date range / Transaction type / Requested by / Warehouse / Total /
               Balance due are self-contained trigger + popover components (own
               button, is-manual control) — MpFormControl breaks their
               MpPopoverTrigger's cloneVNode injection (same reasoning as the ERP
               Approval/Comment Icon Pattern memory), so they use a plain text
               label instead. Only Due date below is an official Pixel3 form
               component (MpDatePicker) and pairs with MpFormControl + MpFormLabel
               normally, same as WorkOrderFiltersDrawer.vue.

               Date range's own label is the same plain bold field-label format
               as every other field here (not AdvancedDateRangePicker's dynamic
               "Date range: Last 30 days" sub-label, which only ever appears once
               a value is picked). It also always opens unset (never pre-filled
               from the toolbar's own Date range filter up top — that's separate,
               independent state, see the file header comment). -->
          <div class="ibf-field">
            <span class="ibf-field-label">Date range</span>
            <AdvancedDateRangePicker
              :id="`${id}-daterange`" :model-value="draft.dateRange"
              is-full-width hide-label placeholder="Select date range"
              @update:model-value="draft.dateRange = $event"
            />
          </div>

          <div class="ibf-field">
            <span class="ibf-field-label">Transaction type</span>
            <TransactionTypeCascadeMenu
              :id="`${id}-txntype`" v-model="draft.transactionType"
              :groups="cascadeGroups" multiple placeholder="Select transaction type"
              is-full-width
            />
          </div>

          <div v-if="!hideReason" class="ibf-field">
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

          <!-- Requested by / Warehouse — flat multi-select dropdown (Figma shows
               a plain "Select ..." field, but both can reasonably match more
               than one person/warehouse, so selection is multi- under the hood). -->
          <div class="ibf-field">
            <span class="ibf-field-label">Requested by</span>
            <MultiSelectDropdown
              :id="`${id}-requestedby`" v-model="draft.requestedBy"
              :options="requestedByOptions" placeholder="Select requested by"
              is-full-width
            />
          </div>

          <!-- Warehouse only appears when filtering inside the Warehouse inner tab. -->
          <div v-if="showWarehouse" class="ibf-field">
            <span class="ibf-field-label">Warehouse</span>
            <MultiSelectDropdown
              :id="`${id}-warehouse`" v-model="draft.warehouse"
              :options="warehouseOptions" placeholder="Select warehouse"
              is-full-width
            />
          </div>

          <MpFormControl v-if="!hideDueDate" :id="`${id}-duedate-fc`">
            <MpFormLabel>Due date</MpFormLabel>
            <MpDatePicker
              :id="`${id}-duedate`" v-model="draft.dueDate"
              format="DD/MM/YYYY" value-type="format" placeholder="Select due date"
              is-clearable use-portal is-full-width
            />
          </MpFormControl>

          <div class="ibf-field">
            <span class="ibf-field-label">Total (Rp)</span>
            <AmountComparatorField
              :id="`${id}-total`"
              :comparator="draft.totalComparator"
              :value="draft.totalValue"
              :min="draft.totalMin"
              :max="draft.totalMax"
              @update:comparator="draft.totalComparator = $event"
              @update:value="draft.totalValue = $event"
              @update:min="draft.totalMin = $event"
              @update:max="draft.totalMax = $event"
            />
          </div>

          <div class="ibf-field">
            <span class="ibf-field-label">Balance due (Rp)</span>
            <AmountComparatorField
              :id="`${id}-balancedue`"
              :comparator="draft.balanceDueComparator"
              :value="draft.balanceDueValue"
              :min="draft.balanceDueMin"
              :max="draft.balanceDueMax"
              @update:comparator="draft.balanceDueComparator = $event"
              @update:value="draft.balanceDueValue = $event"
              @update:min="draft.balanceDueMin = $event"
              @update:max="draft.balanceDueMax = $event"
            />
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
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.ibf-filters-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 12px;
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
/* Rendered via MpButton, not a raw HTML control — default look reset (see
   IconButton/.demo-fab precedent). */
.ibf-filters-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  min-width: 0 !important;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none !important; background: none !important; border-radius: var(--mp-radii-md) !important;
  padding: 0 !important;
  cursor: pointer; color: var(--mp-icon-default);
}
.ibf-filters-close:hover { background: var(--mp-background-neutral-hovered) !important; }

.ibf-filters-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
}

.ibf-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.ibf-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.ibf-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ibf-check-item {
  display: flex;
  align-items: center;
  gap: 0;
  cursor: pointer;
  user-select: none;
}
.ibf-check-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.ibf-filters-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
</style>
