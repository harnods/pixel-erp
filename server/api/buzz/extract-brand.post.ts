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
  'typography: { fonts (array of EVERY distinct font family the brand uses, each { name: font family name only e.g. "Inter"; usage: what it is for e.g. "Headline", "Body", "Accent", "Display", "Monospace" } — list ALL of them, not just two), headline (the primary headline font family name), body (the primary body font family name), hierarchy (short notes on sizes/weights) }',
  'tone: { summary, do (array of strings), dont (array of strings) }',
  'logoUsage (array of strings — clear space, approved variants, do/don\'t; [] if the material does not cover logo usage)',
  'visualStyle (one line describing the imagery / illustration / iconography style; "" if not covered)',
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
  'PRIMARY COLOUR: the primary is the brand\'s core colour — almost always the dominant colour of the LOGO. ' +
  'If a logo, favicon, or brand-board image is provided, set colors.primary to the main colour of that logo (ignore pure white/black backgrounds around it). Only fall back to the most prominent brand colour on the page if no logo colour is discernible. ' +
  'TYPOGRAPHY: headline and body must be the actual FONT FAMILY NAMES (e.g. "Inter", "Söhne", "Airbnb Cereal"), never a description; put descriptions in hierarchy. ' +
  'Keep every field concise and directly usable as guidance for an AI generating on-brand marketing assets.'

/** Empty, fully-shaped brand kit — the guaranteed skeleton we normalise onto. */
function emptyBrand() {
  return {
    name: '',
    colors: { primary: '', secondary: '', neutral: '', palette: [] as string[], combinations: [] as string[] },
    theme: '',
    typography: { fonts: [] as { name: string; usage?: string }[], headline: '', body: '', hierarchy: '' },
    tone: { summary: '', do: [] as string[], dont: [] as string[] },
    logoUsage: [] as string[],
    visualStyle: '',
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
  b.typography.fonts = asArray(t.fonts)
    .map((f: any) => (typeof f === 'string' ? { name: f } : { name: String(f?.name ?? ''), usage: f?.usage ? String(f.usage) : undefined }))
    .filter((f: any) => f.name)
  if (typeof t.headline === 'string') b.typography.headline = t.headline
  if (typeof t.body === 'string') b.typography.body = t.body
  if (typeof t.hierarchy === 'string') b.typography.hierarchy = t.hierarchy
  // Backfill headline/body from the fonts list if the model only filled `fonts`.
  if (!b.typography.headline && b.typography.fonts[0]) b.typography.headline = b.typography.fonts[0].name
  if (!b.typography.body) { const bodyFont = b.typography.fonts.find((f) => /body|text|paragraph/i.test(f.usage ?? '')); if (bodyFont) b.typography.body = bodyFont.name }
  const tone = raw.tone && typeof raw.tone === 'object' ? raw.tone : {}
  if (typeof tone.summary === 'string') b.tone.summary = tone.summary
  b.tone.do = asArray(tone.do).map(String)
  b.tone.dont = asArray(tone.dont ?? tone.donts ?? tone['don\'t']).map(String)
  b.logoUsage = asArray(raw.logoUsage).map(String)
  if (typeof raw.visualStyle === 'string') b.visualStyle = raw.visualStyle
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

/** Ordered list of logo/icon candidate URLs from the page head (absolute).
 *  Prefers larger declared icons (a bigger favicon reads its colour better);
 *  the OpenGraph cover image goes last since it is usually a wide banner, not
 *  the single brand mark. */
function findLogoCandidates(html: string, baseUrl: string): string[] {
  const abs = (href: string) => { try { return new URL(href, baseUrl).href } catch { return null } }
  const attr = (tag: string, name: string) => tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'))?.[1] ?? null
  const out: string[] = []
  const links = (html.match(/<link\b[^>]*>/gi) ?? []).filter((l) => /rel\s*=\s*["'][^"']*icon/i.test(l))
  const icons = links
    .map((l) => ({ href: attr(l, 'href'), size: parseInt((attr(l, 'sizes') || '0').split('x')[0], 10) || 0, apple: /apple-touch/i.test(attr(l, 'rel') || '') }))
    .filter((x) => x.href) as { href: string; size: number; apple: boolean }[]
  // Larger first; among equal sizes prefer apple-touch (usually a clean square mark).
  icons.sort((a, b) => (b.size - a.size) || (Number(b.apple) - Number(a.apple)))
  for (const x of icons) { const u = abs(x.href); if (u) out.push(u) }
  const fav = abs('/favicon.ico'); if (fav) out.push(fav)
  const og = html.match(/<meta\b[^>]*property\s*=\s*["']og:image["'][^>]*>/i)?.[0]
  if (og) { const c = attr(og, 'content'); if (c) { const u = abs(c); if (u) out.push(u) } }
  return [...new Set(out)]
}

/** Harvest prominent image URLs from the page (og:image first, then large-looking
 *  content images), resolved to absolute, deduped — for visual-style samples. */
function harvestImageUrls(html: string, baseUrl: string, limit = 3): string[] {
  const abs = (href: string) => { try { return new URL(href, baseUrl).href } catch { return null } }
  const out: string[] = []
  const push = (u: string | null) => { if (u && !out.includes(u) && !/\.svg(\?|$)/i.test(u)) out.push(u) }
  // og:image / twitter:image
  for (const m of html.matchAll(/<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["'][^>]*content\s*=\s*["']([^"']+)["']/gi)) push(abs(m[1]))
  // content <img> (prefer ones that look like heroes / large assets)
  for (const m of html.matchAll(/<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)) {
    const src = m[1]
    if (/sprite|icon|logo|pixel|1x1|blank|spacer|avatar/i.test(src)) continue
    if (/\.(png|jpe?g|webp)(\?|$)/i.test(src)) push(abs(src))
    if (out.length >= limit + 4) break
  }
  return out.slice(0, limit + 4)
}

/** Fetch an image URL and return it as a data: URL (validated), or null. */
async function fetchImageDataUrl(url: string): Promise<string | null> {
  try {
    const buf = await $fetch<ArrayBuffer>(url, { responseType: 'arrayBuffer', headers: { 'user-agent': 'Mozilla/5.0' }, timeout: 12000 })
    const bytes = Buffer.from(buf as ArrayBuffer)
    if (bytes.length < 2000 || bytes.length > 2_500_000) return null // skip tiny icons / huge files
    const mime = imageMime(bytes)
    if (!mime) return null
    return `data:${mime};base64,${bytes.toString('base64')}`
  } catch {
    return null
  }
}

/** Detect a real raster image from its magic bytes; '' if it isn't one (e.g. an
 *  HTML 404 page served with a 200, or an SVG which vision can't use reliably). */
function imageMime(bytes: Buffer): string {
  if (bytes.length < 12) return ''
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'
  if (bytes.slice(0, 4).toString('ascii') === 'RIFF' && bytes.slice(8, 12).toString('ascii') === 'WEBP') return 'image/webp'
  if (bytes.slice(0, 3).toString('ascii') === 'GIF') return 'image/gif'
  return '' // includes '<!DOCTYPE…' error pages and '<svg…'
}

/** Try each candidate URL until one is a VALID raster image; return it as a
 *  Gemini inlineData part (or null). Skips 404s / HTML error pages / SVGs. */
async function fetchLogoPart(candidates: string[]): Promise<{ part: any; url: string } | null> {
  for (const url of candidates.slice(0, 5)) {
    try {
      const buf = await $fetch<ArrayBuffer>(url, { responseType: 'arrayBuffer', headers: { 'user-agent': 'Mozilla/5.0' }, timeout: 12000 })
      const bytes = Buffer.from(buf as ArrayBuffer)
      if (!bytes.length || bytes.length > 4_000_000) continue
      const mime = imageMime(bytes)
      if (!mime) continue
      return { part: { inlineData: { mimeType: mime, data: bytes.toString('base64') } }, url }
    } catch {
      // 404 / network error → try the next candidate.
    }
  }
  return null
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

  const visualCaptures: string[] = []
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
      // Fetch the logo/favicon (trying candidates until one is a real image) so
      // Gemini reads the true brand colour from it — the primary is usually the
      // logo colour, and CSS-harvested hexes often include stray accents.
      const logo = await fetchLogoPart(findLogoCandidates(html, url))
      parts = [
        ...(logo ? [logo.part] : []),
        {
          text: [
            'Infer the brand system for this company from its website.',
            logo
              ? 'The attached image is this brand\'s actual logo/favicon. colors.primary MUST be the DOMINANT colour of that logo (ignore any white/transparent background around it). Do NOT choose a colour that is not visibly in the logo.'
              : 'No logo image was available, so infer colours ONLY from the candidate hexes below and the page — do NOT invent a colour that is not listed.',
            candidateColors.length
              ? `Candidate brand colours harvested from the page CSS (most frequent first): ${candidateColors.join(', ')}. Use these for secondary/neutral and the palette. Ignore pure white/black/grey unless clearly the neutral, and do NOT treat a rare accent as the primary.`
              : '',
            'Return the brand kit as JSON per the schema.',
            '',
            'PAGE TEXT:',
            text,
          ].filter(Boolean).join('\n'),
        },
      ]
      // Capture a few of the site's prominent images as visual-style samples —
      // a first-pass "what the brand's designs look like" reference for generation.
      for (const imgUrl of harvestImageUrls(html, url)) {
        if (visualCaptures.length >= 3) break
        const d = await fetchImageDataUrl(imgUrl)
        if (d) visualCaptures.push(d)
      }
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
    return { brand, visualCaptures }
  } catch (err: any) {
    setResponseStatus(event, 500)
    return { error: `Brand extraction failed. ${String(err?.message ?? err)}` }
  }
})
