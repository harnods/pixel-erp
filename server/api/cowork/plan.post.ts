/**
 * Cowork task executor — takes a natural-language task plus a snapshot of the ERP
 * mock DB (HR / CRM / WMS / Finance / Production) and asks Gemini to actually
 * PRODUCE the deliverables the user selected (Output popover): a briefing, action
 * items, an email draft, a spreadsheet, and/or a PDF report. Only the requested
 * artifacts are generated — grounded on the snapshot so every figure is real.
 *
 * The Gemini API key lives only here (server side) via runtimeConfig — never
 * shipped to the browser. If the key is missing or the call fails, a deterministic
 * grounded fallback produces the same requested artifacts so the demo always works.
 */

interface CoworkContext {
  hr?: Record<string, unknown>
  crm?: Record<string, unknown>
  wms?: Record<string, unknown>
  finance?: Record<string, unknown>
  production?: Record<string, unknown>
  today?: string
  user?: string
}

// Output display name → artifact key. 'Slack message' is intentionally absent
// (disabled / coming soon), so it can never be requested.
const OUTPUT_KEYS: Record<string, string> = {
  'Briefing summary': 'briefing',
  'Action items': 'actionItems',
  'Email draft': 'email',
  'Spreadsheet': 'spreadsheet',
  'PDF report': 'pdf',
}

const ARTIFACT_SCHEMAS: Record<string, any> = {
  briefing: {
    type: 'object',
    properties: {
      summary: {
        type: 'array',
        items: {
          type: 'object',
          properties: { title: { type: 'string' }, detail: { type: 'string' }, priority: { type: 'string', enum: ['High', 'Medium', 'Low'] } },
          required: ['title', 'detail', 'priority'],
        },
      },
      findings: {
        type: 'array',
        items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' } }, required: ['title', 'detail'] },
      },
    },
    required: ['summary', 'findings'],
  },
  actionItems: {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        title: { type: 'string' }, detail: { type: 'string' },
        owner: { type: 'string', description: 'A real name/role from the data' },
        due: { type: 'string' }, priority: { type: 'string', enum: ['High', 'Medium', 'Low'] },
        action: { type: 'string', description: 'The single most relevant capability from the actions you can take (verbatim), or "" if none fits.' },
      },
      required: ['title', 'detail', 'owner', 'due', 'priority', 'action'],
    },
  },
  email: {
    type: 'object',
    properties: { to: { type: 'string' }, subject: { type: 'string' }, body: { type: 'string', description: 'Full email body, real names/figures, \\n for line breaks' } },
    required: ['to', 'subject', 'body'],
  },
  spreadsheet: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      columns: { type: 'array', items: { type: 'string' } },
      rows: { type: 'array', items: { type: 'array', items: { type: 'string' } }, description: 'Each row aligns to columns; use real records' },
    },
    required: ['title', 'columns', 'rows'],
  },
  pdf: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      sections: { type: 'array', items: { type: 'object', properties: { heading: { type: 'string' }, body: { type: 'string' } }, required: ['heading', 'body'] } },
    },
    required: ['title', 'sections'],
  },
}

const ARTIFACT_INSTRUCTIONS: Record<string, string> = {
  briefing: '- artifacts.briefing: { summary: 3-6 prioritised (High/Medium/Low) items the user must act on, each grounded in a specific record; findings: 2-4 specific observations }.',
  actionItems: '- artifacts.actionItems: 3-6 concrete to-dos, each with an owner (a real name/role from the data), a due date, a priority, and an `action` set VERBATIM to the single most relevant capability from the actions you can take (listed above) — or "" if none of them fit. Only propose actions you are actually able to take.',
  email: '- artifacts.email: a ready-to-send email ({to, subject, body}) — e.g. a payment reminder to a specific overdue customer with the real amount. Use \\n for line breaks and sign off as the user.',
  spreadsheet: '- artifacts.spreadsheet: a table ({title, columns, rows}) of the actual records relevant to the task (e.g. overdue invoices with customer, number, balance, days overdue). Use real values from the snapshot.',
  pdf: '- artifacts.pdf: a formatted report ({title, sections:[{heading,body}]}) suitable for printing — an executive overview grounded in the data.',
}

function buildPrompt(task: string, ctx: CoworkContext, requested: string[], sources?: string[], agent?: { name?: string; persona?: string; actions?: string[] }): string {
  return [
    agent?.name
      ? `You are "${agent.name}", a specialist AI agent inside the Mekari Cowork co-worker (Talenta HR, Qontak CRM, Mekari WMS, Jurnal finance, Production).`
      : 'You are Mekari Cowork — an autonomous AI co-worker embedded in a Mekari ERP suite\n(Talenta HR, Qontak CRM, Mekari WMS, Jurnal finance, and Production).',
    agent?.persona ? `Act as ${agent.persona}` : '',
    agent?.actions?.length ? `You can take these actions on action items — prefer them where relevant: ${agent.actions.join(', ')}.` : '',
    '',
    'You are given a task and a JSON snapshot of the REAL current data in the ERP.',
    'ACTUALLY DO THE TASK and produce the requested deliverables — do not describe',
    'what you would do. Ground every number, name, invoice/PO number, SKU and amount',
    'in the snapshot; never invent values that contradict it.',
    '',
    `Today: ${ctx.today ?? 'today'}. User: ${ctx.user ?? 'the user'}.`,
    sources && sources.length ? `Only use these ERP sources: ${sources.join(', ')}.` : '',
    '',
    'ERP DATA SNAPSHOT (JSON):',
    JSON.stringify({ hr: ctx.hr, crm: ctx.crm, wms: ctx.wms, finance: ctx.finance, production: ctx.production }, null, 0),
    '',
    `USER TASK: "${task}"`,
    '',
    'Return JSON with:',
    '- taskTitle: a crisp title for this task.',
    '- intro: one sentence describing what you did.',
    '- metric: a punchy headline of the outcome (grounded).',
    '- sources: 3-5 datasets you consulted, each with a concrete count from the snapshot.',
    '- steps: 4-6 sequential actions you took.',
    '- artifacts: an object containing ONLY these keys, nothing else:',
    ...requested.map((k) => '  ' + ARTIFACT_INSTRUCTIONS[k]),
    'Produce ONLY the requested artifacts. No markdown, JSON only.',
  ].join('\n')
}

function buildSchema(requested: string[]) {
  const artifactProps: Record<string, any> = {}
  for (const k of requested) artifactProps[k] = ARTIFACT_SCHEMAS[k]
  return {
    type: 'object',
    properties: {
      taskTitle: { type: 'string' },
      intro: { type: 'string' },
      metric: { type: 'string' },
      sources: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, detail: { type: 'string' } }, required: ['name', 'detail'] } },
      steps: { type: 'array', items: { type: 'object', properties: { title: { type: 'string' }, detail: { type: 'string' } }, required: ['title', 'detail'] } },
      artifacts: { type: 'object', properties: artifactProps, required: requested },
    },
    required: ['taskTitle', 'intro', 'metric', 'sources', 'steps', 'artifacts'],
  }
}

// Deterministic grounded fallback producing exactly the requested artifacts.
function fallbackPlan(task: string, ctx: CoworkContext, requested: string[]) {
  const fin = (ctx.finance ?? {}) as any
  const wms = (ctx.wms ?? {}) as any
  const overdue: any[] = fin.overdueExamples ?? []
  const artifacts: Record<string, any> = {}
  if (requested.includes('briefing')) artifacts.briefing = {
    summary: [
      { title: 'Overdue receivables', detail: `${fin.overdueInvoices ?? '—'} invoices past due (${fin.overdueBalance ?? '—'}).`, priority: 'High' },
      { title: 'Low-stock SKUs', detail: `${wms.lowStock ?? '—'} items below reorder point.`, priority: 'Medium' },
    ],
    findings: [{ title: 'Attention needed', detail: 'Review the highest-value overdue items first.' }],
  }
  if (requested.includes('actionItems')) artifacts.actionItems = overdue.slice(0, 3).map((i) => ({
    title: `Chase ${i.customer}`, detail: `Follow up on ${i.number} (${i.balance}).`, owner: 'Finance', due: 'This week', priority: 'High', action: '',
  }))
  if (requested.includes('email') && overdue[0]) artifacts.email = {
    to: overdue[0].customer, subject: `Payment reminder — ${overdue[0].number}`,
    body: `Dear ${overdue[0].customer},\n\nOur records show invoice ${overdue[0].number} for ${overdue[0].balance} is overdue. We'd appreciate settlement at your earliest convenience.\n\nThank you,\n${ctx.user ?? 'Finance'}`,
  }
  if (requested.includes('spreadsheet')) artifacts.spreadsheet = {
    title: 'Overdue invoices', columns: ['Invoice', 'Customer', 'Balance'],
    rows: overdue.map((i) => [i.number, i.customer, i.balance]),
  }
  if (requested.includes('pdf')) artifacts.pdf = {
    title: task, sections: [{ heading: 'Overview', body: `${fin.overdueInvoices ?? '—'} overdue invoices totalling ${fin.overdueBalance ?? '—'}.` }],
  }
  return {
    taskTitle: task.length > 48 ? task.slice(0, 46) + '…' : task,
    intro: 'Cowork reviewed your ERP data and produced the requested deliverables.',
    metric: `${fin.overdueInvoices ?? 'A few'} items need attention`,
    sources: [
      { name: 'Jurnal finance', detail: `${fin.overdueInvoices ?? '—'} overdue invoices` },
      { name: 'Mekari WMS', detail: `${wms.lowStock ?? '—'} low-stock SKUs` },
    ],
    steps: [
      { title: 'Read task context', detail: 'Parsed your request and data sources.' },
      { title: 'Pull relevant records', detail: 'Gathered the records for this task.' },
      { title: 'Produce deliverables', detail: 'Generated the requested outputs.' },
    ],
    artifacts,
  }
}

const ALLOWED_MODELS = new Set([
  'gemini-flash-latest', 'gemini-pro-latest', 'gemini-flash-lite-latest',
  'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview',
])

export default defineEventHandler(async (event) => {
  const body = await readBody<{ task?: string; context?: CoworkContext; model?: string; sources?: string[]; outputs?: string[]; agent?: { name?: string; persona?: string } }>(event)
  const task = (body?.task ?? '').trim()
  const ctx = body?.context ?? {}
  if (!task) {
    setResponseStatus(event, 400)
    return { error: 'Missing task' }
  }

  // Which artifacts to produce (default briefing). Slack is never in OUTPUT_KEYS.
  const requested = [...new Set((body?.outputs ?? []).map((o) => OUTPUT_KEYS[o]).filter(Boolean))]
  if (!requested.length) requested.push('briefing')

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey as string
  const model = (body?.model && ALLOWED_MODELS.has(body.model)) ? body.model : ((config.geminiModel as string) || 'gemini-flash-latest')

  if (!apiKey) return { plan: fallbackPlan(task, ctx, requested), source: 'fallback', reason: 'no-api-key' }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const res = await $fetch<any>(url, {
      method: 'POST',
      body: {
        contents: [{ parts: [{ text: buildPrompt(task, ctx, requested, body?.sources, body?.agent) }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: buildSchema(requested), temperature: 0.6 },
      },
    })
    const text: string | undefined = res?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('')
    if (!text) throw new Error('Empty model response')
    const plan = JSON.parse(text)
    return { plan, source: 'gemini', model }
  } catch (err: any) {
    return { plan: fallbackPlan(task, ctx, requested), source: 'fallback', reason: String(err?.message ?? err) }
  }
})
