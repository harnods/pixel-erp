<script lang="ts">
export interface CrmGenericFiltersValue {
  keyword: string
  keywordColumn: string
}
export function emptyCrmGenericFilters(): CrmGenericFiltersValue {
  return { keyword: '', keywordColumn: 'all' }
}
</script>

<script setup lang="ts">
import { reactive, watch, ref, computed } from 'vue'
import { MpButton, MpIcon, MpFormControl, MpFormLabel, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'

const props = defineProps<{
  id: string
  isOpen: boolean
  modelValue: CrmGenericFiltersValue
  columns: { key: string; label: string }[]
}>()
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'apply', v: CrmGenericFiltersValue): void
}>()

const draft = reactive<CrmGenericFiltersValue>({ ...props.modelValue })
watch(() => props.isOpen, (open) => { if (open) Object.assign(draft, props.modelValue) })

function close() { emit('update:isOpen', false) }
function apply() { emit('apply', { ...draft }); close() }
function clearAll() { Object.assign(draft, emptyCrmGenericFilters()) }

const keywordColumnOpen = ref(false)
const keywordColumnLabel = computed(() =>
  draft.keywordColumn === 'all' ? 'All columns' : (props.columns.find((c) => c.key === draft.keywordColumn)?.label ?? 'All columns'),
)
</script>

<template>
  <ErpDrawer :is-open="isOpen" title="All filters" @close="close">
    <template #body>
      <MpFormControl :id="`${id}-keyword-fc`">
        <MpFormLabel>Keywords</MpFormLabel>
        <div class="cgf-keyword">
          <input
            v-model="draft.keyword"
            class="cgf-keyword-input"
            type="text"
            placeholder="Search keywords..."
            @keydown.enter.prevent="apply"
          >
          <MpPopover :id="`${id}-keyword-scope`" is-manual :is-open="keywordColumnOpen" use-portal :is-keep-alive="false" @open="keywordColumnOpen = true" @close="keywordColumnOpen = false">
            <MpPopoverTrigger>
              <MpButton class="cgf-keyword-scope" @click.stop="keywordColumnOpen = !keywordColumnOpen">
                <span class="cgf-keyword-scope-label">{{ keywordColumnLabel }}</span>
                <MpIcon name="chevrons-down" size="sm" />
              </MpButton>
            </MpPopoverTrigger>
            <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content' })" @blur="keywordColumnOpen = false" @escape="keywordColumnOpen = false">
              <MpPopoverList>
                <MpPopoverListItem :is-active="draft.keywordColumn === 'all'" @click="draft.keywordColumn = 'all'">All columns</MpPopoverListItem>
                <MpPopoverListItem v-for="col in columns" :key="col.key" :is-active="draft.keywordColumn === col.key" @click="draft.keywordColumn = col.key">{{ col.label }}</MpPopoverListItem>
              </MpPopoverList>
            </MpPopoverContent>
          </MpPopover>
        </div>
      </MpFormControl>
    </template>

    <template #footer>
      <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="clearAll">Reset filter</MpButton>
      <div class="cgf-footer-right">
        <MpButton class="btn-enterprise btn-enterprise--ghost" variant="ghost" type="button" @click="close">Cancel</MpButton>
        <MpButton class="btn-enterprise btn-enterprise--primary" variant="primary" type="button" @click="apply">Apply</MpButton>
      </div>
    </template>
  </ErpDrawer>
</template>

<style scoped>
.cgf-keyword {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-sizes-0\.5, 2px) var(--mp-sizes-0\.5, 2px) var(--mp-sizes-0\.5, 2px) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-md, 6px);
}
.cgf-keyword:focus-within { border-color: var(--mp-border-brand, #4b61dc); }
.cgf-keyword-input {
  flex: 1 0 0; min-width: 0; height: 20px;
  border: none; outline: none; background: transparent; padding: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.cgf-keyword-input::placeholder { color: var(--mp-text-placeholder); }
.cgf-keyword-scope {
  flex-shrink: 0; display: inline-flex !important; align-items: center; gap: var(--mp-spacing-1);
  min-width: var(--mp-sizes-8, 32px) !important; padding: var(--mp-spacing-2) !important;
  border: none !important; cursor: pointer;
  background: var(--mp-background-neutral-subtle, #f0f1f3) !important;
  border-radius: 0 var(--mp-radii-sm, 4px) var(--mp-radii-sm, 4px) 0;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default);
}
.cgf-keyword-scope:hover { background: var(--mp-background-neutral-hovered, #e6e8eb) !important; }
.cgf-keyword-scope-label { white-space: nowrap; }
.cgf-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
