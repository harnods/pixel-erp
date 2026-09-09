<script lang="ts">
// Companion block: the shared value type + an all-empty factory (used by
// CrmCompaniesListPage.vue and by <script setup> below — same module scope).
export type TagMatcher = 'isAnyOf' | 'isNoneOf'

export interface CompaniesFiltersValue {
  /** free-text keyword; empty = no keyword filter */
  keyword: string
  /** column key to scope the keyword to, or 'all' for every column */
  keywordColumn: string
  /** Owner — comparator + selected names */
  ownerComparator: TagMatcher
  owners: string[]
}

export function emptyCompaniesFilters(): CompaniesFiltersValue {
  return {
    keyword: '', keywordColumn: 'all',
    ownerComparator: 'isAnyOf', owners: [],
  }
}
</script>

<script setup lang="ts">
/**
 * CRM Companies — "All filters" drawer (rule/filter-drawer-shell). Modelled on
 * CrmCustomersFiltersDrawer: a Keywords field (search scoped to a column) plus
 * Owner and Industry "Is any of / Is none of" comparator + typeable tag inputs
 * (ErpTagComparatorField, per rule/input-tag-comparator). Edits a local draft;
 * commits only on Apply (rule/filter-drawer-footer). As a form it ignores the
 * overlay click — close only via ×, Cancel, or Apply.
 */
import { reactive, watch } from 'vue'
import { MpIcon, MpButton } from '@mekari/pixel3'
import ErpKeywordField from '~/components/patterns/ErpKeywordField.vue'
import ErpTagComparatorField from '~/components/patterns/ErpTagComparatorField.vue'

const { t } = useLocale()

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: CompaniesFiltersValue
  ownerOptions: string[]
  columns: { key: string; label: string }[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: CompaniesFiltersValue): void
}>()

function clone(v: CompaniesFiltersValue): CompaniesFiltersValue {
  return {
    keyword: v.keyword, keywordColumn: v.keywordColumn,
    ownerComparator: v.ownerComparator, owners: [...v.owners],
  }
}
const draft = reactive<CompaniesFiltersValue>(clone(props.modelValue))
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, clone(props.modelValue)) })

function close() { emit('update:isOpen', false) }
function reset() { Object.assign(draft, emptyCompaniesFilters()) }
function apply() { emit('apply', clone(draft)); close() }
</script>

<template>
  <Transition name="ccfd">
    <div v-if="isOpen" class="ccfd-overlay">
      <div class="ccfd-panel" role="dialog" aria-label="All filters">
        <header class="ccfd-header">
          <span class="ccfd-title">{{ t('All filters') }}</span>
          <MpButton class="ccfd-close" :aria-label="t('Close')" @click="close"><MpIcon name="close" size="md" /></MpButton>
        </header>

        <div class="ccfd-body">
          <!-- Keywords — scoped to a column -->
          <div class="ccfd-field">
            <span class="ccfd-field-label">{{ t('Keywords') }}</span>
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

          <!-- Owner -->
          <div class="ccfd-field">
            <span class="ccfd-field-label">{{ t('Owner') }}</span>
            <ErpTagComparatorField
              :id="`${id}-owner`"
              :comparator="draft.ownerComparator"
              :values="draft.owners"
              :options="ownerOptions"
              :placeholder="t('Type a name…')"
              @update:comparator="draft.ownerComparator = $event"
              @update:values="draft.owners = $event"
            />
          </div>
        </div>

        <footer class="ccfd-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="reset">{{ t('Reset filter') }}</button>
          <div class="ccfd-footer-right">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">{{ t('Apply filters') }}</button>
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
.ccfd-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.ccfd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ccfd-close { display: inline-flex !important; align-items: center; justify-content: center; width: 36px !important; height: 36px !important; min-width: 0 !important; border: none !important; background: none !important; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.ccfd-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

.ccfd-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); padding: var(--mp-spacing-4); }

.ccfd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ccfd-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.ccfd-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.ccfd-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
