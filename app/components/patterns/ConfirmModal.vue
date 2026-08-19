<script setup lang="ts">
/**
 * Generic confirm dialog (delete / destructive-action confirmation). A custom
 * Teleport overlay — MpModal renders with no structural CSS in this Pixel3 build
 * (verified: content flows inline instead of as a dimmed, centered dialog — see
 * LocationPriorityDrawer.vue for the same root cause/fix on drawers).
 */
withDefaults(defineProps<{
  isOpen: boolean
  title: string
  description?: string
  confirmLabel?: string
  cancelLabel?: string
  isDanger?: boolean
}>(), {
  description: '',
  confirmLabel: 'Delete',
  cancelLabel: 'Cancel',
  isDanger: true,
})
const emit = defineEmits<{
  (e: 'update:isOpen', v: boolean): void
  (e: 'confirm'): void
}>()

function close() { emit('update:isOpen', false) }
function confirm() { emit('confirm'); close() }
</script>

<template>
  <Transition name="cm">
    <div v-if="isOpen" class="cm-overlay" @click.self="close">
      <div class="cm-panel" role="alertdialog" aria-modal="true" :aria-label="title">
        <p class="cm-title">{{ title }}</p>
        <p v-if="description" class="cm-desc">{{ description }}</p>
        <div class="cm-footer">
          <button class="btn-enterprise btn-enterprise--ghost" type="button" @click="close">{{ cancelLabel }}</button>
          <button
            class="btn-enterprise"
            :class="isDanger ? 'btn-enterprise--danger' : 'btn-enterprise--primary'"
            type="button"
            @click="confirm"
          >{{ confirmLabel }}</button>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cm-enter-active, .cm-leave-active { transition: opacity 200ms ease; }
.cm-enter-from, .cm-leave-to { opacity: 0; }
.cm-enter-active .cm-panel, .cm-leave-active .cm-panel { transition: transform 200ms ease, opacity 200ms ease; }
.cm-enter-from .cm-panel, .cm-leave-to .cm-panel { transform: scale(0.96); opacity: 0; }

/* Alert dialogs always align to the top of the viewport, 80px down. */
.cm-overlay {
  position: fixed; inset: 0; z-index: 1400;
  background: rgba(8, 13, 14, 0.45);
  display: flex; align-items: flex-start; justify-content: center;
}
.cm-panel {
  width: min(400px, calc(100% - 32px));
  margin-top: 80px;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 12px);
  padding: var(--mp-spacing-5) var(--mp-spacing-5) var(--mp-spacing-4);
  box-shadow: 0 10px 15px -3px rgba(0,0,0,0.2), 0 4px 6px -2px rgba(0,0,0,0.1);
}
.cm-title {
  margin: 0; font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}
.cm-desc {
  margin: var(--mp-spacing-2) 0 0; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary);
  line-height: var(--mp-line-heights-lg, 20px);
}
.cm-footer {
  display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  margin-top: var(--mp-spacing-5);
}
</style>
