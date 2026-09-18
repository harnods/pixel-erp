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
  return { width: px.value, height: px.value, backgroundColor: `hsl(${h} 55% 88%)`, color: `hsl(${h} 45% 32%)` }
})
</script>

<template>
  <span class="pt-thumb" :style="tileStyle">
    <span class="pt-initial">{{ initial }}</span>
    <img
      v-if="src"
      class="pt-img"
      :class="{ 'pt-img--on': loaded }"
      :src="src"
      :alt="name"
      loading="lazy"
      @load="loaded = true"
    />
  </span>
</template>

<style scoped>
.pt-thumb {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border-radius: var(--mp-radii-md, 8px);
  overflow: hidden;
  font-weight: 600;
  font-size: 15px;
  line-height: 1;
  user-select: none;
}
.pt-initial { position: relative; z-index: 0; }
.pt-img {
  position: absolute;
  inset: 0;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.pt-img--on { opacity: 1; }
</style>
