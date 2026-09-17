import { ref } from 'vue'
import type { ChatCard } from '~/data/coworkGoals'

export interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
  /** Structured half of an agent's reply — a plan, a pushback, a list of tools
   *  to connect. The prose lives in `text`; anything the user must act on
   *  renders as a card beneath it. See `ChatCard` in `data/coworkGoals.ts`. */
  card?: ChatCard
  /** Short "what I did" line for an assistant reply — shown as the collapsible
   *  "Done ›" reasoning header above the answer. */
  reasoning?: string
  /** Multi-agent rooms: the agent that authored this assistant turn (id from
   *  `coworkAgents`). When set, the message shows that agent's avatar + name so a
   *  room with several agents reads like a group chat. Absent = the room's single
   *  active agent (plain answer, no name). */
  agentId?: string
  /** Record chips shown beneath a message — a linked ERP record (work order,
   *  sales order, …). Clicking navigates to it. */
  attachments?: { label: string; sublabel?: string; icon?: string; to: string }[]
  /** Suggestion chips shown beneath an agent's message (e.g. "Prepare an
   *  executive summary") — clicking sends the text as the next turn. */
  suggestions?: string[]
}

/**
 * Global bridge to the Airene chat panel.
 *
 * The panel UI + its open/send logic live in `pages/[...slug].vue` (inside the
 * routed page). Components that sit ABOVE the page in the tree — e.g. the header
 * search in `layouts/default.vue` — can't reach it via provide/inject (that only
 * flows downward). This module-level singleton lets any component request an
 * action; `[...slug].vue` watches the signals and performs it.
 */
// Live panel state — hoisted to module scope so the open/closed state AND the
// current conversation survive page navigation (the routed [...slug].vue can be
// re-created as the user moves between modules; module-level refs are not).
const isOpen = ref(false)
const messages = ref<ChatMessage[]>([])
const activeSessionId = ref<string | null>(null)
// Which agent the user is chatting with (agent id). `restrictAgents` limits the
// switcher to a set (e.g. the agents that own the task the chat was opened about);
// empty = any agent can be picked (general ERP-module chat).
const activeAgentId = ref<string>('airene')
const restrictAgents = ref<string[]>([])

const toggleSignal = ref(0)
const sendSignal = ref(0)
const pendingText = ref('')
// Open the panel grounded on a context (e.g. a Cowork task result): `ground` is
// fed to the model, `label` is the visible context chip.
const openContextSignal = ref(0)
const pendingGround = ref('')
const pendingLabel = ref('')
// Suggested follow-up prompts tailored to the opened context (e.g. referencing
// the actual overdue customer or late employee in a task result).
const pendingSuggestions = ref<string[]>([])
// The Cowork task the context came from (when opened from a task result), so the
// saved chat room can be labelled and picked back up on the Cowork › Chats page.
const pendingTaskId = ref('')
// When true, the next send starts a fresh chat first (e.g. a prompt from search).
const pendingFresh = ref(false)
// Open a specific persisted chat session by id (e.g. a "recent chat" from search).
const openSessionSignal = ref(0)
const pendingSessionId = ref('')

export function useAireneBridge() {
  return {
    // Live panel state (persist across navigation)
    isOpen,
    messages,
    activeSessionId,
    activeAgentId,
    restrictAgents,
    // Signals watched by [...slug].vue
    toggleSignal,
    sendSignal,
    pendingText,
    pendingFresh,
    openContextSignal,
    pendingGround,
    pendingLabel,
    pendingSuggestions,
    pendingTaskId,
    openSessionSignal,
    pendingSessionId,
    // Actions any component can call
    requestToggle() { toggleSignal.value++ },
    /** Open the chat and send a prompt. `fresh` starts a new chat first. */
    requestSend(text: string, fresh = false) {
      const t = (text ?? '').trim()
      if (!t) return
      pendingText.value = t
      pendingFresh.value = fresh
      sendSignal.value++
    },
    /** Open the chat with a grounding context but no message sent yet. `agents`
     *  restricts (and defaults) the agent switcher — e.g. the agents that own the
     *  task this chat is about. One agent → locked; multiple → switchable.
     *  `taskId` tags the saved room with the Cowork task it came from. */
    openWithContext(ground: string, label: string, suggestions: string[] = [], agents: string[] = [], taskId = '') {
      pendingGround.value = ground
      pendingLabel.value = label
      pendingSuggestions.value = suggestions
      pendingTaskId.value = taskId
      restrictAgents.value = agents
      if (agents.length) activeAgentId.value = agents[0]!
      openContextSignal.value++
    },
    /** Open a previously-saved chat session by id (from the mini-DB history). */
    openSession(id: string) {
      pendingSessionId.value = id
      openSessionSignal.value++
    },
  }
}
