<script setup lang="ts">
/** Payroll run: placeholder, replaced by the Phase 2 build (run record: versions, draft review, compare and fixes). */
defineProps<{ orderId?: string }>()
const { t } = useLocale()
</script>

<template>
  <div class="payroll-stub payroll-stub--detail">
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
.payroll-stub--detail { padding: var(--mp-spacing-6); }
</style>
