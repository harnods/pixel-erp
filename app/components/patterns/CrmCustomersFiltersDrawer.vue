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
import { MpButton, MpCheckbox } from '@mekari/pixel3'
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
  <ErpDrawer :is-open="isOpen" title="All filters" aria-label="All filters" @close="close">
    <template #body>
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
    </template>

    <template #footer>
      <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="reset">Reset</MpButton>
      <div class="ccfd-footer-right">
        <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="close">Cancel</MpButton>
        <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="apply">Apply filters</MpButton>
      </div>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.ccfd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ccfd-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.ccfd-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ccfd-check-item { display: flex; align-items: center; gap: var(--mp-spacing-2); cursor: pointer; user-select: none; }
.ccfd-check-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
</style>
