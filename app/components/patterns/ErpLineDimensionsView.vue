<!--
  ErpLineDimensionsView — read-only "Dimensions" cell for detail pages: each
  assigned dimension stacked two lines, name on top (bold caption) and value
  below (regular), matching the create page's ErpLineDimensionsCell one-for-one
  (Figma nZdSEnyXOmQVbSWYhcwyGT, node 6394:86679) but without any interactivity.
-->
<script setup lang="ts">
defineProps<{ values: { name: string; value: string }[] }>()
</script>

<template>
  <div v-if="values.length" class="eldv">
    <div v-for="v in values" :key="v.name" class="eldv-row">
      <span class="eldv-label">{{ v.name }}</span>
      <span class="eldv-value">{{ v.value }}</span>
    </div>
  </div>
</template>

<style scoped>
.eldv { display: flex; flex-direction: column; }
.eldv-row { display: flex; flex-direction: column; gap: 2px; padding: var(--mp-spacing-2) 0; }
.eldv-row + .eldv-row { border-top: 1px solid var(--mp-border-default); }
.eldv-label { font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); line-height: 16px; color: var(--mp-text-default); }
.eldv-value { font-size: var(--mp-font-sizes-md); line-height: 20px; color: var(--mp-text-default); }
</style>
