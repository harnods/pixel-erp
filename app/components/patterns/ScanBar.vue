<script setup lang="ts">
import { ref } from 'vue'
import { css, MpInput } from '@mekari/pixel3'

defineProps<{ placeholder?: string }>()
const emit = defineEmits<{ scan: [value: string] }>()

const scanValue = ref('')

function onEnter() {
  if (!scanValue.value) return
  emit('scan', scanValue.value)
  scanValue.value = ''
}

const containerClass = css({
  display: 'flex',
  alignItems: 'center',
  gap: '3',
  marginBottom: '4',
  paddingX: '4',
  paddingY: '2.5',
  bg: 'background.default',
  border: '1.5px dashed token(colors.border.default)',
  rounded: 'lg',
  _focusWithin: {
    borderColor: 'border.bold',
  },
})

const iconClass = css({
  flexShrink: 0,
  color: 'text.secondary',
})

const inputWrapClass = css({
  flex: '1',
  '& input': {
    border: 'none !important',
    outline: 'none !important',
    bg: 'transparent !important',
    boxShadow: 'none !important',
    padding: '0 !important',
    height: 'auto !important',
    fontSize: 'md',
    color: 'text.default',
  },
})
</script>

<template>
  <div :class="containerClass">
    <svg :class="iconClass" width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="7" y1="8" x2="7" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="10.5" y1="8" x2="10.5" y2="16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      <line x1="14" y1="8" x2="14" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="17" y1="8" x2="17" y2="16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    </svg>
    <div :class="inputWrapClass">
      <MpInput
        id="scan-bar-input"
        v-model="scanValue"
        class="scan-bar-input"
        type="text"
        is-full-width
        :placeholder="placeholder ?? 'Scan barcode...'"
        @keydown.enter.prevent="onEnter"
      />
    </div>
    <slot />
  </div>
</template>
