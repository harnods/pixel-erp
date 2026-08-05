/**
 * Coherence checks for the Work Orders seed data (Production ▸ Work orders).
 *
 * Rules validated:
 *   1. Every work order's bomId resolves to a real billOfMaterials record — a WO
 *      cannot exist without an already-created BOM (no orphan bomId).
 *   2. The denormalized bomName equals the referenced BOM's name (denormalization
 *      stays consistent with its source of truth).
 *   3. Any workOrder carrying a parentNumber points to an existing WO number
 *      (parent/child integrity).
 * Plus: addWorkOrder appends with a generated id + well-formed WO number.
 */
import { describe, it, expect } from 'vitest'
import { workOrders, addWorkOrder } from '~/data/workOrders'
import { billOfMaterials } from '~/data/billOfMaterials'

const bomById = new Map(billOfMaterials.map(b => [b.id, b]))

describe('Work order ↔ BOM coherence', () => {
  it('every bomId resolves to a real billOfMaterials record', () => {
    const failures: string[] = []
    for (const wo of workOrders) {
      if (!bomById.has(wo.bomId)) {
        failures.push(`${wo.number}: bomId "${wo.bomId}" not found in billOfMaterials`)
      }
    }
    if (failures.length) console.error('\nORPHAN bomId:\n' + failures.map(f => '  • ' + f).join('\n'))
    expect(failures).toHaveLength(0)
  })

  it('denormalized bomName matches the referenced BOM name', () => {
    const failures: string[] = []
    for (const wo of workOrders) {
      const bom = bomById.get(wo.bomId)
      if (bom && bom.name !== wo.bomName) {
        failures.push(`${wo.number}: bomName "${wo.bomName}" ≠ BOM.name "${bom.name}"`)
      }
    }
    if (failures.length) console.error('\nDENORMALIZATION DRIFT:\n' + failures.map(f => '  • ' + f).join('\n'))
    expect(failures).toHaveLength(0)
  })
})

describe('Work order parent/child integrity', () => {
  it('every parentNumber points to an existing work order number', () => {
    const numbers = new Set(workOrders.map(w => w.number))
    const failures: string[] = []
    for (const wo of workOrders) {
      if (wo.parentNumber && !numbers.has(wo.parentNumber)) {
        failures.push(`${wo.number}: parentNumber "${wo.parentNumber}" has no matching work order`)
      }
    }
    if (failures.length) console.error('\nORPHAN parentNumber:\n' + failures.map(f => '  • ' + f).join('\n'))
    expect(failures).toHaveLength(0)
  })
})

describe('addWorkOrder', () => {
  it('appends a new WO referencing an existing BOM, with a generated id + number', () => {
    const bom = billOfMaterials[0]!
    const before = workOrders.length
    const wo = addWorkOrder({
      bomId: bom.id, bomName: bom.name,
      category: 'Standard', type: 'Assembly', trackRouting: false,
      status: 'not started', producedQty: 0, plannedQty: 10,
      planStartDate: '2026-08-01', planEndDate: '2026-08-05',
    })
    expect(workOrders.length).toBe(before + 1)
    expect(wo.id).toMatch(/^wo-new-\d+$/)
    expect(wo.number).toMatch(/^WO-2026-\d{4}$/)
    // unshifted — newest first
    expect(workOrders[0]!.id).toBe(wo.id)
    // still coherent: its bomId resolves
    expect(billOfMaterials.some(b => b.id === wo.bomId)).toBe(true)
  })
})
