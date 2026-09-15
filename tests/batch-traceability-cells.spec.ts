/**
 * Batch Traceability Report — cell formatting shared by both searches
 * (useTraceabilityCells, plan Phase 2). The PRD's cell states and sign rule must read
 * the same in the By batch and By transaction tables, so they're pinned here once.
 */
import { describe, it, expect } from 'vitest'
import { useTraceabilityCells, TRACE_ATTRIBUTE_COLUMNS } from '~/composables/useTraceabilityCells'

const cells = useTraceabilityCells()

describe('attribute cells', () => {
  it('renders NA, blank or the formatted value', () => {
    expect(cells.attributeText({ state: 'na' }, 'supplier')).toBe('NA')
    expect(cells.attributeText({ state: 'empty' }, 'supplier')).toBe('')
    expect(cells.attributeText({ state: 'value', value: 'V003' }, 'supplier')).toBe('Gayo Highland Exporters')
    expect(cells.attributeText({ state: 'value', value: 'grade-a' }, 'grade')).toBe('A')
  })

  it('sorts a month expiry as its last day, and names by their display name', () => {
    expect(cells.attributeSortValue({ state: 'value', value: '2026-02' }, 'expiry_date')).toBe('2026-02-28')
    expect(cells.attributeSortValue({ state: 'value', value: 'V001' }, 'supplier')).toBe('Klasik Beans Cooperative')
    expect(cells.attributeSortValue({ state: 'na' }, 'grade')).toBe('')
  })

  it('lists the five attribute columns in the PRD order', () => {
    expect(TRACE_ATTRIBUTE_COLUMNS.map((c) => c.key)).toEqual(['expiry_date', 'manufacturing_date', 'best_before_date', 'supplier', 'grade'])
  })
})

describe('quantities and mutations', () => {
  it('formats quantity cells with the unit, NA or blank', () => {
    expect(cells.qtyCellText({ state: 'value', value: 2160 }, 'kg')).toBe('2.160 kg')
    expect(cells.qtyCellText({ state: 'na' }, 'kg')).toBe('NA')
    expect(cells.qtyCellText({ state: 'empty' }, 'kg')).toBe('')
  })

  it('signs mutations by direction and leaves neutral ones bare', () => {
    expect(cells.mutationText('in', 12, 'Sack')).toBe('+12 Sack')
    expect(cells.mutationText('out', -5, 'Sack')).toBe('−5 Sack')
    expect(cells.mutationText('neutral', 7, 'Sack')).toBe('7 Sack')
    expect(cells.mutationText('out', 1.5, null)).toBe('−1,5')
  })
})
