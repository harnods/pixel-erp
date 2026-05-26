<script setup lang="ts">
/**
 * ErpFilterBar — layout container for filter controls on index pages.
 *
 * ⚠️  MpFilterBar does not exist in Pixel Enterprise yet.
 *     Request to Pixel team: add MpFilterBar as a standard container for
 *     search + dropdown filters + action buttons on index pages.
 *
 * Usage:
 *   <ErpFilterBar>
 *     <MpInputGroup id="...">...</MpInputGroup>
 *     <MpSelect id="...">...</MpSelect>
 *     <MpButton variant="primary" :class="css({ ml: 'auto' })">+ Create</MpButton>
 *   </ErpFilterBar>
 */
</script>

<template>
  <div class="erp-filter-bar">
    <slot />
  </div>
</template>

<style scoped>
.erp-filter-bar {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-bottom: 1px solid var(--mp-border-default);
  flex-shrink: 0;
  flex-wrap: wrap;
}
</style>
