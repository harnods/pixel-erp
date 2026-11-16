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
  taxDocMenuItemDefs, taxDocumentStatus, taxDocumentStamp, getApprovedTaxDocument,
  updateTaxDocumentStatus, normalizeTaxDocument, DJP_STATUS_CONFIG, TAX_DOCUMENT_STATUS_LABELS,
  type TaxDocument,
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

  // PRD-05 moved faktur numbering onto DJP's real structure: 2-digit kode
  // transaksi + 1 status digit + 13-digit NSFP = 16. This test still asserted the
  // earlier 15-digit-serial simplification, which the implementation replaced —
  // the status digit is what makes a Normal faktur and its pengganti differ in
  // exactly one character, so it has to be in the number.
  it('an approved document formats Number as kode transaksi + status digit + its 13-digit NSFP', () => {
    const doc = addTaxDocument({
      salesInvoiceId: 'inv-taxdoc-approved', date: '09/08/2026', documentType: 'Output tax invoice', paymentStage: 'down-payment', lane: 'domestic', djpCode: '04', status: 'approved',
    })
    expect(doc.serial).toHaveLength(13)
    // revision 0 → status digit 0
    expect(formatTaxDocumentNumber(doc)).toBe(`040${doc.serial}`)
    expect(formatTaxDocumentNumber(doc)).toHaveLength(16)
  })

  it('draft leaves Edit and Delete enabled with no tooltip', () => {
    const doc = addTaxDocument({
      salesInvoiceId: 'inv-taxdoc-menu-draft', date: '09/08/2026', documentType: 'Output tax invoice',
      lane: 'domestic', djpCode: '01', status: 'draft',
    })
    const [, , edit, del] = taxDocMenuItemDefs(doc)
    expect(edit).toEqual({ label: 'Edit', disabled: false, tooltip: undefined })
    expect(del).toEqual({ label: 'Delete', disabled: false, tooltip: undefined })
  })

  it('once submitted (awaiting-approval, approved, rejected), Edit and Delete are disabled with an explanatory tooltip', () => {
    for (const status of ['awaiting-approval', 'approved', 'rejected'] as const) {
      const doc = addTaxDocument({
        salesInvoiceId: `inv-taxdoc-menu-${status}`, date: '09/08/2026', documentType: 'Output tax invoice',
        lane: 'domestic', djpCode: '01', status,
      })
      const items = taxDocMenuItemDefs(doc)
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
    expect(formatTaxDocumentNumber(doc)).toBe(`130${doc.serial}`)
  })

  /**
   * rule/efaktur-status-axes — DJP status (what DJP replied) and Tax document
   * status (the faktur's own kode status, PER-11/PJ/2025 Lampiran D.2.b.2) are
   * separate. These pin the split so neither can quietly re-absorb the other.
   */
  describe('the two status axes stay separate', () => {
    it('DJP status carries only approval states — never replaced/cancelled', () => {
      expect(Object.keys(DJP_STATUS_CONFIG).sort()).toEqual(
        ['approved', 'awaiting-approval', 'awaiting-from-buyer', 'draft', 'rejected'],
      )
    })

    it('tax document status offers Normal/Pengganti/Pembatalan/Diganti/Dibatalkan/Nota retur — and no pembetulan', () => {
      expect(Object.keys(TAX_DOCUMENT_STATUS_LABELS).sort()).toEqual(
        ['cancellation', 'cancelled', 'normal', 'replaced', 'replacement', 'return-note'],
      )
    })

    it('a snapshot stored with status replaced/cancelled migrates to approved + supersededAs', () => {
      // Exactly what a localStorage snapshot written before the split looks like;
      // normalizeTaxDocument is what every load runs it through.
      for (const legacy of ['replaced', 'cancelled'] as const) {
        const stored = {
          id: `legacy-${legacy}`, salesInvoiceId: 'inv-taxdoc-legacy', date: '09/08/2026',
          documentType: 'Output tax invoice', lane: 'domestic', djpCode: '01',
          serial: '2500001234567', kind: 'normal', revision: 0,
          status: legacy,
        } as unknown as TaxDocument

        const migrated = normalizeTaxDocument(stored)
        expect(migrated.status).toBe('approved')
        expect(migrated.supersededAs).toBe(legacy)
        expect(taxDocumentStatus(migrated)).toBe(legacy)
        // Its number survives the migration — it was issued and stays on file.
        expect(formatTaxDocumentNumber(migrated)).toBe(`010${stored.serial}`)
      }
    })

    it('normalizing a document that was never superseded leaves both axes alone', () => {
      const migrated = normalizeTaxDocument({
        id: 'legacy-plain', salesInvoiceId: 'inv-taxdoc-legacy', date: '09/08/2026',
        documentType: 'Output tax invoice', lane: 'domestic', djpCode: '01',
        serial: '2500001234567', kind: 'normal', revision: 0, status: 'approved',
      } as TaxDocument)
      expect(migrated.status).toBe('approved')
      expect(migrated.supersededAs).toBeUndefined()
      expect(taxDocumentStatus(migrated)).toBe('normal')
    })

    it('approving a replacement leaves the superseded faktur APPROVED and marks its lineage', () => {
      const source = addTaxDocument({
        salesInvoiceId: 'inv-taxdoc-lineage', date: '09/08/2026', documentType: 'Output tax invoice',
        lane: 'domestic', djpCode: '01', status: 'approved',
      })
      const pengganti = addTaxDocument({
        salesInvoiceId: 'inv-taxdoc-lineage', date: '10/08/2026', documentType: 'Output tax invoice',
        lane: 'domestic', djpCode: '01', status: 'awaiting-approval',
        kind: 'replacement', revision: 1, replacesId: source.id, serial: source.serial,
      })
      updateTaxDocumentStatus(pengganti.id, 'approved')

      // DJP never un-approved it — only the lineage moved.
      expect(source.status).toBe('approved')
      expect(source.supersededAs).toBe('replaced')
      expect(taxDocumentStatus(source)).toBe('replaced')
      expect(taxDocumentStatus(pengganti)).toBe('replacement')
      // ...so it still prints its number, under a DIGANTI cap.
      expect(formatTaxDocumentNumber(source)).toHaveLength(16)
      expect(taxDocumentStamp(source)).toBe('DIGANTI')
      // ...and a later edit must answer to the pengganti, not the superseded one.
      expect(getApprovedTaxDocument('inv-taxdoc-lineage')?.id).toBe(pengganti.id)
    })

    it('a superseded faktur is locked as a historical record, not as "submitted to DJP"', () => {
      const doc: TaxDocument = {
        ...addTaxDocument({
          salesInvoiceId: 'inv-taxdoc-superseded-menu', date: '09/08/2026', documentType: 'Output tax invoice',
          lane: 'domestic', djpCode: '01', status: 'approved',
        }),
        supersededAs: 'cancelled',
      }
      const items = taxDocMenuItemDefs(doc)
      expect(items.map(i => i.label)).toContain('Print e-faktur')
      expect(items.find(i => i.label === 'Edit')?.tooltip)
        .toBe('Cannot be changed because it is kept as a historical record')
      expect(taxDocumentStamp(doc)).toBe('BATAL')
    })
  })
})
