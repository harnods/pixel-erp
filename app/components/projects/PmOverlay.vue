<script setup lang="ts">
/**
 * Projects overlay — one API for the module's two overlay kinds:
 *   • variant="drawer" → the custom Teleport shell (rule/drawer-custom-shell, copied
 *     from BillsFiltersDrawer). The overlay is only a backdrop: no click-to-close and
 *     no Esc listener — close is × or an explicit footer action
 *     (rule/modal-drawer-close-explicit-only).
 *   • variant="modal" → Pixel MpModal (rule/modal-use-mpmodal) with Esc and overlay
 *     dismissal switched off.
 * Footer actions go in the `footer` slot and are laid out as the responsive
 * action footer (rule/btn-responsive-footer).
 */
import {
  MpButton, MpButtonGroup, MpIcon, MpModal, MpModalContent, MpModalHeader, MpModalBody,
  MpModalFooter, MpModalCloseButton, MpModalOverlay,
} from '@mekari/pixel3'

withDefaults(defineProps<{
  open: boolean
  title: string
  subtitle?: string
  variant?: 'drawer' | 'modal'
  wide?: boolean
  id?: string
}>(), { subtitle: '', variant: 'drawer', wide: false, id: 'pm-overlay' })
const emit = defineEmits<{ (e: 'close'): void }>()
</script>

<template>
  <MpModal
    v-if="variant === 'modal'" :id="id" :is-open="open" :size="wide ? 'lg' : 'md'" :is-keep-alive="false"
    :is-close-on-esc="false" :is-close-on-overlay-click="false" @close="emit('close')"
  >
    <MpModalContent>
      <MpModalHeader>
        <div>
          <div>{{ title }}</div>
          <div v-if="subtitle" class="pm-caption">{{ subtitle }}</div>
        </div>
        <MpModalCloseButton />
      </MpModalHeader>
      <MpModalBody>
        <div class="pm-modal-body"><slot /></div>
      </MpModalBody>
      <MpModalFooter v-if="$slots.footer">
        <MpButtonGroup class="erp-action-footer"><slot name="footer" /></MpButtonGroup>
      </MpModalFooter>
    </MpModalContent>
    <MpModalOverlay />
  </MpModal>

  <Teleport v-else to="body">
    <Transition name="pm-drawer">
      <div v-if="open" class="pm-drawer-overlay">
        <div class="pm-drawer-panel" :class="{ 'pm-drawer-panel--wide': wide }" role="dialog" aria-modal="true" :aria-label="title">
          <header class="pm-drawer-header">
            <div>
              <h2 class="pm-drawer-title">{{ title }}</h2>
              <div v-if="subtitle" class="pm-drawer-sub">{{ subtitle }}</div>
            </div>
            <MpButton variant="ghost" is-rounded aria-label="Close" @click="emit('close')" left-icon="close" />
          </header>
          <div class="pm-drawer-body"><slot /></div>
          <footer v-if="$slots.footer" class="pm-drawer-footer">
            <MpButtonGroup class="erp-action-footer"><slot name="footer" /></MpButtonGroup>
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
