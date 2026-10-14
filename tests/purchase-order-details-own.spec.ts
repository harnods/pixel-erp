/**
 * An order created through the form shows what was entered on it — never the
 * generated values seeded orders are dressed in (found walking the subcon run:
 * the detail page showed "Sentral Cargo", "TRK…" and a "procurement Q2" memo on
 * an order that had none of them).
 */
import { describe, it, expect } from 'vitest'
import { purchaseOrders, addPurchaseOrder } from '../app/data/purchaseOrders'
import { getPurchaseOrderDetail } from '../app/data/purchaseOrderDetails'

describe('getPurchaseOrderDetail — an order created through the form', () => {
  const base = purchaseOrders[0]!
  addPurchaseOrder({
    ...base,
    id: 'po-test-own',
    number: 'PO-2026-9999',
    lineItems: [{ product: 'Jahit & assembly', sku: 'SVC', description: '', qty: 1, unit: 'Pcs', unitPrice: 12_500_000, discountPct: 0, taxLabel: 'Non-PPN', amount: 12_500_000 }],
    details: { warehouse: 'Gudang Semarang Industrial', memo: 'Raised from WO-2026-0027 · subcon · PT Roastery Nusantara Mandiri' },
  })
  const d = getPurchaseOrderDetail('po-test-own')

  it('shows the memo and warehouse that were entered', () => {
    expect(d.memo).toBe('Raised from WO-2026-0027 · subcon · PT Roastery Nusantara Mandiri')
    expect(d.warehouse).toBe('Gudang Semarang Industrial')
  })

  it('leaves fields that were not entered empty instead of inventing them', () => {
    expect(d.shipVia).toBe('')
    expect(d.trackingNo).toBe('')
    expect(d.shipTo).toBe('')
    expect(d.message).toBe('')
  })

  it('a seeded order still gets its generated details', () => {
    const seeded = getPurchaseOrderDetail(purchaseOrders.find(o => !o.details)!.id)
    expect(seeded.trackingNo).toMatch(/^TRK/)
  })
})
