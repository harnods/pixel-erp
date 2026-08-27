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
  const body = await readBody<{ prompt?: string; brand?: BrandCtx; orientation?: string; style?: string }>(event)
  const prompt = (body?.prompt ?? '').trim()
  if (!prompt) { setResponseStatus(event, 400); return { error: 'Describe the image you want to generate.' } }

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey as string
  if (!apiKey) {
    setResponseStatus(event, 503)
    return { error: 'Image generation is not configured yet. Add NUXT_GEMINI_API_KEY to .env.local and restart.' }
  }

  const model = 'gemini-2.5-flash-image'
  const orient = ORIENTATION_HINT[body?.orientation ?? 'Landscape'] ?? '16:9 landscape'
  const b = body?.brand
  const brandLine = b?.name
    ? `Brand: ${b.name}.${b.accent ? ` Use ${b.accent} as the primary accent colour.` : ''}${b.photography ? ` Photography style: ${b.photography}.` : ''}${b.guardrails?.length ? ` Brand rules: ${b.guardrails.join('; ')}.` : ''}`
    : ''
  const styleLine = body?.style ? `Style: ${body.style}.` : ''
  const full = [
    prompt,
    brandLine,
    styleLine,
    `Composition: ${orient}. A polished, production-ready marketing visual. Photorealistic where people are shown; no text, watermarks or logos unless explicitly requested. Southeast Asian representation where people appear.`,
  ].filter(Boolean).join(' ')

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`

  // Some API versions reject generationConfig.responseModalities for this model;
  // try with it, then fall back to a bare request so we still get an image.
  async function call(withModalities: boolean) {
    return await $fetch<any>(url, {
      method: 'POST',
      body: {
        contents: [{ role: 'user', parts: [{ text: full }] }],
        ...(withModalities ? { generationConfig: { responseModalities: ['IMAGE'] } } : {}),
      },
    })
  }

  try {
    let res: any
    try { res = await call(true) } catch { res = await call(false) }
    const parts: any[] = res?.candidates?.[0]?.content?.parts ?? []
    const img = parts.find((p) => p?.inlineData)?.inlineData
    if (!img?.data) throw new Error('The model did not return an image.')
    const mime = img.mimeType || 'image/png'
    return { dataUrl: `data:${mime};base64,${img.data}`, mime, model }
  } catch (err: any) {
    setResponseStatus(event, 502)
    return { error: `Could not generate the image. ${String(err?.data?.error?.message ?? err?.message ?? err)}` }
  }
})
