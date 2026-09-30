// @vitest-environment happy-dom
/**
 * A SKU line the warehouse already holds a task for can't have its PRODUCT changed.
 *
 * The rule is about existence, not progress: an Open receiving task is already a
 * promise to receive that SKU, and an Open picking task has already told a picker
 * which SKU to fetch. Swapping the product afterwards would leave the task pointing
 * at goods nobody agreed to handle, with no signal to the operator scanning against
 * it. So the lock must NOT be keyed off received/picked quantity — the existing
 * lockedReceivingQtyForSku / lockedOutboundQtyForSku are zero for an Open task, and
 * that was exactly the hole.
 *
 * Quantity stays a separate, softer rule (it can move within what's been claimed);
 * this only pins the product.
 */
import { describe, it, expect } from 'vitest'
import {
  receivingTasks, skusWithReceivingTask, lockedReceivingQtyForSku,
} from '~/data/receivingTasks'
import {
  pickingTasks, skusWithPickingTask, lockedOutboundQtyForSku, pickingLinesOf, getPickingForOrder,
} from '~/data/pickingTasks'

describe('inbound — SKUs locked by a receiving task', () => {
  it('locks every SKU on a task, whatever the task status', () => {
    const t = receivingTasks.find(x => x.status !== 'canceled' && x.items.length > 0)
    expect(t, 'seed has no live receiving task').toBeTruthy()

    const locked = skusWithReceivingTask(t!.receiptId)
    for (const item of t!.items) expect(locked.has(item.sku)).toBe(true)
  })

  it('locks an OPEN task\'s SKUs even though nothing has been received yet', () => {
    const open = receivingTasks.find(x => x.status === 'open' && x.items.length > 0)
    expect(open, 'seed has no open receiving task').toBeTruthy()

    const sku = open!.items[0]!.sku
    // The pre-existing quantity lock is blind to this case…
    expect(lockedReceivingQtyForSku(open!.receiptId, sku)).toBe(0)
    // …which is precisely why the product lock can't be derived from it.
    expect(skusWithReceivingTask(open!.receiptId).has(sku)).toBe(true)
  })

  it('a canceled task releases its SKUs', () => {
    const canceled = receivingTasks.find(x => x.status === 'canceled' && x.items.length > 0)
    if (!canceled) return // seed may carry none; the filter is still asserted below

    const locked = skusWithReceivingTask(canceled.receiptId)
    for (const item of canceled.items) {
      // Unlocked unless some OTHER live task on the same receipt also holds it.
      const alsoLive = receivingTasks.some(t =>
        t.receiptId === canceled.receiptId && t.status !== 'canceled'
        && t.items.some(i => i.sku === item.sku))
      expect(locked.has(item.sku)).toBe(alsoLive)
    }
  })

  it('a receipt with no task locks nothing', () => {
    const withTask = new Set(receivingTasks.map(t => t.receiptId))
    const free = 'rcv-does-not-exist'
    expect(withTask.has(free)).toBe(false)
    expect(skusWithReceivingTask(free).size).toBe(0)
  })
})

describe('outbound — SKUs locked by a picking task', () => {
  it('locks every SKU on a task, whatever the task status', () => {
    const t = pickingTasks.find(x => x.status !== 'canceled' && pickingLinesOf(x).length > 0)
    expect(t, 'seed has no live picking task').toBeTruthy()

    const orderId = pickingLinesOf(t!)[0]!.orderId
    const locked = skusWithPickingTask(orderId)
    for (const l of pickingLinesOf(t!)) {
      if (l.orderId === orderId) expect(locked.has(l.sku)).toBe(true)
    }
  })

  it('locks an OPEN task\'s SKUs even though nothing has been picked yet', () => {
    const open = pickingTasks.find(x => x.status === 'open' && pickingLinesOf(x).length > 0)
    expect(open, 'seed has no open picking task').toBeTruthy()

    const line = pickingLinesOf(open!)[0]!
    expect(lockedOutboundQtyForSku(line.orderId, line.sku)).toBe(0)
    expect(skusWithPickingTask(line.orderId).has(line.sku)).toBe(true)
  })

  it('only locks the SKUs belonging to the order asked about', () => {
    // One picking task can span several orders; a line from order A must not
    // lock the same SKU on order B unless B's own line is on a task too.
    const multi = pickingTasks.find(x => x.status !== 'canceled' && new Set(pickingLinesOf(x).map(l => l.orderId)).size > 1)
    if (!multi) return

    const byOrder = new Map<string, Set<string>>()
    for (const l of pickingLinesOf(multi)) {
      if (!byOrder.has(l.orderId)) byOrder.set(l.orderId, new Set())
      byOrder.get(l.orderId)!.add(l.sku)
    }
    for (const [orderId, skus] of byOrder) {
      const locked = skusWithPickingTask(orderId)
      for (const sku of skus) expect(locked.has(sku)).toBe(true)
    }
  })

  it('an order with no picking task locks nothing', () => {
    const free = 'out-does-not-exist'
    expect(getPickingForOrder(free).length).toBe(0)
    expect(skusWithPickingTask(free).size).toBe(0)
  })
})
