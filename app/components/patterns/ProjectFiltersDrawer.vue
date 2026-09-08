<script lang="ts">
// `<script setup>` cannot contain plain function/interface exports — this
// companion block holds the shared type and the all-empty factory, both used by
// ProjectsPage.vue and by <script setup> below (same module scope).

export interface ProjectFiltersValue {
  method: string
  branch: string
  department: string
  costCenter: string
  fundingSource: string
  /** Story 15 — surface the loss-making jobs directly. */
  overBudgetOnly: boolean
}

export function emptyProjectFilters(): ProjectFiltersValue {
  return { method: '', branch: '', department: '', costCenter: '', fundingSource: '', overBudgetOnly: false }
}
</script>

<script setup lang="ts">
/**
 * Projects portfolio — "All filters" drawer.
 *
 * Custom Teleport overlay panel (rule/drawer-custom-shell — Pixel MpDrawer has no
 * structural CSS in this build). Edits a LOCAL draft and commits to the parent
 * only on Apply (rule/filter-drawer-shell), and being a form it ignores the
 * overlay click so in-progress input is never lost.
 *
 * Field set: recognition method + the four reporting dimensions (Branch,
 * Department, Cost center, Funding source). Dimensions are actual-side reporting
 * only — the PRD is explicit that no dimension-level budget exists (§9), so they
 * narrow the list and nothing more.
 */
import { reactive, watch } from 'vue'
import { MpIcon, MpButton, MpCheckbox } from '@mekari/pixel3'
import ErpFilterSelect from '~/components/patterns/ErpFilterSelect.vue'

const props = defineProps<{
  isOpen: boolean
  modelValue: ProjectFiltersValue
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: ProjectFiltersValue): void
}>()

const { t } = useLocale()

const METHOD_OPTIONS = [
  { value: 'tm',     label: t('T&M') },
  { value: 'input',  label: t('Input') },
  { value: 'output', label: t('Output') },
]
const BRANCH_OPTIONS = [
  { value: 'jakarta', label: 'Jakarta' },
  { value: 'bekasi',  label: 'Bekasi' },
  { value: 'surabaya', label: 'Surabaya' },
]
const DEPARTMENT_OPTIONS = [
  { value: 'produksi',  label: 'Produksi' },
  { value: 'proyek',    label: 'Proyek' },
  { value: 'engineering', label: 'Engineering' },
]
const COST_CENTER_OPTIONS = [
  { value: 'cc-fab',  label: 'CC-100 Fabrikasi' },
  { value: 'cc-inst', label: 'CC-200 Instalasi' },
  { value: 'cc-svc',  label: 'CC-300 Jasa' },
]
const FUNDING_OPTIONS = [
  { value: 'internal', label: t('Internal') },
  { value: 'customer', label: t('Customer advance') },
  { value: 'bank',     label: t('Bank facility') },
]

// The draft re-syncs from the applied value on every open, so a discarded edit
// never leaks into the next session of the drawer.
const draft = reactive<ProjectFiltersValue>({ ...props.modelValue })
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, props.modelValue) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', { ...draft }); close() }
function resetFilter() { Object.assign(draft, emptyProjectFilters()) }
</script>

<template>
  <Teleport to="body">
    <Transition name="pf">
      <!-- No @click.self on the overlay: this is a form, so it closes only via
           ×, Cancel or Apply (rule/filter-drawer-shell). -->
      <div v-if="isOpen" class="pf-overlay">
        <div class="pf-panel" role="dialog" :aria-label="t('All filters')">
          <header class="pf-header">
            <span class="pf-title">{{ t('All filters') }}</span>
            <button class="pf-close" type="button" :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </button>
          </header>

          <div class="pf-body">
            <div class="pf-field">
              <span class="pf-label">{{ t('Recognition method') }}</span>
              <ErpFilterSelect id="pf-method" v-model="draft.method" :placeholder="t('Select method')" :options="METHOD_OPTIONS" width="100%" />
            </div>

            <div class="pf-field">
              <span class="pf-label">{{ t('Branch') }}</span>
              <ErpFilterSelect id="pf-branch" v-model="draft.branch" :placeholder="t('Select branch')" :options="BRANCH_OPTIONS" width="100%" />
            </div>

            <div class="pf-field">
              <span class="pf-label">{{ t('Department') }}</span>
              <ErpFilterSelect id="pf-dept" v-model="draft.department" :placeholder="t('Select department')" :options="DEPARTMENT_OPTIONS" width="100%" />
            </div>

            <div class="pf-field">
              <span class="pf-label">{{ t('Cost center') }}</span>
              <ErpFilterSelect id="pf-cc" v-model="draft.costCenter" :placeholder="t('Select cost center')" :options="COST_CENTER_OPTIONS" width="100%" />
            </div>

            <div class="pf-field">
              <span class="pf-label">{{ t('Funding source') }}</span>
              <ErpFilterSelect id="pf-funding" v-model="draft.fundingSource" :placeholder="t('Select funding source')" :options="FUNDING_OPTIONS" width="100%" />
            </div>

            <div class="pf-field">
              <span class="pf-label">{{ t('Exposure') }}</span>
              <!-- 12px box↔label gap is built into MpCheckbox (rule/checkbox-gap-12). -->
              <MpCheckbox
                id="pf-overbudget"
                :is-checked="draft.overBudgetOnly"
                @change="draft.overBudgetOnly = !draft.overBudgetOnly"
              >{{ t('Over budget only') }}</MpCheckbox>
            </div>
          </div>

          <!-- Three actions, always: Reset left, Cancel + Apply right
               (rule/filter-drawer-footer). -->
          <footer class="pf-footer">
            <MpButton variant="ghost" is-rounded @click="resetFilter">{{ t('Reset filter') }}</MpButton>
            <div class="pf-footer-right">
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
.pf-enter-active, .pf-leave-active { transition: background-color 250ms ease; }
.pf-enter-from, .pf-leave-to { background-color: transparent; }
.pf-enter-active .pf-panel { transition: transform 350ms ease-out; }
.pf-leave-active .pf-panel { transition: transform 250ms ease-in; }
.pf-enter-from .pf-panel, .pf-leave-to .pf-panel { transform: translateX(calc(100% + 12px)); }

.pf-overlay {
  position: fixed; inset: 0; z-index: 1300;
  /* The overlay token with its literal fallback — the 37 older drawers hardcode
     the rgba; new surfaces use the token (rule/token-no-hardcoded-color). */
  background: var(--mp-colors-background-overlay, rgba(8, 13, 14, 0.55));
  display: flex; justify-content: flex-end;
}
.pf-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 24px;
  overflow: hidden;
}
/* Header carries a background fill; the panel has no shadow
   (rule/drawer-header-fill, rule/surface-border-no-shadow). */
.pf-header {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.pf-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.pf-close {
  display: inline-flex; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px); height: var(--mp-sizes-9, 36px);
  border: none; background: none; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.pf-close:hover { background: var(--mp-background-neutral-hovered); }

.pf-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-5);
  padding: var(--mp-spacing-4);
}
.pf-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.pf-label {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.pf-footer {
  flex-shrink: 0;
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
.pf-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
