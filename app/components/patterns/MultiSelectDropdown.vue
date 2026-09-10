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
import { MpIcon, MpButton, MpCheckbox, MpPopover, MpPopoverTrigger, MpPopoverContent, css } from '@mekari/pixel3'

const props = defineProps<{
  id: string
  modelValue: string[]
  options: string[]
  placeholder?: string
  isFullWidth?: boolean
  /** Label for a leading "select all" row; omit to leave the list plain (default). */
  selectAllLabel?: string
  /** Trigger text when every option is selected (e.g. "All warehouse") — omit to fall
   *  back to the plain "N selected" count, same as every other consumer. */
  allSelectedLabel?: string
  /** Red border + (paired) MpFormErrorMessage below — for a required selection. */
  isInvalid?: boolean
  /** Hide the reset ("x") icon — for a field with no valid "cleared" state. */
  hideClear?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const open = ref(false)

const allSelected = computed(() => props.options.length > 0 && props.modelValue.length === props.options.length)

const selectedLabel = computed(() => {
  if (allSelected.value && props.allSelectedLabel) return props.allSelectedLabel
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

function toggleAll() {
  emit('update:modelValue', allSelected.value ? [] : [...props.options])
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
      <MpButton
        class="msd-field" :class="{ 'msd-field--full': isFullWidth, 'msd-field--invalid': isInvalid }"
        type="button" @click.stop="open = !open"
      >
        <span class="msd-field__value" :class="{ 'msd-field__value--placeholder': !selectedLabel }">
          {{ selectedLabel || placeholder || 'Select' }}
        </span>
        <span class="msd-field__icons">
          <MpIcon v-if="modelValue.length && !hideClear" name="reset" size="sm" class="msd-clear" @click.stop="clear" />
          <MpIcon name="chevrons-down" size="sm" />
        </span>
      </MpButton>
    </MpPopoverTrigger>

    <MpPopoverContent :class="css({ padding: '4px', minWidth: '240px', maxHeight: '260px', overflowY: 'auto', borderRadius: '12px' })" @blur="open = false" @escape="open = false">
      <ul class="msd-list">
        <template v-if="selectAllLabel">
          <li class="msd-item" @click="toggleAll">
            <span @click.stop>
              <MpCheckbox :id="`${id}-select-all`" :is-checked="allSelected" @change="toggleAll" />
            </span>
            <span class="msd-item-label">{{ selectAllLabel }}</span>
          </li>
          <li class="msd-divider" />
        </template>
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
/* Rendered via MpButton, not a raw HTML control — default look reset (see
   IconButton/.demo-fab precedent). */
/* width is deliberately NOT !important (unlike its neighbours) — .msd-field--full
   below needs to be able to win over it for isFullWidth consumers. */
/* Height + resting border MUST equal MpInput md (rule/select-field-metrics):
   38px tall (--mp-sizes-9.5), border = --mp-colors-border-form. Short --mp-*
   aliases are EMPTY in this Pixel build → use the full --mp-colors-* tokens. */
.msd-field { display: inline-flex !important; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); min-width: 0 !important; width: 200px; height: var(--mp-sizes-9\.5, 38px); padding: 0 var(--mp-spacing-3) !important; background: var(--mp-colors-background-neutral, #fff) !important; border: 1px solid var(--mp-colors-border-form, #1d1f2429) !important; border-radius: var(--mp-radii-md) !important; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-colors-text-default, #080d0e); cursor: pointer; }
.msd-field:hover { background: var(--mp-background-neutral-hovered, #eef0f3) !important; }
.msd-field--full { width: 100%; }
.msd-field--invalid { border-color: var(--mp-border-danger, #dc2626) !important; }

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
.msd-item:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.msd-item-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.msd-divider { height: 1px; margin: var(--mp-spacing-1) var(--mp-spacing-1); background: var(--mp-border-default, #e3e7e9); list-style: none; }
</style>
