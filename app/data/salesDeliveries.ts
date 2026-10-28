import type { SalesDelivery, SDDeliveryLine, FulfillmentStatus, BillingStatus } from './types'
import { loadCreated, saveCreated } from './persist'
import { salesOrders } from './salesOrders'

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

/** A percentage of the ordered quantity, truncated to six decimals (PRD R-03, E-04). */
export function derivedQty(orderedQty: number, percent: number): number {
  return Math.trunc(orderedQty * (percent / 100) * 1e6) / 1e6
}

/**
 * Tranche deliveries against the contract orders in salesOrders.ts. These are the
 * records the percentage work reads: each line keeps the mode and the figure the
 * user typed beside the quantity it produced, so the audit trail is real data and
 * not a display trick.
 *
 * SO101 follows the PRD's worked example — 40% then 33% on both lines, leaving 27%.
 * SO102 is deliberately uneven: the service line is at 50%, the machine line
 * untouched, so the order reads `Mixed`. SO103 is complete at 100%.
 */
const SRV = (i: number, product: string, sku: string, description: string, qty: number, mode: 'qty' | 'percent', value: number): SDDeliveryLine =>
  ({ orderLineIndex: i, product, sku, description, unit: 'lot', qty, inputMode: mode, inputValue: value })
const UNIT = (i: number, product: string, sku: string, description: string, qty: number, mode: 'qty' | 'percent', value: number): SDDeliveryLine =>
  ({ orderLineIndex: i, product, sku, description, unit: 'unit', qty, inputMode: mode, inputValue: value })

const CONTRACT_DELIVERIES: SalesDelivery[] = [
  {
    id: 'SD101', number: 20101, customer: { id: 'C015', name: 'Distributor Sentra Boga' },
    date: '2026-03-02', fulfillmentStatus: 'partially delivered', billingStatus: 'invoiced',
    total: 400_000_000, tags: ['Contract'], orderId: 'SO101',
    items: [
      SRV(0, 'Instalasi & commissioning', 'SRV-INST', 'Termin 1 — 40%', derivedQty(1, 40), 'percent', 40),
      UNIT(1, 'Panel Listrik', 'PNL-16', 'Termin 1 — 40%', derivedQty(16, 40), 'percent', 40),
    ],
  },
  {
    id: 'SD102', number: 20102, customer: { id: 'C015', name: 'Distributor Sentra Boga' },
    date: '2026-04-06', fulfillmentStatus: 'partially delivered', billingStatus: 'unbilled',
    total: 330_000_000, tags: ['Contract'], orderId: 'SO101',
    items: [
      SRV(0, 'Instalasi & commissioning', 'SRV-INST', 'Termin 2 — 33%', derivedQty(1, 33), 'percent', 33),
      UNIT(1, 'Panel Listrik', 'PNL-16', 'Termin 2 — 33%', derivedQty(16, 33), 'percent', 33),
    ],
  },
  {
    id: 'SD103', number: 20103, customer: { id: 'C003', name: 'Hotel Mulia Senayan' },
    // After the Q2 period lock (2026-06-30), so this is the editable tranche;
    // SD101/SD102 fall inside locked periods and show no Edit (R-19).
    date: '2026-07-20', fulfillmentStatus: 'partially delivered', billingStatus: 'unbilled',
    total: 100_000_000, tags: ['Contract'], orderId: 'SO102',
    items: [SRV(0, 'Jasa pemeliharaan', 'SRV-MTN', 'Termin 1 — 50%', derivedQty(1, 50), 'percent', 50)],
  },
  {
    id: 'SD104', number: 20104, customer: { id: 'C006', name: 'Kopi Kenangan Pusat' },
    date: '2026-02-18', fulfillmentStatus: 'delivered', billingStatus: 'invoiced',
    total: 150_000_000, tags: ['Contract'], orderId: 'SO103',
    items: [SRV(0, 'Jasa instalasi', 'SRV-FIT', 'Delivered in full', 1, 'percent', 100)],
  },
]

/**
 * A contract delivery's total comes from its own lines at the order's prices, plus
 * PPN 11% — the same tax-inclusive basis as every generated delivery — so the index
 * row and the detail page land on one number. The figures in the seed above are
 * placeholders and get replaced here.
 */
function priced(d: SalesDelivery): SalesDelivery {
  const order = salesOrders.find(o => o.id === d.orderId)
  if (!order || !d.items) return d
  const preTax = d.items.reduce((sum, l) => {
    const line = order.items[l.orderLineIndex]
    return sum + (line ? l.qty * line.unitPrice * (1 - line.discountPct / 100) : 0)
  }, 0)
  return { ...d, total: Math.round(preTax + Math.round(preTax * 0.11)) }
}

export const salesDeliveries: SalesDelivery[] = [...build(), ...CONTRACT_DELIVERIES.map(priced)]

/**
 * TS-001. How far a line had gone once THIS delivery posted — the cumulative
 * quantity across this order's deliveries up to and including this one, in date
 * order (id breaks a same-day tie). This is the "new cumulative percentage" the
 * audit trail shows, which differs from the line's progress today.
 */
export function cumulativeAt(orderId: string, orderLineIndex: number, deliveryId: string): number {
  const self = salesDeliveries.find(d => d.id === deliveryId)
  if (!self) return 0
  const key = (d: SalesDelivery) => `${d.date}|${d.id}`
  return salesDeliveries
    .filter(d => d.orderId === orderId && d.items && key(d) <= key(self))
    .reduce((sum, d) => sum + d.items!.filter(l => l.orderLineIndex === orderLineIndex).reduce((a, l) => a + l.qty, 0), 0)
}

/**
 * Delivered-to-date per sales order line, keyed by the line's index in
 * SalesOrder.items. The single source for progress-so-far (PRD R-05), the
 * over-delivery check (R-06) and Fill Remaining (R-14) — all three must read the
 * same number or they can disagree. Percent is always against the ORDERED
 * quantity, never the remaining balance (R-02), so the caller supplies it.
 */
export function deliveredByLine(orderId: string, excludeDeliveryId?: string): Record<number, number> {
  const out: Record<number, number> = {}
  for (const d of salesDeliveries) {
    // Editing a delivery re-checks the limit against everything ELSE delivered —
    // counting the delivery being edited would block it against itself (R-17).
    if (d.orderId !== orderId || !d.items || d.id === excludeDeliveryId) continue
    for (const l of d.items) out[l.orderLineIndex] = (out[l.orderLineIndex] ?? 0) + l.qty
  }
  return out
}

/**
 * OD-003. A released lock is permanent and one way: the line becomes QTY forever
 * (R-16). Releases are user actions, so they persist like any other created
 * record rather than being regenerated with the seed.
 */
export interface InputBasisRelease {
  orderId: string
  orderLineIndex: number
  by: string
  reason: string
  date: string
}
const RELEASE_KEY = 'sales-delivery-basis-releases'
export const inputBasisReleases: InputBasisRelease[] = loadCreated<InputBasisRelease>(RELEASE_KEY)

function isReleased(orderId: string, orderLineIndex: number): boolean {
  return inputBasisReleases.some(r => r.orderId === orderId && r.orderLineIndex === orderLineIndex)
}

/**
 * The delivery that locked a line to PERCENT, or null when the line is free
 * (R-08 → R-10). Only PERCENT locks — a line first delivered by quantity stays
 * open to either mode. Returns the FIRST delivery by date, because that is the
 * one that set the basis and the one the hint has to name.
 */
export function lineLock(orderId: string, orderLineIndex: number): { id: string; number: number; date: string } | null {
  if (isReleased(orderId, orderLineIndex)) return null
  const locking = salesDeliveries
    .filter(d => d.orderId === orderId && d.items?.some(l => l.orderLineIndex === orderLineIndex && l.inputMode === 'percent'))
    .sort((a, b) => a.date.localeCompare(b.date))[0]
  return locking ? { id: locking.id, number: locking.number, date: locking.date } : null
}

/**
 * Whether every line of an order has been delivered in full — the state where
 * there is nothing left to deliver against it (PRD UX flow › Empty state).
 * Tolerance matches the over-delivery check: six-decimal arithmetic.
 */
export function isFullyDelivered(order: { id: string; items: { qty: number }[] }): boolean {
  const d = deliveredByLine(order.id)
  return order.items.length > 0 && order.items.every((it, i) => (d[i] ?? 0) >= it.qty - 1e-6)
}

/** The input mode a line is locked to, or null when it is still free. */
export function lineInputBasis(orderId: string, orderLineIndex: number): 'percent' | null {
  return lineLock(orderId, orderLineIndex) ? 'percent' : null
}

/** Prototype demo reset — clears every release, so the seeded locks return. */
export function resetInputBasisReleases(): void {
  inputBasisReleases.splice(0)
  saveCreated(RELEASE_KEY, inputBasisReleases)
}

/** Whether a delivery sits inside a closed accounting period (R-19). Uses the
 *  Close books lock date — the same one every other posted document respects. */
export function isInClosedPeriod(d: Pick<SalesDelivery, 'date'>, lock: string | null): boolean {
  return !!lock && d.date <= lock
}

/**
 * Whether a user may release a lock (R-16 — permission-gated). The acting user
 * comes from the prototype's View as switch (useSalesDeliveryViewAs): the finance
 * manager can release, the sales admin cannot. A function of the user, so a real
 * permission check slots in here without touching any caller.
 */
export function canReleaseInputBasis(user: { canReleaseInputBasis: boolean }): boolean {
  return user.canReleaseInputBasis
}

/** Release a PERCENT lock — one way, reason required, written to the trail (R-16). */
export function releaseInputBasis(
  orderId: string, orderLineIndex: number,
  user: { name: string; canReleaseInputBasis: boolean }, reason: string,
): boolean {
  if (!canReleaseInputBasis(user)) return false
  const by = user.name
  if (!reason.trim()) return false
  if (isReleased(orderId, orderLineIndex)) return false
  const entry: InputBasisRelease = { orderId, orderLineIndex, by, reason: reason.trim(), date: new Date().toISOString().slice(0, 10) }
  inputBasisReleases.push(entry)
  saveCreated(RELEASE_KEY, inputBasisReleases)
  return true
}
