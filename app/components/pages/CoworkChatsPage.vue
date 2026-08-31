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
import { computed, h, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { MpButton, MpIcon, MpPopover, MpPopoverTrigger, MpPopoverContent, MpPopoverList, MpPopoverListItem, MpToggle, css, toast } from '@mekari/pixel3'
import { useAireneChat } from '~/composables/useAireneChat'
import { useAireneBridge } from '~/composables/useAireneBridge'
import { type CoworkChatSession } from '~/composables/useCoworkChats'
import { coworkAgents, coworkConnections, getTask, addTask, type CoworkAgent, type CoworkModule, type CoworkCadence } from '~/data/cowork'
import { useCoworkGoalChat } from '~/composables/useCoworkGoalChat'
import CoworkGoalCard from '~/components/patterns/CoworkGoalCard.vue'
import type { GoalDraft } from '~/data/coworkGoals'

// Gemini mark — 4-point star with Google's multi-hue gradient (model picker).
const GeminiMark = (props: { size?: number }) =>
  h('svg', { width: props.size ?? 16, height: props.size ?? 16, viewBox: '0 0 24 24', fill: 'none', 'aria-hidden': 'true' }, [
    h('defs', [
      h('linearGradient', { id: 'cwc-gemini2', x1: '2', y1: '3', x2: '22', y2: '21', gradientUnits: 'userSpaceOnUse' }, [
        h('stop', { offset: '0', 'stop-color': '#1BA1E3' }),
        h('stop', { offset: '0.3', 'stop-color': '#5489D6' }),
        h('stop', { offset: '0.55', 'stop-color': '#9B72CB' }),
        h('stop', { offset: '0.8', 'stop-color': '#D96570' }),
        h('stop', { offset: '1', 'stop-color': '#F49C46' }),
      ]),
    ]),
    h('path', { d: 'M12 2c.3 4.9 4.8 9.4 9.7 9.7v.6C16.8 12.6 12.3 17.1 12 22h-.6c-.3-4.9-4.8-9.4-9.7-9.7v-.6C6.6 11.4 11.1 6.9 11.4 2H12z', fill: 'url(#cwc-gemini2)' }),
  ])

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

// ── Eye-tracking mascot (empty-state greeting) — pupils follow the cursor ───────
const mascotImgEl  = ref<HTMLElement | null>(null)
const pupilLeftEl  = ref<HTMLElement | null>(null)
const pupilRightEl = ref<HTMLElement | null>(null)
let _tRot = 0, _tTx = 0, _tTy = 0
let _cRot = 0, _cTx = 0, _cTy = 0
let _tEyeX = 0, _tEyeY = 0
let _cEyeX = 0, _cEyeY = 0
let _mascotRaf: number | null = null
function _tickMascot() {
  const tBody = 0.07, tEye = 0.14
  _cRot  += (_tRot  - _cRot)  * tBody
  _cTx   += (_tTx   - _cTx)   * tBody
  _cTy   += (_tTy   - _cTy)   * tBody
  _cEyeX += (_tEyeX - _cEyeX) * tEye
  _cEyeY += (_tEyeY - _cEyeY) * tEye
  if (mascotImgEl.value) mascotImgEl.value.style.transform = `rotate(${_cRot.toFixed(3)}deg) translate(${_cTx.toFixed(3)}px,${_cTy.toFixed(3)}px)`
  const et = `translate(${_cEyeX.toFixed(3)}px,${_cEyeY.toFixed(3)}px)`
  if (pupilLeftEl.value)  pupilLeftEl.value.style.transform  = et
  if (pupilRightEl.value) pupilRightEl.value.style.transform = et
  _mascotRaf = requestAnimationFrame(_tickMascot)
}
function onMouseMoveMascot(e: MouseEvent) {
  const el = mascotImgEl.value
  if (!el) { _tRot = 0; _tTx = 0; _tTy = 0; _tEyeX = 0; _tEyeY = 0; return }
  const r = el.getBoundingClientRect()
  const dx = e.clientX - (r.left + r.width / 2)
  const dy = e.clientY - (r.top + r.height / 2)
  _tRot = Math.max(-10, Math.min(10, dx * 0.025))
  _tTx  = Math.max(-5,  Math.min(5,  dx * 0.012))
  _tTy  = Math.max(-5,  Math.min(5,  dy * 0.012))
  _tEyeX = Math.max(-2, Math.min(2, dx * 0.006))
  _tEyeY = Math.max(-2, Math.min(2, dy * 0.006))
}
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

// ── Goal mode ────────────────────────────────────────────────────────────────
// The same composer, in a different register: instead of asking a question you
// state an outcome, and the assigned agents judge it, plan it, and schedule it.
const goals = useCoworkGoalChat()
const { goalMode, assignedAgentIds, assignedAgents } = goals

function send(text: string) {
  const t = (text ?? '').trim()
  if (!t) return
  // Schedule set on the composer → this prompt becomes a scheduled task, not a
  // chat turn. Otherwise Send is a normal chat reply (Output/Sources ride along
  // as context for the answer).
  if (!goalMode.value && pendingSchedule.value) { createTask(t, pendingSchedule.value); return }
  inputText.value = ''
  if (goalMode.value) goals.sendGoalTurn(t)
  else chat.sendMessage(t)
}

// ── Rich composer (mirrors the Cowork "New task" form) ───────────────────────
const MODELS = [
  { id: 'gemini-flash-latest', label: 'Gemini Flash' },
  { id: 'gemini-pro-latest', label: 'Gemini Pro' },
  { id: 'gemini-flash-lite-latest', label: 'Gemini Flash Lite' },
]
const model = ref(MODELS[0].id)
const modelLabel = computed(() => MODELS.find((m) => m.id === model.value)?.label ?? 'Gemini Flash')

// Output — what a saved task should produce.
const OUTPUTS = [
  { id: 'briefing', name: 'Briefing summary' },
  { id: 'action-items', name: 'Action items' },
  { id: 'spreadsheet', name: 'Spreadsheet' },
  { id: 'pdf', name: 'PDF report' },
  { id: 'slack', name: 'Slack message', disabled: true },
]
const outputOn = reactive<Record<string, boolean>>({})
function isOutputOn(id: string) { return !!outputOn[id] }
function toggleOutput(id: string, on: boolean) { outputOn[id] = on }
const activeOutputCount = computed(() => OUTPUTS.filter((o) => isOutputOn(o.id)).length)

// Sources — which connected data the run may read (defaults to everything on).
const sourceConnections = computed(() => coworkConnections.filter((c) => c.connected))
const sourceOff = reactive<Record<string, boolean>>({})
function isSourceOn(id: string) {
  if (id in sourceOff) return !sourceOff[id]
  return !!coworkConnections.find((c) => c.id === id)?.connected
}
function toggleSource(id: string, on: boolean) { sourceOff[id] = !on }
const activeSourceCount = computed(() => sourceConnections.value.filter((s) => isSourceOn(s.id)).length)
const activeSourceNames = computed(() => sourceConnections.value.filter((s) => isSourceOn(s.id)).map((s) => s.name))

// Schedule — cadence + time. Set → Send creates a scheduled task.
const schedCadence = ref<CoworkCadence>('Weekly')
const schedTime = ref('09:00')
const pendingSchedule = ref<{ cadence: CoworkCadence; time: string } | null>(null)
const scheduleLabel = computed(() => pendingSchedule.value ? `Every ${pendingSchedule.value.cadence.toLowerCase()} at ${pendingSchedule.value.time}` : 'Schedule')
function applySchedule() { pendingSchedule.value = { cadence: schedCadence.value, time: schedTime.value }; schedOpen.value = false }

// Advanced — skip confirmations for saved tasks.
const skipConfirm = ref(false)

// Composer popovers (mutually exclusive).
const outOpen = ref(false)
const srcOpen = ref(false)
const schedOpen = ref(false)
const advOpen = ref(false)
function closeComposerPopovers() { outOpen.value = false; srcOpen.value = false; schedOpen.value = false; advOpen.value = false }
function openOutput() { const v = !outOpen.value; closeComposerPopovers(); outOpen.value = v }
function openSources() { const v = !srcOpen.value; closeComposerPopovers(); srcOpen.value = v }
function openSchedulePopover() { const v = !schedOpen.value; closeComposerPopovers(); schedOpen.value = v }
function openAdvanced() { const v = !advOpen.value; closeComposerPopovers(); advOpen.value = v }

function inferModule(text: string): CoworkModule {
  const t = text.toLowerCase()
  if (/(payroll|attendance|employee|contract|resign|leave|hr\b)/.test(t)) return 'HR'
  if (/(stock|warehouse|sku|inbound|outbound|fulfil|pick|pack|cycle count)/.test(t)) return 'WMS'
  if (/(invoice|receivable|payable|bill|reconcil|cash|payment|close)/.test(t)) return 'Finance'
  if (/(work order|production|bom|manufactur)/.test(t)) return 'Production'
  if (/(order|deliver|ship)/.test(t)) return 'Sales'
  return 'CRM'
}

/** Turn a prompt into a Cowork task — scheduled if a cadence is given, else run now. */
function createTask(promptText: string, schedule: { cadence: CoworkCadence; time: string } | null) {
  const p = promptText.trim()
  if (!p) return
  const primary = inferModule(p)
  const task = addTask({
    title: p.length > 40 ? p.slice(0, 40) + '…' : p,
    prompt: p,
    module: primary,
    modules: [primary],
    status: schedule ? 'scheduled' : 'running',
    createdAt: new Date().toISOString(),
    outputs: OUTPUTS.filter((o) => isOutputOn(o.id)).map((o) => o.name),
    sources: activeSourceNames.value.length ? activeSourceNames.value : [primary],
    model: model.value,
    ...(schedule ? { schedule: { cadence: schedule.cadence, time: schedule.time, enabled: true } } : {}),
  })
  inputText.value = ''
  pendingSchedule.value = null
  closeComposerPopovers()
  toast.notify({ variant: 'success', title: schedule ? 'Task scheduled' : 'Task created' })
  router.push({ path: `/cowork-tasks/${task.id}`, query: schedule ? {} : { run: '1' } })
}

// "Save as task" CTA on an assistant turn — asks whether to schedule first.
const saveMenuFor = ref<number | null>(null)
const saveCadence = ref<CoworkCadence>('Weekly')
const saveTime = ref('09:00')
function openSaveMenu(i: number) { saveMenuFor.value = saveMenuFor.value === i ? null : i }
/** The prompt behind a task saved from a message = the user turn that preceded it. */
function promptForMessage(i: number): string {
  for (let j = i; j >= 0; j--) { if (messages.value[j]?.role === 'user') return messages.value[j].text }
  return messages.value[i]?.text ?? ''
}
function saveTurnAsTask(i: number, withSchedule: boolean) {
  createTask(promptForMessage(i), withSchedule ? { cadence: saveCadence.value, time: saveTime.value } : null)
  saveMenuFor.value = null
}

/** Only offer "Save as task" when the request is actually a task — something
 *  Cowork can *do* or a report it can *run/schedule* — not a casual or how-to
 *  question, a greeting, or a one-off definition. */
function isTaskLike(text: string): boolean {
  const t = (text ?? '').toLowerCase().trim()
  if (!t || t.length < 8) return false
  // Conversational / how-to / definitional → not a task.
  if (/^(hi|hello|hey|thanks|thank you|ok|okay|yes|no|sure|got it|nice|cool)\b/.test(t)) return false
  if (/^(how do i|how to|how can i|how does|what is|what's|what are|whats|who is|who's|why |when is|when should|where is|where can|explain|define|tell me about|can you explain|is it|are there|do i need|should i)\b/.test(t)) return false
  // Actionable verbs Cowork performs, or a schedulable report/analysis.
  const taskRe = /(chase|remind|follow[- ]?up|reconcil|summar|generate|create|draft|prepare|send|export|compile|monitor|track|audit|reorder|notify|alert|schedule|analy[sz]|calculate|forecast|clean up|close the month|month[- ]end|pull|flag|rank|prioriti|identify|review|overdue|outstanding|receivable|payable|low stock|below reorder|reorder point|expiring|late this week|pipeline|reconciliation|stockout|follow the up)/
  const recurringRe = /(every day|every week|every month|each day|each week|each month|daily|weekly|monthly|recurring)/
  return taskRe.test(t) || recurringRe.test(t)
}

// Card actions — the agent asked for something, the user answers it in place.
function onConnect(id: string) { goals.connect(id) }
function onProceed(text: string) { inputText.value = ''; goals.proceed(text) }
function onAcceptCounter(draft: GoalDraft) { goals.acceptCounter(draft) }
async function onApprove(draft: GoalDraft) { await goals.approvePlan(draft) }
function onOpenGoal(goalId: string) { router.push(`/cowork-goals/${goalId}`) }

/** Starting a goal always starts a fresh room — a goal conversation is its own
 *  thread, not a turn inside whatever was being discussed. */
function startGoal() {
  chat.startNewChat()
  goals.resetGoalMode()
  goalMode.value = true
  historyOpen.value = false
  kebabOpen.value = false
  inputText.value = ''
}
function leaveGoalMode() { goals.resetGoalMode() }

const GOAL_EXAMPLES = [
  'Turunkan piutang jatuh tempo 30% sebelum tutup kuartal',
  'Follower Instagram naik 10% by end of month',
  'Jangan ada stockout di 20 SKU terlaris bulan ini',
]

function newChat() {
  chat.startNewChat()
  goals.resetGoalMode()
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

// ── Chat list (left panel) — searchable history of saved rooms ────────────────
const chatSearch = ref('')
const filteredHistory = computed(() => {
  const q = chatSearch.value.trim().toLowerCase()
  const f = (rows: CoworkChatSession[]) => q ? rows.filter((s) => s.title.toLowerCase().includes(q)) : rows
  const g = groupedHistory.value
  return [
    { label: 'Recent', rows: f(g.yesterday) },
    { label: 'This week', rows: f(g.thisWeek) },
    { label: 'Older', rows: f(g.older) },
  ]
})
const hasAnyChat = computed(() => filteredHistory.value.some((grp) => grp.rows.length > 0))

function onOutsideClick(e: MouseEvent) {
  if (!historyWrapperEl.value?.contains(e.target as Node)) historyOpen.value = false
  if (!kebabWrapperEl.value?.contains(e.target as Node)) kebabOpen.value = false
}

onMounted(() => {
  document.addEventListener('click', onOutsideClick)
  document.addEventListener('mousemove', onMouseMoveMascot)
  _mascotRaf = requestAnimationFrame(_tickMascot)
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
  document.removeEventListener('mousemove', onMouseMoveMascot)
  if (_mascotRaf !== null) cancelAnimationFrame(_mascotRaf)
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
      <MpButton is-rounded variant="primary" @click="newChat">+ New chat</MpButton>
    </div>
  </header>

  <!-- Stage — searchable chat list (left) + chat content pane (right). -->
  <div class="cwc-stage">

    <!-- Left: searchable list of saved chats -->
    <aside class="cwc-list">
      <div class="cwc-list__search">
        <MpIcon name="search" size="sm" class="cwc-list__search-icon" />
        <input v-model="chatSearch" class="cwc-list__search-input" placeholder="Search chats">
      </div>
      <div class="cwc-list__items">
        <template v-for="group in filteredHistory" :key="group.label">
          <template v-if="group.rows.length">
            <p class="cwc-list__group">{{ group.label }}</p>
            <button
              v-for="s in group.rows"
              :key="s.id"
              class="cwc-list__item"
              :class="{ 'is-active': s.id === activeSessionId }"
              @click="openRoom(s)"
            >
              <span class="cwc-list__item-title">{{ s.title }}</span>
              <span v-if="taskLabel(s)" class="cwc-list__item-task">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" class="cwc-spark"><path d="M12 2c.3 4.9 4.8 9.4 9.7 9.7v.6C16.8 12.6 12.3 17.1 12 22h-.6c-.3-4.9-4.8-9.4-9.7-9.7v-.6C6.6 11.4 11.1 6.9 11.4 2H12z" fill="currentColor"/></svg> {{ taskLabel(s) }}
              </span>
            </button>
          </template>
        </template>
        <p v-if="!hasAnyChat" class="cwc-list__empty">{{ chatSearch ? 'No chats found' : 'No chats yet' }}</p>
      </div>
    </aside>

    <!-- Right: chat content pane -->
    <div class="cwc-content">

    <!-- Agent switcher -->
    <div class="cwc-head">
        <!-- Goal mode: assign one or more agents to the outcome. Otherwise the
             usual single-agent switcher. -->
        <div v-if="goalMode" class="cwc-agent-wrap">
          <button type="button" class="cwc-agent-btn" @click.stop="agentMenuOpen = !agentMenuOpen">
            <span v-if="!assignedAgents.length" class="cwc-agent-text">
              <span class="cwc-agent-name">Assign agents</span>
              <span class="cwc-agent-role">Or let the lead pick</span>
            </span>
            <span v-else class="cwc-assigned">
              <img v-for="a in assignedAgents.slice(0, 4)" :key="a.id" :src="a.avatar" :alt="a.name" class="cwc-agent-av cwc-assigned__av">
              <span class="cwc-agent-name">{{ assignedAgents.length }} assigned</span>
            </span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9L12 15L18 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <template v-if="agentMenuOpen">
            <div class="cwc-backdrop" @click="agentMenuOpen = false" />
            <div class="cwc-agent-menu" @click.stop>
              <p class="cwc-agent-menu__hint">Pick who owns this goal. The lead can bring in others itself.</p>
              <button
                v-for="a in coworkAgents"
                :key="a.id"
                type="button"
                class="cwc-agent-item"
                :class="{ 'is-active': assignedAgentIds.includes(a.id) }"
                @click="goals.toggleAgent(a.id)"
              >
                <img :src="a.avatar" :alt="a.name" class="cwc-agent-av">
                <span class="cwc-agent-meta">
                  <span class="cwc-agent-name">{{ a.name }}</span>
                  <span class="cwc-agent-role">{{ a.role }}</span>
                </span>
                <MpIcon v-if="assignedAgentIds.includes(a.id)" name="check" size="sm" class="cwc-agent-check" />
              </button>
            </div>
          </template>
        </div>
        <!-- Agent switcher — change who you're chatting with at any time.
             Borderless name + chevron (sana.ai style); no avatar. -->
        <div v-else class="cwc-agent-wrap">
          <button type="button" class="cwc-agent-btn cwc-agent-btn--plain" @click.stop="agentMenuOpen = !agentMenuOpen">
            <span class="cwc-agent-name">{{ activeAgent!.name }}</span>
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
      </div>

    <!-- Content — the 6-col chat column, centred below the full-width header -->
    <div class="cwc-center">
      <div class="cwc-col">

      <!-- Main — empty state centres the greeting + composer + suggestions as one
           group; an active chat scrolls messages on top with the composer pinned
           below. The composer is a single element either way (no duplication):
           siblings reorder around it and justify-content does the centring. -->
      <div class="cwc-main" :class="messages.length ? 'cwc-main--chat' : 'cwc-main--empty'">

        <!-- Empty-state hero: agent avatar + greeting, centred above the composer -->
        <div v-if="messages.length === 0" class="cwc-greetings">
          <div class="cwc-mascot" aria-hidden="true">
            <!-- Airene: the eye-tracking mascot. Any other agent: its own avatar
                 (static — no animation once you've switched away from Airene). -->
            <div v-if="activeAgent!.id === 'airene'" ref="mascotImgEl" class="mascot-wrapper">
              <img src="~/assets/airene-mascot-v3.png" width="60" height="60" alt="" class="airene-mascot-img" />
              <!-- Eyes drawn on the star body; they tilt with it -->
              <div class="mascot-eye mascot-eye--left"><div ref="pupilLeftEl" class="mascot-pupil" /></div>
              <div class="mascot-eye mascot-eye--right"><div ref="pupilRightEl" class="mascot-pupil" /></div>
            </div>
            <img v-else :src="activeAgent!.avatar" :alt="activeAgent!.name" class="cwc-agent-avatar-lg" />
          </div>

          <template v-if="goalMode">
            <p class="cwc-greeting-title">What outcome do you want?</p>
            <p class="cwc-greeting-msg">
              Tell me the result, not the task — with a number and a deadline if you have them. I'll check whether it's
              achievable, say so if it isn't, then plan it and schedule the work.
            </p>
          </template>
          <template v-else>
            <p class="cwc-greeting-title">Hi, I'm {{ activeAgent!.name }}.</p>
            <p v-if="chatContext" class="cwc-greeting-msg">I've reviewed “{{ chatContext }}”. Ask me anything about the result.</p>
            <p v-else class="cwc-greeting-msg">{{ moduleInfo.greeting }}</p>
          </template>
        </div>

        <!-- Active chat: scrolling messages above the composer -->
        <div v-else ref="bodyEl" class="cwc-messages">
          <div v-for="(msg, i) in messages" :key="i" class="chat-message" :class="'chat-message--' + msg.role">
            <img v-if="msg.role === 'assistant'" src="~/assets/airene-mascot.png" width="24" height="25" alt="" class="chat-avatar">
            <div class="cwc-msg-col">
              <div class="chat-bubble" :class="'chat-bubble--' + msg.role">
                <!-- eslint-disable-next-line vue/no-v-html -->
                <span v-if="msg.role === 'assistant'" class="chat-bubble__text chat-bubble__rich" v-html="renderMessage(msg.text)" />
                <span v-else class="chat-bubble__text">{{ msg.text }}</span>
              </div>
              <!-- Plan / pushback / connect-these-tools / receipt -->
              <CoworkGoalCard
                v-if="msg.card"
                :card="msg.card"
                @connect="onConnect"
                @proceed="onProceed"
                @accept-counter="onAcceptCounter"
                @approve="onApprove"
                @open="onOpenGoal"
              />
              <!-- Save-as-task CTA — turn this answer into a task, run now or scheduled -->
              <div v-if="msg.role === 'assistant' && !msg.card && !goalMode && isTaskLike(promptForMessage(i))" class="cwc-save-wrap">
                <MpPopover :id="`cwc-save-${i}`" is-manual :is-open="saveMenuFor === i" placement="bottom-start" use-portal :is-keep-alive="false" @close="saveMenuFor = null">
                  <MpPopoverTrigger>
                    <button type="button" class="cwc-save-btn" @click="openSaveMenu(i)"><MpIcon name="add" size="sm" /> Save as task</button>
                  </MpPopoverTrigger>
                  <MpPopoverContent :class="css({ minWidth: '280px' })">
                    <div class="cw-src">
                      <p class="cw-src__head">Save as task</p>
                      <p class="cw-src__hint">Run it once now, or schedule it to run automatically.</p>
                      <p class="cw-sched-label">Cadence</p>
                      <div class="cw-seg">
                        <button v-for="c in ['Daily','Weekly','Monthly']" :key="c" type="button" class="cw-seg__btn" :class="{ 'is-active': saveCadence === c }" @click="saveCadence = c as CoworkCadence">{{ c }}</button>
                      </div>
                      <p class="cw-sched-label">Time</p>
                      <div class="cw-seg">
                        <button v-for="t in ['07:00','08:00','09:00','18:00']" :key="t" type="button" class="cw-seg__btn" :class="{ 'is-active': saveTime === t }" @click="saveTime = t">{{ t }}</button>
                      </div>
                      <MpButton is-rounded variant="primary" is-full-width :class="css({ marginTop: '16px' })" @click="saveTurnAsTask(i, true)">Schedule {{ saveCadence.toLowerCase() }} at {{ saveTime }}</MpButton>
                      <MpButton is-rounded variant="secondary" is-full-width :class="css({ marginTop: '8px' })" @click="saveTurnAsTask(i, false)">Run once now</MpButton>
                    </div>
                  </MpPopoverContent>
                </MpPopover>
              </div>
            </div>
          </div>
          <div v-if="isTyping" class="chat-message chat-message--assistant">
            <img src="~/assets/airene-mascot.png" width="24" height="25" alt="" class="chat-avatar">
            <div class="chat-bubble chat-bubble--assistant chat-typing">
              <span class="typing-dot" /><span class="typing-dot" /><span class="typing-dot" />
            </div>
          </div>
        </div>

        <!-- Composer (shared between empty + active states) -->
        <div class="cwc-footer">
          <div class="cw-composer2">
          <!-- Context chip — the task result this chat is grounded on -->
          <div v-if="chatContext" class="cwc-context-row">
            <span class="cwc-context-chip">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" class="cwc-spark"><path d="M12 2c.3 4.9 4.8 9.4 9.7 9.7v.6C16.8 12.6 12.3 17.1 12 22h-.6c-.3-4.9-4.8-9.4-9.7-9.7v-.6C6.6 11.4 11.1 6.9 11.4 2H12z" fill="currentColor"/></svg>
              {{ chatContext }}
              <button v-if="sourceTask" class="cwc-context-link" type="button" @click="router.push(`/cowork-tasks/${sourceTask.id}`)">View task</button>
            </span>
          </div>
          <!-- Goal mode banner — says which register the composer is in, and how
               to get out of it. -->
          <div v-if="goalMode" class="cwc-goalbar">
            <span class="cwc-goalbar__tag">Goal</span>
            <span class="cwc-goalbar__text">
              {{ assignedAgents.length
                ? assignedAgents.map((a) => a.name).join(', ') + ' will own this'
                : 'The lead agent will pick the team' }}
            </span>
            <button type="button" class="cwc-goalbar__exit" @click="leaveGoalMode">Back to chat</button>
          </div>

          <!-- Prompt field -->
          <div class="cw-composer2__field">
            <textarea
              v-model="inputText"
              class="cw-composer2__input"
              rows="3"
              :placeholder="goalMode ? 'Describe the outcome you want…' : 'How can I help you today?'"
              @keydown.enter.exact.prevent="send(inputText)"
            />
          </div>

          <!-- Foot toolbar: task controls (left) · model + send (right) -->
          <div class="cw-composer2__foot">
            <div v-if="!goalMode" class="cw-composer2__left">
              <!-- Sources -->
              <MpPopover id="cwc-source" is-manual :is-open="srcOpen" placement="bottom-start" use-portal :is-keep-alive="false" @close="srcOpen = false">
                <MpPopoverTrigger>
                  <button class="cw-foot-btn" type="button" @click="openSources"><MpIcon name="add" size="sm" /> Sources<span v-if="activeSourceCount"> ({{ activeSourceCount }})</span></button>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '280px' })">
                  <div class="cw-src">
                    <p class="cw-src__head">Sources</p>
                    <p class="cw-src__hint">Choose which connected data Cowork may use.</p>
                    <div class="cw-src__list">
                      <div v-for="s in sourceConnections" :key="s.id" class="cw-src__row">
                        <span class="cw-src__name">{{ s.name }}</span>
                        <MpToggle :is-checked="isSourceOn(s.id)" :aria-label="`Toggle ${s.name}`" @update:is-checked="(v: boolean) => toggleSource(s.id, v)" />
                      </div>
                    </div>
                    <div class="cw-src__divider" />
                    <button type="button" class="cw-src__action" @click="srcOpen = false; router.push('/cowork-connections')"><MpIcon name="settings" size="sm" /> Manage connections</button>
                  </div>
                </MpPopoverContent>
              </MpPopover>
            </div>
            <div v-else class="cw-composer2__left" />

            <div class="cw-composer2__right">
              <!-- Model picker -->
              <MpPopover id="cwc-model" is-close-on-select placement="bottom-end">
                <MpPopoverTrigger>
                  <button class="cw-model-btn" type="button"><GeminiMark :size="16" /> {{ modelLabel }} <MpIcon name="caret-down" size="sm" /></button>
                </MpPopoverTrigger>
                <MpPopoverContent :class="css({ minWidth: '200px' })">
                  <MpPopoverList>
                    <MpPopoverListItem v-for="m in MODELS" :key="m.id" :is-active="m.id === model" @click="model = m.id">{{ m.label }}</MpPopoverListItem>
                  </MpPopoverList>
                </MpPopoverContent>
              </MpPopover>

              <!-- Send -->
              <button class="cw-send-btn" type="button" aria-label="Send" @click="send(inputText)">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M12 19V5M12 5L6 11M12 5L18 11" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            </div>
          </div>
          </div>
          <p v-if="messages.length" class="cwc-disclaimer">Mekari Airene can make mistakes. <a class="cwc-disclaimer-link">Learn more</a></p>
        </div>

        <!-- Empty-state suggestions: below the composer -->
        <div v-if="messages.length === 0" class="cwc-suggestions">
          <template v-if="goalMode">
            <button v-for="g in GOAL_EXAMPLES" :key="g" class="cwc-suggestion" @click="send(g)">
              <MpIcon name="magic" size="sm" class="cwc-sug-icon" />
              {{ g }}
            </button>
          </template>
          <template v-else>
            <button
              v-for="s in (chatContext ? contextSuggestions : moduleInfo.suggestions)"
              :key="s"
              class="cwc-suggestion"
              @click="send(s)"
            >
              <MpIcon name="airene-brand" size="sm" class="cwc-sug-icon" />
              {{ s }}
            </button>
          </template>
        </div>

      </div>

      </div>
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

/* ── Stage · chat list (left) + content pane (right) ───────────────────────── */
.cwc-stage { flex: 1; min-height: 0; display: flex; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; }

/* Left panel — searchable list of saved chats. */
.cwc-list { flex-shrink: 0; width: 280px; min-height: 0; display: flex; flex-direction: column; border-right: 1px solid var(--mp-border-default, #e3e7e9); padding: var(--mp-spacing-4) var(--mp-spacing-3); }
.cwc-list__search { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); padding: var(--mp-spacing-2, 8px) var(--mp-spacing-3, 12px); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-neutral, #fff); }
.cwc-list__search:focus-within { border-color: var(--mp-border-bold, #8c9596); }
.cwc-list__search-icon { color: var(--mp-icon-default, #536062); flex: 0 0 auto; }
.cwc-list__search-input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-family: inherit; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); padding: 0; }
.cwc-list__search-input::placeholder { color: var(--mp-text-placeholder, #6e7a7c); }
.cwc-list__items { flex: 1; min-height: 0; overflow-y: auto; margin-top: var(--mp-spacing-3); display: flex; flex-direction: column; }
.cwc-list__group { margin: var(--mp-spacing-3) var(--mp-spacing-2) var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.cwc-list__group:first-child { margin-top: 0; }
.cwc-list__item { display: flex; flex-direction: column; gap: 2px; width: 100%; padding: var(--mp-spacing-2, 8px); border: none; background: none; border-radius: var(--mp-radii-md, 8px); cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md, 14px); color: var(--mp-text-default); text-align: left; }
.cwc-list__item:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.cwc-list__item.is-active { background: var(--mp-background-neutral-subtle, #f0f1f3); }
.cwc-list__item-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cwc-list__item-task { display: inline-flex; align-items: center; gap: 4px; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cwc-list__empty { margin: var(--mp-spacing-4) var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }

/* Right pane — agent switcher on top, then the centred chat column. */
.cwc-content { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; padding: var(--mp-spacing-6) var(--mp-spacing-6) 0; }
.cwc-center { flex: 1; min-height: 0; display: flex; justify-content: center; }
/* 8 of the ERP's 12 columns (~853px) — wider than the 6-col detail measure so
   the chat + task composer don't feel cramped. */
.cwc-col { width: 100%; max-width: 853px; display: flex; flex-direction: column; min-height: 0; }

/* ── Header bar (full width, 12 columns) ───────────────────────────────────── */
.cwc-head { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding-bottom: var(--mp-spacing-3); }
.cwc-head__right { display: flex; align-items: center; gap: var(--mp-spacing-1); }
.cwc-backdrop { position: fixed; inset: 0; z-index: 40; }

/* Agent switcher (top-left, live at any point in the conversation) */
.cwc-agent-wrap { position: relative; min-width: 0; }
.cwc-agent-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2, 8px); max-width: 100%; padding: var(--mp-spacing-1, 4px) var(--mp-spacing-2, 8px); border: 1px solid var(--mp-border-default, #e3e7e9); background: var(--mp-background-neutral, #fff); border-radius: var(--mp-radii-full, 999px); font-family: inherit; color: var(--mp-text-default); cursor: pointer; }
.cwc-agent-btn:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); border-color: var(--mp-border-bold, #8c9596); }
/* sana.ai-style plain switcher — no border/background, name + chevron only */
.cwc-agent-btn--plain { border: none; background: none; padding: var(--mp-spacing-1, 4px) 0; }
.cwc-agent-btn--plain:hover { background: none; }
.cwc-agent-btn--plain .cwc-agent-name { font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold, 600); }
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

/* ── Main ──────────────────────────────────────────────────────────────────── */
.cwc-main { flex: 1; min-height: 0; display: flex; flex-direction: column; }
/* Empty state: greeting + composer + suggestions centre as one group. */
.cwc-main--empty { justify-content: center; gap: var(--mp-spacing-4); }
/* Active chat: the messages area (flex:1) fills, pinning the composer to the bottom. */
.cwc-messages { flex: 1; min-height: 0; overflow-y: auto; padding: var(--mp-spacing-4) 0; display: flex; flex-direction: column; }

/* Empty-state hero — avatar + greeting, left-aligned above the composer. */
.cwc-greetings { display: flex; flex-direction: column; align-items: flex-start; text-align: left; gap: var(--mp-spacing-2); flex-shrink: 0; }
.cwc-mascot { display: block; width: 60px; height: 60px; }
.cwc-agent-avatar-lg { width: 60px; height: 60px; border-radius: var(--mp-radii-full, 50%); object-fit: cover; background: var(--mp-background-neutral-subtle, #f8f9f9); }
/* Eye-tracking mascot (mirrors the Airene drawer) */
.mascot-wrapper { position: relative; display: inline-block; width: 60px; height: 60px; will-change: transform; transform-origin: center bottom; }
.airene-mascot-img { display: block; width: 60px; height: 60px; }
.mascot-eye { position: absolute; width: 9px; height: 9px; border-radius: var(--mp-radii-full, 50%); background: var(--mp-background-neutral); overflow: hidden; display: flex; align-items: center; justify-content: center; pointer-events: none; box-shadow: 0 0 0 1px rgba(80,30,140,0.10); }
.mascot-eye--left  { left: 18px; top: 33px; }
.mascot-eye--right { left: 33px; top: 33px; }
.mascot-pupil { width: 5px; height: 5px; border-radius: var(--mp-radii-full, 50%); background: #1a0a2e; will-change: transform; flex-shrink: 0; }
.cwc-greeting-title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); line-height: var(--mp-line-heights-lg, 24px); color: var(--mp-text-default); }
.cwc-greeting-msg { margin: 0; font-size: var(--mp-font-sizes-md); line-height: var(--mp-line-heights-md); color: var(--mp-text-default); }
.cwc-suggestions { display: flex; flex-direction: column; flex-shrink: 0; }
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
.cwc-footer { flex-shrink: 0; display: flex; flex-direction: column; gap: var(--mp-spacing-1); }
.cwc-main--chat .cwc-footer { padding-bottom: var(--mp-spacing-6); }

/* ── Rich composer (mirrors the Cowork "New task" form) ────────────────────── */
.cw-composer2 { border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: 20px; background: var(--mp-background-neutral-subtle, #f8f9f9); padding: var(--mp-spacing-1, 4px); display: flex; flex-direction: column; gap: var(--mp-spacing-1, 4px); }
.cw-composer2__field { border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: 20px; background: var(--mp-background-neutral, #fff); padding: var(--mp-spacing-2, 8px); }
.cw-composer2__field:focus-within { border-color: var(--mp-border-bold, #8c9596); }
.cw-composer2__input { display: block; width: 100%; border: none; outline: none; resize: none; font-family: inherit; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); padding: var(--mp-spacing-2, 8px); background: transparent; min-height: 60px; }
.cw-composer2__input::placeholder { color: var(--mp-text-placeholder, #6e7a7c); }
.cw-composer2__foot { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-2) var(--mp-spacing-2) var(--mp-spacing-1); background: var(--mp-background-neutral-subtle, #f8f9f9); border-radius: 0 0 16px 16px; }
.cw-composer2__left { display: flex; align-items: center; gap: var(--mp-spacing-1); min-height: 32px; }
.cw-composer2__right { display: flex; align-items: center; gap: var(--mp-spacing-2); }
.cw-foot-btn { display: inline-flex; align-items: center; gap: 4px; background: none; border: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-secondary); padding: var(--mp-spacing-1\.5, 6px) var(--mp-spacing-3); border-radius: var(--mp-radii-full, 999px); }
.cw-foot-btn:hover { background: var(--mp-background-neutral-pressed, #ebf0f1); color: var(--mp-text-default); }
.cw-foot-btn.is-set { color: var(--mp-text-selected, #0f6d4d); }
.cw-foot-btn.is-set :deep(svg), .cw-foot-btn.is-set :deep(path) { color: var(--mp-text-selected, #0f6d4d); }
.cw-foot-btn :deep(svg) { color: var(--mp-icon-default, #536062); }
.cw-send-btn { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 36px; height: 36px; border: none; border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-brand-bold, #029861); color: var(--mp-text-inverse, #fff); cursor: pointer; transition: filter .12s ease; }
.cw-send-btn:hover { filter: brightness(0.94); }
.cw-model-btn { display: inline-flex; align-items: center; gap: var(--mp-spacing-2); background: none; border: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-regular); color: var(--mp-text-default); padding: var(--mp-spacing-1\.5, 6px) var(--mp-spacing-2); border-radius: var(--mp-radii-md, 8px); }
.cw-model-btn:hover { background: var(--mp-background-neutral-pressed, #ebf0f1); }
.cw-model-btn > svg:first-child { flex-shrink: 0; }
.cw-src { padding: var(--mp-spacing-2); }
.cw-src__head { margin: 0; font-size: var(--mp-font-sizes-md); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.cw-src__hint { margin: 2px 0 var(--mp-spacing-2); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); }
.cw-src__row { display: flex; align-items: center; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-1\.5, 6px) var(--mp-spacing-1); }
.cw-src__name { font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); }
.cw-src__list { max-height: 240px; overflow-y: auto; margin: 0 calc(var(--mp-spacing-1) * -1); padding: 0 var(--mp-spacing-1); }
.cw-src__divider { height: 1px; background: var(--mp-border-default, #e3e7e9); margin: var(--mp-spacing-2) calc(var(--mp-spacing-2) * -1); }
.cw-src__action { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); width: 100%; padding: var(--mp-spacing-2, 8px) var(--mp-spacing-1, 4px); border: none; background: none; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-md); color: var(--mp-text-default); text-align: left; border-radius: var(--mp-radii-md, 6px); }
.cw-src__action:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); }
.cw-src__action :deep(svg) { color: var(--mp-icon-default, #536062); }
.cw-adv-row { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--mp-spacing-3); padding: var(--mp-spacing-1\.5, 6px) var(--mp-spacing-1); }
.cw-adv-row__text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cw-adv-row__caption { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-sm, 16px); }
.cw-sched-label { margin: var(--mp-spacing-3) 0 var(--mp-spacing-1); font-size: var(--mp-font-sizes-sm); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.cw-seg { display: flex; gap: var(--mp-spacing-1); flex-wrap: wrap; }
.cw-seg__btn { flex: 1 1 auto; min-width: 52px; padding: 6px 10px; border: 1px solid var(--mp-border-default, #e3e7e9); background: var(--mp-background-neutral, #fff); border-radius: var(--mp-radii-full, 999px); font-size: var(--mp-font-sizes-sm); color: var(--mp-text-default); cursor: pointer; font-family: inherit; }
.cw-seg__btn.is-active { border-color: var(--mp-text-selected, #0f6d4d); background: var(--mp-background-brand-selected, #d6f4e9); color: var(--mp-text-selected, #0f6d4d); font-weight: var(--mp-font-weights-semi-bold); }
.cw-soon { margin-left: var(--mp-spacing-2); font-size: var(--mp-font-sizes-xs, 11px); color: var(--mp-text-secondary); }
.cw-src__row.is-disabled .cw-src__name { color: var(--mp-text-secondary); }

/* Save-as-task CTA under an assistant answer */
.cwc-save-wrap { margin-top: var(--mp-spacing-2); }
.cwc-save-btn { display: inline-flex; align-items: center; gap: 4px; padding: var(--mp-spacing-1, 4px) var(--mp-spacing-2\.5, 10px); border: 1px solid var(--mp-border-default, #e3e7e9); background: var(--mp-background-neutral, #fff); border-radius: var(--mp-radii-full, 999px); cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-default); }
.cwc-save-btn:hover { background: var(--mp-background-neutral-subtle, #f8f9f9); border-color: var(--mp-border-bold, #8c9596); }
.cwc-save-btn :deep(svg) { color: var(--mp-icon-default, #536062); }

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
.cwc-msg-col { display: flex; flex-direction: column; min-width: 0; max-width: 100%; }
.cwc-suggestion--goal { color: var(--mp-text-link); }

/* Goal-mode assignment chip in the header */
.cwc-assigned { display: inline-flex; align-items: center; gap: var(--mp-spacing-1\.5, 6px); }
.cwc-assigned__av { width: 20px; height: 20px; margin-right: -8px; border: 1.5px solid var(--mp-background-neutral, #fff); }
.cwc-assigned__av:last-of-type { margin-right: var(--mp-spacing-1, 4px); }
.cwc-agent-menu__hint { margin: var(--mp-spacing-2, 8px) var(--mp-spacing-2, 8px) var(--mp-spacing-1, 4px); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md, 20px); }

/* Goal-mode banner above the input */
.cwc-goalbar { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); }
.cwc-goalbar__tag { font-size: 10px; font-weight: var(--mp-font-weights-semi-bold, 600); text-transform: uppercase; letter-spacing: 0.04em; color: var(--mp-text-brand, #165082); background: var(--mp-background-info-subtle, #eaf2fb); border-radius: var(--mp-radii-full, 999px); padding: 2px 8px; flex: 0 0 auto; }
.cwc-goalbar__text { flex: 1; min-width: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cwc-goalbar__exit { flex: 0 0 auto; border: none; background: none; padding: 0; cursor: pointer; font-family: inherit; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-link); }
.cwc-goalbar__exit:hover { text-decoration: underline; text-underline-offset: 2px; }

.cwc-disclaimer { margin: 0; font-size: var(--mp-font-sizes-sm); color: var(--mp-text-secondary); text-align: center; }
.cwc-disclaimer-link { color: var(--mp-text-link); cursor: pointer; }
.cwc-disclaimer-link:hover { text-decoration: underline; text-underline-offset: 2px; }
</style>
