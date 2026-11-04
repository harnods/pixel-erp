/**
 * Close books (Accounting → Close books) — prod quickbook /closing_the_books +
 * /locking_periods ("List of Period Lock & Closing Book").
 *
 * Every figure (worksheet, trial balance, income statement, balance sheet, cash
 * flow) is derived from the chart-of-accounts ledger in chartOfAccounts.ts, so the
 * statements balance by construction — and assertBalanced() checks it anyway.
 * Publishing a closing book posts a real closing entry (P&L → retained earnings,
 * tax expense → tax payable) into that ledger; reverting removes it.
 *
 * Persistence: the whole list (seed + user drafts/publishes/reverts) is a
 * snapshot under `close-books` (persist.ts).
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'
import {
  coaRecords, categoryOf, closingEntries, netMovement, naturalSign, getAccount,
  CASH_AND_BANK, ledger, type CoaRecord, type CoaAccountType, type LedgerLine,
} from './chartOfAccounts'
import { COMPANY_NAME } from './companySettings'

export { COMPANY_NAME }

export type LockType = 'ctb' | 'lp'
export type WizardStep = 'period' | 'reconciliations' | 'worksheet' | 'statements'
export const WIZARD_STEPS: WizardStep[] = ['period', 'reconciliations', 'worksheet', 'statements']

export interface ClosingBook {
  id: string
  lockType: LockType
  /** null = "From beginning". */
  startDate: string | null
  endDate: string
  memo: string
  status: 'draft' | 'published'
  /** Furthest wizard step reached (drafts only). */
  step: WizardStep
  taxExpenseAccount: string
  taxPayableAccount: string
  taxAmount: number
  retainedEarningsAccount: string
  /** Snapshot of the income-statement totals at publish (Net Profit Loss = credit − debit). */
  totalDebit: number
  totalCredit: number
  createdAt: string
}

const KEY = 'close-books'

const DEFAULTS = {
  taxExpenseAccount: '9-90000',
  taxPayableAccount: '2-20504',
  retainedEarningsAccount: '3-30100',
}

function seed(): ClosingBook[] {
  const base = (b: Partial<ClosingBook> & Pick<ClosingBook, 'id' | 'lockType' | 'startDate' | 'endDate' | 'memo'>): ClosingBook => ({
    status: 'published', step: 'statements', taxAmount: 0, totalDebit: 0, totalCredit: 0,
    createdAt: b.endDate, ...DEFAULTS, ...b,
  })
  const list = [
    base({ id: 'ctb-2025', lockType: 'ctb', startDate: null, endDate: '2025-12-31', memo: 'Year-end closing 2025', taxAmount: 1_850_000 }),
    base({ id: 'lp-2026q1', lockType: 'lp', startDate: '2026-01-01', endDate: '2026-03-31', memo: 'Q1 2026 reviewed by external auditor — lock all January to March transactions before tax filing (SPT Masa PPN) and management reporting pack' }),
    base({ id: 'lp-2026q2', lockType: 'lp', startDate: '2026-04-01', endDate: '2026-06-30', memo: '' }),
  ]
  return list
}

const snapshot = loadSnapshot<ClosingBook>(KEY)
export const closingBooks = reactive<ClosingBook[]>(snapshot ?? seed())

function persist() {
  saveSnapshot(KEY, closingBooks)
  syncClosingEntries()
}

/** Newest first (by end date) — the list order prod renders. */
export function sortedBooks(): ClosingBook[] {
  return [...closingBooks].sort((a, b) => b.endDate.localeCompare(a.endDate) || b.createdAt.localeCompare(a.createdAt))
}
export function getBook(id: string): ClosingBook | undefined {
  return closingBooks.find(b => b.id === id)
}
export function draftOf(type: LockType): ClosingBook | undefined {
  return closingBooks.find(b => b.lockType === type && b.status === 'draft')
}
/** Latest published lock — the only one that can be reverted (prod idx == 0). */
export function latestPublished(): ClosingBook | undefined {
  return sortedBooks().find(b => b.status === 'published')
}
/** Lock date: transactions on or before this date are locked. */
export function lockDate(): string | null {
  return latestPublished()?.endDate ?? null
}
function lastPublishedCtb(exceptId?: string): ClosingBook | undefined {
  return sortedBooks().find(b => b.status === 'published' && b.lockType === 'ctb' && b.id !== exceptId)
}

/**
 * Start date of a new lock. A period lock starts the day after the latest lock;
 * a closing book refers to the last closing book period (prod tooltip: "The start
 * date of closing book will refer to the last closing book period to calculate the
 * net profit/loss"). null = From beginning.
 */
export function nextStartDate(type: LockType = 'ctb'): string | null {
  const last = type === 'ctb' ? lastPublishedCtb() : latestPublished()
  if (!last) return null
  return addDays(last.endDate, 1)
}

/** End-date rule: must be after the latest lock date (end dates are mutually exclusive). */
export function endDateError(endDate: string): string {
  if (!endDate) return 'You must select to date'
  const ld = lockDate()
  if (ld && endDate <= ld) return 'To date must be after the latest locked period'
  return ''
}

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function startDraft(type: LockType, endDate: string): ClosingBook {
  const existing = draftOf(type)
  if (existing) { existing.endDate = endDate; existing.startDate = nextStartDate(type); persist(); return existing }
  const prevCtb = lastPublishedCtb()
  const b: ClosingBook = {
    id: `${type}-${Date.now().toString(36)}`, lockType: type, startDate: nextStartDate(type), endDate,
    memo: '', status: 'draft', step: 'reconciliations', taxAmount: 0, totalDebit: 0, totalCredit: 0,
    createdAt: new Date().toISOString(),
    taxExpenseAccount: prevCtb?.taxExpenseAccount ?? DEFAULTS.taxExpenseAccount,
    taxPayableAccount: prevCtb?.taxPayableAccount ?? DEFAULTS.taxPayableAccount,
    retainedEarningsAccount: prevCtb?.retainedEarningsAccount ?? DEFAULTS.retainedEarningsAccount,
  }
  closingBooks.push(b)
  persist()
  return b
}

export function updateBook(id: string, patch: Partial<ClosingBook>) {
  const b = getBook(id)
  if (!b) return
  Object.assign(b, patch)
  persist()
}

export function deleteDraft(id: string) {
  const i = closingBooks.findIndex(b => b.id === id && b.status === 'draft')
  if (i !== -1) { closingBooks.splice(i, 1); persist() }
}

export function publish(id: string) {
  const b = getBook(id)
  if (!b) return
  Object.assign(b, incomeTotals(b), { status: 'published', step: 'statements' })
  persist()
}

export function revert(id: string) {
  const i = closingBooks.findIndex(b => b.id === id)
  if (i !== -1) { closingBooks.splice(i, 1); persist() }
}

// ── Figures ──────────────────────────────────────────────────────────────────

/** Period boundaries for the ledger query: (from, to]. */
function bounds(b: Pick<ClosingBook, 'startDate' | 'endDate'>): { from: string | null; to: string } {
  return { from: b.startDate ? addDays(b.startDate, -1) : null, to: b.endDate }
}

const isPL = (t: CoaAccountType) => t === 'income' || t === 'expense'

function activeAccounts(): CoaRecord[] {
  return [...coaRecords].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }))
}

export interface WorksheetRow {
  id: string
  code: string
  name: string
  type: CoaAccountType
  /** Debit-positive end balance (BS: cumulative to end date; P&L: since last closing book). */
  net: number
}

/**
 * Worksheet rows = the trial balance as of the end date. Earlier closing books'
 * entries are in the ledger, so P&L accounts only carry what happened since the
 * previous closing book; the book's own closing entry is excluded so a published
 * book still shows its pre-closing worksheet.
 */
export function worksheetRows(b: ClosingBook): WorksheetRow[] {
  return activeAccounts()
    .map((a) => {
      const type = categoryOf(a.categoryId).type
      const net = netMovement(a.id, null, b.endDate, b.id)
      return { id: a.id, code: a.code, name: a.name, type, net }
    })
    .filter(r => r.net !== 0)
}

export interface WorksheetTotals {
  tbDebit: number; tbCredit: number
  isDebit: number; isCredit: number
  bsDebit: number; bsCredit: number
  netProfit: number
}

export function worksheetTotals(rows: WorksheetRow[]): WorksheetTotals {
  const t = { tbDebit: 0, tbCredit: 0, isDebit: 0, isCredit: 0, bsDebit: 0, bsCredit: 0, netProfit: 0 }
  for (const r of rows) {
    const d = r.net > 0 ? r.net : 0
    const c = r.net < 0 ? -r.net : 0
    t.tbDebit += d; t.tbCredit += c
    if (isPL(r.type)) { t.isDebit += d; t.isCredit += c } else { t.bsDebit += d; t.bsCredit += c }
  }
  t.netProfit = t.isCredit - t.isDebit
  return t
}

function incomeTotals(b: ClosingBook): { totalDebit: number; totalCredit: number } {
  const t = worksheetTotals(worksheetRows(b))
  return { totalDebit: t.isDebit, totalCredit: t.isCredit }
}

export function netProfitOf(b: ClosingBook): number {
  return b.totalCredit - b.totalDebit
}

/** Throws if the worksheet / statements don't balance — called by every screen that renders figures. */
export function assertBalanced(b: ClosingBook): void {
  const rows = worksheetRows(b)
  const t = worksheetTotals(rows)
  const eq = (x: number, y: number) => Math.abs(x - y) < 0.5
  if (!eq(t.tbDebit, t.tbCredit)) throw new Error(`Trial balance out of balance: ${t.tbDebit} ≠ ${t.tbCredit}`)
  if (!eq(t.bsDebit, t.bsCredit + t.netProfit)) throw new Error(`Balance sheet columns out of balance`)
  const bs = balanceSheet(b)
  if (!eq(bs.totalAssets, bs.totalLiabilitiesAndEquity)) throw new Error(`Assets ${bs.totalAssets} ≠ liabilities + equity ${bs.totalLiabilitiesAndEquity}`)
  const cf = cashFlow(b)
  if (!eq(cf.beginning + cf.netCashMovement, cf.ending)) throw new Error('Cash flow does not reconcile')
}

// Trial balance (financial statements tab) ────────────────────────────────────

export interface TrialBalanceRow {
  id: string; code: string; name: string; type: CoaAccountType
  opening: number; movementDebit: number; movementCredit: number; ending: number
}

export function trialBalance(b: ClosingBook): TrialBalanceRow[] {
  const { from, to } = bounds(b)
  return activeAccounts().map((a) => {
    const type = categoryOf(a.categoryId).type
    const opening = from ? netMovement(a.id, null, from, b.id) : 0
    let md = 0, mc = 0
    for (const tx of ledger.value) {
      if (tx.closingId === b.id || tx.date > to || (from && tx.date <= from)) continue
      for (const l of tx.lines) if (l.code === a.id) { md += l.debit; mc += l.credit }
    }
    return { id: a.id, code: a.code, name: a.name, type, opening, movementDebit: md, movementCredit: mc, ending: opening + md - mc }
  }).filter(r => r.opening !== 0 || r.movementDebit !== 0 || r.movementCredit !== 0)
}

// Income statement ────────────────────────────────────────────────────────────

export interface StatementLine { id: string; code: string; name: string; amount: number }
export interface StatementSection { key: string; label: string; totalLabel: string; lines: StatementLine[]; total: number }

function sectionFor(b: ClosingBook, categoryIds: number[], key: string, label: string, totalLabel: string, rows: WorksheetRow[]): StatementSection {
  const lines = rows
    .filter(r => categoryIds.includes(getAccount(r.id)?.categoryId ?? -1))
    .map(r => ({ id: r.id, code: r.code, name: r.name, amount: naturalSign(getAccount(r.id)!.categoryId) * r.net }))
  return { key, label, totalLabel, lines, total: lines.reduce((s, l) => s + l.amount, 0) }
}

export function incomeStatement(b: ClosingBook) {
  const rows = worksheetRows(b)
  const income = sectionFor(b, [13], 'income', 'Primary Income', 'Total Primary Income', rows)
  const cogs = sectionFor(b, [15], 'cogs', 'Cost of Sales', 'Total Cost of Sales', rows)
  const expense = sectionFor(b, [16], 'expense', 'Operational Expense', 'Total Operational Expenses', rows)
  const otherIncome = sectionFor(b, [14], 'other-income', 'Other Income', 'Total Other Income', rows)
  const otherExpense = sectionFor(b, [17], 'other-expense', 'Other Expense', 'Total Other Expense', rows)
  const grossProfit = income.total - cogs.total
  const netOperatingIncome = grossProfit - expense.total
  const netIncome = netOperatingIncome + otherIncome.total - otherExpense.total
  return { income, cogs, expense, otherIncome, otherExpense, grossProfit, netOperatingIncome, netIncome }
}

// Balance sheet ───────────────────────────────────────────────────────────────

export function balanceSheet(b: ClosingBook) {
  const rows = worksheetRows(b)
  const group = (type: CoaAccountType) => {
    const cats = new Map<number, StatementLine[]>()
    for (const r of rows.filter(x => x.type === type)) {
      const a = getAccount(r.id)!
      const arr = cats.get(a.categoryId) ?? []
      arr.push({ id: r.id, code: r.code, name: r.name, amount: naturalSign(a.categoryId) * r.net })
      cats.set(a.categoryId, arr)
    }
    return [...cats.entries()].map(([id, lines]) => ({ id, label: categoryOf(id).name, lines, total: lines.reduce((s, l) => s + l.amount, 0) }))
  }
  const assets = group('asset')
  const liabilities = group('liability')
  const equity = group('equity')
  const currentEarnings = incomeStatement(b).netIncome
  const totalAssets = assets.reduce((s, g) => s + g.total, 0)
  const totalLiabilities = liabilities.reduce((s, g) => s + g.total, 0)
  const totalEquity = equity.reduce((s, g) => s + g.total, 0) + currentEarnings
  return { assets, liabilities, equity, currentEarnings, totalAssets, totalLiabilities, totalEquity, totalLiabilitiesAndEquity: totalLiabilities + totalEquity }
}

// Cash flow ───────────────────────────────────────────────────────────────────

export function cashFlow(b: ClosingBook) {
  const { from, to } = bounds(b)
  const isCash = (id: string) => getAccount(id)?.categoryId === CASH_AND_BANK
  const cashIds = coaRecords.filter(a => a.categoryId === CASH_AND_BANK).map(a => a.id)
  const balAt = (d: string | null) => d ? cashIds.reduce((s, id) => s + netMovement(id, null, d, b.id), 0) : 0
  let opIn = 0, opOut = 0
  const nonOp = new Map<string, number>()
  for (const tx of ledger.value) {
    if (tx.closingId === b.id || tx.date > to || (from && tx.date <= from)) continue
    const cashDelta = tx.lines.filter(l => isCash(l.code)).reduce((s, l) => s + l.debit - l.credit, 0)
    if (cashDelta === 0) continue
    const others = tx.lines.filter(l => !isCash(l.code))
    const counter = others.map(l => getAccount(l.code)).find(Boolean)
    const cat = counter?.categoryId ?? 2
    const nonOperating = [5, 6, 7, 11, 12].includes(cat)
    if (nonOperating) {
      const label = categoryOf(cat).name
      nonOp.set(label, (nonOp.get(label) ?? 0) + cashDelta)
    } else if (cashDelta > 0) opIn += cashDelta
    else opOut += -cashDelta
  }
  const totalOperating = opIn - opOut
  const nonOperating = [...nonOp.entries()].map(([label, amount]) => ({ label, amount }))
  const totalNonOperating = nonOperating.reduce((s, x) => s + x.amount, 0)
  const beginning = balAt(from)
  const ending = balAt(to)
  return { operatingIncome: opIn, operatingExpenses: opOut, totalOperating, nonOperating, totalNonOperating, netCashMovement: totalOperating + totalNonOperating, beginning, ending }
}

// Closing entries ─────────────────────────────────────────────────────────────

function closingEntryFor(b: ClosingBook) {
  const rows = worksheetRows(b).filter(r => isPL(r.type))
  const lines: LedgerLine[] = rows.map(r => (r.net > 0 ? { code: r.id, debit: 0, credit: r.net } : { code: r.id, debit: -r.net, credit: 0 }))
  const np = rows.reduce((s, r) => s - r.net, 0)
  if (b.taxAmount) lines.push({ code: b.taxPayableAccount, debit: 0, credit: b.taxAmount })
  const after = np - b.taxAmount
  lines.push(after >= 0 ? { code: b.retainedEarningsAccount, debit: 0, credit: after } : { code: b.retainedEarningsAccount, debit: -after, credit: 0 })
  return { id: `CTB-${b.id}`, date: b.endDate, type: 'Closing Book', no: `CB-${b.endDate.replace(/-/g, '')}`, description: b.memo || 'Closing entry', lines, closingId: b.id }
}

/** Rebuild the ledger's closing entries from the published closing books (oldest first). */
export function syncClosingEntries() {
  closingEntries.splice(0, closingEntries.length)
  const published = [...closingBooks].filter(b => b.status === 'published' && b.lockType === 'ctb').sort((a, b) => a.endDate.localeCompare(b.endDate))
  for (const b of published) closingEntries.push(closingEntryFor(b))
}
// Seed CTB totals come from the ledger (computed once the list exists).
if (!snapshot) for (const b of closingBooks) if (b.lockType === 'ctb') Object.assign(b, incomeTotals(b))
syncClosingEntries()

// Check reconciliations ───────────────────────────────────────────────────────

export interface RegisterCheck { id: string; name: string; currency: string; balance: number; lastReconcile: string | null }

const LAST_RECONCILE: Record<string, string> = { '1-10004': '2026-07-31', '1-10005': '2026-05-31' }

export function registerChecks(b: ClosingBook): RegisterCheck[] {
  return coaRecords
    .filter(a => a.categoryId === CASH_AND_BANK && !a.archived)
    .map(a => {
      const rec = LAST_RECONCILE[a.id]
      return { id: a.id, name: a.name, currency: a.currency, balance: netMovement(a.id, null, b.endDate), lastReconcile: rec && rec <= b.endDate ? rec : null }
    })
}

export const WAREHOUSE_ADJUSTMENTS: { id: string; name: string; lastAdjustment: string | null; archived?: boolean }[] = [
  { id: 'wh-000', name: 'Warehouse Default', lastAdjustment: '2026-06-30' },
  { id: 'wh-001', name: 'Gudang Jakarta Pusat', lastAdjustment: '2026-07-31' },
  { id: 'wh-002', name: 'Gudang Surabaya Timur', lastAdjustment: null },
  { id: 'wh-003', name: 'Gudang Bandung Selatan', lastAdjustment: '2026-03-31', archived: true },
]
