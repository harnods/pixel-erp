/**
 * A component transfer raised straight from the work order, with no form.
 *
 * The form used to refuse what could not be saved: a line over stock, a
 * serial-tracked line with no serials named, a line of zero. Raised directly,
 * each of those becomes an adjustment the operator is told about, and the
 * transfer that is created is one the form would have accepted.
 */
import { describe, it, expect } from 'vitest'
import { buildDirectTransferLines } from '../app/data/subcon'

const LINES = [
  { sku: 'PNL-PRT-18', qty: 400, name: 'Papan partikel 18mm', unit: 'lembar' },
  { sku: 'FRM-BSI-02', qty: 200, name: 'Rangka besi meja', unit: 'set' },
]

const stock = (m: Record<string, number>) => (sku: string) => m[sku] ?? 0
const noSerials = () => undefined

describe('a transfer the form would have accepted', () => {
  it('sends every line in full when the stock covers it', () => {
    const { toSend, reduced } = buildDirectTransferLines(
      LINES, stock({ 'PNL-PRT-18': 1600, 'FRM-BSI-02': 420 }), noSerials)
    expect(toSend).toEqual([
      { sku: 'PNL-PRT-18', qty: 400 },
      { sku: 'FRM-BSI-02', qty: 200 },
    ])
    expect(reduced).toEqual([])
  })

  it('never sends more than the origin holds', () => {
    const { toSend } = buildDirectTransferLines(
      LINES, stock({ 'PNL-PRT-18': 22, 'FRM-BSI-02': 420 }), noSerials)
    expect(toSend.find(l => l.sku === 'PNL-PRT-18')?.qty).toBe(22)
  })
})

describe('what could not be carried is reported, not absorbed', () => {
  it('names a capped line in the form\'s own wording', () => {
    const { reduced } = buildDirectTransferLines(
      LINES, stock({ 'PNL-PRT-18': 22, 'FRM-BSI-02': 420 }), noSerials)
    expect(reduced).toEqual(['Papan partikel 18mm (22/400 lembar)'])
  })

  it('drops a line with nothing to send but still reports it', () => {
    // A transfer of zero is not a movement; the gap is still stated.
    const { toSend, reduced } = buildDirectTransferLines(
      LINES, stock({ 'FRM-BSI-02': 420 }), noSerials)
    expect(toSend.map(l => l.sku)).toEqual(['FRM-BSI-02'])
    expect(reduced).toEqual(['Papan partikel 18mm (0/400 lembar)'])
  })

  it('sends nothing at all when no line has stock', () => {
    const { toSend, reduced } = buildDirectTransferLines(LINES, stock({}), noSerials)
    expect(toSend).toEqual([])
    expect(reduced).toHaveLength(2)
  })
})

describe('serial-tracked lines', () => {
  const SERIALS = ['SN-1', 'SN-2', 'SN-3']
  const pick = (sku: string, qty: number) => (sku === 'FRM-BSI-02' ? SERIALS.slice(0, qty) : undefined)

  it('carries the serials the warehouse picks', () => {
    const { toSend } = buildDirectTransferLines(
      [{ sku: 'FRM-BSI-02', qty: 2, name: 'Rangka besi meja', unit: 'set' }],
      stock({ 'FRM-BSI-02': 420 }), pick)
    expect(toSend).toEqual([{ sku: 'FRM-BSI-02', qty: 2, serials: ['SN-1', 'SN-2'] }])
  })

  it('reduces the line to the serials there are to name', () => {
    // 200 asked and in stock, but only three units carry a serial to pick.
    const { toSend, reduced } = buildDirectTransferLines(
      [{ sku: 'FRM-BSI-02', qty: 200, name: 'Rangka besi meja', unit: 'set' }],
      stock({ 'FRM-BSI-02': 420 }), pick)
    expect(toSend).toEqual([{ sku: 'FRM-BSI-02', qty: 3, serials: SERIALS }])
    expect(reduced).toEqual(['Rangka besi meja (3/200 set)'])
  })

  it('leaves untracked lines without a serials field', () => {
    const { toSend } = buildDirectTransferLines(
      LINES, stock({ 'PNL-PRT-18': 1600, 'FRM-BSI-02': 420 }), pick)
    expect(toSend.find(l => l.sku === 'PNL-PRT-18')).not.toHaveProperty('serials')
  })
})
