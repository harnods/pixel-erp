<script setup lang="ts">
/**
 * Multidimensional report — "All filters" drawer (Figma 4926-67880).
 *
 * The drawer is the report's whole filter surface: the period and the sliced
 * dimension live here beside the value filters, so one Apply both re-scopes and
 * regenerates the report. Fields, top to bottom, per the Figma:
 *
 *   Date range   AdvancedDateRangePicker (period presets)
 *   Dimension    ErpFilterSelect — which dimension the columns slice by
 *   Values ▸ Dimensions   comparator prefix + chips — which dimension values
 *   Values ▸ Tags         comparator prefix + chips — which transaction tags
 *
 * The Account keyword + "no activity" toggle keep the drawer a superset of what
 * the report can filter (they predate this flow and nothing else exposes them).
 *
 * Custom Teleport-style overlay, same shell as BillsFiltersDrawer (MpDrawer has
 * no structural CSS in this Pixel3 build) — `rule/drawer-custom-shell`. Edits a
 * local draft and commits only on Apply; being a form it ignores overlay clicks
 * (`rule/filter-drawer-shell`), and Apply is never disabled — unmet
 * preconditions surface as inline errors (`rule/form-errors-inline`).
 */
import { computed, reactive, ref, watch } from 'vue'
import { MpButton, MpIcon, MpCheckbox, MpFormControl, MpFormLabel } from '@mekari/pixel3'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'
import ErpTagComparatorField from '~/components/patterns/ErpTagComparatorField.vue'
import { MD_COMPARATORS, emptyMdFilters, type MdComparator, type MdFilters } from '~/data/multidimensionalReport'

/** What Apply hands back — the staged period and dimension travel with the
 *  filters, since the drawer now owns all three. */
export interface MdFiltersApply {
  range: Date[] | null
  dimensionId: string
  filters: MdFilters
}

const props = defineProps<{
  isOpen: boolean
  modelValue: MdFilters
  /** Staged period — null while nothing has been picked yet. */
  range: Date[] | null
  /** Staged dimension id. */
  dimensionId: string
  /** Every reportable dimension (with its values), for the Dimension picker —
   *  the Dimensions filter offers the values of whichever one is staged HERE,
   *  not the one the report currently shows. */
  dimensionOptions: { id: string; name: string; values: string[] }[]
  /** Every tag recorded on a transaction. */
  tagOptions: string[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: MdFiltersApply): void
}>()

const { t } = useLocale()

const draft = reactive<MdFilters>({ ...props.modelValue, values: [...props.modelValue.values], tags: [...props.modelValue.tags] })
const draftRange = ref<Date[] | null>(props.range ? [...props.range] : null)
const draftDimensionId = ref(props.dimensionId)
const dateError = ref('')
const dimensionError = ref('')

watch(() => props.isOpen, (open) => {
  if (!open) return
  Object.assign(draft, props.modelValue, { values: [...props.modelValue.values], tags: [...props.modelValue.tags] })
  draftRange.value = props.range ? [...props.range] : null
  draftDimensionId.value = props.dimensionId
  dateError.value = ''
  dimensionError.value = ''
})

const dimensionSelectOptions = computed(() => props.dimensionOptions.map((d) => ({ value: d.id, label: d.name })))
const valueOptions = computed(() => props.dimensionOptions.find((d) => d.id === draftDimensionId.value)?.values ?? [])

/** Switching dimension invalidates the picked values — they belong to the old one. */
function onDimensionChange(id: string) {
  if (id !== draftDimensionId.value) draft.values = []
  draftDimensionId.value = id
  dimensionError.value = ''
}
function onRangeChange(v: Date[]) { draftRange.value = v; dateError.value = '' }

const valuePlaceholder = computed(() =>
  draftDimensionId.value ? t('Type a dimension value…') : t('Select a dimension first'))

function close() { emit('update:isOpen', false) }

function apply() {
  const [s, e] = draftRange.value ?? []
  dateError.value = ''
  dimensionError.value = ''
  if (!s || !e) dateError.value = t('You must fill in date range')
  else if (s > e) dateError.value = t('Start date cannot be after end date.')
  if (!draftDimensionId.value) dimensionError.value = t('You must select dimension')
  if (dateError.value || dimensionError.value) return

  emit('apply', {
    range: draftRange.value ? [...draftRange.value] : null,
    dimensionId: draftDimensionId.value,
    filters: { ...draft, values: [...draft.values], tags: [...draft.tags], accountKeyword: draft.accountKeyword.trim() },
  })
  close()
}

/** Reset clears the value filters only — the period and dimension are what the
 *  report is OF, not a filter on it, so wiping them would leave nothing to show. */
function clearAll() {
  Object.assign(draft, emptyMdFilters())
  dateError.value = ''
  dimensionError.value = ''
}
</script>

<template>
  <ErpDrawer :is-open="isOpen" :title="t('All filters')" @close="close">
    <template #body>
      <!-- Date range — the report's period; presets + custom range. -->
      <div class="mdf-field">
        <span class="mdf-field-label">{{ t('Date range') }}</span>
        <AdvancedDateRangePicker
          id="mdf-filters-range"
          :model-value="draftRange"
          is-full-width
          hide-label
          period-mode
          :placeholder="t('Select date range')"
          @update:model-value="onRangeChange"
        />
        <p v-if="dateError" class="mdf-field-error">{{ dateError }}</p>
      </div>

      <!-- Dimension — which dimension the report's columns slice by. -->
      <div class="mdf-field">
        <span class="mdf-field-label">{{ t('Dimension') }}</span>
        <ErpFilterSelect
          id="mdf-filters-dimension"
          :model-value="draftDimensionId"
          :placeholder="t('Select dimension')"
          :options="dimensionSelectOptions"
          width="100%"
          @update:model-value="onDimensionChange"
        />
        <p v-if="dimensionError" class="mdf-field-error">{{ dimensionError }}</p>
      </div>

      <!-- Values — the comparator filters, scoping what the report counts. -->
      <div class="mdf-group">
        <h3 class="mdf-group-title">{{ t('Values') }}</h3>
        <p class="mdf-group-desc">{{ t('Filters the values of each dimension.') }}</p>
      </div>

      <div class="mdf-field">
        <span class="mdf-field-label">{{ t('Dimensions') }}</span>
        <ErpTagComparatorField
          id="mdf-filters-values"
          :comparator="draft.valuesComparator"
          :values="draft.values"
          :options="valueOptions"
          :comparators="MD_COMPARATORS"
          :placeholder="valuePlaceholder"
          @update:comparator="draft.valuesComparator = $event as MdComparator"
          @update:values="draft.values = $event"
        />
      </div>

      <div class="mdf-field">
        <span class="mdf-field-label">{{ t('Tags') }}</span>
        <ErpTagComparatorField
          id="mdf-filters-tags"
          :comparator="draft.tagsComparator"
          :values="draft.tags"
          :options="tagOptions"
          :comparators="MD_COMPARATORS"
          :placeholder="t('Type a tag…')"
          @update:comparator="draft.tagsComparator = $event as MdComparator"
          @update:values="draft.tags = $event"
        />
      </div>

      <MpFormControl id="mdf-filters-account-fc">
        <MpFormLabel>{{ t('Account') }}</MpFormLabel>
        <input
          v-model="draft.accountKeyword"
          class="mdf-keyword-input"
          type="text"
          :placeholder="t('Search account code or name...')"
          @keydown.enter.prevent="apply"
        />
      </MpFormControl>

      <MpFormControl id="mdf-filters-zero-fc">
        <MpFormLabel>{{ t('Accounts') }}</MpFormLabel>
        <div class="mdf-filters-checkbox-list">
          <label class="mdf-filters-checkbox-item">
            <MpCheckbox id="mdf-filters-zero" :is-checked="draft.showZero" @change="draft.showZero = !draft.showZero">
              {{ t('Show accounts with no activity') }}
            </MpCheckbox>
          </label>
        </div>
      </MpFormControl>
    </template>

    <template #footer>
      <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="clearAll">{{ t('Reset filter') }}</MpButton>
      <div class="mdf-filters-footer-actions">
        <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="close">{{ t('Cancel') }}</MpButton>
        <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="apply">{{ t('Apply') }}</MpButton>
      </div>
    </template>
  </ErpDrawer>
</template>

<style scoped>
/* Field = bold label above a reused control (rule/filter-drawer-fields). */
.mdf-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); }
.mdf-field-label {
  font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600);
  color: var(--mp-text-default);
}
.mdf-field-error {
  margin: 0; font-size: var(--mp-font-sizes-sm, 12px);
  color: var(--mp-colors-text-danger, #d3222a);
}

/* "Values" — a section heading inside the body, not a field label. */
.mdf-group { display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); }
.mdf-group-title {
  margin: 0; font-size: var(--mp-font-sizes-lg, 16px); line-height: 24px;
  font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default);
}
.mdf-group-desc { margin: 0; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-secondary); }

.mdf-keyword-input {
  width: 100%; height: 38px; padding: 0 var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-colors-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-md, 6px);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); outline: none;
}
.mdf-keyword-input:focus { border-color: var(--mp-colors-border-bold, #8c9596); box-shadow: 0 0 0 1px var(--mp-colors-border-bold, #8c9596); }
.mdf-keyword-input::placeholder { color: var(--mp-text-placeholder); }

.mdf-filters-checkbox-list { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.mdf-filters-checkbox-item { display: flex; align-items: flex-start; }

.mdf-filters-footer-actions { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
