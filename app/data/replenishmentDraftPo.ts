/**
 * Worklist → draft purchase order (PRD OD-007, OD-012).
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
import type { PurchaseOrder, PurchaseOrderReplenishmentOrigin } from './types'
import {
  addPurchaseOrder, nextPurchaseOrderId, nextPurchaseOrderNumber,
} from './purchaseOrders'
import { setPurchaseOrderDocument } from './purchaseOrderLines'
import { PAYMENT_TERMS, type POLineItem, type POTotals } from './purchaseOrderDetails'
import { productBySku } from './inventory'
import { warehouses } from './warehouses'
import { vendorItemFor, vendorNameFor, type VendorItem } from './vendorItems'
import { SIM_TODAY_ISO } from './simClock'
import { shiftDays } from './master'
import { currentRunNo } from './replenishmentRuns'
import { REPL_ASOF_ISO } from './replenishmentConfig'
import type { WorklistRow } from './replenishment'

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

export interface DraftPoPlan {
  groups: DraftPoGroup[]
  skipped: SkippedLine[]
  totals: { poCount: number; vendorCount: number; lineCount: number; skippedCount: number }
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

/**
 * Plan the POs for a selection — grouping, per-vendor totals, and the skip list.
 *
 * Pure: creates nothing. The UI shows this plan for confirmation BEFORE committing,
 * so "3 POs across 3 vendors, 2 lines skipped — no vendor" is a decision the user
 * makes rather than a surprise they read afterwards (US-021 EH-01).
 *
 * `overrides` is keyed by `WorklistRow.key`, so edited quantities can be passed
 * without reshaping rows. `vendorChoices` likewise lets a row be reassigned to an
 * alternate vendor, which re-groups it (US-022 AC-01).
 */
export function planDraftPos(
  rows: WorklistRow[],
  overrides: Record<string, number> = {},
  vendorChoices: Record<string, string> = {},
): DraftPoPlan {
  const groups = new Map<string, Omit<DraftPoGroup, 'subtotal' | 'taxAmount' | 'total' | 'leadTimeDays'>>()
  const skipped: SkippedLine[] = []

  for (const row of rows) {
    const warehouseName = row.warehouseName

    if (row.bucket === 'needs-setup') {
      skipped.push({ sku: row.sku, productName: row.productName, warehouseId: row.warehouseId, warehouseName, reason: 'needs-setup' })
      continue
    }

    const chosenVendorId = vendorChoices[row.key] ?? row.vendorItem?.vendorId
    if (!chosenVendorId) {
      skipped.push({ sku: row.sku, productName: row.productName, warehouseId: row.warehouseId, warehouseName, reason: 'no-vendor' })
      continue
    }

    const vi = vendorItemFor(row.sku, chosenVendorId)
    if (!vi) {
      skipped.push({ sku: row.sku, productName: row.productName, warehouseId: row.warehouseId, warehouseName, reason: 'inactive-vendor-item' })
      continue
    }
    if (!vi.unitsPerPurchaseUnit || vi.unitsPerPurchaseUnit < 1) {
      skipped.push({ sku: row.sku, productName: row.productName, warehouseId: row.warehouseId, warehouseName, reason: 'missing-uom' })
      continue
    }

    const recommendedQty = row.suggestion.purchaseQty
    const finalQty = overrides[row.key] ?? recommendedQty
    if (!finalQty || finalQty <= 0) {
      skipped.push({ sku: row.sku, productName: row.productName, warehouseId: row.warehouseId, warehouseName, reason: 'zero-qty' })
      continue
    }

    const key = `${chosenVendorId}::${row.warehouseId}`
    const group = groups.get(key) ?? {
      key,
      vendorId: chosenVendorId,
      vendorName: vendorNameFor(chosenVendorId),
      warehouseId: row.warehouseId,
      warehouseName,
      lines: [] as DraftPoLine[],
    }
    group.lines.push({
      sku: row.sku,
      productName: row.productName,
      warehouseId: row.warehouseId,
      vendorId: chosenVendorId,
      vendorItem: vi,
      recommendedQty,
      finalQty,
      unitCost: vi.unitCost,
      purchaseUnit: vi.purchaseUnit,
      context: {
        leadTimeDays: vi.leadTimeDays,
        safetyDays: row.safetyDays,
        avgDailySales: row.velocity.avgDailySales,
        reorderPoint: row.reorderPoint,
        available: row.atp.available,
        onOrder: row.atp.onOrder,
      },
    })
    groups.set(key, group)
  }

  const built = [...groups.values()].map(summarize)
  return {
    groups: built,
    skipped,
    totals: {
      poCount: built.length,
      vendorCount: new Set(built.map((g) => g.vendorId)).size,
      lineCount: built.reduce((s, g) => s + g.lines.length, 0),
      skippedCount: skipped.length,
    },
  }
}

/** Create one draft PO from a planned group. Always DRAFT — no other status exists here. */
export function createDraftPoFromGroup(group: DraftPoGroup, createdBy = 'You'): PurchaseOrder {
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
 * Plan and commit in one call. Returns what was created AND what was skipped, so
 * the caller can report a partial outcome honestly rather than implying success.
 */
export function createDraftPos(
  rows: WorklistRow[],
  overrides: Record<string, number> = {},
  vendorChoices: Record<string, string> = {},
  createdBy = 'You',
): DraftPoResult {
  const plan = planDraftPos(rows, overrides, vendorChoices)
  const created: DraftPoResult['created'] = []

  for (const group of plan.groups) {
    const order = createDraftPoFromGroup(group, createdBy)
    created.push({
      id: order.id,
      number: order.number,
      vendorId: group.vendorId,
      vendorName: group.vendorName,
      warehouseId: group.warehouseId,
      lineCount: group.lines.length,
      total: group.total,
    })
  }

  return { created, skipped: plan.skipped }
}
