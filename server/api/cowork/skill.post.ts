/**
 * Cowork skill generator — turns a natural-language description into a structured
 * skill: a name, a one-line description, the ERP module it belongs to, the
 * concrete ACTIONS an agent can take, and a markdown definition (skills are
 * authored & stored as .md). The Gemini key stays server-side (runtimeConfig);
 * if it's missing or the call fails, a deterministic fallback keeps the demo working.
 */
const MODULES = ['HR', 'Sales', 'CRM', 'WMS', 'Finance', 'Production']

const ALLOWED_MODELS = new Set([
  'gemini-flash-latest', 'gemini-pro-latest', 'gemini-flash-lite-latest',
  'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview',
])

const SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    module: { type: 'string', enum: MODULES },
    actions: { type: 'array', items: { type: 'string' } },
    markdown: { type: 'string' },
  },
  required: ['name', 'description', 'actions', 'markdown'],
}

function buildPrompt(prompt: string): string {
  return [
    'You are defining a reusable SKILL for an AI co-worker inside an ERP (Mekari).',
    'A skill is a capability an agent can use to complete a task; it bundles the concrete ACTIONS the agent may perform.',
    `The ERP modules are: ${MODULES.join(', ')}.`,
    '',
    'From the user request below, produce:',
    '- name: a short imperative skill name (e.g. "Chase overdue receivables").',
    '- description: one sentence on what the skill does.',
    '- module: the single best-fit module from the list (omit if truly cross-module).',
    '- actions: 1–3 short action labels the agent can take (e.g. "Draft reminder", "Send reminder").',
    '- markdown: the full skill definition in Markdown — sections: # <name>, ## Purpose, ## When to use, ## Steps (numbered), ## Actions (bulleted).',
    '',
    `User request: ${prompt}`,
  ].join('\n')
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'skill'
}

function fallbackSkill(prompt: string) {
  const p = prompt.trim()
  const name = p.length > 48 ? p.slice(0, 46) + '…' : (p || 'New skill')
  const lower = p.toLowerCase()
  let module: string | undefined
  if (/payroll|attendance|employee|contract|reprimand|hr\b|leave/.test(lower)) module = 'HR'
  else if (/invoice|receivable|payable|bill|reconcil|payment|finance/.test(lower)) module = 'Finance'
  else if (/stock|warehouse|sku|reorder|inbound|outbound/.test(lower)) module = 'WMS'
  else if (/work order|production|bom|manufactur/.test(lower)) module = 'Production'
  else if (/deal|pipeline|customer|crm|follow.?up/.test(lower)) module = 'CRM'
  else if (/order|deliver|ship|quote|sales/.test(lower)) module = 'Sales'
  const actions = ['Draft', 'Send']
  const markdown = [
    `# ${name}`,
    '',
    '## Purpose',
    p || 'Describe what this skill does.',
    '',
    '## When to use',
    'When the co-worker needs to perform this capability while completing a task.',
    '',
    '## Steps',
    '1. Gather the relevant data from the connected sources.',
    '2. Prepare the output for review.',
    '3. Perform the action on approval.',
    '',
    '## Actions',
    ...actions.map((a) => `- ${a}`),
  ].join('\n')
  return { name, description: p || 'Custom skill', module, actions, markdown }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ prompt?: string; model?: string }>(event)
  const prompt = (body?.prompt ?? '').trim()
  if (!prompt) {
    setResponseStatus(event, 400)
    return { error: 'Missing prompt' }
  }

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey as string
  const model = (body?.model && ALLOWED_MODELS.has(body.model)) ? body.model : ((config.geminiModel as string) || 'gemini-flash-latest')

  if (!apiKey) return { skill: fallbackSkill(prompt), source: 'fallback', reason: 'no-api-key' }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const res = await $fetch<any>(url, {
      method: 'POST',
      body: {
        contents: [{ parts: [{ text: buildPrompt(prompt) }] }],
        generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.5 },
      },
    })
    const text: string | undefined = res?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('')
    if (!text) throw new Error('Empty model response')
    const skill = JSON.parse(text)
    return { skill, source: 'gemini', model }
  } catch (err: any) {
    return { skill: fallbackSkill(prompt), source: 'fallback', reason: String(err?.message ?? err) }
  }
})
