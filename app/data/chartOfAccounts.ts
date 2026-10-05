/**
 * Chart of accounts — the canonical COA mock (Accounting → Chart of accounts).
 *
 * Built ON the shared default chart (`DEFAULT_COA` from wmsCutover.ts, extended by
 * `MAPPING_COA` in companySettings.ts — the list Settings › Default accounts uses),
 * so every screen reads the same codes and names. Those exports are untouched;
 * this file only layers prod's account metadata on top (category, header/child,
 * tax, currency, lock, archive) plus a small double-entry ledger so balances,
 * the account transaction list and the close-books worksheet/financial statements
 * all derive from one set of journal lines and therefore always balance.
 *
 * Prod source: jurnal-frontend-app/src/pages/accounts (index / detail / new_and_edit).
 *
 * Persistence (persist.ts): created accounts → `coa-accounts`; edits to seed
 * accounts → `coa-account-edits`; deleted seed codes → `coa-deleted`.
 */
import { reactive, computed } from 'vue'
import { MAPPING_COA, getAccountMapping } from './companySettings'
import { loadCreated, saveCreated } from './persist'
import { SIM_TODAY_ISO } from './simClock'

// ── Categories (prod account_categories, English names) ──────────────────────

export type AccountType = 'asset' | 'liability' | 'equity' | 'income' | 'expense'

export interface AccountCategoryDef {
  id: number
  name: string
  type: AccountType
}

/** Prod order — the index groups accounts in this order. */
export const ACCOUNT_CATEGORIES: AccountCategoryDef[] = [
  { id: 3, name: 'Cash & bank', type: 'asset' },
  { id: 1, name: 'Account receivable (A/R)', type: 'asset' },
  { id: 4, name: 'Inventory', type: 'asset' },
  { id: 2, name: 'Other current assets', type: 'asset' },
  { id: 5, name: 'Fixed assets', type: 'asset' },
  { id: 7, name: 'Depreciation & amortization', type: 'asset' },
  { id: 6, name: 'Other assets', type: 'asset' },
  { id: 8, name: 'Account payable', type: 'liability' },
  { id: 9, name: 'Credit card', type: 'liability' },
  { id: 10, name: 'Other current liabilities', type: 'liability' },
  { id: 11, name: 'Long term liabilities', type: 'liability' },
  { id: 12, name: 'Equity', type: 'equity' },
  { id: 13, name: 'Income', type: 'income' },
  { id: 15, name: 'Cost of sales', type: 'expense' },
  { id: 16, name: 'Expenses', type: 'expense' },
  { id: 14, name: 'Other income', type: 'income' },
  { id: 17, name: 'Other expenses', type: 'expense' },
]

export const CASH_AND_BANK = 3
export const CREDIT_CARD = 9

export function categoryOf(id: number): AccountCategoryDef {
  return ACCOUNT_CATEGORIES.find(c => c.id === id) ?? ACCOUNT_CATEGORIES[0]!
}
export function categoryRank(id: number): number {
  const i = ACCOUNT_CATEGORIES.findIndex(c => c.id === id)
  return i === -1 ? 99 : i
}

function categoryForCode(code: string): number {
  const n = code.replace('-', '')
  const p = (s: string) => n.startsWith(s.replace('-', ''))
  if (p('1-100')) return 3
  if (p('1-101')) return 1
  if (p('1-102')) return 4
  if (p('1-1075')) return 7
  if (p('1-107')) return 5
  if (p('1-108')) return 6
  if (p('1-')) return 2
  if (p('2-201')) return 8
  if (p('2-208')) return 9
  if (p('2-204') || p('2-206') && !p('2-20601') || p('2-207')) return 11
  if (p('2-')) return 10
  if (p('3-')) return 12
  if (p('4-')) return 13
  if (p('5-')) return 15
  if (p('6-')) return 16
  if (p('7-')) return 14
  return 17
}

// ── Accounts ─────────────────────────────────────────────────────────────────

export interface CoaRecord {
  /** Stable id (seed = original code). Code itself can be edited. */
  id: string
  code: string
  name: string
  categoryId: number
  /** Header account this one sits under. */
  parentId?: string
  description?: string
  /** Default tax name (Account tax column). */
  tax?: string
  currency: string
  bankName?: string
  bankAccountNo?: string
  archived?: boolean
  /** Created in this prototype (persisted). */
  isCreated?: boolean
}

/** Accounts ERP's default chart has beyond the shared list: header children + a card. */
const EXTRA_SEED: Omit<CoaRecord, 'id' | 'currency'>[] = [
  { code: '2-20800', name: 'BCA Corporate Card', categoryId: 9 },
  { code: '6-60001', name: 'Advertising & Promotion', categoryId: 16, parentId: '6-60000' },
  { code: '6-60002', name: 'Commission & Fees', categoryId: 16, parentId: '6-60000' },
  { code: '6-60003', name: 'Fuel, Toll and Parking - Sales', categoryId: 16, parentId: '6-60000' },
  { code: '6-60101', name: 'Salaries', categoryId: 16, parentId: '6-60100' },
  { code: '6-60102', name: 'Wages', categoryId: 16, parentId: '6-60100' },
  { code: '6-60103', name: 'Meals & Transport', categoryId: 16, parentId: '6-60100' },
  { code: '6-60104', name: 'Rent', categoryId: 16, parentId: '6-60100' },
  { code: '6-60105', name: 'Depreciation', categoryId: 16, parentId: '6-60100' },
  { code: '6-60110', name: 'Office Expenses', categoryId: 16, parentId: '6-60100' },
  { code: '6-60111', name: 'Office Supplies', categoryId: 16, parentId: '6-60110' },
  { code: '6-60112', name: 'Printing & Stationery', categoryId: 16, parentId: '6-60110' },
  { code: '6-60113', name: 'Electricity, Water, Telephone & Internet for Head Office and All Warehouses', categoryId: 16, parentId: '6-60110' },
]

const SEED_DESCRIPTIONS: Record<string, string> = {
  '1-10301': 'Account for employee receivables',
  '3-30999': 'Temporary equity used when opening balances are recorded',
}
const SEED_TAX: Record<string, string> = { '1-10500': 'PPN 11%', '2-20500': 'PPN 11%', '2-20503': 'PPh 23' }
const SEED_BANK: Record<string, { bankName: string; bankAccountNo: string; currency?: string }> = {
  '1-10004': { bankName: 'BCA (Bank Central Asia)', bankAccountNo: '5485079642' },
  '1-10005': { bankName: 'DBS Bank', bankAccountNo: '0661089145', currency: 'SGD' },
}
const SEED_ARCHIVED = new Set(['1-10003'])

function buildSeed(): CoaRecord[] {
  const base: CoaRecord[] = MAPPING_COA.map(a => ({
    id: a.code, code: a.code, name: a.name, categoryId: categoryForCode(a.code), currency: 'IDR',
  }))
  for (const e of EXTRA_SEED) base.push({ ...e, id: e.code, currency: 'IDR' })
  for (const a of base) {
    if (SEED_DESCRIPTIONS[a.code]) a.description = SEED_DESCRIPTIONS[a.code]
    if (SEED_TAX[a.code]) a.tax = SEED_TAX[a.code]
    const b = SEED_BANK[a.code]
    if (b) { a.bankName = b.bankName; a.bankAccountNo = b.bankAccountNo; if (b.currency) a.currency = b.currency }
    if (SEED_ARCHIVED.has(a.code)) a.archived = true
  }
  return base
}

const CREATED_KEY = 'coa-accounts'
const EDITS_KEY = 'coa-account-edits'
const DELETED_KEY = 'coa-deleted'

const created = loadCreated<CoaRecord>(CREATED_KEY)
const edits = loadCreated<CoaRecord>(EDITS_KEY)
const deleted = new Set(loadCreated<string>(DELETED_KEY))

function hydrate(): CoaRecord[] {
  const seed = buildSeed().filter(a => !deleted.has(a.id)).map(a => edits.find(e => e.id === a.id) ?? a)
  return [...seed, ...created]
}

/** The live chart. */
export const coaRecords = reactive<CoaRecord[]>(hydrate())

const SEED_IDS = new Set(buildSeed().map(a => a.id))

function persist() {
  saveCreated(CREATED_KEY, coaRecords.filter(a => !SEED_IDS.has(a.id)))
  saveCreated(EDITS_KEY, coaRecords.filter(a => SEED_IDS.has(a.id)))
  saveCreated(DELETED_KEY, [...SEED_IDS].filter(id => !coaRecords.some(a => a.id === id)))
}

export function getAccount(id: string): CoaRecord | undefined {
  return coaRecords.find(a => a.id === id)
}
export function childrenOf(id: string): CoaRecord[] {
  return coaRecords.filter(a => a.parentId === id)
}
export function isHeader(id: string): boolean {
  return coaRecords.some(a => a.parentId === id)
}
export function descendantsOf(id: string): CoaRecord[] {
  const out: CoaRecord[] = []
  const walk = (pid: string) => { for (const c of childrenOf(pid)) { out.push(c); walk(c.id) } }
  walk(id)
  return out
}
export function accountTitle(a: CoaRecord): string {
  return `(${a.code}) - ${a.name}`
}
export function accountOptionLabel(a: CoaRecord): string {
  return `(${a.code}) ${a.name}`
}

/** Default accounts (Settings › Default accounts mapping) — cannot be deleted. */
export function isDefaultAccount(a: CoaRecord): boolean {
  return Object.values(getAccountMapping()).includes(a.code)
}

export function isNameTaken(name: string, exceptId?: string): boolean {
  const n = name.trim().toLowerCase()
  return coaRecords.some(a => a.name.trim().toLowerCase() === n && a.id !== exceptId)
}
export function isCodeTaken(code: string, exceptId?: string): boolean {
  const c = code.trim().toLowerCase()
  return !!c && coaRecords.some(a => a.code.toLowerCase() === c && a.id !== exceptId)
}

export function createAccount(input: Omit<CoaRecord, 'id' | 'isCreated'>, childIds: string[] = []): CoaRecord {
  const rec: CoaRecord = { ...input, id: `coa-${Date.now().toString(36)}`, isCreated: true }
  coaRecords.push(rec)
  for (const cid of childIds) {
    const c = getAccount(cid)
    if (c) c.parentId = rec.id
  }
  persist()
  return rec
}

export function updateAccount(id: string, patch: Partial<CoaRecord>): void {
  const a = getAccount(id)
  if (!a) return
  Object.assign(a, patch)
  if (patch.parentId === undefined && 'parentId' in patch) delete a.parentId
  persist()
}

export function setArchived(id: string, archived: boolean): void {
  updateAccount(id, { archived })
}

/** Deleting a header keeps its sub-accounts, as standalone accounts (prod copy). */
export function deleteAccount(id: string): void {
  const i = coaRecords.findIndex(a => a.id === id)
  if (i === -1) return
  for (const c of childrenOf(id)) delete c.parentId
  coaRecords.splice(i, 1)
  persist()
}

// ── Ledger (seed journal + closing entries) ──────────────────────────────────

/** `code` is the account id (seed ids are the original codes), so editing an account's code keeps its history. */
export interface LedgerLine { code: string; debit: number; credit: number }
export interface LedgerTx {
  id: string
  date: string
  type: string
  no: string
  description?: string
  contact?: { id: string; name: string; kind: 'customers' | 'vendors' }
  lines: LedgerLine[]
  /** Set on closing-book entries: the closing book that posted it. */
  closingId?: string
}

const CUSTOMERS = [
  { id: 'C001', name: 'Anomali Coffee' }, { id: 'C002', name: 'Tanamera Coffee Roastery' },
  { id: 'C003', name: 'Hotel Mulia Senayan' }, { id: 'C004', name: 'Fore Coffee Thamrin' },
  { id: 'C006', name: 'Kopi Kenangan Pusat' },
]
const VENDORS = [
  { id: 'V001', name: 'Klasik Beans Cooperative' }, { id: 'V003', name: 'Gayo Highland Exporters' },
  { id: 'V006', name: 'PT Kemasan Prima Nusantara' },
]

const r = (n: number) => Math.round(n / 1000) * 1000
const ln = (code: string, debit: number, credit = 0): LedgerLine => ({ code, debit, credit })

function buildSeedLedger(): LedgerTx[] {
  const txs: LedgerTx[] = []
  // Opening balance — plug to Opening Balance Equity so it balances.
  const ob: LedgerLine[] = [
    ln('1-10001', 15_000_000), ln('1-10002', 5_000_000), ln('1-10004', 250_000_000), ln('1-10005', 60_000_000),
    ln('1-10100', 45_000_000), ln('1-10200', 180_000_000), ln('1-10402', 6_000_000),
    ln('1-10703', 320_000_000), ln('1-10705', 85_000_000),
    ln('1-10753', 0, 40_000_000), ln('1-10755', 0, 15_000_000),
    ln('2-20100', 0, 72_000_000), ln('2-20400', 0, 150_000_000), ln('3-30000', 0, 500_000_000),
  ]
  const diff = ob.reduce((s, l) => s + l.debit - l.credit, 0)
  ob.push(diff >= 0 ? ln('3-30999', 0, diff) : ln('3-30999', -diff))
  txs.push({ id: 'OB-1', date: '2025-09-30', type: 'Opening Balance', no: '1', description: 'Opening balance', lines: ob })

  let si = 10001, pi = 20001, je = 30001, ex = 40001, rp = 50001, pp = 60001
  // Month index 0 = Oct 2025 … 10 = Aug 2026 (stop at SIM today).
  for (let m = 0; m <= 10; m++) {
    const y = 2025 + Math.floor((9 + m) / 12)
    const mo = ((9 + m) % 12) + 1
    const d = (day: number) => `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    const last = m === 10 ? 20 : 28
    // Sales invoices + COGS
    for (let k = 0; k < 3; k++) {
      const c = CUSTOMERS[(m + k) % CUSTOMERS.length]!
      const amount = r(38_000_000 + ((m * 7 + k * 13) % 9) * 4_250_000)
      const vat = r(amount * 0.11)
      txs.push({
        id: `SI-${si}`, date: d(Math.min(3 + k * 8, last)), type: 'Sales Invoice', no: String(si++),
        contact: { ...c, kind: 'customers' }, description: 'Roasted coffee beans',
        lines: [ln('1-10100', amount + vat), ln('4-40000', 0, amount), ln('2-20500', 0, vat), ln('5-50000', r(amount * 0.45)), ln('1-10200', 0, r(amount * 0.45))],
      })
      if (k < 2) {
        txs.push({
          id: `RP-${rp}`, date: d(Math.min(10 + k * 9, last)), type: 'Receive Payment', no: String(rp++),
          contact: { ...c, kind: 'customers' },
          lines: [ln('1-10004', amount + vat), ln('1-10100', 0, amount + vat)],
        })
      }
    }
    // Purchases
    for (let k = 0; k < 2; k++) {
      const v = VENDORS[(m + k) % VENDORS.length]!
      const amount = r(31_000_000 + ((m * 5 + k * 11) % 7) * 3_100_000)
      const vat = r(amount * 0.11)
      txs.push({
        id: `PI-${pi}`, date: d(Math.min(5 + k * 10, last)), type: 'Purchase Invoice', no: String(pi++),
        contact: { ...v, kind: 'vendors' }, description: 'Green beans & packaging',
        lines: [ln('1-10200', amount), ln('1-10500', vat), ln('2-20100', 0, amount + vat)],
      })
      if (k === 0) {
        txs.push({
          id: `PP-${pp}`, date: d(Math.min(18, last)), type: 'Purchase Payment', no: String(pp++),
          contact: { ...v, kind: 'vendors' },
          lines: [ln('2-20100', amount + vat), ln('1-10004', 0, amount + vat)],
        })
      }
    }
    // Operating expenses
    const exp = (code: string, amt: number, cash: string, desc: string, day: number) => txs.push({
      id: `EX-${ex}`, date: d(Math.min(day, last)), type: 'Expense', no: String(ex++), description: desc,
      lines: [ln(code, amt), ln(cash, 0, amt)],
    })
    exp('6-60101', 28_500_000, '1-10004', 'Monthly payroll', 25)
    exp('6-60001', r(4_200_000 + (m % 4) * 650_000), '1-10004', 'Social media ads', 12)
    exp('6-60104', 7_500_000, '1-10004', 'Roastery rent', 2)
    exp('6-60111', r(850_000 + (m % 3) * 120_000), '1-10002', 'Office supplies', 15)
    exp('6-60113', r(2_100_000 + (m % 5) * 90_000), '1-10004', 'Utilities', 20)
    if (m % 2 === 0) exp('6-60103', 1_250_000, '1-10001', 'Team meals', 22)
    // Bank interest income / loan interest
    txs.push({ id: `JE-${je}`, date: d(last), type: 'Journal Entry', no: String(je++), description: 'Bank interest',
      lines: [ln('1-10004', 420_000), ln('7-70000', 0, 420_000)] })
    txs.push({ id: `JE-${je}`, date: d(last), type: 'Journal Entry', no: String(je++), description: 'Loan interest',
      lines: [ln('8-80000', 1_375_000), ln('1-10004', 0, 1_375_000)] })
    // Monthly depreciation
    txs.push({ id: `JE-${je}`, date: d(last), type: 'Journal Entry', no: String(je++), description: 'Monthly depreciation',
      lines: [ln('6-60105', 7_083_000), ln('1-10753', 0, 5_333_000), ln('1-10755', 0, 1_750_000)] })
    // Card spend + settlement
    txs.push({ id: `EX-${ex}`, date: d(Math.min(8, last)), type: 'Expense', no: String(ex++), description: 'Fuel & toll — sales visits',
      lines: [ln('6-60003', 1_640_000), ln('2-20800', 0, 1_640_000)] })
    if (m > 0) txs.push({ id: `JE-${je}`, date: d(Math.min(9, last)), type: 'Bank Transfer', no: String(je++), description: 'Card settlement',
      lines: [ln('2-20800', 1_640_000), ln('1-10004', 0, 1_640_000)] })
    // Loan principal (non-operating) + one equipment purchase
    txs.push({ id: `JE-${je}`, date: d(Math.min(26, last)), type: 'Bank Transfer', no: String(je++), description: 'Bank loan installment',
      lines: [ln('2-20400', 5_000_000), ln('1-10004', 0, 5_000_000)] })
    if (m === 5) txs.push({ id: `EX-${ex}`, date: d(11), type: 'Expense', no: String(ex++), description: 'Espresso machine — Jakarta roastery',
      lines: [ln('1-10704', 48_000_000), ln('1-10004', 0, 48_000_000)] })
    // Petty cash top-up
    if (m % 3 === 0) txs.push({ id: `JE-${je}`, date: d(Math.min(14, last)), type: 'Bank Transfer', no: String(je++), description: 'Petty cash top-up',
      lines: [ln('1-10002', 3_000_000), ln('1-10004', 0, 3_000_000)] })
  }
  return txs.filter(t => t.date <= SIM_TODAY_ISO)
}

export const SEED_LEDGER: LedgerTx[] = buildSeedLedger()

/** Extra ledger entries contributed by published closing books (set by closeBooks.ts). */
export const closingEntries = reactive<LedgerTx[]>([])

export const ledger = computed<LedgerTx[]>(() =>
  [...SEED_LEDGER, ...closingEntries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)),
)

// Assert: every journal balances.
for (const tx of SEED_LEDGER) {
  const net = tx.lines.reduce((s, l) => s + l.debit - l.credit, 0)
  if (Math.abs(net) > 0.5) throw new Error(`Ledger ${tx.id} does not balance (${net})`)
}

/** Debit-positive movement for one account id over (from, to] — `from` exclusive, null = beginning.
 *  `skipClosingId` leaves out one closing book's own closing entry. */
export function netMovement(code: string, from: string | null, to: string, skipClosingId?: string): number {
  let s = 0
  for (const tx of ledger.value) {
    if (tx.date > to || (from && tx.date <= from)) continue
    if (skipClosingId && tx.closingId === skipClosingId) continue
    for (const l of tx.lines) if (l.code === code) s += l.debit - l.credit
  }
  return s
}

/** Natural-sign multiplier: credit-normal categories show credit balances as positive. */
export function naturalSign(categoryId: number): 1 | -1 {
  const t = categoryOf(categoryId).type
  return t === 'asset' || t === 'expense' ? 1 : -1
}

/** Natural-sign balance of one account as of a date (own lines only). */
export function ownBalance(a: CoaRecord, asOf = SIM_TODAY_ISO): number {
  return naturalSign(a.categoryId) * netMovement(a.id, null, asOf)
}

/** Balance shown on the index/detail: a header sums its whole subtree. */
export function accountBalance(a: CoaRecord, asOf = SIM_TODAY_ISO): number {
  return [a, ...descendantsOf(a.id)].reduce((s, x) => s + ownBalance(x, asOf), 0)
}

export function hasTransactions(a: CoaRecord): boolean {
  return ledger.value.some(tx => tx.lines.some(l => l.code === a.id))
}

export interface AccountTxRow {
  id: string
  date: string
  type: string
  no: string
  description?: string
  contact?: LedgerTx['contact']
  debit: number
  credit: number
  balance: number
  isBeginning?: boolean
}

/** Transactions on one account between two dates, with a beginning-balance row and running balance. */
export function accountTransactions(a: CoaRecord, start: string, end: string): AccountTxRow[] {
  const sign = naturalSign(a.categoryId)
  const dayBefore = new Date(new Date(start + 'T00:00:00').getTime() - 86_400_000).toISOString().slice(0, 10)
  let bal = sign * netMovement(a.id, null, dayBefore)
  const rows: AccountTxRow[] = [{ id: 'beginning', date: start, type: 'Beginning Balance', no: '', debit: 0, credit: 0, balance: bal, isBeginning: true }]
  for (const tx of ledger.value) {
    if (tx.date < start || tx.date > end) continue
    for (const [i, l] of tx.lines.entries()) {
      if (l.code !== a.id) continue
      bal += sign * (l.debit - l.credit)
      rows.push({ id: `${tx.id}-${i}`, date: tx.date, type: tx.type, no: tx.no, description: tx.description, contact: tx.contact, debit: l.debit, credit: l.credit, balance: bal })
    }
  }
  return rows
}
