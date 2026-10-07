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
import { vendorItemFor, vendorNameFor, upsertVendorItem, type VendorItem } from './vendorItems'
import { shiftDays } from './master'
import { currentRunNo } from './replenishmentRuns'
import { REPL_ASOF_ISO, leadTimeForCategory } from './replenishmentConfig'
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
  /**
   * The chosen vendor has no link to this SKU yet (US-019 VR-04 / AC-05). The link
   * is created when the request is saved; until then lead time falls back to the
   * category default and is tagged "estimated lead time".
   */
  newVendorLink: boolean
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
  return Math.max(0, Math.ceil(targetForVendor(row, vendorId) - (row.atp.available + row.atp.onOrder)))
}

/**
 * Lead time to size the request with for a chosen vendor: its own term when the
 * vendor supplies this SKU, else the category default (US-019 AC-04/AC-05 — "lead
 * time falls through the ladder … tagged estimated lead time").
 */
export function leadTimeForVendor(row: WorklistRow, vendorId: string | null): { days: number; estimated: boolean } {
  const vi = vendorId ? vendorItemFor(row.sku, vendorId) : null
  if (vi) return { days: vi.leadTimeDays, estimated: false }
  if (vendorId) {
    const cat = leadTimeForCategory(row.category)
    return { days: cat ?? row.leadTimeDays, estimated: true }
  }
  return { days: row.leadTimeDays, estimated: row.leadTimeEstimated }
}

function targetForVendor(row: WorklistRow, vendorId: string | null): number {
  const leadDays = leadTimeForVendor(row, vendorId).days
  return (leadDays + row.safetyDays + row.coverageDays) * row.velocity.avgDailySales
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
    // Nothing recommended and nothing typed → nothing to request. A line the USER
    // set to 0 stays in its group instead, so its input remains editable in the
    // modal (moving it to Skipped removed the only control that could fix it).
    if (override === undefined && (!recommendedQty || recommendedQty <= 0)) {
      skipped.push({ ...base, reason: 'zero-qty' })
      continue
    }

    // An unsourced line is a valid request, not a skip — purchasing sources it.
    // A chosen vendor with no SKU link is still that vendor (US-019 AC-05).
    const vendorId = chosen ?? null
    const newVendorLink = !!chosen && !vi
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
      newVendorLink,
      recommendedQty,
      finalQty,
      manuallyEdited: override !== undefined && override !== recommendedQty,
      unit: row.unit,
      unitCost: vi?.unitCost ?? 0,
      availableQty: row.atp.available,
      context: {
        leadTimeDays: leadTimeForVendor(row, vendorId).days,
        leadTimeTier: newVendorLink ? 'category' : row.leadTimeTier,
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
    ...(group.vendorId ? { vendor: { id: group.vendorId, name: group.vendorName } } : {}),
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
  const skipped = [...plan.skipped]
  for (const planned of plan.groups) {
    const c = commitPlannedGroup(planned, createdBy, skipped)
    if (c) created.push(c)
  }
  return { created, skipped }
}

/**
 * Commit ONE planned vendor group as one request. Returns what was created, or null
 * when every line was 0-qty. 0-qty lines are pushed onto `skipped`.
 */
export function commitPlannedGroup(
  planned: PrGroup,
  createdBy: string,
  skipped: PrSkippedLine[],
): PrResult['created'][number] | null {
  // Defence in depth: a 0-qty line is never written to a request (the modal
  // blocks confirming one, but the data layer must not rely on that).
  const lines = planned.lines.filter((l) => l.finalQty > 0)
  for (const l of planned.lines) {
    if (l.finalQty <= 0) {
      skipped.push({
        sku: l.sku, productName: l.productName, warehouseId: l.warehouseId,
        warehouseName: planned.warehouseName, reason: 'zero-qty',
      })
    }
  }
  if (!lines.length) return null
  // US-019 VR-04: requesting from a vendor that does not list this SKU creates the
  // vendor–SKU link, with no MOQ / multiplier yet and the category lead time as
  // its term (never a 0-day lead time feeding the next recalculation).
  for (const l of lines) {
    if (!l.newVendorLink || !l.vendorId) continue
    upsertVendorItem({
      sku: l.sku, vendorId: l.vendorId, moq: 0, packSize: 0,
      leadTimeDays: l.context.leadTimeDays, isPreferred: false,
    })
  }
  const group = { ...planned, lines }
  const pr = createPurchaseRequestFromGroup(group, createdBy)
  return {
    id: pr.id,
    number: pr.number,
    vendorId: group.vendorId,
    vendorName: group.vendorName,
    warehouseId: group.warehouseId,
    lineCount: group.lines.length,
    requiredDate: pr.requiredDate,
  }
}

// ── Large selections run in the background (US-018 AC-03, US-015 AC-02) ─────────

/**
 * From this many lines the worklist stops creating requests in one blocking step and
 * runs them as a background job with progress. The production figure is for
 * engineering to set (the PRD's example is 1,000 lines); this one is at demo scale so
 * the busiest demo warehouse (14 due rows) can reach it.
 */
export const BULK_ASYNC_MIN_LINES = 10

export interface PrFailedGroup {
  vendorName: string
  warehouseName: string
  lineCount: number
  error: string
  group: PrGroup
}

export interface BatchedPrResult extends PrResult {
  /** Groups that could not be created — kept whole so they can be retried (US-018 EH-01). */
  failed: PrFailedGroup[]
}

export interface BatchOptions {
  createdBy?: string
  /** Called after every group with how many lines have been handled so far. */
  onProgress?: (done: number, total: number) => void
  /** Test seam: commit one group (defaults to the real thing). */
  commit?: (g: PrGroup, createdBy: string, skipped: PrSkippedLine[]) => PrResult['created'][number] | null
  /** Pause between groups, so progress is visible and the page stays responsive. */
  pauseMs?: number
}

/**
 * Create the requests for already-planned groups, one group at a time, reporting
 * progress and keeping going past a failure: a group that throws is recorded whole in
 * `failed` and the rest are still created (partial commit, "X created, Y failed — retry
 * failed"). Run again with just `failed[i].group` to retry them.
 */
export async function createPurchaseRequestsFromGroups(
  groups: PrGroup[],
  opts: BatchOptions = {},
): Promise<BatchedPrResult> {
  const { createdBy = 'You', onProgress, commit = commitPlannedGroup, pauseMs = 120 } = opts
  const created: PrResult['created'] = []
  const skipped: PrSkippedLine[] = []
  const failed: PrFailedGroup[] = []
  const total = groups.reduce((n, g) => n + g.lines.length, 0)
  let done = 0
  for (const g of groups) {
    try {
      const c = commit(g, createdBy, skipped)
      if (c) created.push(c)
    } catch (e) {
      failed.push({
        vendorName: g.vendorName, warehouseName: g.warehouseName, lineCount: g.lines.length,
        error: e instanceof Error ? e.message : 'Unknown error', group: g,
      })
    }
    done += g.lines.length
    onProgress?.(done, total)
    if (pauseMs > 0) await new Promise((r) => setTimeout(r, pauseMs))
  }
  return { created, skipped, failed }
}

/** Plan, then run as a background job. */
export function createPurchaseRequestsBatched(
  rows: WorklistRow[],
  overrides: Record<string, number> = {},
  vendorChoices: Record<string, string | null> = {},
  opts: BatchOptions = {},
): Promise<BatchedPrResult> {
  const plan = planPurchaseRequests(rows, overrides, vendorChoices)
  return createPurchaseRequestsFromGroups(plan.groups, opts).then((r) => ({
    ...r, skipped: [...plan.skipped, ...r.skipped],
  }))
}
