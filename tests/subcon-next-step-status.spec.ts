/**
 * Verify, don't change — R2 (next step), R18 (Dropship supply gate), R22
 * (statuses). Design Brief DB-16: these behaviours were already built; the tests
 * pin them so later work cannot regress them.
 */
import { describe, it, expect } from 'vitest'
import {
  workOrders, deriveNextAction, syncSubconStatus, subconMaterialsFulfilled,
  type WorkOrder, type RaisedSubconDocument,
} from '../app/data/workOrders'
import { billOfMaterials, catalogProduct } from '../app/data/billOfMaterials'
import { warehouseTransfers } from '../app/data/warehouseTransfers'

// A subcon order on the reference BOM (the one with subcon cost lines).
const bom = billOfMaterials.find(b => (b.subconCost ?? []).length > 0)!
const lines = bom.rawMaterials.map(r => ({ sku: catalogProduct(r.productId)!.sku, qty: r.needed }))
const VENDOR_WH = 'wh-sub-test'

function order(method: 'basic' | 'resupply' | 'dropship', docs: RaisedSubconDocument[] = [], over: Partial<WorkOrder> = {}): WorkOrder {
  const base = workOrders.find(w => w.category === 'Subcontracting' && w.subcon)!
  return {
    ...base,
    id: `wo-test-${method}`,
    bomId: bom.id,
    plannedQty: bom.finishedGoodQty,
    producedQty: 0,
    status: 'not started',
    ...over,
    subcon: {
      ...base.subcon!, method, subconWarehouseId: VENDOR_WH,
      raisedDocuments: docs, componentReceipts: {}, componentAdjustments: undefined, adjustments: undefined,
      extraCostLines: undefined, costLineOverrides: undefined,
    },
  }
}
const doc = (kind: string, id: string, extra: Partial<RaisedSubconDocument> = {}): RaisedSubconDocument =>
  ({ kind, id, number: id, route: kind === 'transfer' ? '/warehouse-transfers' : '/purchase-requests', ...extra })

/** A transfer into the vendor's warehouse carrying `fraction` of every component. */
/**
 * A transfer that has really sent the stock. Only approved-onward transfers
 * count as at the vendor (see subconSentToVendor); a draft is `draftTransfer`.
 */
function sendTransfer(id: string, fraction: number) {
  warehouseTransfers.push({
    id, destinationId: VENDOR_WH, status: 'approved',
    lines: lines.map(l => ({ sku: l.sku, qty: l.qty * fraction })),
  } as never)
  return doc('transfer', id)
}
/** A transfer raised but still awaiting approval — it has moved nothing yet. */
function draftTransfer(id: string, fraction: number) {
  warehouseTransfers.push({
    id, destinationId: VENDOR_WH, status: 'draft',
    lines: lines.map(l => ({ sku: l.sku, qty: l.qty * fraction })),
  } as never)
  return doc('transfer', id)
}
const servicePr = doc('subconPr', 'PR-S')
const servicePo = doc('purchaseOrder', 'PO-S', { route: '/purchase-orders', fromKind: 'subconPr', fromId: 'PR-S' })

// ── R2 — exactly one next step, in order ─────────────────────────────────────

describe('Sent to vendor counts moved stock only', () => {
  it('a draft transfer covering everything waits for approval, not another transfer', () => {
    expect(deriveNextAction(order('resupply', [draftTransfer('wt-d-all', 1)]))).toBe('view-transfer')
  })
  it('a draft covering part still asks for a transfer for the rest', () => {
    expect(deriveNextAction(order('resupply', [draftTransfer('wt-d-half', 0.5)]))).toBe('create-transfer')
  })
  it('a draft does not move the run past procurement', () => {
    const wo = order('resupply', [draftTransfer('wt-d-st', 1)])
    syncSubconStatus(wo)
    expect(wo.status).toBe('waiting rm procurement')
  })
  it('the same transfer, once approved, does', () => {
    const wo = order('resupply', [sendTransfer('wt-a-st', 1)])
    syncSubconStatus(wo)
    expect(wo.status).toBe('waiting subcon order')
  })
})


describe('R2 — the next step, method by method', () => {
  it('Basic: service PR → view PR → Start → Complete → none', () => {
    expect(deriveNextAction(order('basic'))).toBe('create-service-request')
    expect(deriveNextAction(order('basic', [servicePr]))).toBe('view-service-request')
    expect(deriveNextAction(order('basic', [servicePr, servicePo], { status: 'waiting subcon order' }))).toBe('start')
    expect(deriveNextAction(order('basic', [servicePr, servicePo], { status: 'in progress' }))).toBe('complete')
    expect(deriveNextAction(order('basic', [servicePr, servicePo], { status: 'completed' }))).toBe('none')
  })

  it('Resupply: transfer first, and only once the vendor holds everything the service PR', () => {
    expect(deriveNextAction(order('resupply'))).toBe('create-transfer')
    const half = sendTransfer('wt-half', 0.5)
    expect(deriveNextAction(order('resupply', [half]))).toBe('create-transfer')
    const rest = sendTransfer('wt-rest', 0.5)
    expect(deriveNextAction(order('resupply', [half, rest]))).toBe('create-service-request')
  })

  it('Dropship: supply first (component request), then the service PR once everything arrived', () => {
    expect(deriveNextAction(order('dropship'))).toBe('create-component-request')
    const req = doc('componentPr', 'PR-C')
    // Deliveries covering every line are what lets supply end (R18, below).
    const received = Object.fromEntries(lines.map(l => [l.sku, l.qty]))
    const done = order('dropship', [req])
    done.subcon!.componentReceipts = received
    expect(deriveNextAction(done)).toBe('create-service-request')
  })

  it('a cancelled order owes nothing', () => {
    expect(deriveNextAction(order('basic', [], { status: 'canceled' }))).toBe('none')
  })
})

// ── R18 — Dropship moves past supply only when deliveries cover every line ───

describe('R18 — the Dropship supply gate', () => {
  it('a partial delivery does not open the gate', () => {
    const wo = order('dropship')
    wo.subcon!.componentReceipts = Object.fromEntries(lines.map((l, i) => [l.sku, i === 0 ? l.qty - 1 : l.qty]))
    expect(subconMaterialsFulfilled(wo)).toBe(false)
  })

  it('deliveries covering every component line in full open it', () => {
    const wo = order('dropship')
    wo.subcon!.componentReceipts = Object.fromEntries(lines.map(l => [l.sku, l.qty]))
    expect(subconMaterialsFulfilled(wo)).toBe(true)
  })

  it('Basic has nothing to wait for', () => {
    expect(subconMaterialsFulfilled(order('basic'))).toBe(true)
  })
})

// ── R22 — statuses and what moves them ───────────────────────────────────────

describe('R22 — status transitions', () => {
  it('not started → waiting rm procurement → waiting subcon order as supply arrives (Resupply)', () => {
    const wo = order('resupply')
    syncSubconStatus(wo)
    expect(wo.status).toBe('not started')
    wo.subcon!.raisedDocuments = [sendTransfer('wt-r22-a', 0.5)]
    syncSubconStatus(wo)
    expect(wo.status).toBe('waiting rm procurement')
    wo.subcon!.raisedDocuments = [...wo.subcon!.raisedDocuments!, sendTransfer('wt-r22-b', 0.5)]
    syncSubconStatus(wo)
    expect(wo.status).toBe('waiting subcon order')
  })

  it('Basic enters waiting subcon order directly', () => {
    const wo = order('basic')
    syncSubconStatus(wo)
    expect(wo.status).toBe('waiting subcon order')
  })

  it('the service PO does not move status, and never sets in progress (only Start does)', () => {
    const wo = order('basic', [servicePr, servicePo], { status: 'waiting subcon order' })
    syncSubconStatus(wo)
    expect(wo.status).toBe('waiting subcon order')
    expect(wo.subcon!.nextAction).toBe('start')
  })

  it('before the service PO, an increase can move status back to waiting rm procurement', () => {
    const wo = order('resupply', [sendTransfer('wt-r22-c', 1)])
    syncSubconStatus(wo)
    expect(wo.status).toBe('waiting subcon order')
    // R8 — the need grows past what the vendor holds.
    wo.subcon!.componentAdjustments = Object.fromEntries(lines.map(l => [l.sku, l.qty * 2]))
    syncSubconStatus(wo)
    expect(wo.status).toBe('waiting rm procurement')
  })

  it('from partially produced onward, supply documents no longer move status', () => {
    const wo = order('resupply', [], { status: 'partially produced' })
    syncSubconStatus(wo)
    expect(wo.status).toBe('partially produced')
  })
})
