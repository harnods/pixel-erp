import { describe, it, expect } from 'vitest'
// Smoke test: the data barrel compiles and re-exports the full graph unambiguously.
import {
  customers, warehouses, salesOrders, outgoingOrders, receipts,
  couriers, billOfMaterials, workOrders, pickingTasks, packingTasks,
  DELIVERY_COURIERS, getCustomer,
} from '~/data'

describe('data barrel (~/data) re-exports the full graph', () => {
  it('exposes representative tables from every domain', () => {
    for (const t of [customers, warehouses, salesOrders, outgoingOrders, receipts,
      couriers, billOfMaterials, workOrders, pickingTasks, packingTasks]) {
      expect(Array.isArray(t)).toBe(true)
    }
    expect(Array.isArray(DELIVERY_COURIERS)).toBe(true)
    expect(typeof getCustomer).toBe('function')
  })
})
