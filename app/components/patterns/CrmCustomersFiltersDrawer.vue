<script lang="ts">
// Companion block: the shared value type + an all-empty factory (used by
// CrmCustomersPage.vue and by <script setup> below — same module scope).
export type TagMatcher = 'isAnyOf' | 'isNoneOf'

export interface CustomersFiltersValue {
  /** free-text keyword; empty = no keyword filter */
  keyword: string
  /** column key to scope the keyword to, or 'all' for every column */
  keywordColumn: string
  /** Lifecycle stages (multi-select checkboxes) */
  lifecycle: string[]
  /** Contact owner — comparator + selected names */
  ownerComparator: TagMatcher
  owners: string[]
  /** Segment — comparator + selected segments */
  segmentComparator: TagMatcher
  segments: string[]
}

export function emptyCustomersFilters(): CustomersFiltersValue {
  return {
    keyword: '', keywordColumn: 'all',
    lifecycle: [],
    ownerComparator: 'isAnyOf', owners: [],
    segmentComparator: 'isAnyOf', segments: [],
  }
}
</script>

<script setup lang="ts">
/**
 * CRM Customers — "All filters" drawer. A FILTERS-ONLY drawer (no saved-view
 * name / type / group-by). Same shape as SalesInvoiceFiltersDrawer: a Keywords
 * field (search scoped to a column), Lifecycle checkboxes, and Contact owner +
 * Segment as "Is any of / Is none of" comparator + typeable tag inputs
 * (ErpTagComparatorField). Edits a local draft; commits only on Apply.
 */
import { reactive, watch } from 'vue'
import { MpIcon, MpButton, MpCheckbox } from '@mekari/pixel3'
import { LIFECYCLE_STAGES } from '~/data/crm'
import ErpKeywordField from '~/components/patterns/ErpKeywordField.vue'
import ErpTagComparatorField from '~/components/patterns/ErpTagComparatorField.vue'

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: CustomersFiltersValue
  ownerOptions: string[]
  segmentOptions: string[]
  columns: { key: string; label: string }[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: CustomersFiltersValue): void
}>()

function clone(v: CustomersFiltersValue): CustomersFiltersValue {
  return {
    keyword: v.keyword, keywordColumn: v.keywordColumn,
    lifecycle: [...v.lifecycle],
    ownerComparator: v.ownerComparator, owners: [...v.owners],
    segmentComparator: v.segmentComparator, segments: [...v.segments],
  }
}
const draft = reactive<CustomersFiltersValue>(clone(props.modelValue))
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, clone(props.modelValue)) })

function close() { emit('update:isOpen', false) }
function reset() { Object.assign(draft, emptyCustomersFilters()) }
function apply() { emit('apply', clone(draft)); close() }
function toggle(list: string[], v: string) {
  const i = list.indexOf(v)
  if (i === -1) list.push(v); else list.splice(i, 1)
}
</script>

<template>
  <Transition name="ccfd">
    <div v-if="isOpen" class="ccfd-overlay">
      <div class="ccfd-panel" role="dialog" aria-label="All filters">
        <header class="ccfd-header">
          <span class="ccfd-title">All filters</span>
          <MpButton class="ccfd-close" aria-label="Close" @click="close"><MpIcon name="close" size="md" /></MpButton>
        </header>

        <div class="ccfd-body">
          <!-- Keywords — scoped to a column -->
          <div class="ccfd-field">
            <span class="ccfd-field-label">Keywords</span>
            <ErpKeywordField
              :id="`${id}-keyword`"
              :model-value="draft.keyword"
              :column="draft.keywordColumn"
              :columns="columns"
              @update:model-value="draft.keyword = $event"
              @update:column="draft.keywordColumn = $event"
              @enter="apply"
            />
          </div>

          <!-- Lifecycle -->
          <div class="ccfd-field">
            <span class="ccfd-field-label">Lifecycle</span>
            <ul class="ccfd-checklist">
              <li v-for="s in LIFECYCLE_STAGES" :key="s" class="ccfd-check-item" @click="toggle(draft.lifecycle, s)">
                <span @click.stop><MpCheckbox :id="`${id}-lc-${s}`" :is-checked="draft.lifecycle.includes(s)" @change="() => toggle(draft.lifecycle, s)" /></span>
                <span class="ccfd-check-label">{{ s }}</span>
              </li>
            </ul>
          </div>

          <!-- Contact owner -->
          <div class="ccfd-field">
            <span class="ccfd-field-label">Contact owner</span>
            <ErpTagComparatorField
              :id="`${id}-owner`"
              :comparator="draft.ownerComparator"
              :values="draft.owners"
              :options="ownerOptions"
              placeholder="Type a name…"
              @update:comparator="draft.ownerComparator = $event"
              @update:values="draft.owners = $event"
            />
          </div>

          <!-- Segment -->
          <div v-if="segmentOptions.length" class="ccfd-field">
            <span class="ccfd-field-label">Segment</span>
            <ErpTagComparatorField
              :id="`${id}-segment`"
              :comparator="draft.segmentComparator"
              :values="draft.segments"
              :options="segmentOptions"
              placeholder="Type a segment…"
              @update:comparator="draft.segmentComparator = $event"
              @update:values="draft.segments = $event"
            />
          </div>
        </div>

        <footer class="ccfd-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="reset">Reset</button>
          <div class="ccfd-footer-right">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">Cancel</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">Apply filters</button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.ccfd-enter-active, .ccfd-leave-active { transition: background-color 250ms ease; }
.ccfd-enter-from, .ccfd-leave-to { background-color: transparent; }
.ccfd-enter-active .ccfd-panel { transition: transform 350ms ease-out; }
.ccfd-leave-active .ccfd-panel { transition: transform 250ms ease-in; }
.ccfd-enter-from .ccfd-panel, .ccfd-leave-to .ccfd-panel { transform: translateX(calc(100% + 12px)); }

.ccfd-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.ccfd-panel { margin: var(--mp-spacing-3); width: min(420px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden; }
.ccfd-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default); }
.ccfd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ccfd-close { display: inline-flex !important; align-items: center; justify-content: center; width: 36px !important; height: 36px !important; min-width: 0 !important; border: none !important; background: none !important; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.ccfd-close:hover { background: var(--mp-background-neutral-hovered); }

.ccfd-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); padding: var(--mp-spacing-4); }

.ccfd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ccfd-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.ccfd-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ccfd-check-item { display: flex; align-items: center; gap: var(--mp-spacing-2); cursor: pointer; user-select: none; }
.ccfd-check-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.ccfd-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default); }
.ccfd-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
