<script setup lang="ts">
/**
 * PopoverSelect — the ERP's standard (non-searchable) dropdown. Generalised from the
 * official Pixel Hub block `general-form-popover-select` (MpPopover + custom combobox
 * trigger + MpPopoverList). A select whose menu is a popover (never the native OS
 * <select>), with a working clear (×) — which is a manual `reset` icon shown on hover
 * when there's a value (Pixel's is-clearable does NOT render in this build).
 * For type-to-filter use MpAutocomplete with is-searchable instead.
 * See rule/select-erpfilterselect.
 */
import { ref, computed } from 'vue'
import {
  css, MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem,
} from '@mekari/pixel3'
import { onClickOutside } from '@mekari/pixel3-utils'

interface Opt { value: string; label: string; iconName?: string; iconColor?: string }
const props = withDefaults(defineProps<{
  id: string
  modelValue: string | null
  options: (string | Opt)[]
  placeholder?: string
  width?: string
  isClearable?: boolean
}>(), { placeholder: 'Select', width: '16rem', isClearable: true })

const emit = defineEmits<{ 'update:modelValue': [string | null] }>()

const rootRef = ref<HTMLElement | null>(null)
const isOpen = ref(false)
const isHovered = ref(false)
const opts = computed<Opt[]>(() =>
  props.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)),
)
const selected = computed(() => opts.value.find((o) => o.value === props.modelValue) ?? null)

onClickOutside(rootRef, () => { isOpen.value = false })
function select(v: string) { emit('update:modelValue', v); isOpen.value = false }
function clear() { emit('update:modelValue', null) }
</script>

<template>
  <div ref="rootRef" :class="css({ position: 'relative' })" :style="{ width }">
    <MpPopover :id="id" is-manual is-adaptive-width use-portal :is-open="isOpen" placement="bottom-start" @close="isOpen = false">
      <MpPopoverTrigger>
        <div
          :class="css({ position: 'relative', display: 'flex', alignItems: 'center', w: 'full' })"
          @mouseenter="isHovered = true"
          @mouseleave="isHovered = false"
        >
          <div
            role="combobox" :aria-expanded="isOpen" :tabindex="0"
            class="ps-trigger"
            :class="css({
              minW: '0', w: 'full', h: '2.375rem', pl: '3', pr: '2.75rem',
              display: 'flex', alignItems: 'center', outline: '0',
              borderWidth: '1px', borderStyle: 'solid', borderRadius: 'md', appearance: 'none',
              transition: 'border-color 200ms, box-shadow 200ms', cursor: 'pointer', userSelect: 'none', fontSize: 'md',
            })"
            :style="{
              background: 'var(--mp-colors-background-neutral, #ffffff)',
              color: selected ? 'var(--mp-colors-text-default, #080d0e)' : 'var(--mp-colors-text-secondary, #5f6b6d)',
              borderColor: isOpen ? 'var(--mp-colors-border-bold, #8c9596)' : 'var(--mp-colors-border-form, #1d1f2429)',
              boxShadow: isOpen ? '0 0 0 1px var(--mp-colors-border-bold, #8c9596)' : 'none',
            }"
            @click="isOpen = !isOpen"
            @keydown.enter.prevent="isOpen = !isOpen"
            @keydown.space.prevent="isOpen = !isOpen"
            @keydown.escape="isOpen = false"
          >
            <span>{{ selected ? selected.label : placeholder }}</span>
          </div>

          <div
            v-if="isClearable && modelValue && isHovered"
            role="button" tabindex="0" aria-label="Reset"
            :class="css({ position: 'absolute', right: '2rem', top: '50%', transform: 'translateY(-50%)', display: 'flex', cursor: 'pointer' })"
            :style="{ color: 'var(--mp-colors-text-secondary, #5f6b6d)' }"
            @click.stop="clear"
          >
            <MpIcon name="close" size="sm" />
          </div>

          <MpIcon
            name="chevrons-down" size="sm"
            :class="css({ position: 'absolute', right: '3', pointerEvents: 'none', transition: 'transform 0.2s' })"
            :style="{ transform: isOpen ? 'rotate(-180deg)' : 'rotate(0deg)', color: 'var(--mp-colors-icon-default, #5f6b6d)' }"
          />
        </div>
      </MpPopoverTrigger>

      <MpPopoverContent class="erp-dropdown-menu">
        <MpPopoverList>
          <MpPopoverListItem
            v-for="o in opts" :key="o.value"
            :is-active="o.value === modelValue"
            @click="select(o.value)"
          >
            <MpIcon v-if="o.iconName" :name="o.iconName as any" size="sm" :style="o.iconColor ? { color: o.iconColor } : {}" />
            {{ o.label }}
          </MpPopoverListItem>
        </MpPopoverList>
      </MpPopoverContent>
    </MpPopover>
  </div>
</template>

<style scoped>
/* Neutral hover + focus, same as form fields / search (rule/select-active-neutral).
   !important beats the inline default border color when not open. */
.ps-trigger:hover { border-color: var(--mp-colors-border-bold, #8c9596) !important; }
.ps-trigger:focus-visible {
  border-color: var(--mp-colors-border-bold, #8c9596) !important;
  box-shadow: 0 0 0 1px var(--mp-colors-border-bold, #8c9596) !important;
  outline: none;
}
</style>
