/**
 * Cowork agent-to-agent turn — the agents on a goal talking to each other.
 *
 * A goal is worked by several agents, and the interesting part is the seams:
 * the lead handing a blocked strand to whoever can actually unblock it, an agent
 * recruiting one the user never assigned, someone reporting a result back, or
 * flagging that the target will not land. This endpoint produces those messages
 * for a given trigger, in character, grounded on the goal's own plan.
 *
 * Gemini-backed with a deterministic fallback, like every other Cowork endpoint.
 */

interface AgentLite { id: string; name: string; role: string; module: string }
interface WorkstreamLite { id: string; title: string; rationale: string; agentId: string }
interface ThreadItem { from: string; to?: string; text: string }

type Trigger = 'kickoff' | 'task-done' | 'risk' | 'user-message'

const ALLOWED_MODELS = new Set([
  'gemini-flash-latest', 'gemini-pro-latest', 'gemini-flash-lite-latest',
  'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview',
])
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    messages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'Agent id, from the agents list' },
          to: { type: 'string', description: 'Agent id being addressed, or "" for the whole goal' },
          text: { type: 'string', description: 'What the agent says — specific, with names and numbers, 1-3 sentences' },
          kind: { type: 'string', enum: ['handoff', 'update', 'question', 'answer', 'result', 'recruit'] },
        },
        required: ['from', 'to', 'text', 'kind'],
      },
    },
  },
  required: ['messages'],
}

function buildPrompt(
  goal: { title: string; metric?: string; deadline?: string; approach?: string },
  agents: AgentLite[], workstreams: WorkstreamLite[], thread: ThreadItem[],
  trigger: Trigger, note: string,
): string {
  const who = agents.map((a) => `- ${a.id} · ${a.name} (${a.role}, ${a.module})`).join('\n')
  const ws = workstreams.map((w) => `- ${w.id} "${w.title}" — owned by ${w.agentId}. Why: ${w.rationale}`).join('\n')
  const prior = thread.slice(-8).map((t) => `${t.from}${t.to ? ' → ' + t.to : ''}: ${t.text}`).join('\n')

  const ask: Record<Trigger, string> = {
    kickoff: 'The plan has just been approved. Produce the opening coordination: the lead assigns the strands, and where a strand needs an agent the lead had to bring in, that agent is told WHY they are on this goal. 3-4 messages.',
    'task-done': `A task just finished. Produce the follow-through: whoever ran it reports the concrete result, and if it exposes work that belongs to another agent, hand it over explicitly. Context: ${note}. 2-3 messages.`,
    risk: `Something threatens the target. Produce the escalation: name what is off, by how much, and what is being asked of whom. Context: ${note}. 2-3 messages.`,
    'user-message': `The user just said: "${note}". The agents respond to it among themselves and adjust who does what. 2-3 messages.`,
  }

  return `You are simulating the internal coordination between AI agents working one goal inside Mekari ERP. Write what they say TO EACH OTHER — not to the user.

GOAL: ${goal.title}${goal.metric ? `\nMETRIC: ${goal.metric}` : ''}${goal.deadline ? `\nDEADLINE: ${goal.deadline}` : ''}${goal.approach ? `\nAPPROACH: ${goal.approach}` : ''}

AGENTS ON THIS GOAL (use these ids exactly):
${who}

WORKSTREAMS:
${ws}
${prior ? `\nTHREAD SO FAR:\n${prior}\n` : ''}
${ask[trigger]}

Rules:
- Every message must carry a specific fact: a name, a figure, a date, a blocker. No "I'll get right on it".
- Agents stay in role and only speak to what their module can actually do.
- A handoff must say what is blocked and why the other agent is the one who can move it.
- A "recruit" message is the lead telling an agent the user did not assign why they are needed.
- Never address the user. Never use pleasantries as a whole message.`
}

/** Deterministic coordination — used when there is no key, and good enough to
 *  carry the demo on its own. */
function fallbackMessages(
  agents: AgentLite[], workstreams: WorkstreamLite[], lead: string,
  recruited: string[], trigger: Trigger, note: string, metric: string, deadline: string,
) {
  const name = (id: string) => agents.find((a) => a.id === id)?.name ?? id
  const out: { from: string; to?: string; text: string; kind: string }[] = []
  const others = workstreams.filter((w) => w.agentId !== lead)

  if (trigger === 'kickoff') {
    out.push({
      from: lead, to: undefined, kind: 'update',
      text: `Plan approved — ${metric}${deadline ? `, deadline ${deadline}` : ''}. I am taking "${workstreams.find((w) => w.agentId === lead)?.title ?? workstreams[0]?.title ?? 'the lead strand'}". Splitting the rest now so no strand waits on me.`,
    })
    for (const w of others.slice(0, 3)) {
      const isNew = recruited.includes(w.agentId)
      out.push({
        from: lead, to: w.agentId, kind: isNew ? 'recruit' : 'handoff',
        text: isNew
          ? `Bringing you in on this one — you were not assigned, but "${w.title}" needs you specifically. ${w.rationale} Can you own it end to end?`
          : `"${w.title}" is yours. ${w.rationale} Flag it to me the moment it stops moving.`,
      })
      out.push({
        from: w.agentId, to: lead, kind: 'answer',
        text: `Taking it. I will report against ${metric.split('→')[0]?.trim() || 'the baseline'} on my own cadence, and escalate to you rather than sit on a blocker.`,
      })
    }
    return out
  }

  if (trigger === 'task-done') {
    const w = workstreams[0]
    out.push({ from: w?.agentId ?? lead, to: lead, kind: 'result', text: `${note} Logged against "${w?.title ?? 'the strand'}".` })
    if (others[0] && others[0].agentId !== (w?.agentId ?? lead)) {
      out.push({
        from: lead, to: others[0].agentId, kind: 'handoff',
        text: `Part of that lands on you — "${others[0].title}". ${others[0].rationale} Picking it up from here?`,
      })
    }
    return out
  }

  if (trigger === 'risk') {
    out.push({ from: lead, to: undefined, kind: 'update', text: `Flagging risk: ${note} Target is ${metric}${deadline ? ` by ${deadline}` : ''}, and the current pace does not reach it.` })
    if (others[0]) out.push({ from: others[0].agentId, to: lead, kind: 'answer', text: `Seen. "${others[0].title}" is the strand with the most headroom left — I will push there first and tell you by the next run whether it closes the gap.` })
    return out
  }

  out.push({ from: lead, to: undefined, kind: 'update', text: `The user says: "${note}". Adjusting — I will re-cut the strands against that and come back if the target has to move.` })
  if (others[0]) out.push({ from: others[0].agentId, to: lead, kind: 'answer', text: `Understood. "${others[0].title}" stays with me either way; tell me if the cadence changes.` })
  return out
}

export default defineEventHandler(async (event) => {
  let agents: AgentLite[] = []
  let workstreams: WorkstreamLite[] = []
  let lead = 'airene'
  let recruited: string[] = []
  let trigger: Trigger = 'kickoff'
  let note = ''
  let metric = ''
  let deadline = ''
  try {
    const body = await readBody<{
      goal?: { title?: string; metric?: string; deadline?: string; approach?: string; leadAgentId?: string; recruitedAgentIds?: string[] }
      agents?: AgentLite[]; workstreams?: WorkstreamLite[]; thread?: ThreadItem[]
      trigger?: Trigger; note?: string; model?: string
    }>(event)
    agents = body?.agents ?? []
    workstreams = body?.workstreams ?? []
    lead = body?.goal?.leadAgentId ?? agents[0]?.id ?? 'airene'
    recruited = body?.goal?.recruitedAgentIds ?? []
    trigger = body?.trigger ?? 'kickoff'
    note = (body?.note ?? '').trim()
    metric = body?.goal?.metric ?? ''
    deadline = body?.goal?.deadline ?? ''

    const config = useRuntimeConfig()
    const apiKey = config.geminiApiKey as string
    const model = (body?.model && ALLOWED_MODELS.has(body.model)) ? body.model : ((config.geminiModel as string) || 'gemini-flash-latest')
    if (!apiKey) return { messages: fallbackMessages(agents, workstreams, lead, recruited, trigger, note, metric, deadline), source: 'fallback', reason: 'no-api-key' }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const payload = {
      contents: [{ parts: [{ text: buildPrompt(body?.goal ?? { title: 'Goal' }, agents, workstreams, body?.thread ?? [], trigger, note) }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: RESPONSE_SCHEMA, temperature: 0.7 },
    }
    let lastErr: unknown
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await $fetch<any>(url, { method: 'POST', body: payload, timeout: 45000 })
        const text: string | undefined = res?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('')
        if (!text) throw new Error('Empty model response')
        const parsed = JSON.parse(text)
        return { messages: parsed?.messages ?? [], source: 'gemini', model }
      } catch (err: any) {
        lastErr = err
        const status = err?.status ?? err?.statusCode ?? err?.response?.status
        const retryable = status === 429 || (typeof status === 'number' && status >= 500) || /overload|timeout|fetch failed/i.test(String(err?.message ?? ''))
        if (attempt < 2 && retryable) { await sleep(600 * (attempt + 1)); continue }
        break
      }
    }
    return { messages: fallbackMessages(agents, workstreams, lead, recruited, trigger, note, metric, deadline), source: 'fallback', reason: String((lastErr as any)?.message ?? lastErr) }
  } catch (err: any) {
    return { messages: fallbackMessages(agents, workstreams, lead, recruited, trigger, note, metric, deadline), source: 'fallback', reason: String(err?.message ?? err) }
  }
})
