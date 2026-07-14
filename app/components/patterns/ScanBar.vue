<script setup lang="ts">
defineProps<{ placeholder?: string }>()
const emit = defineEmits<{ scan: [value: string] }>()

function onEnter(e: Event) {
  const input = e.target as HTMLInputElement
  emit('scan', input.value)
  input.value = ''
}
</script>

<template>
  <div class="scan-bar">
    <svg class="scan-bar-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="7" y1="8" x2="7" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="10.5" y1="8" x2="10.5" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <line x1="14" y1="8" x2="14" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="17" y1="8" x2="17" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <input
      class="scan-bar-input"
      type="text"
      :placeholder="placeholder ?? 'Scan barcode...'"
      @keydown.enter.prevent="onEnter($event)"
    />
    <slot />
  </div>
</template>

<style scoped>
.scan-bar {
  display: flex; align-items: center; gap: var(--mp-spacing-3);
  margin-bottom: var(--mp-spacing-4);
  padding: var(--mp-spacing-2\.5) var(--mp-spacing-4);
  background: var(--mp-background-default); border: 1.5px dashed var(--mp-border-default);
  border-radius: var(--mp-radii-lg);
}
.scan-bar:focus-within { border-color: var(--mp-border-bold); }
.scan-bar-icon { flex-shrink: 0; color: var(--mp-text-secondary); }
.scan-bar-input {
  flex: 1; border: none; outline: none; background: transparent;
  font-size: var(--mp-font-sizes-md); color: var(--mp-text-default);
}
.scan-bar-input::placeholder { color: var(--mp-text-placeholder); }
</style>
