<script setup lang="ts">
/**
 * Column filter: a small filter icon beside a table header. It opens a checkbox list of the column's
 * values; none ticked = all rows. The icon turns brand-coloured with a count while a filter is on.
 * Same is-manual MpPopover pattern as MultiSelectDropdown (MpPopoverTrigger clones its one child).
 */
import { MpIcon, MpButton, MpCheckbox, MpPopover, MpPopoverTrigger, MpPopoverContent, css } from '@mekari/pixel3'

const props = defineProps<{ id: string; label: string; modelValue: string[]; options: string[] }>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()
const { t } = useLocale()
const open = ref(false)
const active = computed(() => props.modelValue.length > 0)

function toggle(opt: string) {
  emit('update:modelValue', props.modelValue.includes(opt) ? props.modelValue.filter((v) => v !== opt) : [...props.modelValue, opt])
}
function clear() { emit('update:modelValue', []) }
</script>

<template>
  <MpPopover
    :id="id" is-manual :is-open="open" use-portal :is-keep-alive="false" placement="bottom-start"
    @open="open = true" @close="open = false"
  >
    <MpPopoverTrigger>
      <MpButton
        v-tooltip="{ label: t(`Filter ${label}`), placement: 'top' }"
        variant="ghost" is-rounded class="pcf-btn" :class="{ 'is-on': active }"
        :aria-label="t(active ? `Filter ${label}: ${modelValue.length} selected` : `Filter ${label}`)"
        :aria-pressed="active" :data-testid="`${id}-btn`" @click.stop="open = !open"
      >
        <MpIcon name="filter" size="sm" />
        <span v-if="active" class="pcf-count">{{ modelValue.length }}</span>
      </MpButton>
    </MpPopoverTrigger>
    <MpPopoverContent
      :class="css({ padding: '4px', minWidth: '220px', maxHeight: '300px', overflowY: 'auto', borderRadius: '12px' })"
      @blur="open = false" @escape="open = false"
    >
      <ul class="pcf-list">
        <li v-for="opt in options" :key="opt" class="pcf-item" @click="toggle(opt)">
          <span @click.stop><MpCheckbox :id="`${id}-${opt}`" :is-checked="modelValue.includes(opt)" @change="() => toggle(opt)" /></span>
          <span class="pcf-label">{{ opt }}</span>
        </li>
      </ul>
      <div v-if="active" class="pcf-foot">
        <MpButton variant="ghost" is-rounded @click="clear">{{ t('Clear') }}</MpButton>
      </div>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
/* Icon-only ghost MpButton shrunk to sit in a 28px table header (same idea as .bfd-filters-close). */
.pcf-btn.pcf-btn {
  display: inline-flex; align-items: center; gap: var(--mp-sizes-0\.5, 2px); margin-left: var(--mp-spacing-1);
  height: var(--mp-sizes-6, 24px) !important; min-width: var(--mp-sizes-6, 24px) !important;
  padding: 0 var(--mp-spacing-1) !important; border: 0 !important; background: transparent;
  color: var(--mp-colors-text-secondary, #3a4749); vertical-align: middle;
}
.pcf-btn.pcf-btn:hover { background: var(--mp-colors-background-neutral-hovered, #f8f9f9); color: var(--mp-colors-text-default, #080d0e); }
.pcf-btn.pcf-btn.is-on { color: var(--mp-colors-text-selected, #0f6d4d); }
.pcf-count { font-size: var(--mp-font-sizes-xs, 12px); font-weight: var(--mp-font-weights-semi-bold); line-height: 1; }
.pcf-list { list-style: none; margin: 0; padding: 0; }
.pcf-item { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md); cursor: pointer; }
.pcf-item:hover { background: var(--mp-colors-background-neutral-hovered, #f8f9f9); }
.pcf-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-transform: none; letter-spacing: 0; font-weight: var(--mp-font-weights-regular, 400); }
.pcf-foot { display: flex; justify-content: flex-end; padding: var(--mp-spacing-1) var(--mp-spacing-2) 0; border-top: 1px solid var(--mp-border-default); margin-top: var(--mp-spacing-1); }
</style>
