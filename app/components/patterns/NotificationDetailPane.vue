<script setup lang="ts">
import { MpIcon } from '@mekari/pixel3'
import type { Notification } from '~/data/notifications'

defineProps<{
  notification: Notification
  hasPrev: boolean
  hasNext: boolean
}>()

defineEmits<{
  prev: []
  next: []
}>()
</script>

<template>
  <div class="ndp">
    <div class="ndp-header">
      <div class="ndp-sender">
        <span class="ndp-mark" aria-hidden="true">
          <MpIcon name="mekari-brand" size="md" />
        </span>
        <div class="ndp-sender-col">
          <p class="ndp-sender-name">Mekari ERP</p>
          <p class="ndp-timestamp">{{ notification.timestamp }}</p>
        </div>
      </div>
      <div class="ndp-nav">
        <button
          class="ndp-nav-btn"
          type="button"
          aria-label="Previous notification"
          :disabled="!hasPrev"
          @click="$emit('prev')"
        >
          <MpIcon name="chevrons-up" size="sm" />
        </button>
        <button
          class="ndp-nav-btn"
          type="button"
          aria-label="Next notification"
          :disabled="!hasNext"
          @click="$emit('next')"
        >
          <MpIcon name="chevrons-down" size="sm" />
        </button>
      </div>
    </div>

    <div class="ndp-body">
      <h2 class="ndp-heading">{{ notification.detail.heading }}</h2>
      <p class="ndp-description">{{ notification.detail.description }}</p>

      <div class="ndp-fields">
        <div v-for="field in notification.detail.fields" :key="field.label" class="ndp-field">
          <span class="ndp-field-label">{{ field.label }}</span>
          <div class="ndp-field-value-col">
            <span class="ndp-field-value" :class="{ 'ndp-field-value--danger': field.danger }">{{ field.value }}</span>
            <span v-if="field.sub" class="ndp-field-sub">{{ field.sub }}</span>
          </div>
        </div>
      </div>

      <div class="ndp-actions">
        <button
          v-for="action in notification.detail.actions"
          :key="action.label"
          type="button"
          class="btn-enterprise"
          :class="action.primary ? 'btn-enterprise--primary' : 'btn-enterprise--ghost'"
        >
          {{ action.label }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ndp {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

.ndp-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-6, 24px) var(--mp-spacing-6, 24px) var(--mp-spacing-3, 12px);
  border-bottom: 1px solid var(--mp-border-subtle, #edf0f2);
}

.ndp-sender {
  display: flex;
  gap: var(--mp-spacing-2);
  align-items: flex-start;
  min-width: 0;
}
.ndp-mark {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: var(--mp-sizes-9, 36px);
  height: var(--mp-sizes-9, 36px);
}
.ndp-sender-col {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1, 4px);
  min-width: 0;
}
.ndp-sender-name {
  font-size: var(--mp-font-sizes-lg, 16px);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.ndp-timestamp {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-placeholder, #8690a2);
}

.ndp-nav {
  display: flex;
  gap: var(--mp-spacing-2);
  flex-shrink: 0;
}
.ndp-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--mp-spacing-2);
  border: none;
  border-radius: var(--mp-radii-md, 6px);
  background: transparent;
  color: var(--mp-text-secondary);
  cursor: pointer;
}
.ndp-nav-btn:hover:not(:disabled) { background: var(--mp-background-neutral-hovered); }
.ndp-nav-btn:disabled { color: var(--mp-text-placeholder, #8690a2); cursor: not-allowed; }

.ndp-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: var(--mp-spacing-3, 12px) var(--mp-spacing-6, 24px) var(--mp-spacing-10, 40px);
}

.ndp-heading {
  margin: 0 0 var(--mp-spacing-5, 20px);
  font-size: var(--mp-font-sizes-xl, 20px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: 32px;
  color: var(--mp-text-default);
}

.ndp-description {
  margin: 0 0 var(--mp-spacing-5, 20px);
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
  line-height: var(--mp-line-heights-lg, 24px);
}

.ndp-fields {
  display: flex;
  flex-direction: column;
  margin-bottom: var(--mp-spacing-5, 20px);
}
.ndp-field {
  display: flex;
  gap: var(--mp-spacing-6, 24px);
  padding: var(--mp-spacing-2, 8px) 0;
}
.ndp-field-label { flex-shrink: 0; width: 168px; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.ndp-field-value-col {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1, 4px);
  min-width: 0;
}
.ndp-field-value {
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}
.ndp-field-value--danger {
  color: var(--mp-text-danger, var(--mp-colors-red-600, #dc2626));
  font-weight: var(--mp-font-weights-semi-bold);
}
.ndp-field-sub {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}

.ndp-actions {
  display: flex;
  gap: var(--mp-spacing-4, 16px);
  align-items: center;
}
</style>
