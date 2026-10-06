<script setup lang="ts">
/**
 * Side panel shell for the payroll pay and prove screens. Same Teleport
 * structure as CoaAccountDrawer (MpDrawer has no structural CSS in this build).
 * A form: an overlay click is ignored, so typed input is never lost.
 */
import { MpButton, MpIcon } from '@mekari/pixel3'

withDefaults(defineProps<{ isOpen: boolean; title: string; wide?: boolean }>(), { wide: false })
const emit = defineEmits<{ (e: 'update:isOpen', v: boolean): void }>()
const { t } = useLocale()
function close() { emit('update:isOpen', false) }
</script>

<template>
  <Teleport to="body">
    <Transition name="ppd">
      <div v-if="isOpen" class="ppd-overlay">
        <div class="ppd-panel" :class="{ 'ppd-panel--wide': wide }" role="dialog" :aria-label="title">
          <header class="ppd-header">
            <span class="ppd-title">{{ title }}</span>
            <MpButton class="ppd-close" is-rounded :aria-label="t('Close')" @click="close">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>
          <div class="ppd-body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="ppd-footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ppd-enter-active, .ppd-leave-active { transition: background-color 250ms ease; }
.ppd-enter-from, .ppd-leave-to { background-color: transparent; }
.ppd-enter-active .ppd-panel { transition: transform 350ms ease-out; }
.ppd-leave-active .ppd-panel { transition: transform 250ms ease-in; }
.ppd-enter-from .ppd-panel, .ppd-leave-to .ppd-panel { transform: translateX(calc(100% + 12px)); }

.ppd-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex;
  justify-content: flex-end;
}
.ppd-panel {
  margin: var(--mp-spacing-3);
  width: min(480px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex;
  flex-direction: column;
  background: var(--mp-colors-background-stage, #fff);
  border-radius: var(--mp-radii-lg, 12px);
  overflow: hidden;
}
.ppd-panel--wide { width: min(720px, calc(100% - 24px)); }
.ppd-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-colors-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-colors-border-default);
}
.ppd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-colors-text-default); }
.ppd-close {
  display: inline-flex !important;
  align-items: center;
  justify-content: center;
  width: var(--mp-sizes-9, 36px) !important;
  height: var(--mp-sizes-9, 36px) !important;
  min-width: 0 !important;
  border: none !important;
  background: none !important;
  border-radius: var(--mp-radii-md);
  cursor: pointer;
}
.ppd-close:hover { background: var(--mp-colors-background-neutral-hovered) !important; }
.ppd-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-5);
  padding: var(--mp-spacing-4);
}
.ppd-footer {
  flex-shrink: 0;
  display: flex;
  justify-content: flex-end;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-colors-border-default);
}
</style>
