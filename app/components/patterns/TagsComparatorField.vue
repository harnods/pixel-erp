<script setup lang="ts">
/**
 * Tag comparator field ("All filters" ▸ Tags) — a single merged trigger,
 * same self-contained-popover shape as AmountComparatorField/MultiSelectDropdown
 * (own button, is-manual control — see the ERP Approval-icon memory for why
 * MpTooltip/slot-forwarded triggers break MpPopoverTrigger's cloneVNode
 * injection). The trigger's label doubles as the comparator ("Is any of" /
 * "Is none of") until tags are picked, then switches to naming them; the
 * popover holds the comparator choice on top and the tag checklist below.
 */
import { MpIcon, MpButton, MpCheckbox, MpPopover, MpPopoverTrigger, MpPopoverContent, css } from '@mekari/pixel3'

export type TagsComparator = 'isAnyOf' | 'isNoneOf'

const COMPARATORS: TagsComparator[] = ['isAnyOf', 'isNoneOf']
const COMPARATOR_LABELS: Record<TagsComparator, string> = {
  isAnyOf: 'Is any of',
  isNoneOf: 'Is none of',
}

const props = defineProps<{
  id: string
  comparator: TagsComparator
  tags: string[]
  options: string[]
}>()
const emit = defineEmits<{
  'update:comparator': [TagsComparator]
  'update:tags': [string[]]
}>()

const open = ref(false)

const label = computed(() => {
  if (props.tags.length === 0) return COMPARATOR_LABELS[props.comparator]
  const names = props.tags.length <= 2 ? props.tags.join(', ') : `${props.tags.length} tags`
  return `${COMPARATOR_LABELS[props.comparator]}: ${names}`
})

function selectComparator(c: TagsComparator) { emit('update:comparator', c) }
function toggleTag(tag: string) {
  emit('update:tags', props.tags.includes(tag) ? props.tags.filter((v) => v !== tag) : [...props.tags, tag])
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
      <MpButton class="tcf-field" type="button" @click.stop="open = !open">
        <span class="tcf-field__value">{{ label }}</span>
        <MpIcon name="chevrons-down" size="sm" />
      </MpButton>
    </MpPopoverTrigger>

    <MpPopoverContent :class="css({ padding: '8px', minWidth: '240px', maxHeight: '320px', overflowY: 'auto', borderRadius: '12px' })" @blur="open = false" @escape="open = false">
      <div class="tcf-comparators">
        <button
          v-for="c in COMPARATORS" :key="c"
          class="tcf-option" :class="{ 'tcf-option--selected': c === comparator }"
          type="button" @click.stop="selectComparator(c)"
        >
          {{ COMPARATOR_LABELS[c] }}
        </button>
      </div>
      <div v-if="options.length" class="tcf-divider" />
      <ul v-if="options.length" class="tcf-list">
        <li v-for="opt in options" :key="opt" class="tcf-item" @click="toggleTag(opt)">
          <span @click.stop>
            <MpCheckbox :id="`${id}-${opt}`" :is-checked="tags.includes(opt)" @change="() => toggleTag(opt)" />
          </span>
          <span class="tcf-item-label">{{ opt }}</span>
        </li>
      </ul>
    </MpPopoverContent>
  </MpPopover>
</template>

<style scoped>
/* Rendered via MpButton, not a raw HTML control — default look reset (see
   IconButton/.demo-fab precedent). */
.tcf-field {
  display: inline-flex !important; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  min-width: 0 !important; width: 100%; height: var(--mp-sizes-9, 36px);
  padding: 0 var(--mp-spacing-3) !important;
  background: var(--mp-background-neutral) !important;
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16)) !important;
  border-radius: var(--mp-radii-md) !important;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  cursor: pointer;
}
.tcf-field:hover { background: var(--mp-background-neutral-hovered) !important; }
.tcf-field__value { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.tcf-comparators { display: flex; flex-direction: column; }
.tcf-option {
  display: block; width: 100%; padding: var(--mp-spacing-3, 12px) var(--mp-spacing-4, 16px);
  border: none; border-radius: var(--mp-radii-sm, 4px); background: transparent; text-align: left;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); cursor: pointer; white-space: nowrap;
}
.tcf-option:hover { background: var(--mp-background-neutral-hovered); }
.tcf-option--selected { color: var(--mp-text-selected); font-weight: var(--mp-font-weights-semi-bold); }

.tcf-divider { height: 1px; margin: var(--mp-spacing-2) 0; background: var(--mp-border-default); }

.tcf-list { list-style: none; margin: 0; padding: 0; }
.tcf-item {
  display: flex; align-items: center; gap: 0;
  padding: var(--mp-spacing-2) var(--mp-spacing-3);
  border-radius: var(--mp-radii-sm); cursor: pointer; user-select: none;
}
.tcf-item:hover { background: var(--mp-background-neutral-hovered); }
.tcf-item-label { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
</style>
