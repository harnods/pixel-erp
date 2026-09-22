/**
 * Dual Unit Inventory (DUI) — the data behind Reports › Inventory › Dual Unit
 * Inventory Report (PRD "Dual Unit Inventory", Story 14).
 *
 * A DUI product is tracked by Batch and carries a SECONDARY INVENTORY UNIT next to
 * its Base Unit (e.g. base `mm` + secondary `slab`, base `Sack` + secondary `kg`).
 * Every stock movement therefore mutates TWO quantities, and because each batch has
 * its own Unit Conversion + Tolerance the secondary quantity is NOT a pure function
 * of the base one — so a mutation stores both deltas explicitly. That is the whole
 * point of the feature; never re-derive `secondaryDelta` from `baseDelta`.
 *
 * Two seed sources, deliberately:
 *
 *  1. The steel products (Carbon Steel, Copper) reproduce the agreed export template
 *     number-for-number — same batches, same mutations, same closing totals and
 *     valuation — so the web report can be diffed against the spreadsheet.
 *  2. The coffee products (SKU 1001/1002) are real catalog products: their batches,
 *     expiry dates and base-unit ledger come from `getProductBatches()` /
 *     `getBatchTransactions()`, so their numbers agree with Product details and
 *     Batch details instead of being a second, drifting set. Their ledger is dated
 *     January 2026 (that is what those pages show), so under a recent date range
 *     they legitimately render as opening balance + closing line only.
 *
 * `dualUnitReportGroups()` is a pure derivation over this seed: the beginning-balance
 * line is COMPUTED from the filter (stock as of the day before `from`), never seeded,
 * so the report stays honest for any range the user picks.
 */
import { productBySku } from './inventory'
import { getProductBatches, getBatchTransactions } from './productDetails'

// ── Model ───────────────────────────────────────────────────────────────────────
export interface DuiMutation {
  /** ISO `yyyy-mm-dd` — the transaction date the report filters on. */
  date: string
  /** Transaction type as shown in the Transaction column (e.g. "Stock adjustment"). */
  type: string
  baseDelta: number
  secondaryDelta: number
}

export interface DuiBatch {
  batchNo: string
  /** The warehouse holding this batch. Stock is warehouse-scoped, so the report's
   *  warehouse filter includes or excludes a whole batch — filtering individual
   *  mutations would leave an opening balance that belongs to nowhere. */
  warehouseId: string
  /** ISO date, or '' for a batch with no expiry recorded. */
  expiryDate: string
  /** Secondary units per ONE base unit — `1 slab = 1000 mm` → 0.001, `1 Sack = 60 kg` → 60. */
  secondaryPerBase: number
  /** Unit Conversion label, written the way the batch reads it (`1 slab = 1000 mm`).
   *  '' when no conversion is set on the batch — the report then shows "—". */
  conversionLabel: string
  /** Batch-level Tolerance in percent, or null when none is set. */
  tolerancePct: number | null
  /** Stock held by this batch BEFORE the first mutation below. */
  openingBase: number
  openingSecondary: number
  mutations: DuiMutation[]
}

export interface DuiProduct {
  sku: string
  name: string
  baseUnit: string
  secondaryUnit: string
  /** Moving-average cost per BASE unit, IDR. The secondary unit is never costed. */
  averageCost: number
  batches: DuiBatch[]
}

// ── Steel seed — verbatim from the export template ──────────────────────────────
// Opening stock sits before the template's 1–5 June window, which is what makes its
// "Beginning balance / 1-Jun-2026 / 10,000 mm" line reproduce exactly.
const STEEL_PRODUCTS: DuiProduct[] = [
  {
    sku: 'CS-1000',
    name: 'Carbon Steel uk. 1000x5x2 mm',
    baseUnit: 'mm',
    secondaryUnit: 'slab',
    averageCost: 250_000,
    batches: [
      {
        batchNo: 'BATCH_CS_1',
        warehouseId: 'wh-001',
        expiryDate: '2026-12-30',
        secondaryPerBase: 1 / 1000,
        conversionLabel: '1 slab = 1000 mm',
        tolerancePct: 10,
        openingBase: 10_000,
        openingSecondary: 10,
        mutations: [
          { date: '2026-06-01', type: 'Stock adjustment', baseDelta: -2_000, secondaryDelta: -2 },
          { date: '2026-06-02', type: 'Stock adjustment', baseDelta: -3_012, secondaryDelta: -3 },
          { date: '2026-06-03', type: 'Purchase delivery', baseDelta: 5_000, secondaryDelta: 5 },
        ],
      },
      {
        batchNo: 'BATCH_CS_2',
        warehouseId: 'wh-002',
        expiryDate: '2027-01-12',
        secondaryPerBase: 1 / 1100,
        conversionLabel: '1 slab = 1100 mm',
        tolerancePct: 5,
        openingBase: 1_100,
        openingSecondary: 1,
        mutations: [
          { date: '2026-06-02', type: 'Stock adjustment', baseDelta: 2_204, secondaryDelta: 2 },
        ],
      },
      {
        batchNo: 'BATCH_CS_3',
        warehouseId: 'wh-001',
        expiryDate: '2027-03-04',
        secondaryPerBase: 1 / 3,
        conversionLabel: '1 slab = 3 mm',
        tolerancePct: null,
        openingBase: 150,
        openingSecondary: 50,
        mutations: [],
      },
    ],
  },
  {
    sku: 'CP-500',
    name: 'Copper uk. 500x5x2 mm',
    baseUnit: 'mm',
    secondaryUnit: 'slab',
    averageCost: 271_975,
    batches: [
      {
        batchNo: 'BATCH_CP_1',
        warehouseId: 'wh-001',
        expiryDate: '2027-02-18',
        secondaryPerBase: 1 / 1000,
        conversionLabel: '1 slab = 1000 mm',
        tolerancePct: 10,
        openingBase: 5_000,
        openingSecondary: 5,
        mutations: [
          { date: '2026-06-01', type: 'Stock adjustment', baseDelta: -3_000, secondaryDelta: -3 },
          { date: '2026-06-02', type: 'Stock adjustment', baseDelta: -1_005, secondaryDelta: -1 },
          { date: '2026-06-03', type: 'Purchase delivery', baseDelta: 5_000, secondaryDelta: 5 },
        ],
      },
      {
        batchNo: 'BATCH_CP_2',
        warehouseId: 'wh-003',
        expiryDate: '2026-11-22',
        secondaryPerBase: 1 / 5,
        conversionLabel: '1 slab = 5 mm',
        tolerancePct: 5,
        openingBase: 500,
        openingSecondary: 100,
        mutations: [
          { date: '2026-06-02', type: 'Stock adjustment', baseDelta: -35, secondaryDelta: -7 },
        ],
      },
    ],
  },
]

// ── Coffee seed — real catalog products given a secondary inventory unit ─────────
// Green beans are stocked by the 60 kg jute Sack, so `kg` is the natural secondary
// inventory unit and per-batch conversion variance (a sack is never exactly 60 kg) is
// exactly what batch-level Unit Conversion + Tolerance exist for.
const COFFEE_DUI: { sku: string; secondaryUnit: string; kgPerSack: number[]; tolerancePct: (number | null)[] }[] = [
  { sku: '1001', secondaryUnit: 'kg', kgPerSack: [60, 58.5, 61], tolerancePct: [5, 5, null] },
  { sku: '1002', secondaryUnit: 'kg', kgPerSack: [60, 59], tolerancePct: [10, 10] },
]

/** Map one catalog product's batches + batch ledgers onto the DUI model. */
function buildCoffeeDuiProduct(cfg: (typeof COFFEE_DUI)[number]): DuiProduct | null {
  const product = productBySku(cfg.sku)
  const batches = getProductBatches(cfg.sku)
  if (!product || batches.length === 0) return null

  const duiBatches: DuiBatch[] = batches.map((b, i) => {
    const secondaryPerBase = cfg.kgPerSack[i % cfg.kgPerSack.length]!
    const ledger = getBatchTransactions(cfg.sku, b.batchNo)
    const mutations: DuiMutation[] = ledger.map((tx) => ({
      date: tx.date,
      type: tx.type,
      baseDelta: tx.delta,
      secondaryDelta: round2(tx.delta * secondaryPerBase),
    }))
    // Walk back from the batch's CURRENT on-hand so the last running value equals what
    // Product details / Batch details show for this batch.
    const movedBase = mutations.reduce((sum, m) => sum + m.baseDelta, 0)
    const openingBase = b.onHand - movedBase
    return {
      batchNo: b.batchNo,
      // `getProductBatches` aggregates a batch across every warehouse holding it, so
      // there is no single owner — attribute it to the first active warehouse.
      warehouseId: 'wh-001',
      expiryDate: b.expiryDate,
      secondaryPerBase,
      conversionLabel: `1 ${product.unit} = ${formatConversion(secondaryPerBase)} ${cfg.secondaryUnit}`,
      tolerancePct: cfg.tolerancePct[i % cfg.tolerancePct.length] ?? null,
      openingBase,
      openingSecondary: round2(openingBase * secondaryPerBase),
      mutations,
    }
  })

  return {
    sku: product.sku,
    name: product.name,
    baseUnit: product.unit,
    secondaryUnit: cfg.secondaryUnit,
    averageCost: product.averageCost,
    batches: duiBatches,
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
// The conversion label is read by a human next to id-ID-formatted quantities, so it
// uses the same locale ("1 Sack = 58,5 kg", never "58.5").
const conversionFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 })
function formatConversion(n: number): string {
  return conversionFormat.format(round2(n))
}

/** Every product using a Secondary Inventory Unit. Empty ⇒ the report renders its
 *  "feature available, nobody using it" empty state (Story 14). */
export const DUI_PRODUCTS: DuiProduct[] = [
  ...STEEL_PRODUCTS,
  ...COFFEE_DUI.map(buildCoffeeDuiProduct).filter((p): p is DuiProduct => p !== null),
]

// ── Report derivation ───────────────────────────────────────────────────────────
export interface DuiReportFilter {
  /** Inclusive ISO range. Both ends are always set — the report has no "all time". */
  from: string
  to: string
  /** Empty = every warehouse. */
  warehouseIds: string[]
  search: string
}

export interface DuiReportRow {
  transaction: string
  /** ISO date. The beginning-balance row is dated at the range start. */
  date: string
  baseDelta: number
  baseStock: number
  secondaryDelta: number
  secondaryStock: number
}

export interface DuiReportBatch {
  batchNo: string
  /** '' when the batch has no Unit Conversion set. */
  conversionLabel: string
  /** ISO date, '' when none. */
  expiryDate: string
  tolerancePct: number | null
  rows: DuiReportRow[]
  /** Stock at the end of the filtered range, in both units. The report's batch line
   *  shows these so the batch's own stock is readable without scanning down to its
   *  last mutation row. */
  endingBase: number
  endingSecondary: number
}

export interface DuiReportGroup {
  sku: string
  name: string
  baseUnit: string
  secondaryUnit: string
  batches: DuiReportBatch[]
  /** Closing line — on-hand at the end of the range, in both units. */
  endingBase: number
  endingSecondary: number
  averageCost: number
  /** endingBase × averageCost. The secondary unit is never costed (PRD Story 7). */
  value: number
}

function matchesSearch(p: DuiProduct, q: string): boolean {
  if (!q) return true
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  if (p.name.toLowerCase().includes(needle)) return true
  if (p.sku.toLowerCase().includes(needle)) return true
  return p.batches.some((b) => b.batchNo.toLowerCase().includes(needle))
}

/**
 * One group per DUI product, each expanding into its batches and their mutations
 * inside the filtered range, plus the product's closing totals.
 *
 * A batch that neither held stock before `from` nor moved inside the range is left
 * out entirely (it did not exist yet, as far as this range is concerned); a product
 * whose every batch drops out is left out too, which is what drives the report's
 * "no data found" state.
 */
export function dualUnitReportGroups(filter: DuiReportFilter): DuiReportGroup[] {
  const groups: DuiReportGroup[] = []

  for (const product of DUI_PRODUCTS) {
    if (!matchesSearch(product, filter.search)) continue

    const batches: DuiReportBatch[] = []
    let endingBase = 0
    let endingSecondary = 0

    for (const batch of product.batches) {
      if (filter.warehouseIds.length && !filter.warehouseIds.includes(batch.warehouseId)) continue
      // ISO yyyy-mm-dd sorts lexicographically, so plain string compare is safe.
      const ordered = [...batch.mutations].sort((a, b) => a.date.localeCompare(b.date))

      // Beginning balance = opening stock plus everything that happened before the range.
      let base = batch.openingBase
      let secondary = batch.openingSecondary
      for (const m of ordered) {
        if (m.date >= filter.from) break
        base += m.baseDelta
        secondary += m.secondaryDelta
      }
      const inRange = ordered.filter((m) => m.date >= filter.from && m.date <= filter.to)
      if (base === 0 && secondary === 0 && inRange.length === 0) continue

      const rows: DuiReportRow[] = [{
        transaction: 'Beginning balance',
        date: filter.from,
        baseDelta: base,
        baseStock: base,
        secondaryDelta: secondary,
        secondaryStock: secondary,
      }]
      for (const m of inRange) {
        base = round2(base + m.baseDelta)
        secondary = round2(secondary + m.secondaryDelta)
        rows.push({
          transaction: m.type,
          date: m.date,
          baseDelta: m.baseDelta,
          baseStock: base,
          secondaryDelta: m.secondaryDelta,
          secondaryStock: secondary,
        })
      }

      batches.push({
        batchNo: batch.batchNo,
        conversionLabel: batch.conversionLabel,
        expiryDate: batch.expiryDate,
        tolerancePct: batch.tolerancePct,
        rows,
        endingBase: base,
        endingSecondary: secondary,
      })
      endingBase = round2(endingBase + base)
      endingSecondary = round2(endingSecondary + secondary)
    }

    if (batches.length === 0) continue

    groups.push({
      sku: product.sku,
      name: product.name,
      baseUnit: product.baseUnit,
      secondaryUnit: product.secondaryUnit,
      batches,
      endingBase,
      endingSecondary,
      averageCost: product.averageCost,
      value: Math.round(endingBase * product.averageCost),
    })
  }

  return groups
}
