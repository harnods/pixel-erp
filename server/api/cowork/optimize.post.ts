/**
 * Cowork — "Optimize" a piece of user-written text (an agent's description or
 * instruction). Gemini rewrites it clearer and more effective while keeping the
 * user's intent. Key stays server-side; falls back to the original text on error.
 */
const ALLOWED_MODELS = new Set([
  'gemini-flash-latest', 'gemini-pro-latest', 'gemini-flash-lite-latest',
  'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview',
])

const GUIDANCE: Record<string, string> = {
  description: 'This is an AGENT DESCRIPTION — one or two crisp sentences describing what the agent helps the team with. Keep it short, concrete and benefit-led.',
  instruction: 'This is an AGENT INSTRUCTION — the behaviour the agent must follow. Make it clear, specific and directive (how it should act, what to prioritise, its tone). A short paragraph.',
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ text?: string; kind?: string; model?: string }>(event)
  const text = (body?.text ?? '').trim()
  const kind = body?.kind === 'instruction' ? 'instruction' : 'description'
  if (!text) { setResponseStatus(event, 400); return { error: 'No text' } }

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey as string
  const model = (body?.model && ALLOWED_MODELS.has(body.model)) ? body.model : ((config.geminiModel as string) || 'gemini-flash-latest')

  if (!apiKey) return { text, source: 'fallback', reason: 'no-api-key' }

  try {
    const prompt = [
      'You improve short business copy for an AI-agent builder. Rewrite the text below so it is clearer, tighter and more effective — keep the original meaning and language, do not add facts, do not use markdown or quotes.',
      GUIDANCE[kind],
      '',
      `TEXT:\n${text}`,
      '',
      'Return only the rewritten text.',
    ].join('\n')
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const res = await $fetch<any>(url, {
      method: 'POST',
      body: { contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.5 } },
    })
    const out: string = res?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('').trim() || ''
    if (!out) throw new Error('Empty response')
    return { text: out.replace(/^["']|["']$/g, ''), source: 'gemini', model }
  } catch (err: any) {
    return { text, source: 'fallback', reason: String(err?.message ?? err) }
  }
})
