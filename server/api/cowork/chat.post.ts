/**
 * Airene chat — a real Gemini-backed conversation. Optionally grounded on a
 * context blob (e.g. the result of a Cowork task run) so the user can ask
 * follow-up questions about it. Key stays server-side (runtimeConfig).
 */
const ALLOWED_MODELS = new Set([
  'gemini-flash-latest', 'gemini-pro-latest', 'gemini-flash-lite-latest',
  'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview',
])

interface ChatMessage { role: 'user' | 'assistant'; text: string }
interface Agent { name?: string; role?: string; module?: string; persona?: string; skills?: string[] }
interface RosterAgent { name?: string; role?: string; module?: string }

export default defineEventHandler(async (event) => {
  const body = await readBody<{ messages?: ChatMessage[]; context?: string; model?: string; agent?: Agent; roster?: RosterAgent[] }>(event)
  const messages = (body?.messages ?? []).filter((m) => m?.text?.trim())
  if (!messages.length) { setResponseStatus(event, 400); return { error: 'No messages' } }

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey as string
  const model = (body?.model && ALLOWED_MODELS.has(body.model)) ? body.model : ((config.geminiModel as string) || 'gemini-flash-latest')

  const agent = body?.agent
  // A specialist agent (not the all-round default "Mekari Airene") is strictly
  // constrained to its own listed skills. It must decline everything else.
  const isSpecialist = !!agent && !/airene/i.test(agent.name ?? '')
  // The roster lets a specialist name the correct agent to hand off to.
  const roster = (body?.roster ?? []).filter((a) => a?.name && a.name !== agent?.name)
  const rosterLine = roster.length
    ? `Other agents and what they handle: ${roster.map((a) => `${a.name} — ${a.role} (${a.module})`).join('; ')}.`
    : ''
  const agentBlock = agent ? [
    '',
    `You are acting as "${agent.name}"${agent.role ? ` (${agent.role})` : ''}, a specialist Cowork agent inside the Mekari ERP.`,
    agent.persona ? `Persona: ${agent.persona}` : '',
    agent.module ? `Your area of responsibility: ${agent.module}.` : '',
    agent.skills?.length ? `Your ONLY capabilities are these skills: ${agent.skills.join('; ')}.` : '',
    isSpecialist ? rosterLine : '',
    isSpecialist
      ? [
          'STRICT SCOPE RULE — read carefully:',
          '- Help ONLY when the user\'s request is DIRECTLY served by one of your listed skills above.',
          '- If the request belongs to another function — even an adjacent one — you MUST DECLINE. This includes, for example: shipping / delivery / logistics / fulfilment, warehouse & stock, procurement / purchasing, payroll / attendance / HR, recruitment, accounting / invoicing / reconciliation, production / work orders — unless that exact thing is one of YOUR listed skills.',
          '- To decline: reply in ONE sentence that it is outside your area as the ' + (agent.role || agent.name) + ', name the correct agent from the roster that handles it, and suggest switching to them. Do NOT answer the question, do NOT give partial help, do NOT ask a follow-up.',
          '- When in doubt about whether something is in scope, DECLINE.',
        ].join('\n')
      : 'As the all-round assistant you may help across every module.',
  ].filter(Boolean).join('\n') : ''

  const system = [
    'You are Airene, the Mekari AI assistant inside an ERP suite (Talenta HR, Qontak CRM, Mekari WMS, Jurnal finance, Production).',
    'Answer concisely and practically, grounded ONLY in the context provided (a snapshot of the real ERP data, or the result of a task the user ran). If the user asks for a draft (email, message, action list), produce it directly. If something is outside the provided data, say so briefly.',
    agentBlock,
    body?.context ? `\nCONTEXT (real ERP data / task result):\n${body.context}` : '',
  ].join('\n')

  if (!apiKey) {
    return { reply: "I can't reach the model right now, but based on the task result above I can help you draft follow-ups or explain any item — try asking again in a moment.", source: 'fallback' }
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const res = await $fetch<any>(url, {
      method: 'POST',
      body: {
        systemInstruction: { parts: [{ text: system }] },
        contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
        generationConfig: { temperature: isSpecialist ? 0.3 : 0.6 },
      },
    })
    const reply: string = res?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('') || ''
    if (!reply) throw new Error('Empty response')
    return { reply, source: 'gemini', model }
  } catch (err: any) {
    return { reply: 'Sorry — I hit an error reaching the model. Please try again.', source: 'fallback', reason: String(err?.message ?? err) }
  }
})
