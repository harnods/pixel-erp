<template>
  <button
    v-if="pinsVisible"
    class="pr-pin"
    :class="{ 'pr-pin--active': active, 'pr-pin--dragging': isDragging }"
    :style="{
      left: displayX + 'px',
      top: displayY + 'px',
      background: authorColor,
    }"
    :title="annotation.author + ': ' + annotation.body"
    @pointerdown="onPointerDown"
  >
    {{ index + 1 }}
    <span v-if="annotation.resolved" class="pr-pin__resolved-badge">✓</span>
    <span v-if="annotation.replies.length" class="pr-pin__reply-count">
      {{ annotation.replies.length }}
    </span>
  </button>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import type { Annotation } from '../types'
import { getAuthorColor } from '../lib/authorColor'

const props = defineProps<{
  annotation: Annotation
  index: number
  /** Viewport pixel position, resolved by the overlay (element anchor or fallback). */
  x: number
  y: number
  pinsVisible: boolean
  active: boolean
}>()

const emit = defineEmits<{
  click: []
  /** Drop position in viewport pixels — the overlay re-anchors from here. */
  move: [clientX: number, clientY: number]
}>()

const authorColor = computed(() => getAuthorColor(props.annotation.author))

const DRAG_THRESHOLD_PX = 4

const isDragging = ref(false)
const dragPos = ref<{ x: number; y: number } | null>(null)

const displayX = computed(() => dragPos.value?.x ?? props.x)
const displayY = computed(() => dragPos.value?.y ?? props.y)

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

let startClientX = 0
let startClientY = 0

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  e.stopPropagation()

  startClientX = e.clientX
  startClientY = e.clientY
  isDragging.value = false

  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
}

function onPointerMove(e: PointerEvent) {
  const dx = e.clientX - startClientX
  const dy = e.clientY - startClientY

  if (!isDragging.value && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return
  isDragging.value = true

  dragPos.value = {
    x: clamp(e.clientX, 0, window.innerWidth),
    y: clamp(e.clientY, 0, window.innerHeight),
  }
}

function onPointerUp() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)

  if (isDragging.value && dragPos.value) {
    emit('move', dragPos.value.x, dragPos.value.y)
  } else {
    emit('click')
  }

  isDragging.value = false
  dragPos.value = null
}
</script>

<style scoped>
.pr-pin {
  position: fixed;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
  cursor: grab;
  transform: translate(-50%, -50%);
  pointer-events: all;
  transition: box-shadow 0.15s;
  touch-action: none;
  z-index: 1;
}

.pr-pin:hover,
.pr-pin--active {
  transform: translate(-50%, -50%) scale(1.2);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
}

.pr-pin--dragging {
  cursor: grabbing;
  transform: translate(-50%, -50%) scale(1.15);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.35);
  transition: none;
}

.pr-pin__resolved-badge {
  position: absolute;
  bottom: -6px;
  left: -6px;
  width: 15px;
  height: 15px;
  border-radius: 50%;
  background: #16a34a;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1.5px solid #fff;
}

.pr-pin__reply-count {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  background: #1a1a1a;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
  border: 1.5px solid #fff;
}
</style>
