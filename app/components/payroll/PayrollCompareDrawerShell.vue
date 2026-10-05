<script setup lang="ts">
/**
 * Side panel shell for the revision drawers (fix, reverse, dismiss warning, close task).
 * Same markup and motion as BillsFiltersDrawer (rule/drawer-custom-shell): close by × or
 * the footer only; the overlay is a backdrop.
 */
import { MpButton, MpIcon } from '@mekari/pixel3'

withDefaults(defineProps<{ isOpen: boolean; title: string; wide?: boolean }>(), { wide: false })
const emit = defineEmits<{ close: [] }>()
</script>

<template>
  <Teleport to="body">
    <Transition name="prd">
      <div v-if="isOpen" class="prd-overlay">
        <div class="prd-panel" :class="{ 'prd-panel--wide': wide }" role="dialog" :aria-label="title">
          <header class="prd-header">
            <span class="prd-title">{{ title }}</span>
            <MpButton class="prd-close" aria-label="Close" @click="emit('close')">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>
          <div class="prd-body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="prd-footer">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.prd-enter-active, .prd-leave-active { transition: background-color 250ms ease; }
.prd-enter-from, .prd-leave-to { background-color: transparent; }
.prd-enter-active .prd-panel { transition: transform 350ms ease-out; }
.prd-leave-active .prd-panel { transition: transform 250ms ease-in; }
.prd-enter-from .prd-panel,
.prd-leave-to .prd-panel { transform: translateX(calc(100% + 12px)); }

.prd-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.prd-panel {
  margin: var(--mp-spacing-3);
  width: min(520px, calc(100% - 24px));
  height: calc(100% - 24px);
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: 12px;
  overflow: hidden;
}
.prd-panel--wide { width: min(860px, calc(100% - 24px)); }
.prd-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.prd-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.prd-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-colors-icon-default);
}
.prd-close:hover { background: var(--mp-background-neutral-hovered); }
.prd-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px);
  padding: var(--mp-spacing-4);
}
/* Flex children with their own overflow would shrink to nothing in a scrolling column. */
.prd-body > * { flex-shrink: 0; }
.prd-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
</style>
