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
}

export function emptyCrmDealsFilters(): CrmDealsFiltersValue {
  return {
    keyword: '', keywordColumn: 'all',
    valueComparator: 'gt', value: '', valueMin: '', valueMax: '',
    ownerComparator: 'isAnyOf', owners: [],
    customerComparator: 'isAnyOf', customers: [],
  }
}
</script>

<script setup lang="ts">
/**
 * CRM Deals — "All filters" drawer. Same custom-Teleport shell as
 * SalesOrderFiltersDrawer.vue (edits a local draft, commits only on Apply;
 * overlay click ignored — it's a form). Fields: keyword + column scope, Deal
 * value (gt / between / lt via AmountComparatorField), Deal owner and Customer
 * (is any of / all of / none of via TagsComparatorField).
 */
import { reactive, ref, computed, watch } from 'vue'
import { MpIcon, MpButton, MpFormControl, MpFormLabel, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import AmountComparatorField from '~/components/patterns/AmountComparatorField.vue'
import ErpTagComparatorField from '~/components/patterns/ErpTagComparatorField.vue'

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
  <Transition name="cdf-filters">
    <div v-if="isOpen" class="cdf-filters-overlay">
      <div class="cdf-filters-panel" role="dialog" aria-label="All filters">
        <header class="cdf-filters-header">
          <span class="cdf-filters-title">All filters</span>
          <MpButton class="cdf-filters-close" aria-label="Close" @click="close">
            <MpIcon name="close" size="md" />
          </MpButton>
        </header>

        <div class="cdf-filters-body">
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

          <!-- Deal owner — comparator prefix + typeable tag input (Is any of / none of). -->
          <div class="cdf-field">
            <span class="cdf-field-label">Deal owner</span>
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
            <span class="cdf-field-label">{{ customerLabel || 'Customer' }}</span>
            <ErpTagComparatorField
              :id="`${id}-customer`"
              :comparator="draft.customerComparator"
              :values="draft.customers"
              :options="customerOptions"
              :placeholder="customerPlaceholder || 'Type a customer…'"
              @update:comparator="draft.customerComparator = $event"
              @update:values="draft.customers = $event"
            />
          </div>
        </div>

        <footer class="cdf-filters-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="clearAll">Reset filter</button>
          <div class="cdf-footer-right">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">Cancel</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">Apply</button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cdf-filters-enter-active { transition: background-color 250ms ease; }
.cdf-filters-leave-active { transition: background-color 250ms ease; }
.cdf-filters-enter-from, .cdf-filters-leave-to { background-color: transparent; }
.cdf-filters-enter-active .cdf-filters-panel { transition: transform 350ms ease-out; }
.cdf-filters-leave-active .cdf-filters-panel { transition: transform 250ms ease-in; }
.cdf-filters-enter-from .cdf-filters-panel,
.cdf-filters-leave-to .cdf-filters-panel { transform: translateX(calc(100% + 12px)); }

.cdf-filters-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.cdf-filters-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 12px;
  overflow: hidden;
}
.cdf-filters-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.cdf-filters-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cdf-filters-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.cdf-filters-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

.cdf-filters-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px);
  padding: var(--mp-spacing-4);
}

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

.cdf-filters-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
.cdf-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
