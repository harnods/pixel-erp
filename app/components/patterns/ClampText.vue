<script setup lang="ts">
/**
 * ClampText — wraps text clamped to N lines (default 2) with an ellipsis. When the
 * text overflows the clamp, a "View more" link expands it in place; "View less"
 * collapses. Overflow is detected the same way as ErpTagList (ResizeObserver +
 * scrollHeight vs clientHeight), so the toggle only appears when it's actually needed.
 */
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
</script>

<template>
  <span v-if="text" class="clamp-text">
    <span
      ref="bodyEl"
      class="clamp-text__body"
      :class="{ 'clamp-text__body--clamped': !expanded }"
      :style="{ '--clamp-lines': lines }"
    >{{ text }}</span>
    <a v-if="overflowing || expanded" class="clamp-text__toggle" @click.prevent="toggle">
      {{ expanded ? 'View less' : 'View more' }}
    </a>
  </span>
</template>

<style scoped>
.clamp-text { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
.clamp-text__body { white-space: normal; overflow-wrap: anywhere; }
.clamp-text__body--clamped {
  display: -webkit-box;
  -webkit-line-clamp: var(--clamp-lines, 2);
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.clamp-text__toggle {
  margin-top: var(--mp-spacing-0\.5);
  color: var(--mp-text-link);
  font-size: var(--mp-font-sizes-sm);
  line-height: 1;
  cursor: pointer;
}
.clamp-text__toggle:hover { text-decoration: underline; text-underline-offset: 2px; }
</style>
