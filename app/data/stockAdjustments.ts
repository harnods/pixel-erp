import { reactive } from 'vue'
import { warehouses } from './warehouses'
import { warehouseProducts, productBySku, PRODUCTS, type Product } from './inventory'
import { getWarehouseDetail, applyStockCount, applyStockInOut } from './warehouseDetails'
import { loadSnapshot, saveSnapshot } from './persist'
import { TODAY } from './master'
import type { ApprovalLog, ApprovalStage, ApprovalStep } from './warehouseTransfers'

export type { ApprovalLog, ApprovalStage, ApprovalStep }

/**
 * Stock adjustments — manual corrections to on-hand stock. Two kinds share this list:
 *   • Stock count  → reconcile counted vs system qty. Category is always "Stock count".
 *                    Number format: "Stock Count #10090".
 *   • Stock in/out → manual increase/decrease for a business reason. Categories:
 *                    Production output / Waste/damaged / General / Opening balance.
 *                    Number format: "Stock In/Out #10090".
 * The index lists them; "Awaiting approval" is the subset still pending sign-off.
 * Deterministic mock, snapshot-persisted (survives refresh; "Reset demo data"
 * regenerates), and resettable.
 */
export type AdjustmentKind = 'count' | 'in-out'

export type AdjustmentCategory =
  | 'Stock count'
  | 'Production output'
  | 'Waste/damaged'
  | 'General'
  | 'Opening balance'

/** All categories (filter dropdown + create). "Stock count" is the count-kind's only category. */
export const ADJUSTMENT_CATEGORIES: AdjustmentCategory[] = [
  'Stock count', 'Production output', 'Waste/damaged', 'General', 'Opening balance',
]
/** Categories available to a Stock in/out adjustment (everything except "Stock count"). */
export const IN_OUT_CATEGORIES: AdjustmentCategory[] = [
  'Production output', 'Waste/damaged', 'General', 'Opening balance',
]

// 'counted' = WMS-only: the operator finished counting but a manager still needs
// to review it (one step below 'completed') — see wmsStockAdjustments.ts.
export type AdjustmentStatus = 'draft' | 'completed' | 'not_started' | 'in_progress' | 'counted' | 'canceled'

// Offsetting GL account shown per row — derived from the category.
const ACCOUNT_BY_CATEGORY: Record<AdjustmentCategory, string> = {
  'Stock count':       'Inventory adjustment',
  'Production output': 'Finished goods',
  'Waste/damaged':     'Inventory shrinkage',
  'General':           'Inventory adjustment',
  'Opening balance':   'Opening balance equity',
}
export function accountForCategory(category: AdjustmentCategory): string {
  return ACCOUNT_BY_CATEGORY[category]
}

// GL account code shown alongside the account name (e.g. "8-80100 Inventory adjustment").
const ACCOUNT_CODE: Record<string, string> = {
  'Inventory adjustment':    '8-80100',
  'Finished goods':          '1-10400',
  'Inventory shrinkage':     '6-60300',
  'Opening balance equity':  '3-30100',
}
export function accountCodeFor(account: string): string {
  return ACCOUNT_CODE[account] ?? ''
}

/** Distinct accounts (code + name label) for the create form's Account select. */
export function accountOptions(): { id: string; name: string }[] {
  const seen = new Set<string>()
  const out: { id: string; name: string }[] = []
  for (const cat of ADJUSTMENT_CATEGORIES) {
    const acct = ACCOUNT_BY_CATEGORY[cat]
    if (seen.has(acct)) continue
    seen.add(acct)
    const code = ACCOUNT_CODE[acct]
    out.push({ id: acct, name: code ? `${code} ${acct}` : acct })
  }
  return out
}

export interface StockAdjustment {
  id: string
  kind: AdjustmentKind
  /** display number, e.g. "Stock Count #10090" or "Stock In/Out #10091" */
  number: string
  /** ISO date the adjustment was created */
  date: string
  warehouseId: string
  warehouseName: string
  category: AdjustmentCategory
  account: string
  status: AdjustmentStatus
  tags: string[]
  /** User-entered memo (create form). Absent → a deterministic demo memo is shown. */
  memo?: string
  /** User-entered product lines (create form). Absent → demo lines are derived. */
  lines?: { sku: string; qty: number; prevQty?: number; location?: string }[]
  /** Filled when the adjustment is approved (to populate approval log stage 2). */
  approvedAt?: string
  approvedBy?: string
  /** WMS Stock count only */
  assignee?: string
  startDate?: string
  endDate?: string
  /** ERP Stock Count only — ID of the originating WMS Cycle Count task */
  linkedCycleCountId?: string
  canceledDate?: string
  canceledReason?: string
}

// Adjustments apply to real (non-default, active) warehouses — the default warehouse
// holds no stock, so an adjustment there would be incoherent.
const ADJ_WAREHOUSES = warehouses.filter((w) => !w.isDefault && w.status === 'active')

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

function isoOffsetDT(days: number, hour: number, minute: number): string {
  const d = new Date(TODAY)
  d.setDate(d.getDate() + days)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

const ASSIGNEE_POOL = ['Andi Wijaya', 'Dewi Kusuma', 'Lina Handayani', 'Siti Rahayu']

function countStatusFor(i: number): AdjustmentStatus {
  const v = hash100(i * 7 + 3)
  if (v < 30) return 'not_started'
  if (v < 60) return 'in_progress'
  return 'completed'
}

const TAG_POOL = ['Recount', 'Audit', 'Damaged', 'Expired', 'Promo', 'Year-end', 'Production', 'Correction']

function tagsFor(i: number): string[] {
  const n = hash100(i * 13) % 4 // 0..3 tags
  const out: string[] = []
  for (let k = 0; k < n; k++) out.push(TAG_POOL[(hash100(i * 5 + k * 17)) % TAG_POOL.length]!)
  return [...new Set(out)]
}

// ~35% draft so the "Awaiting approval" tab is well-populated.
function statusFor(i: number): AdjustmentStatus {
  return hash100(i * 7 + 3) < 35 ? 'draft' : 'completed'
}

// Kind split — ~40% stock counts, ~60% stock in/out.
function kindFor(i: number): AdjustmentKind {
  return hash100(i * 3 + 1) < 40 ? 'count' : 'in-out'
}

function categoryFor(i: number, kind: AdjustmentKind): AdjustmentCategory {
  if (kind === 'count') return 'Stock count'
  return IN_OUT_CATEGORIES[hash100(i * 11 + 5) % IN_OUT_CATEGORIES.length]!
}

/** Deterministic mock — ~26 adjustments across warehouses, kinds, categories and dates. */
function generate(count = 26): StockAdjustment[] {
  const out: StockAdjustment[] = []
  const whCount = ADJ_WAREHOUSES.length
  if (!whCount) return out
  let countSeq = 10090
  let inoutSeq = 10090
  for (let i = 0; i < count; i++) {
    const kind = kindFor(i)
    const category = categoryFor(i, kind)
    const wh = ADJ_WAREHOUSES[hash100(i * 9 + 2) % whCount]!
    const seq = kind === 'count' ? countSeq++ : inoutSeq++
    const countStatus = kind === 'count' ? countStatusFor(i) : statusFor(i)
    const startDaysAgo = (hash100(i * 17) % 40) + 1
    const startHour = 7 + (hash100(i * 41) % 11)
    const startMin = (hash100(i * 53) % 4) * 15
    const durationHours = 2 + (hash100(i * 29) % 6)
    const endHour = startHour + durationHours
    out.push({
      id: `sa-${String(i + 1).padStart(3, '0')}`,
      kind,
      number: `${kind === 'count' ? 'Stock Count' : 'Stock In/Out'} #${seq}`,
      date: isoOffset(-startDaysAgo),
      warehouseId: wh.id,
      warehouseName: wh.name,
      category,
      account: accountForCategory(category),
      status: countStatus,
      tags: tagsFor(i),
      ...(kind === 'count' && {
        assignee: ASSIGNEE_POOL[hash100(i * 19) % ASSIGNEE_POOL.length],
        startDate: isoOffsetDT(-startDaysAgo, startHour, startMin),
        endDate: countStatus === 'completed'
          ? isoOffsetDT(-startDaysAgo, endHour, startMin)
          : undefined,
        linkedCycleCountId: `cc-${String((hash100(i * 31 + 11) % 14) + 1).padStart(3, '0')}`,
      }),
    })
  }
  return out
}

const KEY = 'stock-adjustments-v4'
const snapshot = loadSnapshot<StockAdjustment>(KEY)
export const stockAdjustments = reactive<StockAdjustment[]>(snapshot ?? generate())

export function persistAdjustments(): void {
  saveSnapshot(KEY, stockAdjustments)
}

/** Look up a single adjustment by id (detail page). */
export function getAdjustment(id: string): StockAdjustment | undefined {
  return stockAdjustments.find((a) => a.id === id)
}

function seedNum(id: string): number {
  return Number(id.replace(/\D/g, '')) || 0
}

/** One product line on an adjustment. For a stock count: prev on hand vs counted →
 *  difference. For stock in/out: `difference` is the manual +/- movement. */
export interface AdjustmentLine {
  key: string
  sku: string
  product: Product
  prevOnHand: number
  counted: number
  difference: number
  unit: string
  averageCost: number
  storageLocation: string
  batchNumber?: string
  batchExpiry?: string
}

/**
 * Deterministic product lines for an adjustment, drawn from the warehouse's stock
 * (fall back to the catalog so an adjustment always shows a coherent product list).
 * 3–12 lines so some adjustments exercise the table's progressive pagination.
 */
export function adjustmentLineItems(a: StockAdjustment): AdjustmentLine[] {
  const whDetail = getWarehouseDetail(a.warehouseId)
  // Primary bin only (index 0) — matches the convention every other reader uses
  // (binForSku, etc.); a plain flatMap+Map here would silently keep the LAST
  // location of a multi-loc item instead.
  const locBySku = new Map<string, string>(
    (whDetail?.stock ?? []).map(s => [s.sku, s.locations[0] ?? '—'] as [string, string])
  )
  function locFor(sku: string): string {
    return locBySku.get(sku) ?? '—'
  }

  if (a.lines?.length) {
    const onHandBySku = a.kind === 'count'
      ? new Map((whDetail?.stock ?? []).map(s => [s.sku, s.onHand]))
      : null
    return a.lines
      .map((l) => {
        const product = productBySku(l.sku)
        if (!product) return null
        if (a.kind === 'count') {
          const prevOnHand = l.prevQty !== undefined
            ? l.prevQty
            : (onHandBySku?.get(l.sku) ?? (50 + (hash100(seedNum(a.id) + l.sku.length) % 150)))
          const counted = l.qty
          return {
            key: l.sku, sku: l.sku, product,
            prevOnHand, counted, difference: counted - prevOnHand, unit: product.unit, averageCost: product.averageCost,
            storageLocation: l.location ?? locFor(l.sku),
          }
        }
        const prevOnHand = 50 + (hash100(seedNum(a.id) + l.sku.length) % 150)
        const counted = Math.max(0, prevOnHand + l.qty)
        return {
          key: l.sku, sku: l.sku, product,
          prevOnHand, counted, difference: l.qty, unit: product.unit, averageCost: product.averageCost,
          storageLocation: l.location ?? locFor(l.sku),
        }
      })
      .filter(Boolean) as AdjustmentLine[]
  }
  const pool = (() => {
    const whStock = warehouseProducts(a.warehouseId)
    if (whStock.length) return whStock
    return PRODUCTS.slice(0, 12)
  })()
  const seed = seedNum(a.id)
  const count = Math.min(pool.length, 3 + (hash100(seed * 3 + 2) % 10)) // 3..12
  const out: AdjustmentLine[] = []
  for (let i = 0; i < count; i++) {
    const product = pool[i]!
    const prevOnHand = 50 + (hash100(seed * 7 + i * 13) % 150) // 50..199
    const delta = (hash100(seed * 5 + i * 11) % 36) - 15       // -15..+20
    const counted = Math.max(0, prevOnHand + delta)
    out.push({
      key: product.sku, sku: product.sku, product,
      prevOnHand, counted, difference: counted - prevOnHand, unit: product.unit, averageCost: product.averageCost,
      storageLocation: locFor(product.sku),
    })
  }
  return out
}

const ATTACH_POOL = ['sample-filename.pdf', 'count-sheet.xlsx', 'photo-evidence.jpg']
export interface AdjustmentAttachment { name: string; sizeKB: number }
/** Deterministic attachments — 0–2 files. */
export function adjustmentAttachments(a: StockAdjustment): AdjustmentAttachment[] {
  const s = seedNum(a.id)
  const n = hash100(s * 5 + 1) % 3 // 0..2
  return Array.from({ length: n }, (_, i) => ({
    name: ATTACH_POOL[(s + i) % ATTACH_POOL.length]!,
    sizeKB: 40 + ((s + i * 37) % 220),
  }))
}

const MEMO_POOL = [
  'Cycle count correction for slow-moving items',
  'Damaged units removed after inbound QC',
  'Production output posted from work order',
  'Opening balance for the new warehouse',
  '',
]
/** Memo — the user-entered value if present, else a deterministic demo memo. */
export function adjustmentMemo(a: StockAdjustment): string {
  if (a.memo !== undefined) return a.memo
  return MEMO_POOL[seedNum(a.id) % MEMO_POOL.length]!
}

const UPDATERS = ['Rizal Candra', 'Dewi Rahayu', 'Agus Firmansyah', 'Sari Indah']
const ACTOR = 'Rizal Candra'
export function adjustmentUpdatedBy(a: StockAdjustment): string {
  return UPDATERS[seedNum(a.id) % UPDATERS.length]!
}
/** Last-updated timestamp — the adjustment date at a fixed-ish business hour. */
export function adjustmentUpdatedAt(a: StockAdjustment): string {
  const d = new Date(a.date)
  d.setHours(9 + (seedNum(a.id) % 8), (seedNum(a.id) * 7) % 60, 0, 0)
  return d.toISOString()
}

const REQUESTER_POOL = ['Budi Santoso', 'Rizki Pratama', 'Hendra Wijaya', 'Andi Kusuma', 'Ratna Sari']
const STAGE1_POOL = ['Dewi Rahayu', 'Agus Firmansyah', 'Sari Indah', 'Ni Made Ayu']
const STAGE2_OTHER_POOL = ['Kevin Surya', 'Christin Purnama Sari']

/**
 * Two-stage approval chain mirroring the warehouse transfer flow.
 * Stage 1: everyone listed must sign off (deterministically pre-approved for demo data).
 * Stage 2: anyone can approve — resolved once the user clicks Approve.
 */
export function adjustmentApprovalLog(a: StockAdjustment): ApprovalLog {
  const s = seedNum(a.id)
  const requestedBy = REQUESTER_POOL[s % REQUESTER_POOL.length]!
  const requestedAt = adjustmentUpdatedAt(a)

  const stage1Approvers = [STAGE1_POOL[s % STAGE1_POOL.length]!, STAGE1_POOL[(s + 1) % STAGE1_POOL.length]!]
  const reqDate = new Date(requestedAt)
  const stage1Approvals: ApprovalStep[] = stage1Approvers.map((user, i) => {
    const d = new Date(reqDate)
    d.setHours(d.getHours() + 2 + i * 4)
    return { user, date: d.toISOString() }
  })

  const stage2Other = STAGE2_OTHER_POOL[s % STAGE2_OTHER_POOL.length]!
  const stage2Approvals: ApprovalStep[] = a.approvedAt
    ? [{ user: a.approvedBy ?? ACTOR, date: a.approvedAt }]
    : []

  return {
    requestedBy,
    requestedAt,
    stages: [
      { title: 'Approval stage 1', rule: 'everyone', approvers: stage1Approvers, approvals: stage1Approvals },
      { title: 'Approval stage 2', rule: 'anyone', approvers: [stage2Other, ACTOR], approvals: stage2Approvals },
    ],
  }
}

/** Distinct warehouses actually used — for the filter dropdown. */
export function adjustmentWarehouseOptions(): { value: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const a of stockAdjustments) seen.set(a.warehouseId, a.warehouseName)
  return [...seen.entries()].map(([value, label]) => ({ value, label }))
}

/** Count still awaiting approval — badge for the "Awaiting approval" tab. */
export function awaitingAdjustmentCount(kind?: AdjustmentKind): number {
  return stockAdjustments.filter((a) => a.status === 'draft' && (!kind || a.kind === kind)).length
}

/** An ERP adjustment can only be canceled while still a draft — once approved,
 *  stock has already been applied (approveAdjustment runs at approval time), so
 *  there's nothing left to safely void; the record stays a permanent record. */
export function canCancelAdjustment(a: StockAdjustment): boolean {
  return a.status === 'draft'
}

/** Cancel a draft adjustment — it never gets approved/applied. Terminal state;
 *  the record itself is kept (never deleted) so it stays in the audit trail. */
export function cancelAdjustment(id: string, reason?: string): void {
  const a = stockAdjustments.find((x) => x.id === id)
  if (!a || !canCancelAdjustment(a)) return
  a.status = 'canceled'
  a.canceledDate = new Date().toISOString()
  if (reason) a.canceledReason = reason
  persistAdjustments()
}

let addSeq = stockAdjustments.length
function nextSeqFor(kind: AdjustmentKind): number {
  // Continue each kind's numbering from the highest existing number of that kind.
  const prefix = kind === 'count' ? 'Stock Count' : 'Stock In/Out'
  const used = stockAdjustments
    .filter((a) => a.number.startsWith(prefix))
    .map((a) => Number(a.number.replace(/\D/g, '')) || 0)
  return Math.max(10089, ...used) + 1
}

export interface AdjustmentInput {
  kind: AdjustmentKind
  date: string
  warehouseId: string
  warehouseName: string
  category: AdjustmentCategory
  tags: string[]
  memo?: string
  lines: { sku: string; qty: number; prevQty?: number }[]
  /** WMS Stock count only */
  assignee?: string
  startDate?: string
  endDate?: string
  /** Set when posting from a WMS Cycle Count task */
  linkedCycleCountId?: string
}

/** Create a new (awaiting-approval) adjustment from the create form. */
export function addAdjustment(input: AdjustmentInput): StockAdjustment {
  const n = addSeq++
  const adj: StockAdjustment = {
    id: `sa-new-${n}`,
    kind: input.kind,
    number: `${input.kind === 'count' ? 'Stock Count' : 'Stock In/Out'} #${nextSeqFor(input.kind)}`,
    date: input.date,
    warehouseId: input.warehouseId,
    warehouseName: input.warehouseName,
    category: input.category,
    account: accountForCategory(input.category),
    status: 'draft',
    tags: input.tags,
    memo: input.memo,
    lines: input.lines,
    linkedCycleCountId: input.linkedCycleCountId,
  }
  stockAdjustments.unshift(adj)
  persistAdjustments()
  return adj
}

/** Approve a pending adjustment — updates stock on hand and marks it completed. */
export function approveAdjustment(id: string): StockAdjustment | undefined {
  const a = stockAdjustments.find((x) => x.id === id)
  if (!a || a.status !== 'draft') return a
  if (a.kind === 'count') {
    // For count: stored lines.qty = absolute counted qty; fallback derives from line items.
    const lines = a.lines ?? adjustmentLineItems(a).map(l => ({ sku: l.sku, qty: l.counted }))
    applyStockCount(a.warehouseId, lines)
  } else {
    // For in-out: stored lines.qty = delta (+/-); fallback derives the difference.
    const lines = a.lines ?? adjustmentLineItems(a).map(l => ({ sku: l.sku, qty: l.difference }))
    applyStockInOut(a.warehouseId, lines)
  }
  a.status = 'completed'
  a.approvedBy = ACTOR
  a.approvedAt = new Date().toISOString()
  persistAdjustments()
  return a
}

/** Update an existing adjustment in place (edit form). */
export function updateAdjustment(id: string, input: AdjustmentInput): StockAdjustment | undefined {
  const a = stockAdjustments.find((x) => x.id === id)
  if (!a) return undefined
  Object.assign(a, {
    date: input.date,
    warehouseId: input.warehouseId,
    warehouseName: input.warehouseName,
    category: input.category,
    account: accountForCategory(input.category),
    tags: input.tags,
    memo: input.memo,
    lines: input.lines,
  })
  persistAdjustments()
  return a
}
