<!-- prod-parity: jurnal-frontend-app/src/pages/consolidations/index/components/drawer-setup/index.vue (drawer chrome shared by every consolidation drawer) -->
<script setup lang="ts">
/**
 * Side drawer used by every Consolidation sub-page (Run consolidation, business
 * unit, consolidation account, elimination rule, role, group). Same Teleport
 * shell as BillsFiltersDrawer / TaxRatesPage — closes only via × or Cancel.
 */
import { MpButton, MpIcon } from '@mekari/pixel3'

withDefaults(defineProps<{ open: boolean; title: string; size?: 'md' | 'lg' }>(), { size: 'md' })
const emit = defineEmits<{ close: [] }>()
const { t } = useLocale()
</script>

<template>
  <Teleport to="body">
    <Transition name="cdr">
      <div v-if="open" class="cdr-overlay">
        <div class="cdr-panel" role="dialog" :aria-label="title" :class="`cdr-panel--${size}`">
          <header class="cdr-header">
            <span class="cdr-title">{{ title }}</span>
            <MpButton class="cdr-close" is-rounded :aria-label="t('Close')" @click="emit('close')">
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>
          <div class="cdr-body"><slot /></div>
          <footer class="cdr-footer">
            <div class="cdr-footer-left"><slot name="footer-left" /></div>
            <div class="cdr-footer-right"><slot name="footer" /></div>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.cdr-enter-active, .cdr-leave-active { transition: background-color 250ms ease; }
.cdr-enter-from, .cdr-leave-to { background-color: transparent; }
.cdr-enter-active .cdr-panel { transition: transform 350ms ease-out; }
.cdr-leave-active .cdr-panel { transition: transform 250ms ease-in; }
.cdr-enter-from .cdr-panel, .cdr-leave-to .cdr-panel { transform: translateX(calc(100% + 12px)); }
.cdr-overlay {
  position: fixed; inset: 0; z-index: 1300;
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
  display: flex; justify-content: flex-end;
}
.cdr-panel {
  margin: var(--mp-spacing-3);
  height: calc(100% - 24px);
  width: min(480px, calc(100% - 24px));
  display: flex; flex-direction: column;
  background: var(--mp-background-stage, #fff);
  border-radius: var(--mp-radii-xl, 12px);
  overflow: hidden;
}
.cdr-panel--lg { width: min(760px, calc(100% - 24px)); }
.cdr-header {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between;
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle);
  border-bottom: 1px solid var(--mp-border-default);
}
.cdr-title { font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cdr-close {
  display: inline-flex !important; align-items: center; justify-content: center;
  width: var(--mp-sizes-9, 36px) !important; height: var(--mp-sizes-9, 36px) !important; min-width: 0 !important;
  border: none !important; background: none !important; border-radius: var(--mp-radii-md);
  cursor: pointer; color: var(--mp-colors-icon-default);
}
.cdr-close:hover { background: var(--mp-background-neutral-hovered); }
.cdr-body {
  flex: 1; overflow-y: auto;
  display: flex; flex-direction: column; gap: var(--mp-spacing-5, 20px);
  padding: var(--mp-spacing-4);
}
.cdr-footer {
  flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}
.cdr-footer-left, .cdr-footer-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
</style>
