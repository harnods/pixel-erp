/**
 * Cash management account detail — the Account transactions tab (book side) and
 * the Bank statement tab (bank feed) are BOTH derived from ONE shared ledger per
 * account, so the two tabs always reconcile:
 *
 *   • Account transactions = every document (newest `unreconciledCount` flagged
 *     unreconciled), running balance ending at the account's book balance.
 *   • Bank statement = the RECONCILED slice of that same ledger (the pending
 *     newest-N are book-only, not yet on the bank feed), rendered in bank-feed
 *     wording. Because they are the same events, each reconciled line's date,
 *     amount and running balance are IDENTICAL across both tabs — that's what
 *     "reconciled" means. Bank balance = book balance − (net of the pending
 *     transactions), which is exactly the Difference shown on the header.
 *
 * The company (PT Central Perk Indonesia) is a retail & wholesale coffee-bean
 * and coffee-machine business, so the contacts and documents are cafés/hotels
 * (customers), green-bean growers and espresso-machine distributors (suppliers),
 * plus the usual operating expenses.
 */

export type StatementStatus = 'reconciled' | 'unreconciled' | 'deleted'

export interface BankStatementLine {
  id: string
  date: string // ISO yyyy-mm-dd
  description: string
  moneyIn: number
  moneyOut: number
  balance: number
  status: StatementStatus
}

export interface AccountTransactionLine {
  id: string
  date: string // ISO yyyy-mm-dd
  type: string
  number: number
  contact: string
  moneyIn: number
  moneyOut: number
  balance: number
  status: 'reconciled' | 'unreconciled'
}

// ─── Seeded PRNG (deterministic per account — stable across re-renders) ───────

function seedFromString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  let s = seed
  return function random() {
    s |= 0
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rand: () => number, arr: T[]): T {
  return arr[Math.floor(rand() * arr.length)]!
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

// ─── Coffee-business contacts ────────────────────────────────────────────────

/** Cafés, hotels & restaurants that buy roasted beans (wholesale) and machines. */
const CUSTOMERS = [
  'Anomali Coffee', 'Tanamera Coffee', 'Fore Coffee', 'Kopi Kenangan', 'Djournal Coffee',
  'Common Grounds', 'Titik Temu Coffee', 'Maxx Coffee', 'Janji Jiwa', 'Tuku Coffee',
  'Excelso Café', 'Filosofi Kopi', 'Kopi Nako', 'Warung Kopi Modern', 'Hotel Mulia Senayan',
  'The Ritz-Carlton Jakarta', 'Grand Hyatt Jakarta', 'Hotel Indonesia Kempinski',
  'Ismaya Group', 'Union Group',
]
/** Green-bean growers, cooperatives and importers. */
const BEAN_SUPPLIERS = [
  'Koperasi Kopi Gayo Aceh', 'Toraja Coffee Growers', 'Kintamani Coffee Estate',
  'PT Java Arabica Export', 'Frinsa Estate Bandung', 'Sumatra Mandheling Beans',
  'Flores Bajawa Coop', 'PT Sulawesi Specialty Coffee',
]
/** Espresso-machine & grinder distributors and roastery equipment. */
const MACHINE_SUPPLIERS = [
  'La Marzocco Indonesia', 'PT Mahakarya Espresso', 'Victoria Arduino Distributor',
  'Nuova Simonelli Asia', 'Mahlkönig Indonesia', 'PT Selni Coffee Equipment',
]
/** Packaging & roastery consumables. */
const SUPPLY_VENDORS = [
  'PT Kemasan Kopi Nusantara', 'CV Roastery Supplies', 'PT Filter Kertas Indonesia',
  'Barista Tools Supply',
]
/** Operating-expense payees. */
const OPEX_VENDORS = [
  'PLN (Listrik)', 'Telkom Indonesia (IndiHome)', 'PDAM (Air)', 'Gedung Sewa Kantor',
  'JNE Trucking', 'SiCepat Kargo', 'Mekari Jurnal', 'Google Workspace',
]

const COST_SUPPLIERS = [...BEAN_SUPPLIERS, ...MACHINE_SUPPLIERS, ...SUPPLY_VENDORS]

/** UPPER-cased, parenthetical stripped — bank feeds print names like this. */
function bankName(c: string): string {
  return c.replace(/\s*\(.*\)\s*/, ' ').trim().toUpperCase()
}

// ─── Ledger event types ──────────────────────────────────────────────────────

interface TypeDef {
  type: string
  dir: 'in' | 'out'
  family: 'sales' | 'cost'
  pool: string[]
  weight: number
  /** Bank-feed description for this event. */
  bank: (c: string) => string
  /** Amount band as a multiple of the account's "unit" (see buildLedger). */
  band: [number, number]
}

const TYPES: TypeDef[] = [
  { type: 'Sales Invoice',   dir: 'in',  family: 'sales', pool: CUSTOMERS,       weight: 5, band: [0.4, 1.6], bank: c => `TRF CR ${bankName(c)}` },
  { type: 'Receive Payment', dir: 'in',  family: 'sales', pool: CUSTOMERS,       weight: 5, band: [0.3, 1.2], bank: c => `QRIS SETTLEMENT ${bankName(c)}` },
  { type: 'Bill Payment',    dir: 'out', family: 'cost',  pool: COST_SUPPLIERS,  weight: 4, band: [0.4, 1.3], bank: c => `TRF DB ${bankName(c)}` },
  { type: 'Expense',         dir: 'out', family: 'cost',  pool: OPEX_VENDORS,    weight: 3, band: [0.05, 0.4], bank: c => `AUTO DEBIT ${bankName(c)}` },
  { type: 'Sales Return',    dir: 'out', family: 'sales', pool: CUSTOMERS,       weight: 1, band: [0.05, 0.3], bank: c => `TRF DB ${bankName(c)} REFUND` },
  { type: 'Credit Memo',     dir: 'in',  family: 'sales', pool: CUSTOMERS,       weight: 1, band: [0.05, 0.3], bank: c => `TRF CR ${bankName(c)} ADJ` },
]
// Petty cash = small everyday spend (parking, electricity token, drinking water,
// office supplies) and employee reimbursements, topped up from the bank.
const PETTY_EXPENSES = [
  'Parkir Kantor', 'Token Listrik', 'Air Galon', 'ATK Kantor', 'Konsumsi Rapat',
  'Bensin Operasional', 'Pulsa & Kuota', 'Fotokopi & Materai', 'Ojek Online Kurir', 'Snack Karyawan',
]
const PETTY_REIMBURSE = [
  'Reimburse — Budi Santoso', 'Reimburse — Susi Wijaya', 'Reimburse — Andi Pratama',
  'Reimburse — Dewi Lestari', 'Reimburse — Joni',
]
const PETTY_TOPUP = ['Top-up dari Bank BCA', 'Setoran Kas Kecil']

const PETTY_TYPES: TypeDef[] = [
  { type: 'Expense',           dir: 'out', family: 'cost',  pool: PETTY_EXPENSES,  weight: 6, band: [0.05, 0.6], bank: c => `CASH OUT ${bankName(c)}` },
  { type: 'Reimbursement',     dir: 'out', family: 'cost',  pool: PETTY_REIMBURSE, weight: 3, band: [0.2, 1.0],  bank: c => `CASH OUT ${bankName(c)}` },
  { type: 'Petty Cash Top-up', dir: 'in',  family: 'sales', pool: PETTY_TOPUP,     weight: 2, band: [1.5, 3.0],  bank: c => `CASH IN ${bankName(c)}` },
]

function pickType(rand: () => number, forceOut: boolean, types: TypeDef[]): TypeDef {
  const pool = forceOut ? types.filter(t => t.dir === 'out') : types
  const total = pool.reduce((s, t) => s + t.weight, 0)
  let r = rand() * total
  for (const t of pool) { r -= t.weight; if (r <= 0) return t }
  return pool[pool.length - 1]!
}

interface LedgerEvent {
  date: string
  type: string
  number: number
  contact: string
  dir: 'in' | 'out'
  amount: number
  bank: (c: string) => string
}

const ROWS = 60
const SALES_START = 26025
const COST_START = 90056

/** One shared ledger per account, newest → oldest. Directions are chosen so the
 *  running balance (anchored at `anchor` = the book balance) never goes negative
 *  for asset accounts; credit-card accounts (negative anchor) are allowed to. */
function buildLedger(accountId: string, anchor: number, kind: 'bank' | 'petty' = 'bank'): LedgerEvent[] {
  const rand = mulberry32(seedFromString(`${accountId}-ledger-v2`))
  const petty = kind === 'petty'
  const types = petty ? PETTY_TYPES : TYPES
  const allowNeg = anchor < 0
  const mag = Math.abs(anchor) || 5_000_000
  // Petty cash uses a small fixed unit (float stays ~constant); bank accounts scale to size.
  const unit = petty ? 300_000 : Math.min(30_000_000, Math.max(50_000, mag / 15), mag / 3)
  // Rounding granularity scales with the account size, so small-balance / FX
  // accounts get proportionate amounts instead of a coarse 50k floor.
  const gran = petty ? 5_000 : Math.max(1_000, Math.min(50_000, Math.round(unit / 20 / 1_000) * 1_000))

  const events: LedgerEvent[] = []
  let date = '2026-01-20'
  let balance = anchor
  let salesSeq = SALES_START
  let costSeq = COST_START

  for (let i = 0; i < ROWS; i++) {
    date = addDays(date, -(1 + Math.floor(rand() * 2)))
    const forceOut = !allowNeg && balance < unit * 2
    const def = pickType(rand, forceOut, types)
    const [lo, hi] = def.band
    let amount = (lo + rand() * (hi - lo)) * unit
    // Keep the older balance ≥ ~unit for asset accounts.
    if (def.dir === 'in' && !allowNeg) amount = Math.min(amount, balance - unit)
    amount = Math.max(gran, Math.round(amount / gran) * gran)
    const number = def.family === 'sales' ? --salesSeq : --costSeq
    events.push({ date, type: def.type, number, contact: pick(rand, def.pool), dir: def.dir, amount, bank: def.bank })
    balance = balance - (def.dir === 'in' ? amount : 0) + (def.dir === 'out' ? amount : 0)
  }
  return events
}

// ─── Account transactions tab (book side) ────────────────────────────────────

export function getAccountTransactions(accountId: string, bookBalance: number, unreconciledCount = 6, kind: 'bank' | 'petty' = 'bank'): AccountTransactionLine[] {
  const events = buildLedger(accountId, bookBalance, kind)
  let balance = bookBalance
  return events.map((e, i) => {
    const moneyIn = e.dir === 'in' ? e.amount : 0
    const moneyOut = e.dir === 'out' ? e.amount : 0
    const row: AccountTransactionLine = {
      id: `${accountId}-tx-${i}`,
      date: e.date, type: e.type, number: e.number, contact: e.contact,
      moneyIn, moneyOut, balance,
      status: i < unreconciledCount ? 'unreconciled' : 'reconciled',
    }
    balance = balance - moneyIn + moneyOut
    return row
  })
}

// ─── Bank statement tab (bank feed) ──────────────────────────────────────────
// Same ledger, same running balance — but only the RECONCILED slice (the newest
// `unreconciledCount` are book-only, still pending on the bank feed). Two older
// lines are shown deleted to exercise the "Hide deleted lines" toggle.

const importedLines: Record<string, BankStatementLine[]> = {}

/** Adds freshly-reviewed OCR rows to the front of an account's statement. */
export function addImportedStatementLines(accountId: string, lines: BankStatementLine[]) {
  importedLines[accountId] = [...lines, ...(importedLines[accountId] ?? [])]
}

export function getBankStatementLines(accountId: string, bookBalance: number, unreconciledCount = 6): BankStatementLine[] {
  const events = buildLedger(accountId, bookBalance)
  // Walk the full series to capture each event's book balance…
  let balance = bookBalance
  const withBalance = events.map((e) => {
    const b = balance
    balance = balance - (e.dir === 'in' ? e.amount : 0) + (e.dir === 'out' ? e.amount : 0)
    return { e, balance: b }
  })
  // …then keep only the reconciled (cleared) slice, in bank-feed wording.
  const generated: BankStatementLine[] = withBalance.slice(unreconciledCount).map(({ e, balance: b }, k) => ({
    id: `${accountId}-stmt-${k}`,
    date: e.date,
    description: e.bank(e.contact),
    moneyIn: e.dir === 'in' ? e.amount : 0,
    moneyOut: e.dir === 'out' ? e.amount : 0,
    balance: b,
    status: (k === 4 || k === 13) ? 'deleted' : 'reconciled',
  }))
  return [...(importedLines[accountId] ?? []), ...generated]
}
