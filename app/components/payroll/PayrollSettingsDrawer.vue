<script setup lang="ts">
/**
 * Side panel shell for the payroll settings editors (rule/drawer-custom-shell:
 * a Teleport overlay, not MpDrawer). The head stays put and the body scrolls;
 * the footer slot holds the actions.
 */
import { MpButton, MpIcon } from '@mekari/pixel3'

withDefaults(defineProps<{ isOpen: boolean; title: string; sub?: string; wide?: boolean }>(), { sub: '', wide: false })
const emit = defineEmits<{ (e: 'close'): void }>()
const { t } = useLocale()
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="psd-overlay" @click.self="emit('close')">
      <aside class="psd-panel" :class="{ 'psd-panel--wide': wide }" role="dialog" :aria-label="title">
        <header class="psd-head">
          <div class="psd-headtext">
            <div class="psd-title">{{ title }}</div>
            <div v-if="sub" class="psd-sub">{{ sub }}</div>
          </div>
          <MpButton class="psd-close" variant="ghost" is-rounded :aria-label="t('Close')" @click="emit('close')">
            <MpIcon name="close" size="sm" />
          </MpButton>
        </header>
        <div class="psd-body">
          <slot />
        </div>
        <footer v-if="$slots.footer" class="psd-foot">
          <slot name="footer" />
        </footer>
      </aside>
    </div>
  </Teleport>
</template>

<style scoped>
/* 1300 matches BillsFiltersDrawer: the app header is 1100. */
.psd-overlay { position: fixed; inset: 0; background: var(--mp-colors-background-overlay); z-index: 1300; }
.psd-panel {
  position: absolute; top: 0; right: 0; bottom: 0; width: 480px; max-width: 92vw;
  background: var(--mp-background-neutral); display: flex; flex-direction: column;
  border-left: 1px solid var(--mp-border-default); overflow: hidden;
}
.psd-panel--wide { width: 640px; }
.psd-head {
  display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3);
  padding: var(--mp-spacing-4) var(--mp-spacing-6); flex: none;
  background: var(--mp-background-neutral-subtle); border-bottom: 1px solid var(--mp-border-default);
}
.psd-headtext { min-width: 0; }
.psd-title { font-size: var(--mp-font-sizes-lg); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.psd-sub { font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); margin-top: var(--mp-spacing-1); }
.psd-close { flex: none; }
.psd-body { flex: 1; min-height: 0; overflow: auto; padding: var(--mp-spacing-4) var(--mp-spacing-6); display: flex; flex-direction: column; gap: var(--mp-spacing-4); }
.psd-foot {
  flex: none; display: flex; justify-content: flex-end; gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-6); border-top: 1px solid var(--mp-border-default);
}
</style>
