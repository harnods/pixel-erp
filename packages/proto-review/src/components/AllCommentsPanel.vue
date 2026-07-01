<template>
  <Teleport to="body">
    <div class="pr-panel" data-pr-exempt @click.stop @mousedown.stop>
      <div class="pr-panel__header">
        <div>
          <h2 class="pr-panel__title">All comments</h2>
          <p class="pr-panel__subtitle">
            {{ annotations.length }} comment{{ annotations.length === 1 ? '' : 's' }} across every page
          </p>
        </div>
        <button class="pr-panel__close" title="Close" @click="$emit('close')">✕</button>
      </div>

      <div v-if="loading" class="pr-panel__empty">Loading...</div>
      <div v-else-if="!annotations.length" class="pr-panel__empty">
        No comments yet. Click "Add Comment" on any page to leave the first one.
      </div>

      <div v-else class="pr-panel__list">
        <button
          v-for="ann in annotations"
          :key="ann.id"
          class="pr-item"
          @click="$emit('select', ann)"
        >
          <div class="pr-item__top">
            <span class="pr-dot" :style="{ background: getAuthorColor(ann.author) }" />
            <strong class="pr-item__author">{{ ann.author }}</strong>
            <span class="pr-item__time">{{ formatTime(ann.created_at) }}</span>
          </div>
          <p class="pr-item__body">{{ ann.body }}</p>
          <div class="pr-item__meta">
            <span class="pr-item__page">{{ ann.path || ann.route_key }}</span>
            <span v-if="ann.resolved" class="pr-item__resolved">✓ Resolved</span>
            <span v-if="ann.replies.length" class="pr-item__replies">
              {{ ann.replies.length }} repl{{ ann.replies.length === 1 ? 'y' : 'ies' }}
            </span>
          </div>
        </button>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { Annotation } from '../types'
import { fetchAllAnnotations } from '../composables/useAnnotations'
import { getAuthorColor } from '../lib/authorColor'
import { pushBody, unpushBody } from '../lib/pushWrapper'

const PANEL_WIDTH = 300

defineEmits<{
  close: []
  select: [annotation: Annotation]
}>()

const annotations = ref<Annotation[]>([])
const loading = ref(true)

function formatTime(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  )
}

onMounted(async () => {
  pushBody(PANEL_WIDTH)
  annotations.value = await fetchAllAnnotations()
  loading.value = false
})

onUnmounted(() => {
  unpushBody()
})
</script>

<style scoped>
.pr-panel {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: 300px;
  background: #0a0a0a;
  border-left: 1px solid #2a2a2a;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.35);
  z-index: 9995;
  display: flex;
  flex-direction: column;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  color: #f5f5f5;
  animation: pr-slide-in 0.25s ease;
}

@keyframes pr-slide-in {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.pr-panel__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  padding: 16px 16px 12px;
  border-bottom: 1px solid #232323;
}

.pr-panel__title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: #f5f5f5;
}

.pr-panel__subtitle {
  margin: 2px 0 0;
  font-size: 11px;
  color: #8a8a8a;
}

.pr-panel__close {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: #8a8a8a;
  padding: 2px 4px;
  border-radius: 4px;
  line-height: 1;
}
.pr-panel__close:hover { background: #1f1f1f; color: #f5f5f5; }

.pr-panel__empty {
  padding: 28px 16px;
  text-align: center;
  font-size: 12px;
  color: #8a8a8a;
  line-height: 1.5;
}

.pr-panel__list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.pr-item {
  display: block;
  width: 100%;
  text-align: left;
  background: none;
  border: none;
  border-bottom: 1px solid #1f1f1f;
  padding: 11px 16px;
  cursor: pointer;
  font-family: inherit;
}
.pr-item:hover { background: #161616; }

.pr-item__top {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.pr-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pr-item__author {
  font-size: 12px;
  font-weight: 600;
  color: #f5f5f5;
}

.pr-item__time {
  font-size: 10px;
  color: #6e6e6e;
  margin-left: auto;
}

.pr-item__body {
  margin: 0 0 6px;
  font-size: 12px;
  line-height: 1.45;
  color: #c9c9c9;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.pr-item__meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.pr-item__page {
  font-size: 10px;
  font-family: ui-monospace, monospace;
  color: #a0a0a0;
  background: #1f1f1f;
  padding: 1px 6px;
  border-radius: 4px;
}

.pr-item__resolved {
  font-size: 10px;
  font-weight: 600;
  color: #5ecc62;
}

.pr-item__replies {
  font-size: 10px;
  color: #6e6e6e;
}
</style>
