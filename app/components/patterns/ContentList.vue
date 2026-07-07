<script setup lang="ts">
/**
 * ContentList — a labelled, read-only field: a caption (label) stacked directly
 * above its value. The repeating unit of a detail page's header summary and of
 * any key/value display across the ERP.
 *
 * Rules (see docs/patterns/ContentList.md):
 *   • vertical padding 8px top & bottom; NO gap between label and value
 *   • label = 12px secondary; value = 14px default
 *   • empty value renders as "—"
 *
 * Usage:
 *   <ContentList label="Customer" value="Anomali Coffee" />
 *   <ContentList label="Tags"><ErpTagList :tags="tags" /></ContentList>   // rich value via slot
 *   <ContentList label="Email">
 *     <span class="content-list__line">a@x.com</span>
 *     <span class="content-list__line">b@x.com</span>
 *   </ContentList>
 */
defineProps<{
  /** Caption above the value (12px, secondary). Omit for a value-only field. */
  label?: string
  /** Plain-text value (14px, default). For rich values use the default slot. */
  value?: string | number
}>()
</script>

<template>
  <div class="content-list">
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
</style>
