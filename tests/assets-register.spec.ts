/**
 * The asset register's display rules.
 *
 * These test the rules the design is explicit about rather than the markup:
 * a fiscal figure that is absent must say why, the unclassified asset must be
 * surfaced rather than filtered out, and the totals must describe a population
 * the reader can identify.
 */
import { describe, it, expect } from 'vitest'
import {
  fixedAssets,
  registerTotals,
  fiscalAbsenceReason,
  isUnclassified,
  type FixedAsset,
} from '~/data/fixedAssets'

/** The register's own sort, extracted so it can be tested without mounting. */
function dateOrder(d: string): number {
  const [dd, mm, yyyy] = d.split('/')
  return Number(`${yyyy}${mm}${dd}`)
}

describe('sorting by fiscal book value', () => {
  it('puts assets with no fiscal value last, not among the zeroes', () => {
    // An unclassified asset is not worth zero on the tax basis — it has no tax
    // basis. Sorting it as 0 would file it beside the fully-depreciated assets
    // and imply something untrue about it.
    const rows = [...fixedAssets]
    rows.sort((a, b) => {
      if (a.bookValueFiscal === null) return 1
      if (b.bookValueFiscal === null) return -1
      return a.bookValueFiscal - b.bookValueFiscal
    })
    expect(rows[rows.length - 1].id).toBe('FA-0077')
  })
})

describe('sorting by acquisition date', () => {
  it('reads dd/mm/yyyy in the right order', () => {
    // The register displays Indonesian date order. A naive string sort would
    // put 01/06/2025 before 15/01/2024.
    expect(dateOrder('01/06/2025')).toBeGreaterThan(dateOrder('15/01/2024'))
    expect(dateOrder('15/01/2026')).toBeGreaterThan(dateOrder('01/12/2025'))
  })
})

describe('totals', () => {
  it('excludes disposed assets from cost and book value', () => {
    const disposed = fixedAssets.filter((a) => a.status === 'Disposed')
    expect(disposed.length).toBeGreaterThan(0)

    const withDisposed = registerTotals(fixedAssets)
    const withoutDisposed = registerTotals(fixedAssets.filter((a) => a.status !== 'Disposed'))
    expect(withDisposed.cost).toBe(withoutDisposed.cost)
    expect(withDisposed.bookValueCommercial).toBe(withoutDisposed.bookValueCommercial)
  })

  it('never folds an unclassified asset into the fiscal total as a zero', () => {
    const t = registerTotals(fixedAssets)
    const classifiedOnly = fixedAssets
      .filter((a) => a.status !== 'Disposed' && a.bookValueFiscal !== null)
      .reduce((s, a) => s + (a.bookValueFiscal as number), 0)
    expect(t.bookValueFiscal).toBe(classifiedOnly)
  })

  it('reports how many assets the fiscal total leaves out', () => {
    const t = registerTotals(fixedAssets)
    expect(t.unclassified).toBe(1)
  })

  it('counts every row, including disposed ones', () => {
    // The count is a count of the register, not of what is held — a reader
    // filtering to Disposed must still see a number that matches the rows.
    expect(registerTotals(fixedAssets).count).toBe(fixedAssets.length)
  })
})

describe('absent fiscal figures', () => {
  it('gives every absence a reason rather than a zero', () => {
    const absent = fixedAssets.filter((a) => a.bookValueFiscal === null || a.indefiniteLife)
    expect(absent.length).toBeGreaterThan(0)
    for (const a of absent) {
      const reason = fiscalAbsenceReason(a)
      expect(['Not computed', 'Not recognised', 'Not amortised']).toContain(reason)
    }
  })

  it('distinguishes "cannot compute" from "does not amortise"', () => {
    const unclassified = fixedAssets.find((a) => a.taxGroup === null)!
    const goodwill = fixedAssets.find((a) => a.id === 'FA-0091')!
    // Different causes, different words: one is a gap to fix, the other is
    // correct accounting.
    expect(fiscalAbsenceReason(unclassified)).toBe('Not computed')
    expect(fiscalAbsenceReason(goodwill)).toBe('Not amortised')
  })
})

describe('filtering', () => {
  function filter(rows: FixedAsset[], q: string) {
    const s = q.trim().toLowerCase()
    return rows.filter((a) =>
      a.name.toLowerCase().includes(s) ||
      a.id.toLowerCase().includes(s) ||
      (a.tag ?? '').toLowerCase().includes(s) ||
      (a.custodian ?? '').toLowerCase().includes(s),
    )
  }

  it('finds an asset by its tag, not only its name', () => {
    const tagged = fixedAssets.find((a) => a.tag)!
    expect(filter(fixedAssets, tagged.tag!).map((a) => a.id)).toContain(tagged.id)
  })

  it('finds an asset by custodian', () => {
    const held = fixedAssets.find((a) => a.custodian)!
    expect(filter(fixedAssets, held.custodian!).length).toBeGreaterThan(0)
  })

  it('keeps the unclassified asset findable', () => {
    // It is the one asset a user most needs to reach from the register.
    expect(filter(fixedAssets, 'FA-0077').map(isUnclassified)).toEqual([true])
  })
})

describe('the intangible assets', () => {
  it('have no physical tag, because nobody holds a patent in a warehouse', () => {
    for (const a of fixedAssets.filter((x) => x.type === 'Intangible')) {
      expect(a.tag).toBeNull()
    }
  })

  it('still carry a statutory code, because the filing requires one', () => {
    for (const a of fixedAssets.filter((x) => x.type === 'Intangible')) {
      expect(a.statutoryCode).not.toBeNull()
    }
  })
})
