<script lang="ts">
// Runtime export (empty value) + shared type, used by ProjectAccountingPage.vue.
export interface ProjectFiltersValue {
  method: string[]
  pm: string[]
  customer: string[]
  /** 'over' | 'near' | 'none' */
  budget: string[]
  /** 'uptodate' | 'unbilled' | 'advance' */
  billing: string[]
  status: string[]
}

export type ProjectFilterKey = keyof ProjectFiltersValue

export function emptyProjectFilters(): ProjectFiltersValue {
  return { method: [], pm: [], customer: [], budget: [], billing: [], status: [] }
}

/** Number of drawer fields with at least one value ticked. */
export function countProjectFilters(v: ProjectFiltersValue): number {
  return (Object.keys(v) as ProjectFilterKey[]).filter(k => v[k].length > 0).length
}
</script>

<script setup lang="ts">
/**
 * Project accounting — "All filters" drawer. Same structure as BillsFiltersDrawer
 * (custom Teleport-free overlay, edits a local draft, commits only on Apply, an
 * outside click is ignored so in-progress choices are never lost). Every field is
 * a checklist: Method, Project manager, Customer, Budget, Billing position, Status.
 */
import { MpIcon, MpButton, MpCheckbox } from '@mekari/pixel3'

type Opt = { value: string; label: string }

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: ProjectFiltersValue
  options: Record<ProjectFilterKey, Opt[]>
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: ProjectFiltersValue): void
}>()

const { t } = useLocale()

const SECTIONS: { key: ProjectFilterKey; label: string }[] = [
  { key: 'method', label: 'Method' },
  { key: 'pm', label: 'Project manager' },
  { key: 'customer', label: 'Customer' },
  { key: 'budget', label: 'Budget' },
  { key: 'billing', label: 'Billing position' },
  { key: 'status', label: 'Status' },
]

function clone(v: ProjectFiltersValue): ProjectFiltersValue {
  return {
    method: [...v.method], pm: [...v.pm], customer: [...v.customer],
    budget: [...v.budget], billing: [...v.billing], status: [...v.status],
  }
}

const draft = reactive<ProjectFiltersValue>(clone(props.modelValue))
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, clone(props.modelValue)) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', clone(draft)); close() }
function resetAll() { Object.assign(draft, emptyProjectFilters()) }

function toggle(key: ProjectFilterKey, value: string) {
  draft[key] = draft[key].includes(value) ? draft[key].filter(v => v !== value) : [...draft[key], value]
}
</script>

<template>
  <Transition name="pfd-filters">
    <div v-if="isOpen" class="pfd-overlay">
      <div class="pfd-panel" role="dialog" :aria-label="t('All filters')">
        <header class="pfd-header">
          <span class="pfd-title">{{ t('All filters') }}</span>
          <MpButton class="pfd-close" variant="ghost" :aria-label="t('Close')" @click="close">
            <MpIcon name="close" size="md" />
          </MpButton>
        </header>

        <div class="pfd-body">
          <div v-for="s in SECTIONS" v-show="options[s.key].length" :key="s.key" class="pfd-field">
            <span class="pfd-field-label">{{ t(s.label) }}</span>
            <ul class="pfd-checklist">
              <li
                v-for="opt in options[s.key]" :key="opt.value"
                class="pfd-check-item" @click="toggle(s.key, opt.value)"
              >
                <span @click.stop>
                  <MpCheckbox
                    :id="`${id}-${s.key}-${opt.value.replace(/\W+/g, '-')}`"
                    :is-checked="draft[s.key].includes(opt.value)"
                    @change="() => toggle(s.key, opt.value)"
                  />
                </span>
                <span class="pfd-check-label">{{ opt.label }}</span>
              </li>
            </ul>
          </div>
        </div>

        <footer class="pfd-footer">
          <MpButton variant="ghost" is-rounded @click="resetAll">{{ t('Reset filter') }}</MpButton>
          <div class="pfd-footer-right">
            <MpButton variant="ghost" is-rounded @click="close">{{ t('Cancel') }}</MpButton>
            <MpButton variant="primary" is-rounded @click="apply">{{ t('Apply') }}</MpButton>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.pfd-filters-enter-active, .pfd-filters-leave-active { transition: background-color 250ms ease; }
.pfd-filters-enter-from, .pfd-filters-leave-to { background-color: transparent; }
.pfd-filters-enter-active .pfd-panel { transition: transform 350ms ease-out; }
.pfd-filters-leave-active .pfd-panel { transition: transform 250ms ease-in; }
.pfd-filters-enter-from .pfd-panel,
.pfd-filters-leave-to .pfd-panel { transform: translateX(calc(100% + var(--mp-spacing-3))); }

.pfd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-background-overlay);
  display: flex; justify-content: flex-end;
}
.pfd-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - var(--mp-spacing-6)));
  height: calc(100% - var(--mp-spacing-6));
  display: flex; flex-direction: column;
  background: var(--mp-background-neutral);
  border-radius: var(--mp-radii-xl);
  overflow: hidden;
}
.pfd-header {
  flex: none; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.pfd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pfd-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9) !important; height: var(--mp-sizes-9) !important; min-width: 0 !important; padding: 0 !important;
  color: var(--mp-colors-icon-default);
}

.pfd-body {
  flex: 1 1 auto; min-height: 0; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-5);
  padding: var(--mp-spacing-4);
}
.pfd-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.pfd-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.pfd-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.pfd-check-item { display: flex; align-items: center; cursor: pointer; user-select: none; }
.pfd-check-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.pfd-footer {
  flex: none; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
.pfd-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
