<script setup lang="ts">
/**
 * CoworkChatPanel — the shared Cowork "New chat" surface, reproducing the exact
 * format of the Chats page / chat drawer: a "New chat" header, the greeting hero
 * (avatar + "Hi, I'm …" + agent chip + line), sparkle suggestions, and the rich
 * `cw-composer2` (field + "+", model chip, round send). Given a plain `messages`
 * array + a `send` handler, so it can back a real chat or a dry-run test panel.
 */
import { ref, h, computed, nextTick } from 'vue'
import { MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, css } from '@mekari/pixel3'
import { renderMessage } from '~/composables/useAireneChat'

interface CoworkChatMsg { role: 'user' | 'assistant'; text: string }
const props = defineProps<{
  messages: CoworkChatMsg[]
  agentName?: string
  agentAvatar?: string
  userName?: string
  greeting?: string
  suggestions?: string[]
  models?: { id: string; label: string }[]
  modelId?: string
  /** Chrome toggles — the wizard preview hides the header, the "+", agent switching. */
  hideHeader?: boolean
  hideAdd?: boolean
  agentSwitchable?: boolean
  /** Cap the number of user turns (preview). When reached the composer locks. */
  maxTurns?: number
}>()
const emit = defineEmits<{ (e: 'send', text: string): void; (e: 'update:modelId', v: string): void }>()

const turns = computed(() => props.messages.filter((m) => m.role === 'user').length)
const atLimit = computed(() => props.maxTurns != null && turns.value >= props.maxTurns)

// Gemini gradient mark (identical to the Chats page composer).
const GeminiMark = (p: { size?: number }) =>
  h('svg', { width: p.size ?? 16, height: p.size ?? 16, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' }, [
    h('defs', [
      h('linearGradient', { id: 'ccp-gemini', x1: '2', y1: '3', x2: '22', y2: '21', gradientUnits: 'userSpaceOnUse' }, [
        h('stop', { offset: '0', 'stop-color': '#1BA1E3' }),
        h('stop', { offset: '0.3', 'stop-color': '#5489D6' }),
        h('stop', { offset: '0.55', 'stop-color': '#9B72CB' }),
        h('stop', { offset: '0.8', 'stop-color': '#D96570' }),
        h('stop', { offset: '1', 'stop-color': '#F49C46' }),
      ]),
    ]),
    h('path', { d: 'M12 2c.3 4.9 4.8 9.4 9.7 9.7v.6C16.8 12.6 12.3 17.1 12 22h-.6c-.3-4.9-4.8-9.4-9.7-9.7v-.6C6.6 11.4 11.1 6.9 11.4 2H12z', fill: 'url(#ccp-gemini)' }),
  ])

const input = ref('')
const bodyEl = ref<HTMLElement | null>(null)
const modelLabel = () => props.models?.find((m) => m.id === props.modelId)?.label ?? props.models?.[0]?.label ?? 'Gemini Flash'
function scrollToEnd() { nextTick(() => { if (bodyEl.value) bodyEl.value.scrollTop = bodyEl.value.scrollHeight }) }
function submit() {
  if (atLimit.value) return
  const t = input.value.trim()
  if (!t) return
  input.value = ''
  emit('send', t)
  scrollToEnd()
}
function ask(s: string) { if (atLimit.value) return; emit('send', s); scrollToEnd() }
</script>

<template>
  <div class="ccp">
    <!-- Header (mirrors the chat drawer chrome) -->
    <div v-if="!hideHeader" class="ccp-head">
      <button type="button" class="ccp-head-title">New chat<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
      <div class="ccp-head-actions">
        <button type="button" class="ccp-head-icon" aria-label="Open in full"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M14 4h6v6M20 4l-8 8M10 20H4v-6M4 20l8-8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button type="button" class="ccp-head-icon" aria-label="New"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M8 8h10a2 2 0 012 2v8a2 2 0 01-2 2h-8a2 2 0 01-2-2V8zM6 16H5a2 2 0 01-2-2V5a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <button type="button" class="ccp-head-icon" aria-label="More"><MpIcon name="menu-kebab" size="md" /></button>
        <button type="button" class="ccp-head-icon" aria-label="Toggle panel"><svg width="18" height="18" viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M15 4v16" stroke="currentColor" stroke-width="1.6"/></svg></button>
      </div>
    </div>

    <!-- Body -->
    <div ref="bodyEl" class="ccp-body">
      <!-- Empty state: greeting hero + suggestions -->
      <template v-if="!messages.length">
        <div class="cwc-greetings">
          <img class="ccp-mascot" :src="agentAvatar" :alt="agentName || 'Agent'" />
          <p class="cwc-greeting-title">Hi, I'm {{ agentName || 'here' }}.</p>
          <span class="ccp-agent-chip"><img :src="agentAvatar" :alt="agentName" class="ccp-agent-chip__av" /> {{ agentName || 'Your agent' }}<svg v-if="agentSwitchable" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          <p class="cwc-greeting-msg">{{ greeting || 'Ask me anything to see how I’ll respond.' }}</p>
        </div>
        <div v-if="!atLimit" class="cwc-suggestions">
          <button v-for="s in (suggestions ?? [])" :key="s" type="button" class="cwc-suggestion" @click="ask(s)">
            <MpIcon name="airene-brand" size="sm" class="cwc-sug-icon" /> {{ s }}
          </button>
        </div>
      </template>

      <!-- Active chat -->
      <template v-else>
        <div v-for="(msg, i) in messages" :key="i" class="chat-message" :class="'chat-message--' + msg.role">
          <img v-if="msg.role === 'assistant'" class="ccp-msg-av" :src="agentAvatar" :alt="agentName" />
          <div class="cwc-msg-col">
            <div class="chat-bubble" :class="'chat-bubble--' + msg.role">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <span v-if="msg.role === 'assistant'" class="chat-bubble__text chat-bubble__rich" v-html="renderMessage(msg.text)" />
              <span v-else class="chat-bubble__text">{{ msg.text }}</span>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Composer (cw-composer2, identical to the Chats page) -->
    <div class="ccp-footer">
      <div class="cw-composer2">
        <div class="cw-composer2__field">
          <textarea v-model="input" class="cw-composer2__input" rows="2" :disabled="atLimit" :placeholder="atLimit ? `Preview limited to ${maxTurns} messages` : `Ask ${agentName || 'your agent'}…`" @keydown.enter.exact.prevent="submit" />
        </div>
        <div class="cw-composer2__foot">
          <div class="cw-composer2__left">
            <button v-if="!hideAdd" type="button" class="cw-foot-btn ccp-plus" aria-label="Add"><MpIcon name="add" size="sm" /></button>
          </div>
          <div class="cw-composer2__right">
            <MpPopover v-if="models?.length" id="ccp-model" is-close-on-select placement="bottom-end">
              <MpPopoverTrigger>
                <button class="cw-model-btn" type="button"><GeminiMark :size="16" /> {{ modelLabel() }} <MpIcon name="caret-down" size="sm" /></button>
              </MpPopoverTrigger>
              <MpPopoverContent :class="css({ minWidth: '200px' })">
                <MpPopoverList>
                  <MpPopoverListItem v-for="m in models" :key="m.id" :is-active="m.id === modelId" @click="emit('update:modelId', m.id)">{{ m.label }}</MpPopoverListItem>
                </MpPopoverList>
              </MpPopoverContent>
            </MpPopover>
            <span v-else class="cw-model-btn"><GeminiMark :size="16" /> {{ modelLabel() }}</span>
            <button class="cw-send-btn" type="button" aria-label="Send" :aria-disabled="atLimit" @click="submit">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 19V5M12 5L6 11M12 5L18 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
          </div>
        </div>
      </div>
      <p class="cwc-disclaimer">{{ agentName || 'This agent' }} can make mistakes. <a class="cwc-disclaimer-link">Learn more</a></p>
    </div>
  </div>
</template>

<style scoped>
.ccp { display: flex; flex-direction: column; height: 100%; min-height: 0; background: var(--mp-background-neutral, #fff); }
/* Header */
.ccp-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; padding: var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-3) var(--mp-spacing-4); }
.ccp-head-title { display: inline-flex; align-items: center; gap: 4px; border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md, 14px); font-weight: 600; color: var(--mp-text-default); padding: 4px 6px; border-radius: var(--mp-radii-md, 8px); }
.ccp-head-title:hover { background: var(--mp-background-neutral-subtle); }
.ccp-head-actions { display: flex; align-items: center; gap: 2px; }
.ccp-head-icon { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; border: none; background: none; cursor: pointer; color: var(--mp-icon-default, #536062); border-radius: var(--mp-radii-md, 8px); }
.ccp-head-icon:hover { background: var(--mp-background-neutral-subtle); }
/* Body */
.ccp-body { flex: 1; min-height: 0; overflow-y: auto; padding: var(--mp-spacing-4); display: flex; flex-direction: column; }
/* Greeting hero (identical to Chats page) */
.cwc-greetings { display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: var(--mp-spacing-2); flex-shrink: 0; margin-top: auto; }
.ccp-mascot { width: 60px; height: 60px; object-fit: contain; background: transparent; }
.cwc-greeting-title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.ccp-agent-chip { display: inline-flex; align-items: center; gap: 6px; padding: 3px 8px 3px 4px; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-sm, 12px); font-weight: 600; color: var(--mp-text-default); }
.ccp-agent-chip__av { width: 18px; height: 18px; border-radius: 50%; object-fit: contain; background: transparent; }
.cwc-greeting-msg { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); }
/* Suggestions (identical to Chats page) */
.cwc-suggestions { display: flex; flex-direction: column; flex-shrink: 0; margin-top: var(--mp-spacing-3); }
.cwc-suggestion { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); padding: var(--mp-spacing-2) 0; background: none; border: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: left; line-height: var(--mp-line-heights-md); width: 100%; }
.cwc-suggestion:hover { opacity: 0.7; }
.cwc-sug-icon { flex-shrink: 0; }
/* Message thread (identical to Chats page) */
.cwc-msg-col { display: flex; flex-direction: column; min-width: 0; max-width: 100%; }
.ccp-msg-av { width: 28px; height: 28px; flex-shrink: 0; border-radius: 50%; object-fit: contain; background: transparent; }
.chat-message { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); margin-bottom: 24px; flex-shrink: 0; }
.chat-message--user { flex-direction: row-reverse; }
.chat-bubble { padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-lg, 12px); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); max-width: 85%; word-break: break-word; }
.chat-bubble__text { white-space: pre-wrap; }
.chat-bubble--user { background: var(--mp-background-neutral-subtle, #f1f3f4); color: var(--mp-text-default); }
.chat-bubble--assistant { background: transparent; color: var(--mp-text-default); border-radius: 0; padding: 0; max-width: 100%; }
/* Answer eases in (fade + rise + de-blur) instead of snapping — like Claude/ChatGPT. */
.chat-bubble--assistant { animation: ccpAnswerIn 480ms cubic-bezier(0.22, 1, 0.36, 1) both; }
@keyframes ccpAnswerIn { from { opacity: 0; transform: translateY(6px); filter: blur(3px); } to { opacity: 1; transform: none; filter: blur(0); } }
@media (prefers-reduced-motion: reduce) { .chat-bubble--assistant { animation: none; } }
.chat-bubble__rich { white-space: normal; }
.chat-bubble__rich :deep(.chat-md-p) { margin: 0; }
.chat-bubble__rich :deep(.chat-md-p + .chat-md-p) { margin-top: var(--mp-spacing-2, 8px); }
.chat-bubble__rich :deep(.chat-md-ul) { margin: var(--mp-spacing-1, 4px) 0; padding-inline-start: var(--mp-spacing-5, 20px); list-style: disc outside; }
.chat-bubble__rich :deep(.chat-md-ul li) { margin: 2px 0; display: list-item; list-style: disc outside; }
.chat-bubble__rich :deep(strong) { font-weight: var(--mp-font-weights-semi-bold, 600); }
/* Composer (cw-composer2, identical to Chats page) */
.ccp-footer { flex-shrink: 0; padding: 0 var(--mp-spacing-4) var(--mp-spacing-3); display: flex; flex-direction: column; gap: var(--mp-spacing-2); }
.cw-composer2 { border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: 20px; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: var(--mp-spacing-1, 4px); display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); }
.cw-composer2__field { border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: 20px; background: var(--mp-background-neutral, #fff); padding: var(--mp-spacing-2, 8px); }
.cw-composer2__field:focus-within { border-color: var(--mp-border-bold, #8c9596); }
.cw-composer2__input { display: block; width: 100%; border: none; outline: none; resize: none; font-family: inherit; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); padding: var(--mp-spacing-2, 8px); background: transparent; min-height: 48px; }
.cw-composer2__input::placeholder { color: var(--mp-text-placeholder, #6e7a7c); }
.cw-composer2__foot { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-1); background: var(--mp-background-neutral-subtle, #f8f9f9); border-radius: 0 0 16px 16px; }
.cw-composer2__left { display: flex; align-items: center; gap: var(--mp-spacing-1); min-height: 32px; }
.cw-composer2__right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cw-foot-btn { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); padding: var(--mp-spacing-1\.5, 6px); border-radius: var(--mp-radii-full, 999px); }
.cw-foot-btn:hover { background: var(--mp-background-neutral-pressed, #ebf0f1); color: var(--mp-text-default); }
.cw-model-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); background: none; border: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); padding: var(--mp-spacing-1\.5, 6px) var(--mp-spacing-2); border-radius: var(--mp-radii-md, 8px); }
.cw-model-btn:hover { background: var(--mp-background-neutral-pressed, #ebf0f1); }
.cw-model-btn > svg:first-child { flex-shrink: 0; }
.cw-send-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 36px; height: 36px; border: none; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-brand-bold, #029861); color: var(--mp-text-inverse, #fff); cursor: pointer; }
.cw-send-btn:hover { filter: brightness(0.94); }
.cw-send-btn[aria-disabled="true"] { opacity: 0.45; cursor: default; }
.cw-send-btn[aria-disabled="true"]:hover { filter: none; }
.cw-composer2__input:disabled { cursor: default; }
.cwc-disclaimer { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); text-align: center; }
.cwc-disclaimer-link { color: var(--mp-text-link); cursor: pointer; }
.cwc-disclaimer-link:hover { text-decoration: underline; text-underline-offset: 2px; }
</style>
