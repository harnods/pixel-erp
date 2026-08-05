/**
 * Courier master coherence — deliveryTasks.ts sources DELIVERY_COURIERS (the ship
 * form's picker) from the courier master (couriers.ts), so the picker and the
 * CouriersPage manage the same list. Seed deliveries likewise only reference courier
 * services that actually exist in the master.
 *
 * Rules validated:
 * 1. DELIVERY_COURIERS equals the master courier names (couriers.map(c => c.name)).
 * 2. Every seed delivery that has a `courier` set uses a name present in the master.
 *    (Self-delivery carries no courier — skipped.)
 */

import { describe, it, expect } from 'vitest'
import { couriers } from '~/data/couriers'
import { deliveryTasks, DELIVERY_COURIERS } from '~/data/deliveryTasks'

describe('DELIVERY_COURIERS ↔ courier master', () => {
  it('DELIVERY_COURIERS equals the master courier names, in order', () => {
    expect(DELIVERY_COURIERS).toEqual(couriers.map(c => c.name))
  })
})

describe('Seed deliveries use only master couriers', () => {
  const masterNames = new Set(couriers.map(c => c.name))
  const withCourier = deliveryTasks.filter(t => t.courier)
  const offMaster = withCourier
    .filter(t => !masterNames.has(t.courier!))
    .map(t => `${t.id}: courier "${t.courier}" not in master`)

  it('there are seed deliveries carrying a courier', () => {
    expect(withCourier.length).toBeGreaterThan(0)
  })

  it('no delivery uses a courier outside the master', () => {
    if (offMaster.length) console.error('\nOFF-MASTER COURIERS:\n' + offMaster.map(f => '  • ' + f).join('\n'))
    expect(offMaster).toHaveLength(0)
  })
})
