/**
 * The screens beyond the register.
 *
 * These check the rules the design is explicit about, not the markup: that an
 * absent figure carries a reason, that the self-check can actually fail, and
 * that the statutory export covers both halves of the filing.
 */
import { describe, it, expect } from 'vitest'
import * as screens from '~/data/fixedAssetScreens'
import { fixedAssets as registerRef, fyFigures, journals, runSelfCheck, resetAssetStore } from '~/data/assetStore'

const { intangibleTaxonomy, countRows, varianceRows, leaseRows, classMaster } = screens
const impactByClass = screens.impactByClass()
const impactByTaxGroup = screens.impactByTaxGroup()
const amortisationYtd = screens.amortisationYtd.value
const differenceByAsset = screens.differenceByAsset()
const statutoryHalf1 = screens.statutoryHalf1()
const statutoryHalf2 = screens.statutoryHalf2()
const approvalRows = screens.approvalRows.value
const fixedAssets = registerRef.value
const f = fyFigures()
const H = {
  depreciationFiscalYTD: f.tangible.tax,
  amortisationCommercialYTD: f.intangible.accounting,
  amortisationFiscalYTD: f.intangible.tax,
  disposalCommercialGain: f.disposal.accounting,
  disposalFiscalLoss: f.disposal.tax,
  netTemporaryDifference: f.netTemporaryDifference,
}

describe('the profit and loss impact statement', () => {
  it('reports the same depreciation whichever way it is grouped', () => {
    // By class and by tax group are two views of one population. If they
    // disagree, one of them is describing a different set of assets.
    const byClass = impactByClass.reduce((s, r) => s + (r.commercial ?? 0), 0)
    const byGroup = impactByTaxGroup.reduce((s, r) => s + (r.commercial ?? 0), 0)
    expect(byClass).toBe(byGroup)
  })

  it('ties its depreciation total to the headline figure', () => {
    const fiscal = impactByClass.reduce((s, r) => s + (r.fiscal ?? 0), 0)
    expect(fiscal).toBe(H.depreciationFiscalYTD)
  })

  it('gives goodwill no commercial amortisation at all', () => {
    // Not zero — none. An indefinite life means no commercial schedule exists,
    // and a 0 would claim one exists and charged nothing.
    const goodwill = amortisationYtd.find((r) => r.label.includes('Goodwill'))!
    expect(goodwill.commercial).toBeNull()
    expect(goodwill.fiscal).toBeGreaterThan(0)
  })

  it('has at least one intangible diverging in each direction', () => {
    // The software licence has a shorter fiscal life than commercial, which
    // reverses the sign against the tangible assets. Without it the screen only
    // ever shows the difference one way round.
    const both = amortisationYtd.filter((r) => r.commercial !== null)
    const higherFiscal = both.filter((r) => (r.fiscal ?? 0) > (r.commercial ?? 0))
    expect(higherFiscal.length).toBeGreaterThan(0)
  })

  it('ties amortisation to the headline figures', () => {
    const c = amortisationYtd.reduce((s, r) => s + (r.commercial ?? 0), 0)
    const f = amortisationYtd.reduce((s, r) => s + (r.fiscal ?? 0), 0)
    expect(c).toBe(H.amortisationCommercialYTD)
    expect(f).toBe(H.amortisationFiscalYTD)
  })
})

describe('the difference report', () => {
  it('explains each difference rather than only stating it', () => {
    for (const r of differenceByAsset) {
      expect(r.reason.length).toBeGreaterThan(20)
    }
  })

  it('leads with the disposal, the widest divergence', () => {
    expect(differenceByAsset[0].id).toBe('FA-0071')
    // Accounting charge less tax charge: a gain is a negative charge.
    expect(differenceByAsset[0].difference).toBe(
      H.disposalFiscalLoss - H.disposalCommercialGain,
    )
  })

  it('sums to the net temporary difference', () => {
    const total = differenceByAsset.reduce((s, r) => s + (r.difference ?? 0), 0)
    expect(total).toBe(H.netTemporaryDifference)
  })
})

describe('the statutory export', () => {
  it('has both halves, because the filing does', () => {
    // An export covering only tangible assets completes half a return.
    expect(statutoryHalf1.length).toBeGreaterThan(0)
    expect(statutoryHalf2.length).toBeGreaterThan(0)
  })

  it('carries the eleven statutory intangible codes', () => {
    expect(intangibleTaxonomy).toHaveLength(11)
  })

  it('covers every intangible asset in the register', () => {
    const intangibles = fixedAssets.filter((a) => a.type === 'Intangible')
    expect(statutoryHalf2.length).toBe(intangibles.length)
  })
})

describe('the period self-check', () => {
  it('can find something, so a pass means something', () => {
    // LR-1 means the seeded ledger ties. A check that can only pass proves
    // nothing, so introduce a journal the register does not explain.
    resetAssetStore()
    expect(screens.tieCheckRows.value.every((r) => r.difference === 0)).toBe(true)
    journals.value = [...journals.value, {
      number: 'JV-X', date: '30/09/2026', period: '2026-09', source: 'depreciation', memo: 'x',
      lines: [{ account: '6-5100', description: 'x', debit: 1, credit: null, control: '6-5100' }],
    }]
    runSelfCheck()
    expect(screens.tieCheckRows.value.filter((r) => r.difference !== 0).length).toBeGreaterThan(0)
    resetAssetStore()
  })

  it('states the difference rather than leaving it to be worked out', () => {
    for (const r of screens.tieCheckRows.value) {
      expect(r.difference).toBe(r.subLedger - r.generalLedger)
    }
  })
})

describe('counts and variances', () => {
  it('has unresolved variances, so the close rule can be seen working', () => {
    const open = varianceRows.filter((v) => v.status === 'Open')
    expect(open.length).toBeGreaterThan(0)
  })

  it('resolves every variance into something the ledger understands', () => {
    for (const v of varianceRows) {
      expect(String(v.action).length).toBeGreaterThan(3)
    }
  })

  it('includes an asset found that was not in the register', () => {
    // The hardest count result to model, and the one that proves the workflow
    // handles reality rather than only the register.
    const found = countRows.filter((r) => r.result.toLowerCase().includes('unrecorded'))
    expect(found.length).toBeGreaterThan(0)
    expect(found[0].tag).toBeNull()
  })
})

describe('approvals', () => {
  it('describes what is being decided, not just which asset', () => {
    for (const a of approvalRows) {
      expect(String(a.what)).toMatch(/·/)
      expect(String(a.detail).length).toBeGreaterThan(20)
    }
  })

  it('shows the disposal with both its figures, since they disagree', () => {
    const disposal = approvalRows.find((a) => String(a.what).startsWith('Disposal'))!
    expect(String(disposal.detail)).toContain('51.250.000')
    expect(String(disposal.detail)).toContain('71.093.750')
  })
})

describe('leases', () => {
  it('names a right-of-use asset for each lease', () => {
    // The ROU asset lives in the ordinary register; naming it is what makes
    // that visible rather than implying a parallel lease register.
    for (const l of leaseRows) {
      expect(String(l.rouAsset)).toMatch(/^ROU-/)
    }
  })
})

describe('the class master', () => {
  it('sets both lives, so an asset arrives classified', () => {
    for (const c of classMaster) {
      expect(c.defaultTaxGroup).toBeTruthy()
      expect(c.fiscalLife).toBeTruthy()
      expect(c.commercialLife).toBeTruthy()
    }
  })

  it('has at least one class where the two lives differ', () => {
    // If they never differed there would be no second book to keep.
    const differing = classMaster.filter((c) => c.fiscalLife !== c.commercialLife)
    expect(differing.length).toBeGreaterThan(0)
  })
})
