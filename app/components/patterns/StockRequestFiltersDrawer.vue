<script lang="ts">
// `<script setup>` can't hold runtime exports — this companion block carries the
// shared type + a fresh all-empty value, used by StockRequestsPage.vue and by
// `<script setup>` below (same module scope).

export interface StockRequestFiltersValue {
  /** free-text keyword; empty = no keyword filter */
  keyword: string
  /** selected stock-request statuses; empty = every status */
  status: string[]
  /** AdvancedDateRangePicker range — null = not applied. */
  requestDate: Date[] | null
}

export function emptyStockRequestFilters(): StockRequestFiltersValue {
  return { keyword: '', status: [], requestDate: null }
}
</script>

<script setup lang="ts">
/**
 * Stock requests — "All filters" drawer. Same structural pattern as
 * PurchaseRequestFiltersDrawer.vue (custom Teleport overlay — MpDrawer has no
 * structural CSS in this Pixel3 build). Edits a local draft and only commits to
 * the parent's filter state on Apply. It is a form, so an outside (overlay)
 * click is intentionally IGNORED — closing only ever happens via the header x,
 * Cancel, or Apply, so in-progress input is never lost by a stray click. The
 * draft re-syncs from modelValue on every open, so a discarded (x) edit is
 * forgotten next time.
 */
import { MpIcon, MpButton, MpCheckbox, MpFormControl, MpFormLabel } from '@mekari/pixel3'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: StockRequestFiltersValue
  statusOptions: { value: string; label: string }[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: StockRequestFiltersValue): void
}>()

const { t } = useLocale()

const draft = reactive<StockRequestFiltersValue>({ ...props.modelValue })
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, props.modelValue) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', { ...draft }); close() }
function clearAll() { Object.assign(draft, emptyStockRequestFilters()) }

function toggleStatus(value: string) {
  draft.status = draft.status.includes(value)
    ? draft.status.filter(v => v !== value)
    : [...draft.status, value]
}
</script>

<template>
  <Transition name="srf-filters">
    <div v-if="isOpen" class="srf-filters-overlay">
      <div class="srf-filters-panel" role="dialog" :aria-label="t('All filters')">
        <header class="srf-filters-header">
          <span class="srf-filters-title">{{ t('All filters') }}</span>
          <MpButton class="srf-filters-close" :aria-label="t('Close')" @click="close">
            <MpIcon name="close" size="md" />
          </MpButton>
        </header>

        <div class="srf-filters-body">
          <!-- Keywords — plain text field (one searchable column set, so no scope picker). -->
          <MpFormControl :id="`${id}-keyword-fc`">
            <MpFormLabel>{{ t('Keywords') }}</MpFormLabel>
            <div class="srf-keyword">
              <input
                v-model="draft.keyword"
                class="srf-keyword-input"
                type="text"
                :placeholder="t('Search keywords...')"
                @keydown.enter.prevent="apply"
              >
            </div>
          </MpFormControl>

          <div class="srf-field">
            <span class="srf-field-label">{{ t('Status') }}</span>
            <ul class="srf-checklist">
              <li
                v-for="opt in statusOptions" :key="opt.value"
                class="srf-check-item" @click="toggleStatus(opt.value)"
              >
                <span @click.stop>
                  <MpCheckbox
                    :id="`${id}-status-${opt.value}`"
                    :is-checked="draft.status.includes(opt.value)"
                    @change="() => toggleStatus(opt.value)"
                  />
                </span>
                <span class="srf-check-label">{{ opt.label }}</span>
              </li>
            </ul>
          </div>

          <!-- Request date — past-preset range (Today / Last 7 / Last 30 days). -->
          <div class="srf-field">
            <span class="srf-field-label">{{ t('Request date') }}</span>
            <AdvancedDateRangePicker
              :id="`${id}-requestdate`" :model-value="draft.requestDate"
              is-full-width hide-label :placeholder="t('Select request date')"
              @update:model-value="draft.requestDate = $event"
            />
          </div>
        </div>

        <footer class="srf-filters-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="clearAll">{{ t('Reset filter') }}</button>
          <div class="srf-footer-right">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ t('Cancel') }}</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">{{ t('Apply') }}</button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.srf-filters-enter-active { transition: background-color 250ms ease; }
.srf-filters-leave-active { transition: background-color 250ms ease; }
.srf-filters-enter-from, .srf-filters-leave-to { background-color: transparent; }
.srf-filters-enter-active .srf-filters-panel { transition: transform 350ms ease-out; }
.srf-filters-leave-active .srf-filters-panel { transition: transform 250ms ease-in; }
.srf-filters-enter-from .srf-filters-panel,
.srf-filters-leave-to .srf-filters-panel { transform: translateX(calc(100% + 12px)); }

.srf-filters-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.srf-filters-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 12px;
  overflow: hidden;
}
.srf-filters-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f8f9f9);
  border-bottom: 1px solid var(--mp-border-default, #e3e7e9);
}
.srf-filters-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.srf-filters-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.srf-filters-close:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }

.srf-filters-body {
  flex: 1; overflow-y: auto;
  /* 20px row gap between fields — the standard form field spacing (Form.md). */
  display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px);
  padding: var(--mp-spacing-4);
}

.srf-keyword {
  display: flex; align-items: center;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-md, 6px);
}
.srf-keyword:focus-within { border-color: var(--mp-border-brand, #4b61dc); }
.srf-keyword-input {
  flex: 1 0 0; min-width: 0; height: 20px;
  border: none; outline: none; background: transparent; padding: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.srf-keyword-input::placeholder { color: var(--mp-text-placeholder); }

.srf-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.srf-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.srf-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.srf-check-item { display: flex; align-items: center; gap: 0; cursor: pointer; user-select: none; }
.srf-check-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.srf-filters-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default, #e3e7e9);
}
.srf-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
