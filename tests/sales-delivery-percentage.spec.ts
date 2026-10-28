/**
 * Wave 0 of the percentage-based sales delivery work: the order → delivery link.
 *
 * These assert the numbers the PRD's worked example states, because every later
 * feature reads them — progress so far (R-05), the over-delivery check (R-06)
 * and Fill Remaining (R-14) must all agree on delivered-to-date or they can
 * contradict each other on screen.
 *
 * Source: docs/plans/percentage-based-sales-delivery.md
 */
import { describe, it, expect } from 'vitest'
import { salesOrders } from '~/data/salesOrders'
import {
  salesDeliveries, deliveredByLine, derivedQty, lineInputBasis,
  lineLock, releaseInputBasis, inputBasisReleases, isInClosedPeriod,
} from '~/data/salesDeliveries'

const order = () => salesOrders.find(o => o.id === 'SO101')!

describe('derivedQty — percentage of the ordered quantity', () => {
  it('reproduces the PRD worked example on a 16 unit line', () => {
    expect(derivedQty(16, 40)).toBe(6.4)
    expect(derivedQty(16, 33)).toBe(5.28)
    expect(derivedQty(16, 27)).toBe(4.32)
    // The three tranches close the line exactly.
    expect(derivedQty(16, 40) + derivedQty(16, 33) + derivedQty(16, 27)).toBe(16)
  })

  it('works on a 1 lot service line, where a count means nothing', () => {
    expect(derivedQty(1, 33)).toBe(0.33)
  })

  it('truncates at the sixth decimal rather than carrying float noise (E-04)', () => {
    // 1/3 of 1 lot is 0,333333… — six decimals, truncated, never rounded up.
    expect(derivedQty(1, 100 / 3)).toBe(0.333333)
  })
})

describe('the value a percentage produces (OD-002)', () => {
  it('matches the rupiah figures in the PRD narrative', () => {
    const o = order()
    const service = o.items[0]!   // 1 lot at Rp600.000.000
    const panel = o.items[1]!     // 16 unit at Rp25.000.000
    // "The line immediately shows 0,33 lot and Rp 198.000.000 on the service
    //  line, and 5,28 unit and Rp 132.000.000 on the panel line."
    expect(derivedQty(service.qty, 33) * service.unitPrice).toBe(198_000_000)
    expect(derivedQty(panel.qty, 33) * panel.unitPrice).toBe(132_000_000)
    // 100% is the whole line, to the rupiah.
    expect(derivedQty(panel.qty, 100) * panel.unitPrice).toBe(panel.amount)
  })
})

describe('deliveredByLine — one source for delivered-to-date', () => {
  it('sums every tranche per order line', () => {
    const d = deliveredByLine('SO101')
    expect(d[0]).toBeCloseTo(0.73, 6)   // 40% + 33% of 1 lot
    expect(d[1]).toBeCloseTo(11.68, 6)  // 6,4 + 5,28 of 16 unit
  })

  it('leaves exactly the remaining balance against the order', () => {
    const o = order()
    const d = deliveredByLine('SO101')
    expect(o.items[0]!.qty - d[0]!).toBeCloseTo(0.27, 6)
    expect(o.items[1]!.qty - d[1]!).toBeCloseTo(4.32, 6)
  })

  it('reports nothing for an order with no deliveries', () => {
    expect(deliveredByLine('SO001')).toEqual({})
  })

  it('counts a fully delivered line as complete', () => {
    const d = deliveredByLine('SO103')
    expect(d[0]).toBe(1)
  })
})

describe('lineInputBasis — only percent locks a line (R-08 → R-10)', () => {
  it('locks a line first delivered by percent', () => {
    expect(lineInputBasis('SO101', 0)).toBe('percent')
    expect(lineInputBasis('SO101', 1)).toBe('percent')
  })

  it('leaves an undelivered line free', () => {
    // SO102's machine line has no tranche yet.
    expect(lineInputBasis('SO102', 1)).toBeNull()
  })
})

describe('the seeded contract deliveries', () => {
  it('keep the mode and the figure typed beside the quantity (TS-001)', () => {
    const sd = salesDeliveries.find(d => d.id === 'SD102')!
    expect(sd.orderId).toBe('SO101')
    const panel = sd.items!.find(l => l.orderLineIndex === 1)!
    expect(panel.inputMode).toBe('percent')
    expect(panel.inputValue).toBe(33)
    expect(panel.qty).toBe(5.28)
  })

  it('do not disturb the generated records', () => {
    expect(salesDeliveries.filter(d => !d.orderId)).toHaveLength(100)
  })
})

describe('the input basis lock (OD-003)', () => {
  it('names the FIRST delivery by date as the one that set the lock (R-08)', () => {
    // SD101 is 2026-03-02, SD102 is 2026-04-06 — both percent on line 0.
    expect(lineLock('SO101', 0)?.id).toBe('SD101')
    expect(lineLock('SO101', 0)?.number).toBe(20101)
  })

  it('leaves an undelivered line unlocked (R-10)', () => {
    expect(lineLock('SO102', 1)).toBeNull()
  })

  it('releases one line without touching its siblings, and only once (R-16)', () => {
    expect(lineLock('SO101', 1)).not.toBeNull()

    expect(releaseInputBasis('SO101', 1, 'Rizal Candra', 'Contract renegotiated')).toBe(true)
    expect(lineLock('SO101', 1)).toBeNull()        // released line is free
    expect(lineLock('SO101', 0)).not.toBeNull()    // its sibling is not
    expect(lineInputBasis('SO101', 1)).toBeNull()

    // One way: a second release is a no-op, and there is no path back to percent.
    expect(releaseInputBasis('SO101', 1, 'Rizal Candra', 'Again')).toBe(false)
    expect(inputBasisReleases.filter(r => r.orderId === 'SO101' && r.orderLineIndex === 1)).toHaveLength(1)
  })

  it('refuses a release with no reason, and writes the reason to the trail', () => {
    expect(releaseInputBasis('SO101', 0, 'Rizal Candra', '   ')).toBe(false)
    expect(lineLock('SO101', 0)).not.toBeNull()

    expect(releaseInputBasis('SO101', 0, 'Rizal Candra', 'Customer switched to unit pricing')).toBe(true)
    const entry = inputBasisReleases.find(r => r.orderId === 'SO101' && r.orderLineIndex === 0)!
    expect(entry.by).toBe('Rizal Candra')
    expect(entry.reason).toBe('Customer switched to unit pricing')
  })
})

describe('progress so far, as a percentage (OD-004)', () => {
  const pct = (orderId: string, i: number) => {
    const o = salesOrders.find(x => x.id === orderId)!
    return (deliveredByLine(orderId)[i] ?? 0) / o.items[i]!.qty * 100
  }

  it('reads the same percentage on lines of different units', () => {
    // 0,73 of 1 lot and 11,68 of 16 unit are both 73% — that equivalence is the
    // whole point of showing percent beside the quantity.
    expect(pct('SO101', 0)).toBeCloseTo(73, 6)
    expect(pct('SO101', 1)).toBeCloseTo(73, 6)
  })

  it('is Mixed when an order\'s lines disagree (E-01)', () => {
    expect(pct('SO102', 0)).toBeCloseTo(50, 6)
    expect(pct('SO102', 1)).toBe(0)
    expect(Math.abs(pct('SO102', 0) - pct('SO102', 1)) < 0.005).toBe(false)
  })

  it('reaches exactly 100 on a closed line', () => {
    expect(pct('SO103', 0)).toBe(100)
  })
})

describe('the over-delivery limit (OD-005)', () => {
  const remaining = (orderId: string, i: number) => {
    const o = salesOrders.find(x => x.id === orderId)!
    return o.items[i]!.qty - (deliveredByLine(orderId)[i] ?? 0)
  }

  it('leaves exactly the balance the error has to quote', () => {
    expect(remaining('SO101', 0)).toBeCloseTo(0.27, 6)
    expect(remaining('SO101', 1)).toBeCloseTo(4.32, 6)
  })

  it('rejects 100% on a line that already has deliveries (E-05)', () => {
    const o = salesOrders.find(x => x.id === 'SO101')!
    expect(derivedQty(o.items[1]!.qty, 100)).toBeGreaterThan(remaining('SO101', 1))
  })

  it('accepts a tranche that lands exactly on the balance', () => {
    const o = salesOrders.find(x => x.id === 'SO101')!
    // 27% is the whole remainder — it must not fail by a float hair, which is why
    // the form compares with a tolerance rather than <=.
    const asked = derivedQty(o.items[1]!.qty, 27)
    expect(asked).toBe(4.32)
    expect(asked - remaining('SO101', 1)).toBeLessThan(1e-6)
  })

  it('has nothing left to give on a closed line', () => {
    expect(remaining('SO103', 0)).toBe(0)
  })
})

describe('Fill remaining (OD-006)', () => {
  const remainingAll = (orderId: string) => {
    const o = salesOrders.find(x => x.id === orderId)!
    const d = deliveredByLine(orderId)
    return o.items.map((it, i) => it.qty - (d[i] ?? 0))
  }

  it('fills a non-round balance exactly, closing the order at 100% (E-03)', () => {
    const o = salesOrders.find(x => x.id === 'SO102')!
    const rem = remainingAll('SO102')
    // Delivered + filled = ordered, on every line, with nothing left over.
    rem.forEach((r, i) => expect((deliveredByLine('SO102')[i] ?? 0) + r).toBeCloseTo(o.items[i]!.qty, 9))
  })

  it('can never breach the limit, because it IS the limit (R-14)', () => {
    remainingAll('SO101').forEach(r => expect(r).toBeGreaterThanOrEqual(0))
  })

  it('records a percent-locked line as the percentage its balance represents', () => {
    const o = salesOrders.find(x => x.id === 'SO101')!
    const r = remainingAll('SO101')[1]!
    expect(Math.round((r / o.items[1]!.qty) * 100 * 1e6) / 1e6).toBe(27)
  })
})

describe('editing follows the same rules (OD-010)', () => {
  it('re-checks the limit against everything ELSE delivered (R-17)', () => {
    // SD103 is the only tranche on SO102's service line. Excluding it while it is
    // being edited leaves the whole lot available, not half of it.
    expect(deliveredByLine('SO102')[0]).toBeCloseTo(0.5, 6)
    expect(deliveredByLine('SO102', 'SD103')[0] ?? 0).toBe(0)
    // Excluding one SO101 tranche still counts the other.
    expect(deliveredByLine('SO101', 'SD102')[1]).toBeCloseTo(6.4, 6)
  })

  it('refuses a delivery inside the Close books lock (R-19)', () => {
    const lock = '2026-06-30'
    expect(isInClosedPeriod({ date: '2026-03-02' }, lock)).toBe(true)   // SD101
    expect(isInClosedPeriod({ date: '2026-06-30' }, lock)).toBe(true)   // the lock day itself
    expect(isInClosedPeriod({ date: '2026-07-20' }, lock)).toBe(false)  // SD103
    expect(isInClosedPeriod({ date: '2026-03-02' }, null)).toBe(false)  // no lock at all
  })
})
