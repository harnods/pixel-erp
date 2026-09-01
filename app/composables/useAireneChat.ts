import { computed, ref, type ComputedRef } from 'vue'
import { useRoute } from 'vue-router'
import { coworkAgents, COWORK_SKILLS, type CoworkAgent } from '~/data/cowork'
import { buildKnowledgeContext, knowledgeCorpus } from '~/data/coworkKb'
import { employees } from '~/data/employees'
import { useAireneBridge, type ChatMessage } from '~/composables/useAireneBridge'
import { useCoworkChats, chatTitleFrom, type CoworkChatSession } from '~/composables/useCoworkChats'
import { useCoworkContext } from '~/composables/useCoworkContext'
import { infoToast } from '~/utils/toasts'
import { toast } from '@mekari/pixel3'

/**
 * useAireneChat — the one chat engine behind every Airene surface.
 *
 * The conversation (messages, the agent you're talking to, what the chat is
 * grounded on) lives at module scope, so the drawer that floats over any ERP
 * page and the full-stage Cowork › Chats page are two views of the SAME chat:
 * open a chat from a Cowork task result in the drawer, walk over to Cowork ›
 * Chats, and you carry on mid-sentence. Rooms are persisted through
 * `useCoworkChats`.
 *
 * Each surface owns only its own DOM concerns (input box, scroll element, which
 * menus are open); everything else is shared from here.
 */

/** Which surface is currently driving the chat — a send from the Chats page must
 *  not pop the drawer open on top of it. */
export type ChatSurface = 'drawer' | 'page'
const surface = ref<ChatSurface>('drawer')

// ── Module-aware greeting + suggestions (general chat, not a task) ────────────
// The Airene drawer lives on every ERP page; when opened without a task context
// its greeting, preset prompts and grounding adapt to the module you're in.
export interface ModuleChat { label: string; greeting: string; suggestions: string[]; ground: string[] }
export const MODULE_CHAT: Record<string, ModuleChat> = {
  HR: { label: 'HR', greeting: 'I can help with employees, attendance, payroll and contracts.',
    suggestions: ['Who was late this week and why?', 'Which contracts expire in the next 60 days?', 'Summarise headcount by department', 'Which employees are resigning?'], ground: ['hr'] },
  Finance: { label: 'Finance', greeting: 'I can help with invoices, bills, cash flow and collections.',
    suggestions: ['Which customers are overdue and why?', 'How much am I owed right now?', 'What needs clearing before month-end close?', 'Draft a payment reminder for the biggest overdue'], ground: ['finance', 'crm'] },
  CRM: { label: 'CRM', greeting: 'I can help with your pipeline, customers and deals.',
    suggestions: ['Which deals should I prioritise?', 'Which deals are stalled?', 'Who are my top customers?', 'Draft a follow-up for a stalled deal'], ground: ['crm', 'finance'] },
  WMS: { label: 'Warehouse', greeting: 'I can help with stock, warehouses and fulfilment.',
    suggestions: ['Which SKUs are below reorder point?', "What's out of stock?", 'What outbound orders are at risk today?', 'Plan today’s cycle counts'], ground: ['wms'] },
  Production: { label: 'Production', greeting: 'I can help with work orders, BOMs and production.',
    suggestions: ['Which work orders are at risk?', 'Check components vs BOM for open work orders', 'What is blocking production today?', 'Summarise open work orders'], ground: ['production', 'wms'] },
  Sales: { label: 'Sales', greeting: 'I can help with orders, quotes and deliveries.',
    suggestions: ['Which sales orders are ready to fulfil?', 'Which orders are blocked on stock?', 'Summarise open sales orders', 'How much am I owed right now?'], ground: ['crm', 'wms', 'finance'] },
  General: { label: 'Mekari ERP', greeting: 'I can help across HR, sales, CRM, warehouse, finance and production.',
    suggestions: ['How much am I owed right now?', 'Which customers are overdue and why?', 'Which SKUs are below reorder point?', 'Who was late this week?'], ground: ['hr', 'crm', 'wms', 'finance', 'production'] },
}
export function moduleKeyFromPath(path: string): keyof typeof MODULE_CHAT {
  const p = path.toLowerCase()
  if (/(^\/hr|employee|attendance|payroll|leave|recruit)/.test(p)) return 'HR'
  if (/(crm|deal|pipeline|prospect|contact)/.test(p)) return 'CRM'
  if (/(work-order|bill-of-material|production|bom)/.test(p)) return 'Production'
  if (/(sales-order|sales-quote|sales-deliver|quote)/.test(p)) return 'Sales'
  if (/(warehouse|storage|receiv|picking|packing|deliver|stock|inbound|outbound|cycle|put-away|transfer|courier|shipment|product)/.test(p)) return 'WMS'
  if (/(invoice|bill|cash|expense|bank|purchase|payment|journal|finance|jurnal|tax)/.test(p)) return 'Finance'
  return 'General'
}

// ── Shared conversation state ─────────────────────────────────────────────────
// Context chip — set when the chat is opened about something (e.g. a task result).
const chatContext = ref('')
// Grounding context fed to the model (e.g. a Cowork task result). Not shown.
const aireneGround = ref('')
// The Cowork task this chat was opened from, when it came from one. Saved with
// the room so the Chats page can label it and pick the conversation back up.
const chatTaskId = ref('')
const isTyping = ref(false)
// Bumped after every message so each surface can scroll its own body element.
const scrollSignal = ref(0)

// When the chat is opened about a specific task result, the empty-state greeting
// and suggestions become contextual to that result instead of the generic ones.
export const DEFAULT_CONTEXT_SUGGESTIONS = [
  'What should I do first?',
  'Draft a follow-up message I can send',
  'Summarise this in 3 bullet points',
  'What are the risks or blockers here?',
]
const contextSuggestions = ref<string[]>([...DEFAULT_CONTEXT_SUGGESTIONS])

// ── Rich chat rendering: light markdown + employee mention chips ──────────────
function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function escapeReg(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function initialsOf(name: string): string {
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('')
}
/** Minimal inline markdown → HTML (bold, italic, bullets, GFM tables). */
export function mdToHtml(text: string): string {
  const lines = escapeHtml(text).split('\n')
  const out: string[] = []
  let inList = false
  const closeList = () => { if (inList) { out.push('</ul>'); inList = false } }
  // A table row is `| … | … |`; the separator is that made of only |, -, : and space.
  const isRow = (s: string) => /^\s*\|.*\|\s*$/.test(s)
  const isSep = (s: string) => isRow(s) && /^[\s|:-]+$/.test(s.trim()) && s.includes('-')
  const cells = (s: string) => s.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())
  const alignOf = (c: string) => (c.startsWith(':') && c.endsWith(':')) ? 'center' : c.endsWith(':') ? 'right' : ''

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!

    // ── GFM table: header row directly followed by a |---|---| separator ──
    if (isRow(raw) && i + 1 < lines.length && isSep(lines[i + 1]!)) {
      closeList()
      const header = cells(raw)
      const aligns = cells(lines[i + 1]!).map(alignOf)
      i += 2
      const body: string[][] = []
      while (i < lines.length && isRow(lines[i]!) && !isSep(lines[i]!)) { body.push(cells(lines[i]!)); i++ }
      i-- // the for-loop will re-increment
      const cellStyle = (ci: number) => (aligns[ci] ? ` style="text-align:${aligns[ci]}"` : '')
      let t = '<div class="chat-md-tablewrap"><table class="chat-md-table"><thead><tr>'
      header.forEach((h, ci) => { t += `<th${cellStyle(ci)}>${h}</th>` })
      t += '</tr></thead><tbody>'
      for (const r of body) {
        t += '<tr>'
        header.forEach((_, ci) => { t += `<td${cellStyle(ci)}>${r[ci] ?? ''}</td>` })
        t += '</tr>'
      }
      t += '</tbody></table></div>'
      out.push(t)
      continue
    }

    const heading = /^\s*#{1,6}\s+(.*)$/.exec(raw)
    if (heading) {
      closeList()
      out.push(`<p class="chat-md-h">${heading[1]}</p>`)
      continue
    }
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(raw)
    if (bullet) {
      if (!inList) { out.push('<ul class="chat-md-ul">'); inList = true }
      out.push(`<li>${bullet[1]}</li>`)
      continue
    }
    closeList()
    out.push(raw.length ? `<p class="chat-md-p">${raw}</p>` : '')
  }
  if (inList) out.push('</ul>')
  return out.join('')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*(?!\*)(.+?)\*(?!\*)/g, '$1<em>$2</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
}
/** Wrap any known employee full name in an avatar chip with a hover coachmark. */
function withEmployeeChips(html: string): string {
  const names = employees.map((e) => e.fullName).filter(Boolean).sort((a, b) => b.length - a.length)
  if (!names.length) return html
  const re = new RegExp('(' + names.map(escapeReg).join('|') + ')', 'g')
  return html.replace(re, (m) => {
    const e = employees.find((x) => x.fullName === m)
    if (!e) return m
    const ini = initialsOf(e.fullName)
    const av = e.photo
      ? `<span class="emp-chip-av" style="background-image:url('${e.photo}')"></span>`
      : `<span class="emp-chip-av emp-chip-av--ini">${ini}</span>`
    const cav = e.photo
      ? `<span class="emp-coach-av" style="background-image:url('${e.photo}')"></span>`
      : `<span class="emp-coach-av emp-chip-av--ini">${ini}</span>`
    return `<span class="emp-chip" tabindex="0">${av}<span class="emp-chip-name">${m}</span>` +
      `<span class="emp-coach">${cav}<span class="emp-coach-body">` +
      `<span class="emp-coach-name">${e.fullName}</span>` +
      `<span class="emp-coach-meta">${e.employeeId ?? ''}</span>` +
      `<span class="emp-coach-meta">${[e.jobPosition, e.department].filter(Boolean).join(' · ')}</span>` +
      `</span></span></span>`
  })
}
/** Turn `@Agent Name` into a styled mention chip (longest names first so
 *  "@Production agent" wins over a shorter partial). */
function withAgentMentions(html: string): string {
  const names = coworkAgents.map((a) => a.name).sort((a, b) => b.length - a.length)
  for (const n of names) {
    const re = new RegExp('@' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
    html = html.replace(re, `<span class="agent-mention">@${n}</span>`)
  }
  return html
}

export function renderMessage(text: string): string {
  return withAgentMentions(withEmployeeChips(mdToHtml(text)))
}

export function useAireneChat() {
  const route = useRoute()
  const bridge = useAireneBridge()
  const chats = useCoworkChats()
  const { build: buildCoworkContext } = useCoworkContext()

  const messages = bridge.messages
  const activeSessionId = bridge.activeSessionId

  const moduleInfo = computed<ModuleChat>(() => MODULE_CHAT[moduleKeyFromPath(route.path)] ?? MODULE_CHAT.General!)

  // Title: derived from first user message, or "New chat"
  const chatTitle = computed(() => chatTitleFrom(messages.value))

  // ── Agent switcher ──────────────────────────────────────────────────────────
  // You chat WITH an agent. In a general ERP-module chat you can pick any agent;
  // in a Cowork-task chat the choice is limited to the agent(s) that own the task
  // (one agent → locked, several → switchable). The model then answers
  // in-character and declines anything outside that agent's area/skills.
  const activeAgentId = bridge.activeAgentId
  const restrictAgents = bridge.restrictAgents
  const availableAgents = computed<CoworkAgent[]>(() =>
    restrictAgents.value.length
      ? coworkAgents.filter((a) => restrictAgents.value.includes(a.id))
      : coworkAgents)
  const activeAgent = computed<CoworkAgent | undefined>(() =>
    availableAgents.value.find((a) => a.id === activeAgentId.value)
    ?? availableAgents.value[0]
    ?? coworkAgents.find((a) => a.id === 'airene'))
  const canSwitchAgent = computed(() => availableAgents.value.length > 1)
  function pickAgent(a: CoworkAgent) { activeAgentId.value = a.id }

  // Payload sent to the chat API so the model role-plays the agent and gates answers.
  function activeAgentPayload() {
    const a = activeAgent.value
    if (!a) return undefined
    const skills = (a.skills ?? []).map((id) => COWORK_SKILLS.find((s) => s.id === id)?.name).filter(Boolean)
    return { name: a.name, role: a.role, module: a.module, persona: a.instruction || a.persona, skills }
  }
  // KB grounding for the active agent: relevance-injected snippets (ranked against
  // the user's message) plus a compact corpus so the model can also call
  // search_knowledge. Undefined when the agent has no knowledge attached.
  function activeKnowledgePayload(query: string) {
    const att = activeAgent.value?.knowledge
    if (!att?.length) return undefined
    const snippets = buildKnowledgeContext(att, query)
    const corpus = knowledgeCorpus(att)
    if (!corpus.length) return undefined
    return { snippets, corpus }
  }

  // Grounding snapshot for a general (non-task) chat — just the modules relevant to
  // the page the user opened the chat from, so answers stay accurate.
  function buildModuleGround(): string {
    try {
      const snap = buildCoworkContext() as Record<string, unknown>
      const info = moduleInfo.value
      const slice: Record<string, unknown> = {}
      for (const k of info.ground) if (snap[k]) slice[k] = snap[k]
      return `You are Airene helping the user inside the ${info.label} area of the Mekari ERP. `
        + `Today is ${snap.today}. Answer from this real ERP data; if asked about something outside it, say so briefly.\n`
        + JSON.stringify(slice)
    } catch { return '' }
  }

  // Upsert the currently-shown conversation into the persisted history, so it's
  // available from any module — and from the Cowork › Chats page — without an
  // explicit "save" step. The grounding/agent state travels with it so a task chat
  // reopened elsewhere continues where it left off instead of starting cold.
  function persistActiveSession() {
    const id = chats.upsert(activeSessionId.value, messages.value, {
      module: chatContext.value ? undefined : moduleInfo.value.label,
      agentId: activeAgent.value?.id,
      restrictAgents: [...restrictAgents.value],
      ground: aireneGround.value,
      contextLabel: chatContext.value,
      taskId: chatTaskId.value || undefined,
      suggestions: [...contextSuggestions.value],
    })
    if (id) activeSessionId.value = id
  }

  async function sendMessage(text: string, context?: string) {
    const trimmed = text.trim()
    if (!trimmed) return

    // Set context chip (only from AI popover)
    if (context) chatContext.value = context

    // Open the drawer if it isn't already — unless the full-stage Chats page is
    // the surface in use, which already shows this conversation.
    if (surface.value === 'drawer') bridge.isOpen.value = true

    messages.value.push({ role: 'user', text: trimmed })
    scrollSignal.value++
    await runAssistantTurn(trimmed)
  }

  // Fetch + append one assistant reply for the conversation as it currently stands
  // (the last message must be the user turn being answered). Shared by sendMessage
  // and regenerate. `prompt` is the user text driving this turn (for grounding).
  // Per-agent grounding for a room: each colleague sees only the ERP modules that
  // belong to its own area, so it answers from its own data (not the whole ERP).
  function groundForModule(snap: Record<string, unknown>, moduleLabel?: string): string {
    const info = MODULE_CHAT[(moduleLabel as keyof typeof MODULE_CHAT)] ?? MODULE_CHAT.General!
    const slice: Record<string, unknown> = {}
    for (const k of info.ground) if (snap[k]) slice[k] = snap[k]
    return `Today is ${snap.today}. This is your own area data:\n${JSON.stringify(slice)}`
  }

  // A multi-agent room turn: the lead agent answers and may consult colleagues.
  // The server returns an ordered list of turns (lead narration, each colleague's
  // grounded answer, the final synthesis); each is appended tagged with its agent.
  async function runRoomTurn(): Promise<boolean> {
    let snap: Record<string, unknown> = {}
    try { snap = buildCoworkContext() as Record<string, unknown> } catch { /* keep empty */ }
    const roomAgents = availableAgents.value
    const grounds: Record<string, string> = {}
    for (const a of roomAgents) grounds[a.id] = groundForModule(snap, a.module)
    const toPayload = (a: CoworkAgent) => ({
      id: a.id, name: a.name, role: a.role, module: a.module,
      persona: a.instruction || a.persona,
      skills: (a.skills ?? []).map((id) => COWORK_SKILLS.find((s) => s.id === id)?.name).filter(Boolean) as string[],
    })
    const lead = activeAgent.value
    if (!lead) return false
    try {
      const res = await $fetch<{ turns?: { agentId: string; text: string }[]; source?: string }>('/api/cowork/room', {
        method: 'POST',
        body: {
          messages: messages.value.map((m: ChatMessage) => ({ role: m.role, text: m.text })),
          lead: toPayload(lead),
          agents: roomAgents.map(toPayload),
          grounds,
        },
      })
      const turns = res.turns ?? []
      if (!turns.length) return false
      for (const t of turns) messages.value.push({ role: 'assistant', text: t.text, agentId: t.agentId })
      return true
    } catch {
      return false
    }
  }

  async function runAssistantTurn(prompt: string) {
    isTyping.value = true
    // Multi-agent room (an explicit set of ≥2 agents): the lead answers and can
    // pull in colleagues. Falls through to the single-agent path on any failure.
    if (restrictAgents.value.length > 1) {
      const ok = await runRoomTurn()
      isTyping.value = false
      if (ok) { persistActiveSession(); scrollSignal.value++; return }
      isTyping.value = true
    }
    let reply = ''
    let ok = false
    let citeCount = 0
    try {
      const res = await $fetch<{ reply: string; source?: string; citations?: unknown[] }>('/api/cowork/chat', {
        method: 'POST',
        body: {
          messages: messages.value.map((m: ChatMessage) => ({ role: m.role, text: m.text })),
          context: aireneGround.value || buildModuleGround(),
          agent: activeAgentPayload(),
          roster: coworkAgents.map((a) => ({ name: a.name, role: a.role, module: a.module })),
          knowledge: activeKnowledgePayload(prompt),
        },
      })
      reply = res.reply
      ok = res.source === 'gemini'
      citeCount = Array.isArray(res.citations) ? res.citations.length : 0
    } catch {
      reply = 'Sorry — I hit an error reaching the model. Please try again.'
    }
    isTyping.value = false
    // "What I did" line for the collapsible reasoning header (only on a real answer).
    const ground = chatContext.value
      ? `the result “${chatContext.value}”`
      : (activeAgent.value && activeAgent.value.id !== 'airene'
          ? `your live ${activeAgent.value.role ?? activeAgent.value.name} data`
          : `your live ${moduleInfo.value.label} data`)
    const reasoning = ok
      ? `Read your request, pulled ${ground}, and grounded the answer in it${citeCount ? ` (${citeCount} source${citeCount === 1 ? '' : 's'})` : ''}.`
      : undefined
    messages.value.push({ role: 'assistant', text: reply, reasoning })
    persistActiveSession()
    scrollSignal.value++
  }

  // Retry: drop the trailing assistant reply (back to the last user turn) and
  // ask the model again for the same prompt.
  async function regenerate() {
    while (messages.value.length && messages.value[messages.value.length - 1]!.role === 'assistant') messages.value.pop()
    const last = messages.value[messages.value.length - 1]
    if (!last || last.role !== 'user') return
    await runAssistantTurn(last.text)
  }

  function startNewChat() {
    // Current chat is already persisted (upserted on each reply); just reset the view.
    messages.value = []
    activeSessionId.value = null
    chatContext.value = ''
    aireneGround.value = ''
    chatTaskId.value = ''
    contextSuggestions.value = [...DEFAULT_CONTEXT_SUGGESTIONS]
    // A fresh chat is general (any agent), back to the default assistant.
    restrictAgents.value = []
    activeAgentId.value = 'airene'
  }

  // Reopening a saved room restores its transcript AND what it was grounded on, so
  // a chat that started from a Cowork task keeps answering about that task.
  function loadSession(session: CoworkChatSession) {
    messages.value = [...session.messages]
    activeSessionId.value = session.id
    chatContext.value = session.contextLabel ?? ''
    aireneGround.value = session.ground ?? ''
    chatTaskId.value = session.taskId ?? ''
    contextSuggestions.value = session.suggestions?.length
      ? [...session.suggestions]
      : [...DEFAULT_CONTEXT_SUGGESTIONS]
    restrictAgents.value = session.restrictAgents ? [...session.restrictAgents] : []
    if (session.agentId) activeAgentId.value = session.agentId
    scrollSignal.value++
  }

  function resetView() {
    messages.value = []
    activeSessionId.value = null
    chatContext.value = ''
    aireneGround.value = ''
    chatTaskId.value = ''
  }
  function clearChat() {
    chats.remove(activeSessionId.value)
    resetView()
    infoToast('Chat cleared')
  }
  function deleteChat() {
    chats.remove(activeSessionId.value)
    resetView()
    toast.notify({ variant: 'success', title: 'Chat deleted' })
  }

  return {
    // Shared conversation
    messages,
    activeSessionId,
    isTyping,
    chatContext,
    aireneGround,
    chatTaskId,
    contextSuggestions,
    chatTitle,
    scrollSignal,
    surface,
    // Rooms
    sessions: chats.sessions,
    groupedHistory: computed(() => chats.grouped()) as ComputedRef<ReturnType<typeof chats.grouped>>,
    // Module awareness
    moduleInfo,
    // Agents
    availableAgents,
    activeAgent,
    activeAgentId,
    restrictAgents,
    canSwitchAgent,
    pickAgent,
    // Actions
    sendMessage,
    regenerate,
    persistActiveSession,
    startNewChat,
    loadSession,
    clearChat,
    deleteChat,
    renderMessage,
  }
}
