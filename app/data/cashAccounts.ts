/**
 * Cash management — the cash/bank/card accounts listed on /cash-management.
 *
 * Balances are kept as plain numbers so the table can sort them; the page
 * formats them for display. Two currencies are carried per row because an
 * account's imported statement isn't always denominated in the account's own
 * currency (see DBS Singapore below) — `statementCurrency` falls back to
 * `currency` when it isn't set.
 */

export type CashAccountCurrency = 'IDR' | 'SGD' | 'USD' | 'AUD'

export interface CashAccount {
  id: string
  /** Chart-of-accounts code, e.g. '1-10001' (1-xxxxx = asset, 2-xxxxx = liability). */
  code: string
  name: string
  /** Bank account / card number shown under the name. Cash accounts have none. */
  accountNumber?: string
  /** True for accounts linked through a bank feed — shows the "Connected" badge. */
  isConnected?: boolean
  /** Remaining bank-feed syncs this cycle (connected accounts only). 0 = quota
   *  exhausted → each further sync is charged. */
  syncRemaining?: number
  /** Total syncs per cycle (connected accounts only). */
  syncTotal?: number
  currency: CashAccountCurrency
  /** null when no bank statement has been imported yet. */
  statementBalance: number | null
  /** Currency of the imported statement. Defaults to `currency`. */
  statementCurrency?: CashAccountCurrency
  /** Date of the imported statement (ISO). Absent when there is no statement. */
  statementDate?: string
  bookBalance: number
  /** Unreconciled transactions waiting on this account — the Reconcile (n) count. */
  unreconciledCount: number
  /**
   * Parent account id for sub-accounts (see the Mandiri Office group). Absent on
   * top-level accounts. A parent that has children is rendered as an expandable
   * group row rather than a reconcilable account.
   */
  parentId?: string
  /** Last time the account or its statement was updated (ISO). */
  lastUpdated?: string
  /**
   * True when the account has posted journal entries. Accounts with recorded
   * transactions can't be archived or deleted (the row menu disables those with
   * a tooltip). Absent = treated as having transactions.
   */
  hasTransactions?: boolean
  isArchived?: boolean
}

export const cashAccounts: CashAccount[] = [
  // Physical cash — never has a bank statement, so nothing to reconcile.
  { id: 'CA001', code: '1-10001', name: 'Cash',                                                          currency: 'IDR', statementBalance: null,                                     bookBalance: 15_000_000,   unreconciledCount: 0,  lastUpdated: '2026-08-12T09:15:00' },
  { id: 'CA002', code: '1-10002', name: 'Petty Cash',                                                    currency: 'IDR', statementBalance: null,                                     bookBalance: 15_000_000,   unreconciledCount: 0,  lastUpdated: '2026-07-28T14:40:00' },
  { id: 'CA003', code: '1-10003', name: 'Bank BCA',        accountNumber: '5485079642', isConnected: true, syncRemaining: 400, syncTotal: 500, currency: 'IDR', statementBalance: 163_835_000,  statementDate: '2026-02-05', bookBalance: 139_025_000,  unreconciledCount: 10, lastUpdated: '2026-08-13T08:05:00' },

  // Connected account whose sync quota is exhausted — hovering "Last updated…"
  // warns that further syncs are charged.
  { id: 'CA010', code: '1-10009', name: 'Bank CIMB Niaga', accountNumber: '8730054219', isConnected: true, syncRemaining: 0,   syncTotal: 500, currency: 'IDR', statementBalance: 92_400_000,   statementDate: '2026-02-05', bookBalance: 88_150_000,   unreconciledCount: 4,  lastUpdated: '2026-08-13T07:40:00' },
  { id: 'CA004', code: '1-10004', name: 'DBS Singapore',   accountNumber: '0661089145',                  currency: 'SGD', statementBalance: 155_000_000,  statementCurrency: 'IDR', statementDate: '2025-12-20', bookBalance: 6_000,  unreconciledCount: 1, lastUpdated: '2025-12-20T11:20:00' },

  // Mandiri Office — a parent account with nested sub-accounts (see Figma 5527-171257).
  { id: 'CA-MO',  code: '1-100061',    name: 'Mandiri Office',                                            currency: 'IDR', statementBalance: null,                                     bookBalance: 189_000_000, unreconciledCount: 0,  lastUpdated: '2026-08-11T16:30:00' },
  { id: 'CA-MSO', code: '1-1000611',   name: 'Mandiri Sales Ops',  parentId: 'CA-MO',                     currency: 'IDR', statementBalance: null,                                     bookBalance: 94_000_000,  unreconciledCount: 0,  lastUpdated: '2026-08-11T16:30:00' },
  { id: 'CA-MU',  code: '1-10006111',  name: 'Mandiri Utilities',  accountNumber: '0661089145', parentId: 'CA-MSO', currency: 'IDR', statementBalance: 60_000_000, statementDate: '2025-12-20', bookBalance: 54_000_000,  unreconciledCount: 1,  lastUpdated: '2026-08-10T10:00:00' },
  { id: 'CA-MT',  code: '1-10006112',  name: 'Mandiri Transport',  accountNumber: '0661089145', parentId: 'CA-MSO', currency: 'IDR', statementBalance: 40_000_000, statementDate: '2025-12-20', bookBalance: 40_000_000,  unreconciledCount: 0,  lastUpdated: '2026-08-10T10:00:00' },
  { id: 'CA-MH',  code: '1-1000612',   name: 'Mandiri HRBP',       parentId: 'CA-MO',                     currency: 'IDR', statementBalance: null,                                     bookBalance: 35_000_000,  unreconciledCount: 0,  lastUpdated: '2026-08-09T13:45:00' },
  { id: 'CA-MH1', code: '1-10006121',  name: 'Mandiri HRBP Ops',   accountNumber: '0661089150', parentId: 'CA-MH',  currency: 'IDR', statementBalance: 20_000_000, statementDate: '2025-12-18', bookBalance: 20_000_000,  unreconciledCount: 0,  lastUpdated: '2026-08-09T13:45:00' },
  { id: 'CA-MH2', code: '1-10006122',  name: 'Mandiri HRBP Admin', accountNumber: '0661089151', parentId: 'CA-MH',  currency: 'IDR', statementBalance: 15_000_000, statementDate: '2025-12-18', bookBalance: 15_000_000,  unreconciledCount: 0,  lastUpdated: '2026-08-09T13:45:00' },
  { id: 'CA-MF',  code: '1-1000613',   name: 'Mandiri Finance',    accountNumber: '0661089145', parentId: 'CA-MO',  currency: 'IDR', statementBalance: 0,          statementDate: '2026-01-31', bookBalance: 0,           unreconciledCount: 15, lastUpdated: '2026-08-08T09:30:00' },

  { id: 'CA005', code: '2-10001', name: 'BCA Corporate Card', accountNumber: '****9645',                 currency: 'IDR', statementBalance: -32_000_000,  statementDate: '2026-01-02', bookBalance: -10_000_000,  unreconciledCount: 1,  lastUpdated: '2026-01-02T17:00:00' },

  // Fresh account with no posted transactions — can be archived AND deleted.
  { id: 'CA009', code: '1-10008', name: 'New Cash Wallet',                                                currency: 'IDR', statementBalance: null,                                     bookBalance: 0,           unreconciledCount: 0,  hasTransactions: false, lastUpdated: '2026-08-13T10:00:00' },

  // Archived — hidden until the "Show archived accounts" toggle is on.
  { id: 'CA006', code: '1-10005', name: 'Bank Mandiri (closed)', accountNumber: '1440009823',            currency: 'IDR', statementBalance: 0,            statementDate: '2025-09-30', bookBalance: 0,            unreconciledCount: 0, isArchived: true, lastUpdated: '2025-09-30T12:00:00' },
  { id: 'CA007', code: '1-10006', name: 'Cash Drawer — Kemang',                                          currency: 'IDR', statementBalance: null,                                     bookBalance: 2_500_000,    unreconciledCount: 0, isArchived: true, lastUpdated: '2025-11-15T15:10:00' },
]

/** Append a freshly-created account so the index (which seeds from this array on
 *  mount) shows it after navigating back. Returns the created record. */
export function addCashAccount(input: Omit<CashAccount, 'id'> & { id?: string }): CashAccount {
  const account: CashAccount = { ...input, id: input.id ?? `CA${String(cashAccounts.length + 1).padStart(3, '0')}` }
  cashAccounts.push(account)
  return account
}
