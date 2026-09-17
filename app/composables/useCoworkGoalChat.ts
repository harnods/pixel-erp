import { computed, ref } from 'vue'
import { coworkAgents, coworkConnections, setConnection, COWORK_SKILLS, type CoworkAgent } from '~/data/cowork'
import {
  addGoalMessage, commitGoalDraft, getGoal, goalTasks,
  type ChatCard, type CoworkGoal, type GoalDraft, type PlannedTask,
} from '~/data/coworkGoals'
import { useAireneBridge } from '~/composables/useAireneBridge'
import { useAireneChat } from '~/composables/useAireneChat'
import { useCoworkContext } from '~/composables/useCoworkContext'
import { SIM_TODAY_ISO } from '~/data/simClock'

/**
 * useCoworkGoalChat — setting a goal by talking to your agents.
 *
 * You assign one or more agents and state an outcome; the lead agent judges it
 * before it plans it. Three things can come back, and each renders as a card
 * under its message:
 *
 *   needs-input  — it cannot read the number yet (tool not connected, or no
 *                  baseline), so it asks, with Connect buttons attached
 *   unrealistic  — the arithmetic does not work; it shows the maths and offers a
 *                  counter-proposal you can accept in one click
 *   plan         — workstreams, the agents it recruited itself, and the tasks it
 *                  will schedule. Approving it writes the goal and the tasks.
 *
 * The conversation is the ordinary Cowork chat (`useAireneChat`), so a goal
 * conversation is a chat room like any other and persists with them.
 */

/** Goal mode is a mode of the composer, not a separate screen. */
const goalMode = ref(false)
/** Agents the user assigned before stating the goal. Empty = the lead picks. */
const assignedAgentIds = ref<string[]>([])
/** The outcome in the user's own words — kept across the whole back-and-forth. */
const goalOutcome = ref('')
/** Set once the user has been shown an objection and chosen to proceed anyway. */
const forced = ref(false)

interface GoalApiTask {
  title?: string; prompt?: string; agentId?: string; workstreamId?: string
  module?: string; cadence?: string; time?: string
}
interface GoalApiGoal {
  title?: string; metricName?: string; metricUnit?: string
  baseline?: number; target?: number; direction?: string; deadline?: string
  leadAgentId?: string; agentIds?: string[]; recruitedAgentIds?: string[]; modules?: string[]
  approach?: string; assumptions?: string[]; measurement?: string; risks?: string[]
  workstreams?: { id?: string; title?: string; rationale?: string; agentId?: string }[]
  connections?: { connectionId?: string; why?: string; required?: boolean }[]
  tasks?: GoalApiTask[]
}
interface GoalApiResponse {
  verdict?: 'ok' | 'needs-input' | 'unrealistic'
  message?: string
  questions?: string[]
  counter?: string
  goal?: GoalApiGoal
  source?: string
}

const CADENCES = new Set(['Daily', 'Weekly', 'Monthly'])
const MODULES = new Set(['HR', 'Sales', 'CRM', 'WMS', 'Finance', 'Production'])

/** Coerce the API's shape into a draft, dropping anything that doesn't refer to
 *  a real agent, connection or module — the model must not invent ids. */
function toDraft(g: GoalApiGoal, fallbackTitle: string): GoalDraft {
  const agentExists = (id?: string) => !!id && coworkAgents.some((a) => a.id === id)
  const lead = agentExists(g.leadAgentId) ? g.leadAgentId! : (coworkAgents[0]?.id ?? 'airene')
  const keepAgent = (id?: string) => (agentExists(id) ? id! : lead)

  const workstreams = (g.workstreams ?? [])
    .filter((w) => w.title)
    .map((w, i) => ({
      id: w.id || `ws-${i + 1}`,
      title: w.title!,
      rationale: w.rationale ?? '',
      agentId: keepAgent(w.agentId),
    }))

  const tasks: PlannedTask[] = (g.tasks ?? [])
    .filter((t) => t.title && t.prompt)
    .map((t) => ({
      title: t.title!,
      prompt: t.prompt!,
      agentId: keepAgent(t.agentId),
      workstreamId: t.workstreamId,
      module: (t.module && MODULES.has(t.module) ? t.module : undefined) as PlannedTask['module'],
      cadence: (t.cadence && CADENCES.has(t.cadence) ? t.cadence : 'Weekly') as PlannedTask['cadence'],
      time: /^\d{2}:\d{2}$/.test(t.time ?? '') ? t.time : '08:00',
    }))

  const agentIds = [...new Set([lead, ...(g.agentIds ?? []).filter(agentExists), ...workstreams.map((w) => w.agentId)])]

  return {
    title: g.title || fallbackTitle,
    metricName: g.metricName,
    metricUnit: g.metricUnit,
    baseline: typeof g.baseline === 'number' ? g.baseline : undefined,
    target: typeof g.target === 'number' ? g.target : undefined,
    direction: g.direction === 'down' ? 'down' : 'up',
    deadline: g.deadline,
    leadAgentId: lead,
    agentIds,
    // Only agents the user did not assign count as recruited — the model's own
    // list is advisory, the assignment list is the truth.
    recruitedAgentIds: agentIds.filter((a) => a !== lead && !assignedAgentIds.value.includes(a)),
    modules: (g.modules ?? []).filter((m) => MODULES.has(m)) as GoalDraft['modules'],
    approach: g.approach,
    assumptions: g.assumptions ?? [],
    measurement: g.measurement,
    risks: g.risks ?? [],
    workstreams,
    connections: (g.connections ?? [])
      .filter((c) => c.connectionId && coworkConnections.some((x) => x.id === c.connectionId))
      .map((c) => ({ connectionId: c.connectionId!, why: c.why ?? '', required: c.required !== false })),
    tasks,
  }
}

function cardFor(res: GoalApiResponse, fallbackTitle: string): ChatCard | undefined {
  if (res.verdict === 'needs-input') {
    return {
      kind: 'needs-input',
      questions: res.questions ?? [],
      connections: (res.goal?.connections ?? [])
        .filter((c) => c.connectionId && coworkConnections.some((x) => x.id === c.connectionId))
        .map((c) => ({ connectionId: c.connectionId!, why: c.why ?? '', required: c.required !== false })),
    }
  }
  if (res.verdict === 'unrealistic') {
    return { kind: 'counter', counter: res.counter ?? '', draft: res.goal ? toDraft(res.goal, fallbackTitle) : undefined }
  }
  if (res.goal) return { kind: 'plan', draft: toDraft(res.goal, fallbackTitle) }
  return undefined
}

export function useCoworkGoalChat() {
  const chat = useAireneChat()
  const bridge = useAireneBridge()
  const { build: buildErpContext } = useCoworkContext()

  const messages = bridge.messages
  const isConnected = (id: string) => coworkConnections.find((c) => c.id === id)?.connected === true

  const assignedAgents = computed<CoworkAgent[]>(() =>
    assignedAgentIds.value.map((id) => coworkAgents.find((a) => a.id === id)).filter(Boolean) as CoworkAgent[])

  function toggleAgent(id: string) {
    const i = assignedAgentIds.value.indexOf(id)
    if (i >= 0) assignedAgentIds.value.splice(i, 1)
    else assignedAgentIds.value.push(id)
  }

  /** A compact ERP snapshot so in-ERP baselines are read, not invented. */
  function erpContext(): string {
    try {
      const snap = buildErpContext() as Record<string, unknown>
      const slice: Record<string, unknown> = {}
      for (const k of ['finance', 'crm', 'wms', 'hr']) if (snap[k]) slice[k] = snap[k]
      const json = JSON.stringify(slice)
      return json.length > 24_000 ? json.slice(0, 24_000) : json
    } catch { return '' }
  }

  /**
   * Send a turn of the goal conversation. `force` is set when the user has read
   * an objection and told the agent to proceed regardless.
   */
  async function sendGoalTurn(text: string, opts: { force?: boolean } = {}) {
    const trimmed = text.trim()
    if (!trimmed) return
    if (!goalOutcome.value) goalOutcome.value = trimmed
    if (opts.force) forced.value = true

    messages.value.push({ role: 'user', text: trimmed })
    chat.scrollSignal.value++
    chat.isTyping.value = true
    try {
      const res = await $fetch<GoalApiResponse>('/api/cowork/goal', {
        method: 'POST',
        body: {
          goal: goalOutcome.value,
          assignedAgentIds: assignedAgentIds.value,
          roster: coworkAgents.map((a) => ({
            id: a.id, name: a.name, role: a.role, module: a.module, description: a.description,
            skills: (a.skills ?? []).map((s) => COWORK_SKILLS.find((x) => x.id === s)?.name).filter(Boolean),
          })),
          connections: coworkConnections.map((c) => ({ id: c.id, name: c.name, connected: !!c.connected, detail: c.detail })),
          today: SIM_TODAY_ISO,
          history: messages.value.map((m) => ({ role: m.role, text: m.text })),
          force: forced.value,
          context: erpContext(),
        },
      })
      messages.value.push({
        role: 'assistant',
        text: res.message ?? 'I could not read that as a goal — tell me the outcome and the deadline.',
        card: cardFor(res, goalOutcome.value),
      })
    } catch {
      messages.value.push({ role: 'assistant', text: 'Sorry — I hit an error working out the plan. Please try again.' })
    }
    chat.isTyping.value = false
    chat.persistActiveSession()
    chat.scrollSignal.value++
  }

  /** Connect a tool the agent asked for, from inside the chat. */
  function connect(connectionId: string) {
    setConnection(connectionId, true)
    chat.persistActiveSession()
  }

  /** "Keep my target" — the objection is waived and the original numbers stand. */
  function proceed(text: string) { return sendGoalTurn(text, { force: true }) }

  /**
   * "Take your suggestion" — the counter-proposal's own plan is already costed
   * against the realistic target, so it becomes the plan directly. Re-asking
   * would quietly hand back the target the agent just argued against.
   */
  function acceptCounter(draft: GoalDraft) {
    forced.value = true
    messages.value.push({ role: 'user', text: 'Oke, pakai usulan kamu.' })
    messages.value.push({
      role: 'assistant',
      text: 'Baik — saya pakai target itu. Ini rencananya; approve dan saya buatkan task-nya sekalian dengan jadwalnya.',
      card: { kind: 'plan', draft },
    })
    chat.persistActiveSession()
    chat.scrollSignal.value++
  }

  /**
   * Approve a plan: writes the goal, creates its scheduled tasks, and kicks off
   * the agents' own thread so the goal opens with real coordination on it.
   */
  async function approvePlan(draft: GoalDraft): Promise<CoworkGoal> {
    const goal = commitGoalDraft(draft, goalOutcome.value, isConnected, chat.activeSessionId.value ?? undefined)
    const created = goalTasks(goal).length

    messages.value.push({
      role: 'assistant',
      text: `Done — ${goal.title} is live with ${created} scheduled ${created === 1 ? 'task' : 'tasks'}. I've briefed the other agents on the goal's thread.`,
      card: { kind: 'goal-created', goalId: goal.id, taskCount: created },
    })
    chat.persistActiveSession()
    chat.scrollSignal.value++

    // The agents brief each other. Failure here must never cost the user their
    // goal — it is already written.
    try {
      const res = await $fetch<{ messages?: { from: string; to?: string; text: string; kind?: string }[] }>('/api/cowork/agent-turn', {
        method: 'POST',
        body: {
          goal: {
            title: goal.title,
            metric: goal.metric ? `${goal.metric.name} ${goal.metric.baseline} → ${goal.metric.target}` : '',
            deadline: goal.deadline, approach: goal.plan?.approach,
            leadAgentId: goal.leadAgentId, recruitedAgentIds: goal.recruitedAgentIds,
          },
          agents: goal.agentIds.map((id) => {
            const a = coworkAgents.find((x) => x.id === id)
            return { id, name: a?.name ?? id, role: a?.role ?? '', module: a?.module ?? '' }
          }),
          workstreams: goal.plan?.workstreams ?? [],
          thread: [],
          trigger: 'kickoff',
        },
      })
      for (const m of res.messages ?? []) {
        if (!goal.agentIds.includes(m.from)) continue
        addGoalMessage(goal.id, { from: m.from, to: m.to || undefined, text: m.text, kind: m.kind as never })
      }
    } catch { /* the thread can be empty; the goal is what matters */ }

    return goal
  }

  /** Leave goal mode and clear the assignment, e.g. after a goal is created. */
  function resetGoalMode() {
    goalMode.value = false
    assignedAgentIds.value = []
    goalOutcome.value = ''
    forced.value = false
  }

  return {
    goalMode, assignedAgentIds, assignedAgents, goalOutcome, forced,
    toggleAgent, sendGoalTurn, proceed, acceptCounter, connect, approvePlan, resetGoalMode,
    isConnected, getGoal,
  }
}
