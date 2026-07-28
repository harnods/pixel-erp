/**
 * Production request business logic (app/data/productionRequests.ts).
 *
 * Rules validated:
 *   • prChildRemaining(r) = max(0, requestedQty − producedQty)  — clamped ≥ 0.
 *   • prAggregate(p).remaining = max(0, Σrequested − Σproduced) — clamped ≥ 0.
 *   • addProductionRequest(order) spawns a pending request per CATALOG-matched
 *     line item, sourced to the real sales order (sourceId === order.id), with
 *     requestedQty === item.qty.
 *   • rejectProductionRequest(): only child rows are rejectable; a partial reject
 *     shrinks the request's requestedQty (remainder stays open in Pending); the
 *     rejected qty is clamped to [1, remaining] and merged into the existing
 *     rejected product/source entry for the same SKU + source.
 */
import { describe, it, expect } from 'vitest'
import {
  productionRequestProducts,
  prChildRemaining,
  prAggregate,
  prRequestsOf,
  addProductionRequest,
  rejectProductionRequest,
  type PrProduct,
  type PrRequest,
} from '~/data/productionRequests'
import { salesOrders } from '~/data/salesOrders'
import { CATALOG } from '~/data/catalog'

// Build + register a fresh isolated pending product so reject tests don't couple
// to seed rows or to each other (unique SKU avoids the merge-by-SKU behavior).
let uniq = 0
function freshPending(request: Partial<PrRequest> = {}): PrProduct {
  uniq++
  const sku = `TEST-SKU-${uniq}`
  const p: PrProduct = {
    id: `pr-test-${uniq}`,
    productName: `Test Product ${uniq}`,
    sku,
    image: '',
    unit: 'Pcs',
    status: 'pending',
    sources: [
      {
        sourceNo: `Sales Order #TEST-${uniq}`,
        sourceId: `SO-TEST-${uniq}`,
        requests: [
          {
            requestNo: `Production Request #TEST-${uniq}`,
            requestedQty: 10, producedQty: 0, rejectedQty: 0,
            dueDate: '2026-08-01',
            ...request,
          },
        ],
      },
    ],
  }
  productionRequestProducts.push(p)
  return p
}

describe('prChildRemaining / prAggregate — remaining clamped ≥ 0', () => {
  it('remaining = requested − produced', () => {
    expect(prChildRemaining({ requestNo: 'x', requestedQty: 10, producedQty: 4, rejectedQty: 0 })).toBe(6)
  })

  it('never negative when produced exceeds requested', () => {
    expect(prChildRemaining({ requestNo: 'x', requestedQty: 5, producedQty: 8, rejectedQty: 0 })).toBe(0)
  })

  it('prAggregate rolls up requests and clamps remaining ≥ 0', () => {
    const p = freshPending({ requestedQty: 5, producedQty: 2 })
    p.sources[0]!.requests.push({ requestNo: 'r2', requestedQty: 3, producedQty: 6, rejectedQty: 0 })
    const agg = prAggregate(p)
    expect(agg.requested).toBe(8)   // 5 + 3
    expect(agg.produced).toBe(8)    // 2 + 6
    expect(agg.remaining).toBe(0)   // max(0, 8 − 8)
  })
})

describe('addProductionRequest — spawns from a real sales order', () => {
  it('creates/updates pending products sourced to the order, qty = line qty', () => {
    // pick a small order (index 0 has 50 lines) whose items are CATALOG products
    const order = salesOrders[3]!
    const catalogSkus = new Set(CATALOG.map(c => c.sku))
    const expectedItems = order.items.filter(it => catalogSkus.has(it.sku))
    expect(expectedItems.length).toBeGreaterThan(0)

    const touched = addProductionRequest(order)
    expect(touched.length).toBeGreaterThan(0)

    for (const p of touched) {
      expect(p.status).toBe('pending')
      // the source raised from this exact sales order is present
      const src = p.sources.find(s => s.sourceId === order.id)
      expect(src).toBeTruthy()
      expect(src!.sourceNo).toBe(`Sales Order #${order.number}`)
    }

    // every requested qty for this order matches a real line qty
    for (const item of expectedItems) {
      const p = touched.find(t => t.sku === item.sku)!
      expect(p).toBeTruthy()
      const reqs = prRequestsOf(p).filter(r => r.requestedQty === item.qty)
      expect(reqs.length).toBeGreaterThan(0)
    }
  })
})

describe('rejectProductionRequest', () => {
  function rejectArgs(p: PrProduct, overrides: Partial<{ rejectedQty: number; reason: string }> = {}) {
    const src = p.sources[0]!
    const req = src.requests[0]!
    return {
      productId: p.id,
      sourceNo: src.sourceNo,
      requestNo: req.requestNo,
      rejectedQty: overrides.rejectedQty ?? 3,
      reason: overrides.reason ?? 'QC fail',
      rejectDate: '2026-07-28',
    }
  }

  it('partial reject shrinks requestedQty and keeps the remainder open', () => {
    const p = freshPending({ requestedQty: 10, producedQty: 0 })
    rejectProductionRequest(rejectArgs(p, { rejectedQty: 3 }))
    expect(p.sources[0]!.requests[0]!.requestedQty).toBe(7) // 10 − 3, still pending/open
    expect(prChildRemaining(p.sources[0]!.requests[0]!)).toBe(7)
  })

  it('records the rejected qty as a rejected product/source/request entry', () => {
    const p = freshPending({ requestedQty: 10, producedQty: 0 })
    const args = rejectArgs(p, { rejectedQty: 4, reason: 'Moisture out of spec' })
    rejectProductionRequest(args)

    const rejected = productionRequestProducts.find(x => x.status === 'rejected' && x.sku === p.sku)!
    expect(rejected).toBeTruthy()
    const rsrc = rejected.sources.find(s => s.sourceNo === args.sourceNo)!
    expect(rsrc).toBeTruthy()
    const entry = rsrc.requests.find(r => r.requestNo === args.requestNo)!
    expect(entry.rejectedQty).toBe(4)
    expect(entry.requestedQty).toBe(4)
    expect(entry.memo).toBe('Moisture out of spec')
  })

  it('clamps rejected qty to remaining (over-reject caps at remaining, empties the request)', () => {
    const p = freshPending({ requestedQty: 5, producedQty: 0 })
    rejectProductionRequest(rejectArgs(p, { rejectedQty: 100 }))
    expect(p.sources[0]!.requests[0]!.requestedQty).toBe(0) // shrunk by clamped 5
    const rejected = productionRequestProducts.find(x => x.status === 'rejected' && x.sku === p.sku)!
    const entry = rejected.sources[0]!.requests[0]!
    expect(entry.rejectedQty).toBe(5)
  })

  it('clamps rejected qty up to a minimum of 1', () => {
    const p = freshPending({ requestedQty: 8, producedQty: 0 })
    rejectProductionRequest(rejectArgs(p, { rejectedQty: 0 }))
    expect(p.sources[0]!.requests[0]!.requestedQty).toBe(7) // shrunk by clamped 1
  })

  it('merges repeated rejects into the same rejected product + source (one source, many requests)', () => {
    const p = freshPending({ requestedQty: 10, producedQty: 0 })
    rejectProductionRequest(rejectArgs(p, { rejectedQty: 2 }))
    rejectProductionRequest(rejectArgs(p, { rejectedQty: 3 }))

    const rejected = productionRequestProducts.filter(x => x.status === 'rejected' && x.sku === p.sku)
    expect(rejected).toHaveLength(1)                 // merged by SKU — one product
    expect(rejected[0]!.sources).toHaveLength(1)     // merged by sourceNo — one source
    expect(rejected[0]!.sources[0]!.requests).toHaveLength(2)
    expect(p.sources[0]!.requests[0]!.requestedQty).toBe(5) // 10 − 2 − 3
  })

  it('does nothing for an unknown productId (parent/no-such row not rejectable)', () => {
    const rejectedBefore = productionRequestProducts.filter(x => x.status === 'rejected').length
    rejectProductionRequest({
      productId: 'pr-does-not-exist', sourceNo: 'x', requestNo: 'y',
      rejectedQty: 1, reason: '', rejectDate: '2026-07-28',
    })
    const rejectedAfter = productionRequestProducts.filter(x => x.status === 'rejected').length
    expect(rejectedAfter).toBe(rejectedBefore)
  })
})
