<script setup lang="ts">
/**
 * Cowork — Chats (/cowork-chats). The full-stage home for the same chat the
 * Airene drawer shows: a 6-column column centred in the stage, in the drawer's
 * exact format (greeting + suggestions, message bubbles, composer, disclaimer).
 *
 * It is not a second chat — `useAireneChat` holds one conversation for the whole
 * app, so a chat opened from a Cowork task result in the drawer is continued
 * here mid-sentence (and the drawer's "Open in Chats" hands it over directly).
 *
 * · Agent switcher sits top-left and is live at any point in the conversation,
 *   not just on the empty state.
 * · "+ Chat" opens a new room; saved rooms live in the Chats dropdown, tagged
 *   with the task they came from.
 *
 * Full-bleed page — owns its own title bar + stage.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { MpButton, MpIcon } from '@mekari/pixel3'
import { useAireneChat } from '~/composables/useAireneChat'
import { useAireneBridge } from '~/composables/useAireneBridge'
import { type CoworkChatSession } from '~/composables/useCoworkChats'
import { getTask, type CoworkAgent } from '~/data/cowork'

const route = useRoute()
const router = useRouter()
const bridge = useAireneBridge()
const chat = useAireneChat()
const {
  messages, isTyping, chatContext, contextSuggestions, chatTitle, activeSessionId,
  groupedHistory, moduleInfo, availableAgents, activeAgent,
  renderMessage,
} = chat

// ── Page-local UI state (the conversation itself is shared) ──────────────────
const inputText = ref('')
const bodyEl = ref<HTMLElement | null>(null)
const agentMenuOpen = ref(false)
const historyOpen = ref(false)
const kebabOpen = ref(false)
const historyWrapperEl = ref<HTMLElement | null>(null)
const kebabWrapperEl = ref<HTMLElement | null>(null)

// The whole agent roster is available here — you can change who you're talking
// to at any point, even mid-conversation and even in a chat that started from a
// task (which locks the drawer's switcher to that task's agents).
const agentOptions = computed<CoworkAgent[]>(() => availableAgents.value)

// A chat that came from a task keeps a link back to it.
const sourceTask = computed(() => (chat.chatTaskId.value ? getTask(chat.chatTaskId.value) : null))

function scrollToBottom() {
  if (bodyEl.value) bodyEl.value.scrollTop = bodyEl.value.scrollHeight
}
watch(chat.scrollSignal, async () => { await nextTick(); scrollToBottom() })

function send(text: string) {
  const t = (text ?? '').trim()
  if (!t) return
  inputText.value = ''
  chat.sendMessage(t)
}

function newChat() {
  chat.startNewChat()
  historyOpen.value = false
  kebabOpen.value = false
  inputText.value = ''
}
function openRoom(session: CoworkChatSession) {
  chat.loadSession(session)
  historyOpen.value = false
  inputText.value = ''
}
function pickAgent(a: CoworkAgent) {
  chat.pickAgent(a)
  agentMenuOpen.value = false
}
function clearChat() { chat.clearChat(); kebabOpen.value = false }
function deleteChat() { chat.deleteChat(); kebabOpen.value = false }

/** Rooms this chat can be continued from, tagged with their source task. */
function taskLabel(session: CoworkChatSession): string {
  return session.contextLabel ?? (session.taskId ? getTask(session.taskId)?.title ?? '' : '')
}

function onOutsideClick(e: MouseEvent) {
  if (!historyWrapperEl.value?.contains(e.target as Node)) historyOpen.value = false
  if (!kebabWrapperEl.value?.contains(e.target as Node)) kebabOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', onOutsideClick)
  // This page IS the chat while it's open — the drawer would only show the same
  // conversation twice, so it steps aside and sends stop re-opening it.
  chat.surface.value = 'page'
  bridge.isOpen.value = false
  // ?chat=<id> opens a specific room (e.g. handed over from the drawer).
  const id = typeof route.query.chat === 'string' ? route.query.chat : ''
  if (id && id !== activeSessionId.value) {
    const s = chat.sessions.value.find((x) => x.id === id)
    if (s) chat.loadSession(s)
  }
  nextTick(scrollToBottom)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onOutsideClick)
  chat.surface.value = 'drawer'
})
</script>

<template>
  <!-- Title bar -->
  <header class="cwc-bar">
    <div class="cwc-bar__left">
      <h1 class="cwc-title">Chats</h1>
    </div>
    <div class="cwc-actions">
      <MpButton is-rounded variant="primary" @click="newChat">+ Chat</MpButton>
    </div>
  </header>

  <!-- Stage — the chat is a 6-col column centred in the main area -->
  <div class="cwc-stage">
    <div class="cwc-col">

      <!-- Column header: agent switcher (left) · rooms + actions (right) -->
      <div class="cwc-head">
        <!-- Agent switcher — change who you're chatting with at any time -->
        <div class="cwc-agent-wrap">
          <button type="button" class="cwc-agent-btn" @click.stop="agentMenuOpen = !agentMenuOpen">
            <img :src="activeAgent!.avatar" :alt="activeAgent!.name" class="cwc-agent-av">
            <span class="cwc-agent-text">
              <span class="cwc-agent-name">{{ activeAgent!.name }}</span>
              <span class="cwc-agent-role">{{ activeAgent!.role }}</span>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <template v-if="agentMenuOpen">
            <div class="cwc-backdrop" @click="agentMenuOpen = false" />
            <div class="cwc-agent-menu" @click.stop>
              <button
                v-for="a in agentOptions"
                :key="a.id"
                type="button"
                class="cwc-agent-item"
                :class="{ 'is-active': a.id === activeAgent!.id }"
                @click="pickAgent(a)"
              >
                <img :src="a.avatar" :alt="a.name" class="cwc-agent-av">
                <span class="cwc-agent-meta">
                  <span class="cwc-agent-name">{{ a.name }}</span>
                  <span class="cwc-agent-role">{{ a.role }}</span>
                </span>
                <MpIcon v-if="a.id === activeAgent!.id" name="check" size="sm" class="cwc-agent-check" />
              </button>
            </div>
          </template>
        </div>

        <div class="cwc-head__right">
          <!-- Rooms dropdown -->
          <div ref="historyWrapperEl" class="cwc-rooms-wrap">
            <button class="cwc-rooms-btn" @click.stop="historyOpen = !historyOpen">
              <span class="cwc-rooms-title">{{ chatTitle }}</span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" class="cwc-chevron" :class="{ 'is-open': historyOpen }">
                <path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div v-if="historyOpen" class="cwc-rooms-menu" @click.stop>
              <button class="cwc-rooms-new" @click="newChat">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                New chat
              </button>
              <div class="cwc-rooms-sep" />
              <template v-for="group in [
                { label: 'Yesterday', rows: groupedHistory.yesterday },
                { label: 'This week', rows: groupedHistory.thisWeek },
                { label: 'Older', rows: groupedHistory.older },
              ]" :key="group.label">
                <template v-if="group.rows.length">
                  <p class="cwc-rooms-group">{{ group.label }}</p>
                  <button
                    v-for="s in group.rows"
                    :key="s.id"
                    class="cwc-rooms-item"
                    :class="{ 'is-active': s.id === activeSessionId }"
                    @click="openRoom(s)"
                  >
                    <span class="cwc-rooms-item__title">{{ s.title }}</span>
                    <!-- Chats started from a Cowork task are continued, not restarted -->
                    <span v-if="taskLabel(s)" class="cwc-rooms-item__task">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" class="cwc-spark"><path d="M12 2c.3 4.9 4.8 9.4 9.7 9.7v.6C16.8 12.6 12.3 17.1 12 22h-.6c-.3-4.9-4.8-9.4-9.7-9.7v-.6C6.6 11.4 11.1 6.9 11.4 2H12z" fill="currentColor"/></svg> {{ taskLabel(s) }}
                    </span>
                  </button>
                </template>
              </template>
            </div>
          </div>

          <button class="cwc-icon-btn" aria-label="New chat" title="New chat" @click="newChat">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>

          <div ref="kebabWrapperEl" class="cwc-kebab-wrap">
            <button class="cwc-icon-btn" aria-label="More options" @click.stop="kebabOpen = !kebabOpen">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <path fill-rule="evenodd" clip-rule="evenodd" d="M10 6C11.1 6 12 5.1 12 4C12 2.9 11.1 2 10 2C8.9 2 8 2.9 8 4C8 5.1 8.9 6 10 6ZM10 8C8.9 8 8 8.9 8 10C8 11.1 8.9 12 10 12C11.1 12 12 11.1 12 10C12 8.9 11.1 8 10 8ZM8 16C8 14.9 8.9 14 10 14C11.1 14 12 14.9 12 16C12 17.1 11.1 18 10 18C8.9 18 8 17.1 8 16Z" fill="currentColor"/>
              </svg>
            </button>
            <div v-if="kebabOpen" class="cwc-kebab-menu" @click.stop>
              <button class="cwc-kebab-item" @click="clearChat">Clear chat</button>
              <button class="cwc-kebab-item cwc-kebab-item--danger" @click="deleteChat">Delete chat</button>
            </div>
          </div>
        </div>
      </div>

      <!-- Body -->
      <div ref="bodyEl" class="cwc-body" :class="{ 'cwc-body--has-messages': messages.length > 0 }">

        <!-- Empty state: greeting + suggestions (same format as the drawer) -->
        <div v-if="messages.length === 0" class="cwc-greetings">
          <img src="~/assets/airene-mascot-v2.png" width="60" height="63" alt="" class="cwc-mascot">
          <p class="cwc-greeting-title">Hi, I'm here.</p>
          <p v-if="chatContext" class="cwc-greeting-msg">I've reviewed “{{ chatContext }}”. Ask me anything about the result.</p>
          <p v-else class="cwc-greeting-msg">{{ moduleInfo.greeting }}</p>

          <div class="cwc-suggestions">
            <button
              v-for="s in (chatContext ? contextSuggestions : moduleInfo.suggestions)"
              :key="s"
              class="cwc-suggestion"
              @click="send(s)"
            >
              <MpIcon name="airene-brand" size="sm" class="cwc-sug-icon" />
              {{ s }}
            </button>
          </div>
        </div>

        <!-- Messages -->
        <template v-if="messages.length > 0">
          <div v-for="(msg, i) in messages" :key="i" class="chat-message" :class="'chat-message--' + msg.role">
            <img v-if="msg.role === 'assistant'" src="~/assets/airene-mascot.png" width="24" height="25" alt="" class="chat-avatar">
            <div class="chat-bubble" :class="'chat-bubble--' + msg.role">
              <!-- eslint-disable-next-line vue/no-v-html -->
              <span v-if="msg.role === 'assistant'" class="chat-bubble__text chat-bubble__rich" v-html="renderMessage(msg.text)" />
              <span v-else class="chat-bubble__text">{{ msg.text }}</span>
            </div>
          </div>
          <div v-if="isTyping" class="chat-message chat-message--assistant">
            <img src="~/assets/airene-mascot.png" width="24" height="25" alt="" class="chat-avatar">
            <div class="chat-bubble chat-bubble--assistant chat-typing">
              <span class="typing-dot" /><span class="typing-dot" /><span class="typing-dot" />
            </div>
          </div>
        </template>
      </div>

      <!-- Composer -->
      <div class="cwc-footer">
        <div class="cwc-input-box">
          <!-- Context chip — the task result this chat is grounded on -->
          <div v-if="chatContext" class="cwc-context-row">
            <span class="cwc-context-chip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" class="cwc-spark"><path d="M12 2c.3 4.9 4.8 9.4 9.7 9.7v.6C16.8 12.6 12.3 17.1 12 22h-.6c-.3-4.9-4.8-9.4-9.7-9.7v-.6C6.6 11.4 11.1 6.9 11.4 2H12z" fill="currentColor"/></svg>
              {{ chatContext }}
              <button v-if="sourceTask" class="cwc-context-link" type="button" @click="router.push(`/cowork-tasks/${sourceTask.id}`)">View task</button>
            </span>
          </div>
          <div class="cwc-input-row">
            <input
              v-model="inputText"
              class="cwc-input"
              placeholder="Ask Airene..."
              @keydown.enter.prevent="send(inputText)"
            >
          </div>
          <div class="cwc-input-actions">
            <button class="cwc-add-btn" aria-label="Add attachment">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 5V19M5 12H19" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </button>
            <div class="cwc-input-right">
              <div class="cwc-model-label">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="cwc-gemini" x1="2" y1="3" x2="22" y2="21" gradientUnits="userSpaceOnUse">
                      <stop offset="0" stop-color="#1BA1E3"/><stop offset="0.3" stop-color="#5489D6"/><stop offset="0.55" stop-color="#9B72CB"/><stop offset="0.8" stop-color="#D96570"/><stop offset="1" stop-color="#F49C46"/>
                    </linearGradient>
                  </defs>
                  <path d="M12 2c.3 4.9 4.8 9.4 9.7 9.7v.6C16.8 12.6 12.3 17.1 12 22h-.6c-.3-4.9-4.8-9.4-9.7-9.7v-.6C6.6 11.4 11.1 6.9 11.4 2H12z" fill="url(#cwc-gemini)"/>
                </svg>
                Gemini Flash
              </div>
              <button class="cwc-send-btn" aria-label="Send" @click="send(inputText)">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 19V5M12 5L5 12M12 5L19 12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
        <p class="cwc-disclaimer">Mekari Airene can make mistakes. <a class="cwc-disclaimer-link">Learn more</a></p>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* ── Title bar ─────────────────────────────────────────────────────────────── */
.cwc-bar { flex-shrink: 0; min-height: 72px; box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6); display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-4); }
.cwc-bar__left { display: flex; flex-direction: column; min-width: 0; }
.cwc-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: -0.2px; color: var(--mp-text-default); }
.cwc-actions { display: flex; align-items: center; gap: var(--mp-spacing-3); }

/* ── Stage · 6-col column centred in the main area ─────────────────────────── */
.cwc-stage { flex: 1; min-height: 0; display: flex; justify-content: center; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6) var(--mp-spacing-6) 0; }
/* 6 of the ERP's 12 columns — the same 640px measure the other Cowork detail
   pages use for their content column. */
.cwc-col { width: 100%; max-width: 640px; display: flex; flex-direction: column; min-height: 0; }

/* ── Column header ─────────────────────────────────────────────────────────── */
.cwc-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding-bottom: var(--mp-spacing-3); border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.cwc-head__right { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.cwc-backdrop { position: fixed; inset: 0; z-index: 40; }

/* Agent switcher (top-left, live at any point in the conversation) */
.cwc-agent-wrap { position: relative; min-width: 0; }
.cwc-agent-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2, 8px); max-width: 100%; padding: var(--mp-spacing-1, 4px) var(--mp-spacing-2, 8px); border: 1px solid var(--mp-border-default, #e3e7e9); background: var(--mp-background-neutral, #fff); border-radius: var(--mp-radii-full, 999px); font-family: inherit; color: var(--mp-text-default); cursor: pointer; }
.cwc-agent-btn:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); border-color: var(--mp-border-bold, #8c9596); }
.cwc-agent-btn svg { color: var(--mp-text-secondary); flex: 0 0 auto; }
.cwc-agent-av { width: 24px; height: 24px; border-radius: 50%; object-fit: cover; background: var(--mp-background-neutral-subtle, #f8f9f9); flex: 0 0 auto; }
.cwc-agent-text { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; line-height: 1.2; }
.cwc-agent-name { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-medium, 500); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
.cwc-agent-role { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 220px; }
.cwc-agent-menu { position: absolute; top: calc(100% + 4px); left: 0; z-index: 50; min-width: 280px; max-height: 340px; overflow-y: auto; background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 10px); box-shadow: var(--mp-shadows-md); padding: var(--mp-spacing-1, 4px); }
.cwc-agent-item { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); width: 100%; padding: var(--mp-spacing-2, 8px); border: none; background: none; border-radius: var(--mp-radii-md, 6px); cursor: pointer; font-family: inherit; text-align: left; }
.cwc-agent-item:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.cwc-agent-item.is-active { background: var(--mp-background-neutral-subtle, #f0f1f3); }
.cwc-agent-meta { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.cwc-agent-check { color: var(--mp-icon-brand, #029861); flex: 0 0 auto; }

/* Rooms dropdown */
.cwc-rooms-wrap { position: relative; }
.cwc-rooms-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-1, 4px); max-width: 240px; padding: var(--mp-spacing-1, 4px) var(--mp-spacing-2, 8px); border: none; background: none; border-radius: var(--mp-radii-md, 6px); cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); }
.cwc-rooms-btn:hover { background: var(--mp-background-neutral-hovered); }
.cwc-rooms-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cwc-chevron { transition: transform 0.15s ease; color: var(--mp-text-secondary); flex: 0 0 auto; }
.cwc-chevron.is-open { transform: rotate(180deg); }
.cwc-rooms-menu { position: absolute; top: calc(100% + 4px); right: 0; z-index: 50; min-width: 280px; max-height: 360px; overflow-y: auto; background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 10px); box-shadow: var(--mp-shadows-md); padding: var(--mp-spacing-1, 4px); }
.cwc-rooms-new { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); width: 100%; padding: var(--mp-spacing-2, 8px); border: none; background: none; border-radius: var(--mp-radii-md, 6px); cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); text-align: left; }
.cwc-rooms-new:hover { background: var(--mp-background-neutral-subtle); }
.cwc-rooms-sep { height: 1px; background: var(--mp-border-default, #e3e7e9); margin: var(--mp-spacing-1) 0; }
.cwc-rooms-group { margin: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cwc-rooms-item { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: var(--mp-spacing-2, 8px); border: none; background: none; border-radius: var(--mp-radii-md, 6px); cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); text-align: left; }
.cwc-rooms-item:hover { background: var(--mp-background-neutral-subtle); }
.cwc-rooms-item.is-active { background: var(--mp-background-neutral-subtle, #f0f1f3); }
.cwc-rooms-item__title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cwc-rooms-item__task { display: inline-flex; align-items: center; gap: 4px; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.cwc-icon-btn { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); border: none; background: transparent; border-radius: var(--mp-radii-md, 6px); cursor: pointer; color: var(--mp-text-secondary); }
.cwc-icon-btn:hover { background: var(--mp-background-neutral-hovered); }
.cwc-kebab-wrap { position: relative; display: inline-flex; }
.cwc-kebab-menu { position: absolute; top: calc(100% + 4px); right: 0; z-index: 50; min-width: 160px; background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 10px); box-shadow: var(--mp-shadows-md); padding: var(--mp-spacing-1, 4px); }
.cwc-kebab-item { display: block; width: 100%; padding: var(--mp-spacing-2, 8px); border: none; background: none; border-radius: var(--mp-radii-md, 6px); cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); text-align: left; }
.cwc-kebab-item:hover { background: var(--mp-background-neutral-subtle); }
.cwc-kebab-item--danger { color: var(--mp-text-critical, #d3382e); }

/* ── Body ──────────────────────────────────────────────────────────────────── */
.cwc-body { flex: 1; min-height: 0; overflow: hidden; padding: var(--mp-spacing-4) 0; display: flex; flex-direction: column; justify-content: flex-end; }
.cwc-body--has-messages { justify-content: flex-start; overflow-y: auto; }

.cwc-greetings { display: flex; flex-direction: column; gap: var(--mp-spacing-2); flex-shrink: 0; }
.cwc-mascot { display: block; width: 60px; height: 63px; }
.cwc-greeting-title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.cwc-greeting-msg { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); }
.cwc-suggestions { display: flex; flex-direction: column; flex-shrink: 0; margin-top: var(--mp-spacing-2); }
.cwc-suggestion { display: flex; align-items: flex-start; gap: var(--mp-spacing-1); padding: var(--mp-spacing-2) 0; background: none; border: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: left; line-height: var(--mp-line-heights-md); width: 100%; }
.cwc-suggestion:hover { opacity: 0.7; }
.cwc-sug-icon { flex-shrink: 0; }

/* Message bubbles — identical to the drawer's */
.chat-message { display: flex; align-items: flex-start; gap: var(--mp-spacing-2); margin-bottom: var(--mp-spacing-3); flex-shrink: 0; }
.chat-message--user { flex-direction: row-reverse; }
.chat-avatar { flex-shrink: 0; border-radius: var(--mp-radii-full, 50%); }
.chat-bubble { padding: var(--mp-spacing-2) var(--mp-spacing-3); border-radius: var(--mp-radii-lg, 12px); font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); max-width: 85%; word-break: break-word; }
.chat-bubble__text { white-space: pre-wrap; }
.chat-bubble--user { background: var(--mp-airene-default); color: var(--mp-text-inverse); border-radius: var(--mp-radii-lg, 12px) var(--mp-radii-sm) var(--mp-radii-lg, 12px) var(--mp-radii-lg, 12px); }
.chat-bubble--assistant { background: var(--mp-background-neutral-subtle); color: var(--mp-text-default); border-radius: var(--mp-radii-sm) var(--mp-radii-lg, 12px) var(--mp-radii-lg, 12px) var(--mp-radii-lg, 12px); }
.chat-bubble__rich { white-space: normal; }
.chat-bubble__rich :deep(.chat-md-p) { margin: 0; }
.chat-bubble__rich :deep(.chat-md-p + .chat-md-p) { margin-top: var(--mp-spacing-2, 8px); }
.chat-bubble__rich :deep(.chat-md-h) { margin: var(--mp-spacing-3, 12px) 0 var(--mp-spacing-1, 4px); font-weight: var(--mp-font-weights-semi-bold, 600); }
.chat-bubble__rich :deep(.chat-md-h:first-child) { margin-top: 0; }
.chat-bubble__rich :deep(.chat-md-ul) { margin: var(--mp-spacing-1, 4px) 0; padding-inline-start: var(--mp-spacing-4, 16px); }
.chat-bubble__rich :deep(.chat-md-ul li) { margin: 2px 0; }
.chat-bubble__rich :deep(strong) { font-weight: var(--mp-font-weights-semi-bold, 600); }
.chat-bubble__rich :deep(code) { font-family: var(--mp-fonts-mono, monospace); font-size: 0.9em; background: rgba(0,0,0,0.05); padding: 0 4px; border-radius: 4px; }
/* Employee mention chips (v-html content needs :deep()) */
.chat-bubble__rich :deep(.emp-chip) { position: relative; display: inline-flex; align-items: center; gap: 4px; padding: 1px 6px 1px 2px; margin: 0 1px; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default, #e3e7e9); cursor: default; }
.chat-bubble__rich :deep(.emp-chip-name) { font-weight: var(--mp-font-weights-semi-bold, 600); }
.chat-bubble__rich :deep(.emp-chip-av) { width: 16px; height: 16px; border-radius: 50%; background-size: cover; background-position: center; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.chat-bubble__rich :deep(.emp-chip-av--ini) { font-size: 9px; font-weight: 700; color: var(--mp-text-brand, #1d55d4); background: var(--mp-background-neutral-subtle, #f1f3f4); }
.chat-bubble__rich :deep(.emp-coach) { display: none; position: absolute; bottom: calc(100% + 6px); left: 0; z-index: 30; gap: 8px; min-width: 200px; padding: 8px; border-radius: var(--mp-radii-lg, 10px); background: var(--mp-background-neutral, #fff); border: 1px solid var(--mp-border-default, #e3e7e9); box-shadow: var(--mp-shadows-md); }
.chat-bubble__rich :deep(.emp-chip:hover .emp-coach),
.chat-bubble__rich :deep(.emp-chip:focus .emp-coach),
.chat-bubble__rich :deep(.emp-chip:focus-within .emp-coach) { display: flex; }
.chat-bubble__rich :deep(.emp-coach-av) { width: 32px; height: 32px; border-radius: 50%; background-size: cover; background-position: center; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; }
.chat-bubble__rich :deep(.emp-coach-body) { display: flex; flex-direction: column; gap: 1px; }
.chat-bubble__rich :deep(.emp-coach-name) { font-weight: var(--mp-font-weights-semi-bold, 600); color: var(--mp-text-default); font-size: var(--mp-font-sizes-sm, 14px); }
.chat-bubble__rich :deep(.emp-coach-meta) { font-size: var(--mp-font-sizes-xs, 12px); color: var(--mp-text-secondary); }

.chat-typing { display: flex; align-items: center; gap: var(--mp-spacing-1); padding: var(--mp-spacing-2\.5, 10px) var(--mp-spacing-3); min-height: var(--mp-sizes-9, 36px); }
.typing-dot { width: var(--mp-sizes-1\.5, 6px); height: var(--mp-sizes-1\.5, 6px); border-radius: var(--mp-radii-full, 50%); background: var(--mp-text-secondary); flex-shrink: 0; animation: cwcTypingBounce 1.2s infinite ease-in-out; }
.typing-dot:nth-child(2) { animation-delay: 0.2s; }
.typing-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes cwcTypingBounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
  40%           { transform: translateY(-5px); opacity: 1; }
}

/* ── Composer ──────────────────────────────────────────────────────────────── */
.cwc-footer { flex-shrink: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); padding-bottom: var(--mp-spacing-6); }
.cwc-input-box { background: var(--mp-background-neutral); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-lg, 12px); padding: var(--mp-spacing-2); display: flex; flex-direction: column; gap: var(--mp-spacing-3); }
.cwc-input-box:focus-within { border-color: var(--mp-border-bold, #8c9596); }
.cwc-context-row { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-1); }
.cwc-context-chip { display: inline-flex; align-items: center; gap: var(--mp-spacing-1); min-width: 0; max-width: 100%; padding: 3px var(--mp-spacing-2); background: var(--mp-background-neutral-subtle); border: 1px solid var(--mp-border-default); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-sm); line-height: var(--mp-line-heights-sm, 16px); color: var(--mp-text-default); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cwc-spark { flex: 0 0 auto; color: var(--mp-icon-brand, #6b3df5); }
.cwc-context-link { flex: 0 0 auto; border: none; background: none; padding: 0 0 0 var(--mp-spacing-1); cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-link); }
.cwc-context-link:hover { text-decoration: underline; text-underline-offset: 2px; }
.cwc-input-row { display: flex; }
.cwc-input { width: 100%; border: none; outline: none; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); background: transparent; padding: 0; font-family: inherit; }
.cwc-input::placeholder { color: var(--mp-text-placeholder); }
.cwc-input-actions { display: flex; align-items: center; justify-content: space-between; }
.cwc-add-btn { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-7, 28px); height: var(--mp-sizes-7, 28px); padding: var(--mp-spacing-1); border: none; background: transparent; cursor: pointer; border-radius: var(--mp-radii-sm); color: var(--mp-text-secondary); }
.cwc-add-btn:hover { background: var(--mp-background-neutral-subtle); }
.cwc-input-right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cwc-model-label { display: flex; align-items: center; gap: var(--mp-spacing-1); font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cwc-send-btn { display: inline-flex; align-items: center; justify-content: center; width: var(--mp-sizes-8, 32px); height: var(--mp-sizes-8, 32px); border: none; background: var(--mp-background-neutral-subtle); border-radius: var(--mp-radii-full, 999px); cursor: pointer; flex-shrink: 0; color: var(--mp-text-default); }
.cwc-send-btn:hover { background: var(--mp-background-neutral-hovered); }
.cwc-disclaimer { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); text-align: center; }
.cwc-disclaimer-link { color: var(--mp-text-link); cursor: pointer; }
.cwc-disclaimer-link:hover { text-decoration: underline; text-underline-offset: 2px; }
</style>
