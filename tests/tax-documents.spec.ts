/**
 * Coherence checks for the tax-document store (Sales Invoice detail ▸ Actions ▸
 * Create tax document ▸ Save as draft / Save & submit to DJP).
 *
 * Pins two behaviors the "Create tax document" drawer and the detail page's
 * "Tax document" tab both depend on:
 *  - hasDownPaymentTaxDocument() is what gates the drawer's Settlement→
 *    "Invoice number reference" picker (hidden until a Down payment doc exists
 *    for that invoice — see CreateTaxDocumentDrawer.vue's hasPriorDownPayment).
 *  - formatTaxDocumentNumber() only reveals a real DJP number once a document
 *    is 'approved'; every other status renders an em dash.
 */
import { describe, it, expect } from 'vitest'
import {
  addTaxDocument, getTaxDocumentsForInvoice, hasDownPaymentTaxDocument, formatTaxDocumentNumber,
  taxDocMenuItemDefs,
} from '~/data/taxDocuments'

describe('tax-document store', () => {
  it('an invoice with no tax documents yet has no down-payment document on file', () => {
    expect(hasDownPaymentTaxDocument('inv-taxdoc-fresh')).toBe(false)
    expect(getTaxDocumentsForInvoice('inv-taxdoc-fresh')).toHaveLength(0)
  })

  it('addTaxDocument records against the right invoice and flips hasDownPaymentTaxDocument', () => {
    const invoiceId = 'inv-taxdoc-dp'
    expect(hasDownPaymentTaxDocument(invoiceId)).toBe(false)

    addTaxDocument({
      salesInvoiceId: invoiceId, date: '09/08/2026', documentType: 'Output tax invoice', paymentStage: 'down-payment', lane: 'domestic', djpCode: '01', status: 'draft',
    })

    expect(hasDownPaymentTaxDocument(invoiceId)).toBe(true)
    expect(getTaxDocumentsForInvoice(invoiceId)).toHaveLength(1)
    // a settlement recorded elsewhere must never leak into this invoice's list
    expect(hasDownPaymentTaxDocument('inv-taxdoc-unrelated')).toBe(false)
  })

  it('a settlement document does not itself count as a down payment', () => {
    const invoiceId = 'inv-taxdoc-settlement-only'
    addTaxDocument({
      salesInvoiceId: invoiceId, date: '09/08/2026', documentType: 'Output tax invoice', paymentStage: 'settlement', lane: 'domestic', djpCode: '01', status: 'awaiting-approval',
    })
    expect(hasDownPaymentTaxDocument(invoiceId)).toBe(false)
  })

  it('draft, awaiting-approval, and rejected documents show an em dash for Number', () => {
    for (const status of ['draft', 'awaiting-approval', 'rejected'] as const) {
      const doc = addTaxDocument({
        salesInvoiceId: 'inv-taxdoc-number', date: '09/08/2026', documentType: 'Output tax invoice', paymentStage: 'down-payment', lane: 'domestic', djpCode: '04', status,
      })
      expect(formatTaxDocumentNumber(doc)).toBe('—')
    }
  })

  it('an approved document formats Number as DJP code + its 15-digit serial', () => {
    const doc = addTaxDocument({
      salesInvoiceId: 'inv-taxdoc-approved', date: '09/08/2026', documentType: 'Output tax invoice', paymentStage: 'down-payment', lane: 'domestic', djpCode: '04', status: 'approved',
    })
    expect(doc.serial).toHaveLength(15)
    expect(formatTaxDocumentNumber(doc)).toBe(`04${doc.serial}`)
  })

  it('draft leaves Edit and Delete enabled with no tooltip', () => {
    const [, , edit, del] = taxDocMenuItemDefs('draft')
    expect(edit).toEqual({ label: 'Edit', disabled: false, tooltip: undefined })
    expect(del).toEqual({ label: 'Delete', disabled: false, tooltip: undefined })
  })

  it('once submitted (awaiting-approval, approved, rejected), Edit and Delete are disabled with an explanatory tooltip', () => {
    for (const status of ['awaiting-approval', 'approved', 'rejected'] as const) {
      const items = taxDocMenuItemDefs(status)
      const edit = items.find(i => i.label === 'Edit')!
      const del = items.find(i => i.label === 'Delete')!
      expect(edit.disabled).toBe(true)
      expect(edit.tooltip).toBe('Cannot be edited because it has been submitted to DJP')
      expect(del.disabled).toBe(true)
      expect(del.tooltip).toBe('Cannot be deleted because it has been submitted to DJP')
    }
  })

  // ── Foreign lane (CreateTaxDocumentDrawer.vue's "Scenario state" switch) ─────
  it('a foreign document persists its lane, transaction-detail code, and PEB reference', () => {
    const doc = addTaxDocument({
      salesInvoiceId: 'inv-taxdoc-foreign-peb', date: '09/08/2026', documentType: 'Output tax invoice',
      paymentStage: 'down-payment', lane: 'foreign', djpCode: '11', pebReference: 'PEB-0012345',
      status: 'draft',
    })
    expect(doc.lane).toBe('foreign')
    expect(doc.djpCode).toBe('11')
    expect(doc.pebReference).toBe('PEB-0012345')
    expect(doc.exportNoticeReference).toBeUndefined()
    expect(doc.classificationCode).toBeUndefined()
  })

  it('a foreign document under code 12/13 persists export notice + classification code instead of PEB', () => {
    const doc = addTaxDocument({
      salesInvoiceId: 'inv-taxdoc-foreign-export', date: '09/08/2026', documentType: 'Output tax invoice',
      paymentStage: 'down-payment', lane: 'foreign', djpCode: '12',
      exportNoticeReference: 'EN-998877', classificationCode: 'CC-01',
      status: 'draft',
    })
    expect(doc.lane).toBe('foreign')
    expect(doc.exportNoticeReference).toBe('EN-998877')
    expect(doc.classificationCode).toBe('CC-01')
    expect(doc.pebReference).toBeUndefined()
  })

  it('an approved foreign document formats Number the same way as a domestic one', () => {
    const doc = addTaxDocument({
      salesInvoiceId: 'inv-taxdoc-foreign-approved', date: '09/08/2026', documentType: 'Output tax invoice',
      paymentStage: 'down-payment', lane: 'foreign', djpCode: '13', exportNoticeReference: 'EN-1', classificationCode: 'CC-1',
      status: 'approved',
    })
    expect(formatTaxDocumentNumber(doc)).toBe(`13${doc.serial}`)
  })
})
