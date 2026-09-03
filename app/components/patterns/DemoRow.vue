<script setup lang="ts">
defineProps<{ label: string }>()
</script>

<template>
  <div class="demorow">
    <span class="demorow__label">{{ label }}</span>
    <div class="demorow__items"><slot /></div>
  </div>
</template>

<style scoped>
.demorow {
  flex-basis: 100%;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
}
.demorow__label {
  font-size: var(--mp-font-sizes-xs, 0.6875rem);
  font-weight: var(--mp-font-weights-semi-bold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--mp-text-secondary);
}
.demorow__items {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--mp-spacing-3);
}
</style>
