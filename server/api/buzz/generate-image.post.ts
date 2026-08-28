/**
 * Mekari Buzz — real image generation via Gemini's image model (Nano Banana).
 * The API key stays server-side (runtimeConfig.geminiApiKey, from .env.local).
 *
 * Brand governance (PRD §8): the caller passes the selected brand's context and
 * we compose it into the prompt so generation is brand-compliant by default —
 * the marketer never has to hand-write brand rules.
 */
interface BrandCtx { name?: string; accent?: string; photography?: string; guardrails?: string[] }

const ORIENTATION_HINT: Record<string, string> = {
  Landscape: '16:9 landscape',
  Portrait: '9:16 vertical',
  Square: '1:1 square',
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ prompt?: string; brand?: BrandCtx; orientation?: string; style?: string; references?: string[]; subjects?: string[] }>(event)
  const prompt = (body?.prompt ?? '').trim()
  if (!prompt) { setResponseStatus(event, 400); return { error: 'Describe the image you want to generate.' } }
  const toParts = (arr?: string[]) => (arr ?? []).slice(0, 4).map((d) => {
    if (typeof d !== 'string' || !d.startsWith('data:')) return null
    const m = d.match(/^data:([^;]+);base64,(.+)$/)
    return m ? { inlineData: { mimeType: m[1], data: m[2] } } : null
  }).filter(Boolean) as any[]
  // References = the brand's visual-style samples (match the look).
  const refParts = toParts(body?.references)
  // Subjects = the user's own assets to feature (keep identity, new pose/scene).
  const subjectParts = toParts(body?.subjects)

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey as string
  if (!apiKey) {
    setResponseStatus(event, 503)
    return { error: 'Image generation is not configured yet. Add NUXT_GEMINI_API_KEY to .env.local and restart.' }
  }

  const orient = ORIENTATION_HINT[body?.orientation ?? 'Landscape'] ?? '16:9 landscape'
  const b = body?.brand
  const brandLine = b?.name
    ? `Brand: ${b.name}.${b.accent ? ` Use ${b.accent} as the primary accent colour.` : ''}${b.photography ? ` Photography style: ${b.photography}.` : ''}${b.guardrails?.length ? ` Brand rules: ${b.guardrails.join('; ')}.` : ''}`
    : ''
  const styleLine = body?.style ? `Style: ${body.style}.` : ''
  const refLine = refParts.length
    ? `${refParts.length} reference design${refParts.length > 1 ? 's' : ''} from this brand are attached — MATCH their visual style closely (composition, colour treatment, mood, art direction). Do not copy their exact content; produce a new visual in the same style.`
    : ''
  const subjectLine = subjectParts.length
    ? `${subjectParts.length} of the user's own asset image${subjectParts.length > 1 ? 's are' : ' is'} attached — this is the SUBJECT that MUST appear (product, person, item, OR a product screenshot / app UI). Reproduce it EXACTLY (identity, colours, shape, on-screen UI); generate a NEW pose / angle / scene of the SAME subject. NEVER invent a different product or fake a UI.`
    : ''
  const ANATOMY = 'If people appear, render anatomically correct humans: exactly five fingers per hand, natural hand poses, correct proportions and faces, no extra or missing fingers/limbs, no warped faces. Photorealistic and believable.'
  const full = [
    prompt,
    brandLine,
    subjectLine,
    refLine,
    styleLine,
    `Composition: ${orient}. A polished, production-ready marketing visual. ${ANATOMY} No text, watermarks or logos unless explicitly requested; never invent a logo. Southeast Asian representation where people appear.`,
  ].filter(Boolean).join(' ')

  // Prefer Gemini 3 Pro Image (best quality); fall back to 2.5 Flash Image.
  const MODELS = ['gemini-3-pro-image', 'gemini-2.5-flash-image']
  async function call(withModalities: boolean, model = MODELS[0]) {
    return await $fetch<any>(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
      method: 'POST',
      body: {
        contents: [{ role: 'user', parts: [...subjectParts, ...refParts, { text: full }] }],
        ...(withModalities ? { generationConfig: { responseModalities: ['IMAGE'] } } : {}),
      },
      timeout: 120000,
    })
  }

  let lastErr: any
  for (const model of MODELS) {
    try {
      let res: any
      try { res = await call(true, model) } catch { res = await call(false, model) }
      const parts: any[] = res?.candidates?.[0]?.content?.parts ?? []
      const img = parts.find((p) => p?.inlineData)?.inlineData
      if (img?.data) { const mime = img.mimeType || 'image/png'; return { dataUrl: `data:${mime};base64,${img.data}`, mime, model } }
    } catch (err: any) { lastErr = err /* try next model */ }
  }
  setResponseStatus(event, 502)
  return { error: `Could not generate the image. ${String(lastErr?.data?.error?.message ?? lastErr?.message ?? lastErr ?? 'no image returned')}` }
})
