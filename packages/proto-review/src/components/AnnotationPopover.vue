<template>
  <div
    class="pr-popover"
    :style="popoverStyle"
    @click.stop
    @mousedown.stop
  >
    <div class="pr-popover__header">
      <span class="pr-popover__num">#{{ index + 1 }}</span>
      <span class="pr-popover__status" :class="{ resolved: annotation.resolved }">
        {{ annotation.resolved ? 'Resolved' : 'Open' }}
      </span>
      <button class="pr-popover__close" @click="$emit('close')" title="Close">✕</button>
    </div>

    <div class="pr-popover__thread">
      <div class="pr-comment">
        <div class="pr-comment__meta">
          <span class="pr-dot" :style="{ background: getAuthorColor(annotation.author) }" />
          <strong>{{ annotation.author }}</strong>
          <span>{{ formatTime(annotation.created_at) }}</span>
        </div>
        <p class="pr-comment__body">{{ annotation.body }}</p>
      </div>

      <div
        v-for="reply in annotation.replies"
        :key="reply.id"
        class="pr-comment pr-comment--reply"
      >
        <div class="pr-comment__meta">
          <span class="pr-dot" :style="{ background: getAuthorColor(reply.author) }" />
          <strong>{{ reply.author }}</strong>
          <span>{{ formatTime(reply.created_at) }}</span>
        </div>
        <p class="pr-comment__body">{{ reply.body }}</p>
      </div>
    </div>

    <div class="pr-popover__reply">
      <textarea
        v-model="replyText"
        placeholder="Type a reply..."
        rows="2"
        @keydown.ctrl.enter.prevent="submitReply"
        @keydown.meta.enter.prevent="submitReply"
      />
      <div class="pr-popover__reply-actions">
        <button
          class="pr-btn pr-btn--primary"
          :disabled="!replyText.trim()"
          @click="submitReply"
        >
          Reply
        </button>
      </div>
    </div>

    <!-- Fix with Claude — only rendered when the local bridge is running -->
    <div v-if="fixAvailable" class="pr-popover__fix">
      <button
        v-if="fixState === 'idle' || fixState === 'error'"
        class="pr-fix-btn"
        @click="runFix"
      >
        ⚡ Fix with Claude
      </button>
      <div v-else-if="fixState === 'running'" class="pr-fix-status pr-fix-status--running">
        <span class="pr-fix-spinner" /> Claude is fixing…
      </div>
      <div v-else-if="fixState === 'done'" class="pr-fix-status pr-fix-status--done">
        ✓ Fixed{{ fixChangedCount ? ` · ${fixChangedCount} file${fixChangedCount === 1 ? '' : 's'} changed` : '' }}
      </div>
      <p v-if="fixState === 'error'" class="pr-fix-error">{{ fixError }}</p>
    </div>

    <div class="pr-popover__footer">
      <button
        class="pr-btn pr-btn--ghost"
        @click="$emit('toggle-resolved', annotation.id)"
      >
        {{ annotation.resolved ? '↩ Reopen' : '✓ Mark resolved' }}
      </button>
      <button
        class="pr-btn pr-btn--danger"
        @click="$emit('delete', annotation.id)"
      >
        Delete
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { Annotation } from '../types'
import { getAuthorColor } from '../lib/authorColor'
import { useFixBridge } from '../composables/useFixBridge'

const props = defineProps<{
  annotation: Annotation
  index: number
  /** Pin's viewport pixel position, resolved by the overlay. */
  x: number
  y: number
  reviewerName: string
}>()

// ── Fix with Claude (local bridge) ──────────────────────────────────────
const { available: fixAvailable, checkAvailability, requestFix, pollStatus } = useFixBridge()
const fixState = ref<'idle' | 'running' | 'done' | 'error'>('idle')
const fixError = ref('')
const fixChangedCount = ref(0)

onMounted(checkAvailability)

let pollTimer: ReturnType<typeof setTimeout> | null = null

async function runFix() {
  fixState.value = 'running'
  fixError.value = ''
  try {
    const jobId = await requestFix(props.annotation)
    const poll = async () => {
      try {
        const s = await pollStatus(jobId)
        if (s.state === 'running') {
          pollTimer = setTimeout(poll, 1500)
          return
        }
        if (s.state === 'done') {
          fixState.value = 'done'
          fixChangedCount.value = s.changedFiles?.length ?? 0
        } else {
          fixState.value = 'error'
          fixError.value = s.error || 'Fix failed.'
        }
      } catch (e) {
        fixState.value = 'error'
        fixError.value = 'Lost connection to the fix bridge.'
      }
    }
    poll()
  } catch {
    fixState.value = 'error'
    fixError.value = 'Could not reach the fix bridge. Is `npx proto-review bridge` running?'
  }
}

const emit = defineEmits<{
  close: []
  reply: [annotationId: string, author: string, body: string]
  'toggle-resolved': [annotationId: string]
  delete: [annotationId: string]
}>()

const replyText = ref('')

const popoverStyle = computed(() => {
  const toLeft = props.x > window.innerWidth * 0.6
  const toTop = props.y > window.innerHeight * 0.55
  return {
    position: 'fixed' as const,
    left: `${toLeft ? props.x - 305 : props.x + 22}px`,
    top: `${toTop ? props.y - 280 : props.y + 22}px`,
  }
})

function formatTime(iso: string) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  )
}

function submitReply() {
  const body = replyText.value.trim()
  if (!body) return
  emit('reply', props.annotation.id, props.reviewerName || 'Anonymous', body)
  replyText.value = ''
}
</script>

<style scoped>
/* standalone package — intentionally uses own CSS vars, not Pixel DT tokens */
.pr-popover {
  width: 280px;
  background: #fff;
  border: 2px solid #9ca3af;
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  font-family: -apple-system, BlinkMacSystemFont, 'Inter', sans-serif;
  font-size: 13px;
  color: #1a1a1a;
  pointer-events: all;
  z-index: 2;
  overflow: hidden;
}

.pr-popover__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px 8px;
  border-bottom: 1px solid #f0f0f0;
}

.pr-popover__num {
  font-weight: 700;
  font-size: 12px;
  color: #6b7280;
}

.pr-popover__status {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
  background: #fef3c7;
  color: #92400e;
}
.pr-popover__status.resolved {
  background: #dcfce7;
  color: #14532d;
}

.pr-popover__close {
  margin-left: auto;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 13px;
  color: #9ca3af;
  padding: 2px 4px;
  border-radius: 4px;
  line-height: 1;
}
.pr-popover__close:hover {
  background: #f3f4f6;
  color: #374151;
}

.pr-popover__thread {
  max-height: 200px;
  overflow-y: auto;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pr-comment__meta {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 3px;
}
.pr-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.pr-comment__meta strong {
  font-size: 12px;
  font-weight: 600;
  color: #111827;
}
.pr-comment__meta span {
  font-size: 11px;
  color: #9ca3af;
}
.pr-comment__body {
  margin: 0;
  line-height: 1.5;
  color: #374151;
  white-space: pre-wrap;
}

.pr-comment--reply {
  padding-left: 10px;
  border-left: 2px solid #e5e7eb;
}

.pr-popover__reply {
  padding: 6px 12px 8px;
  border-top: 1px solid #f0f0f0;
}
.pr-popover__reply textarea {
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 12px;
  font-family: inherit;
  resize: none;
  outline: none;
  color: #374151;
  box-sizing: border-box;
}
.pr-popover__reply textarea:focus {
  border-color: #f5a623;
  box-shadow: 0 0 0 2px rgba(245, 166, 35, 0.15);
}
.pr-popover__reply-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 6px;
}

.pr-popover__footer {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid #f0f0f0;
  background: #fafafa;
}

.pr-btn {
  font-size: 12px;
  font-weight: 500;
  font-family: inherit;
  padding: 4px 10px;
  border-radius: 5px;
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.1s;
}
.pr-btn--primary {
  background: #f5a623;
  color: #fff;
  border-color: #f5a623;
}
.pr-btn--primary:hover:not(:disabled) { background: #e09516; }
.pr-btn--primary:disabled { opacity: 0.4; cursor: not-allowed; }

.pr-btn--ghost {
  background: #fff;
  color: #374151;
  border-color: #e5e7eb;
}
.pr-btn--ghost:hover { background: #f9fafb; }

.pr-btn--danger {
  background: #fff;
  color: #dc2626;
  border-color: #fee2e2;
  margin-left: auto;
}
.pr-btn--danger:hover { background: #fef2f2; }

/* ── Fix with Claude ─────────────────────────────────────── */
.pr-popover__fix {
  padding: 8px 12px;
  border-top: 1px solid #f0f0f0;
}
.pr-fix-btn {
  width: 100%;
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  padding: 7px 10px;
  border-radius: 6px;
  cursor: pointer;
  color: #fff;
  background: linear-gradient(90deg, #d97706, #b45309);
  border: none;
}
.pr-fix-btn:hover { filter: brightness(1.07); }

.pr-fix-status {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 500;
  padding: 4px 2px;
}
.pr-fix-status--running { color: #b45309; }
.pr-fix-status--done { color: #15803d; }

.pr-fix-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid #f0c896;
  border-top-color: #b45309;
  border-radius: 50%;
  animation: pr-fix-spin 0.7s linear infinite;
}
@keyframes pr-fix-spin { to { transform: rotate(360deg); } }

.pr-fix-error {
  margin: 6px 0 0;
  font-size: 11px;
  line-height: 1.4;
  color: #dc2626;
}
</style>
