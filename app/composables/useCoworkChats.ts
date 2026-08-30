import { ref } from 'vue'
import { loadSnapshot, saveSnapshot } from '~/data/persist'
import type { ChatMessage } from '~/composables/useAireneBridge'

/**
 * Cowork chats mini-DB — the persisted chat rooms shared by every chat surface:
 *
 *  · the Airene drawer (`pages/[...slug].vue`), which floats over any ERP page,
 *  · the Cowork › Chats page (`CoworkChatsPage.vue`), the full-stage chat, and
 *  · the header search's "Recent chats".
 *
 * One store, one localStorage key (`airene-chats-v1`), module-level so the list
 * is the same object in every surface: a chat started in the drawer (e.g. from a
 * Cowork task result) is immediately continuable on the Chats page, and vice
 * versa. Sessions carry the grounding/agent state alongside the transcript so
 * reopening one restores the conversation exactly, not just its messages.
 */

export interface CoworkChatSession {
  id: string
  title: string
  messages: ChatMessage[]
  createdAt: number       // timestamp ms
  module?: string         // which ERP module the chat started in (history label)
  // ── Continuation state — what the chat was grounded on and who it was with ──
  /** Agent id the user was chatting with. */
  agentId?: string
  /** Agent ids the chat is scoped to (task chats); empty/absent = any agent. */
  restrictAgents?: string[]
  /** Grounding context fed to the model (e.g. a Cowork task result). Not shown. */
  ground?: string
  /** Visible context chip label (e.g. the task title). */
  contextLabel?: string
  /** The Cowork task this chat was opened from, when it came from one. */
  taskId?: string
  /** Follow-up prompts tailored to the context (empty-state suggestions). */
  suggestions?: string[]
}

const DAY = 86_400_000
const KEY = 'airene-chats-v1'

/** Seed history (relative to real Date.now()) so the list is never empty. */
const CHAT_SEED: CoworkChatSession[] = [
  {
    id: 'h1',
    title: 'Draft WhatsApp reminder',
    messages: [
      { role: 'user', text: 'Draft a WhatsApp reminder for invoice #40030' },
      { role: 'assistant', text: 'Sure! Here\'s a friendly WhatsApp reminder draft:\n\n"Hi The Daily Grind team! 👋 Just a quick reminder that invoice #40030 for Rp4,500,000 was due 2 days ago."' },
    ],
    createdAt: Date.now() - DAY,
    module: 'Finance',
  },
  {
    id: 'h2',
    title: 'How much am I owed?',
    messages: [
      { role: 'user', text: 'How much am I owed?' },
      { role: 'assistant', text: 'Based on your open invoices, you are currently owed Rp 640,200,000 across 12 unpaid invoices.' },
    ],
    createdAt: Date.now() - DAY * 2,
    module: 'Finance',
  },
  {
    id: 'h3',
    title: 'Compare revenue this month vs last month',
    messages: [
      { role: 'user', text: 'Compare revenue this month vs last month' },
      { role: 'assistant', text: 'This month: Rp 310,500,000\nLast month: Rp 275,200,000\n\nThat\'s a +12.8% increase. Great momentum! 🚀' },
    ],
    createdAt: Date.now() - DAY * 5,
    module: 'Finance',
  },
  {
    id: 'h4',
    title: 'How do I set up Mekari Pay?',
    messages: [{ role: 'user', text: 'How do I set up Mekari Pay?' }],
    createdAt: Date.now() - DAY * 14,
  },
  {
    id: 'h5',
    title: 'Import sales invoices from CSV',
    messages: [{ role: 'user', text: 'Import sales invoices' }],
    createdAt: Date.now() - DAY * 21,
  },
]

const sessions = ref<CoworkChatSession[]>(loadSnapshot<CoworkChatSession>(KEY) ?? CHAT_SEED)

function persist() { saveSnapshot(KEY, sessions.value) }

// Materialise the seed to the mini-DB on first load, so every surface reads the
// same list (the header search reads the snapshot directly).
if (!loadSnapshot<CoworkChatSession>(KEY)) persist()

/** Title derived from the first user message ("New chat" when there is none). */
export function chatTitleFrom(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === 'user')
  if (!first) return 'New chat'
  const t = first.text.trim()
  return t.length > 32 ? t.slice(0, 32) + '…' : t
}

export function useCoworkChats() {
  return {
    sessions,
    persist,

    get(id: string): CoworkChatSession | undefined {
      return sessions.value.find((s) => s.id === id)
    },

    /**
     * Upsert a live conversation into the history. Returns the session id, so a
     * brand-new chat (id `null`) can be adopted by the caller. `patch` carries
     * the continuation state (agent, grounding, task) — absent keys are left as
     * they are, so a plain reply never wipes a task chat's context.
     */
    upsert(id: string | null, messages: ChatMessage[], patch: Partial<CoworkChatSession> = {}): string | null {
      if (!messages.length) return id
      const title = chatTitleFrom(messages)
      const existing = id ? sessions.value.find((s) => s.id === id) : null
      if (existing) {
        Object.assign(existing, patch)
        existing.title = title
        existing.messages = [...messages]
        persist()
        return existing.id
      }
      const newId = Date.now().toString()
      sessions.value.unshift({ ...patch, id: newId, title, messages: [...messages], createdAt: Date.now() })
      persist()
      return newId
    },

    remove(id: string | null): void {
      if (!id) return
      const i = sessions.value.findIndex((s) => s.id === id)
      if (i >= 0) { sessions.value.splice(i, 1); persist() }
    },

    /** Sessions grouped for the history dropdown: yesterday / this week / older. */
    grouped(): { yesterday: CoworkChatSession[]; thisWeek: CoworkChatSession[]; older: CoworkChatSession[] } {
      const todayMidnight = new Date()
      todayMidnight.setHours(0, 0, 0, 0)
      const todayStart = todayMidnight.getTime()
      const yesterdayStart = todayStart - DAY
      const weekStart = todayStart - DAY * 6

      const yesterday: CoworkChatSession[] = []
      const thisWeek: CoworkChatSession[] = []
      const older: CoworkChatSession[] = []
      for (const s of sessions.value) {
        if (s.createdAt >= yesterdayStart) yesterday.push(s)
        else if (s.createdAt >= weekStart) thisWeek.push(s)
        else older.push(s)
      }
      return { yesterday, thisWeek, older }
    },
  }
}
