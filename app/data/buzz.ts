/**
 * Mekari Buzz — mock data for the Marketing tool scenario.
 *
 * Buzz is a brand-governed AI creative workspace for Mekari Marketing: campaigns
 * (projects that group many creatives) and approved assets (brand kits +
 * photo-stock library). Mirrors the other mock tables — a localStorage snapshot
 * that survives reloads and resets with resetDb().
 *
 * Scope here matches the requested high-level nav: Campaigns + Assets (Branding /
 * Photo stocks). Page contents are grounded in the PRD (brand kits, campaign
 * projects, asset library).
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

// ── Brands (each Mekari product has its own brand kit) ──────────────────────────
export interface BuzzBrand {
  id: string
  name: string          // display brand name
  logo: string          // primary logo — /connectors/*.png (seed) OR a logo asset id
  source?: 'seed' | 'custom'  // custom = user-created brand kit
  // ── Colours & theme ──
  accent: string        // primary accent colour (hex)
  secondary: string     // secondary colour (hex)
  neutral: string       // neutral colour (hex)
  palette?: string[]    // full approved palette (hexes)
  colorCombos?: string[]// approved colour combinations, described
  theme?: string        // overall theme (e.g. "Light, airy, high-contrast")
  // ── Typography ──
  typography: string    // headline / body typeface summary (legacy summary line)
  fonts?: { name: string; usage?: string }[]  // ALL font families the brand uses
  fontHeadline?: string // primary headline font family NAME (e.g. "Inter")
  fontBody?: string     // primary body font family NAME
  typographyHierarchy?: string  // detailed hierarchy notes
  // ── Tone of voice ──
  tone: string          // tone of voice, one line
  toneDo?: string[]     // do
  toneDont?: string[]   // don't
  // ── Logo usage ──
  logoUsage?: string[]  // logo usage rules
  logos?: string[]      // logo asset ids (stored in buzzImageStore)
  // ── Visual style (imagery / illustration / iconography) ──
  visualStyle?: string  // overall visual/imagery style (shown if present in the guideline)
  visualRefs?: string[] // uploaded/captured sample-design image ids (buzzImageStore) — the MAIN style reference for generation
  // ── existing ──
  photography: string   // photography style, one line
  guardrails: string[]  // do / don't rules applied to generation
  assetCount: number    // approved assets in this brand
  createdAt?: string
  updatedAt?: string
}

const BRAND_SEED: BuzzBrand[] = [] // no default brands — the workspace is the customer's own

// User-created brand kits are persisted; seeds are the starting library. A customer
// workspace configures its own company / product / sub-brands here (PRD §8).
export const buzzBrands = reactive<BuzzBrand[]>(loadSnapshot<BuzzBrand>('buzz-brands-v2') ?? clone(BRAND_SEED))
export function persistBrands() { saveSnapshot('buzz-brands-v2', buzzBrands) }

export function buzzBrand(id: string): BuzzBrand | undefined {
  return buzzBrands.find((b) => b.id === id)
}

/** Create a new (custom) brand kit at the front of the list. */
export function addBrand(b: Partial<BuzzBrand> & { name: string }): BuzzBrand {
  const brand: BuzzBrand = {
    id: `brand-${slugify(b.name)}-${brandSeq()}`,
    name: b.name,
    logo: b.logo ?? '',
    source: 'custom',
    accent: b.accent ?? '#0A6E4E',
    secondary: b.secondary ?? '#12B76A',
    neutral: b.neutral ?? '#080D0E',
    palette: b.palette ?? [],
    colorCombos: b.colorCombos ?? [],
    theme: b.theme ?? '',
    typography: b.typography ?? '',
    fonts: b.fonts ?? [],
    fontHeadline: b.fontHeadline ?? '',
    fontBody: b.fontBody ?? '',
    typographyHierarchy: b.typographyHierarchy ?? '',
    tone: b.tone ?? '',
    toneDo: b.toneDo ?? [],
    toneDont: b.toneDont ?? [],
    logoUsage: b.logoUsage ?? [],
    logos: b.logos ?? [],
    visualStyle: b.visualStyle ?? '',
    visualRefs: b.visualRefs ?? [],
    photography: b.photography ?? '',
    guardrails: b.guardrails ?? [],
    assetCount: 0,
    createdAt: BUZZ_TODAY,
    updatedAt: BUZZ_TODAY,
  }
  buzzBrands.unshift(brand)
  persistBrands()
  return brand
}

/** Patch an existing brand kit and persist. */
export function updateBrand(id: string, patch: Partial<BuzzBrand>): void {
  const b = buzzBrands.find((x) => x.id === id)
  if (!b) return
  Object.assign(b, patch, { updatedAt: BUZZ_TODAY })
  persistBrands()
}

export function removeBrand(id: string): void {
  const i = buzzBrands.findIndex((x) => x.id === id)
  if (i >= 0) { buzzBrands.splice(i, 1); persistBrands() }
}

let _brandSeq = 0
function brandSeq() { return ++_brandSeq }
function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'brand' }
export const BUZZ_TODAY = '2026-08-27'

// ── Campaigns (projects that group many creatives) ─────────────────────────────
export type BuzzCampaignStatus = 'Draft' | 'In review' | 'Approved'
export interface BuzzCampaign {
  id: string
  name: string
  brand: string            // brand id
  purpose: string          // Product launch / Feature announcement / …
  audience: string
  status: BuzzCampaignStatus
  creatives: number        // number of creatives in the campaign
  owner: string            // marketer name
  updatedAt: string        // ISO date
}

const CAMPAIGN_SEED: BuzzCampaign[] = []

export const buzzCampaigns = reactive<BuzzCampaign[]>(loadSnapshot<BuzzCampaign>('buzz-campaigns-v2') ?? clone(CAMPAIGN_SEED))
export function persistCampaigns() { saveSnapshot('buzz-campaigns-v2', buzzCampaigns) }

export function buzzBadgeType(status: BuzzCampaignStatus): 'completed' | 'warning' | 'announcement' {
  if (status === 'Approved') return 'completed'
  if (status === 'In review') return 'warning'
  return 'announcement'
}

// ── Photo-stock assets (approved brand & lifestyle photography) ─────────────────
export type BuzzOrientation = 'Landscape' | 'Portrait' | 'Square'
/** PRD §10 asset types. Photo stocks lists 'photo'; Logos lists 'logo'. */
export type BuzzAssetType = 'photo' | 'logo' | 'illustration' | 'icon' | 'background' | 'mockup' | 'screenshot'
export interface BuzzAsset {
  id: string
  title: string
  brand: string            // brand id
  assetType?: BuzzAssetType // defaults to 'photo'
  orientation: BuzzOrientation
  tags: string[]
  usage: string            // where it's approved for use
  // A CSS gradient stands in for the seed photos (no network in the mock).
  gradient: string
  addedBy: string
  updatedAt: string
  /** AI-generated assets carry a real image in IndexedDB (buzzImageStore) keyed
   *  by the asset id; 'approved' seed assets fall back to the gradient. */
  source?: 'approved' | 'ai'
  hasImage?: boolean       // a generated image is stored in IndexedDB under `id`
  prompt?: string          // the brief used to generate it
}

const ASSET_SEED: BuzzAsset[] = []

export const buzzAssets = reactive<BuzzAsset[]>(loadSnapshot<BuzzAsset>('buzz-assets-v2') ?? clone(ASSET_SEED))
export function persistAssets() { saveSnapshot('buzz-assets-v2', buzzAssets) }

/** Next generated-asset id (monotonic; seed ids run to IMG-5012). */
function nextAssetId(): string {
  const max = buzzAssets.reduce((m, a) => Math.max(m, Number(a.id.replace(/\D/g, '')) || 0), 5012)
  return `IMG-${max + 1}`
}

/** Add an AI-generated asset to the library (front of the list) and persist the
 *  metadata. The image bytes live in IndexedDB (buzzImageStore) under the id. */
export function addBuzzAsset(a: {
  title: string; brand: string; orientation: BuzzOrientation; tags?: string[]; usage?: string; prompt?: string; updatedAt: string
}): BuzzAsset {
  const asset: BuzzAsset = {
    id: nextAssetId(),
    title: a.title,
    brand: a.brand,
    assetType: 'photo',
    orientation: a.orientation,
    tags: a.tags ?? [],
    usage: a.usage ?? 'Generated',
    gradient: 'linear-gradient(135deg,#7A3FF2,#C4A7FF)',
    addedBy: 'AI',
    updatedAt: a.updatedAt,
    source: 'ai',
    hasImage: true,
    prompt: a.prompt,
  }
  buzzAssets.unshift(asset)
  persistAssets()
  return asset
}

/** Add an uploaded asset (a real image the user uploaded — logo, screenshot, etc.).
 *  The image bytes live in IndexedDB (buzzImageStore) under the returned id. */
export function addUploadedAsset(a: {
  title: string; brand: string; assetType: BuzzAssetType; orientation?: BuzzOrientation; tags?: string[]; usage?: string
}): BuzzAsset {
  const asset: BuzzAsset = {
    id: nextAssetId(),
    title: a.title,
    brand: a.brand,
    assetType: a.assetType,
    orientation: a.orientation ?? 'Square',
    tags: a.tags ?? [],
    usage: a.usage ?? 'Uploaded',
    gradient: 'linear-gradient(135deg,#eef1f2,#dfe4e6)',
    addedBy: 'You',
    updatedAt: BUZZ_TODAY,
    source: 'approved',
    hasImage: true,
  }
  buzzAssets.unshift(asset)
  persistAssets()
  return asset
}

/** All logo assets for a brand (or every logo when brandId omitted). */
export function brandLogos(brandId?: string): BuzzAsset[] {
  return buzzAssets.filter((a) => a.assetType === 'logo' && (!brandId || a.brand === brandId))
}

// ── Quick-create actions on Home (PRD §3) ──────────────────────────────────────
export interface BuzzCreateAction { key: string; label: string; icon: string }
export const BUZZ_CREATE_ACTIONS: BuzzCreateAction[] = [
  { key: 'ig-post', label: 'Instagram post', icon: 'file-image' },
  { key: 'carousel', label: 'Carousel', icon: 'copy' },
  { key: 'story', label: 'Story', icon: 'mobile' },
  { key: 'ad', label: 'Ad', icon: 'broadcast' },
  { key: 'key-visual', label: 'Campaign visual', icon: 'image-document' },
  { key: 'generate', label: 'Generate image', icon: 'magic' },
]

function clone<T>(v: T): T { return JSON.parse(JSON.stringify(v)) }
