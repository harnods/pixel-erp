import type { PurchaseInvoice } from './types'
import type { PurchaseInvoiceDetail } from './purchaseInvoiceDetails'
import { vendors } from './vendors'
import { SIM_SPAN_DAYS, simDay, daysUntil } from './simClock'
import { reactive } from 'vue'
import { loadCreated, saveCreated } from './persist'

/**
 * Vendor invoices (AP) — a deterministic TIME SERIES spanning 1 Jan 2026 → today
 * (22 Aug 2026), using the shared `vendors` master so AP reconciles to one vendor
 * identity. Status is derived from the due date vs "today":
 *   • due passed + unpaid → overdue   • due passed + paid → paid   • not due → open
 */
const PINV_COUNT = 80
const AMOUNTS = [
  1_800_000, 6_400_000, 16_900_000, 9_200_000, 37_500_000, 12_000_000,
  24_800_000, 74_000_000, 3_300_000, 52_000_000, 28_000_000, 18_500_000,
]

function buildPurchaseInvoices(): PurchaseInvoice[] {
  const out: PurchaseInvoice[] = []
  for (let i = 0; i < PINV_COUNT; i++) {
    const offset = Math.floor((i * SIM_SPAN_DAYS) / PINV_COUNT)
    const date = simDay(offset)
    const dueDate = simDay(offset + 30)
    const vendor = vendors[i % vendors.length]!
    const amount = AMOUNTS[i % AMOUNTS.length]! + (i % 4) * 900_000
    const duePassed = daysUntil(dueDate) < 0

    let status: PurchaseInvoice['status']
    if (duePassed) status = (i % 7 === 0 || i % 12 === 0) ? 'overdue' : 'paid'
    else status = 'open'

    const tags: string[] = []
    if (amount >= 50_000_000) tags.push('Import')
    if (i % 5 === 0) tags.push('Raw material')

    out.push({
      id: `PI${String(i + 1).padStart(3, '0')}`,
      number: `PINV-2026-${String(i + 1).padStart(3, '0')}`,
      vendor: { id: vendor.id, name: vendor.name },
      date,
      dueDate,
      amount,
      status,
      itemCount: 1 + (i % 6),
      hasAttachment: i % 3 === 0,
      ...(tags.length ? { tags } : {}),
    })
  }
  return out.reverse() // newest first
}

export const purchaseInvoices: PurchaseInvoice[] = buildPurchaseInvoices()

/**
 * Awaiting-approval subset — a realistic handful of the newest invoices pending
 * sign-off, NOT the whole ledger. The "Awaiting approval" tab and its tab-count
 * badge read from this; the full `purchaseInvoices` still backs the "All purchase
 * invoices" tab and receipt review.
 */
export const purchaseInvoicesAwaitingApproval: PurchaseInvoice[] = purchaseInvoices.slice(0, 8)

// ── User-created purchase invoices (New purchase invoice form) ───────────────
// Persisted with loadCreated/saveCreated and kept OUT of `purchaseInvoices`
// (reports tie out against that seed); the index page lists created + seed.
const PI_CREATED_KEY = 'purchaseInvoices.created'
/** A form-created invoice also keeps what the user typed (lines, addresses…) so its detail page shows it. */
export type CreatedPurchaseInvoice = PurchaseInvoice & { detail?: Partial<PurchaseInvoiceDetail> }
export const createdPurchaseInvoices: CreatedPurchaseInvoice[] = reactive(loadCreated<CreatedPurchaseInvoice>(PI_CREATED_KEY))

export function nextPurchaseInvoiceSeq(): number {
  return [...purchaseInvoices, ...createdPurchaseInvoices].reduce((max, inv) => {
    const n = parseInt(inv.number.split('-').pop() ?? '', 10)
    return Number.isNaN(n) ? max : Math.max(max, n)
  }, 0) + 1
}

export function addPurchaseInvoice(input: Omit<CreatedPurchaseInvoice, 'id' | 'number'>): CreatedPurchaseInvoice {
  const seq = nextPurchaseInvoiceSeq()
  const inv: CreatedPurchaseInvoice = {
    ...input,
    id: `PI${String(seq).padStart(3, '0')}`,
    number: `PINV-2026-${String(seq).padStart(3, '0')}`,
  }
  createdPurchaseInvoices.unshift(inv)
  saveCreated(PI_CREATED_KEY, createdPurchaseInvoices)
  return inv
}
