<script setup lang="ts">
/**
 * BuzzBrandFormPage · Mekari Buzz — create / edit a brand kit (PRD §8).
 *
 * Reached at /buzz-branding/new and /buzz-branding/:id/edit. Full-bleed page
 * that owns its own title bar + scrollable stage (mirrors CoworkAgentFormPage).
 *
 * Killer feature: "Import from a brand guideline" — upload a PDF/PPT/DOCX/image
 * OR paste a website URL, and AI (server route /api/buzz/extract-brand) extracts
 * the branding into the editable fields below. Everything is saved onto the
 * brand (buzzBrands) and reflected on the brand-kit cards.
 *
 * House rules honoured: Pixel 3 Enterprise only, inline errors (never a toast),
 * pill buttons, secondary = .btn-enterprise--secondary, ghost Cancel, "Save" on
 * create / "Save changes" on edit, no dashes in user-facing copy.
 */
import { ref, reactive, computed, onMounted } from 'vue'
import {
  MpInput, MpTextarea, MpButton, MpIcon, MpSpinner,
  MpFormControl, MpFormLabel, MpFormErrorMessage, toast,
} from '@mekari/pixel3'
import {
  buzzBrand, addBrand, updateBrand, addUploadedAsset,
  type BuzzBrand,
} from '~/data/buzz'
import { putImage, getImage } from '~/utils/buzzImageStore'

const props = defineProps<{ orderId?: string }>()
const router = useRouter()

const isEdit = computed(() => !!props.orderId && props.orderId !== 'new')
const existing = computed<BuzzBrand | undefined>(() => isEdit.value ? buzzBrand(props.orderId!) : undefined)

// ── Import from a brand guideline (AI extraction) ───────────────────────────────
const importFile = ref<File | null>(null)
const importFileName = ref('')
const importUrl = ref('')
const extracting = ref(false)
const extractError = ref('')
const extractDone = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function onImportFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const f = input.files?.[0] ?? null
  importFile.value = f
  importFileName.value = f?.name ?? ''
  extractError.value = ''
  input.value = ''
}
function clearImportFile() { importFile.value = null; importFileName.value = '' }

/** Read a File to a base64 data URL. */
function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.readAsDataURL(file)
  })
}

interface ExtractedBrand {
  name?: string
  colors?: { primary?: string; secondary?: string; neutral?: string; palette?: string[]; combinations?: string[] }
  theme?: string
  typography?: { fonts?: { name?: string; usage?: string }[]; headline?: string; body?: string; hierarchy?: string }
  tone?: { summary?: string; do?: string[]; dont?: string[] }
  logoUsage?: string[]
  photography?: string
  guardrails?: string[]
}

async function extractWithAi() {
  if (extracting.value) return
  extractError.value = ''
  const hasFile = !!importFile.value
  const hasUrl = !!importUrl.value.trim()
  if (!hasFile && !hasUrl) {
    extractError.value = 'Upload a brand guideline or paste a website URL first.'
    return
  }
  extracting.value = true
  extractDone.value = false
  try {
    let body: Record<string, unknown>
    if (hasFile) {
      const f = importFile.value!
      const dataBase64 = await fileToDataUrl(f)
      const ext = f.name.includes('.') ? f.name.split('.').pop()!.toLowerCase() : ''
      body = { source: 'file', file: { name: f.name, mime: f.type, ext, dataBase64 } }
    } else {
      body = { source: 'url', url: importUrl.value.trim() }
    }
    const res = await $fetch<{ brand?: ExtractedBrand; error?: string }>('/api/buzz/extract-brand', {
      method: 'POST', body,
    })
    if (res?.error || !res?.brand) {
      extractError.value = res?.error || 'Could not read the branding from that source. Please try another file or URL.'
      return
    }
    applyExtracted(res.brand)
    extractDone.value = true
  } catch (err: any) {
    extractError.value = String(err?.data?.error ?? err?.message ?? 'Could not extract the branding right now. Please try again.')
  } finally {
    extracting.value = false
  }
}

/** Populate the editable fields from an extraction result. Only overwrite a
 *  field when the AI returned a value, so anything the user already typed stays. */
function applyExtracted(b: ExtractedBrand) {
  if (b.name) name.value = b.name
  const c = b.colors
  if (c) {
    if (c.primary) accent.value = c.primary
    if (c.secondary) secondary.value = c.secondary
    if (c.neutral) neutral.value = c.neutral
    if (Array.isArray(c.palette) && c.palette.length) palette.value = [...c.palette]
    if (Array.isArray(c.combinations) && c.combinations.length) colorCombos.value = [...c.combinations]
  }
  if (b.theme) theme.value = b.theme
  const t = b.typography
  if (t) {
    const list = Array.isArray(t.fonts) ? t.fonts.filter((f) => f?.name).map((f) => ({ name: String(f.name), usage: String(f.usage ?? '') })) : []
    if (!list.length) {
      if (t.headline) list.push({ name: t.headline, usage: 'Headline' })
      if (t.body && t.body !== t.headline) list.push({ name: t.body, usage: 'Body' })
    }
    if (list.length) fonts.value = list
    if (t.hierarchy) hierarchy.value = t.hierarchy
  }
  const tone = b.tone
  if (tone) {
    if (tone.summary) toneSummary.value = tone.summary
    if (Array.isArray(tone.do) && tone.do.length) toneDo.value = [...tone.do]
    if (Array.isArray(tone.dont) && tone.dont.length) toneDont.value = [...tone.dont]
  }
  if (Array.isArray(b.logoUsage) && b.logoUsage.length) logoUsage.value = [...b.logoUsage]
  if (b.photography) photography.value = b.photography
  if (Array.isArray(b.guardrails) && b.guardrails.length) guardrails.value = [...b.guardrails]
}

// ── Brand fields ────────────────────────────────────────────────────────────────
const name = ref('')
const nameError = ref('')

// Colours
const accent = ref('#0A6E4E')
const secondary = ref('#12B76A')
const neutral = ref('#080D0E')
const theme = ref('')
const palette = ref<string[]>([])
const newPaletteHex = ref('')
const colorCombos = ref<string[]>([])

// Typography — a list of every font the brand uses (name + usage).
const fonts = ref<{ name: string; usage: string }[]>([])
const hierarchy = ref('')
function addFont() { fonts.value.push({ name: '', usage: '' }) }
function removeFont(i: number) { fonts.value.splice(i, 1) }

// Tone of voice
const toneSummary = ref('')
const toneDo = ref<string[]>([])
const toneDont = ref<string[]>([])
const newToneDo = ref('')
const newToneDont = ref('')

// Logo usage + uploads
const logoUsage = ref<string[]>([])
const newLogoRule = ref('')
const photography = ref('')
const guardrails = ref<string[]>([])
const newGuardrail = ref('')

// Logo uploads — each item previews from a data URL. Existing logos carry their
// stored asset id; newly-added ones get created (addUploadedAsset + putImage) on save.
interface LogoItem { key: string; assetId?: string; mime: string; dataUrl: string }
const logos = ref<LogoItem[]>([])
const logoInput = ref<HTMLInputElement | null>(null)
let logoSeq = 0

async function onLogoChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  for (const f of Array.from(input.files ?? [])) {
    if (!f.type.startsWith('image/')) continue
    const dataUrl = await fileToDataUrl(f)
    logos.value.push({ key: `logo-${++logoSeq}`, mime: f.type || 'image/png', dataUrl })
  }
  input.value = ''
}
function removeLogo(i: number) { logos.value.splice(i, 1) }

// ── Palette / list helpers ──────────────────────────────────────────────────────
function normalizeHex(v: string): string {
  let h = v.trim()
  if (!h) return ''
  if (!h.startsWith('#')) h = `#${h}`
  return h
}
function isHex(v: string): boolean { return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim()) }
/** A valid 7-char hex for the native colour input (which rejects short/invalid). */
function safeColor(v: string): string {
  const h = v.trim()
  if (/^#[0-9a-fA-F]{6}$/.test(h)) return h
  if (/^#[0-9a-fA-F]{3}$/.test(h)) return `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}`
  return '#000000'
}
function addPaletteHex() {
  const h = normalizeHex(newPaletteHex.value)
  if (!h || !isHex(h)) return
  if (!palette.value.includes(h)) palette.value.push(h)
  newPaletteHex.value = ''
}
function removePalette(i: number) { palette.value.splice(i, 1) }

function addToList(listRef: { value: string[] }, srcRef: { value: string }) {
  const v = srcRef.value.trim()
  if (!v) return
  listRef.value.push(v)
  srcRef.value = ''
}
function addToneDo() { addToList(toneDo, newToneDo) }
function addToneDont() { addToList(toneDont, newToneDont) }
function addLogoRule() { addToList(logoUsage, newLogoRule) }
function addGuardrail() { addToList(guardrails, newGuardrail) }
function removeFromList(list: string[], i: number) { list.splice(i, 1) }

// ── Load existing (edit mode) ────────────────────────────────────────────────────
onMounted(async () => {
  const b = existing.value
  if (!b) return
  name.value = b.name
  accent.value = b.accent || '#0A6E4E'
  secondary.value = b.secondary || '#12B76A'
  neutral.value = b.neutral || '#080D0E'
  theme.value = b.theme ?? ''
  palette.value = [...(b.palette ?? [])]
  colorCombos.value = [...(b.colorCombos ?? [])]
  // Prefer the full font list; else fall back to headline/body (or the legacy line).
  if (b.fonts?.length) {
    fonts.value = b.fonts.filter((f) => f?.name).map((f) => ({ name: f.name, usage: f.usage ?? '' }))
  } else {
    const typ = parseTypography(b.typography)
    const list: { name: string; usage: string }[] = []
    if (b.fontHeadline || typ.headline) list.push({ name: b.fontHeadline || typ.headline, usage: 'Headline' })
    if ((b.fontBody || typ.body) && (b.fontBody || typ.body) !== (b.fontHeadline || typ.headline)) list.push({ name: b.fontBody || typ.body, usage: 'Body' })
    fonts.value = list
  }
  hierarchy.value = b.typographyHierarchy ?? ''
  toneSummary.value = b.tone ?? ''
  toneDo.value = [...(b.toneDo ?? [])]
  toneDont.value = [...(b.toneDont ?? [])]
  logoUsage.value = [...(b.logoUsage ?? [])]
  photography.value = b.photography ?? ''
  guardrails.value = [...(b.guardrails ?? [])]
  // Existing logo assets — load their stored images for the thumbnails.
  for (const id of b.logos ?? []) {
    const rec = await getImage(id)
    logos.value.push({ key: `logo-${++logoSeq}`, assetId: id, mime: rec?.mime ?? 'image/png', dataUrl: rec?.dataUrl ?? '' })
  }
})

/** "Inter · Semibold headlines, Regular body" → { headline, body }. Best-effort. */
function parseTypography(summary: string | undefined): { headline: string; body: string } {
  const s = (summary ?? '').trim()
  if (!s) return { headline: '', body: '' }
  const head = s.split('·')[0]?.trim() ?? ''
  return { headline: head || s, body: head || s }
}

/** Clean font list (drops blank rows). */
function cleanFonts(): { name: string; usage?: string }[] {
  return fonts.value.map((f) => ({ name: f.name.trim(), usage: f.usage.trim() || undefined })).filter((f) => f.name)
}
/** The headline / body font from the list (first, and the one tagged body). */
function headlineFont(): string { return cleanFonts()[0]?.name ?? '' }
function bodyFont(): string { const list = cleanFonts(); return (list.find((f) => /body|text|paragraph/i.test(f.usage ?? ''))?.name) ?? list[1]?.name ?? headlineFont() }
/** Compose the one-line typography summary from the font list (no dashes). */
function composeTypography(): string {
  const parts = cleanFonts().map((f) => f.usage ? `${f.name} · ${f.usage.toLowerCase()}` : f.name)
  if (parts.length) return parts.join(', ')
  const h = headlineFont()
  const bd = bodyFont()
  if (h && bd && h !== bd) return `${h} · headlines, ${bd} · body`
  if (h) return h
  return ''
}

// ── Save ─────────────────────────────────────────────────────────────────────────
const saving = ref(false)

function validate(): boolean {
  nameError.value = name.value.trim() ? '' : 'You must fill in a brand name'
  return !nameError.value
}

/** Create the pending (new) logo assets against a brand id; returns the full
 *  ordered list of logo asset ids (existing first, then the newly created). */
async function persistLogos(brandId: string): Promise<string[]> {
  const ids: string[] = []
  for (const item of logos.value) {
    if (item.assetId) { ids.push(item.assetId); continue }
    const asset = addUploadedAsset({
      title: `${name.value.trim() || 'Brand'} logo`,
      brand: brandId,
      assetType: 'logo',
      usage: 'Logo',
    })
    await putImage({ id: asset.id, mime: item.mime, dataUrl: item.dataUrl })
    ids.push(asset.id)
  }
  return ids
}

function buildBasePatch(): Partial<BuzzBrand> {
  return {
    name: name.value.trim(),
    accent: accent.value.trim() || '#0A6E4E',
    secondary: secondary.value.trim() || '#12B76A',
    neutral: neutral.value.trim() || '#080D0E',
    palette: [...palette.value],
    colorCombos: [...colorCombos.value],
    theme: theme.value.trim(),
    typography: composeTypography(),
    fonts: cleanFonts(),
    fontHeadline: headlineFont(),
    fontBody: bodyFont(),
    typographyHierarchy: hierarchy.value.trim(),
    tone: toneSummary.value.trim(),
    toneDo: [...toneDo.value],
    toneDont: [...toneDont.value],
    logoUsage: [...logoUsage.value],
    photography: photography.value.trim(),
    guardrails: [...guardrails.value],
  }
}

async function save() {
  if (!validate()) return
  if (saving.value) return
  saving.value = true
  try {
    if (isEdit.value && existing.value) {
      const id = existing.value.id
      const logoIds = await persistLogos(id)
      updateBrand(id, {
        ...buildBasePatch(),
        logos: logoIds,
        logo: logoIds[0] || existing.value.logo || '',
      })
      toast.notify({ variant: 'success', title: 'Brand kit saved.', maxWidth: 'max-content' })
    } else {
      // Create the brand first so its id can tag the logo assets.
      const created = addBrand({ ...buildBasePatch(), name: name.value.trim() } as Partial<BuzzBrand> & { name: string })
      const logoIds = await persistLogos(created.id)
      if (logoIds.length) updateBrand(created.id, { logos: logoIds, logo: logoIds[0] })
      toast.notify({ variant: 'success', title: 'Brand kit created.', maxWidth: 'max-content' })
    }
    router.push('/buzz-branding')
  } finally {
    saving.value = false
  }
}

function cancel() { router.push('/buzz-branding') }
</script>

<template>
  <!-- Title bar -->
  <header class="bbf-bar">
    <div class="bbf-bar__left">
      <button class="bbf-crumb" type="button" @click="cancel">Brand kits</button>
      <h1 class="bbf-title">{{ isEdit ? 'Edit brand kit' : 'New brand kit' }}</h1>
    </div>
  </header>

  <div class="bbf-stage">
    <div class="bbf-inner">
      <div class="bbf-form">
        <!-- ── 1 · Import from a brand guideline ── -->
        <section class="bbf-import">
          <div class="bbf-import__head">
            <MpIcon name="magic" size="md" />
            <div>
              <p class="bbf-import__title">Import from a brand guideline</p>
              <p class="bbf-import__sub">Upload your brand guideline or paste your website, and AI fills in the fields below. You can edit everything afterwards.</p>
            </div>
          </div>

          <div class="bbf-import__grid">
            <div class="bbf-import__col">
              <p class="bbf-import__label">Upload a file</p>
              <p class="bbf-import__hint">PDF, PPT, DOCX or an image of your guideline.</p>
              <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="fileInput?.click()">
                <MpIcon name="upload" size="sm" /> Upload brand guideline
              </button>
              <input
                ref="fileInput" type="file" class="bbf-file"
                accept=".pdf,.ppt,.pptx,.doc,.docx,.png,.jpg,.jpeg,.webp"
                @change="onImportFileChange"
              />
              <div v-if="importFileName" class="bbf-filechip">
                <MpIcon name="attachment" size="sm" />
                <span class="bbf-filechip__name">{{ importFileName }}</span>
                <button type="button" class="bbf-filechip__x" aria-label="Remove file" @click="clearImportFile"><MpIcon name="close" size="sm" /></button>
              </div>
            </div>

            <div class="bbf-import__col">
              <p class="bbf-import__label">Or a website URL</p>
              <p class="bbf-import__hint">We read the public brand cues from your site.</p>
              <MpInput id="bbf-import-url" v-model="importUrl" is-full-width placeholder="https://yourcompany.com" @input="extractError = ''" />
            </div>
          </div>

          <div class="bbf-import__actions">
            <MpButton is-rounded variant="primary" :is-loading="extracting" @click="extractWithAi">
              <MpIcon v-if="!extracting" name="magic" size="sm" /> Extract with AI
            </MpButton>
            <span v-if="extracting" class="bbf-import__status"><MpSpinner size="sm" /> Extracting your brand…</span>
            <span v-else-if="extractDone" class="bbf-import__ok"><MpIcon name="check" size="sm" /> Fields filled in from your guideline. Review and edit below.</span>
          </div>
          <p v-if="extractError" class="bbf-error">{{ extractError }}</p>
        </section>

        <!-- ── 2 · Brand name ── -->
        <MpFormControl id="bbf-name" class="bbf-field" is-required :is-invalid="!!nameError">
          <MpFormLabel>Brand name</MpFormLabel>
          <MpInput id="bbf-name-input" v-model="name" is-full-width @input="nameError = ''" />
          <MpFormErrorMessage>{{ nameError }}</MpFormErrorMessage>
        </MpFormControl>

        <!-- ── 3 · Colours & theme ── -->
        <div class="bbf-field bbf-section">
          <p class="bbf-section__title">Colours &amp; theme</p>

          <div class="bbf-colors">
            <div class="bbf-color">
              <label class="bbf-color__label">Primary</label>
              <div class="bbf-color__row">
                <input type="color" class="bbf-swatch-input" :value="safeColor(accent)" @input="accent = ($event.target as HTMLInputElement).value" />
                <MpInput id="bbf-accent" v-model="accent" is-full-width placeholder="#0A6E4E" />
              </div>
            </div>
            <div class="bbf-color">
              <label class="bbf-color__label">Secondary</label>
              <div class="bbf-color__row">
                <input type="color" class="bbf-swatch-input" :value="safeColor(secondary)" @input="secondary = ($event.target as HTMLInputElement).value" />
                <MpInput id="bbf-secondary" v-model="secondary" is-full-width placeholder="#12B76A" />
              </div>
            </div>
            <div class="bbf-color">
              <label class="bbf-color__label">Neutral</label>
              <div class="bbf-color__row">
                <input type="color" class="bbf-swatch-input" :value="safeColor(neutral)" @input="neutral = ($event.target as HTMLInputElement).value" />
                <MpInput id="bbf-neutral" v-model="neutral" is-full-width placeholder="#080D0E" />
              </div>
            </div>
          </div>

          <MpFormControl id="bbf-theme" class="bbf-subfield">
            <MpFormLabel>Theme</MpFormLabel>
            <MpInput id="bbf-theme-input" v-model="theme" is-full-width placeholder="e.g. Light, airy, high-contrast" />
          </MpFormControl>

          <div class="bbf-subfield">
            <p class="bbf-mini-label">Extra palette</p>
            <div v-if="palette.length" class="bbf-chips">
              <span v-for="(hex, i) in palette" :key="hex + i" class="bbf-hexchip">
                <span class="bbf-hexchip__swatch" :style="{ background: hex }" />
                <span class="bbf-hexchip__hex">{{ hex }}</span>
                <button type="button" class="bbf-hexchip__x" aria-label="Remove colour" @click="removePalette(i)"><MpIcon name="close" size="sm" /></button>
              </span>
            </div>
            <div class="bbf-addrow">
              <MpInput id="bbf-palette-add" v-model="newPaletteHex" is-full-width placeholder="#RRGGBB" @keydown.enter.prevent="addPaletteHex" />
              <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="addPaletteHex"><MpIcon name="add" size="sm" /> Add colour</button>
            </div>
          </div>
        </div>

        <!-- ── 4 · Typography — list every font the brand uses ── -->
        <div class="bbf-field bbf-section">
          <p class="bbf-section__title">Typography</p>
          <div v-for="(f, i) in fonts" :key="i" class="bbf-fontrow">
            <MpInput :id="`bbf-font-name-${i}`" v-model="f.name" is-full-width placeholder="Font family, e.g. Inter" />
            <MpInput :id="`bbf-font-usage-${i}`" v-model="f.usage" is-full-width placeholder="Usage, e.g. Headline" />
            <button type="button" class="bbf-fontrow__x" aria-label="Remove font" @click="removeFont(i)"><MpIcon name="minus-circular" size="md" /></button>
          </div>
          <div class="bbf-addrow">
            <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="addFont"><MpIcon name="add" size="sm" /> Add font</button>
          </div>
          <MpFormControl id="bbf-hierarchy" class="bbf-subfield">
            <MpFormLabel>Hierarchy notes</MpFormLabel>
            <MpTextarea id="bbf-hierarchy-input" v-model="hierarchy" :rows="2" is-full-width placeholder="e.g. H1 32px, H2 24px, body 14px, generous line height" />
          </MpFormControl>
        </div>

        <!-- ── 5 · Tone of voice ── -->
        <div class="bbf-field bbf-section">
          <p class="bbf-section__title">Tone of voice</p>
          <MpFormControl id="bbf-tone" class="bbf-subfield">
            <MpFormLabel>Tone summary</MpFormLabel>
            <MpTextarea id="bbf-tone-input" v-model="toneSummary" :rows="2" is-full-width placeholder="e.g. Confident, human, plain-spoken. No jargon." />
          </MpFormControl>

          <div class="bbf-two">
            <div class="bbf-subfield">
              <p class="bbf-mini-label">Do</p>
              <ul v-if="toneDo.length" class="bbf-list">
                <li v-for="(item, i) in toneDo" :key="'do' + i" class="bbf-list__row">
                  <span class="bbf-list__text">{{ item }}</span>
                  <button type="button" class="bbf-list__x" aria-label="Remove" @click="removeFromList(toneDo, i)"><MpIcon name="minus-circular" size="sm" /></button>
                </li>
              </ul>
              <div class="bbf-addrow">
                <MpInput id="bbf-do-add" v-model="newToneDo" is-full-width placeholder="Add a do" @keydown.enter.prevent="addToneDo" />
                <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="addToneDo"><MpIcon name="add" size="sm" /> Add</button>
              </div>
            </div>
            <div class="bbf-subfield">
              <p class="bbf-mini-label">Don't</p>
              <ul v-if="toneDont.length" class="bbf-list">
                <li v-for="(item, i) in toneDont" :key="'dont' + i" class="bbf-list__row">
                  <span class="bbf-list__text">{{ item }}</span>
                  <button type="button" class="bbf-list__x" aria-label="Remove" @click="removeFromList(toneDont, i)"><MpIcon name="minus-circular" size="sm" /></button>
                </li>
              </ul>
              <div class="bbf-addrow">
                <MpInput id="bbf-dont-add" v-model="newToneDont" is-full-width placeholder="Add a don't" @keydown.enter.prevent="addToneDont" />
                <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="addToneDont"><MpIcon name="add" size="sm" /> Add</button>
              </div>
            </div>
          </div>
        </div>

        <!-- ── 6 · Logo usage ── -->
        <div class="bbf-field bbf-section">
          <p class="bbf-section__title">Logo usage</p>

          <div class="bbf-subfield">
            <p class="bbf-mini-label">Usage rules</p>
            <ul v-if="logoUsage.length" class="bbf-list">
              <li v-for="(item, i) in logoUsage" :key="'rule' + i" class="bbf-list__row">
                <span class="bbf-list__text">{{ item }}</span>
                <button type="button" class="bbf-list__x" aria-label="Remove" @click="removeFromList(logoUsage, i)"><MpIcon name="minus-circular" size="sm" /></button>
              </li>
            </ul>
            <div class="bbf-addrow">
              <MpInput id="bbf-rule-add" v-model="newLogoRule" is-full-width placeholder="e.g. Keep minimum clear space around the logo" @keydown.enter.prevent="addLogoRule" />
              <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="addLogoRule"><MpIcon name="add" size="sm" /> Add rule</button>
            </div>
          </div>

          <div class="bbf-subfield">
            <p class="bbf-mini-label">Logo uploads</p>
            <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="logoInput?.click()">
              <MpIcon name="upload" size="sm" /> Upload logo
            </button>
            <input ref="logoInput" type="file" class="bbf-file" accept="image/*" multiple @change="onLogoChange" />
            <div v-if="logos.length" class="bbf-logos">
              <div v-for="(l, i) in logos" :key="l.key" class="bbf-logochip">
                <img v-if="l.dataUrl" :src="l.dataUrl" alt="Logo" class="bbf-logochip__img" />
                <span v-else class="bbf-logochip__img bbf-logochip__img--empty"><MpIcon name="image-document" size="sm" /></span>
                <button type="button" class="bbf-logochip__x" aria-label="Remove logo" @click="removeLogo(i)"><MpIcon name="minus-circular" size="sm" /></button>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Photography (kept in sync with the brand-kit card) ── -->
        <MpFormControl id="bbf-photo" class="bbf-field">
          <MpFormLabel>Photography</MpFormLabel>
          <MpInput id="bbf-photo-input" v-model="photography" is-full-width placeholder="e.g. Real Southeast Asian workplaces, natural light" />
        </MpFormControl>

        <!-- ── Guardrails (do / don't rules applied to generation) ── -->
        <div class="bbf-field">
          <p class="bbf-mini-label">Guardrails</p>
          <ul v-if="guardrails.length" class="bbf-list">
            <li v-for="(item, i) in guardrails" :key="'guard' + i" class="bbf-list__row">
              <span class="bbf-list__text">{{ item }}</span>
              <button type="button" class="bbf-list__x" aria-label="Remove" @click="removeFromList(guardrails, i)"><MpIcon name="minus-circular" size="sm" /></button>
            </li>
          </ul>
          <div class="bbf-addrow">
            <MpInput id="bbf-guard-add" v-model="newGuardrail" is-full-width placeholder="e.g. Avoid generic futuristic AI imagery" @keydown.enter.prevent="addGuardrail" />
            <button type="button" class="btn-enterprise btn-enterprise--secondary" @click="addGuardrail"><MpIcon name="add" size="sm" /> Add guardrail</button>
          </div>
        </div>
      </div>

      <!-- Footer actions -->
      <div class="bbf-actions">
        <MpButton is-rounded variant="ghost" @click="cancel">Cancel</MpButton>
        <MpButton is-rounded variant="primary" :is-loading="saving" @click="save">{{ isEdit ? 'Save changes' : 'Save' }}</MpButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bbf-bar { flex-shrink: 0; min-height: 72px; box-sizing: border-box; background: var(--mp-background-neutral-subtle); padding: var(--mp-spacing-3) var(--mp-spacing-6); display: flex; align-items: center; }
.bbf-bar__left { display: flex; flex-direction: column; gap: 0; min-width: 0; }
.bbf-crumb { align-self: flex-start; background: none; border: none; padding: 0; cursor: pointer; font-size: 12px; color: var(--mp-text-link); line-height: var(--mp-line-heights-md); }
.bbf-crumb:hover { text-decoration: underline; text-underline-offset: 2px; }
.bbf-title { margin: 0; font-size: var(--mp-font-sizes-2xl, 24px); font-weight: var(--mp-font-weights-semi-bold); line-height: 32px; letter-spacing: -0.2px; color: var(--mp-text-default); }

.bbf-stage { flex: 1; min-height: 0; overflow-y: auto; background: var(--mp-background-stage); border-radius: var(--mp-radii-xl) var(--mp-radii-xl) 0 0; padding: var(--mp-spacing-6); }
.bbf-inner { max-width: 680px; }
.bbf-form { margin-top: var(--mp-spacing-2, 8px); display: flex; flex-direction: column; gap: var(--mp-spacing-6, 24px); max-width: 680px; }
.bbf-field { min-width: 0; }

/* Import card */
.bbf-import { border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-lg, 8px); background: var(--mp-background-default, #fff); padding: var(--mp-spacing-5, 20px); display: flex; flex-direction: column; gap: var(--mp-spacing-4, 16px); }
.bbf-import__head { display: flex; align-items: flex-start; gap: var(--mp-spacing-3, 12px); }
.bbf-import__head :deep(svg) { flex: 0 0 auto; margin-top: 2px; color: var(--mp-icon-brand, #0a6e4e); }
.bbf-import__title { margin: 0; font-size: var(--mp-font-sizes-lg, 16px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bbf-import__sub { margin: 2px 0 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); line-height: var(--mp-line-heights-md, 20px); }
.bbf-import__grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4, 16px); }
@media (max-width: 640px) { .bbf-import__grid { grid-template-columns: 1fr; } }
.bbf-import__col { display: flex; flex-direction: column; gap: var(--mp-spacing-2, 8px); align-items: flex-start; }
.bbf-import__label { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bbf-import__hint { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.bbf-import__col > :deep(.mp-form-control), .bbf-import__col > :deep(.mp-input-group) { width: 100%; }
.bbf-import__actions { display: flex; align-items: center; gap: var(--mp-spacing-3, 12px); flex-wrap: wrap; }
.bbf-import__status { display: inline-flex; align-items: center; gap: var(--mp-spacing-2, 8px); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-secondary); }
.bbf-import__ok { display: inline-flex; align-items: center; gap: var(--mp-spacing-2, 8px); font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-success, #0a6e4e); }
.bbf-import__ok :deep(svg) { color: var(--mp-icon-success, #0a6e4e); }

.bbf-file { display: none; }
.bbf-filechip { display: inline-flex; align-items: center; gap: var(--mp-spacing-2, 8px); padding: var(--mp-spacing-1, 4px) var(--mp-spacing-2, 8px); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md, 6px); background: var(--mp-background-neutral-subtle, #f5f7f7); max-width: 100%; }
.bbf-filechip :deep(svg) { flex: 0 0 auto; color: var(--mp-icon-default, #536062); }
.bbf-filechip__name { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-default); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bbf-filechip__x { flex: 0 0 auto; display: inline-flex; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); padding: 0; }
.bbf-filechip__x:hover { color: var(--mp-icon-default, #536062); }

.bbf-error { margin: 0; font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-danger, #d1362f); line-height: var(--mp-line-heights-md, 20px); }

/* Sections */
.bbf-section { display: flex; flex-direction: column; gap: var(--mp-spacing-4, 16px); }
.bbf-section__title { margin: 0; font-size: var(--mp-font-sizes-md, 14px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bbf-subfield { min-width: 0; }
.bbf-mini-label { margin: 0 0 var(--mp-spacing-2, 8px); font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-secondary); }
.bbf-two { display: grid; grid-template-columns: 1fr 1fr; gap: var(--mp-spacing-4, 16px); align-items: start; }
@media (max-width: 640px) { .bbf-two { grid-template-columns: 1fr; } }
.bbf-fontrow { display: grid; grid-template-columns: 1fr 1fr auto; gap: var(--mp-spacing-2, 8px); align-items: center; margin-bottom: var(--mp-spacing-2, 8px); }
.bbf-fontrow__x { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border: none; background: none; cursor: pointer; color: var(--mp-icon-default); border-radius: var(--mp-radii-md, 6px); }
.bbf-fontrow__x:hover { background: var(--mp-background-neutral-subtle); }

/* Colours */
.bbf-colors { display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--mp-spacing-4, 16px); }
@media (max-width: 640px) { .bbf-colors { grid-template-columns: 1fr; } }
.bbf-color { display: flex; flex-direction: column; gap: var(--mp-spacing-2, 8px); min-width: 0; }
.bbf-color__label { font-size: var(--mp-font-sizes-sm, 12px); font-weight: var(--mp-font-weights-semi-bold); color: var(--mp-text-default); }
.bbf-color__row { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); }
.bbf-swatch-input { flex: 0 0 auto; width: 40px; height: 40px; padding: 0; border: 1px solid var(--mp-border-form, #d0d5dd); border-radius: var(--mp-radii-md, 8px); background: none; cursor: pointer; }
.bbf-swatch-input::-webkit-color-swatch-wrapper { padding: 3px; }
.bbf-swatch-input::-webkit-color-swatch { border: none; border-radius: var(--mp-radii-sm, 5px); }
.bbf-color__row :deep(.mp-input-group), .bbf-color__row :deep(.mp-form-control) { flex: 1; min-width: 0; }

/* Hex chips (extra palette) */
.bbf-chips { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-2, 8px); margin-bottom: var(--mp-spacing-3, 12px); }
.bbf-hexchip { display: inline-flex; align-items: center; gap: var(--mp-spacing-2, 8px); padding: var(--mp-spacing-1, 4px) var(--mp-spacing-1, 4px) var(--mp-spacing-1, 4px) var(--mp-spacing-1, 4px); border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-full, 999px); background: var(--mp-background-default, #fff); }
.bbf-hexchip__swatch { width: 20px; height: 20px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.08); flex: 0 0 auto; }
.bbf-hexchip__hex { font-size: var(--mp-font-sizes-sm, 12px); color: var(--mp-text-default); }
.bbf-hexchip__x { display: inline-flex; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); padding: 0 2px 0 0; }
.bbf-hexchip__x:hover { color: var(--mp-icon-default, #536062); }

/* Add row (input + button) */
.bbf-addrow { display: flex; align-items: center; gap: var(--mp-spacing-2, 8px); }
.bbf-addrow > :deep(.mp-input-group), .bbf-addrow > :deep(.mp-form-control) { flex: 1; min-width: 0; }
.bbf-addrow .btn-enterprise { flex: 0 0 auto; }

/* String lists */
.bbf-list { list-style: none; margin: 0 0 var(--mp-spacing-3, 12px); padding: 0; display: flex; flex-direction: column; }
.bbf-list__row { display: flex; align-items: flex-start; gap: var(--mp-spacing-2, 8px); padding: var(--mp-spacing-2, 8px) 0; border-bottom: 1px solid var(--mp-border-default, #e3e7e9); }
.bbf-list__text { flex: 1; min-width: 0; font-size: var(--mp-font-sizes-md, 14px); line-height: var(--mp-line-heights-md, 20px); color: var(--mp-text-default); }
.bbf-list__x { flex: 0 0 auto; display: inline-flex; border: none; background: none; cursor: pointer; color: var(--mp-icon-subtle, #97a0af); padding: 0; margin-top: 2px; }
.bbf-list__x:hover { color: var(--mp-icon-danger, #d1362f); }

/* Logo thumbnails */
.bbf-logos { display: flex; flex-wrap: wrap; gap: var(--mp-spacing-3, 12px); margin-top: var(--mp-spacing-3, 12px); }
.bbf-logochip { position: relative; }
.bbf-logochip__img { display: block; width: 40px; height: 40px; object-fit: contain; border: 1px solid var(--mp-border-default, #e3e7e9); border-radius: var(--mp-radii-md, 8px); background: #fff; padding: 3px; }
.bbf-logochip__img--empty { display: inline-flex; align-items: center; justify-content: center; color: var(--mp-icon-subtle, #97a0af); background: var(--mp-background-neutral-subtle, #f5f7f7); }
.bbf-logochip__x { position: absolute; top: -6px; right: -6px; display: inline-flex; align-items: center; justify-content: center; width: 18px; height: 18px; border: none; border-radius: 50%; background: var(--mp-background-default, #fff); box-shadow: 0 0 0 1px var(--mp-border-default, #e3e7e9); cursor: pointer; color: var(--mp-icon-default, #536062); padding: 0; }
.bbf-logochip__x:hover { color: var(--mp-icon-danger, #d1362f); }

/* Footer */
.bbf-actions { display: flex; justify-content: flex-end; gap: var(--mp-spacing-3, 12px); margin-top: var(--mp-spacing-6, 24px); max-width: 680px; }
:deep(.mp-button--variant_ghost:hover),
:deep(.mp-button--variant_ghost:focus-visible) { border-color: transparent !important; box-shadow: none !important; }
</style>
