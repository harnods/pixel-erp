// @vitest-environment happy-dom
/**
 * manual_trigger_delivery — held delivery posting and the source trigger.
 * A6 param 13 · A7 AC#6 · D1 AC#8 + status model pt 4 · D2 AC#7 · D5 AC#10.
 *
 * The rule these all turn on: PHYSICAL progress and FINANCIAL posting are two
 * separate fields that must never collapse. A held outbound has still shipped —
 * it advances to Completed, it is no longer cancellable — it just has no delivery
 * document yet. Every assertion below is really guarding that separation, because
 * collapsing the two is the easy mistake and it would either lose a cancellation
 * guard or double-deduct stock.
 */
import { describe, it, expect } from 'vitest'
import {
  outgoingOrders, isManualTriggerDelivery, deliveryPostingStatusOf,
  setDeliveryPostingStatus, canCancelOutboundOrder,
} from '~/data/outgoing'
import { deliveryTasks, triggerDeliveryPosting } from '~/data/deliveryTasks'
import { deliveryDocumentRoute } from '~/data/outgoing'
import { posterKindFor, bindSeededDocument } from '~/data/deliveryDocuments'
import { useScenario } from '~/composables/useScenario'
import { wmsStockAdjustments } from '~/data/wmsStockAdjustments'
import { salesDeliveries } from '~/data/salesDeliveries'

/** The seeded A6 demo: an ERP-SO outbound with the flag on. */
const DEMO = 'out-demo-001'

function order(id: string) {
  const o = outgoingOrders.find(x => x.id === id)
  if (!o) throw new Error(`${id} missing from seed`)
  return o
}

describe('A6 — the manual_trigger_delivery flag', () => {
  it('defaults to FALSE, so an unflagged outbound posts as it always did', () => {
    const plain = outgoingOrders.find(o => o.manualTriggerDelivery === undefined)
    expect(plain, 'seed has no unflagged outbound').toBeTruthy()
    expect(isManualTriggerDelivery(plain!)).toBe(false)
  })

  it('is carried on the outbound when the source sets it', () => {
    expect(isManualTriggerDelivery(order(DEMO))).toBe(true)
  })
})

describe('D1 status model pt 4 — posting status is its own field', () => {
  it('reports "held" until a document exists, whatever the physical status', () => {
    const o = order(DEMO)
    const was = o.deliveryPostingStatus

    o.deliveryPostingStatus = undefined
    expect(deliveryPostingStatusOf(o)).toBe('held') // nothing posted yet
    setDeliveryPostingStatus(o.id, 'held')
    expect(deliveryPostingStatusOf(o)).toBe('held')
    setDeliveryPostingStatus(o.id, 'posted')
    expect(deliveryPostingStatusOf(o)).toBe('posted')

    o.deliveryPostingStatus = was
  })

  it('D2 AC#7 — the SHIP event closes cancellation, not the posting', () => {
    const o = order(DEMO)
    const wasQty = o.shippedQty
    const wasPosting = o.deliveryPostingStatus

    // Not shipped: cancellable regardless of posting state.
    o.shippedQty = 0
    o.deliveryPostingStatus = 'held'
    expect(canCancelOutboundOrder(o)).toBe(true)

    // Shipped but HELD: still not cancellable — the goods have gone even though no
    // delivery document exists. This is the guard the AC adds.
    o.shippedQty = 1
    expect(canCancelOutboundOrder(o)).toBe(false)

    // Shipped and posted: unchanged.
    o.deliveryPostingStatus = 'posted'
    expect(canCancelOutboundOrder(o)).toBe(false)

    o.shippedQty = wasQty
    o.deliveryPostingStatus = wasPosting
  })
})

describe('A7 AC#6 — the source trigger is the only path for a held outbound', () => {
  it('rejects an unknown outbound', () => {
    expect(triggerDeliveryPosting('out-does-not-exist')).toEqual({ ok: false, error: 'not_found' })
  })

  it('rejects with outbound_still_not_shipped before the ship event', () => {
    // An order with no shipped delivery behind it.
    const unshipped = outgoingOrders.find(o =>
      !deliveryTasks.some(t => t.salesOrderId === o.id && t.status === 'shipped'))
    expect(unshipped, 'seed has no unshipped outbound').toBeTruthy()

    const res = triggerDeliveryPosting(unshipped!.id)
    expect(res).toEqual({ ok: false, error: 'outbound_still_not_shipped' })
  })

  it('posts once, then reports duplicate_ignored — the call is idempotent', () => {
    const shippedTask = deliveryTasks.find(t => t.status === 'shipped')
    expect(shippedTask, 'seed has no shipped delivery').toBeTruthy()
    const o = order(shippedTask!.salesOrderId)

    const wasFlag = o.manualTriggerDelivery
    const wasPosting = o.deliveryPostingStatus
    o.manualTriggerDelivery = true
    o.deliveryPostingStatus = 'held'

    expect(triggerDeliveryPosting(o.id)).toEqual({ ok: true, state: 'posted' })
    expect(deliveryPostingStatusOf(o)).toBe('posted')

    // Second trigger for the same key: no second document.
    expect(triggerDeliveryPosting(o.id)).toEqual({ ok: true, state: 'duplicate_ignored' })

    o.manualTriggerDelivery = wasFlag
    o.deliveryPostingStatus = wasPosting
  })

  it('rejects with delivery_already_posted when WMS posted it itself (flag FALSE)', () => {
    const shippedTask = deliveryTasks.find(t => t.status === 'shipped')
    const o = order(shippedTask!.salesOrderId)

    const wasFlag = o.manualTriggerDelivery
    const wasPosting = o.deliveryPostingStatus
    o.manualTriggerDelivery = false
    o.deliveryPostingStatus = 'posted'

    // Not the idempotency case: nobody held this one, so a source trigger is wrong.
    expect(triggerDeliveryPosting(o.id)).toEqual({ ok: false, error: 'delivery_already_posted' })

    o.manualTriggerDelivery = wasFlag
    o.deliveryPostingStatus = wasPosting
  })
})

describe('the poster is package-conditional (WMS-only has no Sales Delivery)', () => {
  it('WMS package always posts a Stock In/Out, whatever the source', () => {
    const { setScenario } = useScenario()
    const erpSourced = outgoingOrders.find(o => o.source === 'Sales Order')
    expect(erpSourced, 'seed has no ERP-SO outbound').toBeTruthy()

    for (const s of ['WMS Standalone', 'WMS Ops', 'WMS Ops 2'] as const) {
      setScenario(s)
      // No costing and no JE in the WMS package, so an accounting document can
      // never be the poster there — not even for a Sales Order source.
      expect(posterKindFor(erpSourced!), s).toBe('stock-in-out')
    }
    setScenario('ERP')
  })

  it('ERP full posts a Sales Delivery for a Sales Order source, Stock In/Out otherwise', () => {
    const { setScenario } = useScenario()
    setScenario('ERP')

    const erpSourced = outgoingOrders.find(o => o.source === 'Sales Order')!
    expect(posterKindFor(erpSourced)).toBe('sales-delivery')

    const other = outgoingOrders.find(o => o.source !== 'Sales Order')
    expect(other, 'seed has no non-SO outbound').toBeTruthy()
    expect(posterKindFor(other!)).toBe('stock-in-out')
  })

  it('every document it binds is a real record, reachable by its own route', () => {
    const { setScenario } = useScenario()
    const order = outgoingOrders.find(o => o.source === 'Sales Order')!

    setScenario('WMS Standalone')
    const io = bindSeededDocument(order, posterKindFor(order))!
    expect(io.kind).toBe('stock-in-out')
    expect(io.number).toMatch(/^Stock In\/Out #/)
    expect(wmsStockAdjustments.some(a => a.id === io.id)).toBe(true)
    expect(deliveryDocumentRoute(io)).toBe(`/stock-adjustments/${io.id}`)

    setScenario('ERP')
    const sd = bindSeededDocument(order, posterKindFor(order))!
    expect(sd.kind).toBe('sales-delivery')
    expect(sd.number).toMatch(/^Sales Delivery #/)
    expect(salesDeliveries.some(d => d.id === sd.id)).toBe(true)
    expect(deliveryDocumentRoute(sd)).toBe(`/sales-deliveries/${sd.id}`)
  })

  it('binds the same document for the same order every time', () => {
    const { setScenario } = useScenario()
    setScenario('WMS Standalone')
    const order = outgoingOrders.find(o => o.source === 'Sales Order')!
    const a = bindSeededDocument(order, 'stock-in-out')
    const b = bindSeededDocument(order, 'stock-in-out')
    expect(a).toEqual(b)
    setScenario('ERP')
  })
})
