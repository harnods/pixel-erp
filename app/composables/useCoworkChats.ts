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
  // ── Multi-agent room: scaling production for a big new sales order ──────────
  // HR agent leads the people side (headcount · overtime · payroll) while the
  // Sales and Production agents feed it context. The human steers in the room.
  {
    id: 'room-prod-scale',
    title: 'Why did payroll increase this month?',
    module: 'HR',
    agentId: 'hr',
    taskId: 'CW-2050',
    restrictAgents: ['hr', 'production', 'sales'],
    createdAt: Date.now() - 3_600_000, // ~1h ago → top of Recent
    // Kept short on purpose: the whole room fits one screen (no scrolling).
    messages: [
      { role: 'user', text: 'Why did payroll increase this month?' },
      {
        role: 'assistant', agentId: 'hr',
        text: 'Payroll is up **+18% (Rp 109M)**. Base pay is flat — **~85% is overtime**, plus **3 temporary operators**. Let me check with @Production agent on the OT.',
        attachments: [{ label: 'Overtime · Sep 2026', icon: 'doc', to: '/hr' }],
      },
      {
        role: 'assistant', agentId: 'production',
        text: 'That\'s us — **~120 overtime hrs/week** on packing for a big new order, plus **3 extra operators** to hit the volume.',
        attachments: [{ label: 'Work order · WO-2026-0005', icon: 'doc', to: '/work-orders/WO-2026-0005' }],
      },
      {
        role: 'assistant', agentId: 'sales',
        text: 'Confirmed — the new **Anomali Coffee** order, **+56% volume**, first delivery 20 Sep. That\'s what\'s driving it.',
        attachments: [{ label: 'Sales order · SO-5001', icon: 'shop', to: '/crm/orders/SO-5001' }],
      },
      {
        role: 'assistant', agentId: 'hr',
        text: 'So it\'s **demand-driven, not a leak**. Want me to prepare an executive summary?',
        suggestions: ['Prepare an executive summary', 'Set up a monthly payroll monitor'],
      },
    ],
  },
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

// Keep the scripted multi-agent demo room in sync with the seed for every user —
// inject it if missing, or refresh its contents if an older version is saved. (It
// is a demo, not a user chat, so overwriting is intentional.)
const DEMO_ROOM_ID = 'room-prod-scale'
const seedRoom = CHAT_SEED.find((s) => s.id === DEMO_ROOM_ID)
if (seedRoom) {
  const idx = sessions.value.findIndex((s) => s.id === DEMO_ROOM_ID)
  const fresh = JSON.parse(JSON.stringify(seedRoom))
  if (idx >= 0) sessions.value.splice(idx, 1, fresh)
  else sessions.value.unshift(fresh)
}

// Materialise the seed to the mini-DB on first load, so every surface reads the
// same list (the header search reads the snapshot directly).
persist()

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
