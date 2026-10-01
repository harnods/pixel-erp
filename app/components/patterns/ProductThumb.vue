<script setup lang="ts">
/**
 * Product thumbnail with a guaranteed-visible fallback. Product photos in the
 * catalog are external URLs that can fail (dead CDN, blocked hotlink, offline,
 * strict CSP). We always render a colored tile from the catalog item's `hue` with
 * the product's initial as the BASE layer, and overlay the photo on top — the
 * photo is only revealed once it actually loads. So a broken or slow image simply
 * leaves the colored initial tile visible; a working one covers it. No timing or
 * error-detection needed.
 */
import { ref, computed, watch } from 'vue'
import { css } from '@mekari/pixel3'

const props = defineProps<{
  src?: string
  name: string
  /** 0–360 hue from the catalog item; drives the placeholder color. */
  hue?: number
  /** Square size in px. */
  size?: number
}>()

const loaded = ref(false)
// Reset when the source changes (e.g. list virtualization reuse).
watch(() => props.src, () => { loaded.value = false })

const initial = computed(() => (props.name?.trim()?.charAt(0) || '?').toUpperCase())
const px = computed(() => `${props.size ?? 40}px`)
const tileStyle = computed(() => {
  const h = props.hue ?? 210
  // hsl() colors are dynamic per-product — kept as inline styles
  return { width: px.value, height: px.value, backgroundColor: `hsl(${h} 55% 88%)`, color: `hsl(${h} 45% 32%)` }
})

const thumbClass = css({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  flexShrink: '0',
  rounded: 'md',
  overflow: 'hidden',
  fontWeight: 'semiBold',
  fontSize: 'md',
  lineHeight: '1',
  userSelect: 'none',
})

const initialClass = css({
  position: 'relative',
  zIndex: '0',
})

const imgBaseClass = css({
  position: 'absolute',
  inset: '0',
  zIndex: '1',
  width: 'full',
  height: 'full',
  objectFit: 'cover',
  opacity: '0',
  transition: 'opacity 0.15s ease',
})

const imgOnClass = css({
  opacity: '1',
})
</script>

<template>
  <span :class="thumbClass" :style="tileStyle">
    <span :class="initialClass">{{ initial }}</span>
    <img
      v-if="src"
      :class="[imgBaseClass, { [imgOnClass]: loaded }]"
      :src="src"
      :alt="name"
      loading="lazy"
      @load="loaded = true"
    />
  </span>
</template>
