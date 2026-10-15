/**
 * PRD revision of 12 Oct — two rules that are new or back:
 *
 *   • UC-00 — reservation can be switched OFF again ("There is a toggle to disable /
 *     enable the reservation"; L-12 deleted). Off, nothing on the work order
 *     reserves, and One-step can't fire either.
 *   • UC-01 C-1 — a raw material's request date must fall inside the production
 *     plan: not before the planned start, not after the planned finish.
 */
import { describe, it, expect, afterEach } from 'vitest'
import {
  productionSettings, saveProductionSettings, reservationEnabled, reservationOnWorkOrder,
} from '~/data/productionSettings'
import {
  planWindowOf, isOutsideWindow, displayDateOutside, parseDDMMYYYY, toDDMMYYYY,
} from '~/utils/planWindow'

describe('UC-00 — the reservation toggle', () => {
  const saved = { ...productionSettings }
  afterEach(() => { saveProductionSettings(saved) })

  it('is on by default', () => {
    expect(reservationEnabled()).toBe(true)
  })

  it('off means the flow does not run — and One-step cannot fire, whatever the method says', () => {
    saveProductionSettings({ componentsMustBeReserved: false, reservationMethod: 'one-step' })
    expect(reservationEnabled()).toBe(false)
    expect(reservationOnWorkOrder()).toBe(false)
  })

  it('on + One-step reserves from the work order; on + Two-step leaves it to PPIC (S-2)', () => {
    saveProductionSettings({ componentsMustBeReserved: true, reservationMethod: 'one-step' })
    expect(reservationOnWorkOrder()).toBe(true)
    saveProductionSettings({ reservationMethod: 'two-step' })
    expect(reservationOnWorkOrder()).toBe(false)
  })

  it('carries no separate "start with limited stock" setting any more (S-4 removed)', () => {
    expect('allowStartWithLimitedStock' in productionSettings).toBe(false)
  })
})

describe('UC-01 C-1 — request dates stay inside the production plan', () => {
  const plan = planWindowOf([new Date(2026, 9, 8, 14, 30), new Date(2026, 9, 15)])!

  it('accepts the first and last day of the plan — the bounds are inclusive', () => {
    expect(isOutsideWindow(new Date(2026, 9, 8), plan)).toBe(false)
    expect(isOutsideWindow(new Date(2026, 9, 15, 23, 59), plan)).toBe(false)
  })

  it('refuses a day before the planned start or after the planned finish', () => {
    expect(isOutsideWindow(new Date(2026, 9, 7), plan)).toBe(true)
    expect(isOutsideWindow(new Date(2026, 9, 16), plan)).toBe(true)
  })

  it('compares calendar days, not times — a plan picked at 14:30 still allows that morning', () => {
    expect(isOutsideWindow(new Date(2026, 9, 8, 0, 1), plan)).toBe(false)
  })

  it('a one-day plan allows exactly that day', () => {
    const one = planWindowOf([new Date(2026, 9, 8)])!
    expect(isOutsideWindow(new Date(2026, 9, 8), one)).toBe(false)
    expect(isOutsideWindow(new Date(2026, 9, 9), one)).toBe(true)
  })

  it('with no plan set yet, no date is outside it', () => {
    expect(planWindowOf([])).toBeNull()
    expect(isOutsideWindow(new Date(2020, 0, 1), null)).toBe(false)
  })

  it('reads the picker\'s DD/MM/YYYY value; an empty or unparsable one is not "outside"', () => {
    expect(displayDateOutside('07/10/2026', plan)).toBe(true)
    expect(displayDateOutside('10/10/2026', plan)).toBe(false)
    expect(displayDateOutside('', plan)).toBe(false)
    expect(displayDateOutside('2026-10-07', plan)).toBe(false)
    expect(toDDMMYYYY(parseDDMMYYYY('08/10/2026')!)).toBe('08/10/2026')
  })
})
