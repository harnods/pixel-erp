<script lang="ts">
// Companion block (runtime export + shared type), same pattern as
// SalesOrderFiltersDrawer.vue.
import type { AmountComparator } from '~/components/patterns/AmountComparatorField.vue'
import type { TagsComparator } from '~/components/patterns/TagsComparatorField.vue'

export interface CrmDealsFiltersValue {
  keyword: string
  keywordColumn: string          // 'all' | column key
  valueComparator: AmountComparator
  value: string
  valueMin: string
  valueMax: string
  ownerComparator: TagsComparator
  owners: string[]
  customerComparator: TagsComparator
  customers: string[]
  /** AdvancedDateRangePicker range on the deal's expected close date — null = not applied. */
  closeDate: Date[] | null
}

export function emptyCrmDealsFilters(): CrmDealsFiltersValue {
  return {
    keyword: '', keywordColumn: 'all',
    valueComparator: 'gt', value: '', valueMin: '', valueMax: '',
    ownerComparator: 'isAnyOf', owners: [],
    customerComparator: 'isAnyOf', customers: [],
    closeDate: null,
  }
}
</script>

<script setup lang="ts">
/**
 * CRM Deals — "All filters" drawer. Same custom-Teleport shell as
 * SalesOrderFiltersDrawer.vue (edits a local draft, commits only on Apply;
 * overlay click ignored — it's a form). Fields: keyword + column scope, Deal
 * value (gt / between / lt via AmountComparatorField), Owner and Customer
 * (is any of / all of / none of via TagsComparatorField).
 */
import { reactive, ref, computed, watch } from 'vue'
import { MpIcon, MpButton, MpFormControl, MpFormLabel, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import AmountComparatorField from '~/components/patterns/AmountComparatorField.vue'
import ErpTagComparatorField from '~/components/patterns/ErpTagComparatorField.vue'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'

// Close-date quick presets (Figma / request): Today · This week · This month ·
// Next month, plus Custom date range (the picker adds Custom automatically).
const CLOSE_DATE_PRESETS = [
  { key: 'today' as const, label: 'Today' },
  { key: 'thisWeek' as const, label: 'This week' },
  { key: 'thisMonth' as const, label: 'This month' },
  { key: 'nextMonth' as const, label: 'Next month' },
]

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: CrmDealsFiltersValue
  columns: { key: string; label: string }[]
  ownerOptions: string[]
  customerOptions: string[]
  /** Relabel the customer filter (e.g. "Contact person" on a company's Deals tab). */
  customerLabel?: string
  customerPlaceholder?: string
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: CrmDealsFiltersValue): void
}>()

const draft = reactive<CrmDealsFiltersValue>({ ...props.modelValue })
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, props.modelValue) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', { ...draft }); close() }
function clearAll() { Object.assign(draft, emptyCrmDealsFilters()) }

const keywordColumnOpen = ref(false)
const keywordColumnLabel = computed(() =>
  draft.keywordColumn === 'all' ? 'All columns' : (props.columns.find((c) => c.key === draft.keywordColumn)?.label ?? 'All columns'),
)
</script>

<template>
  <ErpDrawer :is-open="isOpen" title="All filters" @close="close">
    <template #body>
      <!-- Keywords — text input with an inline column-scope dropdown suffix. -->
      <MpFormControl :id="`${id}-keyword-fc`">
        <MpFormLabel>Keywords</MpFormLabel>
        <div class="cdf-keyword">
          <input
            v-model="draft.keyword"
            class="cdf-keyword-input"
            type="text"
            placeholder="Search keywords..."
            @keydown.enter.prevent="apply"
          >
          <MpPopover :id="`${id}-keyword-scope`" is-manual :is-open="keywordColumnOpen" use-portal :is-keep-alive="false" @open="keywordColumnOpen = true" @close="keywordColumnOpen = false">
            <MpPopoverTrigger>
              <MpButton class="cdf-keyword-scope" @click.stop="keywordColumnOpen = !keywordColumnOpen">
                <span class="cdf-keyword-scope-label">{{ keywordColumnLabel }}</span>
                <MpIcon name="chevrons-down" size="sm" />
              </MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content' })" @blur="keywordColumnOpen = false" @escape="keywordColumnOpen = false">
              <MpPopoverList>
                <MpPopoverListItem :is-active="draft.keywordColumn === 'all'" @click="draft.keywordColumn = 'all'">All columns</MpPopoverListItem>
                <MpPopoverListItem v-for="col in columns" :key="col.key" :is-active="draft.keywordColumn === col.key" @click="draft.keywordColumn = col.key">{{ col.label }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </MpFormControl>

      <!-- Deal value (Rp) — greater than / in between / less than. -->
      <div class="cdf-field">
        <span class="cdf-field-label">Deal value (Rp)</span>
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
      <div class="cdf-field">
        <span class="cdf-field-label">Owner</span>
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

      <!-- Customer / Contact person — comparator prefix + typeable tag input. -->
      <div class="cdf-field">
        <span class="cdf-field-label">{{ customerLabel || 'Company' }}</span>
        <ErpTagComparatorField
          :id="`${id}-customer`"
          :comparator="draft.customerComparator"
          :values="draft.customers"
          :options="customerOptions"
          :placeholder="customerPlaceholder || 'Type a company…'"
          @update:comparator="draft.customerComparator = $event"
          @update:values="draft.customers = $event"
        />
      </div>

      <!-- Close date — advanced date range picker (Today / This week / This
           month / Next month / Custom date range). Self-contained trigger, so
           it uses a plain bold field label, not MpFormControl. -->
      <div class="cdf-field">
        <span class="cdf-field-label">Close date</span>
        <AdvancedDateRangePicker
          :id="`${id}-closedate`"
          :model-value="draft.closeDate"
          :presets="CLOSE_DATE_PRESETS"
          is-full-width
          hide-label
          placeholder="Select close date"
          @update:model-value="draft.closeDate = $event"
        />
      </div>
    </template>

    <template #footer>
      <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="clearAll">Reset filter</MpButton>
      <div class="cdf-footer-right">
        <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="close">Cancel</MpButton>
        <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="apply">Apply</MpButton>
      </div>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.cdf-keyword {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-sizes-0\.5, 2px) var(--mp-sizes-0\.5, 2px) var(--mp-sizes-0\.5, 2px) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-md, 6px);
}
.cdf-keyword:focus-within { border-color: var(--mp-border-brand, #4b61dc); }
.cdf-keyword-input {
  flex: 1 0 0; min-width: 0; height: 20px;
  border: none; outline: none; background: transparent; padding: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.cdf-keyword-input::placeholder { color: var(--mp-text-placeholder); }
.cdf-keyword-scope {
  flex-shrink: 0; display: inline-flex !important; align-items: center; gap: var(--mp-spacing-1);
  min-width: var(--mp-sizes-8, 32px) !important; padding: var(--mp-spacing-2) !important;
  border: none !important; cursor: pointer;
  background: var(--mp-background-neutral-subtle, #f0f1f3) !important;
  border-radius: 0 var(--mp-radii-sm, 4px) var(--mp-radii-sm, 4px) 0;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default);
}
.cdf-keyword-scope:hover { background: var(--mp-background-neutral-hovered, #e6e8eb) !important; }
.cdf-keyword-scope-label { white-space: nowrap; }

.cdf-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.cdf-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.cdf-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
