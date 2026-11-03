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

/** A seed by-product: what it is, how many come off one batch, and its cost share. */
interface SeedOtherOutput { productId: string; qty: number; percentage: number }

function seedBom(
  i: number,
  finishedGoodId: string,
  materialIds: string[],
  category: 'Standard' | 'Custom',
  costingReference: 'Actual cost' | 'Standard cost',
  description: string,
  others: SeedOtherOutput[] = [],
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
  // Other outputs take their share of the production cost the same way the form
  // derives it (percentage × total), and the main output keeps what is left.
  const otherOutputs: BomOtherOutput[] = others.map(o => ({
    productId: o.productId,
    qty: o.qty,
    unit: catalogProduct(o.productId)!.unit,
    percentage: o.percentage,
    estCost: Math.round(totalProductionCost * (o.percentage / 100)),
  }))
  const otherPct = others.reduce((sum, o) => sum + o.percentage, 0)
  return {
    id: `bom-${10001 + i}`,
    number: `Bill of Materials #${10001 + i}`,
    name: fg.name,
    category,
    costingReference,
    finishedGoodId,
    finishedGoodQty: 1,
    finishedGoodUnit: fg.unit,
    finishedGoodPercentage: 100 - wastePct - otherPct,
    description,
    allowBomAdjustment: i % 2 === 0,
    archived: false,
    rawMaterials,
    productionCost,
    routing,
    otherOutputs,
    productionWaste: [
      { accountMapping: 'Production waste', allocationMethod: 'Percentage', percentage: wastePct, amount: wasteAmount },
    ],
  }
}

const SEED_SPEC: { fg: string; materials: string[]; category: 'Standard' | 'Custom'; costing: 'Actual cost' | 'Standard cost'; desc: string; others?: SeedOtherOutput[] }[] = [
  // Component counts run from 1 to 10 on purpose: a bill with one component and
  // a bill with ten are different things to read, and every surface built on a
  // BOM — the work order's Raw materials table, the stock request it raises and
  // that request's breakdown row — inherits the spread from here.
  //
  // The blends share Gayo Grade 1 (p01) as their base bean, which is also why the
  // same component shows up across many open transactions in the By product view.
  //
  // Six bills also carry Other outputs, so the Finished goods tables have rows to
  // read: a roast batch packs its tail end as 250 g retail bags or coarse cold-brew
  // grind, and a machine build packs accessories into the box. Four bills keep
  // none, so the empty state is seen too. Every by-product is a registered product
  // that is NOT one of the same bill's raw materials.
  { fg: 'p09', materials: ['p01', 'p02', 'p03'], category: 'Standard', costing: 'Actual cost', desc: 'House blend medium roast for retail 250g bags.', others: [{ productId: 'p27', qty: 2, percentage: 6 }] },
  { fg: 'p10', materials: ['p01'], category: 'Custom', costing: 'Standard cost', desc: 'Single-origin dark roast, small batch.', others: [{ productId: 'p26', qty: 1, percentage: 8 }] },
  { fg: 'p11', materials: ['p01', 'p04', 'p05', 'p06'], category: 'Custom', costing: 'Standard cost', desc: 'Premium blend for specialty cafes.', others: [{ productId: 'p27', qty: 2, percentage: 5 }, { productId: 'p26', qty: 1, percentage: 4 }] },
  { fg: 'p12', materials: ['p01', 'p06'], category: 'Standard', costing: 'Actual cost', desc: 'Everyday light roast, wholesale pack.' },
  { fg: 'p26', materials: ['p07', 'p08', 'p02', 'p03', 'p04', 'p05'], category: 'Standard', costing: 'Actual cost', desc: 'Seasonal blend, medium-dark profile.', others: [{ productId: 'p27', qty: 1, percentage: 5 }] },
  { fg: 'p27', materials: ['p01'], category: 'Custom', costing: 'Standard cost', desc: 'Decaf process, swiss water method.' },
  { fg: 'p13', materials: ['p16', 'p20', 'p21', 'p22', 'p23'], category: 'Standard', costing: 'Actual cost', desc: 'Assembled espresso machine, factory spec.', others: [{ productId: 'p25', qty: 1, percentage: 2 }, { productId: 'p30', qty: 1, percentage: 1 }] },
  { fg: 'p14', materials: ['p17', 'p20', 'p21', 'p22', 'p23', 'p24', 'p25'], category: 'Custom', costing: 'Standard cost', desc: 'Semi-automatic unit, custom trim.', others: [{ productId: 'p30', qty: 1, percentage: 2 }] },
  { fg: 'p16', materials: ['p20', 'p21'], category: 'Standard', costing: 'Actual cost', desc: 'Burr grinder, standard assembly.' },
  { fg: 'p28', materials: ['p18', 'p19', 'p20', 'p21', 'p22', 'p23', 'p24', 'p25', 'p30', 'p02'], category: 'Custom', costing: 'Standard cost', desc: 'Compact machine for small cafes.' },
]

/**
 * The teak wood table — the one furniture bill. Written out line by line rather
 * than through {@link seedBom}, whose generated quantities and coffee-roasting
 * routing don't fit joinery: a table takes 3 planks and 4 legs, is cut, assembled,
 * varnished and checked, and its trimmings come off as offcuts. Account, cost
 * driver and process names are the ones the bill of materials form offers, so the
 * bill opens for edit with every field filled.
 */
function teakWoodTableBom(i: number): BillOfMaterials {
  const raw = (productId: string, needed: number): BomRawMaterial => {
    const p = catalogProduct(productId)!
    return { productId, needed, unit: p.unit, purchaseCost: p.price }
  }
  const rawMaterials = [raw('p32', 3), raw('p33', 4), raw('p34', 1), raw('p35', 1), raw('p36', 1)]
  const productionCost: BomProductionCost[] = [
    { group: 'Labor', account: 'Direct labor', costDriver: 'Labor hour', amount: 200_000 },
    { group: 'Overhead', account: 'Machine depreciation', costDriver: 'Machine hour', amount: 35_000 },
    { group: 'Overhead', account: 'Electricity', costDriver: 'kWh', amount: 25_000 },
  ]
  const routing: BomRoutingStep[] = [
    { process: 'Fitting', description: 'Cut the planks to size, plane and sand the top', accountMapping: 'Routing cost', amount: 40_000 },
    { process: 'Assembly', description: 'Join the top and fix the legs with glue and screws', accountMapping: 'Routing cost', amount: 50_000 },
    { process: 'Painting', description: 'Two coats of clear varnish, 24 hours drying between coats', accountMapping: 'Routing cost', amount: 45_000 },
    { process: 'Quality control', description: 'Check level, joints and finish before release', accountMapping: 'Routing cost', amount: 15_000 },
  ]
  const totalProductionCost =
    rawMaterials.reduce((sum, r) => sum + r.needed * r.purchaseCost, 0)
    + productionCost.reduce((sum, c) => sum + c.amount, 0)
    + routing.reduce((sum, r) => sum + r.amount, 0)
  const offcutPct = 2
  const wastePct = 3
  const fg = catalogProduct('p31')!
  return {
    id: `bom-${10001 + i}`,
    number: `Bill of Materials #${10001 + i}`,
    name: fg.name,
    category: 'Standard',
    costingReference: 'Actual cost',
    finishedGoodId: fg.id,
    finishedGoodQty: 1,
    finishedGoodUnit: fg.unit,
    finishedGoodPercentage: 100 - offcutPct - wastePct,
    description: 'Solid teak café table, 120x60 cm top on four turned legs.',
    allowBomAdjustment: true,
    archived: false,
    rawMaterials,
    productionCost,
    routing,
    otherOutputs: [{
      productId: 'p37', qty: 4, unit: catalogProduct('p37')!.unit, percentage: offcutPct,
      estCost: Math.round(totalProductionCost * (offcutPct / 100)),
    }],
    productionWaste: [
      { accountMapping: 'Production waste', allocationMethod: 'Percentage', percentage: wastePct, amount: Math.round(totalProductionCost * (wastePct / 100)) },
    ],
  }
}

function buildSeed(): BillOfMaterials[] {
  return [
    ...SEED_SPEC.map((s, i) => seedBom(i, s.fg, s.materials, s.category, s.costing, s.desc, s.others)),
    teakWoodTableBom(SEED_SPEC.length),
  ].filter(b => !!catalogProduct(b.finishedGoodId))
}

// Persisted as a full snapshot (seed + user-created) — mirrors outgoing.ts: a
// present snapshot wins over the freshly-generated seed; "Reset demo data" clears it.
/**
 * Versioned key: the seed bills now carry 1–10 components each, and a snapshot
 * written against the old 1–2 component seed would quietly pin a returning
 * machine to those — along with the thin stock requests they raise.
 */
const bomSnapshot = loadSnapshot<BillOfMaterials>('billOfMaterials.v2')
export const billOfMaterials = reactive<BillOfMaterials[]>(bomSnapshot ?? buildSeed())

// Snapshots saved before a seed change are brought forward without touching what
// the user did:
//  • a seed bill the snapshot doesn't have (the teak wood table) is added — renumbered
//    if a bill the user created already took its number;
//  • a seed bill saved before the seed carried Other outputs is filled in, but only
//    while it is still as seeded — no other outputs, and its main-output share is
//    the old one (seed share + by-product share) — so a bill someone has since
//    edited is left exactly as they saved it.
if (bomSnapshot) {
  for (const seed of buildSeed()) {
    const saved = billOfMaterials.find(b => b.id === seed.id)
    if (!saved) {
      if (billOfMaterials.some(b => b.number === seed.number)) seed.number = nextBomNumber()
      billOfMaterials.push(seed)
      continue
    }
    if (saved.otherOutputs.length || !seed.otherOutputs.length) continue
    const seedOtherPct = seed.otherOutputs.reduce((sum, o) => sum + o.percentage, 0)
    if (saved.finishedGoodPercentage !== seed.finishedGoodPercentage + seedOtherPct) continue
    saved.otherOutputs = seed.otherOutputs.map(o => ({ ...o }))
    saved.finishedGoodPercentage = seed.finishedGoodPercentage
  }
}

/** Persist the BOM snapshot (call after any mutation). */
export function persistBillOfMaterials(): void {
  saveSnapshot('billOfMaterials.v2', billOfMaterials)
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
