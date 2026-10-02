<script setup lang="ts">
/**
 * LastUpdatedCell — the "Last updated" column cell: date + timestamp on the first
 * line, the user who made the change as a caption below. Used by the (default-hidden)
 * Last updated column across every table that has column settings.
 */
import { formatDateTime } from '~/utils/date'
import { css } from '@mekari/pixel3'

defineProps<{ at?: string; by?: string }>()

const cellClass = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5',
})

const dateClass = css({
  fontSize: 'md',
  color: 'text.default',
  whiteSpace: 'nowrap',
})

const byClass = css({
  fontSize: 'sm',
  color: 'text.secondary',
  whiteSpace: 'nowrap',
})
</script>

<template>
  <div :class="cellClass">
    <span :class="dateClass">{{ formatDateTime(at) }}</span>
    <span :class="byClass">{{ by || '—' }}</span>
  </div>
</template>
