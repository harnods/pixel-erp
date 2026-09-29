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
   * deactivated (Superseded) and read-only forever. Never part of the name.
   */
  version: number
  /** when / by whom / why the Active version was created (v1 = the BOM's creation) */
  versionCreatedAt: string
  versionCreatedBy: string
  versionNote?: string
  /** Superseded versions, oldest first — append-only snapshots of their full content. */
  versionHistory: BomVersionSnapshot[]
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
  { fg: 'p13', materials: ['p16', 'p20'], category: 'Standard', costing: 'Actual cost', desc: 'Assembled espresso machine, factory spec.' },
  { fg: 'p14', materials: ['p17'], category: 'Custom', costing: 'Standard cost', desc: 'Semi-automatic unit, custom trim.' },
  { fg: 'p16', materials: ['p20'], category: 'Standard', costing: 'Actual cost', desc: 'Burr grinder, standard assembly.' },
  { fg: 'p28', materials: ['p02', 'p18'], category: 'Custom', costing: 'Standard cost', desc: 'Compact machine for small cafes.' },
]

function buildSeed(): BillOfMaterials[] {
  const boms = SEED_SPEC.map((s, i) => seedBom(i, s.fg, s.materials, s.category, s.costing, s.desc))
    .filter(b => !!catalogProduct(b.finishedGoodId))
  // Versioning demo: #10001 was upgraded to v2 (one more unit of its first green
  // bean per batch). v1 is Superseded; the work orders created from it keep v1.
  const demo = boms[0]
  if (demo) {
    const v1: BomVersionSnapshot = { version: 1, content: JSON.parse(JSON.stringify(demo)) as BomContent, createdAt: demo.versionCreatedAt, createdBy: demo.versionCreatedBy, supersededAt: '2026-06-20' }
    demo.rawMaterials = demo.rawMaterials.map((r, i) => (i === 0 ? { ...r, needed: r.needed + 1 } : r))
    demo.version = 2
    demo.versionCreatedAt = '2026-06-20'
    demo.versionCreatedBy = 'Rahadian Bima'
    demo.versionNote = 'Stronger blend — one more unit of the base green bean per batch.'
    demo.versionHistory = [v1]
  }
  return boms
}

// Persisted as a full snapshot (seed + user-created) — mirrors outgoing.ts: a
// present snapshot wins over the freshly-generated seed; "Reset demo data" clears it.
// Key bumped for regular BOM versioning (seed #10001 carries v2).
const bomSnapshot = loadSnapshot<BillOfMaterials>('billOfMaterials-v2')
/** BOMs saved before versioning existed are v1 with no history. */
function normalize(b: BillOfMaterials): BillOfMaterials {
  b.version ??= 1
  b.versionCreatedAt ??= '2026-01-05'
  b.versionCreatedBy ??= 'Rahadian Bima'
  b.versionHistory ??= []
  return b
}
export const billOfMaterials = reactive<BillOfMaterials[]>((bomSnapshot ?? buildSeed()).map(normalize))

/** Persist the BOM snapshot (call after any mutation). */
export function persistBillOfMaterials(): void {
  saveSnapshot('billOfMaterials-v2', billOfMaterials)
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

/** Create a new BOM from the New bill of materials form — born as v1 (Active). */
export function addBillOfMaterials(data: BillOfMaterialsInput, by = 'Rahadian Bima', today = TODAY_ISO): BillOfMaterials {
  const n = bomAddSeq++
  const bom: BillOfMaterials = {
    ...data,
    id: `bom-new-${n}`,
    number: nextBomNumber(),
    version: 1,
    versionCreatedAt: today,
    versionCreatedBy: by,
    versionHistory: [],
  }
  billOfMaterials.unshift(bom)
  persistBillOfMaterials()
  return bom
}

/** Update the Active version in place — only while no work order references it. Keeps id/number/version. */
export function updateBillOfMaterials(id: string, data: BillOfMaterialsInput): BillOfMaterials {
  const existing = billOfMaterials.find(b => b.id === id)
  if (!existing) throw new Error(`Bill of materials not found: ${id}`)
  Object.assign(existing, pickInput(data))
  persistBillOfMaterials()
  return existing
}

/** Only recipe fields + the archive flag — never lets a caller overwrite id, number or version history. */
function pickInput(data: BillOfMaterialsInput): BillOfMaterialsInput {
  return { ...cloneContent(data), archived: data.archived }
}

const cloneContent = (c: BomContent): BomContent => JSON.parse(JSON.stringify(Object.fromEntries(CONTENT_KEYS.map(k => [k, c[k]])))) as BomContent

/**
 * Upgrade a BOM to a new version: the Active content is frozen as a Superseded
 * snapshot (deactivated, read-only), and the edit becomes the new Active version.
 * Work orders already pinned to the old version keep it; new ones get this one.
 * No engineering change — that is the project BOM's rule, not the regular BOM's.
 */
export function upgradeBillOfMaterialsVersion(id: string, data: BillOfMaterialsInput, meta: { by: string; note?: string; today?: string }): BillOfMaterials {
  const existing = billOfMaterials.find(b => b.id === id)
  if (!existing) throw new Error(`Bill of materials not found: ${id}`)
  const today = meta.today ?? TODAY_ISO
  existing.versionHistory.push({
    version: existing.version, content: cloneContent(existing), createdAt: existing.versionCreatedAt,
    createdBy: existing.versionCreatedBy, note: existing.versionNote, supersededAt: today,
  })
  Object.assign(existing, pickInput(data))
  // Monotonic — never reused.
  existing.version = Math.max(existing.version, ...existing.versionHistory.map(v => v.version)) + 1
  existing.versionCreatedAt = today
  existing.versionCreatedBy = meta.by
  existing.versionNote = meta.note?.trim() || undefined
  persistBillOfMaterials()
  return existing
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
/** Every version, newest first, with its status. */
export function bomVersionList(b: BillOfMaterials) {
  return [
    { version: b.version, status: 'active' as RegularBomVersionStatus, createdAt: b.versionCreatedAt, createdBy: b.versionCreatedBy, note: b.versionNote, supersededAt: undefined as string | undefined },
    ...[...b.versionHistory].reverse().map(v => ({ version: v.version, status: 'superseded' as RegularBomVersionStatus, createdAt: v.createdAt, createdBy: v.createdBy, note: v.note, supersededAt: v.supersededAt as string | undefined })),
  ]
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

/** Options for a BOM autocomplete — id/name/no/finishedGoodId, newest first. */
export function bomOptions() {
  return billOfMaterials.map(b => ({ id: b.id, name: b.name, no: b.number, finishedGoodId: b.finishedGoodId }))
}
