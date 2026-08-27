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
interface CorpusDoc { id?: string; name: string; folder?: string; summary?: string; chunks?: string[] }
interface Knowledge { snippets?: { name: string; folder?: string; snippet: string }[]; corpus?: CorpusDoc[] }

// ── Keyword search over the attached corpus (powers the search_knowledge tool) ──
const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'our', 'you', 'your', 'all', 'any', 'per', 'has', 'into', 'a', 'an', 'of', 'to', 'in', 'on', 'is', 'it', 'as', 'by', 'or', 'be', 'at', 'we'])
function terms(q: string): string[] {
  return (q.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w))
}
function searchCorpus(corpus: CorpusDoc[], query: string, limit = 6): { document: string; folder: string; passage: string }[] {
  const qs = terms(query)
  if (!qs.length) return []
  const hits: { document: string; folder: string; passage: string; score: number }[] = []
  for (const d of corpus) {
    const nameHay = `${d.name} ${d.summary ?? ''}`.toLowerCase()
    for (const c of d.chunks ?? []) {
      const hay = c.toLowerCase()
      let score = 0
      for (const q of qs) {
        if (nameHay.includes(q)) score += 2
        const m = hay.split(q).length - 1
        if (m > 0) score += 1 + Math.min(m, 4) * 0.5
      }
      if (score > 0) hits.push({ document: d.name, folder: d.folder ?? '', passage: c.trim(), score })
    }
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit).map(({ score, ...h }) => h)
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ messages?: ChatMessage[]; context?: string; model?: string; agent?: Agent; roster?: RosterAgent[]; knowledge?: Knowledge }>(event)
  const messages = (body?.messages ?? []).filter((m) => m?.text?.trim())
  if (!messages.length) { setResponseStatus(event, 400); return { error: 'No messages' } }
  const knowledge = body?.knowledge
  const corpus = knowledge?.corpus ?? []

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

  // ── Knowledge Base grounding ──
  // Relevance-injection: the most relevant passages from the attached KB, pre-ranked
  // client-side, given up front. Agentic: if a corpus rode along, the model can also
  // call search_knowledge to pull more passages on demand. Both cite by document name.
  const kbIndex = corpus.length
    ? `\nATTACHED KNOWLEDGE BASE (${corpus.length} document${corpus.length > 1 ? 's' : ''}) — you may call search_knowledge(query) to retrieve passages:\n` +
      corpus.map((d) => `- ${d.name}${d.folder ? ` (${d.folder})` : ''}${d.summary ? `: ${d.summary}` : ''}`).join('\n')
    : ''
  const kbSnippets = knowledge?.snippets?.length
    ? `\nRELEVANT KNOWLEDGE PASSAGES (cite the document name when you use one):\n` +
      knowledge.snippets.map((s) => `[${s.name}${s.folder ? ` · ${s.folder}` : ''}]\n${s.snippet}`).join('\n---\n')
    : ''
  const kbRule = (corpus.length || knowledge?.snippets?.length)
    ? 'KNOWLEDGE BASE — when the question concerns policy, process, SOPs or any attached reference material, ground your answer in the knowledge passages above (or fetch more with search_knowledge) and CITE the document name in your reply. If the knowledge base does not cover it, say so; do not invent policy.'
    : ''

  const system = [
    'You are Airene, the Mekari AI assistant inside an ERP suite (Talenta HR, Qontak CRM, Mekari WMS, Jurnal finance, Production).',
    'Answer concisely and practically, grounded ONLY in the context provided (a snapshot of the real ERP data, the attached knowledge base, or the result of a task the user ran). If the user asks for a draft (email, message, action list), produce it directly. If something is outside the provided data, say so briefly.',
    'DATA DISCIPLINE — never invent data. Report EXACT values from the context; never estimate, round, or make up figures, names, or records. Answer from the real lists in the context: employees → hr.directory; customers → crm.customersList; overdue → finance.overdueExamples, open invoices → finance.openInvoicesList, unpaid bills → finance.unpaidBillsList; work orders → production.openWorkOrdersList; stock totals → wms.inventory, and per-warehouse → wms.stockByWarehouse (use ONLY the named warehouse, not the aggregate). If a specific record, person, warehouse, or item is NOT in the data, say it is not in the data instead of guessing.',
    kbRule,
    agentBlock,
    body?.context ? `\nCONTEXT (real ERP data / task result):\n${body.context}` : '',
    kbIndex,
    kbSnippets,
  ].filter(Boolean).join('\n')

  if (!apiKey) {
    return { reply: "I can't reach the model right now, but based on the task result above I can help you draft follow-ups or explain any item — try asking again in a moment.", source: 'fallback' }
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const tools = corpus.length
    ? [{ functionDeclarations: [{
        name: 'search_knowledge',
        description: 'Search the attached Knowledge Base for passages relevant to a query. Use it for policy/process/SOP/reference questions. Returns the most relevant passages, each with its source document name.',
        parameters: { type: 'object', properties: { query: { type: 'string', description: 'What to look for, in a few keywords.' } }, required: ['query'] },
      }] }]
    : undefined

  const contents: any[] = messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] }))

  try {
    let lastText = ''
    const citations = new Set<string>()
    // Agentic loop: let the model call search_knowledge up to a few times.
    for (let step = 0; step < (tools ? 4 : 1); step++) {
      const res = await $fetch<any>(url, {
        method: 'POST',
        body: {
          systemInstruction: { parts: [{ text: system }] },
          contents,
          ...(tools ? { tools } : {}),
          generationConfig: { temperature: isSpecialist ? 0.3 : 0.6 },
        },
      })
      const parts: any[] = res?.candidates?.[0]?.content?.parts ?? []
      // The whole part is echoed back verbatim on the next turn — it carries the
      // thoughtSignature that thinking models require alongside the functionCall.
      const fcPart = parts.find((p) => p?.functionCall)
      const call = fcPart?.functionCall
      lastText = parts.map((p) => p?.text).filter(Boolean).join('') || lastText
      if (tools && call?.name === 'search_knowledge') {
        const q = String(call.args?.query ?? '')
        const results = searchCorpus(corpus, q)
        for (const r of results) citations.add(r.document)
        contents.push({ role: 'model', parts: [fcPart] })
        contents.push({ role: 'user', parts: [{ functionResponse: { id: call.id, name: 'search_knowledge', response: { results } } }] })
        continue
      }
      if (lastText) return { reply: lastText, source: 'gemini', model, citations: [...citations] }
      break
    }
    if (lastText) return { reply: lastText, source: 'gemini', model, citations: [...citations] }
    throw new Error('Empty response')
  } catch (err: any) {
    return { reply: 'Sorry — I hit an error reaching the model. Please try again.', source: 'fallback', reason: String(err?.message ?? err) }
  }
})
