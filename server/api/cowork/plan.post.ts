/**
 * Cowork task planner — takes a natural-language task plus a compact snapshot of
 * the ERP mock DB (HR / CRM / WMS / finance) and asks Gemini to produce a
 * structured "co-worker" briefing: what it's doing, sources, findings, and a
 * prioritised executive summary. Grounded on the snapshot so numbers are real.
 *
 * The Gemini API key lives only here (server side) via runtimeConfig — it is
 * never shipped to the browser. If the key is missing or the call fails, a
 * deterministic fallback briefing is returned so the demo always works.
 */

interface CoworkContext {
  hr?: Record<string, unknown>
  crm?: Record<string, unknown>
  wms?: Record<string, unknown>
  finance?: Record<string, unknown>
  today?: string
  user?: string
}

interface CoworkPlan {
  taskTitle: string
  intro: string
  sources: { name: string; detail: string }[]
  steps: { title: string; detail: string }[]
  findings: { title: string; detail: string }[]
  metric: string
  summary: { title: string; detail: string; priority: 'High' | 'Medium' | 'Low' }[]
  alsoPrepared: { title: string; detail: string }[]
}

const RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    taskTitle: { type: 'string', description: 'Short imperative title, max 6 words' },
    intro: { type: 'string', description: 'One sentence: what Cowork is doing for this task' },
    sources: {
      type: 'array',
      items: {
        type: 'object',
        properties: { name: { type: 'string' }, detail: { type: 'string' } },
        required: ['name', 'detail'],
      },
    },
    steps: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, detail: { type: 'string' } },
        required: ['title', 'detail'],
      },
    },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, detail: { type: 'string' } },
        required: ['title', 'detail'],
      },
    },
    metric: { type: 'string', description: 'Headline result, e.g. "5 things need your attention"' },
    summary: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          priority: { type: 'string', enum: ['High', 'Medium', 'Low'] },
        },
        required: ['title', 'detail', 'priority'],
      },
    },
    alsoPrepared: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, detail: { type: 'string' } },
        required: ['title', 'detail'],
      },
    },
  },
  required: ['taskTitle', 'intro', 'sources', 'steps', 'findings', 'metric', 'summary', 'alsoPrepared'],
}

function buildPrompt(task: string, ctx: CoworkContext, sources?: string[], outputs?: string[]): string {
  return [
    'You are Mekari Cowork — an autonomous AI co-worker embedded in a Mekari ERP suite.',
    'The suite has these connected products the user works across:',
    '- Talenta (HR / people): employees, org, time-off, payroll.',
    '- Qontak (CRM): customers, deals, orders, tasks.',
    '- WMS (warehouse): stock, inbound/outbound, storage locations.',
    '- Jurnal (accounting/finance): invoices, bills, cash, receivables/payables.',
    '',
    'You are given a task from the user and a JSON snapshot of the REAL current data',
    'in their ERP mock database. Ground every number and finding in this snapshot —',
    'do NOT invent figures that contradict it. Reference specific records (employee',
    'names, customer names, PO/invoice numbers, SKUs) where the snapshot provides them.',
    '',
    `Today: ${ctx.today ?? 'today'}. User: ${ctx.user ?? 'the user'}.`,
    sources && sources.length ? `Only use these connected sources: ${sources.join(', ')}.` : '',
    outputs && outputs.length ? `The user wants these deliverables prepared: ${outputs.join(', ')}. Reflect them in the alsoPrepared list.` : '',
    '',
    'ERP DATA SNAPSHOT (JSON):',
    JSON.stringify({ hr: ctx.hr, crm: ctx.crm, wms: ctx.wms, finance: ctx.finance }, null, 0),
    '',
    `USER TASK: "${task}"`,
    '',
    'Produce a co-worker briefing as JSON:',
    '- taskTitle: a crisp title for this task.',
    '- intro: one sentence describing what you are reviewing.',
    '- sources: 3-5 ERP products/datasets you consulted, each with a concrete count',
    '  drawn from the snapshot (e.g. {name:"Qontak CRM", detail:"42 customers, 18 open deals"}).',
    '- steps: 4-6 sequential actions you took, each a short title + detail.',
    '- findings: 2-4 specific, grounded observations that need attention.',
    '- metric: a punchy headline of the outcome.',
    '- summary: 3-6 prioritised items (High/Medium/Low) the user must act on, each grounded.',
    '- alsoPrepared: 2 follow-up artefacts you drafted (e.g. an action list, a reminder email).',
    'Keep language concise, factual, and specific to the data. No markdown, JSON only.',
  ].join('\n')
}

// Deterministic grounded fallback if Gemini is unavailable.
function fallbackPlan(task: string, ctx: CoworkContext): CoworkPlan {
  const hr = (ctx.hr ?? {}) as Record<string, number | string>
  const crm = (ctx.crm ?? {}) as Record<string, number | string>
  const wms = (ctx.wms ?? {}) as Record<string, number | string>
  const fin = (ctx.finance ?? {}) as Record<string, number | string>
  return {
    taskTitle: task.length > 48 ? task.slice(0, 46) + '…' : task,
    intro: 'Cowork reviewed HR, CRM, WMS, and finance data across your Mekari ERP.',
    sources: [
      { name: 'Talenta HR', detail: `${hr.totalEmployees ?? '—'} employees` },
      { name: 'Qontak CRM', detail: `${crm.customers ?? '—'} customers, ${crm.openDeals ?? '—'} open deals` },
      { name: 'WMS', detail: `${wms.skus ?? '—'} SKUs, ${wms.lowStock ?? '—'} low-stock` },
      { name: 'Jurnal finance', detail: `${fin.overdueInvoices ?? '—'} overdue invoices` },
    ],
    steps: [
      { title: 'Read task context', detail: 'Parsed your request and connected data sources.' },
      { title: 'Review HR & CRM', detail: 'Scanned employees, customers, and open deals.' },
      { title: 'Review WMS & finance', detail: 'Checked stock levels and receivables/payables.' },
      { title: 'Build briefing', detail: 'Prioritised what needs your attention.' },
    ],
    findings: [
      { title: `${wms.lowStock ?? 'Several'} SKUs are low on stock`, detail: 'Reorder before they block open sales orders.' },
      { title: `${fin.overdueInvoices ?? 'Some'} invoices are overdue`, detail: 'Collecting the largest would cover this week\'s payables.' },
    ],
    metric: 'A few things need your attention',
    summary: [
      { title: 'Overdue receivables', detail: `${fin.overdueInvoices ?? '—'} invoices past due.`, priority: 'High' },
      { title: 'Low-stock SKUs', detail: `${wms.lowStock ?? '—'} items below reorder point.`, priority: 'High' },
      { title: 'Open deals to progress', detail: `${crm.openDeals ?? '—'} deals awaiting next step.`, priority: 'Medium' },
    ],
    alsoPrepared: [
      { title: 'Action list', detail: 'Suggested follow-ups ready to assign.' },
      { title: 'Reminder drafts', detail: 'Payment reminders for the top overdue invoices.' },
    ],
  }
}

// Models the client is allowed to pick (keeps arbitrary values out of the URL).
const ALLOWED_MODELS = new Set([
  'gemini-flash-latest', 'gemini-pro-latest', 'gemini-flash-lite-latest',
  'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview',
])

export default defineEventHandler(async (event) => {
  const body = await readBody<{ task?: string; context?: CoworkContext; model?: string; sources?: string[]; outputs?: string[] }>(event)
  const task = (body?.task ?? '').trim()
  const ctx = body?.context ?? {}
  if (!task) {
    setResponseStatus(event, 400)
    return { error: 'Missing task' }
  }

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey as string
  const model = (body?.model && ALLOWED_MODELS.has(body.model))
    ? body.model
    : ((config.geminiModel as string) || 'gemini-flash-latest')

  if (!apiKey) {
    return { plan: fallbackPlan(task, ctx), source: 'fallback', reason: 'no-api-key' }
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const res = await $fetch<any>(url, {
      method: 'POST',
      body: {
        contents: [{ parts: [{ text: buildPrompt(task, ctx, body?.sources, body?.outputs) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          temperature: 0.6,
        },
      },
    })
    const text: string | undefined = res?.candidates?.[0]?.content?.parts
      ?.map((p: any) => p?.text)
      .filter(Boolean)
      .join('')
    if (!text) throw new Error('Empty model response')
    const plan = JSON.parse(text) as CoworkPlan
    return { plan, source: 'gemini', model }
  } catch (err: any) {
    return { plan: fallbackPlan(task, ctx), source: 'fallback', reason: String(err?.message ?? err) }
  }
})
