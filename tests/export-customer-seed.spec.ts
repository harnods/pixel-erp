/**
 * The export customer (C026 Nordic Roasters AB) is appended to customers.ts, but
 * salesInvoices.ts and salesOrders.ts assign buyers POSITIONALLY — `pool[i % pool.length]`.
 * Letting it into either pool shifts every row's buyer by one and silently
 * rewrites the whole demo data set, which is the kind of change nothing else
 * would catch. These tests pin the invariant.
 */
import { describe, it, expect } from 'vitest'
import { salesInvoices } from '~/data/salesInvoices'
import { salesOrders } from '~/data/salesOrders'
import { contacts, findContactByDisplayName } from '~/data/contacts'

const name = (id: string) => salesInvoices.find(i => i.id === id)?.customer.name

describe('seed integrity after adding the export customer', () => {
  it('leaves every existing invoice→customer mapping untouched', () => {
    expect(name('SI150')).toBe('Pochi Coffee Roasters')
    expect(name('SI149')).toBe('One Eighty Coffee')
    expect(name('SI148')).toBe('Filosofi Kopi Melawai')
    expect(name('SI140')).toBe('Distributor Sentra Boga')
    expect(name('SI133')).toBe('Titik Temu Coffee')
    expect(name('SI103')).toBe('Hotel Mulia Senayan')
  })
  it('attaches the export buyer to exactly the named invoices', () => {
    const exports = salesInvoices.filter(i => i.customer.name === 'Nordic Roasters AB').map(i => i.id).sort()
    expect(exports).toEqual(['SI062', 'SI110', 'SI121'])
  })
  it('keeps the export customer out of sales orders', () => {
    expect(salesOrders.some(o => o.customer.name === 'Nordic Roasters AB')).toBe(false)
  })
  it('has exactly one foreign contact, resolvable from the invoice', () => {
    const foreign = contacts.filter(c => c.domicile === 'foreign')
    expect(foreign.map(c => c.displayName)).toEqual(['Nordic Roasters AB'])
    expect(foreign[0]!.npwp).toBe('')
    expect(foreign[0]!.tin).not.toBe('')
    expect(findContactByDisplayName('Nordic Roasters AB')?.id).toBe('CT013')
  })
})
