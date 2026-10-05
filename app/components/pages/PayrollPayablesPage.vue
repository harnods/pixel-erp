<script setup lang="ts">
/** Payroll payables: placeholder, replaced by the Phase 2 build (FG-5 payable tracker, payments and BPJS invoice match). */
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
