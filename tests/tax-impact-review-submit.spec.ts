// @vitest-environment happy-dom
/**
 * "Review tax impact" — the Save-as-draft / Save-&-submit-to-DJP pair.
 *
 * Raising a correction now offers the same choice as raising the original faktur
 * in CreateTaxDocumentDrawer, instead of only ever producing a draft. Two things
 * are easy to get wrong and are pinned here:
 *
 *  - a RETURN NOTE must never offer submit — the buyer issues the nota retur, we
 *    only record that we are waiting on it;
 *  - a CANCELLATION generates TWO documents (the Cancellation and the fresh
 *    Normal faktur for the corrected transaction) and submitting sends BOTH.
 */
import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import TaxImpactReviewDrawer from '~/components/patterns/TaxImpactReviewDrawer.vue'
import ErpDrawer from '~/components/patterns/ErpDrawer.vue'
import {
  addTaxDocument, generateChangeDrafts, updateTaxDocumentStatus, getTaxDocumentsForInvoice,
  taxDocumentStatus, type TaxDocument,
} from '~/data/taxDocuments'
import type { DetectedTaxChange, TaxAction } from '~/data/taxDocumentChanges'

const CHANGES: DetectedTaxChange[] = [{
  key: 'dpp', label: 'Dasar pengenaan pajak (DPP)', action: 'replacement',
  reason: 'The tax base reported to DJP changed.',
  before: 'Rp39.639.640,00', after: 'Rp39.724.640,00',
}]

function approvedDoc(invoiceId: string): TaxDocument {
  return addTaxDocument({
    salesInvoiceId: invoiceId, date: '21/10/2026', documentType: 'Output tax invoice',
    lane: 'domestic', djpCode: '04', status: 'approved',
  })
}

function mountDrawer(action: TaxAction, extra: Record<string, unknown> = {}) {
  return mount(TaxImpactReviewDrawer, {
    props: {
      isOpen: true, action, changes: CHANGES,
      sourceDocument: approvedDoc(`inv-tir-${action}-${Math.random()}`),
      ...extra,
    },
    global: { components: { ErpDrawer }, stubs: { Teleport: true } },
  })
}

const footerLabels = (w: ReturnType<typeof mountDrawer>) =>
  w.findAll('.tir-footer button').map(b => b.text())

describe('Review tax impact — draft vs submit', () => {
  it('offers Save as draft + Save & submit to DJP on a replacement', () => {
    expect(footerLabels(mountDrawer('replacement')))
      .toEqual(['Back to editing', 'Save as draft', 'Save & submit to DJP'])
  })

  it('offers the same pair on a cancellation', () => {
    expect(footerLabels(mountDrawer('cancellation')))
      .toEqual(['Back to editing', 'Save as draft', 'Save & submit to DJP'])
  })

  it('never offers submit for a return note — the buyer issues it, not us', () => {
    const labels = footerLabels(mountDrawer('return-note', { trigger: 'sales-return' }))
    expect(labels).not.toContain('Save & submit to DJP')
    expect(labels).toHaveLength(2)
    expect(labels[0]).toBe('Close')
  })

  it('emits confirm(false) from Save as draft and confirm(true) from Save & submit', async () => {
    const w = mountDrawer('replacement')
    const [, draftBtn, submitBtn] = w.findAll('.tir-footer button')
    await draftBtn!.trigger('click')
    await submitBtn!.trigger('click')
    expect(w.emitted('confirm')).toEqual([[false], [true]])
  })

  it('submitting a cancellation sends BOTH generated documents to DJP', () => {
    const invoiceId = 'inv-tir-cancel-both'
    const source = approvedDoc(invoiceId)
    const drafts = generateChangeDrafts({
      source, action: 'cancellation', changes: CHANGES, date: '21/10/2026',
      invoiceSnapshot: { total: 0, dpp: 0, ppn: 0, lines: [] } as never,
    })

    // The Cancellation plus the fresh Normal faktur for the corrected transaction.
    expect(drafts).toHaveLength(2)
    expect(drafts.map(taxDocumentStatus).sort()).toEqual(['cancellation', 'normal'])
    expect(drafts.every(d => d.status === 'draft')).toBe(true)

    // What the handler does for "Save & submit to DJP".
    drafts.forEach(d => updateTaxDocumentStatus(d.id, 'awaiting-approval'))
    expect(drafts.every(d => d.status === 'awaiting-approval')).toBe(true)

    // The source faktur is untouched until DJP actually approves the cancellation.
    expect(source.status).toBe('approved')
    expect(source.supersededAs).toBeUndefined()
    expect(getTaxDocumentsForInvoice(invoiceId)).toHaveLength(3)
  })
})
