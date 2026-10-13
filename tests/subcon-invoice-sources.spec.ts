/**
 * R16 — one invoice may cover several purchase orders, but only from one work
 * order (Design Brief DB-12, fixture F9).
 */
import { describe, it, expect } from 'vitest'
import { checkInvoiceSources } from '../app/data/subcon'
import { buildSubconJournals, balanceOf, entriesBalance } from '../app/data/subconAccounting'

const OWNER: Record<string, string | undefined> = { 'PO-A': 'WO-1', 'PO-B': 'WO-1', 'PO-X': 'WO-2', 'PO-plain': undefined }
const owner = (id: string) => OWNER[id]

describe('checkInvoiceSources', () => {
  it('F9 — two orders from the same work order may share an invoice', () => {
    expect(checkInvoiceSources(['PO-A', 'PO-B'], owner)).toEqual({ ok: true, workOrderId: 'WO-1' })
  })

  it('F9 — an order from another work order is refused', () => {
    expect(checkInvoiceSources(['PO-A', 'PO-X'], owner)).toEqual({ ok: false })
  })

  it('a subcon order cannot be mixed with one that belongs to no work order', () => {
    expect(checkInvoiceSources(['PO-A', 'PO-plain'], owner)).toEqual({ ok: false })
  })

  it('a single order, or ordinary orders on their own, are fine as before', () => {
    expect(checkInvoiceSources(['PO-A'], owner)).toEqual({ ok: true, workOrderId: 'WO-1' })
    expect(checkInvoiceSources(['PO-plain'], owner)).toEqual({ ok: true })
  })
})

describe('F9 — one invoice for the original order and a late charge', () => {
  it('posts 13,850,000 to finished goods against payables, untaxed and balanced', () => {
    const entries = buildSubconJournals({
      workOrderNumber: 'WO-2026-0029',
      method: 'resupply',
      plannedOutputQty: 500,
      components: [],
      costLines: [
        { id: 'svc-sew', name: 'Jahit & assembly', costDriver: 'Unit', amount: 12_500_000 },
        { id: 'svc-handling', name: 'Subcon handling & freight', costDriver: 'Amount', amount: 600_000 },
        { id: 'extra-1', name: 'Finishing', costDriver: 'Amount', amount: 750_000 },
      ],
      invoices: [{
        id: 'inv1', date: '2026-10-20', lines: [
          { costLineId: 'svc-sew', amount: 12_500_000 },
          { costLineId: 'svc-handling', amount: 600_000 },
          { costLineId: 'extra-1', amount: 750_000 },
        ],
      }],
    })
    expect(entries.filter(e => e.event === 'vendorInvoice')).toHaveLength(1)
    expect(balanceOf(entries, 'finishedGoods')).toBe(13_850_000)
    expect(balanceOf(entries, 'accountsPayable')).toBe(-13_850_000)
    expect(entriesBalance(entries)).toBe(true)
  })
})

// ── The PO page's "Create purchase invoice" brings the run's other open orders ─

import { workOrders, subconOrdersToInvoice } from '../app/data/workOrders'

describe('subconOrdersToInvoice', () => {
  const wo = workOrders.find(w => w.category === 'Subcontracting' && w.subcon)!
  wo.subcon!.raisedDocuments = [
    { kind: 'subconPr', id: 'PR-1', number: 'PR #1', route: '/purchase-requests' },
    { kind: 'purchaseOrder', id: 'PO-A', number: 'PO-A', route: '/purchase-orders', fromKind: 'subconPr', fromId: 'PR-1' },
    { kind: 'purchaseOrder', id: 'PO-B', number: 'PO-B', route: '/purchase-orders', fromKind: 'subconPr', fromId: 'PR-2' },
    { kind: 'purchaseOrder', id: 'PO-C', number: 'PO-C', route: '/purchase-orders', fromKind: 'componentPr' },
  ]

  it('a service order brings every unbilled service order of its run', () => {
    expect(subconOrdersToInvoice('PO-A', () => false)).toEqual(['PO-A', 'PO-B'])
  })

  it('an order already billed is left out', () => {
    expect(subconOrdersToInvoice('PO-B', id => id === 'PO-A')).toEqual(['PO-B'])
  })

  it('a Dropship component order, or an order outside any run, bills only itself', () => {
    expect(subconOrdersToInvoice('PO-C', () => false)).toEqual(['PO-C'])
    expect(subconOrdersToInvoice('PO-elsewhere', () => false)).toEqual(['PO-elsewhere'])
  })
})
