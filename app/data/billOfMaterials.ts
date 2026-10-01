import { reactive } from 'vue'
import { CATALOG } from './catalog'
import { loadSnapshot, saveSnapshot } from './persist'
import { TODAY_ISO } from './master'

/** One raw-material line: a registered product consumed to build the output. */
export interface BomRawMaterial {
  productId: string
  needed: number
  unit: string
  purchaseCost: number
}

/** One production-cost line, grouped under Labor / Overhead / Other. */
export interface BomProductionCost {
  group: 'Labor' | 'Overhead' | 'Other'
  account: string
  costDriver: string
  amount: number
}

/** One routing (operation) step. */
export interface BomRoutingStep {
  process: string
  description: string
  accountMapping: string
  amount: number
}

/** A secondary output produced alongside the main finished good (e.g. by-product). */
export interface BomOtherOutput {
  productId: string
  qty: number
  unit: string
  percentage: number
  estCost: number
}

/** Production waste allocated against the batch. */
export interface BomProductionWaste {
  accountMapping: string
  allocationMethod: 'Percentage' | 'Amount'
  percentage: number
  amount: number
}

/**
 * A bill of materials (Production → Bill of materials). Defines the finished good
 * a work order produces, along with its category, costing reference, and the full
 * raw-material / production-cost / routing / output structure a work order is
 * built from. Every product reference (materials, main output, other outputs) is a
 * real registered product id from {@link CATALOG} — nothing here is a loose string.
 */
export interface BillOfMaterials {
  id: string
  /** BOM number, e.g. Bill of Materials #10010 */
  number: string
  /** BOM name — usually the finished good or a variant name */
  name: string
  /** Standard = made-to-stock template · Custom = made-to-order variant */
  category: 'Standard' | 'Custom'
  /** how the output is costed — Actual cost or Standard cost */
  costingReference: 'Actual cost' | 'Standard cost'
  /** the registered product this BOM produces (main output) */
  finishedGoodId: string
  finishedGoodQty: number
  finishedGoodUnit: string
  finishedGoodPercentage: number
  /** free-text description (may be empty) */
  description: string
  /** When true, a work order created from this BOM can add/reduce raw-material
   *  rows (beyond what's defined here); when false, the work order's raw
   *  materials are locked to exactly this list. */
  allowBomAdjustment: boolean
  /** Soft-deleted — hidden from the index by default; still viewable via the
   *  "Show archived" filter toggle. */
  archived: boolean
  rawMaterials: BomRawMaterial[]
  productionCost: BomProductionCost[]
  routing: BomRoutingStep[]
  otherOutputs: BomOtherOutput[]
  productionWaste: BomProductionWaste[]
  /**
   * Version of the content above — the Active version (v1, v2, …). A BOM always
   * has exactly one Active version; earlier ones live in `versionHistory`,
   * Superseded and read-only forever. There is no Draft: a new version exists only
   * once the "Create new version" form is saved (leaving the form creates nothing).
   * Never part of the name.
   */
  version: number
  /** when / by whom / why the Active version was created (v1 = the BOM's creation) */
  versionCreatedAt: string
  versionCreatedBy: string
  versionNote?: string
  /** Superseded versions, oldest first — append-only snapshots of their full content. */
  versionHistory: BomVersionSnapshot[]
  /** Append-only version changelog, oldest first. */
  changelog?: BomChangelogEntry[]
  /**
   * Multi-level: for each sub-BOM used by this BOM's Active version, the sub's
   * version this parent was last made aware of. A newer sub version shows a
   * "sub-BOM has a new version" banner + line badge until acknowledged.
   */
  reviewedSubVersions?: Record<string, number>
}

export type BomChangelogAction = 'created' | 'edited' | 'new_version' | 'reviewed'
/** One changelog event — who did what to which version, and why. */
export interface BomChangelogEntry {
  /** ISO date-time (WIB) */
  at: string
  action: BomChangelogAction
  version: number
  actor: string
  reason?: string
  /** reviewed: the sub-BOM and the version acknowledged */
  subBomId?: string
  subVersion?: number
}

/** The recipe fields a version freezes — everything a work order is built from. */
export type BomContent = Pick<BillOfMaterials,
  'name' | 'category' | 'costingReference' | 'finishedGoodId' | 'finishedGoodQty' | 'finishedGoodUnit'
  | 'finishedGoodPercentage' | 'description' | 'allowBomAdjustment' | 'rawMaterials' | 'productionCost'
  | 'routing' | 'otherOutputs' | 'productionWaste'>
const CONTENT_KEYS: (keyof BomContent)[] = [
  'name', 'category', 'costingReference', 'finishedGoodId', 'finishedGoodQty', 'finishedGoodUnit',
  'finishedGoodPercentage', 'description', 'allowBomAdjustment', 'rawMaterials', 'productionCost',
  'routing', 'otherOutputs', 'productionWaste',
]

/** A deactivated (Superseded) version — its content stays readable for the work orders pinned to it. */
export interface BomVersionSnapshot {
  version: number
  content: BomContent
  createdAt: string
  createdBy: string
  note?: string
  /** when a newer version replaced it */
  supersededAt: string
}

/** The fields a BOM form edits — content plus the archive flag; identity and versioning are managed here. */
export type BillOfMaterialsInput = BomContent & { archived: boolean }

/** Look up a registered product by id — every BOM material/output resolves through this. */
export function catalogProduct(productId: string) {
  return CATALOG.find(p => p.id === productId)
}

// ─── Deterministic seed data ────────────────────────────────────────────────────
// Each seed BOM produces a real roasted-bean or hardware product from CATALOG,
// consumes 2–3 real green-bean/component products as raw materials, and carries
// its own production cost / routing / waste — every BOM shows its own content on
// the detail page (not a shared example).
const ROUTING_POOL = [
  { process: 'Roasting', description: 'Roast to target profile and cool immediately' },
  { process: 'Grinding', description: 'Grind to the packaging spec particle size' },
  { process: 'Assembly', description: 'Follow the instruction guide to assembly' },
  { process: 'Packing', description: 'Weigh, seal, and label per batch' },
  { process: 'Finishing', description: 'Apply final coating and inspection' },
  { process: 'Quality control', description: 'Sample and verify against spec before release' },
]

function seedBom(
  i: number,
  finishedGoodId: string,
  materialIds: string[],
  category: 'Standard' | 'Custom',
  costingReference: 'Actual cost' | 'Standard cost',
  description: string,
): BillOfMaterials {
  const fg = catalogProduct(finishedGoodId)!
  const rawMaterials: BomRawMaterial[] = materialIds.map((id, mi) => {
    const p = catalogProduct(id)!
    return { productId: id, needed: 1 + ((i + mi) % 4), unit: p.unit, purchaseCost: p.price }
  })
  const rawSubtotal = rawMaterials.reduce((s, r) => s + r.needed * r.purchaseCost, 0)
  const laborAmount = 50_000 + (i % 5) * 10_000
  const overheadAmount = 5_000 + (i % 4) * 2_000
  const productionCost: BomProductionCost[] = [
    { group: 'Labor', account: 'Worker', costDriver: 'Person', amount: laborAmount },
    { group: 'Overhead', account: 'Electricity', costDriver: 'Kwh', amount: overheadAmount },
  ]
  const steps = [ROUTING_POOL[i % ROUTING_POOL.length]!, ROUTING_POOL[(i + 2) % ROUTING_POOL.length]!]
  const routing: BomRoutingStep[] = steps.map((s, si) => ({
    process: s.process, description: s.description, accountMapping: 'Routing cost', amount: 15_000 + si * 5_000,
  }))
  const routingSubtotal = routing.reduce((s, r) => s + r.amount, 0)
  const productionCostSubtotal = productionCost.reduce((s, c) => s + c.amount, 0)
  const totalProductionCost = rawSubtotal + productionCostSubtotal + routingSubtotal
  const wastePct = 4 + (i % 4)
  const wasteAmount = Math.round(totalProductionCost * (wastePct / 100))
  return {
    id: `bom-${10001 + i}`,
    number: `Bill of Materials #${10001 + i}`,
    name: fg.name,
    category,
    costingReference,
    finishedGoodId,
    finishedGoodQty: 1,
    finishedGoodUnit: fg.unit,
    finishedGoodPercentage: 100 - wastePct,
    description,
    allowBomAdjustment: i % 2 === 0,
    archived: false,
    rawMaterials,
    productionCost,
    routing,
    otherOutputs: [],
    productionWaste: [
      { accountMapping: 'Production waste', allocationMethod: 'Percentage', percentage: wastePct, amount: wasteAmount },
    ],
    version: 1,
    versionCreatedAt: '2026-01-05',
    versionCreatedBy: 'Rahadian Bima',
    versionHistory: [],
  }
}

const SEED_SPEC: { fg: string; materials: string[]; category: 'Standard' | 'Custom'; costing: 'Actual cost' | 'Standard cost'; desc: string }[] = [
  { fg: 'p09', materials: ['p01', 'p02'], category: 'Standard', costing: 'Actual cost', desc: 'House blend medium roast for retail 250g bags.' },
  { fg: 'p10', materials: ['p03'], category: 'Custom', costing: 'Standard cost', desc: 'Single-origin dark roast, small batch.' },
  { fg: 'p11', materials: ['p04', 'p05'], category: 'Custom', costing: 'Standard cost', desc: 'Premium blend for specialty cafes.' },
  { fg: 'p12', materials: ['p06'], category: 'Standard', costing: 'Actual cost', desc: 'Everyday light roast, wholesale pack.' },
  { fg: 'p26', materials: ['p07', 'p08'], category: 'Standard', costing: 'Actual cost', desc: 'Seasonal blend, medium-dark profile.' },
  { fg: 'p27', materials: ['p01'], category: 'Custom', costing: 'Standard cost', desc: 'Decaf process, swiss water method.' },
  { fg: 'p13', materials: ['p16', 'p21'], category: 'Standard', costing: 'Actual cost', desc: 'Assembled espresso machine, factory spec.' },
  { fg: 'p14', materials: ['p17'], category: 'Custom', costing: 'Standard cost', desc: 'Semi-automatic unit, custom trim.' },
  { fg: 'p16', materials: ['p20'], category: 'Standard', costing: 'Actual cost', desc: 'Burr grinder, standard assembly.' },
  { fg: 'p28', materials: ['p02', 'p18'], category: 'Custom', costing: 'Standard cost', desc: 'Compact machine for small cafes.' },
  // Multi-level demo: #10011 builds the frothing pitcher #10009 (grinder) consumes,
  // and #10007 (espresso machine) consumes the grinder — Espresso machine › Grinder › Pitcher.
  { fg: 'p20', materials: ['p25'], category: 'Standard', costing: 'Actual cost', desc: 'Stainless pitcher, pressed and polished in house.' },
]

const cloneContent = (c: BomContent): BomContent => JSON.parse(JSON.stringify(Object.fromEntries(CONTENT_KEYS.map(k => [k, c[k]])))) as BomContent

const SEED_ACTOR = 'Sari Wulandari'
const at = (date: string, time = '09:00') => `${date}T${time}:00`

function buildSeed(): BillOfMaterials[] {
  const boms = SEED_SPEC.map((s, i) => seedBom(i, s.fg, s.materials, s.category, s.costing, s.desc))
    .filter(b => !!catalogProduct(b.finishedGoodId))
  for (const b of boms) b.changelog = [{ at: at(b.versionCreatedAt), action: 'created', version: 1, actor: b.versionCreatedBy }]
  // Versioning demo: #10001 got v2 (one more unit of its first green bean per batch).
  // v1 is Superseded; the work orders created from it keep v1.
  const demo = boms[0]
  if (demo) upgradeSeed(demo, '2026-06-20', 'Stronger blend — one more unit of the base green bean per batch.', r => r.map((x, i) => (i === 0 ? { ...x, needed: x.needed + 1 } : x)))
  // Multi-level demo: the grinder (#10009) got v2 — one more pitcher per unit. Its
  // parent, the espresso machine (#10007), shows a "sub-BOM has a new version" banner.
  const grinder = boms.find(b => b.finishedGoodId === 'p16')
  if (grinder) upgradeSeed(grinder, '2026-06-10', 'Accessory bundle upgrade — ships with a second frothing pitcher.', r => r.map((x, i) => (i === 0 ? { ...x, needed: x.needed + 1 } : x)))
  for (const b of boms) b.reviewedSubVersions = Object.fromEntries(directSubBoms(b, boms).map(s => [s.id, s.version]))
  const espresso = boms.find(b => b.finishedGoodId === 'p13')
  if (espresso && grinder) espresso.reviewedSubVersions![grinder.id] = 1
  return boms
}

/** Seed helper: freeze the Active content as Superseded and activate the edited copy as vN+1. */
function upgradeSeed(b: BillOfMaterials, date: string, note: string, edit: (r: BomRawMaterial[]) => BomRawMaterial[]) {
  b.versionHistory.push({ version: b.version, content: cloneContent(b), createdAt: b.versionCreatedAt, createdBy: b.versionCreatedBy, note: b.versionNote, supersededAt: date })
  b.rawMaterials = edit(b.rawMaterials)
  b.version += 1
  b.versionCreatedAt = date
  b.versionCreatedBy = SEED_ACTOR
  b.versionNote = note
  b.changelog!.push({ at: at(date, '15:40'), action: 'new_version', version: b.version, actor: SEED_ACTOR, reason: note })
}

// Persisted as a full snapshot (seed + user-created) — mirrors outgoing.ts: a
// present snapshot wins over the freshly-generated seed; "Reset demo data" clears it.
// Key bumped for the multi-level demo (seed #10011, grinder v2) — no Draft status.
const SNAPSHOT_KEY = 'billOfMaterials-v4'
const bomSnapshot = loadSnapshot<BillOfMaterials>(SNAPSHOT_KEY)
/** BOMs saved before versioning existed are v1 Active with no history. */
function normalize(b: BillOfMaterials): BillOfMaterials {
  b.version ??= 1
  b.versionCreatedAt ??= '2026-01-05'
  b.versionCreatedBy ??= 'Rahadian Bima'
  b.versionHistory ??= []
  b.changelog ??= []
  return b
}
export const billOfMaterials = reactive<BillOfMaterials[]>((bomSnapshot ?? buildSeed()).map(normalize))
for (const b of billOfMaterials) {
  b.reviewedSubVersions ??= Object.fromEntries(directSubBoms(b).map(s => [s.id, s.version]))
}

/** Persist the BOM snapshot (call after any mutation). */
export function persistBillOfMaterials(): void {
  saveSnapshot(SNAPSHOT_KEY, billOfMaterials)
}

let bomAddSeq = billOfMaterials.length
const BOM_NO_RE = /^Bill of Materials #(\d+)$/
function nextBomNumber(): string {
  let max = 0
  for (const b of billOfMaterials) {
    const m = b.number.match(BOM_NO_RE)
    if (m) max = Math.max(max, parseInt(m[1]!, 10))
  }
  return `Bill of Materials #${max + 1}`
}

/** Current time as an ISO date-time on the demo's "today" (changelog timestamps, WIB). */
function nowAt(today: string): string {
  const d = new Date()
  return `${today}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:00`
}
function log(b: BillOfMaterials, e: Omit<BomChangelogEntry, 'at'>, today = TODAY_ISO) {
  ;(b.changelog ??= []).push({ ...e, at: nowAt(today) })
}

/** Create a new BOM from the New bill of materials form — born as v1 (Active). */
export function addBillOfMaterials(data: BillOfMaterialsInput, by = 'Rahadian Bima', today = TODAY_ISO): BillOfMaterials {
  const n = bomAddSeq++
  const bom: BillOfMaterials = {
    ...pickInput(data),
    id: `bom-new-${n}`,
    number: nextBomNumber(),
    version: 1,
    versionCreatedAt: today,
    versionCreatedBy: by,
    versionHistory: [],
    changelog: [],
    reviewedSubVersions: {},
  }
  bom.reviewedSubVersions = Object.fromEntries(directSubBoms(bom).map(s => [s.id, s.version]))
  log(bom, { action: 'created', version: 1, actor: by }, today)
  billOfMaterials.unshift(bom)
  persistBillOfMaterials()
  return bom
}

/** Update the Active version in place — only while no work order references it. Keeps id/number/version. */
export function updateBillOfMaterials(id: string, data: BillOfMaterialsInput, by = 'Rahadian Bima'): BillOfMaterials {
  const existing = billOfMaterials.find(b => b.id === id)
  if (!existing) throw new Error(`Bill of materials not found: ${id}`)
  Object.assign(existing, pickInput(data))
  log(existing, { action: 'edited', version: existing.version, actor: by })
  persistBillOfMaterials()
  return existing
}

/** Only recipe fields + the archive flag — never lets a caller overwrite id, number or version history. */
function pickInput(data: BillOfMaterialsInput): BillOfMaterialsInput {
  return { ...cloneContent(data), archived: data.archived }
}

/** The number the next saved version gets — monotonic, never reused. */
export function nextBomVersion(b: BillOfMaterials): number {
  return Math.max(b.version, ...b.versionHistory.map(v => v.version)) + 1
}

export const VERSION_REASON_MIN = 10
export const VERSION_REASON_MAX = 500

/**
 * Save the "Create new version" form (V-02/V-03): the Active content is frozen as
 * a Superseded snapshot (read-only forever) and the saved form becomes the new
 * Active version vN+1 — in one step, only on Save. Work orders already created
 * keep the version they were pinned to; only work orders created afterwards use
 * the new one. A reason (10–500 chars) explains every version.
 */
export function saveBomNewVersion(id: string, data: BillOfMaterialsInput, meta: { by: string; reason: string; today?: string }): BillOfMaterials {
  const existing = billOfMaterials.find(b => b.id === id)
  if (!existing) throw new Error(`Bill of materials not found: ${id}`)
  const today = meta.today ?? TODAY_ISO
  existing.versionHistory.push({
    version: existing.version, content: cloneContent(existing), createdAt: existing.versionCreatedAt,
    createdBy: existing.versionCreatedBy, note: existing.versionNote, supersededAt: today,
  })
  Object.assign(existing, pickInput(data))
  existing.version = nextBomVersion(existing)
  existing.versionCreatedAt = today
  existing.versionCreatedBy = meta.by
  existing.versionNote = meta.reason.trim()
  // The author saw the sub-BOMs this version uses as of now.
  existing.reviewedSubVersions = { ...existing.reviewedSubVersions, ...Object.fromEntries(directSubBoms(existing).map(s => [s.id, s.version])) }
  log(existing, { action: 'new_version', version: existing.version, actor: meta.by, reason: existing.versionNote }, today)
  persistBillOfMaterials()
  return existing
}
/** @deprecated alias of {@link saveBomNewVersion} for older callers. */
export function upgradeBillOfMaterialsVersion(id: string, data: BillOfMaterialsInput, meta: { by: string; note?: string; today?: string }): BillOfMaterials {
  return saveBomNewVersion(id, data, { by: meta.by, reason: meta.note ?? '', today: meta.today })
}

/** The content of one version (Active or Superseded); undefined when the version doesn't exist. */
export function bomVersionContent(b: BillOfMaterials, version?: number): BomContent | undefined {
  if (version === undefined || version === b.version) return b
  return b.versionHistory.find(v => v.version === version)?.content
}

/** The BOM as a given version saw it — identity from the record, recipe from that version. */
export function bomAtVersion(b: BillOfMaterials | undefined, version?: number): BillOfMaterials | undefined {
  if (!b) return undefined
  const content = bomVersionContent(b, version)
  return content && content !== b ? { ...b, ...cloneContent(content) } : b
}

export type RegularBomVersionStatus = 'active' | 'superseded'
export interface RegularBomVersionRow {
  version: number
  status: RegularBomVersionStatus
  createdAt: string
  createdBy: string
  note?: string
  supersededAt?: string
}
/** Every version, newest first, with its status. */
export function bomVersionList(b: BillOfMaterials): RegularBomVersionRow[] {
  return [
    { version: b.version, status: 'active' as const, createdAt: b.versionCreatedAt, createdBy: b.versionCreatedBy, note: b.versionNote },
    ...[...b.versionHistory].reverse().map(v => ({ version: v.version, status: 'superseded' as const, createdAt: v.createdAt, createdBy: v.createdBy, note: v.note, supersededAt: v.supersededAt })),
  ]
}
/** Status of one version, or undefined when it doesn't exist. */
export function bomVersionStatus(b: BillOfMaterials, version: number): RegularBomVersionStatus | undefined {
  return bomVersionList(b).find(v => v.version === version)?.status
}

/** Cost roll-up shared by the detail and create pages. */
export function bomCostSummary(b: Pick<BillOfMaterials, 'rawMaterials' | 'productionCost' | 'routing' | 'productionWaste' | 'otherOutputs' | 'finishedGoodQty'>, finishedGoodEstCost: number) {
  const rawSubtotal = b.rawMaterials.reduce((s, r) => s + r.needed * r.purchaseCost, 0)
  const productionCostSubtotal = b.productionCost.reduce((s, c) => s + c.amount, 0)
  const routingSubtotal = b.routing.reduce((s, r) => s + r.amount, 0)
  const totalProductionCost = rawSubtotal + productionCostSubtotal + routingSubtotal
  const otherOutputsSubtotal = b.otherOutputs.reduce((s, o) => s + o.estCost, 0)
  const wasteSubtotal = b.productionWaste.reduce((s, w) => s + w.amount, 0)
  const finishedGoodsTotal = finishedGoodEstCost + otherOutputsSubtotal + wasteSubtotal
  return { rawSubtotal, productionCostSubtotal, routingSubtotal, totalProductionCost, otherOutputsSubtotal, wasteSubtotal, finishedGoodsTotal }
}

/** Estimated production cost of ONE finished-good unit; undefined when any line is unpriced ("Δ n/a"). */
export function bomUnitCost(c: BomContent): number | undefined {
  if (c.rawMaterials.some(r => !r.purchaseCost)) return undefined
  const { totalProductionCost } = bomCostSummary(c, 0)
  return totalProductionCost / (c.finishedGoodQty || 1)
}
/** Per-unit cost change between two versions; undefined when either side is unpriced. */
export function bomUnitCostDelta(b: BillOfMaterials, fromVersion: number, toVersion: number): number | undefined {
  const from = bomVersionContent(b, fromVersion)
  const to = bomVersionContent(b, toVersion)
  const a = from && bomUnitCost(from)
  const z = to && bomUnitCost(to)
  return a === undefined || z === undefined ? undefined : Math.round(z - a)
}

/** Options for a BOM autocomplete — id/name/no/finishedGoodId, newest first. */
export function bomOptions() {
  return billOfMaterials.map(b => ({ id: b.id, name: b.name, no: b.number, finishedGoodId: b.finishedGoodId }))
}

// ─── Multi-level BOM (V-11, L-3) ─────────────────────────────────────────────────
// A raw material whose product is another BOM's finished good is a sub-BOM. For
// standard BOMs the multi-level rule is resolve-at-WO: a parent version never pins
// its sub-BOM versions (no recursive locking, no version explosion) — sub-BOMs
// resolve to their Active version when a work order is created and the work order
// pins every level. A sub change surfaces on the parent as a review badge instead.

/** The BOM that produces this product (its Active version), if any. */
export function subBomForProduct(productId: string, pool: BillOfMaterials[] = billOfMaterials): BillOfMaterials | undefined {
  return pool.find(b => b.finishedGoodId === productId && !b.archived)
}
/** Sub-BOMs a content's raw materials resolve to (one level). */
export function directSubBoms(c: BomContent & { id?: string }, pool: BillOfMaterials[] = billOfMaterials): BillOfMaterials[] {
  const out: BillOfMaterials[] = []
  for (const r of c.rawMaterials) {
    const s = subBomForProduct(r.productId, pool)
    if (s && s.id !== c.id && !out.includes(s)) out.push(s)
  }
  return out
}

/** One node of the multi-level structure — a raw-material line, expanded when it is a sub-BOM. */
export interface BomTreeNode {
  productId: string
  needed: number
  unit: string
  depth: number
  subBomId?: string
  /** the sub-BOM version this line resolves to (Active, or the WO's pin) */
  subVersion?: number
  children: BomTreeNode[]
}
/**
 * Explode a version's raw materials through every sub-BOM level. `pinFor` picks
 * the sub version per level (a work order's pins); default = the sub's Active one.
 */
export function bomTree(c: BomContent & { id?: string }, opts: { pinFor?: (subBomId: string) => number | undefined; maxDepth?: number } = {}, depth = 0, seen: string[] = []): BomTreeNode[] {
  const maxDepth = opts.maxDepth ?? 8
  return c.rawMaterials.map(r => {
    const sub = subBomForProduct(r.productId)
    const node: BomTreeNode = { productId: r.productId, needed: r.needed, unit: r.unit, depth, children: [] }
    if (sub && sub.id !== c.id && !seen.includes(sub.id) && depth < maxDepth) {
      const v = opts.pinFor?.(sub.id) ?? sub.version
      node.subBomId = sub.id
      node.subVersion = v
      const content = bomVersionContent(sub, v) ?? sub
      node.children = bomTree({ ...content, id: sub.id }, opts, depth + 1, [...seen, c.id ?? '', sub.id])
    }
    return node
  })
}
/** Every sub-BOM under a version, at any depth, with the version it resolves to now. */
export function resolveSubBomPins(c: BomContent & { id?: string }, pick?: (sub: BillOfMaterials) => number): Record<string, number> {
  const pins: Record<string, number> = {}
  const walk = (nodes: BomTreeNode[]) => { for (const n of nodes) { if (n.subBomId && n.subVersion !== undefined) pins[n.subBomId] = n.subVersion; walk(n.children) } }
  walk(bomTree(c, pick ? { pinFor: id => { const s = billOfMaterials.find(b => b.id === id); return s ? pick(s) : undefined } } : {}))
  return pins
}

/**
 * Circular reference check (V-08): would saving this content make the BOM consume,
 * at any depth, the product it produces? Returns the offending path or undefined.
 */
export function bomCycle(id: string | undefined, c: BomContent): string[] | undefined {
  const target = c.finishedGoodId
  const visit = (productIds: string[], path: string[], seen: Set<string>): string[] | undefined => {
    for (const pid of productIds) {
      if (pid === target) return [...path, pid]
      const sub = subBomForProduct(pid)
      if (!sub || sub.id === id || seen.has(sub.id)) continue
      seen.add(sub.id)
      const hit = visit(sub.rawMaterials.map(r => r.productId), [...path, pid], seen)
      if (hit) return hit
    }
    return undefined
  }
  return visit(c.rawMaterials.map(r => r.productId), [], new Set())
}

/** Where-used, one level: BOMs whose Active version consumes this BOM's finished good. */
export function bomParents(id: string): BillOfMaterials[] {
  const b = billOfMaterials.find(x => x.id === id)
  if (!b) return []
  return billOfMaterials.filter(p => p.id !== id && !p.archived && p.rawMaterials.some(r => r.productId === b.finishedGoodId))
}

/** Where-used across every level, with the path ("via") and the per-unit cost delta rolled up. */
export interface BomWhereUsedRow {
  bom: BillOfMaterials
  depth: number
  /** the BOM one level down this row reaches the changed BOM through (undefined for direct parents) */
  via?: BillOfMaterials
  /** per-unit cost change on this BOM caused by the change; undefined = unpriced ("Δ n/a") */
  delta?: number
}
export function bomWhereUsed(id: string, unitDelta?: number): BomWhereUsedRow[] {
  const rows: BomWhereUsedRow[] = []
  const seen = new Set<string>([id])
  let frontier: { id: string; delta?: number; via?: BillOfMaterials }[] = [{ id, delta: unitDelta }]
  for (let depth = 1; frontier.length && depth <= 8; depth++) {
    const next: typeof frontier = []
    for (const f of frontier) {
      const child = billOfMaterials.find(b => b.id === f.id)!
      for (const p of bomParents(f.id)) {
        if (seen.has(p.id)) continue
        seen.add(p.id)
        const qty = p.rawMaterials.filter(r => r.productId === child.finishedGoodId).reduce((s, r) => s + r.needed, 0)
        const delta = f.delta === undefined ? undefined : Math.round((f.delta * qty) / (p.finishedGoodQty || 1))
        rows.push({ bom: p, depth, via: depth > 1 ? child : undefined, delta })
        next.push({ id: p.id, delta, via: child })
      }
    }
    frontier = next
  }
  return rows
}

/** A parent line whose sub-BOM got a newer version since this parent was last made aware of it. */
export interface BomPendingReview {
  sub: BillOfMaterials
  /** the sub version this parent last reviewed */
  fromVersion: number
  /** the sub's current Active version */
  toVersion: number
  /** cumulative per-unit cost change of the sub across every unreviewed hop */
  subDelta?: number
  /** that change multiplied by the parent's needed qty, per parent unit */
  lineDelta?: number
  /** when the newest sub version was saved */
  releasedAt?: string
}
export function bomPendingReviews(b: BillOfMaterials | undefined): BomPendingReview[] {
  if (!b) return []
  return directSubBoms(b).flatMap(sub => {
    const from = b.reviewedSubVersions?.[sub.id] ?? sub.version
    if (sub.version <= from) return []
    const subDelta = bomUnitCostDelta(sub, from, sub.version)
    const qty = b.rawMaterials.filter(r => r.productId === sub.finishedGoodId).reduce((s, r) => s + r.needed, 0)
    const lineDelta = subDelta === undefined ? undefined : Math.round((subDelta * qty) / (b.finishedGoodQty || 1))
    return [{ sub, fromVersion: from, toVersion: sub.version, subDelta, lineDelta, releasedAt: sub.versionCreatedAt }]
  })
}

/** "Mark as reviewed" — acknowledge a sub-BOM's new version on a parent. Logged; never forces a parent version. */
export function markSubBomReviewed(parentId: string, subId: string, by = 'Rahadian Bima'): boolean {
  const p = billOfMaterials.find(b => b.id === parentId)
  const s = billOfMaterials.find(b => b.id === subId)
  if (!p || !s) return false
  ;(p.reviewedSubVersions ??= {})[subId] = s.version
  log(p, { action: 'reviewed', version: p.version, actor: by, subBomId: subId, subVersion: s.version })
  persistBillOfMaterials()
  return true
}
