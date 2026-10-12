<script setup lang="ts">
/**
 * The one read-only line on payroll screens: shown where the View as role can see an area but
 * not act in it ("Editing needs Set up access."). Same look on every settings tab and action area.
 */
import { MpIcon } from '@mekari/pixel3'

defineProps<{ text: string }>()
</script>

<template>
  <p class="pro" data-testid="payroll-readonly">
    <MpIcon name="info" size="sm" class="pro__icon" />
    <span>{{ text }}</span>
  </p>
</template>

<style scoped>
.pro { display: flex; align-items: center; gap: var(--mp-spacing-2); margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.pro__icon { flex: none; color: var(--mp-text-secondary); }
</style>
