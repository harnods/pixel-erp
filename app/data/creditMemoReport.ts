/**
 * Credit Memo Report (Reports › Sales › Credit Memo) — v3 data contract.
 * Sources: engineering POC v2 (behaviour) + PRD 51218514425 / RFC 51336217071
 * §6.1 + Figma 4531-72195 (visuals).
 *
 * As-of semantics (POC + RFC §6.1):
 *  • ONE as-of date, no lower bound. Every memo issued on/before `asOf` is in.
 *  • A memo's entries are its applications / refunds dated on/before `asOf`;
 *    the running balance starts at the original amount and ends at `remaining`.
 *    No Saldo Awal, no Issued row, no Reversal (dropped from Phase 1).
 *  • Status: Open (remaining > 0) · Closed (remaining = 0).
 *  • CM = sales credit memo (customer, creditMemos.ts); DM = purchase debit memo
 *    (vendor, debitMemos.ts). Both are derived from the documents' mini-DBs on
 *    every call, so the report can never disagree with the documents.
 *  • Contact total = Σ remaining > 0 over the VISIBLE memos (as the POC does).
 */
import { SIM_TODAY_ISO } from './simClock'
import {
  creditMemos, creditMemoApplications, creditMemoRefunds, memoTotal as cmTotal, memoLabel as cmLabel,
  applicationLabel as cmAppLabel, refundLabel as cmRefundLabel, invoiceLabel, invoiceById, customerNameOf,
} from './creditMemos'
import {
  debitMemos, debitMemoApplications, debitMemoRefunds, memoTotal as dmTotal, memoLabel as dmLabel,
  applicationLabel as dmAppLabel, refundLabel as dmRefundLabel, pinvLabel, purchaseInvoiceById, vendorNameOf,
} from './debitMemos'

// ── Types ─────────────────────────────────────────────────────────────────────
export type MemoDocType = 'CM' | 'DM'
export type DocTypeFilter = 'all' | 'CM' | 'DM'
export type CmStatus = 'Open' | 'Closed'
export const DOC_TYPE_FILTERS: DocTypeFilter[] = ['all', 'CM', 'DM']

export interface ReportEntry {
  id: string
  date: string
  type: 'Applied' | 'Refund'
  title: string                 // "Credit Memo Applied #90096" / "Debit Memo Refund #20020"
  titleHref?: string
  linkedNo?: string             // "Sales Invoice #40067, …" / "Purchase Invoice …" / refund reason
  linkedHref?: string
  movement: number              // negative
  balance: number               // running, from originalAmount
}
export interface ReportMemo {
  id: string
  docType: MemoDocType
  contactId: string
  number: string                // "Credit Memo #10086" / "Debit Memo #20088"
  href: string                  // /credit-memos/:id · /debit-memos/:id
  issueDate: string
  description: string
  originalAmount: number
  remaining: number
  status: CmStatus
  entries: ReportEntry[]
}
export interface ReportContact {
  id: string
  name: string
  kind: 'customer' | 'vendor'
  total: number                 // Σ remaining > 0 over the visible memos
  memos: ReportMemo[]           // remaining desc, then issueDate asc
}
/** Amount filter comparator — same set as the shared AmountComparatorField
 *  (rule/filter-drawer-fields). gt / lt are exclusive and use one value (stored in
 *  Min for gt, Max for lt); between is inclusive and uses both. */
export type CmAmountComparator = 'gt' | 'between' | 'lt'
export const CM_AMOUNT_COMPARATORS: CmAmountComparator[] = ['gt', 'between', 'lt']

export interface CmReportFilters {
  asOf: string
  docType: DocTypeFilter
  contactIds: string[]
  groupIds: string[]
  groupMode: 'all' | 'either'
  contactCmp: CmAmountComparator
  contactMin: number | null
  contactMax: number | null
  memoCmp: CmAmountComparator
  memoMin: number | null
  memoMax: number | null
  memoNumber: string
  showZeroContacts: boolean
  showZeroMemos: boolean
}
export type CmViewFilters = Omit<CmReportFilters, 'asOf'>

export function emptyCmReportFilters(): CmReportFilters {
  return {
    asOf: SIM_TODAY_ISO, docType: 'all', contactIds: [], groupIds: [], groupMode: 'all',
    contactCmp: 'gt', contactMin: null, contactMax: null, memoCmp: 'gt', memoMin: null, memoMax: null, memoNumber: '',
    showZeroContacts: true, showZeroMemos: true,
  }
}

// ── Contact groups (mock) ─────────────────────────────────────────────────────
export const CONTACT_GROUPS: { id: string; name: string }[] = [
  { id: 'grp-trading', name: 'Trading' },
  { id: 'grp-fnb', name: 'F&B' },
  { id: 'grp-mfg', name: 'Manufacturing' },
]
/** Deterministic mock: customer C0nn → group[n % 3]; n % 5 === 1 also joins
 *  group[(n + 1) % 3] (e.g. C001, C006 are in two groups). Vendors → []. */
export function contactGroupsOf(contactId: string): string[] {
  const m = /^C(\d+)$/.exec(contactId)
  if (!m) return []
  const n = Number(m[1])
  const ids = CONTACT_GROUPS.map((g) => g.id)
  const out = [ids[n % 3]!]
  if (n % 5 === 1) out.push(ids[(n + 1) % 3]!)
  return out
}

// ── Ledger (derived from the document mini-DBs) ───────────────────────────────
interface RawMemo { memo: Omit<ReportMemo, 'entries' | 'remaining' | 'status'>; usage: Omit<ReportEntry, 'balance'>[] }
type Flags = { voided?: boolean; deleted?: boolean }

function rawCreditMemos(): RawMemo[] {
  return creditMemos.filter((m) => !(m as Flags).voided && !(m as Flags).deleted).map((m) => {
    const usage: Omit<ReportEntry, 'balance'>[] = []
    for (const a of creditMemoApplications.filter((x) => x.creditMemoId === m.id)) {
      const amt = a.allocations.reduce((s, al) => s + al.amount, 0)
      const invs = a.allocations.map((al) => invoiceLabel(invoiceById(al.invoiceId)?.number ?? 0)).join(', ')
      const first = a.allocations[0]?.invoiceId
      usage.push({ id: `${m.id}-${a.id}`, date: a.date, type: 'Applied', title: cmAppLabel(a.number), titleHref: `/credit-memo-applications/${a.id}`,
        linkedNo: invs || undefined, linkedHref: first ? `/sales-invoices/${first}` : undefined, movement: -amt })
    }
    for (const r of creditMemoRefunds.filter((x) => x.lines.some((l) => l.creditMemoId === m.id))) {
      const lines = r.lines.filter((l) => l.creditMemoId === m.id)
      usage.push({ id: `${m.id}-${r.id}`, date: r.date, type: 'Refund', title: cmRefundLabel(r.number), titleHref: `/credit-memo-refunds/${r.id}`,
        linkedNo: lines[0]?.reason?.trim() || 'Refund to customer', movement: -lines.reduce((s, l) => s + l.amount, 0) })
    }
    return { usage, memo: {
      id: m.id, docType: 'CM', contactId: m.customerId, number: cmLabel(m.number), href: `/credit-memos/${m.id}`,
      issueDate: m.date, description: m.lines[0]?.reason?.trim() || 'Credit memo', originalAmount: cmTotal(m),
    } }
  })
}
function rawDebitMemos(): RawMemo[] {
  return debitMemos.filter((m) => !(m as Flags).voided && !(m as Flags).deleted).map((m) => {
    const usage: Omit<ReportEntry, 'balance'>[] = []
    for (const a of debitMemoApplications.filter((x) => x.debitMemoId === m.id)) {
      const amt = a.allocations.reduce((s, al) => s + al.amount, 0)
      const invs = a.allocations.map((al) => pinvLabel(purchaseInvoiceById(al.invoiceId)?.number ?? '')).join(', ')
      const first = a.allocations[0]?.invoiceId
      usage.push({ id: `${m.id}-${a.id}`, date: a.date, type: 'Applied', title: dmAppLabel(a.number), titleHref: `/debit-memo-applications/${a.id}`,
        linkedNo: invs || undefined, linkedHref: first ? `/purchase-invoices/${first}` : undefined, movement: -amt })
    }
    for (const r of debitMemoRefunds.filter((x) => x.lines.some((l) => l.debitMemoId === m.id))) {
      const lines = r.lines.filter((l) => l.debitMemoId === m.id)
      usage.push({ id: `${m.id}-${r.id}`, date: r.date, type: 'Refund', title: dmRefundLabel(r.number), titleHref: `/debit-memo-refunds/${r.id}`,
        linkedNo: lines[0]?.reason?.trim() || 'Refund from vendor', movement: -lines.reduce((s, l) => s + l.amount, 0) })
    }
    return { usage, memo: {
      id: m.id, docType: 'DM', contactId: m.vendorId, number: dmLabel(m.number), href: `/debit-memos/${m.id}`,
      issueDate: m.date, description: m.lines[0]?.reason?.trim() || 'Debit memo', originalAmount: dmTotal(m),
    } }
  })
}

/** A memo as it stood at the end of `asOf` (null if issued after it). */
function memoAsOf(r: RawMemo, asOf: string): ReportMemo | null {
  if (r.memo.issueDate > asOf) return null
  let bal = r.memo.originalAmount
  const entries = r.usage
    .map((u, i) => ({ u, i }))
    .filter(({ u }) => u.date <= asOf)
    .sort((a, b) => a.u.date.localeCompare(b.u.date) || a.i - b.i)   // applications before refunds on the same day
    .map(({ u }) => { bal += u.movement; return { ...u, balance: bal } })
  const remaining = Math.max(0, bal)
  return { ...r.memo, remaining, status: remaining > 0 ? 'Open' : 'Closed', entries }
}

function contactOf(id: string, docType: MemoDocType): Pick<ReportContact, 'id' | 'name' | 'kind'> {
  return docType === 'CM' ? { id, name: customerNameOf(id), kind: 'customer' } : { id, name: vendorNameOf(id), kind: 'vendor' }
}

function allRaw(docType: DocTypeFilter): RawMemo[] {
  return [...(docType === 'DM' ? [] : rawCreditMemos()), ...(docType === 'CM' ? [] : rawDebitMemos())]
}

/** Contacts (customers / vendors) that hold at least one memo of the type. */
export function contactOptions(f?: Pick<CmReportFilters, 'docType'>): { value: string; label: string }[] {
  const seen = new Map<string, string>()
  for (const r of allRaw(f?.docType ?? 'all')) if (!seen.has(r.memo.contactId)) seen.set(r.memo.contactId, contactOf(r.memo.contactId, r.memo.docType).name)
  return [...seen].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
}

// ── Period presets (anchor the single as-of date) ─────────────────────────────
export type PeriodPreset = 'custom' | 'today' | 'endThisMonth' | 'endLastMonth' | 'endThisQuarter' | 'endLastYear'
export const PERIOD_PRESETS: { key: PeriodPreset; label: string }[] = [
  { key: 'custom', label: 'Custom' },
  { key: 'today', label: 'Today' },
  { key: 'endThisMonth', label: 'End of this month' },
  { key: 'endLastMonth', label: 'End of last month' },
  { key: 'endThisQuarter', label: 'End of this quarter' },
  { key: 'endLastYear', label: 'End of last year' },
]
const iso = (y: number, m0: number, d: number) => new Date(Date.UTC(y, m0, d)).toISOString().slice(0, 10)
/** Last day of month m0 (0-based, may overflow) of year y. */
const endOfMonth = (y: number, m0: number) => iso(y, m0 + 1, 0)
export function resolvePreset(p: PeriodPreset, today: string = SIM_TODAY_ISO): string | null {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number]
  switch (p) {
    case 'today': return iso(y, m - 1, d)
    case 'endThisMonth': return endOfMonth(y, m - 1)
    case 'endLastMonth': return endOfMonth(y, m - 2)
    case 'endThisQuarter': return endOfMonth(y, Math.floor((m - 1) / 3) * 3 + 2)
    case 'endLastYear': return iso(y - 1, 11, 31)
    default: return null
  }
}

// ── Report query (POC visibleData order) ──────────────────────────────────────
const normNumber = (s: string) => (s ?? '').trim().replace(/^#/, '').trim().toLowerCase()

function memoMatchesNumber(m: ReportMemo, q: string): boolean {
  if (!q) return true
  const digits = m.number.replace(/^.*#/, '')
  return digits.includes(q) || m.number.toLowerCase().includes(q)
}

export function creditMemoReport(f: CmReportFilters): ReportContact[] {
  const q = normNumber(f.memoNumber)
  const byContact = new Map<string, ReportContact>()
  for (const r of allRaw(f.docType)) {
    const cid = r.memo.contactId
    // contact / group
    if (f.contactIds.length && !f.contactIds.includes(cid)) continue
    if (f.groupIds.length) {
      const gs = contactGroupsOf(cid)
      const ok = f.groupMode === 'either' ? f.groupIds.some((g) => gs.includes(g)) : f.groupIds.every((g) => gs.includes(g))
      if (!ok) continue
    }
    // memos
    const m = memoAsOf(r, f.asOf)
    if (!m) continue
    if (!memoMatchesNumber(m, q)) continue
    if (!amountPasses(m.remaining, f.memoCmp, f.memoMin, f.memoMax)) continue
    if (!f.showZeroMemos && m.remaining <= 0) continue
    let c = byContact.get(cid)
    if (!c) { c = { ...contactOf(cid, m.docType), total: 0, memos: [] }; byContact.set(cid, c) }
    c.memos.push(m)
  }
  const out: ReportContact[] = []
  for (const c of byContact.values()) {
    if (!c.memos.length) continue
    c.total = c.memos.reduce((s, m) => s + (m.remaining > 0 ? m.remaining : 0), 0)
    if (!amountPasses(c.total, f.contactCmp, f.contactMin, f.contactMax)) continue
    if (!f.showZeroContacts && c.total === 0) continue
    c.memos.sort((a, b) => b.remaining - a.remaining || a.issueDate.localeCompare(b.issueDate) || a.number.localeCompare(b.number))
    out.push(c)
  }
  return out.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name))
}

/** Does an amount pass a comparator filter? An unset filter (no value) passes. */
export function amountPasses(n: number, cmp: CmAmountComparator, min: number | null, max: number | null): boolean {
  if (cmp === 'gt') return min == null || n > min
  if (cmp === 'lt') return max == null || n < max
  return (min == null || n >= min) && (max == null || n <= max)
}
/** Is an amount filter set? gt reads Min, lt reads Max, between reads either. */
export function amountActive(cmp: CmAmountComparator, min: number | null, max: number | null): boolean {
  if (cmp === 'gt') return min != null
  if (cmp === 'lt') return max != null
  return min != null || max != null
}

/** "All filters (N)" — ONE per active filter row (rule/filter-all-filters-active-count):
 *  type, customer, customer group, each balance, number, and each Hide Rp 0
 *  toggle. asOf is the report's own date, not a filter. */
export function activeFilterCount(f: CmReportFilters | CmViewFilters): number {
  let n = 0
  if (f.docType !== 'all') n++
  if (f.contactIds.length) n++
  if (f.groupIds.length) n++
  if (amountActive(f.contactCmp, f.contactMin, f.contactMax)) n++
  if (amountActive(f.memoCmp, f.memoMin, f.memoMax)) n++
  if (normNumber(f.memoNumber)) n++
  if (!f.showZeroContacts) n++
  if (!f.showZeroMemos) n++
  return n
}

export const RANGE_ERROR = "Min can't be greater than max."
/** Only "Is between" can be inverted (Min > Max). */
export function validateFilters(f: Pick<CmReportFilters, 'contactCmp' | 'contactMin' | 'contactMax' | 'memoCmp' | 'memoMin' | 'memoMax'>): { contact?: string; memo?: string } {
  const e: { contact?: string; memo?: string } = {}
  if (f.contactCmp === 'between' && f.contactMin != null && f.contactMax != null && f.contactMin > f.contactMax) e.contact = RANGE_ERROR
  if (f.memoCmp === 'between' && f.memoMin != null && f.memoMax != null && f.memoMin > f.memoMax) e.memo = RANGE_ERROR
  return e
}

// ── Export (PRD AC-006-05: zero-balance rows ALWAYS exported) ─────────────────
export interface CmExport { summary: (string | number)[][]; detail: (string | number)[][] }
export const EXPORT_SUMMARY_HEADER = ['Contact', 'Contact type', 'Credit memo count', 'Remaining balance', 'Currency']
export const EXPORT_DETAIL_HEADER = ['Contact', 'Contact type', 'Row type', 'Date', 'Number', 'Linked transaction', 'Description', 'Status', 'Original amount', 'Movement', 'Balance', 'Currency']
const kindLabel = (k: ReportContact['kind']) => (k === 'customer' ? 'Customer' : 'Vendor')
const docLabel = (d: MemoDocType) => (d === 'CM' ? 'Credit memo' : 'Debit memo')

/** Detail-sheet columns offered in the ExportModal (rule/export-modal). Contact and
 *  Number identify a row, so they are always exported. */
export const EXPORT_DETAIL_COLUMNS: { key: string; label: string; required?: boolean }[] =
  EXPORT_DETAIL_HEADER.map((label) => ({ key: label, label, required: label === 'Contact' || label === 'Number' }))

/** `columns` = the detail-sheet columns to keep (ExportModal); omitted → all. */
export function buildExport(f: CmReportFilters, columns?: string[]): CmExport {
  const data = creditMemoReport({ ...f, showZeroContacts: true, showZeroMemos: true })
  const title = [['Credit Memo Report'], ['As of', f.asOf], []]
  const summary: (string | number)[][] = [...title, EXPORT_SUMMARY_HEADER]
  const detail: (string | number)[][] = [...title, EXPORT_DETAIL_HEADER]
  for (const c of data) {
    summary.push([c.name, kindLabel(c.kind), c.memos.length, Math.round(c.total), 'IDR'])
    for (const m of c.memos) {
      detail.push([c.name, kindLabel(c.kind), docLabel(m.docType), m.issueDate, m.number, '', m.description, m.status, Math.round(m.originalAmount), '', Math.round(m.originalAmount), 'IDR'])
      for (const e of m.entries) {
        detail.push([c.name, kindLabel(c.kind), e.type, e.date, e.title, e.linkedNo ?? '', '', 'Closed', '', Math.round(e.movement), Math.round(e.balance), 'IDR'])
      }
    }
  }
  if (columns) {
    const keep = EXPORT_DETAIL_HEADER.map((h, i) => (columns.includes(h) || EXPORT_DETAIL_COLUMNS[i]!.required ? i : -1)).filter((i) => i >= 0)
    const header = title.length
    for (let r = header; r < detail.length; r++) detail[r] = keep.map((i) => detail[r]![i] ?? '')
  }
  return { summary, detail }
}

// ── Filter normalization (stored / partial / legacy filters) ─────────────────
const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
/** A stored comparator, or one inferred from a legacy min/max-only view. */
const cmpOf = (v: unknown, min: unknown, max: unknown): CmAmountComparator => {
  if (CM_AMOUNT_COMPARATORS.includes(v as CmAmountComparator)) return v as CmAmountComparator
  const hasMin = numOrNull(min) != null, hasMax = numOrNull(max) != null
  return hasMin && hasMax ? 'between' : hasMax ? 'lt' : 'gt'
}
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
/** Coerce stored / partial / legacy filters (keyword, txnTypes, statuses,
 *  showZero, customers…) into the v3 view shape; unknown fields → defaults. */
export function normalizeCmViewFilters(raw: unknown): CmViewFilters {
  const { asOf: _drop, ...base } = emptyCmReportFilters()
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const groups = CONTACT_GROUPS.map((g) => g.id)
  return {
    docType: DOC_TYPE_FILTERS.includes(r.docType as DocTypeFilter) ? (r.docType as DocTypeFilter) : base.docType,
    contactIds: strList(r.contactIds),
    groupIds: strList(r.groupIds).filter((g) => groups.includes(g)),
    groupMode: r.groupMode === 'either' ? 'either' : 'all',
    contactCmp: cmpOf(r.contactCmp, r.contactMin, r.contactMax),
    contactMin: numOrNull(r.contactMin), contactMax: numOrNull(r.contactMax),
    memoCmp: cmpOf(r.memoCmp, r.memoMin, r.memoMax),
    memoMin: numOrNull(r.memoMin), memoMax: numOrNull(r.memoMax),
    memoNumber: typeof r.memoNumber === 'string' ? r.memoNumber : base.memoNumber,
    showZeroContacts: typeof r.showZeroContacts === 'boolean' ? r.showZeroContacts : base.showZeroContacts,
    showZeroMemos: typeof r.showZeroMemos === 'boolean' ? r.showZeroMemos : base.showZeroMemos,
  }
}
/** Full filters: a view's filters + an as-of date (default SIM today). */
export function normalizeCmFilters(raw: unknown, asOf?: string): CmReportFilters {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const a = asOf ?? (typeof r.asOf === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.asOf) ? r.asOf : SIM_TODAY_ISO)
  return { asOf: a, ...normalizeCmViewFilters(raw) }
}
/** Strip asOf (views never store it). */
export function toViewFilters(f: CmReportFilters | CmViewFilters): CmViewFilters { return normalizeCmViewFilters(f) }
