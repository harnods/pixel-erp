<script setup lang="ts">
/**
 * Flat multi-select dropdown — "Select ..." field trigger (border + chevron,
 * matching TransactionTypeCascadeMenu/MpAutocomplete's field style) that opens
 * a popover of checkboxes (no cascade/grouping, unlike TransactionTypeCascadeMenu).
 * Used for the Inbox "All filters" drawer's Requested by / Warehouse fields.
 *
 * Self-contained trigger + popover (own button, is-manual control) — see the
 * ERP Approval-icon memory for why MpTooltip/slot-forwarded triggers break
 * MpPopoverTrigger's cloneVNode injection.
 */
import { MpIcon, MpCheckbox, MpPopover, MpPopoverTrigger, MpPopoverContent, css } from '@mekari/pixel3'

const props = defineProps<{
  id: string
  modelValue: string[]
  options: string[]
  placeholder?: string
  isFullWidth?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const open = ref(false)

const selectedLabel = computed(() => {
  if (props.modelValue.length === 0) return ''
  if (props.modelValue.length === 1) return props.modelValue[0]
  return `${props.modelValue.length} selected`
})

function toggle(opt: string) {
  const next = props.modelValue.includes(opt)
    ? props.modelValue.filter((v) => v !== opt)
    : [...props.modelValue, opt]
  emit('update:modelValue', next)
}

function clear(e: MouseEvent) {
  e.stopPropagation()
  emit('update:modelValue', [])
}
</script>

<template>
  <MpPopover
    :id="id"
    is-manual
    :is-open="open"
    use-portal
    :is-keep-alive="false"
    placement="bottom-start"
    @open="open = true"
    @close="open = false"
  >
    <MpPopoverTrigger>
      <button class="msd-field" :class="{ 'msd-field--full': isFullWidth }" type="button" @click.stop="open = !open">
        <span class="msd-field__value" :class="{ 'msd-field__value--placeholder': !selectedLabel }">
          {{ selectedLabel || placeholder || 'Select' }}
        </span>
        <span class="msd-field__icons">
          <MpIcon v-if="modelValue.length" name="reset" size="sm" class="msd-clear" @click.stop="clear" />
          <MpIcon name="chevrons-down" size="sm" />
        </span>
      </button>
    </MpPopoverTrigger>

    <MpPopoverContent :class="css({ padding: '4px', minWidth: '240px', maxHeight: '260px', overflowY: 'auto', borderRadius: '12px' })" @blur="open = false" @escape="open = false">
      <ul class="msd-list">
        <li v-for="opt in options" :key="opt" class="msd-item" @click="toggle(opt)">
          <span @click.stop>
            <MpCheckbox :id="`${id}-${opt}`" :is-checked="modelValue.includes(opt)" @change="() => toggle(opt)" />
          </span>
          <span class="msd-item-label">{{ opt }}</span>
        </li>
      </ul>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.msd-field {
  display: inline-flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
  width: 200px;
  height: var(--mp-sizes-9, 36px);
  padding: 0 var(--mp-spacing-3);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-default);
  border-radius: var(--mp-radii-md);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  cursor: pointer;
}
.msd-field:hover { background: var(--mp-background-neutral-hovered); }
.msd-field--full { width: 100%; }

.msd-field__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.msd-field__value--placeholder { color: var(--mp-text-placeholder); }

.msd-field__icons {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  flex-shrink: 0;
  color: var(--mp-text-subtle);
}
.msd-clear:hover { color: var(--mp-text-default); }

.msd-list { list-style: none; margin: 0; padding: 0; }
.msd-item {
  display: flex;
  align-items: center;
  gap: 0;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-radius: var(--mp-radii-sm);
  cursor: pointer;
  user-select: none;
}
.msd-item:hover { background: var(--mp-background-neutral-hovered); }
.msd-item-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
</style>
