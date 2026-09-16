import { reactive } from 'vue'
import { CATALOG } from './catalog'
import { TODAY_ISO } from './master'
import { loadSnapshot, saveSnapshot } from './persist'

/**
 * Subcontracting (subcon) — production work handed to an outside vendor.
 *
 * The company's own domain is coffee, so a subcon order is outsourced **roasting
 * and co-packing**: green beans become roasted retail bags at a partner roastery.
 * Two scopes exist:
 *   • `finished-good` — the vendor roasts AND packs the complete product, then
 *     delivers finished bags back.
 *   • `component`     — one component (green beans) goes out for a single process
 *     (roasting); the processed output returns to the production warehouse and the
 *     company packs it in-house.
 *
 * Crossed with scope is **how the components reach the vendor** — the three
 * commercial models the ERP must support:
 *   • `basic`    — the vendor sources every component from their own stock.
 *   • `resupply` — the company transfers its own components to the vendor.
 *   • `dropship` — a 3rd-party vendor ships components straight to the subcon
 *                  vendor, who is set as the consignee (CID) on the PR.
 *
 * Each combination raises a different chain of documents; {@link buildDocumentPlan}
 * is the single source of truth for that chain, and both the create flow and the
 * order detail page render from it.
 */

// ── Vocabulary ────────────────────────────────────────────────────────────────

/** What is sent out: the whole finished good, or a single component process. */
export type SubconScope = 'finished-good' | 'component'

/** Whether the full order quantity is subcontracted or only part of it. */
export type SubconSplit = 'full' | 'partial'

/** Who supplies the components, and therefore which documents get raised. */
export type SubconMethod = 'basic' | 'resupply' | 'dropship'

/** Lifecycle position, 1–5. Drives the stage chain on the dashboard. */
export type SubconStage = 1 | 2 | 3 | 4 | 5

export const SUBCON_METHOD_LABEL: Record<SubconMethod, string> = {
  basic: 'Basic',
  resupply: 'Resupply',
  dropship: 'Dropship',
}

/** Long-form description of each method, shown beside the radio card. */
export const SUBCON_METHOD_DESCRIPTION: Record<SubconScope, Record<SubconMethod, string>> = {
  'finished-good': {
    basic: 'The subcon vendor sources every component from their own stock. Only the subcon service purchase request is raised.',
    resupply: 'You transfer the components from your own warehouse to the vendor, then raise the subcon service purchase request.',
    dropship: 'A 3rd-party vendor ships components straight to the subcon vendor, set as consignee (CID); then the subcon service purchase request.',
  },
  component: {
    basic: 'The subcon vendor sources the green beans themselves. Only the process service purchase request is raised.',
    resupply: 'You transfer the green beans from your warehouse to the subcon vendor, then raise the process purchase request.',
    dropship: 'A 3rd-party vendor ships green beans straight to the subcon vendor (CID); then the process purchase request.',
  },
}

export const SUBCON_SCOPE_LABEL: Record<SubconScope, string> = {
  'finished-good': 'Finished good',
  component: 'One component',
}

export const SUBCON_SCOPE_DESCRIPTION: Record<SubconScope, string> = {
  'finished-good': 'The vendor roasts and packs the complete product, then delivers it back.',
  component: 'Send a single component out for a process; it returns to your production warehouse for in-house packing.',
}

/**
 * The five stages every subcon order moves through, in order. Icon names are
 * verified Pixel library names (`rule/icon-pixel-library`).
 */
export const SUBCON_STAGES = [
  { stage: 1, name: 'BOM & config',     icon: 'products' },
  { stage: 2, name: 'Component supply', icon: 'truck'    },
  { stage: 3, name: 'Subcon PR',        icon: 'cart'     },
  { stage: 4, name: 'Goods receipt',    icon: 'inbox'    },
  { stage: 5, name: 'Closed',           icon: 'done'     },
] as const

// ── Document plan ─────────────────────────────────────────────────────────────

/** Every kind of document a subcon configuration can raise. */
export type SubconDocKind =
  | 'componentPr'   // components bought from a 3rd party, shipped to the subcon (CID)
  | 'subconPr'      // the subcon service itself — finished good
  | 'transfer'      // company components → subcon vendor
  | 'processPr'     // the subcon service itself — one component process
  | 'rawPr'         // raw material bought from a 3rd party, shipped to the subcon (CID)
  | 'rawTransfer'   // company raw material → subcon vendor
  | 'purchasePr'    // the in-house half of a split, bought normally into your warehouse
  | 'receipt'       // goods receipt back from the vendor

export interface SubconDocStep {
  kind: SubconDocKind
  /** Short document-type tag — PR · Transfer · Receipt. */
  tag: 'PR' | 'Transfer' | 'Receipt'
  title: string
  /** One line explaining what this document does in the chain. */
  detail: string
  /** Which module the document lives in — drives the breadcrumb and deep link. */
  module: 'Purchases' | 'Warehouse'
}

const DOC_STEPS: Record<SubconDocKind, Omit<SubconDocStep, 'kind'>> = {
  componentPr: {
    tag: 'PR', module: 'Purchases',
    title: 'Component purchase request',
    detail: 'BOM components → 3rd-party vendor, shipped to the subcon vendor (CID)',
  },
  subconPr: {
    tag: 'PR', module: 'Purchases',
    title: 'Subcon purchase request',
    detail: 'Roasting & packing service → subcon vendor',
  },
  transfer: {
    tag: 'Transfer', module: 'Warehouse',
    title: 'Warehouse transfer',
    detail: 'BOM components → subcon vendor',
  },
  processPr: {
    tag: 'PR', module: 'Purchases',
    title: 'Subcon process purchase request',
    detail: 'Roasting service → subcon vendor',
  },
  rawPr: {
    tag: 'PR', module: 'Purchases',
    title: 'Raw material purchase request',
    detail: 'Green beans → 3rd-party vendor, shipped to the subcon vendor (CID)',
  },
  rawTransfer: {
    tag: 'Transfer', module: 'Warehouse',
    title: 'Raw material transfer',
    detail: 'Green beans → subcon vendor',
  },
  purchasePr: {
    tag: 'PR', module: 'Purchases',
    title: 'Standard purchase request',
    detail: 'In-house portion of the split → your own warehouse',
  },
  receipt: {
    tag: 'Receipt', module: 'Warehouse',
    title: 'Goods receipt',
    detail: 'Processed output → production warehouse, pending inbound approval',
  },
}

/**
 * The document chain a subcon configuration raises, in the order it is raised.
 *
 * This is the rule the whole feature turns on, so it lives in exactly one place:
 *   • finished good — dropship buys the components first (CID); the subcon PR is
 *     always raised; resupply adds the warehouse transfer that supplies it; the
 *     receipt closes the loop.
 *   • component    — a partial split buys the in-house half normally first; the raw
 *     material then reaches the vendor by purchase (dropship) or transfer
 *     (resupply); the process PR and the receipt follow.
 */
export function buildDocumentPlan(
  scope: SubconScope,
  split: SubconSplit,
  method: SubconMethod,
): SubconDocStep[] {
  const kinds: SubconDocKind[] = []

  if (scope === 'finished-good') {
    if (method === 'dropship') kinds.push('componentPr')
    kinds.push('subconPr')
    if (method === 'resupply') kinds.push('transfer')
  } else {
    if (split === 'partial') kinds.push('purchasePr')
    if (method === 'dropship') kinds.push('rawPr')
    if (method === 'resupply') kinds.push('rawTransfer')
    kinds.push('processPr')
  }
  kinds.push('receipt')

  return kinds.map(kind => ({ kind, ...DOC_STEPS[kind] }))
}

// ── Subcon vendors ────────────────────────────────────────────────────────────

/**
 * Partner roasteries that take subcon work, plus the 3rd-party bean supplier used
 * by the dropship model. Kept here rather than in `contacts.ts` because the
 * contacts store is snapshot-persisted — appending seeds there would not reach
 * anyone whose snapshot predates this feature.
 */
export interface SubconVendor {
  id: string
  name: string
  /** Street address — shown as the CID consignee on a dropship PR. */
  address: string
  /** `subcon` takes the process work; `supplier` only sells components. */
  role: 'subcon' | 'supplier'
}

export const SUBCON_VENDORS: readonly SubconVendor[] = [
  { id: 'sv-01', name: 'PT Roastery Nusantara Mandiri', address: 'Jl. Industri Raya No. 8, Bandung',      role: 'subcon'   },
  { id: 'sv-02', name: 'CV Kopi Sangrai Sejahtera',     address: 'Jl. Kaligawe Km 5, Semarang',           role: 'subcon'   },
  { id: 'sv-03', name: 'PT Java Roasting Works',        address: 'Jl. Rungkut Industri III/22, Surabaya', role: 'subcon'   },
  { id: 'sv-04', name: 'UD Karya Sangrai Utama',        address: 'Jl. Raya Bogor Km 32, Bogor',           role: 'subcon'   },
  { id: 'sv-05', name: 'CV Sumber Biji Nusantara',      address: 'Jl. Soekarno Hatta No. 114, Medan',     role: 'supplier' },
  // ── Apparel line — konveksi partners for the garment scenario ──
  { id: 'sv-06', name: 'PT Mitra Jaya Konveksi',       address: 'Jl. Industri Raya No. 8, Bandung',       role: 'subcon'   },
  { id: 'sv-07', name: 'CV Garmen Sejahtera',          address: 'Jl. Cibaduyut Raya No. 45, Bandung',     role: 'subcon'   },
  { id: 'sv-08', name: 'CV Sumber Kain Tekstil',       address: 'Jl. Otista No. 210, Bandung',            role: 'supplier' },
]

export const DEFAULT_SUBCON_VENDOR = SUBCON_VENDORS[0]!
/** The 3rd-party component supplier used by the dropship model. */
export const COMPONENT_SUPPLIER = SUBCON_VENDORS[4]!

// ── The recipe every subcon order in the demo is built from ───────────────────

/** Warehouse the company supplies its own components from. */
export const SOURCE_WAREHOUSE = { id: 'wh-001', name: 'Gudang Jakarta Pusat' }
/** Warehouse processed output is received back into. */
export const PRODUCTION_WAREHOUSE = { id: 'wh-005', name: 'Gudang Semarang Industrial' }

function product(id: string) {
  const p = CATALOG.find(c => c.id === id)
  if (!p) throw new Error(`subcon: unknown catalog product ${id}`)
  return p
}

/** Main output — the roasted retail bag the vendor delivers back. */
export const SUBCON_OUTPUT = product('p09')        // Roasted Beans House Blend Medium
/** The single component sent out under the `component` scope. */
export const SUBCON_PROCESS_COMPONENT = product('p01') // Green Beans Arabica Gayo Grade 1

export interface SubconBomLine {
  productId: string
  name: string
  sku: string
  unit: string
  /** Quantity needed for the full 500-bag batch. */
  qty: number
  unitPrice: number
}

/**
 * The blend recipe — three green-bean lots roasted into the House Blend.
 * Sized for the reference batch: 500 × 1 kg bags of roasted output needs ~600 kg
 * of green beans once ~17% roast loss is allowed for, i.e. ten 60 kg sacks.
 */
export const SUBCON_BOM_LINES: readonly SubconBomLine[] = (
  [
    ['p01', 6],
    ['p02', 3],
    ['p05', 1],
  ] as const
).map(([id, qty]) => {
  const p = product(id)
  return { productId: p.id, name: p.name, sku: p.sku, unit: p.unit, qty, unitPrice: p.price }
})

/**
 * Non-track service products used to cost subcon work.
 *
 * A subcon fee is bought as a *product* — it sits on a purchase request line like
 * anything else — but it is a **service**, so no inventory is recorded against it.
 * That is the ERP's existing `single-not-tracked` product type
 * (`~/data/productsIndex` › ProductType).
 *
 * They deliberately live here rather than in `catalog.ts`: that file is the master
 * list of STOCKED goods and drives warehouse stock generation, on-hand figures and
 * every inventory page. Putting a service in it would fabricate stock for something
 * that has none.
 */
export interface SubconServiceProduct {
  id: string
  name: string
  sku: string
  /** Always non-track — a service never carries inventory. */
  productType: 'single-not-tracked'
  /** Where the charge lands in the chart of accounts. */
  accountMapping: string
  /** How the vendor quotes it — per unit produced, as a lump amount, or per batch. */
  defaultCostDriver: 'Unit' | 'Amount' | 'Batch'
  /** Indicative price for one reference batch, IDR. */
  defaultPrice: number
}

export const SUBCON_SERVICE_PRODUCTS: readonly SubconServiceProduct[] = [
  {
    id: 'svc-roast-pack', name: 'Roasting & packing service', sku: 'SVC-RST-01',
    productType: 'single-not-tracked', accountMapping: 'Subcon service cost',
    defaultCostDriver: 'Unit', defaultPrice: 25_000_000,
  },
  {
    id: 'svc-roast', name: 'Roasting service', sku: 'SVC-RST-02',
    productType: 'single-not-tracked', accountMapping: 'Subcon service cost',
    defaultCostDriver: 'Unit', defaultPrice: 12_000_000,
  },
  {
    id: 'svc-handling', name: 'Subcon handling & freight', sku: 'SVC-FRT-01',
    productType: 'single-not-tracked', accountMapping: 'Subcon service cost',
    defaultCostDriver: 'Amount', defaultPrice: 1_500_000,
  },
  {
    id: 'svc-qc', name: 'Subcon quality inspection', sku: 'SVC-QC-01',
    productType: 'single-not-tracked', accountMapping: 'Subcon service cost',
    defaultCostDriver: 'Batch', defaultPrice: 750_000,
  },
  {
    id: 'svc-blend', name: 'Blending & cupping service', sku: 'SVC-BLD-01',
    productType: 'single-not-tracked', accountMapping: 'Other subcon cost',
    defaultCostDriver: 'Batch', defaultPrice: 2_000_000,
  },
  // ── Apparel line (cut-make-trim) — the garment subcontracting scenario ──
  {
    id: 'svc-sew', name: 'Jahit & assembly', sku: 'SVC-JHT-01',
    productType: 'single-not-tracked', accountMapping: 'Subcon service cost',
    defaultCostDriver: 'Unit', defaultPrice: 12_500_000,
  },
  {
    id: 'svc-print-dye', name: 'Printing & pewarnaan', sku: 'SVC-PRT-01',
    productType: 'single-not-tracked', accountMapping: 'Subcon service cost',
    defaultCostDriver: 'Unit', defaultPrice: 4_000_000,
  },
]

export function subconServiceProduct(id: string): SubconServiceProduct | undefined {
  return SUBCON_SERVICE_PRODUCTS.find(p => p.id === id)
}

/** Account codes a subcon cost line can be mapped to. */
export const SUBCON_ACCOUNT_MAPPINGS = [
  'Subcon service cost',
  'Other subcon cost',
  'Work in process',
] as const

/** How a vendor quotes a charge. */
export const SUBCON_COST_DRIVERS = ['Unit', 'Amount', 'Batch'] as const

/** Service fee charged by the subcon vendor, per scope, for a full 500-bag batch. */
export const SUBCON_SERVICE_FEE: Record<SubconScope, { name: string; amount: number }> = {
  'finished-good': { name: 'Roasting & packing service', amount: 25_000_000 },
  component: { name: 'Roasting service', amount: 12_000_000 },
}

/** Handling & freight charged alongside the service fee. */
export const SUBCON_HANDLING_FEE = { name: 'Subcon handling & freight', amount: 1_500_000 }

/** Reference batch size every amount above is quoted against. */
export const SUBCON_BATCH_QTY = 500

// ── Orders ────────────────────────────────────────────────────────────────────

export type SubconOrderStatus =
  | 'draft'
  | 'material sent'
  | 'pending approval'
  | 'fee outstanding'
  | 'discrepancy'
  | 'overdue'

/** How the receipt was dispositioned at QC — only present once goods arrive. */
export interface SubconDisposition {
  accepted: number
  rework: number
  scrap: number
}

export interface SubconOrder {
  id: string
  /** display number, e.g. SC-2026-0001 */
  number: string
  scope: SubconScope
  split: SubconSplit
  method: SubconMethod
  vendorId: string
  vendorName: string
  /** the roasted product this order yields */
  productId: string
  productName: string
  /** ordered quantity, in `unit` */
  qty: number
  unit: string
  stage: SubconStage
  /** One line saying exactly where the order is sitting right now. */
  stageCaption: string
  /** quantity received back so far */
  receivedQty: number
  disposition?: SubconDisposition
  /** ISO date the vendor promised the goods back; absent on a draft. */
  promisedDate?: string
  /** Warehouse components are transferred OUT of — `resupply` only. */
  sourceWarehouseId?: string
  sourceWarehouseName?: string
  /** Warehouse the vendor's output is received back INTO. */
  receivingWarehouseId: string
  receivingWarehouseName: string
  /** days past the promised date — 0 when on time */
  lateDays: number
  status: SubconOrderStatus
  /** Surfaced in the "Needs attention" KPI and highlights the dashboard row. */
  needsAttention: boolean
  /** Document numbers already raised, in chain order. */
  documents: string[]
  /** BOM this order was configured from. */
  bomNumber: string
}

const SEED_ORDERS: SubconOrder[] = [
  {
    id: 'sc-1', number: 'SC-2026-0001',
    scope: 'finished-good', split: 'full', method: 'basic',
    vendorId: 'sv-01', vendorName: 'PT Roastery Nusantara Mandiri',
    productId: SUBCON_OUTPUT.id, productName: SUBCON_OUTPUT.name, qty: 400, unit: SUBCON_OUTPUT.unit,
    stage: 5, stageCaption: 'Blocked: fee invoice outstanding',
    receivedQty: 400, disposition: { accepted: 392, rework: 0, scrap: 8 },
    promisedDate: '2026-06-12', lateDays: 0,
    receivingWarehouseId: 'wh-005', receivingWarehouseName: 'Gudang Semarang Industrial',
    status: 'fee outstanding', needsAttention: true,
    documents: ['PR-SUB-2026-0139', 'GR-2026-0060'],
    bomNumber: 'Bill of Materials #10087',
  },
  {
    id: 'sc-2', number: 'SC-2026-0002',
    scope: 'finished-good', split: 'full', method: 'resupply',
    vendorId: 'sv-01', vendorName: 'PT Roastery Nusantara Mandiri',
    productId: SUBCON_OUTPUT.id, productName: SUBCON_OUTPUT.name, qty: 500, unit: SUBCON_OUTPUT.unit,
    stage: 4, stageCaption: 'At goods receipt — awaiting inbound approval',
    receivedQty: 500, disposition: { accepted: 480, rework: 12, scrap: 8 },
    promisedDate: '2026-06-25', lateDays: 0,
    sourceWarehouseId: 'wh-001', sourceWarehouseName: 'Gudang Jakarta Pusat',
    receivingWarehouseId: 'wh-005', receivingWarehouseName: 'Gudang Semarang Industrial',
    status: 'pending approval', needsAttention: false,
    documents: ['PR-SUB-2026-0142', 'WT-2026-0031', 'GR-2026-0064'],
    bomNumber: 'Bill of Materials #10087',
  },
  {
    id: 'sc-3', number: 'SC-2026-0003',
    scope: 'finished-good', split: 'full', method: 'basic',
    vendorId: 'sv-02', vendorName: 'CV Kopi Sangrai Sejahtera',
    productId: SUBCON_OUTPUT.id, productName: SUBCON_OUTPUT.name, qty: 300, unit: SUBCON_OUTPUT.unit,
    stage: 4, stageCaption: 'At goods receipt — 2 partial batches received',
    receivedQty: 180, disposition: { accepted: 176, rework: 4, scrap: 0 },
    promisedDate: '2026-06-22', lateDays: 0,
    receivingWarehouseId: 'wh-005', receivingWarehouseName: 'Gudang Semarang Industrial',
    status: 'discrepancy', needsAttention: true,
    documents: ['PR-SUB-2026-0144', 'GR-2026-0061', 'GR-2026-0062'],
    bomNumber: 'Bill of Materials #10087',
  },
  {
    id: 'sc-4', number: 'SC-2026-0004',
    scope: 'finished-good', split: 'partial', method: 'dropship',
    vendorId: 'sv-03', vendorName: 'PT Java Roasting Works',
    productId: SUBCON_OUTPUT.id, productName: SUBCON_OUTPUT.name, qty: 250, unit: SUBCON_OUTPUT.unit,
    stage: 2, stageCaption: 'At component supply — CID shipment in transit',
    receivedQty: 0,
    promisedDate: '2026-08-10', lateDays: 0,
    receivingWarehouseId: 'wh-005', receivingWarehouseName: 'Gudang Semarang Industrial',
    status: 'material sent', needsAttention: false,
    documents: ['PR-CMP-2026-0077', 'PR-SUB-2026-0149'],
    bomNumber: 'Bill of Materials #10087',
  },
  {
    id: 'sc-5', number: 'SC-2026-0005',
    scope: 'finished-good', split: 'full', method: 'resupply',
    vendorId: 'sv-04', vendorName: 'UD Karya Sangrai Utama',
    productId: SUBCON_OUTPUT.id, productName: SUBCON_OUTPUT.name, qty: 300, unit: SUBCON_OUTPUT.unit,
    stage: 3, stageCaption: 'At subcon PR — awaiting goods receipt',
    receivedQty: 0,
    promisedDate: '2026-06-17', lateDays: 9,
    sourceWarehouseId: 'wh-001', sourceWarehouseName: 'Gudang Jakarta Pusat',
    receivingWarehouseId: 'wh-005', receivingWarehouseName: 'Gudang Semarang Industrial',
    status: 'overdue', needsAttention: false,
    documents: ['PR-SUB-2026-0146', 'WT-2026-0032'],
    bomNumber: 'Bill of Materials #10087',
  },
  {
    id: 'sc-6', number: 'SC-2026-0006',
    scope: 'component', split: 'full', method: 'basic',
    vendorId: 'sv-02', vendorName: 'CV Kopi Sangrai Sejahtera',
    productId: SUBCON_OUTPUT.id, productName: SUBCON_OUTPUT.name, qty: 500, unit: SUBCON_OUTPUT.unit,
    stage: 1, stageCaption: 'At BOM & subcon configuration',
    receivedQty: 0,
    lateDays: 0,
    receivingWarehouseId: 'wh-005', receivingWarehouseName: 'Gudang Semarang Industrial',
    status: 'draft', needsAttention: false,
    documents: ['Bill of Materials #10087'],
    bomNumber: 'Bill of Materials #10087',
  },
]

const ORDERS_KEY = 'subcon-orders-v1'
export const subconOrders = reactive<SubconOrder[]>(
  loadSnapshot<SubconOrder>(ORDERS_KEY) ?? SEED_ORDERS.map(o => ({ ...o })),
)

export function persistSubconOrders(): void {
  saveSnapshot(ORDERS_KEY, subconOrders)
}

export function getSubconOrder(id: string): SubconOrder | undefined {
  return subconOrders.find(o => o.id === id || o.number === id)
}

function nextSubconNumber(): string {
  let max = 0
  for (const o of subconOrders) {
    const m = o.number.match(/^SC-2026-(\d+)$/)
    if (m) max = Math.max(max, parseInt(m[1]!, 10))
  }
  return `SC-2026-${String(max + 1).padStart(4, '0')}`
}

/** Create a subcon order from the New subcon order form. */
export function addSubconOrder(data: Omit<SubconOrder, 'id' | 'number'>): SubconOrder {
  const order: SubconOrder = { ...data, id: `sc-new-${subconOrders.length + 1}`, number: nextSubconNumber() }
  subconOrders.unshift(order)
  persistSubconOrders()
  return order
}

// ── Material custody (WIP at vendor) ──────────────────────────────────────────

/**
 * Company-owned stock sitting at a subcon vendor. It has left the warehouse but
 * has not been consumed into an output yet, so it stays on the company's books —
 * this is what the custody table reconciles.
 */
export interface SubconCustodyLine {
  id: string
  orderId: string
  orderNumber: string
  method: SubconMethod
  productId: string
  productName: string
  sku: string
  unit: string
  /** Where the material came from — a warehouse (resupply) or a CID vendor (dropship). */
  sourceLabel: string
  /** Transfer or PR that moved it into the vendor's custody. */
  docNumber: string
  sentQty: number
  consumedQty: number
  returnedQty: number
  /** Value of the outstanding balance, IDR. */
  balanceValue: number
}

function custody(
  id: string, orderId: string, orderNumber: string, method: SubconMethod,
  productId: string, sourceLabel: string, docNumber: string,
  sentQty: number, consumedQty: number, returnedQty: number,
): SubconCustodyLine {
  const p = product(productId)
  return {
    id, orderId, orderNumber, method,
    productId: p.id, productName: p.name, sku: p.sku, unit: p.unit,
    sourceLabel, docNumber, sentQty, consumedQty, returnedQty,
    balanceValue: (sentQty - consumedQty - returnedQty) * p.price,
  }
}

const RESUPPLY_SOURCE = `Resupply · from ${SOURCE_WAREHOUSE.name}`
const DROPSHIP_SOURCE = `Dropship · CID from ${COMPONENT_SUPPLIER.name}`

export const subconCustody: readonly SubconCustodyLine[] = [
  // SC-2026-0002 — roasted and received back; a little of each lot is still uncut.
  custody('cu-1', 'sc-2', 'SC-2026-0002', 'resupply', 'p01', RESUPPLY_SOURCE, 'WT-2026-0031', 6, 5, 0),
  custody('cu-2', 'sc-2', 'SC-2026-0002', 'resupply', 'p02', RESUPPLY_SOURCE, 'WT-2026-0031', 3, 2, 0),
  custody('cu-3', 'sc-2', 'SC-2026-0002', 'resupply', 'p05', RESUPPLY_SOURCE, 'WT-2026-0031', 2, 1, 0),
  // SC-2026-0004 — dropshipped straight to the vendor, not yet roasted.
  custody('cu-4', 'sc-4', 'SC-2026-0004', 'dropship', 'p01', DROPSHIP_SOURCE, 'PR-CMP-2026-0077', 3, 0, 0),
  custody('cu-5', 'sc-4', 'SC-2026-0004', 'dropship', 'p02', DROPSHIP_SOURCE, 'PR-CMP-2026-0077', 1, 0, 0),
  custody('cu-6', 'sc-4', 'SC-2026-0004', 'dropship', 'p05', DROPSHIP_SOURCE, 'PR-CMP-2026-0077', 1, 0, 0),
  // SC-2026-0005 — transferred out, vendor has not started (this is the overdue one).
  custody('cu-7', 'sc-5', 'SC-2026-0005', 'resupply', 'p01', RESUPPLY_SOURCE, 'WT-2026-0032', 4, 0, 0),
  custody('cu-8', 'sc-5', 'SC-2026-0005', 'resupply', 'p02', RESUPPLY_SOURCE, 'WT-2026-0032', 2, 0, 0),
]

/** Outstanding balance still in the vendor's custody. */
export function custodyBalance(line: SubconCustodyLine): number {
  return line.sentQty - line.consumedQty - line.returnedQty
}

// ── Derived figures ───────────────────────────────────────────────────────────

/** Orders not yet closed — everything still moving through the chain. */
export function ordersInFlight(): SubconOrder[] {
  return subconOrders.filter(o => o.stage < 5)
}

export function methodBreakdown(orders: SubconOrder[]): string {
  const counts: Record<SubconMethod, number> = { basic: 0, resupply: 0, dropship: 0 }
  for (const o of orders) counts[o.method]++
  return (Object.keys(counts) as SubconMethod[])
    .filter(m => counts[m] > 0)
    .map(m => `${counts[m]} ${SUBCON_METHOD_LABEL[m]}`)
    .join(' · ')
}

export function overdueOrders(): SubconOrder[] {
  return subconOrders.filter(o => o.lateDays > 0)
}

export function pendingApprovalOrders(): SubconOrder[] {
  return subconOrders.filter(o => o.status === 'pending approval')
}

export function needsAttentionOrders(): SubconOrder[] {
  return subconOrders.filter(o => o.needsAttention)
}

/** Total IDR value of company stock currently held at vendors. */
export function custodyValueTotal(): number {
  return subconCustody.reduce((sum, l) => sum + l.balanceValue, 0)
}

/** Today, as the dashboard reckons it — keeps late-day maths deterministic. */
export const SUBCON_TODAY = TODAY_ISO
