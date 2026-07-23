<script setup lang="ts">
/**
 * Two-level "Transaction type" filter (Figma: Inbox node 4204-7370) — click a
 * parent category to open its child flyout; a group with a single child
 * (Expenses) has no children column and selects that child directly. The
 * child column is always top-aligned to the parent row that opened it (so
 * e.g. Purchases' flyout sits lower than Sales', matching the design), which
 * falls out for free from `position: absolute; top: <row.offsetTop>px` on a
 * `position: relative` parent column — no manual pixel math needed.
 *
 * Self-contained trigger + popover (own button, is-manual control) — see the
 * AdvancedDateRangePicker / ERP Approval-icon memory for why MpTooltip/
 * slot-forwarded triggers break MpPopoverTrigger's cloneVNode injection.
 */
import { MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, css } from '@mekari/pixel3'

export interface CascadeGroup {
  label: string
  children: { label: string; value: string }[]
}

const props = defineProps<{
  id: string
  modelValue: string
  groups: CascadeGroup[]
  placeholder?: string
}>()
const emit = defineEmits<{ 'update:modelValue': [string] }>()

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

function isGroupSelected(g: CascadeGroup) {
  return g.children.some((c) => c.value === props.modelValue)
}

const selectedLabel = computed(() => {
  if (!props.modelValue) return ''
  for (const g of props.groups) {
    if (g.children.length === 1 && g.children[0]!.value === props.modelValue) return g.label
    const c = g.children.find((c) => c.value === props.modelValue)
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

function onGroupClick(g: CascadeGroup) {
  if (g.children.length <= 1) {
    selectLeaf(g.children[0]?.value ?? '')
    return
  }
  activeGroupLabel.value = g.label
  nextTick(() => {
    const el = parentRowEls.get(g.label)
    if (el) childTop.value = el.offsetTop
  })
}

function selectLeaf(value: string) {
  emit('update:modelValue', value)
  close()
}

function clear(e: MouseEvent) {
  e.stopPropagation()
  emit('update:modelValue', '')
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
      <button class="ttc-field" type="button" @click.stop="toggle">
        <span class="ttc-field__value" :class="{ 'ttc-field__value--placeholder': !selectedLabel }">
          {{ selectedLabel || placeholder || 'Transaction type' }}
        </span>
        <span class="ttc-field__icons">
          <MpIcon v-if="modelValue" name="reset" size="sm" class="ttc-clear" @click.stop="clear" />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </span>
      </button>
    </MpPopoverTrigger>

    <MpPopoverContent :class="css({ padding: '0' })" @blur="close" @escape="close">
      <div class="ttc-panels">
        <div class="ttc-col ttc-col--parents">
          <button
            v-for="g in groups" :key="g.label"
            :ref="(el) => setParentRef(el, g.label)"
            type="button"
            class="ttc-row"
            :class="{ 'ttc-row--active': activeGroupLabel === g.label, 'ttc-row--selected': isGroupSelected(g) }"
            @click.stop="onGroupClick(g)"
          >
            <span>{{ g.label }}</span>
            <svg v-if="g.children.length > 1" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
        </div>

        <div v-if="activeChildren" class="ttc-col ttc-col--children" :style="{ top: `${childTop}px` }">
          <button
            v-for="c in activeChildren" :key="c.value"
            type="button"
            class="ttc-row"
            :class="{ 'ttc-row--selected': modelValue === c.value }"
            @click.stop="selectLeaf(c.value)"
          >
            {{ c.label }}
          </button>
        </div>
      </div>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
.ttc-field {
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
.ttc-field:hover { background: var(--mp-background-neutral-hovered); }

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

.ttc-col {
  display: flex;
  flex-direction: column;
  width: 200px;
  padding: var(--mp-spacing-2) 0;
}

.ttc-col--parents {
  position: relative;
  border-right: 1px solid var(--mp-border-bold);
}

.ttc-col--children {
  position: absolute;
  left: 100%;
  margin-left: var(--mp-spacing-1); /* 4px */
  background: var(--mp-background-neutral);
  border: 1px solid var(--mp-border-bold);
  border-radius: var(--mp-radii-md);
  box-shadow: var(--mp-shadows-md, 0 4px 12px rgba(0, 0, 0, 0.12));
}

.ttc-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
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
.ttc-row:hover { background: var(--mp-background-neutral-hovered); }
.ttc-row--active { background: var(--mp-background-neutral-hovered); }
.ttc-row--selected {
  color: var(--mp-text-selected);
  font-weight: var(--mp-font-weights-semi-bold);
}
.ttc-row svg { flex-shrink: 0; color: var(--mp-text-subtle); }
</style>
