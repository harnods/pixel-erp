<script setup lang="ts">
/**
 * ApprovalCommentPopover — comment thread opened from the "Comments" (comment
 * icon) row action. Self-contained: renders its own trigger button + popover
 * (no modal/overlay) — positioned bottom-end (right aligned, 4px gap below the
 * button), matching ApprovalLogPopover's pattern exactly.
 *
 * Posting is local-only (demo has no backend) — new comments are appended to an
 * internal copy of the `comments` prop, not persisted back to the task.
 */
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpIcon, MpAvatar, MpTextarea, css } from '@mekari/pixel3'
import type { TaskComment } from '~/data/tasks'
import { formatDateTime } from '~/utils/date'

const props = defineProps<{
  id: string
  comments: TaskComment[]
}>()

const open = ref(false)
const localComments = ref<TaskComment[]>([...props.comments])
const draft = ref('')

function post() {
  const text = draft.value.trim()
  if (!text) return
  localComments.value.push({
    id: `${props.id}-new-${localComments.value.length + 1}`,
    author: 'You',
    timestamp: new Date().toISOString(),
    text,
  })
  draft.value = ''
}
</script>

<template>
  <div class="icon-tooltip-wrap">
    <MpPopover
      :id="id"
      is-manual
      :is-open="open"
      use-portal
      :is-keep-alive="false"
      placement="bottom-end"
      @open="open = true"
      @close="open = false"
    >
      <MpPopoverTrigger>
        <button class="row-icon-btn" aria-label="Comments" type="button" @click.stop="open = !open">
          <MpIcon name="comment" size="md" />
        </button>
      </MpPopoverTrigger>
      <MpPopoverContent :class="css({ width: '320px', padding: '0' })" @blur="open = false" @escape="open = false">
        <div class="acp-header">Comments</div>

        <div class="acp-list">
          <p v-if="!localComments.length" class="acp-empty">No comments yet</p>
          <div v-for="c in localComments" :key="c.id" class="acp-comment">
            <MpAvatar :name="c.author" size="sm" variant-color="sky" />
            <div class="acp-comment-body">
              <div class="acp-comment-top">
                <span class="acp-comment-author">{{ c.author }}</span>
                <span class="acp-comment-time">{{ formatDateTime(c.timestamp) }}</span>
              </div>
              <p class="acp-comment-text">{{ c.text }}</p>
            </div>
          </div>
        </div>

        <div class="acp-composer">
          <MpTextarea :id="`${id}-input`" v-model="draft" placeholder="Add a comment…" is-full-width :rows="2" />
          <button class="btn-enterprise btn-enterprise--primary btn-enterprise--sm" :disabled="!draft.trim()" @click.stop="post">Post</button>
        </div>
      </MpPopoverContent>
    </MpPopover>
    <span class="icon-tooltip">Comments</span>
  </div>
</template>

<style scoped>
/* ── Tooltip: plain CSS, 4px gap above the trigger — see ApprovalLogPopover
     for why MpTooltip isn't used here (cloneVNode/inheritAttrs conflict with
     MpPopoverTrigger's own cloneVNode-based trigger cloning). ── */
.icon-tooltip-wrap { position: relative; display: inline-flex; }
.icon-tooltip {
  position: absolute;
  bottom: calc(100% + 4px);
  left: 50%;
  transform: translateX(-50%);
  padding: var(--mp-spacing-1) var(--mp-spacing-2);
  background: var(--mp-background-inverse, #1f2937);
  color: var(--mp-text-inverse, #fff);
  font-size: var(--mp-font-sizes-xs, 11px);
  line-height: var(--mp-line-heights-xs, 16px);
  border-radius: var(--mp-radii-sm);
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  transition: opacity 100ms;
  z-index: 10;
}
.icon-tooltip-wrap:hover .icon-tooltip { opacity: 1; }

.acp-header {
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
}

.acp-list {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-4);
  max-height: 240px;
  overflow-y: auto;
  padding: var(--mp-spacing-4);
}

.acp-empty {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
}

.acp-comment {
  display: flex;
  gap: var(--mp-spacing-2);
}

.acp-comment-body {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-0\.5);
  min-width: 0;
}

.acp-comment-top {
  display: flex;
  align-items: baseline;
  gap: var(--mp-spacing-2);
}

.acp-comment-author {
  font-size: var(--mp-font-sizes-sm);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.acp-comment-time {
  font-size: var(--mp-font-sizes-xs, 11px);
  color: var(--mp-text-secondary);
}

.acp-comment-text {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

.acp-composer {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-2);
  padding: var(--mp-spacing-3) var(--mp-spacing-4);
  border-top: 1px solid var(--mp-border-default);
}

.acp-composer .btn-enterprise {
  align-self: flex-end;
}
</style>
