/**
 * salesNo FK coherence — an OutgoingOrder (dispatch) may carry an optional
 * `salesOrderId` FK into the ERP sales orders (salesOrders.ts). When set, the
 * dispatch inherits its `salesNo`, `customer` and `customerId` from that linked
 * sales order. When absent, the dispatch is a marketplace / manual order with no
 * ERP sales order behind it.
 *
 * Rules validated:
 * 1. Every dispatch WITH a salesOrderId resolves to a real sales order, its salesNo
 *    equals `Sales Order #${so.number}`, and its customer/customerId match the linked
 *    sales order's customer (dispatch inherits customer from the sales order).
 * 2. Dispatches WITHOUT a salesOrderId are marketplace/manual — salesNo starts with
 *    '#SO' OR source isn't 'Sales Order'. (See KNOWN GAP below.)
 * 3. No two ERP dispatches share the same salesOrderId (unique FK allocation).
 */

import { describe, it, expect } from 'vitest'
import { outgoingOrders } from '~/data/outgoing'
import { salesOrders } from '~/data/salesOrders'

const soById = new Map(salesOrders.map(so => [so.id, so]))

describe('Dispatches with a salesOrderId → sales order', () => {
  const linked = outgoingOrders.filter(o => o.salesOrderId)
  const unresolved: string[] = []
  const salesNoMismatch: string[] = []
  const customerMismatch: string[] = []

  for (const o of linked) {
    const so = soById.get(o.salesOrderId!)
    if (!so) {
      unresolved.push(`${o.id}: salesOrderId ${o.salesOrderId} not in salesOrders`)
      continue
    }
    const expectedSalesNo = `Sales Order #${so.number}`
    if (o.salesNo !== expectedSalesNo) {
      salesNoMismatch.push(`${o.id}: salesNo "${o.salesNo}" ≠ "${expectedSalesNo}"`)
    }
    if (o.customerId !== so.customer.id) {
      customerMismatch.push(`${o.id}: customerId "${o.customerId}" ≠ SO "${so.customer.id}"`)
    }
    if (o.customer !== undefined && o.customer !== so.customer.name) {
      customerMismatch.push(`${o.id}: customer "${o.customer}" ≠ SO "${so.customer.name}"`)
    }
  }

  it('there are ERP-linked dispatches', () => {
    expect(linked.length).toBeGreaterThan(0)
  })

  it('every salesOrderId resolves to a real sales order', () => {
    if (unresolved.length) console.error('\nUNRESOLVED:\n' + unresolved.map(f => '  • ' + f).join('\n'))
    expect(unresolved).toHaveLength(0)
  })

  it('salesNo equals `Sales Order #${number}` of the linked order', () => {
    if (salesNoMismatch.length) console.error('\nSALESNO MISMATCH:\n' + salesNoMismatch.map(f => '  • ' + f).join('\n'))
    expect(salesNoMismatch).toHaveLength(0)
  })

  it('customer / customerId are inherited from the linked sales order', () => {
    if (customerMismatch.length) console.error('\nCUSTOMER MISMATCH:\n' + customerMismatch.map(f => '  • ' + f).join('\n'))
    expect(customerMismatch).toHaveLength(0)
  })
})

describe('Dispatches without a salesOrderId are marketplace/manual', () => {
  const unlinked = outgoingOrders.filter(o => !o.salesOrderId)

  // A dispatch with no ERP FK is expected to be marketplace/manual: either its
  // salesNo uses the '#SO…' format, or its source is not the ERP 'Sales Order'.
  const matchesPattern = (o: (typeof unlinked)[number]) =>
    o.salesNo.startsWith('#SO') || o.source !== 'Sales Order'

  const violations = unlinked.filter(o => !matchesPattern(o)).map(o => o.id)

  // Every dispatch is now coherent: an order is either linked to a real sales
  // order via salesOrderId, or it's genuinely marketplace/manual ('#SO…' salesNo
  // or a non-'Sales Order' source). No record claims an ERP sales order in its
  // display string without wiring the FK. (The two former demo-order gaps —
  // out-demo-001, out-demo-multi-a — now carry real salesOrderId FKs.)
  it('has no pattern violators: no ERP-labelled dispatch is missing its FK', () => {
    if (violations.length) console.error('\nPATTERN VIOLATORS (FK gap):\n' + violations.map(f => '  • ' + f).join('\n'))
    expect(violations).toHaveLength(0)
  })
})

describe('ERP dispatch → sales order FK is unique', () => {
  it('no two dispatches share the same salesOrderId', () => {
    const ids = outgoingOrders.map(o => o.salesOrderId).filter(Boolean) as string[]
    const seen = new Map<string, number>()
    for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1)
    const dupes = [...seen.entries()].filter(([, n]) => n > 1).map(([id, n]) => `${id} ×${n}`)
    if (dupes.length) console.error('\nDUPLICATE salesOrderId:\n' + dupes.map(f => '  • ' + f).join('\n'))
    expect(dupes).toHaveLength(0)
  })
})
