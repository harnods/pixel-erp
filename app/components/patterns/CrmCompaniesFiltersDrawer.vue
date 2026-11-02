<script lang="ts">
// Companion block: the shared value type + an all-empty factory (used by
// CrmCompaniesListPage.vue and by <script setup> below — same module scope).
export type TagMatcher = 'isAnyOf' | 'isNoneOf'

export interface CompaniesFiltersValue {
  /** free-text keyword; empty = no keyword filter */
  keyword: string
  /** column key to scope the keyword to, or 'all' for every column */
  keywordColumn: string
  /** Location filters — comparator + selected values (PRD §304; Companies have no Owner) */
  countryComparator: TagMatcher
  countries: string[]
  provinceComparator: TagMatcher
  provinces: string[]
  cityComparator: TagMatcher
  cities: string[]
}

export function emptyCompaniesFilters(): CompaniesFiltersValue {
  return {
    keyword: '', keywordColumn: 'all',
    countryComparator: 'isAnyOf', countries: [],
    provinceComparator: 'isAnyOf', provinces: [],
    cityComparator: 'isAnyOf', cities: [],
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
import { MpButton } from '@mekari/pixel3'
import ErpKeywordField from '~/components/patterns/ErpKeywordField.vue'
import ErpTagComparatorField from '~/components/patterns/ErpTagComparatorField.vue'

const { t } = useLocale()

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: CompaniesFiltersValue
  countryOptions: string[]
  provinceOptions: string[]
  cityOptions: string[]
  columns: { key: string; label: string }[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: CompaniesFiltersValue): void
}>()

function clone(v: CompaniesFiltersValue): CompaniesFiltersValue {
  return {
    keyword: v.keyword, keywordColumn: v.keywordColumn,
    countryComparator: v.countryComparator, countries: [...v.countries],
    provinceComparator: v.provinceComparator, provinces: [...v.provinces],
    cityComparator: v.cityComparator, cities: [...v.cities],
  }
}
const draft = reactive<CompaniesFiltersValue>(clone(props.modelValue))
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, clone(props.modelValue)) })

function close() { emit('update:isOpen', false) }
function reset() { Object.assign(draft, emptyCompaniesFilters()) }
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

      <!-- Country -->
      <div class="ccfd-field">
        <span class="ccfd-field-label">{{ t('Country') }}</span>
        <ErpTagComparatorField
          :id="`${id}-country`"
          :comparator="draft.countryComparator"
          :values="draft.countries"
          :options="countryOptions"
          :placeholder="t('Type a country…')"
          @update:comparator="draft.countryComparator = $event"
          @update:values="draft.countries = $event"
        />
      </div>

      <!-- Province -->
      <div class="ccfd-field">
        <span class="ccfd-field-label">{{ t('Province') }}</span>
        <ErpTagComparatorField
          :id="`${id}-province`"
          :comparator="draft.provinceComparator"
          :values="draft.provinces"
          :options="provinceOptions"
          :placeholder="t('Type a province…')"
          @update:comparator="draft.provinceComparator = $event"
          @update:values="draft.provinces = $event"
        />
      </div>

      <!-- City -->
      <div class="ccfd-field">
        <span class="ccfd-field-label">{{ t('City') }}</span>
        <ErpTagComparatorField
          :id="`${id}-city`"
          :comparator="draft.cityComparator"
          :values="draft.cities"
          :options="cityOptions"
          :placeholder="t('Type a city…')"
          @update:comparator="draft.cityComparator = $event"
          @update:values="draft.cities = $event"
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
