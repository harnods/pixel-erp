import { CATALOG } from './catalog'

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
  | 'purchaseOrder' // the PR, approved and ordered from the vendor
  | 'componentOrder'    // Dropship: the order placed with the 3rd party for raw material
  | 'componentDelivery' // Dropship: the 3rd party's delivery of raw material to the vendor
  | 'purchaseDelivery' // a raised delivery document — raw material only (R17), never the vendor's work
  | 'purchaseInvoice'  // the vendor's bill for the subcon work, raised against the PO
  | 'componentIssue'   // stock adjustment OUT — components issued into the vendor's process
  | 'receipt'       // goods receipt back from the vendor

export interface SubconDocStep {
  kind: SubconDocKind
  /** Short document-type tag. With the "What it does" column gone from the work
   *  order's Documents table, this is what tells the three purchase documents
   *  apart at a glance. */
  tag: 'PR' | 'PO' | 'PD' | 'PI' | 'SA' | 'Transfer' | 'Receipt'
  title: string
  /** One line explaining what this document does in the chain. */
  detail: string
  /** Which module the document lives in — drives the breadcrumb and deep link. */
  module: 'Purchases' | 'Warehouse'
}

/**
 * The document type spelled out. The short tag is the chip in a cramped cell;
 * this is what a Type column says, where there is room to name the transaction
 * rather than make the reader expand an abbreviation.
 */
export const SUBCON_DOC_TYPE_LABEL: Record<SubconDocStep['tag'], string> = {
  PR: 'Purchase Request',
  PO: 'Purchase Order',
  PD: 'Purchase Delivery',
  PI: 'Purchase Invoice',
  SA: 'Stock Adjustment',
  Transfer: 'Warehouse Transfer',
  Receipt: 'Goods Receipt',
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
  purchaseOrder: {
    tag: 'PO', module: 'Purchases',
    title: 'Purchase order',
    detail: 'Raised from the subcon purchase request — the order placed with the vendor',
  },
  componentOrder: {
    tag: 'PO', module: 'Purchases',
    title: 'Component purchase order',
    detail: 'Raised from the component request — the raw material ordered from the 3rd party',
  },
  componentDelivery: {
    tag: 'PD', module: 'Purchases',
    title: 'Component purchase delivery',
    detail: 'The 3rd party delivers the raw material to the subcon vendor — confirms it arrived',
  },
  purchaseDelivery: {
    tag: 'PD', module: 'Purchases',
    title: 'Purchase delivery',
    detail: 'A delivery of raw material to the subcon vendor (Dropship only)',
  },
  purchaseInvoice: {
    tag: 'PI', module: 'Purchases',
    title: 'Purchase invoice',
    detail: "The vendor's bill for the subcon work, raised once the order is closed",
  },
  componentIssue: {
    tag: 'SA', module: 'Warehouse',
    title: 'Component stock issue',
    detail: 'Components issued out of the subcon warehouse when the work order starts',
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
    // Supply first: the vendor cannot start without materials, and the service
    // request is for work on materials that are already there.
    if (method === 'dropship') kinds.push('componentPr', 'componentOrder', 'componentDelivery')
    if (method === 'resupply') kinds.push('transfer')
    kinds.push('subconPr')
  } else {
    if (split === 'partial') kinds.push('purchasePr')
    if (method === 'dropship') kinds.push('rawPr', 'componentOrder', 'componentDelivery')
    if (method === 'resupply') kinds.push('rawTransfer')
    kinds.push('processPr')
  }
  // Starting the order issues the components into the vendor's process — a stock
  // adjustment OUT of the subcon warehouse. A `basic` order has none: the vendor
  // works from its own stock, so there is no company inventory to issue.
  if (method !== 'basic') kinds.push('componentIssue')

  // The service PR does not end the chain: it is ordered (PO), the run is started
  // and recorded (partial production / completion), and the vendor bills for it
  // (PI). There is NO purchase delivery for the vendor's work, on any method
  // (R17) — output comes from partial records or completion (R5). The only
  // delivery in the feature is Dropship's raw material, planned above.
  kinds.push('purchaseOrder', 'purchaseInvoice')

  return kinds.map(kind => ({ kind, ...DOC_STEPS[kind] }))
}

// ── Document prefill ──────────────────────────────────────────────────────────

/**
 * What the subcon flow hands a create form so it opens already filled in.
 *
 * Starting a subcon work order means raising documents in OTHER modules — a
 * purchase request, a warehouse transfer. Those forms are shared with the rest of
 * the ERP, so rather than special-casing them, the work order passes everything
 * they need as one `?subcon=` query param and each form decodes this shape.
 *
 * Lines carry their own name/unit/cost rather than a bare SKU on purpose: not
 * every line resolves through the stocked product list — a subcon fee is a
 * non-track service, and the apparel components live outside `CATALOG` (see
 * catalog.ts) — so a SKU lookup would come back empty for exactly the lines this
 * flow cares about.
 */
export interface SubconPrefillLine {
  name: string
  sku: string
  qty: number
  unit: string
  unitCost: number
  /** A service line — carries cost, never stock. */
  nonTrack?: boolean
  /** The work order cost line this line charges (R11) — what the request covers. */
  lineId?: string
  /**
   * The batches the work order reserved for this component, carried onto the
   * document so a batch-tracked component is not picked twice (R15).
   */
  batches?: { batchNo: string; qty: number }[]
  /**
   * Most that may still be moved for this line — the work order's outstanding
   * quantity (needed minus already sent). The form validates against it, so a
   * second transfer cannot over-send what the order actually requires.
   */
  maxQty?: number
}

export interface SubconDocPrefill {
  kind: SubconDocKind
  workOrderId: string
  workOrderNumber: string
  bomNumber: string
  vendorName: string
  /** ISO date the vendor promised the goods back. */
  requiredDate: string
  /** Warehouse the transfer draws from — resupply only. */
  originWarehouseId?: string
  originWarehouseName?: string
  receivingWarehouseId: string
  receivingWarehouseName: string
  /** Where a transfer is addressed — the subcon vendor's own location. */
  destinationWarehouseId?: string
  destinationWarehouseName?: string
  lines: SubconPrefillLine[]
  memo: string
}

/** Encode a prefill for a router `query` — one param, so links stay readable.
 *  No manual URI-encoding: vue-router encodes query values itself, and doing it
 *  here too produced double-escaped (`%257B`) URLs. */
export function encodeSubconPrefill(p: SubconDocPrefill): string {
  return JSON.stringify(p)
}

/** Decode a `?subcon=` param. Returns null for anything malformed — a bad link
 *  should open an empty form, never crash it. */
export function decodeSubconPrefill(raw: unknown): SubconDocPrefill | null {
  if (typeof raw !== 'string' || !raw) return null
  const attempt = (text: string): SubconDocPrefill | null => {
    try {
      const parsed = JSON.parse(text) as SubconDocPrefill
      return parsed && Array.isArray(parsed.lines) ? parsed : null
    } catch {
      return null
    }
  }
  // Tolerate a still-encoded value, so older links keep working.
  return attempt(raw) ?? attempt(decodeURIComponent(raw))
}

/**
 * Documents raised from their own parent document, not from the work order: the
 * goods receipt comes on the vendor's return, the purchase order from the
 * purchase request, and the delivery from that order. The work order lists them
 * but never offers a Create button for them.
 */
export const RAISED_ELSEWHERE: SubconDocKind[] = [
  'purchaseOrder', 'componentOrder', 'componentDelivery', 'purchaseDelivery', 'purchaseInvoice',
  // Posted by starting the work order, not chosen from a Create menu.
  'componentIssue',
]

/**
 * The document that puts components into the vendor's hands. Exactly one of
 * these appears in any plan (none on `basic`, where the vendor uses its own
 * stock), and it must be raised BEFORE the work order starts: the vendor cannot
 * begin without materials, and the subcon service request is for work done on
 * materials that are already there.
 */
const COMPONENT_SUPPLY: SubconDocKind[] = ['transfer', 'rawTransfer', 'componentPr', 'rawPr']

export function isComponentSupply(kind: SubconDocKind): boolean {
  return COMPONENT_SUPPLY.includes(kind)
}

/** The plan's component-supply step, if this configuration has one. */
export function componentSupplyStep(
  scope: SubconScope,
  split: SubconSplit,
  method: SubconMethod,
): SubconDocStep | undefined {
  return buildDocumentPlan(scope, split, method).find(d => isComponentSupply(d.kind))
}

/**
 * The component-supply purchase requests — material bought from a 3rd-party
 * vendor and shipped STRAIGHT to the subcon vendor, which is named as consignee
 * (CID). These only ever appear in a `dropship` plan.
 *
 * They are the one case where a purchase request does not deliver into a company
 * warehouse: the goods never touch our sites, so the request is addressed to the
 * subcon vendor's warehouse — the "Transfer components to" location on the work
 * order's subcon setup.
 */
const SHIPPED_TO_VENDOR: SubconDocKind[] = ['componentPr', 'rawPr']

/**
 * Cap each transfer line at the stock the origin warehouse actually holds.
 *
 * A work order says what it NEEDS; the origin says what can leave it. Prefilling
 * the need alone produced a form that could never be saved — the transfer form
 * refuses any line over available stock — while showing a negative
 * after-transfer figure, so the operator was told the quantity was wrong without
 * being given one that was right.
 *
 * Lines are reduced, never dropped: a line with nothing available stays at zero
 * so the operator can see it was asked for. `shortfalls` reports what could not
 * be met, so the gap is stated rather than silently absorbed — the work order
 * still needs the balance, and a later transfer can carry it.
 */
export function capLinesToAvailable<T extends { sku: string; qty: number }>(
  lines: readonly T[],
  availableFor: (sku: string) => number,
): { lines: T[]; shortfalls: { sku: string; asked: number; capped: number }[] } {
  const shortfalls: { sku: string; asked: number; capped: number }[] = []
  const capped = lines.map((line) => {
    const available = Math.max(0, availableFor(line.sku))
    const qty = Math.min(line.qty, available)
    if (qty < line.qty) shortfalls.push({ sku: line.sku, asked: line.qty, capped: qty })
    return { ...line, qty }
  })
  return { lines: capped, shortfalls }
}

export function shipsToSubconVendor(kind: SubconDocKind): boolean {
  return SHIPPED_TO_VENDOR.includes(kind)
}

/** Which documents a work order can raise the moment it starts. The goods
 *  receipt is deliberately excluded — it is raised when the vendor returns the
 *  goods, not when the order begins. */
export function raisableDocuments(
  scope: SubconScope,
  split: SubconSplit,
  method: SubconMethod,
): SubconDocStep[] {
  return buildDocumentPlan(scope, split, method).filter(d => !RAISED_ELSEWHERE.includes(d.kind))
}

// ── Subcon vendors ────────────────────────────────────────────────────────────

/**
 * Partner roasteries that take subcon work, plus the 3rd-party bean supplier used
 * by the dropship model. Kept here rather than in `contacts.ts` because the
 * contacts store is snapshot-persisted — appending seeds there would not reach
 * anyone whose snapshot predates this feature.
 */
/**
 * How the agreed price relates to withholding tax.
 *  • `gross` — the price already contains the tax we withhold.
 *  • `net`   — the vendor must receive the agreed price in full, so the price is
 *              grossed up before the tax is deducted.
 * It changes who BEARS the withholding, never whether it exists.
 */
export type SubconPriceBasis = 'gross' | 'net'

export interface SubconVendor {
  id: string
  name: string
  /** Street address — shown as the CID consignee on a dropship PR. */
  address: string
  /** `subcon` takes the process work; `supplier` only sells components. */
  role: 'subcon' | 'supplier'
  /**
   * Whether the vendor is NPWP-registered. Drives the PPh 23 rate on toll
   * manufacturing — 2% with, 4% without — and is never entered as a rate.
   */
  hasNpwp: boolean
  /** How this vendor normally agrees prices. A purchase order may override it. */
  defaultPriceBasis: SubconPriceBasis
  /**
   * The vendor's own location, as a warehouse the transfer can be addressed to.
   * Stock sent here is in the vendor's custody but still on the company's books —
   * it is NOT one of the company's own warehouses, which is why these live here
   * and not in `warehouses.ts`: every seeded transfer, task and stock figure
   * picks from that array modulo its length, so adding to it would reshuffle
   * data those seeds were tuned against.
   */
  warehouseId?: string
  warehouseName?: string
}

export const SUBCON_VENDORS: readonly SubconVendor[] = [
  { id: 'sv-01', name: 'PT Roastery Nusantara Mandiri', address: 'Jl. Industri Raya No. 8, Bandung',      role: 'subcon', hasNpwp: true, defaultPriceBasis: 'net',
    warehouseId: 'wh-sub-01', warehouseName: 'WH Subcon · PT Roastery Nusantara Mandiri' },
  { id: 'sv-02', name: 'CV Kopi Sangrai Sejahtera',     address: 'Jl. Kaligawe Km 5, Semarang',           role: 'subcon', hasNpwp: true, defaultPriceBasis: 'gross',
    warehouseId: 'wh-sub-02', warehouseName: 'WH Subcon · CV Kopi Sangrai Sejahtera' },
  { id: 'sv-03', name: 'PT Java Roasting Works',        address: 'Jl. Rungkut Industri III/22, Surabaya', role: 'subcon', hasNpwp: true, defaultPriceBasis: 'gross',
    warehouseId: 'wh-sub-03', warehouseName: 'WH Subcon · PT Java Roasting Works' },
  { id: 'sv-04', name: 'UD Karya Sangrai Utama',        address: 'Jl. Raya Bogor Km 32, Bogor',           role: 'subcon', hasNpwp: false, defaultPriceBasis: 'net',
    warehouseId: 'wh-sub-04', warehouseName: 'WH Subcon · UD Karya Sangrai Utama' },
  { id: 'sv-05', name: 'CV Sumber Biji Nusantara',      address: 'Jl. Soekarno Hatta No. 114, Medan',     role: 'supplier', hasNpwp: true, defaultPriceBasis: 'gross' },
  // ── Apparel line — konveksi partners for the garment scenario ──
  { id: 'sv-06', name: 'PT Mitra Jaya Konveksi',       address: 'Jl. Industri Raya No. 8, Bandung',       role: 'subcon', hasNpwp: true, defaultPriceBasis: 'net',
    warehouseId: 'wh-sub-06', warehouseName: 'WH Subcon · PT Mitra Jaya Konveksi' },
  { id: 'sv-07', name: 'CV Garmen Sejahtera',          address: 'Jl. Cibaduyut Raya No. 45, Bandung',     role: 'subcon', hasNpwp: false, defaultPriceBasis: 'gross',
    warehouseId: 'wh-sub-07', warehouseName: 'WH Subcon · CV Garmen Sejahtera' },
  { id: 'sv-08', name: 'CV Sumber Kain Tekstil',       address: 'Jl. Otista No. 210, Bandung',            role: 'supplier', hasNpwp: true, defaultPriceBasis: 'gross' },
]

/** Vendor locations a transfer can be addressed to, for a destination picker. */
export const SUBCON_VENDOR_WAREHOUSES: readonly { id: string; name: string; vendorId: string }[] =
  SUBCON_VENDORS
    .filter(v => !!v.warehouseId)
    .map(v => ({ id: v.warehouseId!, name: v.warehouseName!, vendorId: v.id }))

export function subconVendorWarehouse(vendorId: string) {
  return SUBCON_VENDORS.find(v => v.id === vendorId)
}

/** Resolve a warehouse name for an id that may be a company OR a vendor warehouse. */
export function subconWarehouseName(id: string): string {
  return SUBCON_VENDOR_WAREHOUSES.find(w => w.id === id)?.name ?? ''
}

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
  /**
   * The unit this service is measured in — what a subcon cost line's Unit column
   * shows, and what the purchase request is raised in.
   *
   * Taken from the product rather than chosen per line: the same service is
   * always quoted the same way, and a line free to disagree with its product is
   * a line that will.
   */
  unit: string
  /** Indicative price for one reference batch, IDR. */
  defaultPrice: number
}

export const SUBCON_SERVICE_PRODUCTS: readonly SubconServiceProduct[] = [
  {
    id: 'svc-roast-pack', name: 'Roasting & packing service', sku: 'SVC-RST-01',
    productType: 'single-not-tracked', accountMapping: 'Work in process',
    defaultCostDriver: 'Unit', defaultPrice: 25_000_000,
    unit: 'Pcs',
  },
  {
    id: 'svc-roast', name: 'Roasting service', sku: 'SVC-RST-02',
    productType: 'single-not-tracked', accountMapping: 'Work in process',
    defaultCostDriver: 'Unit', defaultPrice: 12_000_000,
    unit: 'Kg',
  },
  {
    id: 'svc-handling', name: 'Subcon handling & freight', sku: 'SVC-FRT-01',
    productType: 'single-not-tracked', accountMapping: 'Work in process',
    defaultCostDriver: 'Amount', defaultPrice: 1_500_000,
    unit: 'Shipment',
  },
  {
    id: 'svc-qc', name: 'Subcon quality inspection', sku: 'SVC-QC-01',
    productType: 'single-not-tracked', accountMapping: 'Work in process',
    defaultCostDriver: 'Batch', defaultPrice: 750_000,
    unit: 'Batch',
  },
  {
    id: 'svc-blend', name: 'Blending & cupping service', sku: 'SVC-BLD-01',
    productType: 'single-not-tracked', accountMapping: 'Work in process',
    defaultCostDriver: 'Batch', defaultPrice: 2_000_000,
    unit: 'Batch',
  },
  // ── Apparel line (cut-make-trim) — the garment subcontracting scenario ──
  {
    id: 'svc-sew', name: 'Jahit & assembly', sku: 'SVC-JHT-01',
    productType: 'single-not-tracked', accountMapping: 'Work in process',
    defaultCostDriver: 'Unit', defaultPrice: 12_500_000,
    unit: 'Pcs',
  },
  {
    id: 'svc-print-dye', name: 'Printing & pewarnaan', sku: 'SVC-PRT-01',
    productType: 'single-not-tracked', accountMapping: 'Work in process',
    defaultCostDriver: 'Unit', defaultPrice: 4_000_000,
    unit: 'Pcs',
  },
  // ── Furniture line (cut-assemble-finish) — the office-desk scenario ──
  {
    id: 'svc-woodwork', name: 'Potong & perakitan kayu', sku: 'SVC-KYU-01',
    productType: 'single-not-tracked', accountMapping: 'Work in process',
    defaultCostDriver: 'Unit', defaultPrice: 36_000_000,
    unit: 'Pcs',
  },
  {
    id: 'svc-finishing', name: 'Finishing & pengecatan', sku: 'SVC-FNS-01',
    productType: 'single-not-tracked', accountMapping: 'Work in process',
    defaultCostDriver: 'Unit', defaultPrice: 18_000_000,
    unit: 'Pcs',
  },
]

export function subconServiceProduct(id: string): SubconServiceProduct | undefined {
  return SUBCON_SERVICE_PRODUCTS.find(p => p.id === id)
}

/**
 * Where a subcon charge lands when nothing more specific says otherwise.
 *
 * The vendor's work capitalises into the goods, which is what the accounting
 * rules already post (`Dr wip / Cr subconAccrual`) — so a charge with no product
 * behind it, and a derived one like the withholding gross-up, map here too.
 */
export const SUBCON_DEFAULT_ACCOUNT_MAPPING = 'Work in process'

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



/** Request kinds that buy raw material rather than the vendor's work. */
const COMPONENT_THREAD_KINDS = ['componentPr', 'rawPr']

/**
 * Whether a raised document satisfies a planned step. Raised documents keep the
 * plain kinds of the stores they live in (`purchaseOrder`, `purchaseDelivery`), so
 * the two Dropship threads are told apart by the request each one grew out of
 * (`fromKind`): a component order and its delivery belong to the raw-material
 * thread, every other order to the vendor's work.
 */
export function docMatchesStep(
  doc: { kind: string; fromKind?: string },
  stepKind: SubconDocKind,
): boolean {
  const fromComponent = !!doc.fromKind && COMPONENT_THREAD_KINDS.includes(doc.fromKind)
  switch (stepKind) {
    case 'componentOrder': return doc.kind === 'purchaseOrder' && fromComponent
    case 'componentDelivery': return doc.kind === 'purchaseDelivery'
    case 'purchaseOrder': return doc.kind === 'purchaseOrder' && !fromComponent
    default: return doc.kind === stepKind
  }
}


// ── Adjusting a work order (R7) ───────────────────────────────────────────────

/** One recorded change: the figure before, the figure after, and why. */
export interface SubconAdjustmentRecord {
  field: 'output' | 'component' | 'cost'
  /** The component SKU, or the cost line's id. */
  key?: string
  from: number
  to: number
  reason: string
  date: string
}

export type SubconAdjustmentIssue =
  | { kind: 'output-lower'; current: number }
  | { kind: 'component-lower'; sku: string; name: string; unit: string; current: number }
  | { kind: 'reason-missing' }

/**
 * The rules for an adjustment, as a pure function so the form and the store apply
 * the same ones.
 *
 * R7 — planned output and component quantities can only INCREASE, and every
 * adjustment carries a reason. A lower figure is refused, naming the current
 * value; nothing here ever reduces a quantity, so there is no shortfall to write
 * off (I7). `changes` lists what actually moved, so a form with nothing changed
 * is not asked for a reason.
 */
export function evaluateSubconAdjustment(args: {
  currentOutput: number
  newOutput: number
  components: { sku: string; name: string; unit: string; current: number; next: number }[]
  /** Anything else the form changes — a revised or an added cost line. */
  otherChanges?: number
  reason: string
}): { issues: SubconAdjustmentIssue[]; changes: Pick<SubconAdjustmentRecord, 'field' | 'key' | 'from' | 'to'>[] } {
  const issues: SubconAdjustmentIssue[] = []
  const changes: Pick<SubconAdjustmentRecord, 'field' | 'key' | 'from' | 'to'>[] = []

  if (args.newOutput < args.currentOutput) {
    issues.push({ kind: 'output-lower', current: args.currentOutput })
  } else if (args.newOutput > args.currentOutput) {
    changes.push({ field: 'output', from: args.currentOutput, to: args.newOutput })
  }

  for (const c of args.components) {
    if (c.next < c.current) {
      issues.push({ kind: 'component-lower', sku: c.sku, name: c.name, unit: c.unit, current: c.current })
    } else if (c.next > c.current) {
      changes.push({ field: 'component', key: c.sku, from: c.current, to: c.next })
    }
  }

  if ((changes.length || (args.otherChanges ?? 0) > 0) && !args.reason.trim()) {
    issues.push({ kind: 'reason-missing' })
  }
  return { issues, changes }
}


// ── Batch carry-through (R15) ─────────────────────────────────────────────────

/**
 * The part of a work order's batch reservation one document should carry.
 *
 * The reservation is taken in its own order (the order it was picked in). What
 * earlier documents already sent is skipped first, so a second transfer carries
 * the batches still due rather than re-sending the first ones; then `take` units
 * are allocated. A reservation smaller than the document's quantity simply runs
 * out — the rest is left for the form to pick.
 */
export function allocateReservedBatches(
  selection: { batchNo: string; qty: number }[],
  alreadySent: number,
  take: number,
): { batchNo: string; qty: number }[] {
  let skip = Math.max(0, alreadySent)
  let left = Math.max(0, take)
  const out: { batchNo: string; qty: number }[] = []
  for (const b of selection) {
    if (left <= 0) break
    let avail = b.qty
    const skipped = Math.min(skip, avail)
    avail -= skipped
    skip -= skipped
    const qty = Math.min(avail, left)
    if (qty > 0) {
      out.push({ batchNo: b.batchNo, qty })
      left -= qty
    }
  }
  return out
}


// ── One invoice, several orders (R16) ─────────────────────────────────────────

/**
 * Whether a set of purchase orders may be billed on one invoice.
 *
 * R16 — an invoice may cover several orders from the SAME work order (the
 * original service order and one raised for a charge added later, say). Orders
 * from different work orders — or a subcon order mixed with one that belongs to
 * no work order — cannot be combined: the invoice would carry cost into two runs,
 * or into a run and outside it, at once.
 */
export function checkInvoiceSources(
  purchaseOrderIds: string[],
  workOrderOf: (purchaseOrderId: string) => string | undefined,
): { ok: true; workOrderId?: string } | { ok: false } {
  const owners = new Set(purchaseOrderIds.map(id => workOrderOf(id) ?? ''))
  if (owners.size > 1) return { ok: false }
  const only = [...owners][0]
  return { ok: true, ...(only ? { workOrderId: only } : {}) }
}
