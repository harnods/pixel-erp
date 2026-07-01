<script setup lang="ts">
/**
 * LastUpdatedCell — the "Last updated" column cell: date + timestamp on the first
 * line, the user who made the change as a caption below. Used by the (default-hidden)
 * Last updated column across every table that has column settings.
 */
const props = defineProps<{ at?: string; by?: string }>()

function fmt(iso?: string) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const date = new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false }).format(d)
  return `${date}, ${time}`
}
</script>

<template>
  <div class="lu-cell">
    <span class="lu-date">{{ fmt(at) }}</span>
    <span class="lu-by">{{ by || '—' }}</span>
  </div>
</template>

<style scoped>
.lu-cell { display: flex; flex-direction: column; gap: var(--mp-spacing-0\.5); }
.lu-date { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); white-space: nowrap; }
.lu-by { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); white-space: nowrap; }
</style>
