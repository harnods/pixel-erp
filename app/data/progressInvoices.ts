import { ref } from 'vue'
import { salesInvoices } from './salesInvoices'
import { getSalesInvoiceDetail } from './salesInvoiceDetails'
import { salesOrders } from './salesOrders'
import { getCustomer } from './customers'
import { loadCreated, saveCreated } from './persist'

/**
 * Progress invoices + proforma invoices (prod-parity, wave 4).
 *
 *  • Progress invoice (prod `proforma_type`, /proforma_invoices) — bills a share of a
 *    MASTER SALES INVOICE. All progress invoices of one invoice share its receivable,
 *    numbered `#<invoice no>-<n>` (prod copy: "#10001-1, #10001-2").
 *  • Proforma invoice (prod `order_proforma_type`, /pro_forma_orders) — bills a share of a
 *    MASTER SALES ORDER before the order is invoiced.
 *
 * Each document snapshots the master's lines and stores, per line, the billed share
 * (percentage or fixed amount — prod's "Invoicing method"). Master seed records are
 * only READ here; their amounts are never changed. User-created / deleted / paid
 * documents persist through persist.ts (loadCreated / saveCreated).
 */

export type ProgressDocKind = 'progress' | 'proforma'
export type ProgressMethod = 'percentage' | 'fixed_amount'
export type ProgressDocStatus = 'open' | 'paid'

export interface ProgressLine {
  product: string
  sku: string
  description: string
  qty: number
  unit: string
  unitPrice: number
  discountPct: number
  taxLabel: string
  /** Line amount on the master transaction (net of line discount, excl. tax). */
  masterAmount: number
  /** Billed share in % (percentage method) — null for fixed amount. */
  billedPct: number | null
  /** Billed amount on this document (excl. tax). */
  billed: number
}

export interface ProgressDoc {
  id: string
  kind: ProgressDocKind
  number: string
  masterId: string
  masterNumber: number
  customer: { id: string; name: string }
  email: string[]
  billingAddress: string
  date: string
  dueDate: string
  term: string
  customerRefNo: string
  method: ProgressMethod
  lines: ProgressLine[]
  message: string
  memo: string
  status: ProgressDocStatus
  tags: string[]
  userCreated?: boolean
}

export interface ProgressTotals {
  subtotal: number
  taxLabel: string
  taxAmount: number
  total: number
  paid: number
  balance: number
}

const TAX_RATE = 0.11
const K_CREATED = 'progress-docs-created'
const K_DELETED = 'progress-docs-deleted'
const K_PAID = 'progress-docs-paid'

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

function emailOf(customerId: string): string[] {
  const c = getCustomer(customerId)
  return c?.email ? [c.email] : []
}

const ADDRESSES = [
  'Jl. Anggrek No. 25, Kebayoran Baru, Jakarta Selatan, 12130, DKI Jakarta',
  'Jl. Gatot Subroto Kav. 18, Setiabudi, Jakarta Selatan, 12950, DKI Jakarta',
  'Jl. Diponegoro No. 4, Menteng, Jakarta Pusat, 10310, DKI Jakarta',
]

// ── Master transactions ──────────────────────────────────────────────────────
export interface ProgressMaster {
  id: string
  number: number
  label: string
  customer: { id: string; name: string }
  date: string
  dueDate: string
  total: number
  lines: Omit<ProgressLine, 'billedPct' | 'billed'>[]
}

export function masterOf(kind: ProgressDocKind, id: string): ProgressMaster | null {
  if (kind === 'progress') {
    const si = salesInvoices.find((s) => s.id === id)
    if (!si) return null
    const d = getSalesInvoiceDetail(si.id)
    return {
      id: si.id, number: si.number, label: `Sales Invoice #${si.number}`,
      customer: { ...si.customer }, date: si.date, dueDate: si.dueDate, total: si.total,
      lines: d.lineItems.map((it) => ({
        product: it.product, sku: it.sku, description: it.description, qty: it.qty, unit: it.unit,
        unitPrice: it.unitPrice, discountPct: it.discountPct, taxLabel: it.taxLabel, masterAmount: it.amount,
      })),
    }
  }
  const so = salesOrders.find((s) => s.id === id)
  if (!so) return null
  return {
    id: so.id, number: so.number, label: `Sales Order #${so.number}`,
    customer: { ...so.customer }, date: so.date, dueDate: so.dueDate, total: so.total,
    lines: so.items.map((it) => ({
      product: it.product, sku: it.sku, description: it.description, qty: it.qty, unit: it.unit,
      unitPrice: it.unitPrice, discountPct: it.discountPct, taxLabel: 'PPN 11%', masterAmount: it.amount,
    })),
  }
}

export function masterLabel(kind: ProgressDocKind, number: number): string {
  return kind === 'progress' ? `Sales Invoice #${number}` : `Sales Order #${number}`
}

/** Masters a new document can bill: unpaid sales invoices / open sales orders. */
export function masterOptions(kind: ProgressDocKind): { value: string; label: string }[] {
  if (kind === 'progress') {
    return salesInvoices
      .filter((s) => s.status !== 'paid')
      .map((s) => ({ value: s.id, label: `Sales Invoice #${s.number} · ${s.customer.name}` }))
  }
  return salesOrders
    .filter((s) => s.status === 'open' || s.status === 'partially processed')
    .map((s) => ({ value: s.id, label: `Sales Order #${s.number} · ${s.customer.name}` }))
}

// ── Seed ─────────────────────────────────────────────────────────────────────
function seedDoc(
  kind: ProgressDocKind, master: ProgressMaster, seq: number, pct: number,
  status: ProgressDocStatus, extra: Partial<ProgressDoc> = {},
): ProgressDoc {
  const lines: ProgressLine[] = master.lines.map((l) => ({
    ...l, billedPct: pct, billed: Math.round((l.masterAmount * pct) / 100),
  }))
  // Dated on/after the master, never past the sim "today" (masters are recent).
  const date = addDays(master.date, seq - 1)
  return {
    id: `${kind === 'progress' ? 'PGI' : 'PFI'}-${master.id}-${seq}`,
    kind,
    number: `${master.number}-${seq}`,
    masterId: master.id,
    masterNumber: master.number,
    customer: { ...master.customer },
    email: emailOf(master.customer.id),
    billingAddress: ADDRESSES[(master.number + seq) % ADDRESSES.length]!,
    date,
    dueDate: addDays(date, 30),
    term: 'Net 30',
    customerRefNo: '',
    method: 'percentage',
    lines,
    message: '',
    memo: '',
    status,
    tags: [],
    ...extra,
  }
}

function buildSeed(): ProgressDoc[] {
  const out: ProgressDoc[] = []
  // Progress invoices — on the 3 newest unpaid sales invoices.
  const sis = salesInvoices.filter((s) => s.status !== 'paid').slice(0, 3)
  sis.forEach((si, i) => {
    const m = masterOf('progress', si.id)
    if (!m) return
    out.push(seedDoc('progress', m, 1, 30, 'paid', { tags: i === 0 ? ['B2B'] : [] }))
    if (i < 2) out.push(seedDoc('progress', m, 2, 40, 'open', { customerRefNo: i === 0 ? 'PO-ANM-2026-118' : '' }))
  })
  // Proforma invoices — on the first open sales orders (incl. one fixed-amount and one 0% worst case).
  const sos = salesOrders.filter((s) => s.status === 'open').slice(0, 4)
  sos.forEach((so, i) => {
    const m = masterOf('proforma', so.id)
    if (!m) return
    if (i === 3) {
      // Worst case: every line at 0% → total 0 (prod allows it, with a warning).
      out.push(seedDoc('proforma', m, 1, 0, 'open', { memo: 'Draft down payment — amount to be agreed with the customer.' }))
      return
    }
    const d = seedDoc('proforma', m, 1, i === 1 ? 50 : 20, i === 2 ? 'paid' : 'open')
    if (i === 1) {
      d.method = 'fixed_amount'
      d.lines = d.lines.map((l) => ({ ...l, billedPct: null }))
    }
    out.push(d)
  })
  return out
}

// ── Store ────────────────────────────────────────────────────────────────────
function build(): ProgressDoc[] {
  const deleted = new Set(loadCreated<string>(K_DELETED))
  const paid = new Set(loadCreated<string>(K_PAID))
  const all = [...loadCreated<ProgressDoc>(K_CREATED), ...buildSeed()]
  return all
    .filter((d) => !deleted.has(d.id))
    .map((d) => (paid.has(d.id) ? { ...d, status: 'paid' as const } : d))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
}

export const progressDocs = ref<ProgressDoc[]>(build())

function persist(deletedIds: string[] = []) {
  saveCreated(K_CREATED, progressDocs.value.filter((d) => d.userCreated))
  if (deletedIds.length) {
    const prev = loadCreated<string>(K_DELETED)
    saveCreated(K_DELETED, [...new Set([...prev, ...deletedIds])])
  }
  saveCreated(K_PAID, progressDocs.value.filter((d) => d.status === 'paid' && !d.userCreated).map((d) => d.id))
}

export function progressDocsOf(kind: ProgressDocKind): ProgressDoc[] {
  return progressDocs.value.filter((d) => d.kind === kind)
}

export function getProgressDoc(id: string): ProgressDoc | undefined {
  return progressDocs.value.find((d) => d.id === id)
}

/** Other documents billing the same master (for remaining balance + locked method). */
export function siblingsOf(kind: ProgressDocKind, masterId: string, excludeId?: string): ProgressDoc[] {
  return progressDocs.value.filter((d) => d.kind === kind && d.masterId === masterId && d.id !== excludeId)
}

/** Per-line amount already billed by other documents on the same master. */
export function billedElsewhere(kind: ProgressDocKind, masterId: string, excludeId?: string): number[] {
  const acc: number[] = []
  for (const d of siblingsOf(kind, masterId, excludeId)) {
    d.lines.forEach((l, i) => { acc[i] = (acc[i] ?? 0) + l.billed })
  }
  return acc
}

export function totalsOf(d: Pick<ProgressDoc, 'lines' | 'status'>): ProgressTotals {
  const subtotal = d.lines.reduce((s, l) => s + l.billed, 0)
  const taxable = d.lines.filter((l) => l.taxLabel !== 'No PPN').reduce((s, l) => s + l.billed, 0)
  const taxAmount = Math.round(taxable * TAX_RATE)
  const total = subtotal + taxAmount
  const paid = d.status === 'paid' ? total : 0
  return { subtotal, taxLabel: 'PPN 11%', taxAmount, total, paid, balance: total - paid }
}

export function nextProgressNumber(kind: ProgressDocKind, masterId: string, masterNumber: number): string {
  const n = progressDocs.value.filter((d) => d.kind === kind && d.masterId === masterId).length + 1
  return `${masterNumber}-${n}`
}

export function createProgressDoc(doc: Omit<ProgressDoc, 'id' | 'userCreated'>): ProgressDoc {
  const created: ProgressDoc = {
    ...doc,
    id: `${doc.kind === 'progress' ? 'PGI' : 'PFI'}-U${Date.now().toString(36)}`,
    userCreated: true,
  }
  progressDocs.value = [created, ...progressDocs.value]
  persist()
  return created
}

export function deleteProgressDocs(ids: string[]): void {
  const set = new Set(ids)
  const seedIds = progressDocs.value.filter((d) => set.has(d.id) && !d.userCreated).map((d) => d.id)
  progressDocs.value = progressDocs.value.filter((d) => !set.has(d.id))
  persist(seedIds)
}

export function markProgressDocPaid(id: string): void {
  progressDocs.value = progressDocs.value.map((d) => (d.id === id ? { ...d, status: 'paid' } : d))
  persist()
}

/** Dev-time arithmetic guard: totals = Σ lines + tax; no line bills more than its master amount. */
export function assertProgressDocs(): void {
  for (const d of progressDocs.value) {
    const t = totalsOf(d)
    if (t.total !== t.subtotal + t.taxAmount) throw new Error(`progress doc ${d.id}: total mismatch`)
    d.lines.forEach((l) => {
      if (l.billed < 0 || l.billed > l.masterAmount) throw new Error(`progress doc ${d.id}: line over-billed`)
    })
  }
}
if (import.meta.dev) assertProgressDocs()
