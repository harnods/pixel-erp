<script setup lang="ts">
/**
 * LastUpdatedCell — the "Last updated" column cell: date + timestamp on the first
 * line, the user who made the change as a caption below. Used by the (default-hidden)
 * Last updated column across every table that has column settings.
 */
import { formatDateTime } from '~/utils/date'

defineProps<{ at?: string; by?: string }>()
</script>

<template>
  <div class="lu-cell">
    <span class="lu-date">{{ formatDateTime(at) }}</span>
    <span class="lu-by">{{ by || '—' }}</span>
  </div>
</template>

<style scoped>
.lu-cell { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.lu-date { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.lu-by { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
</style>
