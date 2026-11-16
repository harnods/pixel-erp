<script setup lang="ts">
/**
 * Budget report: All filters drawer. Department, project, account and class
 * filter at once; values inside one dimension combine with OR, dimensions with
 * AND. Only the dimensions in the budget key are offered. Edits a draft and
 * commits on Apply. Same Teleport shell as BillsFiltersDrawer.
 */
import { reactive, watch } from 'vue'
import { MpButton, MpIcon, MpCheckbox } from '@mekari/pixel3'
import type { ReportFilter } from '~/data/budgetStore'
import type { ReportOption } from '~/data/budgetUiReport'
import type { BudgetClass } from '~/data/budgetMaster'

const props = defineProps<{
  isOpen: boolean
  modelValue: ReportFilter
  options: {
    depts: ReportOption[]
    projects: ReportOption<string | null>[]
    accounts: ReportOption[]
    classes: ReportOption<BudgetClass>[]
  }
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: ReportFilter): void
}>()

const { t } = useLocale()

type Dim = keyof ReportFilter
const draft = reactive<ReportFilter>({ depts: [], projects: [], accounts: [], classes: [] })
function load() {
  draft.depts = [...props.modelValue.depts]
  draft.projects = [...props.modelValue.projects]
  draft.accounts = [...props.modelValue.accounts]
  draft.classes = [...props.modelValue.classes]
}
watch(() => props.isOpen, (open) => { if (open) load() }, { immediate: true })

const sections: { dim: Dim; label: string }[] = [
  { dim: 'depts', label: 'Department' },
  { dim: 'projects', label: 'Project' },
  { dim: 'accounts', label: 'Account' },
  { dim: 'classes', label: 'Class' },
]

function isOn(dim: Dim, v: string | null): boolean { return (draft[dim] as (string | null)[]).includes(v) }
function toggle(dim: Dim, v: string | null) {
  const list = draft[dim] as (string | null)[]
  const i = list.indexOf(v)
  if (i >= 0) list.splice(i, 1)
  else list.push(v)
}
const optKey = (v: string | null) => v ?? 'none'

function close() { emit('update:isOpen', false) }
function apply() {
  emit('apply', { depts: [...draft.depts], projects: [...draft.projects], accounts: [...draft.accounts], classes: [...draft.classes] })
  close()
}
function clearAll() { draft.depts = []; draft.projects = []; draft.accounts = []; draft.classes = [] }
</script>

<template>
  <Teleport to="body">
    <Transition name="brf">
      <div v-if="isOpen" class="brf-overlay" @click.self="close">
        <div class="brf-panel" role="dialog" :aria-label="t('All filters')">
          <header class="brf-header">
            <span class="brf-title">{{ t('All filters') }}</span>
            <MpButton class="brf-close" :aria-label="t('Close')" is-rounded @click="close">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>

          <div class="brf-body">
            <div v-for="s in sections" :key="s.dim" class="brf-field">
              <span class="brf-field-label">{{ t(s.label) }}</span>
              <ul class="brf-checklist">
                <li
                  v-for="o in options[s.dim]"
                  :key="optKey(o.value)"
                  class="brf-check-item"
                  @click="toggle(s.dim, o.value)"
                >
                  <span @click.stop>
                    <MpCheckbox :id="`brf-${s.dim}-${optKey(o.value)}`" :is-checked="isOn(s.dim, o.value)" @change="() => toggle(s.dim, o.value)" />
                  </span>
                  <span class="brf-check-label">{{ t(o.label) }}</span>
                </li>
              </ul>
            </div>
          </div>

          <footer class="brf-footer">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="clearAll">{{ t('Reset filter') }}</button>
            <div class="brf-footer-right">
              <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
              <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">{{ t('Apply') }}</button>
            </div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.brf-enter-active, .brf-leave-active { transition: background-color 250ms ease; }
.brf-enter-from, .brf-leave-to { background-color: transparent; }
.brf-enter-active .brf-panel { transition: transform 350ms ease-out; }
.brf-leave-active .brf-panel { transition: transform 250ms ease-in; }
.brf-enter-from .brf-panel, .brf-leave-to .brf-panel { transform: translateX(calc(100% + 12px)); }

.brf-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.brf-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 12px);
  overflow: hidden;
}
.brf-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.brf-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.brf-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-colors-icon-default);
}
.brf-close:hover { background: var(--mp-background-neutral-hovered) !important; }
.brf-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px);
  padding: var(--mp-spacing-4);
}
.brf-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.brf-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.brf-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.brf-check-item { display: flex; align-items: center; gap: 0; cursor: pointer; user-select: none; }
.brf-check-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.brf-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
.brf-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
