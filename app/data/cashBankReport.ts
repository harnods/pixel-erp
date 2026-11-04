/**
 * Cash & bank report — Reports › Cash & bank › Bank statement.
 * prod-parity: quickbook app/views/reports/bank_statement_report.html.haml
 *   (reached from jurnal-frontend-app/src/pages/reports/cash_and_bank_report)
 *
 * One cash / bank / credit-card account at a time: Opening balance at the start
 * date, every statement record in the period (date, description, date imported,
 * reconciled, source, receive, spent, running balance), then Closing balance.
 *
 * Numbers come from the SAME ledger Cash management reads:
 *   • the per-account ledger in bankStatementLines.ts (getAccountTransactions,
 *     same seed / anchor / profile as the account detail page), whose newest
 *     balance is the account's seeded book balance;
 *   • plus user-posted Receive / Spend money (bankTransactions.ts) and new
 *     internal transfers, exactly the movements applyPostedBalances() folds into
 *     the book balance.
 * So the closing balance through the latest transaction always equals the Book
 * balance column on the Cash management list — asserted in dev for every account.
 * Reconciled lines carry the bank-feed wording from getBankStatementLines.
 */
import { cashAccounts, type CashAccount } from './cashAccounts'
import { getAccountTransactions, getBankStatementLines, type LedgerProfile } from './bankStatementLines'
import { cashTransactions, cashTxTotal, baseBookBalance, applyPostedBalances } from './bankTransactions'
import { internalTransfers } from './internalTransfers'
import { SIM_TODAY_ISO } from './simClock'

export type CbrSource = 'System' | 'Import' | 'Direct Feeds'

export interface CbrRow {
  id: string
  date: string
  description: string
  dateImported: string
  reconciled: boolean
  source: CbrSource
  receive: number
  spent: number
  balance: number
}

export interface CbrReport {
  account: CashAccount
  startIso: string
  endIso: string
  openingBalance: number
  rows: CbrRow[]
  closingBalance: number
  totalReceive: number
  totalSpent: number
}

/** Same role → document-mix mapping as CashManagementDetailPage's ledgerProfile. */
export function cbrLedgerProfile(a: CashAccount): LedgerProfile {
  const n = a.name.toLowerCase()
  if (/petty/.test(n)) return 'petty'
  if (/^2-/.test(a.code)) return 'card'
  if (/dbs|singapore|valas|\bfx\b|us\$|usd/.test(n)) return 'fx'
  if (/utilit/.test(n)) return 'utilities'
  if (/transport|logistic/.test(n)) return 'logistics'
  if (/hrbp|payroll/.test(n)) return 'payroll'
  if (/finance/.test(n)) return 'finance'
  if (/\bcash\b|drawer|wallet/.test(n)) return 'retailcash'
  return 'operating'
}

/** Accounts the report offers: not archived, terminal (no sub-accounts) — prod's
 *  get_bank_credit_card_accounts_not_archive + terminal_account, in id order. */
export function cbrAccounts(): CashAccount[] {
  applyPostedBalances()
  const parents = new Set(cashAccounts.map((a) => a.parentId).filter(Boolean))
  return cashAccounts.filter((a) => !a.isArchived && !parents.has(a.id))
}

function plusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Every record on the account, oldest first, with the running balance after it. */
export function cbrAllRows(a: CashAccount): CbrRow[] {
  const profile = cbrLedgerProfile(a)
  const base = baseBookBalance(a.id)
  const hasStatement = a.statementBalance !== null && a.hasTransactions !== false
  const tx = a.hasTransactions === false ? [] : getAccountTransactions(a.id, base, a.unreconciledCount, profile)
  // Bank-feed wording for the reconciled slice (same events, same order).
  const stmt = hasStatement ? getBankStatementLines(a.id, base, a.unreconciledCount, profile).filter((l) => l.id.startsWith(`${a.id}-stmt-`)) : []
  const stmtById = new Map(stmt.map((l) => [l.id, l]))
  const source: CbrSource = !hasStatement ? 'System' : a.isConnected ? 'Direct Feeds' : 'Import'
  const rows: CbrRow[] = tx.map((r, i) => {
    const reconciled = r.status === 'reconciled'
    const line = reconciled ? stmtById.get(`${a.id}-stmt-${i - a.unreconciledCount}`) : undefined
    const src: CbrSource = reconciled ? source : 'System'
    const imported = src === 'Import' ? (a.statementDate && a.statementDate > r.date ? a.statementDate : r.date)
      : src === 'Direct Feeds' ? plusDays(r.date, 1) : r.date
    return {
      id: r.id, date: r.date,
      description: line?.description ?? `${r.type} #${r.number}${r.contact ? ` — ${r.contact}` : ''}`,
      dateImported: imported, reconciled, source: src,
      receive: r.moneyIn, spent: r.moneyOut, balance: r.balance,
    }
  }).reverse()

  // User-posted movements (the ones applyPostedBalances adds on top of the seed).
  const posted: Omit<CbrRow, 'balance'>[] = []
  for (const t of cashTransactions) {
    if (t.seeded || t.cashAccountId !== a.id) continue
    const amt = cashTxTotal(t)
    const dep = t.kind === 'deposit'
    posted.push({
      id: `cbr-${t.id}`, date: t.transactionDate, dateImported: t.transactionDate, reconciled: false, source: 'System',
      description: `${dep ? 'Receive money' : 'Spend money'} #${t.number}${t.contact ? ` — ${t.contact}` : ''}`,
      receive: dep ? amt : 0, spent: dep ? 0 : amt,
    })
  }
  for (const tr of internalTransfers) {
    if (!tr.id.startsWith('it-new-')) continue
    if (tr.fromAccountId === a.id) {
      posted.push({ id: `cbr-${tr.id}-out`, date: tr.transactionDate, dateImported: tr.transactionDate, reconciled: false, source: 'System', description: `Internal transfer #${tr.number}`, receive: 0, spent: tr.total })
    }
    tr.lines.forEach((l, i) => {
      if (l.accountId !== a.id) return
      posted.push({ id: `cbr-${tr.id}-in-${i}`, date: tr.transactionDate, dateImported: tr.transactionDate, reconciled: false, source: 'System', description: `Internal transfer #${tr.number}`, receive: l.amount, spent: 0 })
    })
  }
  posted.sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0))
  let bal = rows.length ? rows[rows.length - 1]!.balance : base
  for (const p of posted) { bal = bal + p.receive - p.spent; rows.push({ ...p, balance: bal }) }
  return rows
}

/** Latest record date across the offered accounts — the report's default end date. */
export function cbrLatestDate(): string {
  let max = SIM_TODAY_ISO
  for (const a of cbrAccounts()) for (const r of cbrAllRows(a)) if (r.date > max) max = r.date
  return max
}

export function cashBankReport(accountId: string, startIso: string, endIso: string): CbrReport | null {
  const account = cbrAccounts().find((a) => a.id === accountId)
  if (!account) return null
  const all = cbrAllRows(account)
  const before = all.filter((r) => r.date < startIso)
  const firstBalance = all.length ? all[0]!.balance - all[0]!.receive + all[0]!.spent : account.bookBalance
  const openingBalance = before.length ? before[before.length - 1]!.balance : firstBalance
  const rows = all.filter((r) => r.date >= startIso && r.date <= endIso)
  const closingBalance = rows.length ? rows[rows.length - 1]!.balance : openingBalance
  const report: CbrReport = {
    account, startIso, endIso, openingBalance, rows, closingBalance,
    totalReceive: rows.reduce((s, r) => s + r.receive, 0),
    totalSpent: rows.reduce((s, r) => s + r.spent, 0),
  }
  if (import.meta.dev) assertCashBankReport(report)
  return report
}

/** Dev-time arithmetic check: every running balance = previous + receive − spent,
 *  closing = opening + Σ receive − Σ spent, and — when the period reaches the
 *  latest record — closing = the Book balance Cash management shows. */
export function assertCashBankReport(r: CbrReport): void {
  const fail = (m: string) => { throw new Error(`[cashBankReport] ${r.account.name}: ${m}`) }
  let bal = r.openingBalance
  for (const x of r.rows) {
    bal = bal + x.receive - x.spent
    if (bal !== x.balance) fail(`running balance breaks at ${x.date} ${x.description}`)
  }
  if (r.closingBalance !== r.openingBalance + r.totalReceive - r.totalSpent) fail('closing ≠ opening + receive − spent')
  const all = cbrAllRows(r.account)
  const latest = all.length ? all[all.length - 1]!.date : ''
  if (r.endIso >= latest && r.closingBalance !== r.account.bookBalance) fail(`closing ${r.closingBalance} ≠ book balance ${r.account.bookBalance}`)
}
