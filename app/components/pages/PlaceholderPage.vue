<script setup lang="ts">
const { currentPageKey } = useNavigation()
</script>

<template>
  <div class="placeholder-page">
    <div class="placeholder-content">
      <p class="placeholder-label">{{ currentPageKey }}</p>
      <p class="placeholder-hint">Page content goes here.</p>
    </div>
  </div>
</template>

<style scoped>
.placeholder-page {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 240px;
}

.placeholder-content {
  text-align: center;
}

.placeholder-label {
  font-size: 18px;            /* custom — not in token scale (between lg=16px and xl=20px) */
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  margin: 0 0 var(--mp-spacing-2);
}

.placeholder-hint {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-subtle);
  margin: 0;
}
</style>
