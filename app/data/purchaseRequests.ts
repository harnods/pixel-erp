import { reactive } from 'vue'
import type { PurchaseRequest, PurchaseRequestLine, PurchaseRequestStatus, UrgencyLevel } from './types'
import { loadSnapshot, saveSnapshot } from './persist'
import { CATALOG } from './catalog'

/**
 * Mock purchase requests for the coffee business — 100 records generated
 * deterministically. Mirrors the sales-orders seed style: the index row is the
 * single source of truth (there is no PR detail page yet). Persisted as a whole
 * snapshot so any future create/edit survives a refresh and `resetDb()` clears it.
 */

// Bumped to v3 — seeds a replenishment origin on ~1 in 4 requests (Source column).
const SNAPSHOT_KEY = 'purchase-requests-v3'

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

// Deterministic requested lines drawn from the shared product catalog, so the
// PO form's accordion can group real products under each request.
function buildLines(i: number, count: number): PurchaseRequestLine[] {
  const lines: PurchaseRequestLine[] = []
  for (let j = 0; j < count; j++) {
    const p = CATALOG[(i * 5 + j * 7) % CATALOG.length]!
    const requestedQty = 5 + ((i + j * 3) % 96)          // 5..100
    // Available is often short of requested (that's why a PO is raised).
    const availableQty = Math.round(requestedQty * ((j % 4) / 4))
    lines.push({
      product: p.name,
      sku: p.sku,
      description: p.desc,
      requestedQty,
      availableQty,
      unit: p.unit,
      unitCost: p.price,
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
    const totalProducts = 2 + (i % 9)
    const lines = buildLines(i, totalProducts)

    out.push({
      id: `PR${String(i + 1).padStart(3, '0')}`,
      number,
      date,
      procurementStaff: STAFF[i % STAFF.length]!,
      requiredDate,
      status,
      totalProducts,
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
