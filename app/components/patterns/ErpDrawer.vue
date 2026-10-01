<script setup lang="ts">
/**
 * ErpDrawer — shared overlay drawer shell wrapping MpDrawer's structural pattern.
 *
 * MpDrawer has no structural CSS in this Pixel3 build (header/footer detach to
 * viewport edges, body renders as a bare floating card). This component provides
 * the correct structural shell used by all ~38 drawers in the ERP — a single
 * place to update when MpDrawer gets fixed.
 *
 * Usage:
 *   <ErpDrawer :is-open="open" title="All filters" width="420px" @close="open = false">
 *     <template #body>…scrollable content…</template>
 *     <template #footer>…action buttons…</template>
 *   </ErpDrawer>
 */
import { MpButton, MpIcon, css } from '@mekari/pixel3'

const props = withDefaults(defineProps<{
  isOpen: boolean
  title: string
  /** Panel max-width — applied as min(<width>, calc(100% - 24px)). Default 420px. */
  width?: string
  /** aria-label override; defaults to title. */
  ariaLabel?: string
}>(), {
  width: '420px',
})

const emit = defineEmits<{ close: [] }>()

const panelClass = computed(() =>
  css({
    margin: '3',
    width: `min(${props.width}, calc(100% - 24px))`,
    height: 'calc(100% - 24px)',
    display: 'flex',
    flexDirection: 'column',
    bg: 'background.stage',
    rounded: 'xl',
    overflow: 'hidden',
  }),
)

const overlayClass = css({
  position: 'fixed',
  inset: '0',
  zIndex: 'modal',
  display: 'flex',
  justifyContent: 'flex-end',
})

const headerClass = css({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  paddingX: '4',
  paddingY: '3',
  bg: 'background.neutral.subtle',
  borderBottom: '1px solid token(colors.border.default)',
})

const titleClass = css({
  fontSize: 'md',
  fontWeight: 'semiBold',
  color: 'text.default',
})

const bodyClass = css({
  flex: '1',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '5',
  padding: '4',
})

const footerClass = css({
  flexShrink: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '2',
  paddingX: '4',
  paddingY: '3',
  borderTop: '1px solid token(colors.border.default)',
})

</script>

<template>
  <Teleport to="body">
    <Transition name="erp-drawer">
      <div
        v-if="isOpen"
        class="erp-drawer-overlay"
        :class="overlayClass"
      >
        <div :class="panelClass" role="dialog" :aria-label="ariaLabel ?? title">
          <header :class="headerClass">
            <span :class="titleClass">
              <slot name="title">{{ title }}</slot>
            </span>
            <MpButton
              variant="ghost"
              size="sm"
              aria-label="Close"
              :class="css({ minWidth: '0!', width: '9!', height: '9!', padding: '0!' })"
              @click="emit('close')"
            >
              <MpIcon name="close" size="md" />
            </MpButton>
          </header>

          <div :class="bodyClass">
            <slot name="body" />
          </div>

          <footer v-if="$slots.footer" :class="footerClass">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style>
.erp-drawer-overlay {
  background: var(--mp-colors-overlay, rgba(8, 13, 14, 0.45));
}

.erp-drawer-enter-active { transition: background-color 250ms ease; }
.erp-drawer-leave-active { transition: background-color 250ms ease; }
.erp-drawer-enter-from, .erp-drawer-leave-to { background-color: transparent !important; }

.erp-drawer-enter-active [role="dialog"] { transition: transform 350ms ease-out; }
.erp-drawer-leave-active [role="dialog"] { transition: transform 250ms ease-in; }
.erp-drawer-enter-from [role="dialog"],
.erp-drawer-leave-to [role="dialog"] { transform: translateX(calc(100% + 12px)); }
</style>
