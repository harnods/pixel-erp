/**
 * Replenishment "All filters" drawer — Days of cover uses the library comparator
 * (Is greater than / between / less than) instead of two loose From / To inputs.
 */
import { describe, it, expect } from 'vitest'
import {
  coverMatches, countReplenishmentFilters, emptyReplenishmentFilters, REPLENISHMENT_SIGNALS,
} from '~/components/patterns/ReplenishmentFiltersDrawer.vue'

const f = (over: Partial<ReturnType<typeof emptyReplenishmentFilters>>) => ({ ...emptyReplenishmentFilters(), ...over })

describe('days-of-cover comparator filter', () => {
  it('is inactive until a value is entered, and then counts as one filter', () => {
    expect(coverMatches(5, f({}))).toBe(true)
    expect(coverMatches(null, f({}))).toBe(true)
    expect(countReplenishmentFilters(f({}))).toBe(0)
    expect(countReplenishmentFilters(f({ coverValue: '10' }))).toBe(1)
  })

  it('is greater than / less than are strict', () => {
    expect(coverMatches(11, f({ coverComparator: 'gt', coverValue: '10' }))).toBe(true)
    expect(coverMatches(10, f({ coverComparator: 'gt', coverValue: '10' }))).toBe(false)
    expect(coverMatches(9, f({ coverComparator: 'lt', coverValue: '10' }))).toBe(true)
    expect(coverMatches(10, f({ coverComparator: 'lt', coverValue: '10' }))).toBe(false)
  })

  it('is between is inclusive and accepts one open end', () => {
    const between = f({ coverComparator: 'between', coverMin: '5', coverMax: '10' })
    expect(coverMatches(5, between)).toBe(true)
    expect(coverMatches(10, between)).toBe(true)
    expect(coverMatches(11, between)).toBe(false)
    expect(coverMatches(3, f({ coverComparator: 'between', coverMax: '4' }))).toBe(true)
    expect(countReplenishmentFilters(between)).toBe(1)
  })

  it('a product with no cover figure never satisfies a numeric condition', () => {
    expect(coverMatches(null, f({ coverComparator: 'gt', coverValue: '1' }))).toBe(false)
  })
})

describe('Warehouse, Movement and Signals live in the drawer value', () => {
  it('Movement and Signals count as filters; the always-set warehouse scope does not', () => {
    expect(countReplenishmentFilters(f({ warehouseId: 'wh-001' }))).toBe(0)
    expect(countReplenishmentFilters(f({ fsn: 'fast' }))).toBe(1)
    expect(countReplenishmentFilters(f({ fsn: 'fast', signal: 'covered', coverValue: '5' }))).toBe(3)
  })
})

describe('Signals quick filter options', () => {
  it('offers Covered by inbound alongside the demand and lead-time signals', () => {
    expect(REPLENISHMENT_SIGNALS.map((s) => s.id)).toEqual(expect.arrayContaining(['covered', 'below-lead', 'stale']))
  })
})
