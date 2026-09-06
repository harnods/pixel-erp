import type { SalesDelivery, FulfillmentStatus, BillingStatus } from './types'

/**
 * Mock sales deliveries for a wholesale + retail coffee business
 * (coffee beans and coffee machines). ~100 records, generated.
 */

const CUSTOMERS: { id: string; name: string }[] = [
  { id: 'C001', name: 'Anomali Coffee' },
  { id: 'C002', name: 'Tanamera Coffee Roastery' },
  { id: 'C003', name: 'Hotel Mulia Senayan' },
  { id: 'C004', name: 'Fore Coffee Thamrin' },
  { id: 'C005', name: 'Djournal Coffee' },
  { id: 'C006', name: 'Kopi Kenangan Pusat' },
  { id: 'C007', name: 'Common Grounds PIK' },
  { id: 'C008', name: 'Titik Temu Coffee' },
  { id: 'C009', name: 'Maxx Coffee Lippo Mall' },
  { id: 'C010', name: 'Janji Jiwa Kemang' },
  { id: 'C011', name: 'Tuku Coffee Cipete' },
  { id: 'C012', name: 'Coffee Cult Bali' },
  { id: 'C013', name: 'Excelso Grand Indonesia' },
  { id: 'C014', name: 'GoWork Office Tower' },
  { id: 'C015', name: 'Distributor Sentra Boga' },
  { id: 'C016', name: 'Warung Kopi Modern' },
  { id: 'C017', name: 'Santika Premiere Hotel' },
  { id: 'C018', name: 'Kopi Nako Bintaro' },
  { id: 'C019', name: 'Retail Mart Segar' },
  { id: 'C020', name: 'Toko Mesin Kopi Bandung' },
  { id: 'C021', name: 'Resto Bumbu Desa' },
  { id: 'C022', name: 'Cafe Halaman Jogja' },
  { id: 'C023', name: 'Filosofi Kopi Melawai' },
  { id: 'C024', name: 'One Eighty Coffee' },
  { id: 'C025', name: 'Pochi Coffee Roasters' },
]

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

function build(): SalesDelivery[] {
  const out: SalesDelivery[] = []
  for (let i = 0; i < 100; i++) {
    const number = 20001 + i
    const customer = CUSTOMERS[i % CUSTOMERS.length]
    const fulfillmentStatus = FULFILLMENT[i % FULFILLMENT.length]
    // Billing is INDEPENDENT of fulfillment — being delivered doesn't mean it's
    // invoiced yet. "Delivered, not yet invoiced" is exactly the state the
    // "Create sales invoice" action exists for. Goods still in transit aren't
    // billed yet; delivered/direct are a genuine mix (i % 3 picks ~1/3 unbilled).
    const billingStatus: BillingStatus =
      fulfillmentStatus === 'in transit'
        ? 'unbilled'
        : i % 3 === 0 ? 'unbilled' : 'invoiced'
    const date = addDays('2026-01-02', i)          // one delivery per day
    const total = (((i * 31) % 44) + 3) * 1_750_000  // Rp ~5jt – 80jt, varied
    out.push({
      id: `SD${String(i + 1).padStart(3, '0')}`,
      number,
      customer,
      date,
      fulfillmentStatus,
      billingStatus,
      total,
      tags: TAG_SETS[i % TAG_SETS.length],
    })
  }
  return out
}

export const salesDeliveries: SalesDelivery[] = build()

/** "Awaiting approval" queue for the Sales deliveries › Awaiting approval tab. */
export function awaitingSalesDeliveries(): SalesDelivery[] {
  return salesDeliveries.filter(r => r.number % 7 === 0)
}
export function awaitingSalesDeliveriesCount(): number { return awaitingSalesDeliveries().length }
