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
      <button
        type="button" class="pcf-btn" :class="{ 'is-on': active }"
        :aria-label="t(active ? `Filter ${label}: ${modelValue.length} selected` : `Filter ${label}`)"
        :aria-pressed="active" :data-testid="`${id}-btn`" @click.stop="open = !open"
      >
        <MpIcon name="filter" size="sm" />
        <span v-if="active" class="pcf-count">{{ modelValue.length }}</span>
      </button>
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
        <MpButton variant="ghost" size="sm" is-rounded @click="clear">{{ t('Clear') }}</MpButton>
      </div>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.pcf-btn {
  display: inline-flex; align-items: center; gap: 2px; margin-left: var(--mp-spacing-1); padding: 2px 4px;
  border: 0; border-radius: var(--mp-radii-sm, 4px); background: transparent; color: var(--mp-text-secondary);
  cursor: pointer; vertical-align: middle; font: inherit;
}
.pcf-btn:hover { background: var(--mp-background-neutral-hovered, rgba(0, 0, 0, 0.06)); color: var(--mp-text-default); }
.pcf-btn.is-on { color: var(--mp-text-selected); }
.pcf-count { font-size: var(--mp-font-sizes-xs, 11px); font-weight: var(--mp-font-weights-semi-bold); line-height: 1; }
.pcf-list { list-style: none; margin: 0; padding: 0; }
.pcf-item { display: flex; align-items: center; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-md); cursor: pointer; }
.pcf-item:hover { background: var(--mp-background-neutral-hovered, rgba(0, 0, 0, 0.04)); }
.pcf-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-transform: none; letter-spacing: 0; font-weight: var(--mp-font-weights-regular, 400); }
.pcf-foot { display: flex; justify-content: flex-end; padding: var(--mp-spacing-1) var(--mp-spacing-2) 0; border-top: 1px solid var(--mp-border-default); margin-top: var(--mp-spacing-1); }
</style>
