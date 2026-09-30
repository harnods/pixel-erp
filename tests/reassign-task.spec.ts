// @vitest-environment happy-dom
/**
 * "Change assignee" — the task-handover escape hatch.
 *
 * Two things are load-bearing and easy to break silently:
 *
 *  1. WHO sees it. A warehouse manager always does; an operator only with
 *     line-manager access. The Ops scenarios preview an operator, so the gate has
 *     to follow the scenario, not the page.
 *  2. WHEN. Only Open / In Progress. Every task type spells its later states
 *     differently ("partially picked", "pending put-away", "ready to ship"), so the
 *     rule is asserted against each store's real statuses rather than a shared enum.
 *
 * The data functions refuse out-of-scope states themselves, so a stale UI can't
 * write a handover onto a finished task.
 */
import { describe, it, expect, beforeEach } from 'vitest'
// Both composables import their Vue/`useScenario` dependencies explicitly, so the
// real thing can be driven here — no stubbing, which means this asserts the gate
// the app actually ships.
import { isReassignableStatus, useLineManagerAccess } from '~/composables/useLineManagerAccess'
import { useScenario } from '~/composables/useScenario'
import { receivingTasks, reassignReceivingTask } from '~/data/receivingTasks'
import { putAwayTasks, reassignPutAwayTask } from '~/data/putAwayTasks'
import { pickingTasks, reassignPickingTask } from '~/data/pickingTasks'
import { packingTasks, reassignPackingTask } from '~/data/packingTasks'
import { listShipments, reassignShipment, getShipment } from '~/data/deliveryTasks'

const OTHER = 'Someone Else'

describe('who may change an assignee', () => {
  beforeEach(() => {
    const { setLmAccess } = useLineManagerAccess()
    const { setScenario } = useScenario()
    setScenario('ERP')
    setLmAccess(false)
  })

  it('a manager can (ERP and WMS Standalone are manager accounts)', () => {
    const { canReassignTasks } = useLineManagerAccess()
    const { setScenario } = useScenario()

    setScenario('ERP')
    expect(canReassignTasks.value).toBe(true)
    setScenario('WMS Standalone')
    expect(canReassignTasks.value).toBe(true)
  })

  it('a warehouse operator cannot — reassigning someone else\'s work isn\'t theirs', () => {
    const { canReassignTasks } = useLineManagerAccess()
    const { setScenario } = useScenario()

    for (const scenario of ['WMS Ops', 'WMS Ops 2'] as const) {
      setScenario(scenario)
      expect(canReassignTasks.value, scenario).toBe(false)
    }
  })

  it('...unless they have line-manager access', () => {
    const { canReassignTasks, setLmAccess } = useLineManagerAccess()
    const { setScenario } = useScenario()

    setScenario('WMS Ops')
    expect(canReassignTasks.value).toBe(false)
    setLmAccess(true)
    expect(canReassignTasks.value).toBe(true)
    // Revoking takes it away again — it's a grant, not a role change.
    setLmAccess(false)
    expect(canReassignTasks.value).toBe(false)
  })
})

describe('when a handover still means something', () => {
  it('only Open and In Progress', () => {
    expect(isReassignableStatus('open')).toBe(true)
    expect(isReassignableStatus('in progress')).toBe(true)

    // Everything past the work being owed: done, gone, or handed on.
    for (const done of ['completed', 'canceled', 'partially picked', 'pending put-away', 'ready to ship', 'shipped']) {
      expect(isReassignableStatus(done), done).toBe(false)
    }
    expect(isReassignableStatus(undefined)).toBe(false)
  })
})

describe('the stores refuse out-of-scope handovers themselves', () => {
  it('receiving: writes while open/in progress, refuses once ended', () => {
    const live = receivingTasks.find(t => t.status === 'open' || t.status === 'in progress')
    expect(live, 'seed has no live receiving task').toBeTruthy()
    const was = live!.assignee

    expect(reassignReceivingTask(live!.id, OTHER)).toBe(true)
    expect(live!.assignee).toBe(OTHER)
    // Same name again is not a handover.
    expect(reassignReceivingTask(live!.id, OTHER)).toBe(false)
    // Blank is never a handover either.
    expect(reassignReceivingTask(live!.id, '   ')).toBe(false)
    live!.assignee = was

    const ended = receivingTasks.find(t => t.status === 'completed' || t.status === 'canceled')
    if (ended) {
      const holder = ended.assignee
      expect(reassignReceivingTask(ended.id, OTHER)).toBe(false)
      expect(ended.assignee).toBe(holder)
    }
  })

  it('put-away, picking and packing follow the same rule', () => {
    const cases: [string, string, (id: string, who: string) => boolean][] = [
      ['put-away', 'putAway', (id, who) => reassignPutAwayTask(id, who)],
      ['picking', 'picking', (id, who) => reassignPickingTask(id, who)],
      ['packing', 'packing', (id, who) => reassignPackingTask(id, who)],
    ]
    const stores = { putAway: putAwayTasks, picking: pickingTasks, packing: packingTasks } as Record<string, { id: string; status: string; assignee: string }[]>

    for (const [label, key, fn] of cases) {
      const store = stores[key]!
      const live = store.find(t => t.status === 'open' || t.status === 'in progress')
      if (live) {
        const was = live.assignee
        expect(fn(live.id, OTHER), `${label} live`).toBe(true)
        expect(live.assignee).toBe(OTHER)
        live.assignee = was
      }
      const ended = store.find(t => t.status === 'completed' || t.status === 'canceled')
      if (ended) {
        const holder = ended.assignee
        expect(fn(ended.id, OTHER), `${label} ended`).toBe(false)
        expect(ended.assignee).toBe(holder)
      }
    }
  })

  it('a shipment moves every delivery in the batch, not just the first', () => {
    // getShipment() reports the FIRST delivery's assignee, so a partial write would
    // leave the shipment showing whoever happens to sort first.
    const open = listShipments().find(s => s.status === 'open' && s.deliveries.length > 1)
    if (open) {
      const was = open.deliveries.map(d => d.assignee)
      expect(reassignShipment(open.shipmentSeq, OTHER)).toBe(true)
      const after = getShipment(open.shipmentSeq)!
      for (const d of after.deliveries.filter(x => x.status !== 'canceled')) {
        expect(d.assignee).toBe(OTHER)
      }
      open.deliveries.forEach((d, i) => { d.assignee = was[i]! })
    }

    const done = listShipments().find(s => s.status === 'completed')
    if (done) {
      const holder = done.assignee
      expect(reassignShipment(done.shipmentSeq, OTHER)).toBe(false)
      expect(getShipment(done.shipmentSeq)!.assignee).toBe(holder)
    }
  })
})
