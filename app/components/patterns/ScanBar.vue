<script setup lang="ts">
import { ref } from 'vue'
import { css, MpIcon, MpInput, MpTooltip } from '@mekari/pixel3'
import { useLocale } from '~/composables/useLocale'

/**
 * WMS scan bar. `hint` is the live one-line guidance under the bar (what to scan
 * next, following the step's state); `tips` are the step's scan rules, shown in
 * the "How scanning works" tooltip on the info icon. Build both with
 * `scanGuidance()` from `~/data/scanGuidance` so every step reads the same way.
 */
const props = defineProps<{ placeholder?: string; hint?: string; tips?: string[] }>()
const emit = defineEmits<{ scan: [value: string] }>()
const { t } = useLocale()

const scanValue = ref('')
const tipId = `scan-bar-tips-${Math.random().toString(36).slice(2, 8)}`

function onEnter() {
  if (!scanValue.value) return
  emit('scan', scanValue.value)
  scanValue.value = ''
}

const rootClass = css({
  flexShrink: 0,
  marginBottom: '4',
})

const containerClass = css({
  display: 'flex',
  alignItems: 'center',
  gap: '3',
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

const infoClass = css({
  display: 'inline-flex',
  alignItems: 'center',
  flexShrink: 0,
  color: 'text.secondary',
  cursor: 'help',
  rounded: 'sm',
  _focusVisible: { outline: '2px solid token(colors.border.bold)', outlineOffset: '2px' },
})

const tipsClass = css({
  maxWidth: '320px',
  textAlign: 'left',
  '& p': { margin: '0 0 1', fontWeight: 'semiBold' },
  '& ul': { margin: '0', paddingLeft: '4', listStyle: 'disc outside' },
  '& li': { display: 'list-item' },
})

const hintClass = css({
  margin: '1 0 0',
  fontSize: 'sm',
  lineHeight: 'sm',
  color: 'text.secondary',
})
</script>

<template>
  <div class="scan-bar" :class="rootClass">
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
          :placeholder="placeholder ?? t('Scan barcode...')"
          :aria-describedby="props.hint ? `${tipId}-hint` : undefined"
          @keydown.enter.prevent="onEnter"
        />
      </div>
      <MpTooltip v-if="props.tips?.length" :id="tipId" placement="bottom-end" use-portal>
        <span
          class="scan-bar-info"
          :class="infoClass"
          tabindex="0"
          role="img"
          :aria-label="t('How scanning works')"
          data-devchange="wms-scan-guidance-tips"
        ><MpIcon name="info" size="sm" /></span>
        <template #label>
          <div :class="tipsClass">
            <p>{{ t('How scanning works') }}</p>
            <ul>
              <li v-for="tip in props.tips" :key="tip">{{ tip }}</li>
            </ul>
          </div>
        </template>
      </MpTooltip>
      <slot />
    </div>
    <p
      v-if="props.hint"
      :id="`${tipId}-hint`"
      class="scan-bar-hint"
      :class="hintClass"
      aria-live="polite"
      data-devchange="wms-scan-guidance-hint"
    >{{ props.hint }}</p>
  </div>
</template>
