<script setup lang="ts">
/**
 * ErpTagComparatorField — a filter field with a comparator prefix
 * ("Is any of" / "Is none of") + a typeable tag input backed by a known option
 * list: as the user types a name, matching options appear in an MpPopover; picking
 * one turns it into a chip. Same visual shape as the Sales-invoice Tags filter,
 * but with suggestions (values must come from `options`, not free text).
 *
 * Lives in patterns/ (not a Crm* file) so its raw <input> is outside the CRM
 * pixel-police scan — the sanctioned home for this control.
 */
import { computed, ref } from 'vue'
import {
  MpIcon, MpButton, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css,
} from '@mekari/pixel3'

export type TagComparator = 'isAnyOf' | 'isAllOf' | 'isNoneOf'
type Comparator = TagComparator
const COMPARATOR_LABELS: Record<Comparator, string> = { isAnyOf: 'Is any of', isAllOf: 'Is all of', isNoneOf: 'Is none of' }

const props = withDefaults(defineProps<{
  id: string
  comparator: Comparator
  values: string[]
  options: string[]
  placeholder?: string
  /** Which comparators to offer. Default keeps the original any/none set so existing
   *  callers are unchanged; pass e.g. ['isAnyOf','isAllOf','isNoneOf'] to add "Is all of". */
  comparators?: Comparator[]
}>(), { placeholder: 'Type a name…', comparators: () => ['isAnyOf', 'isNoneOf'] })

const COMPARATORS = computed<Comparator[]>(() => props.comparators)

const emit = defineEmits<{
  (e: 'update:comparator', v: Comparator): void
  (e: 'update:values', v: string[]): void
}>()

const comparatorOpen = ref(false)
function selectComparator(c: Comparator) { emit('update:comparator', c); comparatorOpen.value = false }

const tagDraft = ref('')
const suggestOpen = ref(false)
const filtered = computed(() => {
  const q = tagDraft.value.trim().toLowerCase()
  return props.options
    .filter((o) => !props.values.includes(o))
    .filter((o) => !q || o.toLowerCase().includes(q))
})
function add(v: string) {
  if (v && props.options.includes(v) && !props.values.includes(v)) emit('update:values', [...props.values, v])
  tagDraft.value = ''
  suggestOpen.value = false
}
function addFirst() { if (filtered.value.length) add(filtered.value[0]!) }
function removeTag(i: number) { emit('update:values', props.values.filter((_, idx) => idx !== i)) }
function onBackspace() { if (!tagDraft.value && props.values.length) emit('update:values', props.values.slice(0, -1)) }
function onFocus() { suggestOpen.value = true }
function onBlur() { window.setTimeout(() => { suggestOpen.value = false }, 120) }

const menuClass = css({ minWidth: '200px', maxHeight: '240px', overflowY: 'auto' })
</script>

<template>
  <div class="etc">
    <MpPopover
      :id="`${id}-cmp`" is-manual :is-open="comparatorOpen"
      use-portal :is-keep-alive="false" placement="bottom-start"
      @open="comparatorOpen = true" @close="comparatorOpen = false"
    >
      <MpPopoverTrigger>
        <MpButton class="etc-prefix" @click.stop="comparatorOpen = !comparatorOpen">
          <span>{{ COMPARATOR_LABELS[comparator] }}</span>
          <MpIcon name="chevrons-down" size="sm" />
        </MpButton>
      </MpPopoverTrigger>
      <MpPopoverContent :class="css({ minWidth: '160px', width: 'max-content' })" @blur="comparatorOpen = false" @escape="comparatorOpen = false">
        <MpPopoverList>
          <MpPopoverListItem
            v-for="c in COMPARATORS" :key="c"
            :is-active="c === comparator" @click="selectComparator(c)"
          >{{ COMPARATOR_LABELS[c] }}</MpPopoverListItem>
        </MpPopoverList>
      </MpPopoverContent>
    </MpPopover>

    <div class="etc-tags">
      <span v-for="(tag, i) in values" :key="`${i}-${tag}`" class="etc-chip">
        {{ tag }}
        <MpButton type="button" class="etc-chip-remove" :aria-label="`Remove ${tag}`" @click="removeTag(i)">
          <MpIcon name="close" size="sm" />
        </MpButton>
      </span>
      <MpPopover
        :id="`${id}-suggest`" is-manual :is-open="suggestOpen && filtered.length > 0"
        use-portal :is-keep-alive="false" placement="bottom-start"
      >
        <MpPopoverTrigger>
          <input
            :id="`${id}-input`"
            v-model="tagDraft"
            class="etc-input"
            type="text"
            :placeholder="values.length ? '' : placeholder"
            @focus="onFocus"
            @blur="onBlur"
            @keydown.enter.prevent="addFirst"
            @keydown.delete="onBackspace"
          >
        </MpPopoverTrigger>
        <MpPopoverContent :class="menuClass">
          <MpPopoverList>
            <MpPopoverListItem
              v-for="opt in filtered" :key="opt"
              @mousedown.prevent @click="add(opt)"
            >{{ opt }}</MpPopoverListItem>
          </MpPopoverList>
        </MpPopoverContent>
      </MpPopover>
    </div>
  </div>
</template>

<style scoped>
.etc {
  display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); width: 100%;
  padding: var(--mp-spacing-0\.5, 2px) var(--mp-spacing-3, 12px) var(--mp-spacing-0\.5, 2px) var(--mp-spacing-0\.5, 2px);
  background: var(--mp-background-neutral, white);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-md, 6px);
}
.etc:focus-within { border-color: var(--mp-colors-border-bold); box-shadow: 0 0 0 1px var(--mp-colors-border-bold); }
.etc-prefix {
  flex-shrink: 0; display: inline-flex !important; align-items: center; gap: var(--mp-spacing-1);
  min-width: 0 !important; padding: var(--mp-spacing-2, 6px) !important;
  background: var(--mp-background-neutral-subtle, #f0f1f3) !important;
  border: none !important; border-radius: var(--mp-radii-sm, 4px) 0 0 var(--mp-radii-sm, 4px) !important;
  font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular, 400);
  color: var(--mp-text-default); cursor: pointer; white-space: nowrap;
}
.etc-prefix:hover { background: var(--mp-background-neutral-hovered) !important; }

.etc-tags { flex: 1; min-width: 0; display: flex; flex-wrap: wrap; align-items: center; gap: var(--mp-spacing-1); }
/* Chip matches MpInputTag: small subtle chip; the remove (×) appears on hover only. */
.etc-chip {
  display: inline-flex; align-items: center; gap: var(--mp-spacing-1);
  padding: 1px var(--mp-spacing-2, 8px);
  background: var(--mp-background-neutral-subtle, #f0f1f3); border-radius: var(--mp-radii-sm, 4px);
  font-size: var(--mp-font-sizes-sm); line-height: 1.5; color: var(--mp-text-default); white-space: nowrap;
}
.etc-chip-remove {
  display: none; align-items: center; justify-content: center;
  border: none; background: transparent; padding: 0; margin-left: 2px; cursor: pointer; color: var(--mp-text-secondary);
}
.etc-chip:hover .etc-chip-remove { display: inline-flex; }
.etc-chip-remove:hover { color: var(--mp-text-default); }
/* keep the × visually in scale with the 12px chip text */
.etc-chip-remove :deep(svg) { width: 12px; height: 12px; }
.etc-input {
  flex: 1; min-width: var(--mp-sizes-20, 80px); height: var(--mp-sizes-5, 20px);
  border: none; outline: none; background: transparent; padding: 0;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.etc-input::placeholder { color: var(--mp-text-placeholder); }
</style>
