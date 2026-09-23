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

type Opt = { value: string; label: string }

const props = withDefaults(defineProps<{
  id: string
  modelValue: string
  placeholder: string
  options: (string | Opt)[]
  width?: string
  /** filter selects show an (×) to reset; set false for required form selects */
  isClearable?: boolean
  /**
   * `cell` drops the field border/height so the control can fill a table cell
   * edge-to-edge (the cell itself draws the boundary). Same searchable
   * behaviour — only the chrome changes. Used by the WMS cutover product table.
   */
  variant?: 'field' | 'cell'
  /** Greys out and blocks input — for a cell whose group checkbox is off. */
  isDisabled?: boolean
  /** No-match copy. UXW blank-slate pattern: "No matching {object} found". */
  emptyText?: string
}>(), { width: '176px', isClearable: true, variant: 'field', isDisabled: false, emptyText: 'No results found' })

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

function focusOpen() { if (props.isDisabled) return; if (!open.value) { open.value = true; query.value = ''; nextTick(() => inputEl.value?.focus()) } }
function onInput(e: Event) { query.value = (e.target as HTMLInputElement).value; if (!open.value) open.value = true }
function onBlur() { window.setTimeout(() => { open.value = false; query.value = '' }, 120) }
function close() { open.value = false; query.value = '' }
function pick(v: string) { emit('update:modelValue', v); open.value = false; query.value = ''; inputEl.value?.blur() }
function enter() { if (filtered.value.length) pick(filtered.value[0]!.value) }

const contentClass = css({ minWidth: '176px', maxHeight: '320px', overflowY: 'auto' })
</script>

<template>
  <div class="efs" :class="[`efs--${variant}`, { 'efs--filled': !!modelValue && isClearable && !open, 'efs--disabled': isDisabled }]" :style="{ '--efs-w': width }">
    <MpPopover :id="id" is-manual :is-open="open" placement="bottom-start" use-portal is-adaptive-width :is-keep-alive="false" @close="close">
      <MpPopoverTrigger>
        <div class="efs-trigger" @click="focusOpen">
          <input
            ref="inputEl"
            class="efs-input"
            type="text"
            :value="open ? query : selectedLabel"
            :placeholder="modelValue ? selectedLabel : placeholder"
            :disabled="isDisabled"
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
          >{{ o.label }}</MpPopoverListItem>
          <div v-if="!filtered.length" class="efs-empty">{{ emptyText }}</div>
        </MpPopoverList>
      </MpPopoverContent>
    </MpPopover>

    <button v-if="modelValue && isClearable && !open" type="button" class="efs-clear" aria-label="Clear" @click.stop="pick('')">
      <MpIcon name="close" size="sm" />
    </button>
  </div>
</template>

<style scoped>
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

/* ── `cell` variant — fills a table cell edge-to-edge ──────────────────────
   The cell draws the boundary, so the control drops its own border and radius
   and inherits the row height. Same searchable combobox behaviour otherwise. */
.efs--cell { display: flex; width: 100%; }
.efs--cell .efs-trigger {
  width: 100%;
  height: var(--mp-sizes-10, 40px);
  padding: 0 var(--mp-spacing-3);
  border: none;
  border-radius: 0;
  background: transparent;
}
.efs--cell .efs-trigger:focus-within {
  border-color: transparent;
  box-shadow: inset 0 0 0 1px var(--mp-colors-border-bold, #8c9596);
}
.efs--cell .efs-clear { right: var(--mp-spacing-6); }

.efs--disabled .efs-trigger { cursor: not-allowed; }
.efs--disabled .efs-input { cursor: not-allowed; color: var(--mp-text-disabled, #9aa4a6); }
.efs--disabled .efs-chevron { opacity: 0.4; }
</style>
