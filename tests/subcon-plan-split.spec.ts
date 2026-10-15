/**
 * The document plan read as two flows: getting the vendor its materials, and
 * buying the vendor's work. On Dropship both flows run a request and an order,
 * so a single chain read as if the same PR → PO happened twice.
 */
import { describe, it, expect } from 'vitest'
import { buildDocumentPlan, splitDocumentPlan } from '../app/data/subcon'

const kinds = (steps: { kind: string }[]) => steps.map(s => s.kind)

describe('splitDocumentPlan', () => {
  it('Resupply: transfer and issue are the materials; PR → PO → PI is the work', () => {
    const { rawMaterial, subconCost } = splitDocumentPlan(buildDocumentPlan('finished-good', 'full', 'resupply'))
    expect(kinds(rawMaterial)).toEqual(['transfer', 'componentIssue'])
    expect(kinds(subconCost)).toEqual(['subconPr', 'purchaseOrder', 'purchaseInvoice'])
  })

  it('Dropship: the material thread has its own request, order and delivery', () => {
    const { rawMaterial, subconCost } = splitDocumentPlan(buildDocumentPlan('finished-good', 'full', 'dropship'))
    expect(kinds(rawMaterial)).toEqual(['componentPr', 'componentOrder', 'componentDelivery', 'componentIssue'])
    expect(kinds(subconCost)).toEqual(['subconPr', 'purchaseOrder', 'purchaseInvoice'])
  })

  it('Basic has no material flow — the vendor supplies its own', () => {
    const { rawMaterial, subconCost } = splitDocumentPlan(buildDocumentPlan('finished-good', 'full', 'basic'))
    expect(rawMaterial).toEqual([])
    expect(kinds(subconCost)).toEqual(['subconPr', 'purchaseOrder', 'purchaseInvoice'])
  })

  it('loses nothing and keeps the plan order within each flow', () => {
    for (const method of ['basic', 'resupply', 'dropship'] as const) {
      const plan = buildDocumentPlan('finished-good', 'full', method)
      const { rawMaterial, subconCost } = splitDocumentPlan(plan)
      expect(rawMaterial.length + subconCost.length).toBe(plan.length)
      expect(kinds(rawMaterial)).toEqual(kinds(plan).filter(k => kinds(rawMaterial).includes(k)))
    }
  })
})
