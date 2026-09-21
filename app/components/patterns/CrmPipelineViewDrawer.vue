<script lang="ts">
// Companion block (runtime export + shared type). Mirrors CrmDealsFiltersDrawer
// but for the Pipeline "New view" flow: a named saved view = a record filter.
import type { AmountComparator } from '~/components/patterns/AmountComparatorField.vue'
import type { TagsComparator } from '~/components/patterns/TagsComparatorField.vue'

export interface CrmPipelineViewValue {
  name: string
  keyword: string
  valueComparator: AmountComparator
  value: string
  valueMin: string
  valueMax: string
  ownerComparator: TagsComparator
  owners: string[]
  customerComparator: TagsComparator
  customers: string[]
}

export function emptyPipelineView(): CrmPipelineViewValue {
  return {
    name: '',
    keyword: '',
    valueComparator: 'gt', value: '', valueMin: '', valueMax: '',
    ownerComparator: 'isAnyOf', owners: [],
    customerComparator: 'isAnyOf', customers: [],
  }
}
</script>

<script setup lang="ts">
/**
 * Pipeline "New view" drawer. Same custom-Teleport shell as
 * CrmDealsFiltersDrawer.vue (edits a local draft, commits only on Save; overlay
 * click ignored, close only via the x). A required View name (max 25) sits above
 * the record-filter fields: Keywords, Deal value, Owner, Customer.
 */
import { reactive, ref, watch } from 'vue'
import { MpIcon, MpButton, MpFormControl, MpFormLabel, MpInput } from '@mekari/pixel3'
import AmountComparatorField from '~/components/patterns/AmountComparatorField.vue'
import ErpTagComparatorField from '~/components/patterns/ErpTagComparatorField.vue'

const NAME_MAX = 25

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: CrmPipelineViewValue
  ownerOptions: string[]
  customerOptions: string[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: CrmPipelineViewValue): void
}>()

const draft = reactive<CrmPipelineViewValue>({ ...props.modelValue })
const nameError = ref('')
watch(() => props.isOpen, (open) => { if (open) { Object.assign(draft, props.modelValue); nameError.value = '' } })

function close() { emit('update:isOpen', false) }
function apply() {
  if (!draft.name.trim()) { nameError.value = 'Enter a view name.'; return }
  emit('apply', { ...draft }); close()
}
function clearAll() { Object.assign(draft, { ...emptyPipelineView(), name: draft.name }) }
</script>

<template>
  <Transition name="cpv-filters">
    <div v-if="isOpen" class="cpv-filters-overlay">
      <div class="cpv-filters-panel" role="dialog" aria-label="New view">
        <header class="cpv-filters-header">
          <span class="cpv-filters-title">New view</span>
          <MpButton class="cpv-filters-close" is-rounded aria-label="Close" @click="close">
            <MpIcon name="close" size="md" />
          </MpButton>
        </header>

        <div class="cpv-filters-body">
          <!-- View name — required, ≤25 chars (same counter pattern as Module name). -->
          <MpFormControl :id="`${id}-name-fc`" :is-invalid="!!nameError">
            <div class="cpv-labelrow">
              <MpFormLabel>View name</MpFormLabel>
              <span class="cpv-counter">{{ draft.name.length }} / {{ NAME_MAX }}</span>
            </div>
            <MpInput
              :id="`${id}-name`"
              v-model="draft.name"
              :maxlength="NAME_MAX"
              placeholder="Enter a view name..."
              is-full-width
              @input="nameError = ''"
            />
            <p v-if="nameError" class="cpv-name-error">{{ nameError }}</p>
          </MpFormControl>

          <!-- Keywords — free-text search across the deal's records. -->
          <MpFormControl :id="`${id}-keyword-fc`">
            <MpFormLabel>Keywords</MpFormLabel>
            <MpInput
              :id="`${id}-keyword`"
              v-model="draft.keyword"
              placeholder="Search keywords..."
              is-full-width
            />
          </MpFormControl>

          <!-- Deal value (Rp) — greater than / in between / less than. -->
          <div class="cpv-field">
            <span class="cpv-field-label">Deal value (Rp)</span>
            <AmountComparatorField
              :id="`${id}-value`"
              :comparator="draft.valueComparator"
              :value="draft.value"
              :min="draft.valueMin"
              :max="draft.valueMax"
              @update:comparator="draft.valueComparator = $event"
              @update:value="draft.value = $event"
              @update:min="draft.valueMin = $event"
              @update:max="draft.valueMax = $event"
            />
          </div>

          <!-- Owner — comparator prefix + typeable tag input (Is any of / none of). -->
          <div class="cpv-field">
            <span class="cpv-field-label">Owner</span>
            <ErpTagComparatorField
              :id="`${id}-owner`"
              :comparator="draft.ownerComparator"
              :values="draft.owners"
              :options="ownerOptions"
              placeholder="Type an owner…"
              @update:comparator="draft.ownerComparator = $event"
              @update:values="draft.owners = $event"
            />
          </div>

          <!-- Customer — comparator prefix + typeable tag input. -->
          <div class="cpv-field">
            <span class="cpv-field-label">Customer</span>
            <ErpTagComparatorField
              :id="`${id}-customer`"
              :comparator="draft.customerComparator"
              :values="draft.customers"
              :options="customerOptions"
              placeholder="Type a customer…"
              @update:comparator="draft.customerComparator = $event"
              @update:values="draft.customers = $event"
            />
          </div>
        </div>

        <footer class="cpv-filters-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="clearAll">Reset filter</button>
          <div class="cpv-footer-right">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">Cancel</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">Save view</button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cpv-filters-enter-active { transition: background-color 250ms ease; }
.cpv-filters-leave-active { transition: background-color 250ms ease; }
.cpv-filters-enter-from, .cpv-filters-leave-to { background-color: transparent; }
.cpv-filters-enter-active .cpv-filters-panel { transition: transform 350ms ease-out; }
.cpv-filters-leave-active .cpv-filters-panel { transition: transform 250ms ease-in; }
.cpv-filters-enter-from .cpv-filters-panel,
.cpv-filters-leave-to .cpv-filters-panel { transform: translateX(calc(100% + 12px)); }

.cpv-filters-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.cpv-filters-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 12px;
  overflow: hidden;
}
.cpv-filters-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.cpv-filters-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cpv-filters-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md) !important;
  cursor: pointer; color: var(--mp-icon-default);
}
.cpv-filters-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3) !important; }

.cpv-filters-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px);
  padding: var(--mp-spacing-4);
}

.cpv-labelrow { display: flex; align-items: center; justify-content: space-between; }
.cpv-counter { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cpv-name-error { margin: var(--mp-spacing-1) 0 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-critical, #c8102e); }

.cpv-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.cpv-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.cpv-filters-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
.cpv-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
