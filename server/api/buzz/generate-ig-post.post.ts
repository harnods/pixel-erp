/**
 * Mekari Buzz — generate a designed Instagram POST (not just a photo) with
 * Gemini's image model (Nano Banana, gemini-2.5-flash-image). The post is
 * brand-governed (colours, typography, tone, logo usage, reference designs) and
 * follows a hard-coded Instagram design skill baked in below.
 *
 * IG design skill adapted from github.com/software-ai-life/Awesome-IG-Design-Skills.
 */
interface BrandCtx {
  name?: string; accent?: string; secondary?: string; neutral?: string; palette?: string[]
  fonts?: { name?: string; usage?: string }[]; tone?: string; toneDo?: string[]
  logoUsage?: string[]; visualStyle?: string; photography?: string; guardrails?: string[]
}

// ── Hard-coded Instagram design skill (system guidance for every post) ──────────
const IG_DESIGN_SKILL = [
  'INSTAGRAM POST DESIGN SKILL — follow these rules to design a scroll-stopping, on-brand IG post:',
  '1. ONE clear message per post. Do not crowd it — a single focal idea, headline, or offer.',
  '2. Mobile-first: legible at thumbnail size. Big, confident headline; short supporting line at most.',
  '3. Whitespace is a design choice — give the composition room to breathe; keep safe margins (~8% padding) so nothing important touches the edges.',
  '4. Colour restraint: use ONLY the brand palette. Pick one dominant background, the brand accent for emphasis, and a readable text colour with strong contrast.',
  '5. Typography: a clear hierarchy (headline >> supporting text). Use the brand typefaces (or a close match). Generous line spacing. Never more than two type styles.',
  '6. Composition: align to a simple grid — centered statement, or an asymmetric layout with a clear focal point. Balanced, intentional, not busy.',
  '7. Form serves content: the visual style supports the message. Photoreal imagery or clean graphic/illustration per the brand style; integrate it cleanly, not as a random background.',
  '8. Brand presence: place the logo tastefully (respect its clear space) OR leave a clean spot for it; never distort or recolour a logo.',
  '9. Output a COMPLETE, finished, production-ready post design (a real social graphic WITH the headline text rendered in the image), not a plain photo. Spell all text correctly.',
  '10. Aspect ratio 4:5 vertical (1080 x 1350), the Instagram feed standard.',
].join('\n')

function brandBlock(b?: BrandCtx): string {
  if (!b?.name) return ''
  const fonts = (b.fonts ?? []).filter((f) => f?.name).map((f) => `${f.name}${f.usage ? ` (${f.usage})` : ''}`).join(', ')
  const palette = [b.accent, b.secondary, b.neutral, ...(b.palette ?? [])].filter(Boolean)
  return [
    `BRAND: ${b.name}. This post MUST look like it belongs to this brand.`,
    palette.length ? `Colours (use only these): primary ${b.accent}, secondary ${b.secondary}, neutral ${b.neutral}${b.palette?.length ? `, palette ${b.palette.join(', ')}` : ''}.` : '',
    fonts ? `Typography: ${fonts}. Match these typefaces (or a very close equivalent).` : '',
    b.tone ? `Tone of voice: ${b.tone}. The copy on the post follows this tone.` : '',
    b.toneDo?.length ? `Do: ${b.toneDo.join('; ')}.` : '',
    (b.visualStyle || b.photography) ? `Visual style: ${[b.visualStyle, b.photography].filter(Boolean).join(' · ')}.` : '',
    b.logoUsage?.length ? `Logo usage: ${b.logoUsage.join('; ')}.` : '',
    b.guardrails?.length ? `Brand guardrails: ${b.guardrails.join('; ')}.` : '',
  ].filter(Boolean).join(' ')
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{ brief?: string; headline?: string; brand?: BrandCtx; references?: string[] }>(event)
  const brief = (body?.brief ?? '').trim()
  if (!brief) { setResponseStatus(event, 400); return { error: 'Describe what the post is about.' } }

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey as string
  if (!apiKey) { setResponseStatus(event, 503); return { error: 'Image generation is not configured yet. Add NUXT_GEMINI_API_KEY to .env.local and restart.' } }

  // Reference designs (the brand's uploaded/captured visual-style samples).
  const refParts = (body?.references ?? []).slice(0, 4).map((d) => {
    if (typeof d !== 'string' || !d.startsWith('data:')) return null
    const m = d.match(/^data:([^;]+);base64,(.+)$/)
    return m ? { inlineData: { mimeType: m[1], data: m[2] } } : null
  }).filter(Boolean) as any[]

  const headlineLine = body?.headline?.trim() ? `Headline to feature on the post: "${body.headline.trim()}".` : 'Write a short, punchy headline for the post yourself, in the brand tone.'
  const refLine = refParts.length ? `${refParts.length} of this brand's reference designs are attached — match their art direction and visual style closely.` : ''

  const full = [
    IG_DESIGN_SKILL,
    '',
    brandBlock(body?.brand),
    '',
    `POST BRIEF: ${brief}`,
    headlineLine,
    refLine,
    'Now design the finished Instagram post as a single 4:5 image.',
  ].filter(Boolean).join('\n')

  const model = 'gemini-2.5-flash-image'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  async function call(withModalities: boolean) {
    return await $fetch<any>(url, {
      method: 'POST',
      body: {
        contents: [{ role: 'user', parts: [...refParts, { text: full }] }],
        ...(withModalities ? { generationConfig: { responseModalities: ['IMAGE'] } } : {}),
      },
      timeout: 90000,
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
    return { error: `Could not generate the post. ${String(err?.data?.error?.message ?? err?.message ?? err)}` }
  }
})
