import { reactive } from 'vue'
import { warehouses } from './warehouses'
import { warehouseProducts, productBySku, PRODUCTS, type Product } from './inventory'
import { loadSnapshot, saveSnapshot } from './persist'
import { TODAY } from './master'
import { applyTransfer } from './warehouseDetails'

/**
 * Warehouse transfers (ERP only) — stock moved between two of the company's own
 * warehouses. The index lists them; "Awaiting approval" is the subset still pending a
 * manager's sign-off. Deterministic mock, snapshot-persisted (survives refresh; "Reset
 * demo data" regenerates), and resettable.
 */
export type TransferStatus =
  | 'draft'
  | 'approved'
  | 'in transit'
  | 'completed'
  | 'rejected'

export interface WarehouseTransfer {
  id: string
  /** display number, e.g. "Warehouse Transfer #0090" */
  number: string
  /** ISO date the transfer was created */
  date: string
  originId: string
  originName: string
  destinationId: string
  destinationName: string
  status: TransferStatus
  tags: string[]
  /** User-entered memo (create form). Absent → a deterministic demo memo is shown. */
  memo?: string
  /** User-entered product lines (create form). Absent → lines are derived from stock. */
  lines?: { sku: string; qty: number; serials?: string[] }[]
  /** Audit trail (chronological) — created/edited events from the form. */
  activity?: TransferActivity[]
}

export interface TransferActivity {
  date: string
  user: string
  activity: string
  details: { label: string; value: string }[]
}

// Transfers move between real (non-default, active) warehouses.
const TRANSFER_WAREHOUSES = warehouses.filter((w) => !w.isDefault && w.status === 'active')

// Deterministic 0–99 hash with bit-mixing so values scatter (no banding).
function hash100(i: number): number {
  let x = ((i + 1) * 2654435761) >>> 0
  x ^= x >>> 15
  x = (x * 2246822519) >>> 0
  x ^= x >>> 13
  return (x >>> 0) % 100
}

function isoOffset(days: number): string {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

const TAG_POOL = ['Restock', 'Rebalancing', 'Urgent', 'Seasonal', 'Overstock', 'Damaged return', 'New store opening']

// Weighted status — a healthy queue leans to draft / in transit, fewer
// completed / rejected, so both tabs have plenty to show.
function statusFor(i: number): TransferStatus {
  const h = hash100(i * 7 + 3)
  if (h < 34) return 'draft' // ~34% pending sign-off
  if (h < 54) return 'approved'
  if (h < 74) return 'in transit'
  if (h < 92) return 'completed'
  return 'rejected'
}

function tagsFor(i: number): string[] {
  const n = hash100(i * 13) % 4 // 0..3 tags
  const out: string[] = []
  for (let k = 0; k < n; k++) out.push(TAG_POOL[(hash100(i * 5 + k * 17)) % TAG_POOL.length]!)
  return [...new Set(out)]
}

/** Deterministic mock — ~24 transfers across warehouse pairs, statuses and dates. */
function generate(count = 24): WarehouseTransfer[] {
  const out: WarehouseTransfer[] = []
  const whCount = TRANSFER_WAREHOUSES.length
  if (whCount < 2) return out
  for (let i = 0; i < count; i++) {
    const origin = TRANSFER_WAREHOUSES[hash100(i * 3 + 1) % whCount]!
    // destination — a different warehouse (walk forward until it differs from origin).
    let dIdx = hash100(i * 11 + 5) % whCount
    if (TRANSFER_WAREHOUSES[dIdx]!.id === origin.id) dIdx = (dIdx + 1) % whCount
    const destination = TRANSFER_WAREHOUSES[dIdx]!
    out.push({
      id: `wt-${String(i + 1).padStart(3, '0')}`,
      number: `Warehouse Transfer #${String(90 + i).padStart(4, '0')}`,
      date: isoOffset(-((hash100(i * 9) % 40) + 1)), // 1–40 days ago
      originId: origin.id,
      originName: origin.name,
      destinationId: destination.id,
      destinationName: destination.name,
      status: statusFor(i),
      tags: tagsFor(i),
    })
  }
  return out
}

const KEY = 'warehouse-transfers-v2'
const snapshot = loadSnapshot<WarehouseTransfer>(KEY)
export const warehouseTransfers = reactive<WarehouseTransfer[]>(snapshot ?? generate())

export function persistTransfers(): void {
  saveSnapshot(KEY, warehouseTransfers)
}

/** Look up a single transfer by id (detail page). */
export function getTransfer(id: string): WarehouseTransfer | undefined {
  return warehouseTransfers.find((t) => t.id === id)
}

function seedNum(id: string): number {
  return Number(id.replace(/\D/g, '')) || 0
}

/** One product line on a transfer — sourced from the ORIGIN warehouse's stock. */
export interface TransferLine {
  key: string
  sku: string
  product: Product
  qty: number
  unit: string
}

/**
 * Deterministic product lines for a transfer, drawn from the origin warehouse's
 * stock (so "what's transferred out" is always something the origin actually holds).
 * 3–16 lines so some transfers exercise the table's progressive pagination.
 */
export function transferLineItems(t: WarehouseTransfer): TransferLine[] {
  // A transfer created via the form carries its own lines — use them verbatim.
  if (t.lines?.length) {
    return t.lines
      .map((l) => {
        const product = productBySku(l.sku)
        return product ? { key: l.sku, sku: l.sku, product, qty: l.qty, unit: product.unit } : null
      })
      .filter(Boolean) as TransferLine[]
  }
  // Prefer the origin's stock; fall back to the destination's, then the full catalog,
  // so a transfer whose origin holds no SKUs still shows a coherent product list.
  const pool = (() => {
    const origin = warehouseProducts(t.originId)
    if (origin.length) return origin
    const dest = warehouseProducts(t.destinationId)
    if (dest.length) return dest
    return PRODUCTS.slice(0, 12)
  })()
  const seed = seedNum(t.id)
  const count = Math.min(pool.length, 3 + (hash100(seed * 3 + 2) % 14)) // 3..16
  const out: TransferLine[] = []
  for (let i = 0; i < count; i++) {
    const product = pool[i]!
    const qty = 5 + (hash100(seed * 7 + i * 13) % 20) * 5 // 5..100, step 5
    out.push({ key: product.sku, sku: product.sku, product, qty, unit: product.unit })
  }
  return out
}

const MEMO_POOL = [
  'Take stock shortages from the default warehouse',
  'Rebalancing stock ahead of the promo period',
  'Move slow-moving items closer to the fulfilment hub',
  'Restock retail floor from the central warehouse',
  '',
]
/** Memo — the user-entered value if present, else a deterministic demo memo. */
export function transferMemo(t: WarehouseTransfer): string {
  if (t.memo !== undefined) return t.memo
  return MEMO_POOL[seedNum(t.id) % MEMO_POOL.length]!
}

const ATTACH_POOL = ['transfer-note.pdf', 'stock-list.xlsx', 'approval.pdf']
export interface TransferAttachment { name: string; sizeKB: number }
/** Deterministic attachments — 0–2 files. */
export function transferAttachments(t: WarehouseTransfer): TransferAttachment[] {
  const s = seedNum(t.id)
  const n = hash100(s * 5 + 1) % 3 // 0..2
  return Array.from({ length: n }, (_, i) => ({
    name: ATTACH_POOL[(s + i) % ATTACH_POOL.length]!,
    sizeKB: 40 + ((s + i * 37) % 220),
  }))
}

const UPDATERS = ['Rizal Candra', 'Dewi Rahayu', 'Agus Firmansyah', 'Sari Indah']
/** Acting user for create/edit actions (matches the app header). */
const ACTOR = 'Rizal Candra'

function derivedUpdatedBy(t: WarehouseTransfer): string {
  return UPDATERS[seedNum(t.id) % UPDATERS.length]!
}
function derivedUpdatedAt(t: WarehouseTransfer): string {
  const d = new Date(t.date)
  d.setHours(9 + (seedNum(t.id) % 8), (seedNum(t.id) * 7) % 60, 0, 0)
  return d.toISOString()
}
/** Last-updated author — the latest activity entry, else a deterministic demo value. */
export function transferUpdatedBy(t: WarehouseTransfer): string {
  const a = t.activity
  return a?.length ? a[a.length - 1]!.user : derivedUpdatedBy(t)
}
/** Last-updated timestamp — the latest activity entry, else a deterministic demo value. */
export function transferUpdatedAt(t: WarehouseTransfer): string {
  const a = t.activity
  return a?.length ? a[a.length - 1]!.date : derivedUpdatedAt(t)
}
/** Activity-log entries (newest first) for the detail page's "Last updated" modal. */
export function transferActivityEntries(t: WarehouseTransfer): TransferActivity[] {
  if (t.activity?.length) return [...t.activity].reverse()
  return [{
    date: derivedUpdatedAt(t), user: derivedUpdatedBy(t), activity: 'Created',
    details: [
      { label: 'Origin warehouse', value: t.originName },
      { label: 'Destination warehouse', value: t.destinationName },
    ],
  }]
}

// ── Approval log (Figma "Modal / View / Approval log") ──────────────────────────
export interface ApprovalStep { user: string; date: string }
export interface ApprovalStage {
  title: string
  /** 'everyone' — every listed approver must sign off; 'anyone' — the first one wins. */
  rule: 'everyone' | 'anyone'
  approvers: string[]
  approvals: ApprovalStep[]
}
export interface ApprovalLog {
  requestedBy: string
  requestedAt: string
  stages: ApprovalStage[]
}

const REQUESTER_POOL = ['Budi Santoso', 'Rizki Pratama', 'Hendra Wijaya', 'Andi Kusuma', 'Ratna Sari', 'Farhan Nugroho', 'Lestari Putri', 'Yusuf Hakim', 'Bayu Pradana']
const STAGE1_POOL = ['Dewi Rahayu', 'Agus Firmansyah', 'Sari Indah', 'Ni Made Ayu']
const STAGE2_OTHER_POOL = ['Kevin Surya', 'Christin Purnama Sari']

/**
 * Two-stage approval chain: stage 1 requires everyone listed to sign off; stage 2 is
 * "anyone can approve" and always includes the current user (ACTOR) among the eligible
 * approvers. Stage 1 is deterministically fully approved; stage 2 reflects the real
 * "Approve" action (from `approveTransfer`) once it's happened, else stays pending.
 */
export function transferApprovalLog(t: WarehouseTransfer): ApprovalLog {
  const s = seedNum(t.id)
  const requestedBy = REQUESTER_POOL[s % REQUESTER_POOL.length]!
  const requestedAt = t.activity?.[0]?.date ?? derivedUpdatedAt(t)

  const stage1Approvers = [STAGE1_POOL[s % STAGE1_POOL.length]!, STAGE1_POOL[(s + 1) % STAGE1_POOL.length]!]
  const reqDate = new Date(requestedAt)
  const stage1Approvals: ApprovalStep[] = stage1Approvers.map((user, i) => {
    const d = new Date(reqDate)
    d.setHours(d.getHours() + 2 + i * 4)
    return { user, date: d.toISOString() }
  })

  const stage2Other = STAGE2_OTHER_POOL[s % STAGE2_OTHER_POOL.length]!
  const approvedEntry = t.activity?.find((a) => a.activity === 'Approved')
  const stage2Approvals: ApprovalStep[] = approvedEntry ? [{ user: approvedEntry.user, date: approvedEntry.date }] : []

  return {
    requestedBy,
    requestedAt,
    stages: [
      { title: 'Approval stage 1', rule: 'everyone', approvers: stage1Approvers, approvals: stage1Approvals },
      { title: 'Approval stage 2', rule: 'anyone', approvers: [stage2Other, ACTOR], approvals: stage2Approvals },
    ],
  }
}

/** Distinct origin/destination warehouses actually used — for the filter dropdown. */
export function transferWarehouseOptions(): { value: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const t of warehouseTransfers) {
    seen.set(t.originId, t.originName)
    seen.set(t.destinationId, t.destinationName)
  }
  return [...seen.entries()].map(([value, label]) => ({ value, label }))
}

/** Count still awaiting approval — badge for the "Awaiting approval" tab. */
export function awaitingApprovalCount(): number {
  return warehouseTransfers.filter((t) => t.status === 'draft').length
}

/** Approve a transfer — moves it out of "Awaiting approval" and logs the activity. */
export function approveTransfer(id: string): WarehouseTransfer | undefined {
  const t = warehouseTransfers.find((x) => x.id === id)
  if (!t || t.status !== 'draft') return t
  if (!t.activity?.length) {
    t.activity = [{
      date: derivedUpdatedAt(t), user: derivedUpdatedBy(t), activity: 'Created',
      details: [
        { label: 'Origin warehouse', value: t.originName },
        { label: 'Destination warehouse', value: t.destinationName },
      ],
    }]
  }
  t.activity.push({ date: new Date().toISOString(), user: ACTOR, activity: 'Approved', details: [{ label: 'Status', value: 'Draft → Approved' }] })
  t.status = 'approved'
  const lines = t.lines ?? transferLineItems(t).map(l => ({ sku: l.sku, qty: l.qty }))
  applyTransfer(t.originId, t.destinationId, lines)
  persistTransfers()
  return t
}

/** Delete transfers by id (bulk delete). */
export function deleteTransfers(ids: string[]): void {
  const set = new Set(ids)
  for (let i = warehouseTransfers.length - 1; i >= 0; i--) {
    if (set.has(warehouseTransfers[i]!.id)) warehouseTransfers.splice(i, 1)
  }
  persistTransfers()
}

let addSeq = warehouseTransfers.length
/** Duplicate a transfer → a new awaiting-approval copy at the top. */
export function duplicateTransfer(id: string): WarehouseTransfer | undefined {
  const src = warehouseTransfers.find((t) => t.id === id)
  if (!src) return undefined
  const n = addSeq++
  const copy: WarehouseTransfer = {
    ...src,
    id: `wt-new-${n}`,
    number: `Warehouse Transfer #${String(90 + n).padStart(4, '0')}`,
    date: isoOffset(0),
    status: 'draft',
  }
  warehouseTransfers.unshift(copy)
  persistTransfers()
  return copy
}

export interface TransferInput {
  date: string
  originId: string
  originName: string
  destinationId: string
  destinationName: string
  tags: string[]
  memo?: string
  lines: { sku: string; qty: number; serials?: string[] }[]
}

/** Create a new (awaiting-approval) transfer from the create form. */
export function addTransfer(input: TransferInput): WarehouseTransfer {
  const n = addSeq++
  const now = new Date().toISOString()
  const transfer: WarehouseTransfer = {
    id: `wt-new-${n}`,
    number: `Warehouse Transfer #${String(90 + n).padStart(4, '0')}`,
    date: input.date,
    originId: input.originId,
    originName: input.originName,
    destinationId: input.destinationId,
    destinationName: input.destinationName,
    status: 'draft',
    tags: input.tags,
    memo: input.memo,
    lines: input.lines,
    activity: [{
      date: now, user: ACTOR, activity: 'Created',
      details: [
        { label: 'Origin warehouse', value: input.originName },
        { label: 'Destination warehouse', value: input.destinationName },
        { label: 'Products', value: `${input.lines.length} SKU` },
      ],
    }],
  }
  warehouseTransfers.unshift(transfer)
  persistTransfers()
  return transfer
}

/** Update an existing transfer in place (edit form) — records an "Edited" activity entry. */
export function updateTransfer(id: string, input: TransferInput): WarehouseTransfer | undefined {
  const t = warehouseTransfers.find((x) => x.id === id)
  if (!t) return undefined

  // Diff the changed fields (before overwriting) for the activity log.
  const details: { label: string; value: string }[] = []
  if (t.date !== input.date) details.push({ label: 'Transaction date', value: `${t.date} → ${input.date}` })
  if (t.originName !== input.originName) details.push({ label: 'Origin warehouse', value: `${t.originName} → ${input.originName}` })
  if (t.destinationName !== input.destinationName) details.push({ label: 'Destination warehouse', value: `${t.destinationName} → ${input.destinationName}` })
  if ((t.memo ?? '') !== (input.memo ?? '')) details.push({ label: 'Memo', value: input.memo || '—' })

  // Per-line diff: what the user saw before (stored or derived) vs the submitted lines.
  const nameOf = (sku: string) => productBySku(sku)?.name ?? sku
  const oldMap = new Map(transferLineItems(t).map((l) => [l.sku, l.qty]))
  const newMap = new Map(input.lines.map((l) => [l.sku, l.qty]))
  for (const [sku, q] of newMap) {
    if (!oldMap.has(sku)) details.push({ label: `Added ${nameOf(sku)} (${sku})`, value: `Transfer qty ${q}` })
    else if (oldMap.get(sku) !== q) details.push({ label: `${nameOf(sku)} (${sku})`, value: `Transfer qty ${oldMap.get(sku)} → ${q}` })
  }
  for (const [sku, q] of oldMap) {
    if (!newMap.has(sku)) details.push({ label: `Removed ${nameOf(sku)} (${sku})`, value: `was ${q}` })
  }
  if (!details.length) details.push({ label: 'No changes', value: '—' })

  // Seed a synthetic "Created" entry for demo transfers that had no log yet.
  if (!t.activity?.length) {
    t.activity = [{
      date: derivedUpdatedAt(t), user: derivedUpdatedBy(t), activity: 'Created',
      details: [
        { label: 'Origin warehouse', value: t.originName },
        { label: 'Destination warehouse', value: t.destinationName },
      ],
    }]
  }
  t.activity.push({ date: new Date().toISOString(), user: ACTOR, activity: 'Edited', details })

  Object.assign(t, {
    date: input.date,
    originId: input.originId,
    originName: input.originName,
    destinationId: input.destinationId,
    destinationName: input.destinationName,
    tags: input.tags,
    memo: input.memo,
    lines: input.lines,
  })
  persistTransfers()
  return t
}
