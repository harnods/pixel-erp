<script setup lang="ts">
/**
 * Two-level "Transaction type" filter (Figma: Inbox node 4204-7370) — click a
 * parent category to open its child flyout; a group with a single child
 * (Expenses) has no children column and is a plain checkbox leaf. The
 * child column is always top-aligned to the parent row that opened it (so
 * e.g. Purchases' flyout sits lower than Sales', matching the design), which
 * falls out for free from `position: absolute; top: <row.offsetTop>px` on a
 * `position: relative` parent column — no manual pixel math needed.
 *
 * `multiple` (default false, single-select): clicking a leaf selects it and
 * closes the popover, same as clicking a leaf in a plain submenu — no
 * checkboxes shown. Only the "All transactions" Inbox submenu opts into
 * `multiple`.
 *
 * `multiple = true`: each leaf has its own checkbox and toggles without
 * closing the popover. A parent row also carries its own checkbox — checked
 * when every child in that group is selected, indeterminate when some are,
 * empty when none are — clicking THAT checkbox bulk-toggles the whole group.
 * Clicking elsewhere on the parent row only opens/switches its flyout, it
 * does not change selection.
 *
 * Self-contained trigger + popover (own button, is-manual control) — see the
 * AdvancedDateRangePicker / ERP Approval-icon memory for why MpTooltip/
 * slot-forwarded triggers break MpPopoverTrigger's cloneVNode injection.
 */
import { MpIcon, MpCheckbox, MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, css } from '@mekari/pixel3'

export interface CascadeGroup {
  label: string
  children: { label: string; value: string }[]
}

const props = defineProps<{
  id: string
  modelValue: string[]
  groups: CascadeGroup[]
  placeholder?: string
  multiple?: boolean
  isFullWidth?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [string[]] }>()

const open = ref(false)
const activeGroupLabel = ref<string | null>(null)
const childTop = ref(0)
const parentRowEls = new Map<string, HTMLElement>()

function setParentRef(el: unknown, label: string) {
  if (el) parentRowEls.set(label, el as HTMLElement)
}

const activeChildren = computed(() => {
  const g = props.groups.find((g) => g.label === activeGroupLabel.value)
  return g && g.children.length > 1 ? g.children : null
})

function groupSelectionState(g: CascadeGroup): 'all' | 'some' | 'none' {
  const selectedCount = g.children.filter((c) => props.modelValue.includes(c.value)).length
  if (selectedCount === 0) return 'none'
  if (selectedCount === g.children.length) return 'all'
  return 'some'
}

const selectedLabel = computed(() => {
  if (props.modelValue.length === 0) return ''
  if (props.modelValue.length > 1) return `${props.modelValue.length} selected`
  const value = props.modelValue[0]
  for (const g of props.groups) {
    if (g.children.length === 1 && g.children[0]!.value === value) return g.label
    const c = g.children.find((c) => c.value === value)
    if (c) return c.label
  }
  return ''
})

function toggle() {
  open.value = !open.value
  if (!open.value) activeGroupLabel.value = null
}
function close() {
  open.value = false
  activeGroupLabel.value = null
}

function onGroupRowClick(g: CascadeGroup) {
  if (g.children.length <= 1) {
    if (!props.multiple) selectSingle(g.children[0]?.value ?? '')
    return
  }
  activeGroupLabel.value = g.label
  nextTick(() => {
    const el = parentRowEls.get(g.label)
    if (el) childTop.value = el.offsetTop
  })
}

function selectSingle(value: string) {
  emit('update:modelValue', [value])
  close()
}

function onLeafClick(value: string) {
  if (props.multiple) toggleLeaf(value)
  else selectSingle(value)
}

function toggleLeaf(value: string) {
  const next = props.modelValue.includes(value)
    ? props.modelValue.filter((v) => v !== value)
    : [...props.modelValue, value]
  emit('update:modelValue', next)
}

function toggleGroup(g: CascadeGroup) {
  const values = g.children.map((c) => c.value)
  const next = groupSelectionState(g) === 'all'
    ? props.modelValue.filter((v) => !values.includes(v))
    : [...new Set([...props.modelValue, ...values])]
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
    @close="close"
  >
    <MpPopoverTrigger>
      <MpButton class="ttc-field" :class="{ 'ttc-field--full': isFullWidth }" type="button" @click.stop="toggle">
        <span class="ttc-field__value" :class="{ 'ttc-field__value--placeholder': !selectedLabel }">
          {{ selectedLabel || placeholder || 'Transaction type' }}
        </span>
        <span class="ttc-field__icons">
          <MpIcon v-if="modelValue.length" name="reset" size="sm" class="ttc-clear" @click.stop="clear" />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </MpButton>
    </MpPopoverTrigger>

    <MpPopoverContent :class="css({ padding: '0' })" @blur="close" @escape="close">
      <div class="ttc-panels">
        <div class="ttc-col ttc-col--parents">
          <div
            v-for="g in groups" :key="g.label"
            :ref="(el) => setParentRef(el, g.label)"
            class="ttc-row"
            :class="{ 'ttc-row--active': activeGroupLabel === g.label, 'ttc-row--selected': !multiple && g.children.some((c) => modelValue.includes(c.value)) }"
            @click.stop="onGroupRowClick(g)"
          >
            <MpCheckbox
              v-if="multiple"
              :id="`${id}-group-${g.label}`"
              :is-checked="groupSelectionState(g) === 'all'"
              :is-indeterminate="groupSelectionState(g) === 'some'"
              @change="() => toggleGroup(g)"
              @click.stop
            />
            <span class="ttc-row__label">{{ g.label }}</span>
            <svg v-if="g.children.length > 1" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
        </div>

        <div v-if="activeChildren" class="ttc-col ttc-col--children" :style="{ top: `${childTop}px` }">
          <div
            v-for="c in activeChildren" :key="c.value"
            class="ttc-row"
            :class="{ 'ttc-row--selected': !multiple && modelValue.includes(c.value) }"
            @click.stop="onLeafClick(c.value)"
          >
            <MpCheckbox
              v-if="multiple"
              :id="`${id}-leaf-${c.value}`"
              :is-checked="modelValue.includes(c.value)"
              @change="() => toggleLeaf(c.value)"
              @click.stop
            />
            <span class="ttc-row__label">{{ c.label }}</span>
          </div>
        </div>
      </div>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
/* Rendered via MpButton, not a raw HTML control — default look reset (see
   IconButton/.demo-fab precedent). */
/* Height + resting border MUST equal MpInput md (rule/select-field-metrics):
   38px tall (--mp-sizes-9.5), border = --mp-colors-border-form. Short --mp-*
   aliases are EMPTY in this Pixel build → use the full --mp-colors-* tokens. */
.ttc-field { display: inline-flex !important; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2); min-width: 0 !important; width: 200px; height: var(--mp-sizes-9\.5, 38px); padding: 0 var(--mp-spacing-3) !important; background: var(--mp-colors-background-neutral, #fff) !important; border: 1px solid var(--mp-colors-border-form, #1d1f2429) !important; border-radius: var(--mp-radii-md) !important; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-colors-text-default, #080d0e); cursor: pointer; }
.ttc-field:hover { background: var(--mp-background-neutral-hovered, #eef0f3) !important; }
.ttc-field--full { width: 100%; }

.ttc-field__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ttc-field__value--placeholder { color: var(--mp-text-placeholder); }

.ttc-field__icons {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-1);
  flex-shrink: 0;
  color: var(--mp-text-subtle);
}
.ttc-clear:hover { color: var(--mp-text-default); }

/* ── Two-column cascade: children col is absolutely positioned against the
   parents col (position: relative), top-aligned to whichever parent row
   opened it — this is what makes the flyout track the active row. ── */
.ttc-panels {
  display: flex;
  align-items: flex-start;
}

.ttc-col { display: flex; flex-direction: column; width: 200px; padding: var(--mp-spacing-2) 0; }

.ttc-col--parents {
  position: relative;
  border-right: 1px solid var(--mp-border-bold, #8c9596);
}

.ttc-col--children {
  position: absolute;
  left: 100%;
  margin-left: var(--mp-spacing-1); /* 4px */
  background: var(--mp-background-neutral, #ffffff);
  border: 1px solid var(--mp-border-bold, #8c9596);
  border-radius: var(--mp-radii-md);
  box-shadow: var(--mp-shadows-md, 0 4px 12px rgba(0, 0, 0, 0.12)); /* pixel-police-allow-shadow: floating cascade flyout panel */
}

.ttc-row {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-2) var(--mp-spacing-4);
  background: transparent;
  border: none;
  text-align: left;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  cursor: pointer;
  white-space: nowrap;
}
.ttc-row:hover { background: var(--mp-background-neutral-hovered, #eef0f3); }
.ttc-row--active { background: var(--mp-background-neutral-hovered, #eef0f3); }
.ttc-row--selected {
  color: var(--mp-text-selected);
  font-weight: var(--mp-font-weights-semi-bold);
}
.ttc-row__label { flex: 1; }
.ttc-row svg { flex-shrink: 0; color: var(--mp-text-subtle); }
</style>
