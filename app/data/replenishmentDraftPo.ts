/**
 * Purchase Request → draft purchase order (PRD US-027, OD-012).
 *
 * NOT reachable from the worklist. Decision D11 made a Purchase Request the only
 * thing replenishment produces, and US-023 is a negative story about that: no
 * data glitch may place a real order. So the entry point here takes a
 * PurchaseRequest — converting one is a PURCHASING action, downstream of the
 * request queue. The worklist calls `replenishmentPurchaseRequest.ts` and has no
 * route to this file at all; that absence is the enforcement.
 *
 * Grouping key is `${vendorId}::${warehouseId}` — one PO per vendor PER WAREHOUSE,
 * not strictly per vendor. Forced by two facts: `PurchaseOrderDetail.warehouse` is a
 * single scalar (a PO has exactly one ship-to), and OD-008 forbids blending
 * warehouses. A vendor-only grouping simply cannot be expressed on one document.
 *
 * `status: 'draft'` is hard-coded here with no path to any other status. That is how
 * US-023 ("never auto-submit") is ENFORCED rather than configured — there is no flag
 * to get wrong.
 *
 * CLOCK BRIDGE. The engine runs on the stock clock (`master.TODAY_ISO`, 2026-06-26);
 * `purchaseOrders` is a time series on the accounting clock (`simClock`, 2026-08-22)
 * sorted newest-first. A draft dated on the stock clock would sort into the middle of
 * the PO index and read two months stale next to the newest seed order. So the PO
 * carries accounting-clock dates, while `replenishment.asOf` records the worklist
 * snapshot it came from. Both dates are visible and neither is a fiction.
 */
import type { PurchaseOrder, PurchaseOrderReplenishmentOrigin, PurchaseRequest } from './types'
import {
  addPurchaseOrder, nextPurchaseOrderId, nextPurchaseOrderNumber,
} from './purchaseOrders'
import { setPurchaseOrderDocument } from './purchaseOrderLines'
import { PAYMENT_TERMS, type POLineItem, type POTotals } from './purchaseOrderDetails'
import { productBySku } from './inventory'
import { warehouses } from './warehouses'
import { vendorItemFor, vendorNameFor, vendorItemsForSku, preferredVendorItem, type VendorItem } from './vendorItems'
import { updatePurchaseRequest } from './purchaseRequests'
import { SIM_TODAY_ISO } from './simClock'
import { shiftDays } from './master'
import { currentRunNo } from './replenishmentRuns'
import { REPL_ASOF_ISO } from './replenishmentConfig'
import { applyMoqAndPack } from './replenishment'

const TAX_RATE = 0.11
const TAX_LABEL = 'PPN 11%'

export interface DraftPoLine {
  sku: string
  productName: string
  warehouseId: string
  vendorId: string
  vendorItem: VendorItem
  /** Engine recommendation, purchase units. */
  recommendedQty: number
  /** What will be ordered — user-editable. */
  finalQty: number
  unitCost: number
  purchaseUnit: string
  /** The stock-unit need this line was rounded from (transparency). */
  needStock?: number
  /** Rounding provenance for the preview note. */
  raisedByMoq?: boolean
  raisedByPack?: boolean
  /** Inputs captured for the audit trail. */
  context: {
    leadTimeDays: number
    safetyDays: number
    avgDailySales: number
    reorderPoint: number
    available: number
    onOrder: number
  }
}

export interface DraftPoGroup {
  key: string
  vendorId: string
  vendorName: string
  warehouseId: string
  warehouseName: string
  lines: DraftPoLine[]
  subtotal: number
  taxAmount: number
  total: number
  /** Longest lead time in the group — drives the PO due date. */
  leadTimeDays: number
}

export type SkipReason = 'no-vendor' | 'inactive-vendor-item' | 'zero-qty' | 'needs-setup' | 'missing-uom'

export interface SkippedLine {
  sku: string
  productName: string
  warehouseId: string
  warehouseName: string
  reason: SkipReason
}

export interface DraftPoResult {
  created: {
    id: string
    number: string
    vendorId: string
    vendorName: string
    warehouseId: string
    lineCount: number
    total: number
  }[]
  skipped: SkippedLine[]
}

const SKIP_LABEL: Record<SkipReason, string> = {
  'no-vendor': 'No vendor',
  'inactive-vendor-item': 'Vendor is inactive',
  'zero-qty': 'Nothing to order',
  'needs-setup': 'Needs setup',
  'missing-uom': 'Missing pack conversion',
}

export function skipReasonLabel(reason: SkipReason): string {
  return SKIP_LABEL[reason]
}

function lineAmount(line: DraftPoLine): number {
  return Math.round(line.finalQty * line.unitCost)
}

function summarize(group: Omit<DraftPoGroup, 'subtotal' | 'taxAmount' | 'total' | 'leadTimeDays'>): DraftPoGroup {
  const subtotal = group.lines.reduce((s, l) => s + lineAmount(l), 0)
  const taxAmount = Math.round(subtotal * TAX_RATE)
  return {
    ...group,
    subtotal,
    taxAmount,
    total: subtotal + taxAmount,
    leadTimeDays: group.lines.reduce((m, l) => Math.max(m, l.context.leadTimeDays), 0),
  }
}

/** Create one draft PO from a planned group. Always DRAFT — no other status exists here. */
export function createDraftPoFromGroup(
  group: DraftPoGroup,
  createdBy = 'You',
  purchaseRequestId?: string,
): PurchaseOrder {
  const id = nextPurchaseOrderId()
  const number = nextPurchaseOrderNumber()

  const lineItems: POLineItem[] = group.lines.map((line) => {
    const product = productBySku(line.sku)
    return {
      product: product?.name ?? line.productName,
      sku: line.sku,
      description: product?.desc ?? '',
      qty: line.finalQty,
      unit: line.purchaseUnit,
      unitPrice: line.unitCost,
      discountPct: 0,
      taxLabel: TAX_LABEL,
      amount: Math.round(line.finalQty * line.unitCost),
    }
  })

  const totals: POTotals = {
    subtotal: group.subtotal,
    discountPerLine: 0,
    globalDiscount: 0,
    taxLabel: TAX_LABEL,
    taxAmount: group.taxAmount,
    shippingFee: 0,
    total: group.total,
  }

  const origin: PurchaseOrderReplenishmentOrigin = {
    source: 'replenishment',
    // journal → PO → the originating request → the worklist run (US-027 AC-02).
    ...(purchaseRequestId ? { purchaseRequestId } : {}),
    asOf: REPL_ASOF_ISO,
    runNo: currentRunNo(),
    warehouseId: group.warehouseId,
    createdBy,
    lines: group.lines.map((l) => ({
      sku: l.sku,
      vendorItemId: l.vendorItem.id,
      recommendedQty: l.recommendedQty,
      finalQty: l.finalQty,
      deviation: l.finalQty - l.recommendedQty,
      leadTimeDays: l.context.leadTimeDays,
      safetyDays: l.context.safetyDays,
      avgDailySales: l.context.avgDailySales,
      reorderPoint: l.context.reorderPoint,
      available: l.context.available,
      onOrder: l.context.onOrder,
    })),
  }

  const order: PurchaseOrder = {
    id,
    number,
    vendor: { id: group.vendorId, name: group.vendorName },
    // Accounting clock — see the CLOCK BRIDGE note at the top of this file.
    date: SIM_TODAY_ISO,
    dueDate: shiftDays(SIM_TODAY_ISO, group.leadTimeDays),
    total: group.total,
    balance: group.total,
    status: 'draft',
    itemCount: lineItems.length,
    hasAttachment: false,
    tags: ['Replenishment'],
    replenishment: origin,
  }

  addPurchaseOrder(order)

  // Real coffee SKUs + a real warehouse FK, so the existing PO detail page renders
  // the truth instead of the industrial-parts generator's output.
  const warehouse = warehouses.find((w) => w.id === group.warehouseId)
  setPurchaseOrderDocument({
    poId: id,
    warehouseId: group.warehouseId,
    warehouse: warehouse?.name ?? group.warehouseName,
    paymentTerms: PAYMENT_TERMS[0] ?? 'Net 30',
    shipDate: shiftDays(SIM_TODAY_ISO, group.leadTimeDays),
    lineItems,
    totals,
  })

  return order
}

/**
 * Convert one Purchase Request into a draft PO (US-027 AC-01).
 *
 * This is where US-009's MOQ / pack / purchase-UoM rounding finally happens —
 * once, against the vendor who will actually ship (decision D12). The PR carried
 * the demand-coverage need in stock units precisely so this rounding could not
 * be applied twice to two different vendors' packs.
 *
 * Still `'draft'`: converting a request produces an order awaiting approval, not
 * a sent one. Nothing here transitions a PO to sent.
 */
export function createPoFromPurchaseRequest(
  pr: PurchaseRequest,
  vendorId: string,
  createdBy = 'You',
): { order: PurchaseOrder | null; skipped: SkippedLine[] } {
  const skipped: SkippedLine[] = []
  const warehouseId = pr.replenishment?.warehouseId ?? ''
  const warehouseName = warehouses.find((w) => w.id === warehouseId)?.name ?? ''
  const lines: DraftPoLine[] = []

  for (const prLine of pr.lines) {
    const base = { sku: prLine.sku, productName: prLine.product, warehouseId, warehouseName }
    const vi = vendorItemFor(prLine.sku, vendorId)
    if (!vi) { skipped.push({ ...base, reason: 'inactive-vendor-item' }); continue }
    if (!vi.unitsPerPurchaseUnit || vi.unitsPerPurchaseUnit < 1) {
      skipped.push({ ...base, reason: 'missing-uom' }); continue
    }

    // The requested qty is a STOCK-unit need; round it into this vendor's terms now.
    const rounded = applyMoqAndPack(prLine.requestedQty, vi)
    if (rounded.purchaseQty <= 0) { skipped.push({ ...base, reason: 'zero-qty' }); continue }

    const origin = pr.replenishment?.lines.find((l) => l.sku === prLine.sku)
    lines.push({
      sku: prLine.sku,
      productName: prLine.product,
      warehouseId,
      vendorId,
      vendorItem: vi,
      recommendedQty: rounded.purchaseQty,
      finalQty: rounded.purchaseQty,
      unitCost: vi.unitCost,
      purchaseUnit: vi.purchaseUnit,
      context: {
        leadTimeDays: origin?.leadTimeDays ?? vi.leadTimeDays,
        safetyDays: origin?.safetyDays ?? 0,
        avgDailySales: origin?.avgDailySales ?? 0,
        reorderPoint: origin?.reorderPoint ?? 0,
        available: origin?.available ?? 0,
        onOrder: origin?.onOrder ?? 0,
      },
    })
  }

  if (!lines.length) return { order: null, skipped }

  const group = summarize({
    key: `${vendorId}::${warehouseId}`,
    vendorId,
    vendorName: vendorNameFor(vendorId),
    warehouseId,
    warehouseName,
    lines,
  })
  return { order: createDraftPoFromGroup(group, createdBy, pr.id), skipped }
}

/**
 * Suggested ship-to for a PR conversion: a replenishment PR carries its warehouse
 * on the origin; a manual PR has none, so the caller supplies a default.
 */
export function defaultConversionWarehouse(pr: PurchaseRequest): string {
  return pr.replenishment?.warehouseId ?? warehouses[0]?.id ?? ''
}

/** The vendor pre-selected for a PR line: preferred vendor, else the first linked. */
export function suggestedVendorForSku(sku: string): string | null {
  return preferredVendorItem(sku)?.vendorId ?? vendorItemsForSku(sku)[0]?.vendorId ?? null
}

/**
 * Plan the purchase orders a PR would convert into (PRD D12 / US-019 VR-02).
 *
 * This is where the demand-coverage NEED the PR carries in STOCK units is finally
 * rounded into a vendor's terms — MOQ raise, then purchase-multiplier (pack)
 * round-up — against whoever purchasing picks as the FINAL vendor. Rounding lives
 * here, at conversion, so it is applied ONCE and against the real vendor, never
 * twice on the PR against a vendor that may later change.
 *
 * `vendorChoices` / `qtyOverrides` are the purchasing user's edits (per SKU); an
 * override is the final ORDER quantity in PURCHASE units and is honoured as typed
 * (never silently re-rounded). Lines group into one PO per vendor for the chosen
 * warehouse ship-to.
 */
export function planPosFromPurchaseRequest(
  pr: PurchaseRequest,
  warehouseId: string,
  vendorChoices: Record<string, string | null> = {},
  qtyOverrides: Record<string, number> = {},
): { groups: DraftPoGroup[]; skipped: SkippedLine[] } {
  const warehouseName = warehouses.find((w) => w.id === warehouseId)?.name ?? ''
  const groups = new Map<string, Omit<DraftPoGroup, 'subtotal' | 'taxAmount' | 'total' | 'leadTimeDays'>>()
  const skipped: SkippedLine[] = []

  for (const prLine of pr.lines) {
    const base = { sku: prLine.sku, productName: prLine.product, warehouseId, warehouseName }
    const vendorId = prLine.sku in vendorChoices
      ? vendorChoices[prLine.sku]!
      : suggestedVendorForSku(prLine.sku)

    if (!vendorId) { skipped.push({ ...base, reason: 'no-vendor' }); continue }

    const vi = vendorItemFor(prLine.sku, vendorId)
    if (!vi) { skipped.push({ ...base, reason: 'inactive-vendor-item' }); continue }
    if (!vi.unitsPerPurchaseUnit || vi.unitsPerPurchaseUnit < 1) {
      skipped.push({ ...base, reason: 'missing-uom' }); continue
    }

    // The PR line's requested qty is the STOCK-unit need — round it to this
    // vendor's MOQ + purchase multiplier now (US-006). An override is already in
    // purchase units and is taken verbatim.
    const rounded = applyMoqAndPack(prLine.requestedQty, vi)
    const finalQty = prLine.sku in qtyOverrides ? qtyOverrides[prLine.sku]! : rounded.purchaseQty
    if (finalQty <= 0) { skipped.push({ ...base, reason: 'zero-qty' }); continue }

    const origin = pr.replenishment?.lines.find((l) => l.sku === prLine.sku)
    const key = `${vendorId}::${warehouseId}`
    if (!groups.has(key)) {
      groups.set(key, { key, vendorId, vendorName: vendorNameFor(vendorId), warehouseId, warehouseName, lines: [] })
    }
    groups.get(key)!.lines.push({
      sku: prLine.sku,
      productName: prLine.product,
      warehouseId,
      vendorId,
      vendorItem: vi,
      recommendedQty: rounded.purchaseQty,
      finalQty,
      unitCost: vi.unitCost,
      purchaseUnit: vi.purchaseUnit,
      needStock: prLine.requestedQty,
      raisedByMoq: rounded.raisedByMoq,
      raisedByPack: rounded.raisedByPack,
      context: {
        leadTimeDays: origin?.leadTimeDays ?? vi.leadTimeDays,
        safetyDays: origin?.safetyDays ?? 0,
        avgDailySales: origin?.avgDailySales ?? 0,
        reorderPoint: origin?.reorderPoint ?? 0,
        available: origin?.available ?? 0,
        onOrder: origin?.onOrder ?? 0,
      },
    })
  }

  return { groups: [...groups.values()].map(summarize), skipped }
}

/**
 * Convert a PR into one or more draft POs and reflect it on the request.
 *
 * Every created PO is `'draft'` (US-020 — replenishment/conversion never sends an
 * order). The PR moves to `closed` when all lines converted, or
 * `partially processed` when some were skipped (no vendor / missing pack data).
 */
export function convertPurchaseRequestToPos(
  pr: PurchaseRequest,
  warehouseId: string,
  vendorChoices: Record<string, string | null> = {},
  qtyOverrides: Record<string, number> = {},
  createdBy = 'You',
): DraftPoResult {
  const { groups, skipped } = planPosFromPurchaseRequest(pr, warehouseId, vendorChoices, qtyOverrides)

  const created = groups.map((group) => {
    const order = createDraftPoFromGroup(group, createdBy, pr.id)
    return {
      id: order.id,
      number: String(order.number),
      vendorId: group.vendorId,
      vendorName: group.vendorName,
      warehouseId: group.warehouseId,
      lineCount: group.lines.length,
      total: group.total,
    }
  })

  if (created.length > 0) {
    updatePurchaseRequest(pr.id, {
      status: skipped.length === 0 ? 'closed' : 'partially processed',
      awaitingApproval: false,
    })
  }

  return { created, skipped }
}
