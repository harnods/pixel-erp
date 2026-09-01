/**
 * Credit Memo report (Reports › Sales › Credit Memo). Figma 4531-72196.
 *
 * A three-level accordion: Customer → Credit Memo → Applied entries, closed by a
 * per-customer "End balance" row. Numbers are hard-set to match the agreed report
 * (running balance carried down each customer's ledger). Snapshot-persisted saved
 * views (Default + user views) mirror the CRM Customers multiple-view concept.
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

export type CmStatus = 'Open' | 'Closed'

/** A single applied entry beneath a credit memo (level 3). */
export interface CmApplied {
  id: string
  date: string            // ISO
  number: string          // "Credit Memo Applied #12333"
  reference: string       // "Sales Invoice #10222" — shown as a subtitle
  status: CmStatus
  movement: number        // negative — reduces the memo balance
  balance: number         // running balance after this entry
}

/** A credit memo (level 2) with its applied entries. */
export interface CmMemo {
  id: string
  date: string
  number: string          // "Credit Memo #12333"
  description: string     // "Return goods"
  status: CmStatus
  balance: number         // opening balance of the memo
  applied: CmApplied[]
}

/** A customer group (level 1). */
export interface CmCustomer {
  id: string
  name: string
  balance: number         // shown on the collapsed group header (customer total)
  endBalance: number      // the "End balance" footer row
  memos: CmMemo[]
}

const SEED: CmCustomer[] = [
  {
    id: 'hungry-birds', name: 'Hungry birds', balance: 15_000_000, endBalance: 15_000_000,
    memos: [
      {
        id: 'cm-12333', date: '2026-01-29', number: 'Credit Memo #12333', description: 'Return goods',
        status: 'Open', balance: 30_000_000,
        applied: [
          { id: 'cm-12333-a1', date: '2026-01-30', number: 'Credit Memo Applied #12333', reference: 'Sales Invoice #10222', status: 'Closed', movement: -15_000_000, balance: 15_000_000 },
        ],
      },
    ],
  },
  {
    id: 'braud', name: 'BRAUD.', balance: 0, endBalance: 0,
    memos: [
      {
        id: 'cm-10855', date: '2026-01-29', number: 'Credit Memo #10855', description: 'Return goods',
        status: 'Closed', balance: 10_000_000,
        applied: [
          { id: 'cm-10855-a1', date: '2026-01-30', number: 'Credit Memo Applied #10855', reference: 'Sales Invoice #10222', status: 'Closed', movement: -2_500_000, balance: 7_500_000 },
          { id: 'cm-10855-a2', date: '2026-01-31', number: 'Credit Memo Applied #10855', reference: 'Sales Invoice #10332', status: 'Closed', movement: -2_500_000, balance: 5_000_000 },
          { id: 'cm-10855-a3', date: '2026-02-03', number: 'Credit Memo Applied #10855', reference: 'Sales Invoice #10419', status: 'Closed', movement: -2_500_000, balance: 2_500_000 },
          { id: 'cm-10855-a4', date: '2026-02-05', number: 'Credit Memo Applied #10855', reference: 'Sales Invoice #10502', status: 'Closed', movement: -2_500_000, balance: 0 },
        ],
      },
    ],
  },
  {
    id: 'expat-roasters', name: 'EXPAT Roasters', balance: 5_500_000, endBalance: 5_500_000,
    memos: [
      {
        id: 'cm-20911', date: '2026-01-20', number: 'Credit Memo #20911', description: 'Return goods',
        status: 'Open', balance: 8_000_000,
        applied: [
          { id: 'cm-20911-a1', date: '2026-01-24', number: 'Credit Memo Applied #20911', reference: 'Sales Invoice #10501', status: 'Closed', movement: -2_500_000, balance: 5_500_000 },
        ],
      },
    ],
  },
  {
    id: 'greenfields', name: 'Greenfields Dairy Farm', balance: 19_450_000, endBalance: 19_450_000,
    memos: [
      {
        id: 'cm-30777', date: '2026-01-18', number: 'Credit Memo #30777', description: 'Overpayment refund',
        status: 'Open', balance: 22_000_000,
        applied: [
          { id: 'cm-30777-a1', date: '2026-01-22', number: 'Credit Memo Applied #30777', reference: 'Sales Invoice #10620', status: 'Closed', movement: -2_550_000, balance: 19_450_000 },
        ],
      },
    ],
  },
]

export const creditMemoCustomers = reactive<CmCustomer[]>(
  loadSnapshot<CmCustomer>('credit-memo-report-v1') ?? SEED.map((c) => ({ ...c })),
)

// ── Saved views (Default + user views, persisted) — same concept as CRM Customers.
export interface CmViewFilters {
  status: CmStatus[]      // empty = all
  customers: string[]     // customer names; empty = all
  keyword: string
}
export function emptyCmFilters(): CmViewFilters { return { status: [], customers: [], keyword: '' } }
export interface CmSavedView { id: string; name: string; filters: CmViewFilters }

export const creditMemoViews = reactive<CmSavedView[]>(loadSnapshot<CmSavedView>('credit-memo-views-v1') ?? [])
function persistViews() { saveSnapshot('credit-memo-views-v1', creditMemoViews) }
let viewSeq = creditMemoViews.length + 1
export function addCmView(v: Omit<CmSavedView, 'id'>): CmSavedView {
  const view: CmSavedView = { ...v, id: `cmview-${Date.now()}-${viewSeq++}` }
  creditMemoViews.push(view)
  persistViews()
  return view
}
export function updateCmView(id: string, patch: Partial<Omit<CmSavedView, 'id'>>): void {
  const v = creditMemoViews.find((x) => x.id === id)
  if (!v) return
  Object.assign(v, patch)
  persistViews()
}
export function deleteCmView(id: string): void {
  const i = creditMemoViews.findIndex((x) => x.id === id)
  if (i !== -1) { creditMemoViews.splice(i, 1); persistViews() }
}

/** Every distinct customer name — for the All-filters customer picker. */
export function cmCustomerNames(): string[] { return creditMemoCustomers.map((c) => c.name) }
