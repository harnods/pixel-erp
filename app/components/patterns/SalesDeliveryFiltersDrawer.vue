<script lang="ts">
// `<script setup>` can't contain plain function/interface exports (only
// type-only re-exports are) — this companion block holds the runtime export
// (a fresh, all-empty filters value) and the shared type, both used by
// SalesDeliveriesPage.vue and by <script setup> below (same module scope).
import type { AmountComparator } from '~/components/patterns/AmountComparatorField.vue'
import type { TagsComparator } from '~/components/patterns/TagsComparatorField.vue'

export interface SalesDeliveryFiltersValue {
  /** free-text keyword; empty = no keyword filter */
  keyword: string
  /** column key to scope the keyword to, or 'all' for every column */
  keywordColumn: string
  /** AdvancedDateRangePicker range — null = not applied. */
  deliveryDate: Date[] | null
  fulfillmentStatus: string[]
  billingStatus: string[]
  totalComparator: AmountComparator
  totalValue: string
  totalMin: string
  totalMax: string
  tagsComparator: TagsComparator
  tags: string[]
}

export function emptySalesDeliveryFilters(): SalesDeliveryFiltersValue {
  return {
    keyword: '',
    keywordColumn: 'all',
    deliveryDate: null,
    fulfillmentStatus: [],
    billingStatus: [],
    totalComparator: 'gt',
    totalValue: '',
    totalMin: '',
    totalMax: '',
    tagsComparator: 'isAnyOf',
    tags: [],
  }
}
</script>

<script setup lang="ts">
/**
 * Sales Deliveries — "All filters" drawer. Same structural pattern as
 * BillsFiltersDrawer.vue (custom Teleport overlay — MpDrawer has no
 * structural CSS in this Pixel3 build). Edits a local draft; only commits to
 * the parent's filter state on Apply. It is a form, so an outside (overlay)
 * click is intentionally IGNORED — closing only ever happens via the header ×,
 * Cancel, or Apply, so in-progress input is never lost by a stray click. The
 * draft is re-synced from modelValue on every open, so a discarded (×) edit is
 * still forgotten next time.
 *
 * Delivery date uses AdvancedDateRangePicker (past-preset range). Two separate
 * status checklists mirror the toolbar's Fulfillment + Billing status selects.
 */
import { MpIcon, MpButton, MpCheckbox, MpFormControl, MpFormLabel, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import AdvancedDateRangePicker from '~/components/patterns/AdvancedDateRangePicker.vue'
import AmountComparatorField from '~/components/patterns/AmountComparatorField.vue'
import type { TagsComparator } from '~/components/patterns/TagsComparatorField.vue'

const TAGS_COMPARATORS: TagsComparator[] = ['isAnyOf', 'isAllOf', 'isNoneOf']
const TAGS_COMPARATOR_LABELS: Record<TagsComparator, string> = {
  isAnyOf: 'Is any of',
  isAllOf: 'Is all of',
  isNoneOf: 'Is none of',
}

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: SalesDeliveryFiltersValue
  columns: { key: string; label: string }[]
  fulfillmentOptions: { value: string; label: string }[]
  billingOptions: { value: string; label: string }[]
  tagOptions: string[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: SalesDeliveryFiltersValue): void
}>()

const draft = reactive<SalesDeliveryFiltersValue>({ ...props.modelValue })
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, props.modelValue) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', { ...draft }); close() }
function clearAll() { Object.assign(draft, emptySalesDeliveryFilters()) }

function toggleFulfillment(value: string) {
  draft.fulfillmentStatus = draft.fulfillmentStatus.includes(value) ? draft.fulfillmentStatus.filter((v) => v !== value) : [...draft.fulfillmentStatus, value]
}
function toggleBilling(value: string) {
  draft.billingStatus = draft.billingStatus.includes(value) ? draft.billingStatus.filter((v) => v !== value) : [...draft.billingStatus, value]
}

const keywordColumnOpen = ref(false)
const keywordColumnLabel = computed(() =>
  draft.keywordColumn === 'all' ? 'All columns' : (props.columns.find((c) => c.key === draft.keywordColumn)?.label ?? 'All columns'),
)

// ─── Tags — type a value + Enter → chip. No dropdown/suggestions. ──
const tagsComparatorOpen = ref(false)
function selectTagsComparator(c: TagsComparator) { draft.tagsComparator = c; tagsComparatorOpen.value = false }
const tagDraft = ref('')
function addTag() {
  const v = tagDraft.value.trim()
  if (v && !draft.tags.includes(v)) draft.tags = [...draft.tags, v]
  tagDraft.value = ''
}
function removeTag(i: number) { draft.tags = draft.tags.filter((_, idx) => idx !== i) }
function onTagBackspace() { if (!tagDraft.value && draft.tags.length) draft.tags = draft.tags.slice(0, -1) }
</script>

<template>
  <Transition name="sdf-filters">
    <div v-if="isOpen" class="sdf-filters-overlay">
      <div class="sdf-filters-panel" role="dialog" aria-label="All filters">
        <header class="sdf-filters-header">
          <span class="sdf-filters-title">All filters</span>
          <MpButton class="sdf-filters-close" aria-label="Close" @click="close">
            <MpIcon name="close" size="md" />
          </MpButton>
        </header>

        <div class="sdf-filters-body">
          <!-- Keywords — text input with an inline column-scope dropdown suffix. -->
          <MpFormControl :id="`${id}-keyword-fc`">
            <MpFormLabel>Keywords</MpFormLabel>
            <div class="sdf-keyword">
              <input
                v-model="draft.keyword"
                class="sdf-keyword-input"
                type="text"
                placeholder="Search keywords..."
                @keydown.enter.prevent="apply"
              >
              <MpPopover :id="`${id}-keyword-scope`" is-manual :is-open="keywordColumnOpen" use-portal :is-keep-alive="false" @open="keywordColumnOpen = true" @close="keywordColumnOpen = false">
                <MpPopoverTrigger>
                  <MpButton class="sdf-keyword-scope" @click.stop="keywordColumnOpen = !keywordColumnOpen">
                    <span class="sdf-keyword-scope-label">{{ keywordColumnLabel }}</span>
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

          <!-- Delivery date — past-preset range (Today / Last 7 / Last 30 days). -->
          <div class="sdf-field">
            <span class="sdf-field-label">Delivery date</span>
            <AdvancedDateRangePicker
              :id="`${id}-deliverydate`" :model-value="draft.deliveryDate"
              is-full-width hide-label placeholder="Select delivery date"
              @update:model-value="draft.deliveryDate = $event"
            />
          </div>

          <div class="sdf-field">
            <span class="sdf-field-label">Fulfillment status</span>
            <ul class="sdf-checklist">
              <li
                v-for="opt in fulfillmentOptions" :key="opt.value"
                class="sdf-check-item" @click="toggleFulfillment(opt.value)"
              >
                <span @click.stop>
                  <MpCheckbox :id="`${id}-fulfillment-${opt.value}`" :is-checked="draft.fulfillmentStatus.includes(opt.value)" @change="() => toggleFulfillment(opt.value)" />
                </span>
                <span class="sdf-check-label">{{ opt.label }}</span>
              </li>
            </ul>
          </div>

          <div class="sdf-field">
            <span class="sdf-field-label">Billing status</span>
            <ul class="sdf-checklist">
              <li
                v-for="opt in billingOptions" :key="opt.value"
                class="sdf-check-item" @click="toggleBilling(opt.value)"
              >
                <span @click.stop>
                  <MpCheckbox :id="`${id}-billing-${opt.value}`" :is-checked="draft.billingStatus.includes(opt.value)" @change="() => toggleBilling(opt.value)" />
                </span>
                <span class="sdf-check-label">{{ opt.label }}</span>
              </li>
            </ul>
          </div>

          <div class="sdf-field">
            <span class="sdf-field-label">Total (Rp)</span>
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

          <!-- Tags — comparator prefix select + typeable tag input (chips), same
               shape as the Total (Rp) field above. -->
          <div class="sdf-field">
            <span class="sdf-field-label">Tags</span>
            <div class="sdf-tags">
              <MpPopover
                :id="`${id}-tags-comparator`" is-manual :is-open="tagsComparatorOpen"
                use-portal :is-keep-alive="false" placement="bottom-start"
                @open="tagsComparatorOpen = true" @close="tagsComparatorOpen = false"
              >
                <MpPopoverTrigger>
                  <MpButton class="sdf-tags-prefix" @click.stop="tagsComparatorOpen = !tagsComparatorOpen">
                    <span>{{ TAGS_COMPARATOR_LABELS[draft.tagsComparator] }}</span>
                    <MpIcon name="chevrons-down" size="sm" />
                  </MpButton>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content' })" @blur="tagsComparatorOpen = false" @escape="tagsComparatorOpen = false">
                  <MpPopoverList>
                    <MpPopoverListItem
                      v-for="c in TAGS_COMPARATORS" :key="c"
                      :is-active="c === draft.tagsComparator" @click="selectTagsComparator(c)"
                    >
                      {{ TAGS_COMPARATOR_LABELS[c] }}
                    </MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>
              <div class="sdf-tags-field">
                <span v-for="(tag, i) in draft.tags" :key="`${i}-${tag}`" class="sdf-tag-chip">
                  {{ tag }}
                  <button type="button" class="sdf-tag-remove" :aria-label="`Remove ${tag}`" @click="removeTag(i)">
                    <MpIcon name="close" size="sm" />
                  </button>
                </span>
                <input
                  :id="`${id}-tags-input`"
                  v-model="tagDraft"
                  class="sdf-tag-input"
                  type="text"
                  :placeholder="draft.tags.length ? '' : 'Type a tag and press Enter'"
                  @keydown.enter.prevent="addTag"
                  @keydown.delete="onTagBackspace"
                >
              </div>
            </div>
          </div>
        </div>

        <footer class="sdf-filters-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="clearAll">Reset filter</button>
          <div class="sdf-footer-right">
            <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">Cancel</button>
            <button class="btn-enterprise btn-enterprise--primary" type="button" @click="apply">Apply</button>
          </div>
        </footer>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sdf-filters-enter-active { transition: background-color 250ms ease; }
.sdf-filters-leave-active { transition: background-color 250ms ease; }
.sdf-filters-enter-from, .sdf-filters-leave-to { background-color: transparent; }
.sdf-filters-enter-active .sdf-filters-panel { transition: transform 350ms ease-out; }
.sdf-filters-leave-active .sdf-filters-panel { transition: transform 250ms ease-in; }
.sdf-filters-enter-from .sdf-filters-panel,
.sdf-filters-leave-to .sdf-filters-panel { transform: translateX(calc(100% + 12px)); }

.sdf-filters-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.sdf-filters-panel {
  margin: var(--mp-spacing-3);
  width: min(420px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 12px;
  overflow: hidden;
}
.sdf-filters-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.sdf-filters-title {
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.sdf-filters-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-icon-default);
}
.sdf-filters-close:hover { background: var(--mp-background-neutral-hovered); }

.sdf-filters-body {
  flex: 1; overflow-y: auto;
  /* 20px row gap between fields — the standard form field spacing (Form.md). */
  display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px);
  padding: var(--mp-spacing-4);
}

/* Keywords — text input with an inline column-scope dropdown suffix. */
.sdf-keyword {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-sizes-0\.5, 2px) var(--mp-sizes-0\.5, 2px) var(--mp-sizes-0\.5, 2px) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-md, 6px);
}
.sdf-keyword:focus-within {
  border-color: var(--mp-border-brand, #4b61dc);
}
.sdf-keyword-input {
  flex: 1 0 0; min-width: 0; height: 20px;
  border: none; outline: none; background: transparent; padding: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.sdf-keyword-input::placeholder { color: var(--mp-text-placeholder); }
.sdf-keyword-scope {
  flex-shrink: 0; display: inline-flex !important; align-items: center; gap: var(--mp-spacing-1);
  min-width: var(--mp-sizes-8, 32px) !important; padding: var(--mp-spacing-2) !important;
  border: none !important; cursor: pointer;
  background: var(--mp-background-neutral-subtle, #f0f1f3) !important;
  border-radius: 0 var(--mp-radii-sm, 4px) var(--mp-radii-sm, 4px) 0;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default);
}
.sdf-keyword-scope:hover { background: var(--mp-background-neutral-hovered, #e6e8eb) !important; }
.sdf-keyword-scope-label { white-space: nowrap; }

.sdf-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.sdf-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.sdf-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.sdf-check-item { display: flex; align-items: center; gap: 0; cursor: pointer; user-select: none; }
.sdf-check-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* Tags — one merged bordered box (identical shape to AmountComparatorField /
   Total (Rp)): a rounded-left prefix chip flush against a bare tag input.
   Type + Enter → chip; no dropdown/suggestions. */
.sdf-tags {
  display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); width: 100%;
  padding: var(--mp-spacing-0\.5, 2px) var(--mp-spacing-3, 12px) var(--mp-spacing-0\.5, 2px) var(--mp-spacing-0\.5, 2px);
  background: var(--mp-background-neutral, white);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-md, 6px);
}
.sdf-tags-prefix {
  flex-shrink: 0; display: inline-flex !important; align-items: center; gap: var(--mp-spacing-1);
  min-width: 0 !important; padding: var(--mp-spacing-2, 6px) !important;
  background: var(--mp-background-neutral-subtle, #f0f1f3) !important;
  border: none !important; border-radius: var(--mp-radii-sm, 4px) 0 0 var(--mp-radii-sm, 4px) !important;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); cursor: pointer; white-space: nowrap;
}
.sdf-tags-prefix:hover { background: var(--mp-background-neutral-hovered) !important; }

.sdf-tags-field { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--mp-spacing-1); }
.sdf-tag-chip {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1);
  padding: 0 var(--mp-spacing-1) 0 var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f0f1f3); border-radius: var(--mp-radii-sm, 4px);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); white-space: nowrap;
}
.sdf-tag-remove {
  display: inline-flex; align-items: center; justify-content: center;
  border: none; background: transparent; padding: 0; cursor: pointer; color: var(--mp-text-subtle);
}
.sdf-tag-remove:hover { color: var(--mp-text-default); }
.sdf-tag-input { flex: 1; min-width: var(--mp-sizes-20, 80px); height: var(--mp-sizes-5, 20px); border: none; outline: none; background: transparent; padding: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.sdf-tag-input::placeholder { color: var(--mp-text-placeholder); }

.sdf-filters-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
.sdf-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
