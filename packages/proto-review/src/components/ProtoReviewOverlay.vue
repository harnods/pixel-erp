<template>
  <div
    v-if="isReviewMode"
    class="pr-overlay"
    :class="{ 'pr-overlay--adding': isAddingMode }"
    @click="onOverlayClick"
  >
    <!-- Existing annotation pins -->
    <AnnotationPin
      v-for="(ann, i) in annotations"
      :key="ann.id"
      :annotation="ann"
      :index="i"
      :pins-visible="pinsVisible"
      :active="activeAnnotationId === ann.id"
      @click="openAnnotation(ann)"
      @move="(x, y) => updatePosition(ann.id, x, y)"
    />

    <!-- Temporary pending pin before form submit -->
    <div
      v-if="pendingPin"
      class="pr-pin-pending"
      :style="{ left: pendingPin.x + '%', top: pendingPin.y + '%' }"
    >
      +
    </div>

    <!-- New comment form -->
    <NewCommentForm
      v-if="pendingPin"
      :x="pendingPin.x"
      :y="pendingPin.y"
      :reviewer-name="reviewerName"
      @submit="handleNewComment"
      @cancel="cancelPending"
      @update:reviewer-name="setReviewerName"
    />

    <!-- Annotation detail popover -->
    <AnnotationPopover
      v-if="activeAnnotation"
      :annotation="activeAnnotation"
      :index="annotations.indexOf(activeAnnotation)"
      :reviewer-name="reviewerName"
      @close="closeAnnotation"
      @reply="handleReply"
      @toggle-resolved="handleToggleResolved"
      @delete="handleDelete"
    />

    <!-- Floating toolbar -->
    <ReviewToolbar
      :reviewer-name="reviewerName"
      :is-adding-mode="isAddingMode"
      :pins-visible="pinsVisible"
      :annotations-count="annotations.length"
      @toggle-add-mode="toggleAddMode"
      @toggle-pins="togglePins"
      @exit-review-mode="exitReviewMode"
      @set-name="setReviewerName"
      @show-all-comments="showAllComments = true"
    />

    <!-- Crosshair hint -->
    <div v-if="isAddingMode && reviewerName" class="pr-crosshair-hint">
      Click anywhere to add a comment
    </div>
  </div>

  <!-- Fallback launcher — lets any project turn on review mode with zero
       integration (no user menu, no ?review query param needed). Hidden once
       review mode is on (the toolbar above takes over), or if the host opted
       out via createProtoReview({ showLauncher: false }). -->
  <button
    v-else-if="showLauncher"
    class="pr-launcher"
    title="Turn on review mode"
    @click="enterReviewMode"
  >
    💬 Review
  </button>

  <!-- Cross-page comment inbox — pushes the app content left, lists every
       comment across every page, clicking one navigates there and opens it. -->
  <AllCommentsPanel
    v-if="showAllComments"
    @close="showAllComments = false"
    @select="handleSelectFromPanel"
  />
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useReviewMode } from '../composables/useReviewMode'
import { useAnnotations } from '../composables/useAnnotations'
import { showLauncher } from '../lib/launcherConfig'
import { focusAnnotationId } from '../lib/focusAnnotation'
import type { Annotation, PendingPin } from '../types'
import AnnotationPin from './AnnotationPin.vue'
import AnnotationPopover from './AnnotationPopover.vue'
import NewCommentForm from './NewCommentForm.vue'
import ReviewToolbar from './ReviewToolbar.vue'
import AllCommentsPanel from './AllCommentsPanel.vue'

const route = useRoute()
const router = useRouter()

const {
  isReviewMode,
  isAddingMode,
  pinsVisible,
  reviewerName,
  routeKey,
  initFromQuery,
  exitReviewMode,
  enterReviewMode,
  toggleAddMode,
  cancelAddMode,
  togglePins,
  setReviewerName,
} = useReviewMode()

const { annotations, addAnnotation, addReply, updatePosition, toggleResolved, deleteAnnotation } =
  useAnnotations(routeKey)

const pendingPin = ref<PendingPin | null>(null)
const activeAnnotationId = ref<string | null>(null)
const showAllComments = ref(false)

const activeAnnotation = computed(() =>
  activeAnnotationId.value
    ? annotations.value.find(a => a.id === activeAnnotationId.value) ?? null
    : null
)

onMounted(() => initFromQuery())

watch(() => route.query, () => initFromQuery())

// Once we've navigated to a comment's page (from the All comments panel),
// open its popover as soon as that page's annotations have loaded.
watch(annotations, (list) => {
  if (!focusAnnotationId.value) return
  if (list.some(a => a.id === focusAnnotationId.value)) {
    activeAnnotationId.value = focusAnnotationId.value
    pinsVisible.value = true
    focusAnnotationId.value = null
  }
})

function handleSelectFromPanel(ann: Annotation) {
  showAllComments.value = false
  const target = ann.path || ann.route_key
  if (target && target !== route.path) {
    focusAnnotationId.value = ann.id
    router.push(target)
  } else {
    activeAnnotationId.value = ann.id
    pinsVisible.value = true
  }
}

function onOverlayClick(e: MouseEvent) {
  if (!isAddingMode.value || !reviewerName.value) return

  const target = e.target as HTMLElement
  if (target.closest('.pr-popover, .pr-new-form, .pr-toolbar, .pr-pin')) return

  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  pendingPin.value = {
    x: ((e.clientX - rect.left) / rect.width) * 100,
    y: ((e.clientY - rect.top) / rect.height) * 100,
  }
  activeAnnotationId.value = null
}

function openAnnotation(ann: Annotation) {
  if (activeAnnotationId.value === ann.id) {
    activeAnnotationId.value = null
    return
  }
  activeAnnotationId.value = ann.id
  cancelPending()
}

function closeAnnotation() {
  activeAnnotationId.value = null
}

function cancelPending() {
  pendingPin.value = null
}

async function handleNewComment(author: string, body: string) {
  if (!pendingPin.value) return
  const ann = await addAnnotation({
    xPct: pendingPin.value.x,
    yPct: pendingPin.value.y,
    author,
    body,
    path: route.path,
  })
  pendingPin.value = null
  cancelAddMode()
  if (ann) activeAnnotationId.value = ann.id
}

async function handleReply(annotationId: string, author: string, body: string) {
  await addReply(annotationId, author, body)
}

async function handleToggleResolved(annotationId: string) {
  await toggleResolved(annotationId)
}

async function handleDelete(annotationId: string) {
  await deleteAnnotation(annotationId)
  activeAnnotationId.value = null
}
</script>

<style scoped>
.pr-overlay {
  position: fixed;
  inset: 0;
  z-index: 9990;
  pointer-events: none;
}

.pr-overlay--adding {
  cursor: crosshair;
  pointer-events: all;
}

.pr-pin-pending {
  position: absolute;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #f5a623;
  color: #fff;
  font-size: 18px;
  font-weight: 300;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
  transform: translate(-50%, -50%);
  pointer-events: none;
  animation: pr-pulse 1s ease-in-out infinite;
}

.pr-crosshair-hint {
  position: fixed;
  bottom: 100px;
  left: 50%;
  transform: translateX(-50%);
  background: rgba(0, 0, 0, 0.72);
  color: #fff;
  font-size: 12px;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  padding: 6px 14px;
  border-radius: 20px;
  pointer-events: none;
  white-space: nowrap;
}

@keyframes pr-pulse {
  0%, 100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  50% { opacity: 0.7; transform: translate(-50%, -50%) scale(1.1); }
}

.pr-launcher {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9990;
  background: #1a1a1a;
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  padding: 9px 16px;
  border-radius: 24px;
  border: none;
  cursor: pointer;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
  transition: transform 0.15s, box-shadow 0.15s;
}
.pr-launcher:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
}
</style>
