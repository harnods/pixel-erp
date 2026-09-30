import { vendors } from './vendors'
import type { PurchaseQuote, PurchaseQuoteStatus } from './types'

/**
 * Mock purchase quotes (RFQ replies) for a wholesale + retail coffee business
 * — green beans, packaging, machines, logistics. 100 records, generated,
 * keyed to the VENDOR master (`vendors.ts`) so a vendor means the same supplier
 * everywhere (mirrors how `salesQuotes.ts` works on the sell side).
 */

const VENDORS: { id: string; name: string }[] = vendors
  .slice(0, 25)
  .map(v => ({ id: v.id, name: v.name }))

const STATUSES: PurchaseQuoteStatus[] = ['open', 'closed', 'declined']

// Wholesale & retail mix of coffee beans + coffee machine product lines
const TAG_SETS: string[][] = [
  ['Wholesale', 'Beans'],
  ['Retail', 'Machines'],
  ['Wholesale', 'Machines'],
  ['Retail', 'Beans'],
  ['Wholesale', 'Beans', 'Subscription'],
  ['Wholesale', 'Machines', 'Priority'],
  ['Retail', 'Beans', 'Sample'],
  ['Wholesale'],
  ['Retail', 'Machines', 'Trade-in'],
  ['Wholesale', 'Beans', 'Bulk'],
]

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function build(): PurchaseQuote[] {
  const out: PurchaseQuote[] = []
  for (let i = 0; i < 100; i++) {
    const number = 30090 + i
    const vendor = VENDORS[i % VENDORS.length]!
    const status = STATUSES[i % STATUSES.length]!
    const date = addDays('2026-01-02', i)             // one quote per day
    const expirationDate = addDays(date, 14)          // quotes valid for 14 days
    const total = (((i * 31) % 56) + 2) * 2_500_000   // Rp 5jt – 145jt, varied
    out.push({
      id: `PQ${String(i + 1).padStart(3, '0')}`,
      number,
      vendor,
      date,
      expirationDate,
      status,
      total,
      tags: TAG_SETS[i % TAG_SETS.length],
    })
  }
  return out
}

export const purchaseQuotes: PurchaseQuote[] = build()
