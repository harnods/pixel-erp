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
  logo: string          // /connectors/*.png (reuse the existing product logos)
  accent: string        // primary accent colour (hex)
  secondary: string     // secondary colour (hex)
  neutral: string       // neutral colour (hex)
  typography: string    // headline / body typeface
  tone: string          // tone of voice, one line
  photography: string   // photography style, one line
  guardrails: string[]  // do / don't rules applied to generation
  assetCount: number    // approved assets in this brand
}

export const buzzBrands: BuzzBrand[] = [
  {
    id: 'mekari', name: 'Mekari', logo: '/connectors/mekari-mcp.svg',
    accent: '#0A6E4E', secondary: '#12B76A', neutral: '#080D0E',
    typography: 'Inter · Semibold headlines, Regular body',
    tone: 'Confident, human, plain-spoken. No jargon.',
    photography: 'Real Southeast Asian workplaces, natural light.',
    guardrails: ['Use Mekari emerald as the primary accent', 'Maintain minimum logo clear space', 'Avoid generic futuristic AI imagery'],
    assetCount: 48,
  },
  {
    id: 'talenta', name: 'Mekari Talenta', logo: '/connectors/mekari-talenta.png',
    accent: '#E8482B', secondary: '#FF7A59', neutral: '#1A1A1A',
    typography: 'Inter · Bold headlines, Regular body',
    tone: 'Warm, HR-first, reassuring. Speaks to people teams.',
    photography: 'Indonesian HR managers and teams at work.',
    guardrails: ['Never recolor the Talenta logo', 'Use Talenta red as the primary accent', 'Use Southeast Asian workplace representation'],
    assetCount: 63,
  },
  {
    id: 'jurnal', name: 'Mekari Jurnal', logo: '/connectors/mekari-jurnal.png',
    accent: '#1E6FE0', secondary: '#4C9AFF', neutral: '#111827',
    typography: 'Inter · Semibold headlines, Regular body',
    tone: 'Precise, trustworthy, finance-literate.',
    photography: 'Finance teams, clean desks, dashboards.',
    guardrails: ['Use Jurnal blue as the primary accent', 'Keep numbers legible and accurate', 'No misleading financial claims'],
    assetCount: 41,
  },
  {
    id: 'qontak', name: 'Mekari Qontak', logo: '/connectors/mekari-qontak.png',
    accent: '#7A3FF2', secondary: '#A78BFA', neutral: '#14121F',
    typography: 'Inter · Semibold headlines, Regular body',
    tone: 'Energetic, conversational, sales-driven.',
    photography: 'Sales and CS teams, conversations, mobile-first.',
    guardrails: ['Use Qontak purple as the primary accent', 'Keep chat mockups realistic', 'Avoid overpromising automation'],
    assetCount: 29,
  },
]

export function buzzBrand(id: string): BuzzBrand | undefined {
  return buzzBrands.find((b) => b.id === id)
}

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

const CAMPAIGN_SEED: BuzzCampaign[] = [
  { id: 'CMP-2041', name: 'Payroll automation launch', brand: 'talenta', purpose: 'Feature announcement', audience: 'HR managers', status: 'In review', creatives: 12, owner: 'Sarah Wijaya', updatedAt: '2026-08-24' },
  { id: 'CMP-2040', name: 'Jurnal AI reconciliation', brand: 'jurnal', purpose: 'Product launch', audience: 'Finance teams', status: 'Draft', creatives: 8, owner: 'Andi Pratama', updatedAt: '2026-08-22' },
  { id: 'CMP-2039', name: 'Qontak WhatsApp promo', brand: 'qontak', purpose: 'Promotion', audience: 'SMB owners', status: 'Approved', creatives: 15, owner: 'Nadia Putri', updatedAt: '2026-08-19' },
  { id: 'CMP-2038', name: 'Talenta employer branding', brand: 'talenta', purpose: 'Employer branding', audience: 'Job seekers', status: 'Approved', creatives: 9, owner: 'Rizal Candra', updatedAt: '2026-08-15' },
  { id: 'CMP-2037', name: 'Mekari year-end webinar', brand: 'mekari', purpose: 'Event', audience: 'Existing customers', status: 'In review', creatives: 6, owner: 'Sarah Wijaya', updatedAt: '2026-08-12' },
  { id: 'CMP-2036', name: 'Jurnal tax season push', brand: 'jurnal', purpose: 'Promotion', audience: 'Accountants', status: 'Draft', creatives: 5, owner: 'Andi Pratama', updatedAt: '2026-08-08' },
  { id: 'CMP-2035', name: 'Talenta attendance feature', brand: 'talenta', purpose: 'Feature announcement', audience: 'HR managers', status: 'Approved', creatives: 11, owner: 'Nadia Putri', updatedAt: '2026-08-04' },
  { id: 'CMP-2034', name: 'Qontak omnichannel story', brand: 'qontak', purpose: 'Thought leadership', audience: 'Marketing leads', status: 'Draft', creatives: 4, owner: 'Rizal Candra', updatedAt: '2026-07-30' },
]

export const buzzCampaigns = reactive<BuzzCampaign[]>(loadSnapshot<BuzzCampaign>('buzz-campaigns') ?? clone(CAMPAIGN_SEED))
export function persistCampaigns() { saveSnapshot('buzz-campaigns', buzzCampaigns) }

export function buzzBadgeType(status: BuzzCampaignStatus): 'completed' | 'warning' | 'announcement' {
  if (status === 'Approved') return 'completed'
  if (status === 'In review') return 'warning'
  return 'announcement'
}

// ── Photo-stock assets (approved brand & lifestyle photography) ─────────────────
export type BuzzOrientation = 'Landscape' | 'Portrait' | 'Square'
export interface BuzzAsset {
  id: string
  title: string
  brand: string            // brand id
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

const ASSET_SEED: BuzzAsset[] = [
  { id: 'IMG-5012', title: 'Indonesian HR manager at laptop', brand: 'talenta', orientation: 'Landscape', tags: ['people', 'office', 'HR'], usage: 'Social, Ads', gradient: 'linear-gradient(135deg,#E8482B,#FF9E7A)', addedBy: 'Brand team', updatedAt: '2026-08-20' },
  { id: 'IMG-5011', title: 'Finance team reviewing dashboard', brand: 'jurnal', orientation: 'Landscape', tags: ['people', 'finance', 'dashboard'], usage: 'Social, Web', gradient: 'linear-gradient(135deg,#1E6FE0,#7FB2FF)', addedBy: 'Brand team', updatedAt: '2026-08-18' },
  { id: 'IMG-5010', title: 'Barista taking a WhatsApp order', brand: 'qontak', orientation: 'Portrait', tags: ['people', 'retail', 'chat'], usage: 'Story, Ads', gradient: 'linear-gradient(135deg,#7A3FF2,#C4A7FF)', addedBy: 'Nadia Putri', updatedAt: '2026-08-16' },
  { id: 'IMG-5009', title: 'Team standup in a bright office', brand: 'mekari', orientation: 'Landscape', tags: ['people', 'team', 'office'], usage: 'Social, Web, Ads', gradient: 'linear-gradient(135deg,#0A6E4E,#4FD1A5)', addedBy: 'Brand team', updatedAt: '2026-08-14' },
  { id: 'IMG-5008', title: 'Close-up hands on keyboard', brand: 'mekari', orientation: 'Square', tags: ['detail', 'work'], usage: 'Social', gradient: 'linear-gradient(135deg,#12B76A,#8CE0BE)', addedBy: 'Rizal Candra', updatedAt: '2026-08-11' },
  { id: 'IMG-5007', title: 'Payroll approval on mobile', brand: 'talenta', orientation: 'Portrait', tags: ['product', 'mobile', 'HR'], usage: 'Story', gradient: 'linear-gradient(135deg,#FF7A59,#FFC5B0)', addedBy: 'Brand team', updatedAt: '2026-08-09' },
  { id: 'IMG-5006', title: 'Warm cafe workspace', brand: 'mekari', orientation: 'Landscape', tags: ['lifestyle', 'workspace'], usage: 'Social, Web', gradient: 'linear-gradient(135deg,#0A6E4E,#0E9F73)', addedBy: 'Sarah Wijaya', updatedAt: '2026-08-05' },
  { id: 'IMG-5005', title: 'Accountant with paperwork', brand: 'jurnal', orientation: 'Square', tags: ['people', 'finance'], usage: 'Ads', gradient: 'linear-gradient(135deg,#4C9AFF,#B9D6FF)', addedBy: 'Andi Pratama', updatedAt: '2026-08-01' },
  { id: 'IMG-5004', title: 'Sales rep on a call', brand: 'qontak', orientation: 'Landscape', tags: ['people', 'sales'], usage: 'Social, Ads', gradient: 'linear-gradient(135deg,#A78BFA,#E0D5FF)', addedBy: 'Brand team', updatedAt: '2026-07-28' },
  { id: 'IMG-5003', title: 'HR team celebrating', brand: 'talenta', orientation: 'Landscape', tags: ['people', 'team', 'HR'], usage: 'Employer branding', gradient: 'linear-gradient(135deg,#E8482B,#FFB59E)', addedBy: 'Nadia Putri', updatedAt: '2026-07-24' },
  { id: 'IMG-5002', title: 'Minimal product flat-lay', brand: 'mekari', orientation: 'Square', tags: ['product', 'flat-lay'], usage: 'Social', gradient: 'linear-gradient(135deg,#12B76A,#0A6E4E)', addedBy: 'Brand team', updatedAt: '2026-07-20' },
  { id: 'IMG-5001', title: 'Founder portrait, natural light', brand: 'mekari', orientation: 'Portrait', tags: ['people', 'portrait'], usage: 'Thought leadership', gradient: 'linear-gradient(135deg,#0E9F73,#7FE6C4)', addedBy: 'Rizal Candra', updatedAt: '2026-07-16' },
]

export const buzzAssets = reactive<BuzzAsset[]>(loadSnapshot<BuzzAsset>('buzz-assets') ?? clone(ASSET_SEED))
export function persistAssets() { saveSnapshot('buzz-assets', buzzAssets) }

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
