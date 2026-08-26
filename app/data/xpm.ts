/**
 * xpm.ts — mock data for the XPM (Mekari Expense) scenario.
 *
 * Plain reactive arrays, mirroring the rest of app/data/*. Everything is anchored
 * to the scenario "today" of Tue, 21 Jul 2026 so the figures across Home,
 * Transactions, Claims, Cards and Budgeting stay coherent. No backend — this is
 * the single source the XPM pages read from.
 */
import { reactive } from 'vue'
import { loadSnapshot, saveSnapshot } from './persist'

// ── Transactions (ledger) ──────────────────────────────────────────────────────
export type XpmTxnSource = 'Card' | 'Reimbursement' | 'Cash advance' | 'Bill' | 'Travel'
export interface XpmTransaction {
  id: string
  date: string            // ISO
  source: XpmTxnSource
  description: string
  name: string
  account: string
  status: string
  amount: number
}
export const xpmTransactions: XpmTransaction[] = [
  { id: 'TX-90142', date: '2026-07-21T09:12:00', source: 'Card',          description: 'Adobe Creative Cloud renewal', name: 'Priya Sharma',  account: 'Card float',        status: 'Cleared',          amount: 899000 },
  { id: 'TX-90141', date: '2026-07-21T08:40:00', source: 'Reimbursement', description: 'Client dinner — Nobu Downtown', name: 'Maya Chen',     account: 'Reimbursement pool', status: 'Awaiting approval', amount: 1840000 },
  { id: 'TX-90140', date: '2026-07-20T16:22:00', source: 'Travel',        description: 'Flight SFO → JFK, onsite week', name: 'Daniel Reyes',  account: 'Main account',      status: 'Awaiting disburse', amount: 4125000 },
  { id: 'TX-90139', date: '2026-07-20T14:05:00', source: 'Bill',          description: 'AWS — July invoice',           name: 'Finance',       account: 'Main account',      status: 'Paid',             amount: 38200000 },
  { id: 'TX-90138', date: '2026-07-20T11:48:00', source: 'Card',          description: 'Figma annual seats',           name: 'Marketing card', account: 'Card float',        status: 'Cleared',          amount: 5100000 },
  { id: 'TX-90137', date: '2026-07-19T17:30:00', source: 'Cash advance',  description: 'Site visit per-diem — Bandung', name: 'Tom Okafor',    account: 'Main account',      status: 'Disbursed',        amount: 1500000 },
  { id: 'TX-90136', date: '2026-07-19T10:14:00', source: 'Reimbursement', description: 'Team offsite venue deposit',   name: 'Tom Okafor',    account: 'Reimbursement pool', status: 'Awaiting approval', amount: 1250000 },
  { id: 'TX-90135', date: '2026-07-18T15:02:00', source: 'Bill',          description: 'Office rent — Q3',             name: 'Finance',       account: 'Main account',      status: 'Booked',           amount: 42000000 },
  { id: 'TX-90134', date: '2026-07-18T09:20:00', source: 'Card',          description: 'Google Workspace',             name: 'IT card',       account: 'Card float',        status: 'Cleared',          amount: 2400000 },
  { id: 'TX-90133', date: '2026-07-17T13:41:00', source: 'Travel',        description: 'Hotel — Grand Hyatt, 2 nights', name: 'Daniel Reyes',  account: 'Main account',      status: 'Settled',          amount: 3200000 },
  { id: 'TX-90132', date: '2026-07-17T08:55:00', source: 'Reimbursement', description: 'Parking — client meeting',     name: 'Indah Permata', account: 'Reimbursement pool', status: 'Disbursed',        amount: 45000 },
  { id: 'TX-90131', date: '2026-07-16T18:10:00', source: 'Card',          description: 'LinkedIn Recruiter',           name: 'People card',   account: 'Card float',        status: 'Cleared',          amount: 12800000 },
]

// ── Wallets / Accounts (accurate ledger, persisted to the mini-DB) ──────────────
// Balances are NOT hardcoded — they are DERIVED from a real movement ledger
// (opening balance + running in/out). Top-ups and transfers append movements and
// persist them, so the numbers stay internally consistent and survive a refresh
// (and reset with "Reset demo data"). Primary currency is IDR; a wallet may carry
// extra static foreign balances (USD/SGD) surfaced in the sidemenu only.
export interface XpmWalletBalance { currency: string; amount: number }
export interface XpmWallet {
  id: string
  name: string
  tag: string
  isDefault?: boolean
  type: string
  description: string
  currency: string                 // primary ledger currency
  opening: number                  // opening balance for the primary-currency ledger
  pendingPayouts: number           // real figure surfaced in the stats strip
  secondary?: XpmWalletBalance[]    // extra static foreign balances (display only)
}
export const xpmWallets: XpmWallet[] = [
  { id: 'w-main',  name: 'Main account',       tag: 'Primary wallet', isDefault: true, type: 'Primary',   currency: 'IDR', opening: 5000000, pendingPayouts: 1000000, description: 'Company operating wallet — funds payouts and card floats.', secondary: [{ currency: 'USD', amount: 930 }] },
  { id: 'w-reimb', name: 'Reimbursement pool', tag: 'Sub-wallet',                      type: 'Sub-wallet', currency: 'IDR', opening: 4000000, pendingPayouts: 1238823, description: 'Dedicated pool for approved employee reimbursements.' },
  { id: 'w-card',  name: 'Card float',          tag: 'Sub-wallet',                     type: 'Sub-wallet', currency: 'IDR', opening: 5000000, pendingPayouts: 0,       description: 'Balance that funds virtual and physical spending cards.', secondary: [{ currency: 'SGD', amount: 120 }] },
]

export type XpmMovementCategory = 'Top-up' | 'Payment' | 'FX' | 'Payout' | 'Transfer'
export interface XpmMovement {
  id: string
  walletId: string
  date: string          // ISO date (anchored to Jul 2026 = "this month")
  description: string
  category: XpmMovementCategory
  direction: 'in' | 'out'
  amount: number
  currency: string
}

// Seed ledger — chronological (oldest first). Running balances are computed, never
// stored, so they can never drift from the movements.
const SEED_WALLET_MOVEMENTS: XpmMovement[] = [
  // Main account (opening 5.000.000)
  { id: 'M001', walletId: 'w-main', date: '2026-07-16', description: 'Refund — cancelled booking', category: 'Payment', direction: 'in',  amount: 1000000, currency: 'IDR' },
  { id: 'M002', walletId: 'w-main', date: '2026-07-17', description: 'Vendor payout — PT Sinar Jaya', category: 'Payment', direction: 'out', amount: 2500000, currency: 'IDR' },
  { id: 'M003', walletId: 'w-main', date: '2026-07-18', description: 'Card float replenish', category: 'Transfer', direction: 'out', amount: 2000000, currency: 'IDR' },
  { id: 'M004', walletId: 'w-main', date: '2026-07-19', description: 'Top up — Bank transfer', category: 'Top-up', direction: 'in',  amount: 10000000, currency: 'IDR' },
  { id: 'M005', walletId: 'w-main', date: '2026-07-20', description: 'AWS — July invoice', category: 'Payment', direction: 'out', amount: 8000000, currency: 'IDR' },
  { id: 'M006', walletId: 'w-main', date: '2026-07-21', description: 'Top up — Bank transfer', category: 'Top-up', direction: 'in',  amount: 5000000, currency: 'IDR' },
  // Reimbursement pool (opening 4.000.000)
  { id: 'M010', walletId: 'w-reimb', date: '2026-07-17', description: 'Top up from Main account', category: 'Transfer', direction: 'in',  amount: 3000000, currency: 'IDR' },
  { id: 'M011', walletId: 'w-reimb', date: '2026-07-18', description: 'Payout — Indah Permata', category: 'Payout', direction: 'out', amount: 450000, currency: 'IDR' },
  { id: 'M012', walletId: 'w-reimb', date: '2026-07-19', description: 'Payout — Tom Okafor', category: 'Payout', direction: 'out', amount: 1250000, currency: 'IDR' },
  { id: 'M013', walletId: 'w-reimb', date: '2026-07-20', description: 'Top up from Main account', category: 'Transfer', direction: 'in',  amount: 2000000, currency: 'IDR' },
  { id: 'M014', walletId: 'w-reimb', date: '2026-07-21', description: 'Payout — Maya Chen', category: 'Payout', direction: 'out', amount: 1840000, currency: 'IDR' },
  // Card float (opening 5.000.000)
  { id: 'M020', walletId: 'w-card', date: '2026-07-16', description: 'Google Workspace', category: 'Payment', direction: 'out', amount: 2400000, currency: 'IDR' },
  { id: 'M021', walletId: 'w-card', date: '2026-07-18', description: 'Card float replenish', category: 'Transfer', direction: 'in',  amount: 4000000, currency: 'IDR' },
  { id: 'M022', walletId: 'w-card', date: '2026-07-19', description: 'Figma annual seats', category: 'Payment', direction: 'out', amount: 5100000, currency: 'IDR' },
  { id: 'M023', walletId: 'w-card', date: '2026-07-20', description: 'Adobe Creative Cloud renewal', category: 'Payment', direction: 'out', amount: 899000, currency: 'IDR' },
  { id: 'M024', walletId: 'w-card', date: '2026-07-21', description: 'Card float replenish', category: 'Transfer', direction: 'in',  amount: 2000000, currency: 'IDR' },
]

/** Persisted movement ledger — snapshot wins over the seed; reset restores seed. */
export const xpmWalletMovements = reactive<XpmMovement[]>(
  loadSnapshot<XpmMovement>('xpm-wallet-movements') ?? JSON.parse(JSON.stringify(SEED_WALLET_MOVEMENTS)),
)
function persistMovements() { saveSnapshot('xpm-wallet-movements', xpmWalletMovements) }

let movementSeq = xpmWalletMovements.reduce((max, m) => Math.max(max, Number(m.id.replace(/\D/g, '')) || 0), 100)
function nextMovementId() { return 'M' + (++movementSeq) }

/** The scenario's "today" — all seed movements fall in this month. */
export const XPM_TODAY = '2026-07-21'

interface XpmMovementWithBalance extends XpmMovement { balance: number }
/** Compute the running ledger for a wallet+currency (chronological). */
function walletLedger(walletId: string, currency = 'IDR'): { opening: number; rows: XpmMovementWithBalance[]; balance: number } {
  const opening = xpmWallets.find(w => w.id === walletId)?.opening ?? 0
  const rows = xpmWalletMovements
    .filter(m => m.walletId === walletId && m.currency === currency)
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
  let bal = opening
  const withBal = rows.map(m => { bal += m.direction === 'in' ? m.amount : -m.amount; return { ...m, balance: bal } })
  return { opening, rows: withBal, balance: bal }
}

/** Current derived balance for a wallet's primary currency. */
export function walletBalance(walletId: string, currency = 'IDR'): number {
  return walletLedger(walletId, currency).balance
}
/** Movement rows for the table — newest first, each with its running balance. */
export function walletMovements(walletId: string, currency = 'IDR'): XpmMovementWithBalance[] {
  return walletLedger(walletId, currency).rows.slice().reverse()
}
/** Cash-flow window options for the stats strip. Balance & pending are always
 *  point-in-time; only Money in / Money out are scoped by this window. */
export type XpmStatsPeriod = 'This month' | 'Last month' | 'Last 30 days' | 'This quarter' | 'All time'
export const XPM_STATS_PERIODS: XpmStatsPeriod[] = ['This month', 'Last month', 'Last 30 days', 'This quarter', 'All time']

function inStatsPeriod(dateISO: string, period: XpmStatsPeriod): boolean {
  if (period === 'All time') return true
  const [ty, tm, td] = XPM_TODAY.split('-').map(Number) as [number, number, number]
  const [dy, dm] = dateISO.split('-').map(Number) as [number, number, number]
  if (period === 'This month') return dy === ty && dm === tm
  if (period === 'Last month') { const lm = tm === 1 ? 12 : tm - 1; const ly = tm === 1 ? ty - 1 : ty; return dy === ly && dm === lm }
  if (period === 'This quarter') { const q0 = Math.floor((tm - 1) / 3) * 3 + 1; return dy === ty && dm >= q0 && dm <= q0 + 2 }
  // Last 30 days — inclusive rolling window ending on XPM_TODAY.
  const today = Date.UTC(ty, tm - 1, td)
  const d = Date.UTC(dy, dm - 1, Number(dateISO.split('-')[2]))
  return d <= today && d >= today - 30 * 86400000
}

/** Stats strip figures — balance/pending are point-in-time; money in/out are
 *  scoped to `period` (default "This month"), all derived from the ledger. */
export function walletStats(walletId: string, currency = 'IDR', period: XpmStatsPeriod = 'This month') {
  const { rows, balance } = walletLedger(walletId, currency)
  const scoped = rows.filter(r => inStatsPeriod(r.date, period))
  const monthIn = scoped.filter(r => r.direction === 'in').reduce((s, r) => s + r.amount, 0)
  const monthOut = scoped.filter(r => r.direction === 'out').reduce((s, r) => s + r.amount, 0)
  const pending = xpmWallets.find(w => w.id === walletId)?.pendingPayouts ?? 0
  return { balance, pending, monthIn, monthOut }
}
/** Display balances for the sidemenu: derived primary + any static foreign ones. */
export function walletDisplayBalances(wallet: XpmWallet): XpmWalletBalance[] {
  return [{ currency: wallet.currency, amount: walletBalance(wallet.id, wallet.currency) }, ...(wallet.secondary ?? [])]
}
/** Sum of all wallets' primary-currency balances (for the "All wallets ≈" line). */
export function walletsTotalPrimary(): number {
  return xpmWallets.reduce((s, w) => s + walletBalance(w.id, w.currency), 0)
}

/** Top up a wallet — appends an in-movement and persists. */
export function topUpWallet(walletId: string, amount: number, source = 'Bank transfer', note?: string) {
  if (!(amount > 0)) return
  xpmWalletMovements.push({ id: nextMovementId(), walletId, date: XPM_TODAY, description: note?.trim() ? note.trim() : `Top up — ${source}`, category: 'Top-up', direction: 'in', amount, currency: 'IDR' })
  persistMovements()
}
/** Move money between wallets — appends the paired out/in movements and persists. */
export function moveMoneyBetween(fromId: string, toId: string, amount: number, note?: string) {
  if (!(amount > 0) || fromId === toId) return
  const nameOf = (id: string) => xpmWallets.find(w => w.id === id)?.name ?? id
  xpmWalletMovements.push({ id: nextMovementId(), walletId: fromId, date: XPM_TODAY, description: note?.trim() ? note.trim() : `Transfer to ${nameOf(toId)}`, category: 'Transfer', direction: 'out', amount, currency: 'IDR' })
  xpmWalletMovements.push({ id: nextMovementId(), walletId: toId,   date: XPM_TODAY, description: note?.trim() ? note.trim() : `Transfer from ${nameOf(fromId)}`, category: 'Transfer', direction: 'in',  amount, currency: 'IDR' })
  persistMovements()
}

// ── Claims (admin index) ───────────────────────────────────────────────────────
export interface XpmClaim {
  id: string
  requestDate: string
  claimType: 'Reimbursement' | 'Cash advance'
  category: string
  subCategory: string
  status: string
  amount: number
  flagged?: boolean
}
export const xpmClaims: XpmClaim[] = [
  { id: 'RB-64512', requestDate: '2026-07-21T14:37:00', claimType: 'Reimbursement', category: 'Meals & entertainment', subCategory: 'Client dinner',  status: 'Awaiting approval',      amount: 1840000, flagged: true },
  { id: 'CA-64511', requestDate: '2026-07-21T11:02:00', claimType: 'Cash advance',  category: 'Travel',                subCategory: 'Per-diem',       status: 'Awaiting approval',      amount: 1500000 },
  { id: 'RB-64510', requestDate: '2026-07-20T16:18:00', claimType: 'Reimbursement', category: 'Software',              subCategory: 'Subscription',   status: 'Awaiting disbursement',  amount: 899000, flagged: true },
  { id: 'RB-64509', requestDate: '2026-07-20T09:41:00', claimType: 'Reimbursement', category: 'Transportation',        subCategory: 'Parking',        status: 'Disbursed',              amount: 45000 },
  { id: 'CA-64508', requestDate: '2026-07-19T15:55:00', claimType: 'Cash advance',  category: 'Travel',                subCategory: 'Lodging',        status: 'Settled',                amount: 3200000 },
  { id: 'RB-64507', requestDate: '2026-07-19T10:30:00', claimType: 'Reimbursement', category: 'Meals & entertainment', subCategory: 'Team outing',    status: 'Awaiting approval',      amount: 1250000, flagged: true },
  { id: 'RB-64506', requestDate: '2026-07-18T13:12:00', claimType: 'Reimbursement', category: 'Office supplies',       subCategory: 'Stationery',     status: 'Declined',               amount: 320000 },
  { id: 'RB-64505', requestDate: '2026-07-18T08:47:00', claimType: 'Reimbursement', category: 'Transportation',        subCategory: 'Toll fee',       status: 'Disbursed',              amount: 68000 },
  { id: 'CA-64504', requestDate: '2026-07-17T17:05:00', claimType: 'Cash advance',  category: 'Travel',                subCategory: 'Per-diem',       status: 'Awaiting disbursement',  amount: 55000 },
  { id: 'RB-64503', requestDate: '2026-07-17T11:20:00', claimType: 'Reimbursement', category: 'Software',              subCategory: 'Subscription',   status: 'Settled',                amount: 741000 },
]

// My claims (requester's own) — reuse the shape with a friendlier status set.
export const xpmMyClaims: XpmClaim[] = [
  { id: 'RB-64512', requestDate: '2026-07-21T14:37:00', claimType: 'Reimbursement', category: 'Transportation',        subCategory: 'Car rental',   status: 'Awaiting approval',     amount: 1840000 },
  { id: 'RB-64498', requestDate: '2026-07-15T10:11:00', claimType: 'Reimbursement', category: 'Software',              subCategory: 'Subscription', status: 'Awaiting disbursement', amount: 899000 },
  { id: 'CA-64488', requestDate: '2026-07-10T09:02:00', claimType: 'Cash advance',  category: 'Travel',                subCategory: 'Per-diem',     status: 'Settled',               amount: 1317260 },
  { id: 'RB-64470', requestDate: '2026-07-02T16:40:00', claimType: 'Reimbursement', category: 'Meals & entertainment', subCategory: 'Client dinner', status: 'Disbursed',            amount: 741000 },
]

// ── Cards ──────────────────────────────────────────────────────────────────────
export interface XpmCard {
  id: string
  name: string
  cardholder: string
  cardholderCode: string
  expiration: string
  balance: number
  account: string
  status: 'Active' | 'Inactive' | 'Frozen'
  type: 'Virtual' | 'Physical'
  last4: string
}
export const xpmCards: XpmCard[] = [
  { id: 'C-2104', name: 'Marketing subscriptions', cardholder: 'Priya Sharma',  cardholderCode: 'CP021', expiration: '06/26', balance: 100000000, account: 'Card float',        status: 'Active',   type: 'Virtual',  last4: '2104' },
  { id: 'C-3391', name: 'Engineering tools',       cardholder: 'Daniel Reyes',  cardholderCode: 'CP044', expiration: '09/27', balance: 24500000,  account: 'Card float',        status: 'Active',   type: 'Virtual',  last4: '3391' },
  { id: 'C-5567', name: 'People & recruiting',     cardholder: 'Maya Chen',     cardholderCode: 'CP012', expiration: '01/27', balance: 8200000,   account: 'Reimbursement pool', status: 'Inactive', type: 'Virtual',  last4: '5567' },
  { id: 'C-6620', name: 'Ads — performance',       cardholder: 'Tom Okafor',    cardholderCode: 'CP038', expiration: '11/26', balance: 1240000,   account: 'Card float',        status: 'Active',   type: 'Virtual',  last4: '6620' },
  { id: 'C-7788', name: 'Design suite',            cardholder: 'Indah Permata', cardholderCode: 'CP067', expiration: '03/27', balance: 620000,    account: 'Card float',        status: 'Frozen',   type: 'Virtual',  last4: '7788' },
  { id: 'C-9001', name: 'Ops — corporate',         cardholder: 'Rizal Candra',  cardholderCode: 'CP001', expiration: '08/28', balance: 45000000,  account: 'Main account',      status: 'Active',   type: 'Physical', last4: '9001' },
  { id: 'C-9002', name: 'Facilities',              cardholder: 'Eka Setiawan',  cardholderCode: 'CP065', expiration: '05/27', balance: 3100000,   account: 'Card float',        status: 'Inactive', type: 'Physical', last4: '9002' },
]

// ── Trips ──────────────────────────────────────────────────────────────────────
export interface XpmTrip {
  id: string
  code: string
  name: string
  requestBy: string
  destination: string
  requestDate: string
  tripDate: string
  tripType: 'Domestic' | 'International'
  bookingStatus: string
}
export const xpmTrips: XpmTrip[] = [
  { id: 'BT20260750596', code: 'BT20260750596', name: 'Trip Bandung',   requestBy: 'Daniel Reyes',  destination: 'Bandung',   requestDate: '2026-07-15T15:54:00', tripDate: '2026-07-15', tripType: 'Domestic',      bookingStatus: 'Booking pending' },
  { id: 'BT20260750588', code: 'BT20260750588', name: 'Client onsite',  requestBy: 'Maya Chen',     destination: 'Singapore', requestDate: '2026-07-12T10:20:00', tripDate: '2026-07-22', tripType: 'International',  bookingStatus: 'Booked' },
  { id: 'BT20260750571', code: 'BT20260750571', name: 'Vendor audit',   requestBy: 'Tom Okafor',    destination: 'Surabaya',  requestDate: '2026-07-08T09:00:00', tripDate: '2026-07-18', tripType: 'Domestic',      bookingStatus: 'Trip done · awaiting report' },
  { id: 'BT20260750560', code: 'BT20260750560', name: 'Conference',     requestBy: 'Priya Sharma',  destination: 'Tokyo',     requestDate: '2026-07-01T13:30:00', tripDate: '2026-07-05', tripType: 'International',  bookingStatus: 'Completed' },
  { id: 'BT20260750544', code: 'BT20260750544', name: 'Warehouse tour', requestBy: 'Eka Setiawan',  destination: 'Semarang',  requestDate: '2026-06-28T11:15:00', tripDate: '2026-07-02', tripType: 'Domestic',      bookingStatus: 'Completed' },
]

// ── Purchases (purchasing documents) ────────────────────────────────────────────
export type XpmPurchaseType = 'Invoice' | 'Order' | 'Quote' | 'Request'
export interface XpmPurchase {
  id: string
  document: string
  type: XpmPurchaseType
  vendor: string
  requester: string
  lineSummary: string
  date: string
  due: string
  status: string
  total: number
}
export const xpmPurchases: XpmPurchase[] = [
  { id: 'PI-64500', document: 'PI-64500', type: 'Invoice', vendor: 'Adobe Systems',    requester: 'Priya Sharma', lineSummary: '1 line item · Marketing', date: '2026-07-19', due: '2026-08-02', status: 'Awaiting payment', total: 8990000 },
  { id: 'PI-64499', document: 'PI-64499', type: 'Invoice', vendor: 'AWS',              requester: 'Finance',       lineSummary: '3 line items · Infra',   date: '2026-07-18', due: '2026-07-25', status: 'Overdue',          total: 38200000 },
  { id: 'PO-52210', document: 'PO-52210', type: 'Order',   vendor: 'PT Sinar Jaya',    requester: 'Tom Okafor',    lineSummary: '5 line items · Office',  date: '2026-07-17', due: '2026-07-30', status: 'Sent',             total: 12500000 },
  { id: 'PQ-31180', document: 'PQ-31180', type: 'Quote',   vendor: 'Dell Indonesia',   requester: 'IT',            lineSummary: '2 line items · Hardware',date: '2026-07-16', due: '2026-07-28', status: 'Comparing',        total: 24000000 },
  { id: 'PR-10945', document: 'PR-10945', type: 'Request', vendor: 'Figma',            requester: 'Daniel Reyes',  lineSummary: '1 line item · Software', date: '2026-07-15', due: '2026-07-22', status: 'Awaiting approval',total: 5100000 },
  { id: 'PI-64495', document: 'PI-64495', type: 'Invoice', vendor: 'Gojek Enterprise', requester: 'Ops',           lineSummary: '1 line item · Transport',date: '2026-07-14', due: '2026-07-21', status: 'Paid',             total: 3400000 },
  { id: 'PR-10940', document: 'PR-10940', type: 'Request', vendor: 'LinkedIn',         requester: 'Maya Chen',     lineSummary: '1 line item · Recruiting',date: '2026-07-13', due: '2026-07-27', status: 'Approved',         total: 12800000 },
]

// ── Inbox (approvals / to-dos / notifications) ──────────────────────────────────
export interface XpmApproval {
  id: string
  requester: string
  type: string
  category: string
  vendor: string
  age: string
  aiRisk: string
  amount: number
}
export const xpmNeedsAttention: XpmApproval[] = [
  { id: 'RB-64512', requester: 'Maya Chen',    type: 'Reimbursement', category: 'Meals & entertainment', vendor: 'Nobu Downtown', age: '2h',  aiRisk: 'Missing itemization', amount: 1840000 },
  { id: 'RB-64510', requester: 'Priya Sharma', type: 'Card',          category: 'Software',              vendor: 'Adobe',         age: '1d',  aiRisk: 'Possible duplicate',  amount: 899000 },
  { id: 'RB-64507', requester: 'Tom Okafor',   type: 'Reimbursement', category: 'Meals & entertainment', vendor: 'The Ritz',      age: '2d',  aiRisk: 'Over limit',          amount: 1250000 },
]
export const xpmAutoApprove: XpmApproval[] = [
  { id: 'RB-64509', requester: 'Indah Permata', type: 'Reimbursement', category: 'Transportation', vendor: 'Secure Parking', age: '3h', aiRisk: 'Low', amount: 45000 },
  { id: 'CA-64504', requester: 'Daniel Reyes',  type: 'Cash advance',  category: 'Travel',         vendor: '—',              age: '1d', aiRisk: 'Low', amount: 55000 },
  { id: 'RB-64505', requester: 'Eka Setiawan',  type: 'Reimbursement', category: 'Transportation', vendor: 'Jasa Marga',     age: '2d', aiRisk: 'Low', amount: 68000 },
]

// ── Budgeting ──────────────────────────────────────────────────────────────────
export interface XpmBudgetRow {
  scope: string
  period: string
  category: string
  cap: number
  type: 'Track' | 'Flag' | 'Hard cap'
  spent: number
}
export const xpmBudgets: XpmBudgetRow[] = [
  { scope: 'Company',           period: 'Monthly', category: 'All spend',     cap: 60000000, type: 'Flag',     spent: 46200000 },
  { scope: 'Sales',             period: 'Monthly', category: 'Meals',         cap: 8000000,  type: 'Hard cap', spent: 7200000 },
  { scope: 'Sales',             period: 'Monthly', category: 'Transport',     cap: 5000000,  type: 'Hard cap', spent: 4900000 },
  { scope: 'Organization-wide', period: 'Monthly', category: 'Accommodation', cap: 12000000, type: 'Track',    spent: 5800000 },
  { scope: 'Jakarta branch',    period: 'Monthly', category: 'Software',      cap: 15000000, type: 'Flag',     spent: 13900000 },
  { scope: 'Company',           period: 'Yearly',  category: 'Recruitment',   cap: 120000000,type: 'Track',    spent: 41000000 },
]

// ── Shared status → ErpStatusBadge colour type ──────────────────────────────────
// XPM statuses are richer than the default badge map, so we drive the COLOUR via an
// explicit MpBadge `type` and keep the original status as the label. Pair it as:
//   <ErpStatusBadge :status="row.status" :type="xpmBadgeType(row.status)" />
export type XpmBadgeType = 'completed' | 'warning' | 'critical' | 'announcement' | 'information'
export function xpmBadgeType(status: string): XpmBadgeType {
  const s = status.toLowerCase()
  if (s.includes('await') || s.includes('booking pending') || s.includes('comparing') || s === 'pending') return 'warning'
  if (['cleared', 'paid', 'disbursed', 'settled', 'approved', 'completed', 'active', 'received', 'accepted', 'booked', 'success', 'trip done'].some(k => s.includes(k))) return 'completed'
  if (['overdue', 'rejected', 'declined', 'failed', 'frozen'].some(k => s.includes(k))) return 'critical'
  if (['inactive', 'void', 'closed', 'cancel'].some(k => s.includes(k))) return 'announcement'
  return 'information'
}
