import { reactive } from 'vue'
import type { PurchaseOrder, PurchaseOrderStatus } from './types'
import { vendors } from './vendors'
import { SIM_SPAN_DAYS, simDay, daysUntil } from './simClock'
import { loadCreated, saveCreated } from './persist'

const CREATED_KEY = 'purchase-orders-created-v1'

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

// User-created orders are persisted and merged ON TOP of the freshly generated
// seed — `loadCreated`, not `loadSnapshot`, because this feature only ever appends
// (the 60 seed orders are never mutated), which is exactly the case persist.ts
// documents for the append-only helpers.
const createdOrders = loadCreated<PurchaseOrder>(CREATED_KEY)

export const purchaseOrders: PurchaseOrder[] = reactive([...createdOrders, ...buildPurchaseOrders()])

/** Persist just the user-created orders (newest first). */
export function persistCreatedPurchaseOrders(): void {
  saveCreated(CREATED_KEY, purchaseOrders.filter((o) => o.id.startsWith('po-new-')))
}

/** Next sequential id for a created order — kept clear of the `po-0NN` seed range. */
export function nextPurchaseOrderId(): string {
  const used = purchaseOrders.filter((o) => o.id.startsWith('po-new-')).length
  return `po-new-${String(used + 1).padStart(3, '0')}`
}

/** Next document number, continuing the seed's `PO-2026-NNNN` sequence. */
export function nextPurchaseOrderNumber(): string {
  const max = purchaseOrders.reduce((m, o) => {
    const n = parseInt(o.number.match(/(\d+)$/)?.[1] ?? '0', 10)
    return Number.isNaN(n) ? m : Math.max(m, n)
  }, 0)
  return `PO-2026-${String(max + 1).padStart(4, '0')}`
}

/**
 * Add a purchase order.
 *
 * `unshift`, not `push`: `purchaseOrders` is sorted newest-first, so appending
 * would bury a brand-new order at the bottom of the index. (Note
 * `PurchaseOrderFormPage.vue` still pushes — that is a pre-existing bug, tracked
 * separately, not something this feature relies on.)
 */
export function addPurchaseOrder(order: PurchaseOrder): PurchaseOrder {
  purchaseOrders.unshift(order)
  persistCreatedPurchaseOrders()
  return order
}
