<script setup lang="ts">
import { MpCheckbox } from '@mekari/pixel3'
import type { Notification } from '~/data/notifications'

defineProps<{
  notification: Notification
  selected: boolean
  checked: boolean
}>()

defineEmits<{
  select: []
  toggle: []
}>()
</script>

<template>
  <div
    class="nli"
    :class="{ 'nli--selected': selected }"
    @click="$emit('select')"
  >
    <span class="nli-check" @click.stop>
      <MpCheckbox :id="`nli-${notification.id}`" :is-checked="checked" @change="$emit('toggle')" />
    </span>
    <div class="nli-col">
      <div class="nli-label">
        <p class="nli-title">{{ notification.title }}</p>
        <span class="nli-time">{{ notification.timeLabel }}</span>
        <span v-if="notification.unread" class="nli-dot" />
      </div>
      <p class="nli-preview">{{ notification.preview }}</p>
    </div>
  </div>
</template>

<style scoped>
.nli {
  display: flex;
  gap: var(--mp-spacing-2);
  align-items: flex-start;
  width: 100%;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-2);
  border-radius: var(--mp-radii-md, 6px);
  cursor: pointer;
}
.nli:hover { background: var(--mp-background-neutral-hovered); }
.nli--selected { background: var(--mp-background-neutral-selected, #f7f8f9); }
.nli--selected:hover { background: var(--mp-background-neutral-selected, #f7f8f9); }

.nli-check { flex-shrink: 0; padding-top: 2px; }

.nli-col {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1, 4px);
  min-width: 0;
  flex: 1;
}

.nli-label {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-2);
  width: 100%;
}
.nli-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.nli-time {
  flex-shrink: 0;
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-placeholder, #8690a2);
}
.nli-dot {
  flex-shrink: 0;
  width: var(--mp-spacing-1\.5, 6px);
  height: var(--mp-spacing-1\.5, 6px);
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-information-bold, #4b61dc);
}

.nli-preview {
  width: 100%;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
