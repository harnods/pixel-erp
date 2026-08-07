/**
 * Seed status coverage — the pre-seeded mock DB must contain at least one record
 * in EVERY status across the inbound and outbound flows, so any status transition
 * can be tested from a ready starting point (e.g. an "Out for delivery" package
 * already sitting there to test → Shipped) without walking the whole chain.
 */
import { describe, it, expect } from 'vitest'
import { receipts } from '~/data/receipts'
import { receivingTasks } from '~/data/receivingTasks'
import { putAwayTasks } from '~/data/putAwayTasks'
import { outgoingOrders } from '~/data/outgoing'
import { pickingTasks } from '~/data/pickingTasks'
import { packingTasks } from '~/data/packingTasks'
import { deliveryTasks } from '~/data/deliveryTasks'
import '~/data/index'
import '~/data/seedCoverage'

function counts<T extends Record<string, unknown>>(arr: readonly T[], key = 'status'): Record<string, number> {
  const m: Record<string, number> = {}
  for (const x of arr) { const k = String(x[key] ?? '∅'); m[k] = (m[k] ?? 0) + 1 }
  return m
}

const GROUPS: { name: string; get: () => readonly Record<string, unknown>[]; statuses: string[]; key?: string }[] = [
  { name: 'Receipt', get: () => receipts, statuses: ['pending', 'open', 'in progress', 'partial reception', 'completed', 'canceled'] },
  { name: 'Receiving task', get: () => receivingTasks, statuses: ['open', 'in progress', 'pending put-away', 'completed', 'canceled'] },
  { name: 'Put-away task', get: () => putAwayTasks, statuses: ['open', 'in progress', 'completed', 'canceled'] },
  { name: 'Outbound order', get: () => outgoingOrders, statuses: ['pending', 'open', 'in progress', 'partially shipped', 'completed', 'canceled'] },
  { name: 'Picking task', get: () => pickingTasks, statuses: ['open', 'in progress', 'partially picked', 'completed', 'canceled'] },
  { name: 'Packing task', get: () => packingTasks, statuses: ['open', 'in progress', 'completed', 'canceled'] },
  { name: 'Delivery (shipping) task', get: () => deliveryTasks, statuses: ['ready to ship', 'out for delivery', 'shipped', 'canceled'] },
  { name: 'Shipment document', get: () => deliveryTasks.filter((d) => (d as Record<string, unknown>).shipmentStatus), statuses: ['open', 'completed'], key: 'shipmentStatus' },
]

describe('Seed covers every status (inbound + outbound)', () => {
  for (const g of GROUPS) {
    describe(g.name, () => {
      for (const s of g.statuses) {
        it(`has ≥1 record in '${s}'`, () => {
          const c = counts(g.get(), g.key)
          expect(c[s] ?? 0, `${g.name} status counts: ${JSON.stringify(c)}`).toBeGreaterThan(0)
        })
      }
    })
  }
})
