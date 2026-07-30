<script setup lang="ts">
/**
 * DjpCodeCell — Products index DJP code cell (Figma node 8554-241863).
 * Clamps the code+description label to 2 lines; when it overflows, shows a
 * "View details" link that opens DjpCodePopover with the full text. Overflow
 * detection mirrors ClampText.vue (ResizeObserver + scrollHeight/clientHeight).
 */
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
</script>

<template>
  <span class="djp-cell">
    <span ref="bodyEl" class="djp-cell__body">{{ text }}</span>
    <DjpCodePopover v-if="overflowing" :id="id" :title="title" :description="text" />
  </span>
</template>

<style scoped>
.djp-cell { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; }
.djp-cell__body {
  white-space: normal;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
