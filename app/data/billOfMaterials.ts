import { reactive } from 'vue'
import { CATALOG } from './catalog'
import { loadSnapshot, saveSnapshot } from './persist'

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
}

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
  return SEED_SPEC.map((s, i) => seedBom(i, s.fg, s.materials, s.category, s.costing, s.desc))
    .filter(b => !!catalogProduct(b.finishedGoodId))
}

// Persisted as a full snapshot (seed + user-created) — mirrors outgoing.ts: a
// present snapshot wins over the freshly-generated seed; "Reset demo data" clears it.
const bomSnapshot = loadSnapshot<BillOfMaterials>('billOfMaterials')
export const billOfMaterials = reactive<BillOfMaterials[]>(bomSnapshot ?? buildSeed())

/** Persist the BOM snapshot (call after any mutation). */
export function persistBillOfMaterials(): void {
  saveSnapshot('billOfMaterials', billOfMaterials)
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

/** Create a new BOM from the New bill of materials form — persists + navigable. */
export function addBillOfMaterials(data: Omit<BillOfMaterials, 'id' | 'number'>): BillOfMaterials {
  const n = bomAddSeq++
  const bom: BillOfMaterials = {
    ...data,
    id: `bom-new-${n}`,
    number: nextBomNumber(),
  }
  billOfMaterials.unshift(bom)
  persistBillOfMaterials()
  return bom
}

/** Update an existing BOM in place — keeps its id/number, persists + navigable. */
export function updateBillOfMaterials(id: string, data: Omit<BillOfMaterials, 'id' | 'number'>): BillOfMaterials {
  const existing = billOfMaterials.find(b => b.id === id)
  if (!existing) throw new Error(`Bill of materials not found: ${id}`)
  Object.assign(existing, data)
  persistBillOfMaterials()
  return existing
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
