/**
 * Cash management account detail — dummy bank statement lines (Bank statement tab)
 * and book-side transaction lines (Account transactions tab).
 *
 * Bank BCA (CA003) ships with the exact first page of lines used in the Figma
 * reference design so the detail page matches it pixel-for-pixel; everything
 * beyond that (older BCA history + every other account) is generated with a
 * seeded PRNG so it's stable across renders but doesn't need to be hand-authored.
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

// ─── BCA — exact first page (matches the Figma reference design) ─────────────

const BCA_RECENT: Omit<BankStatementLine, 'id'>[] = [
  { date: '2026-01-20', description: 'TRF CR LLG PT KOPI KENANGAN BERKAH', moneyIn: 15_500_000, moneyOut: 0,          balance: 155_000_000, status: 'unreconciled' },
  { date: '2026-01-19', description: 'AUTO DEBIT TELKOM INDONESIA WIFI',   moneyIn: 0,          moneyOut: 2_500_000,  balance: 139_500_000, status: 'unreconciled' },
  { date: '2026-01-18', description: 'TRF CR RTGS CV MESIN BARISTA UTAMA', moneyIn: 50_000_000, moneyOut: 0,          balance: 142_000_000, status: 'unreconciled' },
  { date: '2026-01-18', description: 'PAY PLN PREPAID 3210009283',        moneyIn: 0,          moneyOut: 12_500_000, balance: 92_000_000,  status: 'unreconciled' },
  { date: '2026-01-17', description: 'TRF E-BANKING IBU SUSI (TOKO KUE)', moneyIn: 8_250_000,  moneyOut: 0,          balance: 104_500_000, status: 'unreconciled' },
  { date: '2026-01-16', description: 'TRF DB BUDI SANTOSO REFUND',        moneyIn: 0,          moneyOut: 1_250_000,  balance: 96_250_000,  status: 'unreconciled' },
  { date: '2026-01-15', description: 'CASH DEP CDM DEPOK BRANCH',         moneyIn: 4_500_000,  moneyOut: 0,          balance: 97_500_000,  status: 'reconciled' },
  { date: '2026-01-15', description: 'ADM FEE MTHLY JAN 2026',            moneyIn: 0,          moneyOut: 25_000,     balance: 93_000_000,  status: 'reconciled' },
  { date: '2026-01-14', description: 'TRF DB PETTY CASH REPLENISH',       moneyIn: 0,          moneyOut: 5_000_000,  balance: 93_025_000,  status: 'reconciled' },
  { date: '2026-01-13', description: 'TRF CR PT SINAR MAS DISTRIBUSI',    moneyIn: 25_000_000, moneyOut: 0,          balance: 98_025_000,  status: 'reconciled' },
  { date: '2026-01-12', description: 'VS *GOOGLE CLOUD SVCS',             moneyIn: 0,          moneyOut: 1_800_000,  balance: 73_025_000,  status: 'reconciled' },
  { date: '2026-01-11', description: 'TRF CR CAFE SENJA ABADI',           moneyIn: 12_000_000, moneyOut: 0,          balance: 74_825_000,  status: 'reconciled' },
  { date: '2026-01-10', description: 'TRF CR HOTEL INDONESIA GROUP',      moneyIn: 35_000_000, moneyOut: 0,          balance: 62_825_000,  status: 'reconciled' },
  { date: '2026-01-09', description: 'DB ATK OFFICE SUPPLIES',            moneyIn: 0,          moneyOut: 750_000,    balance: 27_825_000,  status: 'reconciled' },
  { date: '2026-01-08', description: 'TRF CR LLG PT KOPI KENANGAN BERKAH', moneyIn: 10_000_000, moneyOut: 0,         balance: 28_575_000,  status: 'reconciled' },
  { date: '2026-01-07', description: 'REVERSAL TRF E-BANKING',            moneyIn: 2_000_000,  moneyOut: 0,          balance: 18_575_000,  status: 'reconciled' },
  { date: '2026-01-06', description: 'TRF DB RIZAL CANDRA PRIVE',         moneyIn: 0,          moneyOut: 10_000_000, balance: 16_575_000,  status: 'reconciled' },
  { date: '2026-01-05', description: 'TRF CR WARUNG UPNORMAL',            moneyIn: 5_500_000,  moneyOut: 0,          balance: 26_575_000,  status: 'reconciled' },
  { date: '2026-01-05', description: 'VS *ADOBE CREATIVE DUB',            moneyIn: 0,          moneyOut: 850_000,    balance: 21_075_000,  status: 'reconciled' },
  { date: '2026-01-04', description: 'CASH DEP SETORAN TUNAI',            moneyIn: 8_000_000,  moneyOut: 0,          balance: 21_925_000,  status: 'reconciled' },
  { date: '2026-01-03', description: 'QRIS SETTLEMENT PARKIR',            moneyIn: 0,          moneyOut: 200_000,    balance: 13_925_000,  status: 'reconciled' },
  { date: '2026-01-03', description: 'TRF CR JONI KARYAWAN',              moneyIn: 1_500_000,  moneyOut: 0,          balance: 14_125_000,  status: 'reconciled' },
  { date: '2026-01-02', description: 'TRF CR CV MAJU MUNDUR',             moneyIn: 7_000_000,  moneyOut: 0,          balance: 12_625_000,  status: 'reconciled' },
  { date: '2026-01-01', description: 'TRF DB PEMILIK GEDUNG SEWA JAN',    moneyIn: 0,          moneyOut: 15_000_000, balance: 5_625_000,   status: 'reconciled' },
  { date: '2026-01-01', description: 'SALDO AWAL TAHUN 2026',             moneyIn: 20_625_000, moneyOut: 0,          balance: 20_625_000,  status: 'reconciled' },
]

// Two of the older, already-reconciled rows are shown as deleted (demonstrates
// the "Hide deleted lines" toggle) — picked from mid-page so both pages 2-3 have one.
const DELETED_INDICES = new Set([34, 61])

// ─── Generic templates for generated (non-hand-authored) rows ─────────────────

const CREDIT_TEMPLATES = [
  'TRF CR LLG {co}', 'TRF CR RTGS {co}', 'TRF CR {co}', 'CASH DEP CDM {branch} BRANCH',
  'CASH DEP SETORAN TUNAI', 'QRIS SETTLEMENT {co}', 'TRF E-BANKING {co}', 'REVERSAL TRF E-BANKING',
]
const DEBIT_TEMPLATES = [
  'AUTO DEBIT {utility}', 'PAY {utility} PREPAID {code}', 'ADM FEE MTHLY {monthYear}',
  'VS *{vendor}', 'DB ATK OFFICE SUPPLIES', 'QRIS SETTLEMENT PARKIR', 'TRF DB {payee}',
]
const COMPANIES = [
  'PT KOPI KENANGAN BERKAH', 'CV MESIN BARISTA UTAMA', 'PT SINAR MAS DISTRIBUSI', 'CAFE SENJA ABADI',
  'HOTEL INDONESIA GROUP', 'WARUNG UPNORMAL', 'CV MAJU MUNDUR', 'PT BINTANG TIMUR LOGISTIK',
  'TOKO KUE IBU SUSI', 'PT NUSANTARA JAYA ABADI', 'CV SUMBER REZEKI',
]
const BRANCHES = ['DEPOK', 'BEKASI', 'TANGERANG', 'BANDUNG', 'SURABAYA']
const UTILITIES = ['TELKOM INDONESIA WIFI', 'PLN PREPAID', 'PDAM TIRTA', 'INDIHOME']
const VENDORS = ['GOOGLE CLOUD SVCS', 'ADOBE CREATIVE DUB', 'AWS SVCS', 'MICROSOFT 365', 'ZOOM VIDEO']
const PAYEES = ['RIZAL CANDRA PRIVE', 'PEMILIK GEDUNG SEWA', 'BUDI SANTOSO REFUND', 'JONI KARYAWAN']

function fillTemplate(rand: () => number, tpl: string, monthYear: string): string {
  return tpl
    .replace('{co}', pick(rand, COMPANIES))
    .replace('{branch}', pick(rand, BRANCHES))
    .replace('{utility}', pick(rand, UTILITIES))
    .replace('{code}', String(1_000_000 + Math.floor(rand() * 8_999_999)))
    .replace('{monthYear}', monthYear)
    .replace('{vendor}', pick(rand, VENDORS))
    .replace('{payee}', pick(rand, PAYEES))
}

function monthYearLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(new Date(iso)).toUpperCase()
}

/** Generates `count` older rows walking BACKWARD in time from (but not including)
 *  `beforeDate`, starting at `startBalance`. Returned oldest → newest. */
function genOlderLines(accountId: string, count: number, beforeDate: string, startBalance: number): Omit<BankStatementLine, 'id'>[] {
  const rand = mulberry32(seedFromString(`${accountId}-statement`))
  const rows: Omit<BankStatementLine, 'id'>[] = []
  let date = beforeDate
  let balance = startBalance
  for (let i = 0; i < count; i++) {
    date = addDays(date, -(1 + Math.floor(rand() * 3)))
    const isCredit = rand() > 0.45
    const amount = Math.round((isCredit ? 500_000 + rand() * 30_000_000 : 50_000 + rand() * 8_000_000) / 5_000) * 5_000
    const moneyIn = isCredit ? amount : 0
    const moneyOut = isCredit ? 0 : amount
    const prevBalance = balance - moneyIn + moneyOut
    const description = fillTemplate(rand, pick(rand, isCredit ? CREDIT_TEMPLATES : DEBIT_TEMPLATES), monthYearLabel(date))
    rows.push({ date, description, moneyIn, moneyOut, balance, status: 'reconciled' })
    balance = prevBalance
  }
  return rows.reverse() // oldest → newest
}

/** Full generic statement for accounts other than BCA — most recent `unreconciledCount`
 *  rows are left unreconciled, everything older is reconciled. Newest → oldest. */
function genGenericStatement(accountId: string, endBalance: number, unreconciledCount: number, rowCount: number, latestDate: string): Omit<BankStatementLine, 'id'>[] {
  const rand = mulberry32(seedFromString(`${accountId}-generic`))
  const rows: Omit<BankStatementLine, 'id'>[] = []
  let date = addDays(latestDate, 1)
  let balance = endBalance
  for (let i = 0; i < rowCount; i++) {
    date = addDays(date, -(1 + Math.floor(rand() * 4)))
    const isCredit = rand() > 0.5
    const amount = Math.round((isCredit ? 500_000 + rand() * 20_000_000 : 50_000 + rand() * 5_000_000) / 5_000) * 5_000
    const moneyIn = isCredit ? amount : 0
    const moneyOut = isCredit ? 0 : amount
    const description = fillTemplate(rand, pick(rand, isCredit ? CREDIT_TEMPLATES : DEBIT_TEMPLATES), monthYearLabel(date))
    rows.push({ date, description, moneyIn, moneyOut, balance, status: i < unreconciledCount ? 'unreconciled' : 'reconciled' })
    balance = balance - moneyIn + moneyOut
  }
  return rows
}

// ─── Lines imported through the "Import with OCR" review flow ────────────────
// Kept apart from the generated/hardcoded rows above so a save from
// BankStatementReviewPage can just prepend onto this per-account list without
// touching the deterministic generator.
const importedLines: Record<string, BankStatementLine[]> = {}

/** Adds freshly-reviewed OCR rows to the front of an account's statement (most
 *  recent first, matching how the tab already sorts). Called from the bank
 *  statement review page's Save action. */
export function addImportedStatementLines(accountId: string, lines: BankStatementLine[]) {
  importedLines[accountId] = [...lines, ...(importedLines[accountId] ?? [])]
}

export function getBankStatementLines(accountId: string, endBalance: number, unreconciledCount: number): BankStatementLine[] {
  const raw: Omit<BankStatementLine, 'id'>[] =
    accountId === 'CA003'
      ? [...BCA_RECENT, ...genOlderLines(accountId, 75, '2026-01-01', 0)]
      : genGenericStatement(accountId, endBalance, unreconciledCount, Math.max(unreconciledCount + 12, 20), '2026-01-20')

  const generated = raw.map((r, i) => ({
    ...r,
    id: `${accountId}-stmt-${i}`,
    status: DELETED_INDICES.has(i) && accountId === 'CA003' ? 'deleted' : r.status,
  }))

  return [...(importedLines[accountId] ?? []), ...generated]
}

// ─── Account transactions tab (book side — actual software documents, not the
//     raw bank feed: sales invoices, payments, expenses, credit memos, etc.) ──

const TX_CUSTOMERS = [
  'Anomali Coffee', 'Tanamera Coffee Roastery', 'Hotel Mulia Senayan', 'Fore Coffee Thamrin',
  'Djournal Coffee', 'Kopi Kenangan Pusat', 'Common Grounds PIK', 'Titik Temu Coffee',
  'Maxx Coffee Lippo Mall', 'Janji Jiwa Kemang', 'Tuku Coffee Cipete', 'Coffee Cult Bali',
  'Excelso Grand Indonesia', 'Warung Kopi Modern', 'Kopi Nako Bintaro', 'Filosofi Kopi Melawai',
]
const TX_EXPENSE_CONTACTS = [
  'Telkom Indonesia (Indihome)', 'PLN (Listrik)', 'PDAM (Air)', 'CV Abadi Jaya Teknik',
  'PT Sumber Makmur Sejahtera', 'PT Karya Cipta Mandiri', 'Adobe Creative Cloud', 'Google Cloud Services',
]
const TX_PERSON_NAMES = ['Budi Santoso', 'Rizal Candra', 'Joni Karyawan', 'Susi Wijaya']

const TX_TYPE_DEFS: { type: string; direction: 'in' | 'out'; contacts: string[] }[] = [
  { type: 'Sales Invoice',       direction: 'in',  contacts: TX_CUSTOMERS },
  { type: 'Receive Payment',     direction: 'in',  contacts: TX_CUSTOMERS },
  { type: 'Expense',             direction: 'out', contacts: TX_EXPENSE_CONTACTS },
  { type: 'Sales Return',        direction: 'out', contacts: [...TX_CUSTOMERS, ...TX_PERSON_NAMES] },
  { type: 'Credit Memo',         direction: 'in',  contacts: TX_CUSTOMERS },
  { type: 'Credit Memo Payment', direction: 'out', contacts: TX_CUSTOMERS },
  { type: 'Credit Memo Refund',  direction: 'in',  contacts: TX_CUSTOMERS },
]

export function getAccountTransactions(accountId: string, endBalance: number, unreconciledCount = 6, rowCount = 24): AccountTransactionLine[] {
  const rand = mulberry32(seedFromString(`${accountId}-transactions`))
  const rows: AccountTransactionLine[] = []
  let date = '2026-01-20'
  let balance = endBalance
  let sharedSeq = 26025   // Sales Invoice / Receive Payment / Sales Return / Credit Memo*
  let expenseSeq = 90056  // Expense

  for (let i = 0; i < rowCount; i++) {
    date = addDays(date, -(1 + Math.floor(rand() * 2)))
    const def = pick(rand, TX_TYPE_DEFS)
    const isIn = def.direction === 'in'
    let amount = Math.round((isIn ? 1_000_000 + rand() * 30_000_000 : 500_000 + rand() * 15_000_000) / 5_000) * 5_000
    // Undoing an "in" row lowers the OLDER balance (balance - moneyIn) — cap it so
    // walking further back in time never drives the running balance negative.
    if (isIn) amount = Math.min(amount, Math.max(200_000, balance - 300_000))
    const moneyIn = isIn ? amount : 0
    const moneyOut = isIn ? 0 : amount
    const contact = pick(rand, def.contacts)
    const number = def.type === 'Expense' ? --expenseSeq : --sharedSeq
    rows.push({
      id: `${accountId}-tx-${i}`,
      date, type: def.type, number, contact, moneyIn, moneyOut, balance,
      status: i < unreconciledCount ? 'unreconciled' : 'reconciled',
    })
    balance = balance - moneyIn + moneyOut
  }
  return rows
}
