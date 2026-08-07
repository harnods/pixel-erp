/**
 * Cash management — the cash/bank/card accounts listed on /cash-management.
 *
 * Balances are kept as plain numbers so the table can sort them; the page
 * formats them for display. Two currencies are carried per row because an
 * account's imported statement isn't always denominated in the account's own
 * currency (see DBS Singapore below) — `statementCurrency` falls back to
 * `currency` when it isn't set.
 */

export type CashAccountCurrency = 'IDR' | 'SGD' | 'USD'

export interface CashAccount {
  id: string
  /** Chart-of-accounts code, e.g. '1-10001' (1-xxxxx = asset, 2-xxxxx = liability). */
  code: string
  name: string
  /** Bank account / card number shown under the name. Cash accounts have none. */
  accountNumber?: string
  /** True for accounts linked through a bank feed — shows the "Connected" badge. */
  isConnected?: boolean
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
  isArchived?: boolean
}

export const cashAccounts: CashAccount[] = [
  { id: 'CA001', code: '1-10001', name: 'Cash',                                                          currency: 'IDR', statementBalance: 15_000_000,   statementDate: '2026-01-05', bookBalance: 15_000_000,   unreconciledCount: 50 },
  { id: 'CA002', code: '1-10002', name: 'Petty Cash',                                                    currency: 'IDR', statementBalance: null,                                     bookBalance: 15_000_000,   unreconciledCount: 0  },
  { id: 'CA003', code: '1-10003', name: 'Bank BCA',        accountNumber: '5485079642', isConnected: true, currency: 'IDR', statementBalance: 163_835_000,  statementDate: '2026-02-05', bookBalance: 139_025_000,  unreconciledCount: 10 },
  { id: 'CA004', code: '1-10004', name: 'DBS Singapore',   accountNumber: '0661089145',                  currency: 'SGD', statementBalance: 155_000_000,  statementCurrency: 'IDR', statementDate: '2025-12-20', bookBalance: 6_000,  unreconciledCount: 1 },
  { id: 'CA005', code: '2-10001', name: 'BCA Corporate Card', accountNumber: '****9645',                 currency: 'IDR', statementBalance: -32_000_000,  statementDate: '2026-01-02', bookBalance: -10_000_000,  unreconciledCount: 1  },

  // Archived — hidden until the "Show archived accounts" toggle is on.
  { id: 'CA006', code: '1-10005', name: 'Bank Mandiri (closed)', accountNumber: '1440009823',            currency: 'IDR', statementBalance: 0,            statementDate: '2025-09-30', bookBalance: 0,            unreconciledCount: 0, isArchived: true },
  { id: 'CA007', code: '1-10006', name: 'Cash Drawer — Kemang',                                          currency: 'IDR', statementBalance: null,                                     bookBalance: 2_500_000,    unreconciledCount: 0, isArchived: true },
]
