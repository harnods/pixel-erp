import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import type { PurchaseOrder, PurchaseOrderStatus } from './types'
import { vendors } from './vendors'
import { SIM_SPAN_DAYS, simDay, daysUntil } from './simClock'

/**
 * Purchase orders — a deterministic TIME SERIES spanning 1 Jan 2026 → today
 * (22 Aug 2026), coherent with the rest of the production-ready mock DB. Vendors
 * come from the shared `vendors` master (coffee suppliers) so a vendor id means
 * the same supplier across Purchases and AP. Status spreads across the tabs:
 *   • all      → open / partially-processed / closed
 *   • awaiting → draft
 *   • rejected → rejected
 * Everything is a pure function of the index → same data every load, real dates.
 */
const PO_COUNT = 60
const AMOUNTS = [
  7_200_000, 18_500_000, 42_000_000, 9_800_000, 63_000_000, 12_400_000,
  28_500_000, 155_000_000, 5_600_000, 88_000_000, 34_000_000, 21_000_000,
]
const TAG_POOL = [['Import', 'Raw material'], ['Packaging'], ['Equipment'], ['Logistics'], ['Office supply'], ['Utilities']]

function buildPurchaseOrders(): PurchaseOrder[] {
  const out: PurchaseOrder[] = []
  for (let i = 0; i < PO_COUNT; i++) {
    const offset = Math.floor((i * SIM_SPAN_DAYS) / PO_COUNT)
    const date = simDay(offset)
    const dueDate = simDay(offset + 30)
    const vendor = vendors[i % vendors.length]!
    const total = AMOUNTS[i % AMOUNTS.length]! + (i % 4) * 1_100_000
    const dueIn = daysUntil(dueDate)

    // Status: recent orders are still moving (draft/open/partial); older ones are
    // received (awaiting invoice) then closed; a few are voided/rejected.
    let status: PurchaseOrderStatus
    if (i % 19 === 0) status = 'voided'
    else if (i % 17 === 0) status = 'rejected'
    else if (dueIn > 7 && i % 4 === 0) status = 'draft'          // recent, awaiting approval
    else if (dueIn >= 0) status = i % 3 === 0 ? 'partially-processed' : 'open'
    else status = i % 6 === 0 ? 'awaiting invoice' : (i % 5 === 0 ? 'open' : 'closed')

    const balance = (status === 'closed' || status === 'voided') ? 0
      : status === 'partially-processed' ? Math.round(total / 2)
      : total

    const po: PurchaseOrder = {
      id: `po-${String(i + 1).padStart(3, '0')}`,
      number: `PO-2026-${String(i + 1).padStart(4, '0')}`,
      vendor: { id: vendor.id, name: vendor.name },
      date,
      dueDate,
      total,
      balance,
      status,
      itemCount: 1 + (i % 8),
      hasAttachment: i % 3 === 0,
      tags: TAG_POOL[i % TAG_POOL.length],
    }
    if (status === 'rejected') {
      po.rejection = { user: 'You', date: simDay(offset + 2), reason: 'Budget not approved for this period.' }
    }
    out.push(po)
  }
  return out.reverse() // newest first
}

/**
 * Orders raised through the form (from purchase requests, or a duplicate) have to
 * outlive a page reload: a subcon work order links to its order by id, and a
 * purchase delivery is raised against it. Without a snapshot the order vanished
 * on reload and the link fell back to the first seeded order — the same
 * dead-end already fixed for purchase requests and deliveries.
 */
const SNAPSHOT_KEY = 'purchase-orders-v1'
export const purchaseOrders: PurchaseOrder[] = reactive(
  loadSnapshot<PurchaseOrder>(SNAPSHOT_KEY) ?? buildPurchaseOrders(),
)

function persist() { saveSnapshot(SNAPSHOT_KEY, purchaseOrders) }

/**
 * Move an order along its lifecycle and persist the change — a delivery against
 * it means the goods are in and the bill is pending; an invoice closes it.
 */
export function setPurchaseOrderStatus(id: string, status: PurchaseOrder['status']): void {
  const order = purchaseOrders.find(o => o.id === id)
  if (!order) return
  order.status = status
  persist()
}

/** Add an order to the store, newest first — same shape as `addPurchaseRequest`. */
export function addPurchaseOrder(order: PurchaseOrder): PurchaseOrder {
  purchaseOrders.unshift(order)
  persist()
  return order
}
