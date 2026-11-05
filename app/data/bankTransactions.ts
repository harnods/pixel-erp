import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import { cashAccounts } from './cashAccounts'
import { internalTransfers } from './internalTransfers'
import { companyTaxes, effectiveRate } from './companyTaxes'
import { MAPPING_COA } from './companySettings'

/**
 * Cash management money movements — Receive money (bank deposit) and Spend
 * money (bank withdrawal). Mirrors jurnal-accounting-frontend
 * src/modules/cash-management/bank-deposits + bank-withdrawals.
 *
 * Seed rows are already reflected in the seeded account balances; only
 * user-created rows (and user-created internal transfers) move a cash
 * account's book balance — see applyPostedBalances().
 */

export type CashTxKind = 'deposit' | 'withdrawal'

export interface CashTxLine {
  /** Chart-of-accounts code, e.g. '4-40000' */
  accountCode: string
  description: string
  /** companyTaxes id, '' = no tax */
  taxId: string
  amount: number
}

export interface CashTxRecurring {
  name: string
  interval: number
  unit: 'day' | 'week' | 'month' | 'year'
  ends: 'never' | 'after' | 'on'
  occurrences?: number
  endDate?: string
  startDate: string
}

export interface CashTx {
  id: string
  kind: CashTxKind
  /** Document number shown as "Receive money #10001" */
  number: number
  /** Deposit to / Pay from — cash account id (data/cashAccounts.ts) */
  cashAccountId: string
  /** Payer / Payee — contact display name ('' = none) */
  contact: string
  /** ISO yyyy-mm-dd */
  transactionDate: string
  referenceNo?: string
  tags: string[]
  priceIncludesTax: boolean
  lines: CashTxLine[]
  memo?: string
  recurring?: CashTxRecurring
  seeded?: boolean
  createdAt: string
}

// ── Seeds (deterministic) ─────────────────────────────────────────────────────
function seed(): CashTx[] {
  const mk = (
    kind: CashTxKind, n: number, date: string, acc: string, contact: string,
    lines: CashTxLine[], extra: Partial<CashTx> = {},
  ): CashTx => ({
    id: `${kind === 'deposit' ? 'bd' : 'bw'}-seed-${n}`, kind, number: n, cashAccountId: acc, contact,
    transactionDate: date, tags: [], priceIncludesTax: false, lines, seeded: true,
    createdAt: `${date}T10:15:00`, ...extra,
  })
  return [
    mk('deposit', 10002, '2026-08-12', 'CA003', 'PT Hungry Birds Indonesia', [
      { accountCode: '4-40000', description: 'Consulting fee — August retainer', taxId: 'TX001', amount: 25_000_000 },
    ], { referenceNo: 'RCV-0812', tags: ['retainer'] }),
    mk('deposit', 10001, '2026-07-30', 'CA001', 'Koperasi Karyawan Sejahtera Bersama Mandiri Jaya Abadi Indonesia Raya', [
      { accountCode: '7-70000', description: 'Interest income on employee cooperative savings placement for the second quarter of fiscal year 2026', taxId: '', amount: 1_250_000 },
      { accountCode: '7-70099', description: '', taxId: '', amount: 0 },
    ], { memo: 'Cash received at front desk' }),
    mk('withdrawal', 20002, '2026-08-11', 'CA003', 'PT Listrik Nusantara', [
      { accountCode: '2-20301', description: 'Electricity — July', taxId: 'TX001', amount: 4_500_000 },
    ], { referenceNo: 'PLN-0711', tags: ['utilities'] }),
    mk('withdrawal', 20001, '2026-07-25', 'CA002', '', [
      { accountCode: '6-60100', description: 'Office pantry supplies', taxId: '', amount: 750_000 },
    ]),
  ]
}

const KEY = 'cash-transactions-v1'
export const cashTransactions = reactive<CashTx[]>(loadSnapshot<CashTx>(KEY) ?? seed())
function persist(): void { saveSnapshot(KEY, cashTransactions) }

// ── Tax + totals ──────────────────────────────────────────────────────────────
/** Taxes offered on a line — single, non-withholding company taxes. */
export const CASH_TX_TAX_OPTIONS = companyTaxes
  .filter((t) => t.kind === 'single' && !t.isWithholding)
  .map((t) => ({ id: t.id, name: t.name }))

function taxRate(taxId: string): number {
  const t = companyTaxes.find((x) => x.id === taxId)
  return t ? effectiveRate(t) : 0
}

export interface CashTxTotals { subtotal: number; taxTotal: number; total: number }
export function cashTxTotals(lines: CashTxLine[], priceIncludesTax: boolean): CashTxTotals {
  let subtotal = 0
  let taxTotal = 0
  for (const l of lines) {
    const amt = Number(l.amount) || 0
    const r = taxRate(l.taxId) / 100
    if (priceIncludesTax && r > 0) {
      const net = amt / (1 + r)
      subtotal += net
      taxTotal += amt - net
    } else {
      subtotal += amt
      taxTotal += amt * r
    }
  }
  subtotal = Math.round(subtotal)
  taxTotal = Math.round(taxTotal)
  return { subtotal, taxTotal, total: subtotal + taxTotal }
}
export function cashTxTotal(tx: CashTx): number { return cashTxTotals(tx.lines, tx.priceIncludesTax).total }

export function taxName(taxId: string): string {
  return companyTaxes.find((t) => t.id === taxId)?.name ?? ''
}

/** Line accounts — the shared default chart of accounts. */
export const LINE_ACCOUNT_OPTIONS = MAPPING_COA.map((a) => ({ id: a.code, name: `${a.code} ${a.name}` }))
export function coaLabel(code: string): string {
  const a = MAPPING_COA.find((x) => x.code === code)
  return a ? `${a.code} ${a.name}` : code
}
export function cashAccountLabel(id: string): string {
  const a = cashAccounts.find((x) => x.id === id)
  return a ? `${a.code} ${a.name}` : id
}

// ── CRUD ──────────────────────────────────────────────────────────────────────
export function getCashTx(id: string): CashTx | undefined {
  return cashTransactions.find((t) => t.id === id)
}
export function cashTxOfKind(kind: CashTxKind): CashTx[] {
  return cashTransactions.filter((t) => t.kind === kind)
}
export function nextCashTxNumber(kind: CashTxKind): number {
  const base = kind === 'deposit' ? 10000 : 20000
  return Math.max(base, ...cashTxOfKind(kind).map((t) => t.number)) + 1
}

export type CashTxInput = Omit<CashTx, 'id' | 'number' | 'createdAt' | 'seeded' | 'recurring' | 'kind'>

export function addCashTx(kind: CashTxKind, input: CashTxInput): CashTx {
  const number = nextCashTxNumber(kind)
  const tx: CashTx = {
    ...input, kind, number,
    id: `${kind === 'deposit' ? 'bd' : 'bw'}-new-${number}`,
    createdAt: new Date().toISOString(),
  }
  cashTransactions.unshift(tx)
  persist()
  applyPostedBalances()
  return tx
}
export function updateCashTx(id: string, input: CashTxInput): CashTx | undefined {
  const tx = getCashTx(id)
  if (!tx) return undefined
  Object.assign(tx, input)
  persist()
  applyPostedBalances()
  return tx
}
export function deleteCashTx(id: string): void {
  const i = cashTransactions.findIndex((t) => t.id === id)
  if (i >= 0) { cashTransactions.splice(i, 1); persist(); applyPostedBalances() }
}
export function setCashTxRecurring(id: string, r: CashTxRecurring): void {
  const tx = getCashTx(id)
  if (tx) { tx.recurring = r; persist() }
}

// ── Balance posting ──────────────────────────────────────────────────────────
/** Seeded book balances, captured once so re-applying deltas is idempotent. */
const baseBalance = new Map<string, number>()
function base(id: string, current: number): number {
  if (!baseBalance.has(id)) baseBalance.set(id, current)
  return baseBalance.get(id)!
}

/** Net effect of user-created money movements on one cash account. */
export function postedDelta(accountId: string): number {
  let d = 0
  for (const tx of cashTransactions) {
    if (tx.seeded || tx.cashAccountId !== accountId) continue
    d += tx.kind === 'deposit' ? cashTxTotal(tx) : -cashTxTotal(tx)
  }
  for (const tr of internalTransfers) {
    if (!tr.id.startsWith('it-new-')) continue
    if (tr.fromAccountId === accountId) d -= tr.total
    for (const l of tr.lines) if (l.accountId === accountId) d += l.amount
  }
  return d
}

/** Seeded balance of an account (before user-posted movements). */
export function baseBookBalance(accountId: string): number {
  const a = cashAccounts.find((x) => x.id === accountId)
  return a ? base(a.id, a.bookBalance) : 0
}

/** Recompute every cash account's book balance = seed + posted movements. */
export function applyPostedBalances(): void {
  for (const a of cashAccounts) {
    const b = base(a.id, a.bookBalance)
    const d = postedDelta(a.id)
    a.bookBalance = b + d
  }
}

/** True when the user has posted any money movement on this account. */
export function hasPostedTx(accountId: string): boolean {
  return cashTransactions.some((t) => !t.seeded && t.cashAccountId === accountId)
    || internalTransfers.some((tr) => tr.id.startsWith('it-new-') && (tr.fromAccountId === accountId || tr.lines.some((l) => l.accountId === accountId)))
}

// Capture seed balances before anything is applied, then apply persisted posts.
for (const a of cashAccounts) base(a.id, a.bookBalance)
applyPostedBalances()
