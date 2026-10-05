<script setup lang="ts">
/** Payroll inbox: placeholder, replaced by the Phase 2 build (FG-2 run inbox, holds, sync log and the Simulate Talenta send menu). */
const { t } = useLocale()
</script>

<template>
  <div class="payroll-stub">
    <div class="payroll-stub__card">{{ t('Being built') }}</div>
  </div>
</template>

<style scoped>
.payroll-stub__card {
  padding: var(--mp-spacing-6);
  border: 1px solid var(--mp-colors-border-default);
  border-radius: var(--mp-radii-md);
  background: var(--mp-colors-background-surface);
  color: var(--mp-colors-text-secondary);
}

</style>
