<script lang="ts">
// Companion block: the shared value type + an all-empty factory (used by
// CrmContactsListPage.vue and by <script setup> below — same module scope).
export type TagMatcher = 'isAnyOf' | 'isNoneOf'

export interface ContactsFiltersValue {
  /** free-text keyword; empty = no keyword filter */
  keyword: string
  /** column key to scope the keyword to, or 'all' for every column */
  keywordColumn: string
  /** Owner — comparator + selected names */
  ownerComparator: TagMatcher
  owners: string[]
  /** Company — comparator + selected company names */
  companyComparator: TagMatcher
  companies: string[]
  /** Source — comparator + selected source values */
  sourceComparator: TagMatcher
  sources: string[]
}

export function emptyContactsFilters(): ContactsFiltersValue {
  return {
    keyword: '', keywordColumn: 'all',
    ownerComparator: 'isAnyOf', owners: [],
    companyComparator: 'isAnyOf', companies: [],
    sourceComparator: 'isAnyOf', sources: [],
  }
}
</script>

<script setup lang="ts">
/**
 * CRM Contacts — "All filters" drawer (rule/filter-drawer-shell). Modelled on
 * CrmCustomersFiltersDrawer: a Keywords field (search scoped to a column) and an
 * Owner "Is any of / Is none of" comparator + typeable tag input
 * (ErpTagComparatorField, per rule/input-tag-comparator). Edits a local draft;
 * commits only on Apply (rule/filter-drawer-footer). As a form it ignores the
 * overlay click — close only via ×, Cancel, or Apply.
 */
import { reactive, watch } from 'vue'
import { MpButton } from '@mekari/pixel3'
import ErpKeywordField from '~/components/patterns/ErpKeywordField.vue'
import ErpTagComparatorField from '~/components/patterns/ErpTagComparatorField.vue'

const { t } = useLocale()

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: ContactsFiltersValue
  ownerOptions: string[]
  companyOptions: string[]
  sourceOptions: string[]
  columns: { key: string; label: string }[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: ContactsFiltersValue): void
}>()

function clone(v: ContactsFiltersValue): ContactsFiltersValue {
  return {
    keyword: v.keyword, keywordColumn: v.keywordColumn,
    ownerComparator: v.ownerComparator, owners: [...v.owners],
    companyComparator: v.companyComparator, companies: [...v.companies],
    sourceComparator: v.sourceComparator, sources: [...v.sources],
  }
}
const draft = reactive<ContactsFiltersValue>(clone(props.modelValue))
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, clone(props.modelValue)) })

function close() { emit('update:isOpen', false) }
function reset() { Object.assign(draft, emptyContactsFilters()) }
function apply() { emit('apply', clone(draft)); close() }
</script>

<template>
  <ErpDrawer :is-open="isOpen" :title="t('All filters')" aria-label="All filters" @close="close">
    <template #body>
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

      <!-- Company -->
      <div class="ccfd-field">
        <span class="ccfd-field-label">{{ t('Company') }}</span>
        <ErpTagComparatorField
          :id="`${id}-company`"
          :comparator="draft.companyComparator"
          :values="draft.companies"
          :options="companyOptions"
          :placeholder="t('Type a company…')"
          @update:comparator="draft.companyComparator = $event"
          @update:values="draft.companies = $event"
        />
      </div>

      <!-- Source -->
      <div class="ccfd-field">
        <span class="ccfd-field-label">{{ t('Source') }}</span>
        <ErpTagComparatorField
          :id="`${id}-source`"
          :comparator="draft.sourceComparator"
          :values="draft.sources"
          :options="sourceOptions"
          :placeholder="t('Type a source…')"
          @update:comparator="draft.sourceComparator = $event"
          @update:values="draft.sources = $event"
        />
      </div>
    </template>

    <template #footer>
      <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="reset">{{ t('Reset filter') }}</MpButton>
      <div class="ccfd-footer-right">
        <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="close">{{ t('Cancel') }}</MpButton>
        <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="apply">{{ t('Apply filters') }}</MpButton>
      </div>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.ccfd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.ccfd-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
</style>
