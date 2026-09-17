/**
 * Cowork multi-agent ROOM — a real agent-to-agent conversation.
 *
 * A room has a lead agent (the one the user is talking to) and one or more
 * colleague agents. The lead answers the user, but when the question needs
 * information or judgement outside its own area it can CONSULT a colleague via
 * the `consult_agent` tool. Each colleague answers grounded ONLY in its own
 * module data (a separate Gemini call with that agent's persona + data slice),
 * and its reply is fed back to the lead, which keeps going until it can give the
 * user a final answer.
 *
 * The handler returns the ordered list of turns — lead narration, each
 * colleague's answer, and the final synthesis — each tagged with its authoring
 * agent id, so the client can render them as a group chat. The lead decides when
 * (and whether) to pull anyone in; nothing here is scripted.
 */
const ALLOWED_MODELS = new Set([
  'gemini-flash-latest', 'gemini-pro-latest', 'gemini-flash-lite-latest',
  'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview',
])

interface Msg { role: 'user' | 'assistant'; text: string }
interface Agent { id: string; name: string; role?: string; module?: string; persona?: string; skills?: string[] }
interface Body { messages?: Msg[]; lead?: Agent; agents?: Agent[]; grounds?: Record<string, string>; model?: string }

// Consulted-colleague answer: one focused Gemini call, grounded ONLY in that
// agent's own module data. Kept short — it is one voice in a group chat.
async function consult(url: string, agent: Agent, ground: string, question: string, userQuestion: string): Promise<string> {
  const system = [
    `You are "${agent.name}"${agent.role ? ` (${agent.role})` : ''}, a specialist agent inside the Mekari ERP, being consulted by a colleague agent in a shared room.`,
    agent.persona ? `Persona: ${agent.persona}` : '',
    agent.module ? `Your area of responsibility: ${agent.module}. Answer ONLY from your own area and the data below.` : '',
    'Reply in 1–3 short sentences, directly to your colleague. Report EXACT values from your data — never invent, estimate or round figures, names or records. If the answer is not in your data, say so briefly.',
    userQuestion ? `\nFor context, the user's original question to the room was: "${userQuestion}"` : '',
    ground ? `\nCONTEXT (your area data):\n${ground}` : '',
  ].filter(Boolean).join('\n')
  const res = await $fetch<any>(url, {
    method: 'POST',
    body: {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: question }] }],
      generationConfig: { temperature: 0.3 },
    },
  })
  const parts: any[] = res?.candidates?.[0]?.content?.parts ?? []
  return parts.map((p) => p?.text).filter(Boolean).join('') || '(no answer)'
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const messages = (body?.messages ?? []).filter((m) => m?.text?.trim())
  const lead = body?.lead
  const agents = body?.agents ?? []
  const grounds = body?.grounds ?? {}
  if (!messages.length || !lead) { setResponseStatus(event, 400); return { error: 'Missing messages or lead' } }

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey as string
  const model = (body?.model && ALLOWED_MODELS.has(body.model)) ? body.model : ((config.geminiModel as string) || 'gemini-flash-latest')

  const colleagues = agents.filter((a) => a.id !== lead.id)
  const userQuestion = [...messages].reverse().find((m) => m.role === 'user')?.text ?? ''

  // ── Fallback when the model is unreachable ──
  if (!apiKey) {
    return { turns: [{ agentId: lead.id, text: "I can't reach the model right now — try again in a moment and I'll loop in the team if needed." }], source: 'fallback', model }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  const rosterLine = colleagues.length
    ? colleagues.map((a) => `- ${a.id}: ${a.name} — ${a.role ?? ''} (${a.module ?? ''})`).join('\n')
    : '(no colleagues available)'

  const system = [
    `You are "${lead.name}"${lead.role ? ` (${lead.role})` : ''}, the lead agent in a multi-agent room inside the Mekari ERP (Talenta HR, Qontak CRM, Mekari WMS, Jurnal finance, Production).`,
    lead.persona ? `Persona: ${lead.persona}` : '',
    lead.module ? `Your own area of responsibility: ${lead.module}.` : '',
    '',
    'COLLEAGUE AGENTS you can consult (call consult_agent with their id):',
    rosterLine,
    '',
    'HOW TO WORK:',
    '- Answer the user directly from YOUR OWN area data when you can.',
    '- When the question needs information or judgement outside your area, call consult_agent(agent_id, question) to ask the right colleague, then wait for their answer. You may consult more than one colleague, one call at a time.',
    '- Consult ONLY when genuinely needed — do not consult for things you can answer yourself.',
    '- Before a consult, add a short one-line note to the user saying who you are checking with and why (e.g. "Let me confirm the overtime with the Production agent.").',
    '- When you have what you need, give a concise FINAL answer to the user, synthesising what colleagues told you and crediting them by name.',
    'DATA DISCIPLINE — report EXACT values from the provided data; never invent, estimate or round figures, names or records. If something is not in the data, say so.',
    grounds[lead.id] ? `\nCONTEXT (your area data):\n${grounds[lead.id]}` : '',
  ].filter(Boolean).join('\n')

  const tools = colleagues.length
    ? [{ functionDeclarations: [{
        name: 'consult_agent',
        description: `Ask a colleague agent a question when it is outside your area. Valid agent_id values: ${colleagues.map((a) => a.id).join(', ')}.`,
        parameters: {
          type: 'object',
          properties: {
            agent_id: { type: 'string', description: 'The colleague to ask.', enum: colleagues.map((a) => a.id) },
            question: { type: 'string', description: 'A specific question for that colleague.' },
          },
          required: ['agent_id', 'question'],
        },
      }] }]
    : undefined

  const contents: any[] = messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] }))
  const turns: { agentId: string; text: string }[] = []

  try {
    let consults = 0
    for (let step = 0; step < 8; step++) {
      const res = await $fetch<any>(url, {
        method: 'POST',
        body: {
          systemInstruction: { parts: [{ text: system }] },
          contents,
          ...(tools ? { tools } : {}),
          generationConfig: { temperature: 0.4 },
        },
      })
      const parts: any[] = res?.candidates?.[0]?.content?.parts ?? []
      const fcPart = parts.find((p) => p?.functionCall)
      const call = fcPart?.functionCall
      const text = parts.map((p) => p?.text).filter(Boolean).join('').trim()

      // Any narration the lead emits alongside a consult (or as its final answer)
      // is a lead turn shown to the user.
      if (text) turns.push({ agentId: lead.id, text })

      if (tools && call?.name === 'consult_agent' && consults < 5) {
        consults++
        const targetId = String(call.args?.agent_id ?? '')
        const question = String(call.args?.question ?? '')
        const target = colleagues.find((a) => a.id === targetId)
        let answer = `I don't have a colleague with id "${targetId}" in this room.`
        if (target) {
          answer = await consult(url, target, grounds[target.id] ?? '', question, userQuestion)
          turns.push({ agentId: target.id, text: answer })
        }
        // Echo the call + its result back so the lead can continue reasoning.
        contents.push({ role: 'model', parts: [fcPart] })
        contents.push({ role: 'user', parts: [{ functionResponse: { id: call.id, name: 'consult_agent', response: { agent: target?.name ?? targetId, answer } } }] })
        continue
      }
      // No (more) consults — the lead has answered.
      break
    }
    if (!turns.length) throw new Error('Empty response')
    return { turns, source: 'gemini', model }
  } catch (err: any) {
    return { turns: [{ agentId: lead.id, text: 'Sorry — I hit an error reaching the model. Please try again.' }], source: 'fallback', reason: String(err?.message ?? err), model }
  }
})
