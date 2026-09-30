<script lang="ts">
// `<script setup>` can't contain plain function/interface exports (only
// type-only re-exports are) — this companion block holds the runtime export
// (a fresh, all-empty filters value) and the shared type, both used by
// SalesOrdersPage.vue and by <script setup> below (same module scope).
import type { AmountComparator } from '~/components/patterns/AmountComparatorField.vue'
import type { TagsComparator } from '~/components/patterns/TagsComparatorField.vue'

export interface SalesOrderFiltersValue {
  /** free-text keyword; empty = no keyword filter */
  keyword: string
  /** column key to scope the keyword to, or 'all' for every column */
  keywordColumn: string
  /** AdvancedDateRangePicker range — null = not applied. */
  transactionDate: Date[] | null
  dueDate: Date[] | null
  status: string[]
  totalComparator: AmountComparator
  totalValue: string
  totalMin: string
  totalMax: string
  tagsComparator: TagsComparator
  tags: string[]
}

export function emptySalesOrderFilters(): SalesOrderFiltersValue {
  return {
    keyword: '',
    keywordColumn: 'all',
    transactionDate: null,
    dueDate: null,
    status: [],
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
 * Sales Orders — "All filters" drawer. Same structural pattern as
 * BillsFiltersDrawer.vue (custom Teleport overlay — MpDrawer has no
 * structural CSS in this Pixel3 build). Edits a local draft; only commits to
 * the parent's filter state on Apply. It is a form, so an outside (overlay)
 * click is intentionally IGNORED — closing only ever happens via the header ×,
 * Cancel, or Apply, so in-progress input is never lost by a stray click. The
 * draft is re-synced from modelValue on every open, so a discarded (×) edit is
 * still forgotten next time.
 *
 * Transaction date / Due date use AdvancedDateRangePicker (Due date in
 * `direction="future"` mode — Next 7/14/30 days presets).
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
  modelValue: SalesOrderFiltersValue
  columns: { key: string; label: string }[]
  statusOptions: { value: string; label: string }[]
  tagOptions: string[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: SalesOrderFiltersValue): void
}>()

const draft = reactive<SalesOrderFiltersValue>({ ...props.modelValue })
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, props.modelValue) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', { ...draft }); close() }
function clearAll() { Object.assign(draft, emptySalesOrderFilters()) }

function toggleStatus(value: string) {
  draft.status = draft.status.includes(value) ? draft.status.filter((v) => v !== value) : [...draft.status, value]
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
  <ErpDrawer :is-open="isOpen" title="All filters" @close="close">
    <template #body>
      <!-- Keywords — text input with an inline column-scope dropdown suffix. -->
      <MpFormControl :id="`${id}-keyword-fc`">
        <MpFormLabel>Keywords</MpFormLabel>
        <div class="sof-keyword">
          <input
            v-model="draft.keyword"
            class="sof-keyword-input"
            type="text"
            placeholder="Search keywords..."
            @keydown.enter.prevent="apply"
          >
          <MpPopover :id="`${id}-keyword-scope`" is-manual :is-open="keywordColumnOpen" use-portal :is-keep-alive="false" @open="keywordColumnOpen = true" @close="keywordColumnOpen = false">
            <MpPopoverTrigger>
              <MpButton class="sof-keyword-scope" @click.stop="keywordColumnOpen = !keywordColumnOpen">
                <span class="sof-keyword-scope-label">{{ keywordColumnLabel }}</span>
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

      <!-- Transaction date — past-preset range (Today / Last 7 / Last 30 days). -->
      <div class="sof-field">
        <span class="sof-field-label">Transaction date</span>
        <AdvancedDateRangePicker
          :id="`${id}-transactiondate`" :model-value="draft.transactionDate"
          is-full-width hide-label placeholder="Select transaction date"
          @update:model-value="draft.transactionDate = $event"
        />
      </div>

      <!-- Due date — forward-looking range (Next 7 / 14 / 30 days). -->
      <div class="sof-field">
        <span class="sof-field-label">Due date</span>
        <AdvancedDateRangePicker
          :id="`${id}-duedate`" :model-value="draft.dueDate" direction="future"
          is-full-width hide-label placeholder="Select due date"
          @update:model-value="draft.dueDate = $event"
        />
      </div>

      <div class="sof-field">
        <span class="sof-field-label">Status</span>
        <ul class="sof-checklist">
          <li
            v-for="opt in statusOptions" :key="opt.value"
            class="sof-check-item" @click="toggleStatus(opt.value)"
          >
            <span @click.stop>
              <MpCheckbox :id="`${id}-status-${opt.value}`" :is-checked="draft.status.includes(opt.value)" @change="() => toggleStatus(opt.value)" />
            </span>
            <span class="sof-check-label">{{ opt.label }}</span>
          </li>
        </ul>
      </div>

      <div class="sof-field">
        <span class="sof-field-label">Total (Rp)</span>
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
      <div class="sof-field">
        <span class="sof-field-label">Tags</span>
        <div class="sof-tags">
          <MpPopover
            :id="`${id}-tags-comparator`" is-manual :is-open="tagsComparatorOpen"
            use-portal :is-keep-alive="false" placement="bottom-start"
            @open="tagsComparatorOpen = true" @close="tagsComparatorOpen = false"
          >
            <MpPopoverTrigger>
              <MpButton class="sof-tags-prefix" @click.stop="tagsComparatorOpen = !tagsComparatorOpen">
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
          <div class="sof-tags-field">
            <span v-for="(tag, i) in draft.tags" :key="`${i}-${tag}`" class="sof-tag-chip">
              {{ tag }}
              <MpButton type="button" variant="ghost" class="sof-tag-remove" :aria-label="`Remove ${tag}`" @click="removeTag(i)">
                <MpIcon name="close" size="sm" />
              </MpButton>
            </span>
            <input
              :id="`${id}-tags-input`"
              v-model="tagDraft"
              class="sof-tag-input"
              type="text"
              placeholder=""
              @keydown.enter.prevent="addTag"
              @keydown.delete="onTagBackspace"
            >
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="clearAll">Reset filter</MpButton>
      <div class="sof-footer-right">
        <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="close">Cancel</MpButton>
        <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="apply">Apply</MpButton>
      </div>
    </template>
  </ErpDrawer>
</template>

<style scoped>
/* Keywords — text input with an inline column-scope dropdown suffix. */
.sof-keyword {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-sizes-0\.5, 2px) var(--mp-sizes-0\.5, 2px) var(--mp-sizes-0\.5, 2px) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-md, 6px);
}
.sof-keyword:focus-within {
  border-color: var(--mp-border-brand, #4b61dc);
}
.sof-keyword-input {
  flex: 1 0 0; min-width: 0; height: 20px;
  border: none; outline: none; background: transparent; padding: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.sof-keyword-input::placeholder { color: var(--mp-text-placeholder); }
.sof-keyword-scope {
  flex-shrink: 0; display: inline-flex !important; align-items: center; gap: var(--mp-spacing-1);
  min-width: var(--mp-sizes-8, 32px) !important; padding: var(--mp-spacing-2) !important;
  border: none !important; cursor: pointer;
  background: var(--mp-background-neutral-subtle, #f0f1f3) !important;
  border-radius: 0 var(--mp-radii-sm, 4px) var(--mp-radii-sm, 4px) 0;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default);
}
.sof-keyword-scope:hover { background: var(--mp-background-neutral-hovered, #e6e8eb) !important; }
.sof-keyword-scope-label { white-space: nowrap; }

.sof-field { display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.sof-field-label { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }

.sof-checklist { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.sof-check-item { display: flex; align-items: center; gap: 0; cursor: pointer; user-select: none; }
.sof-check-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }

/* Tags — one merged bordered box (identical shape to AmountComparatorField /
   Total (Rp)): a rounded-left prefix chip flush against a bare tag input.
   Type + Enter → chip; no dropdown/suggestions. */
.sof-tags {
  display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); width: 100%;
  padding: var(--mp-spacing-0\.5, 2px) var(--mp-spacing-3, 12px) var(--mp-spacing-0\.5, 2px) var(--mp-spacing-0\.5, 2px);
  background: var(--mp-background-neutral, white);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-md, 6px);
}
.sof-tags-prefix {
  flex-shrink: 0; display: inline-flex !important; align-items: center; gap: var(--mp-spacing-1);
  min-width: 0 !important; padding: var(--mp-spacing-2, 6px) !important;
  background: var(--mp-background-neutral-subtle, #f0f1f3) !important;
  border: none !important; border-radius: var(--mp-radii-sm, 4px) 0 0 var(--mp-radii-sm, 4px) !important;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default); cursor: pointer; white-space: nowrap;
}
.sof-tags-prefix:hover { background: var(--mp-background-neutral-hovered) !important; }

.sof-tags-field { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--mp-spacing-1); }
.sof-tag-chip {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1);
  padding: 0 var(--mp-spacing-1) 0 var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle, #f0f1f3); border-radius: var(--mp-radii-sm, 4px);
  font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); white-space: nowrap;
}
.sof-tag-remove {
  display: inline-flex; align-items: center; justify-content: center;
  border: none; background: transparent; padding: 0; cursor: pointer; color: var(--mp-text-subtle);
}
.sof-tag-remove:hover { color: var(--mp-text-default); }
.sof-tag-input { flex: 1; min-width: var(--mp-sizes-20, 80px); height: var(--mp-sizes-5, 20px); border: none; outline: none; background: transparent; padding: 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.sof-tag-input::placeholder { color: var(--mp-text-placeholder); }

.sof-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
