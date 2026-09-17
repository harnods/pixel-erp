/**
 * General Ledger report — Reports › Financials › General Ledger.
 * Figma "Report / General Ledger / Activate Dimension" 4345-174595.
 *
 * Every posting for the period, grouped by account: a starting balance, the
 * transactions that hit the account (each with a running balance), then an end
 * balance carrying the period's debit and credit totals. Entries are generated
 * deterministically from (account, period, index) so a given period always
 * renders the same ledger.
 *
 * Lines can carry dimension tags ("Branch: Jakarta"), surfaced by the optional
 * Dimensions column — the report side of the Dimensions feature (see
 * data/dimensions.ts).
 */
import { reportableDimensionsFor, type DimensionTransactionType } from './dimensions'

// ── Filters ──────────────────────────────────────────────────────────────────
export interface GlFilters {
  /** Free-text match against an account's code or name; empty = no filter. */
  accountKeyword: string
  /** Transaction types kept; empty = all of them. */
  types: string[]
  /** Drop accounts with no postings in the period. */
  hideEmpty: boolean
}
export function emptyGlFilters(): GlFilters { return { accountKeyword: '', types: [], hideEmpty: false } }

/** Transaction kinds that post to the ledger, as named in the Figma. */
const ENTRY_TYPES = [
  'Journal Entry', 'Pay Money', 'Receive Money', 'Purchase Invoice',
  'Bank Withdrawal', 'Debit Memo', 'Credit Memo', 'Bank Deposit',
] as const
export type GlEntryType = typeof ENTRY_TYPES[number]

/** Counterparties shown in the Detail column (blank for internal postings). */
const PARTIES = ['Hungry Birds', 'Acme Co.', 'PT Sinar Jaya', 'Central Perk', 'Gudang Garam Mandiri', '']

export interface GlDimensionTag { name: string; value: string }

export interface GlEntry {
  id: string
  /** ISO date (yyyy-mm-dd) of the posting. */
  date: string
  type: GlEntryType
  /** Transaction number as displayed — "Journal Entry #10023". */
  number: string
  /** Counterparty / memo; empty for postings without one. */
  detail: string
  debit: number
  credit: number
  dimensions: GlDimensionTag[]
  /** Running balance after this posting — filled in by `ledgerAccounts()`. */
  balance: number
}

export interface GlAccount {
  code: string
  name: string
  startingBalance: number
  entries: GlEntry[]
  totalDebit: number
  totalCredit: number
  endBalance: number
}

/** The chart-of-accounts slice the report walks. */
const GL_ACCOUNTS: { code: string; name: string; starting: number; count: number }[] = [
  { code: '1-10001', name: 'Cash', starting: 500_000_000, count: 8 },
  { code: '1-10002', name: 'Petty cash', starting: 500_000_000, count: 2 },
  { code: '1-10003', name: 'Giro', starting: 500_000_000, count: 5 },
  { code: '1-10004', name: 'Bank BCA', starting: 1_200_000_000, count: 6 },
  { code: '1-20000', name: 'Accounts receivable', starting: 850_000_000, count: 4 },
  { code: '2-10000', name: 'Accounts payable', starting: -420_000_000, count: 4 },
  { code: '4-10000', name: 'Sales revenue', starting: 0, count: 6 },
  { code: '5-10000', name: 'Cost of goods sold', starting: 0, count: 5 },
  { code: '6-10001', name: 'Salaries and wages', starting: 0, count: 3 },
]

/**
 * Which transaction module each ledger entry type belongs to — so a posting can
 * only carry tags from dimensions that were switched on for THAT transaction
 * type in Settings > Dimensions. Journal entries aren't raised from any of the
 * tagged modules, so they carry no dimensions.
 */
const ENTRY_MODULE: Partial<Record<GlEntryType, DimensionTransactionType>> = {
  'Purchase Invoice': 'purchases',
  'Debit Memo': 'purchases',
  'Receive Money': 'sales',
  'Credit Memo': 'sales',
  'Pay Money': 'expenses',
  'Bank Withdrawal': 'expenses',
  'Bank Deposit': 'expenses',
}

/** Demo dimension tags — used ONLY while the tenant has no reportable
 *  dimensions of its own, so the column still demonstrates something. Mirrors
 *  the Figma's Branch / SBU / Department tags; they carry no transaction-type
 *  scoping because they aren't real dimensions. */
const DEMO_TAGS: { name: string; values: string[] }[] = [
  { name: 'Branch', values: ['Jakarta', 'Bogor', 'Bandung', 'Tasik', 'Jogjakarta'] },
  { name: 'SBU', values: ['Talenta', 'Jurnal', 'Qontak', 'Klikpajak'] },
  { name: 'Department', values: ['Marketing', 'Finance', 'Operations', 'Sales'] },
  { name: 'Office floor', values: ['15th floor', '16th floor', 'Warehouse'] },
  { name: 'Scope', values: ['Workshop', 'Retail', 'Project'] },
]

/** True while no reportable dimension exists — the report falls back to demo tags. */
function usingDemoTags(): boolean {
  return (['sales', 'purchases', 'expenses', 'stock-adjustment'] as DimensionTransactionType[])
    .every((m) => reportableDimensionsFor(m).length === 0)
}

/** The dimensions a posting of this type can be tagged with. */
function tagSourcesFor(type: GlEntryType): { name: string; values: string[] }[] {
  if (usingDemoTags()) return DEMO_TAGS
  const mod = ENTRY_MODULE[type]
  if (!mod) return []
  return reportableDimensionsFor(mod).map((d) => ({ name: d.name, values: d.values.map((v) => v.name) }))
}

/** FNV-1a — stable across reloads, so a period always renders the same ledger. */
function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return h >>> 0
}
function pick<T>(arr: readonly T[], seed: number): T { return arr[seed % arr.length]! }
function roundish(n: number): number { return Math.round(n / 500_000) * 500_000 }

function fmtIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * The ledger for one period. Entries land on descending dates inside the window
 * (newest first, as in the Figma); each carries a running balance from the
 * account's starting balance.
 */
export function ledgerAccounts(range: Date[], showDimensions = true): GlAccount[] {
  const [start, end] = range
  if (!start || !end) return []
  const periodKey = `${fmtIso(start)}..${fmtIso(end)}`
  const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1)

  return GL_ACCOUNTS.map((acc) => {
    // Build the postings first, then order them newest-first, and only then run
    // the balance down the rows — so the Balance column reads consistently top
    // to bottom the way the report is displayed.
    const entries: GlEntry[] = Array.from({ length: acc.count }, (_, i) => {
      const h = hash(`${acc.code}|${periodKey}|${i}`)
      const type = pick(ENTRY_TYPES, h)
      const dayOffset = Math.min(spanDays - 1, Math.floor((h >>> 4) % spanDays) + i)
      const date = new Date(end.getTime() - dayOffset * 86_400_000)
      // Money in (debit) vs money out (credit) — one side is always zero.
      const isDebit = (h >>> 8) % 2 === 0
      const magnitude = roundish(2_500_000 + ((h >>> 12) % 800) * 500_000)

      // 0–3 tags per line, drawn from the dimensions that apply to THIS
      // posting's transaction type — a journal entry (no owning module) or a
      // module with no dimensions switched on simply carries none.
      const sources = tagSourcesFor(type)
      const tagCount = showDimensions ? (h >>> 20) % 4 : 0
      const dimensions: GlDimensionTag[] = Array.from({ length: Math.min(tagCount, sources.length) }, (_, k) => {
        const src = sources[(((h >>> 22) % sources.length) + k) % sources.length]!
        return { name: src.name, value: pick(src.values, (h >>> (3 * k)) + k) }
      })

      return {
        id: `${acc.code}-${i}`,
        date: fmtIso(date),
        type,
        number: `${type} #${10_000 + ((h >>> 16) % 9000)}`,
        detail: pick(PARTIES, h >>> 6),
        debit: isDebit ? magnitude : 0,
        credit: isDebit ? 0 : magnitude,
        dimensions,
        balance: 0,
      }
    }).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))

    let balance = acc.starting
    let totalDebit = 0
    let totalCredit = 0
    for (const e of entries) {
      balance += e.debit - e.credit
      totalDebit += e.debit
      totalCredit += e.credit
      e.balance = balance
    }

    return { code: acc.code, name: acc.name, startingBalance: acc.starting, entries, totalDebit, totalCredit, endBalance: balance }
  })
}
