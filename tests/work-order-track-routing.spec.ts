/**
 * Routing tracker logic: step status is derived from actual dates, the detail
 * page's primary action follows it, and actual dates stay inside their windows.
 */
import { describe, it, expect } from 'vitest'
import {
  canTrackRouting, isRoutingComplete, isWithinWindow, routingEndWindow, routingStartWindow,
  routingDropAction, routingStepsFor, routingStepStatus, undoRoutingStep,
} from '~/data/workOrderRouting'
import type { WorkOrderRoutingProgress } from '~/data/workOrders'

const bom = { routing: [
  { process: 'Assembly', description: 'a', accountMapping: 'Routing cost', amount: 15000 },
  { process: 'Finishing', description: 'b', accountMapping: 'Routing cost', amount: 20000 },
] }
const wo = { status: 'in progress' as const, planStartDate: '2026-01-01', planEndDate: '2026-01-11' }

describe('routing steps', () => {
  it('derives status from actual dates', () => {
    expect(routingStepStatus()).toBe('not started')
    expect(routingStepStatus({ startDate: '2026-01-02' })).toBe('in progress')
    expect(routingStepStatus({ startDate: '2026-01-02', endDate: '2026-01-03' })).toBe('completed')
  })

  it('splits the plan range across steps', () => {
    const [a, b] = routingStepsFor(wo, bom)
    expect([a!.planStart, a!.planEnd]).toEqual(['2026-01-01', '2026-01-06'])
    expect([b!.planStart, b!.planEnd]).toEqual(['2026-01-06', '2026-01-11'])
  })

  it('is complete only when every step is completed', () => {
    const done = { startDate: '2026-01-02', endDate: '2026-01-03' }
    expect(isRoutingComplete(routingStepsFor(wo, bom, { 0: done }))).toBe(false)
    expect(isRoutingComplete(routingStepsFor(wo, bom, { 0: done, 1: done }))).toBe(true)
  })

  it('treats a BOM with no routing as complete, so the work order can still close', () => {
    expect(isRoutingComplete(routingStepsFor(wo, { routing: [] }))).toBe(true)
  })

  it('reads closed work orders without recorded dates as done on plan dates', () => {
    const [a] = routingStepsFor({ ...wo, status: 'completed' }, bom)
    expect(a!.status).toBe('completed')
    expect(a!.endDate).toBe('2026-01-06')
  })
})

describe('tracker access', () => {
  it('needs Track routing on and a started, open work order', () => {
    expect(canTrackRouting({ trackRouting: true, status: 'in progress' })).toBe(true)
    expect(canTrackRouting({ trackRouting: true, status: 'partially produced' })).toBe(true)
    expect(canTrackRouting({ trackRouting: false, status: 'in progress' })).toBe(false)
    expect(canTrackRouting({ trackRouting: true, status: 'not started' })).toBe(false)
    expect(canTrackRouting({ trackRouting: true, status: 'completed' })).toBe(false)
  })
})

describe('actual date windows', () => {
  it('start: from the work order start until today', () => {
    const w = routingStartWindow({ startDate: '2026-01-02', planStartDate: '2026-01-01' }, '2026-01-03')
    expect(isWithinWindow('2026-01-01', w)).toBe(false)
    expect(isWithinWindow('2026-01-02', w)).toBe(true)
    expect(isWithinWindow('2026-01-04', w)).toBe(false)
  })

  it('end: from the process start until today', () => {
    const w = routingEndWindow({ startDate: '2026-01-05', planStart: '2026-01-01' }, '2026-01-09')
    expect(isWithinWindow('2026-01-04', w)).toBe(false)
    expect(isWithinWindow('2026-01-09', w)).toBe(true)
  })
})

describe('cancel moves a step one column back', () => {
  it('completed → in progress → not started', () => {
    const progress: Record<string, WorkOrderRoutingProgress> = { 0: { startDate: '2026-01-02', endDate: '2026-01-03' } }
    undoRoutingStep(progress, 0)
    expect(progress[0]).toEqual({ startDate: '2026-01-02' })
    undoRoutingStep(progress, 0)
    expect(progress[0]).toBeUndefined()
  })
})

describe('routingDropAction', () => {
  it('moves one column at a time', () => {
    expect(routingDropAction('not started', 'in progress')).toBe('start')
    expect(routingDropAction('in progress', 'completed')).toBe('finish')
    expect(routingDropAction('in progress', 'not started')).toBe('undo')
    expect(routingDropAction('completed', 'in progress')).toBe('undo')
  })

  it('ignores skipped columns and the same column', () => {
    expect(routingDropAction('not started', 'completed')).toBeNull()
    expect(routingDropAction('completed', 'not started')).toBeNull()
    expect(routingDropAction('in progress', 'in progress')).toBeNull()
  })
})
