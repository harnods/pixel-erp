/**
 * Asset record — the FY2026 monthly schedule and the headline figures.
 *
 * These assert the rules the design states, not the markup:
 *
 *  - A schedule's rows must add up to its own total. A preparer checking a
 *    figure against their spreadsheet will add the column, and a run that
 *    does not tie is the one defect that sends them back to the spreadsheet.
 *  - An absent charge says why it is absent. Never a zero, and never the
 *    wrong reason: 'Disposed' and 'Not computed' are different claims.
 *  - The months an asset entered service, was impaired, or was disposed are
 *    named on the row they happened in.
 */
import { describe, it, expect } from 'vitest'
import { fixedAssets, assetChargeYtd } from '~/data/fixedAssets'
import {
  monthlySchedule, scheduleTotal, detailFigures, derivation,
} from '~/data/fixedAssetDetail'

const byId = (id: string) => fixedAssets.find((a) => a.id === id)!

describe('the FY2026 schedule', () => {
  it('covers January through September — the periods closed so far', () => {
    for (const a of fixedAssets) {
      const rows = monthlySchedule(a)
      expect(rows).toHaveLength(9)
      expect(rows[0]!.period).toBe('January 2026')
      expect(rows[8]!.period).toBe('September 2026')
    }
  })

  it('adds up to the approved year-to-date figure, on both books', () => {
    for (const a of fixedAssets) {
      const ytd = assetChargeYtd[a.id]
      if (!ytd) continue // intangibles carry no transcribed YTD row
      const total = scheduleTotal(monthlySchedule(a))
      expect(total.accounting ?? 0).toBe(ytd.commercial)
      if (ytd.fiscal !== null) expect(total.tax ?? 0).toBe(ytd.fiscal)
    }
  })

  it('never lands the rounding residual in one odd month', () => {
    // Cumulative rounding: consecutive charges differ by at most one rupiah,
    // so no month reads as a mistake.
    for (const a of fixedAssets) {
      if (a.status === 'Impaired') continue // a real step change, not rounding
      const charges = monthlySchedule(a)
        .map((r) => r.accounting)
        .filter((v): v is number => v !== null)
      for (let i = 1; i < charges.length; i++) {
        expect(Math.abs(charges[i]! - charges[i - 1]!)).toBeLessThanOrEqual(1)
      }
    }
  })

  it('gives every whole-rupiah charge, never a fraction', () => {
    for (const a of fixedAssets) {
      for (const r of monthlySchedule(a)) {
        if (r.accounting !== null) expect(Number.isInteger(r.accounting)).toBe(true)
        if (r.tax !== null) expect(Number.isInteger(r.tax)).toBe(true)
      }
    }
  })
})

describe('an absent charge says why', () => {
  it('never renders a zero where a charge cannot exist', () => {
    for (const a of fixedAssets) {
      for (const r of monthlySchedule(a)) {
        if (r.accounting === null) expect(r.accountingAbsent).toBeTruthy()
        if (r.tax === null) expect(r.taxAbsent).toBeTruthy()
      }
    }
  })

  it('says "Not in service" before the asset was acquired', () => {
    // FA-0083 was acquired 01/04/2026, so Jan–Mar cannot carry a charge.
    const rows = monthlySchedule(byId('FA-0083'))
    expect(rows.slice(0, 3).every((r) => r.accountingAbsent === 'Not in service')).toBe(true)
    expect(rows[3]!.accounting).toBeGreaterThan(0)
  })

  it('says "No statutory group" on the tax side of the unclassified asset', () => {
    const rows = monthlySchedule(byId('FA-0077'))
    expect(rows.every((r) => r.tax === null)).toBe(true)
    expect(rows.every((r) => r.taxAbsent === 'No statutory group')).toBe(true)
    expect(rows.every((r) => r.accounting !== null)).toBe(true)
  })

  it('says "Not amortised", not "Not computed", for indefinite-life goodwill', () => {
    const rows = monthlySchedule(byId('FA-0091'))
    expect(rows.every((r) => r.accountingAbsent === 'Not amortised')).toBe(true)
    // It still amortises on the tax basis — the whole point of the example.
    expect(rows.every((r) => r.tax !== null)).toBe(true)
  })

  it('stops both books after a disposal, and says so', () => {
    const rows = monthlySchedule(byId('FA-0071'))
    expect(rows[7]!.accounting).toBeGreaterThan(0)      // August, sold 15/08
    expect(rows[8]!.accountingAbsent).toBe('Disposed')  // September
    expect(rows[8]!.taxAbsent).toBe('Disposed')
  })
})

describe('events are named in the month they happened', () => {
  it('names the month an asset entered service', () => {
    expect(monthlySchedule(byId('FA-0083'))[3]!.event).toBe('Entered service')
  })

  it('names the impairment that reset the accounting basis', () => {
    const rows = monthlySchedule(byId('FA-0068'))
    expect(rows[6]!.event).toContain('Impaired')
    // The accounting charge steps down from July; tax does not recognise it.
    expect(rows[6]!.accounting).toBeLessThan(rows[5]!.accounting!)
    expect(rows[6]!.tax).toBe(rows[5]!.tax)
  })

  it('names the disposal', () => {
    expect(monthlySchedule(byId('FA-0071'))[7]!.event).toContain('Disposed')
  })
})

describe('the headline figures', () => {
  it('reads as four columns, so the band fits one row', () => {
    for (const a of fixedAssets) expect(detailFigures(a)).toHaveLength(4)
  })

  it('carries a caption on every figure, above the number', () => {
    for (const a of fixedAssets) {
      for (const f of detailFigures(a)) expect(f.caption.length).toBeGreaterThan(0)
    }
  })

  it('states a reason instead of a zero wherever a figure cannot exist', () => {
    for (const a of fixedAssets) {
      for (const f of detailFigures(a)) {
        if (f.value === null) expect(f.absent).toBeTruthy()
      }
    }
  })

  it('does not call a disposed asset "Not computed"', () => {
    // Disposed and unclassified are different absences; sharing a label tells
    // the reader the wrong thing about why the figure is missing.
    const figures = detailFigures(byId('FA-0071'))
    for (const f of figures) {
      if (f.value === null && f.label.startsWith('Book value')) {
        expect(f.absent).toBe('Disposed')
      }
    }
  })

  it('agrees with the accumulated it reports', () => {
    for (const a of fixedAssets) {
      const acc = detailFigures(a).find((f) => f.label === 'Book value · accounting')!
      if (acc.value === null || a.indefiniteLife) continue
      expect(acc.sub).toBe(
        `Accumulated Rp${(a.cost - acc.value).toLocaleString('id-ID')}`,
      )
    }
  })
})

describe('the derivation panel', () => {
  it('explains the period that was clicked, not always September', () => {
    const steps = derivation(byId('FA-0064'), 'accounting', 'March 2026')
    expect(steps.at(-1)!.label).toBe('Charge for March 2026')
    expect(steps.at(-1)!.isResult).toBe(true)
  })

  it('explains an absent charge with its own reason', () => {
    const steps = derivation(byId('FA-0071'), 'accounting', 'September 2026')
    expect(steps.at(-1)!.value).toBe('Disposed')
  })

  it('reports the same figure the table rendered', () => {
    const row = monthlySchedule(byId('FA-0031')).find((r) => r.period === 'May 2026')!
    const steps = derivation(byId('FA-0031'), 'accounting', 'May 2026')
    expect(steps.at(-1)!.value).toBe(`Rp${row.accounting!.toLocaleString('id-ID')}`)
  })
})
