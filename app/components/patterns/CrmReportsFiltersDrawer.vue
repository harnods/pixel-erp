<script lang="ts">
// Companion block: shared value type + an all-empty factory, same module scope
// as <script setup> below (mirrors CrmCompaniesFiltersDrawer.vue).
export type ReportsTagMatcher = 'isAnyOf' | 'isNoneOf'

export interface ReportsFiltersValue {
  moduleComparator: ReportsTagMatcher
  modules: string[]
  ownerComparator: ReportsTagMatcher
  owners: string[]
  statuses: string[]
  visibilities: string[]
}

export function emptyReportsFilters(): ReportsFiltersValue {
  return {
    moduleComparator: 'isAnyOf', modules: [],
    ownerComparator: 'isAnyOf', owners: [],
    statuses: [], visibilities: [],
  }
}
</script>

<script setup lang="ts">
/**
 * CRM Reports — "All filters" drawer (rule/filter-drawer-shell). Module and
 * Owner are "Is any of / Is none of" comparator + typeable tag inputs
 * (ErpTagComparatorField, per rule/input-tag-comparator); Status and
 * Visibility are MpCheckbox lists (rule/filter-drawer-fields). Edits a local
 * draft; commits only on Apply (rule/filter-drawer-footer). As a form it
 * ignores the overlay click — close only via ×, Cancel, or Apply.
 */
import { reactive, watch } from 'vue'
import { MpIcon, MpButton, MpCheckbox } from '@mekari/pixel3'
import ErpTagComparatorField from '~/components/patterns/ErpTagComparatorField.vue'

const { t } = useLocale()

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: ReportsFiltersValue
  moduleOptions: string[]
  ownerOptions: string[]
  statusOptions: { value: string; label: string }[]
  visibilityOptions: { value: string; label: string }[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: ReportsFiltersValue): void
}>()

function clone(v: ReportsFiltersValue): ReportsFiltersValue {
  return {
    moduleComparator: v.moduleComparator, modules: [...v.modules],
    ownerComparator: v.ownerComparator, owners: [...v.owners],
    statuses: [...v.statuses], visibilities: [...v.visibilities],
  }
}
const draft = reactive<ReportsFiltersValue>(clone(props.modelValue))
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, clone(props.modelValue)) })

function close() { emit('update:isOpen', false) }
function reset() { Object.assign(draft, emptyReportsFilters()) }
function apply() { emit('apply', clone(draft)); close() }

function toggleStatus(value: string) {
  draft.statuses = draft.statuses.includes(value) ? draft.statuses.filter((v) => v !== value) : [...draft.statuses, value]
}
function toggleVisibility(value: string) {
  draft.visibilities = draft.visibilities.includes(value) ? draft.visibilities.filter((v) => v !== value) : [...draft.visibilities, value]
}
</script>

<template>
  <Transition name="rfd">
    <div v-if="isOpen" class="rfd-overlay">
      <div class="rfd-panel" role="dialog" :aria-label="t('All filters')">
        <header class="rfd-header">
          <span class="rfd-title">{{ t('All filters') }}</span>
          <MpButton class="rfd-close" is-rounded :aria-label="t('Close')" @click="close"><MpIcon name="close" size="md" /></MpButton>
        </header>

        <div class="rfd-body">
          <!-- Module -->
          <div class="rfd-field">
            <span class="rfd-field-label">{{ t('Module') }}</span>
            <ErpTagComparatorField
              :id="`${id}-module`"
              :comparator="draft.moduleComparator"
              :values="draft.modules"
              :options="moduleOptions"
              :placeholder="t('Type a module…')"
              @update:comparator="draft.moduleComparator = $event"
              @update:values="draft.modules = $event"
            />
          </div>

          <!-- Owner -->
          <div class="rfd-field">
            <span class="rfd-field-label">{{ t('Owner') }}</span>
            <ErpTagComparatorField
              :id="`${id}-owner`"
              :comparator="draft.ownerComparator"
              :values="draft.owners"
              :options="ownerOptions"
              :placeholder="t('Type an owner…')"
              @update:comparator="draft.ownerComparator = $event"
              @update:values="draft.owners = $event"
            />
          </div>

          <!-- Status -->
          <div class="rfd-field">
            <span class="rfd-field-label">{{ t('Status') }}</span>
            <ul class="rfd-checklist">
              <li v-for="opt in statusOptions" :key="opt.value" class="rfd-check-item" @click="toggleStatus(opt.value)">
                <span @click.stop>
                  <MpCheckbox :id="`${id}-status-${opt.value}`" :is-checked="draft.statuses.includes(opt.value)" @change="() => toggleStatus(opt.value)" />
                </span>
                <span class="rfd-check-label">{{ opt.label }}</span>
              </li>
            </ul>
          </div>

          <!-- Visibility -->
          <div class="rfd-field">
            <span class="rfd-field-label">{{ t('Visibility') }}</span>
            <ul class="rfd-checklist">
              <li v-for="opt in visibilityOptions" :key="opt.value" class="rfd-check-item" @click="toggleVisibility(opt.value)">
                <span @click.stop>
                  <MpCheckbox :id="`${id}-visibility-${opt.value}`" :is-checked="draft.visibilities.includes(opt.value)" @change="() => toggleVisibility(opt.value)" />
                </span>
                <span class="rfd-check-label">{{ opt.label }}</span>
              </li>
            </ul>
          </div>
        </div>

        <footer class="rfd-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="reset">{{ t('Reset filter') }}</button>
          <div class="rfd-footer-right">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">{{ t('Save') }}</button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.rfd-enter-active, .rfd-leave-active { transition: background-color 250ms ease; }
.rfd-enter-from, .rfd-leave-to { background-color: transparent; }
.rfd-enter-active .rfd-panel { transition: transform 350ms ease-out; }
.rfd-leave-active .rfd-panel { transition: transform 250ms ease-in; }
.rfd-enter-from .rfd-panel, .rfd-leave-to .rfd-panel { transform: translateX(calc(100% + 12px)); }

.rfd-overlay { position: fixed; inset: 0; z-index: 1300; background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45)); display: flex; justify-content: flex-end; }
.rfd-panel { margin: var(--mp-spacing-3); width: min(420px, calc(100% - 24px)); height: calc(100% - 24px); display: flex; flex-direction: column; background: var(--mp-background-stage, #fff); border-radius: 12px; overflow: hidden; }
.rfd-header { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); background: var(--mp-background-neutral-subtle, #f8f9f9); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.rfd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.rfd-close { display: inline-flex !important; align-items: center; justify-content: center; width: 36px !important; height: 36px !important; min-width: 0 !important; border: none !important; background: none !important; border-radius: var(--mp-radii-md); cursor: pointer; color: var(--mp-icon-default); }
.rfd-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

.rfd-body { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px); padding: var(--mp-spacing-4); }

.rfd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.rfd-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.rfd-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.rfd-check-item { display: flex; align-items: center; gap: 0; cursor: pointer; user-select: none; }
.rfd-check-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.rfd-footer { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); padding: var(--mp-spacing-3) var(--mp-spacing-4); border-top: 1px solid var(--mp-border-default, #e3e7e9); }
.rfd-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
