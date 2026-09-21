<script setup lang="ts">
/**
 * ErpFilterSelect — the sanctioned single-select dropdown for the ERP, rendered as
 * a searchable combobox: the trigger IS the input, so clicking it lets you type
 * immediately to filter the options. Its menu is a Pixel `MpPopover` (never the
 * native OS dropdown, which clips inside scroll containers), and it's clearable
 * (× on hover). Use for any filter-bar select or in-form select; never a raw
 * <select> or MpSelect. See docs/patterns/pixel-enterprise-overrides.md › Dropdowns.
 */
import { computed, ref, nextTick } from 'vue'
import {
  MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'

/** A menu option. `description` is optional — when present the menu renders it
 *  under the label (settings selects whose choices need explaining, e.g.
 *  Production settings › Reservation method). The trigger always shows the label
 *  alone. */
type Opt = { value: string; label: string; description?: string }

const props = withDefaults(defineProps<{
  id: string
  modelValue: string
  placeholder: string
  options: (string | Opt)[]
  width?: string
  /** filter selects show an (×) to reset; set false for required form selects */
  isClearable?: boolean
}>(), { width: '176px', isClearable: true })

const emit = defineEmits<{ (e: 'update:modelValue', v: string): void }>()

const normalized = computed<Opt[]>(() =>
  props.options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o)),
)
const selectedLabel = computed(() => normalized.value.find((o) => o.value === props.modelValue)?.label ?? '')

// Combobox state: the trigger input is typeable while open.
const open = ref(false)
const query = ref('')
const inputEl = ref<HTMLInputElement | null>(null)
const filtered = computed<Opt[]>(() => {
  const q = query.value.trim().toLowerCase()
  return q ? normalized.value.filter((o) => o.label.toLowerCase().includes(q)) : normalized.value
})

function focusOpen() { if (!open.value) { open.value = true; query.value = ''; nextTick(() => inputEl.value?.focus()) } }
function onInput(e: Event) { query.value = (e.target as HTMLInputElement).value; if (!open.value) open.value = true }
function onBlur() { window.setTimeout(() => { open.value = false; query.value = '' }, 120) }
function close() { open.value = false; query.value = '' }
function pick(v: string) { emit('update:modelValue', v); open.value = false; query.value = ''; inputEl.value?.blur() }
function enter() { if (filtered.value.length) pick(filtered.value[0]!.value) }

const contentClass = css({ minWidth: '176px', maxHeight: '320px', overflowY: 'auto' })
</script>

<template>
  <div class="efs" :class="{ 'efs--filled': !!modelValue && isClearable && !open }" :style="{ '--efs-w': width }">
    <MpPopover :id="id" is-manual :is-open="open" placement="bottom-start" use-portal is-adaptive-width :is-keep-alive="false" @close="close">
      <MpPopoverTrigger>
        <div class="efs-trigger" @click="focusOpen">
          <input
            ref="inputEl"
            class="efs-input"
            type="text"
            :value="open ? query : selectedLabel"
            :placeholder="modelValue ? selectedLabel : placeholder"
            @focus="focusOpen"
            @input="onInput"
            @keydown.enter.prevent="enter"
            @keydown.esc="close"
            @blur="onBlur"
          >
          <MpIcon name="chevrons-down" size="sm" class="efs-chevron" />
        </div>
      </MpPopoverTrigger>
      <MpPopoverContent :class="contentClass">
        <MpPopoverList>
          <MpPopoverListItem
            v-for="o in filtered" :key="o.value"
            :is-active="o.value === modelValue"
            @mousedown.prevent
            @click="pick(o.value)"
          >
            <span v-if="o.description" class="efs-opt">
              <span class="efs-opt-label">{{ o.label }}</span>
              <span class="efs-opt-desc">{{ o.description }}</span>
            </span>
            <template v-else>{{ o.label }}</template>
          </MpPopoverListItem>
          <div v-if="!filtered.length" class="efs-empty">No results</div>
        </MpPopoverList>
      </MpPopoverContent>
    </MpPopover>

    <button v-if="modelValue && isClearable && !open" type="button" class="efs-clear" aria-label="Clear" @click.stop="pick('')">
      <MpIcon name="close" size="sm" />
    </button>
  </div>
</template>

<style scoped>
/* Option with an explainer line (optional `description` on the option). */
.efs-opt { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5, 2px); white-space: normal; }
.efs-opt-label { color: var(--mp-colors-text-default, #080d0e); }
.efs-opt-desc { font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm); color: var(--mp-colors-text-secondary, #3a4749); }

.efs { position: relative; display: inline-flex; }
.efs-trigger {
  /* Height + resting border MUST equal MpInput md (rule/select-field-metrics):
     38px tall (--mp-sizes-9.5), border = --mp-colors-border-form (#1d1f2429).
     The short --mp-* aliases resolve EMPTY in this Pixel build, so always use the
     fully-qualified --mp-colors-* token with a hex fallback. */
  display: inline-flex; align-items: center; gap: var(--mp-spacing-2);
  width: var(--efs-w, 176px); height: var(--mp-sizes-9\.5, 38px); padding: 0 var(--mp-spacing-3);
  background: var(--mp-colors-background-neutral, #fff);
  border: 1px solid var(--mp-colors-border-form, #1d1f2429);
  border-radius: var(--mp-radii-md); cursor: text;
}
.efs-trigger:focus-within { border-color: #8c9596; box-shadow: 0 0 0 1px #8c9596; }
.efs-input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent; padding: 0;
  font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); cursor: text;
}
.efs-input::placeholder { color: var(--mp-text-placeholder); }
.efs-chevron { flex-shrink: 0; color: var(--mp-text-default); pointer-events: none; }
.efs--filled:hover .efs-chevron { visibility: hidden; }

.efs-clear {
  position: absolute; top: 0; bottom: 0; right: var(--mp-spacing-2); margin: auto;
  display: none; align-items: center; justify-content: center; width: 20px; height: 20px;
  border: none; background: transparent; border-radius: var(--mp-radii-sm); cursor: pointer; color: var(--mp-text-secondary);
}
.efs--filled:hover .efs-clear { display: inline-flex; }
.efs-clear:hover { color: var(--mp-text-default); }

.efs-empty { padding: var(--mp-spacing-2) var(--mp-spacing-3); font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); }
</style>
