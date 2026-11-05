/**
 * Reconciliations — the per-account reconciliation workspace (rail + To match /
 * Not reconciled / Matched / Cash mapping). Copies the shape of
 * jurnal-accounting-frontend/src/modules/reconciliation.
 *
 * Everything is DERIVED from the existing cash-management mocks so the two
 * modules always agree: the rail is `cashAccounts` (leaf, non-archived), the
 * book side is `getAccountTransactions` and the cleared bank side is
 * `getBankStatementLines` (same seeded ledger the Cash management detail page
 * renders). The newest `unreconciledCount` book transactions are the pending
 * ones: each gets a bank-statement line on the To match tab, some with an exact
 * match suggestion, some with a potential (pick-the-right-ones) suggestion and
 * some with none — plus a couple of bank-only lines (charges / interest).
 *
 * User actions (match, unmatch, delete, cash-mapping commits) persist through
 * `persist.ts` (loadCreated / saveCreated) and are replayed on top of the seed.
 */
import { reactive } from 'vue'
import { cashAccounts, type CashAccount } from './cashAccounts'
import { getAccountTransactions, getBankStatementLines, type LedgerProfile } from './bankStatementLines'
import { loadCreated, saveCreated } from './persist'

export type ReconDirection = 'in' | 'out'
export type ReconSuggestionType = 'match' | 'potential' | 'none'
export type ReconMethod = 'manual' | 'matched' | 'bank_rule'

export const RECON_METHOD_LABELS: Record<ReconMethod, string> = {
  manual: 'Manual',
  matched: 'Matched',
  bank_rule: 'Bank rule',
}

export interface ReconStatementLine {
  id: string
  accountId: string
  date: string
  description: string
  amount: number
  direction: ReconDirection
  suggestion: { type: ReconSuggestionType; transactionIds: string[] }
}

export interface ReconTransaction {
  id: string
  accountId: string
  date: string
  type: string
  number: number
  contact: string
  description: string
  amount: number
  direction: ReconDirection
}

export interface ReconMatchedPair {
  id: string
  accountId: string
  statementLines: ReconStatementLine[]
  transactions: ReconTransaction[]
  method: ReconMethod
  /** Seed pairs come from the cleared ledger; user pairs from this session. */
  isSeed: boolean
}

/** A match the user made (persisted). Cash-mapping commits carry the transaction they created. */
interface MatchRecord {
  id: string
  accountId: string
  statementLineIds: string[]
  transactionIds: string[]
  method: ReconMethod
  createdTransactions?: ReconTransaction[]
}

// ─── Rail ────────────────────────────────────────────────────────────────────

/** Cash, bank and card accounts that can be reconciled: leaf rows, not archived. */
export function reconRailAccounts(): CashAccount[] {
  const parents = new Set(cashAccounts.map(a => a.parentId).filter(Boolean))
  return cashAccounts.filter(a => !a.isArchived && !parents.has(a.id))
}

export function reconAccount(id: string): CashAccount | undefined {
  return reconRailAccounts().find(a => a.id === id)
}

/** Same ledger profile rule as CashManagementDetailPage, so the documents agree. */
function ledgerProfile(a: CashAccount): LedgerProfile {
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

function bankText(dir: ReconDirection, contact: string): string {
  const name = contact.replace(/\s*\(.*\)\s*/, ' ').trim().toUpperCase()
  return `${dir === 'in' ? 'TRF CR' : 'TRF DB'} ${name}`
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ─── Seed (per account, cached) ──────────────────────────────────────────────

interface AccountSeed {
  transactions: ReconTransaction[]           // every book transaction we know about
  pendingTxIds: string[]                     // not reconciled on the books
  toMatch: ReconStatementLine[]              // unmatched bank lines
  pairs: ReconMatchedPair[]                  // cleared pairs (Matched tab)
}

const seedCache: Record<string, AccountSeed> = {}

function buildSeed(a: CashAccount): AccountSeed {
  // No statement imported (physical cash, fresh wallet) → nothing on the bank side.
  const hasStatement = a.statementBalance !== null && a.hasTransactions !== false
  const profile = ledgerProfile(a)
  const book = a.hasTransactions === false ? [] : getAccountTransactions(a.id, a.bookBalance, a.unreconciledCount, profile)
  const transactions: ReconTransaction[] = book.map(b => ({
    id: b.id, accountId: a.id, date: b.date, type: b.type, number: b.number, contact: b.contact,
    description: `${b.type} — ${b.contact}`,
    amount: b.moneyIn || b.moneyOut,
    direction: b.moneyIn > 0 ? 'in' : 'out',
  }))
  const pending = transactions.slice(0, a.unreconciledCount)
  const toMatch: ReconStatementLine[] = []
  const pairs: ReconMatchedPair[] = []

  if (hasStatement) {
    pending.forEach((tx, i) => {
      const lineId = `${a.id}-bsl-${i}`
      const kind = i % 3
      if (kind === 0) {
        // Exact single match: same amount, cleared a day later.
        toMatch.push({ id: lineId, accountId: a.id, date: shiftDate(tx.date, 1), description: bankText(tx.direction, tx.contact), amount: tx.amount, direction: tx.direction, suggestion: { type: 'match', transactionIds: [tx.id] } })
      } else if (kind === 1) {
        // Potential: the right transaction plus another same-direction candidate.
        const other = pending.find(o => o.id !== tx.id && o.direction === tx.direction)
        toMatch.push({ id: lineId, accountId: a.id, date: tx.date, description: bankText(tx.direction, tx.contact), amount: tx.amount, direction: tx.direction, suggestion: { type: 'potential', transactionIds: other ? [tx.id, other.id] : [tx.id] } })
      } else {
        // Bank feed carries only a reference (no payer name) → no suggestion; reconcile via Find match.
        toMatch.push({ id: lineId, accountId: a.id, date: shiftDate(tx.date, 2), description: `${tx.direction === 'in' ? 'TRF CR' : 'TRF DB'} REF ${tx.number}`, amount: tx.amount, direction: tx.direction, suggestion: { type: 'none', transactionIds: [] } })
      }
    })
    if (pending.length > 0) {
      const latest = pending[0]!.date
      toMatch.push({ id: `${a.id}-bsl-fee`, accountId: a.id, date: latest, description: 'BIAYA ADM BULANAN', amount: 15_000, direction: 'out', suggestion: { type: 'none', transactionIds: [] } })
      toMatch.push({ id: `${a.id}-bsl-int`, accountId: a.id, date: shiftDate(latest, -3), description: 'CR BUNGA JASA GIRO PERIODE BERJALAN — PT CENTRAL PERK INDONESIA CABANG KEMANG', amount: 42_500, direction: 'in', suggestion: { type: 'none', transactionIds: [] } })
    }

    // Cleared slice → Matched tab. Statement line k ↔ ledger event (uc + k).
    const cleared = getBankStatementLines(a.id, a.bookBalance, a.unreconciledCount, profile)
      .filter(l => l.id.startsWith(`${a.id}-stmt-`))
    const methods: ReconMethod[] = ['matched', 'matched', 'manual', 'bank_rule']
    cleared.slice(0, 18).forEach((l, k) => {
      if (l.status === 'deleted') return
      const tx = transactions[a.unreconciledCount + k]
      if (!tx) return
      pairs.push({
        id: `${a.id}-pair-${k}`, accountId: a.id, isSeed: true, method: methods[k % methods.length]!,
        statementLines: [{ id: `${a.id}-cl-${k}`, accountId: a.id, date: l.date, description: l.description, amount: l.moneyIn || l.moneyOut, direction: l.moneyIn > 0 ? 'in' : 'out', suggestion: { type: 'match', transactionIds: [tx.id] } }],
        transactions: [tx],
      })
    })
  }
  return { transactions, pendingTxIds: pending.map(t => t.id), toMatch, pairs }
}

function seedFor(accountId: string): AccountSeed | null {
  const a = reconAccount(accountId)
  if (!a) return null
  return (seedCache[accountId] ??= buildSeed(a))
}

// ─── Persisted user state ────────────────────────────────────────────────────

const MATCHES_KEY = 'reconciliation-matches'
const UNMATCHED_KEY = 'reconciliation-unmatched-seed'
const DELETED_KEY = 'reconciliation-deleted'

const state = reactive({
  matches: loadCreated<MatchRecord>(MATCHES_KEY),
  unmatchedSeed: loadCreated<string>(UNMATCHED_KEY),
  deleted: loadCreated<string>(DELETED_KEY),
})

function persist() {
  saveCreated(MATCHES_KEY, state.matches)
  saveCreated(UNMATCHED_KEY, state.unmatchedSeed)
  saveCreated(DELETED_KEY, state.deleted)
}

function userMatchesFor(accountId: string) { return state.matches.filter(m => m.accountId === accountId) }

// ─── Selectors (reactive — read `state`) ─────────────────────────────────────

export function reconTransactionsById(accountId: string): Record<string, ReconTransaction> {
  const seed = seedFor(accountId)
  const map: Record<string, ReconTransaction> = {}
  seed?.transactions.forEach(t => { map[t.id] = t })
  userMatchesFor(accountId).forEach(m => m.createdTransactions?.forEach(t => { map[t.id] = t }))
  return map
}

/** Bank lines still waiting to be matched (seed lines + lines released by Unmatch). */
export function reconToMatchLines(accountId: string): ReconStatementLine[] {
  const seed = seedFor(accountId)
  if (!seed) return []
  const used = new Set(userMatchesFor(accountId).flatMap(m => m.statementLineIds))
  const released = seed.pairs.filter(p => state.unmatchedSeed.includes(p.id)).flatMap(p => p.statementLines)
  return [...seed.toMatch, ...released]
    .filter(l => !used.has(l.id) && !state.deleted.includes(l.id))
    .sort((x, y) => y.date.localeCompare(x.date))
}

/** Book transactions not reconciled yet. */
export function reconNotReconciled(accountId: string): ReconTransaction[] {
  const seed = seedFor(accountId)
  if (!seed) return []
  const used = new Set(userMatchesFor(accountId).flatMap(m => m.transactionIds))
  const byId = reconTransactionsById(accountId)
  const released = seed.pairs.filter(p => state.unmatchedSeed.includes(p.id)).flatMap(p => p.transactions.map(t => t.id))
  return [...seed.pendingTxIds, ...released]
    .map(id => byId[id]!)
    .filter(t => t && !used.has(t.id) && !state.deleted.includes(t.id))
    .sort((x, y) => y.date.localeCompare(x.date))
}

export function reconMatchedPairs(accountId: string): ReconMatchedPair[] {
  const seed = seedFor(accountId)
  if (!seed) return []
  const byId = reconTransactionsById(accountId)
  const allLines: Record<string, ReconStatementLine> = {}
  ;[...seed.toMatch, ...seed.pairs.flatMap(p => p.statementLines)].forEach(l => { allLines[l.id] = l })
  const user: ReconMatchedPair[] = userMatchesFor(accountId).map(m => ({
    id: m.id, accountId, method: m.method, isSeed: false,
    statementLines: m.statementLineIds.map(id => allLines[id]).filter((l): l is ReconStatementLine => !!l),
    transactions: m.transactionIds.map(id => byId[id]).filter((t): t is ReconTransaction => !!t),
  }))
  const seedPairs = seed.pairs.filter(p => !state.unmatchedSeed.includes(p.id))
  return [...user.reverse(), ...seedPairs]
}

// ─── Mutations (persisted) ───────────────────────────────────────────────────

let seq = Date.now()
function nextId(prefix: string) { seq += 1; return `${prefix}-${seq.toString(36)}` }

export function reconMatch(accountId: string, statementLineIds: string[], transactionIds: string[], method: ReconMethod = 'matched'): void {
  state.matches.push({ id: nextId('match'), accountId, statementLineIds, transactionIds, method })
  persist()
}

/** Cash mapping commit: create a spend/receive money per line and reconcile it. */
export function reconCashMap(accountId: string, coded: { line: ReconStatementLine; account: string; tax: string; memo: string }[]): number {
  coded.forEach(({ line, account, memo }) => {
    const tx: ReconTransaction = {
      id: nextId(`${accountId}-cm`), accountId, date: line.date,
      type: line.direction === 'in' ? 'Receive Money' : 'Spend Money',
      number: 10000 + (seq % 9000), contact: '', description: memo || account,
      amount: line.amount, direction: line.direction,
    }
    state.matches.push({ id: nextId('match'), accountId, statementLineIds: [line.id], transactionIds: [tx.id], method: 'manual', createdTransactions: [tx] })
  })
  persist()
  return coded.length
}

export function reconUnmatch(pair: ReconMatchedPair): void {
  if (pair.isSeed) state.unmatchedSeed.push(pair.id)
  else state.matches = state.matches.filter(m => m.id !== pair.id)
  persist()
}

/** Undo the most recent user match (the toast's Cancel action). */
export function reconUndoLastMatch(accountId: string): void {
  const idx = state.matches.map(m => m.accountId).lastIndexOf(accountId)
  if (idx >= 0) { state.matches.splice(idx, 1); persist() }
}

export function reconDelete(ids: string[]): void {
  state.deleted.push(...ids)
  persist()
}

/** Statement-side totals for the overview strip. */
export function reconSummary(a: CashAccount) {
  const toReconcile = reconToMatchLines(a.id).length
  return {
    statementBalance: a.statementBalance,
    statementDate: a.statementDate,
    bookBalance: a.bookBalance,
    difference: a.statementBalance === null ? null : a.statementBalance - a.bookBalance,
    toReconcile,
  }
}
