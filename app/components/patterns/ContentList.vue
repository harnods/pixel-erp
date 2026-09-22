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
defineProps<{
  /** Caption above (vertical) or left of (horizontal) the value — 12px, secondary. */
  label?: string
  /** Plain-text value (14px, default). For rich values use the default slot. */
  value?: string | number
  /** Horizontal layout: label left (min 184px) + 24px gap + value fills the rest. */
  horizontal?: boolean
}>()
</script>

<template>
  <div class="content-list" :class="{ 'content-list--horizontal': horizontal }">
    <span v-if="label" class="content-list__label">{{ label }}</span>
    <div class="content-list__value">
      <slot>{{ value ?? '—' }}</slot>
    </div>
  </div>
</template>

<style scoped>
.content-list {
  display: flex;
  flex-direction: column;
  /* 8px top & bottom; no gap between label and value */
  padding: var(--mp-spacing-2) 0;
}
.content-list__label {
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}
.content-list__value {
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-lg, 20px);
  color: var(--mp-text-default);
}
/* multi-line value helper (e.g. several email addresses) */
.content-list__value :deep(.content-list__line) {
  display: block;
}

/* Horizontal — label left (min 184px) + 24px gap + value fills the rest.
   Same 8px top/bottom padding. (rule/content-list-horizontal) */
.content-list--horizontal {
  flex-direction: row;
  align-items: baseline;
  gap: var(--mp-spacing-6, 24px);
}
.content-list--horizontal .content-list__label {
  flex: 0 0 184px;
  min-width: 184px;
  /* horizontal: label matches the value — 14px / regular (not the 12px caption) */
  font-size: var(--mp-font-sizes-md);
  line-height: var(--mp-line-heights-lg, 20px);
}
.content-list--horizontal .content-list__value {
  flex: 1 1 auto;
  min-width: 0;
}
</style>
