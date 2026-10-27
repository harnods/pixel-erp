<script setup lang="ts">
/**
 * ClampText — wraps text clamped to N lines (default 2) with an ellipsis. When the
 * text overflows the clamp, a "View more" link expands it in place; "View less"
 * collapses. Overflow is detected the same way as ErpTagList (ResizeObserver +
 * scrollHeight vs clientHeight), so the toggle only appears when it's actually needed.
 */
import { css } from '@mekari/pixel3'

const props = withDefaults(defineProps<{ text?: string; lines?: number }>(), { lines: 2 })

const bodyEl = ref<HTMLElement | null>(null)
const overflowing = ref(false)
const expanded = ref(false)
let resizeObserver: ResizeObserver | null = null

function measure() {
  const el = bodyEl.value
  if (!el || expanded.value) return // only meaningful while clamped
  overflowing.value = el.scrollHeight - el.clientHeight > 1
}
onMounted(() => {
  measure()
  resizeObserver = new ResizeObserver(() => measure())
  if (bodyEl.value) resizeObserver.observe(bodyEl.value)
})
onUnmounted(() => { resizeObserver?.disconnect(); resizeObserver = null })
watch(() => props.text, () => { expanded.value = false; nextTick(measure) })

function toggle(e: MouseEvent) {
  e.stopPropagation() // never trigger a row-level accordion toggle
  expanded.value = !expanded.value
  if (!expanded.value) nextTick(measure)
}

const rootClass = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  minWidth: '0',
})

const bodyClass = css({
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
})

const toggleClass = css({
  marginTop: '0.5',
  color: 'text.link',
  fontSize: 'sm',
  lineHeight: '1',
  cursor: 'pointer',
  _hover: {
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
  },
})
</script>

<template>
  <span v-if="text" :class="rootClass">
    <span
      ref="bodyEl"
      :class="[bodyClass, { 'clamp-text__body--clamped': !expanded }]"
      :style="{ '--clamp-lines': lines }"
    >{{ text }}</span>
    <a v-if="overflowing || expanded" :class="toggleClass" @click.prevent="toggle">
      {{ expanded ? 'View less' : 'View more' }}
    </a>
  </span>
</template>

<style scoped>
/* -webkit-line-clamp cannot be expressed via css() — kept in a style block */
.clamp-text__body--clamped {
  display: -webkit-box;
  -webkit-line-clamp: var(--clamp-lines, 2);
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
