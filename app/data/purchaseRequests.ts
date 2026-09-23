import { reactive } from 'vue'
import type { PurchaseRequest, PurchaseRequestLine, PurchaseRequestStatus, UrgencyLevel } from './types'
import { loadSnapshot, saveSnapshot } from './persist'
import { CATALOG } from './catalog'
import { vendors } from './vendors'
import { vendorItemsForVendor } from './vendorItems'

/**
 * Mock purchase requests for the coffee business — 100 records generated
 * deterministically. Mirrors the sales-orders seed style: the index row is the
 * single source of truth (there is no PR detail page yet). Persisted as a whole
 * snapshot so any future create/edit survives a refresh and `resetDb()` clears it.
 */

// Bumped to v4 — every PR is now scoped to ONE vendor (1 PR = 1 vendor), and its
// lines are drawn from that vendor's supplied products so a conversion to PO is
// clean. Still seeds a replenishment origin on ~1 in 4 requests (Source column).
const SNAPSHOT_KEY = 'purchase-requests-v4'

// Vendors that actually supply products (have vendor-items) — services vendors
// like PLN/Telkom have none, so a PR is never bound to them.
const SUPPLIER_VENDORS = vendors.filter(v => vendorItemsForVendor(v.id).length > 0)

function catalogBySku(sku: string) { return CATALOG.find(p => p.sku === sku) }

// Procurement staff pool — the Figma placeholders plus a couple more, so the
// column reads like a small procurement team.
const STAFF = ['Andi Pratama', 'Bayu Ferdian', 'Eka Setiawan', 'Citra Dewi', 'Rizal Candra', 'Dinda Sari']

const STATUSES: PurchaseRequestStatus[] = ['open', 'open', 'partially processed', 'open', 'closed', 'voided', 'open', 'closed']
const URGENCY: UrgencyLevel[] = ['medium', 'medium', 'high', 'medium', 'low', 'medium', 'high', 'medium']

const TAG_SETS: (string[] | undefined)[] = [
  ['Restock'],
  ['Machines'],
  ['Restock', 'Priority'],
  undefined,
  ['Beans'],
  ['Accessories'],
  undefined,
  ['Restock', 'Seasonal'],
]

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// Deterministic requested lines drawn from ONE vendor's supplied products, so a
// PR is coherent (1 PR = 1 vendor) and converts cleanly to a PO.
function buildLinesForVendor(i: number, count: number, vendorId: string): PurchaseRequestLine[] {
  const skus = vendorItemsForVendor(vendorId).map(vi => vi.sku)
  if (!skus.length) return []
  const lines: PurchaseRequestLine[] = []
  const n = Math.min(count, skus.length)      // distinct SKUs, capped by the vendor's range
  const start = i % skus.length
  for (let j = 0; j < n; j++) {
    const sku = skus[(start + j) % skus.length]!
    const p = catalogBySku(sku)
    const requestedQty = 5 + ((i + j * 3) % 96)          // 5..100
    // Available is often short of requested (that's why a PO is raised).
    const availableQty = Math.round(requestedQty * ((j % 4) / 4))
    lines.push({
      product: p?.name ?? sku,
      sku,
      description: p?.desc ?? '',
      requestedQty,
      availableQty,
      unit: p?.unit ?? 'Pcs',
      unitCost: p?.price ?? 0,
      taxLabel: 'PPN 11%',
    })
  }
  return lines
}

function build(): PurchaseRequest[] {
  const out: PurchaseRequest[] = []
  for (let i = 0; i < 100; i++) {
    // Non-monotonic numbers (bijection over 0..99 since gcd(7,100)=1), like the
    // shuffled numbers in the design — the number isn't tied to the date order.
    const number = 90001 + ((i * 7) % 100)
    const status = STATUSES[i % STATUSES.length]!
    const date = addDays('2026-01-02', i)         // one request per day
    const requiredDate = addDays(date, 21 + (i % 10))
    const vendor = SUPPLIER_VENDORS[i % SUPPLIER_VENDORS.length]!
    const lines = buildLinesForVendor(i, 2 + (i % 9), vendor.id)
    const totalProducts = lines.length

    out.push({
      id: `PR${String(i + 1).padStart(3, '0')}`,
      number,
      date,
      procurementStaff: STAFF[i % STAFF.length]!,
      requiredDate,
      status,
      totalProducts,
      vendor: { id: vendor.id, name: vendor.name },
      urgency: URGENCY[i % URGENCY.length]!,
      tags: TAG_SETS[i % TAG_SETS.length],
      attachment: i % 6 === 0,
      // A handful sit in the approval queue (open requests awaiting sign-off).
      awaitingApproval: status === 'open' && i % 20 === 3,
      // ~1 in 4 was raised by the replenishment worklist rather than by hand, so
      // the Source column has both origins to show. (Runtime-created PRs from the
      // worklist carry the full origin; this seed only needs it flagged.)
      ...(i % 4 === 0
        ? {
            replenishment: {
              source: 'replenishment' as const,
              asOf: '2026-06-26',
              runNo: 1,
              warehouseId: 'wh-001',
              createdBy: STAFF[i % STAFF.length]!,
              lines: [],
            },
          }
        : {}),
      lines,
    })
  }
  return out
}

// Snapshot wins over the seed on load, so created/edited records persist.
export const purchaseRequests = reactive<PurchaseRequest[]>(loadSnapshot<PurchaseRequest>(SNAPSHOT_KEY) ?? build())

function persist() { saveSnapshot(SNAPSHOT_KEY, purchaseRequests) }

export function getPurchaseRequest(id: string): PurchaseRequest | undefined {
  return purchaseRequests.find(pr => pr.id === id)
}

/** Count of requests currently in the approval queue (drives the tab badge). */
export function awaitingPurchaseRequestCount(): number {
  return purchaseRequests.filter(pr => pr.awaitingApproval).length
}

export function addPurchaseRequest(data: Omit<PurchaseRequest, 'id' | 'number'> & { number?: number }): PurchaseRequest {
  const number = data.number ?? (Math.max(90000, ...purchaseRequests.map(p => p.number)) + 1)
  const pr: PurchaseRequest = { ...data, id: `PR${String(purchaseRequests.length + 1).padStart(3, '0')}`, number }
  purchaseRequests.unshift(pr)
  persist()
  return pr
}

export function updatePurchaseRequest(id: string, patch: Partial<PurchaseRequest>): void {
  const pr = purchaseRequests.find(p => p.id === id)
  if (!pr) return
  Object.assign(pr, patch)
  persist()
}

export function deletePurchaseRequests(ids: string[]): number {
  const set = new Set(ids)
  let removed = 0
  for (let i = purchaseRequests.length - 1; i >= 0; i--) {
    if (set.has(purchaseRequests[i]!.id)) { purchaseRequests.splice(i, 1); removed++ }
  }
  persist()
  return removed
}
