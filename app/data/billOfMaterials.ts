import { reactive } from 'vue'
import { CATALOG, FULL_CATALOG } from './catalog'
import { loadSnapshot, saveSnapshot } from './persist'

/**
 * One subcon cost line on a Subcontracting BOM — the charge the vendor makes for
 * the outsourced work. Each line references a **non-track service product**
 * (`SUBCON_SERVICE_PRODUCTS` in `./subcon`): a subcon fee is bought as a product
 * so it can sit on a purchase request, but it is a service and carries no
 * inventory.
 */
export interface BomSubconCostLine {
  /** Non-track service product id. */
  productId: string
  /** Denormalized for display — mirrors the service product's name/SKU. */
  name: string
  sku: string
  /** How the vendor quotes it — Unit · Amount · Batch. */
  costDriver: string
  /** Account the charge is mapped to. */
  accountMapping: string
  /** Indicative amount for one batch of the BOM's output quantity, IDR. */
  amount: number
}

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
  /** Standard = made-to-stock template · Custom = made-to-order variant ·
   *  Subcontracting = the process step is performed by an outside vendor */
  category: 'Standard' | 'Custom' | 'Subcontracting'
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
  /** Present on a `Subcontracting` BOM — what the outsourced work costs. Replaces
   *  `productionCost` + `routing`, which describe in-house capacity this BOM does
   *  not use. The recipe names the services; the work order picks the vendor and
   *  decides how components reach them, so nothing vendor-specific belongs here. */
  subconCost?: BomSubconCostLine[]
  rawMaterials: BomRawMaterial[]
  productionCost: BomProductionCost[]
  routing: BomRoutingStep[]
  otherOutputs: BomOtherOutput[]
  productionWaste: BomProductionWaste[]
}

/** Look up a registered product by id — every BOM material/output resolves through this. */
export function catalogProduct(productId: string) {
  // FULL_CATALOG so a subcontracting BOM can reference the apparel line, which is
  // kept out of CATALOG to leave the seed generators' modulo picks untouched.
  return FULL_CATALOG.find(p => p.id === productId)
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

/**
 * The subcontracting demo BOM — "Kemeja Formal Pria", Bill of Materials #10087.
 *
 * Hand-written rather than generated because every figure is reproduced from the
 * design the subcon flow was drawn against, so the screens match it exactly:
 *   500 m × Rp10.000 + 20 kg × Rp160.000 + 2.000 pcs × Rp750 = Rp9.700.000
 *   + Jahit & assembly Rp12.500.000 + handling Rp600.000     = Rp13.100.000
 *   ────────────────────────────────────────────────────────────────────────
 *   Estimated total of subcon process cost                     Rp22.800.000
 *   Main output 95% → Rp21.660.000 · per unit Rp45.600
 *
 * It is also the BOM the seeded subcon orders in `./subcon` already cite, so the
 * document chain resolves to a real record instead of a dangling number.
 */
function subconDemoBom(): BillOfMaterials {
  const rawMaterials: BomRawMaterial[] = [
    { productId: 'p31', needed: 500,   unit: 'm',   purchaseCost: 10_000  },
    { productId: 'p32', needed: 20,    unit: 'kg',  purchaseCost: 160_000 },
    { productId: 'p33', needed: 2_000, unit: 'pcs', purchaseCost: 750     },
  ]
  const subconCost: BomSubconCostLine[] = [
    {
      productId: 'svc-sew', name: 'Jahit & assembly', sku: 'SVC-JHT-01',
      costDriver: 'Unit', accountMapping: 'Subcon service cost', amount: 12_500_000,
    },
    {
      productId: 'svc-handling', name: 'Subcon handling & freight', sku: 'SVC-FRT-01',
      costDriver: 'Amount', accountMapping: 'Subcon service cost', amount: 600_000,
    },
  ]
  const rawSubtotal = rawMaterials.reduce((t, r) => t + r.needed * r.purchaseCost, 0)
  const subconSubtotal = subconCost.reduce((t, c) => t + c.amount, 0)
  const total = rawSubtotal + subconSubtotal          // Rp22.800.000

  return {
    id: 'bom-10087',
    number: 'Bill of Materials #10087',
    name: 'Kemeja Formal Pria',
    category: 'Subcontracting',
    costingReference: 'Standard cost',
    finishedGoodId: 'p34',
    finishedGoodQty: 500,
    finishedGoodUnit: 'Pcs',
    finishedGoodPercentage: 95,
    description: 'Formal cotton shirt — assembly outsourced to a subcon vendor.',
    allowBomAdjustment: true,
    archived: false,
    rawMaterials,
    // A subcontracting BOM has no in-house cost structure: the work is bought.
    productionCost: [],
    routing: [],
    subconCost,
    otherOutputs: [],
    productionWaste: [
      { accountMapping: 'Production waste', allocationMethod: 'Percentage', percentage: 5, amount: Math.round(total * 0.05) },
    ],
  }
}

/**
 * The second subcontracting BOM — an office desk, 200 units.
 *
 * A deliberately different shape from the garment BOM so the subcon screens are
 * exercised against more than one case: four components rather than three, two
 * chargeable services rather than one, and a bought-in steel frame that makes
 * the dropship method natural to demonstrate (the frame can ship from its own
 * supplier straight to the subcon vendor, while the panels go by transfer).
 *
 *   Papan partikel 18mm   400 lembar × Rp185.000   Rp 74.000.000
 *   Rangka besi meja      200 set    × Rp320.000   Rp 64.000.000
 *   Pelapis HPL           600 m2     × Rp 95.000   Rp 57.000.000
 *   Sekrup & fitting      200 set    × Rp 25.000   Rp  5.000.000
 *   Estimated raw materials subtotal                Rp200.000.000
 *
 *   Potong & perakitan kayu (Unit)                  Rp 36.000.000
 *   Finishing & pengecatan  (Unit)                  Rp 18.000.000
 *   Subcon handling & freight (Amount)              Rp  2.000.000
 *   Subcon cost subtotal                            Rp 56.000.000
 *
 *   Estimated total of subcon process cost          Rp256.000.000
 *   Main output 95% → Rp243.200.000 · per unit Rp1.216.000
 */
function mejaKerjaBom(): BillOfMaterials {
  const rawMaterials: BomRawMaterial[] = [
    { productId: 'p35', needed: 400, unit: 'lembar', purchaseCost: 185_000 },
    { productId: 'p36', needed: 200, unit: 'set',    purchaseCost: 320_000 },
    { productId: 'p37', needed: 600, unit: 'm2',     purchaseCost:  95_000 },
    { productId: 'p38', needed: 200, unit: 'set',    purchaseCost:  25_000 },
  ]
  const subconCost: BomSubconCostLine[] = [
    {
      productId: 'svc-woodwork', name: 'Potong & perakitan kayu', sku: 'SVC-KYU-01',
      costDriver: 'Unit', accountMapping: 'Subcon service cost', amount: 36_000_000,
    },
    {
      productId: 'svc-finishing', name: 'Finishing & pengecatan', sku: 'SVC-FNS-01',
      costDriver: 'Unit', accountMapping: 'Subcon service cost', amount: 18_000_000,
    },
    {
      productId: 'svc-handling', name: 'Subcon handling & freight', sku: 'SVC-FRT-01',
      costDriver: 'Amount', accountMapping: 'Subcon service cost', amount: 2_000_000,
    },
  ]
  const rawSubtotal = rawMaterials.reduce((t, r) => t + r.needed * r.purchaseCost, 0)
  const subconSubtotal = subconCost.reduce((t, c) => t + c.amount, 0)
  const total = rawSubtotal + subconSubtotal          // Rp256.000.000

  return {
    id: 'bom-10092',
    number: 'Bill of Materials #10092',
    name: 'Meja Kerja',
    category: 'Subcontracting',
    costingReference: 'Standard cost',
    finishedGoodId: 'p39',
    finishedGoodQty: 200,
    finishedGoodUnit: 'Pcs',
    finishedGoodPercentage: 95,
    description: 'Office work desk 120 × 60 cm — cutting, assembly and finishing outsourced.',
    allowBomAdjustment: true,
    archived: false,
    rawMaterials,
    // A subcontracting BOM has no in-house cost structure: the work is bought.
    productionCost: [],
    routing: [],
    subconCost,
    otherOutputs: [],
    productionWaste: [
      { accountMapping: 'Production waste', allocationMethod: 'Percentage', percentage: 5, amount: Math.round(total * 0.05) },
    ],
  }
}

function buildSeed(): BillOfMaterials[] {
  return SEED_SPEC.map((s, i) => seedBom(i, s.fg, s.materials, s.category, s.costing, s.desc))
    .filter(b => !!catalogProduct(b.finishedGoodId))
    .concat(subconDemoBom(), mejaKerjaBom())
}

// Persisted as a full snapshot (seed + user-created) — mirrors outgoing.ts: a
// present snapshot wins over the freshly-generated seed; "Reset demo data" clears it.
const bomSnapshot = loadSnapshot<BillOfMaterials>('billOfMaterials-v2')

/**
 * A snapshot wins, but it cannot HIDE a BOM the seed has since gained.
 *
 * Someone who has used the app already has a snapshot, and a new seed BOM would
 * otherwise never appear for them — they would have to clear their data to see
 * it, losing whatever they had built. Seeded BOMs missing from the snapshot are
 * appended; anything the snapshot already holds is left exactly as it is, so a
 * BOM the user edited is never overwritten by its seed version.
 */
function mergeSeed(snapshot: BillOfMaterials[]): BillOfMaterials[] {
  const have = new Set(snapshot.map(b => b.id))
  return [...snapshot, ...buildSeed().filter(b => !have.has(b.id))]
}

export const billOfMaterials = reactive<BillOfMaterials[]>(
  bomSnapshot ? mergeSeed(bomSnapshot) : buildSeed())

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
