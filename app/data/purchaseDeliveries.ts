import type { PurchaseDelivery, FulfillmentStatus, BillingStatus } from './types'
import { reactive } from 'vue'
import { vendors } from './vendors'
import { loadCreated, saveCreated } from './persist'

/**
 * Mock purchase deliveries — the buy-side mirror of salesDeliveries.ts. A coffee
 * roastery+wholesale RECEIVING goods from its vendors (green beans, packaging,
 * machines, logistics). ~100 records, generated, vendor-keyed.
 */

const VENDORS: { id: string; name: string }[] = vendors
  .slice(0, 25)
  .map(v => ({ id: v.id, name: v.name }))

// In transit / direct / delivered — weighted toward delivered (the steady state)
const FULFILLMENT: FulfillmentStatus[] = [
  'delivered', 'in transit', 'delivered', 'direct',
  'delivered', 'in transit', 'delivered', 'direct',
]

const TAG_SETS: string[][] = [
  ['Wholesale', 'Beans'],
  ['Retail', 'Machines'],
  ['Wholesale', 'Machines'],
  ['Retail', 'Beans'],
  ['Wholesale', 'Beans', 'Subscription'],
  ['Wholesale', 'Machines', 'Priority'],
  ['Retail', 'Beans', 'Sample'],
  ['Wholesale'],
]

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function build(): PurchaseDelivery[] {
  const out: PurchaseDelivery[] = []
  for (let i = 0; i < 100; i++) {
    const number = 30001 + i
    const vendor = VENDORS[i % VENDORS.length]!
    const fulfillmentStatus = FULFILLMENT[i % FULFILLMENT.length]!
    // Billing is INDEPENDENT of fulfillment — being delivered doesn't mean it's
    // invoiced yet. "Delivered, not yet invoiced" is exactly the state the
    // "Create purchase invoice" action exists for. Goods still in transit aren't
    // billed yet; delivered/direct are a genuine mix (i % 3 picks ~1/3 unbilled).
    const billingStatus: BillingStatus =
      fulfillmentStatus === 'in transit'
        ? 'unbilled'
        : i % 3 === 0 ? 'unbilled' : 'invoiced'
    const date = addDays('2026-01-02', i)          // one delivery per day
    const total = (((i * 31) % 44) + 3) * 1_750_000  // Rp ~5jt – 80jt, varied
    out.push({
      id: `PD${String(i + 1).padStart(3, '0')}`,
      number,
      vendor,
      date,
      fulfillmentStatus,
      billingStatus,
      total,
      tags: TAG_SETS[i % TAG_SETS.length],
    })
  }
  return out
}

export const purchaseDeliveries: PurchaseDelivery[] = build()

// ── User-created / user-edited purchase deliveries (New/Edit purchase delivery
// form). Persisted with loadCreated/saveCreated and kept OUT of the seed array
// (deliveryDocuments hashes into it), so seed-derived screens never shift.
export interface CreatedPurchaseDeliveryDetail {
  email: string[]
  shipTo: string
  receivedDate: string
  shipVia: string
  trackingNo: string
  referenceNo: string
  warehouse: string
  message: string
  memo: string
  shippingFee: number
  lineItems: { product: string; sku: string; description: string; orderedQty: number; qty: number; unit: string }[]
  lastUpdatedAt: string
}
export type CreatedPurchaseDelivery = PurchaseDelivery & { detail?: CreatedPurchaseDeliveryDetail }
const PD_CREATED_KEY = 'purchaseDeliveries.created'
export const createdPurchaseDeliveries: CreatedPurchaseDelivery[] = reactive(loadCreated<CreatedPurchaseDelivery>(PD_CREATED_KEY))

export function nextPurchaseDeliveryNumber(): number {
  return [...purchaseDeliveries, ...createdPurchaseDeliveries].reduce((max, d) => Math.max(max, d.number), 30000) + 1
}
export function savePurchaseDelivery(input: Omit<CreatedPurchaseDelivery, 'id' | 'number'> & { id?: string }): CreatedPurchaseDelivery {
  const existing = input.id ? createdPurchaseDeliveries.find(d => d.id === input.id) : undefined
  if (existing) {
    Object.assign(existing, input)
    saveCreated(PD_CREATED_KEY, createdPurchaseDeliveries)
    return existing
  }
  const number = nextPurchaseDeliveryNumber()
  const rec: CreatedPurchaseDelivery = { ...input, id: `PDN${number}`, number }
  createdPurchaseDeliveries.unshift(rec)
  saveCreated(PD_CREATED_KEY, createdPurchaseDeliveries)
  return rec
}
