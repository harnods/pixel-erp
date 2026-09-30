<script setup lang="ts">
/**
 * ErpKeywordField — reusable "Keywords" filter field.
 *
 * A text input with an inline column-scope dropdown suffix: search a keyword
 * scoped to one table column or all columns. Mirrors the "Keywords" block in
 * SalesInvoiceFiltersDrawer.vue (markup + `.efk-*` scoped CSS).
 *
 * NOTE: The scope trigger is a plain MpButton wrapped by MpPopoverTrigger, and
 * is intentionally NOT wrapped in MpFormControl (which breaks the
 * MpPopoverTrigger's cloneVNode injection).
 */
import { computed, ref } from 'vue'
import { MpIcon, MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'

interface KeywordColumn {
  key: string
  label: string
}

const props = defineProps<{
  id: string
  modelValue: string
  column: string
  columns: KeywordColumn[]
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', v: string): void
  (e: 'update:column', v: string): void
  (e: 'enter'): void
}>()

const columnOpen = ref(false)

const columnLabel = computed(() => {
  if (props.column === 'all') return 'All columns'
  return props.columns.find(c => c.key === props.column)?.label ?? 'All columns'
})
</script>

<template>
  <!-- Keywords — text input with an inline column-scope dropdown suffix. -->
  <div class="efk-keyword">
    <input
      :value="modelValue"
      class="efk-keyword-input"
      type="text"
      placeholder="Search keywords..."
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      @keydown.enter.prevent="emit('enter')"
    >
    <MpPopover :id="`${id}-keyword-scope`" is-manual :is-open="columnOpen" use-portal :is-keep-alive="false" @open="columnOpen = true" @close="columnOpen = false">
      <MpPopoverTrigger>
        <MpButton class="efk-keyword-scope" @click.stop="columnOpen = !columnOpen">
          <span class="efk-keyword-scope-label">{{ columnLabel }}</span>
          <MpIcon name="chevrons-down" size="sm" />
        </MpButton>
      </MpPopoverTrigger>
      <MpPopoverContent :class="css({ minWidth: '200px', width: 'max-content' })" @blur="columnOpen = false" @escape="columnOpen = false">
        <MpPopoverList>
          <MpPopoverListItem :is-active="column === 'all'" @click="emit('update:column', 'all')">
            All columns
          </MpPopoverListItem>
          <MpPopoverListItem
            v-for="col in columns" :key="col.key"
            :is-active="column === col.key" @click="emit('update:column', col.key)"
          >
            {{ col.label }}
          </MpPopoverListItem>
        </MpPopoverList>
      </MpPopoverContent>
    </MpPopover>
  </div>
</template>

<style scoped>
/* Keywords — text input with an inline column-scope dropdown suffix. */
.efk-keyword {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  padding: var(--mp-sizes-0\.5, 2px) var(--mp-sizes-0\.5, 2px) var(--mp-sizes-0\.5, 2px) var(--mp-spacing-3);
  background: var(--mp-background-neutral, #fff);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-md, 6px);
}
.efk-keyword:focus-within {
  border-color: var(--mp-colors-border-bold);
}
.efk-keyword-input {
  flex: 1 0 0; min-width: 0; height: 20px;
  border: none; outline: none; background: transparent; padding: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.efk-keyword-input::placeholder { color: var(--mp-text-placeholder); }
.efk-keyword-scope {
  flex-shrink: 0; display: inline-flex !important; align-items: center; gap: var(--mp-spacing-1);
  min-width: var(--mp-sizes-8, 32px) !important; padding: var(--mp-spacing-2) !important;
  border: none !important; cursor: pointer;
  background: var(--mp-background-neutral-subtle, #f0f1f3) !important;
  border-radius: 0 var(--mp-radii-sm, 4px) var(--mp-radii-sm, 4px) 0;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default);
}
.efk-keyword-scope:hover { background: var(--mp-background-neutral-hovered, #e6e8eb) !important; }
.efk-keyword-scope-label { white-space: nowrap; }
</style>
