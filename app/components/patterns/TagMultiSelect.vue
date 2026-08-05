<script setup lang="ts">
/**
 * Searchable tag multi-select — a bordered field that renders the selected
 * values as removable chips followed by a text input; typing filters an
 * MpPopover option list (checkboxes) below. Used for the WMS report "All
 * filters" drawer's SKU and Source fields (MpAutocomplete is single-select).
 *
 * Self-contained trigger (own field element, is-manual popover control) rather
 * than a slot-forwarded MpPopoverTrigger — see the MultiSelectDropdown note for
 * why MpPopoverTrigger's cloneVNode injection breaks with forwarded triggers.
 */
import { MpIcon, MpCheckbox, MpPopover, MpPopoverTrigger, MpPopoverContent, css } from '@mekari/pixel3'

const props = defineProps<{
  id: string
  modelValue: string[]
  options: string[]
  placeholder?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const open = ref(false)
const query = ref('')
const inputEl = ref<HTMLInputElement | null>(null)

const filteredOptions = computed(() => {
  const q = query.value.trim().toLowerCase()
  if (!q) return props.options
  return props.options.filter((o) => o.toLowerCase().includes(q))
})

function toggle(opt: string) {
  const next = props.modelValue.includes(opt)
    ? props.modelValue.filter((v) => v !== opt)
    : [...props.modelValue, opt]
  emit('update:modelValue', next)
}

function remove(opt: string) {
  emit('update:modelValue', props.modelValue.filter((v) => v !== opt))
}

function openList() {
  open.value = true
}
function focusInput() {
  inputEl.value?.focus()
  openList()
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
      <div class="tms-field" @click="focusInput">
        <span
          v-for="opt in modelValue"
          :key="opt"
          class="tms-chip"
        >
          <span class="tms-chip__label">{{ opt }}</span>
          <button
            type="button"
            class="tms-chip__remove"
            :aria-label="`Remove ${opt}`"
            @click.stop="remove(opt)"
          >
            <MpIcon name="close" size="sm" />
          </button>
        </span>
        <input
          ref="inputEl"
          v-model="query"
          type="text"
          class="tms-input"
          :placeholder="modelValue.length ? '' : (placeholder || 'Select')"
          @focus="openList"
          @click.stop="openList"
        >
      </div>
    </MpPopoverTrigger>

    <MpPopoverContent
      :class="css({ padding: '4px', maxHeight: '240px', overflowY: 'auto' })"
      @blur="open = false"
      @escape="open = false"
    >
      <div class="tms-list">
        <label
          v-for="opt in filteredOptions"
          :key="opt"
          class="tms-item"
        >
          <MpCheckbox
            :id="`${id}-${opt}`"
            :is-checked="modelValue.includes(opt)"
            @change="() => toggle(opt)"
            @click.stop
          >
            {{ opt }}
          </MpCheckbox>
        </label>
        <div v-if="!filteredOptions.length" class="tms-empty">No results</div>
      </div>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.tms-field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--mp-spacing-1);
  min-height: var(--mp-sizes-9, 36px);
  padding: var(--mp-spacing-2) var(--mp-spacing-3) var(--mp-spacing-2) var(--mp-spacing-2);
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-form);
  border-radius: var(--mp-radii-md);
  cursor: text;
}
.tms-field:focus-within {
  border-color: var(--mp-border-focus, var(--mp-border-form));
}

.tms-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  max-height: 20px;
  padding: 0 var(--mp-spacing-2);
  background: var(--mp-background-neutral-subtle);
  border-radius: var(--mp-radii-sm);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-regular);
  color: var(--mp-text-secondary);
  white-space: nowrap;
}
.tms-chip__label { line-height: 20px; }
.tms-chip__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  padding: 0;
  cursor: pointer;
  color: var(--mp-icon-subtle, var(--mp-text-secondary));
}
.tms-chip__remove:hover { color: var(--mp-text-default); }

.tms-input {
  flex: 1;
  min-width: 60px;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  line-height: 20px;
}
.tms-input::placeholder { color: var(--mp-text-placeholder); }

.tms-list { display: flex; flex-direction: column; padding: var(--mp-spacing-1); }
.tms-item {
  display: flex;
  align-items: center;
  padding: var(--mp-spacing-2) var(--mp-spacing-2);
  border-radius: var(--mp-radii-sm);
  cursor: pointer;
}
.tms-item:hover { background: var(--mp-background-neutral-hovered); }
.tms-empty {
  padding: var(--mp-spacing-2) var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
</style>
