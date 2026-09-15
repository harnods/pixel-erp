<script lang="ts">
// Runtime exports can't live in <script setup> — the page imports the empty value
// and the active-filter counter from here (same split as BillsFiltersDrawer.vue).
import type { DateCondition, TraceabilityAccess } from '~/data/batchTraceability'

/** The Batch info attribute filters behind "All filters" (PRD story 2). */
export interface BatchAttributeFiltersValue {
  vendorIds: string[]
  gradeIds: string[]
  expiry: DateCondition | null
  manufacturing: DateCondition | null
  bestBefore: DateCondition | null
}

export function emptyBatchAttributeFilters(): BatchAttributeFiltersValue {
  return { vendorIds: [], gradeIds: [], expiry: null, manufacturing: null, bestBefore: null }
}

/** "All filters (N)" — one per active filter the company can actually use
 *  (rule/filter-all-filters-active-count). A greyed-out filter never counts. */
export function countBatchAttributeFilters(v: BatchAttributeFiltersValue, access: TraceabilityAccess): number {
  const addOn = access.batchAttribute
  return [
    addOn && v.vendorIds.length > 0,
    addOn && v.gradeIds.length > 0,
    v.expiry !== null,
    addOn && v.manufacturing !== null,
    addOn && v.bestBefore !== null,
  ].filter(Boolean).length
}
</script>

<script setup lang="ts">
/**
 * Batch Traceability — "All filters" drawer (Batch info attributes: Vendor, Grade,
 * Expiry date, Manufacturing date, Best before date).
 *
 * Shell copied from BillsFiltersDrawer.vue (rule/drawer-custom-shell, rule/filter-drawer-
 * shell): edits a local draft, commits only on Apply, closes only via ×, Cancel or Apply.
 *
 * Every attribute filter is always shown (PRD story 1). One the company has no access
 * to renders greyed with a caption instead of a control — it can't be selected, and it
 * says why rather than silently disappearing.
 */
import { MpIcon, MpButton } from '@mekari/pixel3'
import MultiSelectDropdown from '~/components/patterns/MultiSelectDropdown.vue'
import DateConditionField from '~/components/patterns/DateConditionField.vue'
import { isAttributeAvailable, type TraceabilityAccess as Access } from '~/data/batchTraceability'
import type { BatchAttributeKey } from '~/data/batchAttributes'
import { vendors } from '~/data/vendors'
import { grades } from '~/data/grades'

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: BatchAttributeFiltersValue
  access: Access
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: BatchAttributeFiltersValue): void
}>()
const { t } = useLocale()

function copy(v: BatchAttributeFiltersValue): BatchAttributeFiltersValue {
  return { ...v, vendorIds: [...v.vendorIds], gradeIds: [...v.gradeIds] }
}
const draft = reactive<BatchAttributeFiltersValue>(copy(props.modelValue))
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, copy(props.modelValue)) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', copy(draft)); close() }
function reset() { Object.assign(draft, emptyBatchAttributeFilters()) }

const available = (key: BatchAttributeKey) => isAttributeAvailable(key, props.access)

// MultiSelectDropdown works in option strings — names in, ids out.
const vendorNames = computed(() => vendors.map((v) => v.name))
const vendorSelection = computed({
  get: () => draft.vendorIds.map((id) => vendors.find((v) => v.id === id)?.name ?? id),
  set: (names: string[]) => { draft.vendorIds = names.map((n) => vendors.find((v) => v.name === n)?.id ?? n) },
})
const gradeList = computed(() => grades())
const gradeNames = computed(() => gradeList.value.map((g) => g.name))
const gradeSelection = computed({
  get: () => draft.gradeIds.map((id) => gradeList.value.find((g) => g.id === id)?.name ?? id),
  set: (names: string[]) => { draft.gradeIds = names.map((n) => gradeList.value.find((g) => g.name === n)?.id ?? n) },
})
</script>

<template>
  <Teleport to="body">
    <Transition name="btf">
      <div v-if="isOpen" class="btf-overlay">
        <div class="btf-panel" role="dialog" :aria-label="t('All filters')">
          <header class="btf-header">
            <span class="btf-title">{{ t('All filters') }}</span>
            <MpButton is-rounded class="btf-close" :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>

          <div class="btf-body">
            <div class="btf-field" :class="{ 'btf-field--unavailable': !available('supplier') }">
              <span class="btf-label">{{ t('Vendor') }}</span>
              <MultiSelectDropdown
                v-if="available('supplier')" :id="`${id}-vendor`" v-model="vendorSelection"
                :options="vendorNames" :placeholder="t('Select vendor')" is-full-width
              />
              <template v-else>
                <div class="btf-unavailable-box" aria-disabled="true">{{ t('Select vendor') }}</div>
                <span class="btf-caption">{{ t('Available with the Batch Attribute add-on') }}</span>
              </template>
            </div>

            <div class="btf-field" :class="{ 'btf-field--unavailable': !available('grade') }">
              <span class="btf-label">{{ t('Grade') }}</span>
              <MultiSelectDropdown
                v-if="available('grade')" :id="`${id}-grade`" v-model="gradeSelection"
                :options="gradeNames" :placeholder="t('Select grade')" is-full-width
              />
              <template v-else>
                <div class="btf-unavailable-box" aria-disabled="true">{{ t('Select grade') }}</div>
                <span class="btf-caption">{{ t('Available with the Batch Attribute add-on') }}</span>
              </template>
            </div>

            <div class="btf-field">
              <span class="btf-label">{{ t('Expiry date') }}</span>
              <DateConditionField :id="`${id}-expiry`" v-model="draft.expiry" />
            </div>

            <div class="btf-field" :class="{ 'btf-field--unavailable': !available('manufacturing_date') }">
              <span class="btf-label">{{ t('Manufacturing date') }}</span>
              <DateConditionField v-if="available('manufacturing_date')" :id="`${id}-manufacturing`" v-model="draft.manufacturing" />
              <template v-else>
                <div class="btf-unavailable-box" aria-disabled="true">{{ t('Select date') }}</div>
                <span class="btf-caption">{{ t('Available with the Batch Attribute add-on') }}</span>
              </template>
            </div>

            <div class="btf-field" :class="{ 'btf-field--unavailable': !available('best_before_date') }">
              <span class="btf-label">{{ t('Best before date') }}</span>
              <DateConditionField v-if="available('best_before_date')" :id="`${id}-best-before`" v-model="draft.bestBefore" />
              <template v-else>
                <div class="btf-unavailable-box" aria-disabled="true">{{ t('Select date') }}</div>
                <span class="btf-caption">{{ t('Available with the Batch Attribute add-on') }}</span>
              </template>
            </div>
          </div>

          <footer class="btf-footer">
            <MpButton variant="ghost" is-rounded @click="reset">{{ t('Reset filter') }}</MpButton>
            <div class="btf-footer-right">
              <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
              <MpButton variant="primary" is-rounded @click="apply">{{ t('Apply') }}</MpButton>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.btf-enter-active, .btf-leave-active { transition: background-color 250ms ease; }
.btf-enter-from, .btf-leave-to { background-color: transparent; }
.btf-enter-active .btf-panel { transition: transform 350ms ease-out; }
.btf-leave-active .btf-panel { transition: transform 250ms ease-in; }
.btf-enter-from .btf-panel, .btf-leave-to .btf-panel { transform: translateX(calc(100% + 12px)); }

.btf-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.btf-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px)); height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden;
}
.btf-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.btf-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.btf-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md); color: var(--mp-icon-default);
}
.btf-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3) !important; }

.btf-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px);
  padding: var(--mp-spacing-4);
}
.btf-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.btf-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.btf-caption { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }

/* Greyed-out attribute the company has no access to (PRD story 1). */
.btf-field--unavailable .btf-label { color: var(--mp-text-disabled, #8c9596); }
.btf-unavailable-box {
  display: flex; align-items: center; height: var(--mp-sizes-9\.5, 38px); padding: 0 var(--mp-spacing-3);
  background: var(--mp-background-neutral-disabled, #f1f3f5);
  border: 1px solid var(--mp-colors-border-form, #1d1f2429); border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-disabled, #8c9596); cursor: not-allowed;
}

.btf-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
.btf-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
