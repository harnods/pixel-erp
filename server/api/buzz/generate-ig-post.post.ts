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

// ── Hard-coded social-media CAROUSEL skill (used for series) ────────────────────
// Adapted from github.com/inference-sh/skills social-media-carousel.
const CAROUSEL_SKILL = [
  'CAROUSEL DESIGN SKILL — for a multi-slide Instagram series:',
  'Structure: Slide 1 = HOOK (curiosity gap / bold claim / question / numbered promise). Middle slides = ONE value point each, numbered. Final slide = CTA (follow, save, share, comment).',
  'Consistency across ALL slides (critical): identical font family, the same background palette, the same text alignment, uniform margins/padding, a single accent colour for highlights, and one standardised number format (e.g. 01/02 …).',
  'Typography (at 1080px): slide number 96–120px weight 900; heading 48–64px weight 700–800; body 24–28px weight 400; line height ~1.5.',
  'Copy: MAX 30–40 words and ~4–5 lines per slide. ONE idea per slide. High contrast, legible on mobile.',
  'Show a small progress indicator "n/N" on every slide. Put a clear "Swipe →" cue on slide 1. Reserve the strongest point for the last content slide (ascending value).',
  'Avoid: weak hook, >40 words, inconsistent styling, mixed numbering, multiple ideas per slide, missing CTA.',
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
  const body = await readBody<{ brief?: string; headline?: string; brand?: BrandCtx; references?: string[]; subjects?: string[] }>(event)
  const brief = (body?.brief ?? '').trim()
  if (!brief) { setResponseStatus(event, 400); return { error: 'Describe what the post is about.' } }

  const config = useRuntimeConfig()
  const apiKey = config.geminiApiKey as string
  if (!apiKey) { setResponseStatus(event, 503); return { error: 'Image generation is not configured yet. Add NUXT_GEMINI_API_KEY to .env.local and restart.' } }

  const toParts = (arr?: string[]) => (arr ?? []).slice(0, 4).map((d) => {
    if (typeof d !== 'string' || !d.startsWith('data:')) return null
    const m = d.match(/^data:([^;]+);base64,(.+)$/)
    return m ? { inlineData: { mimeType: m[1], data: m[2] } } : null
  }).filter(Boolean) as any[]
  // Reference designs (style) vs subjects (the user's own assets to feature).
  const refParts = toParts(body?.references)
  const subjectParts = toParts(body?.subjects)

  const refLine = refParts.length ? `${refParts.length} of this brand's reference designs are attached — match their art direction and visual style closely.` : ''
  const subjectLine = subjectParts.length
    ? `${subjectParts.length} of the user's own asset image${subjectParts.length > 1 ? 's are' : ' is'} attached — these are the SUBJECT (e.g. a product, person, or item) that MUST appear in the post. Keep each subject's identity, colours, shape and any branding accurate; you may re-pose, re-light, re-angle and place them into a new scene/composition, but do not invent a different product.`
    : ''
  // Grounding is non-negotiable — always restate it.
  const GROUNDING = 'NON-NEGOTIABLE: strictly follow the brand guideline above (colours, typography, tone, logo usage) AND match the attached reference designs\' visual style. Stay on-brand — do not use off-brand colours, fonts, or art direction.'

  // ── Series (carousel) vs single post, and how many alternatives ──
  const series = Math.max(0, Math.min(8, Math.floor(Number(body?.series ?? 0)) || 0))
  const count = Math.max(1, Math.min(3, Math.floor(Number(body?.count ?? 1)) || 1))
  const isCarousel = series >= 2

  function buildPrompt(directive: string, headlineDirective: string, extraSkill = ''): string {
    return [
      IG_DESIGN_SKILL,
      extraSkill, '',
      brandBlock(body?.brand), '',
      `CAMPAIGN BRIEF: ${brief}`,
      directive,
      headlineDirective,
      subjectLine,
      refLine,
      GROUNDING,
      'Design the finished Instagram creative as a single 4:5 image.',
    ].filter(Boolean).join('\n')
  }

  const model = 'gemini-2.5-flash-image'
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  async function genOne(promptText: string): Promise<{ dataUrl: string; mime: string } | null> {
    async function call(withModalities: boolean) {
      return await $fetch<any>(url, {
        method: 'POST',
        body: {
          contents: [{ role: 'user', parts: [...subjectParts, ...refParts, { text: promptText }] }],
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
      if (!img?.data) return null
      return { dataUrl: `data:${img.mimeType || 'image/png'};base64,${img.data}`, mime: img.mimeType || 'image/png' }
    } catch { return null }
  }

  try {
    let prompts: string[]
    if (isCarousel) {
      // A coherent carousel: slide 1 hook, middle slides content, last slide CTA.
      prompts = Array.from({ length: series }, (_, i) => {
        const n = i + 1
        const role = n === 1
          ? `This is SLIDE 1 of ${series} — the HOOK cover: a bold curiosity-gap headline that stops the scroll, plus a small "Swipe →" cue.`
          : n === series
            ? `This is SLIDE ${series} of ${series} — the CTA: a clear call to action (follow / save / share).`
            : `This is SLIDE ${n} of ${series} — a numbered CONTENT slide covering ONE distinct point from the brief (save the strongest point for the last content slide).`
        return buildPrompt(
          `${role} Show a small "${n}/${series}" progress indicator. Keep the font, palette, alignment, margins and accent IDENTICAL to the other slides so they read as one cohesive series.`,
          'Write short slide copy (max ~30 words) in the brand tone; one idea only.',
          CAROUSEL_SKILL,
        )
      })
    } else {
      // `count` distinct alternative concepts for a single post.
      const headlineDirective = body?.headline?.trim() ? `Feature this headline: "${body.headline.trim()}".` : 'Write a short, punchy headline yourself, in the brand tone.'
      prompts = Array.from({ length: count }, (_, i) =>
        buildPrompt(`Alternative concept #${i + 1} of ${count} — give this a DISTINCT creative direction / layout / composition from the others, while staying fully on-brand.`, headlineDirective))
    }

    const results = (await Promise.all(prompts.map(genOne))).filter(Boolean) as { dataUrl: string; mime: string }[]
    if (!results.length) throw new Error('The model did not return any images.')
    return { images: results, kind: isCarousel ? 'carousel' : 'single', model }
  } catch (err: any) {
    setResponseStatus(event, 502)
    return { error: `Could not generate the design. ${String(err?.data?.error?.message ?? err?.message ?? err)}` }
  }
})
