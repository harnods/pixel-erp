<script setup lang="ts">
// Faithful stand-in for the source app's undesigned Expense screens (they render a
// "Scaffold" card). Shows the real menu label (not the raw registry key) so the
// prefixed 'Xpm …' keys never leak into the UI.
const { t } = useLocale()
const { pageTitle } = useNavigation()
</script>

<template>
  <div class="xpm-scaffold">
    <div class="xpm-scaffold__box">
      <p class="xpm-scaffold__title">{{ t(pageTitle) }}</p>
      <p class="xpm-scaffold__hint">This page keeps the same shell, grouped nav and design language. It's next in line to be built.</p>
    </div>
  </div>
</template>

<style scoped>
.xpm-scaffold {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 240px;
}
.xpm-scaffold__box {
  width: 100%;
  max-width: 480px;
  padding: var(--mp-spacing-8);
  text-align: center;
  border: 1px dashed var(--mp-border-default, #e3e7e9);
  border-radius: var(--mp-radii-xl, 12px);
  background: var(--mp-background-neutral, #fff);
}
.xpm-scaffold__title {
  margin: 0 0 var(--mp-spacing-2);
  font-size: var(--mp-font-sizes-lg, 16px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.xpm-scaffold__hint {
  margin: 0;
  font-size: var(--mp-font-sizes-sm);
  line-height: var(--mp-line-heights-sm, 16px);
  color: var(--mp-text-secondary);
}
</style>
