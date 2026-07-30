<script setup lang="ts">
/**
 * Prefix-comparator amount field (Figma: Inbox "All filters" node 4245-3372) —
 * used for the Total / Balance due filters. A merged bordered box: a
 * "Is greater than / Is between / Is less than" prefix chip (self-contained
 * trigger + popover, same pattern as TransactionTypeCascadeMenu — see the ERP
 * Approval-icon memory for why MpTooltip/slot-forwarded triggers break
 * MpPopoverTrigger's cloneVNode injection) followed by one value input, or two
 * (min – max) when the comparator is "Is between".
 *
 * Bare input elements (not MpInput) inside the merged box — MpInput brings
 * its own border/radius which would double up against the outer box's.
 */
import { MpIcon, MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, css } from '@mekari/pixel3'

export type AmountComparator = 'gt' | 'between' | 'lt'

const COMPARATORS: AmountComparator[] = ['gt', 'between', 'lt']
const COMPARATOR_LABELS: Record<AmountComparator, string> = {
  gt: 'Is greater than',
  between: 'Is between',
  lt: 'Is less than',
}

const props = defineProps<{
  id: string
  comparator: AmountComparator
  value: string
  min: string
  max: string
}>()
const emit = defineEmits<{
  'update:comparator': [AmountComparator]
  'update:value': [string]
  'update:min': [string]
  'update:max': [string]
}>()

const open = ref(false)
function selectComparator(c: AmountComparator) {
  emit('update:comparator', c)
  open.value = false
}
</script>

<template>
  <div class="acf-content">
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
        <MpButton class="acf-prefix" type="button" @click.stop="open = !open">
          <span>{{ COMPARATOR_LABELS[comparator] }}</span>
          <MpIcon name="chevrons-down" size="sm" />
        </MpButton>
      </MpPopoverTrigger>
      <MpPopoverContent :class="css({ padding: '8px', minWidth: '200px', borderRadius: '12px', overflow: 'hidden' })" @blur="open = false" @escape="open = false">
        <button
          v-for="c in COMPARATORS" :key="c"
          class="acf-option" :class="{ 'acf-option--selected': c === comparator }"
          type="button" @click.stop="selectComparator(c)"
        >
          {{ COMPARATOR_LABELS[c] }}
        </button>
      </MpPopoverContent>
    </MpPopover>

    <template v-if="comparator === 'between'">
      <input
        :id="`${id}-min`" class="acf-input" type="number" placeholder="Min"
        :value="min" @input="emit('update:min', ($event.target as HTMLInputElement).value)"
      >
      <span class="acf-sep">–</span>
      <input
        :id="`${id}-max`" class="acf-input" type="number" placeholder="Max"
        :value="max" @input="emit('update:max', ($event.target as HTMLInputElement).value)"
      >
    </template>
    <input
      v-else
      :id="`${id}-value`" class="acf-input" type="number" placeholder="Value"
      :value="value" @input="emit('update:value', ($event.target as HTMLInputElement).value)"
    >
  </div>
</template>

<style scoped>
/* Figma: pl-[2px] pr-[12px] py-[2px] — the 2px left inset is what leaves
   room for the prefix chip's own rounded-left corners to nest inside this
   box's 6px radius instead of squaring it off. */
.acf-content { display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); width: 100%; padding: 2px 12px 2px 2px; background: var(--mp-background-neutral, white); border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16)); border-radius: var(--mp-radii-md, 6px); }

/* Rendered via MpButton, not a raw HTML control — default look reset (see
   IconButton/.demo-fab precedent). Rounded on the left only — it sits flush
   against the value input on the right, not floating as a standalone pill. */
.acf-prefix {
  display: flex !important;
  align-items: center;
  gap: var(--mp-spacing-1, 4px);
  flex-shrink: 0;
  min-width: 0 !important;
  padding: var(--mp-spacing-2, 6px) !important;
  background: var(--mp-background-neutral-subtle, #f0f1f3) !important;
  border: none !important;
  border-radius: var(--mp-radii-sm, 4px) 0 0 var(--mp-radii-sm, 4px) !important;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  cursor: pointer;
  white-space: nowrap;
}
.acf-prefix:hover { background: var(--mp-background-neutral-hovered) !important; }

.acf-input {
  flex: 1;
  min-width: 0;
  height: var(--mp-sizes-5, 20px);
  border: none;
  outline: none;
  background: transparent;
  padding: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.acf-input::placeholder { color: var(--mp-text-placeholder); }

.acf-sep { color: var(--mp-text-subtle); flex-shrink: 0; }

/* ── Popover option list — overflow:hidden keeps hovered rows from squaring
     off the panel's rounded corners. ── */
.acf-option {
  display: block;
  width: 100%;
  padding: var(--mp-spacing-3, 12px) var(--mp-spacing-4, 16px);
  border: none;
  border-radius: var(--mp-radii-sm, 4px);
  background: transparent;
  text-align: left;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  cursor: pointer;
  white-space: nowrap;
}
.acf-option:hover { background: var(--mp-background-neutral-hovered); }
.acf-option--selected {
  color: var(--mp-text-selected);
  font-weight: var(--mp-font-weights-semi-bold);
}
</style>
