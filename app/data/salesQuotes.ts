import type { SalesQuote, SalesQuoteStatus } from './types'
import { loadCreated, saveCreated } from './persist'

/**
 * Mock sales quotes for a wholesale + retail coffee business
 * (coffee beans and coffee machines). 100 records, generated.
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

const STATUSES: SalesQuoteStatus[] = ['open', 'closed', 'declined']

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

function build(): SalesQuote[] {
  const out: SalesQuote[] = []
  for (let i = 0; i < 100; i++) {
    const number = 20090 + i
    const customer = CUSTOMERS[i % CUSTOMERS.length]
    const status = STATUSES[i % STATUSES.length]
    const date = addDays('2026-01-02', i)             // one quote per day
    const expirationDate = addDays(date, 14)          // quotes valid for 14 days
    const total = (((i * 31) % 56) + 2) * 2_500_000   // Rp 5jt – 145jt, varied
    out.push({
      id: `SQ${String(i + 1).padStart(3, '0')}`,
      number,
      customer,
      date,
      expirationDate,
      status,
      total,
      tags: TAG_SETS[i % TAG_SETS.length],
    })
  }
  return out
}

export const salesQuotes: SalesQuote[] = build()

// User-created quotes (New sales quote form) survive a reload — appended after the seed.
const CREATED_KEY = 'sales-quotes-created'
for (const q of loadCreated<SalesQuote>(CREATED_KEY)) if (!salesQuotes.some(x => x.id === q.id)) salesQuotes.push(q)
export function addSalesQuote(quote: SalesQuote): SalesQuote {
  salesQuotes.push(quote)
  saveCreated(CREATED_KEY, [...loadCreated<SalesQuote>(CREATED_KEY), quote])
  return quote
}
/** Edit of a user-created quote is persisted; edits to seed quotes stay in session. */
export function updateSalesQuote(quote: SalesQuote): void {
  const i = salesQuotes.findIndex(q => q.id === quote.id)
  if (i >= 0) salesQuotes[i] = quote
  const created = loadCreated<SalesQuote>(CREATED_KEY)
  if (created.some(q => q.id === quote.id)) saveCreated(CREATED_KEY, created.map(q => (q.id === quote.id ? quote : q)))
}

/** "Awaiting approval" queue for the Sales quotes › Awaiting approval tab. */
export function awaitingSalesQuotes(): SalesQuote[] {
  return salesQuotes.filter(r => r.number % 7 === 0)
}
export function awaitingSalesQuotesCount(): number { return awaitingSalesQuotes().length }
