/**
 * KB enrichment — given a doc's extracted text, produce a one-paragraph summary
 * and a set of retrieval keywords. Powers the doc cards and the mock's keyword
 * retrieval. Degrades to a deterministic heuristic when the model is unavailable.
 *
 * Body: { fileName, text }
 * Returns: { summary, keywords: string[], source }
 */
const ALLOWED_MODELS = new Set([
  'gemini-flash-latest', 'gemini-pro-latest', 'gemini-flash-lite-latest',
  'gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-3-flash-preview',
])

const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were', 'our', 'you', 'your', 'all', 'any', 'per', 'has', 'have', 'into', 'over', 'not', 'but', 'will', 'can', 'a', 'an', 'of', 'to', 'in', 'on', 'is', 'it', 'as', 'by', 'or', 'be', 'at', 'we', 'if'])

function heuristic(fileName: string, text: string): { summary: string; keywords: string[] } {
  const clean = text.replace(/\s+/g, ' ').trim()
  const summary = clean.slice(0, 240) + (clean.length > 240 ? '…' : '')
  const freq: Record<string, number> = {}
  for (const w of (clean.toLowerCase().match(/[a-z0-9]{3,}/g) ?? [])) {
    if (STOP.has(w)) continue
    freq[w] = (freq[w] ?? 0) + 1
  }
  const keywords = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([w]) => w)
  return { summary: summary || fileName, keywords }
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ fileName?: string; text?: string; model?: string }>(event)
  const text = (body?.text ?? '').trim()
  const fileName = body?.fileName ?? 'document'
  if (!text) return { summary: '', keywords: [], source: 'empty' }

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey as string
  const model = (body?.model && ALLOWED_MODELS.has(body.model)) ? body.model : ((config.geminiModel as string) || 'gemini-flash-latest')

  if (!apiKey) return { ...heuristic(fileName, text), source: 'fallback' }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
    const res = await $fetch<any>(url, {
      method: 'POST',
      body: {
        systemInstruction: { parts: [{ text: 'You index documents for a knowledge base. Given a document, return a concise one-paragraph summary (max 45 words) capturing what it is and its key facts, plus 6–12 lowercase keywords/phrases someone would search to find it. Respond with JSON only.' }] },
        contents: [{ role: 'user', parts: [{ text: `File: ${fileName}\n\nContent:\n${text.slice(0, 12000)}` }] }],
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              keywords: { type: 'array', items: { type: 'string' } },
            },
            required: ['summary', 'keywords'],
          },
        },
      },
    })
    const raw = res?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('') || ''
    const parsed = JSON.parse(raw)
    const keywords = Array.isArray(parsed?.keywords) ? parsed.keywords.map((k: any) => String(k).toLowerCase().trim()).filter(Boolean).slice(0, 12) : []
    return { summary: String(parsed?.summary ?? '').trim(), keywords, source: 'gemini', model }
  } catch {
    return { ...heuristic(fileName, text), source: 'fallback' }
  }
})
