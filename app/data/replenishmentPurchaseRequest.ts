/**
 * Worklist → Purchase Request (PRD OD-007: US-020, US-021, US-022, US-023).
 *
 * ── The one rule this module exists to enforce ───────────────────────────────
 * Replenishment raises a REQUEST, never an order. Decision D11 moved the output
 * from a draft PO to a Jurnal Purchase Request: the inventory officer says what
 * is needed, and the purchasing role decides which requests become POs. US-023 is
 * a negative story about exactly this — "a data glitch can never place a real
 * order" — so there is no status flag here and no code path from this file to
 * `addPurchaseOrder`. The guarantee is structural, not configured.
 *
 * ── Why the quantity is NOT rounded here (decision D12) ──────────────────────
 * The PR carries the lead-time-adjusted demand-coverage NEED in STOCK units.
 * MOQ, pack size and purchase-UoM rounding are VENDOR terms, and a PR has no
 * bound vendor — purchasing may source it elsewhere entirely. Rounding to the
 * suggested vendor's pack here and again to the final vendor's pack at PO time
 * would round twice, the first time to the wrong pack. So the need travels
 * unrounded and US-009's rounding happens once, at PO time, against the vendor
 * who will actually ship it.
 *
 * ── Grouping ────────────────────────────────────────────────────────────────
 * By suggested vendor where one exists, per warehouse. Lines with no suggested
 * vendor are NOT skipped — they group into their own per-warehouse request for
 * purchasing to source (US-021 VR-01, US-022 AC-06). That is the substantive
 * difference from the old draft-PO flow, which had to skip them: a PO cannot
 * exist without a vendor, a PR can.
 */
import type {
  PurchaseRequest, PurchaseRequestLine, PurchaseRequestReplenishmentOrigin, UrgencyLevel,
} from './types'
import { addPurchaseRequest } from './purchaseRequests'
import { productBySku } from './inventory'
import { vendorItemFor, vendorNameFor, type VendorItem } from './vendorItems'
import { shiftDays } from './master'
import { currentRunNo } from './replenishmentRuns'
import { REPL_ASOF_ISO } from './replenishmentConfig'
import type { WorklistRow } from './replenishment'

const TAX_LABEL = 'PPN 11%'

/** Lines with no suggested vendor still form a request — this is their group key. */
export const UNSOURCED = '__unsourced__'

export interface PrLine {
  sku: string
  productName: string
  warehouseId: string
  /** null = purchasing sources it (US-022 AC-06). */
  vendorId: string | null
  vendorItem: VendorItem | null
  /** Engine recommendation in STOCK units, unrounded (D12). */
  recommendedQty: number
  /** What will be requested — user-editable (US-020 AC-02). */
  finalQty: number
  /** True once a human has typed over the recommendation (US-022 VR-03). */
  manuallyEdited: boolean
  unit: string
  unitCost: number
  availableQty: number
  context: {
    leadTimeDays: number
    leadTimeTier: string
    safetyDays: number
    coverageDays: number
    avgDailySales: number
    reorderPoint: number
    available: number
    onOrder: number
  }
}

export interface PrGroup {
  key: string
  /** null for the unsourced group. */
  vendorId: string | null
  vendorName: string
  warehouseId: string
  warehouseName: string
  lines: PrLine[]
  /** Indicative only — a PR is a request, not a priced commitment. */
  estimatedValue: number
  /** Longest lead time in the group — drives the "needed by" date. */
  leadTimeDays: number
}

export type PrSkipReason = 'needs-setup' | 'zero-qty' | 'not-tracked'

export interface PrSkippedLine {
  sku: string
  productName: string
  warehouseId: string
  warehouseName: string
  reason: PrSkipReason
}

export interface PrPlan {
  groups: PrGroup[]
  skipped: PrSkippedLine[]
  totals: {
    requestCount: number
    vendorCount: number
    lineCount: number
    skippedCount: number
    /** Lines going out with no suggested vendor for purchasing to source. */
    unsourcedCount: number
  }
}

export interface PrResult {
  created: {
    id: string
    number: number
    vendorId: string | null
    vendorName: string
    warehouseId: string
    lineCount: number
    requiredDate: string
  }[]
  skipped: PrSkippedLine[]
}

const SKIP_LABEL: Record<PrSkipReason, string> = {
  'needs-setup': 'Needs setup',
  'zero-qty': 'Nothing to request',
  'not-tracked': 'Not tracked',
}

export function prSkipReasonLabel(reason: PrSkipReason): string {
  return SKIP_LABEL[reason]
}

/**
 * The quantity a request carries: the engine's need in STOCK units.
 *
 * `suggestion.rawQty`, not `purchaseQty` — `rawQty` is the demand-coverage need
 * before any vendor's MOQ or pack multiple touched it, which is exactly what D12
 * says a PR should carry.
 */
export function requestedQtyFor(row: WorklistRow): number {
  return Math.max(0, row.suggestion.rawQty)
}

/**
 * Recompute the need for a DIFFERENT vendor (US-022 AC-02).
 *
 * Only lead time moves: demand, safety, coverage, available and on-order are
 * properties of the item and the warehouse, not of who supplies it (VR-01). A
 * slower vendor genuinely needs a bigger order, because more demand falls inside
 * the window before stock arrives.
 *
 * Returns the need in stock units, unrounded — pack terms are still a PO-time
 * concern even though the vendor changed.
 */
export function recomputeQtyForVendor(row: WorklistRow, vendorId: string | null): number {
  const vi = vendorId ? vendorItemFor(row.sku, vendorId) : null
  const leadDays = vi?.leadTimeDays ?? row.leadTimeDays
  const target = row.maxLevel !== null
    ? row.maxLevel
    : (leadDays + row.safetyDays + row.coverageDays) * row.velocity.avgDailySales
  return Math.max(0, Math.ceil(target - (row.atp.available + row.atp.onOrder)))
}

/**
 * Plan the requests for a selection — grouping, the skip list and the counts.
 *
 * Pure: creates nothing. The UI shows this for confirmation BEFORE committing so
 * "3 requests, 1 unsourced, 2 lines skipped" is a decision the user makes rather
 * than a surprise they read afterwards (US-021 EH-01).
 *
 * Keyed by `WorklistRow.key` throughout, so edited quantities and vendor swaps
 * can be passed without reshaping rows.
 */
export function planPurchaseRequests(
  rows: WorklistRow[],
  overrides: Record<string, number> = {},
  vendorChoices: Record<string, string | null> = {},
): PrPlan {
  const groups = new Map<string, Omit<PrGroup, 'estimatedValue' | 'leadTimeDays'>>()
  const skipped: PrSkippedLine[] = []

  for (const row of rows) {
    const base = {
      sku: row.sku,
      productName: row.productName,
      warehouseId: row.warehouseId,
      warehouseName: row.warehouseName,
    }

    // A row with no resolvable demand or lead time carries no number, so there is
    // nothing to request — it needs setup first (US-020 EH-02).
    if (row.bucket === 'needs-setup') { skipped.push({ ...base, reason: 'needs-setup' }); continue }
    if (row.bucket === 'not-tracked') { skipped.push({ ...base, reason: 'not-tracked' }); continue }

    const chosen = row.key in vendorChoices
      ? vendorChoices[row.key]!
      : row.vendorItem?.vendorId ?? null
    const vi = chosen ? vendorItemFor(row.sku, chosen) : null

    const recommendedQty = chosen && chosen !== row.vendorItem?.vendorId
      ? recomputeQtyForVendor(row, chosen)   // vendor swapped → re-size for its lead time
      : requestedQtyFor(row)
    const override = overrides[row.key]
    const finalQty = override ?? recommendedQty
    if (!finalQty || finalQty <= 0) { skipped.push({ ...base, reason: 'zero-qty' }); continue }

    // An unsourced line is a valid request, not a skip — purchasing sources it.
    const vendorId = vi ? vi.vendorId : null
    const key = `${vendorId ?? UNSOURCED}::${row.warehouseId}`
    const group = groups.get(key) ?? {
      key,
      vendorId,
      vendorName: vendorId ? vendorNameFor(vendorId) : 'Purchasing to source',
      warehouseId: row.warehouseId,
      warehouseName: row.warehouseName,
      lines: [] as PrLine[],
    }

    group.lines.push({
      sku: row.sku,
      productName: row.productName,
      warehouseId: row.warehouseId,
      vendorId,
      vendorItem: vi ?? null,
      recommendedQty,
      finalQty,
      manuallyEdited: override !== undefined && override !== recommendedQty,
      unit: row.unit,
      unitCost: vi?.unitCost ?? 0,
      availableQty: row.atp.available,
      context: {
        leadTimeDays: vi?.leadTimeDays ?? row.leadTimeDays,
        leadTimeTier: row.leadTimeTier,
        safetyDays: row.safetyDays,
        coverageDays: row.coverageDays,
        avgDailySales: row.velocity.avgDailySales,
        reorderPoint: row.reorderPoint,
        available: row.atp.available,
        onOrder: row.atp.onOrder,
      },
    })
    groups.set(key, group)
  }

  const built: PrGroup[] = [...groups.values()].map((g) => ({
    ...g,
    estimatedValue: g.lines.reduce((s, l) => s + Math.round(l.finalQty * l.unitCost), 0),
    leadTimeDays: g.lines.reduce((m, l) => Math.max(m, l.context.leadTimeDays), 0),
  }))

  return {
    groups: built,
    skipped,
    totals: {
      requestCount: built.length,
      vendorCount: new Set(built.filter((g) => g.vendorId).map((g) => g.vendorId)).size,
      lineCount: built.reduce((s, g) => s + g.lines.length, 0),
      skippedCount: skipped.length,
      unsourcedCount: built.filter((g) => !g.vendorId).reduce((s, g) => s + g.lines.length, 0),
    },
  }
}

/**
 * Create one Purchase Request from a planned group.
 *
 * Status is `'open'` — a live request in purchasing's queue. There is no branch
 * here that produces a PurchaseOrder, and that absence IS US-023.
 */
export function createPurchaseRequestFromGroup(group: PrGroup, createdBy = 'You'): PurchaseRequest {
  const lines: PurchaseRequestLine[] = group.lines.map((line) => {
    const product = productBySku(line.sku)
    return {
      product: product?.name ?? line.productName,
      sku: line.sku,
      description: product?.desc ?? '',
      requestedQty: line.finalQty,
      availableQty: line.availableQty,
      unit: line.unit || (product?.unit ?? 'Unit'),
      unitCost: line.unitCost,
      taxLabel: TAX_LABEL,
    }
  })

  const origin: PurchaseRequestReplenishmentOrigin = {
    source: 'replenishment',
    asOf: REPL_ASOF_ISO,
    runNo: currentRunNo(),
    warehouseId: group.warehouseId,
    createdBy,
    lines: group.lines.map((l) => ({
      sku: l.sku,
      recommendedQty: l.recommendedQty,
      finalQty: l.finalQty,
      deviation: l.finalQty - l.recommendedQty,
      suggestedVendorId: l.vendorId,
      leadTimeDays: l.context.leadTimeDays,
      leadTimeTier: l.context.leadTimeTier,
      safetyDays: l.context.safetyDays,
      coverageDays: l.context.coverageDays,
      avgDailySales: l.context.avgDailySales,
      reorderPoint: l.context.reorderPoint,
      available: l.context.available,
      onOrder: l.context.onOrder,
    })),
  }

  // "Needed by" = today + lead time (US-020 AC-01). On the stock clock, the same
  // anchor every replenishment number uses, so the date agrees with the row.
  const requiredDate = shiftDays(REPL_ASOF_ISO, group.leadTimeDays)

  // Urgency reflects real risk, not a default: a group containing something that
  // stocks out before resupply is genuinely more urgent than a routine top-up.
  const urgency: UrgencyLevel = group.lines.some((l) => l.context.available <= 0)
    ? 'high'
    : group.lines.some((l) => l.context.available < l.context.reorderPoint / 2)
      ? 'medium'
      : 'low'

  return addPurchaseRequest({
    date: REPL_ASOF_ISO,
    procurementStaff: createdBy,
    requiredDate,
    status: 'open',
    totalProducts: lines.length,
    urgency,
    tags: ['Replenishment'],
    awaitingApproval: true,
    lines,
    ...(group.vendorId ? { suggestedVendor: { id: group.vendorId, name: group.vendorName } } : {}),
    replenishment: origin,
  })
}

/**
 * Plan and commit in one call. Returns what was created AND what was skipped, so
 * the caller can report a partial outcome honestly rather than implying success
 * (US-021 EH-01).
 */
export function createPurchaseRequests(
  rows: WorklistRow[],
  overrides: Record<string, number> = {},
  vendorChoices: Record<string, string | null> = {},
  createdBy = 'You',
): PrResult {
  const plan = planPurchaseRequests(rows, overrides, vendorChoices)
  const created: PrResult['created'] = []

  for (const group of plan.groups) {
    const pr = createPurchaseRequestFromGroup(group, createdBy)
    created.push({
      id: pr.id,
      number: pr.number,
      vendorId: group.vendorId,
      vendorName: group.vendorName,
      warehouseId: group.warehouseId,
      lineCount: group.lines.length,
      requiredDate: pr.requiredDate,
    })
  }

  return { created, skipped: plan.skipped }
}
