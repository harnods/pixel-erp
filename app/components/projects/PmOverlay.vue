<script setup lang="ts">
/**
 * Custom Teleport overlay for the Projects module — right-side drawer or
 * centered modal. MpDrawer / MpModal render without structural CSS in this
 * Pixel build (see ConfirmModal.vue), so the module ships its own shell.
 */
const props = withDefaults(defineProps<{
  open: boolean
  title: string
  subtitle?: string
  variant?: 'drawer' | 'modal'
  wide?: boolean
}>(), { subtitle: '', variant: 'drawer', wide: false })
const emit = defineEmits<{ (e: 'close'): void }>()

function onKey(e: KeyboardEvent) { if (e.key === 'Escape' && props.open) emit('close') }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <Teleport to="body">
    <Transition name="pm-fade">
      <div v-if="open" class="pm-overlay" :class="variant === 'drawer' ? 'pm-overlay--drawer' : 'pm-overlay--modal'" @mousedown.self="emit('close')">
        <div
          :class="[variant === 'drawer' ? 'pm-drawer' : 'pm-modal', wide && (variant === 'drawer' ? 'pm-drawer--wide' : 'pm-modal--wide')]"
          role="dialog" aria-modal="true" :aria-label="title"
        >
          <header class="pm-ov-head">
            <div>
              <h2 class="pm-ov-title">{{ title }}</h2>
              <div v-if="subtitle" class="pm-ov-sub">{{ subtitle }}</div>
            </div>
            <button class="pm-icon-btn" type="button" aria-label="Close" @click="emit('close')">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" /></svg>
            </button>
          </header>
          <div class="pm-ov-body">
            <slot />
          </div>
          <footer v-if="$slots.footer" class="pm-ov-foot">
            <slot name="footer" />
          </footer>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>
