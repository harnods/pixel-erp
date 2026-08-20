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

export default defineEventHandler(async (event) => {
  const body = await readBody<{ messages?: ChatMessage[]; context?: string; model?: string }>(event)
  const messages = (body?.messages ?? []).filter((m) => m?.text?.trim())
  if (!messages.length) { setResponseStatus(event, 400); return { error: 'No messages' } }

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey as string
  const model = (body?.model && ALLOWED_MODELS.has(body.model)) ? body.model : ((config.geminiModel as string) || 'gemini-flash-latest')

  const system = [
    'You are Airene, the Mekari AI assistant inside an ERP suite (Talenta HR, Qontak CRM, Mekari WMS, Jurnal finance, Production).',
    'Answer concisely and practically, grounded in the context provided. If the user asks for a draft (email, message, action list), produce it directly.',
    body?.context ? `\nCONTEXT — the result of a Cowork task the user just ran:\n${body.context}` : '',
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
        generationConfig: { temperature: 0.6 },
      },
    })
    const reply: string = res?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('') || ''
    if (!reply) throw new Error('Empty response')
    return { reply, source: 'gemini', model }
  } catch (err: any) {
    return { reply: 'Sorry — I hit an error reaching the model. Please try again.', source: 'fallback', reason: String(err?.message ?? err) }
  }
})
