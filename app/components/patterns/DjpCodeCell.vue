<script setup lang="ts">
/**
 * DjpCodeCell — Products index DJP code cell (Figma node 8554-241863).
 * Clamps the code+description label to 2 lines; when it overflows, shows a
 * "View details" link that opens DjpCodePopover with the full text. Overflow
 * detection mirrors ClampText.vue (ResizeObserver + scrollHeight/clientHeight).
 */
import { css } from '@mekari/pixel3'
import DjpCodePopover from '~/components/patterns/DjpCodePopover.vue'

const props = defineProps<{
  id: string
  title: string
  text: string
}>()

const bodyEl = ref<HTMLElement | null>(null)
const overflowing = ref(false)
let resizeObserver: ResizeObserver | null = null

function measure() {
  const el = bodyEl.value
  if (!el) return
  overflowing.value = el.scrollHeight - el.clientHeight > 1
}
onMounted(() => {
  measure()
  resizeObserver = new ResizeObserver(() => measure())
  if (bodyEl.value) resizeObserver.observe(bodyEl.value)
})
onUnmounted(() => { resizeObserver?.disconnect(); resizeObserver = null })
watch(() => props.text, () => nextTick(measure))

const cellClass = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  minWidth: '0',
})

const bodyClass = css({
  whiteSpace: 'normal',
  overflowWrap: 'anywhere',
})
</script>

<template>
  <span :class="cellClass">
    <span ref="bodyEl" :class="[bodyClass, 'djp-cell__body--clamped']">{{ text }}</span>
    <DjpCodePopover v-if="overflowing" :id="id" :title="title" :description="text" />
  </span>
</template>

<style scoped>
/* -webkit-line-clamp cannot be expressed via css() — kept in a style block */
.djp-cell__body--clamped {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
