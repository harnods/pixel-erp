<template>
  <div
    v-if="isReviewMode"
    class="pr-overlay"
    :class="{ 'pr-overlay--adding': isAddingMode }"
    @click="onOverlayClick"
  >
    <!-- Existing annotation pins -->
    <AnnotationPin
      v-for="p in positionedAnnotations"
      :key="p.ann.id"
      :annotation="p.ann"
      :index="p.index"
      :x="p.x"
      :y="p.y"
      :pins-visible="pinsVisible"
      :active="activeAnnotationId === p.ann.id"
      @click="openAnnotation(p.ann)"
      @move="(cx, cy) => handlePinMove(p.ann, cx, cy)"
    />

    <!-- Temporary pending pin before form submit -->
    <div
      v-if="pendingPin && pendingPoint"
      class="pr-pin-pending"
      :style="{ left: pendingPoint.x + 'px', top: pendingPoint.y + 'px', background: authorColor }"
    >
      +
    </div>

    <!-- New comment form -->
    <NewCommentForm
      v-if="pendingPin && pendingPoint"
      :x="pendingPoint.x"
      :y="pendingPoint.y"
      :reviewer-name="reviewerName"
      @submit="handleNewComment"
      @cancel="cancelPending"
      @update:reviewer-name="setReviewerName"
    />

    <!-- Annotation detail popover -->
    <AnnotationPopover
      v-if="activeAnnotation && activePoint"
      :annotation="activeAnnotation"
      :index="annotations.indexOf(activeAnnotation)"
      :x="activePoint.x"
      :y="activePoint.y"
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
      :hidden-count="hiddenAnnotationsCount"
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
    :class="{ 'pr-launcher--left': cornerPosition === 'bottom-left' }"
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
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useReviewMode } from '../composables/useReviewMode'
import { useAnnotations } from '../composables/useAnnotations'
import { showLauncher, cornerPosition } from '../lib/launcherConfig'
import { focusAnnotationId } from '../lib/focusAnnotation'
import { anchorFromPoint, pointFromAnchor } from '../lib/anchor'
import { getAuthorColor } from '../lib/authorColor'
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
  viewPath,
  initFromQuery,
  exitReviewMode,
  enterReviewMode,
  toggleAddMode,
  cancelAddMode,
  togglePins,
  hideResolved,
  setReviewerName,
} = useReviewMode()

const { annotations, addAnnotation, addReply, updatePosition, toggleResolved, deleteAnnotation } =
  useAnnotations(routeKey)

// Pending pin uses the reviewer's own color, matching the pin it becomes.
const authorColor = computed(() => getAuthorColor(reviewerName.value))

const pendingPin = ref<PendingPin | null>(null)
const activeAnnotationId = ref<string | null>(null)
const showAllComments = ref(false)

const activeAnnotation = computed(() =>
  activeAnnotationId.value
    ? annotations.value.find(a => a.id === activeAnnotationId.value) ?? null
    : null
)

// ── Position tracking ────────────────────────────────────────────────────
// Pins are anchored to DOM elements, so their on-screen position changes as
// the page scrolls or resizes. `layoutTick` invalidates the position
// computeds on those events (rAF-throttled), which re-resolves each anchor
// against the element's current bounding rect.
const layoutTick = ref(0)
let rafId: number | null = null
function bumpLayout() {
  if (rafId !== null) return
  rafId = requestAnimationFrame(() => {
    rafId = null
    layoutTick.value++
  })
}

let resizeObserver: ResizeObserver | null = null
let intervalId: ReturnType<typeof setInterval> | null = null

// Press "c" to start dropping a comment (like Figma). Ignored while typing
// in a field, holding a modifier (so browser/app shortcuts still work), or
// when review mode is off.
function onKeydown(e: KeyboardEvent) {
  if (!isReviewMode.value) return
  if (e.key !== 'c' && e.key !== 'C') return
  if (e.metaKey || e.ctrlKey || e.altKey) return
  const el = e.target as HTMLElement | null
  if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return
  e.preventDefault()
  if (!isAddingMode.value) toggleAddMode()
}

onMounted(() => {
  initFromQuery()
  // capture: true also catches scrolls of inner scrollable containers
  window.addEventListener('scroll', bumpLayout, { capture: true, passive: true })
  window.addEventListener('resize', bumpLayout)
  window.addEventListener('keydown', onKeydown)
  // Reflows that fire no scroll/resize event (async data landing, fonts,
  // images) still move anchor elements — a body ResizeObserver catches most
  // of those, and a slow interval sweeps up anything that changes layout
  // without changing the body's size. Recomputing a handful of rects is cheap.
  resizeObserver = new ResizeObserver(bumpLayout)
  resizeObserver.observe(document.body)
  intervalId = setInterval(bumpLayout, 500)
})

onUnmounted(() => {
  window.removeEventListener('scroll', bumpLayout, { capture: true })
  window.removeEventListener('resize', bumpLayout)
  window.removeEventListener('keydown', onKeydown)
  resizeObserver?.disconnect()
  if (intervalId !== null) clearInterval(intervalId)
  if (rafId !== null) cancelAnimationFrame(rafId)
})

/** Current viewport position of an annotation: element anchor first, else
 *  the stored viewport percentages (legacy rows with no anchor recorded).
 *  Returns null when the annotation *has* an anchor but its element isn't
 *  in the DOM right now — e.g. it lives inside a drawer/modal that's
 *  currently closed and unmounted. In that case we don't know where it
 *  really belongs, so we hide the pin rather than show it in the wrong
 *  spot (falling back to the raw viewport % would land it on whatever
 *  page content happens to sit under that pixel, e.g. the index page). */
function resolvePoint(ann: Annotation): { x: number; y: number } | null {
  if (ann.anchor_selector && ann.anchor_x_pct != null && ann.anchor_y_pct != null) {
    return pointFromAnchor({
      selector: ann.anchor_selector,
      xPct: ann.anchor_x_pct,
      yPct: ann.anchor_y_pct,
    })
  }
  return {
    x: (ann.x_pct / 100) * window.innerWidth,
    y: (ann.y_pct / 100) * window.innerHeight,
  }
}

const positionedAnnotations = computed(() => {
  layoutTick.value // re-resolve on scroll/resize
  return annotations.value
    // index taken before filtering so pin numbers stay stable
    .map((ann, index) => ({ ann, index, point: resolvePoint(ann) }))
    .filter((p) => p.point !== null)
    .filter((p) => !hideResolved.value || !p.ann.resolved)
    .map((p) => ({ ann: p.ann, index: p.index, x: p.point!.x, y: p.point!.y }))
})

// Anchored annotations whose element isn't currently in the DOM (e.g. a
// closed drawer/modal) — surfaced as a count in the toolbar so they don't
// just silently vanish from view.
const hiddenAnnotationsCount = computed(() => {
  layoutTick.value
  return annotations.value.filter(a => resolvePoint(a) === null).length
})

const activePoint = computed(() => {
  layoutTick.value
  return activeAnnotation.value ? resolvePoint(activeAnnotation.value) : null
})

// If the open popover's anchor disappears mid-view (its drawer/modal just
// closed), the pin is no longer rendered — close the popover instead of
// leaving it invisibly "open" with no way to re-toggle it.
watch(activePoint, (p) => {
  if (activeAnnotationId.value && !p) activeAnnotationId.value = null
})

const pendingPoint = computed(() => {
  layoutTick.value
  const p = pendingPin.value
  if (!p) return null
  if (p.anchor) {
    const resolved = pointFromAnchor(p.anchor)
    if (resolved) return resolved
  }
  return { x: p.x, y: p.y }
})

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

  pendingPin.value = {
    x: e.clientX,
    y: e.clientY,
    anchor: anchorFromPoint(e.clientX, e.clientY),
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
  const p = pendingPin.value
  if (!p) return
  const ann = await addAnnotation({
    xPct: (p.x / window.innerWidth) * 100,
    yPct: (p.y / window.innerHeight) * 100,
    anchorSelector: p.anchor?.selector ?? null,
    anchorXPct: p.anchor?.xPct ?? null,
    anchorYPct: p.anchor?.yPct ?? null,
    author,
    body,
    path: viewPath.value,
  })
  pendingPin.value = null
  cancelAddMode()
  if (ann) activeAnnotationId.value = ann.id
}

/** Pin dropped at a new viewport point — re-anchor it to whatever element is there now. */
async function handlePinMove(ann: Annotation, clientX: number, clientY: number) {
  const anchor = anchorFromPoint(clientX, clientY)
  await updatePosition(ann.id, {
    xPct: (clientX / window.innerWidth) * 100,
    yPct: (clientY / window.innerHeight) * 100,
    anchorSelector: anchor?.selector ?? null,
    anchorXPct: anchor?.xPct ?? null,
    anchorYPct: anchor?.yPct ?? null,
  })
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
  position: fixed;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: #fff;
  font-size: 18px;
  font-weight: 400;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.25);
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
.pr-launcher--left {
  right: auto;
  left: 24px;
}
.pr-launcher:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.3);
}
</style>
