<script lang="ts">
// `<script setup>` can't contain plain function/interface exports (only
// type-only re-exports are) — this companion block holds the runtime export
// (a fresh, all-empty filters value) and the shared type, both used by
// SalesInvoicesPage.vue and by <script setup> below (same module scope).
import type { AmountComparator } from '~/components/patterns/AmountComparatorField.vue'
import type { TagsComparator } from '~/components/patterns/TagsComparatorField.vue'

export interface SalesInvoiceFiltersValue {
  /** free-text keyword; empty = no keyword filter */
  keyword: string
  /** column key to scope the keyword to, or 'all' for every column */
  keywordColumn: string
  /** MpDatePicker format="DD/MM/YYYY" string — '' = not applied. */
  transactionDate: string
  dueDate: string
  status: string[]
  totalComparator: AmountComparator
  totalValue: string
  totalMin: string
  totalMax: string
  tagsComparator: TagsComparator
  tags: string[]
  djpStatus: string[]
}

export function emptySalesInvoiceFilters(): SalesInvoiceFiltersValue {
  return {
    keyword: '',
    keywordColumn: 'all',
    transactionDate: '',
    dueDate: '',
    status: [],
    totalComparator: 'gt',
    totalValue: '',
    totalMin: '',
    totalMax: '',
    tagsComparator: 'isAnyOf',
    tags: [],
    djpStatus: [],
  }
}
</script>

<script setup lang="ts">
/**
 * Sales Invoices — "All filters" drawer. Same structural pattern as
 * InboxFiltersDrawer.vue (custom Teleport overlay — MpDrawer has no
 * structural CSS in this Pixel3 build). Edits a local draft; only commits to
 * the parent's filter state on Apply, so Cancel/close-outside discards
 * in-progress edits.
 *
 * DJP status filters on the invoice's most recent tax document status (or
 * "Not generated" when it has none) — see getTaxDocumentsForInvoice /
 * DJP_STATUS_CONFIG in ~/data/taxDocuments.
 */
import { MpIcon, MpButton, MpCheckbox, MpFormControl, MpFormLabel, MpDatePicker, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import AmountComparatorField from '~/components/patterns/AmountComparatorField.vue'
import TagsComparatorField from '~/components/patterns/TagsComparatorField.vue'

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: SalesInvoiceFiltersValue
  columns: { key: string; label: string }[]
  statusOptions: { value: string; label: string }[]
  tagOptions: string[]
  djpStatusOptions: { value: string; label: string }[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: SalesInvoiceFiltersValue): void
}>()

const draft = reactive<SalesInvoiceFiltersValue>({ ...props.modelValue })
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, props.modelValue) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', { ...draft }); close() }
function clearAll() { Object.assign(draft, emptySalesInvoiceFilters()) }

function toggleStatus(value: string) {
  draft.status = draft.status.includes(value) ? draft.status.filter((v) => v !== value) : [...draft.status, value]
}
function toggleDjpStatus(value: string) {
  draft.djpStatus = draft.djpStatus.includes(value) ? draft.djpStatus.filter((v) => v !== value) : [...draft.djpStatus, value]
}

const keywordColumnOpen = ref(false)
const keywordColumnLabel = computed(() =>
  draft.keywordColumn === 'all' ? 'All columns' : (props.columns.find((c) => c.key === draft.keywordColumn)?.label ?? 'All columns'),
)
</script>

<template>
  <Transition name="sif-filters">
    <div v-if="isOpen" class="sif-filters-overlay" @click.self="close">
      <div class="sif-filters-panel" role="dialog" aria-label="All filters">
        <header class="sif-filters-header">
          <span class="sif-filters-title">All filters</span>
          <MpButton class="sif-filters-close" aria-label="Close" @click="close">
            <MpIcon name="close" size="md" />
          </MpButton>
        </header>

        <div class="sif-filters-body">
          <!-- Keywords — text input with an inline column-scope dropdown suffix,
               same shape as WmsReportFiltersDrawer's Keywords field. -->
          <MpFormControl :id="`${id}-keyword-fc`">
            <MpFormLabel>Keywords</MpFormLabel>
            <div class="sif-keyword">
              <input
                v-model="draft.keyword"
                class="sif-keyword-input"
                type="text"
                placeholder="Search keywords..."
                @keydown.enter.prevent="apply"
              >
              <MpPopover :id="`${id}-keyword-scope`" is-manual :is-open="keywordColumnOpen" use-portal :is-keep-alive="false" @open="keywordColumnOpen = true" @close="keywordColumnOpen = false">
                <MpPopoverTrigger>
                  <MpButton class="sif-keyword-scope" @click.stop="keywordColumnOpen = !keywordColumnOpen">
                    <span class="sif-keyword-scope-label">{{ keywordColumnLabel }}</span>
                    <MpIcon name="chevrons-down" size="sm" />
                  </MpButton>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content' })" @blur="keywordColumnOpen = false" @escape="keywordColumnOpen = false">
                  <MpPopoverList>
                    <MpPopoverListItem :is-active="draft.keywordColumn === 'all'" @click="draft.keywordColumn = 'all'">
                      All columns
                    </MpPopoverListItem>
                    <MpPopoverListItem
                      v-for="col in columns" :key="col.key"
                      :is-active="draft.keywordColumn === col.key" @click="draft.keywordColumn = col.key"
                    >
                      {{ col.label }}
                    </MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
            </div>
          </MpFormControl>

          <MpFormControl :id="`${id}-transactiondate-fc`">
            <MpFormLabel>Transaction date</MpFormLabel>
            <MpDatePicker
              :id="`${id}-transactiondate`" v-model="draft.transactionDate"
              format="DD/MM/YYYY" value-type="format" placeholder="Select transaction date"
              is-clearable use-portal is-full-width
            />
          </MpFormControl>

          <MpFormControl :id="`${id}-duedate-fc`">
            <MpFormLabel>Due date</MpFormLabel>
            <MpDatePicker
              :id="`${id}-duedate`" v-model="draft.dueDate"
              format="DD/MM/YYYY" value-type="format" placeholder="Select due date"
              is-clearable use-portal is-full-width
            />
          </MpFormControl>

          <div class="sif-field">
            <span class="sif-field-label">Status</span>
            <ul class="sif-checklist">
              <li
                v-for="opt in statusOptions" :key="opt.value"
                class="sif-check-item" @click="toggleStatus(opt.value)"
              >
                <span @click.stop>
                  <MpCheckbox :id="`${id}-status-${opt.value}`" :is-checked="draft.status.includes(opt.value)" @change="() => toggleStatus(opt.value)" />
                </span>
                <span class="sif-check-label">{{ opt.label }}</span>
              </li>
            </ul>
          </div>

          <!-- DJP status — the invoice's most recent tax document status, or
               "Not generated" when it has none yet (see getTaxDocumentsForInvoice). -->
          <div class="sif-field">
            <span class="sif-field-label">DJP status</span>
            <ul class="sif-checklist">
              <li
                v-for="opt in djpStatusOptions" :key="opt.value"
                class="sif-check-item" @click="toggleDjpStatus(opt.value)"
              >
                <span @click.stop>
                  <MpCheckbox :id="`${id}-djpstatus-${opt.value}`" :is-checked="draft.djpStatus.includes(opt.value)" @change="() => toggleDjpStatus(opt.value)" />
                </span>
                <span class="sif-check-label">{{ opt.label }}</span>
              </li>
            </ul>
          </div>

          <div class="sif-field">
            <span class="sif-field-label">Total (Rp)</span>
            <AmountComparatorField
              :id="`${id}-total`"
              :comparator="draft.totalComparator"
              :value="draft.totalValue"
              :min="draft.totalMin"
              :max="draft.totalMax"
              @update:comparator="draft.totalComparator = $event"
              @update:value="draft.totalValue = $event"
              @update:min="draft.totalMin = $event"
              @update:max="draft.totalMax = $event"
            />
          </div>

          <div class="sif-field">
            <span class="sif-field-label">Tags</span>
            <TagsComparatorField
              :id="`${id}-tags`"
              :comparator="draft.tagsComparator"
              :tags="draft.tags"
              :options="tagOptions"
              @update:comparator="draft.tagsComparator = $event"
              @update:tags="draft.tags = $event"
            />
          </div>
        </div>

        <footer class="sif-filters-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="clearAll">Reset filter</button>
          <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">Apply</button>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sif-filters-enter-active { transition: background-color 250ms ease; }
.sif-filters-leave-active { transition: background-color 250ms ease; }
.sif-filters-enter-from, .sif-filters-leave-to { background-color: transparent; }
.sif-filters-enter-active .sif-filters-panel { transition: transform 350ms ease-out; }
.sif-filters-leave-active .sif-filters-panel { transition: transform 250ms ease-in; }
.sif-filters-enter-from .sif-filters-panel,
.sif-filters-leave-to .sif-filters-panel { transform: translateX(calc(100% + 12px)); }

.sif-filters-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.sif-filters-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 12px;
  overflow: hidden;
}
.sif-filters-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.sif-filters-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.sif-filters-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.sif-filters-close:hover { background: var(--mp-background-neutral-hovered); }

.sif-filters-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-4);
  padding: var(--mp-spacing-4);
}

/* Keywords — text input with an inline column-scope dropdown suffix (matches
   WmsReportFiltersDrawer's Keywords field). */
.sif-keyword {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-sizes-0\.5, 2px) var(--mp-sizes-0\.5, 2px) var(--mp-sizes-0\.5, 2px) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-md, 6px);
}
.sif-keyword:focus-within {
  border-color: var(--mp-border-brand, #4b61dc);
}
.sif-keyword-input {
  flex: 1 0 0; min-width: 0; height: 20px;
  border: none; outline: none; background: transparent; padding: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.sif-keyword-input::placeholder { color: var(--mp-text-placeholder); }
.sif-keyword-scope {
  flex-shrink: 0; display: inline-flex !important; align-items: center; gap: var(--mp-spacing-1);
  min-width: var(--mp-sizes-8, 32px) !important; padding: var(--mp-spacing-2) !important;
  border: none !important; cursor: pointer;
  background: var(--mp-background-neutral-subtle, #f0f1f3) !important;
  border-radius: 0 var(--mp-radii-sm, 4px) var(--mp-radii-sm, 4px) 0;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default);
}
.sif-keyword-scope:hover { background: var(--mp-background-neutral-hovered, #e6e8eb); }
.sif-keyword-scope-label { white-space: nowrap; }

.sif-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.sif-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.sif-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.sif-check-item { display: flex; align-items: center; gap: 0; cursor: pointer; user-select: none; }
.sif-check-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

.sif-filters-footer {
  flex-shrink: 0; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
</style>
