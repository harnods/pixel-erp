import type { SalesQuote, SalesQuoteStatus } from './types'

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
