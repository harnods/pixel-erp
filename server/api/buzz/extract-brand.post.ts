/**
 * Mekari Buzz — "create your brand kit" extraction.
 *
 * The user either uploads a brand guideline (PDF / PPTX / DOCX / image / text)
 * or gives a website URL, and we distil it into a structured brand kit that the
 * rest of Buzz can enforce on every generated asset (see generate-image.post.ts).
 *
 * Heavy parsers run server-side so they never touch the client bundle, and the
 * Gemini API key stays server-side via runtimeConfig (from .env.local) — never
 * shipped to the browser. The handler is deliberately robust: it always returns
 * either `{ brand }` or a `{ error }` with an appropriate status, never a 500.
 *
 * Body: { source: 'file' | 'url', file?: { name?, mime?, ext?, dataBase64? }, url? }
 *   (base64 may be a bare string or a data: URL)
 * Returns: { brand: { name?, colors, theme?, typography, tone, logoUsage?, photography?, guardrails? } }
 */
import mammoth from 'mammoth'

interface FileInput { name?: string; mime?: string; ext?: string; dataBase64?: string }
interface Body { source?: 'file' | 'url'; file?: FileInput; url?: string }

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'])
const TEXT_EXT = new Set(['txt', 'md', 'markdown', 'csv', 'json'])

function stripB64(b64: string): string {
  return b64.includes(',') ? b64.slice(b64.indexOf(',') + 1) : b64
}
function toBuffer(b64: string): Buffer {
  return Buffer.from(stripB64(b64), 'base64')
}

const SCHEMA_KEYS = [
  'name (string)',
  'colors: { primary, secondary, neutral, palette (array of hex strings), combinations (array of short strings like "primary on neutral") }',
  'theme (one line describing the overall visual theme)',
  'typography: { headline, body, hierarchy }',
  'tone: { summary, do (array of strings), dont (array of strings) }',
  'logoUsage (array of strings — clear space, approved variants, do/don\'t)',
  'photography (one line describing photography / illustration style)',
  'guardrails (array of strings — general brand guardrails for AI generation)',
].join('; ')

const SYSTEM_INSTRUCTION =
  'You are a senior brand strategist extracting a structured brand kit from the material provided ' +
  '(a brand guideline document, image, or website). ' +
  'OUTPUT ONLY valid minified JSON — no prose, no markdown fences. ' +
  `The JSON MUST have exactly these keys: ${SCHEMA_KEYS}. ` +
  'Infer sensibly from whatever material is available. Use "" for unknown strings and [] for unknown arrays — never omit a key. ' +
  'All colours MUST be hex strings like "#0A6E4E" (uppercase, 6-digit). ' +
  'Keep every field concise and directly usable as guidance for an AI generating on-brand marketing assets.'

/** Empty, fully-shaped brand kit — the guaranteed skeleton we normalise onto. */
function emptyBrand() {
  return {
    name: '',
    colors: { primary: '', secondary: '', neutral: '', palette: [] as string[], combinations: [] as string[] },
    theme: '',
    typography: { headline: '', body: '', hierarchy: '' },
    tone: { summary: '', do: [] as string[], dont: [] as string[] },
    logoUsage: [] as string[],
    photography: '',
    guardrails: [] as string[],
  }
}

function asArray(v: any): any[] {
  if (Array.isArray(v)) return v.filter((x) => x != null && x !== '')
  if (v == null || v === '') return []
  return [v]
}

/** Coerce whatever the model returned into the exact response shape. */
function normalise(raw: any) {
  const b = emptyBrand()
  if (!raw || typeof raw !== 'object') return b
  if (typeof raw.name === 'string') b.name = raw.name
  const c = raw.colors && typeof raw.colors === 'object' ? raw.colors : {}
  if (typeof c.primary === 'string') b.colors.primary = c.primary
  if (typeof c.secondary === 'string') b.colors.secondary = c.secondary
  if (typeof c.neutral === 'string') b.colors.neutral = c.neutral
  b.colors.palette = asArray(c.palette).map(String)
  b.colors.combinations = asArray(c.combinations).map(String)
  if (typeof raw.theme === 'string') b.theme = raw.theme
  const t = raw.typography && typeof raw.typography === 'object' ? raw.typography : {}
  if (typeof t.headline === 'string') b.typography.headline = t.headline
  if (typeof t.body === 'string') b.typography.body = t.body
  if (typeof t.hierarchy === 'string') b.typography.hierarchy = t.hierarchy
  const tone = raw.tone && typeof raw.tone === 'object' ? raw.tone : {}
  if (typeof tone.summary === 'string') b.tone.summary = tone.summary
  b.tone.do = asArray(tone.do).map(String)
  b.tone.dont = asArray(tone.dont ?? tone.donts ?? tone['don\'t']).map(String)
  b.logoUsage = asArray(raw.logoUsage).map(String)
  if (typeof raw.photography === 'string') b.photography = raw.photography
  b.guardrails = asArray(raw.guardrails).map(String)
  return b
}

/** Parse the model's text output as JSON, tolerating ```json fences / stray prose. */
function parseJson(text: string): any {
  if (!text) return null
  let s = text.trim()
  // Strip markdown code fences if present.
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  try {
    return JSON.parse(s)
  } catch {
    // Last resort: grab the outermost {...} block.
    const first = s.indexOf('{')
    const last = s.lastIndexOf('}')
    if (first >= 0 && last > first) {
      try { return JSON.parse(s.slice(first, last + 1)) } catch { /* fall through */ }
    }
    return null
  }
}

/** One Gemini generateContent call. `parts` are the user content parts. Returns raw text or ''. */
async function callGemini(apiKey: string, model: string, parts: any[]): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  const res = await $fetch<any>(url, {
    method: 'POST',
    body: {
      systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' },
    },
    timeout: 45000,
  })
  return res?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join('') || ''
}

/** Strip an HTML document to readable text, capped. */
function htmlToText(html: string, cap = 12000): string {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return text.slice(0, cap)
}

/** Harvest the most frequent 6-digit hex colours from raw html / inline CSS. */
function harvestHexColors(html: string, limit = 8): string[] {
  const matches = html.match(/#[0-9a-fA-F]{6}\b/g) || []
  const counts = new Map<string, number>()
  for (const m of matches) {
    const key = m.toUpperCase()
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([hex]) => hex)
}

export default defineEventHandler(async (event) => {
  const body = await readBody<Body>(event)
  const source = body?.source

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey as string
  const model = (config.geminiModel as string) || 'gemini-flash-latest'
  if (!apiKey) {
    setResponseStatus(event, 503)
    return { error: 'Brand extraction is not configured yet. Add NUXT_GEMINI_API_KEY to .env.local and restart.' }
  }

  try {
    let parts: any[] | null = null

    if (source === 'file') {
      const file = body?.file
      if (!file?.dataBase64) { setResponseStatus(event, 400); return { error: 'No file data provided.' } }
      const ext = (file.ext || file.name?.split('.').pop() || '').toLowerCase()
      const mime = file.mime || ''
      const b64 = stripB64(file.dataBase64)

      if (ext === 'pdf' || mime === 'application/pdf') {
        // Gemini reads PDFs natively — hand it the file directly.
        parts = [
          { inlineData: { mimeType: 'application/pdf', data: b64 } },
          { text: 'Read this brand guideline and extract the brand kit as JSON per the schema.' },
        ]
      } else if (IMAGE_EXT.has(ext) || mime.startsWith('image/')) {
        parts = [
          { inlineData: { mimeType: mime || `image/${ext || 'png'}`, data: b64 } },
          { text: 'Extract the brand kit from this image (logo / brand board / guideline page) as JSON per the schema.' },
        ]
      } else if (ext === 'docx' || mime.includes('officedocument.wordprocessingml')) {
        const { value } = await mammoth.extractRawText({ buffer: toBuffer(file.dataBase64) })
        const text = (value || '').trim()
        parts = [{ text: `Extract the brand kit from this brand guideline text as JSON per the schema.\n\n${text.slice(0, 20000)}` }]
      } else if (ext === 'pptx' || ext === 'ppt' || mime.includes('presentationml') || mime.includes('ms-powerpoint')) {
        // No pptx parser installed — best effort: hand the raw file to Gemini as
        // inlineData. If it can't read it, the JSON will be mostly empty; that's
        // acceptable, we must not crash.
        parts = [
          { inlineData: { mimeType: mime || 'application/vnd.openxmlformats-officedocument.presentationml.presentation', data: b64 } },
          { text: 'Extract the brand kit from this brand presentation as JSON per the schema. If you cannot read it, return the schema with empty values.' },
        ]
      } else if (TEXT_EXT.has(ext) || mime.startsWith('text/') || mime === 'application/json') {
        const text = toBuffer(file.dataBase64).toString('utf8').slice(0, 20000)
        parts = [{ text: `Extract the brand kit from this brand guideline text as JSON per the schema.\n\n${text}` }]
      } else {
        // Unknown type — best-effort text sniff.
        const text = toBuffer(file.dataBase64).toString('utf8').slice(0, 20000)
        parts = [{ text: `Extract the brand kit from the following material as JSON per the schema. It may be partially unreadable — use "" / [] where unknown.\n\n${text}` }]
      }
    } else if (source === 'url') {
      const url = (body?.url || '').trim()
      if (!url) { setResponseStatus(event, 400); return { error: 'No URL provided.' } }
      let html: string
      try {
        html = await $fetch<string>(url, { headers: { 'user-agent': 'Mozilla/5.0' }, timeout: 20000 })
        if (typeof html !== 'string') html = String(html ?? '')
      } catch (err: any) {
        setResponseStatus(event, 502)
        return { error: `Could not fetch that URL. ${String(err?.message ?? err)}` }
      }
      const text = htmlToText(html)
      const candidateColors = harvestHexColors(html)
      parts = [{
        text: [
          'Infer the brand system for this company from its website.',
          candidateColors.length
            ? `Candidate brand colours harvested from the page CSS (most frequent first): ${candidateColors.join(', ')}. Use these to determine the primary/secondary/neutral palette where they look like brand colours (ignore pure white/black/grey unless clearly the neutral).`
            : '',
          'Return the brand kit as JSON per the schema.',
          '',
          'PAGE TEXT:',
          text,
        ].filter(Boolean).join('\n'),
      }]
    } else {
      setResponseStatus(event, 400)
      return { error: 'Invalid source — expected "file" or "url".' }
    }

    let rawText = ''
    try {
      rawText = await callGemini(apiKey, model, parts)
    } catch (err: any) {
      setResponseStatus(event, 502)
      return { error: `Brand extraction failed. ${String(err?.data?.error?.message ?? err?.message ?? err)}` }
    }

    const brand = normalise(parseJson(rawText))
    return { brand }
  } catch (err: any) {
    setResponseStatus(event, 500)
    return { error: `Brand extraction failed. ${String(err?.message ?? err)}` }
  }
})
