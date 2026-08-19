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
  /** Which numbering sequence this document draws from. */
  family: 'sales' | 'cost' | 'transfer'
  pool: string[]
  weight: number
  /** Bank-feed description for this event. */
  bank: (c: string) => string
  /** Amount band as a multiple of the account's "unit" (see buildLedger). */
  band: [number, number]
}

/** Each cash account plays a different role, so its ledger draws from a different
 *  mix of documents/contacts — a credit card only spends, an FX account settles
 *  overseas import/export, a utilities sub-account only pays bills, etc. */
export type LedgerProfile =
  | 'operating' | 'card' | 'fx' | 'payroll' | 'utilities'
  | 'logistics' | 'finance' | 'retailcash' | 'petty'

// ── Profile-specific contact pools ──────────────────────────────────────────
/** Credit-card merchants (software, ads, travel, fuel, marketplaces). */
const CARD_VENDORS = [
  'Google Workspace', 'Adobe Creative Cloud', 'Amazon Web Services', 'Figma', 'Microsoft 365',
  'Meta Ads', 'Google Ads', 'TikTok Ads', 'Garuda Indonesia', 'Traveloka', 'Grab',
  'Pertamina', 'Shell Indonesia', 'Tokopedia', 'Blibli', 'Canva Pro',
]
/** Overseas green-bean & machine suppliers (FX / import account). */
const FX_SUPPLIERS = [
  'La Marzocco S.p.A.', 'Nuova Simonelli S.p.A.', 'Mahlkönig GmbH', 'Probat GmbH',
  'Yirgacheffe Coffee Union', 'FNC Colombia', 'Santos Coffee Exporters', 'Vietnam Robusta Trading',
]
/** Overseas wholesale buyers (FX / export account). */
const FX_CUSTOMERS = ['Singapore Roasters Pte Ltd', 'Australia Coffee Co', 'Kopi Malaysia Sdn Bhd', 'HK Cafe Group']
const PAYROLL_PAYEES = [
  'Payroll — Agung Setiawarman', 'Payroll — Cinta Ayu', 'Payroll — Bayu Ferdian',
  'Payroll — Dewi Lestari', 'Payroll — Eka Setiawan', 'Payroll — Fajar Nugraha',
]
const UTILITY_PAYEES = ['PLN (Listrik)', 'PDAM (Air)', 'Telkom (IndiHome)', 'PGN (Gas)', 'IndiHome Bisnis']
const LOGISTICS_PAYEES = ['JNE Trucking', 'SiCepat Kargo', 'J&T Cargo', 'Pertamina (BBM)', 'Bengkel Kendaraan Operasional']
const FINANCE_PAYEES = ['Pajak PPN', 'Pajak PPh Badan', 'Angsuran Kredit Investasi', 'Provisi Kredit']
const RETAIL = ['Penjualan Retail Toko', 'QRIS Retail Toko', 'Walk-in Customer']
const FUND_SOURCE = ['Transfer dari Bank BCA']

// Petty cash = small everyday spend + employee reimbursements, topped up from the bank.
const PETTY_EXPENSES = [
  'Parkir Kantor', 'Token Listrik', 'Air Galon', 'ATK Kantor', 'Konsumsi Rapat',
  'Bensin Operasional', 'Pulsa & Kuota', 'Fotokopi & Materai', 'Ojek Online Kurir', 'Snack Karyawan',
]
const PETTY_REIMBURSE = [
  'Reimburse — Budi Santoso', 'Reimburse — Susi Wijaya', 'Reimburse — Andi Pratama',
  'Reimburse — Dewi Lestari', 'Reimburse — Joni',
]
const PETTY_TOPUP = ['Top-up dari Bank BCA', 'Setoran Kas Kecil']

// ── One document mix per account role ────────────────────────────────────────
const PROFILES: Record<LedgerProfile, TypeDef[]> = {
  // Main operating account — domestic sales receipts + supplier/opex payments.
  operating: [
    { type: 'Sales Invoice',   dir: 'in',  family: 'sales', pool: CUSTOMERS,      weight: 5, band: [0.4, 1.6],  bank: c => `TRF CR ${bankName(c)}` },
    { type: 'Receive Payment', dir: 'in',  family: 'sales', pool: CUSTOMERS,      weight: 5, band: [0.3, 1.2],  bank: c => `QRIS SETTLEMENT ${bankName(c)}` },
    { type: 'Bill Payment',    dir: 'out', family: 'cost',  pool: COST_SUPPLIERS, weight: 4, band: [0.4, 1.3],  bank: c => `TRF DB ${bankName(c)}` },
    { type: 'Expense',         dir: 'out', family: 'cost',  pool: OPEX_VENDORS,   weight: 3, band: [0.05, 0.4], bank: c => `AUTO DEBIT ${bankName(c)}` },
    { type: 'Sales Return',    dir: 'out', family: 'sales', pool: CUSTOMERS,      weight: 1, band: [0.05, 0.3], bank: c => `TRF DB ${bankName(c)} REFUND` },
    { type: 'Credit Memo',     dir: 'in',  family: 'sales', pool: CUSTOMERS,      weight: 1, band: [0.05, 0.3], bank: c => `TRF CR ${bankName(c)} ADJ` },
  ],
  // Corporate card — only spending, plus the monthly card payment from the bank.
  card: [
    { type: 'Expense',      dir: 'out', family: 'cost',     pool: CARD_VENDORS,        weight: 8, band: [0.05, 0.5], bank: c => `CARD PURCHASE ${bankName(c)}` },
    { type: 'Card Payment', dir: 'in',  family: 'transfer', pool: ['Pembayaran Kartu'], weight: 2, band: [1.0, 2.5],  bank: () => 'PAYMENT - THANK YOU' },
  ],
  // FX / import-export — outward TT to overseas suppliers, inward TT from buyers.
  fx: [
    { type: 'Bill Payment',    dir: 'out', family: 'cost',  pool: FX_SUPPLIERS,             weight: 6, band: [0.4, 1.4],  bank: c => `OUTWARD TT ${bankName(c)}` },
    { type: 'Receive Payment', dir: 'in',  family: 'sales', pool: FX_CUSTOMERS,             weight: 3, band: [0.4, 1.3],  bank: c => `INWARD TT ${bankName(c)}` },
    { type: 'Expense',         dir: 'out', family: 'cost',  pool: ['Bank Charges', 'Selisih Kurs'], weight: 1, band: [0.02, 0.1], bank: c => `DB ${bankName(c)}` },
  ],
  // Payroll account — salaries + tax/BPJS, funded from the operating account.
  payroll: [
    { type: 'Payroll',           dir: 'out', family: 'cost',     pool: PAYROLL_PAYEES, weight: 6, band: [0.4, 1.2], bank: c => `TRF DB ${bankName(c)}` },
    { type: 'Tax & BPJS',        dir: 'out', family: 'cost',     pool: ['PPh 21 Karyawan', 'BPJS Ketenagakerjaan', 'BPJS Kesehatan'], weight: 2, band: [0.1, 0.5], bank: c => `TRF DB ${bankName(c)}` },
    { type: 'Internal Transfer', dir: 'in',  family: 'transfer', pool: FUND_SOURCE,    weight: 2, band: [1.5, 3.0], bank: c => `TRF CR ${bankName(c)}` },
  ],
  utilities: [
    { type: 'Expense',           dir: 'out', family: 'cost',     pool: UTILITY_PAYEES, weight: 7, band: [0.1, 0.8], bank: c => `AUTO DEBIT ${bankName(c)}` },
    { type: 'Internal Transfer', dir: 'in',  family: 'transfer', pool: FUND_SOURCE,    weight: 2, band: [1.5, 3.0], bank: c => `TRF CR ${bankName(c)}` },
  ],
  logistics: [
    { type: 'Expense',           dir: 'out', family: 'cost',     pool: LOGISTICS_PAYEES, weight: 7, band: [0.1, 0.9], bank: c => `TRF DB ${bankName(c)}` },
    { type: 'Internal Transfer', dir: 'in',  family: 'transfer', pool: FUND_SOURCE,      weight: 2, band: [1.5, 3.0], bank: c => `TRF CR ${bankName(c)}` },
  ],
  finance: [
    { type: 'Tax Payment',   dir: 'out', family: 'cost',  pool: FINANCE_PAYEES,                weight: 5, band: [0.3, 1.2],  bank: c => `TRF DB ${bankName(c)}` },
    { type: 'Bank Charge',   dir: 'out', family: 'cost',  pool: ['Biaya Admin Bank', 'Materai'], weight: 2, band: [0.02, 0.1], bank: c => `DB ${bankName(c)}` },
    { type: 'Bank Interest', dir: 'in',  family: 'sales', pool: ['Bunga Bank'],                weight: 1, band: [0.02, 0.08], bank: () => 'CR BUNGA BANK' },
  ],
  // Physical cash at the store — small retail sales + small operational spend / bank deposits.
  retailcash: [
    { type: 'Cash Sale', dir: 'in',  family: 'sales', pool: RETAIL,                                 weight: 7, band: [0.1, 0.7], bank: c => `CASH SALE ${bankName(c)}` },
    { type: 'Expense',   dir: 'out', family: 'cost',  pool: ['Belanja Operasional', 'Setoran ke Bank BCA'], weight: 3, band: [0.1, 0.6], bank: c => `CASH OUT ${bankName(c)}` },
  ],
  petty: [
    { type: 'Expense',           dir: 'out', family: 'cost',     pool: PETTY_EXPENSES,  weight: 6, band: [0.05, 0.6], bank: c => `CASH OUT ${bankName(c)}` },
    { type: 'Reimbursement',     dir: 'out', family: 'cost',     pool: PETTY_REIMBURSE, weight: 3, band: [0.2, 1.0],  bank: c => `CASH OUT ${bankName(c)}` },
    { type: 'Petty Cash Top-up', dir: 'in',  family: 'transfer', pool: PETTY_TOPUP,     weight: 2, band: [1.5, 3.0],  bank: c => `CASH IN ${bankName(c)}` },
  ],
}

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
const TRANSFER_START = 3025

/** One shared ledger per account, newest → oldest, drawn from the account's
 *  `profile` document mix. Directions are chosen so the running balance (anchored
 *  at `anchor` = the book balance) never goes negative for asset accounts;
 *  credit-card accounts (negative anchor) are allowed to. */
function buildLedger(accountId: string, anchor: number, profile: LedgerProfile = 'operating'): LedgerEvent[] {
  const rand = mulberry32(seedFromString(`${accountId}-ledger-v3`))
  const petty = profile === 'petty'
  const types = PROFILES[profile]
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
  let transferSeq = TRANSFER_START

  for (let i = 0; i < ROWS; i++) {
    date = addDays(date, -(1 + Math.floor(rand() * 2)))
    const forceOut = !allowNeg && balance < unit * 2
    const def = pickType(rand, forceOut, types)
    const [lo, hi] = def.band
    let amount = (lo + rand() * (hi - lo)) * unit
    // Keep the older balance ≥ ~unit for asset accounts.
    if (def.dir === 'in' && !allowNeg) amount = Math.min(amount, balance - unit)
    amount = Math.max(gran, Math.round(amount / gran) * gran)
    const number = def.family === 'sales' ? --salesSeq : def.family === 'transfer' ? --transferSeq : --costSeq
    events.push({ date, type: def.type, number, contact: pick(rand, def.pool), dir: def.dir, amount, bank: def.bank })
    balance = balance - (def.dir === 'in' ? amount : 0) + (def.dir === 'out' ? amount : 0)
  }
  return events
}

// ─── Account transactions tab (book side) ────────────────────────────────────

export function getAccountTransactions(accountId: string, bookBalance: number, unreconciledCount = 6, profile: LedgerProfile = 'operating'): AccountTransactionLine[] {
  const events = buildLedger(accountId, bookBalance, profile)
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

export function getBankStatementLines(accountId: string, bookBalance: number, unreconciledCount = 6, profile: LedgerProfile = 'operating'): BankStatementLine[] {
  const events = buildLedger(accountId, bookBalance, profile)
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
