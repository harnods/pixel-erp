<script lang="ts">
export interface ReconciliationFiltersValue {
  /** Masa pajak ids ('2026-04'). Empty = every period. */
  periods: string[]
  /** Only rows where the two columns disagree. */
  withDifferenceOnly: boolean
}

export function emptyReconciliationFilters(): ReconciliationFiltersValue {
  return { periods: [], withDifferenceOnly: false }
}
</script>

<script setup lang="ts">
/**
 * VAT reconciliation — "All filters" drawer.
 *
 * Holds the filters that don't earn one of the two quick-filter slots (Invoice
 * type, Status): the masa pajak picker and the has-a-difference switch. Same
 * structural pattern as SalesOrderFiltersDrawer — a custom overlay rather than
 * MpDrawer, which has no structural CSS in this Pixel3 build.
 *
 * Edits a local draft and only commits on Apply. It is a form, so an outside
 * click is deliberately ignored; closing happens via ×, Cancel, or Apply, and
 * the draft re-syncs from modelValue on every open so a discarded edit is
 * forgotten.
 */
import { MpIcon, MpButton, MpCheckbox } from '@mekari/pixel3'

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: ReconciliationFiltersValue
  /** Every masa in the index, newest first. */
  periodOptions: { value: string; label: string }[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: ReconciliationFiltersValue): void
}>()

const { t } = useLocale()

const draft = reactive<ReconciliationFiltersValue>({ ...props.modelValue })
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, props.modelValue) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', { ...draft }); close() }
function clearAll() { Object.assign(draft, emptyReconciliationFilters()) }

function togglePeriod(value: string) {
  draft.periods = draft.periods.includes(value)
    ? draft.periods.filter(v => v !== value)
    : [...draft.periods, value]
}
</script>

<template>
  <Transition name="rf-filters">
    <div v-if="isOpen" class="rf-filters-overlay">
      <div class="rf-filters-panel" role="dialog" :aria-label="t('All filters')">
        <header class="rf-filters-header">
          <span class="rf-filters-title">{{ t('All filters') }}</span>
          <MpButton class="rf-filters-close" :aria-label="t('Close')" @click="close">
            <MpIcon name="close" size="md" />
          </MpButton>
        </header>

        <div class="rf-filters-body">
          <!-- Masa pajak — a checklist, not a select: reconciling a quarter means
               picking three periods at once. -->
          <div class="rf-field">
            <span class="rf-field-label">{{ t('Tax period') }}</span>
            <ul class="rf-checklist">
              <li v-for="opt in periodOptions" :key="opt.value" class="rf-check-item" @click="togglePeriod(opt.value)">
                <span @click.stop>
                  <MpCheckbox
                    :id="`${id}-period-${opt.value}`"
                    :is-checked="draft.periods.includes(opt.value)"
                    @change="() => togglePeriod(opt.value)"
                  />
                </span>
                <span class="rf-check-label">{{ opt.label }}</span>
              </li>
            </ul>
          </div>

          <div class="rf-field">
            <span class="rf-field-label">{{ t('Difference') }}</span>
            <div class="rf-check-item" @click="draft.withDifferenceOnly = !draft.withDifferenceOnly">
              <span @click.stop>
                <MpCheckbox
                  :id="`${id}-diff`"
                  :is-checked="draft.withDifferenceOnly"
                  @change="() => (draft.withDifferenceOnly = !draft.withDifferenceOnly)"
                />
              </span>
              <span class="rf-check-label">{{ t('Only periods with a difference') }}</span>
            </div>
          </div>
        </div>

        <footer class="rf-filters-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="clearAll">
            {{ t('Reset filter') }}
          </button>
          <div class="rf-footer-right">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">
              {{ t('Cancel') }}
            </button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">
              {{ t('Apply') }}
            </button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.rf-filters-enter-active { transition: background-color 250ms ease; }
.rf-filters-leave-active { transition: background-color 250ms ease; }
.rf-filters-enter-from, .rf-filters-leave-to { background-color: transparent; }
.rf-filters-enter-active .rf-filters-panel { transition: transform 350ms ease-out; }
.rf-filters-leave-active .rf-filters-panel { transition: transform 250ms ease-in; }
.rf-filters-enter-from .rf-filters-panel,
.rf-filters-leave-to .rf-filters-panel { transform: translateX(calc(100% + 12px)); }

.rf-filters-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  /* No literal fallback: --mp-colors-overlay is emitted (#161a20cc), so the
     fallback SalesOrderFiltersDrawer carries here is dead code. */
  background: var(--mp-colors-overlay);
  display: flex;
  justify-content: flex-end;
}
.rf-filters-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex;
  flex-direction: column;
  /* --mp-background-stage is emitted (#fff) by the layout, so the #fff fallback
     SalesOrderFiltersDrawer carries is dead code here too. */
  background: var(--mp-background-stage);
  border-radius: 12px;
  overflow: hidden;
}
.rf-filters-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.rf-filters-title {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.rf-filters-close {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px) !important;
  height: var(--mp-sizes-9, 36px) !important;
  min-width: 0 !important;
  border: none !important;
  background: none !important;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
  color: var(--mp-icon-default);
}
.rf-filters-close:hover { background: var(--mp-background-neutral-hovered); }

.rf-filters-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--mp-spacing-4);
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
}
.rf-field { display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.rf-field-label {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.rf-checklist {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1);
}
.rf-check-item {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-1) 0;
  cursor: pointer;
}
.rf-check-label {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

.rf-filters-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
.rf-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
