/**
 * Coherence checks for the Bill of Materials seed data (Production ▸ Bill of materials).
 *
 * Rule validated: every product reference on every BOM is a REAL registered
 * product id from CATALOG — nothing is a loose/orphan string. Specifically:
 *   1. Each rawMaterials[].productId resolves to a CATALOG product.
 *   2. finishedGoodId resolves to a CATALOG product.
 *   3. Each otherOutputs[].productId resolves to a CATALOG product.
 * Also: every BOM carries a unique id and a well-formed "Bill of Materials #N" number.
 *
 * Uses the failure-collection pattern (collect issues, assert length 0) so a single
 * run surfaces every orphan at once.
 */
import { describe, it, expect } from 'vitest'
import { billOfMaterials } from '~/data/billOfMaterials'
import { CATALOG } from '~/data/catalog'

const catalogIds = new Set(CATALOG.map(p => p.id))

describe('BOM ↔ CATALOG coherence — no orphan product references', () => {
  it('every rawMaterials productId is a real CATALOG id', () => {
    const failures: string[] = []
    for (const bom of billOfMaterials) {
      for (const rm of bom.rawMaterials) {
        if (!catalogIds.has(rm.productId)) {
          failures.push(`${bom.number} (${bom.name}): rawMaterial productId "${rm.productId}" not in CATALOG`)
        }
      }
    }
    if (failures.length) console.error('\nORPHAN RAW MATERIALS:\n' + failures.map(f => '  • ' + f).join('\n'))
    expect(failures).toHaveLength(0)
  })

  it('every finishedGoodId is a real CATALOG id', () => {
    const failures: string[] = []
    for (const bom of billOfMaterials) {
      if (!catalogIds.has(bom.finishedGoodId)) {
        failures.push(`${bom.number}: finishedGoodId "${bom.finishedGoodId}" not in CATALOG`)
      }
    }
    if (failures.length) console.error('\nORPHAN FINISHED GOODS:\n' + failures.map(f => '  • ' + f).join('\n'))
    expect(failures).toHaveLength(0)
  })

  it('every otherOutputs productId is a real CATALOG id', () => {
    const failures: string[] = []
    for (const bom of billOfMaterials) {
      for (const oo of bom.otherOutputs) {
        if (!catalogIds.has(oo.productId)) {
          failures.push(`${bom.number}: otherOutput productId "${oo.productId}" not in CATALOG`)
        }
      }
    }
    if (failures.length) console.error('\nORPHAN OTHER OUTPUTS:\n' + failures.map(f => '  • ' + f).join('\n'))
    expect(failures).toHaveLength(0)
  })

  it('every BOM has a unique id and a well-formed number', () => {
    const seenIds = new Set<string>()
    const dupes: string[] = []
    const badNumbers: string[] = []
    for (const bom of billOfMaterials) {
      if (seenIds.has(bom.id)) dupes.push(bom.id)
      seenIds.add(bom.id)
      if (!/^Bill of Materials #\d+$/.test(bom.number)) badNumbers.push(bom.number)
    }
    expect(dupes).toHaveLength(0)
    expect(badNumbers).toHaveLength(0)
  })
})
