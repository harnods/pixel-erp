<script setup lang="ts">
/**
 * ApprovalCommentPopover — comment thread opened from the "Comments" (comment
 * icon) row action. Self-contained: renders its own trigger button + popover
 * (no modal/overlay) — positioned bottom-end (right aligned, 4px gap below the
 * button), matching ApprovalLogPopover's pattern exactly.
 *
 * Posting is local-only (demo has no backend) — new comments are appended to an
 * internal copy of the `comments` prop, not persisted back to the task.
 *
 * Layout/spacing matches Figma node 750:3046 ("Modal / View Comments"):
 * header bg fill, per-comment avatar+name/timestamp row followed by an
 * indented (32px) comment-text row, @mention highlighting, and a pill-shaped
 * composer with a circular send button.
 */
import { MpPopover, MpPopoverTrigger, MpPopoverContent, MpIcon, MpAvatar, MpButton, css } from '@mekari/pixel3'
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

// Deterministic per-author avatar color, matching the Figma reference's varied
// (warning/success/etc) avatar backgrounds rather than one fixed color for everyone.
const avatarColors = ['sky', 'teal', 'violet', 'amber', 'rose', 'lime', 'pink'] as const
function avatarColorFor(name: string) {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return avatarColors[hash % avatarColors.length]
}

// Splits comment text on "@Mention" / "@Multi Word Mention" so the template
// can render mentions in the highlighted mention color.
const mentionPattern = /@[A-Z][a-zA-Z]*(?:\s[A-Z][a-zA-Z]*)?/g
function commentParts(text: string) {
  const parts: { text: string; isMention: boolean }[] = []
  let lastIndex = 0
  for (const match of text.matchAll(mentionPattern)) {
    const start = match.index ?? 0
    if (start > lastIndex) parts.push({ text: text.slice(lastIndex, start), isMention: false })
    parts.push({ text: match[0], isMention: true })
    lastIndex = start + match[0].length
  }
  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), isMention: false })
  return parts
}
</script>

<template>
  <div>
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
        <MpButton
          v-tooltip="{ label: 'Comments', placement: 'top' }"
          class="row-icon-btn"
          aria-label="Comments"
          @click.stop="open = !open"
        >
          <MpIcon name="comment" size="md" />
        </MpButton>
      </MpPopoverTrigger>
      <MpPopoverContent :class="css({ width: '360px', padding: '0', overflow: 'hidden' })" @blur="open = false" @escape="open = false">
        <div class="acp-header">Comments</div>

        <div class="acp-list" :class="{ 'acp-list--empty': !localComments.length }">
          <div v-if="!localComments.length" class="acp-blank-slate">
            <img src="/illustrations/start-chat.png" alt="" class="acp-blank-slate__img" width="288" height="240">
            <p class="acp-blank-slate__title">No comments yet</p>
            <p class="acp-blank-slate__desc">Start a discussion or leave a note for this transaction.</p>
          </div>
          <div v-for="c in localComments" :key="c.id" class="acp-comment">
            <div class="acp-comment-header">
              <MpAvatar :name="c.author" size="md" :variant-color="avatarColorFor(c.author)" />
              <div class="acp-comment-col">
                <span class="acp-comment-author">{{ c.author }}</span>
                <span class="acp-comment-time">{{ formatDateTime(c.timestamp) }}</span>
              </div>
            </div>
            <div class="acp-comment-content">
              <p class="acp-comment-text">
                <template v-for="(part, i) in commentParts(c.text)" :key="i"><span :class="{ 'acp-mention': part.isMention }">{{ part.text }}</span></template>
              </p>
            </div>
          </div>
        </div>

        <div class="acp-composer">
          <div class="acp-input-pill">
            <input
              :id="`${id}-input`"
              v-model="draft"
              class="acp-input"
              type="text"
              placeholder="Comment or mention others with @"
              @keydown.enter="post"
              @click.stop
            >
            <MpButton class="acp-send" aria-label="Send" @click.stop="post">
              <MpIcon name="sent" size="md" variant="fill" color="icon.inverse" />
            </MpButton>
          </div>
        </div>
      </MpPopoverContent>
    </MpPopover>
  </div>
</template>

<style scoped>
/* ── Header — bg fill + Figma's asymmetric padding (pl:16/pr:12/py:12) ── */
.acp-header {
  padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4);
  background: var(--mp-background-neutral-subtle, #f0f1f3);
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
  border-bottom: 1px solid var(--mp-border-default);
}

.acp-list {
  display: flex;
  flex-direction: column;
  max-height: 320px;
  overflow-y: auto;
  padding: var(--mp-spacing-4);
}
/* Blank slate (illustration + copy) is taller than the populated-list scroll
   cap — don't clip/scroll it, let it size naturally. */
.acp-list--empty {
  max-height: none;
  overflow: visible;
}

/* ── Blank slate — Figma node 750:8689 "State=First Run" ── */
/* No own bottom padding — .acp-list's padding (16px) + .acp-composer's
   top padding (8px) already add up to the 24px gap before the input bar. */
.acp-blank-slate {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
}
.acp-blank-slate__img { width: 288px; height: 240px; object-fit: cover; }
.acp-blank-slate__title {
  margin: 0;
  font-size: var(--mp-font-sizes-lg, 16px);
  font-weight: var(--mp-font-weights-semi-bold);
  line-height: var(--mp-line-heights-lg, 24px);
  color: var(--mp-text-default);
  text-align: center;
}
.acp-blank-slate__desc {
  margin: var(--mp-spacing-1, 4px) 0 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-secondary);
  text-align: center;
}

/* ── Comment — header row (avatar+name/time) then an indented text row, with
     a small gap between them and vertical padding per item
     (Figma: pxl-space-3xs / pxl-space-xs) ── */
.acp-comment {
  display: flex;
  flex-direction: column;
  gap: var(--mp-spacing-1, 4px);
  padding: var(--mp-spacing-2, 8px) 0;
}

.acp-comment-header {
  display: flex;
  align-items: flex-start;
  gap: var(--mp-spacing-2, 8px);
}

.acp-comment-col { display: flex; flex-direction: column; gap: var(--mp-sizes-0\.5, 2px); min-width: 0; }

.acp-comment-author {
  font-size: var(--mp-font-sizes-md);
  font-weight: var(--mp-font-weights-semi-bold);
  color: var(--mp-text-default);
}

.acp-comment-time {
  font-size: var(--mp-font-sizes-sm);
  color: var(--mp-text-secondary);
}

.acp-comment-content {
  padding-left: 32px;
}

.acp-comment-text {
  margin: 0;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}

.acp-mention {
  color: var(--mp-text-link, #5f519f);
}

/* ── Composer — pill-shaped input with a circular send button, sticky at
     the bottom of the popover (Figma: ".Action group / Chat") ── */
.acp-composer {
  padding: var(--mp-spacing-2, 8px) var(--mp-spacing-4) var(--mp-spacing-4);
  background: var(--mp-background-neutral, white);
}

.acp-input-pill {
  display: flex;
  align-items: center;
  gap: var(--mp-spacing-6, 24px);
  padding: var(--mp-sizes-0\.5, 2px) var(--mp-sizes-0\.5, 2px) var(--mp-sizes-0\.5, 2px) var(--mp-spacing-3, 12px);
  border: 1px solid var(--mp-border-form, rgba(29, 31, 36, 0.16));
  border-radius: var(--mp-radii-full, 999px);
  background: var(--mp-background-neutral, white);
}
.acp-input-pill:focus-within {
  border-color: var(--mp-border-bold, #8c9596);
  box-shadow: 0 0 0 1px var(--mp-border-bold, #8c9596); /* pixel-police-allow-shadow: focus ring on a floating popover composer */
}

.acp-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: var(--mp-font-sizes-md);
  color: var(--mp-text-default);
}
.acp-input::placeholder {
  color: var(--mp-text-placeholder, #6e7a7c);
}

/* Rendered via MpButton, not a raw HTML control — default look reset (see
   IconButton/.demo-fab precedent) so it keeps its circular send-button shape. */
.acp-send {
  display: flex !important;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  min-width: 0 !important;
  width: var(--mp-sizes-8, 32px);
  height: var(--mp-sizes-8, 32px);
  padding: var(--mp-spacing-2, 8px) !important;
  border: none !important;
  border-radius: var(--mp-radii-full, 999px) !important;
  background: var(--mp-background-brand-bold, #029861) !important;
  color: white;
  cursor: pointer;
}
.acp-send:hover { opacity: 0.9; background: var(--mp-background-brand-bold, #029861) !important; }
</style>
