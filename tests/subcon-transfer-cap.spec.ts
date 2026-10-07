/**
 * A subcon transfer never asks for more stock than the origin warehouse holds.
 *
 * The work order states a NEED; the warehouse states what can leave it. Before
 * this rule existed the transfer form was prefilled with the need alone, so an
 * order for 400 against 22 on hand opened a form that could not be saved — the
 * form's own validation refuses a line over available stock — while showing a
 * negative after-transfer figure. The operator was told the number was wrong
 * without being offered one that was right.
 */
import { describe, it, expect } from 'vitest'
import { capLinesToAvailable } from '../app/data/subcon'

const LINES = [
  { sku: 'PNL-PRT-18', qty: 400, name: 'Papan partikel 18mm' },
  { sku: 'FRM-BSI-02', qty: 200, name: 'Rangka besi meja' },
  { sku: 'HPL-OAK-08', qty: 600, name: 'Pelapis HPL' },
]

/** The stock levels that produced the original defect. */
const SHORT: Record<string, number> = { 'PNL-PRT-18': 22, 'FRM-BSI-02': 14, 'HPL-OAK-08': 5 }
const AMPLE: Record<string, number> = { 'PNL-PRT-18': 1_600, 'FRM-BSI-02': 420, 'HPL-OAK-08': 2_400 }

const from = (stock: Record<string, number>) => (sku: string) => stock[sku] ?? 0

describe('a line never exceeds the stock behind it', () => {
  it('caps every short line at what is available', () => {
    const { lines } = capLinesToAvailable(LINES, from(SHORT))
    expect(lines.map(l => l.qty)).toEqual([22, 14, 5])
  })

  it('leaves lines alone when the stock covers them', () => {
    const { lines, shortfalls } = capLinesToAvailable(LINES, from(AMPLE))
    expect(lines.map(l => l.qty)).toEqual([400, 200, 600])
    expect(shortfalls).toEqual([])
  })

  it('never produces a negative after-transfer position', () => {
    // The defect's visible symptom: available − transferred went below zero.
    const { lines } = capLinesToAvailable(LINES, from(SHORT))
    for (const line of lines) {
      expect(from(SHORT)(line.sku) - line.qty).toBeGreaterThanOrEqual(0)
    }
  })
})

describe('the shortfall is reported, not absorbed', () => {
  it('names each line it had to reduce, with both figures', () => {
    const { shortfalls } = capLinesToAvailable(LINES, from(SHORT))
    expect(shortfalls).toEqual([
      { sku: 'PNL-PRT-18', asked: 400, capped: 22 },
      { sku: 'FRM-BSI-02', asked: 200, capped: 14 },
      { sku: 'HPL-OAK-08', asked: 600, capped: 5 },
    ])
  })

  it('reports only the lines that were actually short', () => {
    const mixed = { ...AMPLE, 'HPL-OAK-08': 100 }
    const { shortfalls } = capLinesToAvailable(LINES, from(mixed))
    expect(shortfalls).toEqual([{ sku: 'HPL-OAK-08', asked: 600, capped: 100 }])
  })
})

describe('degenerate stock levels', () => {
  it('keeps a line with nothing available, at zero', () => {
    // Dropped rows would hide that the order asked for it at all.
    const { lines, shortfalls } = capLinesToAvailable(LINES, () => 0)
    expect(lines).toHaveLength(3)
    expect(lines.every(l => l.qty === 0)).toBe(true)
    expect(shortfalls).toHaveLength(3)
  })

  it('treats an unknown SKU as no stock rather than failing', () => {
    const { lines } = capLinesToAvailable([{ sku: 'NOT-STOCKED', qty: 10 }], from(AMPLE))
    expect(lines[0]!.qty).toBe(0)
  })

  it('does not let negative stock drive the quantity below zero', () => {
    const { lines } = capLinesToAvailable(LINES, () => -50)
    expect(lines.every(l => l.qty === 0)).toBe(true)
  })

  it('carries every other field through untouched', () => {
    const { lines } = capLinesToAvailable(LINES, from(SHORT))
    expect(lines[0]!.name).toBe('Papan partikel 18mm')
    expect(lines[0]!.sku).toBe('PNL-PRT-18')
  })
})
