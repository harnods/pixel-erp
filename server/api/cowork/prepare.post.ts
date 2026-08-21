/**
 * Cowork task "prepare" — turns the user's task request into (1) a clear,
 * first-person INSTRUCTION the AI will follow, and (2) a short WORKFLOW of the
 * concrete steps it will run. Shown on the task detail page before the task is
 * run. Gemini-backed with a deterministic grounded fallback. Key stays server-side.
 */
const ALLOWED_MODELS = new Set([
  'gemini-flash-latest', 'gemini-pro-latest', 'gemini-flash-lite-latest',
  'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview',
])

export default defineEventHandler(async (event) => {
  const body = await readBody<{ task?: string; modules?: string[]; outputs?: string[]; sources?: string[]; model?: string }>(event)
  const task = (body?.task ?? '').trim()
  if (!task) { setResponseStatus(event, 400); return { error: 'Missing task' } }

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey as string
  const model = (body?.model && ALLOWED_MODELS.has(body.model)) ? body.model : ((config.geminiModel as string) || 'gemini-flash-latest')

  const outputs = body?.outputs?.length ? body.outputs.join(', ') : 'a briefing'
  const sources = body?.sources?.length ? body.sources.join(', ') : (body?.modules?.length ? body.modules.join(', ') : 'the ERP')

  const fallback = {
    instruction: `Review ${sources} and ${task.charAt(0).toLowerCase() + task.slice(1)}${/[.!?]$/.test(task) ? '' : '.'} Produce ${outputs}, grounded in the current ERP data.`,
    workflow: [
      `Pull the relevant records from ${sources}.`,
      'Analyse them against the request and the latest data.',
      `Draft ${outputs}.`,
      'Flag anything that needs your attention and suggest next steps.',
    ],
  }

  if (!apiKey) return { ...fallback, source: 'fallback', reason: 'no-api-key' }

  try {
    const prompt = [
      'You are Mekari Cowork, an AI co-worker inside an ERP suite (Talenta HR, Qontak CRM, Mekari WMS, Jurnal finance, Production).',
      'Turn the user\'s task request into:',
      '1. instruction — one clear, first-person paragraph (2-3 sentences) describing exactly what you will do, as if you accepted the task.',
      '2. workflow — 3-5 short, concrete steps you will run, in order.',
      `Available sources/modules: ${sources}. Deliverables to produce: ${outputs}.`,
      '',
      `USER REQUEST: "${task}"`,
      '',
      'Return JSON only: { "instruction": string, "workflow": string[] }.',
    ].join('\n')
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const res = await $fetch<any>(url, {
      method: 'POST',
      body: {
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: { instruction: { type: 'string' }, workflow: { type: 'array', items: { type: 'string' } } },
            required: ['instruction', 'workflow'],
          },
          temperature: 0.4,
        },
      },
    })
    const text: string | undefined = res?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('')
    if (!text) throw new Error('Empty model response')
    const parsed = JSON.parse(text)
    if (!parsed?.instruction || !Array.isArray(parsed?.workflow)) throw new Error('Bad shape')
    return { instruction: parsed.instruction, workflow: parsed.workflow, source: 'gemini', model }
  } catch (err: any) {
    return { ...fallback, source: 'fallback', reason: String(err?.message ?? err) }
  }
})
