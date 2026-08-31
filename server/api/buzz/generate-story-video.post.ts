/**
 * Mekari Buzz — generate a short vertical (9:16) Instagram STORY video with
 * Google Veo 3.1 (native audio). Async: start a long-running job, poll it, then
 * download the result and return it as a data: URL. Key stays server-side.
 *
 * Optional `subject` (a product/asset image) seeds an image-to-video so the
 * user's real asset appears — never invented.
 */
interface BrandCtx { name?: string; accent?: string; tone?: string; visualStyle?: string; photography?: string; guardrails?: string[] }

const VEO_MODEL = 'veo-3.1-fast-generate-preview'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ brief?: string; brand?: BrandCtx; subject?: string }>(event)
  const brief = (body?.brief ?? '').trim()
  if (!brief) { setResponseStatus(event, 400); return { error: 'Describe what the Story is about.' } }

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey as string
  if (!apiKey) { setResponseStatus(event, 503); return { error: 'Video generation is not configured yet. Add NUXT_GEMINI_API_KEY to .env.local and restart.' } }

  const b = body?.brand
  const brandLine = b?.name
    ? `Brand: ${b.name}.${b.tone ? ` Tone: ${b.tone}.` : ''}${b.accent ? ` Use ${b.accent} as the accent colour.` : ''}${(b.visualStyle || b.photography) ? ` Visual style: ${[b.visualStyle, b.photography].filter(Boolean).join(' · ')}.` : ''}${b.guardrails?.length ? ` Brand rules: ${b.guardrails.join('; ')}.` : ''}`
    : ''
  const prompt = [
    brief,
    brandLine,
    'Vertical 9:16 Instagram Story. Cinematic, smooth camera motion, high quality, on-brand.',
    'If people appear they must be anatomically correct (five fingers, natural poses, realistic faces). Never invent a logo; leave clean space for it.',
  ].filter(Boolean).join(' ')

  // Optional image-to-video seed (the user's real asset — reproduce it, don't invent).
  let image: any
  if (typeof body?.subject === 'string' && body.subject.startsWith('data:')) {
    const m = body.subject.match(/^data:([^;]+);base64,(.+)$/)
    if (m) image = { bytesBase64Encoded: m[2], mimeType: m[1] }
  }

  const base = 'https://generativelanguage.googleapis.com/v1beta'
  try {
    // 1. Start the long-running job.
    const start = await $fetch<any>(`${base}/models/${VEO_MODEL}:predictLongRunning?key=${apiKey}`, {
      method: 'POST',
      body: { instances: [{ prompt, ...(image ? { image } : {}) }], parameters: { aspectRatio: '9:16' } },
      timeout: 30000,
    })
    const opName: string = start?.name
    if (!opName) throw new Error('Could not start the video job.')

    // 2. Poll until done (Veo takes ~30–90s).
    let done = false, op: any = null
    for (let i = 0; i < 40 && !done; i++) {
      await new Promise((r) => setTimeout(r, 8000))
      op = await $fetch<any>(`${base}/${opName}?key=${apiKey}`, { timeout: 20000 })
      done = !!op?.done
    }
    if (!done) throw new Error('The video is taking too long — please try again.')
    if (op?.error) throw new Error(op.error?.message || 'Video generation failed.')

    // 3. Download the generated video and return it as a data: URL.
    const uri: string | undefined = op?.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri
    if (!uri) throw new Error('No video was returned.')
    const buf = await $fetch<ArrayBuffer>(`${uri}${uri.includes('?') ? '&' : '?'}key=${apiKey}`, { responseType: 'arrayBuffer', timeout: 60000 })
    const b64 = Buffer.from(buf as ArrayBuffer).toString('base64')
    return { dataUrl: `data:video/mp4;base64,${b64}`, mime: 'video/mp4', model: VEO_MODEL }
  } catch (err: any) {
    setResponseStatus(event, 502)
    return { error: `Could not generate the Story video. ${String(err?.data?.error?.message ?? err?.message ?? err)}` }
  }
})
