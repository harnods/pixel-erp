import { reactive } from 'vue'
import { loadCreated, saveCreated } from './persist'
import { salesInvoices } from './salesInvoices'
import { purchaseInvoices } from './purchaseInvoices'
import { customers } from './customers'
import { vendors } from './vendors'
import { SIM_TODAY_ISO } from './simClock'

/**
 * Join invoices (prod "merged invoices") — one record bundles 2–150 of a single
 * contact's invoices into one bill. Sales: jurnal-frontend-app pages/sales/merged_invoices;
 * purchases: pages/purchases/merged_invoices. Lines only REFERENCE existing
 * sales/purchase invoices — amounts, due dates and statuses are read live from
 * those seeds (never copied, never changed), so reports keep tying out.
 * Seeds are fixed; user-created / edited records persist via persist.ts.
 */
export type JoinKind = 'sales' | 'purchase'
export type JoinStatus = 'open' | 'paid' | 'overdue'

export interface JoinInvoiceLine {
  invoiceId: string
  description: string
}

export interface JoinInvoice {
  id: string
  kind: JoinKind
  /** Sequence number → "Join Invoice - 10001" (prod MergedInvoiceNoSequence default format). */
  sequence: number
  /** Explicit transaction no. when the user typed one; otherwise derived from sequence. */
  customNumber?: string
  contactId: string
  contactName: string
  email: string
  billingAddress: string
  /** ISO yyyy-mm-dd */
  transactionDate: string
  dueDate: string
  term: string
  lines: JoinInvoiceLine[]
  message: string
  memo: string
  createdAt: string
  /** A seed record the user edited (persisted so the edit survives reload). */
  edited?: boolean
}

/** A resolved invoice line (the source invoice, read live). */
export interface JoinSourceInvoice {
  id: string
  label: string
  contactId: string
  date: string
  dueDate: string
  total: number
  balance: number
  status: JoinStatus
}

export const JOIN_MIN_INVOICES = 2
export const JOIN_MAX_INVOICES = 150

// ── Source invoices (read-only views over the existing seeds) ────────────────
function salesSource(id: string): JoinSourceInvoice | undefined {
  const s = salesInvoices.find((x) => x.id === id)
  if (!s) return undefined
  return { id: s.id, label: `Sales Invoice #${s.number}`, contactId: s.customer.id, date: s.date, dueDate: s.dueDate, total: s.total, balance: s.balance, status: s.status }
}
function purchaseSource(id: string): JoinSourceInvoice | undefined {
  const p = purchaseInvoices.find((x) => x.id === id)
  if (!p) return undefined
  const balance = p.status === 'paid' ? 0 : p.amount
  return { id: p.id, label: `Purchase Invoice #${p.number}`, contactId: p.vendor.id, date: p.date, dueDate: p.dueDate, total: p.amount, balance, status: p.status }
}
export function sourceInvoice(kind: JoinKind, id: string): JoinSourceInvoice | undefined {
  return kind === 'sales' ? salesSource(id) : purchaseSource(id)
}
export function sourceInvoicesFor(kind: JoinKind, contactId: string): JoinSourceInvoice[] {
  const ids = kind === 'sales'
    ? salesInvoices.filter((s) => s.customer.id === contactId).map((s) => s.id)
    : purchaseInvoices.filter((p) => p.vendor.id === contactId).map((p) => p.id)
  return ids.map((id) => sourceInvoice(kind, id)!).filter(Boolean)
}

export interface JoinContact { id: string; name: string; email: string; billingAddress: string; term: string }
function contactFor(kind: JoinKind, id: string): JoinContact | undefined {
  const base = kind === 'sales' ? customers.find((c) => c.id === id) : vendors.find((v) => v.id === id)
  if (!base) return undefined
  return { id: base.id, name: base.name, email: base.email, billingAddress: `${base.city}, Indonesia`, term: 'Net 30' }
}
export function joinContact(kind: JoinKind, id: string): JoinContact | undefined { return contactFor(kind, id) }

// ── Seed ──────────────────────────────────────────────────────────────────────
function unpaid(kind: JoinKind, contactId: string, n: number, newest = false): string[] {
  const list = sourceInvoicesFor(kind, contactId).filter((s) => s.balance > 0).sort((a, b) => a.date.localeCompare(b.date))
  return (newest ? list.slice(-n) : list.slice(0, n)).map((s) => s.id)
}
function paid(kind: JoinKind, contactId: string, n: number): string[] {
  return sourceInvoicesFor(kind, contactId).filter((s) => s.balance === 0).sort((a, b) => b.date.localeCompare(a.date)).slice(0, n).map((s) => s.id)
}
function latestDate(kind: JoinKind, ids: string[]): string {
  return ids.map((id) => sourceInvoice(kind, id)?.date ?? '').sort().pop() || SIM_TODAY_ISO
}
function addDays(iso: string, days: number): string {
  const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + days); return d.toISOString().slice(0, 10)
}

interface SeedSpec { kind: JoinKind; seq: number; contactId: string; ids: string[]; term: string; days: number; message?: string; memo?: string; descriptions?: string[] }
function seedOne(s: SeedSpec): JoinInvoice | null {
  const c = contactFor(s.kind, s.contactId)
  if (!c || s.ids.length < JOIN_MIN_INVOICES) return null
  const trx = latestDate(s.kind, s.ids)
  return {
    id: `ji-seed-${s.kind}-${s.seq}`, kind: s.kind, sequence: s.seq,
    contactId: c.id, contactName: c.name, email: c.email, billingAddress: c.billingAddress,
    transactionDate: trx, dueDate: addDays(trx, s.days), term: s.term,
    lines: s.ids.map((invoiceId, i) => ({ invoiceId, description: s.descriptions?.[i] ?? '' })),
    message: s.message ?? '', memo: s.memo ?? '', createdAt: `${trx}T10:00:00`,
  }
}

function buildSeed(): JoinInvoice[] {
  const specs: SeedSpec[] = [
    // Sales
    { kind: 'sales', seq: 10001, contactId: 'C015', ids: unpaid('sales', 'C015', 3), term: 'Net 30', days: 30, message: 'Consolidated billing for green bean supply, March–August.' },
    // Worst case: longest customer name, long line descriptions + memo, overdue
    { kind: 'sales', seq: 10002, contactId: 'C002', ids: unpaid('sales', 'C002', 2), term: 'Net 15', days: 15,
      descriptions: ['Arabica Gayo washed process, 60 kg bags, delivered to the Kemang roastery and the Senopati outlet', 'Re-delivery after the damaged pallet claim'],
      memo: 'Customer asked for a single bill per quarter; finance contact is the procurement team at the head office, not the outlet managers.' },
    { kind: 'sales', seq: 10003, contactId: 'C009', ids: unpaid('sales', 'C009', 2), term: 'Net 30', days: 30 },
    // Zero record: every joined invoice already settled → remaining billed 0, Paid
    { kind: 'sales', seq: 10004, contactId: 'C004', ids: paid('sales', 'C004', 2), term: 'Net 30', days: 30 },
    // Purchases
    { kind: 'purchase', seq: 10001, contactId: 'V001', ids: unpaid('purchase', 'V001', 3, true), term: 'Net 30', days: 30, message: 'Joined for the August payment run.' },
    { kind: 'purchase', seq: 10002, contactId: 'V012', ids: unpaid('purchase', 'V012', 2), term: 'Net 15', days: 15,
      descriptions: ['Annual ERP subscription renewal, 25 named users, billed in advance for the 2026–2027 period', ''] },
    { kind: 'purchase', seq: 10003, contactId: 'V002', ids: paid('purchase', 'V002', 2), term: 'Net 30', days: 30 },
  ]
  return specs.map(seedOne).filter((x): x is JoinInvoice => !!x)
}

const KEY = 'join-invoices-v1'
const SEED = buildSeed()
/** Persisted = user-created records + edited copies of seeds (same id wins over the seed). */
const stored = loadCreated<JoinInvoice>(KEY)
const deletedKey = 'join-invoices-deleted-v1'
const deleted = new Set(loadCreated<string>(deletedKey))
export const joinInvoices = reactive<JoinInvoice[]>([
  ...stored,
  ...SEED.filter((s) => !stored.some((x) => x.id === s.id)),
].filter((j) => !deleted.has(j.id)))

function persist(): void {
  saveCreated(KEY, joinInvoices.filter((j) => !j.id.startsWith('ji-seed-') || j.edited))
  saveCreated(deletedKey, [...deleted])
}

// ── Derived values ────────────────────────────────────────────────────────────
export function joinNumber(j: JoinInvoice): string {
  return j.customNumber?.trim() || `Join Invoice - ${j.sequence}`
}
export function joinLines(j: JoinInvoice): (JoinSourceInvoice & { description: string })[] {
  return j.lines.flatMap((l) => {
    const s = sourceInvoice(j.kind, l.invoiceId)
    return s ? [{ ...s, description: l.description }] : []
  })
}
export function joinTotal(j: JoinInvoice): number { return joinLines(j).reduce((s, l) => s + l.total, 0) }
export function joinRemaining(j: JoinInvoice): number { return joinLines(j).reduce((s, l) => s + l.balance, 0) }
/** Prod MergedInvoice#set_current_status: paid once settled, else overdue past due date, else open. */
export function joinStatus(j: JoinInvoice): JoinStatus {
  if (joinRemaining(j) === 0) return 'paid'
  return j.dueDate < SIM_TODAY_ISO ? 'overdue' : 'open'
}
/** Latest invoice date among lines — the join's transaction date can't be earlier. */
export function latestInvoiceDate(kind: JoinKind, ids: string[]): string {
  return ids.map((id) => sourceInvoice(kind, id)?.date ?? '').filter(Boolean).sort().pop() ?? ''
}
/** Invoice ids already joined elsewhere (an invoice joins at most one join invoice). */
export function joinedInvoiceIds(kind: JoinKind, exceptId?: string): Set<string> {
  return new Set(joinInvoices.filter((j) => j.kind === kind && j.id !== exceptId).flatMap((j) => j.lines.map((l) => l.invoiceId)))
}

export function joinInvoicesOf(kind: JoinKind): JoinInvoice[] { return joinInvoices.filter((j) => j.kind === kind) }
export function getJoinInvoice(id: string): JoinInvoice | undefined { return joinInvoices.find((j) => j.id === id) }
export function nextJoinSequence(kind: JoinKind): number {
  return Math.max(10000, ...joinInvoicesOf(kind).map((j) => j.sequence)) + 1
}

export type JoinInvoiceInput = Omit<JoinInvoice, 'id' | 'kind' | 'sequence' | 'createdAt'>
export function addJoinInvoice(kind: JoinKind, input: JoinInvoiceInput): JoinInvoice {
  const sequence = nextJoinSequence(kind)
  const j: JoinInvoice = { ...input, id: `ji-new-${kind}-${sequence}-${Date.now().toString(36)}`, kind, sequence, createdAt: new Date().toISOString() }
  joinInvoices.unshift(j)
  persist()
  return j
}
export function updateJoinInvoice(id: string, input: JoinInvoiceInput): void {
  const j = getJoinInvoice(id)
  if (!j) return
  Object.assign(j, input)
  if (j.id.startsWith('ji-seed-')) j.edited = true
  persist()
}
export function deleteJoinInvoice(id: string): void {
  const i = joinInvoices.findIndex((j) => j.id === id)
  if (i < 0) return
  joinInvoices.splice(i, 1)
  if (id.startsWith('ji-seed-')) deleted.add(id)
  persist()
}
