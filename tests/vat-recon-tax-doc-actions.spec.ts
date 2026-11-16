/**
 * VAT reconciliation — "Tax document not found" rows are real sales invoices, and
 * the action offered follows how far the invoice's own tax document got.
 */
import { describe, it, expect } from 'vitest'
import {
  pairsForPeriod, outputPairs, erpFakturOf, salesInvoiceTaxDocUrl, OUTPUT_NOT_IN_CORETAX_LINKS,
} from '~/data/vatReconciliation'
import { salesInvoices } from '~/data/salesInvoices'
import { canGenerateTaxDocument } from '~/data/salesInvoiceLineItems'
import { getSalesInvoiceDetail } from '~/data/salesInvoiceDetails'
import {
  addTaxDocument, updateTaxDocument, updateTaxDocumentStatus, getTaxDocument, removeTaxDocument,
} from '~/data/taxDocuments'

const notInCoretax = () => [
  ...outputPairs.filter(p => p.match === 'not-in-coretax'),
  ...pairsForPeriod('2027-03', 'output').filter(p => p.match === 'not-in-coretax'),
]

describe('Tax document not found — linked to real sales invoices', () => {
  it('every output row in that state points at an existing invoice', () => {
    const rows = notInCoretax()
    expect(rows.length).toBeGreaterThan(0)
    for (const p of rows) {
      const inv = salesInvoices.find(s => s.id === p.erp!.salesInvoiceId)
      expect(inv, p.id).toBeTruthy()
      expect(p.erp!.ref).toBe(String(inv!.number))
      expect(p.erp!.customer).toBe(inv!.customer.name)
    }
  })

  it('the row shows the invoice\'s own amounts', () => {
    for (const p of notInCoretax()) {
      const { totals } = getSalesInvoiceDetail(p.erp!.salesInvoiceId!)
      expect(p.erp!.total).toBe(totals.total)
      expect(p.erp!.ppn).toBe(totals.taxAmount)
      expect(p.erp!.dpp + p.erp!.ppn).toBe(p.erp!.total)
    }
  })

  it('every linked invoice can actually raise a tax document, and none is linked twice', () => {
    const ids = notInCoretax().map(p => p.erp!.salesInvoiceId!)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) {
      const inv = salesInvoices.find(s => s.id === id)!
      expect(inv.hasPpn, id).toBe(true)
      expect(canGenerateTaxDocument(id), id).toBe(true)
    }
    // Every link list entry is used — a seed count change can't silently drop one.
    // (Invoice rows only: 03/2027 also carries a Draft faktur with no SI — §5.1 row 13.)
    expect(pairsForPeriod('2027-03', 'output').filter(p => p.erp).length).toBe(OUTPUT_NOT_IN_CORETAX_LINKS['2027-03']!.length)
  })

  it('fixture invoice numbers never collide with a real invoice', () => {
    const real = new Set(salesInvoices.map(s => String(s.number)))
    for (const period of ['2026-10', '2026-11', '2026-12', '2027-01']) {
      for (const p of pairsForPeriod(period, 'output')) {
        if (p.erp && !p.erp.salesInvoiceId) expect(real.has(p.erp.ref), p.erp.ref).toBe(false)
      }
    }
  })
})

describe('Tax document not found — action follows the tax document state', () => {
  const row = (id: string) => notInCoretax().find(p => p.erp!.salesInvoiceId === id)!

  it('seeded states: none, draft, submitted', () => {
    expect(erpFakturOf(row('SI103'))?.state).toBe('none')
    expect(erpFakturOf(row('SI061'))?.state).toBe('draft')
    expect(erpFakturOf(row('SI043'))?.state).toBe('submitted')
  })

  it('creating a draft moves the row to draft, submitting moves it on', () => {
    const doc = addTaxDocument({
      salesInvoiceId: 'SI002', date: '02/11/2026', documentType: 'Output tax invoice',
      lane: 'domestic', djpCode: '01', docKind: 'FK', status: 'draft',
    })
    try {
      expect(erpFakturOf(row('SI002'))).toMatchObject({ state: 'draft', doc: { id: doc.id } })
      updateTaxDocumentStatus(doc.id, 'awaiting-approval')
      expect(erpFakturOf(row('SI002'))?.state).toBe('submitted')
      updateTaxDocumentStatus(doc.id, 'rejected')
      expect(erpFakturOf(row('SI002'))?.state).toBe('rejected')
    } finally {
      removeTaxDocument(doc.id)
    }
    expect(erpFakturOf(row('SI002'))?.state).toBe('none')
  })

  it('only Tax document not found rows carry a faktur action', () => {
    const matched = outputPairs.find(p => p.match === 'matched')!
    expect(erpFakturOf(matched)).toBeNull()
  })

  it('builds the new-tab URLs the invoice page acts on', () => {
    expect(salesInvoiceTaxDocUrl('SI103', 'create')).toBe('/sales-invoices/SI103?action=create-tax-document')
    expect(salesInvoiceTaxDocUrl('SI061', 'edit', 'taxdoc-seed-si061-draft'))
      .toBe('/sales-invoices/SI061?action=edit-tax-document&taxDocument=taxdoc-seed-si061-draft')
    expect(salesInvoiceTaxDocUrl('SI043', 'view')).toBe('/sales-invoices/SI043?tab=tax-document')
  })
})

describe('Editing a draft tax document', () => {
  it('rewrites the draft in place, keeping id and NSFP', () => {
    const doc = addTaxDocument({
      salesInvoiceId: 'SI013', date: '02/11/2026', documentType: 'Output tax invoice',
      lane: 'domestic', djpCode: '01', docKind: 'FK', status: 'draft',
    })
    try {
      const serial = doc.serial
      const updated = updateTaxDocument(doc.id, { djpCode: '04', status: 'draft' })
      expect(updated?.djpCode).toBe('04')
      expect(getTaxDocument(doc.id)?.serial).toBe(serial)
    } finally {
      removeTaxDocument(doc.id)
    }
  })

  it('refuses anything that is no longer a draft', () => {
    const doc = addTaxDocument({
      salesInvoiceId: 'SI013', date: '02/11/2026', documentType: 'Output tax invoice',
      lane: 'domestic', djpCode: '01', docKind: 'FK', status: 'awaiting-approval',
    })
    try {
      expect(updateTaxDocument(doc.id, { djpCode: '04' })).toBeNull()
      expect(getTaxDocument(doc.id)?.djpCode).toBe('01')
    } finally {
      removeTaxDocument(doc.id)
    }
  })
})
