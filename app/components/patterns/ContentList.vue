<script setup lang="ts">
/**
 * ContentList — a labelled, read-only field: a caption (label) stacked directly
 * above its value. The repeating unit of a detail page's header summary and of
 * any key/value display across the ERP.
 *
 * Rules (see docs/patterns/ContentList.md):
 *   Two layouts:
 *   • VERTICAL (default) — label stacked above value; 8px top/bottom, NO gap between.
 *   • HORIZONTAL (`horizontal`) — label LEFT (min 184px) + 24px gap + value fills the
 *     rest; 8px top/bottom. Used on detail pages where key/value read as a row.
 *   • label = 12px secondary; value = 14px default; empty value renders as "—".
 *
 * Usage:
 *   <ContentList label="Customer" value="Anomali Coffee" />
 *   <ContentList horizontal label="Vendor" value="PT Maju Jaya" />        // label left / value right
 *   <ContentList label="Tags"><ErpTagList :tags="tags" /></ContentList>   // rich value via slot
 *   <ContentList label="Email">
 *     <span class="content-list__line">a@x.com</span>
 *     <span class="content-list__line">b@x.com</span>
 *   </ContentList>
 */
import { computed } from 'vue'
import { css } from '@mekari/pixel3'

const props = defineProps<{
  /** Caption above (vertical) or left of (horizontal) the value — 12px, secondary. */
  label?: string
  /** Plain-text value (14px, default). For rich values use the default slot. */
  value?: string | number
  /** Horizontal layout: label left (min 184px) + 24px gap + value fills the rest. */
  horizontal?: boolean
}>()

const rootClass = computed(() =>
  css({
    display: 'flex',
    flexDirection: props.horizontal ? 'row' : 'column',
    alignItems: props.horizontal ? 'baseline' : undefined,
    gap: props.horizontal ? '6' : undefined,
    /* 8px top & bottom; no gap between label and value */
    paddingTop: '2',
    paddingBottom: '2',
  })
)

const labelClass = computed(() =>
  css({
    fontSize: props.horizontal ? 'md' : 'sm',
    lineHeight: props.horizontal ? 'lg' : 'sm',
    color: 'text.secondary',
    flex: props.horizontal ? '0 0 184px' : undefined,
    minWidth: props.horizontal ? '184px' : undefined,
  })
)

const valueClass = computed(() =>
  css({
    fontSize: 'md',
    lineHeight: 'lg',
    color: 'text.default',
    flex: props.horizontal ? '1 1 auto' : undefined,
    minWidth: props.horizontal ? '0' : undefined,
  })
)
</script>

<template>
  <div :class="rootClass">
    <span v-if="label" :class="labelClass">{{ label }}</span>
    <div :class="valueClass">
      <slot>{{ value ?? '—' }}</slot>
    </div>
  </div>
</template>

<style scoped>
/* multi-line value helper (e.g. several email addresses) — :deep() requires a style block */
:deep(.content-list__line) {
  display: block;
}
</style>
