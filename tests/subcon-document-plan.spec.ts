/**
 * The document plan — PRD Rev 5 R1 / R17. The vendor's work has no purchase
 * delivery on any method; the only delivery is Dropship's raw material.
 */
import { describe, it, expect } from 'vitest'
import { buildDocumentPlan, docMatchesStep } from '../app/data/subcon'

const kinds = (method: 'basic' | 'resupply' | 'dropship') =>
  buildDocumentPlan('finished-good', 'full', method).map(s => s.kind)

describe('buildDocumentPlan — finished good, full quantity', () => {
  it('Basic: service PR → PO → PI', () => {
    expect(kinds('basic')).toEqual(['subconPr', 'purchaseOrder', 'purchaseInvoice'])
  })

  it('Resupply: transfer → service PR → component issue → PO → PI', () => {
    expect(kinds('resupply')).toEqual(['transfer', 'subconPr', 'componentIssue', 'purchaseOrder', 'purchaseInvoice'])
  })

  it('Dropship runs two chains: component PR → PO → PD, then service PR → … → PI', () => {
    expect(kinds('dropship')).toEqual([
      'componentPr', 'componentOrder', 'componentDelivery',
      'subconPr', 'componentIssue', 'purchaseOrder', 'purchaseInvoice',
    ])
  })

  it.each(['basic', 'resupply', 'dropship'] as const)('%s plans no delivery for the vendor’s work', (m) => {
    expect(kinds(m)).not.toContain('purchaseDelivery')
  })
})

describe('docMatchesStep — the two Dropship threads are told apart by the request they grew from', () => {
  const componentPo = { kind: 'purchaseOrder', fromKind: 'componentPr' }
  const servicePo = { kind: 'purchaseOrder' }
  const delivery = { kind: 'purchaseDelivery', fromKind: 'componentPr' }

  it('a component order is the component step, not the vendor’s work', () => {
    expect(docMatchesStep(componentPo, 'componentOrder')).toBe(true)
    expect(docMatchesStep(componentPo, 'purchaseOrder')).toBe(false)
    expect(docMatchesStep(servicePo, 'purchaseOrder')).toBe(true)
    expect(docMatchesStep(servicePo, 'componentOrder')).toBe(false)
  })

  it('a raised delivery satisfies the component delivery step', () => {
    expect(docMatchesStep(delivery, 'componentDelivery')).toBe(true)
  })
})
