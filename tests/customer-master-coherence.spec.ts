/**
 * Customer master coherence — the unified customer master (app/data/customers.ts)
 * is the single source of truth for who the business sells to. Both the accounting
 * sales orders (salesOrders.ts) and the WMS outbound dispatch (outgoing.ts) reference
 * customers by id, so a customer id must mean the same company everywhere.
 *
 * Rules validated:
 * 1. Every salesOrders record's customer.id resolves to a real master record and
 *    its name matches getCustomer(id).name.
 * 2. Every outgoingOrders record with a customerId resolves to a real master record
 *    and its `customer` (display name) equals that master record's name.
 * 3. getCustomer / customerName behave as documented (hit + miss).
 * 4. Customer ids are unique in the master.
 */

import { describe, it, expect } from 'vitest'
import { customers, getCustomer, customerName } from '~/data/customers'
import { salesOrders } from '~/data/salesOrders'
import { outgoingOrders } from '~/data/outgoing'

describe('Sales orders → customer master', () => {
  const unresolved: string[] = []
  const nameMismatch: string[] = []

  for (const so of salesOrders) {
    const master = getCustomer(so.customer.id)
    if (!master) {
      unresolved.push(`${so.id} (${so.number}): customer.id ${so.customer.id} not in master`)
      continue
    }
    if (so.customer.name !== master.name) {
      nameMismatch.push(`${so.id}: customer.name "${so.customer.name}" ≠ master "${master.name}" (${so.customer.id})`)
    }
  }

  it('every sales order customer.id resolves to the master', () => {
    if (unresolved.length) console.error('\nUNRESOLVED:\n' + unresolved.map(f => '  • ' + f).join('\n'))
    expect(unresolved).toHaveLength(0)
  })

  it('every sales order customer.name matches the master name', () => {
    if (nameMismatch.length) console.error('\nNAME MISMATCH:\n' + nameMismatch.map(f => '  • ' + f).join('\n'))
    expect(nameMismatch).toHaveLength(0)
  })
})

describe('Outbound orders → customer master', () => {
  const unresolved: string[] = []
  const nameMismatch: string[] = []

  const withCustomerId = outgoingOrders.filter(o => o.customerId)

  for (const o of withCustomerId) {
    const master = getCustomer(o.customerId!)
    if (!master) {
      unresolved.push(`${o.id} (${o.number}): customerId ${o.customerId} not in master`)
      continue
    }
    // seed orders carry a `customer` display name alongside the FK — it must equal the master name
    if (o.customer !== undefined && o.customer !== master.name) {
      nameMismatch.push(`${o.id}: customer "${o.customer}" ≠ master "${master.name}" (${o.customerId})`)
    }
  }

  it('there are outbound orders carrying a customerId', () => {
    expect(withCustomerId.length).toBeGreaterThan(0)
  })

  it('every outbound customerId resolves to the master', () => {
    if (unresolved.length) console.error('\nUNRESOLVED:\n' + unresolved.map(f => '  • ' + f).join('\n'))
    expect(unresolved).toHaveLength(0)
  })

  it('every outbound customer display name matches the master name', () => {
    if (nameMismatch.length) console.error('\nNAME MISMATCH:\n' + nameMismatch.map(f => '  • ' + f).join('\n'))
    expect(nameMismatch).toHaveLength(0)
  })
})

describe('getCustomer / customerName helpers', () => {
  it('resolves a known id', () => {
    const c = getCustomer('C001')
    expect(c).toBeDefined()
    expect(c!.name).toBe('Anomali Coffee')
    expect(customerName('C001')).toBe('Anomali Coffee')
  })

  it('unknown id → getCustomer undefined, customerName echoes the id', () => {
    expect(getCustomer('NOPE')).toBeUndefined()
    expect(customerName('NOPE')).toBe('NOPE')
  })
})

describe('Customer master integrity', () => {
  it('customer ids are unique', () => {
    const ids = customers.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
